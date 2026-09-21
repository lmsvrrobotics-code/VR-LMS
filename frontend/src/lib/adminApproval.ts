// Who may see the admin dashboard.
//
// A newly created admin can sign in but has no dashboard until the root admin
// approves them ("Give Access" on /admin/admins, which sets is_root_admin).
// Until then AdminLayout replaces the whole surface with a notice and the
// Navbar hides its Dashboard link, so nothing offers a route that only loops
// back to that notice.
//
// This is presentation only. The server enforces the same rule — adminOnly
// answers 403 ADMIN_APPROVAL_REQUIRED — so a hand-edited localStorage buys
// nothing but a broken-looking page.

export type AdminClaims = {
    role?: string | null;
    is_root_admin?: unknown;
    email?: string | null;
    supabaseUid?: string | null;
} | null | undefined;

// Decode a JWT payload without verifying it. Returns null for a malformed
// token. The admin-service signs is_root_admin / role / college_id into the
// token, so this is an authoritative fallback when the cached admin_user in
// localStorage is stale or (in older sessions) missing those fields.
export const decodeJwt = (token: string | null | undefined): Record<string, unknown> | null => {
    if (!token) return null;
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
        return null;
    }
};

// Mirrors isApprovedAdmin in backend/admin-service/src/middlewares/auth.js.
// Keep the two in step: this one decides what renders, that one decides what
// the API allows.
//
// is_root_admin must be exactly true — a string 'false' or a 0/1 from a
// loosely-typed source must not read as approval.
export const isApprovedAdmin = (claims: AdminClaims): boolean => {
    if (!claims) return false;
    if (claims.role === 'root') return true;
    if (claims.is_root_admin === true) return true;
    // Supabase-authenticated admins carry no is_root_admin claim (their role
    // comes from the profile lookup) and were never part of this flow.
    if (claims.supabaseUid) return true;
    return false;
};

// Teachers are a separate cohort with their own filtered surface and are never
// gated here.
export const isAwaitingApproval = (claims: AdminClaims): boolean => {
    if (!claims) return false;
    if (claims.role === 'teacher') return false;
    return !isApprovedAdmin(claims);
};
