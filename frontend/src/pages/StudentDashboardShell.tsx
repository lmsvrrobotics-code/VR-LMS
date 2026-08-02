import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  getMyCourses, getMyTeacherFeedbackByTeacher,
  type MyFeedbackByTeacher as MyFeedbackByTeacherRow,
} from "@/api/course/courseApi";
import {
  listMyAssignments, submitAssignment, listMyClasses,
  type StudentAssignment, type StudentClass,
} from "@/api/studentAssignmentApi";
import {
  getAssignmentState, getSubmission, summarizeAssignments, averageProgress, greeting,
  displayName, firstName, initialsOf, getClassState, canJoinClass,
  msUntilStart, shouldCountDown, formatCountdown, splitSchedule,
  type AssignmentState,
} from "@/lib/assignmentStatus";
import FeedbackFormsInbox from "@/pages/FeedbackFormsInbox";
import { toast } from "react-toastify";
import {
  Menu, X, Power, LayoutDashboard, MonitorPlay, ClipboardList, MessageSquare,
  GraduationCap, ArrowRight, CheckCircle2, Clock, AlertTriangle, FileText,
  BadgeCheck, TrendingUp, CalendarClock, Target, Upload, Filter, Video, CalendarDays,
  Timer, Paperclip, Link as LinkIcon,
} from "lucide-react";

/**
 * VR Robotics Academy — Student dashboard shell.
 *
 * Deliberately mirrors TeacherDashboard.tsx: its own sidebar, rendered OUTSIDE
 * the marketing Layout, with the same drawer-on-mobile behaviour and the scoped
 * light/dark toggle. Students previously had no dashboard at all — the profile
 * menu's "Dashboard" item dropped them on the marketing home page.
 *
 * Tabs: Dashboard / My Courses / My Assignments / Feedback.
 *
 * All data comes from endpoints that derive the student from the verified JWT
 * (`/api/public/my-courses`, `/api/public/my-assignments`,
 * `/api/public/feedback-forms/for-student`) — nothing here passes a user id.
 */

// The five rated areas, mirroring ATTRS in the backend's TeacherFeedbackService.
// Keys must stay in sync — they index into each submission's `ratings` object.
const FEEDBACK_AREAS = [
  { key: "explanation", label: "Teacher's Explanation & Teaching" },
  { key: "engagement", label: "Class Engagement & Interaction" },
  { key: "understanding", label: "Understanding of the Topic" },
  { key: "activities", label: "Activities / Projects Conducted" },
  { key: "experience", label: "Overall Class Experience" },
] as const;

// Sentinel tab key for feedback whose course had no teacher to attribute to.
// Mirrors UNATTRIBUTED in the backend's studentFeedbackGrouping.
const UNATTRIBUTED_KEY = "Unattributed";

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "My Courses", icon: MonitorPlay },
  { name: "My Assignments", icon: ClipboardList },
  { name: "Feedback", icon: MessageSquare },
] as const;

type TabName = (typeof navItems)[number]["name"];

// Shape of /api/public/my-courses rows we actually render. Everything is
// optional-safe: a batch course the student hasn't opened has no lessons yet.
interface MyCourse {
  id: number;
  slug: string;
  title: string;
  short_description?: string;
  thumbnail?: string;
  banner?: string;
  lesson_count?: number;
  progress?: number;
}

const IST = "Asia/Kolkata";

const fmtDue = (raw: string | null | undefined) => {
  if (!raw) return "No due date";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "No due date";
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST,
  });
};

/* ---------------------------------------------------------------------------
 * Shared visual language
 *
 * Everything below is built from design TOKENS (bg-card, border-border,
 * text-muted-foreground, bg-gradient-hero) rather than hardcoded greys, so the
 * scoped dark theme flips it automatically and the dashboard matches the rest
 * of the brand. Semantic status colours (emerald/amber/red/blue) are the one
 * deliberate exception — they carry meaning, so they're defined once in
 * STATE_STYLE with explicit dark variants.
 * ------------------------------------------------------------------------- */

/** Page heading: large title, supporting line, optional right-hand slot. */
const PageHeader = ({
  title, subtitle, icon: Icon, action,
}: {
  title: string;
  subtitle?: string;
  icon: typeof LayoutDashboard;
  action?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 flex-wrap">
    <div className="flex items-start gap-3 min-w-0">
      <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

/** Neutral content surface. `flush` drops padding for edge-to-edge children. */
const Card = ({
  children, className = "", flush = false,
}: { children: React.ReactNode; className?: string; flush?: boolean }) => (
  <section
    className={`rounded-2xl border border-border/70 bg-card shadow-sm ${flush ? "" : "p-5 sm:p-6"} ${className}`}
  >
    {children}
  </section>
);

/** Section heading used inside a Card. */
const CardTitle = ({
  children, icon: Icon, action,
}: { children: React.ReactNode; icon?: typeof LayoutDashboard; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
    <h2 className="text-base font-semibold flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-primary" />}
      {children}
    </h2>
    {action}
  </div>
);

/**
 * Empty state with an icon, a headline and an optional action — an illustrated
 * "nothing here yet" reads as intentional, where a bare line of grey text reads
 * as something failing to load.
 */
const EmptyState = ({
  icon: Icon, title, text, action,
}: {
  icon: typeof LayoutDashboard;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) => (
  <div className="py-12 text-center">
    <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="h-7 w-7" />
    </span>
    <p className="text-base font-semibold">{title}</p>
    {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/** Shimmer placeholder — preserves layout while data loads. */
const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-muted ${className}`} />
);

/**
 * Headline metric tile. `tone` tints the icon chip so the eye can group the
 * row at a glance without relying on colour alone (each tile is also labelled).
 */
const StatTile = ({
  value, label, icon: Icon, tone = "primary", loading = false,
}: {
  value: string | number;
  label: string;
  icon: typeof LayoutDashboard;
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
        <Skeleton className="h-8 w-16" />
      ) : (
        <div className="text-3xl font-bold leading-none tracking-tight tabular-nums">{value}</div>
      )}
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
};

/** Slim progress bar. */
const ProgressBar = ({ pct }: { pct: number }) => (
  <div
    className="h-2 overflow-hidden rounded-full bg-muted"
    role="progressbar"
    aria-valuenow={pct}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div className="h-full rounded-full bg-gradient-hero transition-all duration-700" style={{ width: `${pct}%` }} />
  </div>
);

// Per-state styling. Overdue is the only "alarm" colour, and it can only apply
// to work that was never submitted (see getAssignmentState). Dark variants are
// explicit because these are semantic, not tokenised, colours.
const STATE_STYLE: Record<
  AssignmentState,
  { label: string; badge: string; icon: typeof Clock }
> = {
  graded: {
    label: "Graded",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    icon: CheckCircle2,
  },
  submitted: {
    label: "Submitted",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-500/20",
    icon: CheckCircle2,
  },
  overdue: {
    label: "Overdue",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20",
    icon: AlertTriangle,
  },
  pending: {
    label: "Pending",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20",
    icon: Clock,
  },
};

const StateBadge = ({ state }: { state: AssignmentState }) => {
  const { label, badge, icon: Icon } = STATE_STYLE[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
};

/** Primary call-to-action, shared by empty states and forms. */
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-hero px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60";

/** Loads the student's enrolled courses once; shared by Dashboard + My Courses. */
function useMyCourses() {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getMyCourses()
      .then((rows) => { if (alive) setCourses((rows as MyCourse[]) || []); })
      .catch(() => { if (alive) setCourses([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { courses, loading };
}

/** Loads the student's assignments; `reload` re-fetches after a submission. */
function useMyAssignments() {
  const [items, setItems] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    listMyAssignments()
      .then((rows) => { if (alive) setItems(rows); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tick]);
  return { items, loading, reload: () => setTick((t) => t + 1) };
}

/** Loads the student's upcoming class sessions (soonest first). */
function useMyClasses() {
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listMyClasses()
      .then((rows) => { if (alive) setClasses(rows); })
      .catch(() => { if (alive) setClasses([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { classes, loading };
}

// --- Course card ------------------------------------------------------------

const CourseCard = ({ c }: { c: MyCourse }) => {
  const pct = Math.max(0, Math.min(100, Math.round(Number(c.progress) || 0)));
  const done = pct >= 100;
  const cta = done ? "Review course" : pct > 0 ? "Continue" : "Start learning";
  const thumb = c.thumbnail || c.banner || "";
  return (
    <Link
      to={`/courses/programs/course-details/play/${c.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={`${cta}: ${c.title}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-hero">
            <GraduationCap className="h-12 w-12 text-white/80" />
          </div>
        )}
        {/* A finished course earns a visible marker. */}
        {done && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <BadgeCheck className="h-3.5 w-3.5" /> Completed
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
          {c.title}
        </h3>
        {c.short_description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {c.short_description}
          </p>
        )}

        <div className="mt-auto pt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold tabular-nums">{pct}%</span>
            {(c.lesson_count || 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {c.lesson_count} {c.lesson_count === 1 ? "lesson" : "lessons"}
              </span>
            )}
          </div>
          <ProgressBar pct={pct} />
          <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
            <span className="text-sm font-semibold text-primary">{cta}</span>
            <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
};

/** Grid placeholder matching CourseCard's silhouette, so layout doesn't jump. */
const CourseCardSkeleton = () => (
  <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <Skeleton className="aspect-[16/9] rounded-none" />
    <div className="space-y-3 p-5">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  </div>
);

const MyCoursesView = () => {
  const { courses, loading } = useMyCourses();

  const inProgress = courses.filter((c) => {
    const p = Number(c.progress) || 0;
    return p > 0 && p < 100;
  }).length;
  const completed = courses.filter((c) => (Number(c.progress) || 0) >= 100).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Courses"
        icon={MonitorPlay}
        subtitle={
          loading
            ? "Loading your courses…"
            : courses.length === 0
              ? "Courses you enrol in appear here."
              : `${courses.length} ${courses.length === 1 ? "course" : "courses"} · ${inProgress} in progress · ${completed} completed`
        }
        action={
          courses.length > 0 ? (
            <Link to="/courses/browse" className={primaryBtn}>
              Explore more <ArrowRight className="h-4 w-4" />
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <CourseCardSkeleton key={i} />)}
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="No courses yet"
            text="Once you enrol in a course — or an admin adds you to a batch — it shows up here."
            action={
              <Link to="/courses/browse" className={primaryBtn}>
                Explore courses <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
};

// --- Assignments ------------------------------------------------------------

/** One assignment row: details, the student's grade/feedback, and a submit box. */
const AssignmentCard = ({ a, onSubmitted }: { a: StudentAssignment; onSubmitted: () => void }) => {
  const state = getAssignmentState(a);
  const sub = getSubmission(a);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const send = async () => {
    if (!text.trim() && !fileUrl.trim()) {
      toast.error("Add your answer or a file link before submitting.");
      return;
    }
    setSaving(true);
    try {
      await submitAssignment(a.id, {
        submission_text: text.trim() || undefined,
        file_url: fileUrl.trim() || undefined,
      });
      toast.success("Assignment submitted");
      setOpen(false); setText(""); setFileUrl("");
      onSubmitted();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Could not submit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // A thin coloured rail on the card edge makes state scannable down the list
  // without reading each badge.
  const rail = {
    graded: "before:bg-emerald-500",
    submitted: "before:bg-blue-500",
    overdue: "before:bg-red-500",
    pending: "before:bg-amber-500",
  }[state];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md
        before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${rail}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{a.title}</h3>
          {a.description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.description}</p>
          )}
        </div>
        <StateBadge state={state} />
      </div>

      {/* Meta strip: due date + total marks. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" /> Due {fmtDue(a.due_date)}
        </span>
        {a.max_score ? (
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> {a.max_score} marks
          </span>
        ) : null}
      </div>

      {a.instructions && (
        <div className="mt-4 ml-2 rounded-xl bg-muted/50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Instructions
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed">{a.instructions}</p>
        </div>
      )}

      {/* Reference material the teacher attached (PDFs, images, links). */}
      {a.attachments && a.attachments.length > 0 && (
        <div className="mt-4 ml-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {a.attachments_title || "Reference material"}
          </p>
          <div className="flex flex-wrap gap-2">
            {a.attachments.map((att, i) => (
              <a
                key={`${att.url}-${i}`}
                href={att.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                {att.kind === "link" ? (
                  <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{att.name || att.url}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Grade + teacher feedback, once graded. */}
      {sub?.status === "graded" && (
        <div className="mt-4 ml-2 rounded-xl bg-emerald-500/10 p-4 ring-1 ring-inset ring-emerald-500/20">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {sub.score ?? "—"}
            </span>
            {a.max_score ? (
              <span className="text-sm text-muted-foreground">/ {a.max_score}</span>
            ) : null}
          </div>
          {sub.feedback && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Teacher's feedback: </span>
              {sub.feedback}
            </p>
          )}
        </div>
      )}

      {/* Confirmation for work handed in but not yet marked. */}
      {sub?.status === "submitted" && (
        <p className="mt-4 ml-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-blue-500" />
          Submitted{sub.submitted_date ? ` on ${fmtDue(sub.submitted_date)}` : ""} — awaiting grading.
        </p>
      )}

      {/* Submission box — only for work not yet handed in. */}
      {!sub && (
        open ? (
          <div className="mt-4 ml-2 space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your answer…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
            <input
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="Or paste a file link (Google Drive, etc.)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={send} disabled={saving} className={primaryBtn}>
                {saving ? "Submitting…" : "Submit work"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold transition hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={`mt-4 ml-2 ${primaryBtn}`}>
            <Upload className="h-4 w-4" /> Submit assignment
          </button>
        )
      )}
    </div>
  );
};

/** Filter chips across the top of the assignments tab. */
type AssignmentFilter = "all" | AssignmentState;

const MyAssignmentsView = () => {
  const { items, loading, reload } = useMyAssignments();
  const [filter, setFilter] = useState<AssignmentFilter>("all");

  // Pending work becomes overdue purely by the passage of time, so these
  // derivations must be re-run as the clock moves, not cached against `items`.
  // Assignments have no start/end times, so this ticks at the slow rate.
  const tick = useScheduleTick(EMPTY_SCHEDULE);

  /* eslint-disable react-hooks/exhaustive-deps */
  const summary = useMemo(() => summarizeAssignments(items, new Date()), [items, tick]);

  // Most urgent first: overdue, then pending, then everything already handed
  // in — so the work that still needs doing is never buried below finished work.
  const RANK: Record<AssignmentState, number> = { overdue: 0, pending: 1, submitted: 2, graded: 3 };
  const sorted = useMemo(
    () =>
      [...items].sort((x, y) => {
        const now = new Date();
        const rx = RANK[getAssignmentState(x, now)];
        const ry = RANK[getAssignmentState(y, now)];
        if (rx !== ry) return rx - ry;
        return new Date(x.due_date || 0).getTime() - new Date(y.due_date || 0).getTime();
      }),
    // RANK is a module-stable literal; `items` and the clock drive re-sorting.
    [items, tick],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const visible = filter === "all" ? sorted : sorted.filter((a) => getAssignmentState(a) === filter);

  const chips: { key: AssignmentFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: summary.total },
    { key: "pending", label: "Pending", count: summary.pending },
    { key: "overdue", label: "Overdue", count: summary.overdue },
    { key: "submitted", label: "Submitted", count: summary.submitted },
    { key: "graded", label: "Graded", count: summary.graded },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Assignments"
        icon={ClipboardList}
        subtitle={
          loading
            ? "Loading your assignments…"
            : summary.total === 0
              ? "Work set by your teacher appears here."
              : `${summary.pending + summary.overdue} to do · ${summary.submitted} awaiting grading · ${summary.graded} graded`
        }
      />

      {/* Status filter — only worth showing once there's something to filter. */}
      {!loading && summary.total > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  on
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {c.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/20" : "bg-muted"}`}>
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-3 h-3 w-2/3" />
              <Skeleton className="mt-4 h-9 w-40 rounded-xl" />
            </Card>
          ))}
        </div>
      ) : summary.total === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            text="When your teacher sets work for your batch, it shows up here with its due date."
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Filter}
            title={`Nothing ${filter}`}
            text="Try a different filter to see your other assignments."
            action={
              <button type="button" onClick={() => setFilter("all")} className={primaryBtn}>
                Show all assignments
              </button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((a) => <AssignmentCard key={a.id} a={a} onSubmitted={reload} />)}
        </div>
      )}
    </div>
  );
};

// --- Classes ----------------------------------------------------------------

/** Day + time window for a class, in IST like the rest of the schedule UI. */
const fmtClassWhen = (start: string | null, end: string | null) => {
  if (!start) return "Time to be confirmed";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "Time to be confirmed";
  const day = s.toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", timeZone: IST,
  });
  const from = s.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST,
  });
  const e = end ? new Date(end) : null;
  const to = e && !Number.isNaN(e.getTime())
    ? e.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST })
    : null;
  if (!to || !e) return `${day} · ${from}`;

  // A session ending on a DIFFERENT day must show that date — time-only ranges
  // hide multi-day windows and make a long-running session look instantaneous.
  const sameDay =
    s.toLocaleDateString("en-IN", { timeZone: IST }) === e.toLocaleDateString("en-IN", { timeZone: IST });
  if (sameDay) return `${day} · ${from} – ${to}`;

  const endDay = e.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: IST });
  return `${day} ${from} → ${endDay} ${to}`;
};

/**
 * Re-render trigger for time-sensitive rows.
 *
 * This hook deliberately returns NOTHING. Callers read `new Date()` directly,
 * so what they display is always a pure function of the real clock and the
 * session's own start/end times — never of a stored timestamp that could go
 * stale. All this does is force a re-render often enough that the display keeps
 * up: once a second when something is visibly ticking (a countdown, a live
 * badge), otherwise every 15 seconds.
 *
 * The rate is recomputed on every tick from the session itself, so a row that
 * becomes imminent, goes live, or finishes adjusts its own cadence.
 */
/** Stable empty schedule for callers with no sessions — keeps the hook's key
 *  constant instead of allocating a fresh [] on every render. */
const EMPTY_SCHEDULE: { start_at?: string | null; end_at?: string | null }[] = [];

function useScheduleTick(items: { start_at?: string | null; end_at?: string | null }[]): number {
  const [tick, setTick] = useState(0);
  // Depend on the schedule's SHAPE, not array identity, so a re-fetch that
  // returns identical times doesn't restart the timer loop.
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

function useNow(c: { start_at?: string | null; end_at?: string | null } | null | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    let id: number;
    const schedule = () => {
      const at = new Date();
      const fast = shouldCountDown(c, at) || getClassState(c, at) === "live";
      id = window.setTimeout(() => { force((n) => n + 1); schedule(); }, fast ? 1000 : 15000);
    };
    schedule();
    return () => window.clearTimeout(id);
  }, [c]);
}

/**
 * One upcoming class. The Join button only activates while the class is live
 * or about to start (see canJoinClass) — an always-on link sends students into
 * an empty room hours early. In the final 10 minutes the "Starting soon" badge
 * becomes a live M:SS countdown.
 */
const ClassRow = ({ c }: { c: StudentClass }) => {
  // Whether a class is live is a pure function of ITS OWN start/end times and
  // the current wall clock — nothing else. `useNow` only forces re-renders as
  // time passes; it never decides the answer. Reading the clock fresh on every
  // render means the badge is right on the first paint, before any timer fires.
  useNow(c);
  const now = new Date();

  const state = getClassState(c, now);
  const joinable = canJoinClass(c, now);
  const remaining = msUntilStart(c, now);
  const counting = shouldCountDown(c, now);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4 transition hover:border-primary/30">
      {/* Left: what and when. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{c.name}</p>
          {state === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
              {/* Pulsing dot reads as "happening now" at a glance. */}
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Live now
            </span>
          )}
          {/* Outside the countdown window the badge stays inline with the title;
              once counting, it moves to the centre column below. */}
          {state === "soon" && !counting && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
              Starting soon
            </span>
          )}
        </div>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> {fmtClassWhen(c.start_at, c.end_at)}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {c.course_title || "—"}
          {c.teacher_names.length > 0 ? ` · with ${c.teacher_names.join(", ")}` : ""}
        </p>
      </div>

      {/* Centre: the live countdown. Given its own column so the ticking digits
          sit between the class details and the Join button rather than crowding
          the title. tabular-nums keeps the width stable as the digits change,
          so neighbouring content doesn't jitter every second. */}
      {counting && (
        <div
          aria-live="off"
          className="flex shrink-0 flex-col items-center rounded-xl bg-amber-500/10 px-4 py-2 ring-1 ring-inset ring-amber-500/20"
        >
          <span className="inline-flex items-center gap-1.5 text-lg font-bold tabular-nums leading-none text-amber-700 dark:text-amber-400">
            <Timer className="h-4 w-4" />
            {formatCountdown(remaining)}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
            Starts in
          </span>
        </div>
      )}

      {/* Right: the action. shrink-0 so the centre countdown can never squeeze
          the Join button onto two lines. */}
      {c.meeting_link ? (
        joinable ? (
          <a
            href={c.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className={`${primaryBtn} shrink-0`}
          >
            <Video className="h-4 w-4" /> Join class
          </a>
        ) : (
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

// --- Dashboard (overview) ---------------------------------------------------

const OverviewView = ({ name, onGoTo }: { name: string; onGoTo: (t: TabName) => void }) => {
  const { courses, loading: coursesLoading } = useMyCourses();
  const { items: assignments, loading: aLoading } = useMyAssignments();
  const { classes, loading: classesLoading } = useMyClasses();

  // Everything below depends on the CURRENT time (an assignment becomes
  // overdue, a class ends), so it must be recomputed as the clock moves rather
  // than memoised against the fetched data alone. `tick` only invalidates the
  // memos; each derived value reads a fresh `new Date()`.
  const tick = useScheduleTick(classes);

  /* eslint-disable react-hooks/exhaustive-deps */
  const summary = useMemo(() => summarizeAssignments(assignments, new Date()), [assignments, tick]);
  const avg = useMemo(() => averageProgress(courses), [courses]);

  // Soonest-due work that still needs doing — the most useful thing to surface.
  const upcoming = useMemo(
    () =>
      assignments
        .filter((a) => {
          const s = getAssignmentState(a, new Date());
          return s === "pending" || s === "overdue";
        })
        .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())
        .slice(0, 5),
    [assignments, tick],
  );

  // Only classes that haven't finished yet. Previously this took classes[0]
  // outright, so a class that ended while the tab sat open stayed billed as
  // "next class" — and the stat tile kept counting it.
  const upcomingClasses = useMemo(
    () => splitSchedule(classes, new Date()).upcoming,
    [classes, tick],
  );
  const liveClass = useMemo(
    () => classes.find((c) => getClassState(c, new Date()) === "live"),
    [classes, tick],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // The single most useful next action, surfaced in the hero.
  const nextUp = upcoming[0];
  const toDo = summary.pending + summary.overdue;
  const nextClass = upcomingClasses[0];

  const linkBtn =
    "inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:gap-2.5";

  return (
    <div className="space-y-6">
      {/* Hero — the only saturated surface on the page, so it anchors the eye. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-hero p-6 text-white shadow-sm sm:p-8">
        {/* Decorative wash; aria-hidden since it carries no meaning. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back, {name} 👋
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85">
            {aLoading || classesLoading
              ? "Getting your learning up to date…"
              : liveClass
                ? `${liveClass.name} is happening right now — join in.`
                : nextClass
                  ? `Your next class, ${nextClass.name}, is on ${fmtClassWhen(nextClass.start_at, nextClass.end_at)}.`
                  : toDo > 0
                    ? `You have ${toDo} ${toDo === 1 ? "assignment" : "assignments"} waiting${nextUp ? ` — next up: ${nextUp.title}.` : "."}`
                    : "You're all caught up. Nice work — keep the streak going."}
          </p>

          {/* A class in progress outranks assignment work — join first. */}
          {!classesLoading && liveClass?.meeting_link ? (
            <a
              href={liveClass.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90"
            >
              <Video className="h-4 w-4" /> Join class now
            </a>
          ) : !aLoading && toDo > 0 ? (
            <button
              type="button"
              onClick={() => onGoTo("My Assignments")}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90"
            >
              View assignments <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile icon={GraduationCap} tone="primary" loading={coursesLoading} value={courses.length} label="Enrolled courses" />
        <StatTile icon={TrendingUp} tone="blue" loading={coursesLoading} value={`${avg}%`} label="Average progress" />
        <StatTile icon={Clock} tone="amber" loading={aLoading} value={toDo} label="Assignments to do" />
        <StatTile
          icon={Video}
          tone="emerald"
          loading={classesLoading}
          value={
            liveClass
              ? "Live"
              : nextClass?.start_at
                ? new Date(nextClass.start_at).toLocaleDateString("en-IN", {
                    day: "2-digit", month: "short", timeZone: IST,
                  })
                : "—"
          }
          label={liveClass ? "Class in progress" : "Next class"}
        />
      </div>

      {/* Upcoming classes — the most time-sensitive thing on the page, so it
          sits directly under the metrics, above assignment work. */}
      <Card>
        <CardTitle icon={Video}>Upcoming classes</CardTitle>
        {classesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : upcomingClasses.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No classes scheduled"
            text="When your teacher schedules a live class for your course, it appears here with a join link."
          />
        ) : (
          <ul className="space-y-3">
            {upcomingClasses.slice(0, 4).map((c) => <ClassRow key={c.id} c={c} />)}
          </ul>
        )}
      </Card>

      {/* Two-column: work to do (primary) beside progress (secondary). */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle
            icon={ClipboardList}
            action={
              !aLoading && upcoming.length > 0 ? (
                <button type="button" onClick={() => onGoTo("My Assignments")} className={linkBtn}>
                  View all <ArrowRight className="h-4 w-4" />
                </button>
              ) : undefined
            }
          >
            Upcoming assignments
          </CardTitle>

          {aLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up"
              text="Nothing due right now. New work from your teacher will appear here."
            />
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((a) => {
                const st = getAssignmentState(a);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onGoTo("My Assignments")}
                      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-4 text-left transition hover:border-primary/30 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.title}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" /> Due {fmtDue(a.due_date)}
                        </p>
                      </div>
                      <StateBadge state={st} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Per-course progress — a compact read on where effort is going. */}
        <Card>
          <CardTitle icon={TrendingUp}>Course progress</CardTitle>
          {coursesLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : courses.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No courses yet" />
          ) : (
            <ul className="space-y-4">
              {courses.slice(0, 5).map((c) => {
                const pct = Math.max(0, Math.min(100, Math.round(Number(c.progress) || 0)));
                return (
                  <li key={c.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{c.title}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Continue learning */}
      <Card flush className="p-5 sm:p-6">
        <CardTitle
          icon={MonitorPlay}
          action={
            courses.length > 3 ? (
              <button type="button" onClick={() => onGoTo("My Courses")} className={linkBtn}>
                View all {courses.length} <ArrowRight className="h-4 w-4" />
              </button>
            ) : undefined
          }
        >
          Continue learning
        </CardTitle>
        {coursesLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <CourseCardSkeleton key={i} />)}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No courses yet"
            text="Explore the catalog to get started."
            action={
              <Link to="/courses/browse" className={primaryBtn}>
                Explore courses <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.slice(0, 3).map((c) => <CourseCard key={c.id} c={c} />)}
          </div>
        )}
      </Card>
    </div>
  );
};

// --- Feedback ---------------------------------------------------------------

/**
 * Feedback tab. The form cards themselves come from the shared
 * FeedbackFormsInbox (also used by the notifications feed), so the two stay in
 * sync — this wraps them in the dashboard's page header and adds context on
 * what the forms are for.
 */
/** Read-only star row for a 0-5 score. */
const Stars = ({ value }: { value: number }) => {
  const v = Math.round(Number(value) || 0);
  return (
    <span className="tabular-nums" title={`${(Number(value) || 0).toFixed(1)} / 5`}>
      <span className="text-yellow-400">{"★".repeat(v)}</span>
      <span className="opacity-25">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
};

const fmtFeedbackDate = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * The student's own class feedback, grouped into one tab per teacher they have
 * rated. Data comes from /api/public/teacher-feedback/mine, which the server
 * scopes to the verified student and groups server-side.
 */
const MyFeedbackByTeacher = () => {
  const [groups, setGroups] = useState<MyFeedbackByTeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTeacher, setActiveTeacher] = useState<string>("");

  useEffect(() => {
    let alive = true;
    getMyTeacherFeedbackByTeacher()
      .then((rows) => {
        if (!alive) return;
        setGroups(rows);
        // Default to the first (most recently active) teacher.
        if (rows.length) setActiveTeacher(rows[0].teacher_id ?? UNATTRIBUTED_KEY);
      })
      .catch(() => { if (alive) setGroups([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const current = useMemo(
    () => groups.find((g) => (g.teacher_id ?? UNATTRIBUTED_KEY) === activeTeacher) ?? groups[0],
    [groups, activeTeacher],
  );

  if (loading) {
    return <Card><div className="text-sm opacity-70">Loading your feedback…</div></Card>;
  }
  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={MessageSquare}
          title="You haven't rated a class yet"
          text="After a class, rate it from your course page. Your ratings appear here, grouped by teacher."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* One tab per teacher this student has rated. */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const key = g.teacher_id ?? UNATTRIBUTED_KEY;
          const on = key === (current?.teacher_id ?? UNATTRIBUTED_KEY);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTeacher(key)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                on
                  ? "bg-orange-500 text-white shadow-sm"
                  : "border border-border/70 bg-card hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              <span>{g.teacher_name}</span>
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/25" : "bg-black/5 dark:bg-white/10"}`}>
                {g.count}
              </span>
            </button>
          );
        })}
      </div>

      {current && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{current.teacher_name}</p>
                <p className="text-xs opacity-70">
                  {current.count} {current.count === 1 ? "submission" : "submissions"}
                  {current.latest_at ? ` · last on ${fmtFeedbackDate(current.latest_at)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Stars value={current.avg_overall} />
                <span className="text-sm font-semibold tabular-nums">{current.avg_overall.toFixed(1)}</span>
              </div>
            </div>
          </Card>

          {current.feedback.map((f) => (
            <Card key={f.id}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{f.course_title || "Class feedback"}</p>
                    <p className="text-xs opacity-70">{fmtFeedbackDate(f.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Stars value={f.overall} />
                    <span className="text-sm font-semibold tabular-nums">{f.overall.toFixed(1)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 border-t border-border/70 pt-3 sm:grid-cols-2">
                  {FEEDBACK_AREAS.map((a) => (
                    <div key={a.key} className="flex items-center justify-between text-xs">
                      <span className="opacity-70">{a.label}</span>
                      <Stars value={f.ratings?.[a.key] || 0} />
                    </div>
                  ))}
                </div>

                {f.enjoyed && (
                  <p className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.06]">
                    <span className="opacity-60">💬 Enjoyed: </span>{f.enjoyed}
                  </p>
                )}
                {f.suggestions && (
                  <p className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.06]">
                    <span className="opacity-60">💡 Suggestion: </span>{f.suggestions}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const FeedbackView = () => {
  const [pane, setPane] = useState<"forms" | "mine">("forms");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        icon={MessageSquare}
        subtitle={
          pane === "forms"
            ? "Forms your teacher sent you after class. Each one is submitted once."
            : "The class feedback you've given, grouped by teacher."
        }
      />

      <div className="flex flex-wrap gap-2">
        {([
          { key: "forms", label: "Forms from teachers" },
          { key: "mine", label: "My feedback by teacher" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPane(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              pane === t.key
                ? "bg-orange-500 text-white shadow-sm"
                : "border border-border/70 bg-card hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pane === "forms" ? <FeedbackFormsInbox /> : <MyFeedbackByTeacher />}
    </div>
  );
};

// --- Shell ------------------------------------------------------------------

const StudentDashboardShell = () => {
  const [active, setActive] = useState<TabName>("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logoutUser } = useAuth();
  const { isDark } = useDashboardTheme();

  // Shared with the sidebar header so both greet with the same name.
  const name = firstName(user);

  const go = (t: TabName) => { setActive(t); setSidebarOpen(false); };

  return (
    /* `dash-dark` is the STUDENT surface hook (teacher-dark is the mentor
       shell). It repaints the hardcoded light utilities used by reused tab
       content — notably FeedbackFormsInbox's bg-white / text-gray-* / inputs —
       which the shadcn token flip alone does not cover. */
    <div className={`flex bg-muted/40 ${isDark ? "dark dash-dark" : ""}`}>
      {/* Backdrop for the mobile drawer. Sits below the site Navbar (z-50) so
          the navbar stays reachable while the drawer is open. */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar — drawer on mobile, sticky on desktop.
          The shell renders BELOW the sticky site Navbar (h-16 mobile / h-20
          desktop, z-50), so the sidebar is offset by that height instead of
          spanning the full viewport: `top-16 lg:top-20` with a matching
          height, and z-40 so it never covers the navbar. */}
      <aside className={`w-64 shrink-0 bg-gradient-to-b from-[#fff6ee] to-white dark:from-[#16161f] dark:to-[#101019] border-r border-orange-100 dark:border-white/10 flex flex-col
        fixed left-0 top-16 lg:top-20 h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] z-40
        transform transition-transform duration-200
        lg:sticky lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden absolute top-4 right-4 text-muted-foreground hover:text-primary">
          <X className="w-6 h-6" />
        </button>

        {/* The site Navbar already shows the brand, so the sidebar header
            greets the student by the name they registered with, alongside the
            dashboard-scoped theme toggle. `title` exposes the full name when a
            long one is truncated. */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-orange-100 dark:border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-sm font-bold text-white">
              {initialsOf(user)}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-tight">{greeting()},</p>
              <p className="truncate font-semibold leading-tight" title={displayName(user)}>
                {firstName(user)}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1">
          {navItems.map((item) => {
            const on = active === item.name;
            return (
              <button
                key={item.name}
                onClick={() => go(item.name)}
                aria-current={on ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  on
                    ? "bg-primary/10 text-primary border-r-4 border-primary"
                    : "text-muted-foreground hover:bg-orange-50 dark:hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Logout actually ends the session — the teacher shell's Link to "/"
            only navigated away and left the token in place. */}
        <button
          type="button"
          onClick={() => { void logoutUser(); }}
          className="flex items-center gap-3 px-6 py-4 text-sm font-semibold text-red-500 border-t border-orange-100 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Power className="w-5 h-5" /> Logout
        </button>
      </aside>

      {/* min-w-0 stops wide content (course grids, tables) from forcing the
          flex row wider than the viewport and scrolling the page sideways. */}
      <main className="flex-1 min-w-0 p-4 lg:p-8 space-y-6">
        {/* Opens the sidebar drawer on mobile, where the sidebar is off-canvas.
            Replaces the shell's old fixed top bar, which would have stacked
            underneath the site Navbar. */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open dashboard menu"
          aria-expanded={sidebarOpen}
          className="lg:hidden inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-semibold shadow-sm"
        >
          <Menu className="h-5 w-5" /> {active}
        </button>

        {active === "Dashboard" ? (
          <OverviewView name={name} onGoTo={go} />
        ) : active === "My Courses" ? (
          <MyCoursesView />
        ) : active === "My Assignments" ? (
          <MyAssignmentsView />
        ) : (
          <FeedbackView />
        )}
      </main>
    </div>
  );
};

export default StudentDashboardShell;
