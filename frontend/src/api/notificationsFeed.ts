/**
 * Notifications feed — shared aggregation + unread tracking.
 *
 * There is no notifications backend. The feed is built client-side from
 * existing student-flow data (assessments, program request, live classes,
 * certificates). This module is the single source of truth used by BOTH:
 *   - NotificationsPage  — renders the full feed
 *   - the bell badge     — needs only the unread count
 *
 * "Unread" is tracked in localStorage: each feed item has a stable id; the
 * ids the student has already seen are stored, and unread = feed ids not in
 * that set. Opening the Notifications page marks every current id seen.
 * This is per-device (localStorage), not synced across devices.
 */

import { getProfile } from "./authApi";
import { getMyProgramRequest } from "./programRequestApi";
import { getUserProgress } from "./userProgressApi";
import { listMyCertificates, getMyTeacherFeedback } from "./course/courseApi";
import { listLiveClasses } from "@/zoom-live-class/player/liveClassApi";
import { listPendingForms } from "./feedbackFormsApi";

// A live class is treated as "done" (feedback-ready) once this long after its
// scheduled start. LiveClass has no status column, so completion is derived
// from class_date_and_time + this window.
const LIVE_CLASS_SESSION_MS = 60 * 60 * 1000; // 1 hour

// Pass mark — kept in sync with Programspage.tsx / Assesments.jsx.
export const PASS_THRESHOLD = 50;

export type Severity = "success" | "warning" | "info";

export interface FeedItem {
  id: string;
  iconKey: "pass" | "fail" | "mail" | "video" | "award";
  severity: Severity;
  title: string;
  body?: string;
  when?: string; // ISO date, optional
  link?: string; // optional in-app destination
}

// localStorage key for the per-user set of seen feed-item ids. Scoped by the
// student's userId so two accounts on one browser don't share seen-state.
const seenKey = () => {
  const uid = localStorage.getItem("userId") || "anon";
  return `notif_seen_${uid}`;
};

const readSeen = (): Set<string> => {
  try {
    const raw = localStorage.getItem(seenKey());
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
};

const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(seenKey(), JSON.stringify([...new Set(ids)]));
  } catch {
    /* storage full / disabled — non-fatal */
  }
};

// Minimal shapes for the loosely-typed data sources this feed aggregates.
interface ProfileData { preScore?: number | string | null; postScore?: number | string | null }
interface ProgramReq { id?: number | string; program?: string; created_at?: string }
interface ProgressRow { enrolled?: boolean; course_id?: number | string }
interface MyFeedbackRow { course_id?: number | string | null }
interface LiveClassRow { id: number | string; class_topic?: string; class_date_and_time?: string; host?: { name?: string } }
interface CertRow { id?: number | string; identifier?: string; created_at?: string; course?: { title?: string } }

/**
 * Build the notifications feed by aggregating existing student-flow data.
 * Each source is fetched independently; a failing source is skipped so the
 * feed degrades gracefully rather than going blank.
 */
export async function buildFeed(): Promise<FeedItem[]> {
  const feed: FeedItem[] = [];

  // 1. Pre / post-assessment — only once actually TAKEN (score != null).
  try {
    const res = await getProfile();
    const data = (res?.data ?? {}) as ProfileData;

    if (data.preScore != null) {
      const pre = Number(data.preScore);
      const passed = pre >= PASS_THRESHOLD;
      feed.push({
        id: "pre-assessment",
        iconKey: passed ? "pass" : "fail",
        severity: passed ? "success" : "warning",
        title: passed ? "Pre-assessment passed" : "Pre-assessment not passed yet",
        body: passed
          ? `You scored ${pre}% — programs are now unlocked. Head to My Courses to begin.`
          : `You scored ${pre}%. Retake the pre-assessment to unlock programs.`,
      });
    }
    if (data.postScore != null) {
      const post = Number(data.postScore);
      const passed = post >= PASS_THRESHOLD;
      feed.push({
        id: "post-assessment",
        iconKey: passed ? "pass" : "fail",
        severity: passed ? "success" : "warning",
        title: passed ? "Post-assessment passed" : "Post-assessment not passed yet",
        body: passed
          ? `You scored ${post}% — you're eligible for your certificate.`
          : `You scored ${post}%. Pass the post-assessment to earn your certificate.`,
      });
    }
  } catch {
    /* skip assessment section */
  }

  // 2. Program request received.
  try {
    const request = (await getMyProgramRequest()) as ProgramReq | null;
    if (request && request.program) {
      feed.push({
        id: `program-request-${request.id ?? "x"}`,
        iconKey: "mail",
        severity: "info",
        title: "Program invitation received",
        body: `An admin invited you to "${request.program}". Open My Courses to accept or decline.`,
        when: request.created_at,
        link: "/dashboard?tab=courses",
      });
    }
  } catch {
    /* skip program-request section */
  }

  // 3. Live classes on enrolled courses. Upcoming/live → "join" reminder.
  //    Once a class has ENDED → a "share your feedback" prompt that deep-links
  //    to the Class Feedback tab — UNLESS the student already rated that course
  //    (so we don't nag after they've submitted).
  try {
    const progress = (await getUserProgress()) as { rows?: ProgressRow[] };
    const rows: ProgressRow[] = progress?.rows ?? [];
    const courseIds = [
      ...new Set(
        rows.filter((r) => r.enrolled && r.course_id).map((r) => r.course_id as number | string)
      ),
    ];

    // Courses this student has already given class feedback for.
    let ratedCourseIds = new Set<string>();
    try {
      const mine = (await getMyTeacherFeedback()) as MyFeedbackRow[];
      ratedCourseIds = new Set(mine.map((f) => String(f.course_id)).filter((x) => x && x !== "null"));
    } catch {
      /* no feedback yet / not signed in */
    }

    const perCourse = await Promise.all(
      courseIds.map((cid) =>
        listLiveClasses(cid)
          .then((r) => ({ cid, list: ((r as { live_classes?: LiveClassRow[] }).live_classes || []) }))
          .catch(() => ({ cid, list: [] as LiveClassRow[] }))
      )
    );
    for (const { cid, list } of perCourse) {
      for (const lc of list) {
        const startMs = lc.class_date_and_time ? new Date(lc.class_date_and_time).getTime() : NaN;
        const ended = !Number.isNaN(startMs) && startMs + LIVE_CLASS_SESSION_MS < Date.now();
        if (ended) {
          // Class is over → prompt for feedback (skip if already rated).
          if (ratedCourseIds.has(String(cid))) continue;
          feed.push({
            id: `class-feedback-${lc.id}`,
            iconKey: "video",
            severity: "info",
            title: "Share your class feedback",
            body:
              `Your live class "${lc.class_topic}" has ended` +
              (lc.host?.name ? ` with ${lc.host.name}` : "") +
              ". Tap to rate the class and your teacher.",
            when: lc.class_date_and_time,
            link: "/dashboard?tab=feedback",
          });
        } else {
          feed.push({
            id: `live-class-${lc.id}`,
            iconKey: "video",
            severity: "info",
            title: "Live class scheduled",
            body:
              `"${lc.class_topic}"` +
              (lc.host?.name ? ` with ${lc.host.name}` : "") +
              ". Join from the course player's Live class tab.",
            when: lc.class_date_and_time,
          });
        }
      }
    }
  } catch {
    /* skip live-class section */
  }

  // 4. Certificates earned.
  try {
    const res = (await listMyCertificates()) as { certificates?: CertRow[] };
    const certs: CertRow[] = res?.certificates ?? [];
    for (const c of certs) {
      feed.push({
        id: `certificate-${c.id ?? c.identifier}`,
        iconKey: "award",
        severity: "success",
        title: "Certificate earned",
        body: `You earned a certificate${
          c.course?.title ? ` for "${c.course.title}"` : ""
        }.`,
        when: c.created_at,
        link: "/dashboard?tab=certificates",
      });
    }
  } catch {
    /* skip certificate section */
  }

  // 5. Teacher-authored feedback forms enabled for this student that they
  //    haven't submitted yet. One-time: once submitted, the server stops
  //    returning it, so the notification disappears on its own.
  try {
    const pending = await listPendingForms();
    for (const f of pending) {
      feed.push({
        id: `feedback-form-${f.id}`,
        iconKey: "mail",
        severity: "info",
        title: "New feedback form",
        body:
          `Your teacher${f.teacher_name ? ` ${f.teacher_name}` : ""} asked for your feedback` +
          (f.title ? `: "${f.title}"` : "") +
          ". Tap to fill it in — it only takes a minute.",
        when: f.enabled_at || undefined,
        link: "/dashboard?tab=feedback-forms",
      });
    }
  } catch {
    /* skip feedback-form section */
  }

  // Newest first when a date is known; undated items keep insertion order.
  feed.sort((a, b) => {
    const ta = a.when ? new Date(a.when).getTime() : 0;
    const tb = b.when ? new Date(b.when).getTime() : 0;
    return tb - ta;
  });
  return feed;
}

/** Number of feed items the student hasn't seen yet. */
export async function getUnreadCount(): Promise<number> {
  try {
    const feed = await buildFeed();
    const seen = readSeen();
    return feed.filter((f) => !seen.has(f.id)).length;
  } catch {
    return 0;
  }
}

/** Mark every id in the given feed as seen — called when the page is opened. */
export function markFeedSeen(feed: FeedItem[]): void {
  writeSeen(feed.map((f) => f.id));
}

/** True if an item id has already been seen — for per-row "new" styling. */
export function isSeen(id: string): boolean {
  return readSeen().has(id);
}
