// Unit tests for the startup environment schema. Pure validation, no DB, no
// network — run with: npm test
//
// The R2_PUBLIC_URL cases guard a silent-failure mode rather than a crash:
// R2Storage.publicUrlFor() returns null when the var is unset, so uploads keep
// "succeeding" while writing broken asset references into the DB. Nothing fails
// until someone notices missing images days later. Requiring it here turns that
// into a loud boot-time error.
process.env.NODE_ENV = 'test'; // suppress the validate-on-require side effect

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { schema } = require('../src/config/validate-env');

// A minimally valid environment; individual tests override one key at a time.
const base = {
    DATABASE_URL: 'postgresql://user:pass@host:5432/postgres',
    SUPABASE_JWT_SECRET: 'x'.repeat(32),
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'vrrobotics-assets',
    R2_PUBLIC_URL: 'https://assets.vrroboticsacademy.com',
    BUNNY_STREAM_LIBRARY_ID: '717899',
    BUNNY_STREAM_API_KEY: 'bunny-key',
};

const validate = (overrides) => schema.validate({ ...base, ...overrides }, { abortEarly: false });

test('accepts a fully populated environment', () => {
    assert.equal(validate({}).error, undefined);
});

test('R2_PUBLIC_URL: missing is rejected', () => {
    const env = { ...base };
    delete env.R2_PUBLIC_URL;
    const { error } = schema.validate(env, { abortEarly: false });
    assert.ok(error, 'expected a validation error when R2_PUBLIC_URL is absent');
    assert.match(error.message, /R2_PUBLIC_URL/);
});

test('R2_PUBLIC_URL: a bare hostname without a scheme is rejected', () => {
    // The realistic typo — pasting the domain straight out of the dashboard.
    const { error } = validate({ R2_PUBLIC_URL: 'assets.vrroboticsacademy.com' });
    assert.ok(error, 'expected a scheme-less hostname to fail uri() validation');
    assert.match(error.message, /R2_PUBLIC_URL/);
});

test('R2_PUBLIC_URL: empty string is rejected', () => {
    const { error } = validate({ R2_PUBLIC_URL: '' });
    assert.ok(error, 'expected an empty R2_PUBLIC_URL to fail');
});

test('R2_PUBLIC_URL: the r2.dev fallback origin is still accepted', () => {
    // Migration is staged — the old public URL must keep validating until the
    // custom domain is verified live.
    const { error } = validate({
        R2_PUBLIC_URL: 'https://pub-35b9bf5306ea4018bb410638b90afe99.r2.dev',
    });
    assert.equal(error, undefined);
});

test('unknown keys pass through (schema is unknown(true))', () => {
    const { error } = validate({ SOME_UNRELATED_VAR: 'whatever' });
    assert.equal(error, undefined);
});

test('DATABASE_URL: still required alongside the new R2 rule', () => {
    const env = { ...base };
    delete env.DATABASE_URL;
    const { error } = schema.validate(env, { abortEarly: false });
    assert.ok(error);
    assert.match(error.message, /DATABASE_URL/);
});
