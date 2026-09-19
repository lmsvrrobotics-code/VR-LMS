// Tests for the "Mark as Complete" path: PlayerController.complete persists a
// LessonCompletion row for the verified student, and the in-memory history
// cache keys users the same way the DB does (a string), so a non-numeric id is
// not collapsed onto a shared NaN bucket.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let completionWrites = [];

stub('../src/models', {
    Course: { findByPk: async () => ({ id: 41 }) },
    Lesson: { findByPk: async () => ({ id: 87, lesson_type: 'quiz', duration: '0:10:0' }) },
    LessonCompletion: {
        findAll: async () => [],
        findOrCreate: async ({ where, defaults }) => {
            completionWrites.push({ where, defaults });
            return [defaults, true];
        },
    },
    UserProgress: { findOne: async () => null, findOrCreate: async () => [null, true] },
    LessonWatchProgress: { findAll: async () => [], findOrCreate: async () => [null, true] },
});

const storePath = require.resolve('../src/course-content/watchStore');
delete require.cache[storePath];
const watchStore = require(storePath);

const ctrlPath = require.resolve('../src/course-content/PlayerController');
delete require.cache[ctrlPath];
const ctrl = require(ctrlPath);

const mkRes = () => ({
    body: null, code: 200,
    json(o) { this.body = o; return o; },
    status(c) { this.code = c; return this; },
});
const mkReq = (over = {}) => ({ body: {}, headers: {}, query: {}, ...over });
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => { completionWrites = []; });

test('marking complete writes a completion row for the verified student', async () => {
    const res = mkRes();
    await ctrl.complete(
        mkReq({ body: { course_id: 41, lesson_id: 87 }, verifiedUserId: 'stu-1' }),
        res,
    );
    await settle();
    assert.equal(res.code, 200);
    assert.equal(completionWrites.length, 1);
    assert.equal(completionWrites[0].where.user_id, 'stu-1');
    assert.equal(completionWrites[0].where.lesson_id, 87);
});

test('a non-numeric user id survives to the write', async () => {
    const res = mkRes();
    await ctrl.complete(
        mkReq({ body: { course_id: 41, lesson_id: 87 }, verifiedUserId: 'VR20260701-01' }),
        res,
    );
    await settle();
    assert.notEqual(res.code, 401);
    assert.equal(completionWrites[0].where.user_id, 'VR20260701-01');
});

test('the verified id wins over a spoofed header', async () => {
    const res = mkRes();
    await ctrl.complete(
        mkReq({
            body: { course_id: 41, lesson_id: 87 },
            headers: { 'x-user-id': 'someone-else' },
            verifiedUserId: 'stu-real',
        }),
        res,
    );
    await settle();
    assert.equal(completionWrites[0].where.user_id, 'stu-real');
});

test('a request with no identity is rejected and writes nothing', async () => {
    const res = mkRes();
    await ctrl.complete(mkReq({ body: { course_id: 41, lesson_id: 87 } }), res);
    await settle();
    assert.equal(res.code, 401);
    assert.equal(completionWrites.length, 0);
});

test('missing ids are a 422', async () => {
    const res = mkRes();
    await ctrl.complete(mkReq({ body: { course_id: 41 }, verifiedUserId: 'stu-1' }), res);
    assert.equal(res.code, 422);
});

test('marking the same class twice is idempotent for the caller', async () => {
    // findOrCreate is the guard; a second call must not error or double-add.
    const res1 = mkRes();
    const res2 = mkRes();
    await ctrl.complete(mkReq({ body: { course_id: 41, lesson_id: 87 }, verifiedUserId: 'stu-2' }), res1);
    await ctrl.complete(mkReq({ body: { course_id: 41, lesson_id: 87 }, verifiedUserId: 'stu-2' }), res2);
    await settle();
    assert.equal(res1.code, 200);
    assert.equal(res2.code, 200);
    const hist = watchStore.getHistory(41, 'stu-2');
    assert.deepEqual(hist.completed_lesson, [87], 'the id must appear once, not twice');
});

// --- cache keying -----------------------------------------------------------

test('history is retrievable by the same non-numeric id it was stored under', async () => {
    // ensureHistory used Number(), which turned every non-numeric id into NaN
    // and collapsed unrelated students onto one shared history bucket.
    watchStore.markLessonComplete(41, 90, 'VR-AAA-01');
    watchStore.markLessonComplete(41, 91, 'VR-BBB-02');
    await settle();
    const a = watchStore.getHistory(41, 'VR-AAA-01');
    const b = watchStore.getHistory(41, 'VR-BBB-02');
    assert.deepEqual(a.completed_lesson, [90]);
    assert.deepEqual(b.completed_lesson, [91], 'students must not share a bucket');
});
