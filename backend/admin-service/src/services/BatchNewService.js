const { Batch, BatchMember, BatchClass, Course } = require('../models');
const { HttpError } = require('../middlewares/error');
const { Op } = require('sequelize');

// Generate batch ID: CourseName_DDMMYY_Count
const generateBatchId = async (courseId) => {
    const course = await Course.findByPk(courseId, { attributes: ['title'] });
    if (!course) throw new HttpError(404, 'Course not found');

    const courseName = String(course.title || 'Course')
        .substring(0, 15)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const dateStr = `${dd}${mm}${yy}`;

    const existingBatches = await Batch.findAll({
        where: { unique_id: { [Op.like]: `${courseName}_${dateStr}_%` } },
        attributes: ['unique_id'],
        raw: true,
    });

    const counts = existingBatches.map((b) => {
        const match = b.unique_id.match(/_(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    });

    const nextCount = (Math.max(0, ...counts) || 0) + 1;
    const countStr = String(nextCount).padStart(2, '0');

    return `${courseName}_${dateStr}_${countStr}`;
};

// Create batch: 1 course + 1 teacher + many students
const createBatch = async ({ courseId, teacherId, studentIds = [] }) => {
    if (!courseId || !teacherId) {
        throw new HttpError(422, 'Course ID and Teacher ID are required');
    }

    const batchId = await generateBatchId(courseId);

    const batch = await Batch.create({
        unique_id: batchId,
        course_id: courseId,
        primary_teacher_id: teacherId,
        display_name: batchId,
        status: 'active',
    });

    // Add students if provided
    if (Array.isArray(studentIds) && studentIds.length > 0) {
        for (let i = 0; i < studentIds.length; i++) {
            const userId = studentIds[i];
            const studentId = `Student_${batchId}_${String(i + 1).padStart(3, '0')}`;

            await BatchMember.create({
                batch_id: batch.unique_id,
                user_id: userId,
                student_id: studentId,
                status: 'active',
            });
        }
    }

    return {
        success: 'Batch created successfully',
        batch: batch.toJSON(),
    };
};

// Get batch with members and course
const getBatchWithMembers = async (batchId) => {
    const batch = await Batch.findOne({
        where: { unique_id: batchId },
        include: [
            { model: BatchMember, as: 'members', where: { status: 'active' } },
            { model: Course, as: 'course' },
        ],
    });

    if (!batch) throw new HttpError(404, 'Batch not found');

    return batch;
};

// Add student to batch
const addStudentToBatch = async (batchId, userId) => {
    const batch = await Batch.findOne({ where: { unique_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const existing = await BatchMember.findOne({
        where: { batch_id: batchId, user_id: userId, status: 'active' },
    });

    if (existing) {
        throw new HttpError(422, 'Student already in this batch');
    }

    // Generate student ID
    const memberCount = await BatchMember.count({
        where: { batch_id: batchId },
    });

    const studentId = `Student_${batchId}_${String(memberCount + 1).padStart(3, '0')}`;

    const member = await BatchMember.create({
        batch_id: batchId,
        user_id: userId,
        student_id: studentId,
        status: 'active',
    });

    return { success: 'Student added to batch', member };
};

// Remove student from batch (soft delete)
const removeStudentFromBatch = async (batchId, userId) => {
    const batch = await Batch.findOne({ where: { unique_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const member = await BatchMember.findOne({
        where: { batch_id: batchId, user_id: userId, status: 'active' },
    });

    if (!member) throw new HttpError(404, 'Student not in this batch');

    await member.update({ status: 'removed' });

    return { success: 'Student removed from batch' };
};

// Change batch teacher
const updateBatchTeacher = async (batchId, teacherId) => {
    const batch = await Batch.findOne({ where: { unique_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    await batch.update({ primary_teacher_id: teacherId });

    return { success: 'Teacher updated for batch', batch };
};

// Create class for batch
const createClassForBatch = async (batchId, { classDate, topic = null, notes = null, meetingLink = null }) => {
    const batch = await Batch.findOne({ where: { unique_id: batchId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const batchClass = await BatchClass.create({
        batch_id: batchId,
        primary_teacher_id: batch.primary_teacher_id,
        class_date_time: classDate,
        title: topic,
        description: notes,
        status: 'scheduled',
    });

    return { success: 'Class created', class: batchClass };
};

// List all batches with filters
const listBatches = async ({ page = 1, courseId = null, teacherId = null } = {}) => {
    const limit = 20;
    const offset = (Number(page) - 1) * limit;
    const where = {};

    if (courseId) where.course_id = Number(courseId);
    if (teacherId) where.primary_teacher_id = String(teacherId);

    const { count, rows } = await Batch.findAndCountAll({
        where,
        include: [
            { model: BatchMember, as: 'members', separate: true },
            { model: Course, as: 'course', attributes: ['id', 'title'] },
        ],
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
    updateBatchTeacher,
    createClassForBatch,
    listBatches,
    generateBatchId,
};
