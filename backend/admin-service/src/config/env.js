require('dotenv').config();

// --- Secret hardening guard -------------------------------------------------
// A weak or default JWT secret means anyone can forge admin tokens. Refuse to
// boot in production with the insecure default or a too-short secret; warn
// loudly in dev so it gets fixed before deploy. (.env is gitignored.)
(() => {
    const NODE_ENV = process.env.NODE_ENV || 'development';
    const secret = process.env.JWT_SECRET || '';
    const INSECURE = ['', 'change-me-in-production', 'change-me-access', 'secret', 'changeme'];
    const weak = INSECURE.includes(secret) || secret.length < 24;
    if (weak) {
        const msg = 'JWT_SECRET is missing, default, or too short (<24 chars). '
            + 'Set a long random JWT_SECRET in .env (e.g. `openssl rand -base64 48`).';
        if (NODE_ENV === 'production') {
            throw new Error(`[FATAL] ${msg}`); // never run a payable product on a forgeable secret
        }
        console.warn(`\n⚠️  [SECURITY] ${msg}\n`);
    }
    if (!process.env.SUPABASE_JWT_SECRET && NODE_ENV === 'production') {
        throw new Error('[FATAL] SUPABASE_JWT_SECRET is required to verify student/teacher tokens.');
    }
})();

module.exports = {
    // ADMIN_SERVICE_PORT wins over PORT so this service can share a container
    // with the gateway. Railway injects one PORT per container and only the
    // public process (Bastion) may bind it; without this, whichever of the two
    // started second would die with EADDRINUSE. Matches the localhost:5000
    // default in Bastion's serviceMap.
    port: Number(process.env.ADMIN_SERVICE_PORT || process.env.PORT || 5000),
    env: process.env.NODE_ENV || 'development',
    appUrl: process.env.APP_URL || 'http://localhost:5000',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    jwt: {
        secret: process.env.JWT_SECRET || 'change-me-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    // Primary DB handle — points at the `lms_admin` schema in Supabase
    // Postgres. `url` (DATABASE_URL) wins if set; otherwise we fall back to
    // discrete host/port/user/pass for legacy local dev.
    db: {
        url: process.env.DATABASE_URL || null,
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        pass: process.env.DB_PASS,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        schema: process.env.DB_SCHEMA || 'lms_admin',
    },
    // Cross-schema handle — same physical Supabase Postgres DB, different
    // schema (`lucy_devdb`). Used by School Dashboard + StudentService.
    authDb: {
        url: process.env.DATABASE_URL || process.env.AUTH_DATABASE_URL || null,
        name: process.env.AUTH_DB_NAME || process.env.DB_NAME,
        user: process.env.DB_USER,
        pass: process.env.DB_PASS,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        schema: process.env.AUTH_DB_SCHEMA || 'lucy_devdb',
    },
    // Read-only handle to assessment-service's tables. In Supabase Postgres
    // these live in the same `lucy_devdb` schema, so this defaults to the
    // same DB/schema as authDb. Kept as a separate config slot so we can
    // re-point it (e.g. to a separate Supabase project) without code changes.
    assessmentDb: {
        url: process.env.DATABASE_URL || process.env.ASSESSMENT_DATABASE_URL || null,
        name: process.env.ASSESSMENT_DB_NAME || process.env.DB_NAME,
        user: process.env.DB_USER,
        pass: process.env.DB_PASS,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        schema: process.env.ASSESSMENT_DB_SCHEMA || 'lucy_devdb',
    },
    // Supabase client config (server-side). The service_role key is
    // privileged — only ever used inside admin-service for admin user
    // management (createUser / updateUserById / deleteUser). Never expose
    // it to the frontend or log it.
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        jwtSecret: process.env.SUPABASE_JWT_SECRET,
    },
    // Cloudflare R2 (S3-compatible) — stores PDFs, images, thumbnails,
    // attachments, certificates, exports. Public URL is the worker / custom
    // domain that fronts the bucket; assets are referenced in DB by URL.
    r2: {
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET_NAME,
        publicUrl: process.env.R2_PUBLIC_URL,
    },
    // Bunny Stream — stores course/lesson videos. Returns video GUIDs;
    // playback URLs are constructed from the CDN hostname + GUID.
    bunnyStream: {
        libraryId: process.env.BUNNY_STREAM_LIBRARY_ID,
        apiKey: process.env.BUNNY_STREAM_API_KEY,
        cdnHostname: process.env.BUNNY_STREAM_CDN_HOSTNAME,
        // Pull-zone "URL Token Authentication" key (Bunny dashboard → pull zone
        // → Security). When set, playback URLs are signed with a short-lived
        // token so a leaked/shared video URL stops working after it expires.
        // Inert when unset — playback URLs are returned unsigned (today's behaviour).
        tokenKey: process.env.BUNNY_STREAM_TOKEN_KEY || '',
    },
    mail: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM,
        lmsLoginUrl: process.env.LMS_LOGIN_URL || 'http://localhost:5173/login',
    },
    internalSecret: process.env.INTERNAL_API_SECRET || '',
    // Razorpay payments. keyId is safe to expose to the browser (checkout needs
    // it); keySecret + webhookSecret stay server-side. All from .env — nothing
    // hardcoded. Endpoints degrade to 503 "not configured" when keySecret is
    // missing, so the app runs fine before keys are added.
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || '',
        keySecret: process.env.RAZORPAY_KEY_SECRET || '',
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
};
