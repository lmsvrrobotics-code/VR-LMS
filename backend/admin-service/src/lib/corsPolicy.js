// Which browser origins admin-service accepts. Extracted from server.js so the
// decision is a pure function that can be unit-tested without booting Express
// or touching the DB — the inline closure it replaced could only be exercised
// by a live HTTP request against a deployed instance.
//
// Mirrors Bastion's src/utils/cors.js in shape and in one important behaviour:
// a disallowed origin is DECLINED, never thrown (see corsOrigin below).

/**
 * Parse a comma-separated origin allowlist from the environment.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string[]} trimmed, non-empty origins
 */
function parseAllowedOrigins(env = process.env) {
    return (env.ADMIN_ALLOWED_ORIGINS || env.CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

// localhost/127.0.0.1 on any port, http or https. Always permitted so `npm run
// dev` works without env vars. Note this is deliberately NOT the private-LAN
// wildcard Bastion allows in dev — admin-service is the credentialed public
// API, so the dev convenience stays as narrow as possible.
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Request headers the browser may send cross-origin. Kept in sync with
// Bastion's bastionAllowedHeaders (Bastion-server/src/utils/cors.js): the
// gateway's preflight response is the one the browser sees for proxied calls,
// so a header allowed here but not there is still blocked. Listing them in both
// places keeps admin-service correct when called directly too.
//
//   Cache-Control — student dashboard clients send `no-cache` on polled
//                   endpoints (my-assignments, my-classes).
//   x-user-id     — legacy student identity header. NOT a trust boundary:
//                   server.js overwrites it from the verified JWT before any
//                   controller reads it, so allowing it grants no authority.
const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'Cache-Control', 'x-user-id'];

/**
 * Decide whether an Origin may make credentialed cross-origin requests.
 *
 * @param {string|undefined} origin  the request's Origin header
 * @param {string[]} allowed         allowlist from parseAllowedOrigins()
 * @returns {boolean}
 */
function isAllowedOrigin(origin, allowed) {
    if (!origin) return true; // same-origin / curl / mobile apps send no Origin
    if (LOCALHOST_RE.test(origin)) return true;
    return allowed.includes(origin);
}

/**
 * Build the `origin` callback for the cors() middleware.
 *
 * Declines with `cb(null, false)` rather than `cb(new Error(...))`. Passing an
 * Error makes the cors package throw, which Express renders as a 500 with a
 * stack trace and an "Unhandled server error" log line. That misreports a
 * routine, expected policy decision as a server fault: during a deploy it sent
 * us hunting a backend crash when the real cause was a one-character typo in
 * the allowlisted hostname. Declining instead omits the
 * Access-Control-Allow-Origin header, which is exactly what CORS specifies —
 * the browser blocks the response, the server stays quiet, and the failure
 * reads as the configuration problem it is.
 *
 * @param {string[]} allowed
 * @returns {(origin: string|undefined, cb: Function) => void}
 */
function corsOrigin(allowed) {
    return (origin, cb) => cb(null, isAllowedOrigin(origin, allowed));
}

module.exports = {
    parseAllowedOrigins,
    isAllowedOrigin,
    corsOrigin,
    ALLOWED_HEADERS,
    LOCALHOST_RE,
};
