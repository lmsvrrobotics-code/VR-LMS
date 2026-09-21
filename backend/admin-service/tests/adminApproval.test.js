// Tests the root-admin approval gate.
//
// A newly created admin can sign in but has no dashboard until the root admin
// approves them ("Give Access" on /admin/admins, which sets is_root_admin).
// Until then every adminOnly API answers 403 ADMIN_APPROVAL_REQUIRED and the
// UI replaces the whole surface with a notice (AdminLayout).
//
// Two things must keep working for an unapproved admin, or they are trapped:
// /auth/me (the UI reads its own is_root_admin to decide what to render) and
// /auth/logout. Those use adminAuthed, which skips the approval check.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isApprovedAdmin, APPROVAL_REQUIRED } = require('../src/middlewares/auth');

test('the seeded root admin is approved', () => {
    assert.equal(isApprovedAdmin({ role: 'root' }), true);
});

test('an admin granted access via the stored flag is approved', () => {
    assert.equal(isApprovedAdmin({ role: 'admin', is_root_admin: true }), true);
});

test('a freshly created admin is NOT approved', () => {
    assert.equal(isApprovedAdmin({ role: 'admin' }), false);
});

test('is_root_admin false is not approval', () => {
    assert.equal(isApprovedAdmin({ role: 'admin', is_root_admin: false }), false);
});

test('a truthy-but-not-true flag is not accepted as approval', () => {
    // Guards against a string '0'/'false' from a loosely-typed source reading
    // as approval.
    assert.equal(isApprovedAdmin({ role: 'admin', is_root_admin: 'false' }), false);
    assert.equal(isApprovedAdmin({ role: 'admin', is_root_admin: 1 }), false);
});

test('a Supabase-authenticated admin is not caught by the gate', () => {
    // Supabase tokens carry no is_root_admin claim — their admin role comes
    // from loadProfile. Gating them would lock out accounts that were never
    // part of this approval flow.
    assert.equal(isApprovedAdmin({ role: 'admin', supabaseUid: 'uid-123' }), true);
});

test('the approval code is distinct so the UI can tell it from a plain 403', () => {
    assert.equal(APPROVAL_REQUIRED, 'ADMIN_APPROVAL_REQUIRED');
});

// --- the gate as adminOnly applies it ---------------------------------------

const runGate = (user) => {
    let status;
    let body;
    let passed = false;
    const res = {
        status(code) { status = code; return this; },
        json(payload) { body = payload; return this; },
    };
    // Mirrors adminOnly's checks, with auth() already satisfied.
    if (user?.role !== 'admin' && user?.role !== 'root') {
        res.status(403).json({ error: 'Forbidden - Admin only' });
    } else if (!isApprovedAdmin(user)) {
        res.status(403).json({
            error: 'Your admin access is pending approval by the root admin.',
            code: APPROVAL_REQUIRED,
        });
    } else {
        passed = true;
    }
    return { status, body, passed };
};

test('an unapproved admin is refused with the approval code', () => {
    const { status, body, passed } = runGate({ role: 'admin', email: 'new@example.com' });
    assert.equal(passed, false);
    assert.equal(status, 403);
    assert.equal(body.code, APPROVAL_REQUIRED);
    assert.match(body.error, /pending approval/i);
});

test('an approved admin passes the gate', () => {
    const { passed } = runGate({ role: 'admin', is_root_admin: true });
    assert.equal(passed, true);
});

test('the root admin passes the gate', () => {
    const { passed } = runGate({ role: 'root' });
    assert.equal(passed, true);
});

test('a non-admin is refused as before, without the approval code', () => {
    // A student/teacher hitting an admin API must still get the plain
    // "Admin only" 403 — they are not awaiting approval, they are not admins.
    const { status, body, passed } = runGate({ role: 'student' });
    assert.equal(passed, false);
    assert.equal(status, 403);
    assert.equal(body.code, undefined);
    assert.match(body.error, /Admin only/);
});

test('a teacher is refused by adminOnly without being told to seek approval', () => {
    const { body } = runGate({ role: 'teacher' });
    assert.equal(body.code, undefined, 'teachers are a separate cohort, not unapproved admins');
});
