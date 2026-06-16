const svc = require('../services/BookKitOrderService');
const { asyncHandler } = require('../middlewares/error');

exports.createBookOrder = asyncHandler(async (req, res) => {
    res.json(await svc.createBookOrder({ user: req.authUser || { userId: req.verifiedUserId }, bookId: req.body.book_id }));
});

exports.createKitOrder = asyncHandler(async (req, res) => {
    res.json(await svc.createKitOrder({ user: req.authUser || { userId: req.verifiedUserId }, kitId: req.body.kit_id }));
});

exports.verifyBookPayment = asyncHandler(async (req, res) => {
    res.json(await svc.verifyAndGrantBook({
        user: req.authUser || { userId: req.verifiedUserId },
        orderId: req.body.razorpay_order_id,
        paymentId: req.body.razorpay_payment_id,
        signature: req.body.razorpay_signature,
    }));
});

exports.verifyKitPayment = asyncHandler(async (req, res) => {
    res.json(await svc.verifyAndGrantKit({
        user: req.authUser || { userId: req.verifiedUserId },
        orderId: req.body.razorpay_order_id,
        paymentId: req.body.razorpay_payment_id,
        signature: req.body.razorpay_signature,
    }));
});

exports.webhook = asyncHandler(async (req, res) => {
    const result = await svc.handleWebhook({
        rawBody: req.rawBody,
        signature: req.headers['x-razorpay-signature'],
    });
    res.json(result);
});
