const courseRepo = require('../repositories/CourseRepository');
const sectionRepo = require('../repositories/SectionRepository');
const lessonRepo = require('../repositories/LessonRepository');
const questionRepo = require('../repositories/QuestionRepository');
const quizSubmissionRepo = require('../repositories/QuizSubmissionRepository');
const { User, Course, BatchMember, Lesson, LessonCompletion, UserProgress } = require('../models');
const watchStore = require('./watchStore');
const teachingSvc = require('../services/TeachingAssignmentService');
const { computeGating } = require('../services/teachingLogic');
const bunny = require('../services/BunnyStream');
const cache = require('../config/cache');
const { QueryTypes, Op } = require('sequelize');
const authDb = require('../config/authDatabase');
const env = require('../config/env');

// Build an absolute URL for an uploaded asset path served by this service's
// /uploads static mount. CourseDetails.jsx renders <img src={creator.photo}>
// directly with no base prefix, so the API must return a fully qualified URL.
const absoluteUpload = (relPath) => {
    if (!relPath) return null;
    const base = String(env.appUrl || '').replace(/\/+$/, '');
    const clean = String(relPath).replace(/^\/+/, '');
    return `${base}/${clean}`;
};

const safeJSON = (raw, fallback) => {
    if (raw == null) return fallback;
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return fallback; }
};

// The admin curriculum stores quiz questions in their own `questions` table
// (QuizService.buildQuestionData): { title, type, options(JSON string),
// answer(JSON string|raw) }. The student QuizPlayer renders the SAME data the
// admin entered, so we normalise each row to a stable shape it can consume:
//   { q, type, options:[...], answer }
// where `answer` is the 0-based option index for mcq/true_false (so scoring is
// a simple equality check) and the raw expected text(s) for fill_blanks.
const normalizeQuizQuestion = (row) => {
    const r = row.toJSON ? row.toJSON() : row;
    const options = safeJSON(r.options, []);
    let answer;
    if (r.type === 'true_false') {
        // options rendered as ['True','False']; map stored "true"/"false".
        answer = String(r.answer).toLowerCase() === 'true' ? 0 : 1;
        return { id: r.id, q: r.title, type: r.type, options: ['True', 'False'], answer };
    }
    if (r.type === 'fill_blanks') {
        // No options; keep accepted answer(s) as a lowercased string list.
        const accepted = safeJSON(r.answer, [r.answer]).map((a) => String(a).trim().toLowerCase());
        return { id: r.id, q: r.title, type: r.type, options: [], answer: accepted };
    }
    // mcq (default): stored answer is a JSON array of correct option *values*.
    const correctVals = safeJSON(r.answer, []);
    const idx = options.findIndex((opt) => correctVals.includes(opt));
    return { id: r.id, q: r.title, type: 'mcq', options, answer: idx };
};

const sumLessonSeconds = (lessons) =>
    lessons.reduce((sum, l) => {
        const dur = l.duration || '00:00:00';
        const [h, m, s] = String(dur).split(':').map((x) => Number(x) || 0);
        return sum + (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    }, 0);

// Look up a single auth-service user by userId and shape it for the course
// detail page. No role filter — the assigned id was set by the admin via the
// teacher dropdown, so we trust it; filtering by `role='teacher'` here
// caused legitimate assignments to silently fall through when the role
// column's casing didn't match. Returns null when the id doesn't resolve.
const fetchAuthUser = async (userId) => {
    if (!userId) return null;
    try {
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email,
                    u.expertise, u.bio, u."linkedinUrl",
                    u."teacherPhoto", u."studentPhoto"
               FROM users u
              WHERE u."userId" = :id
              LIMIT 1`,
            { replacements: { id: String(userId).trim() }, type: QueryTypes.SELECT }
        );
        if (!rows.length) return null;
        const u = rows[0];
        // Instructor avatar source: the admin-uploaded teacher photo wins, then
        // fall back to the teacher's own self-service profile photo (studentPhoto
        // column, set from the dashboard Profile page), and only a deterministic
        // pravatar placeholder when neither exists. Mirrors forum.service's
        // COALESCE(teacherPhoto, studentPhoto) so the same avatar shows
        // everywhere a teacher is rendered.
        const uploadedPhoto = u.teacherPhoto || u.studentPhoto;
        const photo = uploadedPhoto
            ? absoluteUpload(uploadedPhoto)
            : `https://i.pravatar.cc/200?u=${u.id}`;
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            photo,
            about: u.expertise || '',
            biography: u.bio || '',
            skills: u.expertise || '',
            linkedinUrl: u.linkedinUrl || '',
        };
    } catch (err) {
        console.warn('[course] auth user lookup failed:', err.message);
        return null;
    }
};

// Resolve the teacher the admin assigned to a course. Walks every id in
// course.teacher_ids (not just [0]) so a stale/deleted first id doesn't
// block a valid later one. Only falls back to the admin-creator (course.user_id)
// as an absolute last resort, and logs the fact so it's obvious in dev when a
// course has no real teacher attached.
const resolveTeacher = async (course) => {
    const raw = safeJSON(course.teacher_ids, []);
    const ids = (Array.isArray(raw) ? raw : [raw])
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean);

    for (const id of ids) {
        const found = await fetchAuthUser(id);
        if (found && found.name) return found;
    }

    // Last-resort fallback: the course has no usable assignment. This is the
    // path that historically showed the admin-creator's name instead of the
    // real teacher — log so it's visible in dev.
    if (course.user_id) {
        console.warn(
            `[course] no assignable teacher on course ${course.id} ` +
            `(teacher_ids=${JSON.stringify(course.teacher_ids)}); ` +
            `falling back to creator user_id=${course.user_id}`
        );
        // Try the auth DB first (handles the case where the creator IS an
        // teacher account); fall back to the local admin User only when
        // that also misses.
        const fromAuth = await fetchAuthUser(course.user_id);
        if (fromAuth && fromAuth.name) return fromAuth;
        const creator = await User.findByPk(course.user_id);
        if (creator) {
            return {
                id: creator.id,
                name: creator.name,
                email: creator.email,
                photo: creator.photo || `https://i.pravatar.cc/200?u=${creator.id}`,
                about: creator.about || '',
                biography: creator.biography || '',
                skills: creator.skills || '',
            };
        }
    }
    return null;
};

const sanitizeCourse = (course, sections = [], lessons = [], creator = null) => {
    const c = course.toJSON ? course.toJSON() : { ...course };
    const lessonsBySection = sections.reduce((acc, sec) => {
        acc[sec.id] = lessons.filter((l) => l.section_id === sec.id);
        return acc;
    }, {});

    const sectionPayload = sections.map((s) => ({
        id: s.id,
        title: s.title,
        sort: s.sort,
        lessons: (lessonsBySection[s.id] || []).map((l) => ({
            id: l.id,
            title: l.title,
            duration: l.duration || '00:00:00',
            lesson_type: l.lesson_type,
            is_free: l.is_free || 0,
        })),
    }));

    return {
        id: c.id,
        user_id: c.user_id,
        category_id: c.category_id,
        title: c.title,
        slug: c.slug,
        short_description: c.short_description || '',
        description: c.description || '',
        requirements: c.requirements || '[]',
        outcomes: c.outcomes || '[]',
        faqs: c.faqs || '[]',
        language: c.language || 'english',
        level: c.level || 'beginner',
        // Class-access range (Class 1–12). NULL = open to all classes.
        class_from: c.class_from == null ? null : Number(c.class_from),
        class_to: c.class_to == null ? null : Number(c.class_to),
        is_paid: c.is_paid ?? 0,
        // Free public sample/teaser course — open to every registered student
        // in the normal player (no payment / release gating).
        is_marketing: !!c.is_marketing,
        price: Number(c.price || 0),
        discount_flag: c.discount_flag || 0,
        discounted_price: Number(c.discounted_price || 0),
        // Months of access after enrolment; NULL means lifetime. Surfaced on
        // the public course-details "This course includes" line so students
        // see the real expiry the admin set in the Pricing tab.
        expiry_period: c.expiry_period == null ? null : Number(c.expiry_period),
        // Admin-set Score denominator + Lectures label for the details stats
        // card. score_max NULL = no max set; lectures_label '' = renders "—".
        score_max: c.score_max == null ? null : Number(c.score_max),
        lectures_label: c.lectures_label || '',
        thumbnail: c.thumbnail || '',
        banner: c.banner || c.thumbnail || '',
        preview: c.preview || '',
        status: c.status,
        // Default to true when the column is missing so older rows keep the
        // pre-toggle behaviour ("Certificate Course" always shown).
        has_certificate: c.has_certificate === undefined || c.has_certificate === null
            ? true
            : !!c.has_certificate,
        enrolled: 0,
        review_count: 0,
        // Real admin-set value from the courses table (Course model has an
        // average_rating column). Was hardcoded to 0, which made the detail
        // page always show a 0 rating regardless of what the admin entered.
        average_rating: Number(c.average_rating || 0),
        section_count: sections.length,
        lesson_count: lessons.length,
        total_duration_secs: sumLessonSeconds(lessons),
        sections: sectionPayload,
        // creator is the already-shaped object returned by resolveTeacher
        // (assigned-teacher first, legacy course.user_id fallback). It
        // matches the {id,name,email,photo,about,biography,skills} shape the
        // student CourseDetails page expects, so we pass it through.
        creator: creator || null,
    };
};

const list = async (query = {}) => {
    const limit = 12;
    const page = Number(query.page) || 1;
    const offset = (page - 1) * limit;

    const where = { status: 'active' };

    // Course grouping is now exclusively by college. `clgId` (the logged-in
    // student's college) is required: without it we return an empty list
    // flagged `no_college` so the UI can prompt for a college binding. Any
    // legacy `category_id` query param is intentionally ignored.
    const clgId = typeof query.clgId === 'string' ? query.clgId.trim() : '';
    if (!clgId) {
        return {
            data: [],
            total: 0,
            per_page: limit,
            current_page: page,
            last_page: 1,
            categories: [],
            no_college: true,
        };
    }
    // Postgres JSONB @> "contains" — RHS must be a JSON array literal.
    const escapedClgId = Course.sequelize.escape(JSON.stringify([String(clgId)]));
    where[require('sequelize').Op.and] = [
        Course.sequelize.literal(`clg_ids @> ${escapedClgId}::jsonb`),
    ];

    const { count, rows } = await Course.findAndCountAll({
        where,
        order: [['id', 'DESC']],
        limit,
        offset,
    });

    // Strict student-scope gate: when user_id is supplied, only courses
    // whose batch_ids overlap one of the student's batches surface. The
    // admin links every course to specific batches, so unscoped courses
    // and courses missed by the student's memberships must NOT leak through.
    // Anonymous callers (no user_id) still get the college-only result —
    // they're public catalog browsers, not enrolled students.
    const userIdRaw = query.user_id;
    let filteredRows = rows;
    if (userIdRaw) {
        const memberRows = await BatchMember.findAll({
            where: { user_id: String(userIdRaw) },
            attributes: ['batch_id'],
            raw: true,
        }).catch(() => []);
        const studentBatchIds = new Set(
            memberRows.map((r) => Number(r.batch_id)).filter((n) => Number.isFinite(n))
        );
        if (studentBatchIds.size === 0) {
            filteredRows = [];
        } else {
            filteredRows = rows.filter((r) => {
                const cb = Array.isArray(r.batch_ids) ? r.batch_ids : [];
                if (cb.length === 0) return false;
                return cb.some((id) => studentBatchIds.has(Number(id)));
            });
        }
    }

    // Per-course progress hydration for the signed-in student. We batch two
    // cheap aggregate queries (lesson count per course, completion count per
    // course for this user) so the card list can render a progress bar without
    // each card refetching the player payload.
    const progressByCourse = new Map();
    const uidNum = Number(userIdRaw);
    if (Number.isFinite(uidNum) && uidNum > 0 && filteredRows.length) {
        const courseIds = filteredRows.map((r) => r.id);
        try {
            const [lessonTotals, completionTotals] = await Promise.all([
                Lesson.findAll({
                    attributes: [
                        'course_id',
                        [Course.sequelize.fn('COUNT', Course.sequelize.col('id')), 'total'],
                    ],
                    where: { course_id: courseIds },
                    group: ['course_id'],
                    raw: true,
                }),
                LessonCompletion.findAll({
                    attributes: [
                        'course_id',
                        [Course.sequelize.fn('COUNT', Course.sequelize.col('id')), 'done'],
                    ],
                    where: { course_id: courseIds, user_id: String(userIdRaw) },
                    group: ['course_id'],
                    raw: true,
                }),
            ]);
            const totals = new Map(lessonTotals.map((r) => [Number(r.course_id), Number(r.total) || 0]));
            const dones = new Map(completionTotals.map((r) => [Number(r.course_id), Number(r.done) || 0]));
            for (const cid of courseIds) {
                const total = totals.get(cid) || 0;
                const done = Math.min(dones.get(cid) || 0, total);
                const pct = total ? Math.round((done / total) * 100) : 0;
                progressByCourse.set(cid, { total, done, pct });
            }
        } catch (e) {
            console.warn('[public/courses] progress hydration failed:', e.message);
        }
    }

    return {
        data: filteredRows.map((r) => {
            const card = sanitizeCourse(r);
            const p = progressByCourse.get(r.id);
            if (p) {
                card.lesson_count = p.total;
                card.completed_lesson_count = p.done;
                card.progress_pct = p.pct;
            }
            return card;
        }),
        // total is pre-narrowing — the frontend uses it only for "no results"
        // detection (length 0). Using the post-filter length keeps the count
        // honest with what the user actually sees and avoids ghost-pagination
        // (a page that shows "13 results" with only 2 cards because batch
        // narrowing dropped the rest).
        total: filteredRows.length,
        per_page: limit,
        current_page: page,
        last_page: Math.max(1, Math.ceil(filteredRows.length / limit)),
        categories: [],
    };
};

const detailsBySlug = async (slug, clgId = null, verifiedUserId = null) => {
    const course = await Course.findOne({ where: { slug } });
    if (!course) return null;

    // College gate: when the caller has a college set, the course's clg_ids
    // must contain it. Returning null is treated by the controller as
    // 404 — we deliberately don't 403 so we don't leak which slugs exist
    // for other colleges.
    if (clgId) {
        const ids = Array.isArray(course.clg_ids) ? course.clg_ids : [];
        if (!ids.includes(clgId)) return null;
    }

    const sections = await sectionRepo.findByCourse(course.id);
    const sectionIds = sections.map((s) => s.id);
    const lessons = await lessonRepo.findBySectionIds(sectionIds);
    const creator = await resolveTeacher(course);

    const sanitized = sanitizeCourse(course, sections, lessons, creator);
    // "Assigned" = an admin/teacher delegated this course to the student via an
    // explicit roster (individual or batch), OR the student is enrolled in a program
    // that includes this course. This determines if the student can access the course.
    // Only students with admin-granted access see "Go to Course"; others see locked lessons.
    sanitized.assigned = false;
    if (verifiedUserId) {
        try {
            const gate = await teachingSvc.visibleLessonIdsForStudent(course.id, verifiedUserId);
            sanitized.assigned = gate.rosterScoped === true;
        } catch (e) {
            console.warn('[details] assignment check failed:', e.message);
        }
    }

    // Student's own completion % for this course (DB-authoritative). 0 for an
    // anonymous viewer or a not-yet-started course — drives the progress bar on
    // the course-details page.
    let progress = 0;
    if (verifiedUserId) {
        try {
            const hist = await watchStore.getHistoryDb(course.id, verifiedUserId);
            const done = hist?.completed_lesson?.length || 0;
            const total = sanitized.lesson_count || 0;
            progress = total ? Math.round((done / total) * 100) : 0;
        } catch (e) {
            console.warn('[details] progress read failed:', e.message);
        }
    }
    sanitized.progress = progress;

    // Class rank + earned score. The "class" = everyone TAKING this course
    // (roster ∪ enrolled ∪ admin-assigned), so a student gets a live position the moment
    // they're in the class — even before earning points (tie-broken by score).
    // Earned score comes from the per-course leaderboard (lessons + quizzes).
    // Only a viewer who is actually in the class gets a rank; others see "—".
    // Best-effort: a failure here must never break the course-details page.
    sanitized.class_total = 0;
    sanitized.class_rank = null;
    sanitized.student_score = 0;
    if (verifiedUserId) {
        try {
            const rankingSvc = require('../services/RankingService');
            const [lb, enrolledRows, rosterIds] = await Promise.all([
                rankingSvc.build({ courseId: course.id, meUserId: verifiedUserId, limit: 100 }),
                UserProgress.findAll({ where: { course_id: course.id, enrolled: true }, attributes: ['user_id'], raw: true }),
                teachingSvc.studentsForCourse(course.id),
            ]);

            const classIds = new Set();
            enrolledRows.forEach((r) => r.user_id && classIds.add(String(r.user_id)));
            rosterIds.forEach((id) => classIds.add(String(id)));

            const meId = String(verifiedUserId);
            const viewerInClass = sanitized.assigned || classIds.has(meId);
            if (viewerInClass) classIds.add(meId);

            const myScore = lb.me?.score || 0;
            sanitized.student_score = myScore;
            sanitized.class_total = classIds.size;
            if (viewerInClass && classIds.size > 0) {
                // Rank = 1 + classmates with a strictly higher score.
                const higher = (lb.leaderboard || []).filter(
                    (r) => classIds.has(String(r.user_id)) && Number(r.score) > myScore,
                ).length;
                sanitized.class_rank = higher + 1;
            }
        } catch (e) {
            console.warn('[details] class rank read failed:', e.message);
        }
    }

    return {
        course: sanitized,
        reviews: [],
    };
};

// Canonical "My Courses" for a student in the lms_admin universe: the union of
// courses they PAID for, are ENROLLED in (program), or are DELEGATED (teacher
// roster / school-batch). Each card carries a progress %. This replaces the
// legacy course-service /enroll/my-courses (different DB, different course ids).
const myCourses = async (userIdRaw) => {
    const uid = String(userIdRaw ?? '').trim();
    if (!uid) return { courses: [] };
    // Cache per-student (60s). Invalidated immediately on admin actions
    // so a buyer sees their course at once; delegation/enrollment changes show
    // within the TTL.
    return cache.wrap(`mycourses:${uid}`, 60, () => myCoursesUncached(uid));
};

const myCoursesUncached = async (uid) => {
    // "My courses" now only includes courses the admin has granted access to:
    // - Enrolled (program membership)
    // - Delegated (teaching assignment or roster member)
    // Payment-based access has been removed.
    const [enrolledRows, delegatedIds] = await Promise.all([
        UserProgress.findAll({ where: { user_id: uid, enrolled: true }, attributes: ['course_id'], raw: true }),
        teachingSvc.coursesForStudent(uid),
    ]);

    const ids = new Set();
    for (const r of enrolledRows) if (r.course_id) ids.add(Number(r.course_id));
    for (const c of delegatedIds) ids.add(Number(c));
    if (!ids.size) return { courses: [] };
    const idList = [...ids];

    const [courseRows, completed, lessonTotals] = await Promise.all([
        Course.findAll({ where: { id: { [Op.in]: idList } } }),
        watchStore.completedCountsByCourse(uid),
        Lesson.findAll({
            where: { course_id: { [Op.in]: idList } },
            attributes: ['course_id', [Course.sequelize.fn('COUNT', Course.sequelize.col('id')), 'total']],
            group: ['course_id'],
            raw: true,
        }),
    ]);

    const doneBy = Object.fromEntries(completed.map((c) => [c.course_id, c.count]));
    const totalBy = Object.fromEntries(lessonTotals.map((r) => [Number(r.course_id), Number(r.total) || 0]));

    const courses = courseRows.map((c) => {
        const card = sanitizeCourse(c);
        const total = totalBy[c.id] || 0;
        const done = doneBy[c.id] || 0;
        card.progress = total ? Math.round((done / total) * 100) : 0;
        return card;
    });
    return { courses };
};

const detailsFirstActive = async () => {
    const course = await Course.findOne({ where: { status: 'active' }, order: [['id', 'DESC']] });
    if (!course) return null;
    return detailsBySlug(course.slug);
};

// userIdRaw lets the caller (server.js) pass in the requesting student. When
// missing/invalid, progress fields render as zero (anonymous browse).
const playerData = async (slug, lessonIdRaw, userIdRaw, { verifiedUserId = null, verifiedRole = null } = {}) => {
    const course = await Course.findOne({ where: { slug } });
    if (!course) return null;

    // Privileged viewer = the people who run the course, not consume it. They
    // get FULL access to every section/lesson regardless of release or payment:
    //   - any admin / root, and
    //   - a teacher who owns this course (created it, or is in teacher_ids).
    // Release-gating ("students only see what the teacher released") and the
    // paywall apply ONLY to students. This must trust the VERIFIED role/id —
    // never the spoofable x-user-id header.
    const courseTeacherIds = safeJSON(course.teacher_ids, [])
        .map((v) => String(v ?? '').trim())
        .filter(Boolean);
    const isPrivilegedViewer =
        verifiedRole === 'admin' || verifiedRole === 'root' ||
        (verifiedRole === 'teacher' && !!verifiedUserId && (
            String(course.user_id || '') === String(verifiedUserId) ||
            courseTeacherIds.includes(String(verifiedUserId))
        ));
    // Marketing/sample courses are a free public teaser: fully open to everyone
    // (no drip, no teacher-release gating, no paywall) so a freshly-registered
    // student can watch them in the normal player to get hooked on VR Robotics.
    const isMarketing = !!course.is_marketing;
    const bypassGating = isPrivilegedViewer || isMarketing;

    const sections = await sectionRepo.findByCourse(course.id);
    const sectionIds = sections.map((s) => s.id);
    const lessons = await lessonRepo.findBySectionIds(sectionIds);
    const creator = await resolveTeacher(course);
    const sanitized = sanitizeCourse(course, sections, lessons, creator);

    const flatLessons = sanitized.sections.flatMap((s) => s.lessons);
    const VIDEO_TYPES = ['video-url', 'system-video', 'vimeo-url', 'html5', 'google_drive'];
    const firstVideoId = flatLessons.find((l) => VIDEO_TYPES.includes(l.lesson_type))?.id;
    const lessonId = Number(lessonIdRaw) || firstVideoId || flatLessons[0]?.id || null;
    const currentLessonRow = lessonId ? lessons.find((l) => l.id === lessonId) : null;

    const lesson = currentLessonRow
        ? {
            id: currentLessonRow.id,
            section_id: currentLessonRow.section_id,
            course_id: currentLessonRow.course_id,
            title: currentLessonRow.title,
            duration: currentLessonRow.duration || '00:00:00',
            lesson_type: currentLessonRow.lesson_type,
            is_free: currentLessonRow.is_free || 0,
            lesson_src: currentLessonRow.lesson_src || '',
            attachment: currentLessonRow.attachment || '',
            description: currentLessonRow.description || '',
            sort: currentLessonRow.sort,
            // Quiz-only admin-set metadata — shown on the cover/intro screen
            // before the student clicks Start Quiz. Null on non-quiz lessons.
            total_mark: currentLessonRow.lesson_type === 'quiz'
                ? Number(currentLessonRow.total_mark || 0) : null,
            pass_mark: currentLessonRow.lesson_type === 'quiz'
                ? Number(currentLessonRow.pass_mark || 0) : null,
            retake: currentLessonRow.lesson_type === 'quiz'
                ? Number(currentLessonRow.retake || 0) : null,
        }
        : null;

    const userId = Number(userIdRaw) > 0 ? Number(userIdRaw) : 0;

    // For quiz lessons, load the admin-authored questions and expose them so
    // the player shows exactly what the admin added. QuizPlayer reads
    // lesson.questions (falling back to legacy lesson.attachment JSON). We
    // also surface this student's prior attempts so that re-entering the
    // lesson shows the last score and the correct "try again" state instead
    // of a fresh quiz.
    if (lesson && currentLessonRow.lesson_type === 'quiz') {
        const rows = await questionRepo.findByQuiz(currentLessonRow.id);
        lesson.questions = rows.map(normalizeQuizQuestion);

        // Read per-quiz state from the JSON mirror on the student row
        // (users.quizScores[quiz_id]) — auth-DB scoped, so the auth userId
        // string round-trips correctly even though quiz_submissions.user_id
        // clamps large ids to INT max.
        let quizState = { attempts_used: 0, last_score: null, last_total: null };
        if (userId) {
            try {
                // Postgres JSONB key access — quizScores is a JSONB object
                // keyed by quiz id (stringified). `->` returns the JSON
                // value; pg returns it already-parsed as a JS object.
                const rows = await authDb.query(
                    `SELECT "quizScores" -> :qid AS slot
                       FROM users WHERE "userId" = :uid`,
                    {
                        replacements: { qid: String(currentLessonRow.id), uid: String(userId) },
                        type: QueryTypes.SELECT,
                    }
                );
                const slot = rows[0]?.slot;
                if (slot && typeof slot === 'object') {
                    quizState = {
                        attempts_used: Number(slot.attempts) || 0,
                        last_score: slot.score == null ? null : Number(slot.score),
                        last_total: slot.total == null ? null : Number(slot.total),
                    };
                }
            } catch (e) {
                console.warn('[playerData] quizScores read failed:', e.message);
            }
        }
        lesson.quiz_state = quizState;
    }
    // DB-authoritative progress (works across server instances); fall back to
    // the in-memory cache only if the DB read fails.
    let stored = null;
    if (userId) {
        try {
            stored = await watchStore.getHistoryDb(course.id, userId);
        } catch (e) {
            console.warn('[playerData] DB progress read failed, using cache:', e.message);
            stored = watchStore.getHistory(course.id, userId);
        }
    }
    const completedIds = stored ? stored.completed_lesson : [];
    const totalLessons = sanitized.lesson_count;
    const progress = totalLessons ? Math.round((completedIds.length / totalLessons) * 100) : 0;

    const lockedLessonIds = [];
    // Drip (sequential unlock) also only applies to students — a privileged
    // viewer (course teacher / admin) sees the whole curriculum unlocked.
    if (course.enable_drip_content && !bypassGating) {
        let blocked = false;
        for (const sec of sanitized.sections) {
            for (const l of sec.lessons) {
                if (blocked) lockedLessonIds.push(l.id);
                else if (!completedIds.includes(l.id)) blocked = true;
            }
        }
    }

    // --- Teacher-delegation release gating (additive, server-enforced) ------
    // If an admin has delegated this course to a teacher, the student may only
    // see lessons the teacher has RELEASED to their roster. We both (a) lock
    // every un-released lesson and (b) strip the video/attachment from the
    // CURRENT lesson when it isn't released — so the URL can't be obtained by
    // calling the player with an arbitrary lesson_id. Free lessons stay open.
    // Courses with no teaching assignment are untouched (enforced === false).
    let delegated = false;
    // True only when the student matched an explicit roster (B2B school/batch
    // delegation). The paywall below is skipped for those students; everyone
    // else (B2C / global release) is still paywalled on top of release-gating.
    let rosterScoped = false;
    // Privileged viewers (the course's own teacher / admins) bypass release
    // gating entirely — they need to see every lesson to teach and to decide
    // what to release. Only students are gated. Marketing courses are open too.
    if (!bypassGating) try {
        // Release-gating trusts ONLY a verified identity. If the request had no
        // valid token, verifiedUserId is null → on a delegated course nothing is
        // visible (everything locked, video src withheld). This prevents
        // unlocking another student's content by spoofing x-user-id.
        const gate = await teachingSvc.visibleLessonIdsForStudent(course.id, verifiedUserId);
        rosterScoped = gate.rosterScoped === true;
        if (gate.enforced) {
            delegated = true;
            const { lockedLessonIds: gatedLocks, stripCurrent } = computeGating({
                visibleLessonIds: gate.lessonIds,
                // Teacher RELEASE is the master gate: a lesson is visible only
                // when released, even if it's flagged is_free. (is_free still
                // exempts a lesson from the PAYWALL below — free means "no
                // payment required", not "skips the teacher's drip".) Passing an
                // empty free list here is what makes "only released = enabled,
                // otherwise disabled" hold for every lesson.
                freeLessonIds: [],
                allLessonIds: flatLessons.map((l) => l.id),
                currentLessonId: lesson?.id ?? null,
                alreadyLocked: lockedLessonIds,
            });
            // Replace lockedLessonIds' contents in place (it's a const binding).
            lockedLessonIds.length = 0;
            for (const id of gatedLocks) lockedLessonIds.push(id);
            if (lesson && stripCurrent) {
                lesson.locked = true;
                lesson.lesson_src = '';
                lesson.attachment = '';
                if (Array.isArray(lesson.questions)) lesson.questions = [];
            }
        }
    } catch (e) {
        console.warn('[playerData] release-gating failed:', e.message);
    }

    // --- Admin-Controlled Access (removed payment) ----------------------------
    // Courses are now admin-controlled: students/teachers can only access if the
    // admin has granted them enrollment or a teaching assignment. No payment walls.
    // This is enforced by the release-gating logic above (teacher delegation +
    // batch enrollment). Students without access see locked lessons until the
    // admin adds them to the roster or teaching assignment.
    const paywalled = false;

    // Sign the (still-served) video URL with a short-lived Bunny token so a
    // leaked/shared link expires and a revoked student can't keep playing one
    // they already fetched. No-op unless BUNNY_STREAM_TOKEN_KEY is configured,
    // and only affects Bunny-hosted URLs — external/embed srcs pass through.
    if (lesson && lesson.lesson_src && VIDEO_TYPES.includes(lesson.lesson_type)) {
        lesson.lesson_src = bunny.signPlaybackUrl(lesson.lesson_src) || lesson.lesson_src;
    }

    return {
        course: sanitized,
        lesson,
        delegated,
        paywalled,
        history: {
            course_id: course.id,
            student_id: userId,
            watching_lesson_id: stored?.watching_lesson_id || lesson?.id || null,
            completed_lesson: completedIds,
        },
        locked_lesson_ids: lockedLessonIds,
        progress,
        completed_lesson_count: completedIds.length,
    };
};

// Record one quiz attempt for a student. The frontend computes the score
// (it already does for instant feedback); we persist score/total so a later
// page load can restore the result and remaining-retry state. Returns the
// authoritative attempt count after saving.
const submitQuiz = async ({ quiz_id, user_id, score, total, answers }) => {
    // user_id is the auth users.userId (string). quiz_submissions.user_id is
    // varchar, so we store the real id directly — no INT clamping, no collapsing
    // big-id students into one row. The users.quizScores JSONB mirror (keyed by
    // the same string) holds the per-quiz attempt count / last score.
    const uidStr = String(user_id || '').trim();
    const qid = Number(quiz_id);
    if (!uidStr || !qid) {
        // No identity → can't persist per-user; report a transient count of 1
        // so the client still shows the result for this session.
        return { attempts_used: 1, persisted: false };
    }
    await quizSubmissionRepo.create({
        quiz_id: qid,
        // Store the real auth id (column is varchar) — no INT clamping.
        user_id: uidStr,
        score: Number(score),
        total: Number(total),
        correct_answer: JSON.stringify(score),
        wrong_answer: JSON.stringify(Math.max(0, Number(total) - Number(score))),
        submits: JSON.stringify({ score: Number(score), total: Number(total), answers: answers || null }),
    });

    // Completing a quiz = completing that lesson. Mark it done so it counts in
    // progress + leaderboard automatically — no separate "mark as read" step.
    // (quiz_id is the quiz lesson's id; look up its course to key the row.)
    try {
        const quizLesson = await Lesson.findByPk(qid, { attributes: ['course_id'], raw: true });
        if (quizLesson?.course_id) {
            await LessonCompletion.findOrCreate({
                where: { user_id: uidStr, lesson_id: qid },
                defaults: { user_id: uidStr, course_id: Number(quizLesson.course_id), lesson_id: qid },
            });
        }
    } catch (e) {
        console.warn('[submitQuiz] auto-complete failed:', e.message);
    }

    // Mirror onto the student schema: users.quizScores is a JSON object
    // keyed by quiz_id. Each quiz's slot holds the latest score/total plus
    // attempt count. Keys are independent — submitting quiz A never touches
    // quiz B's slot. JSON_SET on a NULL column is fine: COALESCE seeds it
    // to '{}' on first write. We compute the per-user attempt count by
    // reading the current JSON slot (auth-DB scoped to uidStr), avoiding
    // the INT-clamping bug in quiz_submissions.user_id.
    let attempts_used = 1;
    try {
        // Postgres JSONB read: ->'<qid>'->>'attempts' returns the nested
        // attempt count as TEXT (`->>` casts to text); parse to number.
        const cur = await authDb.query(
            `SELECT "quizScores" -> :qid ->> 'attempts' AS prev
               FROM users WHERE "userId" = :uid`,
            { replacements: { qid: String(qid), uid: uidStr }, type: QueryTypes.SELECT }
        );
        const prev = cur[0]?.prev;
        attempts_used = (Number.isFinite(Number(prev)) ? Number(prev) : 0) + 1;

        // jsonb_set replaces (or creates, with create_missing=true) the path
        // `{<qid>}` in the JSONB column. COALESCE seeds NULL → '{}' so first
        // writes work without a default.
        await authDb.query(
            `UPDATE users
                SET "quizScores" = jsonb_set(
                    COALESCE("quizScores", '{}'::jsonb),
                    ARRAY[:qid],
                    jsonb_build_object(
                        'score', :score::int,
                        'total', :total::int,
                        'attempts', :attempts::int,
                        'lastAttemptAt', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
                    ),
                    true
                )
              WHERE "userId" = :uid`,
            {
                replacements: {
                    qid: String(qid),
                    score: Number(score),
                    total: Number(total),
                    attempts: attempts_used,
                    uid: uidStr,
                },
                type: QueryTypes.UPDATE,
            }
        );
    } catch (e) {
        // Best-effort: the submission row is the source of truth, the JSON
        // mirror is denormalized convenience. Don't fail the request.
        console.warn('[submitQuiz] failed to mirror users.quizScores:', e.message);
        // Fall back to counting submission rows (now keyed by the real id).
        try { attempts_used = await quizSubmissionRepo.countByQuizAndUser(qid, uidStr); }
        catch { /* keep attempts_used = 1 */ }
    }

    return { attempts_used, persisted: true };
};

// Public marketing catalog — every active course, NOT college-scoped, with
// just the fields the public home "Our Courses" preview needs (title, slug,
// short description, thumbnail, level). Deliberately separate from list()
// (which is the student-facing, college- and batch-scoped catalog) so this
// preview can render on the anonymous home page without leaking enrolment
// scope or pulling the heavier per-student progress hydration.
const catalog = async ({ limit = 12, classFrom = null, classTo = null, track = null, search = null, homeOnly = false } = {}) => {
    // Optional class-bucket filter [classFrom, classTo]. The admin assigns a
    // course to one discrete bucket (e.g. "8–12" or "12–18"), and the navbar
    // filters by those same buckets, so we use CONTAINMENT (the course range
    // must fit INSIDE the selected bucket), not overlap — otherwise courses on
    // a shared boundary (class 12) would leak into both buckets. A course with
    // NULL bounds is "open to all classes" and shows in every bucket.
    // Note: Number(null) === 0 (finite), so we must check the raw values are
    // actually present before treating this as a filtered request — otherwise
    // an unfiltered call looks like a bogus 0–0 bucket and matches nothing.
    const present = (v) => v !== null && v !== undefined && v !== '';
    const cf = Number(classFrom);
    const ct = Number(classTo);
    const hasFilter = present(classFrom) && present(classTo) && Number.isFinite(cf) && Number.isFinite(ct);

    const where = { status: 'active' };
    // Home preview: only courses the admin explicitly pushed to the Home page
    // ("Show on Home" toggle). The full /courses/browse catalog and the navbar
    // dropdown filters are NOT affected — they keep listing every active course.
    if (homeOnly) where.show_on_home = true;
    if (hasFilter) {
        const { Op } = require('sequelize');
        where[Op.and] = [
            { [Op.or]: [{ class_from: null }, { class_from: { [Op.gte]: cf } }] },
            { [Op.or]: [{ class_to: null }, { class_to: { [Op.lte]: ct } }] },
        ];
    }
    // Optional track filter (course_type): 'engineering' or 'freshers'. Mirrors
    // the navbar dropdown's ?track= links. 'general'/'all'/empty = no filter.
    const t = String(track || '').trim().toLowerCase();
    if (t === 'engineering' || t === 'freshers') {
        where.course_type = t;
    }
    // Optional keyword search over title + short description (kid-friendly free
    // text from the home/catalog search box). Case-insensitive substring match.
    const q = String(search || '').trim();
    if (q) {
        const { Op } = require('sequelize');
        where[Op.or] = [
            { title: { [Op.iLike]: `%${q}%` } },
            { short_description: { [Op.iLike]: `%${q}%` } },
        ];
    }

    const rows = await Course.findAll({
        where,
        order: [['id', 'DESC']],
        limit: Math.min(Number(limit) || 12, 48),
    });

    // Lesson count + total duration per course, for the "N Lessons / N+ Hours"
    // meta row on the home course cards. One query over all listed courses,
    // grouped in JS (durations are "HH:MM:SS" strings, summed like
    // sumLessonSeconds does elsewhere).
    const courseIds = rows.map((r) => r.id);
    const agg = new Map(); // course_id -> { count, secs }
    if (courseIds.length) {
        const lessons = await Lesson.findAll({
            where: { course_id: courseIds },
            attributes: ['course_id', 'duration'],
            raw: true,
        }).catch(() => []);
        for (const l of lessons) {
            const cid = Number(l.course_id);
            const cur = agg.get(cid) || { count: 0, secs: 0 };
            cur.count += 1;
            const [h, m, s] = String(l.duration || '00:00:00').split(':').map((x) => Number(x) || 0);
            cur.secs += h * 3600 + m * 60 + s;
            agg.set(cid, cur);
        }
    }

    return rows.map((r) => {
        const c = sanitizeCourse(r);
        const a = agg.get(r.id) || { count: 0, secs: 0 };
        return {
            id: c.id,
            title: c.title,
            slug: c.slug,
            short_description: c.short_description,
            thumbnail: c.thumbnail,
            level: c.level,
            class_from: c.class_from,
            class_to: c.class_to,
            lesson_count: a.count,
            total_duration_secs: a.secs,
            // Free sample/teaser → always playable, shown with a "Free sample" badge.
            is_marketing: !!c.is_marketing,
        };
    });
};

module.exports = { list, catalog, detailsBySlug, detailsFirstActive, playerData, submitQuiz, myCourses };
