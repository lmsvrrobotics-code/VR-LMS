/**
 * Tests for the Upcoming / Completed split used by both calendars' session rails.
 *
 * The rails previously filtered on `start >= now`, which had two problems:
 *   1. Finished sessions were dropped entirely — no way to review what ran.
 *   2. A session that had STARTED but not ended was classed as past, so a class
 *      running right now vanished from "Upcoming" mid-lesson.
 *
 * The rule is now: a session is complete once its END has passed.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Mirrors endOf/isPast in Index.jsx and ScheduleCalendar.tsx.
const endOf = (e) => (e.end && e.end > e.start ? e.end : e.start);
const isPast = (e, now) => endOf(e) < now;

const at = (iso) => new Date(iso);
const ev = (id, start, end) => ({ id, start: at(start), end: end ? at(end) : null });

const NOW = at("2026-07-26T17:00:00+05:30");

test("a session that already ended is Completed", () => {
  const e = ev("a", "2026-07-26T15:00:00+05:30", "2026-07-26T16:00:00+05:30");
  assert.equal(isPast(e, NOW), true);
});

test("a session running RIGHT NOW is still Upcoming, not Completed", () => {
  // Started 16:40, ends 17:40 — now is 17:00, so it's live.
  const e = ev("b", "2026-07-26T16:40:00+05:30", "2026-07-26T17:40:00+05:30");
  assert.equal(isPast(e, NOW), false, "a live session must not be filed as history");
});

test("a future session is Upcoming", () => {
  const e = ev("c", "2026-07-26T23:50:00+05:30", "2026-07-27T00:50:00+05:30");
  assert.equal(isPast(e, NOW), false);
});

test("a point-in-time session (no end) uses its start", () => {
  assert.equal(isPast(ev("d", "2026-07-26T16:00:00+05:30", null), NOW), true);
  assert.equal(isPast(ev("e", "2026-07-26T18:00:00+05:30", null), NOW), false);
});

test("an inverted stored range falls back to the start time", () => {
  // end < start (corrupt row) — endOf must ignore the bad end, not report the
  // session as having ended in the past when it actually starts later.
  const e = ev("f", "2026-07-26T23:50:00+05:30", "2026-07-26T12:50:00+05:30");
  assert.equal(endOf(e).getTime(), e.start.getTime());
  assert.equal(isPast(e, NOW), false, "a future session with a corrupt end is still upcoming");
});

test("the four 26-Jul classes split correctly at 5pm", () => {
  const rows = [
    ev("17", "2026-07-26T16:26:00+05:30", "2026-07-25T16:23:00+05:30"), // corrupt end → point at 16:26 → past
    ev("18", "2026-07-26T16:40:00+05:30", "2026-07-26T17:40:00+05:30"), // live → upcoming
    ev("19", "2026-07-26T23:50:00+05:30", "2026-07-26T12:50:00+05:30"), // corrupt end → point at 23:50 → upcoming
    ev("16", "2026-07-27T19:57:00+05:30", "2026-07-27T21:07:00+05:30"), // future → upcoming
  ];
  const past = rows.filter((e) => isPast(e, NOW)).map((e) => e.id);
  const upcoming = rows.filter((e) => !isPast(e, NOW)).map((e) => e.id);

  assert.deepEqual(past, ["17"]);
  assert.deepEqual(upcoming, ["18", "19", "16"]);
  // Nothing may be lost between the two lists.
  assert.equal(past.length + upcoming.length, rows.length);
});

test("every session appears in exactly one of the two lists", () => {
  const rows = [
    ev("p1", "2026-07-20T10:00:00+05:30", "2026-07-20T11:00:00+05:30"),
    ev("p2", "2026-07-26T09:00:00+05:30", null),
    ev("u1", "2026-07-26T16:40:00+05:30", "2026-07-26T17:40:00+05:30"),
    ev("u2", "2026-08-01T10:00:00+05:30", "2026-08-01T11:00:00+05:30"),
  ];
  const past = rows.filter((e) => isPast(e, NOW));
  const upcoming = rows.filter((e) => !isPast(e, NOW));
  assert.equal(past.length + upcoming.length, rows.length);
  const ids = [...past, ...upcoming].map((e) => e.id).sort();
  assert.deepEqual(ids, ["p1", "p2", "u1", "u2"]);
});

test("Completed is ordered most-recent-first", () => {
  const rows = [
    ev("old", "2026-07-10T10:00:00+05:30", "2026-07-10T11:00:00+05:30"),
    ev("recent", "2026-07-26T15:00:00+05:30", "2026-07-26T16:00:00+05:30"),
    ev("mid", "2026-07-20T10:00:00+05:30", "2026-07-20T11:00:00+05:30"),
  ];
  const past = rows.filter((e) => isPast(e, NOW)).sort((a, b) => b.start - a.start);
  assert.deepEqual(past.map((e) => e.id), ["recent", "mid", "old"]);
});

test("Upcoming is ordered soonest-first", () => {
  const rows = [
    ev("later", "2026-08-01T10:00:00+05:30", null),
    ev("soon", "2026-07-26T18:00:00+05:30", null),
    ev("mid", "2026-07-28T10:00:00+05:30", null),
  ];
  const up = rows.filter((e) => !isPast(e, NOW)).sort((a, b) => a.start - b.start);
  assert.deepEqual(up.map((e) => e.id), ["soon", "mid", "later"]);
});
