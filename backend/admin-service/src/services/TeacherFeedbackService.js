const { TeacherFeedback, Course } = require('../models');
const { HttpError } = require('../middlewares/error');
const { resolveUserNames, resolveCourseTitles } = require('../helpers/scheduleResolve');

// Student → teacher/class feedback (table teacher_feedback). Student submits
// after a class; admin reads aggregate stats + per-teacher breakdowns.

// The five rated areas from the student feedback form (1-5 each).
const ATTRS = [
    { key: 'explanation', label: "Teacher's Explanation & Teaching" },
    { key: 'engagement', label: 'Class Engagement & Interaction' },
    { key: 'understanding', label: 'Understanding of the Topic' },
    { key: 'activities', label: 'Activities / Projects Conducted' },
    { key: 'experience', label: 'Overall Class Experience' },
];
const ATTR_KEYS = ATTRS.map((a) => a.key);

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;
const overallOf = (ratings) => {
    const vals = ATTR_KEYS.map((k) => Number(ratings && ratings[k])).filter((v) => v > 0);
    return vals.length ? avg(vals) : 0;
};

const toIdArray = (val) => {
    if (val == null) return [];
    let arr = val;
    if (typeof val === 'string') { try { arr = JSON.parse(val); } catch { arr = val.split(','); } }
    return Array.isArray(arr) ? arr.map((v) => String(v).trim()).filter(Boolean) : [];
};

// Student creates a feedback row. studentId comes from the VERIFIED caller.
const create = async ({ studentId, courseId, ratings, enjoyed, suggestions }) => {
    if (!studentId) throw new HttpError(401, 'Sign in to submit feedback.');
    const clean = {};
    ATTR_KEYS.forEach((k) => {
        const n = Number(ratings && ratings[k]);
        if (n >= 1 && n <= 5) clean[k] = Math.round(n);
    });
    if (Object.keys(clean).length === 0) throw new HttpError(422, 'Give at least one rating.');

    // Resolve the course's teacher (first teacher_id) so the admin can group
    // feedback by teacher. Best-effort — feedback is still saved without it.
    let teacher_id = null;
    if (courseId) {
        try {
            const c = await Course.findByPk(Number(courseId), { attributes: ['teacher_ids'] });
            teacher_id = toIdArray(c && c.teacher_ids)[0] || null;
        } catch { /* ignore */ }
    }

    const item = await TeacherFeedback.create({
        student_id: String(studentId),
        course_id: courseId ? String(courseId) : null,
        teacher_id,
        ratings: clean,
        enjoyed: enjoyed ? String(enjoyed).trim() : null,
        suggestions: suggestions ? String(suggestions).trim() : null,
    });
    return { success: 'Thanks for your feedback!', item };
};

// A student's own past submissions (so the dashboard can show what they sent).
const listForStudent = async (studentId) => {
    if (!studentId) return { feedback: [] };
    const rows = await TeacherFeedback.findAll({ where: { student_id: String(studentId) }, order: [['id', 'DESC']], raw: true });
    const titles = await resolveCourseTitles(rows.map((r) => r.course_id));
    return {
        feedback: rows.map((r) => ({
            id: r.id,
            course_id: r.course_id,
            course_title: r.course_id ? (titles[String(r.course_id)] || null) : null,
            ratings: r.ratings || {},
            overall: round1(overallOf(r.ratings)),
            enjoyed: r.enjoyed || '',
            suggestions: r.suggestions || '',
            created_at: r.created_at,
        })),
    };
};

// ---- Admin reads ----
const stats = async () => {
    const rows = await TeacherFeedback.findAll({ raw: true });
    const perAttribute = {};
    ATTR_KEYS.forEach((k) => {
        const vals = rows.map((r) => Number(r.ratings && r.ratings[k])).filter((v) => v > 0);
        perAttribute[k] = round1(avg(vals));
    });
    return {
        total_feedback: rows.length,
        teachers_rated: new Set(rows.map((r) => r.teacher_id).filter(Boolean).map(String)).size,
        overall_avg: round1(avg(rows.map((r) => overallOf(r.ratings)).filter((v) => v > 0))),
        per_attribute: perAttribute,
        attributes: ATTRS,
    };
};

const byTeacher = async () => {
    const rows = await TeacherFeedback.findAll({ raw: true });
    const map = new Map();
    for (const r of rows) {
        const tid = r.teacher_id ? String(r.teacher_id) : 'unassigned';
        if (!map.has(tid)) map.set(tid, { count: 0, overalls: [], latest: r });
        const e = map.get(tid);
        e.count += 1;
        e.overalls.push(overallOf(r.ratings));
    }
    const realIds = [...map.keys()].filter((id) => id !== 'unassigned');
    const names = await resolveUserNames(realIds);
    const teachers = [...map.keys()].map((tid) => {
        const e = map.get(tid);
        return {
            teacher_id: tid === 'unassigned' ? null : tid,
            teacher_name: tid === 'unassigned' ? 'Unassigned / no teacher' : (names[tid] || `Teacher ${tid}`),
            count: e.count,
            avg_overall: round1(avg(e.overalls.filter((v) => v > 0))),
            latest_at: e.latest.created_at,
        };
    });
    teachers.sort((a, b) => b.count - a.count);
    return { teachers };
};

const list = async ({ teacherId, limit = 200 } = {}) => {
    const where = {};
    // 'unassigned' sentinel = feedback whose course had no teacher → IS NULL.
    // Any other value filters to that teacher; absent = all.
    if (teacherId === 'unassigned') where.teacher_id = null;
    else if (teacherId) where.teacher_id = String(teacherId);
    const rows = await TeacherFeedback.findAll({ where, order: [['id', 'DESC']], raw: true });
    const capped = rows.slice(0, Math.min(Number(limit) || 200, 500));
    const names = await resolveUserNames([...new Set([...capped.map((r) => r.student_id), ...capped.map((r) => r.teacher_id)].filter(Boolean))]);
    const titles = await resolveCourseTitles(capped.map((r) => r.course_id));
    return {
        feedback: capped.map((r) => ({
            id: r.id,
            student_id: r.student_id,
            student_name: names[String(r.student_id)] || `Student ${r.student_id}`,
            teacher_id: r.teacher_id,
            teacher_name: r.teacher_id ? (names[String(r.teacher_id)] || `Teacher ${r.teacher_id}`) : null,
            course_id: r.course_id,
            course_title: r.course_id ? (titles[String(r.course_id)] || null) : null,
            ratings: r.ratings || {},
            overall: round1(overallOf(r.ratings)),
            enjoyed: r.enjoyed || '',
            suggestions: r.suggestions || '',
            created_at: r.created_at,
        })),
    };
};

module.exports = { create, listForStudent, stats, byTeacher, list, ATTRS };
