// The teacher's "Students" tab: every student a teacher reaches through BATCH
// assignment, with the batches each student belongs to.
//
// Why this exists: the old `/api/public/teaching/students-by-teacher/:id`
// endpoint was deleted when the Batch Management System replaced the teaching-
// assignment feature, but the teacher dashboard still called it. That request
// 404'd silently (the frontend swallows the error), so batch students never
// appeared — the tab only ever showed students who happened to be on a
// scheduled class or slot roster.
//
// Why a union of two sources: a teacher is attached to a batch by two different
// admin flows that both remain live —
//   - BatchService (College → Add/Manage Batch) writes the batch_teachers roster
//     and mirrors the first teacher into batches.primary_teacher_id;
//   - BatchNewService (updateBatchTeacher) only sets batches.primary_teacher_id.
// Reading either alone leaves a teacher with an empty tab depending on which
// screen the admin used, so this reads BOTH and dedupes. Mirrors the identical
// join in TeacherCourseService.
//
// batch_teachers.batch_id / batch_members.batch_id are FKs to batches.unique_id
// (varchar), NOT the surrogate integer batches.id. The join also accepts the
// legacy batches.batch_id alias, a column present in the live DB but in none of
// the numbered migrations, because older rows key off it.
//
// Best-effort like its course-side counterpart: a DB miss returns an empty list
// and logs, so the dashboard degrades to "no students" rather than 500ing.
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { resolveUserNames } = require('../helpers/scheduleResolve');

/**
 * Student rows for every active batch this teacher is attached to.
 * Returns one row per (student, batch) pair — collapsed by the caller.
 */
const batchStudentRowsForTeacher = async (teacherId) => {
    const tid = String(teacherId ?? '').trim();
    if (!tid) return [];
    return sequelize.query(
        `SELECT bm.user_id            AS student_user_id,
                bm.student_id         AS student_public_id,
                b.unique_id           AS batch_id,
                COALESCE(b.name, b.display_name) AS batch_name,
                b.course_id           AS course_id
           FROM batches b
           JOIN batch_members bm
             ON (bm.batch_id = b.unique_id OR bm.batch_id = b.batch_id)
            AND COALESCE(bm.status, 'active') = 'active'
          WHERE COALESCE(b.is_active, TRUE) = TRUE
            AND (
                  b.primary_teacher_id = :tid
               OR EXISTS (
                    SELECT 1
                      FROM batch_teachers bt
                     WHERE (bt.batch_id = b.unique_id OR bt.batch_id = b.batch_id)
                       AND bt.user_id = :tid
                       -- COALESCE: the column is nullable with a DEFAULT, so
                       -- rows written before it existed hold NULL and must
                       -- still count as active.
                       AND COALESCE(bt.status, 'active') = 'active'
                  )
                )`,
        { replacements: { tid }, type: QueryTypes.SELECT },
    );
};

/**
 * Every student the teacher reaches via batches.
 * Shape matches what the dashboard's Students tab expects:
 *   { students: [{ id, name, email, studentId, batches: [{ id, name }] }] }
 */
const listForTeacher = async (teacherId) => {
    try {
        const rows = await batchStudentRowsForTeacher(teacherId);
        if (!rows.length) return { students: [] };

        // Collapse (student, batch) pairs into one entry per student. A student
        // can sit in several of the teacher's batches — show them once, listing
        // every batch, rather than duplicating the row.
        const byStudent = new Map();
        for (const r of rows) {
            const id = String(r.student_user_id);
            if (!byStudent.has(id)) {
                byStudent.set(id, {
                    id,
                    studentId: r.student_public_id || null,
                    name: '',
                    email: null,
                    batches: [],
                });
            }
            const entry = byStudent.get(id);
            if (r.batch_id && !entry.batches.some((b) => b.id === r.batch_id)) {
                entry.batches.push({ id: r.batch_id, name: r.batch_name || r.batch_id });
            }
        }

        // Names/emails live in the auth-service DB, not here.
        const names = await resolveUserNames([...byStudent.keys()]);
        for (const [id, entry] of byStudent) {
            entry.name = names[id] || '';
        }

        const students = [...byStudent.values()].sort((a, b) =>
            (a.name || a.id).localeCompare(b.name || b.id),
        );
        return { students };
    } catch (e) {
        console.warn('[teacher-students] batch student lookup failed:', e.message);
        return { students: [] };
    }
};

module.exports = { listForTeacher, batchStudentRowsForTeacher };
