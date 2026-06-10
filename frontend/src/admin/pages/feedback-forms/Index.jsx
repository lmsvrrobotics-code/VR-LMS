import { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw, Users, MessageSquareText, Star } from 'lucide-react';
import { listForms, formStats, formResponses } from '../../api/feedbackForms';

const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const Stars = ({ value }) => {
    const v = Math.round(Number(value) || 0);
    return (
        <span title={`${Number(value || 0).toFixed(1)} / 5`}>
            <span className="text-yellow-400">{'★'.repeat(v)}</span>
            <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - v))}</span>
        </span>
    );
};

// Per-question aggregate card (rating average / mcq counts / yes-no split /
// free-text list), driven by the shape from FeedbackFormService.adminStats.
function QuestionStat({ q }) {
    return (
        <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[14px] font-semibold text-dark">{q.label}</span>
                <span className="text-[12px] text-gray">{q.answered} answer{q.answered === 1 ? '' : 's'}</span>
            </div>

            {q.type === 'rating' && (
                <div className="flex items-center gap-2">
                    <Stars value={q.average} />
                    <span className="text-[14px] font-bold text-dark tabular-nums">{(q.average ?? 0).toFixed(1)}</span>
                    <span className="text-[12px] text-gray">avg</span>
                </div>
            )}

            {q.type === 'mcq' && (
                <div className="space-y-2">
                    {(q.counts || []).map((c) => {
                        const pct = q.answered ? Math.round((c.count / q.answered) * 100) : 0;
                        return (
                            <div key={c.option}>
                                <div className="flex items-center justify-between text-[13px] mb-1">
                                    <span className="text-dark">{c.option}</span>
                                    <span className="text-gray tabular-nums">{c.count} ({pct}%)</span>
                                </div>
                                <div className="h-2 rounded-full bg-lightgreen overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#FF6A00' }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {q.type === 'yesno' && (
                <div className="flex items-center gap-4 text-[14px]">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Yes: <b>{q.yes}</b></span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> No: <b>{q.no}</b></span>
                </div>
            )}

            {q.type === 'text' && (
                (q.answers && q.answers.length) ? (
                    <ul className="list-none p-0 m-0 space-y-1.5">
                        {q.answers.map((a, i) => (
                            <li key={i} className="text-[13px] text-dark rounded-lg bg-lightgreen/50 px-3 py-2">{a}</li>
                        ))}
                    </ul>
                ) : <p className="text-[13px] text-gray">No written answers.</p>
            )}
        </div>
    );
}

function FormDetail({ form }) {
    const [stats, setStats] = useState(null);
    const [responses, setResponses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('stats'); // 'stats' | 'records'

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([formStats(form.id).catch(() => null), formResponses(form.id).catch(() => ({ responses: [] }))])
            .then(([s, r]) => { if (alive) { setStats(s); setResponses(r?.responses || []); } })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [form.id]);

    if (loading) return <p className="text-[13px] text-gray">Loading…</p>;

    const questions = stats?.questions || [];
    const qById = Object.fromEntries(questions.map((q) => [q.id, q]));

    const renderAnswer = (q, val) => {
        if (val === undefined || val === null || val === '') return <span className="text-gray">—</span>;
        if (q?.type === 'rating') return <Stars value={val} />;
        if (q?.type === 'yesno') return val === true ? 'Yes' : 'No';
        return String(val);
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div>
                    <h2 className="text-[16px] font-bold text-dark m-0">{form.title}</h2>
                    <p className="text-[12px] text-gray mt-0.5 mb-0">
                        by {form.teacher_name} · {stats?.total_responses ?? form.response_count ?? 0} of {stats?.audience_count ?? form.audience_count} responded
                    </p>
                </div>
                <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
                    {['stats', 'records'].map((v) => (
                        <button key={v} onClick={() => setView(v)}
                            className={`text-[13px] font-semibold px-3 py-1.5 rounded-md transition-colors ${view === v ? 'bg-skin text-white' : 'text-gray hover:text-dark'}`}>
                            {v === 'stats' ? 'Statistics' : 'Individual records'}
                        </button>
                    ))}
                </div>
            </div>

            {view === 'stats' ? (
                questions.length === 0 ? (
                    <p className="text-[13px] text-gray">No questions.</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {questions.map((q) => <QuestionStat key={q.id} q={q} />)}
                    </div>
                )
            ) : (
                responses.length === 0 ? (
                    <p className="text-[13px] text-gray">No responses yet.</p>
                ) : (
                    <div className="space-y-3">
                        {responses.map((r) => (
                            <div key={r.id} className="rounded-xl border border-border p-4">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-[14px] font-semibold text-dark">{r.student_name}</span>
                                    <span className="text-[12px] text-gray">{fmtDate(r.created_at)}</span>
                                </div>
                                <div className="space-y-1.5">
                                    {questions.map((q) => (
                                        <div key={q.id} className="flex items-start justify-between gap-4 text-[13px]">
                                            <span className="text-gray">{q.label}</span>
                                            <span className="text-dark text-right">{renderAnswer(qById[q.id], r.answers?.[q.id])}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}

export default function AdminFeedbackFormsIndex() {
    const [forms, setForms] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        setSelected(null);
        listForms()
            .then((d) => setForms(d?.forms || []))
            .catch(() => setForms([]))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    return (
        <div className="p-1">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                    <h1 className="text-xl font-bold text-dark m-0">Feedback Forms</h1>
                    <p className="text-[13px] text-gray mt-1 mb-0">Dynamic forms teachers send to their students after class — statistics and individual records.</p>
                </div>
                <button onClick={load} className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md border border-border hover:bg-gray-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
                <aside className="rounded-xl bg-white border border-border p-3">
                    <h2 className="text-[14px] font-bold text-dark px-1 mb-2">All forms ({forms.length})</h2>
                    {loading ? (
                        <p className="text-[13px] text-gray px-1">Loading…</p>
                    ) : forms.length === 0 ? (
                        <p className="text-[13px] text-gray px-1">No feedback forms created yet.</p>
                    ) : (
                        <ul className="list-none p-0 m-0 flex flex-col gap-1 max-h-[64vh] overflow-y-auto">
                            {forms.map((f) => (
                                <li key={f.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(f)}
                                        className={`w-full text-left rounded-ol-10 px-3 py-2.5 transition-colors ${selected?.id === f.id ? 'bg-lightgreen' : 'hover:bg-gray-50'}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[14px] font-semibold text-dark truncate">{f.title}</span>
                                            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${f.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {f.enabled ? 'Live' : 'Draft'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] text-gray mt-1">
                                            <span className="truncate">{f.teacher_name}</span>
                                            <span className="inline-flex items-center gap-1 shrink-0"><Users className="w-3 h-3" /> {f.audience_count}</span>
                                            <span className="inline-flex items-center gap-1 shrink-0"><MessageSquareText className="w-3 h-3" /> {f.response_count ?? 0}</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>

                <section className="rounded-xl bg-white border border-border p-4 min-h-[220px]">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center text-center py-12">
                            <ClipboardList className="w-8 h-8 text-gray-300 mb-2" />
                            <p className="text-[13px] text-gray">Select a form to see its statistics and individual records.</p>
                        </div>
                    ) : (
                        <FormDetail key={selected.id} form={selected} />
                    )}
                </section>
            </div>
        </div>
    );
}
