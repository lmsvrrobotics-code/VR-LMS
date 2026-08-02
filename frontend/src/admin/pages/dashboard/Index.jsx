import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, Users, ArrowUpRight, Star, MessageSquare, Presentation, MonitorPlay, UserPlus, RefreshCw, Target, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { dashboardStats } from '../../api/admin';
import { leadStats } from '../../api/leads';
import { feedbackStats, teacherFeedbackStats } from '../../api/feedback';

// Shared card shell — one consistent surface used across the whole dashboard so
// every panel reads as part of the same system (same radius, border, padding).
const Panel = ({ className = '', children }) => (
    <div className={`rounded-ol-8 border border-ebordermuted bg-white ${className}`}>{children}</div>
);

// Small bar chart of per-attribute averages (0-5) for a feedback direction.
const FeedbackChart = ({ data, color }) => (
    <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f6" />
            <XAxis dataKey="short" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip
                cursor={{ fill: 'rgba(255,106,0,0.06)' }}
                formatter={(v) => [`${Number(v).toFixed(1)} / 5`, 'Avg']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e0e5f3' }}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
    </ResponsiveContainer>
);

// Compact KPI tile — dense analytics style: small uppercase label on top, a
// large tabular number, and a real derived sub-metric on the footer line (never
// a fabricated trend — the API returns point-in-time counts only). The tiles
// sit inside one bordered grid, hairline-divided, so many read as a clean
// instrument panel rather than floating boxes.
const Kpi = ({ icon: Icon, label, value, sub, to }) => {
    const body = (
        <div className="group flex h-full flex-col justify-between p-4 transition-colors hover:bg-gray-50/80">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray">{label}</span>
                <Icon className="h-4 w-4 text-gray-300 transition-colors group-hover:text-skin" />
            </div>
            <div className="mt-3">
                <p className="text-[26px] font-bold leading-none text-dark tabular-nums">{value}</p>
                {sub && <p className="mt-1.5 text-[11.5px] text-gray tabular-nums">{sub}</p>}
            </div>
        </div>
    );
    return to ? <Link to={to} className="block h-full">{body}</Link> : body;
};

// Consistent section heading used above each panel's content.
const SectionHead = ({ icon: Icon, title, subtitle, action }) => (
    <div className="mb-4 flex items-start justify-between gap-3 border-b border-ebordermuted px-4 py-3">
        <div className="flex items-center gap-2.5">
            {Icon && <Icon className="h-[18px] w-[18px] text-skin" />}
            <div>
                <h4 className="m-0 text-[14px] font-semibold leading-tight text-dark">{title}</h4>
                {subtitle && <p className="m-0 mt-0.5 text-[11.5px] text-gray">{subtitle}</p>}
            </div>
        </div>
        {action}
    </div>
);

const ViewLink = ({ to, children = 'View' }) => (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-skin hover:underline">
        {children} <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
);

// Compact stat pair used inside panel bodies (evaluations / avg etc.).
const Metric = ({ value, unit, star }) => (
    <div className="inline-flex items-baseline gap-1">
        <span className="text-[20px] font-bold text-dark tabular-nums">{value}</span>
        {star && <span className="text-[15px] text-yellow-400">★</span>}
        <span className="text-[11.5px] text-gray">{unit}</span>
    </div>
);

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newLeads, setNewLeads] = useState(0);
    const [fb, setFb] = useState(null);   // teacher → student (performance)
    const [tfb, setTfb] = useState(null); // student → teacher (class ratings)

    // Lead alert + both feedback summaries — best-effort; failures here must
    // not break the dashboard.
    useEffect(() => {
        leadStats().then((s) => setNewLeads(s?.new || 0)).catch(() => {});
        feedbackStats().then(setFb).catch(() => {});
        teacherFeedbackStats().then(setTfb).catch(() => {});
    }, []);

    // Build chart rows (short labels) from a feedback stats payload.
    const chartData = (stats) => (stats?.attributes || []).map((a) => ({
        short: a.label.split(/[s/&]+/)[0].slice(0, 8),
        label: a.label,
        value: stats?.per_attribute?.[a.key] ?? 0,
    }));

    // Pulled out of useEffect so the error-state Retry button can call it too.
    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await dashboardStats();
            setData(res);
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-skin" />
                <p className="text-[14px]">Loading dashboard…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <Panel>
                <div className="px-6 py-10 text-center">
                    <p className="mb-2 text-[16px] font-semibold text-danger">Couldn’t load dashboard</p>
                    <p className="mb-4 text-[13px] text-gray">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </Panel>
        );
    }

    const { stats = {}, status_counts = {} } = data;
    const n = (v) => (v || 0).toLocaleString();
    // Real derived ratios (no fabricated period-over-period trends — the API
    // returns point-in-time counts, so every sub-metric here is computed live).
    const convRate = stats.lead_count ? Math.round((stats.conversion_count / stats.lead_count) * 100) : 0;
    const enrPerStudent = stats.student_count ? (stats.enrollment_count / stats.student_count).toFixed(1) : '0.0';
    const studPerTeacher = stats.teacher_count ? Math.round(stats.student_count / stats.teacher_count) : 0;

    // Primary KPIs on the top instrument row; each carries a real sub-metric.
    const kpis = [
        { key: 'student_count', label: 'Students', icon: Users, to: '/admin/students', value: n(stats.student_count), sub: `${enrPerStudent} enrollments / student` },
        { key: 'enrollment_count', label: 'Enrollments', icon: GraduationCap, to: '/admin/students', value: n(stats.enrollment_count), sub: `across ${n(stats.course_count)} courses` },
        { key: 'teacher_count', label: 'Teachers', icon: GraduationCap, to: '/admin/teachers', value: n(stats.teacher_count), sub: `~${studPerTeacher} students each` },
        { key: 'conversion_count', label: 'Conversions', icon: Target, to: '/admin/leads?status=converted', value: n(stats.conversion_count), sub: `${convRate}% of ${n(stats.lead_count)} leads` },
    ];

    // Secondary operational counts — a denser second row.
    const secondary = [
        { key: 'course_count', label: 'Courses', icon: BookOpen, to: '/admin/courses', value: n(stats.course_count) },
        { key: 'class_count', label: 'Classes', icon: MonitorPlay, to: '/admin/classes', value: n(stats.class_count) },
        { key: 'demo_count', label: 'Demos', icon: Presentation, to: '/admin/demos', value: n(stats.demo_count) },
        { key: 'lead_count', label: 'Leads', icon: UserPlus, to: '/admin/leads', value: n(stats.lead_count) },
    ];

    const statusItems = [
        { key: 'active', label: 'Active', color: '#12c093' },
        { key: 'upcoming', label: 'Upcoming', color: '#FF6A00' },
        { key: 'pending', label: 'Pending', color: '#ff2583' },
        { key: 'private', label: 'Private', color: '#6366f1' },
        { key: 'draft', label: 'Draft', color: '#878d97' },
        { key: 'inactive', label: 'Inactive', color: '#dadada' },
    ];
    const totalStatus = statusItems.reduce((s, i) => s + (status_counts[i.key] || 0), 0) || 1;
    const totalCourses = statusItems.reduce((s, i) => s + (status_counts[i.key] || 0), 0);

    return (
        <div className="space-y-4">
            {/* Toolbar — title on the left, refresh on the right (the analytics
                admin convention). Keeps the header useful, not decorative. */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h4 className="m-0 text-[18px] font-bold text-dark">Dashboard</h4>
                    <p className="m-0 mt-0.5 text-[12px] text-gray">Live platform metrics · updated on load</p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-ol-8 border border-ebordermuted bg-white px-3 py-1.5 text-[12.5px] font-semibold text-dark transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {/* New-leads alert — new portal signups awaiting follow-up. */}
            {newLeads > 0 && (
                <Link to="/admin/leads?status=new" className="block rounded-ol-8 border border-blue-200 bg-blue-50 px-4 py-3 transition-colors hover:bg-blue-100">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[13.5px] font-semibold text-blue-800">
                            🔔 {newLeads} new lead{newLeads > 1 ? 's' : ''} waiting for follow-up
                        </span>
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700">
                            Review <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                    </div>
                </Link>
            )}

            {/* Primary KPI row — larger tiles with derived sub-metrics. */}
            <Panel className="overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-y divide-ebordermuted lg:grid-cols-4 lg:divide-y-0">
                    {kpis.map((k) => (
                        <Kpi key={k.key} icon={k.icon} label={k.label} value={k.value} sub={k.sub} to={k.to} />
                    ))}
                </div>
            </Panel>

            {/* Secondary operational counts — a tighter row for scheduling and
                pipeline volume. */}
            <Panel className="overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-y divide-ebordermuted sm:grid-cols-4 sm:divide-y-0">
                    {secondary.map((k) => (
                        <Kpi key={k.key} icon={k.icon} label={k.label} value={k.value} to={k.to} />
                    ))}
                </div>
            </Panel>

            {/* Main analytics grid — feedback charts (2/3) beside course-status
                breakdown (1/3), so charts and distribution sit side-by-side the
                way a real analytics console lays them out. */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {/* Feedback insights span two columns on wide screens. */}
                {((fb && fb.total_evaluations > 0) || (tfb && tfb.total_feedback > 0)) ? (
                    <div className="grid grid-cols-1 gap-4 xl:col-span-2 lg:grid-cols-2">
                        {/* Teacher → Student */}
                        <Panel>
                            <SectionHead
                                icon={Star}
                                title="Student Performance"
                                subtitle="Teacher evaluations of students"
                            />
                            <div className="px-4 pb-4">
                                <div className="mb-2 flex items-center gap-5">
                                    <Metric value={fb?.total_evaluations ?? 0} unit="evaluations" />
                                    <Metric value={(fb?.overall_avg ?? 0).toFixed(1)} unit="avg" star />
                                </div>
                                {fb && fb.total_evaluations > 0
                                    ? <FeedbackChart data={chartData(fb)} color="#FF6A00" />
                                    : <p className="py-8 text-center text-[13px] text-gray">No evaluations yet.</p>}
                            </div>
                        </Panel>

                        {/* Student → Teacher */}
                        <Panel>
                            <SectionHead
                                icon={MessageSquare}
                                title="Teacher Ratings"
                                subtitle="Student ratings of classes"
                            />
                            <div className="px-4 pb-4">
                                <div className="mb-2 flex items-center gap-5">
                                    <Metric value={tfb?.total_feedback ?? 0} unit="responses" />
                                    <Metric value={(tfb?.overall_avg ?? 0).toFixed(1)} unit="avg" star />
                                </div>
                                {tfb && tfb.total_feedback > 0
                                    ? <FeedbackChart data={chartData(tfb)} color="#2563eb" />
                                    : <p className="py-8 text-center text-[13px] text-gray">No class feedback yet.</p>}
                            </div>
                        </Panel>
                    </div>
                ) : (
                    <div className="xl:col-span-2" />
                )}

                {/* Course status breakdown — compact list rows with inline bars,
                    the dense-table treatment rather than a big donut. */}
                <Panel>
                    <SectionHead
                        icon={Layers}
                        title="Course Status"
                        subtitle={`${totalCourses} course${totalCourses === 1 ? '' : 's'} total`}
                        action={<ViewLink to="/admin/courses">All</ViewLink>}
                    />
                    <div className="px-4 pb-4">
                        {/* Stacked proportion bar */}
                        <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            {statusItems.map((i) => {
                                const v = status_counts[i.key] || 0;
                                if (!v) return null;
                                return <span key={i.key} className="h-full" style={{ width: `${(v / totalStatus) * 100}%`, backgroundColor: i.color }} title={`${i.label}: ${v}`} />;
                            })}
                        </div>
                        <ul className="m-0 list-none space-y-2.5 p-0">
                            {statusItems.map((i) => {
                                const v = status_counts[i.key] || 0;
                                const pct = Math.round((v / totalStatus) * 100);
                                return (
                                    <li key={i.key} className="flex items-center gap-2.5">
                                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
                                        <span className="flex-1 text-[12.5px] text-dark">{i.label}</span>
                                        <span className="text-[12.5px] font-semibold text-dark tabular-nums">{v}</span>
                                        <span className="w-9 text-right text-[11.5px] text-gray tabular-nums">{pct}%</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </Panel>
            </div>
        </div>
    );
}
