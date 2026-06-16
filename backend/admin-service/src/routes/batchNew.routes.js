const router = require('express').Router();
const ctrl = require('../controllers/BatchNewController');

// Batch CRUD
router.post('/batches', ctrl.createBatch);              // Create batch
router.get('/batches', ctrl.listBatches);              // List all batches
router.get('/batches/:batchId', ctrl.getBatch);        // Get batch details with members

// Student management in batch
router.post('/batches/:batchId/students', ctrl.addStudent);           // Add student
router.delete('/batches/:batchId/students/:userId', ctrl.removeStudent); // Remove student

// Class management
router.post('/batches/:batchId/classes', ctrl.createClass);                    // Create class
router.post('/batch-classes/:batchClassId/temp-teacher', ctrl.assignTempTeacher); // Assign temp teacher

module.exports = router;
