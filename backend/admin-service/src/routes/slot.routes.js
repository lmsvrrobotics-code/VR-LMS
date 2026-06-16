const router = require('express').Router();
const ctrl = require('../controllers/SlotController');

// Admin: Create and manage slots
router.post('/slots', ctrl.createSlot);                    // Create slot
router.get('/slots', ctrl.listSlots);                      // List all slots
router.get('/slots/by-date-range', ctrl.getSlotsByDateRange); // Get slots for calendar
router.get('/slots/:slotId', ctrl.getSlot);                // Get slot details

// Admin: Mark attendance
router.patch('/slot-enrollments/:enrollmentId/attended', ctrl.markAttended);

// Student: Enroll and manage
router.post('/slots/:slotId/enroll', ctrl.enrollSlot);     // Enroll in slot
router.delete('/slot-enrollments/:enrollmentId/slots/:slotId', ctrl.cancelEnrollment); // Cancel enrollment

module.exports = router;
