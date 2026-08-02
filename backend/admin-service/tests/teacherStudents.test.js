/**
 * Tests for the teacher "Students" roster, which is sourced from BATCHES.
 *
 * Background: the endpoint that fed this tab
 * (`/api/public/teaching/students-by-teacher/:id`) was DELETED when the Batch
 * Management System replaced the teaching-assignment feature, but the teacher
 * dashboard kept calling it. The 404 was swallowed by the frontend's `.catch`,
 * so batch students silently never appeared — the tab only ever listed students
 * who happened to be on a scheduled class or slot roster.
 *
 * These cover the row-collapsing performed by TeacherStudentService.listForTeacher:
 * the SQL returns one row per (student, batch) pair, and a student in several of
 * the teacher's batches must appear ONCE with every batch listed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// Mirrors the collapse in TeacherStudentService.listForTeacher.
const collapse = (rows, names = {}) => {
  const byStudent = new Map();
  for (const r of rows) {
    const id = String(r.student_user_id);
    if (!byStudent.has(id)) {
      byStudent.set(id, { id, studentId: r.student_public_id || null, name: '', email: null, batches: [] });
    }
    const entry = byStudent.get(id);
    if (r.batch_id && !entry.batches.some((b) => b.id === r.batch_id)) {
      entry.batches.push({ id: r.batch_id, name: r.batch_name || r.batch_id });
    }
  }
  for (const [id, entry] of byStudent) entry.name = names[id] || '';
  return [...byStudent.values()].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
};

const row = (studentId, batchId, batchName, publicId = null) => ({
  student_user_id: studentId,
  student_public_id: publicId,
  batch_id: batchId,
  batch_name: batchName,
});

test('the real batch row produces one student with their batch', () => {
  // Matches the live data: batch VR-B-00001 "sdfjah", member 20213469407.
  const out = collapse([row('20213469407', 'VR-B-00001', 'sdfjah')], { 20213469407: 'Student 4' });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '20213469407');
  assert.equal(out[0].name, 'Student 4');
  assert.deepEqual(out[0].batches, [{ id: 'VR-B-00001', name: 'sdfjah' }]);
});

test('a student in TWO of the teacher batches appears once, listing both', () => {
  const out = collapse(
    [
      row('S1', 'VR-B-00001', 'Batch One'),
      row('S1', 'VR-B-00002', 'Batch Two'),
    ],
    { S1: 'Alice' },
  );
  assert.equal(out.length, 1, 'must not duplicate the student per batch');
  assert.equal(out[0].batches.length, 2);
  assert.deepEqual(out[0].batches.map((b) => b.id), ['VR-B-00001', 'VR-B-00002']);
});

test('duplicate (student, batch) rows do not duplicate the batch chip', () => {
  // The teacher can match a batch via BOTH primary_teacher_id and
  // batch_teachers; the join can then emit the pair twice.
  const out = collapse([
    row('S1', 'VR-B-00001', 'Batch One'),
    row('S1', 'VR-B-00001', 'Batch One'),
  ]);
  assert.equal(out[0].batches.length, 1);
});

test('several students across batches are all returned', () => {
  const out = collapse(
    [
      row('S2', 'VR-B-00001', 'Batch One'),
      row('S1', 'VR-B-00001', 'Batch One'),
      row('S3', 'VR-B-00002', 'Batch Two'),
    ],
    { S1: 'Alice', S2: 'Bob', S3: 'Carol' },
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((s) => s.name), ['Alice', 'Bob', 'Carol'], 'sorted by name');
});

test('a student with no resolved name falls back to their id for sorting', () => {
  const out = collapse([row('ZZZ', 'B1', 'Batch'), row('AAA', 'B1', 'Batch')], { ZZZ: '' });
  assert.deepEqual(out.map((s) => s.id), ['AAA', 'ZZZ']);
});

test('the public student id is carried through when present', () => {
  const out = collapse([row('S1', 'B1', 'Batch', 'VRS202600001')]);
  assert.equal(out[0].studentId, 'VRS202600001');
});

test('no batch rows yields an empty roster, not an error', () => {
  assert.deepEqual(collapse([]), []);
});

// --- frontend merge -------------------------------------------------------
// Mirrors StudentsView's map merge: batch students must appear even when they
// have no scheduled class or slot (the bug being fixed).
test('a batch student with no class or slot still appears in the roster', () => {
  const map = new Map();
  const blank = (id, name) => ({ id, name: name || '', classes: 0, slots: 0, batches: [] });

  // No class/slot rosters at all.
  const batchStudents = [{ id: 'S1', name: 'Alice', batches: [{ id: 'B1', name: 'Batch One' }] }];
  batchStudents.forEach((st) => {
    const cur = map.get(st.id) || blank(st.id, st.name);
    (st.batches || []).forEach((b) => {
      if (!cur.batches.some((x) => x.id === b.id)) cur.batches.push(b);
    });
    map.set(st.id, cur);
  });

  const students = [...map.values()];
  assert.equal(students.length, 1);
  assert.equal(students[0].classes, 0);
  assert.equal(students[0].slots, 0);
  assert.deepEqual(students[0].batches, [{ id: 'B1', name: 'Batch One' }]);
});

test('a student on both a class roster and a batch is merged into one entry', () => {
  const map = new Map();
  const blank = (id, name) => ({ id, name: name || '', classes: 0, slots: 0, batches: [] });

  // From the class roster.
  const cur = blank('S1', 'Alice');
  cur.classes = 2;
  map.set('S1', cur);

  // Same student also in a batch.
  const st = { id: 'S1', name: 'Alice', batches: [{ id: 'B1', name: 'Batch One' }] };
  const existing = map.get(st.id) || blank(st.id, st.name);
  st.batches.forEach((b) => {
    if (!existing.batches.some((x) => x.id === b.id)) existing.batches.push(b);
  });
  map.set(st.id, existing);

  const students = [...map.values()];
  assert.equal(students.length, 1, 'must not appear twice');
  assert.equal(students[0].classes, 2, 'class count preserved');
  assert.equal(students[0].batches.length, 1, 'batch attached to the same entry');
});
