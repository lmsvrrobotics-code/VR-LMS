// Pure shaping logic for the teacher's "My Courses" tab — NO database, NO
// network, NO Sequelize. Everything here is a deterministic function of its
// inputs so it can be unit-tested in isolation (see
// tests/teacherCoursesLogic.test.js). The DB-bound caller
// (TeacherCourseService) queries the rows and composes these helpers.
//
// Mirrors the split teachingLogic.js/TeachingAssignmentService already uses.

// Group flat section rows + flat lesson rows into the nested curriculum the
// dashboard renders: [{ id, title, sort, lessons: [...] }].
//
// Two rules matter here and are what the tests pin down:
//   1. Lessons whose section_id matches no section in `sections` are NOT
//      dropped. Course authors can save a lesson before creating its section
//      (and legacy rows have section_id NULL), and silently swallowing those
//      would show the teacher an incomplete curriculum — the exact bug this
//      feature exists to fix. They are collected into a trailing catch-all
//      section with id:null.
//   2. Ordering is by `sort` then `id`, with null/undefined sort last. The
//      admin curriculum builder writes sparse sort values, so falling back to
//      id keeps the order stable instead of arbitrary.
const groupCurriculum = (sections = [], lessons = []) => {
    const bySection = new Map();
    for (const s of sections) {
        bySection.set(String(s.id), { ...s, lessons: [] });
    }

    const orphans = [];
    for (const l of lessons) {
        const key = String(l.section_id);
        const bucket = bySection.get(key);
        if (bucket) bucket.lessons.push(l);
        else orphans.push(l);
    }

    const out = [...bySection.values()];
    out.sort(bySort);
    for (const s of out) s.lessons.sort(bySort);

    if (orphans.length) {
        orphans.sort(bySort);
        out.push({ id: null, title: 'Uncategorised', sort: null, lessons: orphans });
    }
    return out;
};

// Sort comparator: `sort` ascending, nulls last, ties broken by id so the
// order is deterministic across requests (Postgres gives no implicit ordering).
const bySort = (a, b) => {
    const as = a?.sort;
    const bs = b?.sort;
    const aNull = as == null || as === '';
    const bNull = bs == null || bs === '';
    if (aNull && bNull) return numOr(a?.id) - numOr(b?.id);
    if (aNull) return 1;
    if (bNull) return -1;
    const d = Number(as) - Number(bs);
    return d !== 0 ? d : numOr(a?.id) - numOr(b?.id);
};

const numOr = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

// A teacher may reach the same course through several batches (two batches
// teaching "Robotics 101"). The tab lists each COURSE once, carrying the list
// of batches it came from, so the teacher sees "Robotics 101 — Batch A, Batch B"
// rather than a duplicated card per batch.
//
// Batch order within a course follows first-appearance of `batchRows`, so the
// caller controls it with ORDER BY rather than it being incidental.
const dedupeCoursesByBatch = (batchRows = []) => {
    const byCourse = new Map();
    for (const r of batchRows) {
        const cid = r?.course_id;
        if (cid == null) continue; // batch with no course attached yet
        const key = String(cid);
        if (!byCourse.has(key)) {
            byCourse.set(key, { course_id: Number(cid), batches: [] });
        }
        const entry = byCourse.get(key);
        // Guard against the same batch appearing twice (a teacher listed in
        // batch_teachers AND as primary_teacher_id — the union query below can
        // legitimately return both rows).
        if (!entry.batches.some((b) => String(b.batch_id) === String(r.batch_id))) {
            entry.batches.push({
                batch_id: r.batch_id,
                batch_name: r.batch_name ?? null,
                batch_status: r.batch_status ?? null,
                start_date: r.start_date ?? null,
                end_date: r.end_date ?? null,
                student_count: numOr(r.student_count, 0),
            });
        }
    }
    return [...byCourse.values()];
};

// Mark each lesson released/locked for a batch and total it up. The teacher's
// tab shows the WHOLE curriculum (that is the requirement) — release state is
// surfaced as a per-lesson flag so they can see what students can currently
// open, not used to hide anything. `releasedLessonIds` is any iterable of ids.
const annotateReleaseState = (curriculum = [], releasedLessonIds = []) => {
    const released = new Set([...releasedLessonIds].map(Number));
    let total = 0;
    let releasedCount = 0;
    const sections = curriculum.map((s) => ({
        ...s,
        lessons: (s.lessons || []).map((l) => {
            total += 1;
            const isReleased = released.has(Number(l.id));
            if (isReleased) releasedCount += 1;
            return { ...l, is_released: isReleased };
        }),
    }));
    return {
        sections,
        lesson_count: total,
        released_count: releasedCount,
        // Lessons the teacher has yet to drip. Drives the "3 of 12 released"
        // hint on the course card.
        locked_count: total - releasedCount,
    };
};

module.exports = {
    groupCurriculum,
    dedupeCoursesByBatch,
    annotateReleaseState,
    bySort,
};
