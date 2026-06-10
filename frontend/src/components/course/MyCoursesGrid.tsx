import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyCourses } from "@/api/course/courseApi";

type MyCourse = {
  id: number;
  slug: string;
  title: string;
  progress?: number;
  lesson_count?: number;
};

// The student's owned courses: paid ∪ enrolled ∪ delegated (school/batch),
// from the canonical lms_admin /api/public/my-courses. Renders nothing when the
// student has none (so the Programs view below remains the entry point).
// Each course is a clean progress card (no thumbnail) — title + progress bar +
// a Continue/Start action.
export default function MyCoursesGrid() {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyCourses()
      .then((rows) => setCourses((rows as MyCourse[]) || []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || courses.length === 0) return null;

  return (
    <section className="mb-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">My Courses</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {courses.map((c) => {
          const pct = Math.max(0, Math.min(100, Number(c.progress) || 0));
          const done = pct >= 100;
          return (
            <Link
              key={c.id}
              to={`/courses/programs/course-details/play/${c.slug}`}
              className="group rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-md hover:border-emerald-200 transition-all flex flex-col gap-4"
            >
              <p className="font-bold text-xl text-gray-900 line-clamp-2">{c.title}</p>

              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[14px]">
                <span className="text-gray-500 font-medium">{pct}% complete</span>
                <span className="text-emerald-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                  {done ? "Review" : pct > 0 ? "Continue" : "Start"} →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
