const kitService = require('../services/KitService');
const { asyncHandler } = require('../middlewares/error');

exports.index = asyncHandler(async (req, res) => {
    const { page, search } = req.query;
    res.json(await kitService.list({ page, search }));
});

exports.show = asyncHandler(async (req, res) => {
    res.json(await kitService.get(req.params.id));
});

exports.store = asyncHandler(async (req, res) => {
    res.json(await kitService.create({ body: req.body, file: req.file }));
});

exports.update = asyncHandler(async (req, res) => {
    res.json(await kitService.update({ id: req.params.id, body: req.body, file: req.file }));
});

exports.delete = asyncHandler(async (req, res) => {
    res.json(await kitService.remove(req.params.id));
});

exports.status = asyncHandler(async (req, res) => {
    res.json(await kitService.toggleStatus(req.params.id));
});
