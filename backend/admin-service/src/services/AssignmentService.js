const { Assignment, AssignmentSubmission, Notification, Batch } = require('../models');

class AssignmentService {
    // Create assignment
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

        // Get batch members and send notifications
        const batch = await Batch.findOne({ where: { batch_id: data.batch_id } });
        if (batch) {
            const members = await batch.getBatchMembers({ where: { status: 'active' } });
            for (const member of members) {
                await Notification.create({
                    user_id: member.user_id,
                    type: 'assignment_given',
                    title: New Assignment: \,
                    message: Your teacher has assigned a new assignment: \,
                    related_id: assignment.id,
                });
            }
        }

        return assignment;
    }

    // Get assignments for batch
    async getAssignmentsByBatch(batchId) {
        return Assignment.findAll({
            where: { batch_id: batchId },
            order: [['due_date', 'DESC']],
        });
    }

    // Get assignments for student
    async getStudentAssignments(studentId) {
        const assignments = await Assignment.findAll({
            include: [
                {
                    model: Batch,
                    where: { batch_id: { [require('sequelize').Op.in]: [] } },
                },
                {
                    model: AssignmentSubmission,
                    where: { student_id: studentId },
                    required: false,
                }
            ],
            order: [['due_date', 'DESC']],
        });
        return assignments;
    }

    // Submit assignment
    async submitAssignment(assignmentId, studentId, userId, data) {
        const existing = await AssignmentSubmission.findOne({
            where: { assignment_id: assignmentId, student_id: studentId }
        });

        if (existing) {
            return AssignmentSubmission.update(
                {
                    submission_text: data.submission_text,
                    file_url: data.file_url,
                    status: 'submitted',
                    submitted_date: new Date(),
                },
                { where: { id: existing.id } }
            );
        }

        const submission = await AssignmentSubmission.create({
            assignment_id: assignmentId,
            student_id: studentId,
            user_id: userId,
            submission_text: data.submission_text,
            file_url: data.file_url,
            status: 'submitted',
        });

        // Notify teacher
        const assignment = await Assignment.findByPk(assignmentId);
        await Notification.create({
            user_id: assignment.teacher_id,
            type: 'assignment_given',
            title: 'Assignment Submitted',
            message: \Student has submitted assignment: \\,
            related_id: assignmentId,
        });

        return submission;
    }

    // Grade assignment
    async gradeAssignment(submissionId, score, feedback, gradedBy) {
        const submission = await AssignmentSubmission.update(
            {
                score,
                feedback,
                status: 'graded',
                graded_date: new Date(),
                graded_by: gradedBy,
            },
            { where: { id: submissionId }, returning: true }
        );

        // Notify student
        const updated = await AssignmentSubmission.findByPk(submissionId);
        await Notification.create({
            user_id: updated.user_id,
            type: 'assignment_graded',
            title: 'Assignment Graded',
            message: \Your assignment has been graded. Score: \\,
            related_id: updated.assignment_id,
        });

        return submission;
    }

    // Get student submission
    async getStudentSubmission(assignmentId, studentId) {
        return AssignmentSubmission.findOne({
            where: { assignment_id: assignmentId, student_id: studentId },
        });
    }

    // Get submissions for assignment
    async getAssignmentSubmissions(assignmentId) {
        return AssignmentSubmission.findAll({
            where: { assignment_id: assignmentId },
            order: [['submitted_date', 'DESC']],
        });
    }
}

module.exports = new AssignmentService();
