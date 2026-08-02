import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, Plus, Trash2, Star, Type, ListChecks, ToggleLeft, X, Users, MessageSquareText, Send, BarChart3,
} from "lucide-react";
import FormResultsModal from "./FormResultsModal";
import {
  listTeacherForms, createForm, deleteForm, setFormEnabled,
  listSendableBatches, sendForm,
  type FeedbackFormSummary, type FormQuestion, type QuestionType, type SendableBatch,
} from "@/api/feedbackFormsApi";

// Teacher's "Feedback Forms" tab: build dynamic post-class forms (star ratings,
// free text, multiple choice, yes/no), then enable one to push it to assigned
// students. Mirrors the dashboard's white-card / orange-primary styling.

// A question while it's being edited in the builder (local-only temp id).
interface DraftQuestion {
  key: string;
  type: QuestionType;
  label: string;
  options: string[];
}

const TYPE_META: Record<QuestionType, { label: string; icon: typeof Star }> = {
  rating: { label: "Star rating (1–5)", icon: Star },
  text: { label: "Free text", icon: Type },
  mcq: { label: "Multiple choice", icon: ListChecks },
  yesno: { label: "Yes / No", icon: ToggleLeft },
};

const newKey = () => Math.random().toString(36).slice(2, 9);

export default function FeedbackFormsView({ teacherId }: { teacherId?: string }) {
  const [forms, setForms] = useState<FeedbackFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!teacherId) { setForms([]); setLoading(false); return; }
    setLoading(true);
    listTeacherForms(teacherId)
      .then(setForms)
      .catch(() => setForms([]))
      .finally(() => setLoading(false));
  }, [teacherId]);

  useEffect(() => { load(); }, [load]);

  // Which form the Send dialog is open for (null = closed).
  const [sending, setSending] = useState<FeedbackFormSummary | null>(null);
  // Which form the results view is open for (null = closed).
  const [viewing, setViewing] = useState<FeedbackFormSummary | null>(null);

  // Stopping delivery is still a single toggle; STARTING it now goes through
  // the Send dialog so the teacher picks which batch receives the form.
  const stopSending = async (f: FeedbackFormSummary) => {
    if (!teacherId) return;
    if (!window.confirm(`Stop sending "${f.title}"? Students who haven't answered yet will no longer see it.`)) return;
    setBusyId(f.id);
    try { await setFormEnabled(f.id, teacherId, false); load(); }
    catch { alert("Could not update the form."); }
    finally { setBusyId(null); }
  };

  const remove = async (f: FeedbackFormSummary) => {
    if (!teacherId || !window.confirm(`Delete "${f.title}" and all its responses? This cannot be undone.`)) return;
    setBusyId(f.id);
    try { await deleteForm(f.id, teacherId); load(); }
    catch { alert("Could not delete the form."); }
    finally { setBusyId(null); }
  };

  if (!teacherId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Feedback Forms</h1>
        <p className="text-muted-foreground">Sign in as a teacher to build feedback forms.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> Feedback Forms
        </h1>
        {!building && (
          <button
            onClick={() => setBuilding(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#ff8a3d] text-white text-sm font-bold px-4 py-2.5 shadow-sm hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" /> New form
          </button>
        )}
      </div>

      {building && (
        <FormBuilder
          teacherId={teacherId}
          onClose={() => setBuilding(false)}
          onSaved={() => { setBuilding(false); load(); }}
        />
      )}

      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Loading forms…</p>
      ) : forms.length === 0 && !building ? (
        <div className="text-center py-14">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-orange-50 text-[#FF6A00] flex items-center justify-center">
            <ClipboardList className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No feedback forms yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Create a form after your class, then enable it to send it to your assigned students.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {forms.map((f) => (
            <li key={f.id} className="rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px]">{f.title}</span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                    f.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {f.enabled ? "Sent" : "Draft"}
                  </span>
                </div>
                {f.description && <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">{f.description}</p>}
                <div className="flex items-center gap-4 text-[12px] text-muted-foreground mt-2">
                  <span>{f.questions.length} question{f.questions.length === 1 ? "" : "s"}</span>
                  <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {f.audience_count} recipient{f.audience_count === 1 ? "" : "s"}</span>
                  <span className="inline-flex items-center gap-1"><MessageSquareText className="w-3.5 h-3.5" /> {f.response_count ?? 0} response{(f.response_count ?? 0) === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Results — what the students actually answered (anonymous). */}
                <button
                  onClick={() => setViewing(f)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  View results
                </button>
                {/* Send is always available — a teacher can send a form to one
                    batch now and another later; the audience is additive. */}
                <button
                  onClick={() => setSending(f)}
                  disabled={busyId === f.id}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3 py-2 bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {f.enabled ? "Send again" : "Send to batch"}
                </button>
                {f.enabled && (
                  <button
                    onClick={() => stopSending(f)}
                    disabled={busyId === f.id}
                    className="text-[13px] font-semibold rounded-lg px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={() => remove(f)}
                  disabled={busyId === f.id}
                  className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="Delete form"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sending && (
        <SendDialog
          form={sending}
          teacherId={teacherId}
          onClose={() => setSending(null)}
          onSent={() => { setSending(null); load(); }}
        />
      )}

      {viewing && teacherId && (
        <FormResultsModal
          form={viewing}
          teacherId={teacherId}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/**
 * Batch picker for sending a form. Lists the batches this teacher actually
 * teaches with their student counts; on send the chosen batches' students are
 * added to the form's audience and the form is enabled, so it shows up in each
 * student's Feedback tab.
 */
function SendDialog({ form, teacherId, onClose, onSent }: {
  form: FeedbackFormSummary;
  teacherId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [batches, setBatches] = useState<SendableBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listSendableBatches(teacherId)
      .then((b) => { if (alive) setBatches(b); })
      .catch(() => { if (alive) setBatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [teacherId]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Students in the chosen batches. A student in two selected batches is
  // counted once, matching what the server actually sends.
  const reach = batches
    .filter((b) => picked.has(b.id))
    .reduce((n, b) => n + b.student_count, 0);

  const submit = async () => {
    setError(null);
    if (picked.size === 0) { setError("Choose at least one batch."); return; }
    setBusy(true);
    try {
      const res = await sendForm(form.id, teacherId, [...picked]);
      alert(`"${form.title}" sent to ${res.sent_to} student${res.sent_to === 1 ? "" : "s"}.`);
      onSent();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Could not send the form. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#16161f] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-lg font-bold m-0">Send feedback form</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">
          Choose which batch receives “{form.title}”. Students see it in their Feedback tab.
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading your batches…</p>
        ) : batches.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no batches yet. Once an admin assigns you one, you can send forms to it.
          </p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {batches.map((b) => (
              <li key={b.id}>
                <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                  picked.has(b.id) ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                }`}>
                  <input
                    type="checkbox"
                    checked={picked.has(b.id)}
                    onChange={() => toggle(b.id)}
                    className="accent-emerald-500"
                    disabled={b.student_count === 0}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm truncate">{b.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.student_count} student{b.student_count === 1 ? "" : "s"}
                      {b.student_count === 0 ? " — nobody to send to" : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {picked.size > 0 ? `Sending to ~${reach} student${reach === 1 ? "" : "s"}` : "No batch selected"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || picked.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormBuilder({ teacherId, onClose, onSaved }: {
  teacherId: string; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { key: newKey(), type: "rating", label: "", options: [] },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addQuestion = () =>
    setQuestions((qs) => [...qs, { key: newKey(), type: "rating", label: "", options: [] }]);
  const removeQuestion = (key: string) =>
    setQuestions((qs) => qs.filter((q) => q.key !== key));
  const patchQuestion = (key: string, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const save = async () => {
    setError(null);
    if (!title.trim()) { setError("Give the form a title."); return; }
    if (questions.length === 0) { setError("Add at least one question."); return; }
    for (const q of questions) {
      if (!q.label.trim()) { setError("Every question needs a label."); return; }
      if (q.type === "mcq" && q.options.filter((o) => o.trim()).length < 2) {
        setError("Multiple-choice questions need at least two options."); return;
      }
    }
    const payload: FormQuestion[] = questions.map((q, i) => ({
      id: `q${i + 1}`,
      type: q.type,
      label: q.label.trim(),
      ...(q.type === "mcq" ? { options: q.options.map((o) => o.trim()).filter(Boolean) } : {}),
    }));
    setSaving(true);
    try {
      await createForm(teacherId, { title: title.trim(), description: description.trim(), questions: payload });
      onSaved();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Could not save the form.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15 transition-all";

  return (
    <div className="rounded-2xl border-2 border-[#FF6A00]/20 bg-orange-50/30 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">New feedback form</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X className="w-5 h-5" /></button>
      </div>

      <div className="space-y-3 mb-5">
        <input className={inputCls} placeholder="Form title (e.g. Today's class feedback)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={inputCls} rows={2} placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => {
          const Icon = TYPE_META[q.type].icon;
          return (
            <div key={q.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[12px] font-bold text-gray-400">Question {i + 1}</span>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(q.key)} className="text-gray-400 hover:text-red-500" title="Remove question">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input className={`${inputCls} mb-3`} placeholder="Question text" value={q.label} onChange={(e) => patchQuestion(q.key, { label: e.target.value })} />
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className="w-4 h-4 text-[#FF6A00]" />
                <select
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-[#FF6A00]"
                  value={q.type}
                  onChange={(e) => patchQuestion(q.key, { type: e.target.value as QuestionType, options: e.target.value === "mcq" ? (q.options.length ? q.options : ["", ""]) : [] })}
                >
                  {(Object.keys(TYPE_META) as QuestionType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_META[t].label}</option>
                  ))}
                </select>
              </div>

              {q.type === "mcq" && (
                <div className="mt-3 space-y-2 pl-6">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
                        placeholder={`Option ${oi + 1}`}
                        value={opt}
                        onChange={(e) => patchQuestion(q.key, { options: q.options.map((o, idx) => (idx === oi ? e.target.value : o)) })}
                      />
                      {q.options.length > 2 && (
                        <button onClick={() => patchQuestion(q.key, { options: q.options.filter((_, idx) => idx !== oi) })} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => patchQuestion(q.key, { options: [...q.options, ""] })} className="text-[13px] font-semibold text-[#FF6A00] hover:underline inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add option
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={addQuestion} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors">
        <Plus className="w-4 h-4" /> Add question
      </button>

      {error && <p className="mt-4 text-[13px] text-red-600">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#ff8a3d] text-white text-sm font-bold px-6 py-2.5 shadow-sm hover:shadow-lg transition-all disabled:opacity-60">
          {saving ? "Saving…" : "Save form"}
        </button>
        <button onClick={onClose} className="text-sm font-semibold text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </div>
  );
}
