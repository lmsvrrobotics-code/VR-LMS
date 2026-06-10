import { useEffect, useState } from "react";
import { ClipboardList, Star, CheckCircle2 } from "lucide-react";
import {
  listPendingForms, submitForm,
  type PendingForm, type FormQuestion,
} from "@/api/feedbackFormsApi";

// Student "Feedback forms" inbox — the pending teacher-authored forms addressed
// to this student. Each form is filled and submitted ONCE; on success it drops
// out of the list (the server won't return an already-answered form). Reached
// from the notifications feed (?tab=feedback-forms) and rendered in the
// StudentDashboard's TabsContent.

type AnswerValue = number | string | boolean;

export default function FeedbackFormsInbox() {
  const [forms, setForms] = useState<PendingForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listPendingForms()
      .then((f) => { if (alive) setForms(f); })
      .catch(() => { if (alive) setForms([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const onDone = (id: number) => setForms((fs) => fs.filter((f) => f.id !== id));

  if (loading) {
    return <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500 text-center">Loading your feedback forms…</div>;
  }

  if (forms.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="text-center py-12">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">You're all caught up</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            When a teacher sends you a feedback form after a class, it'll show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {forms.map((f) => <FormCard key={f.id} form={f} onDone={() => onDone(f.id)} />)}
    </div>
  );
}

function FormCard({ form, onDone }: { form: PendingForm; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const setAns = (qid: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [qid]: v }));

  const submit = async () => {
    setError(null);
    // Require an answer to every question (server also validates).
    for (const q of form.questions) {
      const v = answers[q.id];
      if (v === undefined || v === "" ) { setError("Please answer all questions before submitting."); return; }
    }
    setSaving(true);
    try {
      await submitForm(form.id, answers);
      setDone(true);
      setTimeout(onDone, 1200); // brief "thank you" before it slides out
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Could not submit. Please try again.");
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
        <p className="font-semibold text-gray-900">Thanks for your feedback!</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-br from-orange-50/60 to-white">
        <h3 className="text-[17px] font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#FF6A00]" /> {form.title}
        </h3>
        {form.teacher_name && <p className="text-[13px] text-gray-500 mt-0.5">From {form.teacher_name}{form.course_title ? ` · ${form.course_title}` : ""}</p>}
        {form.description && <p className="text-[13px] text-gray-600 mt-2">{form.description}</p>}
      </div>

      <div className="p-5 space-y-5">
        {form.questions.map((q, i) => (
          <div key={q.id}>
            <p className="text-[14px] font-semibold text-gray-800 mb-2">
              <span className="text-gray-400 mr-1">{i + 1}.</span>{q.label}
            </p>
            <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAns(q.id, v)} />
          </div>
        ))}
      </div>

      <div className="px-5 pb-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#ff8a3d] text-white text-[14px] font-bold px-6 py-2.5 shadow-sm hover:shadow-lg transition-all disabled:opacity-60"
        >
          {saving ? "Submitting…" : "Submit feedback"}
        </button>
        {error && <span className="text-[13px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function QuestionInput({ q, value, onChange }: {
  q: FormQuestion; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void;
}) {
  if (q.type === "rating") {
    const current = Number(value) || 0;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5" title={`${n} star${n === 1 ? "" : "s"}`}>
            <Star className={`w-7 h-7 transition-colors ${n <= current ? "fill-[#FF6A00] text-[#FF6A00]" : "text-gray-300"}`} />
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "text") {
    return (
      <textarea
        rows={3}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your answer…"
        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15 transition-all"
      />
    );
  }

  if (q.type === "mcq") {
    return (
      <div className="space-y-2">
        {(q.options || []).map((opt) => {
          const picked = value === opt;
          return (
            <label key={opt} className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-colors ${
              picked ? "border-[#FF6A00] bg-orange-50" : "border-gray-200 hover:border-[#FF6A00]/50"
            }`}>
              <input type="radio" name={q.id} checked={picked} onChange={() => onChange(opt)} className="accent-[#FF6A00]" />
              <span className="text-sm text-gray-800">{opt}</span>
            </label>
          );
        })}
      </div>
    );
  }

  // yesno
  return (
    <div className="flex items-center gap-2">
      {[{ v: true, label: "Yes" }, { v: false, label: "No" }].map((o) => {
        const picked = value === o.v;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              picked ? "border-[#FF6A00] bg-[#FF6A00] text-white" : "border-gray-200 text-gray-700 hover:border-[#FF6A00]/50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
