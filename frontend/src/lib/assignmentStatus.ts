/**
 * Pure helpers for presenting a student's assignments.
 *
 * Kept free of React/DOM/network so the rules can be unit-tested directly (see
 * assignmentStatus.test.mjs), the same approach used for roleRouting.ts.
 *
 * The server returns each assignment with the student's OWN submissions array
 * (filtered by their student_id, empty when they haven't submitted). Everything
 * a student sees about their standing is derived from that array plus due_date.
 */

/** What the student's standing on one assignment is, in priority order. */
export type AssignmentState = "graded" | "submitted" | "overdue" | "pending";

interface SubmissionLike {
  status?: string | null;
  score?: number | null;
}

interface AssignmentLike {
  due_date?: string | null;
  submissions?: SubmissionLike[] | null;
}

/** The student's submission for an assignment, or null when unsubmitted. */
export function getSubmission<T extends SubmissionLike>(
  a: { submissions?: T[] | null } | null | undefined,
): T | null {
  const list = a?.submissions;
  if (!Array.isArray(list) || list.length === 0) return null;
  // A student submits at most once per assignment, but guard anyway: a real
  // submission always beats a placeholder 'not_submitted' row.
  return list.find((s) => s?.status !== "not_submitted") ?? null;
}

/**
 * Resolve the badge state for one assignment.
 *
 * Order matters: a graded/submitted assignment is NEVER shown as overdue —
 * being marked late for work you already handed in is both wrong and alarming.
 * Only unsubmitted work past its due date is overdue.
 */
export function getAssignmentState(
  a: AssignmentLike | null | undefined,
  now: Date = new Date(),
): AssignmentState {
  const sub = getSubmission(a);
  if (sub) return sub.status === "graded" ? "graded" : "submitted";

  const due = a?.due_date ? new Date(a.due_date) : null;
  if (due && !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) {
    return "overdue";
  }
  return "pending";
}

/** Counts for the dashboard summary tiles. */
export interface AssignmentSummary {
  total: number;
  pending: number;
  submitted: number;
  graded: number;
  overdue: number;
}

export function summarizeAssignments(
  items: AssignmentLike[] | null | undefined,
  now: Date = new Date(),
): AssignmentSummary {
  const out: AssignmentSummary = { total: 0, pending: 0, submitted: 0, graded: 0, overdue: 0 };
  if (!Array.isArray(items)) return out;
  for (const a of items) {
    out.total += 1;
    out[getAssignmentState(a, now)] += 1;
  }
  return out;
}

/** Where a scheduled class sits relative to now. */
export type ClassState = "live" | "soon" | "upcoming";

interface ClassLike {
  start_at?: string | null;
  end_at?: string | null;
}

/** How far ahead of the start a class counts as "starting soon" (15 minutes). */
export const SOON_MS = 15 * 60 * 1000;

/** Inside this window the badge becomes a live ticking countdown (10 minutes). */
export const COUNTDOWN_MS = 10 * 60 * 1000;

/**
 * Milliseconds until a class starts, or null when there's no usable start time.
 * Negative once the class has started.
 */
export function msUntilStart(
  c: ClassLike | null | undefined,
  now: Date = new Date(),
): number | null {
  const raw = c?.start_at ? new Date(c.start_at) : null;
  if (!raw || Number.isNaN(raw.getTime())) return null;
  return raw.getTime() - now.getTime();
}

/**
 * Should this class show a ticking countdown instead of a static badge?
 * Only in the final 10 minutes before it starts — not once it's running.
 */
export function shouldCountDown(
  c: ClassLike | null | undefined,
  now: Date = new Date(),
): boolean {
  const ms = msUntilStart(c, now);
  return ms !== null && ms > 0 && ms <= COUNTDOWN_MS;
}

/**
 * Format a remaining duration as "M:SS" (or "H:MM:SS" past an hour).
 *
 * Seconds are rounded UP, so a countdown started at 10:00 shows "10:00" rather
 * than immediately flicking to "9:59", and it reaches "0:01" before "0:00" —
 * i.e. it never shows 0:00 while there is still time left. Clamped at 0:00.
 */
export function formatCountdown(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Classify a class for display.
 *
 *  - "live"     — happening right now (started, not yet ended)
 *  - "soon"     — starts within the next 15 minutes
 *  - "upcoming" — anything later, or with no usable start time
 *
 * A class with no end_at is treated as one hour long, matching how the
 * schedule elsewhere in the app assumes a default session length.
 */
export function getClassState(
  c: ClassLike | null | undefined,
  now: Date = new Date(),
): ClassState {
  const startRaw = c?.start_at ? new Date(c.start_at) : null;
  const start = startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : null;
  if (!start) return "upcoming";

  const endRaw = c?.end_at ? new Date(c.end_at) : null;
  const end =
    endRaw && !Number.isNaN(endRaw.getTime())
      ? endRaw
      : new Date(start.getTime() + 60 * 60 * 1000);

  const t = now.getTime();
  if (t >= start.getTime() && t < end.getTime()) return "live";
  if (start.getTime() - t <= SOON_MS && start.getTime() > t) return "soon";
  return "upcoming";
}

/**
 * Should the "Join" button be active?
 *
 * Only when there IS a link and the class is live or about to start — a join
 * button that is live all day invites students into an empty room, and one
 * that appears only at the exact start time makes them late.
 */
export function canJoinClass(
  c: (ClassLike & { meeting_link?: string | null }) | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!c?.meeting_link) return false;
  const state = getClassState(c, now);
  return state === "live" || state === "soon";
}

/**
 * Split scheduled sessions (classes or demos) into upcoming vs finished.
 *
 * "Upcoming" means it has not ENDED yet — a session in progress belongs with
 * the upcoming ones, because it is the thing the teacher needs right now.
 * Sessions with no end_at fall back to a one-hour window, matching
 * getClassState. Undated sessions are treated as upcoming rather than silently
 * dropped, so a scheduling mistake stays visible instead of disappearing.
 *
 * Upcoming come back soonest-first; finished come back most-recent-first.
 */
export function splitSchedule<T extends ClassLike>(
  items: T[] | null | undefined,
  now: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  if (!Array.isArray(items)) return { upcoming, past };

  const startMs = (x: ClassLike) => {
    const d = x?.start_at ? new Date(x.start_at) : null;
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
  };

  for (const it of items) {
    const s = startMs(it);
    if (s === null) { upcoming.push(it); continue; }
    const endRaw = it?.end_at ? new Date(it.end_at) : null;
    const endMs = endRaw && !Number.isNaN(endRaw.getTime())
      ? endRaw.getTime()
      : s + 60 * 60 * 1000;
    (endMs >= now.getTime() ? upcoming : past).push(it);
  }

  const byStart = (dir: 1 | -1) => (a: T, b: T) => {
    const sa = startMs(a);
    const sb = startMs(b);
    // Undated entries sort last regardless of direction.
    if (sa === null) return 1;
    if (sb === null) return -1;
    return (sa - sb) * dir;
  };
  upcoming.sort(byStart(1));
  past.sort(byStart(-1));
  return { upcoming, past };
}

/**
 * The student's display name, from the name they registered with.
 *
 * Falls back to the local part of their email (never the full address — the
 * domain is noise in a greeting), then to "Student" when we have neither.
 * Whitespace-only names are treated as absent rather than rendered blank.
 */
export function displayName(
  user: { name?: string | null; email?: string | null } | null | undefined,
): string {
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  if (name) return name;
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (email) {
    const local = email.split("@")[0].trim();
    if (local) return local;
  }
  return "Student";
}

/** Just the first word of the display name — for short, friendly greetings. */
export function firstName(
  user: { name?: string | null; email?: string | null } | null | undefined,
): string {
  return displayName(user).split(/\s+/)[0];
}

/**
 * Up-to-two-letter avatar initials from the student's name.
 * Uses first + last word so "Harsha Vardhan P" reads "HP", not "HV".
 */
export function initialsOf(
  user: { name?: string | null; email?: string | null } | null | undefined,
): string {
  const parts = displayName(user).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "S";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Time-of-day greeting for the dashboard hero.
 *
 * Boundaries: <12 morning, <17 afternoon, otherwise evening — evaluated in the
 * viewer's LOCAL time, which is what "good morning" should track.
 */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Average completion across enrolled courses, 0-100 (rounded).
 * Returns 0 for an empty list rather than NaN.
 */
export function averageProgress(
  courses: { progress?: number | string | null }[] | null | undefined,
): number {
  if (!Array.isArray(courses) || courses.length === 0) return 0;
  const sum = courses.reduce((acc, c) => {
    const p = Number(c?.progress);
    // Clamp: a malformed/out-of-range value must not skew the average.
    return acc + (Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0);
  }, 0);
  return Math.round(sum / courses.length);
}
