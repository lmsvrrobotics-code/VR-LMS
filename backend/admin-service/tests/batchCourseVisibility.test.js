/**
 * Regression tests for "a student/teacher added to a batch does not see the
 * batch's course in their dashboard".
 *
 * Two independent defects produced that one symptom, and both are guarded here.
 *
 * 1. PHANTOM COLUMN. Every batch-membership query joined
 *      ON bm.batch_id = b.unique_id OR bm.batch_id = b.batch_id
 *    but lms_admin.batches has NO `batch_id` column — only the varchar PK
 *    `unique_id` and the surrogate integer `id` added by migration 19. Postgres
 *    raised `column b.batch_id does not exist` for the WHOLE query, and because
 *    each of these readers is deliberately best-effort (catch → return []), the
 *    error was swallowed: coursesForStudent() returned [], so My Courses marked
 *    every batch course `locked`, and batchRowsForTeacher() returned [], so the
 *    teacher's course tab was empty. A silent-empty failure mode is why this
 *    looked like "batch adding is not working" rather than an error.
 *
 * 2. NaN BATCH KEY. The public course list coerced the member's batch key with
 *    Number(bm.batch_id). batch_members.batch_id holds the unique_id string
 *    ("VR-B-00001"), so that is NaN for every row; the id set came out empty and
 *    the catalogue was filtered down to nothing.
 *
 * These are string/scalar assertions on the shipped source + the filter logic,
 * so they need no database.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// Every reader that resolves batch membership in SQL.
const BATCH_SQL_READERS = [
  'services/TeachingAssignmentService.js',
  'services/TeacherCourseService.js',
  'services/TeacherStudentService.js',
  'services/StudentProgressService.js',
  'services/SlotService.js',
];

// The SQL these services run lives in backtick template literals. Only those
// are inspected: `b.batch_id` elsewhere in the file is JavaScript reading the
// SELECT alias `b.unique_id AS batch_id` off a result row, which is correct.
const sqlBlocks = (src) => (src.match(/`[\s\S]*?`/g) || [])
  .filter((b) => /\bFROM\b|\bJOIN\b/i.test(b));

test('no batch SQL references the non-existent batches.batch_id column', () => {
  for (const rel of BATCH_SQL_READERS) {
    const blocks = sqlBlocks(read(rel));
    assert.ok(blocks.length > 0, `${rel} should contain at least one SQL block`);
    for (const sql of blocks) {
      // Drop SQL line comments so prose about the old bug cannot fail this.
      const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      assert.ok(
        !/\bb\.batch_id\b/.test(code),
        `${rel} still joins on b.batch_id, a column lms_admin.batches does not have. ` +
          'The query raises and the best-effort catch hides it as "no courses".',
      );
    }
  }
});

test('batch membership joins on batches.unique_id, the key the FK actually holds', () => {
  const teaching = read('services/TeachingAssignmentService.js');
  // All three lookups (visible lessons, coursesForStudent, studentsForCourse).
  const joins = teaching.match(/ON b\.unique_id = bm\.batch_id/g) || [];
  assert.equal(joins.length, 3, 'all three batch lookups must join on unique_id');
});

test('the student course grant selects batches.course_id for active members only', () => {
  const teaching = read('services/TeachingAssignmentService.js');
  const q = teaching.slice(teaching.indexOf('coursesForStudent:'));
  assert.match(q, /SELECT DISTINCT b\.course_id/);
  assert.match(q, /bm\.status = 'active'/, 'a removed member must lose access');
  assert.match(q, /b\.course_id IS NOT NULL/, 'a course-less batch grants nothing');
});

// --- Defect 2: the course-list batch filter -------------------------------
//
// Mirrors the narrowing in PublicCourseService.list(): a course is visible when
// it is granted via batches.course_id, OR when courses.batch_ids (keyed by the
// batch's integer id) overlaps a batch the student belongs to.
const narrow = (rows, { grantedCourseIds = [], memberRows = [] }) => {
  const grantedIds = new Set(grantedCourseIds.map(Number));
  const studentBatchIds = new Set(
    memberRows.map((r) => Number(r.batch?.id)).filter((n) => Number.isFinite(n)),
  );
  return rows.filter((r) => {
    if (grantedIds.has(Number(r.id))) return true;
    const cb = Array.isArray(r.batch_ids) ? r.batch_ids : [];
    return cb.some((id) => studentBatchIds.has(Number(id)));
  });
};

test('a batch course with an empty batch_ids is still visible via the course_id grant', () => {
  // The live shape that broke: Add Batch writes batches.course_id but never
  // courses.batch_ids, so batch_ids stays [] and the old filter dropped it.
  const rows = [{ id: 46, batch_ids: [] }];
  const out = narrow(rows, { grantedCourseIds: [46], memberRows: [{ batch: { id: 1 } }] });
  assert.deepEqual(out.map((r) => r.id), [46]);
});

test('the varchar unique_id is never coerced to a batch id (the NaN bug)', () => {
  // A member row keyed only by the unique_id string contributes no integer id,
  // so batch_ids matching alone must not resurface the course...
  const rows = [{ id: 99, batch_ids: [7] }];
  assert.deepEqual(narrow(rows, { memberRows: [{ batch: null }] }), []);
  // ...while the joined integer id does match.
  const out = narrow(rows, { memberRows: [{ batch: { id: 7 } }] });
  assert.deepEqual(out.map((r) => r.id), [99]);
});

test('a course the student has no batch for stays hidden', () => {
  const rows = [{ id: 1, batch_ids: [5] }, { id: 2, batch_ids: [] }];
  assert.deepEqual(narrow(rows, { grantedCourseIds: [], memberRows: [{ batch: { id: 9 } }] }), []);
});

test('the course-list filter resolves grants through coursesForStudent', () => {
  const src = read('course-content/PublicCourseService.js');
  const body = src.slice(src.indexOf('const list = '), src.indexOf('const detailsBySlug'));
  assert.match(body, /teachingSvc\.coursesForStudent\(uid\)/,
    'the catalogue must use the same grant My Courses uses, so the two cannot disagree');
  assert.ok(
    !/Number\(r\.batch_id\)/.test(body),
    'coercing the varchar unique_id to a number yields NaN and empties the catalogue',
  );
});

test('My Courses unlocks exactly the enrolled ∪ batch-delegated set', () => {
  // Mirrors myCoursesUncached: unlockedIds = enrolled ∪ delegated, and
  // is_marketing is always open.
  const unlock = ({ enrolled = [], delegated = [] }, course) => {
    const ids = new Set([...enrolled.map(Number), ...delegated.map(Number)]);
    return ids.has(Number(course.id)) || !!course.is_marketing;
  };
  assert.equal(unlock({ delegated: [46] }, { id: 46 }), true, 'batch member must be unlocked');
  assert.equal(unlock({ delegated: [] }, { id: 46 }), false, 'non-member stays locked');
  assert.equal(unlock({ delegated: [] }, { id: 46, is_marketing: true }), true);
});
