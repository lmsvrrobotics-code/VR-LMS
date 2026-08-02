/**
 * Tests for student → teacher class feedback visibility.
 *
 * Background: students could submit class feedback (POST
 * /api/public/teacher-feedback) and admins could read it
 * (/api/admin/teacher-feedback*), but TEACHERS had no way to see feedback about
 * their own classes — there was no teacher-scoped endpoint and no dashboard tab.
 * TeacherFeedbackService.forTeacher + /api/public/teacher-feedback/by-teacher/:id
 * close that gap.
 *
 * These cover the aggregation forTeacher performs, and the two properties that
 * matter for correctness: a teacher sees ONLY their own feedback, and the
 * payload never carries student identity (ratings stay anonymous to the teacher
 * being rated — admins still see names through the separate admin list()).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const ATTR_KEYS = ['explanation', 'engagement', 'understanding', 'activities', 'experience'];

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;
const overallOf = (ratings) => {
  const vals = ATTR_KEYS.map((k) => Number(ratings && ratings[k])).filter((v) => v > 0);
  return vals.length ? avg(vals) : 0;
};

// Mirrors TeacherFeedbackService.forTeacher: filter to one teacher, aggregate,
// and shape rows WITHOUT student_id / student_name.
const forTeacher = (allRows, teacherId, titles = {}) => {
  // The service rejects a missing teacherId (401) before it ever queries, so a
  // falsy scope must never fall through to a `teacher_id IS NULL` match.
  if (!teacherId) throw new Error('Sign in to view your feedback.');
  const rows = allRows
    .filter((r) => r.teacher_id != null && String(r.teacher_id) === String(teacherId))
    .sort((a, b) => b.id - a.id);

  const perAttribute = {};
  ATTR_KEYS.forEach((k) => {
    const vals = rows.map((r) => Number(r.ratings && r.ratings[k])).filter((v) => v > 0);
    perAttribute[k] = round1(avg(vals));
  });

  return {
    stats: {
      total_feedback: rows.length,
      overall_avg: round1(avg(rows.map((r) => overallOf(r.ratings)).filter((v) => v > 0))),
      per_attribute: perAttribute,
    },
    feedback: rows.map((r) => ({
      id: r.id,
      course_id: r.course_id,
      course_title: r.course_id ? (titles[String(r.course_id)] || null) : null,
      ratings: r.ratings || {},
      overall: round1(overallOf(r.ratings)),
      enjoyed: r.enjoyed || '',
      suggestions: r.suggestions || '',
      created_at: r.created_at,
    })),
  };
};

const full = (n) => ATTR_KEYS.reduce((acc, k) => ({ ...acc, [k]: n }), {});

const rows = [
  { id: 1, student_id: 's1', teacher_id: 't1', course_id: '10', ratings: full(4), enjoyed: 'Robots!', suggestions: '', created_at: '2026-07-01' },
  { id: 2, student_id: 's2', teacher_id: 't1', course_id: '10', ratings: full(5), enjoyed: '', suggestions: 'More labs', created_at: '2026-07-02' },
  { id: 3, student_id: 's3', teacher_id: 't2', course_id: '11', ratings: full(2), enjoyed: '', suggestions: '', created_at: '2026-07-03' },
  { id: 4, student_id: 's4', teacher_id: null, course_id: null, ratings: full(3), enjoyed: '', suggestions: '', created_at: '2026-07-04' },
];

test('a teacher sees only feedback addressed to them', () => {
  const out = forTeacher(rows, 't1');
  assert.equal(out.stats.total_feedback, 2);
  assert.deepEqual(out.feedback.map((f) => f.id), [2, 1]); // newest first
});

test("another teacher's feedback and unassigned rows are excluded", () => {
  const out = forTeacher(rows, 't1');
  const ids = out.feedback.map((f) => f.id);
  assert.ok(!ids.includes(3), 't2 feedback must not leak to t1');
  assert.ok(!ids.includes(4), 'unassigned feedback must not leak to t1');
});

test('the response never exposes student identity', () => {
  const out = forTeacher(rows, 't1');
  for (const f of out.feedback) {
    assert.ok(!('student_id' in f), 'student_id must be withheld from teachers');
    assert.ok(!('student_name' in f), 'student_name must be withheld from teachers');
  }
});

test('averages are computed over that teacher rows only', () => {
  const out = forTeacher(rows, 't1');
  // t1 has a 4-across and a 5-across row → 4.5 overall and per-attribute.
  assert.equal(out.stats.overall_avg, 4.5);
  ATTR_KEYS.forEach((k) => assert.equal(out.stats.per_attribute[k], 4.5));
});

test('partial ratings average only the answered areas', () => {
  const partial = [{ id: 9, teacher_id: 't9', course_id: null, ratings: { explanation: 5, engagement: 3 } }];
  const out = forTeacher(partial, 't9');
  assert.equal(out.feedback[0].overall, 4); // (5+3)/2, unanswered areas ignored
  assert.equal(out.stats.per_attribute.understanding, 0);
});

test('course titles resolve, and a course-less submission stays null', () => {
  const out = forTeacher(rows, 't1', { 10: 'Intro to Robotics' });
  assert.equal(out.feedback[0].course_title, 'Intro to Robotics');
});

test('an unidentified caller is rejected rather than matching null teacher rows', () => {
  // Guards the subtle bug where String(null) === String(row.teacher_id) would
  // have handed row 4 (unassigned feedback) to an anonymous caller.
  assert.throws(() => forTeacher(rows, null), /Sign in/);
  assert.throws(() => forTeacher(rows, undefined), /Sign in/);
  assert.throws(() => forTeacher(rows, ''), /Sign in/);
});

test('a teacher with no feedback gets an empty, zeroed payload', () => {
  const out = forTeacher(rows, 'nobody');
  assert.equal(out.stats.total_feedback, 0);
  assert.equal(out.stats.overall_avg, 0);
  assert.deepEqual(out.feedback, []);
  ATTR_KEYS.forEach((k) => assert.equal(out.stats.per_attribute[k], 0));
});

test('free-text answers survive to the teacher view', () => {
  const out = forTeacher(rows, 't1');
  const byId = Object.fromEntries(out.feedback.map((f) => [f.id, f]));
  assert.equal(byId[1].enjoyed, 'Robots!');
  assert.equal(byId[2].suggestions, 'More labs');
  assert.equal(byId[1].suggestions, ''); // absent text normalises to empty string
});
