const locationService = require('../services/LocationService');
const { asyncHandler } = require('../middlewares/error');

exports.index = asyncHandler(async (req, res) => {
    const { page, search } = req.query;
    res.json(await locationService.list({ page, search }));
});

exports.show = asyncHandler(async (req, res) => {
    res.json(await locationService.get(req.params.id));
});

exports.store = asyncHandler(async (req, res) => {
    res.json(await locationService.create({ body: req.body }));
});

exports.update = asyncHandler(async (req, res) => {
    res.json(await locationService.update({ id: req.params.id, body: req.body }));
});

exports.delete = asyncHandler(async (req, res) => {
    res.json(await locationService.remove(req.params.id));
});

exports.status = asyncHandler(async (req, res) => {
    res.json(await locationService.toggleStatus(req.params.id));
});
