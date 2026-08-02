import { useCallback, useEffect, useState } from "react";
import { Star, MessageSquareText, RefreshCw, Inbox } from "lucide-react";
import { getFeedbackForTeacher, type ReceivedFeedback } from "@/api/course/courseApi";

// Teacher's "Class Feedback" tab: the ratings students submitted about this
// teacher's classes (the inverse of the Students tab, where the teacher rates
// students). Responses are anonymous — the server omits student identity so
// teachers can't tie a low score back to a specific student.

const Stars = ({ value }: { value: number }) => {
  const v = Math.round(Number(value) || 0);
  return (
    <span title={`${(Number(value) || 0).toFixed(1)} / 5`}>
      <span className="text-yellow-400">{"★".repeat(v)}</span>
      <span className="text-gray-300 dark:text-white/25">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
};

const fmtDate = (s?: string) => {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

export default function ClassFeedbackView({ teacherId }: { teacherId?: string }) {
  const [data, setData] = useState<ReceivedFeedback | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!teacherId) { setData(null); setLoading(false); return; }
    setLoading(true);
    getFeedbackForTeacher(teacherId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [teacherId]);

  useEffect(() => { load(); }, [load]);

  const stats = data?.stats;
  const items = data?.feedback ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">Class Feedback</h1>
          <p className="text-sm text-muted-foreground m-0">
            What your students said about your classes. Responses are anonymous.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !stats || stats.total_feedback === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
          <Inbox className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-1">No feedback yet</h2>
          <p className="text-sm text-muted-foreground m-0">
            Once your students rate a class, their feedback shows up here.
          </p>
        </div>
      ) : (
        <>
          {/* Headline numbers + the per-area averages */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="text-xs font-medium text-muted-foreground mb-1">Overall rating</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold tabular-nums leading-none">
                  {stats.overall_avg.toFixed(1)}
                </span>
                <Stars value={stats.overall_avg} />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="text-xs font-medium text-muted-foreground mb-1">Responses</div>
              <div className="text-3xl font-bold tabular-nums leading-none">{stats.total_feedback}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" /> Average by area
            </h2>
            <div className="space-y-3">
              {stats.attributes.map((a) => {
                const v = stats.per_attribute[a.key] || 0;
                return (
                  <div key={a.key} className="flex items-center gap-3">
                    <span className="text-sm flex-1 min-w-0 truncate">{a.label}</span>
                    <div className="h-1.5 w-24 sm:w-40 rounded-full bg-muted overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(v / 5) * 100}%` }} />
                    </div>
                    <span className="text-sm tabular-nums w-8 text-right shrink-0">{v.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Individual responses, newest first */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" /> Responses
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                {items.length}
              </span>
            </h2>
            <div className="space-y-3">
              {items.map((f) => (
                <div key={f.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm font-medium">{f.course_title || "Class feedback"}</span>
                    <span className="flex items-center gap-2">
                      <Stars value={f.overall} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {(f.overall || 0).toFixed(1)}
                      </span>
                      {f.created_at && (
                        <span className="text-xs text-muted-foreground">{fmtDate(f.created_at)}</span>
                      )}
                    </span>
                  </div>
                  {f.enjoyed && (
                    <p className="text-sm mt-2 m-0">
                      <span className="text-muted-foreground">Enjoyed: </span>{f.enjoyed}
                    </p>
                  )}
                  {f.suggestions && (
                    <p className="text-sm mt-1 m-0">
                      <span className="text-muted-foreground">Suggestion: </span>{f.suggestions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
