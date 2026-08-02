/**
 * Regression tests: a scheduled session must never be stored with an end time
 * that precedes its start.
 *
 * Real rows in the database looked like this:
 *   class id=17  start 26 Jul 16:26  end 25 Jul 16:23   (ends the DAY BEFORE)
 *   class id=19  start 26 Jul 23:50  end 26 Jul 12:50   (ends 11h earlier)
 *
 * Nothing validated the range, and react-big-calendar silently DROPS events
 * whose end is before their start — so those classes vanished from the admin
 * calendar. Four classes on 26 Jul rendered as one.
 *
 * Two layers are covered here:
 *   1. assertValidRange — the service guard that stops bad rows being written.
 *   2. clampEnd — the frontend's read-side normaliser, which must never emit a
 *      range ending before it starts (otherwise the event disappears).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// --- layer 1: the service guard -------------------------------------------
// Mirrors assertValidRange in ClassSessionService.js / DemoService.js.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const assertValidRange = (start, end) => {
  if (start && end && end.getTime() < start.getTime()) {
    throw new HttpError(422, 'End time must be after the start time.');
  }
};

test('rejects an end time earlier the same day (the id=19 case)', () => {
  const start = new Date('2026-07-26T23:50:00+05:30');
  const end = new Date('2026-07-26T12:50:00+05:30');
  assert.throws(() => assertValidRange(start, end), (e) => e.status === 422);
});

test('rejects an end dated before the start day (the id=17 case)', () => {
  const start = new Date('2026-07-26T16:26:00+05:30');
  const end = new Date('2026-07-25T16:23:00+05:30');
  assert.throws(() => assertValidRange(start, end), (e) => e.status === 422);
});

test('accepts a normal forward range', () => {
  const start = new Date('2026-07-26T16:40:00+05:30');
  const end = new Date('2026-07-26T17:40:00+05:30');
  assert.doesNotThrow(() => assertValidRange(start, end));
});

test('accepts an exactly-zero-length session', () => {
  const t = new Date('2026-07-26T16:40:00+05:30');
  assert.doesNotThrow(() => assertValidRange(t, new Date(t)));
});

test('a missing start or end is not a range error', () => {
  const t = new Date('2026-07-26T16:40:00+05:30');
  assert.doesNotThrow(() => assertValidRange(t, null));
  assert.doesNotThrow(() => assertValidRange(null, t));
  assert.doesNotThrow(() => assertValidRange(null, null));
});

test('a multi-day forward range is allowed by the guard', () => {
  // Spanning days is legal data; the CALENDAR collapses it for display, but the
  // service must not reject it.
  const start = new Date('2026-07-16T15:34:00+05:30');
  const end = new Date('2026-07-31T15:36:00+05:30');
  assert.doesNotThrow(() => assertValidRange(start, end));
});

// --- layer 2: the frontend read-side normaliser ---------------------------
// Mirrors clampEnd in admin/pages/calendar/Index.jsx.
const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clampEnd = (start, end) => {
  if (!start) return end || start;
  if (!end) return start;
  if (!sameDay(start, end)) return start;
  if (end.getTime() < start.getTime()) return start;
  return end;
};

test('clampEnd never returns a range that ends before it starts', () => {
  const cases = [
    ['2026-07-26T23:50:00+05:30', '2026-07-26T12:50:00+05:30'], // inverted, same day
    ['2026-07-26T16:26:00+05:30', '2026-07-25T16:23:00+05:30'], // inverted, prior day
    ['2026-07-16T15:34:00+05:30', '2026-07-31T15:36:00+05:30'], // spans days
    ['2026-07-26T16:40:00+05:30', '2026-07-26T17:40:00+05:30'], // valid
  ];
  for (const [s, e] of cases) {
    const start = new Date(s);
    const out = clampEnd(start, new Date(e));
    assert.ok(
      out.getTime() >= start.getTime(),
      `clampEnd(${s}, ${e}) produced an end before the start — rbc would DROP this event`,
    );
  }
});

test('clampEnd preserves a valid same-day range', () => {
  const start = new Date('2026-07-26T16:40:00+05:30');
  const end = new Date('2026-07-26T17:40:00+05:30');
  assert.equal(clampEnd(start, end).getTime(), end.getTime());
});

test('all four 26-Jul classes survive normalisation', () => {
  // The exact rows from the database. Every one must remain renderable, i.e.
  // end >= start, so none is silently dropped from the month grid.
  const rows = [
    { id: 17, start: '2026-07-26T16:26:00+05:30', end: '2026-07-25T16:23:00+05:30' },
    { id: 18, start: '2026-07-26T16:40:00+05:30', end: '2026-07-26T17:40:00+05:30' },
    { id: 19, start: '2026-07-26T23:50:00+05:30', end: '2026-07-26T12:50:00+05:30' },
    { id: 20, start: '2026-07-26T09:00:00+05:30', end: null },
  ];
  const renderable = rows.filter((r) => {
    const start = new Date(r.start);
    const end = clampEnd(start, r.end ? new Date(r.end) : null);
    return end.getTime() >= start.getTime();
  });
  assert.equal(renderable.length, 4, 'all four sessions on 26 Jul must be renderable');
});
