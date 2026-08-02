const classRepo = require('../repositories/ClassSessionRepository');
const { HttpError } = require('../middlewares/error');
const { resolveCourseTitles, resolveUserNames } = require('../helpers/scheduleResolve');

const PER_PAGE = 10;
// Hard cap so the calendar feed (which asks for a big per_page to plot every
// session) can't trigger an unbounded scan. 1000 covers every scheduled class.
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

/**
 * A session must not end before it begins.
 *
 * This was previously unchecked, and rows were saved with an end BEFORE the
 * start (e.g. start 26 Jul 23:50, end 26 Jul 12:50). react-big-calendar drops
 * events whose range is inverted, so those classes silently vanished from the
 * admin calendar — four classes on one day rendered as one. Reject at the
 * source so no new bad rows can be created.
 */
// Upper bound on a single session. A typo in the end DATE would otherwise save
// a multi-day class that reports itself as Live now until its end finally
// passes. 24h is far above any real class. Mirrors the guard in DemoService.
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

const assertValidRange = (start, end) => {
    if (start && end && end.getTime() < start.getTime()) {
        throw new HttpError(422, 'End time must be after the start time.');
    }
    if (start && end && end.getTime() - start.getTime() > MAX_SESSION_MS) {
        throw new HttpError(422, 'A class cannot run for more than 24 hours — check the end date.');
    }
};

// Attach human-readable course title + assigned teacher names to each row so
// the admin calendar can show "who/what" without a second round-trip. Best
// effort: name/title resolution failing must never drop the rows themselves.
const enrich = async (rows) => {
    const plain = (rows || []).map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r));
    let titles = {};
    let names = {};
    try {
        titles = await resolveCourseTitles(plain.map((r) => r.course_id));
        names = await resolveUserNames([...new Set(plain.flatMap((r) => toIdArray(r.teacher_ids)))]);
    } catch (e) {
        console.warn('[classes] enrich failed:', e.message);
    }
    return plain.map((r) => {
        const tids = toIdArray(r.teacher_ids);
        const cid = r.course_id == null ? null : String(r.course_id);
        return {
            ...r,
            // numeric ids that don't resolve → null; free-text course_id → itself.
            course_title: cid ? (titles[cid] || (/^\d+$/.test(cid) ? null : cid)) : null,
            teacher_names: tids.map((id) => names[String(id)]).filter(Boolean),
        };
    });
};

const list = async ({ page = 1, search, per_page } = {}) => {
    const limit = Math.min(Math.max(Number(per_page) || PER_PAGE, 1), MAX_PER_PAGE);
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await classRepo.paginate({ search, limit, offset });
        return {
            classes: {
                data: await enrich(rows),
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[classes] DB query failed:', err.message);
        return { classes: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const get = async (id) => {
    const item = await classRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Class not found.');
    return { item };
};

const create = async ({ body }) => {
    if (!body.name || !String(body.name).trim()) {
        throw new HttpError(422, 'Class name is required');
    }
    const startAt = parseDate(body.start_at);
    const endAt = parseDate(body.end_at);
    assertValidRange(startAt, endAt);
    const item = await classRepo.create({
        name: String(body.name).trim(),
        course_id: body.course_id ? String(body.course_id).trim() : null,
        start_at: startAt,
        end_at: endAt,
        teacher_ids: toIdArray(body.teacher_ids),
        // Classes no longer track students directly (students come via the
        // course / teacher assignment). Always store an empty roster.
        student_ids: [],
        meeting_link: body.meeting_link ? String(body.meeting_link).trim() : null,
        status: body.status === '0' || body.status === 0 ? 0 : 1,
    });
    return { success: 'Class created successfully.', item };
};

const update = async ({ id, body }) => {
    const item = await classRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Class not found.');
    // Validate the MERGED range, not just what was sent: editing only the end
    // time must still be checked against the stored start (and vice versa).
    const nextStart = body.start_at !== undefined ? parseDate(body.start_at) : item.start_at;
    const nextEnd = body.end_at !== undefined ? parseDate(body.end_at) : item.end_at;
    assertValidRange(nextStart, nextEnd);
    await item.update({
        name: body.name !== undefined ? String(body.name).trim() : item.name,
        course_id: body.course_id !== undefined ? (body.course_id ? String(body.course_id).trim() : null) : item.course_id,
        start_at: nextStart,
        end_at: nextEnd,
        teacher_ids: body.teacher_ids !== undefined ? toIdArray(body.teacher_ids) : item.teacher_ids,
        student_ids: [], // classes don't track students anymore — clear on any save
        meeting_link: body.meeting_link !== undefined ? (body.meeting_link ? String(body.meeting_link).trim() : null) : item.meeting_link,
        status: body.status !== undefined ? (body.status === '0' || body.status === 0 ? 0 : 1) : item.status,
    });
    return { success: 'Class updated successfully.', item };
};

const remove = async (id) => {
    const item = await classRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Class not found.');
    await item.destroy();
    return { success: 'Class deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await classRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Class not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

// Classes assigned to a teacher, with course title + student names + link.
const listForTeacher = async (teacherId) => {
    if (!teacherId) return { classes: [] };
    try {
        const { resolveCourseTitles } = require('../helpers/scheduleResolve');
        const { resolveRosterUserIds } = require('./TeachingAssignmentService');
        const { TeachingAssignment } = require('../models');
        const rows = await classRepo.listForTeacher(teacherId);
        const titles = await resolveCourseTitles(rows.map((r) => r.course_id));

        // Students "assigned to that course" = the teacher's Teacher-Assignment
        // roster for each course (expands batches + individuals). Keyed by course.
        // This is a best-effort enrichment — isolate it so a failure here (e.g. a
        // free-text course_id that can't cast to the integer FK column) can NEVER
        // drop the actual class list. Only numeric course_ids can match an
        // assignment, so filter to those before querying.
        const countByCourse = {};
        try {
            const numericCourseIds = [...new Set(
                rows.map((r) => r.course_id).filter((x) => x != null && /^\d+$/.test(String(x)))
            )];
            if (numericCourseIds.length) {
                const assigns = await TeachingAssignment.findAll({
                    where: { teacher_id: String(teacherId), course_id: numericCourseIds },
                    raw: true,
                });
                for (const a of assigns) {
                    try { countByCourse[String(a.course_id)] = (await resolveRosterUserIds(a.id)).size; }
                    catch { /* leave unset → 0 */ }
                }
            }
        } catch (e) {
            console.warn('[classes] roster count enrichment failed (non-fatal):', e.message);
        }

        const classes = rows.map((r) => ({
            id: r.id, name: r.name, course_id: r.course_id,
            course_title: r.course_id
                ? (titles[String(r.course_id)] || (/^\d+$/.test(String(r.course_id)) ? `Course #${r.course_id}` : String(r.course_id)))
                : null,
            start_at: r.start_at, end_at: r.end_at, meeting_link: r.meeting_link,
            course_student_count: r.course_id != null ? (countByCourse[String(r.course_id)] || 0) : 0,
            students: [],
        }));
        return { classes };
    } catch (err) {
        console.warn('[classes] teacher classes failed:', err.message);
        return { classes: [] };
    }
};

/**
 * Upcoming classes for a STUDENT, for GET /api/public/my-classes.
 *
 * A class is a student's when it belongs to a course that student has access
 * to. Access is resolved from the SAME two sources as "My Courses"
 * (user_progress.enrolled ∪ teaching/batch delegation), so the dashboard can
 * never show a class for a course the student cannot open.
 *
 * The student id comes from the verified JWT at the route layer — never from a
 * request parameter — so one student cannot read another's schedule.
 *
 * Best-effort by design: a failure to resolve teacher names must not drop the
 * classes themselves, and any hard failure returns an empty list rather than
 * breaking the dashboard.
 */
const listForStudent = async (userId, { limit = 20 } = {}) => {
    const uid = String(userId ?? '').trim();
    if (!uid) return { classes: [] };
    try {
        const { UserProgress } = require('../models');
        const teachingSvc = require('./TeachingAssignmentService');

        // Same access sources as PublicCourseService.myCourses.
        const [enrolledRows, delegatedIds] = await Promise.all([
            UserProgress.findAll({
                where: { user_id: uid, enrolled: true },
                attributes: ['course_id'],
                raw: true,
            }),
            teachingSvc.coursesForStudent(uid),
        ]);

        const courseIds = new Set();
        for (const r of enrolledRows) if (r.course_id != null) courseIds.add(String(r.course_id));
        for (const c of delegatedIds || []) if (c != null) courseIds.add(String(c));
        if (courseIds.size === 0) return { classes: [] };

        const rows = await classRepo.listUpcomingForCourses([...courseIds], new Date(), limit);
        if (rows.length === 0) return { classes: [] };

        // Course titles + teacher names are presentation sugar — isolate so a
        // lookup failure can't drop the schedule.
        let titles = {};
        let names = {};
        try {
            titles = await resolveCourseTitles(rows.map((r) => r.course_id));
            names = await resolveUserNames([...new Set(rows.flatMap((r) => toIdArray(r.teacher_ids)))]);
        } catch (e) {
            console.warn('[my-classes] enrich failed (non-fatal):', e.message);
        }

        const classes = rows.map((r) => {
            const cid = r.course_id == null ? null : String(r.course_id);
            return {
                id: r.id,
                name: r.name,
                course_id: r.course_id,
                course_title: cid
                    ? (titles[cid] || (/^\d+$/.test(cid) ? `Course #${cid}` : cid))
                    : null,
                start_at: r.start_at,
                end_at: r.end_at,
                meeting_link: r.meeting_link,
                teacher_names: toIdArray(r.teacher_ids).map((id) => names[String(id)]).filter(Boolean),
            };
        });
        return { classes };
    } catch (err) {
        console.warn('[my-classes] lookup failed:', err.message);
        return { classes: [] };
    }
};

module.exports = { list, get, create, update, remove, toggleStatus, listForTeacher, listForStudent };
