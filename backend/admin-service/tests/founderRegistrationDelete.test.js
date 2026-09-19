// Tests for deleting a registration from the admin panel.
//
// Delete and "set status = cancelled" are deliberately different actions:
// cancelling keeps the row (and the person in the audit trail) while freeing
// the seat, whereas deleting erases them — for a duplicate, a test entry, or a
// data-removal request. Both free the seat, because the capacity count
// excludes cancelled rows and a deleted row is not counted at all.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stub = (modPath, exports) => {
    const resolved = require.resolve(modPath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let rows = [];
let destroyed = [];

const makeRow = (attrs) => ({
    ...attrs,
    destroy: async function () {
        destroyed.push(this.id);
        rows = rows.filter((r) => r.id !== this.id);
    },
    update: async function (patch) { Object.assign(this, patch); return this; },
});

stub('../src/models', {
    FounderMeeting: { findOne: async () => null, findAll: async () => [], update: async () => {},
        sequelize: { literal: (x) => x } },
    FounderMeetingRegistration: {
        findOne: async ({ where }) => rows.find((r) => r.id === Number(where.id)) || null,
        count: async () => rows.filter((r) => r.status !== 'cancelled').length,
    },
    AppSetting: { findOne: async () => null, findOrCreate: async () => [null, true] },
});
stub('../src/helpers/fileUploader', { upload: async () => null, removeFile: async () => {}, niceFileName: (n, e) => n + '.' + e });
stub('../src/services/FounderPosterSeed', { getDefaultPosterUrl: async () => '', setDefaultPosterUrl: async () => '', resetCache: () => {} });

const svcPath = require.resolve('../src/services/FounderMeetingService');
delete require.cache[svcPath];
const svc = require(svcPath);

beforeEach(() => {
    destroyed = [];
    rows = [
        makeRow({ id: 1, meeting_id: 9, name: 'Asha Rao', email: 'asha@example.com', status: 'registered' }),
        makeRow({ id: 2, meeting_id: 9, name: 'Bob Kumar', email: 'bob@example.com', status: 'registered' }),
    ];
});

test('deleting removes exactly that registration', async () => {
    await svc.removeRegistration(1);
    assert.deepEqual(destroyed, [1]);
    assert.deepEqual(rows.map((r) => r.id), [2], 'the other registrant must be untouched');
});

test('deleting reports success to the admin', async () => {
    const res = await svc.removeRegistration(1);
    assert.match(res.success, /deleted/i);
});

test('deleting frees the seat', async () => {
    // The capacity check counts non-cancelled rows, so a deleted row stops
    // occupying a place.
    const { FounderMeetingRegistration } = require('../src/models');
    assert.equal(await FounderMeetingRegistration.count(), 2);
    await svc.removeRegistration(1);
    assert.equal(await FounderMeetingRegistration.count(), 1);
});

test('deleting a registration that does not exist is a clear 404', async () => {
    await assert.rejects(
        () => svc.removeRegistration(999999),
        (e) => e.status === 404 && /not found/i.test(e.message),
    );
});

test('a failed lookup destroys nothing', async () => {
    await svc.removeRegistration(999999).catch(() => {});
    assert.deepEqual(destroyed, []);
    assert.equal(rows.length, 2);
});

test('a string id from the route params still resolves', async () => {
    // Express hands params through as strings; the lookup must coerce.
    await svc.removeRegistration('2');
    assert.deepEqual(destroyed, [2]);
});

test('deleting twice is a 404 the second time, not a silent success', async () => {
    await svc.removeRegistration(1);
    await assert.rejects(() => svc.removeRegistration(1), (e) => e.status === 404);
});

test('cancelling keeps the row while delete removes it', async () => {
    // The two admin actions must stay distinguishable.
    await svc.setRegistrationStatus(1, 'cancelled');
    assert.equal(rows.length, 2, 'cancelling must not delete');
    assert.equal(rows.find((r) => r.id === 1).status, 'cancelled');

    await svc.removeRegistration(2);
    assert.equal(rows.length, 1, 'deleting must remove');
});
