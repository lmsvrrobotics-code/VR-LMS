import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { GraduationCap, FileText, Clock, ArrowRight, Search, X } from "lucide-react";

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

interface CourseItem {
  id: number;
  title: string;
  slug: string;
  short_description: string;
  thumbnail: string;
  level: string;
  class_from: number | null;
  class_to: number | null;
  lesson_count: number;
  total_duration_secs: number;
}

// Filter pills shown on the catalog (mirrors the navbar Courses dropdown).
// A bucket filters by either a class range (?class=from-to) or a track
// (?track=engineering|freshers). Empty both = all courses.
const BUCKETS: { label: string; cls: string; track: string }[] = [
  { label: "All Courses", cls: "", track: "" },
  { label: "Class 8 – 12", cls: "8-12", track: "" },
  { label: "Class 12 – 18", cls: "12-18", track: "" },
  { label: "Engineering", cls: "", track: "engineering" },
  { label: "Freshers", cls: "", track: "freshers" },
];

const parseBucket = (raw: string | null): { from: number; to: number } | null => {
  if (!raw) return null;
  const m = /^(d{1,2})-(d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]) };
};

const classLabel = (c: CourseItem): string => {
  if (c.class_from == null && c.class_to == null) return "All classes";
  if (c.class_from != null && c.class_to != null) return `Class ${c.class_from}–${c.class_to}`;
  if (c.class_from != null) return `Class ${c.class_from}+`;
  return `Up to Class ${c.class_to}`;
};

const CourseCatalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeClass = searchParams.get("class") || "";
  const activeTrack = searchParams.get("track") || "";
  const activeSearch = searchParams.get("search") || "";
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Local text box, kept in sync with the URL so back/forward + shared links work.
  const [term, setTerm] = useState(activeSearch);
  useEffect(() => { setTerm(activeSearch); }, [activeSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const bucket = parseBucket(activeClass);
    const params: Record<string, string | number> = { limit: 48, t: Date.now() };
    if (bucket) {
      params.classFrom = bucket.from;
      params.classTo = bucket.to;
    }
    if (activeTrack) params.track = activeTrack;
    if (activeSearch) params.search = activeSearch;
    axios
      .get(`${ADMIN_BASE}/api/public/courses/catalog`, { params, timeout: 30000 })
      .then(({ data }) => {
        if (!cancelled) setCourses(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeClass, activeTrack, activeSearch]);

  // Selecting a class/track keeps the current search term so the two compose.
  const selectBucket = (b: { cls: string; track: string }) => {
    const next: Record<string, string> = {};
    if (b.cls) next.class = b.cls;
    else if (b.track) next.track = b.track;
    if (activeSearch) next.search = activeSearch;
    setSearchParams(next);
  };

  // Submit/clear the search box (preserves the active class/track filter).
  const runSearch = (value: string) => {
    const next: Record<string, string> = {};
    if (activeClass) next.class = activeClass;
    if (activeTrack) next.track = activeTrack;
    const v = value.trim();
    if (v) next.search = v;
    setSearchParams(next);
  };

  return (
    <div className="section-padding">
      <div className="container-ngo">
        <div className="text-center space-y-3 mb-10">
          <p className="text-primary font-semibold">Courses</p>
          <h2 className="text-3xl md:text-4xl font-bold">
            Explore courses <span className="text-gradient">by class</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Pick a class range to see the courses available for those students.
          </p>
        </div>

        {/* Search box */}
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(term); }}
          className="max-w-xl mx-auto mb-8"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="What do you want to learn? e.g. robots, coding, AI"
              aria-label="Search courses"
              className="w-full rounded-full border border-border bg-white pl-12 pr-24 py-3 text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
            {activeSearch && (
              <button
                type="button"
                onClick={() => { setTerm(""); runSearch(""); }}
                aria-label="Clear search"
                className="absolute right-[88px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-gradient-hero text-white rounded-full px-5 py-2 text-sm font-semibold"
            >
              Search
            </button>
          </div>
          {activeSearch && (
            <p className="text-center text-sm text-muted-foreground mt-3">
              Showing results for “<span className="font-semibold text-foreground">{activeSearch}</span>”
            </p>
          )}
        </form>

        {/* Class filter pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
          {BUCKETS.map((b) => {
            const active = activeClass === b.cls && activeTrack === b.track;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => selectBucket(b)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                  active
                    ? "bg-gradient-hero text-white shadow-md"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-16">Loading courses…</p>
        ) : courses.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            No courses found for this selection yet.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {courses.map((c) => {
              const hours = Math.floor((c.total_duration_secs || 0) / 3600);
              return (
                <Link
                  key={c.id}
                  to={`/courses/programs/course-details?slug=${encodeURIComponent(c.slug)}`}
                  className="card-ngo-static border-0 group overflow-hidden flex flex-col h-full rounded-2xl"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                    {c.thumbnail ? (
                      <img
                        src={c.thumbnail}
                        alt={c.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-hero">
                        <GraduationCap className="w-14 h-14 text-white/80" />
                      </div>
                    )}
                    <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-background/85 backdrop-blur text-xs font-semibold text-primary shadow-sm">
                      {classLabel(c)}
                    </span>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="font-bold text-xl mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {c.title}
                    </h3>
                    {c.short_description && (
                      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-4">
                        {c.short_description}
                      </p>
                    )}
                    <div className="mt-auto flex items-center gap-6 pt-4 border-t border-border/60 text-sm font-medium">
                      <span className="inline-flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        {c.lesson_count} {c.lesson_count === 1 ? "Lesson" : "Lessons"}
                      </span>
                      {hours > 0 && (
                        <span className="inline-flex items-center gap-2">
                          <Clock className="w-4 h-4 text-primary" />
                          {hours}+ Hours
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 ml-auto text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseCatalog;
