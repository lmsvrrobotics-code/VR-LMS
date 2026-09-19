const svc = require('../services/FounderMeetingService');
const { asyncHandler } = require('../middlewares/error');

// "Weekly Meeting with Founder" admin CRUD. Create/update accept TWO file
// fields (video + poster), so multer is configured with .fields() in the
// route and the handlers read req.files rather than req.file.

exports.index = asyncHandler(async (req, res) => {
    const { page, search } = req.query;
    res.json(await svc.list({ page, search }));
});

exports.show = asyncHandler(async (req, res) => res.json(await svc.get(req.params.id)));

exports.store = asyncHandler(async (req, res) =>
    res.json(await svc.create({ body: req.body, files: req.files || {} })));

exports.update = asyncHandler(async (req, res) =>
    res.json(await svc.update({ id: req.params.id, body: req.body, files: req.files || {} })));

exports.delete = asyncHandler(async (req, res) => res.json(await svc.remove(req.params.id)));

exports.status = asyncHandler(async (req, res) => res.json(await svc.toggleStatus(req.params.id)));

exports.registrations = asyncHandler(async (req, res) => {
    const { page, search } = req.query;
    res.json(await svc.listRegistrations(req.params.id, { page, search }));
});

exports.registrationStatus = asyncHandler(async (req, res) =>
    res.json(await svc.setRegistrationStatus(req.params.id, req.body?.status)));

exports.deleteRegistration = asyncHandler(async (req, res) =>
    res.json(await svc.removeRegistration(req.params.id)));
