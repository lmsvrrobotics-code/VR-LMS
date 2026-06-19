const { QueryTypes, Op } = require('sequelize');
const { Batch, BatchMember, sequelize } = require('../models');
const authDb = require('../config/authDatabase');
const { HttpError } = require('../middlewares/error');
const env = require('../config/env');
const { enqueueMany } = require('../jobs/emailQueue');
const { batchAddedToStudent } = require('../helpers/emailTemplates');

// Queue a "you've been added to a batch" email for each student. Best-effort
// — a failure here must NOT roll back the batch creation / member-add the
// admin already saw succeed. We catch + log, the worker handles SMTP-side
// retries. Students without an email address are dropped silently (the
// queue rejects empty `to`).
async function enqueueBatchAddedEmails({ batch, userIds }) {
    if (!batch || !userIds || userIds.length === 0) return;
    try {
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email
               FROM users u
              WHERE u."userId" IN (:userIds)`,
            { replacements: { userIds }, type: QueryTypes.SELECT }
        );
        const jobs = rows
            .filter((r) => r.email)
            .map((r) => {
                const { subject, html } = batchAddedToStudent({
                    studentName: r.name,
                    batchName: batch.name,
                    loginUrl: env.mail.lmsLoginUrl,
                });
                return {
                    to: r.email,
                    subject,
                    html,
                    batchId: batch.id,
                    userId: String(r.id),
                };
            });
        await enqueueMany(jobs);
    } catch (err) {
        console.warn('[batch-emails] enqueue failed:', err.message);
    }
}

// Normalise a member-id list (mirrors normaliseIdList in assessment service):
// trim, dedupe, cast to string. Accepts string|number|array. Students live
// in auth-service users.userId (string PK) — cast everything to string.
const normIds = (raw) => {
    if (raw == null) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const seen = new Set();
    const out = [];
    for (const v of arr) {
        const s = String(v ?? '').trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
};

// Sentinel "college" for batches built from individual students with no
// school. Stored in batches.clg_id like a real college id, so every existing
// query (list, members, programs.batch_ids, teaching delegation rosters)
// works on independent batches unchanged. The student scope is what differs:
// an independent batch may contain ANY student, from any school or none.
const INDEPENDENT_CLG = 'independent';
const isIndependent = (clgId) => String(clgId || '') === INDEPENDENT_CLG;

// Build a short, deterministic prefix from a college name. Strips spaces,
// punctuation and case, then caps at 12 chars so the final batch name stays
// readable. Empty / unknown college → falls back to the clgId.
//
//   "ABC"                    → "ABC"
//   "St.Joseph college"      → "STJOSEPHCOLLEG"  (capped at 12 below)
//   "Mohan Babu University"  → "MOHANBABUUNI"
//
// We deliberately don't try to be clever (initials, abbreviations) — the
// prefix is mechanical so two admins picking the same name get the same
// resulting prefix without surprises.
const buildCollegePrefix = (clgName, clgId) => {
    const source = String(clgName || '').trim() || String(clgId || '').trim();
    const cleaned = source.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!cleaned) return 'COLLEGE';
    return cleaned.slice(0, 12);
};

// Resolve a college's display name from auth-DB. Returns null if not found so
// the caller can fall back to the clgId for the prefix.
const fetchCollegeName = async (clgId) => {
    if (!clgId) return null;
    const [row] = await authDb.query(
        'SELECT "clgName" FROM colleges WHERE "clgId" = :clgId LIMIT 1',
        { replacements: { clgId }, type: QueryTypes.SELECT }
    );
    return row?.clgName || null;
};

// Apply the college prefix to a user-typed batch name, idempotently.
// If the admin already typed "ABC-Batch 1" the function detects the prefix
// and returns the string unchanged — no double-prefix.
const applyCollegePrefix = (rawName, prefix) => {
    const name = String(rawName || '').trim();
    if (!name) return name;
    const pat = new RegExp(`^${prefix}\\s*[-:]\\s*`, 'i');
    if (pat.test(name)) {
        // Normalise the separator to "<PREFIX> - <Name>" for consistency.
        const rest = name.replace(pat, '').trim();
        return rest ? `${prefix} - ${rest}` : prefix;
    }
    return `${prefix} - ${name}`;
};

// Confirm the given user ids actually belong to this school's students,
// so a school admin can't pull users from another school into a batch.
// Returns the subset of ids that are valid.
const filterValidStudents = async ({ clgId, userIds }) => {
    if (userIds.length === 0) return [];
    // Accept this college's students AND unassigned (no-school) students — must
    // match what eligibleStudents() offers, otherwise a no-school student the
    // admin picked would be silently dropped on save. With no college, accept
    // any student so a batch can mix students freely.
    // Independent batches mix students freely — no college scope at all.
    const scoped = clgId && !isIndependent(clgId);
    const scope = scoped
        ? `AND (u."collegeId" = :clgId OR u."collegeId" IS NULL)`
        : '';
    const rows = await authDb.query(
        `SELECT u."userId"
           FROM users u
           JOIN roles r ON r."roleId" = u."roleId"
          WHERE r.role = 'student'
            ${scope}
            AND u."userId" IN (:userIds)`,
        { replacements: { clgId: scoped ? clgId : null, userIds }, type: QueryTypes.SELECT }
    );
    return rows.map((r) => String(r.userId));
};

// Batches across one-or-more colleges, lightweight payload for dropdowns.
// Unlike list(), this is intended for any admin (root + college) — root needs
// it on Add Course to scope a course to specific batches. We don't enforce a
// clgId at the controller; if a school admin calls it, they pass their own
// clg_ids and only get matching rows back.
const listByColleges = async ({ clgIds }) => {
    const ids = (Array.isArray(clgIds) ? clgIds : [clgIds])
        .map((s) => String(s ?? '').trim())
        .filter(Boolean);
    if (ids.length === 0) return { batches: [] };
    const rows = await Batch.findAll({
        // Active only — this endpoint feeds the Add/Edit Course dropdown,
        // which must not surface batches the admin has retired. Manage Batches
        // uses the separate list() function and still sees everything.
        where: { clg_id: { [Op.in]: ids }, is_active: true },
        attributes: ['id', 'clg_id', 'name', 'is_active'],
        order: [['clg_id', 'ASC'], ['name', 'ASC']],
        raw: true,
    });
    return { batches: rows };
};

// List batches owned by this school, with member counts joined in.
const list = async ({ clgId }) => {
    const batches = await Batch.findAll({
        where: { clg_id: clgId },
        order: [['created_at', 'DESC']],
        raw: true,
    });
    if (batches.length === 0) return { batches: [] };

    // Single grouped COUNT instead of N+1.
    const ids = batches.map((b) => b.id);
    const counts = await BatchMember.findAll({
        where: { batch_id: { [Op.in]: ids } },
        attributes: ['batch_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['batch_id'],
        raw: true,
    });
    const byId = Object.fromEntries(counts.map((c) => [Number(c.batch_id), Number(c.count) || 0]));

    return {
        batches: batches.map((b) => ({
            ...b,
            // MySQL TINYINT(1) round-trips as a number (0/1). Coerce so the
            // frontend's StatusBadge `active === false` check works without
            // having to special-case typeof.
            is_active: Boolean(b.is_active),
            member_count: byId[b.id] || 0,
        })),
    };
};

// One batch + its student roster (name/email/phone resolved from auth DB).
const get = async ({ clgId, id }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId }, raw: true });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const members = await BatchMember.findAll({
        where: { batch_id: batch.id },
        order: [['created_at', 'ASC']],
        raw: true,
    });

    let students = [];
    if (members.length) {
        const userIds = members.map((m) => String(m.user_id));
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email, u.phone, u."graduationYear"
               FROM users u
              WHERE u."userId" IN (:userIds)`,
            { replacements: { userIds }, type: QueryTypes.SELECT }
        );
        const byId = Object.fromEntries(rows.map((r) => [String(r.id), r]));
        // Preserve insertion order (oldest member first) by walking `members`.
        students = members
            .map((m) => byId[String(m.user_id)])
            .filter(Boolean);
    }

    return { batch: { ...batch, students, member_count: students.length } };
};

const create = async ({ clgId, body }) => {
    const rawName = String(body?.name ?? '').trim();
    if (!rawName) throw new HttpError(422, 'Batch name is required');

    // Prepend the college shortcode to the typed name so the resulting batch
    // names are unique across colleges (e.g. "ABC - Batch 1" vs
    // "STJOSEPHCOLLEG - Batch 1"). Idempotent — if admin types the prefix
    // themselves, we don't double it. Independent batches keep the name as
    // typed — there's no school to prefix with.
    let name = rawName;
    if (!isIndependent(clgId)) {
        const clgName = await fetchCollegeName(clgId);
        const prefix = buildCollegePrefix(clgName, clgId);
        name = applyCollegePrefix(rawName, prefix);
    }

    // Reject duplicate name within this school so admins don't end up with
    // two "AI Frontier - Jan 2026" rows that confuse the dropdown.
    const dup = await Batch.findOne({ where: { clg_id: clgId, name } });
    if (dup) throw new HttpError(422, 'A batch with this name already exists at your school');

    const batch = await Batch.create({
        clg_id: clgId,
        name,
        description: body?.description ? String(body.description).trim() : null,
        start_date: body?.start_date || null,
        end_date: body?.end_date || null,
        is_active: body?.is_active === undefined ? true : !!body.is_active,
    });

    // Optional roster on create — same shape Manage Batches uses to add later.
    const incoming = normIds(body?.userIds);
    if (incoming.length) {
        const valid = await filterValidStudents({ clgId, userIds: incoming });
        if (valid.length) {
            await BatchMember.bulkCreate(
                valid.map((uid) => ({ batch_id: batch.id, user_id: uid })),
                { ignoreDuplicates: true }
            );
            // Fire-and-forget notification. The queue worker handles actual
            // delivery + retries; we don't await so the API response isn't
            // blocked by SMTP latency.
            enqueueBatchAddedEmails({ batch, userIds: valid });
        }
    }

    return { message: 'Batch created', batch };
};

const update = async ({ clgId, id, body }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const patch = {};
    if (body.name !== undefined) {
        const rawNext = String(body.name).trim();
        if (!rawNext) throw new HttpError(422, 'Batch name is required');
        // Re-apply the prefix on rename so the convention can't be edited
        // away. Idempotent — if the existing name already carries the prefix
        // the admin sees it in the form, types a new name, and it gets
        // re-prefixed cleanly.
        const clgName = await fetchCollegeName(clgId);
        const prefix = buildCollegePrefix(clgName, clgId);
        const next = applyCollegePrefix(rawNext, prefix);
        if (next !== batch.name) {
            const dup = await Batch.findOne({ where: { clg_id: clgId, name: next, id: { [Op.ne]: id } } });
            if (dup) throw new HttpError(422, 'Another batch already has this name');
        }
        patch.name = next;
    }
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.start_date !== undefined) patch.start_date = body.start_date || null;
    if (body.end_date !== undefined) patch.end_date = body.end_date || null;
    if (body.is_active !== undefined) patch.is_active = !!body.is_active;

    await batch.update(patch);
    return { message: 'Batch updated', batch };
};

const remove = async ({ clgId, id }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');
    // Wipe members first — no FK constraint exists, but leaving orphan rows
    // would confuse later counts.
    await BatchMember.destroy({ where: { batch_id: batch.id } });
    await batch.destroy();
    // Scrub stale references: program/course JSONB batch_ids arrays + any
    // teacher-delegation roster rows targeting this batch. Best-effort.
    const { scrubBatchRefs } = require('./IntegritySweep');
    await scrubBatchRefs(batch.id);
    return { message: 'Batch deleted' };
};

// Add students to a batch. Idempotent — existing memberships are kept (the
// unique index dedupes), only new pairs land. Returns the full updated batch
// so the UI doesn't need a second round-trip.
const addMembers = async ({ clgId, id, body }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const incoming = normIds(body?.userIds);
    if (incoming.length === 0) throw new HttpError(422, 'Pick at least one student');

    const valid = await filterValidStudents({ clgId, userIds: incoming });
    const invalid = incoming.filter((id) => !valid.includes(id));
    if (valid.length === 0) {
        throw new HttpError(422, 'None of the selected users are students of your school');
    }

    // Determine which users in `valid` are NEW to the batch so we only email
    // first-time additions (re-adding an existing member shouldn't spam them).
    const existing = await BatchMember.findAll({
        where: { batch_id: batch.id, user_id: { [Op.in]: valid } },
        attributes: ['user_id'],
        raw: true,
    });
    const existingSet = new Set(existing.map((r) => String(r.user_id)));
    const newlyAdded = valid.filter((uid) => !existingSet.has(String(uid)));

    await BatchMember.bulkCreate(
        valid.map((uid) => ({ batch_id: batch.id, user_id: uid })),
        { ignoreDuplicates: true }
    );

    if (newlyAdded.length) {
        enqueueBatchAddedEmails({ batch, userIds: newlyAdded });
    }

    const detail = await get({ clgId, id: batch.id });
    return {
        message: invalid.length
            ? `Added ${valid.length} student(s); skipped ${invalid.length} outside this school`
            : `Added ${valid.length} student(s)`,
        ...detail,
    };
};

const removeMember = async ({ clgId, id, userId }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');
    const deleted = await BatchMember.destroy({ where: { batch_id: batch.id, user_id: String(userId) } });
    if (!deleted) throw new HttpError(404, 'Student is not a member of this batch');
    return { message: 'Student removed from batch' };
};

// Students of this school that can be added to batches. Powers the picker
// in the Add Batch form and the "add students" modal of Manage Batches.
const eligibleStudents = async ({ clgId }) => {
    // Show this college's students PLUS unassigned (no-school) students — many
    // students now self-sign-up with no college (B2C), and they were invisible
    // here before. Independent batches (and no college at all) see EVERY
    // student, so the admin can form a batch from any mix of individuals.
    const scoped = clgId && !isIndependent(clgId);
    const where = scoped
        ? `r.role = 'student' AND (u."collegeId" = :clgId OR u."collegeId" IS NULL)`
        : `r.role = 'student'`;
    const rows = await authDb.query(
        `SELECT u."userId" AS id, u.name, u.email, u.phone, u."graduationYear"
           FROM users u
           JOIN roles r ON r."roleId" = u."roleId"
          WHERE ${where}
          ORDER BY u.name ASC`,
        { replacements: { clgId: scoped ? clgId : null }, type: QueryTypes.SELECT }
    );
    return { students: rows };
};

// Assign temporary teacher to a batch class
const assignTemporaryTeacher = async (batchId, classId, temporaryTeacherId) => {
    // TODO: Implement when BatchClass model is ready
    return { message: 'Temporary teacher assigned (stub)' };
};

// Release a lesson to batch members
const releaseLesson = async (batchId, lessonId, releasedBy) => {
    // TODO: Implement when BatchLessonRelease model is ready
    return { message: 'Lesson released to batch (stub)' };
};

module.exports = {
    list,
    listByColleges,
    get,
    create,
    update,
    remove,
    addMembers,
    removeMember,
    eligibleStudents,
    assignTemporaryTeacher,
    releaseLesson,
};
