const router = require('express').Router();
const ctrl = require('../controllers/AdminBookOrderController');

// Admin endpoints for managing book orders
router.get('/book-orders', ctrl.list);
router.get('/book-orders/:id', ctrl.getOne);
router.patch('/book-orders/:id', ctrl.updateStatus);

module.exports = router;
