const { createRemoteJWKSet, jwtVerify } = require('jose');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const authDb = require('../config/authDatabase');
const { QueryTypes } = require('sequelize');

// Two Supabase signing styles:
//   - new asymmetric (RS256/ES256) via JWKS endpoint
//   - legacy HS256 via the project's JWT secret
// We try JWKS first, fall back to HS256 — supports both legacy and migrated
// projects without changing config.
const supabaseUrl = env.supabase.url || '';
const jwks = supabaseUrl
    ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
    : null;
const supabaseSecret = env.supabase.jwtSecret
    ? new TextEncoder().encode(env.supabase.jwtSecret)
    : null;

async function verifySupabaseToken(token) {
    if (jwks) {
        try {
            const { payload } = await jwtVerify(token, jwks);
            return payload;
        } catch (_) { /* try HS256 next */ }
    }
    if (supabaseSecret) {
        try {
            const { payload } = await jwtVerify(token, supabaseSecret, { algorithms: ['HS256'] });
            return payload;
        } catch (_) { /* both verification paths failed */ }
    }
    return null;
}

// Small role cache keyed by supabase uid. 5min TTL — propagates role
// changes (admin → teacher demotion etc.) without a service restart.
const profileCache = new Map();
const PROFILE_TTL_MS = 5 * 60 * 1000;

async function loadProfile(supabaseUid, emailFromToken) {
    const hit = profileCache.get(supabaseUid);
    if (hit && hit.expires > Date.now()) return hit.value;

    // lucy_devdb.users stores `supabase:<uid>` in passwordHash for newly
    // created profiles. Fall back to email match for older / migrated rows.
    let rows = await authDb.query(
        `SELECT u."userId", u.email, u."roleId", u."collegeId", r.role
           FROM users u
           JOIN roles r ON r."roleId" = u."roleId"
          WHERE u."passwordHash" = :tag
          LIMIT 1`,
        {
            replacements: { tag: `supabase:${supabaseUid}` },
            type: QueryTypes.SELECT,
        }
    );
    if (!rows.length && emailFromToken) {
        rows = await authDb.query(
            `SELECT u."userId", u.email, u."roleId", u."collegeId", r.role
               FROM users u
               JOIN roles r ON r."roleId" = u."roleId"
              WHERE u.email = :email
              LIMIT 1`,
            { replacements: { email: emailFromToken }, type: QueryTypes.SELECT }
        );
    }
    if (!rows.length) return null;

    const value = {
        id:        rows[0].userId,
        userId:    rows[0].userId,
        email:     rows[0].email,
        roleId:    rows[0].roleId,
        collegeId: rows[0].collegeId,
        role:      rows[0].role,
    };
    profileCache.set(supabaseUid, { value, expires: Date.now() + PROFILE_TTL_MS });
    return value;
}

const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
        if (!token) return res.status(401).json({ error: 'Unauthorized - No token provided' });

        // TWO token types reach this service:
        //   1. Supabase access tokens (HS256, SUPABASE_JWT_SECRET) — students,
        //      teachers, school admins provisioned through Supabase Auth.
        //   2. admin-service-issued JWTs (env.jwt.secret) — the root/college
        //      admin break-glass login (AuthService.login → lms_admin.users).
        //      This bootstrap path must keep working even before any Supabase
        //      user exists, so we verify it as a fallback.
        // Try Supabase first; on failure, try the local admin JWT.

        // --- 1. Supabase token (JWKS first, then HS256 fallback) -----------
        if (jwks || supabaseSecret) {
            const payload = await verifySupabaseToken(token);
            if (payload) {
                const profile = await loadProfile(payload.sub, payload.email);
                if (!profile) {
                    return res.status(403).json({ error: 'Profile not provisioned for this account' });
                }
                // Role for authorization comes from the DB (loadProfile) plus
                // app_metadata ONLY. app_metadata is settable only by the
                // service-role key; user_metadata is editable by the user
                // themselves (supabase.auth.updateUser) — trusting it here let
                // any logged-in user escalate to root. Never read role from
                // user_metadata for authz.
                const metadataRole = payload.app_metadata?.role;
                if (metadataRole === 'root') profile.role = 'root';
                req.user = { ...profile, supabaseUid: payload.sub };
                return next();
            }
            // verification failed → fall through to local admin JWT
        }

        // --- 2. admin-service local JWT (root / school admin) -------------
        try {
            const decoded = jwt.verify(token, env.jwt.secret);
            // Shape mirrors AuthService.signToken: { id, email, role, name,
            // college_id, is_root_admin }. Downstream gates read req.user.role
            // + req.user.collegeId, so normalize college_id → collegeId.
            req.user = {
                ...decoded,
                id: decoded.id,
                role: decoded.is_root_admin ? 'root' : decoded.role,
                collegeId: decoded.college_id ?? decoded.collegeId ?? null,
            };
            return next();
        } catch (_e) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }
    } catch (_err) {
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
};

// Best-effort identity for /api/public endpoints. Verifies a token IF one is
// present and sets req.authUser = { userId, role }; otherwise req.authUser =
// null. NEVER rejects — anonymous browsing keeps working. The point is that
// when a token IS supplied we trust the verified id over any client-supplied
// x-user-id, so a student can't read another student's gated content by
// spoofing the header.
const optionalAuth = async (req, _res, next) => {
    req.authUser = null;
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
        if (!token) return next();

        if (jwks || supabaseSecret) {
            const payload = await verifySupabaseToken(token);
            if (payload) {
                const profile = await loadProfile(payload.sub, payload.email);
                if (profile) {
                    // email is carried so email-keyed lookups (e.g. a student's
                    // founder-meeting registrations made before user_id capture)
                    // can match on it, falling back from the verified id.
                    req.authUser = { userId: String(profile.userId), role: profile.role, email: profile.email || payload.email || null };
                    return next();
                }
            }
        }
        try {
            const decoded = jwt.verify(token, env.jwt.secret);
            req.authUser = {
                userId: String(decoded.userId ?? decoded.id ?? ''),
                role: decoded.is_root_admin ? 'root' : decoded.role,
            };
        } catch (_) { /* unverifiable token → stay anonymous */ }
    } catch (_) { /* never block the request */ }
    return next();
};

// A newly created admin has no dashboard access until the root admin approves
// them ("Give Access" on /admin/admins, which sets is_root_admin). Until then
// every admin API is closed to them and the UI shows a full-page notice telling
// them to ask the root admin — see AdminLayout.
//
// The distinct APPROVAL_REQUIRED code is what lets the frontend tell "you are
// not an admin at all" apart from "you are an admin, just not approved yet";
// a bare 403 would render as a generic error instead of the notice.
const APPROVAL_REQUIRED = 'ADMIN_APPROVAL_REQUIRED';

// Teachers are a separate cohort with their own surface (adminOrTeacher) and
// are deliberately NOT subject to this gate.
//
// The gate applies only to the local admin JWT (AuthService.signToken), which
// is the path every /admin login takes and the only one carrying is_root_admin.
// A Supabase-issued token has no such claim — its admin role comes from
// loadProfile — so gating it here would lock out accounts that were never part
// of this approval flow. Those are identified by supabaseUid and pass through.
const isApprovedAdmin = (user) =>
    user?.role === 'root'
    || user?.is_root_admin === true
    || Boolean(user?.supabaseUid);

// Admin identity WITHOUT the approval gate. Only for the couple of endpoints an
// unapproved admin must still reach: /auth/me (so the UI can read its own
// is_root_admin and decide to render the notice) and /auth/logout (so they are
// not trapped in a page they cannot leave).
const adminAuthed = (req, res, next) => {
    auth(req, res, () => {
        if (req.user?.role !== 'admin' && req.user?.role !== 'root') {
            return res.status(403).json({ error: 'Forbidden - Admin only' });
        }
        next();
    });
};

// Approval as the DATABASE currently has it, not as the token claims it.
//
// is_root_admin is signed into the JWT at login and the token lives for
// JWT_EXPIRES_IN (7d by default), so trusting the claim meant a revoked admin
// kept full access for up to a week — refreshing, re-opening the tab and even
// logging out changed nothing, because the token itself still said true. The
// row is read per request instead: revoke now takes effect on the next call.
//
// Cost is one indexed primary-key lookup per admin API request, which is
// nothing at admin-panel traffic and is the price of revocation actually
// meaning something.
//
// Requires models lazily: auth.js is loaded from server.js before the Sequelize
// models are wired up, so a top-level require would be a cycle.
const readApprovalFromDb = async (user) => {
    const { User } = require('../models');
    const userRepo = require('../repositories/UserRepository');

    const row = await User.findOne({
        where: { id: user.id },
        attributes: ['id', 'role', 'is_root_admin'],
    });
    // Deleted or demoted out of the admin role since the token was issued.
    if (!row || (row.role !== 'admin' && row.role !== 'root')) return false;
    if (row.is_root_admin === true) return true;

    // The seeded primary root is root by identity, not by the flag — its row
    // can carry is_root_admin false (revokeAccess refuses to touch it). Falling
    // back to this keeps the one account that can restore everyone else's
    // access from ever locking itself out.
    return row.id === await userRepo.findRootAdminId();
};

const adminOnly = (req, res, next) => {
    adminAuthed(req, res, async () => {
        // Supabase-authenticated admins were never part of this flow and have
        // no row in lms_admin.users to consult.
        if (req.user?.supabaseUid) return next();

        let approved;
        try {
            approved = await readApprovalFromDb(req.user);
        } catch (err) {
            // Fail closed: if approval cannot be confirmed, do not grant it.
            return next(err);
        }

        if (!approved) {
            return res.status(403).json({
                error: 'Your admin access is pending approval by the root admin.',
                code: APPROVAL_REQUIRED,
            });
        }
        next();
    });
};

// Allows admin/root OR teacher. Used on course read/write surfaces that
// teachers may legitimately reach (course list, course edit, curriculum,
// zoom-live-class). The service layer further scopes results to courses they
// own / are assigned to (see CourseService.list scoping by req.user).
const adminOrTeacher = (req, res, next) => {
    auth(req, res, () => {
        const role = req.user?.role;
        if (role !== 'admin' && role !== 'root' && role !== 'teacher') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    });
};

module.exports = { auth, adminAuthed, adminOnly, adminOrTeacher, optionalAuth, isApprovedAdmin, APPROVAL_REQUIRED };
