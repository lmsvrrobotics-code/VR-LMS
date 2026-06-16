const router = require('express').Router();
const ctrl = require('../controllers/AdminKitOrderController');

// Admin endpoints for managing kit orders
router.get('/kit-orders', ctrl.list);
router.get('/kit-orders/:id', ctrl.getOne);
router.patch('/kit-orders/:id', ctrl.updateStatus);

module.exports = router;
