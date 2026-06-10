const { Op } = require('sequelize');
const { DemoVideo } = require('../models');

// Intro video first, then explicitly-numbered items (sort_order > 0) ascending,
// then the unset (0) ones newest-first — same intuition as Gallery.
const ORDER = () => [
    ['is_intro', 'DESC'],
    [DemoVideo.sequelize.literal('CASE WHEN "sort_order" = 0 THEN 1 ELSE 0 END'), 'ASC'],
    ['sort_order', 'ASC'],
    ['id', 'DESC'],
];

const paginate = ({ search, limit, offset }) => {
    const where = {};
    if (search) where.title = { [Op.iLike]: `%${search}%` };
    return DemoVideo.findAndCountAll({ where, order: ORDER(), limit, offset });
};

const listPublic = () => DemoVideo.findAll({ where: { status: 1 }, order: ORDER() });

const findOne = (where) => DemoVideo.findOne({ where });
const create = (data) => DemoVideo.create(data);

module.exports = { paginate, listPublic, findOne, create };
