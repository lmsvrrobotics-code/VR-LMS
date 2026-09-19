// Unit tests for the CORS origin allowlist. Pure functions, no DB, no network
// — run with: npm test
//
// These guard a real production incident: the deployed allowlist held
// `lms-vrobotics.workers.dev` while the frontend was served from
// `lms-vrrobotics.workers.dev` (one extra 'r'). Every browser API call was
// rejected, and because the old code threw on a disallowed origin the symptom
// was a 500 "Unhandled server error" with a stack trace rather than a CORS
// message — so the config typo looked like a backend crash.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseAllowedOrigins,
    isAllowedOrigin,
    corsOrigin,
    ALLOWED_HEADERS,
} = require('../src/lib/corsPolicy');

// --- parsing ----------------------------------------------------------------

test('parseAllowedOrigins: splits, trims and drops empties', () => {
    const env = { ADMIN_ALLOWED_ORIGINS: ' https://a.com , https://b.com ,, ' };
    assert.deepEqual(parseAllowedOrigins(env), ['https://a.com', 'https://b.com']);
});

test('parseAllowedOrigins: falls back to CORS_ORIGINS', () => {
    assert.deepEqual(parseAllowedOrigins({ CORS_ORIGINS: 'https://c.com' }), ['https://c.com']);
});

test('parseAllowedOrigins: ADMIN_ALLOWED_ORIGINS wins over CORS_ORIGINS', () => {
    const env = { ADMIN_ALLOWED_ORIGINS: 'https://a.com', CORS_ORIGINS: 'https://c.com' };
    assert.deepEqual(parseAllowedOrigins(env), ['https://a.com']);
});

test('parseAllowedOrigins: unset yields an empty allowlist (fail closed)', () => {
    assert.deepEqual(parseAllowedOrigins({}), []);
});

// --- the allow decision -----------------------------------------------------

test('isAllowedOrigin: no Origin header is allowed (curl, server-to-server)', () => {
    assert.equal(isAllowedOrigin(undefined, []), true);
});

test('isAllowedOrigin: an allowlisted origin is allowed', () => {
    const allowed = ['https://vr-lms.lms-vrrobotics.workers.dev'];
    assert.equal(isAllowedOrigin('https://vr-lms.lms-vrrobotics.workers.dev', allowed), true);
});

test('isAllowedOrigin: localhost is allowed on any port, with or without TLS', () => {
    for (const o of ['http://localhost:8080', 'http://localhost', 'https://127.0.0.1:5173']) {
        assert.equal(isAllowedOrigin(o, []), true, o);
    }
});

test('isAllowedOrigin: an unknown origin is rejected', () => {
    assert.equal(isAllowedOrigin('https://evil.example.com', ['https://a.com']), false);
});

// The actual outage: a single transposed character must not be treated as a
// match, and the allowlist must be exact rather than substring-based.
test('isAllowedOrigin: a near-miss hostname is rejected (the vrobotics/vrrobotics typo)', () => {
    const allowed = ['https://vr-lms.lms-vrrobotics.workers.dev'];
    assert.equal(isAllowedOrigin('https://vr-lms.lms-vrobotics.workers.dev', allowed), false);
});

test('isAllowedOrigin: matching is exact — no substring or suffix matches', () => {
    const allowed = ['https://app.vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('https://evil-app.vrroboticsacademy.com', allowed), false);
    assert.equal(isAllowedOrigin('https://app.vrroboticsacademy.com.evil.com', allowed), false);
});

test('isAllowedOrigin: scheme must match — http is not https', () => {
    assert.equal(isAllowedOrigin('http://app.vrroboticsacademy.com', ['https://app.vrroboticsacademy.com']), false);
});

test('isAllowedOrigin: an empty allowlist rejects every non-local origin', () => {
    assert.equal(isAllowedOrigin('https://a.com', []), false);
});

// The production allowlist as shipped in credentials.env. The apex and www are
// DISTINCT origins to a browser, so serving the site at www with only the apex
// allowlisted blocks every API call — the same class of failure as the
// vrobotics typo above, just harder to spot.
test('isAllowedOrigin: apex, www and the workers.dev fallback are all allowed', () => {
    const allowed = [
        'https://vrroboticsacademy.com',
        'https://www.vrroboticsacademy.com',
        'https://vr-lms.lms-vrrobotics.workers.dev',
    ];
    assert.equal(isAllowedOrigin('https://vrroboticsacademy.com', allowed), true);
    assert.equal(isAllowedOrigin('https://www.vrroboticsacademy.com', allowed), true);
    assert.equal(isAllowedOrigin('https://vr-lms.lms-vrrobotics.workers.dev', allowed), true);
});

test('isAllowedOrigin: www is not implied by the apex', () => {
    const apexOnly = ['https://vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('https://www.vrroboticsacademy.com', apexOnly), false);
});

// assets.vrroboticsacademy.com serves R2 objects over plain GETs; it is never a
// browser *origin* issuing credentialed calls, so it must not be allowlisted.
test('isAllowedOrigin: the R2 asset host is not a permitted API origin', () => {
    const allowed = ['https://vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('https://assets.vrroboticsacademy.com', allowed), false);
});

// --- the middleware callback (the 500-vs-clean-rejection regression) ---------

test('corsOrigin: declines without throwing so Express does not 500', () => {
    const cb = corsOrigin(['https://a.com']);
    let err = 'unset';
    let allow = 'unset';
    cb('https://evil.example.com', (e, a) => { err = e; allow = a; });
    // The regression: passing an Error here makes cors() throw → 500.
    assert.equal(err, null);
    assert.equal(allow, false);
});

test('corsOrigin: allows an allowlisted origin', () => {
    const cb = corsOrigin(['https://a.com']);
    let err = 'unset';
    let allow = 'unset';
    cb('https://a.com', (e, a) => { err = e; allow = a; });
    assert.equal(err, null);
    assert.equal(allow, true);
});

test('corsOrigin: never passes an Error for any input', () => {
    const cb = corsOrigin([]);
    for (const o of [undefined, '', 'https://a.com', 'not-a-url', 'null']) {
        cb(o, (e) => assert.equal(e, null, `origin ${JSON.stringify(o)} must not error`));
    }
});

// --- allowed request headers ------------------------------------------------
// A header missing from this list fails at preflight ("Request header field <x>
// is not allowed by Access-Control-Allow-Headers") and the request never
// reaches a route. The student dashboard broke exactly this way.

test('ALLOWED_HEADERS: carries the auth + content basics', () => {
    assert.ok(ALLOWED_HEADERS.includes('Content-Type'));
    assert.ok(ALLOWED_HEADERS.includes('Authorization'));
});

test('ALLOWED_HEADERS: includes Cache-Control (polled dashboard endpoints)', () => {
    assert.ok(ALLOWED_HEADERS.includes('Cache-Control'));
});

test('ALLOWED_HEADERS: includes x-user-id (legacy /api/public clients)', () => {
    assert.ok(ALLOWED_HEADERS.includes('x-user-id'));
});

// Browsers lowercase header names in Access-Control-Request-Headers, and the
// cors package compares case-insensitively. This asserts the list has no
// duplicate-by-case entries that would signal a careless merge.
test('ALLOWED_HEADERS: no case-insensitive duplicates', () => {
    const lower = ALLOWED_HEADERS.map((h) => h.toLowerCase());
    assert.equal(new Set(lower).size, lower.length);
});
