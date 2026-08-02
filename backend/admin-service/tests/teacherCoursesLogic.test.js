// Unit tests for the teacher "My Courses" shaping logic. Pure functions, no DB,
// no network — run with:  npm test   (alias for `node --test`).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    groupCurriculum,
    dedupeCoursesByBatch,
    annotateReleaseState,
    bySort,
} = require('../src/services/teacherCoursesLogic');

// --- groupCurriculum --------------------------------------------------------

test('groupCurriculum: nests lessons under their section', () => {
    const out = groupCurriculum(
        [{ id: 1, title: 'Intro', sort: 1 }, { id: 2, title: 'Advanced', sort: 2 }],
        [
            { id: 10, section_id: 1, title: 'Welcome', sort: 1 },
            { id: 11, section_id: 2, title: 'Kinematics', sort: 1 },
            { id: 12, section_id: 1, title: 'Setup', sort: 2 },
        ]
    );
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((s) => s.title), ['Intro', 'Advanced']);
    assert.deepEqual(out[0].lessons.map((l) => l.title), ['Welcome', 'Setup']);
    assert.deepEqual(out[1].lessons.map((l) => l.title), ['Kinematics']);
});

test('groupCurriculum: orders sections and lessons by sort', () => {
    const out = groupCurriculum(
        [{ id: 1, title: 'B', sort: 2 }, { id: 2, title: 'A', sort: 1 }],
        [
            { id: 10, section_id: 2, title: 'second', sort: 2 },
            { id: 11, section_id: 2, title: 'first', sort: 1 },
        ]
    );
    assert.deepEqual(out.map((s) => s.title), ['A', 'B']);
    assert.deepEqual(out[0].lessons.map((l) => l.title), ['first', 'second']);
});

// THE regression this feature exists to prevent: a lesson whose section is
// missing must still reach the teacher, not be silently dropped.
test('groupCurriculum: lessons with an unknown section land in a catch-all', () => {
    const out = groupCurriculum(
        [{ id: 1, title: 'Intro', sort: 1 }],
        [
            { id: 10, section_id: 1, title: 'Welcome', sort: 1 },
            { id: 11, section_id: 99, title: 'Orphan', sort: 1 },
            { id: 12, section_id: null, title: 'Legacy', sort: 2 },
        ]
    );
    assert.equal(out.length, 2);
    assert.equal(out[1].id, null);
    assert.deepEqual(out[1].lessons.map((l) => l.title), ['Orphan', 'Legacy']);
    // Nothing lost: every input lesson is present exactly once.
    const all = out.flatMap((s) => s.lessons.map((l) => l.id));
    assert.deepEqual(all.sort((a, b) => a - b), [10, 11, 12]);
});

test('groupCurriculum: no catch-all section when every lesson matches', () => {
    const out = groupCurriculum(
        [{ id: 1, title: 'Intro', sort: 1 }],
        [{ id: 10, section_id: 1, title: 'Welcome', sort: 1 }]
    );
    assert.equal(out.length, 1);
    assert.notEqual(out[0].id, null);
});

test('groupCurriculum: an empty section is kept (a real, lesson-less section)', () => {
    const out = groupCurriculum([{ id: 1, title: 'Empty', sort: 1 }], []);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].lessons, []);
});

test('groupCurriculum: string/number section_id mismatch still matches', () => {
    // Sequelize raw rows can hand back either; the grouping keys on String().
    const out = groupCurriculum(
        [{ id: 1, title: 'Intro', sort: 1 }],
        [{ id: 10, section_id: '1', title: 'Welcome', sort: 1 }]
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].lessons.length, 1);
});

test('groupCurriculum: empty input → empty curriculum', () => {
    assert.deepEqual(groupCurriculum([], []), []);
    assert.deepEqual(groupCurriculum(), []);
});

// --- bySort -----------------------------------------------------------------

test('bySort: null sort goes last, ties break by id', () => {
    const rows = [
        { id: 3, sort: null },
        { id: 2, sort: 1 },
        { id: 1, sort: 1 },
        { id: 4, sort: 0 },
    ];
    assert.deepEqual([...rows].sort(bySort).map((r) => r.id), [4, 1, 2, 3]);
});

// --- dedupeCoursesByBatch ---------------------------------------------------

test('dedupeCoursesByBatch: one entry per course, batches collected', () => {
    const out = dedupeCoursesByBatch([
        { batch_id: 'VR-B-1', batch_name: 'A', course_id: 7, student_count: 3 },
        { batch_id: 'VR-B-2', batch_name: 'B', course_id: 7, student_count: 4 },
        { batch_id: 'VR-B-3', batch_name: 'C', course_id: 9, student_count: 1 },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].course_id, 7);
    assert.deepEqual(out[0].batches.map((b) => b.batch_name), ['A', 'B']);
    assert.deepEqual(out[1].batches.map((b) => b.batch_name), ['C']);
});

test('dedupeCoursesByBatch: the same batch twice is not duplicated', () => {
    // A teacher listed BOTH in batch_teachers and as primary_teacher_id makes
    // the union query legitimately return the batch row twice.
    const out = dedupeCoursesByBatch([
        { batch_id: 'VR-B-1', batch_name: 'A', course_id: 7, student_count: 3 },
        { batch_id: 'VR-B-1', batch_name: 'A', course_id: 7, student_count: 3 },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].batches.length, 1);
});

test('dedupeCoursesByBatch: batches with no course attached are skipped', () => {
    const out = dedupeCoursesByBatch([
        { batch_id: 'VR-B-1', course_id: null, student_count: 2 },
        { batch_id: 'VR-B-2', course_id: 7, student_count: 2 },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].course_id, 7);
});

test('dedupeCoursesByBatch: course_id is normalised to a number', () => {
    const out = dedupeCoursesByBatch([{ batch_id: 'VR-B-1', course_id: '7', student_count: 0 }]);
    assert.equal(out[0].course_id, 7);
});

test('dedupeCoursesByBatch: empty input → empty list', () => {
    assert.deepEqual(dedupeCoursesByBatch([]), []);
    assert.deepEqual(dedupeCoursesByBatch(), []);
});

// --- annotateReleaseState ---------------------------------------------------

test('annotateReleaseState: flags released lessons and counts them', () => {
    const { sections, lesson_count, released_count, locked_count } = annotateReleaseState(
        [{ id: 1, title: 'Intro', lessons: [{ id: 10 }, { id: 11 }, { id: 12 }] }],
        [10, 12]
    );
    assert.deepEqual(sections[0].lessons.map((l) => l.is_released), [true, false, true]);
    assert.equal(lesson_count, 3);
    assert.equal(released_count, 2);
    assert.equal(locked_count, 1);
});

// The whole curriculum must be returned regardless of release state — release
// is a flag here, never a filter. That is the core requirement.
test('annotateReleaseState: nothing released still returns every lesson', () => {
    const { sections, lesson_count, released_count, locked_count } = annotateReleaseState(
        [{ id: 1, lessons: [{ id: 10 }, { id: 11 }] }],
        []
    );
    assert.equal(sections[0].lessons.length, 2);
    assert.equal(lesson_count, 2);
    assert.equal(released_count, 0);
    assert.equal(locked_count, 2);
});

test('annotateReleaseState: counts across multiple sections', () => {
    const { lesson_count, released_count } = annotateReleaseState(
        [
            { id: 1, lessons: [{ id: 10 }, { id: 11 }] },
            { id: 2, lessons: [{ id: 20 }] },
        ],
        [11, 20]
    );
    assert.equal(lesson_count, 3);
    assert.equal(released_count, 2);
});

test('annotateReleaseState: string lesson ids still match', () => {
    const { released_count } = annotateReleaseState(
        [{ id: 1, lessons: [{ id: '10' }] }],
        ['10']
    );
    assert.equal(released_count, 1);
});

test('annotateReleaseState: a section with no lessons array does not throw', () => {
    const { sections, lesson_count } = annotateReleaseState([{ id: 1, title: 'Empty' }], []);
    assert.deepEqual(sections[0].lessons, []);
    assert.equal(lesson_count, 0);
});

test('annotateReleaseState: empty curriculum → zero counts', () => {
    const r = annotateReleaseState([], [1, 2]);
    assert.deepEqual(r.sections, []);
    assert.equal(r.lesson_count, 0);
    assert.equal(r.released_count, 0);
});

test('annotateReleaseState: does not mutate its input', () => {
    const input = [{ id: 1, lessons: [{ id: 10 }] }];
    annotateReleaseState(input, [10]);
    assert.equal(input[0].lessons[0].is_released, undefined);
});
