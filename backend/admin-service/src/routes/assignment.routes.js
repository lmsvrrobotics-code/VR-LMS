const router = require('express').Router();
const ctrl = require('../controllers/AssignmentController');

// Teacher creates assignment
router.post('/assignments', ctrl.createAssignment);

// Get assignments for a batch
router.get('/batches/:batch_id/assignments', ctrl.getBatchAssignments);

// Get student assignments (all batches)
router.get('/my-assignments', ctrl.getStudentAssignments);

// Submit assignment
router.post('/assignments/:assignment_id/submit', ctrl.submitAssignment);

// Get student submission
router.get('/assignments/:assignment_id/submission', ctrl.getStudentSubmission);

// Get all submissions for assignment (teacher)
router.get('/assignments/:assignment_id/submissions', ctrl.getAssignmentSubmissions);

// Grade assignment (teacher)
router.patch('/submissions/:submission_id/grade', ctrl.gradeAssignment);

module.exports = router;
