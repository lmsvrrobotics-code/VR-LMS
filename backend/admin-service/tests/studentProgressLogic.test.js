// Unit tests for the teacher's per-student "Course progress" shaping logic.
// Pure functions, no DB, no network — run with:  npm test   (alias for
// `node --test`).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    dedupeBatchesByCourse,
    courseProgress,
    buildProgress,
} = require('../src/services/studentProgressLogic');

// --- dedupeBatchesByCourse --------------------------------------------------

test('dedupeBatchesByCourse: one entry per course, batches collected', () => {
    const out = dedupeBatchesByCourse([
        { batch_id: 'B1', course_id: 7 },
        { batch_id: 'B2', course_id: 7 },
        { batch_id: 'B3', course_id: 9 },
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { course_id: 7, batch_ids: ['B1', 'B2'] });
    assert.deepEqual(out[1], { course_id: 9, batch_ids: ['B3'] });
});

// The union query returns the same batch twice when a teacher is BOTH listed in
// batch_teachers and set as primary_teacher_id — that must not double a batch.
test('dedupeBatchesByCourse: the same batch twice is collapsed', () => {
    const out = dedupeBatchesByCourse([
        { batch_id: 'B1', course_id: 7 },
        { batch_id: 'B1', course_id: 7 },
    ]);
    assert.deepEqual(out, [{ course_id: 7, batch_ids: ['B1'] }]);
});

test('dedupeBatchesByCourse: batches with no course attached are skipped', () => {
    const out = dedupeBatchesByCourse([
        { batch_id: 'B1', course_id: null },
        { batch_id: 'B2', course_id: 7 },
    ]);
    assert.deepEqual(out, [{ course_id: 7, batch_ids: ['B2'] }]);
});

test('dedupeBatchesByCourse: empty input yields an empty list', () => {
    assert.deepEqual(dedupeBatchesByCourse([]), []);
    assert.deepEqual(dedupeBatchesByCourse(), []);
});

// --- courseProgress ---------------------------------------------------------

test('courseProgress: counts completed against RELEASED lessons', () => {
    const out = courseProgress({
        courseId: 7,
        title: 'Robotics 101',
        releasedLessonIds: [1, 2, 3, 4],
        completedLessonIds: [1, 2],
    });
    assert.deepEqual(out, {
        course_id: 7,
        course_title: 'Robotics 101',
        completed: 2,
        total: 4,
        percent: 50,
    });
});

// THE core rule: unreleased lessons are NOT in the denominator. Counting the
// whole curriculum would cap the student below 100% for lessons the teacher has
// simply not dripped yet.
test('courseProgress: unreleased lessons do not enter the denominator', () => {
    const out = courseProgress({
        courseId: 7,
        title: 'Robotics 101',
        releasedLessonIds: [1, 2],   // course has 10 lessons; only 2 released
        completedLessonIds: [1, 2],
    });
    assert.equal(out.total, 2);
    assert.equal(out.percent, 100);
});

// A completion for a lesson that is no longer released (retracted or deleted)
// must not be counted, or completed could exceed total and overflow the bar.
test('courseProgress: completions outside the released set are ignored', () => {
    const out = courseProgress({
        courseId: 7,
        title: 'Robotics 101',
        releasedLessonIds: [1, 2],
        completedLessonIds: [1, 2, 99],
    });
    assert.equal(out.completed, 2);
    assert.equal(out.total, 2);
    assert.equal(out.percent, 100);
});

test('courseProgress: nothing released yields 0% and no NaN', () => {
    const out = courseProgress({
        courseId: 7,
        title: 'Robotics 101',
        releasedLessonIds: [],
        completedLessonIds: [5],
    });
    assert.equal(out.total, 0);
    assert.equal(out.completed, 0);
    assert.equal(out.percent, 0);
    assert.ok(Number.isFinite(out.percent));
});

// Ids arrive as strings from raw SQL rows and as numbers from Sequelize —
// comparing across the two without coercion silently scores every bar 0%.
test('courseProgress: string and number lesson ids match', () => {
    const out = courseProgress({
        courseId: '7',
        title: 'Robotics 101',
        releasedLessonIds: ['1', '2'],
        completedLessonIds: [1],
    });
    assert.equal(out.course_id, 7);
    assert.equal(out.completed, 1);
    assert.equal(out.percent, 50);
});

test('courseProgress: duplicate released ids are counted once', () => {
    const out = courseProgress({
        courseId: 7,
        title: 'Robotics 101',
        releasedLessonIds: [1, 1, 2],
        completedLessonIds: [1],
    });
    assert.equal(out.total, 2);
    assert.equal(out.completed, 1);
});

test('courseProgress: percent is a rounded integer', () => {
    const out = courseProgress({
        courseId: 7,
        title: 'Robotics 101',
        releasedLessonIds: [1, 2, 3],
        completedLessonIds: [1],
    });
    assert.equal(out.percent, 33); // 33.33 → 33
    assert.equal(out.percent, Math.trunc(out.percent));
});

test('courseProgress: a missing title falls back to the course id', () => {
    const out = courseProgress({ courseId: 7, releasedLessonIds: [1], completedLessonIds: [] });
    assert.equal(out.course_title, 'Course #7');
});

// --- buildProgress ----------------------------------------------------------

test('buildProgress: builds one bar per course, sorted by title', () => {
    const out = buildProgress(
        [
            { course_id: 7, batch_ids: ['B1'] },
            { course_id: 9, batch_ids: ['B2'] },
        ],
        {
            titles: { 7: 'Zebra Robotics', 9: 'Alpha Drones' },
            releasesByBatch: { B1: [1, 2], B2: [3, 4] },
            completedByCourse: { 7: [1], 9: [3, 4] },
        },
    );
    assert.deepEqual(out.map((c) => c.course_title), ['Alpha Drones', 'Zebra Robotics']);
    assert.equal(out[0].percent, 100);
    assert.equal(out[1].percent, 50);
});

// A student in two of the teacher's batches for one course can open a lesson
// released to EITHER, so the release sets must union rather than pick one.
test('buildProgress: releases union across batches of the same course', () => {
    const out = buildProgress(
        [{ course_id: 7, batch_ids: ['B1', 'B2'] }],
        {
            titles: { 7: 'Robotics 101' },
            releasesByBatch: { B1: [1, 2], B2: [2, 3] },
            completedByCourse: { 7: [1, 2, 3] },
        },
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].total, 3); // {1,2,3} — 2 counted once
    assert.equal(out[0].completed, 3);
});

test('buildProgress: a course with no releases still appears, at 0%', () => {
    const out = buildProgress(
        [{ course_id: 7, batch_ids: ['B1'] }],
        { titles: { 7: 'Robotics 101' }, releasesByBatch: {}, completedByCourse: {} },
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].total, 0);
    assert.equal(out[0].percent, 0);
});

test('buildProgress: no shared courses yields an empty list', () => {
    assert.deepEqual(buildProgress([], {}), []);
    assert.deepEqual(buildProgress(), []);
});
