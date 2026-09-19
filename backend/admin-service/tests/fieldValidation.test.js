// Tests for lib/fieldValidation — the shared rules behind signup, the contact
// form and lead capture.
//
// The behaviour being pinned down: these paths used to check PRESENCE only
// (`!body.email`), so "abc" created a real account with an address that can
// never receive a welcome mail or a password reset. Where a format check did
// exist it was one of three different local regexes, each accepting addresses
// that bounce.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    validateEmail, validateName, validatePassword, validatePhone, validateAll,
} = require('../src/lib/fieldValidation');

// --- email: what must be rejected -------------------------------------------

test('a bare word is not an email', () => {
    const r = validateEmail('abc');
    assert.equal(r.ok, false);
    assert.match(r.message, /@ sign/);
});

test('an address with no domain ending is rejected', () => {
    const r = validateEmail('user@localhost');
    assert.equal(r.ok, false);
    assert.match(r.message, /domain ending/);
});

test('consecutive dots are rejected', () => {
    // Accepted by the old regex, bounces at the provider.
    assert.equal(validateEmail('a@b..c').ok, false);
    assert.equal(validateEmail('a..b@c.com').ok, false);
});

test('a domain starting or ending with a hyphen is rejected', () => {
    assert.equal(validateEmail('a@-example.com').ok, false);
    assert.equal(validateEmail('a@example-.com').ok, false);
});

test('an address containing spaces is rejected', () => {
    // The frontend modal regex had lost its backslashes — [^s@] means "not the
    // letter s", so "a b@c d.e" passed as valid.
    assert.equal(validateEmail('a b@c d.com').ok, false);
    assert.match(validateEmail('a b@c.com').message, /spaces/);
});

test('a missing local part is rejected', () => {
    const r = validateEmail('@example.com');
    assert.equal(r.ok, false);
    assert.match(r.message, /before the @/);
});

test('a missing domain part is rejected', () => {
    const r = validateEmail('user@');
    assert.equal(r.ok, false);
    assert.match(r.message, /after the @/);
});

test('a single-character TLD is rejected', () => {
    assert.equal(validateEmail('a@b.c').ok, false);
});

test('an empty email is required by default and optional on request', () => {
    assert.equal(validateEmail('').ok, false);
    assert.equal(validateEmail('', { required: false }).ok, true);
});

// --- email: what must be accepted -------------------------------------------

test('ordinary addresses are accepted', () => {
    for (const addr of [
        'user@example.com',
        'first.last@example.co.in',
        'user+tag@example.org',
        'user_name@sub.domain.example.com',
        'u@ex.io',
        '123@example.com',
    ]) {
        assert.equal(validateEmail(addr).ok, true, addr + ' must be accepted');
    }
});

test('a valid address is returned lowercased and trimmed', () => {
    // Two rows for one person is the failure this prevents.
    assert.equal(validateEmail('  Foo.Bar@Example.COM  ').value, 'foo.bar@example.com');
});

// --- messages ---------------------------------------------------------------

test('the message names the field in the words the form uses', () => {
    const r = validateEmail('abc', { label: 'Student email address' });
    assert.match(r.message, /^Student email address/);
    assert.ok(!r.message.includes('"'), 'no quoted machine field names');
});

test('the message shows the user what a valid address looks like', () => {
    assert.match(validateEmail('abc').message, /name@example\.com/);
});

test('a rejected field reports which input was at fault', () => {
    assert.equal(validateEmail('abc', { field: 'student_email' }).field, 'student_email');
});

// --- name -------------------------------------------------------------------

test('a name with digits is rejected', () => {
    const r = validateName('John3');
    assert.equal(r.ok, false);
    assert.match(r.message, /numbers/);
});

test('real names with punctuation and accents are accepted', () => {
    for (const n of ["O'Brien", 'Anne-Marie', 'J. Smith', 'José', 'Ramakrishnan']) {
        assert.equal(validateName(n).ok, true, n + ' must be accepted');
    }
});

test('a one-character name is rejected but a two-character one is not', () => {
    assert.equal(validateName('A').ok, false);
    assert.equal(validateName('Al').ok, true);
});

// --- password ---------------------------------------------------------------

test('a short password says exactly how long it must be', () => {
    const r = validatePassword('abc');
    assert.equal(r.ok, false);
    assert.match(r.message, /at least 8 characters/);
});

test('a password with no number is rejected and says so', () => {
    const r = validatePassword('abcdefghij');
    assert.equal(r.ok, false);
    assert.match(r.message, /number/);
});

test('a password with no letter is rejected and says so', () => {
    const r = validatePassword('12345678');
    assert.equal(r.ok, false);
    assert.match(r.message, /letter/);
});

test('a valid password is accepted', () => {
    assert.equal(validatePassword('robotics2026').ok, true);
});

// --- phone ------------------------------------------------------------------

test('an Indian mobile is accepted however it is typed', () => {
    for (const p of ['9876543210', '+91 98765 43210', '+919876543210', '098765-43210']) {
        const r = validatePhone(p);
        assert.equal(r.ok, true, p + ' must be accepted');
        assert.equal(r.value, '9876543210', 'stored bare so lookups match');
    }
});

test('a wrong-length number reports the required length', () => {
    const r = validatePhone('98765');
    assert.equal(r.ok, false);
    assert.match(r.message, /10 digits/);
});

test('a number starting below 6 is rejected', () => {
    const r = validatePhone('1234567890');
    assert.equal(r.ok, false);
    assert.match(r.message, /6, 7, 8 or 9/);
});

test('letters in a phone number are rejected', () => {
    assert.equal(validatePhone('98765abcde').ok, false);
});

test('a phone is optional when the caller says so', () => {
    assert.equal(validatePhone('', { required: false }).ok, true);
    assert.equal(validatePhone('').ok, false);
});

// --- validateAll ------------------------------------------------------------

test('validateAll reports the first problem only', () => {
    // One clear message beats a wall of them.
    const r = validateAll([
        ['', validateName, { field: 'name', label: 'Full name' }],
        ['abc', validateEmail, { field: 'email' }],
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.field, 'name');
});

test('validateAll returns the canonical values when everything passes', () => {
    const r = validateAll([
        ['Asha Rao', validateName, { field: 'name' }],
        ['  Asha@Example.COM ', validateEmail, { field: 'email' }],
        ['+91 98765 43210', validatePhone, { field: 'phone' }],
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.values.email, 'asha@example.com');
    assert.equal(r.values.phone, '9876543210');
});
