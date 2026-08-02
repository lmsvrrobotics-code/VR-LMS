const { QueryTypes, Op } = require('sequelize');
const { Batch, BatchMember, BatchTeacher, BatchLessonRelease, sequelize } = require('../models');
const authDb = require('../config/authDatabase');
const { HttpError } = require('../middlewares/error');
const env = require('../config/env');
const { enqueueMany } = require('../jobs/emailQueue');
const { batchAddedToStudent } = require('../helpers/emailTemplates');
const batchId = require('../lib/batchId');
const cache = require('../config/cache');

// Bust the per-student "My Courses" cache (mycourses:<uid>, 60s TTL in
// PublicCourseService) for everyone affected by a batch change. Without this a
// student sees stale course access — a newly-assigned batch course wouldn't
// appear in their Enrolled Courses tab until the TTL lapsed, and a removed one
// would linger — which reads as "sometimes it shows, sometimes it doesn't".
// Best-effort: Redis may be down (cache.del no-ops), and this must never fail
// the write the admin just saw succeed.
async function invalidateMyCourses(userIds = []) {
    const ids = [...new Set((userIds || []).map((u) => String(u)).filter(Boolean))];
    await Promise.all(ids.map((uid) => cache.del(`mycourses:${uid}`).catch(() => {})));
}

// All active member user ids of a batch (keyed by the batch's unique_id, which
// is what batch_members.batch_id references). Used to know whose My-Courses
// cache to bust when the batch's course changes.
async function batchMemberIds(batchUniqueId) {
    if (!batchUniqueId) return [];
    const rows = await BatchMember.findAll({
        where: { batch_id: batchUniqueId },
        attributes: ['user_id'],
        raw: true,
    });
    return rows.map((r) => String(r.user_id)).filter(Boolean);
}

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
    // batch_members.batch_id is a FK to batches.unique_id (varchar), NOT the
    // surrogate integer id — keying this by b.id counted zero members for every
    // batch (and FK-violated on insert).
    const ids = batches.map((b) => b.unique_id);
    const [counts, teacherCounts] = await Promise.all([
        BatchMember.findAll({
            where: { batch_id: { [Op.in]: ids } },
            attributes: ['batch_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            group: ['batch_id'],
            raw: true,
        }),
        BatchTeacher.findAll({
            where: { batch_id: { [Op.in]: ids } },
            attributes: ['batch_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            group: ['batch_id'],
            raw: true,
        }),
    ]);
    const byId = Object.fromEntries(counts.map((c) => [String(c.batch_id), Number(c.count) || 0]));
    const teacherById = Object.fromEntries(teacherCounts.map((c) => [String(c.batch_id), Number(c.count) || 0]));

    return {
        batches: batches.map((b) => ({
            ...b,
            // MySQL TINYINT(1) round-trips as a number (0/1). Coerce so the
            // frontend's StatusBadge `active === false` check works without
            // having to special-case typeof.
            is_active: Boolean(b.is_active),
            member_count: byId[String(b.unique_id)] || 0,
            teacher_count: teacherById[String(b.unique_id)] || 0,
        })),
    };
};

// One batch + its student and teacher rosters (names resolved from auth DB).
const get = async ({ clgId, id }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId }, raw: true });
    if (!batch) throw new HttpError(404, 'Batch not found');

    // Teacher roster. Same shape/ordering rules as the students below:
    // batch_teachers timestamps with `added_at` (timestamps:false on the model).
    const teacherRows = await BatchTeacher.findAll({
        where: { batch_id: batch.unique_id },
        order: [['added_at', 'ASC']],
        raw: true,
    });
    let teachers = [];
    if (teacherRows.length) {
        const tIds = teacherRows.map((t) => String(t.user_id));
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.unique_id, u.name, u.email, u.phone, u.expertise
               FROM users u
              WHERE u."userId" IN (:tIds)`,
            { replacements: { tIds }, type: QueryTypes.SELECT }
        );
        const tById = Object.fromEntries(rows.map((r) => [String(r.id), r]));
        teachers = teacherRows.map((t) => tById[String(t.user_id)]).filter(Boolean);
    }

    // batch_members timestamps its rows with `added_at`, not created_at (the
    // model sets timestamps:false). Ordering by created_at threw
    // "column BatchMember.created_at does not exist" — a 500 that surfaced as an
    // empty Students modal.
    const members = await BatchMember.findAll({
        where: { batch_id: batch.unique_id },
        order: [['added_at', 'ASC']],
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

    return {
        batch: {
            ...batch,
            students,
            member_count: students.length,
            teachers,
            teacher_count: teachers.length,
        },
    };
};

const create = async ({ clgId, body }) => {
    const rawName = String(body?.name ?? '').trim();
    if (!rawName) throw new HttpError(422, 'Batch name is required');

    // A batch must have at least one teacher. Validate BEFORE creating the batch
    // row — otherwise a bad teacher list leaves an orphaned teacher-less batch
    // behind that the admin then has to clean up by hand.
    const incomingTeachers = normIds(body?.teacherIds);
    if (incomingTeachers.length === 0) throw new HttpError(422, 'Pick at least one teacher');
    const validTeachers = await filterValidTeachers({ userIds: incomingTeachers });
    if (validTeachers.length === 0) throw new HttpError(422, 'None of the selected users are teachers');

    // Optional course to attach on creation. Validate it exists before creating
    // the batch so a bad id fails fast rather than leaving a course-less batch.
    // Empty/absent → the batch is created with no course (attach later).
    let courseId = null;
    if (body?.courseId !== undefined && body?.courseId !== null && body?.courseId !== '') {
        courseId = Number(body.courseId);
        if (!Number.isInteger(courseId) || courseId <= 0) {
            throw new HttpError(422, 'Invalid course selected');
        }
        const { Course } = require('../models');
        const course = await Course.findByPk(courseId, { attributes: ['id'] });
        if (!course) throw new HttpError(422, 'Selected course does not exist');
    }

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

    // unique_id is the table's primary key (BatchNewService builds it from the
    // course + teacher). A batch created here has neither, so mint a readable,
    // brand-scoped one: VR-B-00001, VR-B-00002, ... (see lib/batchId.js). The
    // serial comes from the highest existing VR-B- id, and generate() retries on
    // the PK collision two concurrent creates can cause. It must be set
    // explicitly: Sequelize sends every declared attribute in the INSERT, so an
    // unset unique_id goes out as an explicit NULL and overrides the column's
    // DB-side default.
    const uniqueId = await batchId.generate();

    const batch = await Batch.create({
        unique_id: uniqueId,
        clg_id: clgId,
        name,
        // Course attached at creation (optional). Stored on the batch's own
        // course_id column, matching the BatchNewService flow.
        course_id: courseId,
        description: body?.description ? String(body.description).trim() : null,
        start_date: body?.start_date || null,
        end_date: body?.end_date || null,
        is_active: body?.is_active === undefined ? true : !!body.is_active,
    });

    // Teacher roster (validated above, so this always writes at least one).
    await BatchTeacher.bulkCreate(
        validTeachers.map((uid) => ({ batch_id: batch.unique_id, user_id: uid })),
        { ignoreDuplicates: true }
    );
    // Keep the single-teacher column in step with the roster's first teacher so
    // BatchNewService / anything reading batches.primary_teacher_id still sees a
    // sensible value for batches created here.
    await batch.update({ primary_teacher_id: validTeachers[0] });

    // Optional roster on create — same shape Manage Batches uses to add later.
    const incoming = normIds(body?.userIds);
    if (incoming.length) {
        const valid = await filterValidStudents({ clgId, userIds: incoming });
        if (valid.length) {
            await BatchMember.bulkCreate(
                valid.map((uid) => ({ batch_id: batch.unique_id, user_id: uid })),
                { ignoreDuplicates: true }
            );
            // Fire-and-forget notification. The queue worker handles actual
            // delivery + retries; we don't await so the API response isn't
            // blocked by SMTP latency.
            enqueueBatchAddedEmails({ batch, userIds: valid });
            // If the batch was created WITH a course, its new members gain it —
            // bust their My-Courses cache so it shows immediately.
            if (courseId) await invalidateMyCourses(valid);
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

    // Course assignment. Manage Batches → Edit now surfaces a Course dropdown so
    // an admin can attach/change/clear the batch's course after creation (the
    // create form only set it once). The batch's course drives what its members
    // see in their "Enrolled Courses" tab (PublicCourseService.myCourses reads
    // batches.course_id via TeachingAssignmentService.coursesForStudent). Empty
    // string / null clears it; a value must reference a real course.
    if (body.course_id !== undefined) {
        if (body.course_id === null || body.course_id === '') {
            patch.course_id = null;
        } else {
            const courseId = Number(body.course_id);
            if (!Number.isInteger(courseId) || courseId <= 0) {
                throw new HttpError(422, 'Invalid course selected');
            }
            const { Course } = require('../models');
            const course = await Course.findByPk(courseId, { attributes: ['id'] });
            if (!course) throw new HttpError(422, 'Selected course does not exist');
            patch.course_id = courseId;
        }
    }

    await batch.update(patch);

    // When the batch's course changed, every member's Enrolled Courses list
    // changed too — bust their cache so the new/cleared course shows at once.
    if (Object.prototype.hasOwnProperty.call(patch, 'course_id')) {
        await invalidateMyCourses(await batchMemberIds(batch.unique_id));
    }

    return { message: 'Batch updated', batch };
};

const remove = async ({ clgId, id }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');
    // Wipe members first — no FK constraint exists, but leaving orphan rows
    // would confuse later counts.
    await BatchMember.destroy({ where: { batch_id: batch.unique_id } });
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
        where: { batch_id: batch.unique_id, user_id: { [Op.in]: valid } },
        attributes: ['user_id'],
        raw: true,
    });
    const existingSet = new Set(existing.map((r) => String(r.user_id)));
    const newlyAdded = valid.filter((uid) => !existingSet.has(String(uid)));

    await BatchMember.bulkCreate(
        valid.map((uid) => ({ batch_id: batch.unique_id, user_id: uid })),
        { ignoreDuplicates: true }
    );

    if (newlyAdded.length) {
        enqueueBatchAddedEmails({ batch, userIds: newlyAdded });
        // New members gain access to this batch's course (if any) — bust their
        // My-Courses cache so it appears in their Enrolled Courses tab at once.
        if (batch.course_id) await invalidateMyCourses(newlyAdded);
    }

    const detail = await get({ clgId, id: batch.id });
    return {
        message: invalid.length
            ? `Added ${valid.length} student(s); skipped ${invalid.length} outside this school`
            : `Added ${valid.length} student(s)`,
        ...detail,
    };
};

// Add teachers to an existing batch. Mirrors addMembers; no welcome email —
// that template is student-facing ("you've been added to a batch").
const addTeachers = async ({ clgId, id, body }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const incoming = normIds(body?.teacherIds ?? body?.userIds);
    if (incoming.length === 0) throw new HttpError(422, 'Pick at least one teacher');

    const valid = await filterValidTeachers({ userIds: incoming });
    const invalid = incoming.filter((tid) => !valid.includes(tid));
    if (valid.length === 0) throw new HttpError(422, 'None of the selected users are teachers');

    await BatchTeacher.bulkCreate(
        valid.map((uid) => ({ batch_id: batch.unique_id, user_id: uid })),
        { ignoreDuplicates: true }
    );

    // Keep the legacy single-teacher column pointing at a real teacher when the
    // batch didn't have one yet (see create()).
    if (!batch.primary_teacher_id) {
        await batch.update({ primary_teacher_id: valid[0] });
    }

    const detail = await get({ clgId, id: batch.id });
    return {
        message: invalid.length
            ? `Added ${valid.length} teacher(s); skipped ${invalid.length} that aren't teachers`
            : `Added ${valid.length} teacher(s)`,
        ...detail,
    };
};

// Remove one teacher from a batch. A batch must keep at least one teacher —
// the same rule create() enforces — so the last one can't be removed.
const removeTeacher = async ({ clgId, id, userId }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const remaining = await BatchTeacher.count({ where: { batch_id: batch.unique_id } });
    if (remaining <= 1) {
        throw new HttpError(422, 'A batch must have at least one teacher');
    }

    const deleted = await BatchTeacher.destroy({
        where: { batch_id: batch.unique_id, user_id: String(userId) },
    });
    if (!deleted) throw new HttpError(404, 'Teacher is not assigned to this batch');

    // If we just removed the teacher the legacy column pointed at, repoint it at
    // whoever remains so batches.primary_teacher_id never dangles.
    if (String(batch.primary_teacher_id) === String(userId)) {
        const next = await BatchTeacher.findOne({
            where: { batch_id: batch.unique_id },
            order: [['added_at', 'ASC']],
            raw: true,
        });
        await batch.update({ primary_teacher_id: next ? next.user_id : null });
    }

    return { message: 'Teacher removed from batch' };
};

const removeMember = async ({ clgId, id, userId }) => {
    const batch = await Batch.findOne({ where: { id, clg_id: clgId } });
    if (!batch) throw new HttpError(404, 'Batch not found');
    const deleted = await BatchMember.destroy({ where: { batch_id: batch.unique_id, user_id: String(userId) } });
    if (!deleted) throw new HttpError(404, 'Student is not a member of this batch');
    // The removed student loses this batch's course — bust their My-Courses
    // cache so it disappears from their Enrolled Courses tab at once.
    if (batch.course_id) await invalidateMyCourses([userId]);
    return { message: 'Student removed from batch' };
};

// Teachers that can be assigned to a batch. Teachers aren't college-scoped the
// way students are (a teacher can run batches at any school), so this returns
// every teacher regardless of clgId — the parameter is accepted for symmetry
// with eligibleStudents and for future scoping.
const eligibleTeachers = async () => {
    const rows = await authDb.query(
        `SELECT u."userId" AS id, u.unique_id, u.name, u.email, u.expertise
           FROM users u
           JOIN roles r ON r."roleId" = u."roleId"
          WHERE r.role = 'teacher'
          ORDER BY u.name ASC`,
        { type: QueryTypes.SELECT }
    );
    return { teachers: rows };
};

// Confirm the given ids really are teachers, so a stale/spoofed id can't be
// written into a batch roster. Returns the valid subset. Mirrors
// filterValidStudents.
const filterValidTeachers = async ({ userIds }) => {
    if (userIds.length === 0) return [];
    const rows = await authDb.query(
        `SELECT u."userId"
           FROM users u
           JOIN roles r ON r."roleId" = u."roleId"
          WHERE r.role = 'teacher' AND u."userId" IN (:userIds)`,
        { replacements: { userIds }, type: QueryTypes.SELECT }
    );
    return rows.map((r) => String(r.userId));
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
        `SELECT u."userId" AS id, u.unique_id, u.name, u.email, u.phone, u."graduationYear"
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

// Resolve a batch by whichever id the caller had (numeric PK, batch_id, or
// unique_id) and confirm `actor` is allowed to release lessons for it: an
// admin/root, or a teacher actually attached to this batch (roster row, or
// either legacy single-teacher column). Throws 404/403 rather than returning
// a falsy value so callers can't accidentally proceed on a failed check.
const resolveBatchForTeacher = async (batchIdRaw, actorId, actorRole) => {
    const key = String(batchIdRaw ?? '').trim();
    if (!key) throw new HttpError(400, 'Batch id is required');

    const where = [{ unique_id: key }, { batch_id: key }];
    if (/^\d+$/.test(key)) where.push({ id: Number(key) });
    const batch = await Batch.findOne({ where: { [Op.or]: where }, raw: true });
    if (!batch) throw new HttpError(404, 'Batch not found');

    const isAdmin = actorRole === 'admin' || actorRole === 'root';
    if (!isAdmin) {
        const uid = String(actorId ?? '').trim();
        if (!uid) throw new HttpError(403, 'Not allowed to release lessons for this batch');
        const onRoster = await BatchTeacher.count({
            where: { batch_id: batch.unique_id, user_id: uid },
        });
        const isNamedTeacher =
            String(batch.primary_teacher_id || '') === uid ||
            String(batch.teacher_id || '') === uid;
        if (!onRoster && !isNamedTeacher) {
            throw new HttpError(403, 'Not allowed to release lessons for this batch');
        }
    }
    return batch;
};

// Confirm the lesson belongs to the batch's course, so a teacher can't release
// a lesson from an unrelated course into their batch.
const assertLessonInBatchCourse = async (batch, lessonId) => {
    const lid = Number(lessonId);
    if (!lid || Number.isNaN(lid)) throw new HttpError(400, 'A valid lesson_id is required');
    if (!batch.course_id) throw new HttpError(422, 'This batch has no course assigned');

    const [row] = await sequelize.query(
        `SELECT l.id
           FROM lessons l
           LEFT JOIN sections s ON s.id = l.section_id
          WHERE l.id = :lid
            AND COALESCE(l.course_id, s.course_id) = :cid`,
        { replacements: { lid, cid: Number(batch.course_id) }, type: QueryTypes.SELECT }
    );
    if (!row) throw new HttpError(422, 'Lesson does not belong to this batch\'s course');
    return lid;
};

// Release a lesson to a batch's students. This is the ONLY way a lesson
// becomes visible in the player for a batch student — until a row exists here,
// PublicCourseService locks the lesson and withholds its video/attachment.
// Idempotent: re-releasing an already-released lesson is a no-op success.
const releaseLesson = async (batchIdRaw, lessonId, releasedBy, actorRole) => {
    const batch = await resolveBatchForTeacher(batchIdRaw, releasedBy, actorRole);
    const lid = await assertLessonInBatchCourse(batch, lessonId);

    await BatchLessonRelease.findOrCreate({
        where: { batch_id: batch.unique_id, lesson_id: lid },
        defaults: {
            batch_id: batch.unique_id,
            lesson_id: lid,
            released_by: String(releasedBy ?? ''),
        },
    });

    // Students' course access changed → drop their cached My-Courses view.
    await invalidateMyCourses(await batchMemberIds(batch.unique_id));
    return { batch_id: batch.unique_id, lesson_id: lid, released: true };
};

// Undo a release — the lesson locks again for that batch immediately.
const revokeLesson = async (batchIdRaw, lessonId, actorId, actorRole) => {
    const batch = await resolveBatchForTeacher(batchIdRaw, actorId, actorRole);
    const lid = Number(lessonId);
    if (!lid || Number.isNaN(lid)) throw new HttpError(400, 'A valid lesson_id is required');

    const removed = await BatchLessonRelease.destroy({
        where: { batch_id: batch.unique_id, lesson_id: lid },
    });
    await invalidateMyCourses(await batchMemberIds(batch.unique_id));
    return { batch_id: batch.unique_id, lesson_id: lid, released: false, removed };
};

// Lesson ids currently released to a batch — powers the teacher's release UI
// (which lessons show as unlocked).
const listReleases = async (batchIdRaw, actorId, actorRole) => {
    const batch = await resolveBatchForTeacher(batchIdRaw, actorId, actorRole);
    const rows = await BatchLessonRelease.findAll({
        where: { batch_id: batch.unique_id },
        attributes: ['lesson_id', 'released_by', 'released_at'],
        raw: true,
    });
    return {
        batch_id: batch.unique_id,
        course_id: batch.course_id,
        released_lesson_ids: rows.map((r) => Number(r.lesson_id)),
        releases: rows,
    };
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
    addTeachers,
    removeTeacher,
    eligibleStudents,
    eligibleTeachers,
    assignTemporaryTeacher,
    releaseLesson,
    revokeLesson,
    listReleases,
};
