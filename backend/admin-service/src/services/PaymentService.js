const axios = require('axios');
const { Payment, Course, UserProgress } = require('../models');
const { HttpError } = require('../middlewares/error');
const { verifyCheckoutSignature, verifyWebhookSignature } = require('./paymentLogic');
const cache = require('../config/cache');
const settings = require('./SettingsService');

const RZP_API = 'https://api.razorpay.com/v1';

// Keys come from SettingsService (DB-pasted by admin, else .env). Resolved
// fresh per call (cached 30s inside SettingsService).
const getKeys = () => settings.getPaymentConfig();
const isConfigured = async () => {
    const k = await getKeys();
    return Boolean(k.keyId && k.keySecret);
};
const requireConfigured = async () => {
    if (!(await isConfigured())) {
        throw new HttpError(503, 'Payments are not configured. Add your Razorpay keys in Admin → Settings.');
    }
};

// Basic-auth header for Razorpay's REST API (key_id:key_secret).
const authHeader = (keys) => ({
    Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
});

// Has this student already paid for this course?
const hasPaid = async (userId, courseId) => {
    if (!userId || !courseId) return false;
    const row = await Payment.findOne({
        where: { user_id: String(userId), course_id: Number(courseId), status: 'paid' },
        attributes: ['id'],
    });
    return Boolean(row);
};

// Grant access once a payment is confirmed: mark the row paid + flip the
// student's enrollment flag (best-effort) so existing enrolment checks agree.
const grantAccess = async (payment, razorpayPaymentId) => {
    await payment.update({ status: 'paid', razorpay_payment_id: razorpayPaymentId || payment.razorpay_payment_id });
    try {
        await UserProgress.update(
            { enrolled: true },
            { where: { user_id: String(payment.user_id), course_id: Number(payment.course_id) } },
        );
    } catch (e) {
        console.warn('[payments] enrollment flag update failed:', e.message);
    }
    // Bust the buyer's My Courses cache so the purchased course shows at once.
    try { await cache.del(`mycourses:${String(payment.user_id)}`); } catch { /* non-fatal */ }
};

// Step 1 — create a Razorpay order for a course and persist a 'created' Payment.
const createOrder = async ({ user, courseId }) => {
    await requireConfigured();
    const keys = await getKeys();
    const userId = String(user?.userId || user?.id || '');
    if (!userId) throw new HttpError(401, 'Sign in to purchase.');
    const cid = Number(courseId);
    if (!cid) throw new HttpError(422, 'course_id is required');

    const course = await Course.findByPk(cid);
    if (!course) throw new HttpError(404, 'Course not found');

    // Price comes from the course (discounted price wins when set). Amount is in
    // paise. A zero-price course shouldn't reach checkout.
    const rupees = Number(course.discounted_price) > 0 ? Number(course.discounted_price) : Number(course.price || 0);
    if (!(rupees > 0)) throw new HttpError(422, 'This course is not purchasable (no price set).');
    const amount = Math.round(rupees * 100);

    if (await hasPaid(userId, cid)) {
        return { alreadyPaid: true, message: 'You already own this course.' };
    }

    let order;
    try {
        const res = await axios.post(
            `${RZP_API}/orders`,
            { amount, currency: 'INR', receipt: `c${cid}_u${userId}_${Date.now()}`, notes: { course_id: String(cid), user_id: userId } },
            { headers: authHeader(keys), timeout: 15000 },
        );
        order = res.data;
    } catch (e) {
        const msg = e.response?.data?.error?.description || e.message;
        console.warn('[payments] order create failed:', msg);
        throw new HttpError(502, 'Could not start payment. Please try again.');
    }

    await Payment.create({
        user_id: userId, course_id: cid, amount, currency: 'INR',
        status: 'created', razorpay_order_id: order.id,
    });

    // key_id is returned so the browser checkout can open without hardcoding it.
    return {
        order_id: order.id,
        amount,
        currency: 'INR',
        key_id: keys.keyId,
        course: { id: course.id, title: course.title },
    };
};

// Step 2 — verify the checkout handler response and grant access synchronously
// (the webhook is the backup/authoritative path).
const verifyAndGrant = async ({ user, orderId, paymentId, signature }) => {
    await requireConfigured();
    const keys = await getKeys();
    const userId = String(user?.userId || user?.id || '');
    const ok = verifyCheckoutSignature({ orderId, paymentId, signature, keySecret: keys.keySecret });
    if (!ok) throw new HttpError(400, 'Payment signature verification failed.');

    const payment = await Payment.findOne({ where: { razorpay_order_id: orderId } });
    if (!payment) throw new HttpError(404, 'Order not found.');
    if (String(payment.user_id) !== userId) throw new HttpError(403, 'This order belongs to another account.');

    if (payment.status !== 'paid') await grantAccess(payment, paymentId);
    return { success: true, message: 'Payment successful — you now have access.' };
};

// Webhook — authoritative confirmation from Razorpay. Verifies the HMAC over the
// raw body and grants access on payment.captured / order.paid.
const handleWebhook = async ({ rawBody, signature }) => {
    const keys = await getKeys();
    if (!keys.webhookSecret) {
        console.warn('[payments] webhook hit but Razorpay webhook secret not set — ignoring');
        return { ignored: true };
    }
    const ok = verifyWebhookSignature({ rawBody, signature, webhookSecret: keys.webhookSecret });
    if (!ok) throw new HttpError(400, 'Invalid webhook signature');

    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { throw new HttpError(400, 'Bad webhook body'); }

    const entity = event?.payload?.payment?.entity || event?.payload?.order?.entity;
    const orderId = entity?.order_id || entity?.id;
    const paymentId = event?.payload?.payment?.entity?.id || null;
    if (!orderId) return { ignored: true };

    if (['payment.captured', 'order.paid'].includes(event.event)) {
        const payment = await Payment.findOne({ where: { razorpay_order_id: orderId } });
        if (payment && payment.status !== 'paid') await grantAccess(payment, paymentId);
    } else if (event.event === 'payment.failed') {
        const payment = await Payment.findOne({ where: { razorpay_order_id: orderId } });
        if (payment && payment.status === 'created') await payment.update({ status: 'failed' });
    }
    return { ok: true };
};

module.exports = { isConfigured, hasPaid, createOrder, verifyAndGrant, handleWebhook };
