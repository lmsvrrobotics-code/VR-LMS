const { Batch, BatchMember, BatchClass, Course } = require('../models');
const { HttpError } = require('../middlewares/error');
const { Op } = require('sequelize');

// Generate batch ID: CourseName_DDMMYY_Count
// Example: Scratch_160625_01, Scratch_160625_02, etc.
const generateBatchId = async (courseId) => {
    const course = await Course.findByPk(courseId, { attributes: ['title'] });
    if (!course) throw new HttpError(404, 'Course not found');

    // Extract course name (first 10 chars, uppercase, alphanumeric only)
    const courseName = String(course.title || 'Course')
        .substring(0, 15)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();

    // Today's date: DDMMYY
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const dateStr = `${dd}${mm}${yy}`;

    // Find highest count for this course today
    const existingBatches = await Batch.findAll({
        where: { batch_id: { [Op.like]: `${courseName}_${dateStr}_%` } },
        attributes: ['batch_id'],
        raw: true,
    });

    const counts = existingBatches.map((b) => {
        const match = b.batch_id.match(/_(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    });

    const nextCount = (Math.max(0, ...counts) || 0) + 1;
    const countStr = String(nextCount).padStart(2, '0');

    return `${courseName}_${dateStr}_${countStr}`;
};

// Create a new batch with course, teacher, and initial students
const createBatch = async ({ courseId, teacherId, studentIds = [], description = null }) => {
    if (!courseId || !teacherId) {
        throw new HttpError(422, 'Course ID and Teacher ID are required');
    }

    const batchId = await generateBatchId(courseId);

    // Create the batch
    const batch = await Batch.create({
        batch_id: batchId,
        course_id: courseId,
        teacher_id: teacherId,
        description,
    });

    // Add students if provided
    if (Array.isArray(studentIds) && studentIds.length > 0) {
        for (let i = 0; i < studentIds.length; i++) {
            const uid = studentIds[i];
            // Student unique ID: will need user info to generate properly
            // For now, use a placeholder
            const studentId = `Student_${batchId}_${String(i + 1).padStart(3, '0')}`;

            await BatchMember.create({
                batch_id: batch.id,
                user_id: uid,
                student_id: studentId,
                joined_date: new Date(),
                status: 'active',
            });
        }
    }

    return {
        success: 'Batch created successfully',
        batch: batch.toJSON(),
    };
};

// Get batch with all members
const getBatchWithMembers = async (batchId) => {
    const batch = await Batch.findOne({
        where: { batch_id: batchId },
        include: [
            { model: BatchMember, as: 'members', where: { status: 'active' } },
            { model: Course, as: 'course', attributes: ['id', 'title'] },
        ],
    });

    if (!batch) throw new HttpError(404, 'Batch not found');

    return batch;
};

// Add student to batch
const addStudentToBatch = async (batchId, userId, studentId) => {
    const batch = await Batch.findOne({ where: { batch_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    // Check if already in batch
    const existing = await BatchMember.findOne({
        where: { batch_id: batch.id, user_id: userId, status: 'active' },
    });

    if (existing) {
        throw new HttpError(422, 'Student already in this batch');
    }

    const member = await BatchMember.create({
        batch_id: batch.id,
        user_id: userId,
        student_id: studentId,
        joined_date: new Date(),
        status: 'active',
    });

    return { success: 'Student added to batch', member };
};

// Remove student from batch (soft delete - keep data)
const removeStudentFromBatch = async (batchId, userId) => {
    const batch = await Batch.findOne({ where: { batch_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const member = await BatchMember.findOne({
        where: { batch_id: batch.id, user_id: userId, status: 'active' },
    });

    if (!member) throw new HttpError(404, 'Student not in this batch');

    // Soft delete: mark as removed, keep data
    await member.update({
        removed_date: new Date(),
        status: 'removed',
    });

    return { success: 'Student removed from batch (data preserved)' };
};

// Assign temporary teacher to a class
const assignTempTeacherToClass = async (batchClassId, tempTeacherId) => {
    const batchClass = await BatchClass.findByPk(batchClassId);
    if (!batchClass) throw new HttpError(404, 'Class not found');

    await batchClass.update({ temp_teacher_id: tempTeacherId });

    return { success: 'Temporary teacher assigned', batchClass };
};

// Create class for batch
const createClassForBatch = async (batchId, { classDate, topic = null, notes = null, meetingLink = null }) => {
    const batch = await Batch.findOne({ where: { batch_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const batchClass = await BatchClass.create({
        batch_id: batch.id,
        teacher_id: batch.teacher_id,
        class_date: classDate,
        topic,
        notes,
        meeting_link: meetingLink,
        status: 'scheduled',
    });

    return { success: 'Class created', class: batchClass };
};

// List all batches
const listBatches = async ({ page = 1, courseId = null, teacherId = null } = {}) => {
    const limit = 20;
    const offset = (Number(page) - 1) * limit;
    const where = {};

    if (courseId) where.course_id = Number(courseId);
    if (teacherId) where.teacher_id = String(teacherId);

    const { count, rows } = await Batch.findAndCountAll({
        where,
        include: [{ model: BatchMember, as: 'members', separate: true }],
        limit,
        offset,
        order: [['created_at', 'DESC']],
    });

    return {
        batches: {
            data: rows.map((b) => ({
                ...b.toJSON(),
                memberCount: b.members?.length || 0,
            })),
            total: count,
            per_page: limit,
            current_page: Number(page),
            last_page: Math.max(1, Math.ceil(count / limit)),
        },
    };
};

module.exports = {
    createBatch,
    getBatchWithMembers,
    addStudentToBatch,
    removeStudentFromBatch,
    assignTempTeacherToClass,
    createClassForBatch,
    listBatches,
    generateBatchId,
};
