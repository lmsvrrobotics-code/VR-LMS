const demoRepo = require('../repositories/DemoRepository');
const { HttpError } = require('../middlewares/error');
const { resolveCourseTitles, resolveUserNames } = require('../helpers/scheduleResolve');

const PER_PAGE = 10;
// Hard cap so the calendar feed (which asks for a big per_page to plot every
// session) can't trigger an unbounded scan. 1000 covers every scheduled demo.
const MAX_PER_PAGE = 1000;

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

// Attach human-readable course title + assigned teacher names to each row so
// the admin calendar can show "who/what". Best effort — resolution failure
// must never drop the rows themselves.
const enrich = async (rows) => {
    const plain = (rows || []).map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r));
    let titles = {};
    let names = {};
    try {
        titles = await resolveCourseTitles(plain.map((r) => r.course_id));
        names = await resolveUserNames([...new Set(plain.flatMap((r) => toIdArray(r.teacher_ids)))]);
    } catch (e) {
        console.warn('[demos] enrich failed:', e.message);
    }
    return plain.map((r) => {
        const tids = toIdArray(r.teacher_ids);
        const cid = r.course_id == null ? null : String(r.course_id);
        return {
            ...r,
            course_title: cid ? (titles[cid] || (/^\d+$/.test(cid) ? null : cid)) : null,
            teacher_names: tids.map((id) => names[String(id)]).filter(Boolean),
        };
    });
};

const list = async ({ page = 1, search, per_page } = {}) => {
    const limit = Math.min(Math.max(Number(per_page) || PER_PAGE, 1), MAX_PER_PAGE);
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await demoRepo.paginate({ search, limit, offset });
        return {
            demos: {
                data: await enrich(rows),
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[demos] DB query failed:', err.message);
        return { demos: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const get = async (id) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo not found.');
    return { item };
};

const create = async ({ body }) => {
    if (!body.title || !String(body.title).trim()) {
        throw new HttpError(422, 'Title is required');
    }
    const item = await demoRepo.create({
        title: String(body.title).trim(),
        course_id: body.course_id ? String(body.course_id).trim() : null,
        start_at: parseDate(body.start_at),
        end_at: parseDate(body.end_at),
        teacher_ids: toIdArray(body.teacher_ids),
        meeting_link: body.meeting_link ? String(body.meeting_link).trim() : null,
        status: body.status === '0' || body.status === 0 ? 0 : 1,
    });
    return { success: 'Demo created successfully.', item };
};

const update = async ({ id, body }) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo not found.');
    await item.update({
        title: body.title !== undefined ? String(body.title).trim() : item.title,
        course_id: body.course_id !== undefined ? (body.course_id ? String(body.course_id).trim() : null) : item.course_id,
        start_at: body.start_at !== undefined ? parseDate(body.start_at) : item.start_at,
        end_at: body.end_at !== undefined ? parseDate(body.end_at) : item.end_at,
        teacher_ids: body.teacher_ids !== undefined ? toIdArray(body.teacher_ids) : item.teacher_ids,
        meeting_link: body.meeting_link !== undefined ? (body.meeting_link ? String(body.meeting_link).trim() : null) : item.meeting_link,
        status: body.status !== undefined ? (body.status === '0' || body.status === 0 ? 0 : 1) : item.status,
    });
    return { success: 'Demo updated successfully.', item };
};

const remove = async (id) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo not found.');
    await item.destroy();
    return { success: 'Demo deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

// Demos assigned to a teacher, with course title resolved (teacher UI).
const listForTeacher = async (teacherId) => {
    if (!teacherId) return { demos: [] };
    try {
        const { resolveCourseTitles } = require('../helpers/scheduleResolve');
        const rows = await demoRepo.listForTeacher(teacherId);
        const titles = await resolveCourseTitles(rows.map((r) => r.course_id));
        const demos = rows.map((r) => ({
            id: r.id, title: r.title, course_id: r.course_id,
            course_title: r.course_id
                ? (titles[String(r.course_id)] || (/^\d+$/.test(String(r.course_id)) ? `Course #${r.course_id}` : String(r.course_id)))
                : null,
            start_at: r.start_at, end_at: r.end_at, meeting_link: r.meeting_link || null,
        }));
        return { demos };
    } catch (err) {
        console.warn('[demos] teacher demos failed:', err.message);
        return { demos: [] };
    }
};

module.exports = { list, get, create, update, remove, toggleStatus, listForTeacher };
