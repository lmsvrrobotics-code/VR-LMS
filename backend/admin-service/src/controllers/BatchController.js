const service = require('../services/BatchService');
const { asyncHandler, HttpError } = require('../middlewares/error');

// Resolve which college's batches a request operates on.
//   - School admin: always their own JWT college_id (can't touch others).
//   - Root/super admin: has no college, so they target one explicitly via the
//     ?clgId= query param (the root Batches page sends it on every call). This
//     lets the root admin manage any college's batches with the same feature.
const requireCollege = (req) => {
    if (req.user?.is_root_admin || req.user?.role === 'root') {
        const cid = req.query.clgId || req.query.clg_id;
        if (!cid) {
            throw new HttpError(400, 'Select a school to manage its batches');
        }
        return String(cid);
    }
    const collegeId = req.user?.college_id || req.user?.collegeId;
    if (!collegeId) {
        throw new HttpError(403, 'Batches are only available to school admins');
    }
    return collegeId;
};

exports.list = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.list({ clgId }));
});

exports.show = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.get({ clgId, id: Number(req.params.id) }));
});

exports.store = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.create({ clgId, body: req.body }));
});

exports.update = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.update({ clgId, id: Number(req.params.id), body: req.body }));
});

exports.delete = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.remove({ clgId, id: Number(req.params.id) }));
});

exports.addMembers = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.addMembers({ clgId, id: Number(req.params.id), body: req.body }));
});

exports.removeMember = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.removeMember({
        clgId,
        id: Number(req.params.id),
        userId: req.params.userId,
    }));
});

// Bypasses requireCollege — root admin needs this to populate the batches
// dropdown on Add Course where they pick the colleges themselves. Scopes by
// the ?clgIds= query param (comma-separated or repeated).
exports.byColleges = asyncHandler(async (req, res) => {
    const raw = req.query.clgIds ?? req.query['clgIds[]'] ?? '';
    const ids = Array.isArray(raw)
        ? raw
        : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    // Root admin always also sees "independent" batches (built from individual
    // students, not tied to any school) so they can be targeted from the
    // course/program batch dropdowns. School admins stay scoped to their own.
    const isRoot = req.user?.is_root_admin || req.user?.role === 'root'
        || !(req.user?.college_id || req.user?.collegeId);
    if (isRoot && !ids.includes('independent')) ids.push('independent');
    res.json(await service.listByColleges({ clgIds: ids }));
});

exports.eligibleStudents = asyncHandler(async (req, res) => {
    const clgId = requireCollege(req);
    res.json(await service.eligibleStudents({ clgId }));
});
