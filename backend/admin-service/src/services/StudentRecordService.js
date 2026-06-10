const { StudentRecord } = require('../models');
const { HttpError } = require('../middlewares/error');

// 'evaluation' = post-class student performance evaluation authored by the
// teacher. data = { ratings:{curiosity,participation,attentiveness,attention,
// creativity,camera} (1-5), overall, feedback, stage, session }. Surfaced as
// stats + per-student feedback in the admin dashboard.
const KINDS = ['goal_primary', 'goal_academic', 'badge', 'spr', 'mark', 'exercise', 'quiz', 'project', 'evaluation'];

// List a teacher's records for one student (optionally filtered by kind).
const listForStudent = async (teacherId, studentId, kind) => {
    if (!teacherId || !studentId) return { records: [] };
    try {
        const where = { teacher_id: String(teacherId), student_id: String(studentId) };
        if (kind) where.kind = String(kind);
        const rows = await StudentRecord.findAll({ where, order: [['id', 'ASC']], raw: true });
        return { records: rows };
    } catch (e) {
        console.warn('[student-records] list failed:', e.message);
        return { records: [] };
    }
};

const create = async (body) => {
    const teacher_id = body.teacherId || body.teacher_id;
    const student_id = body.studentId || body.student_id;
    const kind = String(body.kind || '');
    if (!teacher_id || !student_id) throw new HttpError(422, 'teacherId and studentId are required');
    if (!KINDS.includes(kind)) throw new HttpError(422, `Invalid kind. One of: ${KINDS.join(', ')}`);
    const data = body.data && typeof body.data === 'object' ? body.data : {};

    // Badges are a toggle: one row per (student, badge key). Upsert so toggling
    // on twice doesn't create duplicates.
    if (kind === 'badge') {
        const badge = String(data.badge || '').trim();
        if (!badge) throw new HttpError(422, 'badge key is required');
        const existing = await StudentRecord.findOne({ where: { teacher_id: String(teacher_id), student_id: String(student_id), kind: 'badge' } });
        // store the set of assigned badge keys on a single row's data.badges[]
        const badges = new Set(Array.isArray(existing?.data?.badges) ? existing.data.badges : []);
        if (data.status === 'unassigned') badges.delete(badge); else badges.add(badge);
        if (existing) {
            await existing.update({ data: { badges: [...badges] } });
            return { success: 'Badge updated', item: existing };
        }
        const item = await StudentRecord.create({ teacher_id: String(teacher_id), student_id: String(student_id), kind: 'badge', data: { badges: [...badges] } });
        return { success: 'Badge updated', item };
    }

    const item = await StudentRecord.create({ teacher_id: String(teacher_id), student_id: String(student_id), kind, data });
    return { success: 'Saved', item };
};

const update = async (id, body) => {
    const row = await StudentRecord.findByPk(id);
    if (!row) throw new HttpError(404, 'Not found');
    if (body.teacherId && String(row.teacher_id) !== String(body.teacherId)) throw new HttpError(403, 'Not allowed');
    const data = body.data && typeof body.data === 'object' ? body.data : row.data;
    await row.update({ data });
    return { success: 'Updated', item: row };
};

const remove = async (id, teacherId) => {
    const row = await StudentRecord.findByPk(id);
    if (!row) throw new HttpError(404, 'Not found');
    if (teacherId && String(row.teacher_id) !== String(teacherId)) throw new HttpError(403, 'Not allowed');
    await row.destroy();
    return { success: 'Removed' };
};

module.exports = { listForStudent, create, update, remove };
