const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const authDb = require('../config/authDatabase');
const { Course } = require('../models');

// Count rows in an lms_admin table. NOTE: Postgres — use plain (search_path
// resolves to lms_admin); the old MySQL backtick quoting threw on every call
// so all dashboard stats silently returned 0.
const safeCount = async (table, where = '') => {
    try {
        const [row] = await sequelize.query(
            `SELECT COUNT(*) AS c FROM ${table} ${where ? 'WHERE ' + where : ''}`,
            { type: QueryTypes.SELECT }
        );
        return Number(row.c || 0);
    } catch (e) {
        console.warn(`[dashboard] count failed for ${table}:`, e.message);
        return 0;
    }
};

// Students live in the auth DB (lucy_devdb.users, role 'student'), not in
// lms_admin.users — count them there so the figure isn't always 0.
const countStudents = async () => {
    try {
        const [row] = await authDb.query(
            `SELECT COUNT(*) AS c FROM users u JOIN roles r ON r."roleId" = u."roleId" WHERE r.role = 'student'`,
            { type: QueryTypes.SELECT }
        );
        return Number(row.c || 0);
    } catch (e) {
        console.warn('[dashboard] student count failed:', e.message);
        return 0;
    }
};

// Teachers also live in the auth DB (role 'teacher'), same as students.
const countTeachers = async () => {
    try {
        const [row] = await authDb.query(
            `SELECT COUNT(*) AS c FROM users u JOIN roles r ON r."roleId" = u."roleId" WHERE r.role = 'teacher'`,
            { type: QueryTypes.SELECT }
        );
        return Number(row.c || 0);
    } catch (e) {
        console.warn('[dashboard] teacher count failed:', e.message);
        return 0;
    }
};

const courseStatuses = () => Course.findAll({ attributes: ['status'] });

module.exports = { safeCount, countStudents, countTeachers, courseStatuses };
