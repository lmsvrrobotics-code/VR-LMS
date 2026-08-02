import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap,
  FileText,
  Clock,
  ArrowRight,
  BadgeCheck,
  RotateCw,
} from "lucide-react";
import { getMyCourses } from "@/api/course/courseApi";

// Shape returned by /api/public/my-courses (sanitizeCourse + a `progress`
// field). Every property is optional-safe because a delegated (batch) course a
// student hasn't opened yet can have 0 lessons / no thumbnail.
type MyCourse = {
  id: number;
  slug: string;
  title: string;
  short_description?: string;
  thumbnail?: string;
  banner?: string;
  level?: string;
  class_from?: number | null;
  class_to?: number | null;
  lesson_count?: number;
  total_duration_secs?: number;
  has_certificate?: boolean;
  progress?: number;
};

// Class-access badge label — mirrors the public catalog card so the two views
// speak the same language.
const classLabel = (c: MyCourse): string => {
  if (c.class_from == null && c.class_to == null) return "All classes";
  if (c.class_from != null && c.class_to != null) return `Class ${c.class_from}–${c.class_to}`;
  if (c.class_from != null) return `Class ${c.class_from}+`;
  return `Up to Class ${c.class_to}`;
};

const titleCase = (s?: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

// One enrolled-course card: the public catalog card design (thumbnail, class
// badge, title, description, lesson/hours footer) with the enrolled-specific
// progress bar + Continue/Start/Review action layered on. Uses site theme
// tokens (primary / gradient-hero / card-ngo-static) so it's brand-consistent
// and correct in dark mode.
const EnrolledCourseCard = ({ c }: { c: MyCourse }) => {
  const hours = Math.floor((c.total_duration_secs || 0) / 3600);
  const lessons = c.lesson_count || 0;
  const pct = Math.max(0, Math.min(100, Math.round(Number(c.progress) || 0)));
  const done = pct >= 100;
  const cta = done ? "Review course" : pct > 0 ? "Continue" : "Start learning";
  const thumb = c.thumbnail || c.banner || "";

  return (
    <Link
      to={`/courses/programs/course-details/play/${c.slug}`}
      className="card-ngo-static border-0 group overflow-hidden flex flex-col h-full rounded-2xl"
      aria-label={`${cta}: ${c.title}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt={c.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-hero">
            <GraduationCap className="w-14 h-14 text-white/80" />
          </div>
        )}

        {/* Class badge (top-left) */}
        <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-background/85 backdrop-blur text-xs font-semibold text-primary shadow-sm">
          {classLabel(c)}
        </span>

        {/* Completed ribbon (top-right) — a small win marker when done. */}
        {done && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-xs font-semibold shadow-sm">
            <BadgeCheck className="w-3.5 h-3.5" /> Completed
          </span>
        )}
      </div>

      <div className="p-6 flex flex-col flex-1">
        {/* Level + certificate meta line */}
        <div className="mb-2 flex items-center gap-2 text-xs">
          {c.level && (
            <span className="inline-flex items-center rounded-full bg-secondary/70 px-2.5 py-0.5 font-semibold text-muted-foreground">
              {titleCase(c.level)}
            </span>
          )}
          {c.has_certificate && (
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <BadgeCheck className="w-3.5 h-3.5" /> Certificate
            </span>
          )}
        </div>

        <h3 className="font-bold text-xl mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {c.title}
        </h3>
        {c.short_description && (
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-4">
            {c.short_description}
          </p>
        )}

        {/* Progress — this is an enrolled course, so show how far along. */}
        <div className="mt-auto">
          <div className="h-2.5 rounded-full bg-secondary/70 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-hero transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">{pct}% complete</span>
            {(lessons > 0 || hours > 0) && (
              <span className="flex items-center gap-3 text-muted-foreground">
                {lessons > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    {lessons} {lessons === 1 ? "Lesson" : "Lessons"}
                  </span>
                )}
                {hours > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    {hours}+ hrs
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">{cta}</span>
            <ArrowRight className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
};

// Loading placeholder card — matches the real card's silhouette so the layout
// doesn't jump when data arrives.
const SkeletonCard = () => (
  <div className="card-ngo-static border-0 overflow-hidden rounded-2xl animate-pulse">
    <div className="aspect-[16/9] bg-muted" />
    <div className="p-6 space-y-3">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-5 w-3/4 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-2.5 w-full rounded-full bg-muted mt-4" />
    </div>
  </div>
);

// Student-facing "Enrolled Courses" page, reached from the top navbar tab.
// Backed by /api/public/my-courses, which resolves courses from
// user_progress.enrolled = 1 ∪ the student's batch courses — the SAME enrolment
// source the admin "Manage Students" list and Manage Batches drive. So a
// student sees here exactly the courses an admin granted them.
export default function EnrolledCourses() {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getMyCourses()
      .then((rows) => setCourses((rows as MyCourse[]) || []))
      .catch(() => setError("We couldn't load your enrolled courses. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const count = courses.length;
  const inProgress = courses.filter((c) => {
    const p = Number(c.progress) || 0;
    return p > 0 && p < 100;
  }).length;
  const completed = courses.filter((c) => (Number(c.progress) || 0) >= 100).length;

  return (
    <div className="section-padding">
      <div className="container-ngo">
        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <p className="text-primary font-semibold">My Learning</p>
          <h2 className="text-3xl md:text-4xl font-bold">
            Your <span className="text-gradient">enrolled courses</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Everything you're enrolled in, in one place. Pick up right where you left off.
          </p>

          {/* Summary chips (only once loaded with data) */}
          {!loading && !error && count > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3.5 py-1.5 text-sm font-medium text-foreground">
                <GraduationCap className="w-4 h-4 text-primary" />
                {count} {count === 1 ? "course" : "courses"}
              </span>
              {inProgress > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary">
                  <RotateCw className="w-4 h-4" />
                  {inProgress} in progress
                </span>
              )}
              {completed > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-sm font-medium text-emerald-600">
                  <BadgeCheck className="w-4 h-4" />
                  {completed} completed
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center">
            <p className="mb-2 text-base font-semibold text-red-700">Couldn't load courses</p>
            <p className="mb-4 text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 bg-gradient-hero text-white rounded-full px-6 py-2 text-sm font-semibold"
            >
              <RotateCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : count === 0 ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-border bg-card py-16 text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-hero text-white">
              <GraduationCap className="h-7 w-7" />
            </span>
            <p className="mb-1 text-lg font-semibold text-foreground">No enrolled courses yet</p>
            <p className="mb-5 text-sm text-muted-foreground">
              Once you enrol in a course — or an admin adds you to a batch — it shows up here.
            </p>
            <Link
              to="/courses/browse"
              className="inline-flex items-center gap-2 bg-gradient-hero text-white rounded-full px-6 py-2.5 text-sm font-semibold"
            >
              Explore Courses <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {courses.map((c) => (
              <EnrolledCourseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
