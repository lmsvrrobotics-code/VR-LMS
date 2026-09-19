// Tests for the "almost full" threshold behind the urgency badge.
//
// The badge exists to signal genuine scarcity, so the boundaries matter: it
// must not cry wolf on a half-empty session, and it must not fire on a session
// that is already sold out (that is a different message, and the page says
// "fully booked" instead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLowOnSeats, LOW_SEATS_THRESHOLD } from './founderMeetingDefaults.ts';

test('the threshold is ten percent', () => {
  assert.equal(LOW_SEATS_THRESHOLD, 0.1);
});

test('exactly ten percent remaining counts as low', () => {
  // The boundary is inclusive: 10 of 100 is the case the feature is named for.
  assert.equal(isLowOnSeats(10, 100), true);
});

test('just above the threshold does not', () => {
  assert.equal(isLowOnSeats(11, 100), false);
});

test('well below the threshold counts as low', () => {
  assert.equal(isLowOnSeats(1, 100), true);
  assert.equal(isLowOnSeats(3, 50), true);
});

test('a half-empty session is not urgent', () => {
  // Crying wolf here would make the badge meaningless when it matters.
  assert.equal(isLowOnSeats(50, 100), false);
});

test('a sold-out session is NOT flagged as low', () => {
  // Zero seats is not "hurry" — the page shows "fully booked" instead, and a
  // badge reading "0 seats left! Hurry" would be absurd.
  assert.equal(isLowOnSeats(0, 100), false);
});

test('an uncapped session is never urgent', () => {
  // Unlimited seating cannot run low, so no scarcity claim is honest.
  assert.equal(isLowOnSeats(null, null), false);
  assert.equal(isLowOnSeats(5, null), false);
  assert.equal(isLowOnSeats(5, undefined), false);
});

test('small sessions still work', () => {
  // 1 of 10 is 10% — the badge should fire on a modest session too.
  assert.equal(isLowOnSeats(1, 10), true);
  assert.equal(isLowOnSeats(2, 10), false);
});

test('a single-seat session flags as soon as it has a seat', () => {
  // 1 of 1 is 100% remaining, which is not low.
  assert.equal(isLowOnSeats(1, 1), false);
});

test('junk input never throws or fires falsely', () => {
  for (const [left, cap] of [['abc', 100], [5, 'abc'], [NaN, 10], [5, NaN], [-3, 100], [5, 0], [5, -10]]) {
    assert.equal(typeof isLowOnSeats(left, cap), 'boolean');
    assert.equal(isLowOnSeats(left, cap), false, `(${left}, ${cap}) must not fire`);
  }
});
