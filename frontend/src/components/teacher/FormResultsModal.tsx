import { useEffect, useState } from "react";
import { X, BarChart3, MessageSquareText, Users } from "lucide-react";
import {
  getFormStats, getFormResponses,
  type FeedbackFormSummary, type FormStats, type FormResponses,
} from "@/api/feedbackFormsApi";

// Results for one of the teacher's own feedback forms: per-question aggregates
// plus the individual submissions. Responses are anonymous — the server omits
// student identity, so a teacher sees WHAT was said, not who said it.

const fmtDate = (s?: string) => {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

// Initials disc for the responding student, matching the admin feedback list.
const initials = (name?: string) =>
  (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const Stars = ({ value }: { value: number }) => {
  const v = Math.round(Number(value) || 0);
  return (
    <span title={`${(Number(value) || 0).toFixed(1)} / 5`}>
      <span className="text-yellow-400">{"★".repeat(v)}</span>
      <span className="text-gray-300">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
};

// One answer rendered per question type, for the per-response list.
const AnswerValue = ({ value }: { value: number | string | boolean }) => {
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span className="inline-flex items-center gap-1.5"><Stars value={value} /> <span className="tabular-nums">{value}</span></span>;
  return <span>{value}</span>;
};

export default function FormResultsModal({
  form, teacherId, onClose,
}: { form: FeedbackFormSummary; teacherId: string; onClose: () => void }) {
  const [tab, setTab] = useState<"summary" | "responses">("summary");
  const [stats, setStats] = useState<FormStats | null>(null);
  const [data, setData] = useState<FormResponses | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getFormStats(form.id, teacherId).catch(() => null),
      getFormResponses(form.id, teacherId).catch(() => null),
    ])
      .then(([s, r]) => { if (alive) { setStats(s); setData(r); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [form.id, teacherId]);

  const responses = data?.responses ?? [];
  const questions = data?.form?.questions ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl my-auto shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-bold text-[16px] truncate">{form.title}</h2>
            <p className="text-[12px] text-muted-foreground m-0 mt-0.5">
              {stats?.total_responses ?? 0} of {stats?.audience_count ?? 0} students responded
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {(["summary", "responses"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3 py-2 transition-colors ${
                tab === t ? "bg-orange-50 text-[#FF6A00]" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {t === "summary" ? <BarChart3 className="w-3.5 h-3.5" /> : <MessageSquareText className="w-3.5 h-3.5" />}
              {t === "summary" ? "Summary" : `Responses (${responses.length})`}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading results…</p>
          ) : (stats?.total_responses ?? 0) === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-orange-50 text-[#FF6A00] flex items-center justify-center">
                <MessageSquareText className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-1">No responses yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto m-0">
                {form.enabled
                  ? "Results appear here as your students submit the form."
                  : "Send this form to a batch to start collecting responses."}
              </p>
            </div>
          ) : tab === "summary" ? (
            <ul className="space-y-4 m-0 p-0 list-none">
              {(stats?.questions ?? []).map((q) => (
                <li key={q.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold">{q.label}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{q.answered} answered</span>
                  </div>

                  {q.type === "rating" && (
                    <div className="flex items-center gap-2 mt-2">
                      <Stars value={q.average ?? 0} />
                      <span className="text-sm font-bold tabular-nums">{(q.average ?? 0).toFixed(1)}</span>
                    </div>
                  )}

                  {q.type === "mcq" && (
                    <div className="space-y-1.5 mt-2">
                      {(q.counts ?? []).map((c) => {
                        const pct = q.answered ? (c.count / q.answered) * 100 : 0;
                        return (
                          <div key={c.option} className="flex items-center gap-2">
                            <span className="text-[13px] flex-1 min-w-0 truncate">{c.option}</span>
                            <div className="h-1.5 w-24 sm:w-32 rounded-full bg-gray-100 overflow-hidden shrink-0">
                              <div className="h-full rounded-full bg-[#FF6A00]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[12px] tabular-nums w-6 text-right shrink-0">{c.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "yesno" && (
                    <div className="flex items-center gap-4 mt-2 text-[13px]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Yes
                        <span className="font-semibold tabular-nums">{q.yes ?? 0}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-gray-400" /> No
                        <span className="font-semibold tabular-nums">{q.no ?? 0}</span>
                      </span>
                    </div>
                  )}

                  {q.type === "text" && (
                    (q.answers ?? []).length === 0 ? (
                      <p className="text-[13px] text-muted-foreground mt-2 m-0">No written answers.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5 m-0 p-0 list-none">
                        {(q.answers ?? []).map((a, i) => (
                          <li key={i} className="text-[13px] rounded-lg bg-gray-50 px-3 py-2">{a}</li>
                        ))}
                      </ul>
                    )
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-3 m-0 p-0 list-none">
              {responses.map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-orange-50 text-[#FF6A00] text-[11px] font-bold flex items-center justify-center shrink-0">
                        {initials(r.student_name)}
                      </span>
                      <span className="text-[13px] font-semibold truncate">{r.student_name}</span>
                    </span>
                    <span className="text-[12px] text-muted-foreground shrink-0">{fmtDate(r.created_at)}</span>
                  </div>
                  <dl className="space-y-1.5 m-0">
                    {questions.map((q) => {
                      const v = r.answers?.[q.id];
                      if (v === undefined || v === null) return null;
                      return (
                        <div key={q.id} className="flex items-start justify-between gap-3">
                          <dt className="text-[13px] text-muted-foreground min-w-0">{q.label}</dt>
                          <dd className="text-[13px] font-medium text-right m-0 shrink-0 max-w-[55%]">
                            <AnswerValue value={v} />
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            {stats ? `${stats.total_responses} of ${stats.audience_count} responded` : " "}
          </span>
          <button onClick={onClose} className="text-[13px] font-semibold rounded-lg px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
