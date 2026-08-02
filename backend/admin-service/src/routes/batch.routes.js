const joi = require('joi');
const router = require('express').Router();
const ctrl = require('../controllers/BatchController');
const { adminOnly, auth } = require('../middlewares/auth');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// List batches (with pagination, search, filtering)
router.get('/batches', adminOnly, ctrl.index);

// Create new batch
router.post('/batches', adminOnly, validateBody(schemas.createBatch), ctrl.store);

// Get eligible students for batch creation (college-scoped).
// MUST stay above '/batches/:id': Express matches in declaration order, so with
// this route below it, GET /batches/eligible-students was captured by :id with
// id="eligible-students" and died in idParam validation ("id must be a number")
// — the batch form's student picker showed "Parameter validation failed"
// instead of a list. Any new literal /batches/<word> route goes here too.
router.get('/batches/eligible-students', adminOnly, ctrl.listEligibleStudents);

// Teachers assignable to a batch (also above '/batches/:id' — see note above).
router.get('/batches/eligible-teachers', adminOnly, ctrl.listEligibleTeachers);

// Get batch details
router.get('/batches/:id', adminOnly, validateParams(schemas.idParam), ctrl.show);

// Update batch
router.patch('/batches/:id', adminOnly, validateParams(schemas.idParam), validateBody(schemas.updateBatch), ctrl.update);

// Delete batch
router.delete('/batches/:id', adminOnly, validateParams(schemas.idParam), ctrl.delete);

// Add students to batch
router.post('/batches/:id/members', adminOnly, validateParams(schemas.idParam), validateBody(schemas.addBatchMembers), ctrl.addStudents);

// Remove student from batch
router.delete('/batches/:id/members/:studentId', adminOnly, validateParams(joi.object({
  id: schemas.idParam.extract('id'),
  studentId: schemas.idParam.extract('id'),
})), ctrl.removeStudent);

// Add teachers to batch
router.post('/batches/:id/teachers', adminOnly, validateParams(schemas.idParam), validateBody(schemas.addBatchTeachers), ctrl.addTeachers);

// Remove teacher from batch
router.delete('/batches/:id/teachers/:teacherId', adminOnly, validateParams(joi.object({
  id: schemas.idParam.extract('id'),
  teacherId: schemas.idParam.extract('id'),
})), ctrl.removeTeacher);

// Assign temporary teacher to a class
router.post('/batches/:id/classes/:classId/temporary-teacher', adminOnly, validateParams(joi.object({
  id: schemas.idParam.extract('id'),
  classId: schemas.idParam.extract('id'),
})), ctrl.assignTemporaryTeacher);

// --- Lesson release (TEACHER-reachable) -------------------------------------
// These three are exported on their OWN router because the main one above is
// mounted behind a blanket `adminOnly` in server.js — a teacher hitting it gets
// 403 before any per-route middleware runs. Releasing is precisely a teacher's
// job, so server.js mounts `releaseRouter` with `adminOrTeacher` instead.
// Authorization is NOT weakened: BatchService verifies the caller is an admin
// or a teacher actually attached to that batch before writing.
//
// :id accepts the numeric PK, batch_id or unique_id, so it is NOT idParam
// (unique ids look like "VR-B-00001" and would fail numeric validation).
const releaseRouter = require('express').Router();
const batchKeyParam = joi.object({ id: joi.string().max(100).required() });
const lessonIdBody = joi.object({ lesson_id: joi.number().integer().positive().required() });

releaseRouter.post('/batches/:id/release-lesson', validateParams(batchKeyParam), validateBody(lessonIdBody), ctrl.releaseLesson);
releaseRouter.post('/batches/:id/revoke-lesson', validateParams(batchKeyParam), validateBody(lessonIdBody), ctrl.revokeLesson);
releaseRouter.get('/batches/:id/releases', validateParams(batchKeyParam), ctrl.listReleases);

module.exports = router;
module.exports.releaseRouter = releaseRouter;
