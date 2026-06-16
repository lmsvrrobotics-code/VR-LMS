const router = require('express').Router();
const orderCtrl = require('../controllers/BookKitOrderController');

// Public endpoints for students to purchase books/kits
router.post('/books-orders/order', orderCtrl.createBookOrder);
router.post('/books-orders/verify', orderCtrl.verifyBookPayment);
router.post('/kits-orders/order', orderCtrl.createKitOrder);
router.post('/kits-orders/verify', orderCtrl.verifyKitPayment);
router.post('/book-kit-orders/webhook', orderCtrl.webhook);

module.exports = router;
