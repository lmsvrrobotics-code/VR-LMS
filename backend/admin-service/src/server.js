require('./observability'); // Sentry.init() — keep first
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const cache = require('./config/cache');
const { attachErrorHandler } = require('./observability');
const { sequelize } = require('./models');
const { adminOnly, auth, adminOrTeacher, optionalAuth } = require('./middlewares/auth');
const { errorHandler } = require('./middlewares/error');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const categoryRoutes = require('./routes/category.routes');
const courseRoutes = require('./routes/course.routes');
const curriculumRoutes = require('./routes/curriculum.routes');
const quizRoutes = require('./routes/quiz.routes');
const liveClassRoutes = require('./routes/liveclass.routes');
const zoomLiveClassRoutes = require('./zoom-live-class/live-class.routes');
const forumRoutes = require('./forum/forum.routes');
const couponRoutes = require('./routes/coupon.routes');
const galleryRoutes = require('./routes/gallery.routes');
const demoVideoRoutes = require('./routes/demoVideo.routes');
const locationRoutes = require('./routes/location.routes');
const bookRoutes = require('./routes/book.routes');
const kitRoutes = require('./routes/kit.routes');
const bookKitOrderRoutes = require('./routes/bookKitOrders.routes');
const adminBookOrderRoutes = require('./routes/adminBookOrders.routes');
const adminKitOrderRoutes = require('./routes/adminKitOrders.routes');
const slotRoutes = require('./routes/slot.routes');
const demoRoutes = require('./routes/demo.routes');
const classRoutes = require('./routes/class.routes');
const projectRoutes = require('./routes/project.routes');
const testimonialRoutes = require('./routes/testimonial.routes');
const resourceRoutes = require('./routes/resource.routes');
const certificateRoutes = require('./routes/certificate.routes');
const collegeDashboardRoutes = require('./routes/collegeDashboard.routes');
const batchRoutes = require('./routes/batch.routes');
const batchNewRoutes = require('./routes/batchNew.routes');
const collegeRoutes = require('./routes/college.routes');
const studentRoutes = require('./routes/student.routes');
const teacherRoutes = require('./routes/teacher.routes');
const leadRoutes = require('./routes/lead.routes');
const preAssessmentRoutes = require('./routes/preassessment.routes');
const languageRoutes = require('./routes/language.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const notificationRoutes = require('./routes/notification.routes');
const profileRoutes = require('./routes/profile.routes');
const studentDataRoutes = require('./routes/student-routes');

const app = express();

// Behind Railway/any single proxy → trust 1 hop so rate-limit sees the real IP.
app.set('trust proxy', 1);

// CORS allowlist. This is the public service exposing admin + payment APIs and
// it accepts cookie auth (credentials:true), so `cors()` (reflect-any-origin)
// is unsafe — reflecting an arbitrary origin WITH credentials is a CSRF /
// credential-theft hole. Set ADMIN_ALLOWED_ORIGINS (or CORS_ORIGINS) to a
// comma-separated list of frontend origins. localhost is always allowed for
// dev. FAIL CLOSED: if unset in prod, only localhost is allowed (cross-origin
// browser calls are blocked) — this forces the deployer to set the origin
// rather than silently shipping a wide-open credentialed API.
const adminCorsAllow = (process.env.ADMIN_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
if (!adminCorsAllow.length && env.env === 'production') {
    console.warn('\n⚠️  [SECURITY] ADMIN_ALLOWED_ORIGINS/CORS_ORIGINS is unset in production. '
        + 'Only localhost is allowed — set ADMIN_ALLOWED_ORIGINS=https://<frontend> or browser calls will be CORS-blocked.\n');
}
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin / curl / mobile apps
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
        if (adminCorsAllow.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

// Rate limiting on public endpoints — prevents lead-form spam, enumeration of
// by-teacher/leaderboard data, and brute force. Generous for normal use.
const rateLimit = require('express-rate-limit');
// Shared rate-limit store across replicas. With the default in-memory store each
// instance counts independently, so the real limit = configured × replica count.
// When Redis (Upstash) is available we back the counters with it so the limit is
// correct regardless of how many admin-service instances run. GRACEFUL: if Redis
// is unset/down, makeStore() returns undefined and express-rate-limit falls back
// to its in-memory store — rate limiting still works, just per-instance.
// Dedicated Redis connection for the rate-limit store. NOT the shared cache
// client: that one runs enableOfflineQueue:false (fail-fast for caching), which
// makes rate-limit-redis throw at construction when it loads its Lua script
// before Redis is ready. Here we enable the offline queue so that init command
// waits for the connection instead of erroring. Lazily built once; returns
// undefined (→ in-memory fallback) when REDIS_URL is unset or ioredis fails.
let rlRedis;
let rlRedisInit = false;
const getRlRedis = () => {
    if (rlRedisInit) return rlRedis;
    rlRedisInit = true;
    const url = process.env.REDIS_URL || '';
    if (!url) return (rlRedis = null);
    try {
        const Redis = require('ioredis');
        rlRedis = new Redis(url, {
            maxRetriesPerRequest: 2,
            enableOfflineQueue: true,
            connectTimeout: 5000,
            tls: url.startsWith('rediss://') ? {} : undefined,
        });
        rlRedis.on('error', (e) => console.warn('[rate-limit] Redis error (limits fall back to in-memory):', e.message));
    } catch (e) {
        console.warn('[rate-limit] Redis init failed, using in-memory:', e.message);
        rlRedis = null;
    }
    return rlRedis;
};
const makeStore = (prefix) => {
    try {
        const redisClient = getRlRedis();
        if (!redisClient) return undefined;
        const { RedisStore } = require('rate-limit-redis');
        return new RedisStore({ prefix, sendCommand: (...args) => redisClient.call(...args) });
    } catch (e) {
        console.warn('[rate-limit] Redis store unavailable, using in-memory:', e.message);
        return undefined;
    }
};
// passOnStoreError: if the Redis store errors (Redis down/slow), ALLOW the
// request instead of 500ing — same fail-open philosophy as the cache. Rate
// limiting must never take down the public API.
const rlOpts = { windowMs: 60 * 1000, standardHeaders: true, legacyHeaders: false, passOnStoreError: true };
const publicLimiter = rateLimit({ ...rlOpts, max: 300, store: makeStore('rl:pub:'), message: { error: 'Too many requests — please slow down.' } });
const writeLimiter = rateLimit({ ...rlOpts, max: 20, store: makeStore('rl:write:'), message: { error: 'Too many submissions — try again shortly.' } });
app.use('/api/public', publicLimiter);
// Capture the raw request body so the Razorpay webhook can verify its HMAC
// signature (signature is computed over the exact bytes, not the parsed JSON).
app.use(express.json({
    limit: '50mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Asset serving moved off-box:
//   - Images / PDFs / docs → Cloudflare R2 (served via R2_PUBLIC_URL)
//   - Videos               → Bunny Stream CDN (BUNNY_STREAM_CDN_HOSTNAME)
// The legacy /uploads mount remains as a soft proxy ONLY while there are
// pre-migration rows in DB that still reference on-disk paths. Once cutover
// is complete you can delete the env.uploadDir directory + this mount.
if (env.uploadDir && fs.existsSync(path.join(__dirname, '..', env.uploadDir))) {
    app.use('/uploads', express.static(path.join(__dirname, '..', env.uploadDir)));
}

// Relative "uploads/..." asset paths (user/teacher/student photos, category
// thumbnails/logos, and legacy pre-migration rows) now live in Cloudflare R2.
// Anything the static mount above didn't serve from local disk is redirected to
// its R2 public URL. Course media, lesson attachments, and certificate images
// persist absolute R2 URLs and never reach this handler.
const { publicUrlFor: r2PublicUrlFor } = require('./services/R2Storage');
app.get('/uploads/*', (req, res) => {
    const target = r2PublicUrlFor(req.params[0]);
    if (!target) return res.status(404).end();
    return res.redirect(302, target);
});

app.get(['/api/health', '/health'], (_req, res) => res.json({ ok: true, service: 'admin-service' }));

// Deep health for uptime monitors (UptimeRobot / Railway healthcheck / Grafana):
// pings Postgres and reports Redis state so degradation is visible BEFORE
// students feel it. Kept separate from /health (above) which must stay
// instant for load-balancer probes. 503 when the DB is unreachable.
app.get('/health/deep', async (_req, res) => {
    const out = {
        service: 'admin-service',
        uptime_s: Math.round(process.uptime()),
        db: 'unknown',
        cache: cache.isEnabled() ? 'enabled' : 'disabled',
    };
    try {
        await Promise.race([
            sequelize.query('SELECT 1'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('db ping timeout')), 3000)),
        ]);
        out.db = 'ok';
        return res.json({ ok: true, ...out });
    } catch (e) {
        out.db = `down: ${e.message}`;
        return res.status(503).json({ ok: false, ...out });
    }
});

// Service-to-service email enqueue. Used today by assessment-service to
// queue a "you've registered for pre-assessment" mail without having to own
// a second DB connection into lms_admin.email_jobs. Guarded by a shared
// secret in the X-Internal-Secret header — leave INTERNAL_API_SECRET unset
// to disable the endpoint entirely.
//
// Body shape:
//   {
//     template: 'preAssessmentRegistered',  // template name in emailTemplates.js
//     data: { studentName, programName, ... },  // template-specific
//     to: '<recipient email>',
//     userId: '<optional auth userId, stored for audit>',
//     batchId: <optional batch id, stored for audit>
//   }
const emailTemplates = require('./helpers/emailTemplates');
const { enqueue: enqueueEmail } = require('./jobs/emailQueue');
app.post('/api/internal/email/enqueue', express.json({ limit: '1mb' }), async (req, res) => {
    const expected = env.internalSecret;
    if (!expected) return res.status(503).json({ error: 'Internal endpoints disabled' });
    const provided = String(req.headers['x-internal-secret'] || '');
    // Constant-time compare — a plain !== leaks how many leading characters
    // matched through response timing, letting the secret be recovered
    // byte-by-byte. Hash both sides first so lengths always match.
    const crypto = require('crypto');
    const a = crypto.createHash('sha256').update(provided).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    if (!provided || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'Unauthorised' });
    }
    try {
        const { template, data, to, userId, batchId } = req.body || {};
        const builder = template && emailTemplates[template];
        if (typeof builder !== 'function') {
            return res.status(422).json({ error: `Unknown template: ${template}` });
        }
        if (!to || typeof to !== 'string') {
            return res.status(422).json({ error: 'Recipient `to` is required' });
        }
        // Inject defaults the caller doesn't need to know about. Today this
        // is just loginUrl — pulling it from env.mail keeps the link
        // consistent across templates and across services.
        const enriched = {
            loginUrl: env.mail.lmsLoginUrl,
            ...(data || {}),
        };
        const { subject, html } = builder(enriched);
        await enqueueEmail({ to, subject, html, userId, batchId });
        return res.status(202).json({ queued: true });
    } catch (e) {
        console.warn('[internal/email/enqueue] failed:', e.message);
        return res.status(500).json({ error: 'Enqueue failed' });
    }
});

// --- Public read caching ------------------------------------------------------
// The anonymous home/dashboard lists (gallery, books, locations, projects,
// testimonials, demo-videos, colleges, catalog) are identical for every visitor
// and were hitting Postgres on every request. At 5k users that's the bulk of
// read traffic, so they're served through a short shared Redis cache (no-op
// without REDIS_URL). Browser caching stays disabled (no-store) — freshness is
// controlled server-side: any successful admin WRITE flushes the whole pub:*
// keyspace below, so admins still see their edits immediately while students
// read from cache.
const PUB_TTL = 30; // seconds
const flushPublicCache = (req, res, next) => {
    if (req.method !== 'GET') {
        res.on('finish', () => {
            if (res.statusCode < 400) cache.del('pub:*').catch?.(() => {});
        });
    }
    next();
};
app.use('/api/admin', flushPublicCache);

// Public read-only endpoints — no auth required
const categoryService = require('./services/CategoryService');
app.get('/api/public/categories', async (req, res, next) => {
    try {
        // Student-facing calls pass ?clgId=<their-college>. The presence of
        // the param (even empty) switches the service into college-gated
        // mode. Admin/internal callers that omit it still get the full tree.
        const clgId = 'clgId' in req.query ? String(req.query.clgId ?? '') : undefined;
        res.json(await categoryService.list(clgId));
    } catch (e) { next(e); }
});

// Public gallery list — drives the Home → Gallery page. Only visible items.
// Admins manage these under Gallery → Add/Manage Gallery; new items appear here.
const galleryService = require('./services/GalleryService');
app.get('/api/public/gallery', async (_req, res, next) => {
    try {
        // Dynamic admin content — never let the browser serve a stale cached
        // copy. Without this Express adds an ETag and the browser revalidates
        // with a conditional GET, getting 304 Not Modified and re-rendering an
        // older (e.g. empty) body, so newly added items wouldn't appear.
        res.set('Cache-Control', 'no-store');
        res.json(await cache.wrap('pub:gallery', PUB_TTL, () => galleryService.listPublic()));
    } catch (e) { next(e); }
});

// Public demo/marketing videos — drives the "Explore VR Robotics" section on
// the student dashboard (CEO intro + sample teasers). Only visible items.
const demoVideoService = require('./services/DemoVideoService');
app.get('/api/public/demo-videos', async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await cache.wrap('pub:demo-videos', PUB_TTL, () => demoVideoService.listPublic()));
    } catch (e) { next(e); }
});

// Public locations list — drives the public Locations page learning-center
// cards. Only visible items. Admins manage these under Locations → Add/Manage.
const locationService = require('./services/LocationService');
app.get('/api/public/locations', async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await cache.wrap('pub:locations', PUB_TTL, () => locationService.listPublic()));
    } catch (e) { next(e); }
});

// Guard for /api/public/*/by-teacher/:teacherId — these expose a teacher's
// roster / student records / schedule, so they must NOT be open (was an IDOR:
// anyone could pass any teacherId). A verified TEACHER may read only their own
// (userId === :teacherId); admins/root may read any. Requires a token.
const requireTeacherSelfOrAdmin = [optionalAuth, (req, res, next) => {
    const a = req.authUser;
    if (!a) return res.status(401).json({ error: 'Please sign in.' });
    if (a.role === 'admin' || a.role === 'root') return next();
    if (String(a.userId) === String(req.params.teacherId)) return next();
    return res.status(403).json({ error: 'You can only access your own data.' });
}];

// Same, for WRITES where teacherId is in the body/query (free-schedule,
// student-records). A teacher may only write their own; admins any.
const requireTeacherWrite = [optionalAuth, (req, res, next) => {
    const a = req.authUser;
    if (!a) return res.status(401).json({ error: 'Please sign in.' });
    if (a.role === 'admin' || a.role === 'root') return next();
    const tid = req.body?.teacherId ?? req.query?.teacherId;
    if (tid != null && String(a.userId) === String(tid)) return next();
    return res.status(403).json({ error: 'You can only modify your own data.' });
}];

// Slots assigned to a teacher — drives the Teacher dashboard's Slots tab.
// Returns active slots whose teacher_ids include :teacherId (the auth userId),
// with course title + student names resolved. no-store so new admin slots show.
const slotService = require('./services/SlotService');
app.get('/api/public/slots/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await slotService.listForTeacher(req.params.teacherId));
    } catch (e) { next(e); }
});

// Teacher-scoped Demos / Classes / Time table — drive the matching tabs on the
// Teacher dashboard. Live (no-store) so admin additions show without staleness.
const demoSvc = require('./services/DemoService');
app.get('/api/public/demos/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await demoSvc.listForTeacher(req.params.teacherId)); } catch (e) { next(e); }
});
const classSvc = require('./services/ClassSessionService');
app.get('/api/public/classes/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await classSvc.listForTeacher(req.params.teacherId)); } catch (e) { next(e); }
});
const resourceSvc = require('./services/ResourceService');
app.get('/api/public/resources/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await resourceSvc.listForTeacher(req.params.teacherId)); } catch (e) { next(e); }
});

// Teacher Free Schedule — teacher-authored weekly availability. The teacher
// manages their own slots from the dashboard, so these are public endpoints
// keyed by teacherId (same trust model as the other by-teacher routes).
const freeScheduleSvc = require('./services/FreeScheduleService');
app.get('/api/public/free-schedule/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await freeScheduleSvc.listForTeacher(req.params.teacherId)); } catch (e) { next(e); }
});
app.post('/api/public/free-schedule', ...requireTeacherWrite, async (req, res, next) => {
    try { res.json(await freeScheduleSvc.create(req.body)); } catch (e) { next(e); }
});
app.delete('/api/public/free-schedule/:id', ...requireTeacherWrite, async (req, res, next) => {
    try { res.json(await freeScheduleSvc.remove(req.params.id, req.query.teacherId)); } catch (e) { next(e); }
});

// Per-student teacher records (goals / badges / SPR / marks / exercises /
// quizzes / projects) — back the Students-panel detail. Public, keyed by
// teacherId + studentId (same trust model as the other by-teacher routes).
const studentRecordSvc = require('./services/StudentRecordService');
app.get('/api/public/student-records/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await studentRecordSvc.listForStudent(req.params.teacherId, req.query.studentId, req.query.kind)); } catch (e) { next(e); }
});
app.post('/api/public/student-records', ...requireTeacherWrite, async (req, res, next) => {
    try { res.json(await studentRecordSvc.create(req.body)); } catch (e) { next(e); }
});
app.put('/api/public/student-records/:id', ...requireTeacherWrite, async (req, res, next) => {
    try { res.json(await studentRecordSvc.update(req.params.id, req.body)); } catch (e) { next(e); }
});
app.delete('/api/public/student-records/:id', ...requireTeacherWrite, async (req, res, next) => {
    try { res.json(await studentRecordSvc.remove(req.params.id, req.query.teacherId)); } catch (e) { next(e); }
});

// Student "My Learnings" notes — student-authored per lesson, in the course
// player. Public, keyed by studentId (same model as other student endpoints).
// --- Student identity guards for /api/public/* --------------------------------
// requireStudent: WRITES that record a student's own data must be tied to a
// verified token; rejects if absent and overrides the spoofable x-user-id with
// the verified id (blocks acting as another student — e.g. quiz grade fraud).
const requireStudent = [optionalAuth, (req, res, next) => {
    const uid = req.authUser?.userId;
    if (!uid) return res.status(401).json({ error: 'Please sign in to continue.' });
    req.headers['x-user-id'] = String(uid);
    req.verifiedUserId = String(uid);
    next();
}];
// attachVerifiedId: READS — when a token is present, force the response to the
// token's user (override header/query); no token → legacy header fallback. Stops
// a logged-in student reading a peer's progress/certificates/stats.
const attachVerifiedId = [optionalAuth, (req, _res, next) => {
    const uid = req.authUser?.userId;
    if (uid) {
        req.headers['x-user-id'] = String(uid);
        if (req.query) req.query.user_id = String(uid);
    }
    req.verifiedUserId = uid || null;
    next();
}];

// Student → teacher/class feedback (inverse of the teacher's student records).
// The student submits; student_id comes from the verified token (x-user-id is
// a spoofable fallback). Placed AFTER attachVerifiedId is defined.
const teacherFeedbackSvc = require('./services/TeacherFeedbackService');
app.post('/api/public/teacher-feedback', ...attachVerifiedId, async (req, res, next) => {
    try {
        const studentId = req.verifiedUserId || req.headers['x-user-id'] || null;
        const { courseId, ratings, enjoyed, suggestions } = req.body || {};
        res.json(await teacherFeedbackSvc.create({ studentId, courseId, ratings, enjoyed, suggestions }));
    } catch (e) { next(e); }
});
app.get('/api/public/teacher-feedback/mine', ...attachVerifiedId, async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await teacherFeedbackSvc.listForStudent(req.verifiedUserId || req.headers['x-user-id'] || null));
    } catch (e) { next(e); }
});

const learningSvc = require('./services/StudentLearningService');
app.get('/api/public/learnings/by-student/:studentId', ...attachVerifiedId, async (req, res, next) => {
    // Verified id wins over the URL param so a student can't read another's notes.
    try { res.set('Cache-Control', 'no-store'); res.json(await learningSvc.getOne(req.verifiedUserId || req.params.studentId, req.query.lessonId)); } catch (e) { next(e); }
});
app.post('/api/public/learnings', ...attachVerifiedId, async (req, res, next) => {
    try { res.json(await learningSvc.save({ ...req.body, studentId: req.verifiedUserId || req.body.studentId })); } catch (e) { next(e); }
});

// Dynamic teacher-authored feedback forms. Teacher CRUD is keyed by teacherId
// (same by-teacher trust model as slots/demos/classes); students read the forms
// addressed to them + submit once (verified token identity).
const feedbackFormSvc = require('./services/FeedbackFormService');
// Teacher: list/create/update(enable·disable)/delete their own forms.
app.get('/api/public/feedback-forms/by-teacher/:teacherId', ...requireTeacherSelfOrAdmin, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await feedbackFormSvc.listForTeacher(req.params.teacherId)); } catch (e) { next(e); }
});
app.post('/api/public/feedback-forms', ...requireTeacherWrite, async (req, res, next) => {
    try {
        const { teacherId, title, description, courseId, questions } = req.body || {};
        res.json(await feedbackFormSvc.createForm(teacherId, { title, description, courseId, questions }));
    } catch (e) { next(e); }
});
app.patch('/api/public/feedback-forms/:id', ...requireTeacherWrite, async (req, res, next) => {
    try {
        const tid = req.body?.teacherId ?? req.query?.teacherId;
        res.json(await feedbackFormSvc.updateForm(req.params.id, tid, req.body || {}));
    } catch (e) { next(e); }
});
app.delete('/api/public/feedback-forms/:id', ...requireTeacherWrite, async (req, res, next) => {
    try { res.json(await feedbackFormSvc.deleteForm(req.params.id, req.query.teacherId)); } catch (e) { next(e); }
});
// Student: pending forms addressed to me + one-time submit.
app.get('/api/public/feedback-forms/for-student', ...attachVerifiedId, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await feedbackFormSvc.listForStudent(req.verifiedUserId || req.headers['x-user-id'] || null)); } catch (e) { next(e); }
});
app.post('/api/public/feedback-forms/:id/submit', ...attachVerifiedId, async (req, res, next) => {
    try {
        const studentId = req.verifiedUserId || req.headers['x-user-id'] || null;
        res.json(await feedbackFormSvc.submit(studentId, req.params.id, req.body?.answers));
    } catch (e) { next(e); }
});

// Public lead capture — portal signup. Creates a LEAD (no login); admin
// follows up and converts it to a student. Unauthenticated by design.
const leadCtrl = require('./controllers/LeadController');
app.post('/api/public/leads', writeLimiter, leadCtrl.capture);

// Public "Send us a Message" capture from the Contact page (no auth, rate-limited).
const contactMsgSvc = require('./services/ContactMessageService');
app.post('/api/public/contact', writeLimiter, async (req, res, next) => {
    try { res.json(await contactMsgSvc.capture(req.body)); } catch (e) { next(e); }
});

// Public self sign-up (marketing lead-gen). Creates a STUDENT account so the
// person can log in and land on an empty dashboard, AND records a lead so the
// team can follow up. Student-only + rate-limited; the role is written to
// app_metadata (service-role-only) by StudentService.create, so this path can
// never be used to self-provision a teacher/admin.
const signupStudentSvc = require('./services/StudentService');
const signupLeadSvc = require('./services/LeadService');
app.post('/api/public/signup', writeLimiter, async (req, res, next) => {
    try {
        const { name, email, password, phone } = req.body || {};
        const result = await signupStudentSvc.create({ name, email, password, phone });
        // Best-effort follow-up lead — never fail the signup if this errors
        // (e.g. an open lead already exists for the same email).
        try { await signupLeadSvc.capture({ name, email, phone, source: 'self-signup' }); } catch (_) { /* non-fatal */ }
        res.status(201).json({ message: 'Account created', ...result });
    } catch (e) { next(e); }
});

// Student self-service profile photo upload. Verified-student only (requireStudent
// ties the write to the JWT identity — no spoofing another student's avatar).
// Stores the image in R2 and saves the relative path on the student's profile row.
const profileMulter = require('./middlewares/multer');
const { upload: r2UploadHelper, niceFileName: niceName } = require('./helpers/fileUploader');
app.post('/api/public/profile/photo', ...requireStudent, profileMulter.single('photo'), async (req, res, next) => {
    try {
        const uid = req.verifiedUserId;
        if (!uid) return res.status(401).json({ error: 'Sign in required' });
        if (!req.file) return res.status(422).json({ error: 'No photo uploaded' });
        const ext = (req.file.originalname || '').split('.').pop() || 'jpg';
        const destPath = `uploads/users/student/${niceName('student-' + uid, ext)}`;
        await r2UploadHelper(req.file, destPath, 400, 400);
        const authDbConn = require('./config/authDatabase');
        const { QueryTypes: QT } = require('sequelize');
        await authDbConn.query(
            'UPDATE users SET "studentPhoto" = :p, "updatedAt" = NOW() WHERE "userId" = :uid',
            { replacements: { p: destPath, uid: String(uid) }, type: QT.UPDATE },
        );
        res.json({ photo: destPath });
    } catch (e) { next(e); }
});

// Razorpay payments. order/verify require a verified student (requireStudent);
// the webhook is authenticated by its HMAC signature over the raw body.
const paymentCtrl = require('./controllers/PaymentController');
app.post('/api/public/payments/order', ...requireStudent, paymentCtrl.createOrder);
app.post('/api/public/payments/verify', ...requireStudent, paymentCtrl.verify);
app.post('/api/public/payments/webhook', paymentCtrl.webhook);

// Book & Kit orders — Razorpay payments for books and kits (requireStudent applies to orders/verify, webhook is open).
const orderCtrl = require('./controllers/BookKitOrderController');
app.post('/api/public/books-orders/order', ...requireStudent, orderCtrl.createBookOrder);
app.post('/api/public/books-orders/verify', ...requireStudent, orderCtrl.verifyBookPayment);
app.post('/api/public/kits-orders/order', ...requireStudent, orderCtrl.createKitOrder);
app.post('/api/public/kits-orders/verify', ...requireStudent, orderCtrl.verifyKitPayment);
app.post('/api/public/book-kit-orders/webhook', orderCtrl.webhook);

// Public student projects + testimonials — drive the Home page sections.
const projectService = require('./services/ProjectService');
app.get('/api/public/projects', async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await cache.wrap('pub:projects', PUB_TTL, () => projectService.listPublic())); } catch (e) { next(e); }
});
const testimonialService = require('./services/TestimonialService');
app.get('/api/public/testimonials', async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await cache.wrap('pub:testimonials', PUB_TTL, () => testimonialService.listPublic())); } catch (e) { next(e); }
});

// Public books list — drives the Home → Books page. Only visible items.
// Admins manage these under Books → Add/Manage Books; new books appear here.
const bookService = require('./services/BookService');
app.get('/api/public/books', async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await cache.wrap('pub:books', PUB_TTL, () => bookService.listPublic()));
    } catch (e) { next(e); }
});

// Public kits list — drives the Home → Books → Kits page. Only visible items.
// Admins manage these under Books → Add/Manage Kits; new kits appear here.
const kitService = require('./services/KitService');
app.get('/api/public/kits', async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await cache.wrap('pub:kits', PUB_TTL, () => kitService.listPublic()));
    } catch (e) { next(e); }
});

// Public colleges list — used by the student profile dropdown.
// Admin creates colleges in this same DB so this is the single source of truth.
const collegeService = require('./services/CollegeService');
app.get('/api/public/colleges', async (_req, res, next) => {
    try {
        const colleges = await cache.wrap('pub:colleges', 60, async () => {
            const r = await collegeService.list({ per_page: 1000 });
            return r.colleges;
        });
        res.json(colleges);
    } catch (e) { next(e); }
});

// Public programs list — used by the student-facing Programs page so the
// admin-curated set drives what students see. Only active programs surface.
//
// Optional filters:
//   ?clgId=<clgId>     → only programs whose clg_ids contains the college
//   ?course_id=<id>    → only programs whose course_ids contains the course
// Both filters AND together. The arrow on My Courses uses these to show
// "programs that include THIS course for MY college".
const programService = require('./services/ProgramService');
// Programs the *student* is eligible for, used by the Pre-Assessment
// onboarding modal. Filtered by the student's collegeId + (batch_members
// overlap with program.batch_ids OR user_progress course overlap with
// program.course_ids). Public because student JWT isn't reachable here —
// caller passes user_id (header or query) the same way other /api/public
// student endpoints do.
app.get('/api/public/programs/eligible', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.user_id;
        const { programs } = await programService.listEligible(userId);
        return res.json({ programs });
    } catch (e) {
        console.warn('[public/programs/eligible] failed:', e.message);
        return res.json({ programs: [] });
    }
});

app.get('/api/public/programs', async (req, res, next) => {
    try {
        const { programs } = await programService.list();
        const clgId = typeof req.query.clgId === 'string' ? req.query.clgId.trim() : '';
        const courseIdRaw = req.query.course_id ?? req.query.courseId;
        const courseIdNum = courseIdRaw == null || courseIdRaw === ''
            ? null
            : Number(String(courseIdRaw).trim());
        const courseId = Number.isInteger(courseIdNum) && courseIdNum > 0 ? courseIdNum : null;

        // Strict student-scope gate: when user_id is supplied we treat the
        // (college, course, batch) tuple as the canonical filter. Admin has
        // already linked every program to specific batches, so we don't
        // surface unscoped programs or fall back when the student has no
        // memberships — both would leak programs the admin didn't intend
        // for this student. Anonymous callers (no user_id) still get the
        // college+course filter only, used by the marketing/public listing.
        const userId = req.headers['x-user-id'] || req.query.user_id;
        let studentBatchIds = null;
        let studentScoped = false;
        if (userId) {
            studentScoped = true;
            const { BatchMember } = require('./models');
            const memberRows = await BatchMember.findAll({
                where: { user_id: String(userId) },
                attributes: ['batch_id'],
                raw: true,
            }).catch(() => []);
            const ids = memberRows.map((r) => Number(r.batch_id)).filter((n) => Number.isFinite(n));
            studentBatchIds = new Set(ids);
        }

        const filtered = (programs || [])
            .filter((p) => p.is_active !== false)
            .filter((p) => {
                if (!clgId) return true;
                const ids = Array.isArray(p.clg_ids) ? p.clg_ids.map(String) : [];
                return ids.includes(String(clgId));
            })
            .filter((p) => {
                if (!courseId) return true;
                // course_ids holds the new multi-value list; course_id is the
                // legacy single-value column. Treat either as a match so old
                // rows keep surfacing while the column-swap settles.
                const ids = Array.isArray(p.course_ids) ? p.course_ids.map(Number) : [];
                if (ids.includes(courseId)) return true;
                return Number(p.course_id || 0) === courseId;
            })
            .filter((p) => {
                if (!studentScoped) return true;
                // Student-scoped: program MUST be batch-scoped AND overlap
                // one of the student's batches. No memberships → no programs.
                if (studentBatchIds.size === 0) return false;
                const pb = Array.isArray(p.batch_ids) ? p.batch_ids.map(Number) : [];
                if (pb.length === 0) return false;
                return pb.some((id) => studentBatchIds.has(id));
            });
        res.json({ programs: filtered });
    } catch (e) { next(e); }
});

// Course content endpoints — real DB first, mock fallback
const courseContentCtrl = require('./course-content/CourseController');
const playerCtrl = require('./course-content/PlayerController');
const publicCourseService = require('./course-content/PublicCourseService');

app.get('/api/public/courses', async (req, res, next) => {
    // When the caller supplies a clgId (or explicitly *no* clgId) the response
    // must reflect that scope honestly: returning the mock catalog as a
    // fallback would leak unrelated courses across colleges. Only fall back
    // to mock when no college filtering is in play (legacy callers that
    // never sent clgId).
    const collegeAware = 'clgId' in req.query;
    try {
        // Shared per-query cache (clgId/search/paging) — the dashboard course
        // list is the same for every student of a college, so don't rebuild it
        // per request. Flushed by any admin write (pub:* invalidation above).
        const real = await cache.wrap(
            `pub:courses:${JSON.stringify(req.query)}`, PUB_TTL,
            () => publicCourseService.list(req.query),
        );
        if (collegeAware || real?.data?.length) return res.json(real);
        return courseContentCtrl.list(req, res, next);
    } catch (e) {
        console.warn('[public/courses] DB failed:', e.message);
        if (collegeAware) {
            return res.status(503).json({ error: 'Course catalog unavailable' });
        }
        return courseContentCtrl.list(req, res, next);
    }
});

// Public marketing catalog — all active courses (not college-scoped). Drives
// the home page "Our Courses" preview. Kept separate from /api/public/courses
// (student-facing, college/batch scoped) so the anonymous home can render a
// short preview of every course the admin has published.
app.get('/api/public/courses/catalog', async (req, res, next) => {
    try {
        // Public marketing list, hammered on every homepage load and identical
        // for everyone → cache 60s to shield Postgres. No per-user data here.
        const args = { limit: req.query.limit, classFrom: req.query.classFrom, classTo: req.query.classTo, track: req.query.track, search: req.query.search, homeOnly: String(req.query.home || '') === '1' };
        const key = `pub:catalog:${JSON.stringify(args)}`;
        const data = await cache.wrap(key, 60, () => publicCourseService.catalog(args));
        res.set('Cache-Control', 'no-store');
        res.json(data);
    } catch (e) {
        console.warn('[public/courses/catalog] failed:', e.message);
        res.json([]);
    }
});

app.get('/api/public/course/:slug', ...attachVerifiedId, async (req, res) => {
    const clgId = typeof req.query.clgId === 'string' ? req.query.clgId.trim() : null;
    try {
        const vid = req.verifiedUserId || null;
        const real = req.params.slug === 'first'
            ? await publicCourseService.detailsFirstActive()
            : await publicCourseService.detailsBySlug(req.params.slug, clgId || null, vid);
        if (real) return res.json(real);
        // Course-detail must always reflect real admin data. Previously this
        // fell back to mockData (Mastering React 18, etc.) whenever the slug
        // had no matching courses row, so the page showed hardcoded content.
        // Return a clean 404 instead — never serve mock for course detail.
        return res.status(404).json({ error: 'Course not found' });
    } catch (e) {
        console.warn('[public/course] DB failed:', e.message);
        // No mock fallback here either — surface the failure honestly rather
        // than masking it with hardcoded course data.
        return res.status(503).json({ error: 'Course unavailable' });
    }
});

app.get('/api/public/player/:slug', optionalAuth, async (req, res, next) => {
    try {
        // verifiedUserId comes from a validated JWT (optionalAuth); the x-user-id
        // header is client-supplied and spoofable. Release-gating trusts ONLY the
        // verified id — so a student can't unlock another student's videos by
        // passing their id. Progress falls back to the header for anonymous use.
        const clientId = req.headers['x-user-id'] || req.query.user_id;
        const verifiedId = req.authUser?.userId || null;
        const real = await publicCourseService.playerData(
            req.params.slug, req.query.lesson_id, verifiedId || clientId,
            { verifiedUserId: verifiedId, verifiedRole: req.authUser?.role || null },
        );
        if (real) return res.json(real);
        return playerCtrl.player(req, res, next);
    } catch (e) {
        console.warn('[public/player] DB failed, falling back to mock:', e.message);
        return playerCtrl.player(req, res, next);
    }
});
app.post('/api/public/player/complete', ...requireStudent, playerCtrl.complete);
app.post('/api/public/player/progress', ...requireStudent, playerCtrl.progress);

// Student "daily card" — which lessons of a course the teacher has released to
// THIS student right now. Powers the dashboard card without loading the full
// player payload. Public, keyed by user_id (same model as other student
// endpoints). Response: { delegated, lesson_ids }. When delegated === false the
// course has no teaching assignment, so the student sees the whole course
// (caller should fall back to the normal curriculum).
// Canonical "My Courses" — courses the verified student owns (paid), is
// enrolled in, or is delegated (school/batch). Replaces the legacy
// course-service /enroll/my-courses (different DB + course-id space).
app.get('/api/public/my-courses', ...attachVerifiedId, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const result = await publicCourseService.myCourses(req.verifiedUserId);
        return res.json(result);
    } catch (e) {
        console.warn('[public/my-courses] failed:', e.message);
        return res.status(500).json({ error: 'Could not load your courses' });
    }
});

// Student leaderboard — points (completed lessons + best quiz scores). With
// ?course_id=X it's per-course; without, it's overall. Includes the verified
// student's own rank ("me") even if they're outside the top.
const rankingSvc = require('./services/RankingService');
app.get('/api/public/leaderboard', ...attachVerifiedId, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const courseId = req.query.course_id ? Number(req.query.course_id) : null;
        const data = await rankingSvc.build({ courseId, limit: req.query.limit, meUserId: req.verifiedUserId });
        return res.json(data);
    } catch (e) {
        console.warn('[leaderboard] failed:', e.message);
        return res.status(500).json({ error: 'Could not load leaderboard' });
    }
});

// REMOVED: Old teaching assignment feature
// Replaced by new Batch Management System
// The following endpoints were removed:
//   - GET /api/public/teaching/students-by-teacher/:teacherId
//   - GET /api/public/teaching/student-progress/:teacherId/:studentId
//   - GET /api/public/my-lessons
// These should be reimplemented using the batch system instead
// See BATCH_MANAGEMENT_SYSTEM.md for migration guide

// Persist one quiz attempt so re-entering the lesson restores the last score
// and remaining-retry state. user_id comes from the x-user-id header (set by
// the frontend course API interceptor) or the body, matching existing pattern.
app.post('/api/public/player/quiz-submit', ...requireStudent, async (req, res) => {
    try {
        // Verified id only — never trust a client-supplied user_id for a graded
        // submission (prevents submitting a score as another student).
        const user_id = req.verifiedUserId;
        const result = await publicCourseService.submitQuiz({ ...req.body, user_id });
        return res.json(result);
    } catch (e) {
        console.warn('[public/player/quiz-submit] failed:', e.message);
        return res.status(500).json({ error: 'Could not save quiz attempt' });
    }
});

// Student-facing program request: the logged-in student sees a request an
// admin sent them ("you are eligible for X") and accepts/rejects it. Student
// identity via x-user-id header, matching the other /api/public endpoints.
const studentSvc = require('./services/StudentService');
app.get('/api/public/program-request', ...attachVerifiedId, async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.user_id;
        return res.json(await studentSvc.getStudentProgramRequest(userId));
    } catch (e) {
        console.warn('[public/program-request] failed:', e.message);
        return res.status(500).json({ error: 'Could not load program request' });
    }
});
app.get('/api/public/program-request/accepted', ...attachVerifiedId, async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.query.user_id;
        return res.json(await studentSvc.getAcceptedProgram(userId));
    } catch (e) {
        console.warn('[public/program-request/accepted] failed:', e.message);
        return res.status(500).json({ error: 'Could not load accepted program' });
    }
});
app.post('/api/public/program-request/respond', ...requireStudent, async (req, res) => {
    try {
        const userId = req.verifiedUserId;
        const result = await studentSvc.respondProgramRequest(userId, req.body.action);
        return res.json(result);
    } catch (e) {
        const code = e.status || 500;
        if (code === 500) console.warn('[public/program-request/respond] failed:', e.message);
        return res.status(code).json({ error: e.message || 'Could not respond' });
    }
});

// User progress / enrollment — public because student JWT lives in a cookie on a
// different service; user_id is passed in body/query as the existing pattern.
const userProgressRoutes = require('./routes/userprogress.routes');
app.use('/api', userProgressRoutes);

// Returns the user's highest course progress (0-100) and a course-completed flag.
// Used by the Assessments tab to gate the Post-Assessment button. The user_id query
// param matches the watch store's keying (defaults to 99 for the dev/anonymous case).
const watchStore = require('./course-content/watchStore');
const { Lesson } = require('./models');
app.get('/api/public/course-progress', ...attachVerifiedId, async (req, res) => {
    try {
        // Pull the student id from header first (set by frontend axios interceptor),
        // fall back to query param. No silent default — anonymous = empty progress.
        const userId = req.verifiedUserId || String(req.headers['x-user-id'] || req.query.user_id || '');
        if (!userId) return res.json({ user_id: 0, max_progress: 0, completed_any: false });
        // DB-authoritative (works across instances; no whole-table memory load).
        const counts = await watchStore.completedCountsByCourse(userId);
        if (!counts.length) return res.json({ user_id: userId, max_progress: 0, completed_any: false });

        const courseIds = counts.map((c) => c.course_id);
        // Tally lesson counts per course in a single grouped query.
        const lessonCounts = await Lesson.findAll({
            where: { course_id: courseIds },
            attributes: ['course_id', [Lesson.sequelize.fn('COUNT', Lesson.sequelize.col('id')), 'count']],
            group: ['course_id'],
            raw: true,
        });
        const totalByCourse = Object.fromEntries(lessonCounts.map((r) => [Number(r.course_id), Number(r.count) || 0]));

        let maxProgress = 0;
        let completedAny = false;
        for (const c of counts) {
            const total = totalByCourse[c.course_id] || 0;
            if (!total) continue;
            const pct = Math.round((c.count / total) * 100);
            if (pct > maxProgress) maxProgress = pct;
            if (c.count >= total) completedAny = true;
        }
        return res.json({ user_id: userId, max_progress: maxProgress, completed_any: completedAny });
    } catch (err) {
        console.warn('[course-progress] failed:', err.message);
        return res.json({ user_id: Number(req.query.user_id) || 0, max_progress: 0, completed_any: false });
    }
});

// Admin login brute-force guard. The login endpoint was the ONLY
// unauthenticated admin surface with no rate limit — an attacker could
// hammer passwords at full speed. 10 attempts/minute per IP is generous for
// humans (typos) and useless for brute force. Successful logins don't count
// against the limit so a busy admin isn't locked out by their own activity.
const adminLoginLimiter = rateLimit({
    ...rlOpts, max: 10, skipSuccessfulRequests: true,
    store: makeStore('rl:alogin:'),
    message: { error: 'Too many login attempts — try again in a minute.' },
});
app.use('/api/admin/auth/login', adminLoginLimiter);

// Public auth endpoints (login is unauthenticated; me/logout require token)
app.use('/api/admin', authRoutes);

// Course / curriculum / zoom-live-class routers apply per-route role gates
// internally (adminOnly vs adminOrTeacher) so teachers can manage the
// Curriculum + Live Class tabs of their own courses. JWT decoding still
// happens at the mount point via `auth` so req.user is populated.
//
// IMPORTANT: these MUST be registered before the adminOnly-gated routers
// below. Express runs a mount's middleware (e.g. `adminOnly`) for every
// request matching the path prefix — even when that router has no matching
// route. `adminOnly` short-circuits with a 403 for non-admins and never
// calls next(), so if an adminOnly mount sits earlier in the chain it kills
// an teacher's request before it can fall through to courseRoutes.
app.use('/api/admin', auth, categoryRoutes);
app.use('/api/admin', auth, courseRoutes);
app.use('/api/admin', auth, curriculumRoutes);
app.use('/api/admin', auth, zoomLiveClassRoutes.admin);
app.use('/api/public', zoomLiveClassRoutes.public);
app.use('/api/admin', auth, forumRoutes.admin);
app.use('/api/public', forumRoutes.public);

// Teacher-delegation: admin assigns course+roster, teacher drips lessons.
// Student performance feedback — teacher-authored post-class evaluations
// (StudentRecord kind='evaluation'), surfaced to the admin as stats + a
// per-student feedback browser. Read-only + admin-gated.
const feedbackSvc = require('./services/StudentFeedbackService');
app.get('/api/admin/feedback/stats', adminOnly, async (req, res, next) => {
    try { res.json(await feedbackSvc.stats()); } catch (e) { next(e); }
});
app.get('/api/admin/feedback/by-student', adminOnly, async (req, res, next) => {
    try { res.json(await feedbackSvc.byStudent()); } catch (e) { next(e); }
});
app.get('/api/admin/feedback', adminOnly, async (req, res, next) => {
    try { res.json(await feedbackSvc.list({ studentId: req.query.studentId, limit: req.query.limit })); } catch (e) { next(e); }
});

// Student → teacher/class feedback (admin reads).
const teacherFeedbackAdminSvc = require('./services/TeacherFeedbackService');
app.get('/api/admin/teacher-feedback/stats', adminOnly, async (req, res, next) => {
    try { res.json(await teacherFeedbackAdminSvc.stats()); } catch (e) { next(e); }
});
app.get('/api/admin/teacher-feedback/by-teacher', adminOnly, async (req, res, next) => {
    try { res.json(await teacherFeedbackAdminSvc.byTeacher()); } catch (e) { next(e); }
});
app.get('/api/admin/teacher-feedback', adminOnly, async (req, res, next) => {
    try { res.json(await teacherFeedbackAdminSvc.list({ teacherId: req.query.teacherId, limit: req.query.limit })); } catch (e) { next(e); }
});

// Dynamic feedback forms — admin reads (all forms, per-form stats, individual
// records). Read-only + admin-gated; teachers author them via /api/public.
const feedbackFormAdminSvc = require('./services/FeedbackFormService');
app.get('/api/admin/feedback-forms', adminOnly, async (req, res, next) => {
    try { res.json(await feedbackFormAdminSvc.adminForms()); } catch (e) { next(e); }
});
app.get('/api/admin/feedback-forms/:id/stats', adminOnly, async (req, res, next) => {
    try { res.json(await feedbackFormAdminSvc.adminStats(req.params.id)); } catch (e) { next(e); }
});
app.get('/api/admin/feedback-forms/:id/responses', adminOnly, async (req, res, next) => {
    try { res.json(await feedbackFormAdminSvc.adminResponses(req.params.id)); } catch (e) { next(e); }
});

// Contact messages — admin inbox (list / mark read / delete). Public capture is
// on /api/public/contact.
const contactMsgAdminSvc = require('./services/ContactMessageService');
app.get('/api/admin/contact-messages', adminOnly, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await contactMsgAdminSvc.list(req.query)); } catch (e) { next(e); }
});
app.patch('/api/admin/contact-messages/:id', adminOnly, async (req, res, next) => {
    try { res.json(await contactMsgAdminSvc.update(req.params.id, req.body)); } catch (e) { next(e); }
});
app.delete('/api/admin/contact-messages/:id', adminOnly, async (req, res, next) => {
    try { res.json(await contactMsgAdminSvc.remove(req.params.id)); } catch (e) { next(e); }
});

// Admin-editable email/SMTP settings (e.g. Brevo) — configurable from the
// dashboard, stored in app_settings, DB overrides .env. Password never returned.
const settingsSvc = require('./services/SettingsService');
const mailerSvc = require('./helpers/mailer');
app.get('/api/admin/settings/email', adminOnly, async (req, res, next) => {
    try { res.json(await settingsSvc.getEmailSettingsMasked()); } catch (e) { next(e); }
});
app.put('/api/admin/settings/email', adminOnly, async (req, res, next) => {
    try { res.json(await settingsSvc.saveEmailSettings(req.body || {})); } catch (e) { next(e); }
});
app.post('/api/admin/settings/email/test', adminOnly, async (req, res) => {
    try {
        const to = String(req.body?.to || req.user?.email || '').trim();
        if (!to) return res.status(422).json({ error: 'Provide a recipient email address.' });
        const r = await mailerSvc.send({ to, subject: 'VR Robotics — SMTP test ✅', html: '<p>Your email settings are working. 🎉</p>' });
        if (r.skipped) return res.status(400).json({ error: 'SMTP not configured — set host, user and password first.' });
        res.json({ success: true, message: `Test email sent to ${to}.`, messageId: r.messageId });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Admin-editable Razorpay payment keys — admin pastes key_id/key_secret in the
// dashboard, stored in app_settings, DB overrides .env. Secrets never returned.
app.get('/api/admin/settings/payment', adminOnly, async (req, res, next) => {
    try { res.json(await settingsSvc.getPaymentSettingsMasked()); } catch (e) { next(e); }
});
app.put('/api/admin/settings/payment', adminOnly, async (req, res, next) => {
    try { res.json(await settingsSvc.savePaymentSettings(req.body || {})); } catch (e) { next(e); }
});

// Protected admin endpoints — adminOnly enforces JWT + role
app.use('/api/admin', adminOnly, leadRoutes);
app.use('/api/admin', adminOnly, adminRoutes);
app.use('/api/admin', adminOnly, quizRoutes);
app.use('/api/admin', adminOnly, liveClassRoutes);
app.use('/api/admin', adminOnly, couponRoutes);
app.use('/api/admin', adminOnly, galleryRoutes);
app.use('/api/admin', adminOnly, demoVideoRoutes);
app.use('/api/admin', adminOnly, locationRoutes);
app.use('/api/admin', adminOnly, bookRoutes);
app.use('/api/admin', adminOnly, kitRoutes);
app.use('/api/admin', adminOnly, slotRoutes);
app.use('/api/public', ...requireStudent, slotRoutes);
app.use('/api/admin', adminOnly, demoRoutes);
app.use('/api/admin', adminOnly, classRoutes);
app.use('/api/admin', adminOnly, projectRoutes);
app.use('/api/admin', adminOnly, testimonialRoutes);
app.use('/api/admin', adminOnly, resourceRoutes);
app.use('/api/admin', adminOnly, certificateRoutes);
app.use('/api/admin', adminOnly, collegeDashboardRoutes);
app.use('/api/admin', adminOnly, batchRoutes);
app.use('/api/admin', adminOnly, batchNewRoutes);
app.use('/api/admin', adminOnly, collegeRoutes);
app.use('/api/admin', adminOnly, studentRoutes);
app.use('/api/admin', adminOnly, teacherRoutes);
app.use('/api/admin', adminOnly, languageRoutes);
app.use('/api/admin', adminOnly, adminBookOrderRoutes);
app.use('/api/admin', adminOnly, adminKitOrderRoutes);
app.use('/api/admin', auth, assignmentRoutes);
app.use('/api/public', ...requireStudent, assignmentRoutes);
app.use('/api/admin', auth, notificationRoutes);
app.use('/api/public', ...requireStudent, notificationRoutes);
app.use('/api/public', ...requireStudent, profileRoutes);
app.use('/api/public', ...requireStudent, studentDataRoutes);

// Public certificate routes — unauthenticated. Mirror the player flow which
// also uses /api/public/* with an x-user-id header for student keying.
const certificateCtrl = require('./controllers/CertificateController');
// Reads scoped to the verified student; issue requires a verified identity.
// The :identifier render stays open (shareable certificate link).
app.get('/api/public/certificate/find', ...attachVerifiedId, certificateCtrl.studentFind);
app.get('/api/public/certificate/mine', ...attachVerifiedId, certificateCtrl.studentList);
app.post('/api/public/certificate/issue', ...requireStudent, certificateCtrl.studentIssue);
app.get('/api/public/certificate/:identifier', certificateCtrl.render);

// Aggregated student-overview KPIs:
//   - active_programs:    enrolled UserProgress rows where the course isn't 100% done
//   - completed_programs: enrolled UserProgress rows where the course IS 100% done
//   - certificates:       count of Certificate rows for this user
// One round-trip to keep the dashboard snappy. Reuses the same watchStore +
// Lesson tally as /api/public/course-progress above.
const { UserProgress, Certificate } = require('./models');
app.get('/api/public/student/overview-stats', ...attachVerifiedId, async (req, res) => {
    try {
        const rawUserId = req.headers['x-user-id'] || req.query.user_id;
        if (!rawUserId) {
            return res.json({ active_programs: 0, completed_programs: 0, certificates: 0 });
        }

        // All progress/certificate tables key user_id as a string (varchar).
        const userIdStr = String(rawUserId || '').trim();

        // Pull all enrollments for this user.
        const enrollments = userIdStr
            ? await UserProgress.findAll({
                where: { user_id: userIdStr, enrolled: true },
                attributes: ['program_id', 'course_id'],
                raw: true,
            })
            : [];

        // For each enrolled course, calc completion using watchStore + Lesson totals.
        const courseIds = enrollments.map((e) => e.course_id).filter(Boolean);
        const completedCourses = new Set();
        if (courseIds.length) {
            const lessonCounts = await Lesson.findAll({
                where: { course_id: courseIds },
                attributes: ['course_id', [Lesson.sequelize.fn('COUNT', Lesson.sequelize.col('id')), 'count']],
                group: ['course_id'],
                raw: true,
            });
            const totalByCourse = Object.fromEntries(
                lessonCounts.map((r) => [Number(r.course_id), Number(r.count) || 0])
            );
            const counts = await watchStore.completedCountsByCourse(userIdStr);
            const doneByCourse = Object.fromEntries(counts.map((c) => [c.course_id, c.count]));
            for (const courseId of courseIds) {
                const total = totalByCourse[Number(courseId)] || 0;
                const done = doneByCourse[Number(courseId)] || 0;
                if (total > 0 && done >= total) completedCourses.add(Number(courseId));
            }
        }

        const activePrograms = enrollments.filter((e) => !completedCourses.has(Number(e.course_id))).length;
        const completedPrograms = enrollments.filter((e) => completedCourses.has(Number(e.course_id))).length;

        // Certificate count is keyed by string user_id (auth-service shape).
        const certificates = await Certificate.count({ where: { user_id: userIdStr } });

        return res.json({
            user_id: userIdStr,
            active_programs: activePrograms,
            completed_programs: completedPrograms,
            certificates,
        });
    } catch (err) {
        console.warn('[overview-stats] failed:', err.message);
        return res.json({ active_programs: 0, completed_programs: 0, certificates: 0 });
    }
});

// Student-accessible: any authenticated user (admin or student) can submit / read their own pre-assessment.
app.use('/api', auth, preAssessmentRoutes);

// Sentry error handler must run before our own error middleware so it
// captures the error first, then errorHandler shapes the client response.
attachErrorHandler(app);
app.use(errorHandler);

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

let httpServer = null;

const start = () => {
    httpServer = app.listen(env.port, () => {
        console.log(`admin-service running on ${env.port}`);
    });

    // Start the email queue worker now that the HTTP server is up. Jobs
    // already in the table (e.g. from a previous run that crashed mid-send)
    // will be picked up on the next tick. No-op silently when SMTP isn't
    // configured (mailer.isConfigured() guards the poll).
    try {
        const emailWorker = require('./jobs/emailWorker');
        emailWorker.start();
    } catch (e) {
        console.warn('[email-worker] failed to start:', e.message);
    }

    // Nightly logical DB backup → R2 (db-backups/<date>/...). No-op when R2
    // isn't configured or DB_BACKUP_DISABLED=true. Manual run:
    //   node src/scripts/backupNow.js
    try {
        const dbBackup = require('./jobs/dbBackup');
        dbBackup.start();
    } catch (e) {
        console.warn('[db-backup] failed to start:', e.message);
    }

    // app.listen() returns asynchronously — bind failures (EADDRINUSE,
    // EACCES) arrive as 'error' events on the server, NOT as thrown
    // exceptions. Without this handler they bubble to uncaughtException
    // and nodemon respawns straight into the same wall. Fail fast with a
    // clear, actionable message so the operator fixes it once.
    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n[admin-service] Port ${env.port} is already in use.`);
            console.error('Another admin-service (or unrelated process) is bound. Free it with:');
            console.error(`  PowerShell:  Get-NetTCPConnection -LocalPort ${env.port} -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`);
            console.error('Or set PORT=<other> in admin-service/.env and restart.\n');
            process.exit(1);
        }
        if (err.code === 'EACCES') {
            console.error(`[admin-service] Permission denied binding port ${env.port} (try a port >1024).`);
            process.exit(1);
        }
        console.error('[admin-service] HTTP server error:', err);
        process.exit(1);
    });
};

// Graceful shutdown — release the port on Ctrl+C / nodemon restart so the
// next bind doesn't race against a TIME_WAIT socket.
const shutdown = (signal) => {
    if (!httpServer) process.exit(0);
    console.log(`\n[admin-service] ${signal} received, closing server...`);
    httpServer.close(() => process.exit(0));
    // Hard cap: if connections won't drain, exit anyway after 5s.
    setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

sequelize.authenticate()
    .then(async () => {
        // NOTE: previously we loaded the ENTIRE progress tables into memory here
        // (watchStore.loadFromDb). That doesn't scale — at thousands of students
        // it's a memory blow-up and is wrong across multiple server instances.
        // The reads that matter (player, course-progress, overview-stats,
        // teacher progress) now query the DB per-user, so no boot hydration is
        // needed. The in-memory store remains only as a best-effort cache for
        // the mock fallback path.

        // Idempotently ensure auth-schema users columns exist. Originally
        // these were MySQL DESCRIBE / ALTER ADD COLUMN patches added when
        // admin-service shipped before the column was in auth-service's
        // schema. The Supabase migration SQL (supabase/migrations/02) now
        // defines these columns canonically — but we keep the check so a
        // partial deployment (admin-service updated, schema not applied
        // yet) still self-heals on boot. Postgres-flavored: query
        // information_schema, then ALTER ... IF NOT EXISTS (atomic in PG).
        try {
            const authDb = require('./config/authDatabase');
            const { QueryTypes } = require('sequelize');
            const authSchema = 'lucy_devdb';
            const ensureCol = async (column, ddl) => {
                const rows = await authDb.query(
                    `SELECT column_name FROM information_schema.columns
                       WHERE table_schema = :schema
                         AND table_name   = 'users'
                         AND column_name  = :column
                       LIMIT 1`,
                    { replacements: { schema: authSchema, column }, type: QueryTypes.SELECT }
                );
                if (!rows.length) {
                    await authDb.query(`ALTER TABLE ${authSchema}.users ADD COLUMN IF NOT EXISTS ${ddl}`);
                    console.log(`🛠️  Added ${authSchema}.users.${column}`);
                }
            };
            await ensureCol('teacherPhoto', '"teacherPhoto" VARCHAR(255)');
            await ensureCol('studentPhoto', '"studentPhoto" VARCHAR(255)');
            await ensureCol('postScoreDuration', '"postScoreDuration" INTEGER');
        } catch (e) {
            console.warn('[auth-db] photo column check failed:', e.message);
        }

        try {
            const { Language } = require('./models');
            await Language.sync();
        } catch (e) {
            console.warn('[languages] table sync failed:', e.message);
        }

        // lms_admin.courses.has_certificate + .batch_ids: idempotent on-boot
        // column ensure. Postgres-flavored — uses information_schema +
        // ALTER ... IF NOT EXISTS. The Supabase migration SQL defines these
        // canonically; this is just a self-heal for partial deployments.
        try {
            const { QueryTypes } = require('sequelize');
            const lmsSchema = 'lms_admin';
            const ensureCourseCol = async (column, ddl) => {
                const rows = await sequelize.query(
                    `SELECT column_name FROM information_schema.columns
                       WHERE table_schema = :schema
                         AND table_name   = 'courses'
                         AND column_name  = :column
                       LIMIT 1`,
                    { replacements: { schema: lmsSchema, column }, type: QueryTypes.SELECT }
                );
                if (!rows.length) {
                    await sequelize.query(`ALTER TABLE ${lmsSchema}.courses ADD COLUMN IF NOT EXISTS ${ddl}`);
                    console.log(`🛠️  Added ${lmsSchema}.courses.${column}`);
                }
            };
            await ensureCourseCol('has_certificate', 'has_certificate BOOLEAN NOT NULL DEFAULT TRUE');
            await ensureCourseCol('batch_ids', 'batch_ids JSONB');
            await ensureCourseCol('bunny_collection_id', 'bunny_collection_id VARCHAR(64)');
            // Class-access range (e.g. accessible to Class 8 → 12). Nullable —
            // a course with no range set is treated as open to all classes.
            await ensureCourseCol('class_from', 'class_from SMALLINT');
            await ensureCourseCol('class_to', 'class_to SMALLINT');
            // Admin-set Score denominator + Lectures label shown on the
            // course-details stats card.
            await ensureCourseCol('score_max', 'score_max INTEGER');
            await ensureCourseCol('lectures_label', 'lectures_label VARCHAR(255)');
            // Free public sample/teaser flag (marketing courses).
            await ensureCourseCol('is_marketing', 'is_marketing BOOLEAN NOT NULL DEFAULT FALSE');
            // Admin-controlled "push to Home page" flag. Default FALSE so the
            // home "Our Courses" section stays empty (hidden) until the admin
            // explicitly publishes a finished course to it.
            await ensureCourseCol('show_on_home', 'show_on_home BOOLEAN NOT NULL DEFAULT FALSE');
        } catch (e) {
            console.warn('[courses] column check failed:', e.message);
        }

        // lms_admin.users.is_root_admin — lets the root admin grant another
        // admin the full root dashboard ("Give Access"). Idempotent ADD COLUMN.
        try {
            await sequelize.query(
                `ALTER TABLE lms_admin.users ADD COLUMN IF NOT EXISTS is_root_admin BOOLEAN NOT NULL DEFAULT FALSE`
            );
        } catch (e) {
            console.warn('[users] is_root_admin column check failed:', e.message);
        }

        // Course discussion forum — create the `forums` + `forum_reports`
        // tables on first run so the module is usable without a manual
        // migration. Mirrors the Languages pattern above. No-op on restart.
        try {
            const { Forum, ForumReport } = require('./models');
            await Forum.sync();
            await ForumReport.sync();
        } catch (e) {
            console.warn('[forum] table sync failed:', e.message);
        }

        // Programs — top-level offerings shown on the public Programs page
        // (AI Frontier, AI Frontier Plus, Elite AI Residency, …). Same
        // idempotent .sync() pattern as Forum so the table is created on
        // first run without a manual migration.
        try {
            const { Program } = require('./models');
            await Program.sync();
        } catch (e) {
            console.warn('[programs] table sync failed:', e.message);
        }

        // Batches — cohorts of students assigned to a course with a teacher.
        // Batch ID format: CourseName_DDMMYY_Count (e.g., Scratch_160625_01)
        // Members tracked in batch_members (with joined/removed dates).
        // Classes tracked in batch_classes (with support for temporary teachers).
        try {
            const { Batch, BatchMember, BatchClass } = require('./models');
            await Batch.sync();
            await BatchMember.sync();
            await BatchClass.sync();
            // Add batch_id column if missing (idempotent)
            await sequelize.query('ALTER TABLE lms_admin.batches ADD COLUMN IF NOT EXISTS batch_id VARCHAR(64) UNIQUE');
            await sequelize.query('ALTER TABLE lms_admin.batches ADD COLUMN IF NOT EXISTS course_id INTEGER');
            await sequelize.query('ALTER TABLE lms_admin.batches ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(64)');
            // Create indexes for batches
            await sequelize.query('CREATE INDEX IF NOT EXISTS idx_batches_course_id ON lms_admin.batches(course_id)');
            await sequelize.query('CREATE INDEX IF NOT EXISTS idx_batches_teacher_id ON lms_admin.batches(teacher_id)');
            // Add user_id, student_id and other fields to batch_members if missing
            await sequelize.query('ALTER TABLE lms_admin.batch_members ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)');
            await sequelize.query('ALTER TABLE lms_admin.batch_members ADD COLUMN IF NOT EXISTS student_id VARCHAR(128)');
            await sequelize.query('ALTER TABLE lms_admin.batch_members ADD COLUMN IF NOT EXISTS joined_date DATE');
            await sequelize.query('ALTER TABLE lms_admin.batch_members ADD COLUMN IF NOT EXISTS removed_date DATE');
            await sequelize.query('ALTER TABLE lms_admin.batch_members ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'active\'');
            // Create indexes for batch_members
            await sequelize.query('CREATE INDEX IF NOT EXISTS idx_batch_members_user_id ON lms_admin.batch_members(user_id)');
            await sequelize.query('CREATE INDEX IF NOT EXISTS idx_batch_members_status ON lms_admin.batch_members(status)');
            console.log('[batches] schema ensured ✓');
        } catch (e) {
            console.warn('[batches] table sync failed:', e.message);
        }

        // Durable email queue for batch-add notifications. The worker (set
        // up below in `start`) polls this table — no Redis dependency.
        try {
            const { EmailJob } = require('./models');
            await EmailJob.sync();
        } catch (e) {
            console.warn('[email-jobs] table sync failed:', e.message);
        }

        // Books — shown on the public Books page, managed under Books →
        // Add/Manage Books. Same idempotent .sync() pattern; creates the
        // `books` table on first run without a manual migration.
        try {
            const { Book } = require('./models');
            await Book.sync();
            // Add price column if missing (idempotent)
            await sequelize.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) NOT NULL DEFAULT 0');
        } catch (e) {
            console.warn('[books] table sync failed:', e.message);
        }

        // Kits — robotics kits shown on the public Kits page (Home → Books → Kits).
        // Same idempotent .sync() pattern; creates the `kits` table on first run.
        try {
            const { Kit } = require('./models');
            await Kit.sync();
        } catch (e) {
            console.warn('[kits] table sync failed:', e.message);
        }

        // Book Orders — tracks book purchases via Razorpay.
        try {
            const { BookOrder } = require('./models');
            await BookOrder.sync();
        } catch (e) {
            console.warn('[book-orders] table sync failed:', e.message);
        }

        // Kit Orders — tracks kit purchases via Razorpay.
        try {
            const { KitOrder } = require('./models');
            await KitOrder.sync();
        } catch (e) {
            console.warn('[kit-orders] table sync failed:', e.message);
        }

        // Slots — admin scheduling: a course + time window + assigned
        // teachers/students. Also includes SlotEnrollment for student bookings.
        try {
            const { Slot, SlotEnrollment } = require('./models');
            await Slot.sync();
            await SlotEnrollment.sync();
            // Add columns if missing (idempotent)
            await sequelize.query('ALTER TABLE slots ADD COLUMN IF NOT EXISTS meeting_link TEXT');
            await sequelize.query('ALTER TABLE slots ADD COLUMN IF NOT EXISTS topic VARCHAR(255)');
            await sequelize.query('ALTER TABLE slots ADD COLUMN IF NOT EXISTS notes TEXT');
        } catch (e) {
            console.warn('[slots] table sync failed:', e.message);
        }

        // Demos / Classes — admin scheduling features added alongside Slots.
        // Same idempotent .sync() pattern creates each table (demos,
        // class_sessions) on first run.
        try {
            const { Demo, ClassSession } = require('./models');
            await Demo.sync();
            await ClassSession.sync();
        } catch (e) {
            console.warn('[demos/classes] table sync failed:', e.message);
        }

        // Student Projects + Testimonials — drive the public Home page sections,
        // managed under Projects / Testimonials. Idempotent .sync() creates the
        // `projects` + `testimonials` tables on first run.
        try {
            const { Project, Testimonial } = require('./models');
            await Project.sync();
            await Testimonial.sync();
        } catch (e) {
            console.warn('[projects/testimonials] table sync failed:', e.message);
        }

        // Resources — admin-managed PDF library assigned to teachers, shown on
        // the teacher dashboard Resources tab. Idempotent .sync() creates the
        // `resources` table on first run.
        try {
            const { Resource, ResourceCategory, TeacherFreeSchedule, StudentRecord, StudentLearning, TeacherFeedback, DemoVideo } = require('./models');
            await Resource.sync();
            // Teacher-authored weekly availability ("Free Schedule"). Idempotent.
            await TeacherFreeSchedule.sync();
            // Per-student teacher records (goals/badges/SPR/marks/…). Idempotent.
            await StudentRecord.sync();
            // Student → teacher/class feedback (the inverse direction). Idempotent.
            await TeacherFeedback.sync();
            // Marketing/demo videos (CEO intro + sample teasers). Idempotent.
            await DemoVideo.sync();
            // Student "My Learnings" notes per lesson. Idempotent.
            await StudentLearning.sync();
            // Resource categories table (admin-managed, drives the teacher
            // dashboard category filter). Same idempotent .sync() pattern.
            await ResourceCategory.sync();
            // Late-added columns on resources for the categorized teacher
            // dashboard: category, course, and free-text section. Idempotent.
            await sequelize.query('ALTER TABLE lms_admin.resources ADD COLUMN IF NOT EXISTS resource_category_id INTEGER');
            await sequelize.query('ALTER TABLE lms_admin.resources ADD COLUMN IF NOT EXISTS course_id INTEGER');
            await sequelize.query('ALTER TABLE lms_admin.resources ADD COLUMN IF NOT EXISTS section VARCHAR(255)');
        } catch (e) {
            console.warn('[resources] table sync failed:', e.message);
        }

        // REMOVED: Old teacher-delegation tables (teaching_assignments, assignment_members, lesson_releases)
        // Replaced by the new Batch Management System
        // Tables dropped by migration 12_remove_teaching_assignment_feature.sql

        // Dynamic feedback forms (teacher-authored) + their one-time responses.
        // feedback_responses carries a unique (form_id, student_id) index, so —
        // like the delegation tables above — a plain .sync() on an existing table
        // would re-issue CREATE INDEX and throw on every boot. Guard each create
        // on an information_schema existence check so we only build what's missing.
        try {
            const { QueryTypes } = require('sequelize');
            const { FeedbackForm, FeedbackResponse } = require('./models');
            const exists = async (table) => {
                const rows = await sequelize.query(
                    `SELECT 1 FROM information_schema.tables
                       WHERE table_schema = 'lms_admin' AND table_name = :table LIMIT 1`,
                    { replacements: { table }, type: QueryTypes.SELECT }
                );
                return rows.length > 0;
            };
            if (!(await exists('feedback_forms')))     await FeedbackForm.sync();
            if (!(await exists('feedback_responses'))) await FeedbackResponse.sync();
        } catch (e) {
            console.warn('[feedback-forms] table sync failed:', e.message);
        }

        // Leads — public signups awaiting admin follow-up / conversion. Same
        // idempotent .sync() pattern; created on first run, no manual migration.
        try {
            const { Lead } = require('./models');
            await Lead.sync();
        } catch (e) {
            console.warn('[leads] table sync failed:', e.message);
        }

        // Contact messages — public "Send us a Message" submissions shown in the
        // admin dashboard. Idempotent .sync(); created on first run.
        try {
            const { ContactMessage } = require('./models');
            await ContactMessage.sync();
        } catch (e) {
            console.warn('[contact-messages] table sync failed:', e.message);
        }

        // Assignments and submissions — teacher creates assignments for batches,
        // students submit work, teachers grade. Idempotent .sync().
        try {
            const { Assignment, AssignmentSubmission, Notification } = require('./models');
            await Assignment.sync();
            await AssignmentSubmission.sync();
            await Notification.sync();
        } catch (e) {
            console.warn('[contact-messages] table sync failed:', e.message);
        }

        // Payments — Razorpay course purchases (paywall source of truth).
        try {
            const { Payment } = require('./models');
            await Payment.sync();
        } catch (e) {
            console.warn('[payments] table sync failed:', e.message);
        }

        // app_settings — admin-pasted SMTP + Razorpay keys (DB overrides .env).
        // Not in the SQL migrations, so create-if-missing here guarantees the
        // table exists on a fresh production DB; without this, saving keys from
        // the dashboard would fail. Idempotent .sync() pattern.
        try {
            const { AppSetting } = require('./models');
            await AppSetting.sync();
        } catch (e) {
            console.warn('[settings] app_settings table sync failed:', e.message);
        }

        // locations — admin-managed learning centers for the public Locations
        // page. Idempotent create-if-missing on first boot.
        try {
            const { Location } = require('./models');
            await Location.sync();
        } catch (e) {
            console.warn('[locations] table sync failed:', e.message);
        }

        // lms_admin.programs late-added columns. Same self-heal pattern.
        try {
            const { QueryTypes } = require('sequelize');
            const lmsSchema = 'lms_admin';
            const ensureProgramCol = async (column, ddl) => {
                const rows = await sequelize.query(
                    `SELECT column_name FROM information_schema.columns
                       WHERE table_schema = :schema
                         AND table_name   = 'programs'
                         AND column_name  = :column
                       LIMIT 1`,
                    { replacements: { schema: lmsSchema, column }, type: QueryTypes.SELECT }
                );
                if (!rows.length) {
                    await sequelize.query(`ALTER TABLE ${lmsSchema}.programs ADD COLUMN IF NOT EXISTS ${ddl}`);
                    console.log(`🛠️  Added ${lmsSchema}.programs.${column}`);
                }
            };
            await ensureProgramCol('clg_ids', 'clg_ids JSONB');
            await ensureProgramCol('course_id', 'course_id INTEGER');
            await ensureProgramCol('course_ids', 'course_ids JSONB');
            await ensureProgramCol('batch_ids', 'batch_ids JSONB');
        } catch (e) {
            console.warn('[programs] column check failed:', e.message);
        }

        // Hot-path indexes (idempotent CREATE INDEX IF NOT EXISTS). Model
        // index definitions only materialise via .sync(), which boot skips
        // for existing tables — this guarantees the player/progress/paywall/
        // leaderboard lookups stay indexed at 5k-user scale. Best-effort.
        try {
            const { ensureIndexes } = require('./scripts/ensureIndexes');
            await ensureIndexes();
        } catch (e) {
            console.warn('[indexes] ensure failed:', e.message);
        }

        // lucy_devdb.colleges.isActive: per-school access toggle driven
        // from Manage Schools → Options → Revoke / Give Access. Default
        // TRUE so pre-existing rows stay accessible.
        try {
            const { QueryTypes } = require('sequelize');
            const authDb = require('./config/authDatabase');
            const authSchema = 'lucy_devdb';
            const rows = await authDb.query(
                `SELECT column_name FROM information_schema.columns
                   WHERE table_schema = :schema
                     AND table_name   = 'colleges'
                     AND column_name  = 'isActive'
                   LIMIT 1`,
                { replacements: { schema: authSchema }, type: QueryTypes.SELECT }
            );
            if (!rows.length) {
                await authDb.query(
                    `ALTER TABLE ${authSchema}.colleges ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE`
                );
                console.log(`🛠️  Added ${authSchema}.colleges.isActive`);
            }
        } catch (e) {
            console.warn('[colleges] isActive column check failed:', e.message);
        }
    })
    .then(start)
    .catch((err) => {
        console.warn('DB connection failed:', err.message);
        console.warn('Starting server anyway — list endpoints will return empty results until the DB is reachable.');
        start();
    });
