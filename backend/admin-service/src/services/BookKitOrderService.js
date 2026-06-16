const axios = require('axios');
const { Book, Kit, BookOrder, KitOrder } = require('../models');
const { HttpError } = require('../middlewares/error');
const { verifyCheckoutSignature, verifyWebhookSignature } = require('./paymentLogic');
const settings = require('./SettingsService');

const RZP_API = 'https://api.razorpay.com/v1';

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

const authHeader = (keys) => ({
    Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
});

// Check if student already paid for a book
const hasBookOrder = async (userId, bookId) => {
    if (!userId || !bookId) return false;
    const row = await BookOrder.findOne({
        where: { user_id: String(userId), book_id: Number(bookId), status: 'paid' },
        attributes: ['id'],
    });
    return Boolean(row);
};

// Check if student already paid for a kit
const hasKitOrder = async (userId, kitId) => {
    if (!userId || !kitId) return false;
    const row = await KitOrder.findOne({
        where: { user_id: String(userId), kit_id: Number(kitId), status: 'paid' },
        attributes: ['id'],
    });
    return Boolean(row);
};

// Grant access for book order
const grantBookAccess = async (order, razorpayPaymentId) => {
    await order.update({ status: 'paid', razorpay_payment_id: razorpayPaymentId || order.razorpay_payment_id });
};

// Grant access for kit order
const grantKitAccess = async (order, razorpayPaymentId) => {
    await order.update({ status: 'paid', razorpay_payment_id: razorpayPaymentId || order.razorpay_payment_id });
};

// Create Razorpay order for a book
const createBookOrder = async ({ user, bookId }) => {
    await requireConfigured();
    const keys = await getKeys();
    const userId = String(user?.userId || user?.id || '');
    if (!userId) throw new HttpError(401, 'Sign in to purchase.');
    const bid = Number(bookId);
    if (!bid) throw new HttpError(422, 'book_id is required');

    const book = await Book.findByPk(bid);
    if (!book) throw new HttpError(404, 'Book not found');

    const rupees = Number(book.price || 0);
    if (!(rupees > 0)) throw new HttpError(422, 'This book is not available for purchase (no price set).');
    const amount = Math.round(rupees * 100);

    if (await hasBookOrder(userId, bid)) {
        return { alreadyPaid: true, message: 'You already have this book.' };
    }

    let order;
    try {
        const res = await axios.post(
            `${RZP_API}/orders`,
            { amount, currency: 'INR', receipt: `b${bid}_u${userId}_${Date.now()}`, notes: { book_id: String(bid), user_id: userId, type: 'book' } },
            { headers: authHeader(keys), timeout: 15000 },
        );
        order = res.data;
    } catch (e) {
        const msg = e.response?.data?.error?.description || e.message;
        console.warn('[book-orders] order create failed:', msg);
        throw new HttpError(502, 'Could not start payment. Please try again.');
    }

    await BookOrder.create({
        user_id: userId, book_id: bid, amount, currency: 'INR',
        status: 'created', razorpay_order_id: order.id,
    });

    return {
        order_id: order.id,
        amount,
        currency: 'INR',
        key_id: keys.keyId,
        book: { id: book.id, title: book.title },
    };
};

// Create Razorpay order for a kit
const createKitOrder = async ({ user, kitId }) => {
    await requireConfigured();
    const keys = await getKeys();
    const userId = String(user?.userId || user?.id || '');
    if (!userId) throw new HttpError(401, 'Sign in to purchase.');
    const kid = Number(kitId);
    if (!kid) throw new HttpError(422, 'kit_id is required');

    const kit = await Kit.findByPk(kid);
    if (!kit) throw new HttpError(404, 'Kit not found');

    const rupees = Number(kit.price || 0);
    if (!(rupees > 0)) throw new HttpError(422, 'This kit is not available for purchase (no price set).');
    const amount = Math.round(rupees * 100);

    if (await hasKitOrder(userId, kid)) {
        return { alreadyPaid: true, message: 'You already have this kit.' };
    }

    let order;
    try {
        const res = await axios.post(
            `${RZP_API}/orders`,
            { amount, currency: 'INR', receipt: `k${kid}_u${userId}_${Date.now()}`, notes: { kit_id: String(kid), user_id: userId, type: 'kit' } },
            { headers: authHeader(keys), timeout: 15000 },
        );
        order = res.data;
    } catch (e) {
        const msg = e.response?.data?.error?.description || e.message;
        console.warn('[kit-orders] order create failed:', msg);
        throw new HttpError(502, 'Could not start payment. Please try again.');
    }

    await KitOrder.create({
        user_id: userId, kit_id: kid, amount, currency: 'INR',
        status: 'created', razorpay_order_id: order.id,
    });

    return {
        order_id: order.id,
        amount,
        currency: 'INR',
        key_id: keys.keyId,
        kit: { id: kit.id, title: kit.title },
    };
};

// Verify and grant access for book order
const verifyAndGrantBook = async ({ user, orderId, paymentId, signature }) => {
    await requireConfigured();
    const keys = await getKeys();
    const userId = String(user?.userId || user?.id || '');
    const ok = verifyCheckoutSignature({ orderId, paymentId, signature, keySecret: keys.keySecret });
    if (!ok) throw new HttpError(400, 'Payment signature verification failed.');

    const order = await BookOrder.findOne({ where: { razorpay_order_id: orderId } });
    if (!order) throw new HttpError(404, 'Order not found.');
    if (String(order.user_id) !== userId) throw new HttpError(403, 'This order belongs to another account.');

    if (order.status !== 'paid') await grantBookAccess(order, paymentId);
    return { success: true, message: 'Payment successful — book order confirmed.' };
};

// Verify and grant access for kit order
const verifyAndGrantKit = async ({ user, orderId, paymentId, signature }) => {
    await requireConfigured();
    const keys = await getKeys();
    const userId = String(user?.userId || user?.id || '');
    const ok = verifyCheckoutSignature({ orderId, paymentId, signature, keySecret: keys.keySecret });
    if (!ok) throw new HttpError(400, 'Payment signature verification failed.');

    const order = await KitOrder.findOne({ where: { razorpay_order_id: orderId } });
    if (!order) throw new HttpError(404, 'Order not found.');
    if (String(order.user_id) !== userId) throw new HttpError(403, 'This order belongs to another account.');

    if (order.status !== 'paid') await grantKitAccess(order, paymentId);
    return { success: true, message: 'Payment successful — kit order confirmed.' };
};

// Webhook handling for both books and kits
const handleWebhook = async ({ rawBody, signature }) => {
    const keys = await getKeys();
    if (!keys.webhookSecret) {
        console.warn('[book-kit-orders] webhook hit but Razorpay webhook secret not set — ignoring');
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

    const notes = entity?.notes || {};
    const type = notes.type;

    if (['payment.captured', 'order.paid'].includes(event.event)) {
        if (type === 'book') {
            const order = await BookOrder.findOne({ where: { razorpay_order_id: orderId } });
            if (order && order.status !== 'paid') await grantBookAccess(order, paymentId);
        } else if (type === 'kit') {
            const order = await KitOrder.findOne({ where: { razorpay_order_id: orderId } });
            if (order && order.status !== 'paid') await grantKitAccess(order, paymentId);
        }
    } else if (event.event === 'payment.failed') {
        if (type === 'book') {
            const order = await BookOrder.findOne({ where: { razorpay_order_id: orderId } });
            if (order && order.status === 'created') await order.update({ status: 'failed' });
        } else if (type === 'kit') {
            const order = await KitOrder.findOne({ where: { razorpay_order_id: orderId } });
            if (order && order.status === 'created') await order.update({ status: 'failed' });
        }
    }
    return { ok: true };
};

module.exports = { createBookOrder, createKitOrder, verifyAndGrantBook, verifyAndGrantKit, handleWebhook, hasBookOrder, hasKitOrder };
