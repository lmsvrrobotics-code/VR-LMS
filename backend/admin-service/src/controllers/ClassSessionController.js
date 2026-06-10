const classService = require('../services/ClassSessionService');
const { asyncHandler } = require('../middlewares/error');

exports.index = asyncHandler(async (req, res) => {
    const { page, search, per_page } = req.query;
    res.json(await classService.list({ page, search, per_page }));
});
exports.show = asyncHandler(async (req, res) => res.json(await classService.get(req.params.id)));
exports.store = asyncHandler(async (req, res) => res.json(await classService.create({ body: req.body })));
exports.update = asyncHandler(async (req, res) => res.json(await classService.update({ id: req.params.id, body: req.body })));
exports.delete = asyncHandler(async (req, res) => res.json(await classService.remove(req.params.id)));
exports.status = asyncHandler(async (req, res) => res.json(await classService.toggleStatus(req.params.id)));
