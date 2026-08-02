// Rules for the public student/teacher identifier (VRS202600001).
//
//   VR    brand
//   S|T   student | teacher
//   2026  registration year
//   00001 5-digit serial — per year AND per role, resets each year
//
// The two rules most likely to be broken by a later "cleanup", and pinned here:
//
//  1. The serial is derived from the highest EXISTING id for the prefix, never
//     from COUNT(*). A COUNT-based serial re-issues a live id the moment any row
//     is deleted, and the unique index then rejects every subsequent signup.
//
//  2. Students and teachers count separately, and both reset in a new year. So
//     VRS202600001 and VRT202600001 coexist, and 2027 starts at 00001 again.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Pure format helpers — no DB involved.
const { format, parse, nextSerial, prefixFor } = require('../src/lib/uniqueId');

test('formats the documented example exactly: VRS202600001', () => {
    assert.equal(format('student', 2026, 1), 'VRS202600001');
});

test('teacher uses the T code', () => {
    assert.equal(format('teacher', 2026, 1), 'VRT202600001');
});

test('serial pads to 5 digits', () => {
    assert.equal(format('student', 2026, 42), 'VRS202600042');
    assert.equal(format('student', 2026, 99999), 'VRS202699999');
});

test('a serial past the 5-digit width widens rather than truncating', () => {
    // Truncation would re-issue an existing id; widening keeps it unique.
    assert.equal(format('student', 2026, 100000), 'VRS2026100000');
});

test('student and teacher ids are distinct at the same year+serial', () => {
    assert.notEqual(format('student', 2026, 1), format('teacher', 2026, 1));
});

test('rejects an unsupported role rather than minting a malformed id', () => {
    assert.throws(() => prefixFor('admin', 2026), /unsupported role/);
});

test('parse round-trips a formatted id', () => {
    assert.deepEqual(parse('VRS202600001'), { role: 'student', year: 2026, serial: 1 });
    assert.deepEqual(parse('VRT202700123'), { role: 'teacher', year: 2027, serial: 123 });
});

test('parse rejects foreign id shapes (e.g. the legacy FirstName+date scheme)', () => {
    assert.equal(parse('Lakshmi20260618-01'), null);
    assert.equal(parse('VR20260701-01'), null);
    assert.equal(parse(''), null);
    assert.equal(parse(null), null);
});

// --- serial allocation -------------------------------------------------------

test('first id for a prefix starts at serial 1', () => {
    assert.equal(nextSerial(null, 'VRS2026'), 1);
});

test('next serial continues from the highest existing id', () => {
    assert.equal(nextSerial('VRS202600001', 'VRS2026'), 2);
    assert.equal(nextSerial('VRS202600041', 'VRS2026'), 42);
});

test('serial is derived from the max id, so deleting a row never re-issues it', () => {
    // Students 1..3 exist, then #2 is deleted. A COUNT-based serial would say
    // "2 rows + 1 = 3" and collide with the live VRS202600003; max-based says 4.
    const highestAfterDelete = 'VRS202600003';
    assert.equal(nextSerial(highestAfterDelete, 'VRS2026'), 4);
});

test('a malformed stored id falls back to serial 1 instead of NaN', () => {
    assert.equal(nextSerial('VRS2026BOGUS', 'VRS2026'), 1);
});

test('a new year restarts the serial at 1', () => {
    // 2026 ended at 00700; 2027 is a different prefix, so it has no last id yet.
    assert.equal(nextSerial(null, 'VRS2027'), 1);
    assert.equal(format('student', 2027, nextSerial(null, 'VRS2027')), 'VRS202700001');
});

test('teacher serial is independent of the student serial', () => {
    // 500 students exist in 2026; the first teacher of 2026 is still 00001.
    assert.equal(nextSerial(null, 'VRT2026'), 1);
    assert.equal(format('teacher', 2026, nextSerial(null, 'VRT2026')), 'VRT202600001');
});
