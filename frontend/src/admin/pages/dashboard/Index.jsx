import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, Users, ArrowUpRight, PieChart, Star, MessageSquare, Presentation, MonitorPlay, UserPlus, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { dashboardStats } from '../../api/admin';
import { leadStats } from '../../api/leads';
import { feedbackStats, teacherFeedbackStats } from '../../api/feedback';
import { useDashboardTheme } from '../../../hooks/useDashboardTheme';

// Small bar chart of per-attribute averages (0-5) for a feedback direction.
const FeedbackChart = ({ data, color }) => (
    <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f6" />
            <XAxis dataKey="short" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip
                cursor={{ fill: 'rgba(255,106,0,0.06)' }}
                formatter={(v) => [`${Number(v).toFixed(1)} / 5`, 'Avg']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e0e5f3' }}
            />
            <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={46} />
        </BarChart>
    </ResponsiveContainer>
);

// Attractive stat card: colored icon badge, big bold number, soft gradient
// background, left accent bar, and a hover lift. `accent` carries the metric's
// solid color + a soft tint for the badge/background.
const StatCard = ({ icon: Icon, count, label, to, accent }) => {
    const { isDark } = useDashboardTheme();
    const card = (
        <div
            className="group relative overflow-hidden rounded-ol-12 border border-ebordermuted bg-white p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.25)]"
            style={{
                // Dark mode: calm dark card with the metric's colour as a crisp
                // outline (text stays light via the .admin-dark scope). Light mode
                // keeps the soft tinted-to-white gradient.
                background: isDark
                    ? `linear-gradient(135deg, ${accent.tint} 0%, #16161f 60%)`
                    : `linear-gradient(135deg, ${accent.tint} 0%, #ffffff 60%)`,
                borderColor: isDark ? accent.solid : undefined,
                borderWidth: isDark ? 1.5 : undefined,
            }}
        >
            <span className="absolute left-0 top-0 h-full w-1.5" style={{ backgroundColor: accent.solid }} />
            <div className="flex items-start justify-between">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ backgroundColor: accent.solid, color: '#fff' }}
                >
                    <Icon className="w-6 h-6" />
                </div>
                {to && (
                    <span className="text-gray opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowUpRight className="w-4 h-4" />
                    </span>
                )}
            </div>
            <p className="text-[30px] font-extrabold text-dark leading-none mt-4 tabular-nums">{count}</p>
            <p className="text-[13px] text-gray mt-1.5">{label}</p>
        </div>
    );
    return to ? <Link to={to} className="block">{card}</Link> : card;
};

const StatusLegend = ({ label, value, color, pct }) => (
    <li className="flex items-center gap-2 mb-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }}></span>
        <span className="text-[13px] text-dark flex-1">{label}</span>
        <span className="text-[12px] text-gray font-semibold tabular-nums">{value}</span>
        <span className="text-[11px] text-gray w-9 text-right tabular-nums">{pct}%</span>
    </li>
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
        short: a.label.split(/[\s/&]+/)[0].slice(0, 8),
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
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading dashboard…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load dashboard</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const { stats = {}, status_counts = {} } = data;

    const cards = [
        { key: 'course_count', label: 'Total Courses', icon: BookOpen, to: '/admin/courses', accent: { solid: '#3b82f6', tint: 'rgba(59,130,246,0.10)' } },
        // "Total Lessons" card removed from the UI by request (backend still
        // returns lesson_count — logic untouched).
        { key: 'enrollment_count', label: 'Total Enrollments', icon: GraduationCap, to: '/admin/students', accent: { solid: '#12c093', tint: 'rgba(18,192,147,0.10)' } },
        { key: 'student_count', label: 'Total Students', icon: Users, to: '/admin/students', accent: { solid: '#FF6A00', tint: 'rgba(255,106,0,0.10)' } },
        { key: 'teacher_count', label: 'Total Teachers', icon: GraduationCap, to: '/admin/teachers', accent: { solid: '#ec4899', tint: 'rgba(236,72,153,0.10)' } },
        { key: 'demo_count', label: 'Total Demos', icon: Presentation, to: '/admin/demos', accent: { solid: '#16a34a', tint: 'rgba(22,163,74,0.10)' } },
        { key: 'class_count', label: 'Total Classes', icon: MonitorPlay, to: '/admin/classes', accent: { solid: '#0ea5e9', tint: 'rgba(14,165,233,0.10)' } },
        { key: 'lead_count', label: 'Total Leads', icon: UserPlus, to: '/admin/leads', accent: { solid: '#f59e0b', tint: 'rgba(245,158,11,0.10)' } },
        { key: 'conversion_count', label: 'Conversions', icon: TrendingUp, to: '/admin/leads?status=converted', accent: { solid: '#14b8a6', tint: 'rgba(20,184,166,0.10)' } },
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
            {/* Header */}
            <div className="rounded-ol-12 p-5 text-white" style={{ background: 'var(--gradient-hero, linear-gradient(135deg,#FF6A00,#ff2583))' }}>
                <h4 className="text-[20px] font-bold m-0">Dashboard</h4>
                <p className="text-[13px] opacity-90 mt-1">Overview of your platform at a glance.</p>
            </div>

            {/* New-leads alert — new portal signups awaiting follow-up. */}
            {newLeads > 0 && (
                <Link to="/admin/leads?status=new" className="block rounded-ol-12 border border-blue-200 bg-blue-50 px-5 py-4 hover:bg-blue-100 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[14px] text-blue-800 font-semibold">
                            🔔 {newLeads} new lead{newLeads > 1 ? 's' : ''} waiting for follow-up
                        </span>
                        <span className="text-[12px] text-blue-700 font-semibold inline-flex items-center gap-1">
                            Review leads <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                    </div>
                </Link>
            )}

            {/* Stat cards — live counts so the admin sees real, never-stale data. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {cards.map((c) => (
                    <StatCard
                        key={c.key}
                        icon={c.icon}
                        count={(stats[c.key] || 0).toLocaleString()}
                        label={c.label}
                        to={c.to}
                        accent={c.accent}
                    />
                ))}
            </div>

            {/* Feedback insights — statistical graphs for BOTH directions:
                teacher→student performance evaluations and student→teacher class
                ratings. Each links to the full feedback browser. */}
            {((fb && fb.total_evaluations > 0) || (tfb && tfb.total_feedback > 0)) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Teacher → Student */}
                    <div className="rounded-ol-12 border border-ebordermuted bg-white p-5">
                        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,106,0,0.12)' }}>
                                    <Star className="w-5 h-5 text-skin" />
                                </span>
                                <div>
                                    <h4 className="text-[15px] font-bold text-dark m-0 leading-tight">Student Performance</h4>
                                    <p className="text-[12px] text-gray m-0">Teacher evaluations of students</p>
                                </div>
                            </div>
                            <Link to="/admin/feedback" className="text-[12px] text-skin font-semibold inline-flex items-center gap-1">View <ArrowUpRight className="w-3.5 h-3.5" /></Link>
                        </div>
                        <div className="flex items-center gap-5 mb-3">
                            <div><span className="text-[22px] font-extrabold text-dark">{fb?.total_evaluations ?? 0}</span><span className="text-[12px] text-gray ml-1.5">evaluations</span></div>
                            <div className="inline-flex items-center gap-1"><span className="text-[22px] font-extrabold text-dark">{(fb?.overall_avg ?? 0).toFixed(1)}</span><span className="text-yellow-400 text-[16px]">★</span><span className="text-[12px] text-gray ml-1">avg</span></div>
                        </div>
                        {fb && fb.total_evaluations > 0
                            ? <FeedbackChart data={chartData(fb)} color="#FF6A00" />
                            : <p className="text-[13px] text-gray py-8 text-center">No evaluations yet.</p>}
                    </div>

                    {/* Student → Teacher */}
                    <div className="rounded-ol-12 border border-ebordermuted bg-white p-5">
                        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(37,99,235,0.12)' }}>
                                    <MessageSquare className="w-5 h-5" style={{ color: '#2563eb' }} />
                                </span>
                                <div>
                                    <h4 className="text-[15px] font-bold text-dark m-0 leading-tight">Teacher Ratings</h4>
                                    <p className="text-[12px] text-gray m-0">Student ratings of classes</p>
                                </div>
                            </div>
                            <Link to="/admin/feedback" className="text-[12px] text-skin font-semibold inline-flex items-center gap-1">View <ArrowUpRight className="w-3.5 h-3.5" /></Link>
                        </div>
                        <div className="flex items-center gap-5 mb-3">
                            <div><span className="text-[22px] font-extrabold text-dark">{tfb?.total_feedback ?? 0}</span><span className="text-[12px] text-gray ml-1.5">responses</span></div>
                            <div className="inline-flex items-center gap-1"><span className="text-[22px] font-extrabold text-dark">{(tfb?.overall_avg ?? 0).toFixed(1)}</span><span className="text-yellow-400 text-[16px]">★</span><span className="text-[12px] text-gray ml-1">avg</span></div>
                        </div>
                        {tfb && tfb.total_feedback > 0
                            ? <FeedbackChart data={chartData(tfb)} color="#2563eb" />
                            : <p className="text-[13px] text-gray py-8 text-center">No class feedback yet.</p>}
                    </div>
                </div>
            )}

            {/* Course status breakdown */}
            <div className="rounded-ol-12 border border-ebordermuted bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[15px] font-semibold text-dark flex items-center gap-2 m-0">
                        <PieChart className="w-4 h-4 text-skin" /> Course Status
                    </h4>
                    <Link to="/admin/courses" className="text-skin text-[12px] font-semibold inline-flex items-center gap-1">
                        Explore <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                    {/* Donut with center total */}
                    <div
                        className="relative w-[160px] h-[160px] rounded-full flex-shrink-0"
                        style={{
                            background: `conic-gradient(${statusItems.map((i, idx, arr) => {
                                const prev = arr.slice(0, idx).reduce((s, x) => s + (status_counts[x.key] || 0), 0);
                                const cur = prev + (status_counts[i.key] || 0);
                                return `${i.color} ${(prev / totalStatus) * 360}deg ${(cur / totalStatus) * 360}deg`;
                            }).join(', ')})`,
                        }}
                    >
                        <div className="absolute inset-0 m-auto w-[100px] h-[100px] rounded-full bg-white flex flex-col items-center justify-center shadow-inner">
                            <span className="text-[24px] font-extrabold text-dark leading-none tabular-nums">{totalCourses}</span>
                            <span className="text-[11px] text-gray mt-0.5">Courses</span>
                        </div>
                    </div>
                    {/* Legend */}
                    <ul className="flex-1 min-w-[220px] m-0 p-0 list-none">
                        {statusItems.map((i) => {
                            const v = status_counts[i.key] || 0;
                            return (
                                <StatusLegend
                                    key={i.key}
                                    label={i.label}
                                    value={v}
                                    color={i.color}
                                    pct={Math.round((v / totalStatus) * 100)}
                                />
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
}
