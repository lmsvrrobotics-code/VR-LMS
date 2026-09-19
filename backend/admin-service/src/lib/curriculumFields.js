'use strict';

// Normalisation + validation for the curriculum authoring fields added in
// migration 23 (session image/description, class difficulty).
//
// Kept out of CurriculumService so it can be unit-tested without a DB or an
// R2 connection — the service does the I/O, this module does the rules.

const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];

// Multipart bodies arrive as strings, so '' / 'null' / 'undefined' all mean
// "not provided" and must not be written over an existing value as literal text.
const BLANKS = new Set(['', 'null', 'undefined']);

/**
 * Trim a multipart/JSON text field to a stored value.
 * @returns {string|null} the trimmed text, or null when blank/absent.
 */
const normalizeText = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return BLANKS.has(trimmed.toLowerCase()) ? null : trimmed;
};

/**
 * Coerce a difficulty input to one of the allowed levels.
 * Case- and whitespace-insensitive; anything unrecognised is rejected so a
 * typo cannot slip past the DB CHECK constraint as a 500.
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
const normalizeDifficulty = (value) => {
    const text = normalizeText(value);
    if (text === null) return { ok: true, value: null };
    const lower = text.toLowerCase();
    if (!DIFFICULTY_LEVELS.includes(lower)) {
        return { ok: false, error: `Difficulty must be one of: ${DIFFICULTY_LEVELS.join(', ')}` };
    }
    return { ok: true, value: lower };
};

/**
 * Build the patch for a session's editable text fields.
 *
 * `partial` matters on update: a field the client did not send at all is left
 * untouched, while a field sent empty is an explicit clear (null). Create
 * passes partial=false so both absent and empty become null.
 */
const sessionPatch = (body = {}, { partial = false } = {}) => {
    const patch = {};
    if (!partial || body.title !== undefined) {
        const title = normalizeText(body.title);
        if (title !== null) patch.title = title;
    }
    if (!partial || body.description !== undefined) {
        patch.description = normalizeText(body.description);
    }
    return patch;
};

module.exports = { DIFFICULTY_LEVELS, normalizeText, normalizeDifficulty, sessionPatch };
