/**
 * Human-readable validation for the fields users actually type.
 *
 * Two problems this solves:
 *
 *  1. Format was never checked. StudentService.create and the public signup
 *     route only tested for PRESENCE, so "abc" was accepted as an email. The
 *     account was created with an address that can never receive a welcome mail
 *     or a password reset — the user is locked out and nobody finds out until
 *     they try to recover the account.
 *
 *  2. When joi did reject something, the message it produces names the machine
 *     field in quotes — `"email" must be a valid email` — and validateBody
 *     buries it under a generic { error: 'Validation failed' } that the
 *     frontend then renders verbatim. The user is told "Validation failed"
 *     with no clue WHICH field or WHY.
 *
 * Everything here returns { ok: true, value } or { ok: false, field, message },
 * where `message` is written for the person reading it, and names the field in
 * the words the form uses ("Email address", not "email").
 */

// Deliberately not the RFC 5322 monster. This accepts what mail providers
// actually accept and rejects what users actually mistype: missing @, missing
// domain, missing TLD, spaces, double dots, leading/trailing punctuation.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

// Indian mobile numbers: 10 digits starting 6-9, optionally +91 / 0 prefixed.
const PHONE_RE = /^[6-9]\d{9}$/;

const asString = (v) => String(v ?? '').trim();

/**
 * Email address. Returns the lowercased, trimmed value so callers persist one
 * canonical form — "Foo@Bar.com" and "foo@bar.com " must not become two rows.
 */
const validateEmail = (raw, { field = 'email', label = 'Email address', required = true } = {}) => {
    const value = asString(raw);
    if (!value) {
        return required
            ? { ok: false, field, message: `${label} is required.` }
            : { ok: true, value: '' };
    }
    if (/\s/.test(value)) {
        return { ok: false, field, message: `${label} cannot contain spaces.` };
    }
    if (!value.includes('@')) {
        return { ok: false, field, message: `${label} must include an @ sign — for example name@example.com.` };
    }
    // Split on the LAST @, which is the domain separator.
    const at = value.lastIndexOf('@');
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    if (!local) {
        return { ok: false, field, message: `${label} is missing the part before the @ sign.` };
    }
    if (!domain) {
        return { ok: false, field, message: `${label} is missing the part after the @ sign — for example name@example.com.` };
    }
    if (!domain.includes('.')) {
        return { ok: false, field, message: `${label} must include a domain ending such as .com or .in.` };
    }
    if (value.includes('..')) {
        return { ok: false, field, message: `${label} cannot contain two dots in a row.` };
    }
    if (!EMAIL_RE.test(value)) {
        return { ok: false, field, message: `${label} doesn't look like a valid email — for example name@example.com.` };
    }
    if (value.length > 254) {
        return { ok: false, field, message: `${label} is too long.` };
    }
    return { ok: true, value: value.toLowerCase() };
};

/** A person's name. Rejects digits and stray symbols, allows unicode + '-. */
const validateName = (raw, { field = 'name', label = 'Full name', min = 2, max = 100 } = {}) => {
    const value = asString(raw);
    if (!value) return { ok: false, field, message: `${label} is required.` };
    if (value.length < min) {
        return { ok: false, field, message: `${label} must be at least ${min} characters.` };
    }
    if (value.length > max) {
        return { ok: false, field, message: `${label} must be ${max} characters or fewer.` };
    }
    if (/\d/.test(value)) {
        return { ok: false, field, message: `${label} cannot contain numbers.` };
    }
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u.test(value)) {
        return { ok: false, field, message: `${label} can only contain letters, spaces, hyphens and apostrophes.` };
    }
    return { ok: true, value };
};

/**
 * Password. Says exactly what is missing rather than a generic "too weak", so
 * the user can fix it in one attempt instead of guessing.
 */
const validatePassword = (raw, { field = 'password', label = 'Password', min = 8 } = {}) => {
    const value = String(raw ?? '');
    if (!value) return { ok: false, field, message: `${label} is required.` };
    if (value.length < min) {
        return { ok: false, field, message: `${label} must be at least ${min} characters.` };
    }
    if (value.length > 128) {
        return { ok: false, field, message: `${label} must be 128 characters or fewer.` };
    }
    if (!/[A-Za-z]/.test(value)) {
        return { ok: false, field, message: `${label} must include at least one letter.` };
    }
    if (!/\d/.test(value)) {
        return { ok: false, field, message: `${label} must include at least one number.` };
    }
    return { ok: true, value };
};

/**
 * Indian mobile number. Accepts +91/0 prefixes and separators, stores the bare
 * 10 digits so lookups match regardless of how it was typed.
 */
const validatePhone = (raw, { field = 'phone', label = 'Mobile number', required = true } = {}) => {
    const value = asString(raw);
    if (!value) {
        return required
            ? { ok: false, field, message: `${label} is required.` }
            : { ok: true, value: '' };
    }
    // Strip spaces, dashes, brackets and a leading +91 / 91 / 0.
    let digits = value.replace(/[\s()-]/g, '');
    digits = digits.replace(/^\+?91/, '').replace(/^0+/, '');
    if (!/^\d+$/.test(digits)) {
        return { ok: false, field, message: `${label} can only contain digits.` };
    }
    if (digits.length !== 10) {
        return { ok: false, field, message: `${label} must be exactly 10 digits.` };
    }
    if (!PHONE_RE.test(digits)) {
        return { ok: false, field, message: `${label} must start with 6, 7, 8 or 9.` };
    }
    return { ok: true, value: digits };
};

/**
 * Run several validators and return the FIRST failure, so the caller reports
 * one clear problem rather than a wall of them.
 *
 * @param checks [ [rawValue, validatorFn, opts], ... ]
 * @returns { ok: true, values: {field: value} } | { ok: false, field, message }
 */
const validateAll = (checks) => {
    const values = {};
    for (const [raw, fn, opts = {}] of checks) {
        const res = fn(raw, opts);
        if (!res.ok) return res;
        values[opts.field || fn.name] = res.value;
    }
    return { ok: true, values };
};

module.exports = {
    EMAIL_RE,
    validateEmail,
    validateName,
    validatePassword,
    validatePhone,
    validateAll,
};
