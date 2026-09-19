const { ContactMessage } = require('../models');
const { HttpError } = require('../middlewares/error');
const { validateEmail, validateName } = require('../lib/fieldValidation');

// "Send us a Message" — public capture + admin inbox reads.
//
// Validation lives in lib/fieldValidation so this form, signup and the lead
// capture all apply the SAME email rule and produce the same wording. The
// local regex this replaced accepted "a@b..c" and "a@-.x".

// Public submit from the Contact page (no auth). Validates the essentials and
// stores the message as 'new' for the admin to triage.
const capture = async (body = {}) => {
    const first_name = String(body.firstName ?? body.first_name ?? '').trim();
    const last_name = String(body.lastName ?? body.last_name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();

    const nameCheck = validateName(first_name, { field: 'firstName', label: 'First name' });
    if (!nameCheck.ok) throw new HttpError(422, nameCheck.message, { field: 'firstName' });
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) throw new HttpError(422, emailCheck.message, { field: 'email' });
    if (!message) throw new HttpError(422, 'Please enter a message.', { field: 'message' });

    await ContactMessage.create({
        first_name,
        last_name: last_name || null,
        email: emailCheck.value,
        subject: subject || null,
        message,
        status: 'new',
    });
    return { success: "Thanks for reaching out — we'll get back to you soon." };
};

const shape = (r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name || '',
    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    email: r.email,
    subject: r.subject || '',
    message: r.message,
    status: r.status,
    created_at: r.created_at,
});

// ---- Admin reads ----

const list = async ({ status } = {}) => {
    const where = {};
    if (status && status !== 'all') where.status = String(status);
    const rows = await ContactMessage.findAll({ where, order: [['id', 'DESC']], raw: true });
    const unread = await ContactMessage.count({ where: { status: 'new' } });
    return { messages: rows.map(shape), unread, total: rows.length };
};

const update = async (id, body = {}) => {
    const row = await ContactMessage.findByPk(Number(id));
    if (!row) throw new HttpError(404, 'Message not found.');
    if (body.status && ['new', 'read'].includes(body.status)) row.status = body.status;
    await row.save();
    return { success: 'Updated', message: shape(row.get({ plain: true })) };
};

const remove = async (id) => {
    const row = await ContactMessage.findByPk(Number(id));
    if (!row) throw new HttpError(404, 'Message not found.');
    await row.destroy();
    return { success: 'Deleted' };
};

module.exports = { capture, list, update, remove };
