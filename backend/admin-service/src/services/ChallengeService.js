const { Op } = require('sequelize');
const { ChallengeSubmission, Lesson, Course, Section, sequelize } = require('../models');
const { HttpError } = require('../middlewares/error');
const teachingSvc = require('./TeachingAssignmentService');

/**
 * CHALLENGE lessons: an external task the student completes on another site,
 * then submits a link to for teacher review.
 *
 * The challenge is an ordinary `lessons` row (lesson_type='challenge') whose
 * lesson_src holds the external URL — see migration 27 for why no column was
 * added to `lessons`.
 *
 * This service NEVER writes a LessonCompletion. Completing a challenge is the
 * student's own action — the "Mark as complete" button in the player, the same
 * control every other class type uses. Submitting work and being marked are
 * recorded here; ticking the class off is not something either the student's
 * submission or the teacher's mark does on their behalf.
 */

const STATUSES = ['submitted', 'approved', 'needs_work'];

/** Every challenge is marked out of this. Not configurable per challenge —
 *  one scale keeps a student's marks comparable across the whole course. */
const MAX_SCORE = 100;

/**
 * Accept only http(s) links.
 *
 * This is a security boundary, not formatting: the stored value is rendered as
 * an anchor and clicked by a TEACHER, so a `javascript:` or `data:` URL here
 * would be stored XSS aimed at a privileged user.
 */
const normalizeUrl = (raw) => {
    const value = String(raw ?? '').trim();
    if (!value) throw new HttpError(422, 'A link to your work is required');
    if (value.length > 2000) throw new HttpError(422, 'That link is too long');
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new HttpError(422, 'Enter a valid link, including https://');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new HttpError(422, 'Only http:// and https:// links are allowed');
    }
    return parsed.toString();
};

/** The challenge lesson, or 404. */
const loadChallenge = async (lessonId) => {
    const id = Number(lessonId);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, 'Invalid class');
    const lesson = await Lesson.findByPk(id);
    if (!lesson) throw new HttpError(404, 'Class not found');
    if (lesson.lesson_type !== 'challenge') {
        throw new HttpError(422, 'That class is not a challenge');
    }
    return lesson;
};

/**
 * Can this student reach this challenge at all?
 *
 * Reuses the SAME grant the player and My Courses use, so a student can never
 * submit to a course they cannot open. Fails closed.
 */
const assertStudentCanAccess = async (lesson, userId) => {
    const granted = await teachingSvc.coursesForStudent(userId);
    if (!(granted || []).some((c) => Number(c) === Number(lesson.course_id))) {
        throw new HttpError(403, 'You do not have access to this class');
    }
};

/**
 * Can this teacher review this course's submissions?
 *
 * An admin/root may review anything. A teacher must actually teach the course —
 * otherwise any teacher could read every student's work across the academy.
 * Three ways to qualify: they created the course, they are named in
 * courses.teacher_ids, or they are on a batch bound to it.
 */
const assertReviewerCanAccess = async (lesson, actorId, actorRole) => {
    if (actorRole === 'admin' || actorRole === 'root') return;
    const course = await Course.findByPk(lesson.course_id, {
        attributes: ['id', 'user_id', 'teacher_ids'],
    });
    if (!course) throw new HttpError(404, 'Course not found');

    const me = String(actorId || '');
    if (!me) throw new HttpError(403, 'You do not teach this course');
    if (String(course.user_id || '') === me) return;

    let ids = [];
    try {
        ids = Array.isArray(course.teacher_ids)
            ? course.teacher_ids
            : JSON.parse(course.teacher_ids || '[]');
    } catch {
        ids = [];
    }
    if (ids.map((v) => String(v)).includes(me)) return;

    // A teacher delegated this course through a batch teaches it just as much
    // as one named on the course row.
    const rows = await sequelize.query(
        `SELECT 1
           FROM batch_teachers bt
           JOIN batches b ON b.unique_id = bt.batch_id
          WHERE b.course_id = :cid
            AND bt.user_id = :tid
            AND COALESCE(bt.status, 'active') = 'active'
          LIMIT 1`,
        { replacements: { cid: lesson.course_id, tid: me }, type: sequelize.QueryTypes.SELECT },
    );
    if (rows.length) return;

    throw new HttpError(403, 'You do not teach this course');
};

/** Shape a row for the client. Never leaks reviewer identity to a student. */
const toPublic = (row, { forStudent = false } = {}) => {
    if (!row) return null;
    const r = row.toJSON ? row.toJSON() : row;
    const out = {
        id: r.id,
        lesson_id: r.lesson_id,
        course_id: r.course_id,
        submission_url: r.submission_url,
        submission_note: r.submission_note || null,
        status: r.status,
        // null until a teacher marks it. 0 is a real mark, so it must not be
        // used as the "unmarked" sentinel.
        score: r.score == null ? null : Number(r.score),
        max_score: MAX_SCORE,
        feedback: r.feedback || null,
        submitted_at: r.submitted_at,
        reviewed_at: r.reviewed_at || null,
    };
    if (!forStudent) {
        out.user_id = r.user_id;
        out.reviewed_by = r.reviewed_by || null;
    }
    return out;
};

/**
 * The student's own submission for a challenge (null when they have not
 * submitted). Lets the player choose between the form and the receipt.
 */
const mySubmission = async (lessonId, userId) => {
    const row = await ChallengeSubmission.findOne({
        where: { lesson_id: Number(lessonId), user_id: String(userId) },
    });
    return toPublic(row, { forStudent: true });
};

/**
 * Submit, or RESUBMIT after a teacher asked for more work.
 *
 * Resubmission updates the one row back to 'submitted' and clears the previous
 * verdict, so the review queue shows one current state per student rather than
 * a pile of attempts.
 */
const submit = async (lessonId, userId, body = {}) => {
    const lesson = await loadChallenge(lessonId);
    await assertStudentCanAccess(lesson, userId);

    const url = normalizeUrl(body.submission_url);
    const note = body.submission_note == null
        ? null
        : String(body.submission_note).trim().slice(0, 2000) || null;

    const existing = await ChallengeSubmission.findOne({
        where: { lesson_id: lesson.id, user_id: String(userId) },
    });

    if (existing) {
        // An APPROVED submission is final. Letting a student overwrite it would
        // silently revoke a completion a teacher already granted.
        if (existing.status === 'approved') {
            throw new HttpError(409, 'This challenge has already been approved');
        }
        await existing.update({
            submission_url: url,
            submission_note: note,
            status: 'submitted',
            feedback: null,
            reviewed_by: null,
            reviewed_at: null,
            submitted_at: new Date(),
        });
        return {
            message: 'Your work has been resubmitted',
            submission: toPublic(existing, { forStudent: true }),
        };
    }

    const row = await ChallengeSubmission.create({
        lesson_id: lesson.id,
        course_id: lesson.course_id,
        user_id: String(userId),
        submission_url: url,
        submission_note: note,
        status: 'submitted',
    });
    return {
        message: 'Your work has been submitted',
        submission: toPublic(row, { forStudent: true }),
    };
};

/**
 * Teacher review. 'approved' completes the lesson; 'needs_work' sends it back
 * and REMOVES any completion a previous approval granted, so the progress bar
 * never claims a lesson is done once that verdict is withdrawn.
 */
/**
 * Teacher marks a submission out of 100.
 *
 * There is no pass mark and no resubmission loop — the score is simply what the
 * student sees on their card, alongside any feedback.
 *
 * Marking deliberately does NOT complete the class: that stays the student's
 * own action in the player. Re-marking is allowed (a teacher correcting a
 * typo) and just updates the score.
 */
const mark = async (submissionId, { score, feedback } = {}, actorId, actorRole) => {
    // Reject null/undefined/'' BEFORE coercing: Number(null) and Number('')
    // are both 0, so an omitted mark would silently be stored as a zero — a
    // real, failing grade the teacher never typed.
    if (score === null || score === undefined || score === '') {
        throw new HttpError(422, `Enter a mark between 0 and ${MAX_SCORE}`);
    }
    const value = Number(score);
    if (!Number.isInteger(value) || value < 0 || value > MAX_SCORE) {
        throw new HttpError(422, `Enter a mark between 0 and ${MAX_SCORE}`);
    }

    const row = await ChallengeSubmission.findByPk(Number(submissionId));
    if (!row) throw new HttpError(404, 'Submission not found');

    const lesson = await loadChallenge(row.lesson_id);
    await assertReviewerCanAccess(lesson, actorId, actorRole);

    await row.update({
        score: value,
        // 'approved' here means MARKED. The vocabulary predates marks (see
        // migration 28); it is kept so old rows stay valid under the CHECK
        // constraint rather than needing a data migration.
        status: 'approved',
        feedback: feedback == null ? null : String(feedback).trim().slice(0, 4000) || null,
        reviewed_by: String(actorId || ''),
        reviewed_at: new Date(),
    });

    // Marking does NOT complete the class.
    //
    // Completion is the STUDENT's own action — the "Mark as complete" button in
    // the player, the same control every other class type uses. A teacher's
    // mark records the score and the feedback; it does not reach into the
    // student's progress and tick things off on their behalf, which also kept
    // the two in step when a teacher re-marked or corrected a score.
    return { message: 'Mark saved', submission: toPublic(row) };
};

/**
 * Every submission for one challenge — the teacher's review list for a class.
 * Student names are resolved by the controller, which can reach the auth DB.
 */
const listForLesson = async (lessonId, actorId, actorRole) => {
    const lesson = await loadChallenge(lessonId);
    await assertReviewerCanAccess(lesson, actorId, actorRole);
    const rows = await ChallengeSubmission.findAll({
        where: { lesson_id: lesson.id },
        order: [['submitted_at', 'DESC']],
    });
    const section = lesson.section_id
        ? await Section.findByPk(lesson.section_id, { attributes: ['id', 'title'], raw: true })
        : null;
    return {
        lesson: {
            id: lesson.id,
            title: lesson.title,
            challenge_url: lesson.lesson_src || null,
            session_title: section?.title || null,
        },
        submissions: rows.map((r) => toPublic(r)),
    };
};

/**
 * Every challenge the student can reach, with their own submission attached.
 *
 * Backs the student dashboard's Challenges tab, so it must list challenges they
 * have NOT yet attempted too — a tab that only showed submitted work would hide
 * the thing the student is meant to go and do.
 *
 * Scoped by the same course grant the player uses: a challenge in a course they
 * cannot open must not appear here.
 */
const listForStudent = async (userId) => {
    const uid = String(userId ?? '').trim();
    if (!uid) return { challenges: [] };

    const courseIds = await teachingSvc.coursesForStudent(uid);
    if (!courseIds.length) return { challenges: [] };

    const lessons = await Lesson.findAll({
        where: { course_id: { [Op.in]: courseIds }, lesson_type: 'challenge' },
        order: [['course_id', 'ASC'], ['sort', 'ASC']],
    });
    if (!lessons.length) return { challenges: [] };

    const sectionIds = [...new Set(lessons.map((l) => Number(l.section_id)).filter(Boolean))];
    const [subs, courses, sections] = await Promise.all([
        ChallengeSubmission.findAll({
            where: { user_id: uid, lesson_id: { [Op.in]: lessons.map((l) => l.id) } },
        }),
        Course.findAll({
            where: { id: { [Op.in]: [...new Set(lessons.map((l) => l.course_id))] } },
            attributes: ['id', 'title', 'slug'],
            raw: true,
        }),
        // The session each challenge sits in, so the student's card names the
        // same place the teacher's queue does. One batched lookup, not one
        // per challenge.
        sectionIds.length
            ? Section.findAll({ where: { id: { [Op.in]: sectionIds } }, attributes: ['id', 'title'], raw: true })
            : Promise.resolve([]),
    ]);

    const byLesson = new Map(subs.map((r) => [Number(r.lesson_id), r]));
    const courseById = new Map(courses.map((c) => [Number(c.id), c]));
    const sectionById = new Map(sections.map((x) => [Number(x.id), x]));

    return {
        max_score: MAX_SCORE,
        challenges: lessons.map((l) => {
            const course = courseById.get(Number(l.course_id)) || null;
            return {
                lesson_id: l.id,
                title: l.title,
                description: l.description || null,
                challenge_url: l.lesson_src || null,
                course_id: l.course_id,
                course_title: course?.title || null,
                course_slug: course?.slug || null,
                session_title: sectionById.get(Number(l.section_id))?.title || null,
                submission: toPublic(byLesson.get(Number(l.id)), { forStudent: true }),
            };
        }),
    };
};

/**
 * Every course this teacher can mark for.
 *
 * A teacher reaches a course three ways, and all three count — otherwise a
 * teacher delegated through a batch (the normal case for school cohorts) would
 * see an empty queue while their students wait:
 *   1. they created it            (courses.user_id)
 *   2. they are named on it       (courses.teacher_ids)
 *   3. a batch bound to it lists them (batch_teachers)
 *
 * An admin/root is not scoped at all — they mark anything.
 */
const courseIdsForReviewer = async (actorId, actorRole) => {
    if (actorRole === 'admin' || actorRole === 'root') return null; // null = no scope
    const me = String(actorId || '');
    if (!me) return [];

    const [owned, batched] = await Promise.all([
        Course.findAll({ attributes: ['id', 'user_id', 'teacher_ids'], raw: true }),
        sequelize.query(
            `SELECT DISTINCT b.course_id
               FROM batch_teachers bt
               JOIN batches b ON b.unique_id = bt.batch_id
              WHERE bt.user_id = :tid
                AND COALESCE(bt.status, 'active') = 'active'
                AND b.course_id IS NOT NULL`,
            { replacements: { tid: me }, type: sequelize.QueryTypes.SELECT },
        ),
    ]);

    const ids = new Set(batched.map((r) => Number(r.course_id)));
    for (const c of owned) {
        if (String(c.user_id || '') === me) { ids.add(Number(c.id)); continue; }
        let list = [];
        try {
            list = Array.isArray(c.teacher_ids) ? c.teacher_ids : JSON.parse(c.teacher_ids || '[]');
        } catch { list = []; }
        if (list.map((v) => String(v)).includes(me)) ids.add(Number(c.id));
    }
    return [...ids];
};

/**
 * The teacher dashboard's challenge queue: every submission across every course
 * they teach, newest first, with the lesson and course attached.
 *
 * Unmarked work sorts first — the queue exists to show what still needs doing,
 * not to re-read marks already given.
 */
const listForTeacher = async (actorId, actorRole) => {
    const courseIds = await courseIdsForReviewer(actorId, actorRole);
    if (courseIds && courseIds.length === 0) return { submissions: [], max_score: MAX_SCORE };

    const where = {};
    if (courseIds) where.course_id = { [Op.in]: courseIds };

    const rows = await ChallengeSubmission.findAll({
        where,
        order: [['submitted_at', 'DESC']],
        limit: 500,
    });
    if (!rows.length) return { submissions: [], max_score: MAX_SCORE };

    const lessonIds = [...new Set(rows.map((r) => Number(r.lesson_id)))];
    const [lessons, courses] = await Promise.all([
        Lesson.findAll({
            where: { id: { [Op.in]: lessonIds } },
            attributes: ['id', 'title', 'lesson_src', 'course_id', 'section_id'],
            raw: true,
        }),
        Course.findAll({
            where: { id: { [Op.in]: [...new Set(rows.map((r) => Number(r.course_id)).filter(Boolean))] } },
            attributes: ['id', 'title'],
            raw: true,
        }),
    ]);

    // The SESSION each challenge sits in. `sections` is the session table — it
    // kept its original name — so this is one extra lookup rather than a join
    // per row. Fetched after the lessons because only they know the ids.
    const sectionIds = [...new Set(lessons.map((l) => Number(l.section_id)).filter(Boolean))];
    const sections = sectionIds.length
        ? await Section.findAll({
            where: { id: { [Op.in]: sectionIds } },
            attributes: ['id', 'title'],
            raw: true,
        })
        : [];

    const lessonById = new Map(lessons.map((l) => [Number(l.id), l]));
    const courseById = new Map(courses.map((c) => [Number(c.id), c]));
    const sectionById = new Map(sections.map((x) => [Number(x.id), x]));

    const shaped = rows.map((r) => {
        const pub = toPublic(r);
        const l = lessonById.get(Number(r.lesson_id));
        return {
            ...pub,
            lesson_title: l?.title || null,
            challenge_url: l?.lesson_src || null,
            course_title: courseById.get(Number(r.course_id))?.title || null,
            session_title: sectionById.get(Number(l?.section_id))?.title || null,
        };
    });

    // Unmarked first (score == null — 0 is a real mark), then newest.
    shaped.sort((a, b) => {
        const am = a.score == null ? 0 : 1;
        const bm = b.score == null ? 0 : 1;
        if (am !== bm) return am - bm;
        return new Date(b.submitted_at) - new Date(a.submitted_at);
    });

    return {
        submissions: shaped,
        max_score: MAX_SCORE,
        pending: shaped.filter((s) => s.score == null).length,
    };
};

/** Pending count per challenge lesson, for the badge on a teacher's list. */
const pendingCountsByLesson = async (lessonIds = []) => {
    const ids = [...new Set(lessonIds.map(Number).filter(Number.isFinite))];
    if (!ids.length) return {};
    const rows = await ChallengeSubmission.findAll({
        attributes: ['lesson_id', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        where: { lesson_id: { [Op.in]: ids }, status: 'submitted' },
        group: ['lesson_id'],
        raw: true,
    });
    return Object.fromEntries(rows.map((r) => [Number(r.lesson_id), Number(r.n) || 0]));
};

module.exports = {
    submit,
    mark,
    listForStudent,
    listForTeacher,
    mySubmission,
    listForLesson,
    pendingCountsByLesson,
    normalizeUrl,
    STATUSES,
    MAX_SCORE,
};
