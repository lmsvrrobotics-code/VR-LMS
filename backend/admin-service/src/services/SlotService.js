const { Slot, SlotEnrollment, Course } = require('../models');
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

/**
 * Slots for a teacher, for GET /api/public/slots/by-teacher/:teacherId.
 *
 * This route existed but called `slotService.listForTeacher`, which was never
 * implemented — every request threw `listForTeacher is not a function` and
 * returned 500. That mattered beyond this feature: the teacher dashboard fetched
 * classes, slots and batch-students in a single Promise.all, so this 500
 * rejected the whole chain and blanked the entire Students tab.
 *
 * Slots have no teacher column — a slot belongs to a BATCH, and a teacher
 * reaches it by being assigned to that batch. Matches both assignment paths
 * (batches.primary_teacher_id and the batch_teachers roster), same as
 * TeacherCourseService / TeacherStudentService.
 *
 * Returns the roster shape the dashboard expects: { slots: [{ ..., students }] }.
 */
const listForTeacher = async (teacherId) => {
    const tid = String(teacherId ?? '').trim();
    if (!tid) return { slots: [] };
    try {
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');
        const rows = await sequelize.query(
            `SELECT s.id, s.batch_id, s.course_id, s.slot_date, s.start_time, s.end_time,
                    s.status, s.meeting_link, s.topic,
                    COALESCE(b.name, b.display_name) AS batch_name
               FROM slots s
               JOIN batches b
                 ON (CAST(s.batch_id AS TEXT) = b.unique_id OR CAST(s.batch_id AS TEXT) = b.batch_id)
              WHERE COALESCE(b.is_active, TRUE) = TRUE
                AND (
                      b.primary_teacher_id = :tid
                   OR EXISTS (
                        SELECT 1 FROM batch_teachers bt
                         WHERE (bt.batch_id = b.unique_id OR bt.batch_id = b.batch_id)
                           AND bt.user_id = :tid
                           AND COALESCE(bt.status, 'active') = 'active'
                      )
                    )
              ORDER BY s.slot_date DESC, s.start_time DESC`,
            { replacements: { tid }, type: QueryTypes.SELECT },
        );

        // Enrolled students per slot, so the Students tab can count sessions.
        const slots = await Promise.all(rows.map(async (r) => {
            let students = [];
            try {
                const enrolled = await sequelize.query(
                    `SELECT se.user_id AS id FROM slot_enrollments se WHERE se.slot_id = :sid`,
                    { replacements: { sid: r.id }, type: QueryTypes.SELECT },
                );
                const { resolveUserNames } = require('../helpers/scheduleResolve');
                const names = await resolveUserNames(enrolled.map((e) => e.id));
                students = enrolled.map((e) => ({ id: String(e.id), name: names[String(e.id)] || '' }));
            } catch (e) {
                // Enrollment lookup is best-effort: the slot itself must still list.
                console.warn('[slots/by-teacher] enrollment resolve failed:', e.message);
            }
            return { ...r, name: r.topic || r.batch_name || `Slot ${r.id}`, students };
        }));

        return { slots };
    } catch (e) {
        // Degrade to an empty list rather than 500ing — this endpoint is one of
        // three parallel feeds on the teacher dashboard.
        console.warn('[slots/by-teacher] lookup failed:', e.message);
        return { slots: [] };
    }
};

module.exports = {
    createSlot,
    getSlotsByDateRange,
    getSlotWithEnrollments,
    enrollStudent,
    cancelEnrollment,
    markAttended,
    listSlots,
    listForTeacher,
};
