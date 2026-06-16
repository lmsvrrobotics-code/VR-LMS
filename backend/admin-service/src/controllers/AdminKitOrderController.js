const { KitOrder, Kit, User } = require('../models');
const { asyncHandler } = require('../middlewares/error');
const { HttpError } = require('../middlewares/error');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const PER_PAGE = 20;

exports.list = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const status = req.query.status || null;
    const limit = PER_PAGE;
    const offset = (page - 1) * limit;

    const where = status ? { status } : {};

    const { count, rows } = await KitOrder.findAndCountAll({
        where,
        include: [
            { model: Kit, as: 'kit', attributes: ['id', 'title'] }
        ],
        limit,
        offset,
        order: [['created_at', 'DESC']],
        raw: false,
    });

    // Fetch user data from auth DB
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const authDb = require('../config/authDatabase');
    const users = await authDb.query(
        'SELECT "userId", email, name FROM users WHERE "userId" = ANY(:ids)',
        { replacements: { ids: userIds }, type: QueryTypes.SELECT }
    ).catch(() => []);
    const userMap = Object.fromEntries(users.map(u => [u.userId, u]));

    const data = rows.map(r => ({
        ...r.toJSON(),
        student: userMap[r.user_id] || { email: 'Unknown', name: 'Unknown' },
    }));

    res.json({
        orders: {
            data,
            total: count,
            per_page: limit,
            current_page: page,
            last_page: Math.max(1, Math.ceil(count / limit)),
        },
    });
});

exports.updateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['created', 'paid', 'failed', 'sent'].includes(status)) {
        throw new HttpError(422, 'Invalid status');
    }

    const order = await KitOrder.findByPk(id);
    if (!order) throw new HttpError(404, 'Order not found');

    await order.update({ status });
    res.json({ success: 'Order updated', order });
});

exports.getOne = asyncHandler(async (req, res) => {
    const order = await KitOrder.findByPk(req.params.id, {
        include: [{ model: Kit, as: 'kit' }]
    });
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ order });
});
