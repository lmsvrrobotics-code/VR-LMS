const { Op, fn, col, QueryTypes } = require('sequelize');
const { Lead } = require('../models');
const authDb = require('../config/authDatabase');
const { HttpError } = require('../middlewares/error');
const studentService = require('./StudentService');
const env = require('../config/env');
const { enqueue } = require('../jobs/emailQueue');
const { studentWelcome } = require('../helpers/emailTemplates');
const publicId = require('../lib/uniqueId');

// Basic email shape check — capture is public so validate before storing.
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

// PUBLIC capture from the portal signup. Creates a lead (NO login). Idempotent
// per email while still "open": if an unconverted lead already exists for this
// email we return it instead of stacking duplicates, but we refresh details.
const capture = async (body = {}) => {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (!name) throw new HttpError(422, 'Name is required');
    if (!isEmail(email)) throw new HttpError(422, 'A valid email is required');

    const fields = {
        name,
        email,
        phone: body.phone ? String(body.phone).trim() : null,
        course_interest: body.course_interest ? String(body.course_interest).trim() : null,
        source: body.source ? String(body.source).trim() : 'signup',
        clg_id: body.clg_id ? String(body.clg_id) : null,
    };

    const existing = await Lead.findOne({
        where: { email, status: { [Op.in]: ['new', 'contacted'] } },
        order: [['created_at', 'DESC']],
    });
    if (existing) {
        await existing.update(fields);
        return { message: 'Thanks! Our team will contact you shortly.', lead: existing };
    }
    const lead = await Lead.create({ ...fields, status: 'new' });
    return { message: 'Thanks! Our team will contact you shortly.', lead };
};

// ADMIN: list with optional status filter + search.
//
// Each lead is tagged with has_account: true when a student login ALREADY exists
// for that email (a public self-signup — they registered themselves and are
// merely hidden from Manage Students until converted). The Convert UI uses this
// to skip the "set a password" step: those accounts already have a password the
// student chose, and convert() only links them. A lead with has_account=false is
// a pure enquiry with no login, so converting it must create one and DOES need a
// password.
//
// Resolved in ONE batched query over all the listed emails rather than a lookup
// per lead — a per-row check here would be a classic N+1 on a page the admin
// hits constantly.
// Once converted, the person IS a student and shows up in Manage Students —
// keeping them in the working Leads list is duplicate noise. So the default
// ("all") view means the ACTIVE pipeline: everything still needing follow-up,
// converted excluded. Asking for status=converted explicitly still returns them.
//
// The rows are NOT deleted: the lead is the audit trail of where the student came
// from (source, signup date, notes, converted_user_id). Hiding is reversible;
// deleting would destroy that history and orphan the student link.
const list = async ({ status, search } = {}) => {
    const where = {};
    if (status && status !== 'all') {
        where.status = status;
    } else {
        where.status = { [Op.ne]: 'converted' };
    }
    if (search) {
        const like = `%${String(search).trim()}%`;
        where[Op.or] = [
            { name: { [Op.iLike]: like } },
            { email: { [Op.iLike]: like } },
            { phone: { [Op.iLike]: like } },
        ];
    }
    const leads = await Lead.findAll({ where, order: [['created_at', 'DESC']], raw: true });

    const emails = [...new Set(leads.map((l) => String(l.email || '').toLowerCase()).filter(Boolean))];
    let withAccount = new Set();
    if (emails.length) {
        try {
            const rows = await authDb.query(
                `SELECT lower(u.email) AS email
                   FROM users u
                   JOIN roles r ON r."roleId" = u."roleId"
                  WHERE r.role = 'student' AND lower(u.email) IN (:emails)`,
                { replacements: { emails }, type: QueryTypes.SELECT },
            );
            withAccount = new Set(rows.map((r) => r.email));
        } catch (e) {
            // Non-fatal: fall back to "no account", which just means the admin is
            // asked for a password. Better a redundant prompt than a broken page.
            console.warn('[leads] account lookup failed:', e.message);
        }
    }

    return {
        leads: leads.map((l) => ({
            ...l,
            has_account: withAccount.has(String(l.email || '').toLowerCase()),
        })),
    };
};

// ADMIN: pipeline counts for the dashboard alert badge.
const stats = async () => {
    const rows = await Lead.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        group: ['status'],
        raw: true,
    });
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count) || 0]));
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, new: byStatus.new || 0, contacted: byStatus.contacted || 0, converted: byStatus.converted || 0, rejected: byStatus.rejected || 0 };
};

const VALID_STATUS = ['new', 'contacted', 'converted', 'rejected'];

// ADMIN: update follow-up fields. Status is NOT set to 'converted' here — that
// only happens via convert() which actually creates the account.
const update = async (id, body = {}) => {
    const lead = await Lead.findByPk(id);
    if (!lead) throw new HttpError(404, 'Lead not found');
    const patch = {};
    if (body.status !== undefined) {
        if (!VALID_STATUS.includes(body.status)) throw new HttpError(422, 'Invalid status');
        if (body.status === 'converted') throw new HttpError(422, 'Use Convert to create the student account');
        patch.status = body.status;
    }
    if (body.notes !== undefined) patch.notes = String(body.notes);
    if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to ? String(body.assigned_to) : null;
    await lead.update(patch);
    return { message: 'Lead updated', lead };
};

// ADMIN: convert a lead into a real student (creates their login) and mark it
// converted. Reuses StudentService.create so the account is identical to one an
// admin adds manually. Course assignment stays a separate step (Teacher
// Assignments). Admin supplies the password.
const convert = async (id, body = {}) => {
    const lead = await Lead.findByPk(id);
    if (!lead) throw new HttpError(404, 'Lead not found');
    if (lead.status === 'converted') throw new HttpError(409, 'Lead is already converted');

    // TWO kinds of lead reach this point:
    //
    //  a) Self-signup (POST /api/public/signup) — the person ALREADY has a
    //     student login; they were just hidden from Manage Students until now
    //     (see StudentService.HIDE_UNCONVERTED). Converting must LINK the
    //     existing account, not create one: studentService.create() rejects a
    //     duplicate email with "Email already in use", which would make their
    //     lead permanently unconvertible — and, because the filter keys off the
    //     open lead, permanently invisible.
    //
    //  b) Pure lead (contact/interest form, admin-entered) — no account exists,
    //     so we create it here as before. Only this path needs a password.
    const existing = await studentService.findStudentByEmail(lead.email);

    let student;
    let password = null;

    if (existing) {
        // Account already exists (self-signup) — it was created WITHOUT a public
        // id. Conversion is the moment the person becomes a student of record,
        // so issue the VRS id now. Idempotent: a lead that somehow reaches here
        // twice must not burn a second serial or overwrite the first id.
        student = existing;
        if (!existing.unique_id) {
            const issued = await publicId.generate('student');
            // The `AND unique_id IS NULL` guard makes this a no-op if a
            // concurrent convert already issued one, so the first id wins.
            await authDb.query(
                'UPDATE users SET unique_id = :uid, "updatedAt" = NOW() WHERE "userId" = :userId AND unique_id IS NULL',
                { replacements: { uid: issued, userId: String(existing.id) }, type: QueryTypes.UPDATE },
            );
            student = { ...existing, unique_id: issued };
        }
    } else {
        password = String(body.password || '');
        if (password.length < 8) throw new HttpError(422, 'Password must be at least 8 characters');

        const result = await studentService.create({
            name: lead.name,
            email: lead.email,
            password,
            phone: lead.phone || undefined,
            collegeId: body.collegeId || lead.clg_id || undefined,
        });
        student = result.student || {};
    }

    await lead.update({ status: 'converted', converted_user_id: String(student.id || '') || null });

    // Smooth onboarding: email the student their login details so they can sign
    // in immediately. Best-effort — a mail failure must NOT fail the conversion
    // the admin just saw succeed (the worker handles SMTP retries).
    // Only for newly-created accounts: a self-signup already chose their own
    // password, and we neither know it nor should overwrite it.
    if (password) {
        try {
            const { subject, html } = studentWelcome({
                studentName: lead.name,
                email: lead.email,
                password,
                loginUrl: env.mail?.lmsLoginUrl,
            });
            await enqueue({ to: lead.email, subject, html });
        } catch (e) {
            console.warn('[leads] welcome email enqueue failed:', e.message);
        }
    }

    return {
        message: password
            ? 'Lead converted — welcome email sent with login details'
            : 'Lead converted — existing account linked and added to Manage Students',
        student,
        lead,
    };
};

const remove = async (id) => {
    const lead = await Lead.findByPk(id);
    if (!lead) throw new HttpError(404, 'Lead not found');
    await lead.destroy();
    return { message: 'Lead removed' };
};

module.exports = { capture, list, stats, update, convert, remove };
