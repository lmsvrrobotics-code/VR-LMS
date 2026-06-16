const service = require('../services/BatchNewService');
const { asyncHandler, HttpError } = require('../middlewares/error');

// Create a new batch with course, teacher, and students
exports.createBatch = asyncHandler(async (req, res) => {
    const { courseId, teacherId, studentIds = [], description } = req.body;
    res.json(await service.createBatch({ courseId, teacherId, studentIds, description }));
});

// Get batch with all members
exports.getBatch = asyncHandler(async (req, res) => {
    const batch = await service.getBatchWithMembers(req.params.batchId);
    res.json({ batch: batch.toJSON() });
});

// List all batches with optional filters
exports.listBatches = asyncHandler(async (req, res) => {
    const { page, courseId, teacherId } = req.query;
    res.json(await service.listBatches({ page, courseId, teacherId }));
});

// Add a student to an existing batch
exports.addStudent = asyncHandler(async (req, res) => {
    const { userId, studentId } = req.body;
    const { batchId } = req.params;
    res.json(await service.addStudentToBatch(batchId, userId, studentId));
});

// Remove a student from a batch (soft delete)
exports.removeStudent = asyncHandler(async (req, res) => {
    const { batchId, userId } = req.params;
    res.json(await service.removeStudentFromBatch(batchId, userId));
});

// Create a class for a batch
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

// Assign temporary teacher to a class
exports.assignTempTeacher = asyncHandler(async (req, res) => {
    const { batchClassId } = req.params;
    const { tempTeacherId } = req.body;
    res.json(await service.assignTempTeacherToClass(batchClassId, tempTeacherId));
});
