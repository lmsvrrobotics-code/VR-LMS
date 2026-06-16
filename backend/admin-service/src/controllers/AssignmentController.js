const AssignmentService = require('../services/AssignmentService');
const { Assignment } = require('../models');

class AssignmentController {
    // Teacher creates assignment
    async createAssignment(req, res) {
        try {
            const { batch_id, course_id, title, description, instructions, due_date, max_score, file_url } = req.body;
            const teacher_id = req.user?.id || req.headers['x-user-id'];

            if (!batch_id || !course_id || !title || !due_date) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const assignment = await AssignmentService.createAssignment({
                batch_id,
                course_id,
                teacher_id,
                title,
                description,
                instructions,
                due_date: new Date(due_date),
                max_score,
                file_url,
            });

            res.status(201).json({ success: true, assignment });
        } catch (error) {
            console.error('Error creating assignment:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get assignments for batch
    async getBatchAssignments(req, res) {
        try {
            const { batch_id } = req.params;
            const assignments = await AssignmentService.getAssignmentsByBatch(batch_id);
            res.json({ success: true, assignments });
        } catch (error) {
            console.error('Error fetching assignments:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get student assignments
    async getStudentAssignments(req, res) {
        try {
            const student_id = req.user?.id || req.headers['x-user-id'];
            const assignments = await Assignment.findAll({
                include: [{
                    model: require('../models').AssignmentSubmission,
                    where: { student_id },
                    required: false,
                }],
                order: [['due_date', 'DESC']],
            });
            res.json({ success: true, assignments });
        } catch (error) {
            console.error('Error fetching assignments:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Submit assignment
    async submitAssignment(req, res) {
        try {
            const { assignment_id } = req.params;
            const { submission_text, file_url } = req.body;
            const student_id = req.body.student_id || req.headers['x-student-id'];
            const user_id = req.user?.id || req.headers['x-user-id'];

            if (!assignment_id || !student_id) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const submission = await AssignmentService.submitAssignment(
                assignment_id,
                student_id,
                user_id,
                { submission_text, file_url }
            );

            res.status(201).json({ success: true, submission });
        } catch (error) {
            console.error('Error submitting assignment:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Grade assignment (teacher only)
    async gradeAssignment(req, res) {
        try {
            const { submission_id } = req.params;
            const { score, feedback } = req.body;
            const graded_by = req.user?.id || req.headers['x-user-id'];

            if (score === undefined || score === null) {
                return res.status(400).json({ error: 'Score is required' });
            }

            const submission = await AssignmentService.gradeAssignment(
                submission_id,
                score,
                feedback || '',
                graded_by
            );

            res.json({ success: true, submission });
        } catch (error) {
            console.error('Error grading assignment:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get student submission
    async getStudentSubmission(req, res) {
        try {
            const { assignment_id } = req.params;
            const student_id = req.headers['x-student-id'];

            if (!student_id) {
                return res.status(400).json({ error: 'student_id required' });
            }

            const submission = await AssignmentService.getStudentSubmission(assignment_id, student_id);
            res.json({ success: true, submission });
        } catch (error) {
            console.error('Error fetching submission:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get submissions for assignment
    async getAssignmentSubmissions(req, res) {
        try {
            const { assignment_id } = req.params;
            const submissions = await AssignmentService.getAssignmentSubmissions(assignment_id);
            res.json({ success: true, submissions });
        } catch (error) {
            console.error('Error fetching submissions:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new AssignmentController();
