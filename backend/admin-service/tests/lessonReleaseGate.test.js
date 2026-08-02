// Tests for the teacher-release gate: a batch student may only see lessons the
// teacher has explicitly released. The DB layer is stubbed (no network) by
// intercepting `sequelize.query` in the models module cache, so these run with
// `npm test` like every other unit test here.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// --- stub ../src/models before TeachingAssignmentService requires it ---------
const modelsPath = require.resolve('../src/models');
let queryHandler = () => [];
require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: { sequelize: { query: (sql, opts) => queryHandler(sql, opts) } },
};

const svcPath = require.resolve('../src/services/TeachingAssignmentService');
delete require.cache[svcPath];
const { visibleLessonIdsForStudent } = require(svcPath);

// Build a query handler from a scripted scenario. Each SQL statement is
// recognised by a distinctive fragment so the stub stays readable.
const scenario = ({ batchCount = 1, batches = [], releases = [], throwOn = null }) =>
    (sql, opts) => {
        if (throwOn && sql.includes(throwOn)) throw new Error('db down');
        if (sql.includes('FROM batches WHERE course_id')) return [{ n: batchCount }];
        if (sql.includes('FROM batch_members')) return batches;
        if (sql.includes('FROM batch_lesson_releases')) return releases;
        return [];
    };

beforeEach(() => { queryHandler = () => []; });

test('released lessons are visible to a batch student', async () => {
    queryHandler = scenario({
        batches: [{ unique_id: 'B1' }],
        releases: [{ lesson_id: 5 }, { lesson_id: 7 }],
    });
    const gate = await visibleLessonIdsForStudent(42, 'stu-1');
    assert.equal(gate.enforced, true);
    assert.equal(gate.rosterScoped, true);
    assert.deepEqual([...gate.lessonIds].sort(), [5, 7]);
});

test('un-released lessons stay hidden: member with zero releases sees nothing', async () => {
    queryHandler = scenario({ batches: [{ unique_id: 'B1' }], releases: [] });
    const gate = await visibleLessonIdsForStudent(42, 'stu-1');
    assert.equal(gate.enforced, true, 'gating must still apply');
    assert.equal(gate.lessonIds.size, 0);
});

test('a student in no batch of a batch-taught course sees nothing', async () => {
    queryHandler = scenario({ batches: [] });
    const gate = await visibleLessonIdsForStudent(42, 'outsider');
    assert.equal(gate.enforced, true);
    assert.equal(gate.rosterScoped, false);
    assert.equal(gate.lessonIds.size, 0);
});

test('anonymous request on a batch-taught course is fully locked', async () => {
    queryHandler = scenario({ releases: [{ lesson_id: 5 }] });
    const gate = await visibleLessonIdsForStudent(42, null);
    assert.equal(gate.enforced, true);
    assert.equal(gate.lessonIds.size, 0);
});

test('course taught through no batch is not release-gated', async () => {
    queryHandler = scenario({ batchCount: 0 });
    const gate = await visibleLessonIdsForStudent(42, 'stu-1');
    assert.equal(gate.enforced, false);
});

test('a DB failure fails CLOSED (locks everything, never opens the course)', async () => {
    queryHandler = scenario({ throwOn: 'FROM batch_members' });
    const gate = await visibleLessonIdsForStudent(42, 'stu-1');
    assert.equal(gate.enforced, true);
    assert.equal(gate.lessonIds.size, 0);
});

test('releases from several of the student\'s batches are unioned', async () => {
    queryHandler = scenario({
        batches: [{ unique_id: 'B1' }, { unique_id: 'B2' }],
        releases: [{ lesson_id: 1 }, { lesson_id: 2 }, { lesson_id: 3 }],
    });
    const gate = await visibleLessonIdsForStudent(42, 'stu-1');
    assert.deepEqual([...gate.lessonIds].sort(), [1, 2, 3]);
});

// --- the gate's output, fed through the real locking logic ------------------
const { computeGating } = require('../src/services/teachingLogic');

test('end-to-end: only released lessons stay unlocked in the player', () => {
    const all = [1, 2, 3, 4];
    const { lockedLessonIds, stripCurrent } = computeGating({
        visibleLessonIds: new Set([2]),
        freeLessonIds: [],          // release is the master gate
        allLessonIds: all,
        currentLessonId: 3,         // opening an un-released lesson directly
        alreadyLocked: [],
    });
    assert.deepEqual(lockedLessonIds.sort(), [1, 3, 4]);
    assert.equal(stripCurrent, true, 'video/attachment must be withheld');
});

test('end-to-end: opening a released lesson serves its media', () => {
    const { stripCurrent } = computeGating({
        visibleLessonIds: new Set([2]),
        freeLessonIds: [],
        allLessonIds: [1, 2, 3],
        currentLessonId: 2,
        alreadyLocked: [],
    });
    assert.equal(stripCurrent, false);
});
