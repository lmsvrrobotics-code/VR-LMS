const { QueryTypes } = require('sequelize');
const svc = require('../services/ChallengeService');
const authDb = require('../config/authDatabase');

/**
 * CHALLENGE lessons — student submissions and teacher review.
 *
 * Authorization lives in the service (which owns the "can this student reach
 * this course" / "does this teacher teach it" rules) so it cannot be bypassed
 * by reaching the service from somewhere else. The controller's job is to take
 * the VERIFIED identity off req.authUser — never a request body or an
 * x-user-id header — and to decorate rows with student names, which only this
 * layer can reach (the auth DB is a separate connection).
 */

/**
 * The VERIFIED caller, normalised across the two middleware stacks.
 *
 * The student routes mount behind requireStudent/optionalAuth, which sets
 * `req.authUser = { userId, role }`. The teacher/admin routes mount behind
 * adminOrTeacher → auth, which sets `req.user` instead — and even that is not
 * one shape: a Supabase login carries `userId` (from lucy_devdb.users) while a
 * local admin JWT carries `id`.
 *
 * Reading only req.authUser left the teacher endpoints with an undefined actor,
 * so the queue scoped itself to "no courses" and came back empty for every
 * teacher. Resolving all three here keeps that difference in one place rather
 * than repeated in every handler.
 */
const actorFrom = (req) => {
    const a = req.authUser;
    if (a?.userId) return { userId: String(a.userId), role: a.role };
    const u = req.user || {};
    const id = u.userId ?? u.id;
    return { userId: id == null ? null : String(id), role: u.role };
};

/** Student names for a set of auth userIds. Best-effort: a name lookup
 *  failing must not take down a teacher's review queue. */
const namesFor = async (userIds = []) => {
    const ids = [...new Set(userIds.map((u) => String(u)).filter(Boolean))];
    if (!ids.length) return {};
    try {
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email, u.unique_id
               FROM lucy_devdb.users u
              WHERE u."userId" IN (:ids)`,
            { replacements: { ids }, type: QueryTypes.SELECT },
        );
        return Object.fromEntries(rows.map((r) => [String(r.id), {
            name: r.name || null,
            email: r.email || null,
            student_id: r.unique_id || null,
        }]));
    } catch (e) {
        console.warn('[challenge] name lookup failed:', e.message);
        return {};
    }
};

/** GET /api/public/challenges/:lessonId/my-submission (student) */
exports.mine = async (req, res, next) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) return res.status(401).json({ error: 'Please sign in to continue.' });
        const submission = await svc.mySubmission(req.params.lessonId, userId);
        res.json({ submission });
    } catch (e) { next(e); }
};

/** POST /api/public/challenges/:lessonId/submit (student) */
exports.submit = async (req, res, next) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) return res.status(401).json({ error: 'Please sign in to continue.' });
        const out = await svc.submit(req.params.lessonId, userId, req.body || {});
        res.json(out);
    } catch (e) { next(e); }
};

/** GET /api/admin/challenges/:lessonId/submissions (teacher/admin) */
exports.list = async (req, res, next) => {
    try {
        const { userId, role } = actorFrom(req);
        const out = await svc.listForLesson(req.params.lessonId, userId, role);
        const names = await namesFor(out.submissions.map((s) => s.user_id));
        res.json({
            ...out,
            submissions: out.submissions.map((s) => ({ ...s, student: names[String(s.user_id)] || null })),
        });
    } catch (e) { next(e); }
};

/** POST /api/admin/challenges/submissions/:id/mark (teacher/admin) */
exports.mark = async (req, res, next) => {
    try {
        const { userId, role } = actorFrom(req);
        const out = await svc.mark(req.params.id, req.body || {}, userId, role);
        res.json(out);
    } catch (e) { next(e); }
};

/** GET /api/admin/challenges/queue (teacher/admin) — the dashboard queue. */
exports.queue = async (req, res, next) => {
    try {
        const { userId, role } = actorFrom(req);
        const out = await svc.listForTeacher(userId, role);
        const names = await namesFor(out.submissions.map((s) => s.user_id));
        res.json({
            ...out,
            submissions: out.submissions.map((s) => ({ ...s, student: names[String(s.user_id)] || null })),
        });
    } catch (e) { next(e); }
};

/** GET /api/public/challenges/mine (student) — the Challenges tab. */
exports.listMine = async (req, res, next) => {
    try {
        const userId = req.authUser?.userId;
        if (!userId) return res.status(401).json({ error: 'Please sign in to continue.' });
        res.json(await svc.listForStudent(userId));
    } catch (e) { next(e); }
};
