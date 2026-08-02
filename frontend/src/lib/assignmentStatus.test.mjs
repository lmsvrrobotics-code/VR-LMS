/**
 * Unit tests for the student dashboard's assignment presentation rules.
 *
 * Run: node --test src/lib/assignmentStatus.test.mjs
 *
 * Same approach as roleRouting.test.mjs — the module under test is pure (no
 * React/DOM/network), so a small loader strips the TypeScript annotations and
 * the .ts source stays the single source of truth.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "assignmentStatus.ts"), "utf8");

// Strip TS-only syntax: exported type aliases, interface blocks, generics on
// the exported functions, and parameter/return annotations.
const js = source
  .replace(/^export type [\s\S]*?;$/gm, "")
  .replace(/^(export )?interface [\s\S]*?^}$/gm, "")
  .replace(/export function getSubmission<T extends SubmissionLike>\([\s\S]*?\): T \| null \{/m,
    "export function getSubmission(a) {")
  .replace(/export function getAssignmentState\([\s\S]*?\): AssignmentState \{/m,
    "export function getAssignmentState(a, now = new Date()) {")
  .replace(/export function summarizeAssignments\([\s\S]*?\): AssignmentSummary \{/m,
    "export function summarizeAssignments(items, now = new Date()) {")
  .replace(/export function averageProgress\([\s\S]*?\): number \{/m,
    "export function averageProgress(courses) {")
  .replace(/export function greeting\([\s\S]*?\): string \{/m,
    "export function greeting(now = new Date()) {")
  .replace(/export function splitSchedule<T extends ClassLike>\([\s\S]*?\): \{ upcoming: T\[\]; past: T\[\] \} \{/m,
    "export function splitSchedule(items, now = new Date()) {")
  .replace(/const upcoming: T\[\] = \[\];/, "const upcoming = [];")
  .replace(/const past: T\[\] = \[\];/, "const past = [];")
  .replace(/const startMs = \(x: ClassLike\) =>/, "const startMs = (x) =>")
  .replace(/const byStart = \(dir: 1 \| -1\) => \(a: T, b: T\) =>/, "const byStart = (dir) => (a, b) =>")
  .replace(/export function msUntilStart\([\s\S]*?\): number \| null \{/m,
    "export function msUntilStart(c, now = new Date()) {")
  .replace(/export function shouldCountDown\([\s\S]*?\): boolean \{/m,
    "export function shouldCountDown(c, now = new Date()) {")
  .replace(/export function formatCountdown\([\s\S]*?\): string \{/m,
    "export function formatCountdown(ms) {")
  .replace(/export function getClassState\([\s\S]*?\): ClassState \{/m,
    "export function getClassState(c, now = new Date()) {")
  .replace(/export function canJoinClass\([\s\S]*?\): boolean \{/m,
    "export function canJoinClass(c, now = new Date()) {")
  .replace(/export const SOON_MS = /, "export const SOON_MS = ")
  .replace(/export function displayName\([\s\S]*?\): string \{/m,
    "export function displayName(user) {")
  .replace(/export function firstName\([\s\S]*?\): string \{/m,
    "export function firstName(user) {")
  .replace(/export function initialsOf\([\s\S]*?\): string \{/m,
    "export function initialsOf(user) {")
  .replace(/const out: AssignmentSummary =/, "const out =");

const {
  getSubmission, getAssignmentState, summarizeAssignments, averageProgress, greeting,
  displayName, firstName, initialsOf, getClassState, canJoinClass,
  msUntilStart, shouldCountDown, formatCountdown, splitSchedule,
} = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const NOW = new Date("2026-07-27T12:00:00Z");
const PAST = "2026-07-01T00:00:00Z";
const FUTURE = "2026-08-30T00:00:00Z";

// ---------------------------------------------------------------------------
// getSubmission
// ---------------------------------------------------------------------------
test("getSubmission returns null when the student has not submitted", () => {
  assert.equal(getSubmission({ submissions: [] }), null);
  assert.equal(getSubmission({ submissions: null }), null);
  assert.equal(getSubmission({}), null);
  assert.equal(getSubmission(null), null);
  assert.equal(getSubmission(undefined), null);
});

test("getSubmission ignores a 'not_submitted' placeholder row", () => {
  // The server can carry a not_submitted row; it is not a real hand-in and
  // must not make the UI claim the work is done.
  assert.equal(getSubmission({ submissions: [{ status: "not_submitted" }] }), null);
});

test("getSubmission prefers a real submission over a placeholder", () => {
  const sub = getSubmission({
    submissions: [{ status: "not_submitted" }, { status: "graded", score: 8 }],
  });
  assert.equal(sub.status, "graded");
  assert.equal(sub.score, 8);
});

// ---------------------------------------------------------------------------
// getAssignmentState
// ---------------------------------------------------------------------------
test("unsubmitted work due in the future is pending", () => {
  assert.equal(getAssignmentState({ due_date: FUTURE, submissions: [] }, NOW), "pending");
});

test("unsubmitted work past its due date is overdue", () => {
  assert.equal(getAssignmentState({ due_date: PAST, submissions: [] }, NOW), "overdue");
});

test("submitted and graded work is NEVER shown as overdue", () => {
  // The regression this guards: marking a student late for work they already
  // handed in. Submission status always wins over the clock.
  assert.equal(
    getAssignmentState({ due_date: PAST, submissions: [{ status: "submitted" }] }, NOW),
    "submitted",
  );
  assert.equal(
    getAssignmentState({ due_date: PAST, submissions: [{ status: "graded", score: 5 }] }, NOW),
    "graded",
  );
});

test("work with no due date is pending, never overdue", () => {
  assert.equal(getAssignmentState({ due_date: null, submissions: [] }, NOW), "pending");
  assert.equal(getAssignmentState({}, NOW), "pending");
});

test("an unparseable due date does not become overdue", () => {
  // NaN comparisons are false, so a malformed date must fall through to
  // pending rather than silently alarming the student.
  assert.equal(getAssignmentState({ due_date: "not-a-date", submissions: [] }, NOW), "pending");
});

test("getAssignmentState tolerates null/undefined assignments", () => {
  assert.equal(getAssignmentState(null, NOW), "pending");
  assert.equal(getAssignmentState(undefined, NOW), "pending");
});

// ---------------------------------------------------------------------------
// summarizeAssignments
// ---------------------------------------------------------------------------
test("summarizeAssignments counts each state exactly once", () => {
  const s = summarizeAssignments(
    [
      { due_date: FUTURE, submissions: [] },                                  // pending
      { due_date: PAST, submissions: [] },                                    // overdue
      { due_date: PAST, submissions: [{ status: "submitted" }] },             // submitted
      { due_date: PAST, submissions: [{ status: "graded", score: 9 }] },      // graded
      { due_date: FUTURE, submissions: [] },                                  // pending
    ],
    NOW,
  );
  assert.deepEqual(s, { total: 5, pending: 2, submitted: 1, graded: 1, overdue: 1 });
  // The per-state counts must account for every assignment, with no double count.
  assert.equal(s.pending + s.submitted + s.graded + s.overdue, s.total);
});

test("summarizeAssignments returns zeroes for empty or invalid input", () => {
  const zero = { total: 0, pending: 0, submitted: 0, graded: 0, overdue: 0 };
  assert.deepEqual(summarizeAssignments([], NOW), zero);
  assert.deepEqual(summarizeAssignments(null, NOW), zero);
  assert.deepEqual(summarizeAssignments(undefined, NOW), zero);
});

// ---------------------------------------------------------------------------
// averageProgress
// ---------------------------------------------------------------------------
test("averageProgress averages and rounds course completion", () => {
  assert.equal(averageProgress([{ progress: 0 }, { progress: 50 }, { progress: 100 }]), 50);
  assert.equal(averageProgress([{ progress: 33 }, { progress: 34 }]), 34); // 33.5 -> 34
});

test("averageProgress returns 0 rather than NaN for an empty list", () => {
  assert.equal(averageProgress([]), 0);
  assert.equal(averageProgress(null), 0);
  assert.equal(averageProgress(undefined), 0);
});

test("averageProgress treats missing or malformed progress as 0", () => {
  assert.equal(averageProgress([{ progress: 100 }, {}]), 50);
  assert.equal(averageProgress([{ progress: 100 }, { progress: "abc" }]), 50);
  assert.equal(averageProgress([{ progress: 100 }, { progress: null }]), 50);
});

test("averageProgress clamps out-of-range values to 0-100", () => {
  // A bad row must not push the headline number above 100 or below 0.
  assert.equal(averageProgress([{ progress: 500 }, { progress: 100 }]), 100);
  assert.equal(averageProgress([{ progress: -50 }, { progress: 100 }]), 50);
});

test("averageProgress accepts numeric strings", () => {
  assert.equal(averageProgress([{ progress: "40" }, { progress: "60" }]), 50);
});

// ---------------------------------------------------------------------------
// greeting — dashboard hero copy
// ---------------------------------------------------------------------------
test("greeting tracks the time of day", () => {
  // Local-time constructor: these hours are what the viewer's clock shows.
  assert.equal(greeting(new Date(2026, 6, 27, 0, 0)), "Good morning");
  assert.equal(greeting(new Date(2026, 6, 27, 9, 30)), "Good morning");
  assert.equal(greeting(new Date(2026, 6, 27, 12, 0)), "Good afternoon");
  assert.equal(greeting(new Date(2026, 6, 27, 16, 59)), "Good afternoon");
  assert.equal(greeting(new Date(2026, 6, 27, 17, 0)), "Good evening");
  assert.equal(greeting(new Date(2026, 6, 27, 23, 59)), "Good evening");
});

// ---------------------------------------------------------------------------
// getClassState / canJoinClass — the upcoming-classes card
// ---------------------------------------------------------------------------
const at = (iso) => new Date(iso);
const NOON = at("2026-07-27T12:00:00Z");

test("a class that has started but not ended is live", () => {
  assert.equal(
    getClassState({ start_at: "2026-07-27T11:30:00Z", end_at: "2026-07-27T12:30:00Z" }, NOON),
    "live",
  );
});

test("a class is live at its exact start instant, not before", () => {
  const c = { start_at: "2026-07-27T12:00:00Z", end_at: "2026-07-27T13:00:00Z" };
  assert.equal(getClassState(c, NOON), "live");
  // One millisecond earlier it is merely imminent.
  assert.equal(getClassState(c, at("2026-07-27T11:59:59.999Z")), "soon");
});

test("a class is no longer live the instant it ends", () => {
  // Boundary: end is exclusive, so a finished class doesn't linger as "live".
  assert.equal(
    getClassState({ start_at: "2026-07-27T11:00:00Z", end_at: "2026-07-27T12:00:00Z" }, NOON),
    "upcoming",
  );
});

test("a class within 15 minutes of starting is 'soon'", () => {
  assert.equal(getClassState({ start_at: "2026-07-27T12:10:00Z" }, NOON), "soon");
  assert.equal(getClassState({ start_at: "2026-07-27T12:15:00Z" }, NOON), "soon");
  // Just outside the window.
  assert.equal(getClassState({ start_at: "2026-07-27T12:16:00Z" }, NOON), "upcoming");
});

test("a class with no end_at is treated as one hour long", () => {
  assert.equal(getClassState({ start_at: "2026-07-27T11:30:00Z" }, NOON), "live");
  assert.equal(getClassState({ start_at: "2026-07-27T10:30:00Z" }, NOON), "upcoming");
});

test("getClassState tolerates missing and malformed times", () => {
  assert.equal(getClassState(null, NOON), "upcoming");
  assert.equal(getClassState({}, NOON), "upcoming");
  assert.equal(getClassState({ start_at: null }, NOON), "upcoming");
  assert.equal(getClassState({ start_at: "not-a-date" }, NOON), "upcoming");
  // A bad end_at falls back to the 1h default rather than throwing.
  assert.equal(getClassState({ start_at: "2026-07-27T11:30:00Z", end_at: "nope" }, NOON), "live");
});

test("canJoinClass requires a meeting link", () => {
  // Live, but nothing to join.
  assert.equal(
    canJoinClass({ start_at: "2026-07-27T11:30:00Z", end_at: "2026-07-27T12:30:00Z" }, NOON),
    false,
  );
  assert.equal(
    canJoinClass({ start_at: "2026-07-27T11:30:00Z", end_at: "2026-07-27T12:30:00Z", meeting_link: "" }, NOON),
    false,
  );
});

test("canJoinClass opens for live and imminent classes only", () => {
  const link = "https://meet.example.com/x";
  // Live.
  assert.equal(canJoinClass({ start_at: "2026-07-27T11:30:00Z", end_at: "2026-07-27T12:30:00Z", meeting_link: link }, NOON), true);
  // Starting soon.
  assert.equal(canJoinClass({ start_at: "2026-07-27T12:10:00Z", meeting_link: link }, NOON), true);
  // Hours away — an always-on link would send students to an empty room.
  assert.equal(canJoinClass({ start_at: "2026-07-27T18:00:00Z", meeting_link: link }, NOON), false);
  // Already finished.
  assert.equal(canJoinClass({ start_at: "2026-07-27T09:00:00Z", end_at: "2026-07-27T10:00:00Z", meeting_link: link }, NOON), false);
});

test("canJoinClass tolerates null input", () => {
  assert.equal(canJoinClass(null, NOON), false);
  assert.equal(canJoinClass(undefined, NOON), false);
});

test("a finished session is never live, however stale the clock's start point", () => {
  // Regression: a demo on 16 Jul rendered "Live now" on 27 Jul because the UI
  // clock was frozen at mount time. The rules were always right — evaluated
  // against a CURRENT `now`, a session that ended days ago is never live. This
  // pins that, so the only way to regress is to stop advancing the clock.
  const demo = { start_at: "2026-07-16T10:04:00Z", end_at: "2026-07-16T10:06:00Z" };
  for (const daysLater of [1, 5, 11, 60]) {
    const now = new Date(Date.parse(demo.end_at) + daysLater * 24 * 3600 * 1000);
    assert.notEqual(getClassState(demo, now), "live", `still live ${daysLater} days after it ended`);
    assert.equal(canJoinClass({ ...demo, meeting_link: "x" }, now), false);
    assert.equal(splitSchedule([demo], now).upcoming.length, 0, "a finished demo must not be 'upcoming'");
  }
  // …and it IS live while genuinely running, so the guard isn't vacuous.
  assert.equal(getClassState(demo, new Date("2026-07-16T10:05:00Z")), "live");
});

// ---------------------------------------------------------------------------
// Countdown — the ticking timer in the last 10 minutes before a class
// ---------------------------------------------------------------------------
test("msUntilStart measures the gap to the start time", () => {
  assert.equal(msUntilStart({ start_at: "2026-07-27T12:05:00Z" }, NOON), 5 * 60 * 1000);
  // Negative once the class has begun.
  assert.equal(msUntilStart({ start_at: "2026-07-27T11:55:00Z" }, NOON), -5 * 60 * 1000);
});

test("msUntilStart returns null when there is no usable start time", () => {
  assert.equal(msUntilStart({}, NOON), null);
  assert.equal(msUntilStart({ start_at: null }, NOON), null);
  assert.equal(msUntilStart({ start_at: "not-a-date" }, NOON), null);
  assert.equal(msUntilStart(null, NOON), null);
});

test("the countdown runs only inside the final 10 minutes", () => {
  assert.equal(shouldCountDown({ start_at: "2026-07-27T12:10:00Z" }, NOON), true);  // exactly 10m
  assert.equal(shouldCountDown({ start_at: "2026-07-27T12:05:00Z" }, NOON), true);
  assert.equal(shouldCountDown({ start_at: "2026-07-27T12:00:01Z" }, NOON), true);
  // Outside the window — static badge instead.
  assert.equal(shouldCountDown({ start_at: "2026-07-27T12:10:01Z" }, NOON), false); // 10m + 1s
  assert.equal(shouldCountDown({ start_at: "2026-07-27T12:14:00Z" }, NOON), false); // "soon" but >10m
});

test("the countdown stops the moment the class starts", () => {
  // At/after the start there is nothing to count down to — the row flips to
  // "Live now" instead of showing a frozen or negative timer.
  assert.equal(shouldCountDown({ start_at: "2026-07-27T12:00:00Z" }, NOON), false);
  assert.equal(shouldCountDown({ start_at: "2026-07-27T11:59:00Z" }, NOON), false);
});

test("shouldCountDown tolerates missing/malformed times", () => {
  assert.equal(shouldCountDown(null, NOON), false);
  assert.equal(shouldCountDown({}, NOON), false);
  assert.equal(shouldCountDown({ start_at: "nope" }, NOON), false);
});

test("formatCountdown renders M:SS with zero-padded seconds", () => {
  assert.equal(formatCountdown(9 * 60 * 1000 + 5000), "9:05");
  assert.equal(formatCountdown(60 * 1000), "1:00");
  assert.equal(formatCountdown(9000), "0:09");
});

test("formatCountdown rounds seconds UP", () => {
  // A 10-minute countdown must read "10:00" on the first frame, not "9:59",
  // and must not show 0:00 while time remains.
  assert.equal(formatCountdown(10 * 60 * 1000), "10:00");
  assert.equal(formatCountdown(9 * 60 * 1000 + 59_001), "10:00");
  assert.equal(formatCountdown(1), "0:01");
  assert.equal(formatCountdown(999), "0:01");
});

test("formatCountdown clamps at zero instead of going negative", () => {
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(-5000), "0:00");
});

test("formatCountdown handles null/invalid input", () => {
  assert.equal(formatCountdown(null), "0:00");
  assert.equal(formatCountdown(undefined), "0:00");
  assert.equal(formatCountdown(NaN), "0:00");
  assert.equal(formatCountdown(Infinity), "0:00");
});

test("formatCountdown switches to H:MM:SS past an hour", () => {
  // Not reachable from the 10-minute window, but the formatter is generic and
  // must not render "65:00" for over an hour.
  assert.equal(formatCountdown(60 * 60 * 1000), "1:00:00");
  assert.equal(formatCountdown(65 * 60 * 1000 + 7000), "1:05:07");
});

test("countdown and live state never both apply", () => {
  // The badge is either a timer or "Live now" — never both, at any instant.
  for (const offset of [-60000, -1, 0, 1, 1000, 599_000, 600_000, 600_001]) {
    const start = new Date(NOON.getTime() + offset).toISOString();
    const c = { start_at: start, end_at: new Date(NOON.getTime() + offset + 3600_000).toISOString() };
    const counting = shouldCountDown(c, NOON);
    const live = getClassState(c, NOON) === "live";
    assert.ok(!(counting && live), `offset ${offset} was both counting down and live`);
  }
});

// ---------------------------------------------------------------------------
// splitSchedule — the teacher dashboard's upcoming classes / demos
// ---------------------------------------------------------------------------
test("splitSchedule separates finished sessions from upcoming ones", () => {
  const past = { id: 1, start_at: "2026-07-27T09:00:00Z", end_at: "2026-07-27T10:00:00Z" };
  const future = { id: 2, start_at: "2026-07-27T15:00:00Z", end_at: "2026-07-27T16:00:00Z" };
  const { upcoming, past: done } = splitSchedule([past, future], NOON);
  assert.deepEqual(upcoming.map((x) => x.id), [2]);
  assert.deepEqual(done.map((x) => x.id), [1]);
});

test("a session in progress counts as upcoming, not past", () => {
  // It's the thing the teacher needs RIGHT NOW — burying it under "past"
  // would hide the session they're supposed to be teaching.
  const live = { id: 1, start_at: "2026-07-27T11:30:00Z", end_at: "2026-07-27T12:30:00Z" };
  const { upcoming, past } = splitSchedule([live], NOON);
  assert.deepEqual(upcoming.map((x) => x.id), [1]);
  assert.equal(past.length, 0);
});

test("upcoming sessions come back soonest-first", () => {
  const items = [
    { id: 1, start_at: "2026-07-29T10:00:00Z" },
    { id: 2, start_at: "2026-07-27T18:00:00Z" },
    { id: 3, start_at: "2026-07-28T10:00:00Z" },
  ];
  assert.deepEqual(splitSchedule(items, NOON).upcoming.map((x) => x.id), [2, 3, 1]);
});

test("past sessions come back most-recent-first", () => {
  const items = [
    { id: 1, start_at: "2026-07-20T10:00:00Z", end_at: "2026-07-20T11:00:00Z" },
    { id: 2, start_at: "2026-07-26T10:00:00Z", end_at: "2026-07-26T11:00:00Z" },
  ];
  assert.deepEqual(splitSchedule(items, NOON).past.map((x) => x.id), [2, 1]);
});

test("a session with no end_at is treated as one hour long", () => {
  // Started 30m ago, no end → still running → upcoming.
  assert.equal(splitSchedule([{ id: 1, start_at: "2026-07-27T11:30:00Z" }], NOON).upcoming.length, 1);
  // Started 2h ago, no end → finished.
  assert.equal(splitSchedule([{ id: 1, start_at: "2026-07-27T10:00:00Z" }], NOON).past.length, 1);
});

test("undated sessions stay visible as upcoming rather than vanishing", () => {
  // A scheduling mistake should be obvious to the teacher, not silently
  // dropped from both lists.
  const { upcoming, past } = splitSchedule(
    [{ id: 1, start_at: null }, { id: 2, start_at: "not-a-date" }],
    NOON,
  );
  assert.equal(upcoming.length, 2);
  assert.equal(past.length, 0);
});

test("undated sessions sort after dated ones", () => {
  const items = [
    { id: 1, start_at: null },
    { id: 2, start_at: "2026-07-27T18:00:00Z" },
  ];
  assert.deepEqual(splitSchedule(items, NOON).upcoming.map((x) => x.id), [2, 1]);
});

test("splitSchedule handles empty and invalid input", () => {
  assert.deepEqual(splitSchedule([], NOON), { upcoming: [], past: [] });
  assert.deepEqual(splitSchedule(null, NOON), { upcoming: [], past: [] });
  assert.deepEqual(splitSchedule(undefined, NOON), { upcoming: [], past: [] });
});

test("splitSchedule never loses or duplicates a session", () => {
  const items = [
    { id: 1, start_at: "2026-07-20T10:00:00Z", end_at: "2026-07-20T11:00:00Z" },
    { id: 2, start_at: "2026-07-27T11:30:00Z", end_at: "2026-07-27T12:30:00Z" },
    { id: 3, start_at: "2026-07-29T10:00:00Z" },
    { id: 4, start_at: null },
  ];
  const { upcoming, past } = splitSchedule(items, NOON);
  const ids = [...upcoming, ...past].map((x) => x.id).sort();
  assert.deepEqual(ids, [1, 2, 3, 4]);
  assert.equal(upcoming.length + past.length, items.length);
});

test("a session drops out of 'upcoming' as soon as it ends", () => {
  // Regression: the teacher dashboard memoised splitSchedule against the fetched
  // data only, so the clock was read once when the feed loaded and a finished
  // session stayed listed under "Upcoming" for as long as the tab was open.
  // Evaluated against a moving clock, the same session must move to `past`.
  const s = { id: 1, start_at: "2026-07-28T10:00:00Z", end_at: "2026-07-28T11:00:00Z" };
  const before = new Date("2026-07-28T09:00:00Z");  // not started
  const during = new Date("2026-07-28T10:30:00Z");  // running
  const after  = new Date("2026-07-28T11:00:01Z");  // just ended

  assert.equal(splitSchedule([s], before).upcoming.length, 1, "should be upcoming before it starts");
  assert.equal(splitSchedule([s], during).upcoming.length, 1, "should still be upcoming while running");
  assert.equal(splitSchedule([s], after).upcoming.length, 0, "must leave upcoming once ended");
  assert.equal(splitSchedule([s], after).past.length, 1, "must appear under past once ended");
});

test("splitSchedule does not mutate the input array", () => {
  // It sorts internally; the caller's array (used elsewhere in the UI) must
  // keep its original order.
  const items = [
    { id: 1, start_at: "2026-07-29T10:00:00Z" },
    { id: 2, start_at: "2026-07-27T18:00:00Z" },
  ];
  splitSchedule(items, NOON);
  assert.deepEqual(items.map((x) => x.id), [1, 2]);
});

// ---------------------------------------------------------------------------
// displayName / firstName / initialsOf — greeting the student by their name
// ---------------------------------------------------------------------------
test("displayName uses the name the student registered with", () => {
  assert.equal(displayName({ name: "Harsha Vardhan", email: "h@x.com" }), "Harsha Vardhan");
});

test("displayName falls back to the email LOCAL part, not the full address", () => {
  // Greeting someone "Welcome back, harsha@example.com" reads like a bug.
  assert.equal(displayName({ name: "", email: "harsha@example.com" }), "harsha");
  assert.equal(displayName({ name: null, email: "harsha@example.com" }), "harsha");
});

test("displayName treats a whitespace-only name as absent", () => {
  // Otherwise the sidebar renders a blank greeting.
  assert.equal(displayName({ name: "   ", email: "harsha@example.com" }), "harsha");
});

test("displayName falls back to 'Student' when there is nothing to show", () => {
  assert.equal(displayName({}), "Student");
  assert.equal(displayName(null), "Student");
  assert.equal(displayName(undefined), "Student");
  assert.equal(displayName({ name: "  ", email: "  " }), "Student");
  // A malformed email with no local part must not yield an empty greeting.
  assert.equal(displayName({ email: "@nolocal.com" }), "Student");
});

test("displayName ignores non-string values", () => {
  assert.equal(displayName({ name: 42, email: null }), "Student");
});

test("firstName returns only the first word", () => {
  assert.equal(firstName({ name: "Harsha Vardhan P" }), "Harsha");
  assert.equal(firstName({ name: "Harsha" }), "Harsha");
  assert.equal(firstName({ email: "harsha@example.com" }), "harsha");
  assert.equal(firstName(null), "Student");
});

test("firstName collapses extra whitespace between names", () => {
  assert.equal(firstName({ name: "  Harsha   Vardhan  " }), "Harsha");
});

test("initialsOf uses first and last name, never the middle", () => {
  assert.equal(initialsOf({ name: "Harsha Vardhan P" }), "HP");
  assert.equal(initialsOf({ name: "Harsha Vardhan" }), "HV");
});

test("initialsOf returns a single letter for a one-word name", () => {
  assert.equal(initialsOf({ name: "Harsha" }), "H");
  assert.equal(initialsOf({ email: "harsha@example.com" }), "H");
});

test("initialsOf always yields something renderable", () => {
  // An empty avatar circle looks broken, so there is always a letter.
  assert.equal(initialsOf(null), "S");
  assert.equal(initialsOf({}), "S");
  assert.equal(initialsOf({ name: "   " }), "S");
});

test("greeting always returns one of the three known phrases", () => {
  const allowed = new Set(["Good morning", "Good afternoon", "Good evening"]);
  for (let h = 0; h < 24; h += 1) {
    assert.ok(allowed.has(greeting(new Date(2026, 6, 27, h, 0))), `hour ${h} produced an unexpected greeting`);
  }
});
