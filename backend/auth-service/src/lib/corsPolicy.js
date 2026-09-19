// Which browser origins auth-service accepts.
//
// Extracted from app.js so the decision is a pure function that can be unit
// tested without booting Express. Mirrors admin-service/src/lib/corsPolicy.js
// in shape and, critically, in one behaviour: a disallowed origin is DECLINED,
// never thrown.
//
// Why that matters: the previous inline version ended with
//   return cb(new Error('Not allowed by CORS'));
// which makes the cors package throw. Express renders that as a 500 with an
// HTML error page, so a routine policy decision looked like a server crash.
// In production it meant every browser login returned "500 Internal Server
// Error" while curl — which sends no Origin header — returned 200. The real
// cause (the deployed frontend origin was missing from CORS_ORIGINS) appeared
// nowhere in the response or the logs.

/**
 * Parse the comma-separated origin allowlist.
 *
 * Reads CORS_ORIGINS first, then ALLOWED_ORIGINS. Both names are accepted
 * because historically shipped .env files used the latter; reading only one
 * caused a silent production lockout.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string[]} trimmed, non-empty origins
 */
function parseAllowedOrigins(env = process.env) {
    return (env.CORS_ORIGINS || env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Decide whether an Origin may make credentialed cross-origin requests.
 *
 * @param {string|undefined} origin  the request's Origin header
 * @param {string[]} allowed         allowlist from parseAllowedOrigins()
 * @param {boolean} isProduction     NODE_ENV === 'production'
 * @returns {boolean}
 */
function isAllowedOrigin(origin, allowed, isProduction) {
    if (!origin) return true; // same-origin / curl / mobile apps send no Origin

    // Blanket localhost trust is a dev-only convenience. Deployed, it would let
    // any page served from loopback on the host (or a co-located container)
    // make credentialed cross-origin calls to auth.
    if (!isProduction && LOCALHOST_RE.test(origin)) return true;

    return allowed.includes(origin);
}

/**
 * Build the `origin` callback for the cors() middleware.
 *
 * Always calls back with (null, boolean) — never an Error. See the file header
 * for why passing an Error is a trap.
 *
 * @param {string[]} allowed
 * @param {boolean} isProduction
 * @returns {(origin: string|undefined, cb: Function) => void}
 */
function corsOrigin(allowed, isProduction) {
    return (origin, cb) => cb(null, isAllowedOrigin(origin, allowed, isProduction));
}

export { parseAllowedOrigins, isAllowedOrigin, corsOrigin, LOCALHOST_RE };
