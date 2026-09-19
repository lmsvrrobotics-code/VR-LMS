// Tests for the joi -> user-facing message translation in lib/validators, and
// for HttpError carrying the field it blames.
//
// The bug: validateBody returned { error: 'Validation failed', details: [...] }.
// The frontend's apiErrorMessage reads `error` first, so a user who mistyped
// their email was shown the literal words "Validation failed" — no field, no
// reason, nothing to act on. The per-field detail was right there in `details`
// and never surfaced.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const joi = require('joi');

const { validate, validationResponse, humanMessage } = require('../src/lib/validators');
const { HttpError } = require('../src/middlewares/error');

const failOn = (schema, data) => {
    const { error } = validate(data, schema);
    assert.ok(error, 'the schema was expected to reject this input');
    return validationResponse(error);
};

// --- the top-level `error` key carries the real reason ----------------------

test('the error key states the actual problem, not "Validation failed"', () => {
    const body = failOn(joi.object({ email: joi.string().email().required() }), { email: 'abc' });
    assert.notEqual(body.error, 'Validation failed');
    assert.match(body.error, /valid email/);
});

test('the response names the field at fault', () => {
    const body = failOn(joi.object({ email: joi.string().email().required() }), { email: 'abc' });
    assert.equal(body.field, 'email');
});

test('per-field details are still returned for forms that highlight inputs', () => {
    const schema = joi.object({
        email: joi.string().email().required(),
        name: joi.string().min(2).required(),
    });
    const body = failOn(schema, { email: 'abc', name: 'x' });
    assert.equal(body.details.length, 2);
    assert.deepEqual(body.details.map((d) => d.field).sort(), ['email', 'name']);
});

// --- messages are written for people ----------------------------------------

test('no message contains a quoted machine field name', () => {
    // joi's own text is `"email" must be a valid email`.
    const body = failOn(joi.object({ email: joi.string().email().required() }), { email: 'abc' });
    assert.ok(!body.error.includes('"'), body.error);
});

test('a snake_case field is rendered in words', () => {
    const body = failOn(joi.object({ student_email: joi.string().email().required() }), { student_email: 'abc' });
    assert.match(body.error, /^Student email address/);
});

test('an unmapped snake_case field still reads as a phrase', () => {
    const body = failOn(joi.object({ course_title: joi.string().min(5).required() }), { course_title: 'ab' });
    assert.match(body.error, /^Course title/);
    assert.ok(!body.error.includes('_'), body.error);
});

test('a required field says it is required', () => {
    const body = failOn(joi.object({ email: joi.string().email().required() }), {});
    assert.match(body.error, /is required/);
});

test('an empty string is reported as required, not as a length problem', () => {
    const body = failOn(joi.object({ name: joi.string().min(2).required() }), { name: '' });
    assert.match(body.error, /is required/);
});

test('a min-length failure states the limit', () => {
    const body = failOn(joi.object({ name: joi.string().min(5).required() }), { name: 'ab' });
    assert.match(body.error, /at least 5 characters/);
});

test('a max-length failure states the limit', () => {
    const body = failOn(joi.object({ name: joi.string().max(3).required() }), { name: 'abcdef' });
    assert.match(body.error, /3 characters or fewer/);
});

test('an enum failure lists the allowed values', () => {
    const body = failOn(
        joi.object({ level: joi.string().valid('easy', 'medium', 'hard').required() }),
        { level: 'extreme' },
    );
    assert.match(body.error, /easy, medium, hard/);
});

test('a number failure says a number is expected', () => {
    const body = failOn(joi.object({ price: joi.number().required() }), { price: 'abc' });
    assert.match(body.error, /must be a number/);
});

test('a url failure explains what a link looks like', () => {
    const body = failOn(joi.object({ website: joi.string().uri().required() }), { website: 'nope' });
    assert.match(body.error, /https:\/\//);
});

test('an unmapped rule falls back to joi text with the quotes stripped', () => {
    const { error } = validate({ tags: 'x' }, joi.object({ tags: joi.array().required() }));
    if (error) {
        const msg = humanMessage(error.details[0]);
        assert.ok(!msg.includes('"'), msg);
    }
});

// --- HttpError field metadata ------------------------------------------------

test('HttpError carries the field it blames', () => {
    const e = new HttpError(422, 'Email address is required.', { field: 'email' });
    assert.equal(e.status, 422);
    assert.equal(e.field, 'email');
});

test('HttpError without meta still works as a plain error', () => {
    // Every existing call site passes two args; none may break.
    const e = new HttpError(404, 'Student not found');
    assert.equal(e.status, 404);
    assert.equal(e.message, 'Student not found');
    assert.equal(e.field, undefined);
});
