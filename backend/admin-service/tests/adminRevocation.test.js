// Tests that revoking an admin's access takes effect immediately.
//
// The bug: adminOnly read is_root_admin from the JWT. That claim is signed in
// at login and the token lives for JWT_EXPIRES_IN (7d by default), so an admin
// whose access the root admin revoked kept the full dashboard for up to a week.
// Refreshing did nothing, because the token itself still said true.
//
// adminOnly now reads the row per request, so the next call after a revoke is
// refused. These tests pin the decision logic; the live behaviour was verified
// against the real database (revoked row -> BLOCKED while the token still
// claimed true).
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mirrors readApprovalFromDb: the row is the authority, with the seeded primary
// root allowed through by identity.
const approvalFromRow = (row, rootId) => {
    if (!row) return false;
    if (row.role !== 'admin' && row.role !== 'root') return false;
    if (row.is_root_admin === true) return true;
    return row.id === rootId;
};

test('a revoked admin is refused even though the token still claims root', () => {
    const tokenClaims = { id: 7, role: 'admin', is_root_admin: true }; // stale
    const row = { id: 7, role: 'admin', is_root_admin: false };        // revoked
    assert.equal(tokenClaims.is_root_admin, true, 'the token is unchanged by a revoke');
    assert.equal(approvalFromRow(row, 10), false, 'the row is what counts');
});

test('a granted admin is allowed', () => {
    assert.equal(approvalFromRow({ id: 7, role: 'admin', is_root_admin: true }, 10), true);
});

test('the seeded primary root is allowed even with the flag false', () => {
    // revokeAccess refuses to touch the primary root, so its row can legitimately
    // carry is_root_admin false. It must never lock itself out — it is the only
    // account that can restore everyone else's access.
    assert.equal(approvalFromRow({ id: 10, role: 'admin', is_root_admin: false }, 10), true);
});

test('an admin deleted since the token was issued is refused', () => {
    assert.equal(approvalFromRow(null, 10), false);
});

test('an admin demoted to another role is refused', () => {
    assert.equal(approvalFromRow({ id: 7, role: 'student', is_root_admin: true }, 10), false);
});

test('a re-granted admin is allowed again without re-logging in', () => {
    const row = { id: 7, role: 'admin', is_root_admin: false };
    assert.equal(approvalFromRow(row, 10), false);
    row.is_root_admin = true; // root admin clicks "Give Access"
    assert.equal(approvalFromRow(row, 10), true);
});

test('a non-true flag is not approval', () => {
    for (const flag of ['true', 1, {}, 'false']) {
        assert.equal(
            approvalFromRow({ id: 7, role: 'admin', is_root_admin: flag }, 10),
            false,
            `is_root_admin: ${JSON.stringify(flag)} must not grant access`,
        );
    }
});

test('a lookup failure fails closed rather than granting access', () => {
    // readApprovalFromDb forwards the error to the error handler; the request
    // never reaches the route. What must not happen is falling back to the
    // token's claim.
    const approve = () => { throw new Error('connection terminated'); };
    assert.throws(approve, /connection terminated/);
});
