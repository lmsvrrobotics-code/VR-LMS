import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCourseDetails } from '@/api/course/courseApi';
import { enrollCourse } from '@/api/userProgressApi';
import { buyCourse } from '@/api/paymentApi';
import { useAuth } from '@/hooks/useAuth';
import { fmtDuration, safeArr } from '@/components/course/format';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

export default function CourseDetails({ slug: slugProp } = {}) {
    const { user } = useAuth();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const slug = slugProp || params.slug || searchParams.get('slug') || 'first';
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [enrolling, setEnrolling] = useState(false);
    const [payError, setPayError] = useState(null);

    // Admin preview mode - admins see everything without locks
    const isAdmin = user?.role === 'admin' || user?.role === 'root';

    const handleEnroll = async (e) => {
        e?.preventDefault?.();
        if (enrolling || !data?.course?.slug) return;
        const c = data.course;
        const goToPlayer = () => navigate(`/courses/programs/course-details/play/${c.slug}`);

        // Paid course → Razorpay checkout first. The server grants access on a
        // verified payment (or returns alreadyPaid). Free courses skip this.
        const paidCourse = (c.is_paid === true || Number(c.is_paid) === 1)
            && Number(c.discounted_price || c.price || 0) > 0;
        // Already accessible → straight to the player, no payment. Covers a
        // purchased course, an admin/teacher-assigned (roster) course, and a
        // marketing/sample course (free teaser) — none should hit checkout.
        if (c.is_marketing || c.assigned || (paidCourse && c.purchased)) { goToPlayer(); return; }
        if (paidCourse) {
            if (!localStorage.getItem('accessToken')) { navigate('/auth'); return; }
            setPayError(null);
            setEnrolling(true);
            await buyCourse(
                c.id,
                {
                    name: localStorage.getItem('userName') || undefined,
                    email: localStorage.getItem('userEmail') || undefined,
                    phone: localStorage.getItem('userPhone') || undefined,
                },
                goToPlayer,
                (msg) => { setEnrolling(false); setPayError(msg || 'Payment could not be completed.'); },
            );
            return;
        }

        setEnrolling(true);
        // Persist enrollment so revisits from /programs auto-redirect to the player.
        // program_id is carried in the URL by /programs/select; if absent (user came
        // here some other way), we still navigate so existing flows aren't broken.
        const programId = Number(searchParams.get('program_id'));
        if (programId && data?.course?.id) {
            try {
                const { target } = await enrollCourse(programId, data.course.id);
                if (target?.player_path) {
                    navigate(target.player_path);
                    return;
                }
            } catch {
                /* fall through to plain navigation */
            }
        }
        navigate(`/courses/programs/course-details/play/${data.course.slug}`);
    };

    useEffect(() => {
        let alive = true;
        setLoading(true);
        getCourseDetails(slug)
            .then((res) => { if (alive) setData(res); })
            .catch((err) => { if (alive) setError(err?.response?.data?.error || 'Failed to load course'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [slug]);

    // Skeleton mirroring the real course-details layout (hero on the left,
    // enrolment/price card on the right, tabs + body below). Same animate-pulse
    // approach as CoursePlayer's skeleton so loading feel is consistent across
    // the click → navigate → mount sequence.
    if (loading) return <CourseDetailsSkeleton />;
    if (error) return <div className="max-w-[1280px] mx-auto px-4 py-16 text-center text-danger">{error}</div>;
    if (!data) return null;

    const { course } = data;
    const outcomes = safeArr(course.outcomes);
    const faqs = safeArr(course.faqs);

    return (
        <>
            {enrolling && (
                <div
                    className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
                    role="status"
                    aria-live="polite"
                >
                    <div className="bg-white rounded-2xl p-8 flex flex-col items-center">
                        <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-gray-700 font-semibold">Preparing course…</p>
                    </div>
                </div>
            )}

            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
                {/* Hero Section */}
                <div className="relative bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 text-white overflow-hidden">
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl" />
                    </div>

                    <div className="max-w-[1280px] mx-auto px-4 py-16 relative z-10">
                        <div className="flex items-start justify-between gap-8 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
                                        {course.level || 'Beginner'}
                                    </span>
                                    {course.has_certificate && (
                                        <span className="px-3 py-1 bg-yellow-300/20 backdrop-blur-sm rounded-full text-sm font-semibold">
                                            🏆 Certified
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
                                    {course.title}
                                </h1>
                                <p className="text-lg text-white/90 mb-6">
                                    Master the essentials with our comprehensive course
                                </p>
                                <div className="flex items-center gap-6 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-star text-yellow-300" />
                                        <span className="font-semibold">{(course.average_rating || 0).toFixed(1)}/5</span>
                                        <span className="text-white/70">({course.review_count || 0} reviews)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-users text-white/70" />
                                        <span>{course.enrolled || 0} enrolled</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-[1280px] mx-auto px-4 py-12">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left: Course Content */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* Progress Section */}
                            {course.progress !== undefined && (
                                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-gray-900">Your Progress</h3>
                                        <span className="text-2xl font-bold text-emerald-500">{course.progress || 0}%</span>
                                    </div>
                                    <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                                            style={{ width: `${Math.max(Number(course.progress) || 0, 2)}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Quick Stats Grid */}
                            <CourseHighlights course={course} />

                            {/* Description & Content */}
                            <Overview course={course} outcomes={outcomes} faqs={faqs} />
                        </div>

                        {/* Right: Stats Card + CTA */}
                        <div className="lg:col-span-1">
                            <StatsCard
                                course={course}
                                onEnroll={handleEnroll}
                                enrolling={enrolling}
                                payError={payError}
                                isAdmin={isAdmin}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

// Right-hand stats card — replica of the reference design: icon + label rows
// (Duration, Total Hours, Score, Lectures, Class Rank) and a teal "Go to Course"
// button. Real data for Duration/Total Hours; Score, Lectures and Class Rank are
// static placeholders (no backing data yet — can be wired later).
function StatsCard({ course, onEnroll, enrolling, payError, isAdmin }) {
    const isFree = !course.is_paid || Number(course.is_paid) === 0;
    // Admin always has access (preview mode). Otherwise, access depends on:
    // - Free course, OR
    // - Marketing/sample course (open to all), OR
    // - Already purchased, OR
    // - Assigned by admin/teacher (roster delegation)
    const owned = isAdmin || isFree || course.is_marketing || course.purchased || course.assigned;

    const months = Number(course.expiry_period) || 0;
    const durationLabel = months > 0 ? `${months} Month${months === 1 ? '' : 's'}` : 'Lifetime';

    // Score: student's earned leaderboard points for this course over the
    // admin-set max (score_max). With no max set, show the earned points alone.
    const earned = Number(course.student_score) || 0;
    const scoreValue = course.score_max != null && course.score_max !== ''
        ? `${earned} / ${course.score_max}`
        : String(earned);
    // Lectures: dynamic from the course's real lesson count (auto-updates as
    // the admin adds/removes lessons). An optional admin label overrides it.
    const lessonCount = Number(course.lesson_count) || 0;
    const lecturesValue = course.lectures_label
        || (lessonCount ? `${lessonCount} ${lessonCount === 1 ? 'Lecture' : 'Lectures'}` : '—');
    // Class Rank: live "#rank / total" among everyone taking this course. The
    // backend gives every enrolled/assigned student a position (even at 0
    // points, tie-broken by score); a non-class viewer gets null → "—".
    const rankValue = course.class_rank
        ? `#${course.class_rank}${course.class_total ? ` / ${course.class_total}` : ''}`
        : '—';

    const rows = [
        { icon: 'fa-clock', label: 'Duration', value: durationLabel },
        { icon: 'fa-hourglass-half', label: 'Total Hours', value: fmtDuration(course.total_duration_secs) },
        { icon: 'fa-sliders-h', label: 'Score', value: scoreValue },
        { icon: 'fa-file-lines', label: 'Lectures', value: lecturesValue },
        { icon: 'fa-crown', label: 'Class Rank', value: rankValue },
    ];

    return (
        <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
                {/* Price Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                    <div className="mb-6">
                        {isFree ? (
                            <div className="flex items-center gap-2">
                                <span className="text-4xl font-bold text-emerald-500">Free</span>
                                <span className="text-sm text-gray-600">Lifetime access</span>
                            </div>
                        ) : (
                            <div>
                                <div className="text-4xl font-bold text-emerald-500 mb-1">
                                    ${Number(course.discounted_price || course.price || 0).toFixed(2)}
                                </div>
                                {course.discount_flag && course.price && (
                                    <div className="text-sm">
                                        <del className="text-gray-400">${Number(course.price).toFixed(2)}</del>
                                        <span className="ml-2 text-emerald-500 font-semibold">Save {Math.round((1 - (course.discounted_price || 0) / (course.price || 1)) * 100)}%</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* CTA Button */}
                    <button
                        type="button"
                        onClick={onEnroll}
                        disabled={enrolling}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-4 rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                    >
                        {enrolling ? 'Loading…' : isAdmin ? 'Preview Course' : owned ? 'Go to Course' : 'Buy Now'}
                    </button>

                    {payError && (
                        <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">{payError}</p>
                    )}
                </div>

                {/* Course Info Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Course Details</h3>
                    <ul className="space-y-3">
                        {rows.map((r) => (
                            <li key={r.label} className="flex items-center justify-between">
                                <span className="flex items-center gap-3 text-sm text-gray-700">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50">
                                        <i className={`fa ${r.icon} text-emerald-600 text-sm`} />
                                    </span>
                                    {r.label}
                                </span>
                                <span className="font-semibold text-gray-900">{r.value}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Additional Info */}
                <div className="bg-gradient-to-br from-blue-50 to-emerald-50 rounded-2xl border border-blue-100 p-6">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">✓</span>
                        <div>
                            <h4 className="font-semibold text-gray-900 mb-1">What You Get</h4>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li>✓ Full lifetime access</li>
                                <li>✓ Certificate of completion</li>
                                <li>✓ Mobile-friendly content</li>
                                <li>✓ Expert instructor support</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Compact "course at a glance" strip — surfaces the real admin data the detail
// page already has so the left column never looks empty.
function CourseHighlights({ course }) {
    const items = [
        { icon: 'fa-chart-line', label: 'Level', value: course.level ? String(course.level) : 'Beginner', cap: true, color: 'bg-blue-100 text-blue-600' },
        { icon: 'fa-folder', label: 'Sections', value: course.section_count || 0, color: 'bg-purple-100 text-purple-600' },
        { icon: 'fa-book', label: 'Lessons', value: course.lesson_count || 0, color: 'bg-orange-100 text-orange-600' },
        { icon: 'fa-hourglass-end', label: 'Duration', value: fmtDuration(course.total_duration_secs), color: 'bg-teal-100 text-teal-600' },
        { icon: 'fa-globe', label: 'Language', value: course.language ? String(course.language) : 'English', cap: true, color: 'bg-pink-100 text-pink-600' },
        { icon: 'fa-award', label: 'Certificate', value: course.has_certificate ? '✓ Yes' : 'No', color: 'bg-emerald-100 text-emerald-600' },
    ];
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {items.map((it) => (
                <div key={it.label} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition hover:border-gray-200">
                    <div className="flex items-start gap-3">
                        <span className={`w-10 h-10 shrink-0 rounded-lg ${it.color} flex items-center justify-center`}>
                            <i className={`fa ${it.icon} text-sm`} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{it.label}</div>
                            <div className={`text-lg font-bold text-gray-900 ${it.cap ? 'capitalize' : ''}`}>{it.value}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function Overview({ course, outcomes, faqs }) {
    return (
        <div className="space-y-8">
            {outcomes.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 hover:shadow-md transition">
                    <SectionHeading icon="fa-trophy" title="What you'll learn" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-6">
                        {outcomes.map((o, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
                                    <i className="fa fa-check text-emerald-600 text-xs" />
                                </span>
                                <span className="text-[15px] text-gray-700 leading-relaxed">{o}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {course.description && (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 hover:shadow-md transition">
                    <SectionHeading icon="fa-document-lines" title="Description" />
                    <div
                        className="mt-6 text-[15px] text-gray-700 leading-relaxed prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-emerald-600 prose-strong:text-gray-900"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(course.description) }}
                    />
                </div>
            )}

            {faqs.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition">
                    <div className="p-8 border-b border-gray-100">
                        <SectionHeading icon="fa-circle-question" title="Frequently Asked Questions" />
                    </div>
                    <div className="divide-y divide-gray-100">
                        {faqs.map((f, i) => (
                            <details key={i} className="group">
                                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 py-5 px-8 hover:bg-emerald-50 transition-colors">
                                    <span className="font-semibold text-gray-900 text-[15px] pr-4">{f.title}</span>
                                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-emerald-600 text-lg leading-none font-bold group-open:rotate-180 transition-transform">
                                        +
                                    </span>
                                </summary>
                                <div className="px-8 pb-5 text-[14px] text-gray-700 leading-relaxed bg-gray-50/50">
                                    {f.description}
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function Curriculum({ course }) {
    const totalLessons = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-5">
                <SectionHeading icon="fa-list-check" title="Course curriculum" />
                <p className="text-[13px] text-muted whitespace-nowrap ml-4">
                    <span className="font-semibold text-dark">{course.sections.length}</span> sections ·{' '}
                    <span className="font-semibold text-dark">{totalLessons}</span> lessons
                </p>
            </div>
            <div className="space-y-3">
                {course.sections.map((sec, idx) => (
                    <details
                        key={sec.id}
                        className="group bg-white border border-border rounded-xl overflow-hidden transition-shadow hover:shadow-sm"
                        open={idx === 0}
                    >
                        <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-lightgreen text-skin text-[13px] font-bold flex items-center justify-center">
                                    {String(idx + 1).padStart(2, '0')}
                                </span>
                                <span className="font-semibold text-dark text-[15px] truncate">{sec.title}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-[12px] text-muted">{sec.lessons.length} lessons</span>
                                <i className="fa fa-chevron-down text-muted text-[12px] group-open:rotate-180 transition-transform" />
                            </div>
                        </summary>
                        <ul className="border-t border-border divide-y divide-border bg-bodybg/30">
                            {sec.lessons.map((l) => (
                                <li
                                    key={l.id}
                                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-lightgreen/20 transition-colors"
                                >
                                    <div className="flex items-center gap-3 text-[14px] min-w-0">
                                        <LessonTypeIcon type={l.lesson_type} />
                                        <span className="text-dark truncate">{l.title}</span>
                                    </div>
                                    {l.duration && l.duration !== '00:00:00' && (
                                        <span className="text-[12px] text-muted whitespace-nowrap">{l.duration}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </details>
                ))}
            </div>
        </div>
    );
}

function SectionHeading({ icon, title }) {
    return (
        <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 flex items-center justify-center flex-shrink-0 text-lg">
                <i className={`fa ${icon}`} />
            </span>
            <h3 className="text-2xl font-bold text-gray-900 m-0 tracking-tight">{title}</h3>
        </div>
    );
}

function LessonTypeIcon({ type }) {
    if (['video-url', 'system-video', 'vimeo-url', 'html5'].includes(type)) return <i className="fa fa-video text-muted" />;
    if (type === 'image') return <i className="fa fa-image text-muted" />;
    if (type === 'google_drive') return <i className="fab fa-google-drive text-muted" />;
    if (type === 'quiz') return <i className="fa fa-question-circle text-muted" />;
    return <i className="fa fa-file text-muted" />;
}

function Details({ requirements, outcomes }) {
    const panel = (icon, title, items, empty, accent) => (
        <div className="bg-white border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
                <span className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center`}>
                    <i className={`fa ${icon} text-[16px]`} />
                </span>
                <h3 className="text-[17px] font-semibold text-dark m-0">{title}</h3>
            </div>
            {items.length === 0 ? (
                <p className="text-[14px] text-muted">{empty}</p>
            ) : (
                <ul className="space-y-2.5">
                    {items.map((v, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[14px] text-dark leading-relaxed">
                            <i className="fa fa-circle text-[6px] text-skin mt-2 flex-shrink-0" />
                            <span>{v}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            {panel('fa-clipboard-list', 'Requirements', requirements, 'No specific requirements.', 'bg-amber-100 text-amber-600')}
            {panel('fa-trophy', 'Outcomes', outcomes, 'No outcomes listed.', 'bg-lightgreen text-skin')}
        </div>
    );
}

function Teacher({ teacher }) {
    if (!teacher) {
        return (
            <div className="bg-white border border-border rounded-2xl p-10 text-center max-w-4xl">
                <i className="fa fa-user-slash text-muted text-[28px] mb-3" />
                <p className="text-[14px] text-muted">Teacher info not available.</p>
            </div>
        );
    }

    // `expertise` powers both the tagline under the name AND the chip strip.
    // Render chips only when the admin entered something comma-separated, so
    // a plain tagline like "AI educator" doesn't get repeated as a single
    // chip below the same line. Falls back to `skills` for legacy rows.
    const expertiseRaw = (teacher.skills || teacher.about || '').trim();
    const expertiseChips = expertiseRaw.includes(',')
        ? expertiseRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    const hasBody = teacher.biography || expertiseChips.length > 0;

    return (
        <div className="max-w-4xl">
            <SectionHeading icon="fa-user-tie" title="About the teacher" />
            <div className="mt-5 bg-white border border-border rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-lightgreen/40 to-white p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                    <img
                        src={teacher.photo}
                        alt={teacher.name || ''}
                        className="w-28 h-28 rounded-full object-cover flex-shrink-0 ring-4 ring-white shadow-md"
                    />
                    <div className="text-center sm:text-left flex-1 min-w-0">
                        <h3 className="text-[22px] font-bold text-dark m-0">{teacher.name}</h3>
                        {teacher.about && (
                            <p className="text-[14px] text-skin font-medium mt-1 m-0">
                                {teacher.about}
                            </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1.5 text-[12px] text-muted">
                            {teacher.email && (
                                <a
                                    href={`mailto:${teacher.email}`}
                                    className="inline-flex items-center gap-1.5 hover:text-skin transition-colors"
                                >
                                    <i className="fa fa-envelope" />
                                    {teacher.email}
                                </a>
                            )}
                            {teacher.linkedinUrl && (
                                <a
                                    href={teacher.linkedinUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 hover:text-skin transition-colors"
                                >
                                    <i className="fab fa-linkedin" />
                                    LinkedIn
                                </a>
                            )}
                        </div>
                    </div>
                </div>
                {hasBody && (
                    <div className="p-6 sm:p-8 border-t border-border space-y-5">
                        {teacher.biography ? (
                            <div
                                className="text-[14px] text-dark leading-[1.75] prose-custom"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(teacher.biography) }}
                            />
                        ) : (
                            <p className="text-[14px] text-muted italic m-0">
                                No biography yet.
                            </p>
                        )}
                        {expertiseChips.length > 0 && (
                            <div>
                                <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">
                                    Areas of expertise
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {expertiseChips.map((s, i) => (
                                        <span
                                            key={i}
                                            className="text-[12px] font-medium bg-lightgreen text-skin px-3 py-1.5 rounded-full"
                                        >
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Reviews({ course, reviews, stars }) {
    return (
        <div className="max-w-4xl">
            <SectionHeading icon="fa-star" title="Student reviews" />
            <div className="mt-5 bg-white border border-border rounded-2xl p-6 sm:p-8 mb-6 flex flex-col sm:flex-row items-center gap-8">
                <div className="text-center flex-shrink-0">
                    <p className="text-[56px] font-bold text-dark leading-none m-0">
                        {(course.average_rating || 0).toFixed(1)}
                    </p>
                    <div className="flex items-center justify-center gap-1 mt-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <i key={i} className={`fa fa-star text-[16px] ${i < stars ? 'text-amber-400' : 'text-border'}`} />
                        ))}
                    </div>
                    <p className="text-[12px] text-muted mt-2 m-0">
                        Based on {course.review_count || 0} review{course.review_count === 1 ? '' : 's'}
                    </p>
                </div>
                <div className="hidden sm:block w-px self-stretch bg-border" />
                <div className="flex-1 text-center sm:text-left">
                    <p className="text-[15px] font-semibold text-dark m-0">Verified student feedback</p>
                    <p className="text-[13px] text-muted mt-1.5 leading-relaxed">
                        Ratings come from enrolled students after completing course content, so every score
                        reflects real classroom experience.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {reviews.length === 0 ? (
                    <div className="bg-white border border-border rounded-2xl p-10 text-center">
                        <i className="fa fa-comment-dots text-muted text-[28px] mb-3" />
                        <p className="text-[14px] text-muted m-0">
                            No reviews yet. Be the first to share what you think after completing the course.
                        </p>
                    </div>
                ) : reviews.map((r) => (
                    <div key={r.id} className="bg-white border border-border rounded-xl p-5 flex gap-4 hover:shadow-sm transition-shadow">
                        <img
                            src={r.user?.photo}
                            alt=""
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-bodybg"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-1.5 flex-wrap">
                                <p className="font-semibold text-dark m-0">{r.user?.name || 'Anonymous'}</p>
                                <div className="flex items-center gap-0.5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <i key={i} className={`fa fa-star text-[12px] ${i < r.rating ? 'text-amber-400' : 'text-border'}`} />
                                    ))}
                                </div>
                            </div>
                            <p className="text-[14px] text-muted leading-relaxed m-0">{r.review}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Loading skeleton that matches the enhanced layout
function CourseDetailsSkeleton() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Hero Skeleton */}
            <div className="bg-gradient-to-r from-slate-200 to-slate-300 h-56 animate-pulse" />

            {/* Content Skeleton */}
            <div className="max-w-[1280px] mx-auto px-4 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Progress Card */}
                        <div className="bg-white rounded-2xl p-6 animate-pulse">
                            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                            <div className="h-3 w-full bg-gray-200 rounded" />
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="bg-white rounded-xl p-5 animate-pulse">
                                    <div className="h-10 w-10 bg-gray-200 rounded-lg mb-3" />
                                    <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
                                    <div className="h-5 w-12 bg-gray-200 rounded" />
                                </div>
                            ))}
                        </div>

                        {/* Content Sections */}
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl p-8 animate-pulse">
                                <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
                                <div className="space-y-3">
                                    <div className="h-4 w-full bg-gray-200 rounded" />
                                    <div className="h-4 w-5/6 bg-gray-200 rounded" />
                                    <div className="h-4 w-4/6 bg-gray-200 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-1 space-y-4">
                        {/* Price Card */}
                        <div className="bg-white rounded-2xl p-8 animate-pulse">
                            <div className="h-10 w-20 bg-gray-200 rounded mb-4" />
                            <div className="h-12 w-full bg-gray-300 rounded-xl" />
                        </div>

                        {/* Info Card */}
                        <div className="bg-white rounded-2xl p-6 animate-pulse space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex justify-between">
                                    <div className="h-4 w-20 bg-gray-200 rounded" />
                                    <div className="h-4 w-16 bg-gray-200 rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
