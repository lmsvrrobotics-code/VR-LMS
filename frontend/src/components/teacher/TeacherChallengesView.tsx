import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { Trophy, ExternalLink, Clock, CheckCircle2 } from "lucide-react";

/**
 * The teacher dashboard's challenge queue.
 *
 * Every submission across every course this teacher teaches, in one place —
 * the point being that a teacher should not have to open each course's
 * Curriculum tab and click Submissions on a hunch to discover that a student is
 * waiting. Until a submission is marked the student's class stays incomplete,
 * so an unnoticed one blocks them indefinitely.
 *
 * The MARK is the state throughout: `score != null` means marked. Comparing
 * against null rather than falsiness matters, because 0 is a real mark.
 */

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

const authHeaders = (): Record<string, string> => {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

type QueueRow = {
  id: number;
  lesson_id: number;
  user_id: string;
  submission_url: string;
  submission_note: string | null;
  score: number | null;
  max_score: number;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  lesson_title: string | null;
  challenge_url: string | null;
  course_title: string | null;
  /** The session (sections row) this challenge sits in. */
  session_title: string | null;
  student?: { name: string | null; email: string | null; student_id: string | null } | null;
};

const fmt = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  });
};

const SubmissionCard = ({
  row, maxScore, onSaved,
}: {
  row: QueueRow;
  maxScore: number;
  onSaved: () => void;
}) => {
  const marked = row.score != null;
  const [score, setScore] = useState(marked ? String(row.score) : "");
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (score.trim() === "") { toast.error(`Enter a mark out of ${maxScore}.`); return; }
    const value = Number(score);
    if (!Number.isInteger(value) || value < 0 || value > maxScore) {
      toast.error(`Enter a whole number between 0 and ${maxScore}.`);
      return;
    }
    setSaving(true);
    try {
      await axios.post(
        `${ADMIN_BASE}/api/admin/challenges/submissions/${row.id}/mark`,
        { score: value, feedback: feedback.trim() },
        { headers: authHeaders() },
      );
      toast.success("Mark saved — the class is now complete for this student.");
      onSaved();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.error : null;
      toast.error(msg || "Could not save the mark.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold">{row.student?.name || row.user_id}</h3>
          {/* Where this challenge lives, outermost first: course → session →
              challenge. A teacher marking several at once needs the session to
              tell two similarly-named challenges apart. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[row.course_title, row.session_title].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">{row.lesson_title}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
            marked
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
          }`}
        >
          {marked ? `${row.score} / ${row.max_score}` : "Awaiting mark"}
        </span>
      </div>

      {/* Student-supplied link opened by a TEACHER — noopener/noreferrer is a
          security requirement here, not a style choice. */}
      <a
        href={row.submission_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 break-all text-sm text-primary hover:underline"
      >
        {row.submission_url}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </a>

      {row.submission_note && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
          {row.submission_note}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Submitted {fmt(row.submitted_at)}
        {marked && row.reviewed_at ? ` · Marked ${fmt(row.reviewed_at)}` : ""}
      </p>

      <textarea
        rows={2}
        className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        placeholder="Feedback for the student (optional)"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor={`score-${row.id}`}>Mark</label>
        <input
          id={`score-${row.id}`}
          type="number"
          min={0}
          max={maxScore}
          step={1}
          className="w-[88px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="0"
        />
        <span className="text-sm text-muted-foreground">/ {maxScore}</span>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-gradient-hero px-5 py-2 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:brightness-105 disabled:opacity-60"
        >
          {saving ? "Saving…" : marked ? "Update mark" : "Save mark"}
        </button>
      </div>
    </article>
  );
};

export default function TeacherChallengesView() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [maxScore, setMaxScore] = useState(100);
  const [loading, setLoading] = useState(true);
  const [showMarked, setShowMarked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${ADMIN_BASE}/api/admin/challenges/queue`, {
        headers: authHeaders(),
      });
      setRows(data?.submissions || []);
      if (data?.max_score) setMaxScore(data.max_score);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => rows.filter((r) => r.score == null), [rows]);
  const marked = useMemo(() => rows.filter((r) => r.score != null), [rows]);
  // Default to the work that still needs doing; marked work is opt-in.
  const visible = showMarked ? marked : pending;

  if (loading) return <p className="text-sm text-muted-foreground">Loading submissions…</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Challenge submissions</h1>
        <p className="mt-1 text-muted-foreground">
          Work your students handed in. Marking one out of {maxScore} completes that class for them.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowMarked(false)}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            !showMarked ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          Awaiting mark ({pending.length})
        </button>
        <button
          type="button"
          onClick={() => setShowMarked(true)}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            showMarked ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Marked ({marked.length})
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold">
            {showMarked ? "Nothing marked yet" : "Nothing waiting"}
          </p>
          <p className="text-sm text-muted-foreground">
            {showMarked
              ? "Marks you give will be listed here."
              : "When a student submits a challenge, it will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((r) => (
            <SubmissionCard key={r.id} row={r} maxScore={maxScore} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
