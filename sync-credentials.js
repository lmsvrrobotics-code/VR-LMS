/**
 * VR Robotics Academy — credential distributor.
 *
 * Reads credentials.env (the single source of truth) and writes each key
 * into the correct service .env files. Run after editing credentials.env:
 *
 *   node sync-credentials.js
 *
 * - Existing KEY=... lines are replaced in place.
 * - Missing KEY=... lines are appended.
 * - Empty values in credentials.env are SKIPPED (won't wipe a service's
 *   existing value), so you can fill keys incrementally.
 * - Frontend gets the VITE_-prefixed public keys only (never the service
 *   role key or DB URL).
 *
 * Pure Node — no dependencies.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'credentials.env');

if (!fs.existsSync(MASTER)) {
    console.error('ERROR: credentials.env not found at', MASTER);
    process.exit(1);
}

// --- Parse credentials.env into a {KEY: value} map -------------------------
const master = {};
for (const line of fs.readFileSync(MASTER, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) master[m[1]] = m[2];
}

// --- Which keys go to which services --------------------------------------
const ALL_BACKEND = [
    'backend/auth-service', 'backend/admin-service', 'backend/course-service',
    'backend/assessment-service', 'backend/college-service',
    'backend/organization-service', 'backend/payment-service',
];
const ALL_BACKEND_PLUS_BASTION = [...ALL_BACKEND, 'backend/Bastion-server'];

// key -> list of service dirs that should receive it
const ROUTING = {
    DATABASE_URL:               ALL_BACKEND,
    SUPABASE_URL:               ALL_BACKEND_PLUS_BASTION,
    SUPABASE_JWT_SECRET:        ALL_BACKEND_PLUS_BASTION,
    SUPABASE_ANON_KEY:          ['backend/auth-service', 'backend/admin-service'],
    SUPABASE_SERVICE_ROLE_KEY:  ['backend/auth-service', 'backend/admin-service'],

    R2_ACCOUNT_ID:              ['backend/admin-service'],
    R2_ACCESS_KEY_ID:           ['backend/admin-service'],
    R2_SECRET_ACCESS_KEY:       ['backend/admin-service'],
    R2_BUCKET_NAME:             ['backend/admin-service'],
    R2_PUBLIC_URL:              ['backend/admin-service'],

    BUNNY_STREAM_LIBRARY_ID:    ['backend/admin-service'],
    BUNNY_STREAM_API_KEY:       ['backend/admin-service'],
    BUNNY_STREAM_CDN_HOSTNAME:  ['backend/admin-service'],

    RAZORPAY_KEY_ID:            ['backend/payment-service'],
    RAZORPAY_KEY_SECRET:        ['backend/payment-service'],
    RAZORPAY_WEBHOOK_SECRET:    ['backend/payment-service'],

    REDIS_URL:                  ['backend/admin-service'],

    ROOT_ADMIN_EMAIL:           ['backend/admin-service'],

    SMTP_HOST:                  ['backend/admin-service'],
    SMTP_PORT:                  ['backend/admin-service'],
    SMTP_USER:                  ['backend/admin-service'],
    SMTP_PASS:                  ['backend/admin-service'],
    SMTP_FROM:                  ['backend/admin-service'],

    SENTRY_DSN:                 ALL_BACKEND_PLUS_BASTION,
    SENTRY_TRACES_SAMPLE_RATE:  ALL_BACKEND_PLUS_BASTION,

    // Browser origins allowed to make credentialed calls. admin-service reads
    // ADMIN_ALLOWED_ORIGINS (falling back to CORS_ORIGINS); Bastion reads
    // CORS_ORIGINS. Both must list the live frontend origin or the gateway's
    // preflight blocks every proxied call — see lib/corsPolicy.js.
    ADMIN_ALLOWED_ORIGINS:      ['backend/admin-service'],
    CORS_ORIGINS:               ALL_BACKEND_PLUS_BASTION,
};

// Frontend gets only public, VITE_-prefixed keys.
const FRONTEND_VITE = {
    VITE_SUPABASE_URL:          master.SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY:     master.SUPABASE_ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: master.SUPABASE_PUBLISHABLE_KEY,
    VITE_BASTION_API_URL:       master.VITE_BASTION_API_URL,
    VITE_ADMIN_API_URL:         master.VITE_ADMIN_API_URL,
    VITE_R2_PUBLIC_URL:         master.R2_PUBLIC_URL,
    VITE_BUNNY_STREAM_CDN_HOSTNAME: master.BUNNY_STREAM_CDN_HOSTNAME,
    VITE_BUNNY_STREAM_LIBRARY_ID:   master.BUNNY_STREAM_LIBRARY_ID,
    VITE_SENTRY_DSN:            master.SENTRY_DSN,
};

// --- Helpers ---------------------------------------------------------------
function setEnvKey(content, key, value) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) return content.replace(re, line);
    return content.trimEnd() + '\n' + line + '\n';
}

function patchEnvFile(absEnvPath, kv) {
    if (!fs.existsSync(absEnvPath)) {
        console.log(`  (skip, no .env) ${path.relative(ROOT, absEnvPath)}`);
        return 0;
    }
    let content = fs.readFileSync(absEnvPath, 'utf8');
    let n = 0;
    for (const [key, value] of Object.entries(kv)) {
        if (value === undefined || value === '') continue; // don't wipe with blanks
        content = setEnvKey(content, key, value);
        n++;
    }
    fs.writeFileSync(absEnvPath, content);
    return n;
}

// --- Build per-service key sets -------------------------------------------
const perService = {}; // dir -> {KEY: value}
for (const [key, dirs] of Object.entries(ROUTING)) {
    const value = master[key];
    if (value === undefined || value === '') continue;
    for (const dir of dirs) {
        (perService[dir] ||= {})[key] = value;
    }
}

// --- Apply -----------------------------------------------------------------
console.log('Distributing credentials.env -> service .env files\n');
let totalKeys = 0;
let filledServices = 0;

for (const [dir, kv] of Object.entries(perService)) {
    const abs = path.join(ROOT, dir, '.env');
    const n = patchEnvFile(abs, kv);
    if (n > 0) { console.log(`  ${dir}/.env  (${n} keys)`); filledServices++; totalKeys += n; }
}

// Frontend
const feAbs = path.join(ROOT, 'frontend', '.env');
const feN = patchEnvFile(feAbs, FRONTEND_VITE);
if (feN > 0) { console.log(`  frontend/.env  (${feN} keys)`); filledServices++; totalKeys += feN; }

console.log(`\nDone. Wrote ${totalKeys} key-writes across ${filledServices} files.`);

// --- Report what's still MISSING ------------------------------------------
const missing = [];
for (const key of Object.keys(ROUTING)) {
    if (master[key] === undefined || master[key] === '') missing.push(key);
}
for (const k of ['SUPABASE_PUBLISHABLE_KEY']) {
    if (!master[k]) missing.push(k);
}
if (missing.length) {
    console.log('\nSTILL MISSING in credentials.env (fill these to enable those features):');
    for (const k of missing) console.log('  - ' + k);
    console.log('\nSee CREDENTIALS.md for where to get each one + 5k-DAU priority.');
} else {
    console.log('\nAll keys present. ✔');
}
