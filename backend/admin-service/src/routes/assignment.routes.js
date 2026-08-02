const joi = require('joi');
const router = require('express').Router();
const ctrl = require('../controllers/AssignmentController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Teacher creates assignment
router.post('/assignments', validateBody(schemas.createAssignment), ctrl.createAssignment);

// Get assignments for a batch
router.get('/batches/:batch_id/assignments', validateParams(joi.object({ batch_id: schemas.idParam.extract('id') })), ctrl.getBatchAssignments);

// Get student assignments (all batches)
router.get('/my-assignments', ctrl.getStudentAssignments);

// Submit assignment
router.post('/assignments/:assignment_id/submit', validateParams(joi.object({ assignment_id: schemas.idParam.extract('id') })), validateBody(schemas.submitAssignment), ctrl.submitAssignment);

// Get student submission
router.get('/assignments/:assignment_id/submission', validateParams(joi.object({ assignment_id: schemas.idParam.extract('id') })), ctrl.getStudentSubmission);

// Get all submissions for assignment (teacher)
router.get('/assignments/:assignment_id/submissions', validateParams(joi.object({ assignment_id: schemas.idParam.extract('id') })), ctrl.getAssignmentSubmissions);

// Grade assignment (teacher)
router.patch('/submissions/:submission_id/grade', validateParams(joi.object({ submission_id: schemas.idParam.extract('id') })), ctrl.gradeAssignment);

module.exports = router;
