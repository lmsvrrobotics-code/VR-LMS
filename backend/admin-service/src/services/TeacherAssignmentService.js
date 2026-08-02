// Teacher-facing assignment workflow: create an assignment for one of MY
// batches, see every student's response, and grade it.
//
// This sits beside AssignmentService (which is student-facing + admin-shaped)
// and adds the piece it lacks: authorization scoped to the batches a teacher
// actually teaches, plus student names resolved from the auth DB so the
// grading screen shows people rather than opaque ids.
const { QueryTypes, Op } = require('sequelize');
const { Assignment, AssignmentSubmission, BatchMember, sequelize } = require('../models');
const authDb = require('../config/authDatabase');
const { HttpError } = require('../middlewares/error');
const {
    mergeRoster, tallySubmissions, validateScore, ownsBatch,
    buildAttachments, parseLinksField, uploadAttachmentFiles,
} = require('./assignmentLogic');
const fileUploader = require('../helpers/fileUploader');

// Batches this teacher owns, as [{ unique_id, display_name, course_id }].
// A teacher "owns" a batch via the batch_teachers roster or either legacy
// single-teacher column — same rule BatchService.resolveBatchForTeacher uses.
const myBatches = async (teacherId) => {
    const uid = String(teacherId ?? '').trim();
    if (!uid) return [];
    return sequelize.query(
        `SELECT DISTINCT b.unique_id, b.display_name, b.name, b.course_id
           FROM batches b
           LEFT JOIN batch_teachers bt ON bt.batch_id = b.unique_id
          WHERE bt.user_id = :uid
             OR b.primary_teacher_id = :uid
             OR b.teacher_id = :uid
          ORDER BY b.unique_id`,
        { replacements: { uid }, type: QueryTypes.SELECT }
    );
};

// Throw unless this teacher owns `batchUniqueId`. Admins bypass.
const assertOwnsBatch = async (batchUniqueId, teacherId, role) => {
    if (role === 'admin' || role === 'root') return;
    const owned = await myBatches(teacherId);
    if (!ownsBatch(batchUniqueId, owned, role)) {
        throw new HttpError(403, 'You do not teach this batch');
    }
};

// Resolve display names for a set of auth user ids → { [id]: {name, email} }.
// Best-effort: a lookup failure degrades to ids rather than failing the screen.
const namesByUserId = async (ids = []) => {
    const list = [...new Set(ids.map((v) => String(v ?? '').trim()).filter(Boolean))];
    if (!list.length) return {};
    try {
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email, u.unique_id
               FROM users u WHERE u."userId" IN (:list)`,
            { replacements: { list }, type: QueryTypes.SELECT }
        );
        return Object.fromEntries(rows.map((r) => [String(r.id), r]));
    } catch (e) {
        console.warn('[teacher-assignments] name lookup failed:', e.message);
        return {};
    }
};

// --- reads ------------------------------------------------------------------

// Every assignment across this teacher's batches, with a submitted/graded
// tally so the list can show "3 of 5 submitted · 1 graded" without N+1 queries.
const listForTeacher = async (teacherId) => {
    const batches = await myBatches(teacherId);
    if (!batches.length) return { assignments: [], batches: [] };

    const batchIds = batches.map((b) => b.unique_id);
    const rows = await Assignment.findAll({
        where: { batch_id: { [Op.in]: batchIds } },
        order: [['due_date', 'DESC'], ['id', 'DESC']],
        raw: true,
    });

    // Roster sizes: how many active students each batch has.
    const memberRows = await BatchMember.findAll({
        where: { batch_id: { [Op.in]: batchIds }, status: 'active' },
        attributes: ['batch_id', 'user_id'],
        raw: true,
    });
    const rosterSize = memberRows.reduce((acc, m) => {
        acc[String(m.batch_id)] = (acc[String(m.batch_id)] || 0) + 1;
        return acc;
    }, {});

    // Submission tallies per assignment.
    const subs = rows.length
        ? await AssignmentSubmission.findAll({
            where: { assignment_id: { [Op.in]: rows.map((r) => r.id) } },
            attributes: ['assignment_id', 'status'],
            raw: true,
        })
        : [];
    const tally = tallySubmissions(subs);

    const byId = Object.fromEntries(batches.map((b) => [String(b.unique_id), b]));
    return {
        batches: batches.map((b) => ({
            batch_id: b.unique_id,
            batch_name: b.display_name || b.name || b.unique_id,
            course_id: b.course_id,
            student_count: rosterSize[String(b.unique_id)] || 0,
        })),
        assignments: rows.map((a) => {
            const b = byId[String(a.batch_id)];
            const t = tally[String(a.id)] || { submitted: 0, graded: 0 };
            return {
                ...a,
                batch_name: b ? (b.display_name || b.name || b.unique_id) : a.batch_id,
                student_count: rosterSize[String(a.batch_id)] || 0,
                submitted_count: t.submitted,
                graded_count: t.graded,
            };
        }),
    };
};

// Every student on the assignment's roster, each with their submission (or
// null). Returning non-submitters too is the point — a teacher needs to see
// who HASN'T handed in, which a submissions-only query can't show.
const submissionsForAssignment = async (assignmentId, teacherId, role) => {
    const assignment = await Assignment.findByPk(Number(assignmentId), { raw: true });
    if (!assignment) throw new HttpError(404, 'Assignment not found');
    await assertOwnsBatch(assignment.batch_id, teacherId, role);

    const members = await BatchMember.findAll({
        where: { batch_id: assignment.batch_id, status: 'active' },
        attributes: ['user_id', 'student_id'],
        raw: true,
    });
    const subs = await AssignmentSubmission.findAll({
        where: { assignment_id: assignment.id },
        raw: true,
    });

    // Roster ⋈ submissions (matching on either key, keeping non-submitters and
    // off-roster submitters) — see assignmentLogic.mergeRoster.
    const merged = mergeRoster(members, subs);

    const names = await namesByUserId([
        ...members.map((m) => m.user_id),
        ...members.map((m) => m.student_id),
        ...subs.map((s) => s.user_id),
    ]);

    const students = merged.map((row) => {
        const who = names[String(row.user_id)] || names[String(row.student_id)] || {};
        const sub = row.submission;
        return {
            user_id: row.user_id,
            student_id: row.student_id,
            name: who.name || null,
            email: who.email || null,
            unique_id: who.unique_id || null,
            ...(row.off_roster ? { off_roster: true } : {}),
            submission: sub
                ? {
                    id: sub.id,
                    submission_text: sub.submission_text,
                    file_url: sub.file_url,
                    status: sub.status,
                    submitted_date: sub.submitted_date,
                    score: sub.score,
                    feedback: sub.feedback,
                    graded_date: sub.graded_date,
                }
                : null,
        };
    });

    return { assignment, students };
};

// --- writes -----------------------------------------------------------------

const create = async (payload, teacherId, role, files = []) => {
    const batchId = String(payload.batch_id ?? '').trim();
    if (!batchId) throw new HttpError(400, 'batch_id is required');
    await assertOwnsBatch(batchId, teacherId, role);

    // Links the teacher typed + PDFs/images they attached. Uploads happen only
    // after ownership is confirmed, so a stranger can't push files to R2.
    const { uploaded, failed } = await uploadAttachmentFiles(files, fileUploader);
    const attachments = buildAttachments(parseLinksField(payload.links), uploaded);

    // course_id follows the batch — a batch teaches exactly one course, so
    // trusting the client's course_id would let a typo file the assignment
    // under the wrong course.
    const [batch] = await sequelize.query(
        `SELECT course_id FROM batches WHERE unique_id = :b`,
        { replacements: { b: batchId }, type: QueryTypes.SELECT }
    );
    if (!batch?.course_id) throw new HttpError(422, 'This batch has no course assigned');

    const created = await Assignment.create({
        batch_id: batchId,
        course_id: Number(batch.course_id),
        teacher_id: String(teacherId),
        title: payload.title,
        description: payload.description || null,
        instructions: payload.instructions || null,
        // assignments.due_date is NOT NULL, but a due date is genuinely
        // optional for a teacher ("do this before next class"). Default to a
        // week out so the column stays satisfied without inventing a deadline
        // that has already passed.
        due_date: payload.due_date
            ? new Date(payload.due_date)
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        max_score: Number(payload.max_score) || 100,
        // file_url kept in step with the first file for any older client that
        // still reads the single-value column.
        file_url: attachments.find((a) => a.kind === 'file')?.url || payload.file_url || null,
        attachments: attachments.length ? attachments : null,
        // Only meaningful when there IS material; default the heading so the
        // student always sees a labelled block rather than a bare link list.
        attachments_title: attachments.length
            ? (String(payload.attachments_title ?? '').trim() || 'Reference material')
            : null,
        status: 'published',
    });

    // Non-persisted hint for the route: which files never made it to storage.
    // The assignment is still created (losing the teacher's typed work over a
    // storage hiccup would be worse), but the caller must be able to say so.
    created.failed_attachments = failed;
    return created;
};

const remove = async (assignmentId, teacherId, role) => {
    const assignment = await Assignment.findByPk(Number(assignmentId));
    if (!assignment) throw new HttpError(404, 'Assignment not found');
    await assertOwnsBatch(assignment.batch_id, teacherId, role);

    // Drop the uploaded attachments from R2 so deleting an assignment doesn't
    // leave orphaned files billed forever. Best-effort — a storage hiccup must
    // not block the delete the teacher asked for.
    const atts = Array.isArray(assignment.attachments) ? assignment.attachments : [];
    for (const a of atts) {
        if (a?.kind === 'file' && a.url) {
            try { await fileUploader.removeFile(a.url); }
            catch (e) { console.warn('[teacher-assignments] attachment cleanup failed:', e.message); }
        }
    }

    await AssignmentSubmission.destroy({ where: { assignment_id: assignment.id } });
    await assignment.destroy();
    return { id: Number(assignmentId), deleted: true };
};

// Grade one submission. Ownership is by BATCH (not the assignment's original
// teacher_id) so a co-teacher or a replacement teacher can still grade.
const grade = async (submissionId, { score, feedback }, teacherId, role) => {
    const submission = await AssignmentSubmission.findByPk(Number(submissionId));
    if (!submission) throw new HttpError(404, 'Submission not found');

    const assignment = await Assignment.findByPk(submission.assignment_id, { raw: true });
    if (!assignment) throw new HttpError(404, 'Assignment not found');
    await assertOwnsBatch(assignment.batch_id, teacherId, role);

    const max = Number(assignment.max_score) || 100;
    const checked = validateScore(score, max);
    if (!checked.ok) throw new HttpError(422, checked.error);
    const n = checked.value;

    await submission.update({
        score: n,
        feedback: feedback || null,
        status: 'graded',
        graded_date: new Date(),
        graded_by: String(teacherId),
    });

    // Best-effort notification — never fail the grade the teacher just saved.
    try {
        const { Notification } = require('../models');
        if (Notification && submission.user_id) {
            await Notification.create({
                user_id: submission.user_id,
                type: 'assignment_graded',
                title: 'Assignment Graded',
                message: `${assignment.title} was graded: ${n}/${max}`,
                related_id: assignment.id,
            });
        }
    } catch (e) {
        console.warn('[teacher-assignments] grade notification failed:', e.message);
    }

    return submission;
};

module.exports = { myBatches, listForTeacher, submissionsForAssignment, create, remove, grade };
