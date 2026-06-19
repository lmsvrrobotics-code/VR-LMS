const service = require('../services/BatchNewService');
const { asyncHandler, HttpError } = require('../middlewares/error');

// Create batch (with 1 course, 1 teacher, many students)
exports.createBatch = asyncHandler(async (req, res) => {
    const { courseId, teacherId, studentIds = [] } = req.body;
    res.json(await service.createBatch({ courseId, teacherId, studentIds }));
});

// Get batch details with members and course
exports.getBatch = asyncHandler(async (req, res) => {
    const batch = await service.getBatchWithMembers(req.params.batchId);
    res.json({ batch: batch.toJSON() });
});

// List all batches
exports.listBatches = asyncHandler(async (req, res) => {
    const { page, courseId, teacherId } = req.query;
    res.json(await service.listBatches({ page, courseId, teacherId }));
});

// Add student to batch
exports.addStudent = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const { batchId } = req.params;
    res.json(await service.addStudentToBatch(batchId, userId));
});

// Remove student from batch
exports.removeStudent = asyncHandler(async (req, res) => {
    const { batchId, userId } = req.params;
    res.json(await service.removeStudentFromBatch(batchId, userId));
});

// Update batch teacher
exports.updateTeacher = asyncHandler(async (req, res) => {
    const { teacherId } = req.body;
    const { batchId } = req.params;
    res.json(await service.updateBatchTeacher(batchId, teacherId));
});

// Create class for batch
exports.createClass = asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    const { classDate, topic, notes, meetingLink } = req.body;
    res.json(await service.createClassForBatch(batchId, {
        classDate,
        topic,
        notes,
        meetingLink,
    }));
});
