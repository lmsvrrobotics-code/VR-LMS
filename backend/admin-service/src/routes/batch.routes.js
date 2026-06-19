const router = require('express').Router();
const ctrl = require('../controllers/BatchController');
const { adminOnly, auth } = require('../middlewares/auth');

// List batches (with pagination, search, filtering)
router.get('/batches', adminOnly, ctrl.index);

// Create new batch
router.post('/batches', adminOnly, ctrl.store);

// Get batch details
router.get('/batches/:id', adminOnly, ctrl.show);

// Update batch
router.patch('/batches/:id', adminOnly, ctrl.update);

// Delete batch
router.delete('/batches/:id', adminOnly, ctrl.delete);

// Add students to batch
router.post('/batches/:id/members', adminOnly, ctrl.addStudents);

// Remove student from batch
router.delete('/batches/:id/members/:studentId', adminOnly, ctrl.removeStudent);

// Assign temporary teacher to a class
router.post('/batches/:id/classes/:classId/temporary-teacher', adminOnly, ctrl.assignTemporaryTeacher);

// Teacher releases a lesson to the batch
router.post('/batches/:id/release-lesson', auth, ctrl.releaseLesson);

// Get eligible students for batch creation (college-scoped)
router.get('/batches/eligible-students', adminOnly, ctrl.listEligibleStudents);

module.exports = router;
