const { Assignment, AssignmentSubmission, Notification, Batch, BatchMember } = require('../models');
const { Op } = require('sequelize');

class AssignmentService {
    // Create assignment + notify all batch members
    async createAssignment(data) {
        const assignment = await Assignment.create({
            batch_id: data.batch_id,
            course_id: data.course_id,
            teacher_id: data.teacher_id,
            title: data.title,
            description: data.description,
            instructions: data.instructions,
            due_date: data.due_date,
            max_score: data.max_score || 100,
            file_url: data.file_url,
            status: 'published',
        });

        // Get active batch members and send notifications
        try {
            const members = await BatchMember.findAll({
                where: { batch_id: data.batch_id, status: 'active' }
            });

            for (const member of members) {
                await Notification.create({
                    user_id: member.user_id,
                    type: 'assignment_given',
                    title: `New Assignment: ${data.title}`,
                    message: `Your teacher has assigned a new assignment: ${data.title}`,
                    related_id: assignment.id,
                });
            }
        } catch (err) {
            console.warn('Failed to notify students on assignment creation:', err.message);
        }

        return assignment;
    }

    // Get assignments for batch WITH submissions included
    async getAssignmentsByBatch(batchId) {
        return Assignment.findAll({
            where: { batch_id: batchId },
            include: [{
                model: AssignmentSubmission,
                as: 'submissions',
                required: false,
            }],
            order: [['due_date', 'DESC']],
        });
    }

    // Get assignments for student (only from batches they're in)
    async getStudentAssignments(userId) {
        // 1. Find all batches for this student
        const memberRecords = await BatchMember.findAll({
            where: { user_id: userId, status: 'active' }
        });

        if (memberRecords.length === 0) {
            return [];
        }

        const batchIds = memberRecords.map(m => m.batch_id);

        // 2. Find assignments in those batches WITH student's submissions
        const studentId = memberRecords[0]?.student_id; // Get student_id from any active batch

        return Assignment.findAll({
            where: { batch_id: { [Op.in]: batchIds } },
            include: [{
                model: AssignmentSubmission,
                as: 'submissions',
                where: { student_id: studentId },
                required: false,
            }],
            order: [['due_date', 'DESC']],
        });
    }

    // Submit assignment (VERIFIED by JWT user_id)
    async submitAssignment(assignmentId, studentId, userId, data) {
        // Verify assignment exists
        const assignment = await Assignment.findByPk(assignmentId);
        if (!assignment) {
            throw new Error('Assignment not found');
        }

        // Verify student is in the batch (security check)
        const batchMember = await BatchMember.findOne({
            where: { batch_id: assignment.batch_id, user_id: userId, status: 'active' }
        });

        if (!batchMember) {
            throw new Error('You are not enrolled in this batch');
        }

        // Check if already graded (can't resubmit)
        const graded = await AssignmentSubmission.findOne({
            where: { assignment_id: assignmentId, student_id: studentId, status: 'graded' }
        });

        if (graded) {
            throw new Error('Cannot resubmit a graded assignment');
        }

        // Update or create submission
        const [submission, created] = await AssignmentSubmission.findOrCreate({
            where: { assignment_id: assignmentId, student_id: studentId },
            defaults: {
                assignment_id: assignmentId,
                student_id: studentId,
                user_id: userId,
                submission_text: data.submission_text,
                file_url: data.file_url,
                status: 'submitted',
            }
        });

        if (!created) {
            // Update existing
            await submission.update({
                submission_text: data.submission_text,
                file_url: data.file_url,
                status: 'submitted',
                submitted_date: new Date(),
            });
        }

        // Notify teacher
        try {
            await Notification.create({
                user_id: assignment.teacher_id,
                type: 'assignment_given',
                title: 'Assignment Submitted',
                message: `${studentId} has submitted: ${assignment.title}`,
                related_id: assignmentId,
            });
        } catch (err) {
            console.warn('Failed to notify teacher:', err.message);
        }

        return submission;
    }

    // Grade submission (VERIFY teacher is assignment owner)
    async gradeAssignment(submissionId, score, feedback, gradedByUserId) {
        const submission = await AssignmentSubmission.findByPk(submissionId);
        if (!submission) {
            throw new Error('Submission not found');
        }

        const assignment = await Assignment.findByPk(submission.assignment_id);

        // CRITICAL: Verify graded_by is the assignment teacher
        if (assignment.teacher_id !== gradedByUserId) {
            throw new Error('Only the assignment teacher can grade submissions');
        }

        // Update submission
        await submission.update({
            score,
            feedback,
            status: 'graded',
            graded_date: new Date(),
            graded_by: gradedByUserId,
        });

        // Notify student
        try {
            await Notification.create({
                user_id: submission.user_id,
                type: 'assignment_graded',
                title: 'Assignment Graded',
                message: `Your assignment has been graded. Score: ${score}/${assignment.max_score}`,
                related_id: assignment.id,
            });
        } catch (err) {
            console.warn('Failed to notify student on grading:', err.message);
        }

        return submission;
    }

    // Get student's submission for an assignment
    async getStudentSubmission(assignmentId, studentId) {
        return AssignmentSubmission.findOne({
            where: { assignment_id: assignmentId, student_id: studentId },
        });
    }

    // Get all submissions for an assignment (teacher view)
    async getAssignmentSubmissions(assignmentId) {
        return AssignmentSubmission.findAll({
            where: { assignment_id: assignmentId },
            order: [['submitted_date', 'DESC']],
        });
    }
}

module.exports = new AssignmentService();
