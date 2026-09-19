const { Op } = require('sequelize');
const { FounderMeeting, FounderMeetingRegistration } = require('../models');
const { upload, removeFile, niceFileName } = require('../helpers/fileUploader');
const { HttpError } = require('../middlewares/error');
const { meetingPatch, publicPayload, canRegister, registrationPatch } = require('../lib/founderMeeting');
const posterSeed = require('./FounderPosterSeed');

// "Weekly Meeting with Founder" — admin CRUD plus the single featured row the
// public home page renders under the hero.
//
// Upload pipeline mirrors DemoVideoService: video → Bunny (embed URL),
// image → R2 (public URL). Validation lives in lib/founderMeeting so the rules
// are testable without a DB or a file.

const PER_PAGE = 10;

// Upcoming first, then the rest newest-first, so the admin list opens on what
// is about to happen rather than on ancient history.
const ORDER = () => [
    ['is_featured', 'DESC'],
    [FounderMeeting.sequelize.literal('CASE WHEN "scheduled_at" IS NULL THEN 1 ELSE 0 END'), 'ASC'],
    ['scheduled_at', 'DESC'],
    ['id', 'DESC'],
];

/**
 * Store one uploaded file and return the column it belongs in.
 * `video` and `poster` are separate form fields, so the destination is known
 * from the field name rather than sniffed from the mimetype.
 */
const storeUpload = async (file, kind, title) => {
    const ext = (file.originalname || '').split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg');
    const folder = kind === 'video' ? 'founder/videos' : 'founder/posters';
    const destPath = `uploads/${folder}/${niceFileName(title || 'founder-meeting', ext)}`;
    // Images get resized; videos are passed through untouched.
    return upload(file, destPath, kind === 'video' ? null : 1600, kind === 'video' ? null : 900);
};

/**
 * Only one meeting may be featured. The DB has a partial unique index as the
 * real guard (migration 24); this clears the previous holder first so that
 * featuring a new meeting is a one-click action rather than an error the admin
 * has to resolve by hand.
 */
const clearOtherFeatured = async (exceptId) => {
    const where = exceptId ? { id: { [Op.ne]: exceptId } } : {};
    await FounderMeeting.update({ is_featured: false }, { where });
};

const list = async ({ page = 1, search } = {}) => {
    const limit = PER_PAGE;
    const offset = (Number(page) - 1) * limit;
    try {
        const where = {};
        if (search) where.title = { [Op.iLike]: `%${search}%` };
        const { count, rows } = await FounderMeeting.findAndCountAll({
            where, order: ORDER(), limit, offset,
        });
        return {
            meetings: {
                data: rows,
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        // The admin list degrades to empty rather than 500ing the whole page
        // when the table is missing (migration not yet applied).
        console.warn('[founder-meetings] list failed:', err.message);
        return {
            meetings: {
                data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1,
            },
        };
    }
};

/**
 * The one meeting the public home page shows: featured and published.
 * Returns null when nothing is featured, so the home page simply omits the
 * section rather than rendering an empty shell.
 */
const featuredPublic = async (now = new Date()) => {
    try {
        const row = await FounderMeeting.findOne({
            where: { is_featured: true, status: 1 },
            order: [['id', 'DESC']],
        });
        const payload = publicPayload(row, now);
        // Rows created before a default was seeded still get one at read time,
        // so seeding the image retro-fits every existing meeting.
        if (payload && !payload.poster_url) {
            payload.poster_url = (await posterSeed.getDefaultPosterUrl()) || null;
        }
        if (payload) {
            // Seats are counted here, not in the pure payload helper, because
            // only the service can reach the registrations table.
            const taken = await FounderMeetingRegistration.count({
                where: { meeting_id: row.id, status: { [Op.ne]: 'cancelled' } },
            });
            payload.registered_count = taken;
            payload.seats_left = payload.capacity == null
                ? null
                : Math.max(0, payload.capacity - taken);
            // A full meeting closes registration even though the admin switch
            // is still on.
            if (payload.seats_left === 0) payload.can_register = false;
        }
        return { meeting: payload };
    } catch (err) {
        console.warn('[founder-meetings] public read failed:', err.message);
        return { meeting: null };
    }
};

const get = async (id) => {
    const item = await FounderMeeting.findOne({ where: { id } });
    if (!item) throw new HttpError(404, 'Meeting not found.');
    return { item };
};

const create = async ({ body = {}, files = {} }) => {
    const checked = meetingPatch(body);
    if (!checked.ok) throw new HttpError(422, checked.message, { field: checked.field });
    const data = { ...checked.value, video_url: null, poster_url: null };

    if (files.video?.[0]) data.video_url = await storeUpload(files.video[0], 'video', data.title);
    if (files.poster?.[0]) {
        data.poster_url = await storeUpload(files.poster[0], 'poster', data.title);
    } else {
        // No poster uploaded → inherit the shared default from R2, so the row
        // stores a real URL rather than depending on a file being present on
        // the web server. Empty when no default has been seeded, which simply
        // means this meeting has no poster.
        data.poster_url = (await posterSeed.getDefaultPosterUrl()) || null;
    }

    // Clear the previous holder BEFORE inserting, or the partial unique index
    // rejects the insert.
    if (data.is_featured) await clearOtherFeatured(null);

    const item = await FounderMeeting.create(data);
    return { success: 'Meeting saved successfully.', item };
};

const update = async ({ id, body = {}, files = {} }) => {
    const item = await FounderMeeting.findOne({ where: { id } });
    if (!item) throw new HttpError(404, 'Meeting not found.');

    const checked = meetingPatch(body, { partial: true });
    if (!checked.ok) throw new HttpError(422, checked.message, { field: checked.field });
    const next = { ...checked.value };

    // Replacing a file sweeps the old one so R2/Bunny does not accumulate
    // orphans nobody can reach.
    if (files.video?.[0]) {
        if (item.video_url) { try { await removeFile(item.video_url); } catch (_e) { /* ignore */ } }
        next.video_url = await storeUpload(files.video[0], 'video', next.title || item.title);
    }
    if (files.poster?.[0]) {
        // Never sweep the shared default — other meetings still point at it.
        const defaultPoster = await posterSeed.getDefaultPosterUrl();
        if (item.poster_url && item.poster_url !== defaultPoster) {
            try { await removeFile(item.poster_url); } catch (_e) { /* ignore */ }
        }
        next.poster_url = await storeUpload(files.poster[0], 'poster', next.title || item.title);
    }

    if (next.is_featured) await clearOtherFeatured(item.id);

    await item.update(next);
    return { success: 'Meeting updated successfully.', item };
};

const remove = async (id) => {
    const item = await FounderMeeting.findOne({ where: { id } });
    if (!item) throw new HttpError(404, 'Meeting not found.');
    // The shared default poster is referenced by every meeting that did not
    // get its own, so deleting one meeting must never remove it from R2.
    const defaultPoster = await posterSeed.getDefaultPosterUrl();
    for (const url of [item.video_url, item.poster_url]) {
        if (!url || url === defaultPoster) continue;
        try { await removeFile(url); } catch (_e) { /* ignore */ }
    }
    await item.destroy();
    return { success: 'Meeting deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await FounderMeeting.findOne({ where: { id } });
    if (!item) throw new HttpError(404, 'Meeting not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

/**
 * Public registration for a meeting.
 *
 * Returns the join link on success — that is the whole point of registering:
 * the link is not published on the page, so signing up is how a visitor gets
 * it, and the admin learns who is coming.
 */
const register = async ({ meetingId, body = {}, userId = null }) => {
    const meeting = await FounderMeeting.findOne({ where: { id: meetingId, status: 1 } });
    if (!meeting) throw new HttpError(404, 'That meeting is no longer available.');

    if (!canRegister(meeting)) {
        throw new HttpError(422, 'Registration for this meeting is closed.');
    }

    // A verified student registering themselves is trusted input — their name
    // comes from their account, so skip the anonymous-form "no numbers" name
    // rule that would otherwise reject a profile name like "Student 4".
    const checked = registrationPatch(body, { trusted: !!userId });
    if (!checked.ok) throw new HttpError(422, checked.message, { field: checked.field });

    // Capacity is re-checked here rather than trusted from the page: the form
    // may have been open in a tab while other people took the last seats.
    if (meeting.capacity != null) {
        const taken = await FounderMeetingRegistration.count({
            where: { meeting_id: meeting.id, status: { [Op.ne]: 'cancelled' } },
        });
        if (taken >= Number(meeting.capacity)) {
            throw new HttpError(422, 'This meeting is fully booked.');
        }
    }

    const data = { ...checked.value, meeting_id: meeting.id, user_id: userId || null };

    let row;
    try {
        row = await FounderMeetingRegistration.create(data);
    } catch (e) {
        // The (meeting_id, email) unique index is the real guard against a
        // double submit. Treat a repeat as success and hand back the link
        // again — the person is registered either way, and an error here
        // would read as "your signup failed" when it did not.
        if (e?.name === 'SequelizeUniqueConstraintError') {
            row = await FounderMeetingRegistration.findOne({
                where: { meeting_id: meeting.id, email: data.email },
            });
            return {
                success: 'You are already registered for this meeting.',
                already_registered: true,
                meeting_link: meeting.meeting_link || null,
                registration: { id: row?.id ?? null, email: data.email },
            };
        }
        throw e;
    }

    return {
        success: 'You are registered. The joining link is below.',
        already_registered: false,
        meeting_link: meeting.meeting_link || null,
        registration: { id: row.id, email: row.email },
    };
};

/**
 * Student dashboard: the meetings a signed-in student cares about.
 *
 * Returns two lists, both as public payloads (no join link — that stays
 * gated behind registration, exactly as on the home page):
 *   - `registered`: meetings this student signed up for, matched first by the
 *     verified user_id and, as a fallback, by their account email (covers
 *     signups made while logged out, or before user_id capture). Past ones are
 *     kept so the tab shows history; ordered soonest-first, past last.
 *   - `upcoming`: live/scheduled meetings the student has NOT registered for,
 *     so the tab can surface what they can still join.
 *
 * Degrades to empty lists (never throws) when the tables are missing, so the
 * dashboard tab renders an empty state rather than 500ing.
 */
const listForStudent = async ({ userId = null, email = null } = {}) => {
    const empty = { registered: [], upcoming: [] };
    if (!userId && !email) return empty;
    try {
        const now = new Date();
        const emailLc = email ? String(email).toLowerCase() : null;

        const orClauses = [];
        if (userId) orClauses.push({ user_id: String(userId) });
        if (emailLc) orClauses.push({ email: emailLc });

        const regs = await FounderMeetingRegistration.findAll({
            where: { [Op.or]: orClauses },
            attributes: ['meeting_id', 'status', 'created_at'],
        });
        const regByMeeting = new Map(regs.map((r) => [r.meeting_id, r]));
        const registeredIds = [...regByMeeting.keys()];

        // Every active meeting; split into the student's registered set and the
        // still-joinable upcoming set in one pass.
        const all = await FounderMeeting.findAll({ where: { status: 1 }, order: ORDER() });

        const registered = [];
        const upcoming = [];
        for (const m of all) {
            const payload = publicPayload(m, now);
            if (!payload) continue;
            if (regByMeeting.has(m.id)) {
                // This student HAS registered, and their identity is verified by
                // the token behind this endpoint — so releasing the join link
                // here follows the same "given to whoever registered" rule as
                // the registration response, without ever publishing it to a
                // page reader. Only attached to their own registered meetings,
                // and only while the session is still joinable (not past).
                const row = m.toJSON ? m.toJSON() : m;
                const joinLink = payload.state === 'past' ? null : (row.meeting_link || null);
                registered.push({
                    ...payload,
                    registration_status: regByMeeting.get(m.id).status,
                    meeting_link: joinLink,
                });
            } else if (payload.state === 'upcoming' || payload.state === 'live') {
                upcoming.push(payload);
            }
        }

        // Registered: soonest upcoming first, past sinks to the bottom.
        const rank = (p) => (p.state === 'past' ? 2 : p.state === 'live' ? 0 : 1);
        registered.sort((a, b) => {
            const r = rank(a) - rank(b);
            if (r) return r;
            const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
            const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
            return at - bt;
        });

        return { registered, upcoming, registered_ids: registeredIds };
    } catch (err) {
        console.warn('[founder-meetings] listForStudent failed:', err.message);
        return empty;
    }
};

/** Admin: who registered for one meeting. */
const listRegistrations = async (meetingId, { page = 1, search } = {}) => {
    const limit = 25;
    const offset = (Number(page) - 1) * limit;
    const where = { meeting_id: Number(meetingId) };
    if (search) {
        where[Op.or] = [
            { name: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
        ];
    }
    try {
        const { count, rows } = await FounderMeetingRegistration.findAndCountAll({
            where, order: [['created_at', 'DESC']], limit, offset,
        });
        return {
            registrations: {
                data: rows,
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[founder-meetings] registrations read failed:', err.message);
        return {
            registrations: {
                data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1,
            },
        };
    }
};

/** Admin: mark a registrant attended / no_show / cancelled. */
const VALID_STATUSES = ['registered', 'attended', 'no_show', 'cancelled'];
const setRegistrationStatus = async (id, status) => {
    const value = String(status || '').trim();
    if (!VALID_STATUSES.includes(value)) {
        throw new HttpError(422, `Status must be one of: ${VALID_STATUSES.join(', ')}.`, { field: 'status' });
    }
    const row = await FounderMeetingRegistration.findOne({ where: { id } });
    if (!row) throw new HttpError(404, 'Registration not found.');
    await row.update({ status: value });
    return { success: 'Status updated', item: row };
};

/**
 * Admin: remove one registration outright.
 *
 * Distinct from setting status 'cancelled': cancelling keeps the row (and the
 * person's place in the audit trail) while freeing the seat, whereas deleting
 * erases them — which is what a duplicate, a test entry, or a data-removal
 * request calls for.
 *
 * The seat is freed either way, because the capacity count excludes cancelled
 * rows and a deleted row is not counted at all.
 */
const removeRegistration = async (id) => {
    const row = await FounderMeetingRegistration.findOne({ where: { id } });
    if (!row) throw new HttpError(404, 'Registration not found.');
    await row.destroy();
    return { success: 'Registration deleted.' };
};

module.exports = {
    list, featuredPublic, get, create, update, remove, toggleStatus,
    register, listForStudent, listRegistrations, setRegistrationStatus, removeRegistration,
};
