// Pure shaping logic for the teacher's per-student "Course progress" panel — NO
// database, NO network, NO Sequelize. Everything here is a deterministic
// function of its inputs so it can be unit-tested in isolation (see
// tests/studentProgressLogic.test.js). The DB-bound caller
// (StudentProgressService) queries the rows and composes these helpers.
//
// Mirrors the split teacherCoursesLogic.js/TeacherCourseService already uses.

// Collapse the (student, batch) rows a teacher reaches into one entry per
// COURSE, carrying every batch that course came from.
//
// Why per-course and not per-batch: the panel answers "how far is this student
// through Robotics 101", and a student can sit in two of the teacher's batches
// for the same course. Listing the course twice would show two bars for one
// curriculum, so the batches are unioned and the release sets merged by the
// caller.
//
// Batch order within a course follows first-appearance of `rows`, so the caller
// controls it with ORDER BY rather than it being incidental.
const dedupeBatchesByCourse = (rows = []) => {
    const byCourse = new Map();
    for (const r of rows) {
        const cid = r?.course_id;
        if (cid == null) continue; // batch with no course attached yet
        const key = String(cid);
        if (!byCourse.has(key)) {
            byCourse.set(key, { course_id: Number(cid), batch_ids: [] });
        }
        const entry = byCourse.get(key);
        // Guard against the same batch appearing twice (a teacher listed in
        // batch_teachers AND as primary_teacher_id — the union query can
        // legitimately return both rows).
        if (r.batch_id != null && !entry.batch_ids.some((b) => String(b) === String(r.batch_id))) {
            entry.batch_ids.push(r.batch_id);
        }
    }
    return [...byCourse.values()];
};

// Progress for ONE course: how many of the lessons this student can actually
// open are done.
//
// The denominator is RELEASED lessons, not every lesson in the course. Release
// gating is universal here (see CLAUDE.md § Course Release Gating) — an unreleased
// lesson cannot be opened, so counting it would permanently cap the student
// below 100% and read as the student falling behind when it is the teacher who
// has not dripped the lesson yet. The frontend leans on the same rule: it prints
// "No lessons released" when total is 0.
//
// `completedLessonIds` may contain completions for lessons that are no longer
// released (a lesson finished before the teacher retracted it, or deleted from
// the curriculum). Those are intersected out rather than counted, so `completed`
// can never exceed `total` and the bar can never overflow.
const courseProgress = ({ courseId, title, releasedLessonIds = [], completedLessonIds = [] }) => {
    const released = new Set([...releasedLessonIds].map(Number).filter(Number.isFinite));
    const completedAll = new Set([...completedLessonIds].map(Number).filter(Number.isFinite));

    let completed = 0;
    for (const id of released) {
        if (completedAll.has(id)) completed += 1;
    }
    const total = released.size;

    return {
        course_id: Number(courseId),
        course_title: title || `Course #${courseId}`,
        completed,
        total,
        // Integer 0-100. Guarded against total:0 (nothing released yet) — the
        // bar renders at 0 width and the caption switches to "No lessons
        // released" rather than showing NaN%.
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
};

// Build the full panel payload: one bar per course, ordered by title so the
// list is stable across requests (Postgres gives no implicit ordering).
const buildProgress = (grouped = [], { titles = {}, releasesByBatch = {}, completedByCourse = {} } = {}) => {
    const courses = grouped.map((g) => {
        const key = String(g.course_id);
        // Release state is per-BATCH; a student in two of the teacher's batches
        // for one course can open a lesson released to EITHER, so union them.
        const releasedLessonIds = (g.batch_ids || []).flatMap((b) => releasesByBatch[String(b)] || []);
        return courseProgress({
            courseId: g.course_id,
            title: titles[key],
            releasedLessonIds,
            completedLessonIds: completedByCourse[key] || [],
        });
    });

    courses.sort((a, b) => a.course_title.localeCompare(b.course_title));
    return courses;
};

module.exports = { dedupeBatchesByCourse, courseProgress, buildProgress };
