// The teacher's "My Courses" tab: every course a teacher reaches through batch
// assignment, each with its FULL curriculum (sections + lessons).
//
// Why a union of two sources: a teacher is attached to a batch by two different
// admin flows that both remain live —
//   - BatchService (College → Add/Manage Batch) writes the batch_teachers roster
//     and mirrors the first teacher into batches.primary_teacher_id;
//   - BatchNewService (updateBatchTeacher) only sets batches.primary_teacher_id.
// Reading either one alone leaves a teacher with an empty tab depending on which
// screen the admin happened to use, so this reads BOTH and dedupes.
//
// batch_teachers.batch_id is a FK to batches.unique_id (varchar), NOT the
// surrogate integer batches.id — see the note in models/BatchTeacher.js and
// migration 20, which declares the FK. The join also accepts the legacy
// batches.batch_id alias (a column that exists in the live DB but in none of
// the numbered migrations) because TeachingAssignmentService matches
// batch_members the same way and older rows key off it.
//
// Best-effort like its student-side counterpart: a DB miss returns an empty
// list and logs, so the dashboard degrades to "no courses" rather than 500ing.
const { QueryTypes } = require('sequelize');
const { sequelize, Section, Lesson, Course, BatchLessonRelease } = require('../models');
const {
    groupCurriculum,
    dedupeCoursesByBatch,
    annotateReleaseState,
} = require('./teacherCoursesLogic');

// Batch rows a teacher is attached to, from either assignment path.
// Only ACTIVE batches with a course attached — a batch whose course_id is still
// null has no curriculum to show, and a retired batch shouldn't clutter the tab.
const batchRowsForTeacher = async (teacherId) => {
    const tid = String(teacherId ?? '').trim();
    if (!tid) return [];
    return sequelize.query(
        `SELECT b.unique_id       AS batch_id,
                b.name            AS batch_name,
                b.status          AS batch_status,
                b.start_date,
                b.end_date,
                b.course_id,
                (SELECT COUNT(*)
                   FROM batch_members bm
                  WHERE (bm.batch_id = b.unique_id OR bm.batch_id = b.batch_id)
                    AND COALESCE(bm.status, 'active') = 'active') AS student_count
           FROM batches b
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
                       -- rows written before it existed can hold NULL and must
                       -- still count as active.
                       AND COALESCE(bt.status, 'active') = 'active'
                  )
            )
          ORDER BY b.created_at DESC NULLS LAST, b.unique_id ASC`,
        { replacements: { tid }, type: QueryTypes.SELECT }
    );
};

// Full curriculum for a set of course ids, in two grouped queries rather than
// N+1 per course. Returns { [courseId]: [section, ...] }.
const curriculumByCourse = async (courseIds = []) => {
    const ids = [...new Set(courseIds.map(Number).filter((n) => Number.isFinite(n)))];
    if (ids.length === 0) return {};

    const [sections, lessons] = await Promise.all([
        Section.findAll({
            where: { course_id: ids },
            attributes: ['id', 'course_id', 'title', 'sort'],
            raw: true,
        }),
        Lesson.findAll({
            where: { course_id: ids },
            // Deliberately excludes lesson_src / attachment / video_type: the
            // tab renders an outline, and shipping signed media URLs for every
            // lesson of every course would be a needlessly large payload.
            attributes: [
                'id', 'course_id', 'section_id', 'title', 'lesson_type',
                'duration', 'is_free', 'sort', 'summary', 'status',
            ],
            raw: true,
        }),
    ]);

    const out = {};
    for (const cid of ids) {
        const key = String(cid);
        out[key] = groupCurriculum(
            sections.filter((s) => String(s.course_id) === key),
            lessons.filter((l) => String(l.course_id) === key)
        );
    }
    return out;
};

// Lesson ids already released to each batch, keyed by batch_id. Used to flag
// (never to hide) lessons in the returned curriculum.
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
        const key = String(r.batch_id);
        (out[key] ||= []).push(Number(r.lesson_id));
    }
    return out;
};

/**
 * Courses a teacher teaches, each with its full curriculum.
 *
 * @param {string} teacherId auth-service users.userId of the teacher
 * @returns {Promise<{courses: Array}>} one entry per COURSE (deduped across
 *   batches), each carrying `batches`, `sections` (full curriculum) and
 *   release counts. Empty list if the teacher has no batches or on DB failure.
 */
const listForTeacher = async (teacherId) => {
    const tid = String(teacherId ?? '').trim();
    if (!tid) return { courses: [] };

    try {
        const batchRows = await batchRowsForTeacher(tid);
        if (batchRows.length === 0) return { courses: [] };

        const grouped = dedupeCoursesByBatch(batchRows);
        const courseIds = grouped.map((g) => g.course_id);

        const [courses, curricula, releases] = await Promise.all([
            Course.findAll({
                where: { id: courseIds },
                attributes: ['id', 'title', 'slug', 'thumbnail', 'short_description', 'level', 'status'],
                raw: true,
            }),
            curriculumByCourse(courseIds),
            releasesByBatch(batchRows.map((b) => b.batch_id)),
        ]);
        const courseById = Object.fromEntries(courses.map((c) => [String(c.id), c]));

        const out = grouped.map((g) => {
            const course = courseById[String(g.course_id)] || null;
            // Release state is per-BATCH, but a course card is shared across a
            // teacher's batches for that course. Union the releases so the
            // "released" flag means "released to at least one of your batches";
            // per-batch detail stays available in `batches`.
            const releasedIds = g.batches.flatMap((b) => releases[String(b.batch_id)] || []);
            const { sections, lesson_count, released_count, locked_count } =
                annotateReleaseState(curricula[String(g.course_id)] || [], releasedIds);

            return {
                course_id: g.course_id,
                title: course?.title || `Course #${g.course_id}`,
                slug: course?.slug || null,
                thumbnail: course?.thumbnail || null,
                short_description: course?.short_description || null,
                level: course?.level || null,
                status: course?.status || null,
                batches: g.batches,
                student_count: g.batches.reduce((n, b) => n + (Number(b.student_count) || 0), 0),
                section_count: sections.length,
                lesson_count,
                released_count,
                locked_count,
                sections,
            };
        });

        return { courses: out };
    } catch (err) {
        console.warn('[teacher-courses] listForTeacher failed:', err.message);
        return { courses: [] };
    }
};

module.exports = { listForTeacher, batchRowsForTeacher, curriculumByCourse, releasesByBatch };
