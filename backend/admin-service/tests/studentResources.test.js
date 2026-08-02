// Unit tests for the student-facing Materials visibility rules. Pure functions,
// no DB, no network — run with:  npm test   (alias for `node --test`).
//
// The security-critical rule under test: a student may only see resources
// attached to a course they are actually enrolled in / delegated to.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isVisibleToStudent,
    sanitizeForStudent,
    bySortOrder,
    groupBySection,
    buildStudentResources,
    UNSECTIONED,
} = require('../src/services/studentResourcesLogic');

const enrolled = new Set([10, 11]);

// --- isVisibleToStudent -----------------------------------------------------

test('isVisibleToStudent: resource on an enrolled course is visible', () => {
    assert.equal(isVisibleToStudent({ status: 1, course_id: 10 }, enrolled), true);
});

// THE regression this feature must never introduce: materials from a course the
// student is not enrolled in must never leak into their dashboard.
test('isVisibleToStudent: resource on a NON-enrolled course is hidden', () => {
    assert.equal(isVisibleToStudent({ status: 1, course_id: 99 }, enrolled), false);
});

test('isVisibleToStudent: inactive resources are hidden even on an enrolled course', () => {
    assert.equal(isVisibleToStudent({ status: 0, course_id: 10 }, enrolled), false);
});

// Library rows predate course scoping and carry no course_id, so there is no
// enrollment relationship that could authorise a student to read them.
test('isVisibleToStudent: resource with no course_id is hidden from students', () => {
    assert.equal(isVisibleToStudent({ status: 1, course_id: null }, enrolled), false);
    assert.equal(isVisibleToStudent({ status: 1 }, enrolled), false);
});

test('isVisibleToStudent: malformed rows are hidden, not thrown on', () => {
    assert.equal(isVisibleToStudent(null, enrolled), false);
    assert.equal(isVisibleToStudent({ status: 1, course_id: 'abc' }, enrolled), false);
    assert.equal(isVisibleToStudent({ status: 1, course_id: 0 }, enrolled), false);
    assert.equal(isVisibleToStudent({ status: 1, course_id: -5 }, enrolled), false);
});

test('isVisibleToStudent: no enrolled courses means nothing is visible', () => {
    assert.equal(isVisibleToStudent({ status: 1, course_id: 10 }, new Set()), false);
});

// --- sanitizeForStudent -----------------------------------------------------

// teacher_ids names every teacher a resource is assigned to. That is internal
// routing data and must not ship to students.
test('sanitizeForStudent: strips teacher_ids, status and sort_order', () => {
    const out = sanitizeForStudent({
        id: 1, title: 'Lesson Plan', description: 'd', files: [{ name: 'a.pdf', url: 'u' }],
        course_id: 10, resource_category_id: 2, section: 'Plans',
        teacher_ids: ['T1', 'T2'], status: 1, sort_order: 3,
    });
    assert.equal(out.teacher_ids, undefined);
    assert.equal(out.status, undefined);
    assert.equal(out.sort_order, undefined);
    assert.equal(out.title, 'Lesson Plan');
    assert.deepEqual(out.files, [{ name: 'a.pdf', url: 'u' }]);
});

test('sanitizeForStudent: files defaults to an array when missing or malformed', () => {
    assert.deepEqual(sanitizeForStudent({ id: 1, files: null }).files, []);
    assert.deepEqual(sanitizeForStudent({ id: 1, files: 'nope' }).files, []);
    assert.deepEqual(sanitizeForStudent({ id: 1 }).files, []);
});

test('sanitizeForStudent: resolves category and course display names', () => {
    const out = sanitizeForStudent(
        { id: 1, course_id: 10, resource_category_id: 2 },
        { categoryName: 'Visual Aids', courseTitle: 'Intro to VR' }
    );
    assert.equal(out.category_name, 'Visual Aids');
    assert.equal(out.course_title, 'Intro to VR');
});

// --- bySortOrder ------------------------------------------------------------

test('bySortOrder: ascending sort_order, then newest id first', () => {
    const rows = [
        { id: 1, sort_order: 2 },
        { id: 2, sort_order: 1 },
        { id: 3, sort_order: 1 },
    ];
    assert.deepEqual([...rows].sort(bySortOrder).map((r) => r.id), [3, 2, 1]);
});

test('bySortOrder: missing sort_order is treated as 0', () => {
    const rows = [{ id: 1, sort_order: 5 }, { id: 2 }];
    assert.deepEqual([...rows].sort(bySortOrder).map((r) => r.id), [2, 1]);
});

// --- groupBySection ---------------------------------------------------------

test('groupBySection: groups resources under their section header', () => {
    const out = groupBySection([
        { id: 1, section: 'Plans' },
        { id: 2, section: 'Aids' },
        { id: 3, section: 'Plans' },
    ]);
    assert.deepEqual(out.map((s) => s.section), ['Plans', 'Aids']);
    assert.deepEqual(out[0].resources.map((r) => r.id), [1, 3]);
});

// Mirrors groupCurriculum's defensive choice for lessons: never silently drop.
test('groupBySection: sectionless resources land in a catch-all', () => {
    const out = groupBySection([{ id: 1, section: null }, { id: 2, section: '' }]);
    assert.equal(out.length, 1);
    assert.equal(out[0].section, UNSECTIONED);
    assert.deepEqual(out[0].resources.map((r) => r.id), [1, 2]);
});

// --- buildStudentResources (full pipeline) ----------------------------------

test('buildStudentResources: returns only enrolled-course resources, shaped and grouped', () => {
    const rows = [
        { id: 1, title: 'Mine', status: 1, course_id: 10, sort_order: 1, section: 'Plans', files: [], teacher_ids: ['T1'] },
        { id: 2, title: 'Not mine', status: 1, course_id: 99, sort_order: 1, section: 'Plans', files: [] },
        { id: 3, title: 'Inactive', status: 0, course_id: 10, sort_order: 1, section: 'Plans', files: [] },
        { id: 4, title: 'Library', status: 1, course_id: null, sort_order: 1, files: [] },
    ];
    const out = buildStudentResources(rows, [10, 11], {
        courseTitles: new Map([[10, 'Intro to VR']]),
    });

    assert.deepEqual(out.resources.map((r) => r.title), ['Mine']);
    assert.equal(out.resources[0].course_title, 'Intro to VR');
    assert.equal(out.resources[0].teacher_ids, undefined);
    assert.deepEqual(out.sections.map((s) => s.section), ['Plans']);
});

test('buildStudentResources: a student with no enrolled courses sees nothing', () => {
    const rows = [{ id: 1, title: 'X', status: 1, course_id: 10, files: [] }];
    const out = buildStudentResources(rows, []);
    assert.deepEqual(out.resources, []);
    assert.deepEqual(out.sections, []);
});

test('buildStudentResources: tolerates empty and missing inputs', () => {
    assert.deepEqual(buildStudentResources([], [10]).resources, []);
    assert.deepEqual(buildStudentResources(null, null).resources, []);
    assert.deepEqual(buildStudentResources(undefined, [10]).sections, []);
});

test('buildStudentResources: string course ids from JSON still match', () => {
    const rows = [{ id: 1, title: 'X', status: 1, course_id: '10', files: [] }];
    const out = buildStudentResources(rows, ['10']);
    assert.deepEqual(out.resources.map((r) => r.id), [1]);
});
