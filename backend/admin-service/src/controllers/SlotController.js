const slotService = require('../services/SlotService');
const { asyncHandler } = require('../middlewares/error');

exports.index = asyncHandler(async (req, res) => {
    const { page, search, per_page } = req.query;
    res.json(await slotService.list({ page, search, per_page }));
});

exports.show = asyncHandler(async (req, res) => {
    res.json(await slotService.get(req.params.id));
});

exports.store = asyncHandler(async (req, res) => {
    res.json(await slotService.create({ body: req.body }));
});

exports.update = asyncHandler(async (req, res) => {
    res.json(await slotService.update({ id: req.params.id, body: req.body }));
});

exports.delete = asyncHandler(async (req, res) => {
    res.json(await slotService.remove(req.params.id));
});

exports.status = asyncHandler(async (req, res) => {
    res.json(await slotService.toggleStatus(req.params.id));
});

// Students enrolled in a course — drives the course-dependent student picker.
exports.courseStudents = asyncHandler(async (req, res) => {
    res.json(await slotService.courseStudents(req.params.courseId));
});
