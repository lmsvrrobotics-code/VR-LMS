const { Slot, SlotEnrollment, Batch, Course } = require('../models');
const { HttpError } = require('../middlewares/error');
const { Op } = require('sequelize');

// Create a new slot
const createSlot = async ({ batchId, courseId, slotDate, startTime, endTime, capacity = 30, topic = null, notes = null, meetingLink = null }) => {
    if (!batchId || !courseId || !slotDate || !startTime || !endTime) {
        throw new HttpError(422, 'Missing required fields');
    }

    const slot = await Slot.create({
        batch_id: batchId,
        course_id: courseId,
        slot_date: slotDate,
        start_time: startTime,
        end_time: endTime,
        capacity,
        topic,
        notes,
        meeting_link: meetingLink,
    });

    return { success: 'Slot created', slot: slot.toJSON() };
};

// Get slots for a date range (for calendar view)
const getSlotsByDateRange = async ({ batchId, courseId, startDate, endDate }) => {
    const where = {};
    if (batchId) where.batch_id = Number(batchId);
    if (courseId) where.course_id = Number(courseId);
    if (startDate || endDate) {
        where.slot_date = {};
        if (startDate) where.slot_date[Op.gte] = startDate;
        if (endDate) where.slot_date[Op.lte] = endDate;
    }

    const slots = await Slot.findAll({
        where,
        include: [
            { model: Batch, as: 'batch', attributes: ['id', 'batch_id'] },
            { model: Course, as: 'course', attributes: ['id', 'title'] },
        ],
        order: [['slot_date', 'ASC'], ['start_time', 'ASC']],
    });

    return slots.map(s => s.toJSON());
};

// Get slot with enrollments
const getSlotWithEnrollments = async (slotId) => {
    const slot = await Slot.findByPk(slotId, {
        include: [
            { model: SlotEnrollment, as: 'enrollments' },
            { model: Batch, as: 'batch' },
            { model: Course, as: 'course' },
        ],
    });

    if (!slot) throw new HttpError(404, 'Slot not found');

    return slot.toJSON();
};

// Enroll student in slot
const enrollStudent = async (slotId, userId, studentId) => {
    const slot = await Slot.findByPk(slotId);
    if (!slot) throw new HttpError(404, 'Slot not found');

    // Check if already enrolled
    const existing = await SlotEnrollment.findOne({
        where: { slot_id: slotId, user_id: String(userId), status: 'enrolled' },
    });
    if (existing) throw new HttpError(422, 'Already enrolled in this slot');

    // Check capacity
    if (slot.enrolled_count >= slot.capacity) {
        throw new HttpError(422, 'Slot is full');
    }

    // Enroll
    const enrollment = await SlotEnrollment.create({
        slot_id: slotId,
        user_id: String(userId),
        student_id: studentId,
        status: 'enrolled',
    });

    // Update slot enrolled count
    await slot.increment('enrolled_count');

    // Update status if full
    if (slot.enrolled_count + 1 >= slot.capacity) {
        await slot.update({ status: 'full' });
    }

    return { success: 'Enrolled in slot', enrollment: enrollment.toJSON() };
};

// Cancel enrollment
const cancelEnrollment = async (enrollmentId, slotId) => {
    const enrollment = await SlotEnrollment.findByPk(enrollmentId);
    if (!enrollment) throw new HttpError(404, 'Enrollment not found');

    await enrollment.update({ status: 'cancelled' });

    // Update slot enrolled count
    const slot = await Slot.findByPk(slotId);
    if (slot) {
        await slot.decrement('enrolled_count');
        // Update status if no longer full
        if (slot.enrolled_count - 1 < slot.capacity) {
            await slot.update({ status: 'available' });
        }
    }

    return { success: 'Enrollment cancelled' };
};

// Mark student as attended
const markAttended = async (enrollmentId) => {
    const enrollment = await SlotEnrollment.findByPk(enrollmentId);
    if (!enrollment) throw new HttpError(404, 'Enrollment not found');

    await enrollment.update({ status: 'attended', attended_date: new Date() });

    return { success: 'Marked as attended', enrollment: enrollment.toJSON() };
};

// List all slots (paginated)
const listSlots = async ({ page = 1, batchId = null, courseId = null, status = null } = {}) => {
    const limit = 20;
    const offset = (Number(page) - 1) * limit;
    const where = {};

    if (batchId) where.batch_id = Number(batchId);
    if (courseId) where.course_id = Number(courseId);
    if (status) where.status = status;

    const { count, rows } = await Slot.findAndCountAll({
        where,
        include: [
            { model: Batch, as: 'batch', attributes: ['id', 'batch_id'] },
            { model: Course, as: 'course', attributes: ['id', 'title'] },
        ],
        limit,
        offset,
        order: [['slot_date', 'DESC'], ['start_time', 'DESC']],
    });

    return {
        slots: {
            data: rows.map(s => s.toJSON()),
            total: count,
            per_page: limit,
            current_page: Number(page),
            last_page: Math.max(1, Math.ceil(count / limit)),
        },
    };
};

module.exports = {
    createSlot,
    getSlotsByDateRange,
    getSlotWithEnrollments,
    enrollStudent,
    cancelEnrollment,
    markAttended,
    listSlots,
};
