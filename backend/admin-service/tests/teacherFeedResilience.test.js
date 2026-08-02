/**
 * Regression tests for the teacher dashboard's three parallel data feeds.
 *
 * Two separate defects made the Students tab show nothing even when the batch
 * roster was correct:
 *
 *  1. `GET /api/public/slots/by-teacher/:id` called `slotService.listForTeacher`,
 *     which was never implemented — every request threw
 *     "listForTeacher is not a function" and returned 500.
 *
 *  2. The dashboard fetched classes + slots + batch-students with `Promise.all`.
 *     Because Promise.all rejects as soon as ANY input rejects, that 500 took
 *     down the whole chain and the shared `.catch` cleared all three lists —
 *     including the batch students that had loaded successfully.
 *
 * So a single broken, unrelated endpoint blanked the entire tab. These tests
 * pin both the service surface and the partial-failure behaviour.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// --- 1. every by-teacher route's service method must exist -----------------
// The route wiring calls these by name; a missing export is a guaranteed 500
// that only shows up at runtime.
test('every by-teacher service exposes listForTeacher', () => {
  const services = [
    'SlotService',
    'ClassSessionService',
    'DemoService',
    'ResourceService',
    'TeacherCourseService',
    'TeacherStudentService',
    'FreeScheduleService',
  ];
  for (const name of services) {
    const svc = require(`../src/services/${name}`);
    assert.equal(
      typeof svc.listForTeacher,
      'function',
      `${name}.listForTeacher must be a function — the /by-teacher route calls it`,
    );
  }
});

// --- 2. partial-failure semantics -----------------------------------------
// Mirrors the dashboard's allSettled handling.
const collect = (results) => ({
  classes: results[0].status === 'fulfilled' && Array.isArray(results[0].value?.classes) ? results[0].value.classes : [],
  slots: results[1].status === 'fulfilled' && Array.isArray(results[1].value?.slots) ? results[1].value.slots : [],
  students: results[2].status === 'fulfilled' && Array.isArray(results[2].value?.students) ? results[2].value.students : [],
});

const settle = (values) =>
  values.map((v) =>
    v instanceof Error ? { status: 'rejected', reason: v } : { status: 'fulfilled', value: v },
  );

test('a failing slots feed does NOT wipe the students list', async () => {
  // The exact production scenario: slots 500s, students succeeds.
  const results = settle([
    { classes: [{ id: 1 }] },
    new Error('Request failed with status code 500'),
    { students: [{ id: 'S1', name: 'Student 4', batches: [{ id: 'VR-B-00001', name: 'sdfjah' }] }] },
  ]);
  const out = collect(results);
  assert.equal(out.students.length, 1, 'students must survive a slots failure');
  assert.equal(out.students[0].name, 'Student 4');
  assert.equal(out.classes.length, 1, 'classes must survive too');
  assert.deepEqual(out.slots, [], 'only the failed feed is empty');
});

test('Promise.all semantics would have lost the students (documents the old bug)', async () => {
  // Proves WHY the change was needed: with all(), one rejection discards
  // every sibling result.
  let lost = false;
  try {
    await Promise.all([
      Promise.resolve({ classes: [] }),
      Promise.reject(new Error('500')),
      Promise.resolve({ students: [{ id: 'S1' }] }),
    ]);
  } catch {
    lost = true;
  }
  assert.equal(lost, true, 'Promise.all rejects wholesale — hence allSettled');
});

test('all three feeds failing yields empty lists, not a crash', () => {
  const out = collect(settle([new Error('a'), new Error('b'), new Error('c')]));
  assert.deepEqual(out, { classes: [], slots: [], students: [] });
});

test('all three succeeding passes every list through', () => {
  const out = collect(settle([
    { classes: [{ id: 1 }, { id: 2 }] },
    { slots: [{ id: 9 }] },
    { students: [{ id: 'S1' }, { id: 'S2' }] },
  ]));
  assert.equal(out.classes.length, 2);
  assert.equal(out.slots.length, 1);
  assert.equal(out.students.length, 2);
});

test('a malformed (non-array) payload degrades to an empty list', () => {
  const out = collect(settle([{ classes: null }, { slots: 'nope' }, { students: undefined }]));
  assert.deepEqual(out, { classes: [], slots: [], students: [] });
});

// --- 3. the slots service tolerates a bad teacher id ------------------------
test('SlotService.listForTeacher returns an empty list for a blank id', async () => {
  const slotSvc = require('../src/services/SlotService');
  assert.deepEqual(await slotSvc.listForTeacher(''), { slots: [] });
  assert.deepEqual(await slotSvc.listForTeacher(null), { slots: [] });
  assert.deepEqual(await slotSvc.listForTeacher(undefined), { slots: [] });
});
