import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { getMyCourses, submitTeacherFeedback, getMyTeacherFeedback } from "@/api/course/courseApi";

// Student → teacher/class feedback form. The student picks one of their
// courses, rates the five areas (1-5 stars), and answers two open questions.
// Mirrors the Moonpreneur student feedback card. Results feed the admin
// dashboard graphs (student-feedback direction).
const AREAS = [
  { key: "explanation", emoji: "👨‍🏫", label: "Teacher's Explanation & Teaching" },
  { key: "engagement", emoji: "🎯", label: "Class Engagement & Interaction" },
  { key: "understanding", emoji: "📚", label: "Understanding of the Topic" },
  { key: "activities", emoji: "🤖", label: "Activities / Projects Conducted" },
  { key: "experience", emoji: "😊", label: "Overall Class Experience" },
];

const StarRating = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(n === value ? 0 : n)}
        aria-label={`${n} star${n > 1 ? "s" : ""}`}
        className={`text-2xl leading-none transition-transform hover:scale-110 ${n <= value ? "text-yellow-400" : "text-gray-300 dark:text-white/25"}`}
      >
        ★
      </button>
    ))}
  </div>
);

const Stars = ({ value }: { value: number }) => {
  const v = Math.round(value || 0);
  return (
    <span>
      <span className="text-yellow-400">{"★".repeat(v)}</span>
      <span className="text-gray-300 dark:text-white/25">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
};

interface MyCourse { id: number; title: string; slug?: string }
interface PastFeedback { id: number; course_title?: string | null; overall: number; enjoyed?: string; suggestions?: string; created_at?: string }

const ClassFeedbackPage = () => {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [enjoyed, setEnjoyed] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [past, setPast] = useState<PastFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPast = () => {
    getMyTeacherFeedback()
      .then((d) => setPast(d as PastFeedback[]))
      .catch(() => setPast([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getMyCourses()
      .then((c) => setCourses(c as MyCourse[]))
      .catch(() => setCourses([]));
    loadPast();
  }, []);

  const overall = useMemo(() => {
    const vals = AREAS.map((a) => ratings[a.key]).filter((v) => v > 0);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
  }, [ratings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rated = AREAS.map((a) => ratings[a.key]).filter((v) => v > 0);
    if (rated.length === 0) { toast.error("Please give at least one star rating."); return; }
    // The course is required: the server resolves the teacher from it, and
    // feedback with no course cannot be attributed to anyone.
    if (!courseId) { toast.error("Please select which class you're rating."); return; }
    setSubmitting(true);
    try {
      await submitTeacherFeedback({ courseId, ratings, enjoyed: enjoyed.trim(), suggestions: suggestions.trim() });
      toast.success("Thanks for your feedback! 🎉");
      setRatings({}); setEnjoyed(""); setSuggestions(""); setCourseId("");
      loadPast();
    } catch {
      toast.error("Could not submit your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
        <h2 className="text-xl font-bold mb-1">Rate today's class</h2>
        <p className="text-sm text-muted-foreground mb-5">
          ⭐ Poor · ⭐⭐ Fair · ⭐⭐⭐ Good · ⭐⭐⭐⭐ Very Good · ⭐⭐⭐⭐⭐ Excellent
        </p>

        {courses.length > 0 && (
          <div className="mb-5">
            <label className="block text-sm font-medium mb-1.5">
              Which class / course? <span className="text-red-500">*</span>
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a course</option>
              {courses.map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
            </select>
          </div>
        )}

        <div className="divide-y divide-border border-y border-border mb-5">
          {AREAS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium">{a.emoji} {a.label}</span>
              <StarRating value={ratings[a.key] || 0} onChange={(n) => setRatings((s) => ({ ...s, [a.key]: n }))} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm font-bold">Overall</span>
            <span className="flex items-center gap-2"><Stars value={overall} /> <span className="text-sm text-muted-foreground tabular-nums">{overall.toFixed(1)}</span></span>
          </div>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">💬 What did you enjoy most about today's class?</label>
            <textarea value={enjoyed} onChange={(e) => setEnjoyed(e.target.value)} rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm" placeholder="Your answer…" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">💡 Any suggestions for improvement?</label>
            <textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm" placeholder="Your answer…" />
          </div>
        </div>

        <button disabled={submitting} className="rounded-xl bg-gradient-hero text-white text-sm font-semibold px-6 py-2.5 disabled:opacity-60">
          {submitting ? "Submitting…" : "Submit feedback"}
        </button>
      </form>

      {/* The student's own past submissions */}
      <div className="mt-8">
        <h3 className="font-bold mb-3">Your past feedback</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : past.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven't submitted any class feedback yet.</p>
        ) : (
          <div className="space-y-3">
            {past.map((f) => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{f.course_title || "Class feedback"}</span>
                  <span className="flex items-center gap-2"><Stars value={f.overall} /><span className="text-xs text-muted-foreground">{(f.overall || 0).toFixed(1)}</span></span>
                </div>
                {f.enjoyed && <p className="text-sm mt-2"><span className="text-muted-foreground">Enjoyed: </span>{f.enjoyed}</p>}
                {f.suggestions && <p className="text-sm mt-1"><span className="text-muted-foreground">Suggestion: </span>{f.suggestions}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassFeedbackPage;
