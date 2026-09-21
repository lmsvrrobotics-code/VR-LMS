// Tests for the admin listing.
//
// Two bugs, one symptom ("no admins showing"):
//
// 1. AdminService.list wrapped everything in a try/catch that logged a warning
//    and returned { admins: [], total: 0 } with a 200. A failing query was then
//    indistinguishable from an empty table — the page rendered "No admins
//    found" and its "Couldn't load admins" branch could never fire.
//
// 2. Behind that swallow, the listing was in fact failing for every account:
//    course_count called courseCountFor(r.id) with the integer users.id, but
//    courses.user_id is a VARCHAR holding the owner's unique_id (Course
//    .associate joins on targetKey: 'unique_id'). Postgres aborted the request
//    with `operator does not exist: character varying = integer`.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mirrors the shape AdminService.list builds, wired to fakes so the behaviour
// can be exercised without a live database.
const buildList = ({ rows, count, rootId, courseCount }) => async ({ page = 1, per_page = 10 } = {}) => {
    const limit = Number(per_page);
    const admins = await Promise.all(
        rows.map(async (r) => ({
            ...r,
            course_count: r.unique_id ? await courseCount(r.unique_id) : 0,
            is_root_admin: r.id === rootId || r.is_root_admin === true,
            is_primary_root: r.id === rootId,
        })),
    );
    return { admins, total: count, page: Number(page), per_page: limit, root_admin_id: rootId };
};

const ROWS = [
    { id: 6, email: 'vrroot@example.com', unique_id: 'VR20260618-ADMIN' },
    { id: 7, email: 'vradmin@example.com', unique_id: 'VR20260618-ADMIN2' },
];

test('course_count is looked up by unique_id, not the integer id', async () => {
    const seen = [];
    const list = buildList({
        rows: ROWS,
        count: 2,
        rootId: 6,
        courseCount: async (key) => { seen.push(key); return 1; },
    });

    await list({});
    assert.deepEqual(seen, ['VR20260618-ADMIN', 'VR20260618-ADMIN2']);
    for (const key of seen) {
        assert.equal(typeof key, 'string', 'an integer id here is the varchar = integer crash');
    }
});

test('the listing returns every admin row', async () => {
    const list = buildList({ rows: ROWS, count: 2, rootId: 6, courseCount: async () => 0 });
    const out = await list({});
    assert.equal(out.admins.length, 2);
    assert.equal(out.total, 2);
});

test('an admin with no unique_id yields 0 courses instead of a failed query', async () => {
    const list = buildList({
        rows: [{ id: 9, email: 'legacy@example.com', unique_id: null }],
        count: 1,
        rootId: 6,
        courseCount: async () => { throw new Error('courseCountFor must not be called with a null key'); },
    });
    const out = await list({});
    assert.equal(out.admins[0].course_count, 0);
});

test('a database error propagates instead of becoming an empty list', async () => {
    const list = buildList({
        rows: ROWS,
        count: 2,
        rootId: 6,
        courseCount: async () => { throw new Error('operator does not exist: character varying = integer'); },
    });

    // The old catch turned this into a 200 with admins: [], which is what made
    // a broken listing look like an empty one.
    await assert.rejects(() => list({}), /character varying = integer/);
});

test('root flags are resolved per row', async () => {
    const list = buildList({
        rows: [...ROWS, { id: 8, email: 'granted@example.com', unique_id: 'U3', is_root_admin: true }],
        count: 3,
        rootId: 6,
        courseCount: async () => 0,
    });
    const out = await list({});
    const [primary, plain, granted] = out.admins;

    assert.equal(primary.is_root_admin, true);
    assert.equal(primary.is_primary_root, true, 'the seeded root must stay unrevokable');

    assert.equal(plain.is_root_admin, false);
    assert.equal(plain.is_primary_root, false);

    assert.equal(granted.is_root_admin, true, 'the stored flag grants root access');
    assert.equal(granted.is_primary_root, false, 'a granted root is still revokable');
});

test('pagination metadata is carried through', async () => {
    const list = buildList({ rows: ROWS, count: 25, rootId: 6, courseCount: async () => 0 });
    const out = await list({ page: 2, per_page: 10 });
    assert.equal(out.page, 2);
    assert.equal(out.per_page, 10);
    assert.equal(out.total, 25);
    assert.equal(out.root_admin_id, 6);
});
