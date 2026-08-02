// Rules for the human-readable batch identifier (VR-B-00001).
//
//   VR   brand
//   B    batch
//   00001 5-digit global serial (no per-year / per-role reset, unlike users)
//
// The two rules most likely to be broken by a later "cleanup", pinned here:
//
//  1. The serial is derived from the highest EXISTING id, never from COUNT(*).
//     A COUNT-based serial re-issues a live id the moment any batch is deleted,
//     and the primary key then rejects every subsequent create.
//
//  2. A serial past the 5-digit width WIDENS the id (VR-B-100000) rather than
//     truncating — truncation would collide with an existing id.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Pure format helpers — no DB involved. generate() (which reads the DB) is not
// exercised here; these lock the id grammar the DB layer depends on.
const { format, parse, nextSerial, PREFIX } = require('../src/lib/batchId');

test('formats the documented example exactly: VR-B-00001', () => {
    assert.equal(format(1), 'VR-B-00001');
});

test('serial pads to 5 digits', () => {
    assert.equal(format(42), 'VR-B-00042');
    assert.equal(format(99999), 'VR-B-99999');
});

test('a serial past the 5-digit width widens rather than truncating', () => {
    // Truncation would re-issue an existing id; widening keeps it unique.
    assert.equal(format(100000), 'VR-B-100000');
});

test('prefix is the fixed brand string', () => {
    assert.equal(PREFIX, 'VR-B-');
});

test('parse round-trips a formatted id', () => {
    assert.deepEqual(parse('VR-B-00001'), { serial: 1 });
    assert.deepEqual(parse('VR-B-00123'), { serial: 123 });
    assert.deepEqual(parse('VR-B-100000'), { serial: 100000 });
});

test('parse rejects foreign id shapes (legacy BATCH_ scheme, user ids, junk)', () => {
    assert.equal(parse('BATCH_LX8F2A_K9M3QP'), null);
    assert.equal(parse('VRS202600001'), null);
    assert.equal(parse('VR-B-'), null);
    assert.equal(parse('VR-B-12'), null); // fewer than 5 digits
    assert.equal(parse('vr-b-00001'), null); // case-sensitive brand
    assert.equal(parse(''), null);
    assert.equal(parse(null), null);
});

// --- serial allocation -------------------------------------------------------

test('first id when there is no existing batch starts at serial 1', () => {
    assert.equal(nextSerial(null), 1);
    assert.equal(nextSerial(undefined), 1);
});

test('next serial continues from the highest existing id', () => {
    assert.equal(nextSerial('VR-B-00001'), 2);
    assert.equal(nextSerial('VR-B-00041'), 42);
    assert.equal(nextSerial('VR-B-99999'), 100000);
});

test('serial is derived from the max id, so deleting a row never re-issues it', () => {
    // Batches 1..3 exist, then #2 is deleted. A COUNT-based serial would say
    // "2 rows + 1 = 3" and collide with the live VR-B-00003; max-based says 4.
    const highestAfterDelete = 'VR-B-00003';
    assert.equal(nextSerial(highestAfterDelete), 4);
});

test('a malformed stored id falls back to serial 1 instead of NaN', () => {
    assert.equal(nextSerial('VR-B-BOGUS'), 1);
    assert.equal(nextSerial('BATCH_LEGACY'), 1);
});

test('format and nextSerial compose into the next id', () => {
    assert.equal(format(nextSerial('VR-B-00007')), 'VR-B-00008');
});
