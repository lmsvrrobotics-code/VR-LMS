// Unit tests for authErrorMessage / authErrorField.
//
// The regression: the login page read only `response.data.message`, then fell
// through to `(err as Error).message`. Every backend here returns
// `{ error: "..." }`, so the useful text was one key over and the user was
// shown axios's literal "Request failed with status code 401" — an HTTP status
// code, presented to someone who had simply mistyped their password.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, authErrorField } from './authErrorMessage.ts';

const axiosError = (status, data) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });

// --- the actual reported bug -------------------------------------------------

test('a 401 never shows the raw axios status-code string', () => {
  const msg = authErrorMessage(axiosError(401, { error: 'Invalid credentials' }), 'login');
  assert.ok(!msg.includes('status code'), msg);
  assert.ok(!/\b401\b/.test(msg), msg);
});

test('a wrong password tells the user what to do', () => {
  const msg = authErrorMessage(axiosError(401, { error: 'Invalid credentials' }), 'login');
  assert.match(msg, /email or password/i);
});

test('a 401 with no body still produces a usable message', () => {
  // The old code fell back to Error.message here, which is the axios string.
  const msg = authErrorMessage(axiosError(401, undefined), 'login');
  assert.match(msg, /email or password/i);
});

// --- other statuses ----------------------------------------------------------

test('a 403 surfaces the server reason, which is the actionable part', () => {
  const msg = authErrorMessage(
    axiosError(403, { error: 'Profile not provisioned. Contact admin.' }),
    'login',
  );
  assert.match(msg, /Profile not provisioned/);
});

test('a 403 with no body still explains the situation', () => {
  assert.match(authErrorMessage(axiosError(403, {}), 'login'), /access/i);
});

test('a 404 says the account does not exist', () => {
  assert.match(authErrorMessage(axiosError(404, {}), 'login'), /No account/i);
});

test('a 429 tells the user to wait rather than to retry immediately', () => {
  assert.match(authErrorMessage(axiosError(429, {}), 'login'), /wait/i);
});

test('a 422 prefers the field-level message the server produced', () => {
  const msg = authErrorMessage(
    axiosError(422, { error: 'Email address is required.' }),
    'login',
  );
  assert.equal(msg, 'Email address is required.');
});

test('a 500 body is never shown to the user', () => {
  // It may carry internal detail, and nothing in it is actionable.
  const msg = authErrorMessage(
    axiosError(500, { error: 'ER_PARSE_ERROR near SELECT * FROM users' }),
    'login',
  );
  assert.ok(!msg.includes('SELECT'), msg);
  assert.match(msg, /our end/i);
});

test('the message reads both `error` and `message` keys', () => {
  // admin-service returns { error }, auth-service returns { message } on some
  // paths — the old login page only ever read `message`.
  assert.match(authErrorMessage(axiosError(422, { message: 'Bad input here.' })), /Bad input here/);
  assert.match(authErrorMessage(axiosError(422, { error: 'Other input.' })), /Other input/);
});

// --- no response at all ------------------------------------------------------

test('a network failure is not reported as bad credentials', () => {
  // Telling someone their password is wrong when the request never landed
  // sends them off resetting a password that was never checked.
  const msg = authErrorMessage(new Error('Network Error'), 'login');
  assert.match(msg, /connection/i);
  assert.ok(!/password/i.test(msg), msg);
});

test('a timeout is named as a timeout', () => {
  const err = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  assert.match(authErrorMessage(err, 'login'), /too long/i);
});

// --- mode awareness ----------------------------------------------------------

test('signup wording differs from login wording on a 401', () => {
  const login = authErrorMessage(axiosError(401, {}), 'login');
  const signup = authErrorMessage(axiosError(401, {}), 'signup');
  assert.notEqual(login, signup);
  assert.match(signup, /Sign up/i);
});

test('login is the default mode', () => {
  assert.equal(authErrorMessage(axiosError(401, {})), authErrorMessage(axiosError(401, {}), 'login'));
});

// --- field attribution -------------------------------------------------------

test('a 401 blames no single field', () => {
  // The server deliberately does not say which half was wrong, so highlighting
  // one input would be a guess presented as fact.
  assert.equal(authErrorField(axiosError(401, { error: 'Invalid credentials' })), null);
});

test('a 404 points at the email field', () => {
  assert.equal(authErrorField(axiosError(404, {})), 'email');
});

test('a 422 mentioning a field points at that field', () => {
  assert.equal(authErrorField(axiosError(422, { error: 'Email address is required.' })), 'email');
  assert.equal(authErrorField(axiosError(422, { error: 'Password is required.' })), 'password');
});

test('a network error blames no field', () => {
  assert.equal(authErrorField(new Error('Network Error')), null);
});
