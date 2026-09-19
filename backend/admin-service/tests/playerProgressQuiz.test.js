// Tests for PlayerController.progress — the endpoint behind both the watched
// high-water mark and the "Last opened" stamp.
//
// Two things this locks down:
//   1. a quiz is completed by SUBMITTING it, never by elapsed time. Its
//      `duration` is the time limit, not content length, so the drip rules
//      would otherwise mark it done just for being opened.
//   2. user ids are VARCHAR and often non-numeric; the old Number() coercion
//      401'd those students out of recording their own progress.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let courseRow = null;
let lessonRow = null;
let upserts = [];

stub('../src/models', {
    Course: { findByPk: async () => courseRow },
    Lesson: { findByPk: async () => lessonRow },
});
stub('../src/course-content/watchStore', {
    upsertDuration: (courseId, lessonId, userId, seconds) => {
        upserts.push({ courseId, lessonId, userId, seconds });
        return { current_duration: seconds };
    },
    markLessonComplete: () => null,
    getHistory: () => null,
});
stub('../src/course-content/mockData', {
    markLessonComplete: () => null,
});

const ctrlPath = require.resolve('../src/course-content/PlayerController');
delete require.cache[ctrlPath];
const ctrl = require(ctrlPath);

// Minimal express-ish req/res doubles.
const mkRes = () => ({
    body: null, code: 200,
    json(o) { this.body = o; return o; },
    status(c) { this.code = c; return this; },
});
const mkReq = (over = {}) => ({
    body: {}, headers: {}, query: {}, ...over,
});

const DRIP_DURATION = {
    enable_drip_content: true,
    drip_content_settings: JSON.stringify({
        lesson_completion_role: 'duration', minimum_duration: 5,
    }),
};

beforeEach(() => {
    upserts = [];
    courseRow = { id: 41, ...DRIP_DURATION };
    lessonRow = { id: 87, lesson_type: 'quiz', duration: '0:10:0' };
});

// --- quizzes never auto-complete -------------------------------------------

test('opening a quiz stamps progress but does not complete it', async () => {
    const res = mkRes();
    await ctrl.progress(
        mkReq({ body: { course_id: 41, lesson_id: 87, current_duration: 0 }, verifiedUserId: 'stu-1' }),
        res,
    );
    assert.equal(res.body.is_completed, 0, 'a quiz must not complete on open');
    assert.equal(upserts.length, 1, 'the open must still be recorded');
});

test('a long dwell on a quiz still does not complete it', async () => {
    // 600s clears every drip threshold; only submission may complete a quiz.
    const res = mkRes();
    await ctrl.progress(
        mkReq({ body: { course_id: 41, lesson_id: 87, current_duration: 600 }, verifiedUserId: 'stu-1' }),
        res,
    );
    assert.equal(res.body.is_completed, 0);
});

test('the quiz guard holds under percentage drip too', async () => {
    courseRow = {
        id: 41,
        enable_drip_content: true,
        drip_content_settings: JSON.stringify({
            lesson_completion_role: 'percentage', minimum_percentage: '30',
        }),
    };
    const res = mkRes();
    await ctrl.progress(
        mkReq({ body: { course_id: 41, lesson_id: 87, current_duration: 600 }, verifiedUserId: 'stu-1' }),
        res,
    );
    assert.equal(res.body.is_completed, 0);
});

test('a non-quiz lesson still completes on the drip rule', async () => {
    // Guards against the quiz check accidentally disabling completion overall.
    lessonRow = { id: 86, lesson_type: 'video-url', duration: '00:01:00' };
    const res = mkRes();
    await ctrl.progress(
        mkReq({ body: { course_id: 41, lesson_id: 86, current_duration: 30 }, verifiedUserId: 'stu-1' }),
        res,
    );
    assert.equal(res.body.is_completed, 1, 'a video past the minimum must complete');
});

// --- user id handling -------------------------------------------------------

test('a non-numeric user id is accepted, not rejected as unidentified', async () => {
    const res = mkRes();
    await ctrl.progress(
        mkReq({ body: { course_id: 41, lesson_id: 87, current_duration: 0 }, verifiedUserId: 'VR20260701-01' }),
        res,
    );
    assert.notEqual(res.code, 401);
    assert.equal(upserts[0].userId, 'VR20260701-01');
});

test('the verified id wins over a spoofed x-user-id header', async () => {
    const res = mkRes();
    await ctrl.progress(
        mkReq({
            body: { course_id: 41, lesson_id: 87, current_duration: 0 },
            headers: { 'x-user-id': 'someone-else' },
            verifiedUserId: 'stu-real',
        }),
        res,
    );
    assert.equal(upserts[0].userId, 'stu-real');
});

test('a request with no identity at all is rejected', async () => {
    const res = mkRes();
    await ctrl.progress(
        mkReq({ body: { course_id: 41, lesson_id: 87, current_duration: 0 } }),
        res,
    );
    assert.equal(res.code, 401);
    assert.equal(upserts.length, 0, 'nothing may be written for an unknown user');
});

test('missing course_id or lesson_id is a 422', async () => {
    const res = mkRes();
    await ctrl.progress(mkReq({ body: { lesson_id: 87 }, verifiedUserId: 'stu-1' }), res);
    assert.equal(res.code, 422);
});
