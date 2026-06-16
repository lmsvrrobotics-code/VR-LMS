const { Op } = require('sequelize');
const { Kit } = require('../models');

// Numbered items (sort_order > 0) first ascending; unset (0) items last,
// newest first — same ordering as Gallery and Book.
const ORDER = () => [
    [Kit.sequelize.literal('CASE WHEN "sort_order" = 0 THEN 1 ELSE 0 END'), 'ASC'],
    ['sort_order', 'ASC'],
    ['id', 'DESC'],
];

// Admin list (all statuses).
const paginate = ({ search, limit, offset }) => {
    const where = {};
    if (search) where.title = { [Op.iLike]: `%${search}%` };
    return Kit.findAndCountAll({
        where,
        order: ORDER(),
        limit,
        offset,
    });
};

// Public list — only visible items.
const listPublic = () =>
    Kit.findAll({
        where: { status: 1 },
        order: ORDER(),
    });

const findOne = (where) => Kit.findOne({ where });
const create = (data) => Kit.create(data);

module.exports = { paginate, listPublic, findOne, create };
