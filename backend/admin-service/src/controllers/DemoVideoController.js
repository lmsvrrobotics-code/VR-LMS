const demoVideoService = require('../services/DemoVideoService');
const { asyncHandler } = require('../middlewares/error');

exports.index = asyncHandler(async (req, res) => {
    const { page, search } = req.query;
    res.json(await demoVideoService.list({ page, search }));
});
exports.show = asyncHandler(async (req, res) => res.json(await demoVideoService.get(req.params.id)));
exports.store = asyncHandler(async (req, res) => res.json(await demoVideoService.create({ body: req.body, file: req.file })));
exports.update = asyncHandler(async (req, res) => res.json(await demoVideoService.update({ id: req.params.id, body: req.body, file: req.file })));
exports.delete = asyncHandler(async (req, res) => res.json(await demoVideoService.remove(req.params.id)));
exports.status = asyncHandler(async (req, res) => res.json(await demoVideoService.toggleStatus(req.params.id)));
