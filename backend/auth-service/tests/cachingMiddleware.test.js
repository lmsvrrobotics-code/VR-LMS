/**
 * Regression tests for the shared route cache.
 *
 * These lock down a real, confirmed vulnerability: `GET /profile` was being
 * stored in a SHARED cache under the key `route:GET:/profile`, which contains no
 * user identity. The first caller populated it and everyone else received that
 * user's profile — including their role — for the next 5 minutes. A teacher
 * logging in was served a student's profile and landed on the student dashboard.
 *
 * The old guard was a deny-list (`req.path.includes('/auth/')`). It never
 * matched because the auth routes are mounted at the ROOT, making the live path
 * `/profile`. The test named "the exact bug" below fails against that old code.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { cacheMiddleware as rawCacheMiddleware } from '../src/cache/cachingMiddleware.js';

// In-process cache stub, injected via the middleware's `deps` parameter so these
// tests exercise the real logic without needing a Redis server.
const store = new Map();
let getCalls = [];
let setCalls = [];

const deps = {
  cacheGet: async (k) => { getCalls.push(k); return store.get(k) ?? null; },
  cacheSet: async (k, v) => { setCalls.push(k); store.set(k, v); },
};

// The production allow-list is intentionally EMPTY: every route this service
// exposes is authenticated or a mutation, so nothing is safely shareable. To
// verify the opt-in mechanism itself (and that isUserScoped still protects an
// opted-in route), tests inject a sample public path.
const SAMPLE_PUBLIC_PATH = '/public-sample';
const cacheMiddleware = (ttl) =>
  rawCacheMiddleware(ttl, { ...deps, cacheablePaths: new Set([SAMPLE_PUBLIC_PATH]) });

/** Middleware using the REAL production allow-list. */
const productionMiddleware = (ttl) => rawCacheMiddleware(ttl, deps);

/** Minimal express-ish req/res pair. */
function makeReqRes({ method = 'GET', path = '/', headers = {}, cookies = {}, user } = {}) {
  const req = { method, path, originalUrl: path, headers, cookies, user };
  const res = {
    statusCode: 200,
    _headers: {},
    _sent: null,
    getHeader(n) { return this._headers[n.toLowerCase()]; },
    setHeader(n, v) { this._headers[n.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(body) { this._sent = body; return this; },
  };
  return { req, res };
}

/** Run the middleware, then have the handler emit `body`. */
async function run(mw, reqRes, body) {
  let nexted = false;
  await mw(reqRes.req, reqRes.res, () => { nexted = true; });
  if (nexted && body !== undefined) reqRes.res.json(body);
  // The cache write is fire-and-forget inside res.json; yield so it settles
  // before assertions inspect setCalls.
  await new Promise((r) => setImmediate(r));
  return { nexted, sent: reqRes.res._sent };
}

test.beforeEach(() => { store.clear(); getCalls = []; setCalls = []; });

// ---------------------------------------------------------------------------
// The exact bug: a per-user profile must never be shared between users.
// ---------------------------------------------------------------------------
test("the exact bug: GET /profile is never served from a shared cache", async () => {
  const mw = cacheMiddleware(300);

  // Teacher requests their profile first.
  const teacher = makeReqRes({
    path: '/profile',
    headers: { authorization: 'Bearer teacher-token' },
  });
  await run(mw, teacher, { email: 'teacher@x.com', role: 'teacher' });

  // Nothing user-scoped may be written to the shared cache.
  assert.deepEqual(setCalls, [], 'profile response must not be cached');
  assert.equal(store.has('route:GET:/profile'), false);

  // Student requests their profile with a DIFFERENT token — must reach the
  // handler, not a cached teacher response.
  const student = makeReqRes({
    path: '/profile',
    headers: { authorization: 'Bearer student-token' },
  });
  const r = await run(mw, student, { email: 'student@x.com', role: 'student' });

  assert.equal(r.nexted, true, 'student request must reach the real handler');
  assert.equal(r.sent.role, 'student', 'student must NOT receive the teacher role');
  assert.equal(r.sent.email, 'student@x.com');
});

test("a poisoned pre-existing cache entry is not served to a user request", async () => {
  // Simulate an entry left over from the vulnerable version.
  store.set('route:GET:/profile', { status: 200, body: { email: 'victim@x.com', role: 'teacher' } });

  const mw = cacheMiddleware(300);
  const { req, res } = makeReqRes({
    path: '/profile',
    headers: { authorization: 'Bearer someone-else' },
  });
  const r = await run(mw, { req, res }, { email: 'me@x.com', role: 'student' });

  assert.equal(r.nexted, true, 'must bypass the stale entry entirely');
  assert.equal(r.sent.role, 'student');
  assert.equal(getCalls.length, 0, 'must not even read the shared cache for a user request');
});

// ---------------------------------------------------------------------------
// Allow-list behaviour
// ---------------------------------------------------------------------------
test("unknown paths are not cached (allow-list, not deny-list)", async () => {
  const mw = cacheMiddleware(300);
  for (const path of ['/profile', '/some-new-endpoint', '/login', '/roles', '/roles/list']) {
    setCalls = [];
    const rr = makeReqRes({ path });
    await run(mw, rr, { ok: true });
    assert.deepEqual(setCalls, [], `${path} must not be cached by default`);
  }
});

test("the REAL production allow-list caches nothing this service serves", async () => {
  // Guards against someone re-adding an authenticated route to CACHEABLE_PATHS.
  // Every path below is either per-user or behind isLoggedIn.
  const mw = productionMiddleware(300);
  for (const path of ['/profile', '/roles', '/roles/list', '/api/v1/auth/profile', '/api/v1/roles']) {
    setCalls = [];
    const rr = makeReqRes({ path });
    await run(mw, rr, { ok: true });
    assert.deepEqual(setCalls, [], `${path} must not be cached in production config`);
  }
});

test("an allow-listed public path IS cached when no identity is present", async () => {
  const mw = cacheMiddleware(300);

  const first = makeReqRes({ path: SAMPLE_PUBLIC_PATH });
  const r1 = await run(mw, first, [{ role: 'student' }]);
  assert.equal(r1.nexted, true);
  assert.deepEqual(setCalls, [`route:GET:${SAMPLE_PUBLIC_PATH}`]);

  // Second anonymous caller is served from cache without hitting the handler.
  const second = makeReqRes({ path: SAMPLE_PUBLIC_PATH });
  const r2 = await run(mw, second, undefined);
  assert.equal(r2.nexted, false, 'should be served from cache');
  assert.deepEqual(second.res._sent, [{ role: 'student' }]);
});

test("trailing slash does not bypass the allow-list check", async () => {
  const mw = cacheMiddleware(300);
  const rr = makeReqRes({ path: `${SAMPLE_PUBLIC_PATH}/` });
  await run(mw, rr, [{ role: 'student' }]);
  assert.deepEqual(
    setCalls, [`route:GET:${SAMPLE_PUBLIC_PATH}/`],
    'a single trailing slash still matches the allow-list');
});

// ---------------------------------------------------------------------------
// User-scope detection: any identity signal disables the shared cache.
// ---------------------------------------------------------------------------
test("an allow-listed path is NOT cached when the request carries identity", async () => {
  const mw = cacheMiddleware(300);

  const withAuth = makeReqRes({ path: SAMPLE_PUBLIC_PATH, headers: { authorization: 'Bearer t' } });
  await run(mw, withAuth, [{ role: 'x' }]);
  assert.deepEqual(setCalls, [], 'Authorization header must disable caching');

  setCalls = [];
  const withCookie = makeReqRes({ path: SAMPLE_PUBLIC_PATH, headers: { cookie: 'accessToken=abc' } });
  await run(mw, withCookie, [{ role: 'x' }]);
  assert.deepEqual(setCalls, [], 'Cookie header must disable caching');

  setCalls = [];
  const withCookieObj = makeReqRes({ path: SAMPLE_PUBLIC_PATH, cookies: { accessToken: 'abc' } });
  await run(mw, withCookieObj, [{ role: 'x' }]);
  assert.deepEqual(setCalls, [], 'parsed accessToken cookie must disable caching');
});

test("a response that sets a cookie is never cached", async () => {
  const mw = cacheMiddleware(300);
  const rr = makeReqRes({ path: SAMPLE_PUBLIC_PATH });
  let nexted = false;
  await mw(rr.req, rr.res, () => { nexted = true; });
  assert.equal(nexted, true);
  rr.res.setHeader('Set-Cookie', 'accessToken=abc');
  rr.res.json({ ok: true });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(setCalls, [], 'Set-Cookie means per-user — must not be stored');
});

test("req.user populated by later auth middleware still blocks the write", async () => {
  const mw = cacheMiddleware(300);
  const rr = makeReqRes({ path: SAMPLE_PUBLIC_PATH });
  let nexted = false;
  await mw(rr.req, rr.res, () => { nexted = true; });
  assert.equal(nexted, true);
  // An auth middleware downstream attaches the user before the handler responds.
  rr.req.user = { userId: 'u1', role: 'teacher' };
  rr.res.json({ ok: true });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(setCalls, [], 'write-time re-check must catch late req.user');
});

// ---------------------------------------------------------------------------
// General correctness
// ---------------------------------------------------------------------------
test("non-GET requests are never cached", async () => {
  const mw = cacheMiddleware(300);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    setCalls = [];
    const rr = makeReqRes({ method, path: SAMPLE_PUBLIC_PATH });
    await run(mw, rr, { ok: true });
    assert.deepEqual(setCalls, [], `${method} must not be cached`);
  }
});

test("non-200 responses are not cached", async () => {
  const mw = cacheMiddleware(300);
  const rr = makeReqRes({ path: SAMPLE_PUBLIC_PATH });
  let nexted = false;
  await mw(rr.req, rr.res, () => { nexted = true; });
  assert.equal(nexted, true);
  rr.res.status(500).json({ error: 'boom' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(setCalls, [], 'error responses must not be cached');
});
