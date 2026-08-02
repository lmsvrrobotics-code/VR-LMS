const resourceRepo = require('../repositories/ResourceRepository');
const { upload, removeFile, niceFileName } = require('../helpers/fileUploader');
const { HttpError } = require('../middlewares/error');
const { buildStudentResources } = require('./studentResourcesLogic');

const PER_PAGE = 10;

const toIdArray = (val) => {
    if (val == null) return [];
    let arr = val;
    if (typeof val === 'string') { try { arr = JSON.parse(val); } catch { arr = val.split(','); } }
    if (!Array.isArray(arr)) return [];
    return arr.map((v) => String(v).trim()).filter(Boolean);
};

// Upload each PDF (only PDFs) → R2 and return [{ name, url }]. Non-PDF files
// are rejected so the Resources library stays PDF-only as specified.
const uploadPdfs = async (files, title) => {
    const out = [];
    for (const f of files || []) {
        const isPdf = (f.mimetype || '').toLowerCase() === 'application/pdf'
            || (f.originalname || '').toLowerCase().endsWith('.pdf');
        if (!isPdf) throw new HttpError(422, 'Only PDF files are allowed for resources');
        const destPath = `uploads/resources/${niceFileName(title || 'resource', 'pdf')}`;
        const url = await upload(f, destPath); // images/PDFs → R2 (no resize for PDFs)
        out.push({ name: f.originalname || 'document.pdf', url });
    }
    return out;
};

const list = async ({ page = 1, search } = {}) => {
    const limit = PER_PAGE;
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await resourceRepo.paginate({ search, limit, offset });
        return {
            resources: {
                data: rows, total: count, per_page: limit,
                current_page: Number(page), last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[resources] DB query failed:', err.message);
        return { resources: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const get = async (id) => {
    const item = await resourceRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Resource not found.');
    return { item };
};

const create = async ({ body, files }) => {
    if (!body.title || !String(body.title).trim()) throw new HttpError(422, 'Title is required');
    const title = String(body.title).trim();
    const uploaded = await uploadPdfs(files, title);
    const item = await resourceRepo.create({
        title,
        description: body.description ? String(body.description).trim() : null,
        files: uploaded,
        teacher_ids: toIdArray(body.teacher_ids),
        resource_category_id: Number.isFinite(Number(body.resource_category_id)) && Number(body.resource_category_id) > 0 ? Number(body.resource_category_id) : null,
        course_id: Number.isFinite(Number(body.course_id)) && Number(body.course_id) > 0 ? Number(body.course_id) : null,
        section: body.section ? String(body.section).trim() : null,
        sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
        status: body.status === '0' || body.status === 0 ? 0 : 1,
    });
    return { success: 'Resource created successfully.', item };
};

const update = async ({ id, body, files }) => {
    const item = await resourceRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Resource not found.');

    let nextFiles = Array.isArray(item.files) ? [...item.files] : [];
    // Optionally drop some existing files (body.remove_urls = JSON array of urls).
    const removeUrls = toIdArray(body.remove_urls);
    if (removeUrls.length) {
        const drop = new Set(removeUrls);
        for (const f of nextFiles) { if (drop.has(f.url)) { try { await removeFile(f.url); } catch (_e) { /* ignore */ } } }
        nextFiles = nextFiles.filter((f) => !drop.has(f.url));
    }
    // Append any newly uploaded PDFs.
    if (files && files.length) {
        const added = await uploadPdfs(files, body.title || item.title);
        nextFiles = [...nextFiles, ...added];
    }

    const toNullableId = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    await item.update({
        title: body.title !== undefined ? String(body.title).trim() : item.title,
        description: body.description !== undefined ? (body.description ? String(body.description).trim() : null) : item.description,
        files: nextFiles,
        teacher_ids: body.teacher_ids !== undefined ? toIdArray(body.teacher_ids) : item.teacher_ids,
        resource_category_id: body.resource_category_id !== undefined ? toNullableId(body.resource_category_id) : item.resource_category_id,
        course_id: body.course_id !== undefined ? toNullableId(body.course_id) : item.course_id,
        section: body.section !== undefined ? (body.section ? String(body.section).trim() : null) : item.section,
        sort_order: body.sort_order !== undefined && Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : item.sort_order,
        status: body.status !== undefined ? (body.status === '0' || body.status === 0 ? 0 : 1) : item.status,
    });
    return { success: 'Resource updated successfully.', item };
};

const remove = async (id) => {
    const item = await resourceRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Resource not found.');
    for (const f of (Array.isArray(item.files) ? item.files : [])) {
        if (f.url) { try { await removeFile(f.url); } catch (_e) { /* ignore */ } }
    }
    await item.destroy();
    return { success: 'Resource deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await resourceRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Resource not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

// Resources assigned to a teacher — drives the teacher dashboard Resources tab.
// Each resource carries its category (name), course (id + title) and section so
// the dashboard can render the category radios + course dropdown filters and
// group cards under section headers.
const listForTeacher = async (teacherId) => {
    if (!teacherId) return { resources: [] };
    try {
        const { ResourceCategory, Course } = require('../models');
        const rows = await resourceRepo.listForTeacher(teacherId);

        // Resolve category names + course titles in two small batched queries
        // (cheap; the assigned set is short).
        const catIds = [...new Set(rows.map((r) => r.resource_category_id).filter(Boolean))];
        const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))];
        const [cats, courses] = await Promise.all([
            catIds.length ? ResourceCategory.findAll({ where: { id: catIds }, raw: true }) : [],
            courseIds.length ? Course.findAll({ where: { id: courseIds }, attributes: ['id', 'title'], raw: true }) : [],
        ]);
        const catName = new Map(cats.map((c) => [c.id, c.name]));
        const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

        const resources = rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            files: Array.isArray(r.files) ? r.files : [],
            resource_category_id: r.resource_category_id || null,
            category_name: r.resource_category_id ? (catName.get(r.resource_category_id) || null) : null,
            course_id: r.course_id || null,
            course_title: r.course_id ? (courseTitle.get(r.course_id) || null) : null,
            section: r.section || null,
        }));
        return { resources };
    } catch (err) {
        console.warn('[resources] teacher resources failed:', err.message);
        return { resources: [] };
    }
};

// Student-facing "Materials": the PDFs a student can reach through the courses
// they are enrolled in (user_progress) or delegated to (batch membership) —
// the same access rule /api/public/my-courses uses, so Materials can never show
// a course the student cannot already see.
//
// Deliberately NOT gated behind lesson releases: resources are course-level
// support material (lesson plans, visual aids), not lesson content, and they
// carry no lesson_id to gate on. Teacher uploads it → enrolled students see it.
const listForStudent = async (userId) => {
    const uid = String(userId ?? '').trim();
    if (!uid) return { resources: [], sections: [] };
    try {
        const { ResourceCategory, Course, UserProgress } = require('../models');
        const teachingSvc = require('./TeachingAssignmentService');

        // Same two-source enrollment resolution as PublicCourseService.myCourses.
        const [enrolledRows, delegatedIds] = await Promise.all([
            UserProgress.findAll({ where: { user_id: uid, enrolled: true }, attributes: ['course_id'], raw: true }),
            teachingSvc.coursesForStudent(uid),
        ]);
        const courseIds = [...new Set([
            ...enrolledRows.map((r) => Number(r.course_id)),
            ...delegatedIds.map(Number),
        ].filter((n) => Number.isInteger(n) && n > 0))];
        if (!courseIds.length) return { resources: [], sections: [] };

        const rows = await resourceRepo.listForCourses(courseIds);
        if (!rows.length) return { resources: [], sections: [] };

        // Resolve display names in two small batched queries, as listForTeacher does.
        const catIds = [...new Set(rows.map((r) => r.resource_category_id).filter(Boolean))];
        const usedCourseIds = [...new Set(rows.map((r) => Number(r.course_id)).filter(Boolean))];
        const [cats, courses] = await Promise.all([
            catIds.length ? ResourceCategory.findAll({ where: { id: catIds }, raw: true }) : [],
            usedCourseIds.length ? Course.findAll({ where: { id: usedCourseIds }, attributes: ['id', 'title'], raw: true }) : [],
        ]);

        return buildStudentResources(rows, courseIds, {
            categoryNames: new Map(cats.map((c) => [c.id, c.name])),
            courseTitles: new Map(courses.map((c) => [Number(c.id), c.title])),
        });
    } catch (err) {
        // Match listForTeacher: a resources outage must not break the dashboard.
        console.warn('[resources] student resources failed:', err.message);
        return { resources: [], sections: [] };
    }
};

module.exports = { list, get, create, update, remove, toggleStatus, listForTeacher, listForStudent };
