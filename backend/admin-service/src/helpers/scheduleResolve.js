const { QueryTypes } = require('sequelize');
const { Course } = require('../models');
const authDb = require('../config/authDatabase');

// Shared resolvers for the teacher-facing schedule endpoints (slots, demos,
// classes). Resolve lms_admin course titles and auth-DB user names.

async function resolveCourseTitles(courseIds) {
    // Course.id is an integer PK — only numeric course_ids can match a row.
    // Free-text course_ids (used by demos/classes) are skipped here and fall
    // back to their raw value in the caller. Casting them with Number() yields
    // NaN and produces a `column "nan" does not exist` SQL error.
    const ids = [...new Set(
        (courseIds || []).filter((x) => x != null && /^\d+$/.test(String(x))).map(Number)
    )];
    if (!ids.length) return {};
    try {
        const cs = await Course.findAll({ where: { id: ids }, attributes: ['id', 'title'], raw: true });
        return Object.fromEntries(cs.map((c) => [String(c.id), c.title]));
    } catch (e) {
        console.warn('[schedule] course title resolve failed:', e.message);
        return {};
    }
}

async function resolveUserNames(userIds) {
    const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
    if (!ids.length) return {};
    try {
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email FROM users u WHERE u."userId" IN (:ids)`,
            { replacements: { ids }, type: QueryTypes.SELECT }
        );
        return Object.fromEntries(rows.map((r) => [String(r.id), r.name || r.email]));
    } catch (e) {
        console.warn('[schedule] user name resolve failed:', e.message);
        return {};
    }
}

module.exports = { resolveCourseTitles, resolveUserNames };
