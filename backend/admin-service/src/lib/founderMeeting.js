/**
 * Pure validation + state logic for the "Weekly Meeting with Founder" feature.
 *
 * Kept out of the service so the rules that decide what the PUBLIC home page
 * shows — is the meeting live, upcoming or finished; is this link safe to
 * render — are testable without a database, a file upload or a clock.
 */

const BLANKS = new Set(['', 'null', 'undefined']);

const text = (v) => {
    const s = String(v ?? '').trim();
    return BLANKS.has(s.toLowerCase()) ? '' : s;
};

/** Accepts the many shapes a checkbox/select can arrive as over multipart. */
const toBool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

/**
 * A meeting link is rendered as an anchor on a public page, so only http(s)
 * is allowed. `javascript:` and `data:` URLs would otherwise become a stored
 * XSS vector that any admin — or anyone who compromised one — could plant.
 */
const normalizeLink = (raw, { field = 'meeting_link', label = 'Meeting link' } = {}) => {
    const value = text(raw);
    if (!value) return { ok: true, value: null };
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return { ok: false, field, message: `${label} must be a full link starting with https://.` };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { ok: false, field, message: `${label} must start with https:// or http://.` };
    }
    return { ok: true, value: parsed.toString() };
};

/** Parses a datetime-local / ISO string. Empty is allowed (no fixed slot). */
const normalizeScheduledAt = (raw, { field = 'scheduled_at', label = 'Date and time' } = {}) => {
    const value = text(raw);
    if (!value) return { ok: true, value: null };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return { ok: false, field, message: `${label} is not a valid date and time.` };
    }
    return { ok: true, value: d };
};

const normalizeDuration = (raw, { field = 'duration_mins', label = 'Duration' } = {}) => {
    const value = text(raw);
    if (!value) return { ok: true, value: 60 };
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { ok: false, field, message: `${label} must be a whole number of minutes.` };
    }
    if (n < 1) return { ok: false, field, message: `${label} must be at least 1 minute.` };
    // A day is already absurd for a meeting; beyond that it is a typo that
    // would keep the "live now" banner up for weeks.
    if (n > 1440) return { ok: false, field, message: `${label} cannot exceed 1440 minutes (24 hours).` };
    return { ok: true, value: n };
};

/**
 * Validate and normalise an admin submission.
 *
 * @param body    the request body (multipart: every value is a string)
 * @param partial true on update, where an omitted field means "leave as is"
 * @returns { ok: true, value } | { ok: false, field, message }
 */
const meetingPatch = (body = {}, { partial = false } = {}) => {
    const patch = {};

    if (!partial || body.title !== undefined) {
        const title = text(body.title);
        if (!title) return { ok: false, field: 'title', message: 'Title is required.' };
        if (title.length > 255) {
            return { ok: false, field: 'title', message: 'Title must be 255 characters or fewer.' };
        }
        patch.title = title;
    }

    if (!partial || body.description !== undefined) {
        patch.description = text(body.description) || null;
    }

    if (!partial || body.scheduled_at !== undefined) {
        const r = normalizeScheduledAt(body.scheduled_at);
        if (!r.ok) return r;
        patch.scheduled_at = r.value;
    }

    if (!partial || body.duration_mins !== undefined) {
        const r = normalizeDuration(body.duration_mins);
        if (!r.ok) return r;
        patch.duration_mins = r.value;
    }

    if (!partial || body.meeting_link !== undefined) {
        const r = normalizeLink(body.meeting_link);
        if (!r.ok) return r;
        patch.meeting_link = r.value;
    }

    if (!partial || body.registration_open !== undefined) {
        // Defaults to OPEN on create: a meeting nobody can register for is
        // rarely what an admin means by "add a meeting".
        patch.registration_open = partial ? toBool(body.registration_open)
            : (body.registration_open === undefined ? true : toBool(body.registration_open));
    }

    if (!partial || body.capacity !== undefined) {
        const cap = text(body.capacity);
        if (!cap) {
            patch.capacity = null; // unlimited
        } else {
            const n = Number(cap);
            if (!Number.isInteger(n) || n < 1) {
                return { ok: false, field: 'capacity', message: 'Capacity must be a whole number of seats, or blank for unlimited.' };
            }
            patch.capacity = n;
        }
    }

    if (!partial || body.is_featured !== undefined) {
        patch.is_featured = toBool(body.is_featured);
    }

    if (!partial || body.status !== undefined) {
        patch.status = body.status === '0' || body.status === 0 ? 0 : 1;
    }

    return { ok: true, value: patch };
};

/**
 * Where a meeting sits relative to `now`.
 *
 * 'live' spans [start, start + duration) so the join link stays available for
 * the whole call rather than disappearing the instant it begins.
 *
 * @returns 'unscheduled' | 'upcoming' | 'live' | 'past'
 */
const meetingState = (meeting, now = new Date()) => {
    const at = meeting?.scheduled_at ? new Date(meeting.scheduled_at) : null;
    if (!at || Number.isNaN(at.getTime())) return 'unscheduled';
    const mins = Number(meeting.duration_mins);
    const durationMs = (Number.isFinite(mins) && mins > 0 ? mins : 60) * 60 * 1000;
    const start = at.getTime();
    const t = now.getTime();
    if (t < start) return 'upcoming';
    if (t < start + durationMs) return 'live';
    return 'past';
};

/**
 * Shape a row for the PUBLIC home page.
 *
 * Deliberately narrow: only the fields the page renders. The join link is
 * withheld once the meeting has finished — a dead link presented as "Join now"
 * is worse than no button — and `state` is computed server-side so every
 * visitor sees the same answer regardless of their device clock.
 */
const publicPayload = (meeting, now = new Date()) => {
    if (!meeting) return null;
    const row = meeting.toJSON ? meeting.toJSON() : meeting;
    const state = meetingState(row, now);
    return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        scheduled_at: row.scheduled_at || null,
        duration_mins: Number(row.duration_mins) || 60,
        // The join link is DELIBERATELY not part of the public payload. It is
        // released only to someone who has registered (in the registration
        // response), so the meeting is not open to anyone who reads the page
        // source, and the admin knows who is attending in advance.
        video_url: row.video_url || null,
        poster_url: row.poster_url || null,
        state,
        // Whether the page should show the registration form. Seats-remaining
        // is filled in by the service, which is the only place that can count.
        can_register: canRegister(row, state),
        capacity: row.capacity == null ? null : Number(row.capacity),
    };
};

/**
 * Is registration available right now?
 *
 * Closed once the meeting has finished — a signup for a call that already
 * happened collects an address nobody will act on. `registration_open` is the
 * admin's manual switch on top of that.
 */
const canRegister = (meeting, state = null) => {
    if (!meeting) return false;
    const s = state || meetingState(meeting);
    if (s === 'past') return false;
    return meeting.registration_open !== false;
};

/**
 * Validate a public registration submission.
 *
 * Reuses lib/fieldValidation so the wording matches signup and the contact
 * form — the same person may meet all three.
 */
const registrationPatch = (body = {}, { trusted = false } = {}) => {
    const { validateEmail, validateName, validatePhone } = require('./fieldValidation');

    // `trusted` = a signed-in student registering themselves, where the name
    // comes from their verified account profile rather than a typed field. The
    // strict "no numbers" rule exists to catch junk in an anonymous public
    // form; applying it to a real profile name (e.g. "Student 4") would block
    // that student from ever registering. So we only require a non-empty name
    // here and skip the format rules — email is still validated below.
    let cleanName;
    if (trusted) {
        cleanName = text(body.name);
        if (!cleanName) return { ok: false, field: 'name', message: 'Full name is required.' };
        if (cleanName.length > 150) cleanName = cleanName.slice(0, 150);
    } else {
        const nameCheck = validateName(body.name, { field: 'name', label: 'Full name' });
        if (!nameCheck.ok) return nameCheck;
        cleanName = nameCheck.value;
    }

    const emailCheck = validateEmail(body.email);
    if (!emailCheck.ok) return emailCheck;

    // Optional: the admin can still reach a registrant by email.
    const phoneCheck = validatePhone(body.phone, { field: 'phone', label: 'Mobile number', required: false });
    if (!phoneCheck.ok) return phoneCheck;

    const message = text(body.message);
    if (message.length > 2000) {
        return { ok: false, field: 'message', message: 'Message must be 2000 characters or fewer.' };
    }

    return {
        ok: true,
        value: {
            name: cleanName,
            email: emailCheck.value,
            phone: phoneCheck.value || null,
            message: message || null,
        },
    };
};

module.exports = {
    toBool,
    canRegister,
    registrationPatch,
    normalizeLink,
    normalizeScheduledAt,
    normalizeDuration,
    meetingPatch,
    meetingState,
    publicPayload,
};
