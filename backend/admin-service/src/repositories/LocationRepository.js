const { Op } = require('sequelize');
const { Location } = require('../models');

// Ordering mirrors Gallery: explicitly-numbered items (sort_order > 0) first,
// ascending; items left at the default 0 fall to the END, newest first.
const ORDER = () => [
    [Location.sequelize.literal('CASE WHEN "sort_order" = 0 THEN 1 ELSE 0 END'), 'ASC'],
    ['sort_order', 'ASC'],
    ['id', 'DESC'],
];

// Admin list (all statuses).
const paginate = ({ search, limit, offset }) => {
    const where = {};
    if (search) {
        where[Op.or] = [
            { name: { [Op.iLike]: `%${search}%` } },
            { city: { [Op.iLike]: `%${search}%` } },
            { state: { [Op.iLike]: `%${search}%` } },
            { pin: { [Op.iLike]: `%${search}%` } },
        ];
    }
    return Location.findAndCountAll({ where, order: ORDER(), limit, offset });
};

// Public list — only visible items.
const listPublic = () => Location.findAll({ where: { status: 1 }, order: ORDER() });

const findOne = (where) => Location.findOne({ where });
const create = (data) => Location.create(data);

module.exports = { paginate, listPublic, findOne, create };
