import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCourseDetails } from '@/api/course/courseApi';
import { enrollCourse } from '@/api/userProgressApi';
import { buyCourse } from '@/api/paymentApi';
import { fmtDuration, safeArr } from '@/components/course/format';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

export default function CourseDetails({ slug: slugProp } = {}) {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const slug = slugProp || params.slug || searchParams.get('slug') || 'first';
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Stays true after the user clicks Enroll/Start Learning. Component unmounts
    // when the player route mounts, so we never need to clear it explicitly.
    const [enrolling, setEnrolling] = useState(false);
    const [payError, setPayError] = useState(null);

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
                    className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
                    role="status"
                    aria-live="polite"
                >
                    <div className="w-12 h-12 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
                    <p className="mt-4 text-gray-700 font-medium">Loading your course…</p>
                </div>
            )}

            {/* Course details — replica of the reference layout */}
            <section className="bg-white min-h-[70vh]">
                <div className="max-w-[1180px] mx-auto px-4 py-10">
                    <h2 className="text-center text-[30px] sm:text-[42px] font-extrabold text-dark mb-10 tracking-tight">
                        Courses Details
                    </h2>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
                        {/* Left: Overview tab + content */}
                        <div className="lg:col-span-2">
                            {/* Tab bar — Overview */}
                            <div className="border-b border-border mb-8">
                                <button type="button" className="relative px-1 pb-3 text-[16px] font-semibold text-dark cursor-default">
                                    Overview
                                    <span className="absolute left-0 right-0 -bottom-px h-[3px] bg-emerald-400 rounded-t" />
                                </button>
                            </div>

                            <h1 className="text-[30px] sm:text-[38px] font-extrabold text-dark mb-7">
                                {course.title}
                            </h1>

                            {/* Progress bar (pill) — student's completion of this course */}
                            <div className="mb-9">
                                <div className="h-6 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-emerald-400 flex items-center justify-center text-[11px] font-bold text-white transition-all"
                                        style={{ width: `${Math.max(Number(course.progress) || 0, 6)}%`, minWidth: 44 }}
                                    >
                                        {course.progress || 0}%
                                    </div>
                                </div>
                            </div>

                            {/* Quick highlights — fills the page with at-a-glance
                                course facts (level, lessons, hours, language…). */}
                            <CourseHighlights course={course} />

                            {/* Overview body — description / outcomes / FAQ.
                                The full curriculum (sections + lessons) is shown
                                inside the course player, so it's intentionally
                                NOT repeated here. */}
                            <Overview course={course} outcomes={outcomes} faqs={faqs} />
                        </div>

                        {/* Right: stats card */}
                        <StatsCard
                            course={course}
                            onEnroll={handleEnroll}
                            enrolling={enrolling}
                            payError={payError}
                        />
                    </div>
                </div>
            </section>
        </>
    );
}

// Right-hand stats card — replica of the reference design: icon + label rows
// (Duration, Total Hours, Score, Lectures, Class Rank) and a teal "Go to Course"
// button. Real data for Duration/Total Hours; Score, Lectures and Class Rank are
// static placeholders (no backing data yet — can be wired later).
function StatsCard({ course, onEnroll, enrolling, payError }) {
    const isFree = !course.is_paid || Number(course.is_paid) === 0;
    // Access (→ "Go to Course") = free, a marketing/sample course (open to all),
    // already purchased, OR assigned by an admin/teacher (roster delegation).
    // Anyone without access on a paid course sees "Buy this course".
    const owned = isFree || course.is_marketing || course.purchased || course.assigned;

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
            <div className="bg-white rounded-2xl border border-border shadow-[0_10px_40px_rgba(0,0,0,0.08)] p-7 sticky top-[90px]">
                <ul className="m-0 p-0 list-none">
                    {rows.map((r) => (
                        <li key={r.label} className="flex items-center justify-between py-4 border-b border-border/60 last:border-0">
                            <span className="flex items-center gap-3 text-[15px] font-bold text-dark">
                                <i className={`fa ${r.icon} text-muted w-5 text-center text-[15px]`} />
                                {r.label}
                            </span>
                            <span className="text-[14px] text-muted whitespace-nowrap">{r.value}</span>
                        </li>
                    ))}
                </ul>

                <button
                    type="button"
                    onClick={onEnroll}
                    disabled={enrolling}
                    className="mt-6 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 rounded-xl shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {enrolling ? 'Loading…' : owned ? 'Go to Course' : 'Buy this course'}
                </button>
                {payError && (
                    <p className="mt-2 text-[12px] text-red-600 text-center">{payError}</p>
                )}
            </div>
        </div>
    );
}

// Compact "course at a glance" strip — surfaces the real admin data the detail
// page already has so the left column never looks empty.
function CourseHighlights({ course }) {
    const items = [
        { icon: 'fa-signal', label: 'Level', value: course.level ? String(course.level) : '—', cap: true },
        { icon: 'fa-layer-group', label: 'Sections', value: course.section_count || 0 },
        { icon: 'fa-file-lines', label: 'Lessons', value: course.lesson_count || 0 },
        { icon: 'fa-clock', label: 'Total Hours', value: fmtDuration(course.total_duration_secs) },
        { icon: 'fa-language', label: 'Language', value: course.language ? String(course.language) : '—', cap: true },
        { icon: 'fa-award', label: 'Certificate', value: course.has_certificate ? 'Included' : 'No' },
    ];
    return (
        <div className="mb-10 rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                {items.map((it) => (
                    <div key={it.label} className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 shrink-0 rounded-lg bg-lightgreen text-skin flex items-center justify-center">
                            <i className={`fa ${it.icon} text-[14px]`} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-[12px] text-muted">{it.label}</div>
                            <div className={`text-[15px] font-semibold text-dark truncate ${it.cap ? 'capitalize' : ''}`}>{it.value}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Overview({ course, outcomes, faqs }) {
    return (
        <div className="space-y-10 max-w-4xl">
            {outcomes.length > 0 && (
                <div className="bg-white border border-border rounded-2xl p-6 sm:p-8">
                    <SectionHeading icon="fa-bullseye" title="What you'll learn" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-5">
                        {outcomes.map((o, i) => (
                            <div key={i} className="flex items-start gap-3 text-[14px] text-dark leading-relaxed">
                                <i className="fa fa-check text-skin mt-1 flex-shrink-0" />
                                <span>{o}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <SectionHeading icon="fa-align-left" title="Description" />
                <div
                    className="mt-5 text-[15px] text-dark leading-[1.75] prose-custom"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(course.description) }}
                />
            </div>

            {faqs.length > 0 && (
                <div>
                    <SectionHeading icon="fa-circle-question" title="FAQ" />
                    <div className="mt-5 border-t border-border">
                        {faqs.map((f, i) => (
                            <details key={i} className="group border-b border-border">
                                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 py-5 px-2 hover:bg-lightgreen/30 transition-colors rounded">
                                    <span className="font-semibold text-dark text-[15px]">{f.title}</span>
                                    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-dark text-[20px] leading-none rounded-full group-open:bg-skin group-open:text-white transition-colors">
                                        <span className="group-open:hidden">+</span>
                                        <span className="hidden group-open:inline">−</span>
                                    </span>
                                </summary>
                                <div className="px-2 pb-5 text-[14px] text-muted leading-relaxed">
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
        <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-lightgreen text-skin flex items-center justify-center flex-shrink-0">
                <i className={`fa ${icon} text-[14px]`} />
            </span>
            <h3 className="text-[20px] font-bold text-dark m-0 tracking-tight">{title}</h3>
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

// Renders while the course-details payload is in flight. Shapes track the
// real layout (hero block, sticky purchase card, tab strip, content lines)
// so the page reflows minimally when data swaps in. Tones use neutral grays
// rather than dark/skin so it reads well on the public-site background.
function CourseDetailsSkeleton() {
    return (
        <div className="max-w-[1280px] mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: hero + tabs + body */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Breadcrumb / category chip */}
                    <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                    {/* Title (two lines) */}
                    <div className="h-7 w-11/12 rounded bg-gray-200 animate-pulse" />
                    <div className="h-7 w-2/3 rounded bg-gray-200 animate-pulse" />
                    {/* Rating / teacher / meta strip */}
                    <div className="flex items-center gap-3 pt-1">
                        <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
                    </div>
                    {/* Hero / preview thumbnail (16:9) */}
                    <div className="aspect-video w-full rounded-lg bg-gray-200 animate-pulse mt-2" />
                    {/* Tab strip */}
                    <div className="flex gap-4 border-b border-border pt-2 pb-2">
                        {[80, 100, 70, 90, 80].map((w, i) => (
                            <div key={i} className="h-4 rounded bg-gray-200 animate-pulse" style={{ width: w }} />
                        ))}
                    </div>
                    {/* Body lines */}
                    <div className="space-y-2 pt-2">
                        <div className="h-4 w-11/12 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-10/12 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-9/12 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-7/12 rounded bg-gray-200 animate-pulse" />
                    </div>
                </div>

                {/* Right: enrolment / price card */}
                <div className="lg:col-span-1">
                    <div className="rounded-lg border border-border p-4 space-y-3 bg-white">
                        {/* Thumbnail */}
                        <div className="aspect-video w-full rounded bg-gray-200 animate-pulse" />
                        {/* Price */}
                        <div className="h-7 w-1/3 rounded bg-gray-200 animate-pulse" />
                        {/* CTA button (full width) */}
                        <div className="h-10 w-full rounded bg-gray-300 animate-pulse" />
                        {/* Meta rows */}
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center justify-between pt-1">
                                <div className="h-3 w-1/3 rounded bg-gray-200 animate-pulse" />
                                <div className="h-3 w-1/4 rounded bg-gray-200 animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
