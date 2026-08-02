const { Op } = require('sequelize');
const { ClassSession } = require('../models');

const paginate = ({ search, limit, offset }) => {
    const where = {};
    if (search) where.name = { [Op.iLike]: `%${search}%` };
    return ClassSession.findAndCountAll({
        where,
        order: [['start_at', 'ASC'], ['id', 'DESC']],
        limit,
        offset,
    });
};

const findOne = (where) => ClassSession.findOne({ where });
const create = (data) => ClassSession.create(data);

// Active class sessions whose teacher_ids JSONB array contains the teacher id.
const listForTeacher = (teacherId) => {
    const idJson = ClassSession.sequelize.escape(JSON.stringify([String(teacherId)]));
    return ClassSession.findAll({
        where: ClassSession.sequelize.literal(`status = 1 AND teacher_ids @> ${idJson}::jsonb`),
        order: [['start_at', 'ASC'], ['id', 'DESC']],
        raw: true,
    });
};

/**
 * Active class sessions for a set of course ids, ending at or after `from`.
 *
 * `course_id` is a free-text VARCHAR (it can hold a numeric course id OR an
 * ad-hoc label), so the ids are compared as strings. Filtering on end_at — not
 * start_at — keeps a class visible while it is actually running; a session that
 * started an hour ago but runs for another hour is still "upcoming" to a
 * student who needs to join it. Rows with no end_at fall back to start_at.
 */
const listUpcomingForCourses = (courseIds, from = new Date(), limit = 20) => {
    const ids = [...new Set((courseIds || []).map((c) => String(c).trim()).filter(Boolean))];
    if (ids.length === 0) return Promise.resolve([]);
    return ClassSession.findAll({
        where: {
            status: 1,
            course_id: { [Op.in]: ids },
            [Op.or]: [
                { end_at: { [Op.gte]: from } },
                { end_at: null, start_at: { [Op.gte]: from } },
            ],
        },
        order: [['start_at', 'ASC'], ['id', 'ASC']],
        limit,
        raw: true,
    });
};

module.exports = { paginate, findOne, create, listForTeacher, listUpcomingForCourses };
