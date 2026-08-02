// The teacher's per-student "Course progress" panel: how far one student is
// through each course the TEACHER reaches them on, measured in released lessons.
//
// Why this exists: the old `/api/public/teaching/student-progress/:teacherId/:studentId`
// endpoint was deleted when the Batch Management System replaced the teaching-
// assignment feature, but the teacher dashboard still called it. That request
// 404'd silently (the frontend swallows the error and sets progress to []), so
// the panel always read "No courses assigned to you for this student yet" even
// for a student sitting in the teacher's batch with lessons completed. This is
// the same migration already done for students (TeacherStudentService) and
// courses (TeacherCourseService); this is the third and last of that series.
//
// Scoping: courses come from batches the teacher is attached to AND the student
// is a member of — the intersection. A teacher must not see a student's progress
// on a course they don't teach them on, so the student's other enrolments are
// deliberately absent.
//
// Why a union of two sources: a teacher is attached to a batch by two different
// admin flows that both remain live —
//   - BatchService (College → Add/Manage Batch) writes the batch_teachers roster
//     and mirrors the first teacher into batches.primary_teacher_id;
//   - BatchNewService (updateBatchTeacher) only sets batches.primary_teacher_id.
// Reading either alone leaves a teacher with an empty panel depending on which
// screen the admin used, so this reads BOTH and dedupes. Mirrors the identical
// join in TeacherStudentService / TeacherCourseService.
//
// batch_teachers.batch_id / batch_members.batch_id are FKs to batches.unique_id
// (varchar), NOT the surrogate integer batches.id. The join also accepts the
// legacy batches.batch_id alias, a column present in the live DB but in none of
// the numbered migrations, because older rows key off it.
//
// Best-effort like both counterparts: a DB miss returns an empty list and logs,
// so the panel degrades to "no courses" rather than 500ing the whole detail view.
const { QueryTypes, Op } = require('sequelize');
const { sequelize, Course, BatchLessonRelease, LessonCompletion } = require('../models');
const { dedupeBatchesByCourse, buildProgress } = require('./studentProgressLogic');

/**
 * Batches that BOTH this teacher teaches and this student belongs to.
 * Returns one row per batch; a course reached through several batches is
 * collapsed by dedupeBatchesByCourse.
 */
const sharedBatchRows = async (teacherId, studentId) => {
    const tid = String(teacherId ?? '').trim();
    const sid = String(studentId ?? '').trim();
    if (!tid || !sid) return [];
    return sequelize.query(
        `SELECT b.unique_id AS batch_id,
                b.course_id AS course_id
           FROM batches b
           JOIN batch_members bm
             ON (bm.batch_id = b.unique_id OR bm.batch_id = b.batch_id)
            AND COALESCE(bm.status, 'active') = 'active'
            -- student_id: the public "VRS…" id the dashboard may hold instead of
            -- the auth userId. Matching either means the panel works whichever
            -- identifier the caller has.
            AND (bm.user_id = :sid OR bm.student_id = :sid)
          WHERE b.course_id IS NOT NULL
            AND COALESCE(b.is_active, TRUE) = TRUE
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
                )
          ORDER BY b.created_at DESC NULLS LAST, b.unique_id ASC`,
        { replacements: { tid, sid }, type: QueryTypes.SELECT },
    );
};

/**
 * The student's auth userId. lesson_completions keys off the auth userId only,
 * so a caller passing the public student_id ("VRS…") would otherwise match no
 * completions and every bar would read 0%.
 */
const resolveStudentUserId = async (studentId) => {
    const sid = String(studentId ?? '').trim();
    if (!sid) return null;
    const [row] = await sequelize.query(
        `SELECT user_id FROM batch_members WHERE student_id = :sid LIMIT 1`,
        { replacements: { sid }, type: QueryTypes.SELECT },
    );
    return row?.user_id ? String(row.user_id) : sid;
};

/** Lesson ids released to each batch, keyed by batch_id. */
const releasesByBatch = async (batchIds = []) => {
    const ids = [...new Set(batchIds.map(String).filter(Boolean))];
    if (ids.length === 0) return {};
    const rows = await BatchLessonRelease.findAll({
        where: { batch_id: ids },
        attributes: ['batch_id', 'lesson_id'],
        raw: true,
    });
    const out = {};
    for (const r of rows) {
        (out[String(r.batch_id)] ||= []).push(Number(r.lesson_id));
    }
    return out;
};

/** Lesson ids this student has completed, keyed by course_id. */
const completedByCourse = async (userId, courseIds = []) => {
    const ids = [...new Set(courseIds.map(Number).filter(Number.isFinite))];
    if (!userId || ids.length === 0) return {};
    const rows = await LessonCompletion.findAll({
        // user_id is VARCHAR in the live DB — compare as a string or Postgres
        // raises "varchar = bigint" and the read silently fails (see the note
        // in models/LessonCompletion.js).
        where: { user_id: String(userId), course_id: { [Op.in]: ids } },
        attributes: ['course_id', 'lesson_id'],
        raw: true,
    });
    const out = {};
    for (const r of rows) {
        (out[String(r.course_id)] ||= []).push(Number(r.lesson_id));
    }
    return out;
};

/**
 * Per-course progress for one student, scoped to the teacher's batches.
 *
 * @param {string} teacherId auth-service users.userId of the teacher
 * @param {string} studentId the student's auth userId or public student_id
 * @returns {Promise<{courses: Array}>} one entry per course:
 *   { course_id, course_title, completed, total, percent }. Empty list when the
 *   pair shares no batch, or on DB failure.
 */
const forTeacherStudent = async (teacherId, studentId) => {
    try {
        const rows = await sharedBatchRows(teacherId, studentId);
        if (rows.length === 0) return { courses: [] };

        const grouped = dedupeBatchesByCourse(rows);
        const courseIds = grouped.map((g) => g.course_id);
        const userId = await resolveStudentUserId(studentId);

        const [courses, releases, completions] = await Promise.all([
            Course.findAll({ where: { id: courseIds }, attributes: ['id', 'title'], raw: true }),
            releasesByBatch(rows.map((r) => r.batch_id)),
            completedByCourse(userId, courseIds),
        ]);

        const titles = Object.fromEntries(courses.map((c) => [String(c.id), c.title]));
        return {
            courses: buildProgress(grouped, {
                titles,
                releasesByBatch: releases,
                completedByCourse: completions,
            }),
        };
    } catch (e) {
        console.warn('[student-progress] lookup failed:', e.message);
        return { courses: [] };
    }
};

module.exports = { forTeacherStudent, sharedBatchRows, releasesByBatch, completedByCourse };
