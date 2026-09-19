// Unit tests for auth-service's CORS origin policy.
//
// These guard a real production incident: auth-service's allowlist did not
// include the deployed frontend origin, and the old code ended with
//   return cb(new Error('Not allowed by CORS'));
// Passing an Error makes the cors package throw, which Express renders as a
// 500 with an HTML error page. So every BROWSER login returned "500 Internal
// Server Error" while curl — which sends no Origin header — returned 200. The
// actual cause (an unlisted origin) appeared nowhere in the response body,
// status, or logs, and the symptom pointed at a backend crash instead of a
// one-line config gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAllowedOrigins,
    isAllowedOrigin,
    corsOrigin,
} from '../src/lib/corsPolicy.js';

// --- parsing ----------------------------------------------------------------

test('parseAllowedOrigins: splits, trims and drops empties', () => {
    const env = { CORS_ORIGINS: ' https://a.com , https://b.com ,, ' };
    assert.deepEqual(parseAllowedOrigins(env), ['https://a.com', 'https://b.com']);
});

test('parseAllowedOrigins: falls back to ALLOWED_ORIGINS', () => {
    assert.deepEqual(parseAllowedOrigins({ ALLOWED_ORIGINS: 'https://c.com' }), ['https://c.com']);
});

test('parseAllowedOrigins: CORS_ORIGINS wins over ALLOWED_ORIGINS', () => {
    const env = { CORS_ORIGINS: 'https://a.com', ALLOWED_ORIGINS: 'https://c.com' };
    assert.deepEqual(parseAllowedOrigins(env), ['https://a.com']);
});

test('parseAllowedOrigins: unset yields an empty allowlist (fail closed)', () => {
    assert.deepEqual(parseAllowedOrigins({}), []);
});

// --- the allow decision -----------------------------------------------------

test('no Origin header is allowed (curl, server-to-server, same-origin)', () => {
    assert.equal(isAllowedOrigin(undefined, [], true), true);
});

test('an allowlisted origin is allowed in production', () => {
    const allowed = ['https://vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('https://vrroboticsacademy.com', allowed, true), true);
});

test('an unlisted origin is rejected in production', () => {
    const allowed = ['https://vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('https://evil.com', allowed, true), false);
});

// Substring/suffix confusion must not grant access.
test('lookalike origins are rejected', () => {
    const allowed = ['https://vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('https://evil-vrroboticsacademy.com', allowed, true), false);
    assert.equal(isAllowedOrigin('https://vrroboticsacademy.com.evil.com', allowed, true), false);
});

test('scheme must match exactly — http is not https', () => {
    const allowed = ['https://vrroboticsacademy.com'];
    assert.equal(isAllowedOrigin('http://vrroboticsacademy.com', allowed, true), false);
});

test('localhost is allowed in dev but NOT in production', () => {
    assert.equal(isAllowedOrigin('http://localhost:8080', [], false), true);
    assert.equal(isAllowedOrigin('http://127.0.0.1:5173', [], false), true);
    assert.equal(isAllowedOrigin('http://localhost:8080', [], true), false);
});

// --- the callback contract --------------------------------------------------
//
// The heart of the incident: a rejection must be a DECLINE, not a thrown
// Error. If these fail, browsers get a 500 HTML page instead of a clean CORS
// block and the misdiagnosis repeats.

test('corsOrigin DECLINES an unlisted origin — never passes an Error', () => {
    const cb = corsOrigin(['https://vrroboticsacademy.com'], true);
    cb('https://evil.com', (err, allow) => {
        assert.equal(err, null, 'must not pass an Error — that renders as a 500');
        assert.equal(allow, false);
    });
});

test('corsOrigin allows an allowlisted origin', () => {
    const cb = corsOrigin(['https://vrroboticsacademy.com'], true);
    cb('https://vrroboticsacademy.com', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
    });
});

test('corsOrigin with an EMPTY allowlist still declines rather than throwing', () => {
    // The exact production state that produced the 500s: no CORS_ORIGINS set.
    const cb = corsOrigin([], true);
    cb('https://vrroboticsacademy.com', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, false);
    });
});
