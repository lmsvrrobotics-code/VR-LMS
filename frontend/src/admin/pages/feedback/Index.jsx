import { useEffect, useMemo, useState } from 'react';
import { Star, Users, ClipboardList, RefreshCw, GraduationCap, MessageSquare } from 'lucide-react';
import {
    feedbackStats, feedbackByStudent, listFeedback,
    teacherFeedbackStats, teacherFeedbackByTeacher, listTeacherFeedback,
} from '../../api/feedback';

const Stars = ({ value, className = '' }) => {
    const v = Math.round(Number(value) || 0);
    return (
        <span className={`tracking-tight ${className}`} title={`${Number(value || 0).toFixed(1)} / 5`}>
            <span className="text-yellow-400">{'★'.repeat(v)}</span>
            <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - v))}</span>
        </span>
    );
};

const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

// Two feedback directions share the same layout (stat strip + per-attribute
// bars + master/detail list), so one parameterised section renders both.
const CONFIG = {
    student: {
        title: 'Teacher → Student',
        statsFn: feedbackStats,
        listFn: feedbackByStudent,
        listKey: 'students',
        idKey: 'student_id',
        nameKey: 'student_name',
        detailFn: (id) => listFeedback({ studentId: id }),
        peopleIcon: Users,
        peopleLabel: 'Students evaluated',
        totalLabel: 'Evaluations',
        totalKey: 'total_evaluations',
        peopleKey: 'students_evaluated',
        emptyList: 'No evaluations submitted yet.',
    },
    teacher: {
        title: 'Student → Teacher',
        statsFn: teacherFeedbackStats,
        listFn: teacherFeedbackByTeacher,
        listKey: 'teachers',
        idKey: 'teacher_id',
        nameKey: 'teacher_name',
        detailFn: (id) => listTeacherFeedback({ teacherId: id ?? 'unassigned' }),
        peopleIcon: GraduationCap,
        peopleLabel: 'Teachers rated',
        totalLabel: 'Responses',
        totalKey: 'total_feedback',
        peopleKey: 'teachers_rated',
        emptyList: 'No class feedback submitted yet.',
    },
};

function FeedbackSection({ kind }) {
    const cfg = CONFIG[kind];
    const [stats, setStats] = useState(null);
    const [people, setPeople] = useState([]);
    const [selected, setSelected] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [itemsLoading, setItemsLoading] = useState(false);

    const load = () => {
        setLoading(true);
        setSelected(null);
        Promise.all([cfg.statsFn().catch(() => null), cfg.listFn().catch(() => ({}))])
            .then(([s, b]) => { setStats(s); setPeople(b?.[cfg.listKey] || []); })
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);

    useEffect(() => {
        if (!selected) { setItems([]); return; }
        let alive = true;
        setItemsLoading(true);
        cfg.detailFn(selected[cfg.idKey])
            .then((d) => { if (alive) setItems(d?.feedback || []); })
            .catch(() => { if (alive) setItems([]); })
            .finally(() => { if (alive) setItemsLoading(false); });
        return () => { alive = false; };
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    const attrs = stats?.attributes || [];

    return (
        <div>
            {/* Stat strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                    { icon: ClipboardList, label: cfg.totalLabel, value: stats?.[cfg.totalKey] ?? 0, accent: '#FF6A00' },
                    { icon: cfg.peopleIcon, label: cfg.peopleLabel, value: stats?.[cfg.peopleKey] ?? 0, accent: '#2563eb' },
                    { icon: Star, label: 'Average score', value: (stats?.overall_avg ?? 0).toFixed(1), accent: '#16a34a', stars: stats?.overall_avg ?? 0 },
                ].map((c) => (
                    <div key={c.label} className="flex items-center gap-3 rounded-ol-12 bg-white border border-border px-4 py-3">
                        <span className="flex items-center justify-center w-11 h-11 rounded-ol-10 shrink-0" style={{ background: `${c.accent}1f` }}>
                            <c.icon className="w-5 h-5" style={{ color: c.accent }} />
                        </span>
                        <div className="leading-tight">
                            <div className="text-[22px] font-bold text-dark">{c.value}</div>
                            <div className="text-[12px] text-gray">{c.label}</div>
                            {c.stars != null && <Stars value={c.stars} className="text-[13px]" />}
                        </div>
                    </div>
                ))}
            </div>

            {/* Per-attribute averages (graph) */}
            {attrs.length > 0 && (
                <div className="rounded-xl bg-white border border-border p-4 mb-4">
                    <h2 className="text-[14px] font-bold text-dark mb-3">Average by area</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
                        {attrs.map((a) => {
                            const v = stats?.per_attribute?.[a.key] ?? 0;
                            return (
                                <div key={a.key}>
                                    <div className="flex items-center justify-between text-[13px] mb-1">
                                        <span className="text-dark">{a.label}</span>
                                        <span className="text-gray tabular-nums">{v.toFixed(1)}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-lightgreen overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${(v / 5) * 100}%`, backgroundColor: '#FF6A00' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Master / detail */}
            <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
                <aside className="rounded-xl bg-white border border-border p-3">
                    <h2 className="text-[14px] font-bold text-dark px-1 mb-2">{kind === 'student' ? 'Students' : 'Teachers'} ({people.length})</h2>
                    {loading ? (
                        <p className="text-[13px] text-gray px-1">Loading…</p>
                    ) : people.length === 0 ? (
                        <p className="text-[13px] text-gray px-1">{cfg.emptyList}</p>
                    ) : (
                        <ul className="list-none p-0 m-0 flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
                            {people.map((p) => (
                                <li key={p[cfg.idKey] || 'unassigned'}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(p)}
                                        className={`w-full text-left rounded-ol-10 px-3 py-2 transition-colors ${selected?.[cfg.idKey] === p[cfg.idKey] ? 'bg-lightgreen' : 'hover:bg-gray-50'}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[14px] font-semibold text-dark truncate">{p[cfg.nameKey]}</span>
                                            <span className="text-[12px] text-gray shrink-0">{p.count}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Stars value={p.avg_overall} className="text-[12px]" />
                                            <span className="text-[11px] text-gray">{p.avg_overall.toFixed(1)} avg</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>

                <section className="rounded-xl bg-white border border-border p-4 min-h-[200px]">
                    {!selected ? (
                        <p className="text-[13px] text-gray">Select a {kind === 'student' ? 'student' : 'teacher'} to read their {kind === 'student' ? 'evaluations' : 'feedback'}.</p>
                    ) : itemsLoading ? (
                        <p className="text-[13px] text-gray">Loading…</p>
                    ) : items.length === 0 ? (
                        <p className="text-[13px] text-gray">Nothing to show.</p>
                    ) : (
                        <>
                            <h2 className="text-[15px] font-bold text-dark mb-3">{selected[cfg.nameKey]}</h2>
                            <div className="space-y-3">
                                {items.map((it) => (
                                    <div key={it.id} className="rounded-xl border border-border p-4">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="min-w-0">
                                                {kind === 'student' ? (
                                                    <>
                                                        {it.session && <div className="font-semibold text-dark text-[14px] truncate">{it.session}</div>}
                                                        {it.stage && <div className="text-[12px] text-gray truncate">{it.stage}</div>}
                                                        <div className="text-[12px] text-gray mt-0.5">by {it.teacher_name} · {fmtDate(it.created_at)}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="font-semibold text-dark text-[14px] truncate">{it.course_title || 'Class feedback'}</div>
                                                        <div className="text-[12px] text-gray mt-0.5">from {it.student_name} · {fmtDate(it.created_at)}</div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Stars value={it.overall} />
                                                <span className="text-[12px] text-gray tabular-nums">{it.overall.toFixed(1)}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-3">
                                            {attrs.map((a) => (
                                                <div key={a.key} className="flex items-center justify-between text-[12px]">
                                                    <span className="text-gray">{a.label}</span>
                                                    <Stars value={it.ratings?.[a.key] || 0} className="text-[12px]" />
                                                </div>
                                            ))}
                                        </div>
                                        {kind === 'student'
                                            ? it.feedback && <p className="text-[13px] text-dark mt-3 rounded-lg bg-lightgreen/50 px-3 py-2">{it.feedback}</p>
                                            : (
                                                <>
                                                    {it.enjoyed && <p className="text-[13px] text-dark mt-3 rounded-lg bg-lightgreen/50 px-3 py-2"><span className="text-gray">💬 Enjoyed: </span>{it.enjoyed}</p>}
                                                    {it.suggestions && <p className="text-[13px] text-dark mt-2 rounded-lg bg-lightgreen/50 px-3 py-2"><span className="text-gray">💡 Suggestion: </span>{it.suggestions}</p>}
                                                </>
                                            )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

export default function AdminFeedbackIndex() {
    const [tab, setTab] = useState('student');
    const [tick, setTick] = useState(0); // bump to force a section reload on Refresh
    const tabs = useMemo(() => ([
        { key: 'student', label: 'Student Performance', icon: ClipboardList },
        { key: 'teacher', label: 'Teacher Ratings', icon: MessageSquare },
    ]), []);

    return (
        <div className="p-1">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                    <h1 className="text-xl font-bold text-dark m-0">Feedback</h1>
                    <p className="text-[13px] text-gray mt-1 mb-0">Teacher evaluations of students, and student ratings of classes.</p>
                </div>
                <button onClick={() => setTick((t) => t + 1)} className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md border border-border hover:bg-gray-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* Tab switch */}
            <div className="flex items-center gap-1 mb-4 border-b border-border">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-skin text-skin' : 'border-transparent text-gray hover:text-dark'}`}
                    >
                        <t.icon className="w-4 h-4" /> {t.label}
                    </button>
                ))}
            </div>

            <FeedbackSection key={`${tab}-${tick}`} kind={tab} />
        </div>
    );
}
