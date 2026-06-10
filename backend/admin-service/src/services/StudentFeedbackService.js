const { StudentRecord } = require('../models');
const { resolveUserNames } = require('../helpers/scheduleResolve');

// Admin-facing reads over the teacher-authored post-class performance
// evaluations (StudentRecord kind='evaluation'). Powers the admin dashboard
// feedback stats + the per-student feedback browser.

// The six rated attributes from the teacher evaluation form (1-5 each).
const ATTRS = [
    { key: 'curiosity', label: 'Curiosity' },
    { key: 'participation', label: 'Participation' },
    { key: 'attentiveness', label: 'Attentiveness / Focus' },
    { key: 'attention', label: 'Attention / Tardy' },
    { key: 'creativity', label: 'Creativity' },
    { key: 'camera', label: 'Camera' },
];
const ATTR_KEYS = ATTRS.map((a) => a.key);

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;

// Authoritative "overall" = mean of the present 1-5 ratings (falls back to a
// stored overall if a row predates per-attribute ratings).
const overallOf = (data) => {
    const r = (data && data.ratings) || {};
    const vals = ATTR_KEYS.map((k) => Number(r[k])).filter((v) => v > 0);
    return vals.length ? avg(vals) : (Number(data && data.overall) || 0);
};

const fetchEvals = async (studentId) => {
    const where = { kind: 'evaluation' };
    if (studentId) where.student_id = String(studentId);
    return StudentRecord.findAll({ where, order: [['id', 'DESC']], raw: true });
};

const stats = async () => {
    const rows = await fetchEvals();
    const perAttribute = {};
    ATTR_KEYS.forEach((k) => {
        const vals = rows.map((r) => Number(r.data && r.data.ratings && r.data.ratings[k])).filter((v) => v > 0);
        perAttribute[k] = round1(avg(vals));
    });
    return {
        total_evaluations: rows.length,
        students_evaluated: new Set(rows.map((r) => String(r.student_id))).size,
        overall_avg: round1(avg(rows.map((r) => overallOf(r.data)).filter((v) => v > 0))),
        per_attribute: perAttribute,
        attributes: ATTRS,
    };
};

const shape = (r, names) => ({
    id: r.id,
    student_id: r.student_id,
    student_name: names[String(r.student_id)] || `Student ${r.student_id}`,
    teacher_id: r.teacher_id,
    teacher_name: names[String(r.teacher_id)] || `Teacher ${r.teacher_id}`,
    ratings: (r.data && r.data.ratings) || {},
    overall: round1(overallOf(r.data)),
    feedback: (r.data && r.data.feedback) || '',
    stage: (r.data && r.data.stage) || '',
    session: (r.data && r.data.session) || '',
    created_at: r.created_at,
});

// Flat list of evaluations (newest first), optionally for one student.
const list = async ({ studentId, limit = 200 } = {}) => {
    const rows = await fetchEvals(studentId);
    const capped = rows.slice(0, Math.min(Number(limit) || 200, 500));
    const ids = [...new Set([...capped.map((r) => r.student_id), ...capped.map((r) => r.teacher_id)])];
    const names = await resolveUserNames(ids);
    return { feedback: capped.map((r) => shape(r, names)) };
};

// One row per evaluated student: count + average + latest — drives the
// admin feedback browser's student list.
const byStudent = async () => {
    const rows = await fetchEvals();
    const map = new Map();
    for (const r of rows) {
        const sid = String(r.student_id);
        if (!map.has(sid)) map.set(sid, { count: 0, overalls: [], latest: r }); // rows DESC → first seen = latest
        const e = map.get(sid);
        e.count += 1;
        e.overalls.push(overallOf(r.data));
    }
    const ids = [...map.keys()];
    const names = await resolveUserNames(ids);
    const students = ids.map((sid) => {
        const e = map.get(sid);
        return {
            student_id: sid,
            student_name: names[sid] || `Student ${sid}`,
            count: e.count,
            avg_overall: round1(avg(e.overalls.filter((v) => v > 0))),
            latest_at: e.latest.created_at,
            latest_session: (e.latest.data && e.latest.data.session) || '',
        };
    });
    students.sort((a, b) => b.count - a.count || (b.latest_at > a.latest_at ? 1 : -1));
    return { students };
};

module.exports = { stats, list, byStudent, ATTRS };
