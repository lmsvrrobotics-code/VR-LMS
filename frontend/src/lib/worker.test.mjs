// Unit tests for the Cloudflare Worker's routing decision (frontend/worker.js).
//
// The Worker is what makes the whole app one origin: it serves the SPA and
// proxies /api/* to the Bastion gateway. Getting the split wrong fails in two
// expensive ways that are invisible until deploy:
//
//   - an /api/* path treated as an asset  → the SPA's index.html is returned
//     with status 200, so callers get HTML where they expect JSON
//   - an SPA path treated as /api         → deep links 404 from the gateway
//
// routeFor() is a pure function over the URL, so these run with no Workers
// runtime, no network and no build step — `npm test` in frontend/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeFor } from '../../worker.js';

const APEX = 'https://vrroboticsacademy.com';

// --- /api goes to the gateway -----------------------------------------------

test('routeFor: /api/* is proxied to Bastion', () => {
  assert.equal(routeFor(`${APEX}/api/public/leaderboard`).kind, 'proxy');
  assert.equal(routeFor(`${APEX}/api/admin/courses`).kind, 'proxy');
  assert.equal(routeFor(`${APEX}/api/v1/auth/login`).kind, 'proxy');
});

test('routeFor: bare /api is proxied', () => {
  assert.equal(routeFor(`${APEX}/api`).kind, 'proxy');
});

test('routeFor: query strings do not affect the decision', () => {
  assert.equal(routeFor(`${APEX}/api/admin/courses?page=2`).kind, 'proxy');
});

// --- everything else is the SPA ---------------------------------------------

test('routeFor: app routes are served as assets', () => {
  assert.equal(routeFor(`${APEX}/`).kind, 'asset');
  assert.equal(routeFor(`${APEX}/admin/feedback`).kind, 'asset');
  assert.equal(routeFor(`${APEX}/student/my-courses`).kind, 'asset');
});

// Guards the startsWith('/api') mistake: these paths merely BEGIN with "api"
// and must stay on the SPA, or the routes silently break after deploy.
test('routeFor: paths that only start with "api" are NOT proxied', () => {
  assert.equal(routeFor(`${APEX}/apidocs`).kind, 'asset');
  assert.equal(routeFor(`${APEX}/api-reference`).kind, 'asset');
  assert.equal(routeFor(`${APEX}/apiary`).kind, 'asset');
});

// --- www → apex canonicalisation --------------------------------------------

test('routeFor: www redirects to the apex', () => {
  const r = routeFor('https://www.vrroboticsacademy.com/');
  assert.equal(r.kind, 'redirect');
  assert.equal(r.location, 'https://vrroboticsacademy.com/');
});

test('routeFor: www redirect preserves path and query', () => {
  const r = routeFor('https://www.vrroboticsacademy.com/admin/feedback?tab=stats');
  assert.equal(r.kind, 'redirect');
  assert.equal(r.location, 'https://vrroboticsacademy.com/admin/feedback?tab=stats');
});

// The redirect is checked BEFORE the /api split, so a www API call is sent to
// the apex rather than proxied from the wrong host. A cross-host proxy would
// reintroduce the exact cross-origin problem this Worker exists to remove.
test('routeFor: www /api redirects rather than proxying', () => {
  const r = routeFor('https://www.vrroboticsacademy.com/api/public/leaderboard');
  assert.equal(r.kind, 'redirect');
  assert.equal(r.location, 'https://vrroboticsacademy.com/api/public/leaderboard');
});

test('routeFor: apex is not treated as a www host', () => {
  assert.notEqual(routeFor(`${APEX}/`).kind, 'redirect');
});
