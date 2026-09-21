const { Op } = require('sequelize');
const { sequelize, User, Course } = require('../models');

const findById = (id) => User.findByPk(id);

const findByEmail = (email) => User.findOne({ where: { email } });

const findByIdAndRole = (id, role) => User.findOne({ where: { id, role } });

const findRootAdminId = async () => {
    // Explicit override: when ROOT_ADMIN_EMAIL is set, that account is THE root
    // admin (lands on /admin/dashboard). Lets a freshly-seeded branded admin be
    // root even if an older admin row has a lower id. Falls back to the legacy
    // "lowest-id admin" heuristic when unset / email not found.
    const rootEmail = process.env.ROOT_ADMIN_EMAIL;
    if (rootEmail) {
        const byEmail = await User.findOne({ where: { email: rootEmail }, attributes: ['id'] });
        if (byEmail) return byEmail.id;
    }
    const root = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']], attributes: ['id'] });
    return root ? root.id : null;
};

const buildSearchWhere = (role, search) => {
    const where = { role };
    if (search) {
        where[Op.or] = [
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
        ];
    }
    return where;
};

const paginateByRole = (role, { search, limit, offset, order }) =>
    User.findAndCountAll({ where: buildSearchWhere(role, search), limit, offset, order });

const isEmailTaken = async (email, excludeId = null) => {
    const where = excludeId ? { email, id: { [Op.ne]: excludeId } } : { email };
    return Boolean(await User.findOne({ where }));
};

// unique_id is NOT NULL on the User model, so an insert that omits it fails
// client-side in Sequelize ("User.unique_id cannot be null") before any SQL
// runs — that was a 500 on every Add Admin submission. Migration 09's helper
// builds the id in the platform's convention (see seedRootAdmin.js, which
// already does this).
//
// The helper derives its serial from COUNT(*) of rows created today, so two
// admins added on the same day can be handed the same id; the UNIQUE index on
// unique_id then rejects the loser. We retry on that collision rather than
// surfacing it, mirroring lib/uniqueId.js's approach of keeping correctness in
// the DB instead of trusting a read-then-write gap.
const nextUniqueId = async (name, tx = null) => {
    const [[row]] = await sequelize.query(
        'SELECT lms_admin.get_next_user_id(:name) AS get_next_user_id',
        { replacements: { name: name || 'User' }, transaction: tx },
    );
    return row.get_next_user_id;
};

const isUniqueViolation = (err) =>
    err?.name === 'SequelizeUniqueConstraintError'
    && (err.errors || []).some((e) => e.path === 'unique_id');

const create = async (data, { attempts = 5 } = {}) => {
    if (data.unique_id) return User.create(data);

    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
        try {
            return await User.create({ ...data, unique_id: await nextUniqueId(data.name) });
        } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            lastErr = err;
        }
    }
    throw lastErr;
};

// `userId` here is the owner's varchar unique_id, NOT the integer users.id:
// courses.user_id is a VARCHAR holding unique_id (Course.associate joins on
// targetKey: 'unique_id'). Passing the integer id makes Postgres abort with
// `operator does not exist: character varying = integer`, which took the whole
// admin listing down. Coerced to a string so a numeric-looking id can't
// reintroduce that type mismatch.
const courseCountFor = (uniqueId) =>
    (uniqueId == null ? Promise.resolve(0) : Course.count({ where: { user_id: String(uniqueId) } }));

const findTeachers = () =>
    User.findAll({
        where: { role: 'teacher' },
        attributes: ['id', 'name', 'email'],
        order: [['name', 'ASC']],
    });

const findUsersByIds = (ids) =>
    ids.length
        ? User.findAll({ where: { id: ids }, attributes: ['id', 'name', 'email', 'photo'] })
        : Promise.resolve([]);

module.exports = {
    findById,
    findByEmail,
    findByIdAndRole,
    findRootAdminId,
    paginateByRole,
    isEmailTaken,
    nextUniqueId,
    isUniqueViolation,
    create,
    courseCountFor,
    findTeachers,
    findUsersByIds,
};
