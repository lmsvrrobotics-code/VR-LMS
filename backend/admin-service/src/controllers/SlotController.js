const service = require('../services/SlotService');
const { asyncHandler } = require('../middlewares/error');

// Admin: Create slot
exports.createSlot = asyncHandler(async (req, res) => {
    const { batchId, courseId, slotDate, startTime, endTime, capacity, topic, notes, meetingLink } = req.body;
    res.json(await service.createSlot({ batchId, courseId, slotDate, startTime, endTime, capacity, topic, notes, meetingLink }));
});

// Get slots for date range (calendar view)
exports.getSlotsByDateRange = asyncHandler(async (req, res) => {
    const { batchId, courseId, startDate, endDate } = req.query;
    res.json({ slots: await service.getSlotsByDateRange({ batchId, courseId, startDate, endDate }) });
});

// Get single slot with enrollments
exports.getSlot = asyncHandler(async (req, res) => {
    const slot = await service.getSlotWithEnrollments(req.params.slotId);
    res.json({ slot });
});

// List all slots (paginated)
exports.listSlots = asyncHandler(async (req, res) => {
    const { page, batchId, courseId, status } = req.query;
    res.json(await service.listSlots({ page, batchId, courseId, status }));
});

// Student: Enroll in slot
exports.enrollSlot = asyncHandler(async (req, res) => {
    const { slotId } = req.params;
    const { studentId } = req.body;
    const userId = req.verifiedUserId || req.headers['x-user-id'];
    res.json(await service.enrollStudent(slotId, userId, studentId));
});

// Student: Cancel enrollment
exports.cancelEnrollment = asyncHandler(async (req, res) => {
    const { enrollmentId, slotId } = req.params;
    res.json(await service.cancelEnrollment(enrollmentId, slotId));
});

// Admin: Mark student as attended
exports.markAttended = asyncHandler(async (req, res) => {
    const { enrollmentId } = req.params;
    res.json(await service.markAttended(enrollmentId));
});
