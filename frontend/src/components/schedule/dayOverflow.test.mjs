// Verifies the day-overflow logic: with 10 sessions on one date, the Day-view
// scope count must report ALL 10 (month view can only render ~2 + "+N more").
import test from "node:test";
import assert from "node:assert/strict";
import { startOfWeek } from "date-fns";

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Mirrors the scopeCount useMemo in both calendars.
const scopeCount = (events, date, view) => {
  if (view === "day") return events.filter((e) => sameDay(e.start, date)).length;
  if (view === "week") {
    const ws = startOfWeek(date, { weekStartsOn: 1 });
    const we = new Date(ws); we.setDate(we.getDate() + 7);
    return events.filter((e) => e.start >= ws && e.start < we).length;
  }
  return 0;
};

const busyDay = new Date(2026, 6, 16, 0, 0, 0);
const tenClasses = Array.from({ length: 10 }, (_, i) => ({
  id: `class-${i}`,
  start: new Date(2026, 6, 16, 9 + i, 0, 0),
}));

test("all 10 sessions on one day are counted in Day view", () => {
  assert.equal(scopeCount(tenClasses, busyDay, "day"), 10);
});

test("a neighbouring day is not counted", () => {
  assert.equal(scopeCount(tenClasses, new Date(2026, 6, 17), "day"), 0);
});

test("week view includes the whole busy day", () => {
  assert.equal(scopeCount(tenClasses, busyDay, "week"), 10);
});

test("sessions spread across two days split correctly", () => {
  const mixed = [
    ...tenClasses,
    { id: "x1", start: new Date(2026, 6, 17, 10, 0) },
    { id: "x2", start: new Date(2026, 6, 17, 11, 0) },
  ];
  assert.equal(scopeCount(mixed, busyDay, "day"), 10);
  assert.equal(scopeCount(mixed, new Date(2026, 6, 17), "day"), 2);
  assert.equal(scopeCount(mixed, busyDay, "week"), 12);
});

test("month view reports 0 (the badge is day/week only)", () => {
  assert.equal(scopeCount(tenClasses, busyDay, "month"), 0);
});
