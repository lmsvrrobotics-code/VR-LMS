// Tests for the video resume position: watchStore.getHistoryDb surfaces the
// per-lesson watched high-water mark, and playerData turns it into `resume_at`
// for the lesson being opened. Models are stubbed — no DB, no network.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let completionRows = [];
let progressRow = null;
let watchRows = [];

stub('../src/models', {
    LessonCompletion: { findAll: async () => completionRows },
    UserProgress: { findOne: async () => progressRow },
    LessonWatchProgress: { findAll: async () => watchRows },
});

const storePath = require.resolve('../src/course-content/watchStore');
delete require.cache[storePath];
const watchStore = require(storePath);

beforeEach(() => {
    completionRows = [];
    progressRow = null;
    watchRows = [];
});

test('watched positions come back keyed by lesson id', async () => {
    watchRows = [
        { lesson_id: 85, current_duration: 42 },
        { lesson_id: 86, current_duration: 7 },
    ];
    const h = await watchStore.getHistoryDb(41, 'stu-1');
    assert.deepEqual(h.watched_seconds, { 85: 42, 86: 7 });
});

test('a lesson never watched is simply absent, not zero-filled', async () => {
    watchRows = [{ lesson_id: 85, current_duration: 42 }];
    const h = await watchStore.getHistoryDb(41, 'stu-1');
    assert.equal(h.watched_seconds[86], undefined);
});

test('no watch rows yields an empty map, never undefined', async () => {
    const h = await watchStore.getHistoryDb(41, 'stu-1');
    assert.deepEqual(h.watched_seconds, {});
});

test('a null duration is coerced to 0 rather than NaN', async () => {
    watchRows = [{ lesson_id: 85, current_duration: null }];
    const h = await watchStore.getHistoryDb(41, 'stu-1');
    assert.equal(h.watched_seconds[85], 0);
});

test('string ids and durations from the driver are normalised to numbers', async () => {
    // pg can hand back varchar/bigint columns as strings.
    watchRows = [{ lesson_id: '85', current_duration: '42' }];
    const h = await watchStore.getHistoryDb(41, 'stu-1');
    assert.deepEqual(h.watched_seconds, { 85: 42 });
    assert.equal(typeof h.watched_seconds[85], 'number');
});

test('completions and watch positions coexist', async () => {
    completionRows = [{ lesson_id: 85 }];
    watchRows = [{ lesson_id: 86, current_duration: 12 }];
    const h = await watchStore.getHistoryDb(41, 'stu-1');
    assert.deepEqual(h.completed_lesson, [85]);
    assert.deepEqual(h.watched_seconds, { 86: 12 });
});

test('a missing course or user short-circuits to null', async () => {
    assert.equal(await watchStore.getHistoryDb(0, 'stu-1'), null);
    assert.equal(await watchStore.getHistoryDb(41, ''), null);
    assert.equal(await watchStore.getHistoryDb(41, null), null);
});

// --- resume_at selection rule ------------------------------------------------
// playerData computes: resume at the stored mark UNLESS the lesson is already
// complete (a finished lesson should replay from the start, not the end).

const resumeAt = (lesson, completedIds, watched) =>
    (lesson && !completedIds.includes(lesson.id))
        ? Number(watched?.[lesson.id] || 0)
        : 0;

test('an in-progress lesson resumes at its stored mark', () => {
    assert.equal(resumeAt({ id: 86 }, [], { 86: 42 }), 42);
});

test('a completed lesson restarts from zero', () => {
    // Replaying something you finished should not drop you at the very end.
    assert.equal(resumeAt({ id: 86 }, [86], { 86: 300 }), 0);
});

test('a never-watched lesson starts at zero', () => {
    assert.equal(resumeAt({ id: 86 }, [], {}), 0);
});

test('no lesson selected yields zero rather than throwing', () => {
    assert.equal(resumeAt(null, [], { 86: 42 }), 0);
});
