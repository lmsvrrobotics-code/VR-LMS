// Unit tests for the client-side field validators.
//
// These must agree with backend/admin-service/src/lib/fieldValidation.js — a
// user should see the same wording whichever side catches the mistake. Two
// concrete regressions are guarded here:
//
//   1. RegisterForm checked `!email.trim()` only, so "abc" was submitted and
//      created an account with an unreachable address.
//   2. PreAssessmentOnboardingModal's regex had lost its backslashes —
//      /^[^s@]+@[^s@]+\.[^s@]+$/ reads as "any char except the LETTER s", so
//      "a b@c d.e" validated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail, validateName, validatePassword, validatePhone, validateConfirm,
  errorField,
} from './fieldValidation.ts';

// --- email ------------------------------------------------------------------

test('a bare word is rejected with an actionable message', () => {
  const err = validateEmail('abc');
  assert.ok(err);
  assert.match(err, /@ sign/);
  assert.match(err, /name@example\.com/);
});

test('addresses with spaces are rejected', () => {
  assert.ok(validateEmail('a b@c.com'));
  assert.ok(validateEmail('a b@c d.com'));
});

test('a missing domain ending is rejected', () => {
  assert.match(validateEmail('user@localhost'), /domain ending/);
});

test('consecutive dots are rejected', () => {
  assert.ok(validateEmail('a@b..c'));
});

test('a hyphen-edged domain is rejected', () => {
  assert.ok(validateEmail('a@-example.com'));
  assert.ok(validateEmail('a@example-.com'));
});

test('a missing local or domain part names which half is missing', () => {
  assert.match(validateEmail('@example.com'), /before the @/);
  assert.match(validateEmail('user@'), /after the @/);
});

test('valid addresses return null', () => {
  for (const addr of [
    'user@example.com',
    'first.last@example.co.in',
    'user+tag@example.org',
    'u@ex.io',
  ]) {
    assert.equal(validateEmail(addr), null, `${addr} must be accepted`);
  }
});

test('an empty email is required by default and optional on request', () => {
  assert.ok(validateEmail(''));
  assert.equal(validateEmail('', { required: false }), null);
});

test('the label is used verbatim so the message matches the form', () => {
  assert.match(validateEmail('abc', { label: 'Work email' }), /^Work email/);
});

// --- name -------------------------------------------------------------------

test('a name with digits is rejected', () => {
  assert.match(validateName('John3'), /numbers/);
});

test('real names are accepted', () => {
  for (const n of ["O'Brien", 'Anne-Marie', 'J. Smith', 'José']) {
    assert.equal(validateName(n), null, `${n} must be accepted`);
  }
});

// --- password ---------------------------------------------------------------

test('a short password states the minimum', () => {
  assert.match(validatePassword('abc'), /at least 8 characters/);
});

test('a password missing a number or a letter says which', () => {
  assert.match(validatePassword('abcdefghij'), /number/);
  assert.match(validatePassword('12345678'), /letter/);
});

test('a valid password returns null', () => {
  assert.equal(validatePassword('robotics2026'), null);
});

// --- phone ------------------------------------------------------------------

test('an Indian mobile is accepted in the formats people type', () => {
  for (const p of ['9876543210', '+91 98765 43210', '098765-43210']) {
    assert.equal(validatePhone(p), null, `${p} must be accepted`);
  }
});

test('a wrong-length or wrong-prefix number is rejected with the rule', () => {
  assert.match(validatePhone('98765'), /10 digits/);
  assert.match(validatePhone('1234567890'), /6, 7, 8 or 9/);
});

// --- confirm password -------------------------------------------------------

test('a mismatched confirmation is reported', () => {
  assert.match(validateConfirm('abc12345', 'abc12346'), /do not match/);
});

test('a matching confirmation returns null', () => {
  assert.equal(validateConfirm('abc12345', 'abc12345'), null);
});

test('an empty confirmation asks for a re-entry rather than a mismatch', () => {
  assert.match(validateConfirm('abc12345', ''), /re-enter/i);
});

// --- errorField -------------------------------------------------------------

test('the server-named field is extracted so the form can highlight it', () => {
  const err = { response: { data: { error: 'Email address is required.', field: 'email' } } };
  assert.equal(errorField(err), 'email');
});

test('a response without a field yields null rather than undefined noise', () => {
  assert.equal(errorField({ response: { data: { error: 'boom' } } }), null);
  assert.equal(errorField(new Error('network')), null);
  assert.equal(errorField(undefined), null);
});

test('a non-string field is ignored', () => {
  assert.equal(errorField({ response: { data: { field: 42 } } }), null);
});
