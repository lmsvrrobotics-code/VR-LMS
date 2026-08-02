// Unit tests for grouping a student's own feedback by teacher (the data behind
// the student dashboard's teacher-wise tabs). Pure functions, no DB, no network
// — run with:  npm test   (alias for `node --test`).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    groupByTeacher,
    byNewest,
    UNATTRIBUTED,
} = require('../src/services/studentFeedbackGrouping');

const row = (over) => ({
    id: 1, teacher_id: 'T1', teacher_name: 'Mr Sharma',
    overall: 4, created_at: '2026-07-01T10:00:00.000Z', ...over,
});

// --- groupByTeacher ---------------------------------------------------------

test('groupByTeacher: one group per teacher, with counts', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 'T1', teacher_name: 'Mr Sharma' }),
        row({ id: 2, teacher_id: 'T2', teacher_name: 'Ms Iyer' }),
        row({ id: 3, teacher_id: 'T1', teacher_name: 'Mr Sharma' }),
    ]);
    assert.equal(out.length, 2);
    const sharma = out.find((g) => g.teacher_id === 'T1');
    assert.equal(sharma.count, 2);
    assert.equal(sharma.teacher_name, 'Mr Sharma');
    assert.deepEqual(sharma.feedback.map((f) => f.id).sort(), [1, 3]);
});

test('groupByTeacher: averages the overall score per teacher', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 'T1', overall: 5 }),
        row({ id: 2, teacher_id: 'T1', overall: 4 }),
    ]);
    assert.equal(out[0].avg_overall, 4.5);
});

test('groupByTeacher: zero/missing overalls do not drag the average down', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 'T1', overall: 4 }),
        row({ id: 2, teacher_id: 'T1', overall: 0 }),
    ]);
    assert.equal(out[0].avg_overall, 4);
});

// A student's own submission must always be visible to them, even when the
// course had no teacher to attribute it to.
test('groupByTeacher: unattributed feedback is kept, not dropped', () => {
    const out = groupByTeacher([row({ id: 1, teacher_id: null, teacher_name: null })]);
    assert.equal(out.length, 1);
    assert.equal(out[0].teacher_id, null);
    assert.equal(out[0].teacher_name, UNATTRIBUTED);
    assert.equal(out[0].count, 1);
});

test('groupByTeacher: unattributed group always sorts last', () => {
    const out = groupByTeacher([
        // Unattributed is the most RECENT — recency must not float it to front.
        row({ id: 1, teacher_id: null, created_at: '2026-07-20T10:00:00.000Z' }),
        row({ id: 2, teacher_id: 'T1', created_at: '2026-07-01T10:00:00.000Z' }),
    ]);
    assert.deepEqual(out.map((g) => g.teacher_id), ['T1', null]);
});

test('groupByTeacher: teachers ordered by most recent feedback first', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 'T1', created_at: '2026-07-01T10:00:00.000Z' }),
        row({ id: 2, teacher_id: 'T2', created_at: '2026-07-25T10:00:00.000Z' }),
    ]);
    assert.deepEqual(out.map((g) => g.teacher_id), ['T2', 'T1']);
});

test('groupByTeacher: newest submission first within a teacher group', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 'T1', created_at: '2026-07-01T10:00:00.000Z' }),
        row({ id: 2, teacher_id: 'T1', created_at: '2026-07-25T10:00:00.000Z' }),
    ]);
    assert.deepEqual(out[0].feedback.map((f) => f.id), [2, 1]);
});

test('groupByTeacher: latest_at is the newest timestamp in the group', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 'T1', created_at: '2026-07-01T10:00:00.000Z' }),
        row({ id: 2, teacher_id: 'T1', created_at: '2026-07-25T10:00:00.000Z' }),
    ]);
    assert.equal(out[0].latest_at, '2026-07-25T10:00:00.000Z');
});

test('groupByTeacher: falls back to "Teacher <id>" when the name is missing', () => {
    const out = groupByTeacher([row({ teacher_id: 'T9', teacher_name: null })]);
    assert.equal(out[0].teacher_name, 'Teacher T9');
});

test('groupByTeacher: numeric and string teacher ids group together', () => {
    const out = groupByTeacher([
        row({ id: 1, teacher_id: 7 }),
        row({ id: 2, teacher_id: '7' }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].count, 2);
});

test('groupByTeacher: empty and missing input yields no groups', () => {
    assert.deepEqual(groupByTeacher([]), []);
    assert.deepEqual(groupByTeacher(null), []);
    assert.deepEqual(groupByTeacher(undefined), []);
});

// --- byNewest ---------------------------------------------------------------

test('byNewest: sorts newest first', () => {
    const rows = [
        { id: 1, created_at: '2026-07-01T00:00:00.000Z' },
        { id: 2, created_at: '2026-07-20T00:00:00.000Z' },
    ];
    assert.deepEqual([...rows].sort(byNewest).map((r) => r.id), [2, 1]);
});

test('byNewest: an invalid date sorts last instead of corrupting the order', () => {
    const rows = [
        { id: 1, created_at: 'not-a-date' },
        { id: 2, created_at: '2026-07-20T00:00:00.000Z' },
    ];
    assert.deepEqual([...rows].sort(byNewest).map((r) => r.id), [2, 1]);
});
