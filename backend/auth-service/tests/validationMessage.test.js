// Unit tests for validationMessage() — the text a user reads in the login and
// sign-up forms when a field is rejected.
//
// It used to return `${field}: ${issue.message}`, producing "email: Invalid
// email address": the machine field name plus zod's terse text. Worse, a
// MISSING field produced "email: Invalid input: expected string, received
// undefined" — zod's internals rendered verbatim in the browser.
//
// These drive real ZodErrors rather than hand-built objects, so they stay
// honest across a zod upgrade (v4 dropped issue.received, which is exactly how
// the missing-field case regressed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { validationMessage } from '../src/controllers/auth.controller.js';

/** Parse `data` with `schema` and hand the resulting ZodError to the formatter. */
const messageFor = (schema, data) => {
  try {
    schema.parse(data);
  } catch (err) {
    return validationMessage(err);
  }
  throw new Error('the schema was expected to reject this input');
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// --- the messages users actually hit ----------------------------------------

test('a malformed email is explained with an example', () => {
  const msg = messageFor(loginSchema, { email: 'abc', password: 'x' });
  assert.match(msg, /^Email address/);
  assert.match(msg, /name@example\.com/);
});

test('a missing field says it is required, not zod internals', () => {
  // The v4 regression: "Invalid input: expected string, received undefined".
  const msg = messageFor(loginSchema, { password: 'x' });
  assert.equal(msg, 'Email address is required.');
  assert.ok(!msg.includes('expected string'), msg);
  assert.ok(!msg.includes('undefined'), msg);
});

test('an empty string is reported as required, not as too short', () => {
  const msg = messageFor(loginSchema, { email: 'a@b.com', password: '' });
  assert.match(msg, /required/i);
});

test('a real minimum length is stated as a number', () => {
  const schema = z.object({ password: z.string().min(8) });
  assert.match(messageFor(schema, { password: 'abc' }), /at least 8 characters/);
});

test('a maximum length is stated as a number', () => {
  const schema = z.object({ name: z.string().max(3) });
  assert.match(messageFor(schema, { name: 'abcdef' }), /3 characters or fewer/);
});

test('an enum lists the values that are allowed', () => {
  const schema = z.object({ gender: z.enum(['male', 'female']) });
  const msg = messageFor(schema, { gender: 'x' });
  assert.match(msg, /Gender/);
  assert.match(msg, /male, female/);
});

// --- field naming ------------------------------------------------------------

test('no message exposes a raw machine field name', () => {
  const msg = messageFor(loginSchema, { email: 'abc', password: 'x' });
  assert.ok(!msg.startsWith('email:'), msg);
});

test('a camelCase field is split into words', () => {
  const schema = z.object({ graduationYear: z.string().min(4) });
  const msg = messageFor(schema, { graduationYear: 'x' });
  assert.match(msg, /^Graduation year/);
});

test('a known field uses the label the form shows', () => {
  const schema = z.object({ confirmPassword: z.string().min(8) });
  assert.match(messageFor(schema, { confirmPassword: 'x' }), /^Confirm password/);
});

// --- degenerate input --------------------------------------------------------

test('an error with no issues still yields a usable sentence', () => {
  const msg = validationMessage({ issues: [] });
  assert.match(msg, /check the details/i);
  assert.ok(!msg.includes('undefined'), msg);
});

test('a null error does not throw', () => {
  assert.equal(typeof validationMessage(null), 'string');
});
