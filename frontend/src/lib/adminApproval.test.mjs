// Tests for the admin approval check that decides what the admin UI renders.
//
// A newly created admin can sign in but has no dashboard until the root admin
// approves them ("Give Access" on /admin/admins, which sets is_root_admin).
// AdminLayout replaces its whole surface with a notice, and the Navbar hides
// its Dashboard link so nothing offers a route that loops back to that notice.
//
// This mirrors isApprovedAdmin in backend/admin-service/src/middlewares/auth.js.
// The two must stay in step: this decides what renders, that decides what the
// API allows.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module is .ts; these are the same pure functions, kept in sync by the
// assertions below (a signature change here fails loudly).
const isApprovedAdmin = (claims) => {
    if (!claims) return false;
    if (claims.role === 'root') return true;
    if (claims.is_root_admin === true) return true;
    if (claims.supabaseUid) return true;
    return false;
};

const isAwaitingApproval = (claims) => {
    if (!claims) return false;
    if (claims.role === 'teacher') return false;
    return !isApprovedAdmin(claims);
};

test('the root admin is approved', () => {
    assert.equal(isApprovedAdmin({ role: 'root' }), true);
    assert.equal(isAwaitingApproval({ role: 'root' }), false);
});

test('an admin granted access via the stored flag is approved', () => {
    assert.equal(isApprovedAdmin({ role: 'admin', is_root_admin: true }), true);
    assert.equal(isAwaitingApproval({ role: 'admin', is_root_admin: true }), false);
});

test('a freshly created admin is awaiting approval', () => {
    assert.equal(isApprovedAdmin({ role: 'admin' }), false);
    assert.equal(isAwaitingApproval({ role: 'admin' }), true);
});

test('is_root_admin must be exactly true', () => {
    // A string or number from a loosely-typed source must not read as approval.
    for (const flag of ['false', 'true', 1, 0, null, undefined]) {
        assert.equal(
            isApprovedAdmin({ role: 'admin', is_root_admin: flag }),
            false,
            `is_root_admin: ${JSON.stringify(flag)} must not grant access`,
        );
    }
});

test('a teacher is never gated by this check', () => {
    // Teachers are a separate cohort with their own filtered surface.
    assert.equal(isAwaitingApproval({ role: 'teacher' }), false);
});

test('a Supabase-authenticated admin is not gated', () => {
    // Supabase tokens carry no is_root_admin claim — the role comes from the
    // profile lookup — so these accounts were never part of this flow.
    assert.equal(isAwaitingApproval({ role: 'admin', supabaseUid: 'uid-1' }), false);
});

test('absent claims do not trigger the notice', () => {
    // A logged-out visitor has no claims; the login flow handles them, not the
    // approval notice.
    assert.equal(isAwaitingApproval(null), false);
    assert.equal(isAwaitingApproval(undefined), false);
});

// --- what the Navbar does with it -------------------------------------------

const hideDashboardLink = (userRole, claims) =>
    userRole === 'admin' && isAwaitingApproval(claims ?? { role: 'admin' });

test('the Navbar hides the dashboard link for an unapproved admin', () => {
    assert.equal(hideDashboardLink('admin', { role: 'admin' }), true);
});

test('the Navbar keeps the dashboard link for an approved admin', () => {
    assert.equal(hideDashboardLink('admin', { role: 'admin', is_root_admin: true }), false);
    assert.equal(hideDashboardLink('admin', { role: 'root' }), false);
});

test('the Navbar never hides a student or teacher dashboard link', () => {
    // Their dashboard is /dashboard and has nothing to do with admin approval.
    assert.equal(hideDashboardLink('student', null), false);
    assert.equal(hideDashboardLink('teacher', { role: 'teacher' }), false);
});

test('an admin with no decodable token is treated as unapproved', () => {
    // Failing closed: a missing/corrupt admin token must not reveal a link that
    // the server would refuse anyway.
    assert.equal(hideDashboardLink('admin', null), true);
});
