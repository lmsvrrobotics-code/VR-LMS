const AssignmentService = require('../services/AssignmentService');

class AssignmentController {
    // Teacher creates assignment (admin auth required)
    async createAssignment(req, res) {
        try {
            const { batch_id, course_id, title, description, instructions, due_date, max_score, file_url } = req.body;
            const teacher_id = req.authUser?.userId; // From verified JWT

            if (!batch_id || !course_id || !title || !due_date) {
                return res.status(400).json({ error: 'Missing required fields: batch_id, course_id, title, due_date' });
            }

            if (!teacher_id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const assignment = await AssignmentService.createAssignment({
                batch_id,
                course_id,
                teacher_id,
                title,
                description,
                instructions,
                due_date: new Date(due_date),
                max_score: max_score || 100,
                file_url,
            });

            res.status(201).json({ success: true, assignment });
        } catch (error) {
            console.error('Error creating assignment:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get assignments for batch (teacher/admin view)
    async getBatchAssignments(req, res) {
        try {
            const { batch_id } = req.params;

            if (!batch_id) {
                return res.status(400).json({ error: 'batch_id required' });
            }

            const assignments = await AssignmentService.getAssignmentsByBatch(batch_id);
            res.json({ success: true, assignments });
        } catch (error) {
            console.error('Error fetching assignments:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get student assignments (student view - filtered by their batches)
    async getStudentAssignments(req, res) {
        try {
            const user_id = req.authUser?.userId; // From verified JWT

            if (!user_id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const assignments = await AssignmentService.getStudentAssignments(user_id);
            res.json({ success: true, assignments });
        } catch (error) {
            console.error('Error fetching assignments:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Student submits assignment (requires verified JWT)
    async submitAssignment(req, res) {
        try {
            const { assignment_id } = req.params;
            const { submission_text, file_url } = req.body;
            const user_id = req.authUser?.userId; // From verified JWT

            if (!assignment_id) {
                return res.status(400).json({ error: 'assignment_id required' });
            }

            if (!user_id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            if (!submission_text && !file_url) {
                return res.status(400).json({ error: 'Submission must have text or file' });
            }

            // Get student_id from batch membership (don't trust request body)
            const { BatchMember } = require('../models');
            const member = await BatchMember.findOne({ where: { user_id } });

            if (!member) {
                return res.status(403).json({ error: 'Not a member of any batch' });
            }

            // student_id is a legacy column and is NULL on rosters written by
            // the current batch code, which made every submission fail on a
            // notNull violation. The JWT-verified user_id is the identity that
            // always exists, so fall back to it.
            const submission = await AssignmentService.submitAssignment(
                assignment_id,
                member.student_id || user_id,
                user_id,
                { submission_text, file_url }
            );

            res.status(201).json({ success: true, submission });
        } catch (error) {
            console.error('Error submitting assignment:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Grade assignment (teacher only - verified in service)
    async gradeAssignment(req, res) {
        try {
            const { submission_id } = req.params;
            const { score, feedback } = req.body;
            const graded_by_user_id = req.authUser?.userId; // From verified JWT

            if (!submission_id) {
                return res.status(400).json({ error: 'submission_id required' });
            }

            if (score === undefined || score === null) {
                return res.status(400).json({ error: 'Score is required' });
            }

            if (!graded_by_user_id) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const submission = await AssignmentService.gradeAssignment(
                submission_id,
                score,
                feedback || '',
                graded_by_user_id
            );

            res.json({ success: true, submission });
        } catch (error) {
            console.error('Error grading assignment:', error);
            res.status(error.message.includes('only the assignment teacher') ? 403 : 500).json({
                error: error.message
            });
        }
    }

    // Get student submission for an assignment
    async getStudentSubmission(req, res) {
        try {
            const { assignment_id } = req.params;
            const user_id = req.authUser?.userId;

            if (!assignment_id || !user_id) {
                return res.status(400).json({ error: 'assignment_id and authentication required' });
            }

            // Get student_id from batch membership
            const { BatchMember } = require('../models');
            const member = await BatchMember.findOne({ where: { user_id } });

            if (!member) {
                return res.status(403).json({ error: 'Not a member of any batch' });
            }

            // Same legacy-null fallback as submitAssignment above.
            const submission = await AssignmentService.getStudentSubmission(assignment_id, member.student_id || user_id);
            res.json({ success: true, submission });
        } catch (error) {
            console.error('Error fetching submission:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Get all submissions for an assignment (teacher view)
    async getAssignmentSubmissions(req, res) {
        try {
            const { assignment_id } = req.params;

            if (!assignment_id) {
                return res.status(400).json({ error: 'assignment_id required' });
            }

            const submissions = await AssignmentService.getAssignmentSubmissions(assignment_id);
            res.json({ success: true, submissions });
        } catch (error) {
            console.error('Error fetching submissions:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new AssignmentController();
