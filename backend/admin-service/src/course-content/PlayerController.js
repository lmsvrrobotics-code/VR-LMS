const mockData = require('./mockData');
const watchStore = require('./watchStore');
const { Course, Lesson } = require('../models');

// Parse "HH:MM:SS" | "MM:SS" | a plain number → seconds.
const toSeconds = (raw) => {
    if (raw == null) return 0;
    if (typeof raw === 'number') return Math.max(0, Math.floor(raw));
    const str = String(raw).trim();
    if (str.includes(':')) {
        const parts = str.split(':').map((n) => parseInt(n, 10));
        if (parts.some(Number.isNaN)) return 0;
        let h = 0, m = 0, s = 0;
        if (parts.length === 3) [h, m, s] = parts;
        else if (parts.length === 2) [m, s] = parts;
        else [s] = parts;
        return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    }
    const n = Number(str);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

// Resolves the student making the request. Returns 0 (falsy) if missing — callers
// must check and reject rather than silently bucketing into a default user.
// The verified id first: requireStudent / attachVerifiedId write it to
// req.verifiedUserId and also overwrite the spoofable x-user-id header with it.
// user_id columns are VARCHAR and often NON-numeric ("VR20260701-01"), so the
// old Number() coercion turned those into 0 and 401'd every such student out of
// their own progress. Keep the trimmed string.
const getUserId = (req) => {
    const raw = req.verifiedUserId
        || req.authUser?.userId
        || req.headers['x-user-id']
        || req.query?.user_id
        || req.body?.user_id;
    return String(raw ?? '').trim();
};

exports.player = async (req, res) => {
    const { slug } = req.params;
    const { lesson_id } = req.query;
    try {
        const data = mockData.getPlayerData(slug, lesson_id, getUserId(req));
        if (!data) return res.status(404).json({ error: 'Course not found' });
        // also persist watching_lesson_id when a lesson is viewed
        if (data.lesson) mockData.setWatchingLesson(data.course.id, data.lesson.id, getUserId(req));
        return res.json(data);
    } catch (err) {
        console.warn('[player] failed:', err.message);
        return res.status(500).json({ error: 'Failed to load player' });
    }
};

exports.complete = async (req, res) => {
    const { course_id, lesson_id } = req.body;
    if (!course_id || !lesson_id) return res.status(422).json({ error: 'course_id and lesson_id are required' });
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'user not identified — send x-user-id header' });
    try {
        const h = mockData.markLessonComplete(course_id, lesson_id, userId);
        return res.json({ success: 'Lesson marked complete', history: h });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// Player posts the latest playback position periodically. We tally the watched
// seconds and auto-mark the lesson complete using the course's drip-content
// "Lesson completion rule":
//   - 'duration'   → complete once watched >= configured minimum_duration (sec)
//   - 'percentage' → complete once watched >= minimum_percentage of lesson length
//   - no drip      → default 30%-of-duration rule
// Course + lesson are read from the DB (the old code read them from in-memory
// mock arrays, so real courses never auto-completed — that was the bug).
exports.progress = async (req, res) => {
    const { course_id, lesson_id, current_duration } = req.body;
    if (!course_id || !lesson_id) return res.status(422).json({ error: 'course_id and lesson_id are required' });
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'user not identified' });
    try {
        const courseId = Number(course_id);
        const lessonId = Number(lesson_id);
        const seconds = Math.max(0, Math.floor(Number(current_duration) || 0));

        // 1. Persist the watched-seconds high-water mark (DB-authoritative).
        const row = watchStore.upsertDuration(courseId, lessonId, userId, seconds);
        const watchedSeconds = (row && row.current_duration != null) ? row.current_duration : seconds;

        // 2. Load the REAL course + lesson to apply the completion rule.
        const [course, lesson] = await Promise.all([
            Course.findByPk(courseId),
            Lesson.findByPk(lessonId),
        ]);
        const totalSeconds = lesson ? toSeconds(lesson.duration) : 0;

        let isCompleted = 0;
        // A quiz is completed by SUBMITTING it, never by elapsed time — its
        // `duration` is the time limit, not content length, so the dwell/percent
        // rules below would mark it done just for being opened. The player
        // stamps 0 seconds on open (to record "last opened"), which makes this
        // guard load-bearing rather than theoretical.
        const isQuiz = lesson && lesson.lesson_type === 'quiz';
        if (isQuiz) {
            isCompleted = 0;
        } else if (course && course.enable_drip_content) {
            let drip = {};
            try {
                drip = typeof course.drip_content_settings === 'string'
                    ? JSON.parse(course.drip_content_settings || '{}')
                    : (course.drip_content_settings || {});
            } catch { drip = {}; }

            if (totalSeconds <= 0) {
                // Readable lesson (PDF / text / document) — no media length, so
                // neither % nor near-end applies. Complete after a dwell = the
                // configured minimum_duration (if set) else 10s, so a non-video
                // lesson in a drip course doesn't lock the chain forever.
                const dwell = toSeconds(drip.minimum_duration) || 10;
                if (watchedSeconds >= dwell) isCompleted = 1;
            } else if (drip.lesson_completion_role === 'duration') {
                const minDur = toSeconds(drip.minimum_duration);
                if (minDur > 0 && watchedSeconds >= minDur) isCompleted = 1;
                else if (watchedSeconds + 4 >= totalSeconds) isCompleted = 1;
            } else {
                const pct = Number(drip.minimum_percentage || 30);
                const required = (totalSeconds * pct) / 100;
                if (required > 0 && watchedSeconds >= required) isCompleted = 1;
                else if (watchedSeconds + 4 >= totalSeconds) isCompleted = 1;
            }
        } else if (totalSeconds > 0) {
            if (watchedSeconds >= totalSeconds * 0.30) isCompleted = 1;
        }

        let history = null;
        if (isCompleted) history = mockData.markLessonComplete(courseId, lessonId, userId);

        return res.json({
            lesson_id: lessonId,
            watched_seconds: watchedSeconds,
            total_seconds: totalSeconds,
            is_completed: isCompleted,
            history,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
