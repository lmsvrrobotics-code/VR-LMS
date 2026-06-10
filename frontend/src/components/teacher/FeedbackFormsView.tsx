import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, Plus, Trash2, Star, Type, ListChecks, ToggleLeft, X, Users, MessageSquareText,
} from "lucide-react";
import {
  listTeacherForms, createForm, deleteForm, setFormEnabled,
  type FeedbackFormSummary, type FormQuestion, type QuestionType,
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

  const toggleEnabled = async (f: FeedbackFormSummary) => {
    if (!teacherId) return;
    if (!f.enabled && f.audience_count === 0 &&
      !window.confirm("You have no assigned students yet, so no one will receive this form. Enable anyway?")) return;
    if (!f.enabled &&
      !window.confirm(`Enable this form? It will be sent to your ${f.audience_count} assigned student(s) as a notification.`)) return;
    setBusyId(f.id);
    try { await setFormEnabled(f.id, teacherId, !f.enabled); load(); }
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
                    {f.enabled ? "Enabled" : "Draft"}
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
                <button
                  onClick={() => toggleEnabled(f)}
                  disabled={busyId === f.id}
                  className={`text-[13px] font-semibold rounded-lg px-3 py-2 transition-colors disabled:opacity-50 ${
                    f.enabled
                      ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  }`}
                >
                  {f.enabled ? "Disable" : "Enable & send"}
                </button>
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
