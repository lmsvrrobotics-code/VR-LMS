const { Op } = require('sequelize');
const { Resource } = require('../models');

const paginate = ({ search, limit, offset }) => {
    const where = {};
    if (search) where.title = { [Op.iLike]: `%${search}%` };
    return Resource.findAndCountAll({
        where,
        order: [['sort_order', 'ASC'], ['id', 'DESC']],
        limit,
        offset,
    });
};

const findOne = (where) => Resource.findOne({ where });
const create = (data) => Resource.create(data);

// Active resources assigned to a teacher (teacher_ids JSONB contains the id).
const listForTeacher = (teacherId) => {
    const idJson = Resource.sequelize.escape(JSON.stringify([String(teacherId)]));
    return Resource.findAll({
        where: Resource.sequelize.literal(`status = 1 AND teacher_ids @> ${idJson}::jsonb`),
        order: [['sort_order', 'ASC'], ['id', 'DESC']],
        raw: true,
    });
};

// Active resources attached to any of `courseIds`. Student-facing: the caller
// resolves which courses the student may reach, so this only has to scope by
// course. An empty list short-circuits — `IN ()` is a SQL syntax error.
const listForCourses = (courseIds) => {
    const ids = (courseIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return Promise.resolve([]);
    return Resource.findAll({
        where: { status: 1, course_id: { [Op.in]: ids } },
        order: [['sort_order', 'ASC'], ['id', 'DESC']],
        raw: true,
    });
};

module.exports = { paginate, findOne, create, listForTeacher, listForCourses };
