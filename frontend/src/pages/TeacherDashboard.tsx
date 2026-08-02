import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";
import { updateProfile, changePassword } from "@/api/authApi";
import { uploadStudentPhoto } from "@/api/leadApi";
import { toast } from "react-toastify";
// REMOVED: TeachingAssignmentsIndex (teaching assignment feature removed)
// Replaced by Batch Management System
import ScheduleCalendar, { type ScheduleEvent } from "@/components/schedule/ScheduleCalendar";
import FeedbackFormsView from "@/components/teacher/FeedbackFormsView";
import Navbar from "@/components/layout/Navbar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";
import { mergePickedFiles } from "@/lib/filePicker";
// Shared with the student dashboard so both shells classify sessions, run the
// pre-class countdown and greet the user with identical, unit-tested rules.
import {
  greeting, firstName, splitSchedule,
  getClassState, canJoinClass, shouldCountDown, msUntilStart, formatCountdown,
} from "@/lib/assignmentStatus";
import {
  Menu,
  X,
  Video,
  Calendar,
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  MonitorPlay,
  Users,
  Library,
  Contact,
  Megaphone,
  IndianRupee,
  ClipboardList,
  ClipboardCheck,
  Power,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Clock3,
} from "lucide-react";

/**
 * VR Robotics Academy — Teacher (Mentor) Dashboard.
 * Standalone dashboard view (its own sidebar; rendered outside the marketing
 * Layout). New addition only — does not change any existing functionality.
 */

// Only sections wired to real admin data. Dashboard(earnings), Referral, Payout,
// Tasks were placeholders ("coming soon" / unbuilt earnings) → removed until
// the earning rules are defined.
// Slots + Free Schedule removed from the teacher sidebar by request. Their
// view components (SlotsView / FreeScheduleView) and the render branches below
// are left intact but unreachable, so the feature can be restored by re-adding
// the nav entries.
const navItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "My Courses", icon: MonitorPlay },
  { name: "Assignments", icon: ClipboardList },
  { name: "Demos", icon: MessageSquare },
  { name: "Classes", icon: MonitorPlay },
  { name: "Calendar", icon: CalendarDays },
  { name: "Students", icon: Users },
  { name: "Feedback Forms", icon: ClipboardList },
  { name: "Resources", icon: Library },
  { name: "Profile", icon: Contact },
];

/* The old placeholder earnings model (DashboardData / PLACEHOLDER_DATA) was
   removed with the mock Dashboard tab: it rendered hardcoded "₹0" and "—"
   against no backend, so it reported figures that were never real. The tab now
   shows live teaching analytics — see TeacherOverview below. */

// Small figure used in the per-student detail panel (Students tab).
const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex-1 min-w-[140px] rounded-xl bg-muted/60 px-5 py-4">
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
  </div>
);

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

// The /by-teacher endpoints are now gated (verified teacher self / admin) — send
// the auth token so the teacher can read their OWN data.
const teacherAuthHeaders = (): Record<string, string> => {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface TeacherSlot {
  id: number;
  name: string;
  course_title: string | null;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  students: { id: string; name: string }[];
}

// All times shown to teachers are in India Standard Time (Asia/Kolkata),
// 12-hour, regardless of the viewer's device timezone.
const IST = "Asia/Kolkata";

const fmtSlot = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST,
  });
};

// Split helpers for the table views (Date / Day / Time columns).
const fmtDate = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: IST });
};
const fmtDay = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { weekday: "short", timeZone: IST });
};
const fmtTime = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST });
};
// "HH:MM" clock strings (timetable / free slots) -> "h:MM AM/PM". These are
// already wall-clock (no timezone), so just reformat to 12-hour.
const hhmmTo12 = (raw: string | null) => {
  if (!raw) return "—";
  const [hRaw, mRaw] = String(raw).split(":");
  const h = Number(hRaw);
  if (Number.isNaN(h)) return raw;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(mRaw ?? "00").padStart(2, "0")} ${ampm}`;
};

/**
 * Slots assigned to the logged-in teacher. Mirrors the admin Slots feature:
 * whatever the super admin assigns to this teacher (by name) shows up here,
 * with course, time window, the Google Meet link, and the student roster.
 */
const SlotsView = ({ teacherId }: { teacherId?: string }) => {
  const [slots, setSlots] = useState<TeacherSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) { setSlots([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/slots/by-teacher/${teacherId}`, {
        params: { t: Date.now() },
        headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() },
        timeout: 30000,
      })
      .then(({ data }) => { if (!cancelled) setSlots(Array.isArray(data?.slots) ? data.slots : []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId]);

  if (!teacherId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Slots</h1>
        <p className="text-muted-foreground">Sign in as a teacher to see your assigned slots.</p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Calendar className="w-6 h-6 text-primary" /> My Slots
      </h1>
      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Loading slots…</p>
      ) : slots.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No slots assigned to you yet. Slots created for you in admin will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Slot Date</th>
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4">Slot Time</th>
                <th className="py-2 pr-4">Course</th>
                <th className="py-2 pr-4">Students</th>
                <th className="py-2 pr-4">Session</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-3 pr-4 whitespace-nowrap">{fmtDate(s.start_at)}</td>
                  <td className="py-3 pr-4">{fmtDay(s.start_at)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{fmtTime(s.start_at)} – {fmtTime(s.end_at)}</td>
                  <td className="py-3 pr-4">{s.course_title || s.name || "—"}</td>
                  <td className="py-3 pr-4">{s.students.length}</td>
                  <td className="py-3 pr-4">
                    {s.meeting_link
                      ? <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-gradient-hero text-white text-xs font-semibold px-3 py-1.5"><Video className="w-3.5 h-3.5" /> Join</a>
                      : <span className="text-muted-foreground text-xs">NA</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

// Generic fetch for a teacher-scoped public endpoint. Returns the array under
// `key` (e.g. demos/classes/entries/resources). Live (no-cache) so admin
// additions show without stale data.
function useTeacherList<T>(teacherId: string | undefined, path: string, key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumping this re-runs the effect — how callers force a refetch after a
  // mutation (e.g. a teacher releasing a lesson) without duplicating the fetch.
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    if (!teacherId) { setItems([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/${path}/by-teacher/${teacherId}`, {
        params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000,
      })
      .then(({ data }) => { if (!cancelled) setItems(Array.isArray(data?.[key]) ? data[key] : []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId, path, key, nonce]);
  return { items, loading, refetch };
}

const Panel = ({ title, icon: Icon, children }: { title: string; icon: typeof Calendar; children: ReactNode }) => (
  <section className="bg-white rounded-2xl shadow-sm p-6">
    <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><Icon className="w-6 h-6 text-primary" /> {title}</h1>
    {children}
  </section>
);

const Empty = ({ text }: { text: string }) => <p className="text-muted-foreground py-8 text-center">{text}</p>;

/* ---------------------------------------------------------------------------
 * Shared session (class / demo) presentation
 *
 * Demos and Classes are the same shape of thing — a titled session with a time
 * window, a course and a meeting link — so they share one stats bar, one row
 * renderer and one live/upcoming/past split. Previously each tab rendered its
 * own markup with no notion of whether a session was live, finished or still
 * to come, and both showed an always-active Join link.
 * ------------------------------------------------------------------------- */

/**
 * Re-render trigger for time-sensitive rows.
 *
 * This hook deliberately returns NOTHING. Callers read `new Date()` directly,
 * so the displayed state is always derived from the real clock and the
 * session's own start/end times — never from a stored timestamp that could go
 * stale. All this does is force a re-render often enough that the display keeps
 * up: once a second when something is visibly ticking (a countdown, a live
 * badge), otherwise every 15 seconds.
 *
 * The rate is recomputed on each tick from the session itself, so a row that
 * becomes imminent, goes live, or finishes speeds up or slows down on its own.
 */
function useNow(s: { start_at?: string | null; end_at?: string | null } | null | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    let id: number;
    const schedule = () => {
      const at = new Date();
      const fast = shouldCountDown(s, at) || getClassState(s, at) === "live";
      id = window.setTimeout(() => { force((n) => n + 1); schedule(); }, fast ? 1000 : 15000);
    };
    schedule();
    return () => window.clearTimeout(id);
  }, [s]);
}

/**
 * Re-render trigger for a LIST of time-sensitive sessions.
 *
 * Returns a counter whose only purpose is to invalidate `useMemo`s that read
 * the clock — the derived values themselves must still call `new Date()`, so
 * they always reflect the real time rather than when the data happened to load.
 *
 * Ticks once a second while any session is live or counting down, otherwise
 * every 15 seconds, so an idle schedule costs almost nothing.
 */
function useScheduleTick(items: { start_at?: string | null; end_at?: string | null }[]): number {
  const [tick, setTick] = useState(0);
  // Depend on the schedule's SHAPE, not the array identity: a re-fetch that
  // returns identical times must not restart the timer loop.
  const key = items.map((i) => `${i.start_at ?? ""}|${i.end_at ?? ""}`).join(",");
  useEffect(() => {
    let id: number;
    const schedule = () => {
      const at = new Date();
      const fast = items.some((i) => shouldCountDown(i, at) || getClassState(i, at) === "live");
      id = window.setTimeout(() => { setTick((n) => n + 1); schedule(); }, fast ? 1000 : 15000);
    };
    schedule();
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tick;
}

/** Day + time window for a session, in IST like the rest of the schedule UI. */
const fmtSessionWhen = (start: string | null, end: string | null) => {
  if (!start) return "Time to be confirmed";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "Time to be confirmed";
  const day = s.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: IST });
  const from = s.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST });
  const e = end ? new Date(end) : null;
  const to = e && !Number.isNaN(e.getTime())
    ? e.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST })
    : null;
  if (!to || !e) return `${day} · ${from}`;

  // When a session ENDS ON A DIFFERENT DAY, show that date too. Rendering only
  // the clock times ("3:34 pm – 3:36 pm") hid a 16 Jul → 31 Jul window and made
  // a two-week-long session look like a two-minute one — so a row that was
  // legitimately still running read as an obvious bug.
  const sameDay =
    s.toLocaleDateString("en-IN", { timeZone: IST }) === e.toLocaleDateString("en-IN", { timeZone: IST });
  if (sameDay) return `${day} · ${from} – ${to}`;

  const endDay = e.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: IST });
  return `${day} ${from} → ${endDay} ${to}`;
};

/** Normalised session row. Classes carry `name`, demos carry `title`. */
interface TeacherSession {
  id: number;
  title: string;
  course_title: string | null;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  student_count?: number;
}

/** Live / upcoming / completed counts for the stats bar. */
const sessionStats = (items: TeacherSession[], now = new Date()) => {
  const { upcoming, past } = splitSchedule(items, now);
  const live = items.filter((s) => getClassState(s, now) === "live").length;
  return {
    total: items.length,
    live,
    // "Scheduled" excludes the ones already running, so live + scheduled +
    // completed sums to the total without double-counting.
    scheduled: upcoming.length - live,
    completed: past.length,
  };
};

/**
 * One session, in the same visual language as the student dashboard: state
 * badge, countdown inside the last 10 minutes, and a Join button that is only
 * active while the session is live or imminent.
 *
 * `dimPast` greys finished sessions so the list reads chronologically at a
 * glance without hiding history.
 */
const TeacherSessionRow = ({ s, past = false }: { s: TeacherSession; past?: boolean }) => {
  // Whether a session is live is a pure function of ITS OWN start/end times and
  // the current wall clock — nothing else. `useNow` exists only to re-render as
  // time passes; it never decides the answer. Reading the clock fresh on every
  // render (rather than trusting a stored `now`) means the badge is correct on
  // the very first paint, even before any interval has fired.
  useNow(s);
  const at = new Date();

  const state = getClassState(s, at);
  const counting = shouldCountDown(s, at);
  const joinable = canJoinClass(s, at);
  const now = at;

  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 transition ${
      past ? "border-border/50 opacity-70" : "border-border/70 hover:border-primary/30"
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium m-0">{s.title}</p>
          {state === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Live now
            </span>
          )}
          {state === "soon" && !counting && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
              Starting soon
            </span>
          )}
          {past && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Completed
            </span>
          )}
        </div>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground m-0">
          <CalendarDays className="h-3.5 w-3.5" /> {fmtSessionWhen(s.start_at, s.end_at)}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground m-0">
          {s.course_title || "—"}
          {typeof s.student_count === "number"
            ? ` · ${s.student_count} student${s.student_count === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      {counting && (
        <div
          aria-live="off"
          className="flex shrink-0 flex-col items-center rounded-xl bg-amber-500/10 px-4 py-2 ring-1 ring-inset ring-amber-500/20"
        >
          <span className="inline-flex items-center gap-1.5 text-lg font-bold tabular-nums leading-none text-amber-700 dark:text-amber-400">
            <Clock3 className="h-4 w-4" />
            {formatCountdown(msUntilStart(s, now))}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
            Starts in
          </span>
        </div>
      )}

      {s.meeting_link ? (
        joinable ? (
          <a
            href={s.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-hero px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          >
            <Video className="h-4 w-4" /> Join
          </a>
        ) : past ? null : (
          <span className="shrink-0 rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            Link opens near start
          </span>
        )
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">No meeting link</span>
      )}
    </li>
  );
};

/** Stat chip for the session stats bar. */
const SessionStat = ({
  value, label, tone,
}: { value: number; label: string; tone: "red" | "amber" | "muted" | "primary" }) => {
  const tones = {
    red: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
    muted: "bg-muted text-muted-foreground ring-border",
    primary: "bg-primary/10 text-primary ring-primary/20",
  } as const;
  return (
    <div className={`flex-1 min-w-[110px] rounded-xl px-4 py-3 ring-1 ring-inset ${tones[tone]}`}>
      <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-medium">{label}</div>
    </div>
  );
};

/**
 * Shared body for the Demos and Classes tabs: a stats bar (total / live now /
 * scheduled / completed), then the sessions grouped into upcoming and past.
 */
const SessionsPanel = ({
  title, icon, items, loading, emptyText, noun,
}: {
  title: string;
  icon: typeof Calendar;
  items: TeacherSession[];
  loading: boolean;
  emptyText: string;
  noun: string;
}) => {
  // Stats and the upcoming/past split are computed from the CURRENT clock on
  // every render, so they can never disagree with the badges on the rows below.
  // `tick` only forces that recomputation to happen; it is never an input.
  const tick = useScheduleTick(items);

  /* eslint-disable react-hooks/exhaustive-deps */
  const stats = useMemo(() => sessionStats(items, new Date()), [items, tick]);
  const { upcoming, past } = useMemo(() => splitSchedule(items, new Date()), [items, tick]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <Panel title={title} icon={icon}>
      {loading ? (
        <Empty text={`Loading ${noun}…`} />
      ) : items.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-3">
            <SessionStat value={stats.total} label={`Total ${noun}`} tone="primary" />
            <SessionStat value={stats.live} label="Live now" tone="red" />
            <SessionStat value={stats.scheduled} label="Scheduled" tone="amber" />
            <SessionStat value={stats.completed} label="Completed" tone="muted" />
          </div>

          {upcoming.length > 0 && (
            <>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming
              </h3>
              <ul className="space-y-3 list-none p-0 m-0">
                {upcoming.map((s) => <TeacherSessionRow key={s.id} s={s} />)}
              </ul>
            </>
          )}

          {past.length > 0 && (
            <>
              <h3 className={`mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground ${upcoming.length > 0 ? "mt-8" : ""}`}>
                Completed
              </h3>
              <ul className="space-y-3 list-none p-0 m-0">
                {past.map((s) => <TeacherSessionRow key={s.id} s={s} past />)}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
};

const DemosView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading } = useTeacherList<{ id: number; title: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "demos", "demos");
  const sessions: TeacherSession[] = useMemo(
    () => items.map((d) => ({
      id: d.id, title: d.title || "Demo", course_title: d.course_title,
      start_at: d.start_at, end_at: d.end_at, meeting_link: d.meeting_link,
    })),
    [items],
  );
  return (
    <SessionsPanel
      title="My Demos"
      icon={MessageSquare}
      items={sessions}
      loading={loading}
      noun="demos"
      emptyText="No demos assigned to you yet."
    />
  );
};

// --- My Courses -------------------------------------------------------------
// Every course the teacher reaches through batch assignment, each with its FULL
// curriculum. Backed by GET /api/public/teacher-courses/by-teacher/:teacherId,
// which unions both teacher-assignment paths (batch_teachers roster +
// batches.primary_teacher_id) so the tab fills in regardless of which admin
// screen created the assignment.
interface TeacherCourseLesson {
  id: number;
  title: string | null;
  lesson_type: string | null;
  duration: string | null;
  is_free: number | null;
  is_released: boolean;
}
interface TeacherCourseSection {
  id: number | null;
  title: string | null;
  lessons: TeacherCourseLesson[];
}
interface TeacherCourseBatch {
  batch_id: string;
  batch_name: string | null;
  student_count: number;
}
interface TeacherCourse {
  course_id: number;
  title: string;
  thumbnail: string | null;
  short_description: string | null;
  level: string | null;
  batches: TeacherCourseBatch[];
  student_count: number;
  section_count: number;
  lesson_count: number;
  released_count: number;
  locked_count: number;
  sections: TeacherCourseSection[];
}

// One course card: header summary always visible, curriculum expandable. The
// first course starts expanded so the teacher lands on a populated tab rather
// than a wall of collapsed rows.
const CourseCurriculumCard = ({
  course,
  defaultOpen,
  onChanged,
}: {
  course: TeacherCourse;
  defaultOpen: boolean;
  onChanged: () => void;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  // Which batch the unlock applies to. A course card can cover several batches
  // (same syllabus, different cohorts) and a release is always per-batch, so
  // the teacher picks the cohort before unlocking. Single-batch courses just
  // use their only batch and never show the picker.
  const [batchId, setBatchId] = useState(course.batches[0]?.batch_id ?? "");
  // Lesson id currently being written — disables just that row's button.
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBatch = course.batches.find((b) => b.batch_id === batchId) || course.batches[0];

  const toggleRelease = async (lesson: TeacherCourseLesson) => {
    if (!batchId) { setError("This course has no batch assigned yet."); return; }
    setBusyId(lesson.id);
    setError(null);
    const action = lesson.is_released ? "revoke-lesson" : "release-lesson";
    try {
      await axios.post(
        `${ADMIN_BASE}/api/admin/batches/${encodeURIComponent(batchId)}/${action}`,
        { lesson_id: lesson.id },
        { headers: teacherAuthHeaders(), timeout: 30000 },
      );
      onChanged(); // refetch so counts + badges reflect the new state
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      setError(msg?.error || msg?.message || "Could not update the lesson. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
      >
        {course.thumbnail ? (
          <img src={course.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <MonitorPlay className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">{course.title}</h3>
          {course.short_description ? (
            <p className="text-sm text-muted-foreground line-clamp-1">{course.short_description}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span>{course.section_count} section{course.section_count === 1 ? "" : "s"}</span>
            <span>{course.lesson_count} lesson{course.lesson_count === 1 ? "" : "s"}</span>
            <span>{course.released_count} of {course.lesson_count} released</span>
            <span>{course.student_count} student{course.student_count === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {course.batches.map((b) => (
              <span key={b.batch_id} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {b.batch_name || b.batch_id}
              </span>
            ))}
          </div>
        </div>
        <ChevronRight className={`w-5 h-5 shrink-0 mt-1 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open ? (
        <div className="border-t border-border divide-y divide-border">
          {/* Cohort selector — a release only ever applies to one batch. */}
          {course.batches.length > 1 ? (
            <div className="p-4 flex flex-wrap items-center gap-2 bg-muted/30">
              <label htmlFor={`batch-${course.course_id}`} className="text-xs font-medium text-muted-foreground">
                Unlock for batch
              </label>
              <select
                id={`batch-${course.course_id}`}
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1 bg-background"
              >
                {course.batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_name || b.batch_id} ({b.student_count} student{b.student_count === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-600 px-4 py-2 bg-red-50">{error}</p>
          ) : null}

          {course.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              This course has no curriculum yet. Once an admin adds sections and lessons they appear here.
            </p>
          ) : (
            course.sections.map((s, si) => (
              <div key={s.id ?? `orphan-${si}`} className="p-4">
                <h4 className="font-medium text-sm mb-2">
                  {s.title || "Untitled section"}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {s.lessons.length} lesson{s.lessons.length === 1 ? "" : "s"}
                  </span>
                </h4>
                {s.lessons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No lessons in this section yet.</p>
                ) : (
                  <ol className="space-y-1">
                    {s.lessons.map((l, li) => (
                      <li key={l.id} className="flex items-center gap-2 text-sm py-1">
                        <span className="text-xs text-muted-foreground w-6 shrink-0">{li + 1}.</span>
                        <span className="flex-1 min-w-0 truncate">{l.title || "Untitled lesson"}</span>
                        {l.duration ? (
                          <span className="text-xs text-muted-foreground shrink-0">{l.duration}</span>
                        ) : null}
                        {/* No "Free" badge here: for a teacher, the only state
                            that matters is Released vs Locked. is_free is a
                            pricing flag and reads as "already open", which is
                            misleading next to the Unlock control. */}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                            l.is_released ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {l.is_released ? "Released" : "Locked"}
                        </span>
                        {/* The switch itself: until this is pressed the lesson
                            stays locked in the student's course player and its
                            video is withheld server-side. */}
                        <button
                          type="button"
                          onClick={() => toggleRelease(l)}
                          disabled={busyId === l.id || !batchId}
                          title={
                            activeBatch
                              ? `${l.is_released ? "Lock" : "Unlock"} for ${activeBatch.batch_name || activeBatch.batch_id}`
                              : "No batch assigned to this course"
                          }
                          className={`text-xs px-2 py-1 rounded-md shrink-0 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            l.is_released
                              ? "border border-border hover:bg-muted"
                              : "bg-primary text-primary-foreground hover:opacity-90"
                          }`}
                        >
                          {busyId === l.id ? "Saving…" : l.is_released ? "Lock" : "Unlock"}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

const MyCoursesView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading, refetch } = useTeacherList<TeacherCourse>(teacherId, "teacher-courses", "courses");

  if (!teacherId) return <Panel title="My Courses" icon={MonitorPlay}><Empty text="Sign in as a teacher to see your courses." /></Panel>;

  return (
    <Panel title="My Courses" icon={MonitorPlay}>
      {loading ? (
        <Empty text="Loading your courses…" />
      ) : items.length === 0 ? (
        <Empty text="No courses assigned to you yet. Once an admin adds you to a batch, that batch's course and full curriculum appear here." />
      ) : (
        <div className="space-y-4">
          {items.map((c, i) => (
            <CourseCurriculumCard key={c.course_id} course={c} defaultOpen={i === 0} onChanged={refetch} />
          ))}
        </div>
      )}
    </Panel>
  );
};

/* ---------------------------------------------------------------------------
   Assignments — create an assignment for one of my batches, read every
   student's response, and grade it. Backed by /api/admin/teacher-assignments,
   which scopes everything to the batches this teacher actually teaches.
--------------------------------------------------------------------------- */
interface TeacherAssignmentBatch {
  batch_id: string;
  batch_name: string;
  course_id: number | null;
  student_count: number;
}
interface AssignmentAttachment {
  kind: "file" | "link";
  url: string;
  name: string | null;
  mime: string | null;
}
interface TeacherAssignment {
  id: number;
  batch_id: string;
  batch_name: string;
  title: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  max_score: number;
  attachments: AssignmentAttachment[] | null;
  attachments_title: string | null;
  student_count: number;
  submitted_count: number;
  graded_count: number;
}
interface AssignmentStudentRow {
  user_id: string | null;
  name: string | null;
  email: string | null;
  unique_id: string | null;
  off_roster?: boolean;
  submission: {
    id: number;
    submission_text: string | null;
    file_url: string | null;
    status: string;
    submitted_date: string | null;
    score: number | null;
    feedback: string | null;
  } | null;
}

const fmtDue = (iso: string | null) => {
  if (!iso) return "No due date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No due date";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/* ---------------------------------------------------------------------------
 * Assignment card presentation
 *
 * Presentation only — these read the same counts the list already had
 * (student_count / submitted_count / graded_count / due_date) and render them
 * more legibly. No new data, no new requests.
 * ------------------------------------------------------------------------- */

/** Whether a due date has passed. Null/unparseable dates are never overdue. */
const isOverdue = (iso: string | null, now = new Date()) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < now.getTime();
};

// Shared field styling for the create-assignment form, so every control in it
// shares one focus ring and border treatment instead of repeating the classes.
const fieldCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20";

/** Label above a form control, with an explicit optional/required hint. */
const FieldLabel = ({ children, hint }: { children: ReactNode; hint?: string }) => (
  <span className="mb-1.5 flex items-baseline gap-1.5">
    <span className="text-xs font-medium text-foreground">{children}</span>
    {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
  </span>
);

/** Small pill used for the per-assignment counts. */
const AssignmentChip = ({
  children, tone = "muted",
}: { children: ReactNode; tone?: "muted" | "amber" | "emerald" | "red" }) => {
  const tones = {
    muted: "bg-muted text-muted-foreground ring-border",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
    red: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
};

/**
 * Submission progress for one assignment. The bar shows graded (solid) and
 * submitted-but-ungraded (lighter) against the roster size, so a teacher can
 * see at a glance what still needs marking.
 */
const AssignmentProgress = ({
  submitted, graded, total,
}: { submitted: number; graded: number; total: number }) => {
  // Guard against a zero roster so an empty batch renders an empty bar rather
  // than dividing by zero.
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={submitted}
      aria-label={`${submitted} of ${total} submitted, ${graded} graded`}
    >
      <div className="flex h-full">
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct(graded)}%` }} />
        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${pct(Math.max(0, submitted - graded))}%` }} />
      </div>
    </div>
  );
};

// The grading panel for ONE assignment: every student on the roster, their
// answer, and a score box. Non-submitters are listed too — a teacher needs to
// see who hasn't handed in, not just who has.
const AssignmentSubmissions = ({
  assignment,
  onGraded,
}: {
  assignment: TeacherAssignment;
  onGraded: () => void;
}) => {
  const [rows, setRows] = useState<AssignmentStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local edits keyed by submission id so typing in one row never disturbs another.
  const [draft, setDraft] = useState<Record<number, { score: string; feedback: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/admin/teacher-assignments/${assignment.id}/submissions`, {
        headers: teacherAuthHeaders(), timeout: 30000,
      })
      .then(({ data }) => setRows(Array.isArray(data?.students) ? data.students : []))
      .catch(() => setError("Could not load responses."))
      .finally(() => setLoading(false));
  }, [assignment.id]);

  useEffect(() => { load(); }, [load]);

  const save = async (row: AssignmentStudentRow) => {
    if (!row.submission) return;
    const d = draft[row.submission.id] ?? {
      score: row.submission.score == null ? "" : String(row.submission.score),
      feedback: row.submission.feedback ?? "",
    };
    if (d.score === "") { setError("Enter a score before saving."); return; }
    setSavingId(row.submission.id);
    setError(null);
    try {
      await axios.patch(
        `${ADMIN_BASE}/api/admin/teacher-submissions/${row.submission.id}/grade`,
        { score: Number(d.score), feedback: d.feedback },
        { headers: teacherAuthHeaders(), timeout: 30000 },
      );
      toast.success(`Saved ${row.name || "student"}'s marks`);
      load();
      onGraded();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(m?.error || "Could not save the marks.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading responses…</p>;

  return (
    <div className="p-4 space-y-3">
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students in this batch yet.</p>
      ) : (
        rows.map((r) => {
          const sub = r.submission;
          const d = sub
            ? draft[sub.id] ?? { score: sub.score == null ? "" : String(sub.score), feedback: sub.feedback ?? "" }
            : { score: "", feedback: "" };
          return (
            <div key={r.user_id || r.unique_id || Math.random()} className="border border-border rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-medium text-sm">{r.name || r.unique_id || r.user_id}</span>
                {r.unique_id ? <span className="text-xs text-muted-foreground">{r.unique_id}</span> : null}
                {r.off_roster ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">No longer in batch</span>
                ) : null}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ml-auto ${
                    !sub ? "bg-muted text-muted-foreground"
                      : sub.status === "graded" ? "bg-emerald-100 text-emerald-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {!sub ? "Not submitted" : sub.status === "graded" ? `Graded ${sub.score}/${assignment.max_score}` : "Submitted"}
                </span>
              </div>

              {!sub ? (
                <p className="text-sm text-muted-foreground italic">This student hasn't submitted yet.</p>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
                    {sub.submission_text || <span className="italic text-muted-foreground">No text answer</span>}
                  </p>
                  {sub.file_url ? (
                    <a href={sub.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-1 inline-block">
                      View attached file
                    </a>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-1">Submitted {fmtDue(sub.submitted_date)}</p>

                  <div className="flex flex-wrap items-end gap-2 mt-2">
                    <label className="text-xs">
                      <span className="block text-muted-foreground mb-1">Marks (out of {assignment.max_score})</span>
                      <input
                        type="number" min={0} max={assignment.max_score} value={d.score}
                        onChange={(e) => setDraft((p) => ({ ...p, [sub.id]: { ...d, score: e.target.value } }))}
                        className="w-24 border border-border rounded-md px-2 py-1 text-sm bg-background"
                      />
                    </label>
                    <label className="text-xs flex-1 min-w-[180px]">
                      <span className="block text-muted-foreground mb-1">Feedback (optional)</span>
                      <input
                        type="text" value={d.feedback}
                        onChange={(e) => setDraft((p) => ({ ...p, [sub.id]: { ...d, feedback: e.target.value } }))}
                        className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                      />
                    </label>
                    <button
                      type="button" onClick={() => save(r)} disabled={savingId === sub.id}
                      className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
                    >
                      {savingId === sub.id ? "Saving…" : sub.status === "graded" ? "Update marks" : "Save marks"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

const AssignmentsView = ({ teacherId }: { teacherId?: string }) => {
  const [batches, setBatches] = useState<TeacherAssignmentBatch[]>([]);
  const [items, setItems] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    batch_id: "", title: "", description: "", due_date: "", max_score: "100",
    attachments_title: "",
  });
  // Reference material: files chosen from disk + links typed in. Kept separate
  // because files go up as multipart parts and links as a JSON field.
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addLink = () => {
    const v = linkDraft.trim();
    if (!v) return;
    setLinks((p) => [...p, v]);
    setLinkDraft("");
  };

  const load = useCallback(() => {
    if (!teacherId) { setLoading(false); return; }
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/admin/teacher-assignments`, { headers: teacherAuthHeaders(), timeout: 30000 })
      .then(({ data }) => {
        setBatches(Array.isArray(data?.batches) ? data.batches : []);
        setItems(Array.isArray(data?.assignments) ? data.assignments : []);
      })
      .catch(() => setError("Could not load your assignments."))
      .finally(() => setLoading(false));
  }, [teacherId]);

  useEffect(() => { load(); }, [load]);

  // Default the batch picker to the teacher's first batch once loaded.
  useEffect(() => {
    if (!form.batch_id && batches.length) setForm((f) => ({ ...f, batch_id: batches[0].batch_id }));
  }, [batches, form.batch_id]);

  const create = async () => {
    if (!form.batch_id) { setError("Pick a batch."); return; }
    if (form.title.trim().length < 2) { setError("Give the assignment a title."); return; }
    // A link typed but never "Add"ed is still sitting in the draft box and
    // would be dropped silently, so fold it in rather than losing it.
    const pendingLink = linkDraft.trim();
    const allLinks = pendingLink && !links.includes(pendingLink) ? [...links, pendingLink] : links;
    // A heading with nothing under it produces no student-visible block at all
    // (the server only stores a title when there IS material to label), so say
    // so up front instead of reporting success on an empty resource section.
    if (form.attachments_title.trim() && !files.length && !allLinks.length) {
      setError("Add at least one file or link under the resource heading, or clear the heading.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // multipart/form-data so the PDFs/images ride along with the fields.
      // Don't set Content-Type by hand — the browser must add the boundary.
      const fd = new FormData();
      fd.append("batch_id", form.batch_id);
      fd.append("title", form.title.trim());
      if (form.description.trim()) fd.append("description", form.description.trim());
      if (form.due_date) fd.append("due_date", new Date(form.due_date).toISOString());
      fd.append("max_score", String(Number(form.max_score) || 100));
      if (allLinks.length) fd.append("links", JSON.stringify(allLinks));
      if (form.attachments_title.trim()) fd.append("attachments_title", form.attachments_title.trim());
      for (const f of files) fd.append("attachments", f);

      const { data } = await axios.post(`${ADMIN_BASE}/api/admin/teacher-assignments`, fd, {
        headers: teacherAuthHeaders(),
        timeout: 120000, // uploads can be slow on a classroom connection
      });
      // The assignment is created even when an attachment fails to upload, so
      // a bare "sent" toast would hide material the students can't see.
      // Held longer than a normal toast — it names files the teacher must re-attach.
      if (data?.warning) toast.warn(data.warning, { autoClose: 12000 });
      else toast.success("Assignment sent to your students");
      setForm((f) => ({ ...f, title: "", description: "", due_date: "", attachments_title: "" }));
      setFiles([]); setLinks([]); setLinkDraft("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowForm(false);
      load();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(m?.error || "Could not create the assignment.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: TeacherAssignment) => {
    if (!window.confirm(`Delete "${a.title}"? This also deletes all student responses and marks.`)) return;
    try {
      await axios.delete(`${ADMIN_BASE}/api/admin/teacher-assignments/${a.id}`, {
        headers: teacherAuthHeaders(), timeout: 30000,
      });
      toast.success("Assignment deleted");
      load();
    } catch {
      setError("Could not delete the assignment.");
    }
  };

  if (!teacherId) return <Panel title="Assignments" icon={ClipboardList}><Empty text="Sign in as a teacher to manage assignments." /></Panel>;

  return (
    <Panel title="Assignments" icon={ClipboardList}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Send work to a batch, then read every student's answer and give marks.
        </p>
        <button
          type="button" onClick={() => setShowForm((v) => !v)} disabled={batches.length === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
        >
          {showForm ? <X className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          {showForm ? "Cancel" : "New assignment"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <div className="mb-4 space-y-4 rounded-xl border border-border bg-muted/20 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Batch</FieldLabel>
              <select
                value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))}
                className={fieldCls}
              >
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_name} ({b.student_count} student{b.student_count === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <FieldLabel>Title</FieldLabel>
              <input
                value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Build a line-following robot"
                className={fieldCls}
              />
            </label>
          </div>
          <label className="block">
            <FieldLabel hint="optional">Instructions</FieldLabel>
            <textarea
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="What should the students do?"
              className={`${fieldCls} resize-y`}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <FieldLabel hint="optional">Due date</FieldLabel>
              <input
                type="datetime-local" value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className={fieldCls}
              />
            </label>
            <label className="block">
              <FieldLabel>Total marks</FieldLabel>
              <input
                type="number" min={1} value={form.max_score}
                onChange={(e) => setForm((f) => ({ ...f, max_score: e.target.value }))}
                className={fieldCls}
              />
            </label>
          </div>
          {/* Reference material: PDFs / images / documents from disk, plus any
              links (video, drive folder, article) the teacher wants to share. */}
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Library className="h-4 w-4 text-primary" />
                Reference material
                <span className="text-xs font-normal text-muted-foreground">optional</span>
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Attach as many PDFs, images or links as you need. Students see them on the assignment.
              </p>
            </div>

            <label className="block">
              <FieldLabel hint="optional">Heading for these resources</FieldLabel>
              <input
                value={form.attachments_title}
                onChange={(e) => setForm((f) => ({ ...f, attachments_title: e.target.value }))}
                placeholder="Reference material"
                maxLength={200}
                className={fieldCls}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                // Both MIME types AND extensions: a bare ".pdf,…,image/*" mix
                // makes some Windows file pickers grey out PDFs/images, so the
                // teacher sees nothing selectable. Mirrors the server's
                // ALLOWED_ATTACHMENT filter (teacherAssignment.routes.js).
                accept={[
                  "application/pdf", ".pdf",
                  "image/png", "image/jpeg", "image/gif", "image/webp", ".png", ".jpg", ".jpeg", ".gif", ".webp",
                  "application/msword", ".doc",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx",
                  "text/plain", ".txt",
                  "application/zip", ".zip",
                ].join(",")}
                // Append rather than replace, so the teacher can add files in
                // several goes. Clearing the input afterwards lets them pick
                // the same file again if they removed it by mistake.
                //
                // Snapshot the FileList BEFORE clearing the input. `setFiles`
                // takes a lazy updater that React runs after this handler
                // returns, so reading `e.target.files` inside it read an input
                // that `e.target.value = ""` had already reset — per spec that
                // empties the FileList, so every picked file was silently
                // dropped and no chip ever appeared.
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  e.target.value = "";
                  setFiles((p) => mergePickedFiles(p, picked));
                }}
                className="text-xs file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:brightness-110"
              />
              <span className="text-xs text-muted-foreground">PDF, images or docs — up to 20 files, 25MB each</span>
            </div>

            {files.length > 0 ? (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <button
                      type="button" aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="text-muted-foreground transition-colors hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                placeholder="Paste a link (e.g. https://youtu.be/…) and press Add"
                className={`${fieldCls} min-w-[220px] flex-1`}
              />
              <button
                type="button" onClick={addLink}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-muted"
              >
                Add link
              </button>
            </div>

            {links.length > 0 ? (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {links.map((l, i) => (
                  <li key={`${l}-${i}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
                    <span className="max-w-[220px] truncate">{l}</span>
                    <button
                      type="button" aria-label={`Remove ${l}`}
                      onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}
                      className="text-muted-foreground transition-colors hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button
              type="button" onClick={create} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Sending…" : "Send to students"}
            </button>
            <button
              type="button" onClick={() => setShowForm(false)} disabled={saving}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <Empty text="Loading assignments…" />
      ) : batches.length === 0 ? (
        <Empty text="You don't teach any batch yet. Once an admin assigns you one, you can send assignments here." />
      ) : items.length === 0 ? (
        <Empty text="No assignments yet. Use “New assignment” to send work to your students." />
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const open = openId === a.id;
            const toGrade = Math.max(0, a.submitted_count - a.graded_count);
            const overdue = isOverdue(a.due_date);
            return (
              <div
                key={a.id}
                className={`rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md ${
                  open ? "border-primary/30" : "border-border"
                }`}
              >
                <div className="p-4">
                  {/* Header row: the expand control is its own button so the
                      attachment links below are no longer nested inside it
                      (a button cannot legally contain an anchor). */}
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : a.id)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <ChevronRight
                        className={`mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{a.title}</span>
                        {a.description ? (
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">{a.description}</span>
                        ) : null}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(a)}
                      className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Meta line: batch, due date, total marks. */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> {a.batch_name}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 ${overdue ? "font-medium text-red-600 dark:text-red-400" : ""}`}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      Due {fmtDue(a.due_date)}{overdue ? " · overdue" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ClipboardCheck className="h-3.5 w-3.5" /> {a.max_score} marks
                    </span>
                  </div>

                  {/* Submission progress — the numbers the teacher acts on. */}
                  <div className="mt-3 pl-8">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <AssignmentChip tone={a.submitted_count > 0 ? "amber" : "muted"}>
                        {a.submitted_count} of {a.student_count} submitted
                      </AssignmentChip>
                      {a.graded_count > 0 ? (
                        <AssignmentChip tone="emerald">{a.graded_count} graded</AssignmentChip>
                      ) : null}
                      {toGrade > 0 ? (
                        <AssignmentChip tone="red">{toGrade} to grade</AssignmentChip>
                      ) : null}
                    </div>
                    <AssignmentProgress
                      submitted={a.submitted_count}
                      graded={a.graded_count}
                      total={a.student_count}
                    />
                  </div>

                  {/* Reference material, now a sibling of the expand button. */}
                  {a.attachments?.length ? (
                    <div className="mt-3 pl-8">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        {a.attachments_title || "Reference material"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {a.attachments.map((att, i) => (
                          <a
                            key={`${att.url}-${i}`}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs transition-colors hover:border-primary/30 hover:bg-muted"
                          >
                            <span className="truncate">{att.name || att.url}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {open ? (
                  <div className="border-t border-border">
                    <AssignmentSubmissions assignment={a} onGraded={load} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

const ClassesView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading } = useTeacherList<{ id: number; name: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null; course_student_count?: number }>(teacherId, "classes", "classes");
  const sessions: TeacherSession[] = useMemo(
    () => items.map((c) => ({
      id: c.id, title: c.name || "Class", course_title: c.course_title,
      start_at: c.start_at, end_at: c.end_at, meeting_link: c.meeting_link,
      student_count: c.course_student_count,
    })),
    [items],
  );
  return (
    <SessionsPanel
      title="My Classes"
      icon={MonitorPlay}
      items={sessions}
      loading={loading}
      noun="classes"
      emptyText="No classes assigned to you yet."
    />
  );
};

// Teacher Calendar — visualises the teacher's own Demos + Classes (whatever an
// admin scheduled with this teacher in teacher_ids) on a month/week/day grid.
// Reuses the same by-teacher endpoints the Demos/Classes tabs use.
const TeacherCalendarView = ({ teacherId }: { teacherId?: string }) => {
  const { items: demos, loading: demosLoading } = useTeacherList<{ id: number; title: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "demos", "demos");
  const { items: classes, loading: classesLoading } = useTeacherList<{ id: number; name: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "classes", "classes");

  const events: ScheduleEvent[] = useMemo(() => {
    const out: ScheduleEvent[] = [];
    for (const d of demos) {
      if (!d.start_at) continue;
      out.push({ id: `demo-${d.id}`, title: d.title || "Demo", start: new Date(d.start_at), end: new Date(d.end_at || d.start_at), type: "demo", courseTitle: d.course_title, meetingLink: d.meeting_link });
    }
    for (const c of classes) {
      if (!c.start_at) continue;
      out.push({ id: `class-${c.id}`, title: c.name || "Class", start: new Date(c.start_at), end: new Date(c.end_at || c.start_at), type: "class", courseTitle: c.course_title, meetingLink: c.meeting_link });
    }
    return out;
  }, [demos, classes]);

  return (
    <Panel title="My Calendar" icon={CalendarDays}>
      <ScheduleCalendar events={events} loading={demosLoading || classesLoading} />
    </Panel>
  );
};

interface TeacherResource {
  id: number;
  title: string;
  description: string | null;
  files: { name: string; url: string }[];
  resource_category_id: number | null;
  category_name: string | null;
  course_id: number | null;
  course_title: string | null;
  section: string | null;
}

const ResourcesView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading } = useTeacherList<TeacherResource>(teacherId, "resources", "resources");
  const [cat, setCat] = useState<string>("all");
  const [course, setCourse] = useState<string>("all");

  // Distinct categories among the teacher's assigned resources (radio filter).
  const categories = Array.from(
    new Map(
      items.filter((r) => r.resource_category_id).map((r) => [String(r.resource_category_id), r.category_name || "Category"]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  // Courses available within the selected category (dropdown filter).
  const courses = Array.from(
    new Map(
      items
        .filter((r) => cat === "all" || String(r.resource_category_id) === cat)
        .filter((r) => r.course_id)
        .map((r) => [String(r.course_id), r.course_title || `Course ${r.course_id}`]),
    ).entries(),
  ).map(([id, title]) => ({ id, title }));

  const filtered = items.filter(
    (r) =>
      (cat === "all" || String(r.resource_category_id) === cat) &&
      (course === "all" || String(r.course_id) === course),
  );

  // Group the filtered resources' PDFs under their section header.
  const sectionMap = new Map<string, { name: string; url: string }[]>();
  filtered.forEach((r) => {
    const key = r.section || "Resources";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    (r.files || []).forEach((f) => sectionMap.get(key)!.push(f));
  });
  const sections = Array.from(sectionMap.entries())
    .map(([name, files]) => ({ name, files }))
    .filter((s) => s.files.length > 0);

  return (
    <Panel title="Resources" icon={Library}>
      {loading ? (
        <Empty text="Loading resources…" />
      ) : items.length === 0 ? (
        <Empty text="No resources shared with you yet." />
      ) : (
        <>
          {/* Filters: category radios + course dropdown */}
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 mb-6">
            <div className="rounded-xl border border-border p-4 flex-1">
              <p className="text-sm font-semibold text-muted-foreground mb-2">Select Category</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="res-cat" checked={cat === "all"} onChange={() => { setCat("all"); setCourse("all"); }} className="accent-primary" /> All
                </label>
                {categories.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name="res-cat" checked={cat === c.id} onChange={() => { setCat(c.id); setCourse("all"); }} className="accent-primary" /> {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border p-4 lg:w-72">
              <p className="text-sm font-semibold text-muted-foreground mb-2">Select Course</p>
              <select value={course} onChange={(e) => setCourse(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white">
                <option value="all">All courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sections of PDF cards */}
          {sections.length === 0 ? (
            <Empty text="No resources match this filter." />
          ) : (
            <div className="space-y-6">
              {sections.map((s) => (
                <div key={s.name} className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-primary/5 px-5 py-3 font-semibold text-primary">{s.name}</div>
                  <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {s.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors p-3"
                      >
                        <span className="shrink-0 w-10 h-10 rounded bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">PDF</span>
                        <span className="text-sm font-medium leading-snug line-clamp-2">{f.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
};

// Teacher profile — built from the auth-service profile in the auth context,
// with inline editing (Edit profile) that PUTs to /auth/profile/update.
const ProfileView = ({ user }: { user: Record<string, unknown> | null }) => {
  const seed = (k: string) => {
    const v = user?.[k];
    return v === undefined || v === null ? "" : String(v);
  };
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Local copy so saved edits show immediately without a full auth refetch.
  const [data, setData] = useState({
    name: seed("name"), bio: seed("bio"), expertise: seed("expertise"),
    yearsOfExperience: seed("yearsOfExperience"), linkedinUrl: seed("linkedinUrl"),
    phone: seed("phone"), email: seed("email"),
  });
  const [form, setForm] = useState(data);
  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  // Profile photo — uploaded via the shared self-service endpoint
  // (/api/public/profile/photo). It's stored on the user row and also feeds the
  // instructor avatar on the public course pages (teacherPhoto ∪ studentPhoto).
  const [photo, setPhoto] = useState<string>(seed("teacherPhoto") || seed("studentPhoto"));
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = photo ? `${ADMIN_BASE}/${photo}` : "";
  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const res = await uploadStudentPhoto(file);
      setPhoto(res.photo);
      toast.success("Profile photo updated");
    } catch {
      toast.error("Failed to upload photo. Try a smaller JPG/PNG.");
    } finally {
      setPhotoUploading(false);
    }
  };

  if (!user) return <Empty text="Sign in as a teacher to see your profile." />;

  const name = data.name || data.email || "Teacher";
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const years = data.yearsOfExperience;
  const expertise = data.expertise.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  const startEdit = () => { setForm(data); setEditing(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        name: form.name, phone: form.phone, bio: form.bio, expertise: form.expertise,
        yearsOfExperience: form.yearsOfExperience, linkedinUrl: form.linkedinUrl,
      } as unknown as Parameters<typeof updateProfile>[0]);
      setData(form);
      setEditing(false);
      toast.success("Profile updated");
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed to update profile");
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <Panel title="Edit Profile" icon={Contact}>
        <form onSubmit={save} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium mb-1">Profile photo</label>
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border border-border" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-hero text-white text-2xl font-bold flex items-center justify-center">{initials || "T"}</div>
              )}
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoUploading}
                  className="rounded-lg border border-border text-sm font-semibold px-4 py-2 disabled:opacity-60"
                >
                  {photoUploading ? "Uploading…" : "Upload / change photo"}
                </button>
                <p className="text-xs text-muted-foreground mt-1">JPG or PNG. The photo saves immediately.</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">About me</label>
            <textarea rows={4} className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Tell students and parents about your teaching…" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Expertise <span className="text-muted-foreground font-normal">(comma-separated)</span></label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.expertise} onChange={(e) => set("expertise", e.target.value)} placeholder="Scratch, Python, Robotics" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Years of experience</label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.yearsOfExperience} onChange={(e) => set("yearsOfExperience", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">LinkedIn URL</label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-5 py-2">{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border text-sm font-semibold px-5 py-2">Cancel</button>
          </div>
        </form>
      </Panel>
    );
  }

  return (
    <>
    <Panel title="My Profile" icon={Contact}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-5">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-hero text-white text-2xl font-bold flex items-center justify-center shrink-0">{initials || "T"}</div>
          )}
          <div>
            <h2 className="text-2xl font-bold">{name}</h2>
            <p className="text-muted-foreground text-sm mt-1">{years ? `Teaching experience: ${years} year${years === "1" ? "" : "s"}` : "Teacher"}</p>
          </div>
        </div>
        <button type="button" onClick={startEdit} className="rounded-lg border border-border text-sm font-semibold px-4 py-2 hover:bg-muted">Edit profile ✎</button>
      </div>

      {data.bio && (
        <div className="mb-6">
          <h3 className="font-semibold mb-1">Get to know me</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{data.bio}</p>
        </div>
      )}

      {expertise.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">High expertise in</h3>
          <div className="flex flex-wrap gap-2">
            {expertise.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
                <span className="text-primary">★</span> {e}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold mb-2">Contact</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {data.email && <div><span className="text-muted-foreground">Email: </span>{data.email}</div>}
          {data.phone && <div><span className="text-muted-foreground">Phone: </span>{data.phone}</div>}
          {data.linkedinUrl && (
            <div>
              <span className="text-muted-foreground">LinkedIn: </span>
              <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{data.linkedinUrl}</a>
            </div>
          )}
        </div>
      </div>
    </Panel>
    <TeacherChangePassword />
    </>
  );
};

function TeacherChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: "New password must be at least 8 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords do not match." });
    setBusy(true);
    try {
      await changePassword({ currentPassword: cur, newPassword: next });
      setMsg({ ok: true, text: "Password changed successfully." });
      setCur(""); setNext(""); setConfirm("");
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not change password.";
      setMsg({ ok: false, text });
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-6">
      <Panel title="Change Password" icon={Contact}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-4 items-end max-w-3xl">
          <div>
            <label className="block text-sm font-medium mb-1">Current password</label>
            <input type="password" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={cur} onChange={(e) => setCur(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New password</label>
            <input type="password" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm new password</label>
            <input type="password" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-5 py-2">{busy ? "Saving…" : "Update password"}</button>
            {msg && <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
          </div>
        </form>
      </Panel>
    </div>
  );
}

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
interface FreeSlot { id: number; day_of_week: number; start_time: string; end_time: string }

// Teacher-authored weekly availability. The teacher adds/removes free slots per
// day; persisted via the public free-schedule endpoints keyed by teacherId.
const FreeScheduleView = ({ teacherId }: { teacherId?: string }) => {
  const [items, setItems] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!teacherId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/free-schedule/by-teacher/${teacherId}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 })
      .then(({ data }) => setItems(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teacherId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !start || !end) return;
    setSaving(true);
    try {
      await axios.post(`${ADMIN_BASE}/api/public/free-schedule`, { teacherId, day_of_week: day, start_time: start, end_time: end }, { headers: teacherAuthHeaders() });
      setStart(""); setEnd(""); load();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    try { await axios.delete(`${ADMIN_BASE}/api/public/free-schedule/${id}`, { params: { teacherId }, headers: teacherAuthHeaders() }); load(); } catch { /* ignore */ }
  };

  if (!teacherId) return <Panel title="Free Schedule" icon={CalendarDays}><Empty text="Sign in as a teacher to manage your free schedule." /></Panel>;

  return (
    <Panel title="Free Schedule" icon={CalendarDays}>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 mb-6 rounded-xl border border-border p-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Day</label>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="rounded-lg border border-border px-3 py-2 text-sm bg-white">
            {WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">From</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">To</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm" required />
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4 py-2">{saving ? "Adding…" : "+ Add Schedule"}</button>
      </form>

      {loading ? <Empty text="Loading…" /> : (
        <div className="space-y-4">
          {WEEK.map((dname, di) => {
            const daySlots = items.filter((s) => s.day_of_week === di).sort((a, b) => a.start_time.localeCompare(b.start_time));
            return (
              <div key={di} className="rounded-xl border border-border p-4">
                <h3 className="font-semibold mb-3">{dname}</h3>
                {daySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No slots.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                        {hhmmTo12(s.start_time)} – {hhmmTo12(s.end_time)}
                        <button type="button" onClick={() => remove(s.id)} className="text-muted-foreground hover:text-red-600 font-bold leading-none" aria-label="Remove">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

const BADGES = [
  { key: "homework_hero", label: "Homework Hero" },
  { key: "quick_learner", label: "Quick Learner" },
  { key: "never_gives_up", label: "Never Gives Up" },
  { key: "future_leader", label: "Future Leader" },
  { key: "always_on_time", label: "Always on Time" },
];
interface StudentRec { id: number; kind: string; data: Record<string, unknown> }

// Post-class performance evaluation attributes (1-5 stars each). Mirrors the
// Moonpreneur-style evaluation form; surfaced as admin dashboard stats.
const EVAL_ATTRS = [
  { key: "curiosity", label: "Curiosity Level" },
  { key: "participation", label: "Participation Level" },
  { key: "attentiveness", label: "Attentiveness / Focus" },
  { key: "attention", label: "Attention / Tardy" },
  { key: "creativity", label: "Creativity Level" },
  { key: "camera", label: "Camera" },
];

// Click-to-set 1-5 star rating; clicking the current value clears it.
const StarRating = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(n === value ? 0 : n)}
        aria-label={`${n} star${n > 1 ? "s" : ""}`}
        className={`text-xl leading-none transition-transform hover:scale-110 ${n <= value ? "text-yellow-400" : "text-gray-300 dark:text-white/25"}`}
      >
        ★
      </button>
    ))}
  </div>
);

// Read-only star display for a 0-5 value.
const Stars = ({ value }: { value: number }) => {
  const v = Math.round(value || 0);
  return (
    <span className="tracking-tight">
      <span className="text-yellow-400">{"★".repeat(v)}</span>
      <span className="text-gray-300 dark:text-white/25">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
};

// Per-student detail: goals, badges, SPR notes, school marks and projects.
// All persisted via the flexible /student-records endpoints (kind + data).
const StudentDetail = ({ teacherId, student }: { teacherId: string; student: { id: string; name: string; classes: number; slots: number; studentId?: string | null; batches?: { id: string; name: string }[] } }) => {
  const [records, setRecords] = useState<StudentRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [primary, setPrimary] = useState("");
  const [acad, setAcad] = useState({ subject: "", grade: "", goal: "" });
  const [spr, setSpr] = useState("");
  const [mark, setMark] = useState({ subject: "", score: "", total: "" });
  const [project, setProject] = useState({ title: "", type: "mini" });
  // Post-class performance evaluation form.
  const [evalRatings, setEvalRatings] = useState<Record<string, number>>({});
  const [evalFeedback, setEvalFeedback] = useState("");
  const [evalSession, setEvalSession] = useState("");
  const [evalStage, setEvalStage] = useState("");
  const [savingEval, setSavingEval] = useState(false);
  // Per-course progress for this student across the teacher's courses (read-only).
  const [progress, setProgress] = useState<{ course_id: string; course_title: string; completed: number; total: number; percent: number }[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setProgressLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/teaching/student-progress/${teacherId}/${student.id}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 })
      .then(({ data }) => { if (!cancelled) setProgress(Array.isArray(data?.courses) ? data.courses : []); })
      .catch(() => { if (!cancelled) setProgress([]); })
      .finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId, student.id]);

  const load = () => {
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/student-records/by-teacher/${teacherId}`, { params: { studentId: student.id, t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 })
      .then(({ data }) => setRecords(Array.isArray(data?.records) ? data.records : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teacherId, student.id]);

  const post = async (kind: string, data: Record<string, unknown>) => {
    try { await axios.post(`${ADMIN_BASE}/api/public/student-records`, { teacherId, studentId: student.id, kind, data }, { headers: teacherAuthHeaders() }); load(); }
    catch { toast.error("Failed to save"); }
  };
  const del = async (id: number) => {
    try { await axios.delete(`${ADMIN_BASE}/api/public/student-records/${id}`, { params: { teacherId }, headers: teacherAuthHeaders() }); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const submitEval = async (e: React.FormEvent) => {
    e.preventDefault();
    const rated = EVAL_ATTRS.map((a) => evalRatings[a.key]).filter((v) => v > 0);
    if (rated.length === 0) { toast.error("Give at least one rating before saving."); return; }
    const overall = Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10;
    setSavingEval(true);
    try {
      await axios.post(
        `${ADMIN_BASE}/api/public/student-records`,
        { teacherId, studentId: student.id, kind: "evaluation", data: { ratings: evalRatings, overall, feedback: evalFeedback.trim(), session: evalSession.trim(), stage: evalStage.trim() } },
        { headers: teacherAuthHeaders() },
      );
      setEvalRatings({}); setEvalFeedback(""); setEvalSession(""); setEvalStage("");
      toast.success("Evaluation saved");
      load();
    } catch { toast.error("Failed to save evaluation"); }
    finally { setSavingEval(false); }
  };

  const byKind = (k: string) => records.filter((r) => r.kind === k);
  const d = (r: StudentRec) => r.data as Record<string, string>;
  const badgeRow = records.find((r) => r.kind === "badge");
  const assigned = new Set<string>(Array.isArray((badgeRow?.data as { badges?: string[] })?.badges) ? (badgeRow!.data as { badges: string[] }).badges : []);

  const Row = ({ id, children }: { id: number; children: ReactNode }) => (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm mb-1">
      <span>{children}</span>
      <button type="button" onClick={() => del(id)} className="text-muted-foreground hover:text-red-600 font-bold leading-none">×</button>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full bg-gradient-hero text-white text-lg font-bold flex items-center justify-center">{(student.name || "S").slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold m-0 truncate">{student.name || student.id}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {student.studentId && (
              <span className="text-[12px] text-muted-foreground tabular-nums">{student.studentId}</span>
            )}
            {/* Batch chips: which of the teacher's groups this student is in. */}
            {(student.batches || []).map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Users className="w-3 h-3" /> {b.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mb-8">
        <Stat value={String(student.classes)} label="Classes" />
        <Stat value={String(student.slots)} label="Slots" />
        <Stat value={String(student.classes + student.slots)} label="Total sessions" />
      </div>

      {/* Course progress — how far this student is through each of the teacher's
          courses (completed vs released lessons). Read-only. */}
      <section className="mb-8">
        <h3 className="font-semibold mb-3">Course progress</h3>
        {progressLoading ? (
          <p className="text-sm text-muted-foreground">Loading progress…</p>
        ) : progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courses assigned to you for this student yet.</p>
        ) : (
          <div className="space-y-3">
            {progress.map((c) => (
              <div key={c.course_id}>
                <div className="flex items-center justify-between text-sm mb-1 gap-3">
                  <span className="font-medium truncate" title={c.course_title}>{c.course_title}</span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {c.total ? `${c.completed}/${c.total} · ${c.percent}%` : "No lessons released"}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.percent}%`, backgroundColor: c.percent >= 100 ? "#12c093" : "#FF6A00" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading ? <Empty text="Loading…" /> : (
        <div className="space-y-8">
          {/* Post-class performance evaluation — rate the student on each
              attribute + leave written feedback. Feeds the admin dashboard. */}
          <section>
            <h3 className="font-semibold mb-3">Performance Evaluation <span className="text-muted-foreground font-normal text-sm">(after class)</span></h3>

            {byKind("evaluation").map((r) => {
              const ed = r.data as { ratings?: Record<string, number>; overall?: number; feedback?: string; session?: string; stage?: string };
              return (
                <div key={r.id} className="rounded-xl border border-border p-4 mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {ed.session && <div className="font-medium text-sm truncate">{ed.session}</div>}
                      {ed.stage && <div className="text-xs text-muted-foreground truncate">{ed.stage}</div>}
                      {!ed.session && !ed.stage && <div className="text-sm font-medium">Evaluation</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Stars value={ed.overall || 0} />
                      <span className="text-xs text-muted-foreground tabular-nums">{(ed.overall || 0).toFixed(1)}</span>
                      <button type="button" onClick={() => del(r.id)} className="text-muted-foreground hover:text-red-600 font-bold leading-none ml-1">×</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
                    {EVAL_ATTRS.map((a) => (
                      <div key={a.key} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{a.label}</span>
                        <Stars value={ed.ratings?.[a.key] || 0} />
                      </div>
                    ))}
                  </div>
                  {ed.feedback && <p className="text-sm mt-3 rounded-lg bg-muted/50 px-3 py-2">{ed.feedback}</p>}
                </div>
              );
            })}

            <form onSubmit={submitEval} className="rounded-xl border border-border p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={evalStage} onChange={(e) => setEvalStage(e.target.value)} placeholder="Stage / Program (optional)" className="rounded-lg border border-border px-3 py-2 text-sm" />
                <input value={evalSession} onChange={(e) => setEvalSession(e.target.value)} placeholder="Session (e.g. Blocks vs Text)" className="rounded-lg border border-border px-3 py-2 text-sm" />
              </div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                {EVAL_ATTRS.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{a.label}</span>
                    <StarRating value={evalRatings[a.key] || 0} onChange={(n) => setEvalRatings((s) => ({ ...s, [a.key]: n }))} />
                  </div>
                ))}
              </div>
              <textarea value={evalFeedback} onChange={(e) => setEvalFeedback(e.target.value)} rows={3} placeholder="Feedback from the project guide…" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              <button disabled={savingEval} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-5 py-2 disabled:opacity-60">
                {savingEval ? "Saving…" : "Save evaluation"}
              </button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Primary goal</h3>
            {byKind("goal_primary").map((r) => <Row key={r.id} id={r.id}>{d(r).goal}</Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (primary.trim()) { post("goal_primary", { goal: primary.trim() }); setPrimary(""); } }} className="flex gap-2 mt-1">
              <input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="Add a primary goal" className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Academic goals</h3>
            {byKind("goal_academic").map((r) => <Row key={r.id} id={r.id}>{[d(r).subject, d(r).grade && `Grade ${d(r).grade}`, d(r).goal].filter(Boolean).join(" · ")}</Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (acad.goal.trim()) { post("goal_academic", { ...acad }); setAcad({ subject: "", grade: "", goal: "" }); } }} className="grid sm:grid-cols-4 gap-2 mt-1">
              <input value={acad.subject} onChange={(e) => setAcad((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={acad.grade} onChange={(e) => setAcad((s) => ({ ...s, grade: e.target.value }))} placeholder="Grade" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={acad.goal} onChange={(e) => setAcad((s) => ({ ...s, goal: e.target.value }))} placeholder="Goal" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Badges <span className="text-muted-foreground font-normal text-sm">({assigned.size} assigned)</span></h3>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => {
                const on = assigned.has(b.key);
                return (
                  <button key={b.key} type="button" onClick={() => post("badge", { badge: b.key, status: on ? "unassigned" : "assigned" })} className={`rounded-full px-3 py-1.5 text-sm border ${on ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
                    {on ? "★" : "☆"} {b.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Student Progress Report</h3>
            {byKind("spr").map((r) => <Row key={r.id} id={r.id}>{d(r).note}</Row>)}
            {byKind("spr").length === 0 && <p className="text-sm text-muted-foreground mb-1">No SPR notes yet.</p>}
            <form onSubmit={(e) => { e.preventDefault(); if (spr.trim()) { post("spr", { note: spr.trim() }); setSpr(""); } }} className="flex gap-2 mt-1">
              <input value={spr} onChange={(e) => setSpr(e.target.value)} placeholder="Add a note" className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">School Marks</h3>
            {byKind("mark").map((r) => <Row key={r.id} id={r.id}>{d(r).subject}: {d(r).score}{d(r).total ? ` / ${d(r).total}` : ""}</Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (mark.subject.trim() && mark.score.trim()) { post("mark", { ...mark }); setMark({ subject: "", score: "", total: "" }); } }} className="grid sm:grid-cols-4 gap-2 mt-1">
              <input value={mark.subject} onChange={(e) => setMark((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={mark.score} onChange={(e) => setMark((s) => ({ ...s, score: e.target.value }))} placeholder="Score" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={mark.total} onChange={(e) => setMark((s) => ({ ...s, total: e.target.value }))} placeholder="Out of" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Projects</h3>
            {byKind("project").map((r) => <Row key={r.id} id={r.id}>{d(r).title} <span className="text-muted-foreground">({d(r).type})</span></Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (project.title.trim()) { post("project", { ...project }); setProject({ title: "", type: "mini" }); } }} className="grid sm:grid-cols-3 gap-2 mt-1">
              <input value={project.title} onChange={(e) => setProject((s) => ({ ...s, title: e.target.value }))} placeholder="Project title" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <select value={project.type} onChange={(e) => setProject((s) => ({ ...s, type: e.target.value }))} className="rounded-lg border border-border px-3 py-2 text-sm bg-white">
                <option value="mini">Mini</option><option value="major">Major</option><option value="final">Final</option>
              </select>
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

interface RosterSched { id: number; students: { id: string; name: string }[] }

// Students panel — step 1: the teacher's students, aggregated from the rosters
// of their classes + slots, with per-student session counts. (Goals, badges,
// SPR, marks, exercises, quizzes and projects are later steps.)
const StudentsView = ({ teacherId }: { teacherId?: string }) => {
  const [classes, setClasses] = useState<RosterSched[]>([]);
  const [slots, setSlots] = useState<RosterSched[]>([]);
  // Students reached via batch membership, each carrying the batches they're in.
  const [batchStudents, setBatchStudents] = useState<
    { id: string; name: string; studentId?: string | null; batches?: { id: string; name: string }[] }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const get = (path: string) =>
      axios.get(`${ADMIN_BASE}/${path}/${teacherId}`, {
        params: { t: Date.now() },
        headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() },
        timeout: 30000,
      });

    // allSettled, NOT all: these three feeds are independent, and Promise.all
    // rejects the whole chain if ANY one fails — the old .catch then cleared
    // all three lists. A single broken endpoint (slots/by-teacher was 500ing on
    // a missing service method) therefore blanked the entire Students tab even
    // though the batch-students call had succeeded. Each source now stands or
    // falls on its own.
    Promise.allSettled([
      get("api/public/classes/by-teacher"),
      get("api/public/slots/by-teacher"),
      // Students from the teacher's BATCH assignments. This replaced the old
      // /teaching/students-by-teacher endpoint, which was deleted with the
      // teaching-assignment feature — the dashboard kept calling it and the
      // 404 was swallowed, so batch students never appeared here at all.
      get("api/public/teacher-students/by-teacher"),
    ])
      .then(([c, s, ts]) => {
        if (cancelled) return;
        setClasses(c.status === "fulfilled" && Array.isArray(c.value.data?.classes) ? c.value.data.classes : []);
        setSlots(s.status === "fulfilled" && Array.isArray(s.value.data?.slots) ? s.value.data.slots : []);
        setBatchStudents(ts.status === "fulfilled" && Array.isArray(ts.value.data?.students) ? ts.value.data.students : []);
        // Surface a failed feed instead of silently showing an empty roster.
        [c, s, ts].forEach((r, i) => {
          if (r.status === "rejected") {
            console.warn(`[teacher students] feed ${["classes", "slots", "batch-students"][i]} failed:`, r.reason?.message);
          }
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId]);

  type StudentEntry = {
    id: string;
    name: string;
    classes: number;
    slots: number;
    studentId?: string | null;
    batches: { id: string; name: string }[];
  };
  const map = new Map<string, StudentEntry>();
  const blank = (id: string, name?: string): StudentEntry => ({
    id, name: name || "", classes: 0, slots: 0, batches: [],
  });
  const add = (entries: RosterSched[], key: "classes" | "slots") => {
    entries.forEach((e) => (e.students || []).forEach((st) => {
      const cur = map.get(st.id) || blank(st.id, st.name);
      cur[key] += 1;
      if (st.name && !cur.name) cur.name = st.name;
      map.set(st.id, cur);
    }));
  };
  add(classes, "classes");
  add(slots, "slots");
  // Merge BATCH students so they show even with no class/slot scheduled — this
  // is the primary roster now that batches replaced teaching assignments.
  batchStudents.forEach((st) => {
    const cur = map.get(st.id) || blank(st.id, st.name);
    if (st.name && !cur.name) cur.name = st.name;
    if (st.studentId && !cur.studentId) cur.studentId = st.studentId;
    (st.batches || []).forEach((b) => {
      if (!cur.batches.some((x) => x.id === b.id)) cur.batches.push(b);
    });
    map.set(st.id, cur);
  });
  let students = Array.from(map.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  if (q.trim()) students = students.filter((s) => (s.name || s.id).toLowerCase().includes(q.toLowerCase()));
  const sel = selected ? map.get(selected) : null;

  return (
    <Panel title="Students" icon={Users}>
      {!teacherId ? (
        <Empty text="Sign in as a teacher to see your students." />
      ) : loading ? (
        <Empty text="Loading students…" />
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold m-0">Your Students</h3>
              {students.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                  {students.length}
                </span>
              )}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="w-full rounded-lg border border-border px-3 py-2 text-sm mb-3" />
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {q.trim()
                  ? "No students match that search."
                  : "No students assigned to you yet. Students appear here once an admin adds them to one of your batches."}
              </p>
            ) : (
              <ul className="space-y-1 max-h-[440px] overflow-y-auto">
                {students.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSelected(s.id)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${selected === s.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                      <span className="block truncate">{s.name || s.id}</span>
                      {/* Which batch(es) this student comes from — the teacher's
                          main way of telling their groups apart. */}
                      {s.batches.length > 0 && (
                        <span className="block truncate text-[11.5px] text-muted-foreground font-normal mt-0.5">
                          {s.batches.map((b) => b.name).join(", ")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border p-6">
            {!sel ? (
              <Empty text="Select a student to see their details." />
            ) : (
              <StudentDetail teacherId={teacherId} student={sel} />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};

// After a class ends, nudge the teacher to evaluate their students. Derived
// from the teacher's own classes (end_at within the last 2 days = "recent"),
// so it appears right after a class and clears itself a couple of days later.
// Clicking it jumps to the Students tab where the evaluation form lives.
const RECENT_CLASS_MS = 2 * 24 * 60 * 60 * 1000;
const PendingFeedbackBanner = ({ teacherId, onGiveFeedback }: { teacherId?: string; onGiveFeedback: () => void }) => {
  const { items } = useTeacherList<{ id: number; name: string; start_at: string | null; end_at: string | null }>(teacherId, "classes", "classes");
  const now = Date.now();
  const recent = items.filter((c) => {
    const endMs = c.end_at ? new Date(c.end_at).getTime()
      : (c.start_at ? new Date(c.start_at).getTime() + 60 * 60 * 1000 : NaN);
    return !Number.isNaN(endMs) && endMs < now && now - endMs < RECENT_CLASS_MS;
  });
  if (recent.length === 0) return null;
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 dark:bg-orange-500/10 dark:border-white/10 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-sm m-0">{recent.length} recent class{recent.length === 1 ? "" : "es"} ended — share your feedback</p>
          <p className="text-xs text-muted-foreground m-0">Rate your students' performance from the class in the Students tab.</p>
        </div>
      </div>
      <button type="button" onClick={onGiveFeedback} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4 py-2">
        Give feedback
      </button>
    </div>
  );
};

/* ---------------------------------------------------------------------------
 * Dashboard (overview)
 *
 * Built entirely from feeds the other tabs already use (teacher-courses,
 * classes, demos), so it adds no new endpoints and can never disagree with the
 * tab a teacher clicks into. Replaces the old placeholder, which showed
 * hardcoded "₹0" earnings and "—" penalties against no backend at all.
 * ------------------------------------------------------------------------- */

/** Metric tile. `tone` tints the icon chip; every tile is also text-labelled. */
const MetricTile = ({
  value, label, icon: Icon, tone = "primary", loading = false,
}: {
  value: string | number;
  label: string;
  icon: typeof Calendar;
  tone?: "primary" | "emerald" | "amber" | "blue";
  loading?: boolean;
}) => {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  } as const;
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <div className="text-3xl font-bold leading-none tracking-tight tabular-nums">{value}</div>
      )}
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
};

const OverviewEmpty = ({ icon: Icon, title, text }: { icon: typeof Calendar; title: string; text?: string }) => (
  <div className="py-10 text-center">
    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="h-6 w-6" />
    </span>
    <p className="text-base font-semibold m-0">{title}</p>
    {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground m-0">{text}</p>}
  </div>
);

const TeacherOverview = ({
  teacherId, name, onGoTo,
}: { teacherId?: string; name: string; onGoTo: (t: string) => void }) => {
  const { items: courses, loading: coursesLoading } =
    useTeacherList<TeacherCourse>(teacherId, "teacher-courses", "courses");
  const { items: classes, loading: classesLoading } =
    useTeacherList<{ id: number; name: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "classes", "classes");
  const { items: demos, loading: demosLoading } =
    useTeacherList<{ id: number; title: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "demos", "demos");

  // Normalise both feeds to one row shape (classes use `name`, demos `title`).
  const classRows: TeacherSession[] = useMemo(
    () => classes.map((c) => ({ id: c.id, title: c.name || "Class", course_title: c.course_title, start_at: c.start_at, end_at: c.end_at, meeting_link: c.meeting_link })),
    [classes],
  );
  const demoRows: TeacherSession[] = useMemo(
    () => demos.map((d) => ({ id: d.id, title: d.title || "Demo", course_title: d.course_title, start_at: d.start_at, end_at: d.end_at, meeting_link: d.meeting_link })),
    [demos],
  );

  // What counts as "upcoming" depends on the CURRENT time, so it must be
  // recomputed as the clock moves — not memoised against the data alone. These
  // were previously keyed on [classRows]/[demoRows] only, which evaluated the
  // clock once when the feed loaded: a session that finished while the tab sat
  // open stayed in "Upcoming" indefinitely. `tick` exists solely to re-run
  // these; the values come from a fresh `new Date()` each time.
  const tick = useScheduleTick([...classRows, ...demoRows]);

  /* eslint-disable react-hooks/exhaustive-deps */
  const upcomingClasses = useMemo(() => splitSchedule(classRows, new Date()).upcoming, [classRows, tick]);
  const upcomingDemos = useMemo(() => splitSchedule(demoRows, new Date()).upcoming, [demoRows, tick]);

  // Distinct students across the teacher's courses. Summing student_count would
  // double-count anyone enrolled in two of their courses, so count batch
  // membership by unique batch instead.
  const { studentCount, releasedPct, lessonTotal, releasedTotal } = useMemo(() => {
    const seenBatches = new Set<string>();
    let students = 0;
    let lessons = 0;
    let released = 0;
    for (const c of courses) {
      lessons += c.lesson_count || 0;
      released += c.released_count || 0;
      for (const b of c.batches || []) {
        if (seenBatches.has(b.batch_id)) continue;
        seenBatches.add(b.batch_id);
        students += b.student_count || 0;
      }
    }
    return {
      studentCount: students,
      lessonTotal: lessons,
      releasedTotal: released,
      releasedPct: lessons ? Math.round((released / lessons) * 100) : 0,
    };
  }, [courses]);

  const nextSession = useMemo(
    () => splitSchedule([...classRows, ...demoRows], new Date()).upcoming[0],
    [classRows, demoRows, tick],
  );
  const liveNow = useMemo(
    () => [...classRows, ...demoRows].find((s) => getClassState(s, new Date()) === "live"),
    [classRows, demoRows, tick],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const scheduleLoading = classesLoading || demosLoading;
  const linkBtn = "inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:gap-2.5";

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-hero p-6 text-white shadow-sm sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {name} 👋</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85">
            {scheduleLoading
              ? "Getting your schedule up to date…"
              : liveNow
                ? `${liveNow.title} is happening right now — join in.`
                : nextSession
                  ? `Your next session, ${nextSession.title}, is on ${fmtSessionWhen(nextSession.start_at, nextSession.end_at)}.`
                  : "Nothing scheduled right now. Enjoy the breather."}
          </p>
          {!scheduleLoading && liveNow?.meeting_link && (
            <a
              href={liveNow.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90"
            >
              <Video className="h-4 w-4" /> Join now
            </a>
          )}
        </div>
      </section>

      {/* Analytics */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricTile icon={MonitorPlay} tone="primary" loading={coursesLoading} value={courses.length} label={courses.length === 1 ? "Course assigned" : "Courses assigned"} />
        <MetricTile icon={Users} tone="blue" loading={coursesLoading} value={studentCount} label="Students taught" />
        <MetricTile icon={CalendarDays} tone="amber" loading={scheduleLoading} value={upcomingClasses.length} label="Upcoming classes" />
        <MetricTile icon={MessageSquare} tone="emerald" loading={scheduleLoading} value={upcomingDemos.length} label="Upcoming demos" />
      </div>

      {/* Curriculum release progress — how much of the syllabus is unlocked. */}
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold m-0 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Lesson releases
          </h2>
          <button type="button" onClick={() => onGoTo("My Courses")} className={linkBtn}>
            Manage courses <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {coursesLoading ? (
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
        ) : lessonTotal === 0 ? (
          <OverviewEmpty icon={MonitorPlay} title="No curriculum yet" text="Once an admin assigns you a course, its lessons appear here." />
        ) : (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{releasedTotal} of {lessonTotal} lessons released</span>
              <span className="font-semibold tabular-nums">{releasedPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={releasedPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-hero transition-all duration-700" style={{ width: `${releasedPct}%` }} />
            </div>
          </>
        )}
      </section>

      {/* Upcoming classes + demos, side by side on wide screens. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold m-0 flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-primary" /> Upcoming classes
            </h2>
            {upcomingClasses.length > 3 && (
              <button type="button" onClick={() => onGoTo("Classes")} className={linkBtn}>
                View all <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {classesLoading ? (
            <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-muted" />)}</div>
          ) : upcomingClasses.length === 0 ? (
            <OverviewEmpty icon={CalendarDays} title="No classes scheduled" text="Classes an admin schedules with you appear here." />
          ) : (
            <ul className="space-y-3 list-none p-0 m-0">
              {upcomingClasses.slice(0, 3).map((s) => <TeacherSessionRow key={`class-${s.id}`} s={s} />)}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold m-0 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> Upcoming demos
            </h2>
            {upcomingDemos.length > 3 && (
              <button type="button" onClick={() => onGoTo("Demos")} className={linkBtn}>
                View all <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {demosLoading ? (
            <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-muted" />)}</div>
          ) : upcomingDemos.length === 0 ? (
            <OverviewEmpty icon={MessageSquare} title="No demos scheduled" text="Demo sessions assigned to you appear here." />
          ) : (
            <ul className="space-y-3 list-none p-0 m-0">
              {upcomingDemos.slice(0, 3).map((s) => <TeacherSessionRow key={`demo-${s.id}`} s={s} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

const TeacherDashboard = () => {
  const [active, setActive] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { isDark } = useDashboardTheme();

  // Greet with the name the teacher registered with.
  const teacherFirstName = firstName(user as { name?: string | null; email?: string | null } | null);

  return (
    /* Translucent surface (not the old opaque #f4f4f5) so the global VR
       Robotics logo watermark — body::before in index.css — shows through the
       shell, exactly like the student dashboard. */
    <div className={`min-h-screen flex flex-col bg-muted/40 ${isDark ? "dark teacher-dark" : ""}`}>
      {/* Shared site navbar, so the teacher shell keeps the main navigation
          (Home / Courses / profile menu) available like the rest of the site.
          Presentation only — the sidebar tabs below still drive every view. */}
      <Navbar />

      <div className="flex flex-1 min-h-0">
      {/* Mobile top bar with menu button. Sits directly under the site navbar
          (sticky, below its 4rem mobile height) instead of fixed at top-0, so
          the two headers stack rather than overlap. */}
      <div className="lg:hidden fixed top-16 inset-x-0 z-30 flex items-center gap-2 px-4 h-14 bg-white dark:bg-[#16161f] border-b border-orange-100 dark:border-white/10">
        <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-muted-foreground hover:text-primary">
          <Menu className="w-6 h-6" />
        </button>
        <span className="font-heading text-lg font-extrabold"><span className="text-gradient">VR</span> Robotics</span>
      </div>
      {/* Backdrop (mobile) */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      {/* Sidebar — drawer on mobile, static on desktop */}
      {/* Offsets account for the site navbar above: the mobile drawer starts
          below its 4rem bar, the desktop rail sticks below its 5rem bar and is
          shortened to match so it never scrolls past the viewport. */}
      <aside className={`w-64 shrink-0 bg-gradient-to-b from-[#fff6ee] to-white dark:from-[#16161f] dark:to-[#101019] border-r border-orange-100 dark:border-white/10 flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)]
        fixed top-16 bottom-0 left-0 z-40 transform transition-transform duration-200
        lg:static lg:translate-x-0 lg:sticky lg:top-20
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden absolute top-4 right-4 text-muted-foreground hover:text-primary">
          <X className="w-6 h-6" />
        </button>
        <div className="flex items-center justify-between gap-2 px-6 h-20 border-b border-orange-100 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-hero shrink-0" />
            <span className="font-heading text-xl font-extrabold truncate">
              <span className="text-gradient">VR</span> Robotics
            </span>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1">
          {navItems.map((item) => {
            const on = active === item.name;
            return (
              <button
                key={item.name}
                onClick={() => { setActive(item.name); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  on
                    ? "bg-primary/10 text-primary border-r-4 border-primary"
                    : "text-muted-foreground hover:bg-orange-50 hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <Link
          to="/"
          className="flex items-center gap-3 px-6 py-4 text-sm font-semibold text-red-500 border-t border-orange-100 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Power className="w-5 h-5" /> Logout
        </Link>
      </aside>

      {/* Main */}
      {/* pt clears the mobile menu bar, which is fixed below the site navbar. */}
      <main className="flex-1 min-w-0 overflow-y-auto p-4 pt-[72px] lg:p-8 lg:pt-8 space-y-6">
        {/* Post-class nudge to evaluate students — shows on every tab. */}
        <PendingFeedbackBanner teacherId={user?.userId} onGiveFeedback={() => setActive("Students")} />

        {active === "Dashboard" ? (
          <TeacherOverview teacherId={user?.userId} name={teacherFirstName} onGoTo={setActive} />
        ) : active === "Slots" ? (
          <SlotsView teacherId={user?.userId} />
        ) : active === "Demos" ? (
          <DemosView teacherId={user?.userId} />
        ) : active === "My Courses" ? (
          <MyCoursesView teacherId={user?.userId} />
        ) : active === "Assignments" ? (
          <AssignmentsView teacherId={user?.userId} />
        ) : active === "Classes" ? (
          <ClassesView teacherId={user?.userId} />
        ) : active === "Calendar" ? (
          <TeacherCalendarView teacherId={user?.userId} />
        ) : active === "Free Schedule" ? (
          <FreeScheduleView teacherId={user?.userId} />
        ) : active === "Students" ? (
          <StudentsView teacherId={user?.userId} />
        ) : active === "Feedback Forms" ? (
          <FeedbackFormsView teacherId={user?.userId} />
        ) : active === "Resources" ? (
          <ResourcesView teacherId={user?.userId} />
        ) : active === "Profile" ? (
          <ProfileView user={user as unknown as Record<string, unknown> | null} />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
            <h1 className="text-2xl font-bold mb-2">{active}</h1>
            <p className="text-muted-foreground">This section is coming soon.</p>
          </div>
        )}
      </main>
      </div>
    </div>
  );
};

export default TeacherDashboard;
