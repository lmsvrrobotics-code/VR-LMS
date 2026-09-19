// Tests for the session/class authoring field rules (migration 23):
// session title/description normalisation and class difficulty validation.
// Pure functions — no DB, no R2, no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    DIFFICULTY_LEVELS,
    normalizeText,
    normalizeDifficulty,
    sessionPatch,
} = require('../src/lib/curriculumFields');

// --- normalizeText ----------------------------------------------------------

test('normalizeText trims surrounding whitespace', () => {
    assert.equal(normalizeText('  Intro to Scratch  '), 'Intro to Scratch');
});

test('normalizeText maps blank-ish input to null', () => {
    // Multipart sends everything as a string, so these literals must not be
    // stored as text.
    for (const blank of ['', '   ', 'null', 'NULL', 'undefined', undefined, null]) {
        assert.equal(normalizeText(blank), null, `expected null for ${JSON.stringify(blank)}`);
    }
});

test('normalizeText keeps interior whitespace and punctuation', () => {
    assert.equal(normalizeText(' Build a  game — part 1 '), 'Build a  game — part 1');
});

test('normalizeText stringifies non-string scalars', () => {
    assert.equal(normalizeText(42), '42');
});

// --- normalizeDifficulty ----------------------------------------------------

test('difficulty accepts each allowed level', () => {
    for (const level of DIFFICULTY_LEVELS) {
        assert.deepEqual(normalizeDifficulty(level), { ok: true, value: level });
    }
});

test('difficulty is case- and whitespace-insensitive', () => {
    assert.deepEqual(normalizeDifficulty('  MEDIUM '), { ok: true, value: 'medium' });
    assert.deepEqual(normalizeDifficulty('Hard'), { ok: true, value: 'hard' });
});

test('difficulty absent or blank means unspecified, not an error', () => {
    // The select's "Not specified" option posts an empty string.
    for (const blank of ['', undefined, null, '   ']) {
        assert.deepEqual(normalizeDifficulty(blank), { ok: true, value: null });
    }
});

test('difficulty rejects an unknown level rather than hitting the DB CHECK', () => {
    const r = normalizeDifficulty('extreme');
    assert.equal(r.ok, false);
    assert.match(r.error, /easy, medium, hard/);
});

test('difficulty rejects a near-miss that would break the CHECK constraint', () => {
    assert.equal(normalizeDifficulty('mediumm').ok, false);
    assert.equal(normalizeDifficulty('0').ok, false);
});

// --- sessionPatch -----------------------------------------------------------

test('sessionPatch on create carries title and description', () => {
    const patch = sessionPatch({ title: ' Session 1 ', description: ' Basics ' });
    assert.deepEqual(patch, { title: 'Session 1', description: 'Basics' });
});

test('sessionPatch on create nulls an omitted description', () => {
    const patch = sessionPatch({ title: 'Session 1' });
    assert.equal(patch.description, null);
});

test('sessionPatch drops a blank title so the caller can 422 on it', () => {
    // createSection checks `!patch.title`; a blank must not slip through as ''.
    assert.equal(sessionPatch({ title: '   ' }).title, undefined);
});

test('sessionPatch partial leaves untouched fields out of the patch', () => {
    // Editing only the image must not blank the title or description.
    const patch = sessionPatch({ section_id: 7 }, { partial: true });
    assert.deepEqual(patch, {});
});

test('sessionPatch partial treats an explicitly empty description as a clear', () => {
    const patch = sessionPatch({ description: '' }, { partial: true });
    assert.equal(patch.description, null);
    assert.ok(!('title' in patch), 'title must stay untouched');
});

test('sessionPatch partial updates only the sent title', () => {
    const patch = sessionPatch({ title: 'Renamed' }, { partial: true });
    assert.deepEqual(patch, { title: 'Renamed' });
});

test('sessionPatch partial ignores a blank title rather than wiping it', () => {
    // A stray empty title must never blank an existing session name.
    const patch = sessionPatch({ title: '  ' }, { partial: true });
    assert.ok(!('title' in patch));
});
