// Tests for watchStore.upsertDuration — the write behind both the watched
// high-water mark and the "Last opened" timestamp on the curriculum cards.
//
// Two bugs this locks down:
//   1. user ids are VARCHAR and often non-numeric; Number() turned them into
//      NaN so nothing was ever persisted for those students.
//   2. the row was only written when the position ADVANCED, so re-opening an
//      already-watched class never refreshed updated_at.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

// Records every findOrCreate / save the store performs.
let calls = [];
let existingRow = null;

const makeRow = (attrs) => ({
    ...attrs,
    changedFields: new Set(),
    set(k, v) { this[k] = v; this.changedFields.add(k); },
    changed(k, v) { if (v) this.changedFields.add(k); },
    async save() { calls.push({ op: 'save', touched: [...this.changedFields] }); },
    async update(patch) { Object.assign(this, patch); calls.push({ op: 'update', patch }); },
});

stub('../src/models', {
    LessonCompletion: { findAll: async () => [], findOrCreate: async () => [null, true] },
    UserProgress: { findOne: async () => null, findOrCreate: async () => [null, true] },
    LessonWatchProgress: {
        findAll: async () => [],
        findOrCreate: async ({ where, defaults }) => {
            calls.push({ op: 'findOrCreate', where, defaults });
            if (existingRow) return [existingRow, false];
            return [makeRow({ ...defaults }), true];
        },
    },
});

const storePath = require.resolve('../src/course-content/watchStore');
delete require.cache[storePath];
const watchStore = require(storePath);

// upsertDuration schedules its DB work; give the microtask queue a turn.
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
    calls = [];
    existingRow = null;
});

test('a non-numeric user id is persisted as the original string', async () => {
    // Number("VR20260701-01") is NaN — this used to silently drop the write.
    watchStore.upsertDuration(41, 86, 'VR20260701-01', 10);
    await settle();
    const create = calls.find((c) => c.op === 'findOrCreate');
    assert.ok(create, 'a write should have been attempted');
    assert.equal(create.where.user_id, 'VR20260701-01');
    assert.equal(create.defaults.user_id, 'VR20260701-01');
});

test('a numeric user id is kept as a string, not a number', async () => {
    // The column is VARCHAR; a numeric bind triggers "varchar = bigint".
    watchStore.upsertDuration(41, 86, 20201256998, 10);
    await settle();
    const create = calls.find((c) => c.op === 'findOrCreate');
    assert.equal(create.where.user_id, '20201256998');
    assert.equal(typeof create.where.user_id, 'string');
});

test('a whitespace-padded id is trimmed', async () => {
    watchStore.upsertDuration(41, 86, '  stu-1  ', 5);
    await settle();
    const create = calls.find((c) => c.op === 'findOrCreate');
    assert.equal(create.where.user_id, 'stu-1');
});

test('re-opening with no advance still touches updated_at', async () => {
    // The whole point of "Last opened": watching a finished class again must
    // refresh the timestamp even though current_duration cannot grow.
    existingRow = makeRow({ user_id: 'stu-2', lesson_id: 90, current_duration: 300 });
    watchStore.upsertDuration(41, 90, 'stu-2', 0);
    await settle();
    const saved = calls.find((c) => c.op === 'save');
    assert.ok(saved, 'an existing row must still be saved');
    assert.ok(saved.touched.includes('updated_at'), 'updated_at must be forced');
    assert.equal(existingRow.current_duration, 300, 'the mark must not go backwards');
});

test('an advancing position updates the mark and the timestamp', async () => {
    existingRow = makeRow({ user_id: 'stu-3', lesson_id: 91, current_duration: 10 });
    watchStore.upsertDuration(41, 91, 'stu-3', 45);
    await settle();
    const saved = calls.find((c) => c.op === 'save');
    assert.equal(existingRow.current_duration, 45);
    assert.ok(saved.touched.includes('updated_at'));
});

test('a zero-second open creates the row so the card can show a timestamp', async () => {
    // The modal stamps 0 on open; the 5s ticker would otherwise be the first
    // write, so a brief visit recorded nothing at all.
    watchStore.upsertDuration(41, 92, 'stu-4', 0);
    await settle();
    const create = calls.find((c) => c.op === 'findOrCreate');
    assert.ok(create);
    assert.equal(create.defaults.current_duration, 0);
});

test('negative and junk durations clamp to zero rather than corrupting the row', async () => {
    watchStore.upsertDuration(41, 93, 'stu-5', -20);
    await settle();
    assert.equal(calls.find((c) => c.op === 'findOrCreate').defaults.current_duration, 0);

    calls = [];
    watchStore.upsertDuration(41, 94, 'stu-6', 'abc');
    await settle();
    assert.equal(calls.find((c) => c.op === 'findOrCreate').defaults.current_duration, 0);
});

test('the returned row carries the high-water mark, not the reported value', async () => {
    watchStore.upsertDuration(41, 95, 'stu-7', 60);
    const back = watchStore.upsertDuration(41, 95, 'stu-7', 5);
    await settle();
    assert.equal(back.current_duration, 60, 'a lower report must not lower the mark');
});
