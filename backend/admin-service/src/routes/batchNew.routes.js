const router = require('express').Router();
const ctrl = require('../controllers/BatchNewController');

// Batch CRUD (1 course + 1 teacher + many students)
router.post('/batches', ctrl.createBatch);              // Create batch
router.get('/batches', ctrl.listBatches);              // List all batches
router.get('/batches/:batchId', ctrl.getBatch);        // Get batch details

// Student management in batch
router.post('/batches/:batchId/students', ctrl.addStudent);           // Add student
router.delete('/batches/:batchId/students/:userId', ctrl.removeStudent); // Remove student

// Teacher management (1 teacher per batch)
router.put('/batches/:batchId/teacher', ctrl.updateTeacher);        // Update batch teacher

// Class management
router.post('/batches/:batchId/classes', ctrl.createClass);         // Create class

module.exports = router;
