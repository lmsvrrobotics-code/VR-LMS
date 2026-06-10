const { Op, QueryTypes } = require('sequelize');
const courseRepo = require('../repositories/CourseRepository');
const categoryRepo = require('../repositories/CategoryRepository');
const authDb = require('../config/authDatabase');
const assessmentDb = require('../config/assessmentDatabase');
const sectionRepo = require('../repositories/SectionRepository');
const lessonRepo = require('../repositories/LessonRepository');
const seoRepo = require('../repositories/SeoFieldRepository');
const questionRepo = require('../repositories/QuestionRepository');
const submissionRepo = require('../repositories/QuizSubmissionRepository');
const { Lesson, Section, User, Category, UserProgress, BatchMember } = require('../models');
const slugify = require('../helpers/slugify');
const { upload, removeFile, niceFileName } = require('../helpers/fileUploader');
const mailer = require('../helpers/mailer');
const env = require('../config/env');
const { enqueueMany } = require('../jobs/emailQueue');
const { courseAssignedToStudent } = require('../helpers/emailTemplates');
const { HttpError } = require('../middlewares/error');
const teachingSvc = require('./TeachingAssignmentService');

// Best-effort: every course with a teacher gets a TeachingAssignment so the
// teacher has a surface to release lessons through (release-gating is universal
// — see TeachingAssignmentService.visibleLessonIdsForStudent). Never let this
// fail the course save; the backfill script can repair any miss.
async function ensureCourseAssignments(courseId, teachers, clgIds) {
    try {
        const clgId = Array.isArray(clgIds) ? clgIds[0] : null;
        await teachingSvc.ensureAssignmentsForCourse(courseId, teachers, clgId);
    } catch (e) {
        console.warn('[course] ensureAssignmentsForCourse failed:', e.message);
    }
}

// Queue a "you've been assigned to a new course" email for every student
// who sits at one of the course's colleges AND is a member of one of its
// batches. Best-effort: this runs after the course has already been
// persisted, so any failure here is logged but never propagates back to
// the admin (the course creation already succeeded).
//
// Pre-assessment status is read from the assessment DB so the template can
// switch between "complete the assessment" (registered) vs "register and
// complete the assessment" (not registered) without an extra round-trip
// per student.
async function enqueueCourseAssignedEmails({ course, clgIds, batchIds }) {
    try {
        if (!course || !Array.isArray(clgIds) || !Array.isArray(batchIds)) return;
        if (clgIds.length === 0 || batchIds.length === 0) return;

        // Students in the course's batches — the master list of recipients.
        // BatchMember.user_id is STRING (11-digit auth userIds overflow INT).
        const memberRows = await BatchMember.findAll({
            where: { batch_id: { [Op.in]: batchIds } },
            attributes: ['user_id'],
            raw: true,
        });
        const memberUserIds = Array.from(new Set(memberRows.map((r) => String(r.user_id)).filter(Boolean)));
        if (memberUserIds.length === 0) return;

        // Intersect with college scope + resolve name/email in one query.
        // collegeId IN clg_ids ensures a batch's member isn't reached if
        // they later moved colleges — the course is scoped to specific
        // (college, batch) tuples, not batch alone.
        const userRows = await authDb.query(
            `SELECT u.userId AS id, u.name, u.email
               FROM users u
               JOIN roles r ON r.roleId = u.roleId
              WHERE r.role = 'student'
                AND u.collegeId IN (:clgIds)
                AND u.userId IN (:userIds)`,
            {
                replacements: { clgIds, userIds: memberUserIds },
                type: QueryTypes.SELECT,
            }
        );
        if (userRows.length === 0) return;

        // Pre-assessment registration check — single grouped query so we
        // don't fire N lookups in the loop. Any row at all means "registered"
        // (status doesn't matter for the email's CTA branch).
        const recipientIds = userRows.map((r) => String(r.id));
        let registeredSet = new Set();
        try {
            const regRows = await assessmentDb.query(
                `SELECT DISTINCT userId
                   FROM pre_assessment_registrations
                  WHERE userId IN (:ids)`,
                { replacements: { ids: recipientIds }, type: QueryTypes.SELECT }
            );
            registeredSet = new Set(regRows.map((r) => String(r.userId)));
        } catch (e) {
            // assessmentDb unreachable → treat everyone as "not registered"
            // so they still get a nudge with the register-and-complete copy.
            console.warn('[course-emails] pre-assessment lookup failed:', e.message);
        }

        const jobs = userRows
            .filter((r) => r.email)
            .map((r) => {
                const { subject, html } = courseAssignedToStudent({
                    studentName: r.name,
                    courseTitle: course.title,
                    hasRegisteredForPreAssessment: registeredSet.has(String(r.id)),
                    loginUrl: env.mail.lmsLoginUrl,
                });
                return {
                    to: r.email,
                    subject,
                    html,
                    userId: String(r.id),
                };
            });

        if (jobs.length) {
            await enqueueMany(jobs);
        }
    } catch (err) {
        console.warn('[course-emails] enqueue failed:', err.message);
    }
}

const DEFAULT_DRIP = JSON.stringify({
    lesson_completion_role: 'percentage',
    minimum_duration: 15,
    minimum_percentage: '30',
    locked_lesson_message: '<h3 style="text-align:center"><strong>Permission denied!</strong></h3><p style="text-align:center">This course supports drip content, so you must complete the previous lessons.</p>',
});

const filterEmpty = (arr) =>
    Array.isArray(arr) ? arr.filter((v) => v !== null && v !== undefined && v !== '') : [];

// clgIds can arrive as `clgIds[]=a&clgIds[]=b` (multi-value multipart fields,
// parsed as an array), as a single string `clgIds=a`, or as already-coerced
// `clgIds[]` array. Mirrors CategoryService.normalizeClgIds so the storage
// shape is identical for both entities.
const normalizeClgIds = (raw) => {
    if (raw == null) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return Array.from(new Set(arr.map((v) => String(v).trim()).filter(Boolean)));
};

// Batch ids are integers in the DB; trim/dedupe/numerise and drop anything
// that isn't a positive integer. Mirrors normalizeClgIds in spirit.
const normalizeBatchIds = (raw) => {
    if (raw == null) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const seen = new Set();
    const out = [];
    for (const v of arr) {
        const n = Number(String(v).trim());
        if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
            seen.add(n);
            out.push(n);
        }
    }
    return out;
};

// Multipart form values arrive as strings. Treat '1'/'true'/'on' (case-insensitive)
// as true and '0'/'false'/'' as false. Booleans pass through. Used for the
// per-course has_certificate toggle and similar flags.
const toBool = (v, fallback = false) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(s)) return true;
    if (['0', 'false', 'off', 'no'].includes(s)) return false;
    return fallback;
};

// Parse a class-access value into an integer 1–12, or null when blank/invalid.
// Multipart sends '' for "no selection", which must persist as NULL (= the
// course is open to all classes) rather than 0.
const toClassNum = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 18 ? n : null;
};

// Build the Sequelize `where` fragment that scopes a query to an teacher's
// own courses (they own the row OR appear in teacher_ids). Returns null for
// admins / when no scoping applies. `teacher_ids` is a TEXT column (JSON
// array, CSV, or single value) — delimiter-aware LIKE matchers avoid a short
// id false-matching inside a longer one (123 inside 1234).
const buildTeacherScope = (user, extraCourseIds = []) => {
    if (user?.role !== 'teacher' || user.id == null) return null;
    const uid = String(user.id);
    const or = [
        { user_id: uid },
        { teacher_ids: { [Op.like]: `%"${uid}"%` } }, // JSON array element
        { teacher_ids: uid },                          // exact whole value
        { teacher_ids: { [Op.like]: `${uid},%` } },    // CSV: first
        { teacher_ids: { [Op.like]: `%,${uid},%` } },  // CSV: middle
        { teacher_ids: { [Op.like]: `%,${uid}` } },    // CSV: last
    ];
    // Courses delegated to this teacher via teaching_assignments (the new flow
    // doesn't write the legacy teacher_ids column, so include them explicitly).
    if (extraCourseIds.length) or.push({ id: { [Op.in]: extraCourseIds } });
    return { [Op.or]: or };
};

// Merge a base `where` with the teacher scope so a count reflects only the
// teacher's courses. For admins (scope null) the base `where` is returned
// as-is.
const scopedWhere = (base, scope) =>
    scope ? { ...base, [Op.and]: [...(base[Op.and] || []), scope] } : base;

// Parse a course's `teacher_ids` (TEXT — JSON array, CSV, or single value)
// into an array of id strings. Unlike zoom-live-class.courseTeacherIds this
// does NOT fold in user_id — we want the *assigned* teachers only.
const parseTeacherIds = (raw) => {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
    const s = String(raw).trim();
    try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
        if (parsed) return [String(parsed)];
    } catch {
        if (s.includes(',')) return s.split(',').map((v) => v.trim()).filter(Boolean);
        return [s];
    }
    return [];
};

// Batch-resolve teacher profiles from the auth-service DB (lucy_devdb.users)
// — teachers are auth-service users, not lms_admin.users. Returns a map
// keyed by userId string. Best-effort: a DB failure yields an empty map so the
// course list still renders.
const fetchTeachersByIds = async (ids) => {
    const unique = [...new Set(ids.map((v) => String(v)).filter(Boolean))];
    if (!unique.length) return {};
    try {
        // lucy_devdb uses camelCase columns — MUST be double-quoted on Postgres
        // (unquoted identifiers fold to lowercase: u.userId → u.userid, which
        // doesn't exist, so the lookup silently returned no teachers).
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email, u."teacherPhoto" AS photo
               FROM users u
              WHERE u."userId" IN (:ids)`,
            { replacements: { ids: unique }, type: QueryTypes.SELECT }
        );
        const byId = {};
        for (const r of rows) byId[String(r.id)] = r;
        return byId;
    } catch (err) {
        console.warn('[courses] teacher lookup failed:', err.message);
        return {};
    }
};

const emptyResponse = (query = {}) => ({
    status: query.status || 'all',
    teacher: query.teacher || 'all',
    price: query.price || 'all',
    college: query.college || 'all',
    courses: { data: [], total: 0, per_page: 20, current_page: Number(query.page) || 1, last_page: 1 },
    pending_courses: 0,
    active_courses: 0,
    upcoming_courses: 0,
    paid_courses: 0,
    free_courses: 0,
});

const list = async (query, user = null) => {
    try {
        return await dbList(query, user);
    } catch (err) {
        console.warn('[courses] DB query failed:', err.message);
        return emptyResponse(query);
    }
};

const dbList = async (query, user = null) => {
    const { college, search, price, teacher, status, page = 1 } = query;
    const where = {};
    const parent = {};

    // Course grouping is now college-driven (courses.clg_ids JSON column),
    // not category-driven. `college` here is a clgId string sent by the
    // Manage Courses filter; an absent value means "show all colleges".
    if (college && college !== 'all') {
        // Postgres JSONB contains (@>) — RHS is a JSON array.
        const escapedClgId = Course.sequelize.escape(JSON.stringify([String(college)]));
        where[Op.and] = [
            ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
            Course.sequelize.literal(`"Course"."clg_ids" @> ${escapedClgId}::jsonb`),
        ];
        parent.college = college;
    }
    if (search) where.title = { [Op.iLike]: `%${search}%` };
    if (price && price !== 'all') where.is_paid = price === 'paid' ? true : price === 'free' ? false : null;
    if (teacher && teacher !== 'all') where.user_id = teacher;
    if (status && status !== 'all') where.status = status;

    // Teachers only see their own courses — either they own the course
    // (user_id matches) or they're listed in teacher_ids. Admins see all.
    // `teacherScope` is reused below so the stat-card counts (active,
    // pending, upcoming, …) reflect the SAME scoped set as the course list,
    // not global totals.
    // Pull the teacher's delegated course ids so Manage Courses also lists
    // courses an admin assigned via teaching_assignments (not just legacy ones).
    let delegatedCourseIds = [];
    if (user?.role === 'teacher' && user.id != null) {
        try {
            const { TeachingAssignment } = require('../models');
            const rows = await TeachingAssignment.findAll({
                where: { teacher_id: String(user.id) },
                attributes: ['course_id'],
                raw: true,
            });
            delegatedCourseIds = [...new Set(rows.map((r) => Number(r.course_id)).filter(Boolean))];
        } catch (e) {
            console.warn('[courses] delegated-course lookup failed:', e.message);
        }
    }
    const teacherScope = buildTeacherScope(user, delegatedCourseIds);
    if (teacherScope) {
        where[Op.and] = [
            ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
            teacherScope,
        ];
    }

    const limit = 20;
    const offset = (Number(page) - 1) * limit;
    const { count, rows } = await courseRepo.paginate({
        where,
        order: [['id', 'DESC']],
        limit,
        offset,
        // Category include removed — courses are no longer grouped by category.
        // The clg_ids JSON column on the courses table drives grouping; the
        // admin UI resolves clgId → clgName client-side via useCollege().
        include: [
            { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'photo'] },
        ],
    });

    const courseIds = rows.map((r) => r.id);
    // Enrollment lives in user_progress.enrolled — same source the dashboard
    // uses (see DashboardService.stats), so the per-course count here stays
    // consistent with the global enrollment_count stat.
    const [lessonCounts, sectionCounts, enrollmentCounts] = await Promise.all([
        courseIds.length ? Lesson.findAll({
            where: { course_id: { [Op.in]: courseIds } },
            attributes: ['course_id', [Lesson.sequelize.fn('COUNT', Lesson.sequelize.col('id')), 'count']],
            group: ['course_id'],
            raw: true,
        }) : [],
        courseIds.length ? Section.findAll({
            where: { course_id: { [Op.in]: courseIds } },
            attributes: ['course_id', [Section.sequelize.fn('COUNT', Section.sequelize.col('id')), 'count']],
            group: ['course_id'],
            raw: true,
        }) : [],
        courseIds.length ? UserProgress.findAll({
            where: { course_id: { [Op.in]: courseIds }, enrolled: true },
            attributes: ['course_id', [UserProgress.sequelize.fn('COUNT', UserProgress.sequelize.col('id')), 'count']],
            group: ['course_id'],
            raw: true,
        }).catch((err) => { console.warn('[courses] enrollment count failed:', err.message); return []; }) : [],
    ]);

    const lessonCountByCourse = Object.fromEntries(lessonCounts.map((r) => [r.course_id, Number(r.count) || 0]));
    const sectionCountByCourse = Object.fromEntries(sectionCounts.map((r) => [r.course_id, Number(r.count) || 0]));
    const enrollmentCountByCourse = Object.fromEntries(enrollmentCounts.map((r) => [r.course_id, Number(r.count) || 0]));

    // Resolve the *assigned* teacher for each course from `teacher_ids`
    // (auth-service users). `creator` (the FK-bound user_id) is the admin who
    // owns the row, not the teaching teacher — so the list must show the
    // teacher_ids person. One batched auth-DB lookup for all rows.
    const allTeacherIds = rows.flatMap((r) => parseTeacherIds(r.teacher_ids));
    const teachersById = await fetchTeachersByIds(allTeacherIds);

    const enrichedRows = rows.map((row) => {
        const json = row.toJSON();
        const assignedIds = parseTeacherIds(json.teacher_ids);
        // First resolvable assigned teacher drives the list's Teacher
        // cell. Fall back to `creator` only when no teacher is assigned.
        const assigned = assignedIds
            .map((id) => teachersById[String(id)])
            .find(Boolean);
        return {
            ...json,
            teacher: assigned
                ? { id: assigned.id, name: assigned.name, email: assigned.email, photo: assigned.photo }
                : json.creator || null, // frontend reads c.teacher.name / .email
            // category intentionally null — courses are no longer grouped by
            // category. Kept on the payload as null so legacy frontend code
            // (e.g. `c.category?.title`) doesn't throw.
            category: null,
            lesson_count: lessonCountByCourse[json.id] || 0,
            section_count: sectionCountByCourse[json.id] || 0,
            enrolled: enrollmentCountByCourse[json.id] || 0,
        };
    });

    // Stat-card counts. For an teacher these are scoped to their own
    // courses (same teacherScope as the list) so the cards match the list
    // below them. For admins the counts are global.
    const [pending_courses, active_courses, upcoming_courses, paid_courses, free_courses] = await Promise.all([
        courseRepo.count(scopedWhere({ status: 'pending' }, teacherScope)),
        courseRepo.count(scopedWhere({ status: 'active' }, teacherScope)),
        courseRepo.count(scopedWhere({ status: 'upcoming' }, teacherScope)),
        courseRepo.count(scopedWhere({ is_paid: true }, teacherScope)),
        courseRepo.count(scopedWhere({ is_paid: false }, teacherScope)),
    ]);

    return {
        ...parent,
        status: status || 'all',
        teacher: teacher || 'all',
        price: price || 'all',
        college: college || 'all',
        courses: { data: enrichedRows, total: count, per_page: limit, current_page: Number(page), last_page: Math.ceil(count / limit) },
        pending_courses, active_courses, upcoming_courses, paid_courses, free_courses,
    };
};

const createMeta = async () => {
    // Categories used to seed the course Create form. Courses are now mapped
    // to colleges directly (clg_ids), so no category lookup is needed. We
    // still return `categories: []` so legacy callers don't crash on access.
    return { categories: [] };
};

const create = async ({ body, files = {}, userId }) => {
    const b = body;
    const finalUserId = userId || b.user_id || 1;

    const data = {
        title: b.title,
        slug: slugify(b.title),
        user_id: finalUserId,
        // category_id intentionally not written — courses are grouped by
        // college (clg_ids) now. The DB column still exists (nullable) for
        // legacy rows, but new courses don't populate it.
        course_type: b.course_type || 'general',
        status: b.status,
        level: b.level,
        language: String(b.language || '').toLowerCase(),
        // Class-access range (Class 1–12). NULL = open to all classes.
        class_from: toClassNum(b.class_from),
        class_to: toClassNum(b.class_to),
        // Admin-set Score denominator + Lectures label for course-details.
        score_max: b.score_max === '' || b.score_max == null ? null : Number(b.score_max),
        lectures_label: b.lectures_label ? String(b.lectures_label).trim() : null,
        // Free public sample/teaser course toggle.
        is_marketing: toBool(b.is_marketing, false),
        is_paid: b.is_paid,
        price: b.price || 0,
        discount_flag: b.discount_flag || 0,
        discounted_price: b.discounted_price || 0,
        enable_drip_content: b.enable_drip_content || 0,
        drip_content_settings: DEFAULT_DRIP,
        short_description: b.short_description,
        description: b.description,
        meta_description: b.meta_description,
        // Multipart strings come in as 'true'/'false' or '1'/'0'; coerce to
        // boolean so the column doesn't end up storing the truthy string '0'.
        has_certificate: toBool(b.has_certificate, true),
        // Colleges the course is offered at. Stored as JSON (Course.clg_ids
        // is DataTypes.JSON). Same shape Category uses, so cross-entity
        // college filtering stays consistent.
        clg_ids: normalizeClgIds(b.clgIds ?? b['clgIds[]']),
        // Batches the course is offered to. Subset of the selected colleges —
        // app-layer validation (controller) trims to batches whose clg_id is
        // present in clg_ids. Stored as JSON of numeric batch ids.
        batch_ids: normalizeBatchIds(b.batchIds ?? b['batchIds[]']),
    };

    const metaKeywords = Array.isArray(b.meta_keywords)
        ? b.meta_keywords.map((k) => (typeof k === 'object' ? k.value : k)).join(',')
        : (b.meta_keywords || '');
    data.meta_keywords = metaKeywords;

    data.expiry_period =
        b.expiry_period === 'limited_time' && Number(b.number_of_month) > 0
            ? Number(b.number_of_month)
            : null;

    if (b.requirements) data.requirements = JSON.stringify(filterEmpty(b.requirements));
    if (b.outcomes) data.outcomes = JSON.stringify(filterEmpty(b.outcomes));

    if (b.faq_title) {
        const titles = Array.isArray(b.faq_title) ? b.faq_title : [b.faq_title];
        const descs = Array.isArray(b.faq_description) ? b.faq_description : [b.faq_description];
        data.faqs = JSON.stringify(
            titles.map((t, i) => ({ title: t, description: descs[i] })).filter((f) => f.title)
        );
    }

    data.teacher_ids = JSON.stringify(b.teachers || [finalUserId]);

    // Create the row first so we know course.id, then upload every media
    // asset under courses/<id>/... — this groups all of one course's files
    // (thumbnail/banner/preview here; lesson attachments + Bunny collection
    // in CurriculumService) into one R2 folder, matching the per-course
    // layout used by Udemy/Teachable/Thinkific.
    const course = await courseRepo.create(data);
    await course.update({ slug: slugify(`${b.title}-${course.id}`) });

    // Give the assigned teacher(s) a release surface for this new course.
    await ensureCourseAssignments(course.id, b.teachers || [finalUserId], data.clg_ids);

    const mediaPatch = {};
    if (files.thumbnail?.[0]) {
        const f = files.thumbnail[0];
        const dest = `uploads/courses/${course.id}/thumbnail/${niceFileName(b.title, f.originalname.split('.').pop())}`;
        mediaPatch.thumbnail = await upload(f, dest, 400, 400);
    }
    if (files.banner?.[0]) {
        const f = files.banner[0];
        const dest = `uploads/courses/${course.id}/banner/${niceFileName(b.title, f.originalname.split('.').pop())}`;
        mediaPatch.banner = await upload(f, dest, 1400, 1400);
    }
    if (files.preview?.[0]) {
        const f = files.preview[0];
        const dest = `uploads/courses/${course.id}/preview/${niceFileName(b.title, f.originalname.split('.').pop())}`;
        mediaPatch.preview = await upload(f, dest);
    }
    if (Object.keys(mediaPatch).length) await course.update(mediaPatch);

    // Fire-and-forget notification to every student in the course's
    // (college, batch) intersection. NOT awaited — the admin already saw
    // the course created, SMTP latency must not block the response. The
    // queue worker handles delivery + retries; this just enqueues.
    enqueueCourseAssignedEmails({
        course,
        clgIds: data.clg_ids || [],
        batchIds: data.batch_ids || [],
    });

    return { success: 'Course added successfully', course_id: course.id };
};

// Predicate: teacher is allowed to act on this course only if they own it
// (course.user_id) or they're listed in course.teacher_ids. Mirrors the
// LIKE-match the list endpoint uses; tighter parsing happens for
// zoom-live-class via that module's courseTeacherIds().
const teacherCanTouch = (course, user) => {
    if (!course || !user) return false;
    const uid = String(user.id);
    if (String(course.user_id || '') === uid) return true;
    const raw = course.teacher_ids;
    if (!raw) return false;
    return String(raw).includes(uid);
};

const edit = async (id, user = null) => {
    const course_details = await courseRepo.findById(id);
    if (!course_details) throw new HttpError(404, 'Not found');
    if (user?.role === 'teacher' && !teacherCanTouch(course_details, user)) {
        throw new HttpError(403, 'Forbidden');
    }
    const sections = await sectionRepo.findByCourse(id);
    return { course_details, sections };
};

const update = async ({ id, body, files = {} }) => {
    const course = await courseRepo.findById(id);
    if (!course) throw new HttpError(404, 'Data not found.');

    const b = body;
    if (!b.tab) throw new HttpError(400, 'Data not found.');

    const data = {};

    if (b.tab === 'basic') {
        data.title = b.title;
        data.slug = slugify(`${b.title}-${id}`);
        data.short_description = b.short_description;
        data.description = b.description;
        // category_id intentionally not written on update either (see note in
        // `create`). College grouping comes from clg_ids below.
        data.level = b.level;
        // Course category/track (general | engineering | freshers).
        if (b.course_type !== undefined) data.course_type = b.course_type || 'general';
        data.language = String(b.language || '').toLowerCase();
        // Class-access range — only touch when the Basic-tab form sent the
        // fields, so other partial saves don't wipe an existing range.
        if (b.class_from !== undefined) data.class_from = toClassNum(b.class_from);
        if (b.class_to !== undefined) data.class_to = toClassNum(b.class_to);
        // Admin-set Score denominator + Lectures label — only touch when the
        // Basic-tab form sent them so partial saves don't wipe the values.
        if (b.score_max !== undefined) data.score_max = b.score_max === '' || b.score_max === null ? null : Number(b.score_max);
        if (b.lectures_label !== undefined) data.lectures_label = b.lectures_label ? String(b.lectures_label).trim() : null;
        if (b.is_marketing !== undefined) data.is_marketing = toBool(b.is_marketing, false);
        data.status = b.status;
        // Only overwrite the teacher assignment when the form actually
        // sent one. Previously, partial Basic-tab saves submitted an empty
        // `b.teachers`, which JSON-stringified to `'[]'` and wiped the
        // real teacher — the page then fell back to the admin-creator,
        // making it look like the teacher was hardcoded.
        const incoming = Array.isArray(b.teachers)
            ? b.teachers.filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
            : (b.teachers && String(b.teachers).trim() !== '' ? [b.teachers] : []);
        if (incoming.length) {
            data.teacher_ids = JSON.stringify(incoming.map(String));
        }
        // Only overwrite clg_ids if the edit form actually sent it — otherwise
        // a partial Basic-tab save would silently wipe the college mapping.
        // Mirrors the guard CategoryService.update uses.
        if (b.clgIds !== undefined || b['clgIds[]'] !== undefined) {
            data.clg_ids = normalizeClgIds(b.clgIds ?? b['clgIds[]']);
        }
        // Same partial-save guard as clg_ids — only touch batch_ids when the
        // form sent it explicitly.
        if (b.batchIds !== undefined || b['batchIds[]'] !== undefined) {
            data.batch_ids = normalizeBatchIds(b.batchIds ?? b['batchIds[]']);
        }
        // Only update if the form sent the field — keeps the column intact
        // when other admin flows submit a partial basic-tab payload.
        if (b.has_certificate !== undefined) {
            data.has_certificate = toBool(b.has_certificate, true);
        }
    } else if (b.tab === 'pricing') {
        data.is_paid = b.is_paid;
        data.price = b.price || 0;
        data.discount_flag = b.discount_flag || 0;
        data.discounted_price = b.discounted_price || 0;
        data.expiry_period =
            b.expiry_period === 'limited_time' && Number(b.number_of_month) > 0
                ? Number(b.number_of_month)
                : null;
    } else if (b.tab === 'info') {
        data.requirements = JSON.stringify(filterEmpty(b.requirements));
        data.outcomes = JSON.stringify(filterEmpty(b.outcomes));
        const titles = Array.isArray(b.faq_title) ? b.faq_title : b.faq_title ? [b.faq_title] : [];
        const descs = Array.isArray(b.faq_description)
            ? b.faq_description
            : b.faq_description
                ? [b.faq_description]
                : [];
        data.faqs = JSON.stringify(
            titles.map((t, i) => ({ title: t, description: descs[i] })).filter((f) => f.title)
        );
    } else if (b.tab === 'media') {
        if (files.thumbnail?.[0]) {
            const f = files.thumbnail[0];
            const dest = `uploads/courses/${id}/thumbnail/${niceFileName(b.title || course.title, f.originalname.split('.').pop())}`;
            data.thumbnail = await upload(f, dest, 400, 400);
            removeFile(course.thumbnail);
        }
        if (files.banner?.[0]) {
            const f = files.banner[0];
            const dest = `uploads/courses/${id}/banner/${niceFileName(b.title || course.title, f.originalname.split('.').pop())}`;
            data.banner = await upload(f, dest, 1400, 1400);
            removeFile(course.banner);
        }
        if (b.preview_video_provider === 'link') {
            data.preview = b.preview_link;
        } else if (b.preview_video_provider === 'file' && files.preview?.[0]) {
            const f = files.preview[0];
            const dest = `uploads/courses/${id}/preview/${niceFileName(b.title || course.title, f.originalname.split('.').pop())}`;
            data.preview = await upload(f, dest);
            removeFile(course.preview);
        }
    } else if (b.tab === 'seo') {
        const seo = await seoRepo.findOne({ name_route: 'course.details', course_id: id });
        const metaKeywords = Array.isArray(b.meta_keywords)
            ? b.meta_keywords.map((k) => (typeof k === 'object' ? k.value : k)).join(', ')
            : (b.meta_keywords || '');

        const seoData = {
            course_id: id,
            route: 'Course Details',
            name_route: 'course.details',
            meta_title: b.meta_title,
            meta_description: b.meta_description,
            meta_robot: b.meta_robot,
            canonical_url: b.canonical_url,
            custom_url: b.custom_url,
            json_ld: b.json_ld,
            og_title: b.og_title,
            og_description: b.og_description,
            meta_keywords: metaKeywords,
        };

        if (files.og_image?.[0]) {
            const f = files.og_image[0];
            const dest = `uploads/courses/${id}/seo/${niceFileName('og', f.originalname.split('.').pop())}`;
            seoData.og_image = await upload(f, dest, 600);
            if (seo) removeFile(seo.og_image);
        }
        if (seo) await seo.update(seoData);
        else await seoRepo.create(seoData);
    } else if (b.tab === 'drip-content') {
        data.enable_drip_content = b.enable_drip_content;
        const [h, m, s] = String(b.minimum_duration || '00:00:00').split(':').map(Number);
        data.drip_content_settings = JSON.stringify({
            lesson_completion_role: b.lesson_completion_role,
            minimum_duration: h * 3600 + m * 60 + s,
            minimum_percentage: b.minimum_percentage,
            locked_lesson_message: b.locked_lesson_message,
        });
    }

    if (Object.keys(data).length) await course.update(data);

    // When the Basic tab changed the teacher assignment, make sure the new
    // teacher(s) have a release surface for this course (idempotent).
    if (data.teacher_ids !== undefined) {
        await ensureCourseAssignments(
            id,
            data.teacher_ids,
            data.clg_ids !== undefined ? data.clg_ids : course.clg_ids,
        );
    }
    return { success: 'Course updated successfully' };
};

const status = async (type, id) => {
    const allowed = ['active', 'pending', 'inactive', 'upcoming', 'private'];
    const next = allowed.includes(type) ? type : 'draft';
    await courseRepo.updateById(id, { status: next });
    return { success: 'Course status changed successfully' };
};

const remove = async (id) => {
    const course = await courseRepo.findById(id);
    if (!course) throw new HttpError(404, 'Course not found');

    // Order matters: sections.course_id and lessons.section_id both have FKs
    // back to courses/sections. We delete children first so the parent
    // destroy doesn't trip ER_ROW_IS_REFERENCED_2.
    const lessons = await Lesson.findAll({ where: { course_id: id } });
    for (const lesson of lessons) {
        removeFile(lesson.lesson_src);
        removeFile(lesson.attachment);
        if (lesson.lesson_type === 'quiz') {
            await questionRepo.destroyByQuiz(lesson.id);
            await submissionRepo.destroyByQuiz(lesson.id);
        }
        await lesson.destroy();
    }

    // Sections must be removed before the course row itself.
    await Section.destroy({ where: { course_id: id } });

    removeFile(course.thumbnail);
    removeFile(course.banner);
    removeFile(course.preview);
    await course.destroy();
    return { success: 'Course deleted successfully' };
};

const draft = async (id) => {
    const course = await courseRepo.findById(id);
    if (!course) return { error: 'Data not found.' };
    const next = course.status === 'active' ? 'deactivate' : 'active';
    await course.update({ status: next });
    return { success: 'Status has been updated.' };
};

const duplicate = async ({ id, userId, role }) => {
    const where = { id };
    if (role && role !== 'admin') where.user_id = userId;

    const course = await courseRepo.findOne(where);
    if (!course) throw new HttpError(404, 'Data not found.');

    const data = course.toJSON();
    if (role === 'admin') data.user_id = userId;
    delete data.id;
    delete data.created_at;
    delete data.updated_at;

    const created = await courseRepo.create(data);
    await created.update({ slug: `${slugify(data.title)}-${created.id}` });
    return { success: 'Course duplicated.', course_id: created.id };
};

const approval = async ({ id, subject, message }) => {
    await courseRepo.updateById(id, { status: 'active' });
    const course = await courseRepo.findByIdWithCreator(id);
    try {
        if (course?.creator?.email) {
            await mailer.send({ to: course.creator.email, subject, html: message });
        }
    } catch (_e) {
        // swallow mail errors — approval still succeeds
    }
    return { success: 'Course activated successfully' };
};

module.exports = { list, createMeta, create, edit, update, status, remove, draft, duplicate, approval };
