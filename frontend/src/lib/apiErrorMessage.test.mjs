// Unit tests for apiErrorMessage().
//
// This guards the signup regression: a successful signup (HTTP 201) followed by
// a failed auto-login rendered "Something went wrong. Please try again." next to
// a form the user had already completed successfully. Part of that fix is
// showing the SERVER's message when there is one, and a caller-chosen fallback
// when there isn't — never a stringified object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage } from './apiErrorMessage.ts';

const FALLBACK = 'Could not create your account. Please try again.';

test('prefers response.data.error', () => {
  const err = { response: { data: { error: 'Email already registered' } } };
  assert.equal(apiErrorMessage(err, FALLBACK), 'Email already registered');
});

test('falls back to response.data.message', () => {
  const err = { response: { data: { message: 'Public sign-up is disabled.' } } };
  assert.equal(apiErrorMessage(err, FALLBACK), 'Public sign-up is disabled.');
});

test('error wins over message when both are present', () => {
  const err = { response: { data: { error: 'from error', message: 'from message' } } };
  assert.equal(apiErrorMessage(err, FALLBACK), 'from error');
});

// --- the shapes that used to leak junk to the user ---------------------------

test('non-string error falls through to the fallback', () => {
  // A backend returning `{ error: {} }` must not render "[object Object]".
  const err = { response: { data: { error: {} } } };
  assert.equal(apiErrorMessage(err, FALLBACK), FALLBACK);
});

test('null message falls through to the fallback', () => {
  const err = { response: { data: { message: null } } };
  assert.equal(apiErrorMessage(err, FALLBACK), FALLBACK);
});

test('empty and whitespace-only strings fall through', () => {
  assert.equal(apiErrorMessage({ response: { data: { error: '' } } }, FALLBACK), FALLBACK);
  assert.equal(apiErrorMessage({ response: { data: { error: '   ' } } }, FALLBACK), FALLBACK);
});

// --- errors that never reached the server ------------------------------------

test('network error (no response) uses the fallback', () => {
  assert.equal(apiErrorMessage(new Error('Network Error'), FALLBACK), FALLBACK);
});

test('undefined, null and plain strings use the fallback', () => {
  assert.equal(apiErrorMessage(undefined, FALLBACK), FALLBACK);
  assert.equal(apiErrorMessage(null, FALLBACK), FALLBACK);
  assert.equal(apiErrorMessage('boom', FALLBACK), FALLBACK);
});

test('response without data uses the fallback', () => {
  assert.equal(apiErrorMessage({ response: {} }, FALLBACK), FALLBACK);
});
