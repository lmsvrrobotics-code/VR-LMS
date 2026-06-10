import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Clock, Play, ShoppingCart } from "lucide-react";
import { getMyCourses } from "@/api/course/courseApi";

// All admin-published courses, shown directly to the student (no college
// selection and no pre-assessment gate). Sourced from the public catalog
// endpoint which returns every active course the admin created.
interface CourseCard {
  id: number;
  slug: string;
  title: string;
  short_description?: string;
  thumbnail?: string;
  banner?: string;
  level?: string;
  lesson_count?: number;
  total_duration_secs?: number;
  is_paid?: number | boolean;
  is_marketing?: boolean;
}

interface DemoVideo {
  id: number;
  title: string;
  description?: string;
  media_type: string;
  media_url: string;
  is_intro?: boolean;
}

const ADMIN_BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

// Admin-uploaded marketing/intro videos shown above the courses so a freshly
// registered student (who'd otherwise just see "Buy this course") gets an
// attractive intro to VR Robotics. Sourced from /api/public/demo-videos.
const DemoVideosSection = () => {
  const [videos, setVideos] = useState<DemoVideo[]>([]);
  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${ADMIN_BASE}/api/public/demo-videos`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache" }, timeout: 30000 })
      .then(({ data }) => { if (!cancelled) setVideos(Array.isArray(data) ? data.filter((v: DemoVideo) => v.media_url) : []); })
      .catch(() => { if (!cancelled) setVideos([]); });
    return () => { cancelled = true; };
  }, []);

  if (videos.length === 0) return null;
  const intro = videos.find((v) => v.is_intro) || videos[0];
  const rest = videos.filter((v) => v.id !== intro.id);

  const Player = ({ v, className = "" }: { v: DemoVideo; className?: string }) =>
    v.media_type === "video" ? (
      <iframe title={v.title} src={v.media_url} className={className} allowFullScreen loading="lazy" />
    ) : (
      <img src={v.media_url} alt={v.title} className={className} loading="lazy" />
    );

  return (
    <div className="mb-10">
      <div className="mb-5">
        <h2 className="text-xl sm:text-2xl font-bold">
          Explore <span className="text-[#FF6A00]">VR Robotics</span>
        </h2>
        <p className="text-sm text-muted-foreground">Watch how it works and what you'll build.</p>
      </div>

      {/* Intro (CEO welcome) — large */}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black/5">
          <div className="aspect-video w-full">
            <Player v={intro} className="w-full h-full" />
          </div>
          <div className="p-4 bg-white">
            <h3 className="font-bold text-base">{intro.title}</h3>
            {intro.description && <p className="text-sm text-muted-foreground mt-1">{intro.description}</p>}
          </div>
        </div>

        {/* Other demo videos */}
        {rest.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {rest.slice(0, 3).map((v) => (
              <div key={v.id} className="rounded-xl overflow-hidden border border-gray-200 bg-white flex flex-col">
                <div className="aspect-video w-full bg-black/5">
                  <Player v={v} className="w-full h-full" />
                </div>
                <div className="p-3">
                  <h4 className="font-semibold text-sm truncate">{v.title}</h4>
                  {v.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ProgramsPage = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseCard[]>([]);
  // Ids of courses this student can already access (paid ∪ enrolled ∪ delegated
  // by an admin/teacher). Drives "Go to Course" vs "Buy this course" per card.
  const [accessedIds, setAccessedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Catalog (everyone) + the student's accessible courses (auth'd) in
    // parallel. my-courses can fail for an anonymous viewer — that just means
    // no accessed ids, so paid courses fall back to "Buy this course".
    Promise.all([
      axios
        .get(`${ADMIN_BASE}/api/public/courses/catalog`, { params: { limit: 48, t: Date.now() }, headers: { "Cache-Control": "no-cache" }, timeout: 30000 })
        .then(({ data }) => (Array.isArray(data) ? data : [])),
      getMyCourses().then((c) => c as { id: number }[]).catch(() => [] as { id: number }[]),
    ])
      .then(([catalog, mine]) => {
        if (cancelled) return;
        setCourses(catalog);
        setAccessedIds(new Set(mine.map((c) => Number(c.id))));
      })
      .catch(() => { if (!cancelled) setError("Failed to load courses."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Open the course details page (progress + description, then "Go to Course"
  // there enters the player).
  const open = (slug: string) => navigate(`/courses/programs/course-details?slug=${encodeURIComponent(slug)}`);
  const hasAccess = (course: CourseCard) =>
    course.is_marketing || !course.is_paid || Number(course.is_paid) === 0 || accessedIds.has(Number(course.id));
  // Always land on the course-details page first (review/progress for an
  // accessible course, buy for a paid one). The details page's own
  // "Go to Course" button is what jumps into the player.
  const goToCourse = (course: CourseCard) => open(course.slug);

  return (
    <section className="py-6 bg-gradient-subtle">
      <div className="w-full">
        {/* Admin-uploaded intro + sample videos to attract new students. */}
        <DemoVideosSection />

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && !loading && <p className="text-red-600">{error}</p>}
        {!loading && !error && courses.length === 0 && (
          <p className="text-gray-600">No courses available yet.</p>
        )}

        {/* Square-ish cards, 3 per row — compact and easy to scan. Same info
            (no image for now). The whole card opens the course. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {!loading && courses.map((course) => {
            const hours = Math.floor((course.total_duration_secs || 0) / 3600);
            const accessible = hasAccess(course);
            return (
              <div
                key={course.id}
                role="button"
                tabIndex={0}
                onClick={() => goToCourse(course)}
                onKeyDown={(e) => { if (e.key === "Enter") goToCourse(course); }}
                className="group cursor-pointer text-left rounded-2xl border border-gray-200 bg-white p-7 sm:p-8 shadow-sm hover:shadow-lg hover:border-[#FF6A00]/40 transition-all flex flex-col min-h-[240px]"
              >
                {course.is_marketing && (
                  <span className="inline-flex items-center gap-1 self-start mb-2 rounded-full bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1">
                    ★ Free sample
                  </span>
                )}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-[22px] font-bold text-[#FF6A00] line-clamp-2">{course.title}</h3>
                  <ArrowRight className="w-7 h-7 text-[#FF6A00] shrink-0 mt-0.5 group-hover:translate-x-1 transition-transform" />
                </div>
                {course.short_description && (
                  <p className="text-gray-600 text-[15px] leading-relaxed line-clamp-3 mb-5">{course.short_description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-gray-500">
                  {course.level && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium capitalize">{course.level}</span>
                  )}
                  <span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {course.lesson_count || 0} {course.lesson_count === 1 ? "Lesson" : "Lessons"}</span>
                  {hours > 0 && <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {hours}+ Hours</span>}
                </div>

                {/* Access-aware action: enrolled/assigned/free → open the player;
                    paid + no access → go to details to buy. */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goToCourse(course); }}
                  className={`mt-5 inline-flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white transition-colors ${
                    accessible ? "bg-emerald-500 hover:bg-emerald-600" : "bg-[#FF6A00] hover:bg-[#e85f00]"
                  }`}
                >
                  {accessible ? <Play className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                  {accessible ? "Go to Course" : "Buy this course"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ProgramsPage;
