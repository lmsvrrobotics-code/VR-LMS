/**
 * Tests for a TEACHER reading the responses to their own feedback forms.
 *
 * Background: FeedbackFormService exposed per-question aggregates and individual
 * records only through adminStats/adminResponses, both mounted behind
 * `adminOnly`. A teacher could build a form, send it to a batch, and see a
 * response COUNT — but never the answers. teacherStats/teacherResponses add an
 * owner-scoped read of the same data.
 *
 * Two properties are load-bearing here:
 *  1. Ownership — a teacher may only read a form they authored (ownForm 403s).
 *     This is the ONLY thing separating a teacher's read from an admin's, so it
 *     carries the whole access-control weight for this endpoint.
 *  2. Attribution — responses are NAMED: a teacher needs to know who answered a
 *     targeted form (to chase non-responders and follow up on an answer).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const round1 = (n) => Math.round(n * 10) / 10;

// Mirrors ownForm(): 404 when missing, 403 when not the author.
const ownForm = (forms, id, teacherId) => {
  const form = forms.find((f) => f.id === Number(id));
  if (!form) throw new Error('404 Form not found.');
  if (String(form.teacher_id) !== String(teacherId)) throw new Error('403 Not your form.');
  return form;
};

// Mirrors buildStats() — shared by the admin and teacher stats reads.
const buildStats = (form, allRows) => {
  const rows = allRows.filter((r) => r.form_id === form.id);
  const questions = (form.questions || []).map((q) => {
    const vals = rows.map((r) => r.answers && r.answers[q.id]).filter((v) => v !== undefined && v !== null);
    const base = { id: q.id, type: q.type, label: q.label, answered: vals.length };
    if (q.type === 'rating') {
      const nums = vals.map(Number).filter((n) => n > 0);
      base.average = nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
    } else if (q.type === 'mcq') {
      base.counts = (q.options || []).map((opt) => ({ option: opt, count: vals.filter((v) => v === opt).length }));
    } else if (q.type === 'yesno') {
      base.yes = vals.filter((v) => v === true).length;
      base.no = vals.filter((v) => v === false).length;
    } else if (q.type === 'text') {
      base.answers = vals.map((v) => String(v));
    }
    return base;
  });
  return {
    form: { id: form.id, title: form.title, description: form.description || '' },
    total_responses: rows.length,
    audience_count: Array.isArray(form.audience_student_ids) ? form.audience_student_ids.length : 0,
    questions,
  };
};

const teacherStats = (forms, rows, id, teacherId) => buildStats(ownForm(forms, id, teacherId), rows);

// Mirrors teacherResponses(): each row carries the responding student.
const teacherResponses = (forms, allRows, id, teacherId, names = {}) => {
  const form = ownForm(forms, id, teacherId);
  const rows = allRows.filter((r) => r.form_id === form.id).sort((a, b) => b.id - a.id);
  return {
    form: { id: form.id, title: form.title, questions: form.questions || [] },
    responses: rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: names[String(r.student_id)] || `Student ${r.student_id}`,
      answers: r.answers || {},
      created_at: r.created_at,
    })),
  };
};

const questions = [
  { id: 'q1', type: 'rating', label: 'How was the class?' },
  { id: 'q2', type: 'text', label: 'Any comments?' },
  { id: 'q3', type: 'mcq', label: 'Pace?', options: ['Too slow', 'Just right', 'Too fast'] },
  { id: 'q4', type: 'yesno', label: 'Would you recommend it?' },
];

const forms = [
  { id: 1, teacher_id: 't1', title: 'Week 1 feedback', description: '', questions, audience_student_ids: ['s1', 's2', 's3'] },
  { id: 2, teacher_id: 't2', title: "Other teacher's form", description: '', questions, audience_student_ids: ['s9'] },
];

const rows = [
  { id: 11, form_id: 1, student_id: 's1', answers: { q1: 5, q2: 'Loved the robots', q3: 'Just right', q4: true }, created_at: '2026-07-01' },
  { id: 12, form_id: 1, student_id: 's2', answers: { q1: 3, q2: 'A bit rushed', q3: 'Too fast', q4: false }, created_at: '2026-07-02' },
  { id: 13, form_id: 2, student_id: 's9', answers: { q1: 1 }, created_at: '2026-07-03' },
];

test('a teacher reads the aggregates for their own form', () => {
  const out = teacherStats(forms, rows, 1, 't1');
  assert.equal(out.total_responses, 2);
  assert.equal(out.audience_count, 3);
});

test("a teacher cannot read another teacher's form", () => {
  assert.throws(() => teacherStats(forms, rows, 2, 't1'), /403/);
  assert.throws(() => teacherResponses(forms, rows, 2, 't1'), /403/);
});

test('a missing form is a 404, not a silent empty result', () => {
  assert.throws(() => teacherStats(forms, rows, 999, 't1'), /404/);
});

test('individual responses are attributed to the student who sent them', () => {
  const out = teacherResponses(forms, rows, 1, 't1', { s1: 'Asha R', s2: 'Vikram S' });
  assert.equal(out.responses.length, 2);
  const byId = Object.fromEntries(out.responses.map((r) => [r.id, r]));
  assert.equal(byId[11].student_id, 's1');
  assert.equal(byId[11].student_name, 'Asha R');
  assert.equal(byId[12].student_name, 'Vikram S');
});

test('an unresolvable student falls back to a readable label, not blank', () => {
  // resolveUserNames returns nothing for a deleted/unknown user; the row must
  // still identify itself rather than rendering an empty name.
  const out = teacherResponses(forms, rows, 1, 't1');
  assert.equal(out.responses[0].student_name, 'Student s2');
  assert.ok(out.responses.every((r) => r.student_name.trim().length > 0));
});

test('responses come back newest first', () => {
  const out = teacherResponses(forms, rows, 1, 't1');
  assert.deepEqual(out.responses.map((r) => r.id), [12, 11]);
});

test('rating questions average only the answered submissions', () => {
  const q1 = teacherStats(forms, rows, 1, 't1').questions.find((q) => q.id === 'q1');
  assert.equal(q1.answered, 2);
  assert.equal(q1.average, 4); // (5 + 3) / 2
});

test('mcq questions tally per option, including zero-count options', () => {
  const q3 = teacherStats(forms, rows, 1, 't1').questions.find((q) => q.id === 'q3');
  assert.deepEqual(q3.counts, [
    { option: 'Too slow', count: 0 },
    { option: 'Just right', count: 1 },
    { option: 'Too fast', count: 1 },
  ]);
});

test('yes/no questions count both sides', () => {
  const q4 = teacherStats(forms, rows, 1, 't1').questions.find((q) => q.id === 'q4');
  assert.equal(q4.yes, 1);
  assert.equal(q4.no, 1);
});

test('text questions collect the written answers', () => {
  const q2 = teacherStats(forms, rows, 1, 't1').questions.find((q) => q.id === 'q2');
  assert.deepEqual(q2.answers, ['Loved the robots', 'A bit rushed']);
});

test('a form with no responses reports zeros rather than failing', () => {
  const empty = [{ id: 3, teacher_id: 't1', title: 'Unsent', questions, audience_student_ids: [] }];
  const out = teacherStats(empty, [], 3, 't1');
  assert.equal(out.total_responses, 0);
  assert.equal(out.questions.find((q) => q.id === 'q1').average, 0);
  assert.deepEqual(teacherResponses(empty, [], 3, 't1').responses, []);
});

test('a skipped question is not counted as answered', () => {
  // Row 13 answers only q1, so on form 2 the other questions have zero answers.
  const out = teacherStats(forms, rows, 2, 't2');
  assert.equal(out.questions.find((q) => q.id === 'q1').answered, 1);
  assert.equal(out.questions.find((q) => q.id === 'q2').answered, 0);
  assert.deepEqual(out.questions.find((q) => q.id === 'q2').answers, []);
});
