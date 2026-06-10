const { QueryTypes } = require('sequelize');
const slotRepo = require('../repositories/SlotRepository');
const { UserProgress, Slot, Course } = require('../models');
const authDb = require('../config/authDatabase');
const { HttpError } = require('../middlewares/error');

const PER_PAGE = 10;
// Hard cap so the calendar feed (per_page) can't trigger an unbounded scan.
const MAX_PER_PAGE = 1000;

// Normalise an incoming id list (array, or JSON string, or CSV) into a clean
// array of non-empty string ids. The admin form sends JSON arrays.
const toIdArray = (val) => {
    if (val == null) return [];
    let arr = val;
    if (typeof val === 'string') {
        try { arr = JSON.parse(val); } catch { arr = val.split(','); }
    }
    if (!Array.isArray(arr)) return [];
    return arr.map((v) => String(v).trim()).filter(Boolean);
};

const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
};

const list = async ({ page = 1, search, per_page } = {}) => {
    const limit = Math.min(Math.max(Number(per_page) || PER_PAGE, 1), MAX_PER_PAGE);
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await slotRepo.paginate({ search, limit, offset });
        return {
            slots: {
                data: rows,
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[slots] DB query failed:', err.message);
        return { slots: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const get = async (id) => {
    const item = await slotRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Slot not found.');
    return { item };
};

const create = async ({ body }) => {
    if (!body.name || !String(body.name).trim()) {
        throw new HttpError(422, 'Slot name is required');
    }
    const data = {
        name: String(body.name).trim(),
        course_id: body.course_id ? String(body.course_id).trim() : null,
        start_at: parseDate(body.start_at),
        end_at: parseDate(body.end_at),
        teacher_ids: toIdArray(body.teacher_ids),
        student_ids: toIdArray(body.student_ids),
        meeting_link: body.meeting_link ? String(body.meeting_link).trim() : null,
        status: body.status === '0' || body.status === 0 ? 0 : 1,
    };
    const item = await slotRepo.create(data);
    return { success: 'Slot created successfully.', item };
};

const update = async ({ id, body }) => {
    const item = await slotRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Slot not found.');

    const next = {
        name: body.name !== undefined ? String(body.name).trim() : item.name,
        course_id: body.course_id !== undefined
            ? (body.course_id ? String(body.course_id).trim() : null)
            : item.course_id,
        start_at: body.start_at !== undefined ? parseDate(body.start_at) : item.start_at,
        end_at: body.end_at !== undefined ? parseDate(body.end_at) : item.end_at,
        teacher_ids: body.teacher_ids !== undefined ? toIdArray(body.teacher_ids) : item.teacher_ids,
        student_ids: body.student_ids !== undefined ? toIdArray(body.student_ids) : item.student_ids,
        meeting_link: body.meeting_link !== undefined
            ? (body.meeting_link ? String(body.meeting_link).trim() : null)
            : item.meeting_link,
        status: body.status !== undefined
            ? (body.status === '0' || body.status === 0 ? 0 : 1)
            : item.status,
    };

    await item.update(next);
    return { success: 'Slot updated successfully.', item };
};

const remove = async (id) => {
    const item = await slotRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Slot not found.');
    await item.destroy();
    return { success: 'Slot deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await slotRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Slot not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

// Students enrolled in a given course. Enrollment lives in user_progress
// (lms_admin, enrolled=true); student name/email live in the auth DB
// (lucy_devdb.users). Powers the slot form's course-driven student picker.
const courseStudents = async (courseId) => {
    if (!courseId) return { students: [] };
    try {
        const rows = await UserProgress.findAll({
            where: { course_id: Number(courseId), enrolled: true },
            attributes: ['user_id'],
            raw: true,
        });
        const userIds = [...new Set(rows.map((r) => String(r.user_id)).filter(Boolean))];
        if (userIds.length === 0) return { students: [] };
        // camelCase columns MUST be double-quoted on Postgres.
        const students = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email
               FROM users u
              WHERE u."userId" IN (:userIds)
              ORDER BY u.name ASC`,
            { replacements: { userIds }, type: QueryTypes.SELECT }
        );
        return { students };
    } catch (err) {
        console.warn('[slots] course students lookup failed:', err.message);
        return { students: [] };
    }
};

// Active slots assigned to a given teacher (teacher_ids JSONB contains the id).
// Resolves course title + student names so the teacher UI can render directly.
const listForTeacher = async (teacherId) => {
    if (!teacherId) return { slots: [] };
    try {
        const idJson = Slot.sequelize.escape(JSON.stringify([String(teacherId)]));
        const rows = await Slot.findAll({
            where: Slot.sequelize.literal(`status = 1 AND teacher_ids @> ${idJson}::jsonb`),
            order: [['start_at', 'ASC'], ['id', 'DESC']],
            raw: true,
        });
        if (!rows.length) return { slots: [] };

        const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean).map(Number))];
        let courseTitle = {};
        if (courseIds.length) {
            const cs = await Course.findAll({ where: { id: courseIds }, attributes: ['id', 'title'], raw: true });
            courseTitle = Object.fromEntries(cs.map((c) => [String(c.id), c.title]));
        }

        const allSids = [...new Set(rows.flatMap((r) => (Array.isArray(r.student_ids) ? r.student_ids : [])).map(String))];
        let studentName = {};
        if (allSids.length) {
            const srows = await authDb.query(
                `SELECT u."userId" AS id, u.name, u.email FROM users u WHERE u."userId" IN (:ids)`,
                { replacements: { ids: allSids }, type: QueryTypes.SELECT }
            );
            studentName = Object.fromEntries(srows.map((s) => [String(s.id), s.name || s.email]));
        }

        const slots = rows.map((r) => ({
            id: r.id,
            name: r.name,
            course_id: r.course_id,
            course_title: r.course_id ? (courseTitle[String(r.course_id)] || `Course #${r.course_id}`) : null,
            start_at: r.start_at,
            end_at: r.end_at,
            meeting_link: r.meeting_link,
            students: (Array.isArray(r.student_ids) ? r.student_ids : []).map((id) => ({
                id: String(id), name: studentName[String(id)] || String(id),
            })),
        }));
        return { slots };
    } catch (err) {
        console.warn('[slots] teacher slots lookup failed:', err.message);
        return { slots: [] };
    }
};

module.exports = { list, get, create, update, remove, toggleStatus, courseStudents, listForTeacher };
