const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const env = require('../config/env');
const authDb = require('../config/authDatabase');
const userRepo = require('../repositories/UserRepository');
const { User } = require('../models');
const { HttpError } = require('../middlewares/error');

// Block login when the admin's college has been revoked from Manage Schools
// → Options → Revoke Access. Raw SELECT into the shared auth DB (colleges
// lives there). Root admin has no college_id so this is a no-op for them.
// Best-effort on DB hiccups — column missing or query failure falls through.
async function assertCollegeActive(collegeId) {
    if (!collegeId) return;
    try {
        const rows = await authDb.query(
            'SELECT "isActive" FROM colleges WHERE "clgId" = :clgId LIMIT 1',
            { replacements: { clgId: collegeId }, type: QueryTypes.SELECT }
        );
        // isActive is BOOLEAN in Postgres — treat false (or legacy 0) as revoked.
        if (rows.length && (rows[0].isActive === false || Number(rows[0].isActive) === 0)) {
            throw new HttpError(403, 'Your school access has been revoked. Please contact your administrator.');
        }
    } catch (e) {
        if (e instanceof HttpError) throw e;
        console.warn('[admin-auth] college isActive check skipped:', e.message);
    }
}

const sanitize = (u) => {
    const o = u.toJSON ? u.toJSON() : { ...u };
    delete o.password;
    delete o.remember_token;
    return o;
};

// Root admin = the lowest-id admin row. Cached at module load so signToken
// stays sync (the JWT signing path runs on every login & doesn't need to
// re-query the DB). If the root row is ever deleted/re-seeded the service
// must be restarted — same constraint that already exists in AdminService.
let cachedRootId = null;
const getRootId = async () => {
    if (cachedRootId !== null) return cachedRootId;
    cachedRootId = await userRepo.findRootAdminId(); // returns the id (integer)
    return cachedRootId;
};

const signToken = (user, isRootAdmin) =>
    jwt.sign(
        // college_id is included so college-admin endpoints can scope by it
        // without a second DB lookup per request. is_root_admin is included
        // so the frontend can route root admins to the regular dashboard and
        // every other admin to the college dashboard without an extra fetch.
        {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            college_id: user.college_id || null,
            is_root_admin: !!isRootAdmin,
        },
        env.jwt.secret,
        { expiresIn: env.jwt.expiresIn }
    );

const login = async ({ email, password }) => {
    if (!email || !password) throw new HttpError(422, 'Email and password are required');

    const user = await userRepo.findByEmail(email);
    if (!user) throw new HttpError(401, 'Invalid credentials');
    if (user.role !== 'admin' && user.role !== 'root') {
        throw new HttpError(403, 'Forbidden - Admin only');
    }
    if (user.status !== undefined && user.status !== null && Number(user.status) === 0) {
        throw new HttpError(403, 'Account is disabled');
    }

    const ok = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!ok) throw new HttpError(401, 'Invalid credentials');

    const rootId = await getRootId();
    // Root = the original seeded root (lowest id) OR anyone granted access via
    // the stored is_root_admin flag ("Give Access").
    const isRootAdmin = user.id === rootId || user.is_root_admin === true;
    // Root admin keeps access regardless of college state — they need to be
    // able to log in and toggle access back on. Everyone else (college-admin
    // role) gets the gate.
    if (!isRootAdmin) {
        await assertCollegeActive(user.college_id);
    }
    return {
        token: signToken(user, isRootAdmin),
        user: { ...sanitize(user), is_root_admin: isRootAdmin },
    };
};

const me = async (userId) => {
    // userId is the 'id' field (integer) from the JWT
    const user = await User.findOne({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'User not found');
    const rootId = await getRootId();
    return { ...sanitize(user), is_root_admin: user.id === rootId || user.is_root_admin === true };
};

module.exports = { login, me };
