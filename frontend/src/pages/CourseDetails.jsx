import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCourseDetails } from '@/api/course/courseApi';
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

    // Admin preview mode - admins see everything without locks
    const isAdmin = user?.role === 'admin' || user?.role === 'root';

    // "Go to Course" — always navigate straight to the player. No enrollment
    // or payment step here; server-side gating still governs what content
    // actually plays once inside the player.
    const handleEnroll = (e) => {
        e?.preventDefault?.();
        const slug = data?.course?.slug;
        if (!slug) return;
        navigate(`/courses/programs/course-details/play/${slug}`);
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
            <div className="min-h-screen bg-bodybg">
                {/* Header band — clean two-column: title + meta on the left,
                    enrol/price card on the right (mirrors the reference design).
                    A soft brand-tinted gradient + faint grid give the hero depth
                    without competing with the content below. */}
                <div className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-lightgreen via-white to-white">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.5]"
                        style={{
                            backgroundImage:
                                'radial-gradient(circle at 1px 1px, rgba(255,106,0,0.12) 1px, transparent 0)',
                            backgroundSize: '22px 22px',
                        }}
                    />
                    <div className="relative max-w-[1180px] mx-auto px-6 pt-8 pb-12">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
                            {/* Left: breadcrumb, title, meta */}
                            <div className="lg:col-span-2 min-w-0">
                                <CourseBreadcrumb title={course.title} />

                                <CourseBadges course={course} />

                                <h1 className="mt-3 font-heading text-3xl md:text-[42px] font-extrabold text-gray-900 tracking-tight leading-[1.1]">
                                    {course.title}
                                </h1>
                                {course.short_description && (
                                    <p className="mt-3 text-[16px] text-gray-500 leading-relaxed max-w-2xl">
                                        {course.short_description}
                                    </p>
                                )}

                                <CourseMeta course={course} />
                            </div>

                            {/* Right: enrol / price card (spans the header AND floats
                                below via negative margin so it overlaps the band edge
                                like the reference). */}
                            <div className="lg:col-span-1 lg:row-span-2">
                                <EnrollCard
                                    course={course}
                                    onEnroll={handleEnroll}
                                    isAdmin={isAdmin}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Body — description, outcomes, curriculum, FAQs.
                    Full-width below the header: the enrol card lives in the
                    header band (row-span-2), so the tabbed content stretches the
                    whole container rather than sitting in a narrow left column. */}
                <div className="max-w-[1180px] mx-auto px-6 py-10 space-y-6">
                    {course.progress !== undefined && course.progress > 0 && (
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-heading font-semibold text-gray-900">Your Progress</h3>
                                <span className="text-2xl font-bold text-skin">{course.progress || 0}%</span>
                            </div>
                            <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                    className="h-full bg-[image:var(--gradient-hero)] transition-all duration-500"
                                    style={{ width: `${Math.max(Number(course.progress) || 0, 2)}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <CourseTabs course={course} outcomes={outcomes} faqs={faqs} />
                </div>
            </div>
        </>
    );
}

// "Home / <title>" breadcrumb — Home links back to the landing page.
function CourseBreadcrumb({ title }) {
    return (
        <nav className="flex items-center gap-2 text-[13px] font-semibold">
            <Link to="/" className="text-skin hover:text-skin-dark transition-colors">Home</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500 truncate max-w-[280px]">{title}</span>
        </nav>
    );
}

// Small pill badges above the title that surface the course's headline
// attributes at a glance — free/paid, certificate, and marketing sample.
function CourseBadges({ course }) {
    const isFree = !course.is_paid || Number(course.is_paid) === 0;
    const badges = [
        course.is_marketing && {
            key: 'sample',
            label: 'Free Sample',
            className: 'bg-skin/10 text-skin',
            icon: 'fa-gift',
        },
        isFree && !course.is_marketing && {
            key: 'free',
            label: 'Free Course',
            className: 'bg-success/10 text-success',
            icon: 'fa-unlock',
        },
        course.has_certificate && {
            key: 'cert',
            label: 'Certificate',
            className: 'bg-gray-900/5 text-gray-700',
            icon: 'fa-award',
        },
        course.level && {
            key: 'level',
            label: String(course.level),
            className: 'bg-gray-900/5 text-gray-700 capitalize',
            icon: 'fa-signal',
        },
    ].filter(Boolean);

    if (badges.length === 0) return null;

    return (
        <div className="mt-4 flex flex-wrap items-center gap-2">
            {badges.map((b) => (
                <span
                    key={b.key}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${b.className}`}
                >
                    <i className={`fa ${b.icon} text-[11px]`} />
                    {b.label}
                </span>
            ))}
        </div>
    );
}

// Horizontal meta strip under the title: instructor, rating, language,
// certificate, student count, duration — the row shown in the reference.
function CourseMeta({ course }) {
    const instructor = course.creator?.name || 'Instructor';
    const rating = Number(course.average_rating || 0);
    const language = course.language ? String(course.language) : 'English';
    const students = Number(course.enrolled || 0);

    const items = [
        {
            key: 'instructor',
            node: (
                <span className="flex items-center gap-2">
                    {course.creator?.photo ? (
                        <img src={course.creator.photo} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                        <i className="fa fa-user-circle text-gray-400 text-lg" />
                    )}
                    <span className="text-gray-700">{instructor}</span>
                </span>
            ),
        },
        {
            key: 'rating',
            node: (
                <span className="flex items-center gap-1.5 text-gray-700">
                    <span className="font-semibold">{rating.toFixed(0)}</span>
                    <i className={`fa fa-star ${rating > 0 ? 'text-amber-400' : 'text-gray-300'}`} />
                </span>
            ),
        },
        {
            key: 'language',
            node: (
                <span className="flex items-center gap-1.5 text-gray-700">
                    <i className="fa fa-language text-gray-400" />
                    <span className="capitalize">{language}</span>
                </span>
            ),
        },
        course.has_certificate && {
            key: 'certificate',
            node: (
                <span className="flex items-center gap-1.5 text-gray-700">
                    <i className="fa fa-graduation-cap text-gray-400" />
                    Certificate Course
                </span>
            ),
        },
        {
            key: 'students',
            node: (
                <span className="flex items-center gap-1.5 text-gray-700">
                    <i className="fa fa-users text-gray-400" />
                    {students} Student{students === 1 ? '' : 's'}
                </span>
            ),
        },
        {
            key: 'duration',
            node: (
                <span className="flex items-center gap-1.5 text-gray-700">
                    <i className="fa fa-clock text-gray-400" />
                    {fmtDuration(course.total_duration_secs)}
                </span>
            ),
        },
    ].filter(Boolean);

    return (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
            {items.map((it, i) => (
                <span key={it.key} className="flex items-center gap-5">
                    {it.node}
                    {i < items.length - 1 && (
                        <span aria-hidden className="hidden sm:inline-block h-4 w-px bg-gray-200" />
                    )}
                </span>
            ))}
        </div>
    );
}

// Right-hand card — course thumbnail, price, a full-width "Go to Course"
// button that opens the player, and a ✓ checklist of what's included
// (lessons, sections, total duration, lifetime access, certificate).
function EnrollCard({ course, onEnroll, isAdmin }) {
    const isFree = !course.is_paid || Number(course.is_paid) === 0;
    const price = Number(course.discounted_price || course.price || 0);

    const cover = course.banner || course.thumbnail || '';
    const lessons = Number(course.lesson_count || 0);
    const sections = Number(course.section_count || 0);
    const months = Number(course.expiry_period) || 0;
    const accessLabel = months > 0 ? `${months} month${months === 1 ? '' : 's'} access` : 'Lifetime access';

    // "N total" duration line under the checklist, like the reference.
    const totalLabel = `${fmtDuration(course.total_duration_secs)} total`;

    // Includes list with a per-row icon so the card reads like a spec sheet
    // rather than a plain bullet list.
    const includes = [
        lessons > 0 && { icon: 'fa-play-circle', label: `${lessons} on-demand lesson${lessons === 1 ? '' : 's'}` },
        sections > 0 && { icon: 'fa-layer-group', label: `${sections} section${sections === 1 ? '' : 's'}` },
        { icon: 'fa-clock', label: `${totalLabel} content` },
        { icon: 'fa-infinity', label: accessLabel },
        course.has_certificate && { icon: 'fa-award', label: 'Certificate of completion' },
    ].filter(Boolean);

    // Discount percentage badge (only when there's a real original price above
    // the discounted one).
    const original = Number(course.price || 0);
    const discountPct =
        course.discount_flag && original > price && original > 0
            ? Math.round(((original - price) / original) * 100)
            : 0;

    // Admins get a "Preview Course" label; everyone else opens the course
    // directly. Either way the button just navigates to the player.
    const ctaLabel = isAdmin ? 'Preview Course' : 'Go to Course';

    return (
        <div className="lg:-mt-2">
            <div className="sticky top-24 bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
                {/* Thumbnail */}
                <div className="relative aspect-[16/10] bg-gray-100 border-b border-gray-100">
                    {cover ? (
                        <img src={cover} alt={course.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <i className="fa fa-image text-4xl" />
                        </div>
                    )}
                    {discountPct > 0 && (
                        <span className="absolute top-3 left-3 rounded-full bg-skin text-white text-[12px] font-bold px-3 py-1 shadow-sm">
                            {discountPct}% OFF
                        </span>
                    )}
                </div>

                <div className="p-6">
                    {/* Price */}
                    <div className="mb-4">
                        {isFree || price === 0 ? (
                            <div className="flex items-baseline gap-2">
                                <span className="font-heading text-[32px] leading-none font-extrabold text-gray-900">Free</span>
                                <span className="text-[13px] text-gray-400">· full access</span>
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="font-heading text-[32px] leading-none font-extrabold text-gray-900">${price.toFixed(2)}</span>
                                {course.discount_flag && course.price ? (
                                    <del className="text-gray-400 text-lg">${Number(course.price).toFixed(2)}</del>
                                ) : null}
                            </div>
                        )}
                    </div>

                    {/* Go to Course button — opens the player directly. */}
                    <button
                        type="button"
                        onClick={onEnroll}
                        className="group w-full inline-flex items-center justify-center gap-2 bg-skin hover:bg-skin-dark text-white font-semibold py-3.5 rounded-xl shadow-sm hover:shadow-md transition-all"
                    >
                        {ctaLabel}
                        <i className="fa fa-arrow-right text-[13px] transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-gray-400">
                        <i className="fa fa-shield-halved text-success" />
                        {isFree ? 'No payment required' : 'Secure checkout · 100% money-back'}
                    </p>

                    <div className="my-5 h-px bg-gray-100" />

                    <p className="text-[12px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
                        This course includes
                    </p>

                    {/* Includes checklist */}
                    <ul className="space-y-3">
                        {includes.map((line) => (
                            <li key={line.label} className="flex items-center gap-3 text-[14px] text-gray-600">
                                <i className={`fa ${line.icon} text-skin text-[14px] w-4 text-center`} />
                                {line.label}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

// Tabbed body for the course-details page. Instead of stacking Overview,
// Curriculum, FAQs vertically, they live behind a sticky tab bar so the page
// reads like a footer section with tabs. Only tabs that actually have content
// are rendered, so a course with no FAQs simply won't show that tab.
function CourseTabs({ course, outcomes, faqs }) {
    const hasCurriculum = Array.isArray(course.sections) && course.sections.length > 0;
    const totalLessons = hasCurriculum
        ? course.sections.reduce((sum, s) => sum + (s.lessons?.length || 0), 0)
        : 0;

    const tabs = useMemo(() => {
        return [
            (outcomes.length > 0 || course.description) && {
                key: 'overview',
                label: 'Overview',
                icon: 'fa-circle-info',
            },
            hasCurriculum && {
                key: 'curriculum',
                label: 'Curriculum',
                icon: 'fa-list-check',
                count: totalLessons,
            },
            faqs.length > 0 && {
                key: 'faqs',
                label: 'FAQs',
                icon: 'fa-circle-question',
                count: faqs.length,
            },
        ].filter(Boolean);
    }, [outcomes.length, course.description, hasCurriculum, totalLessons, faqs.length]);

    const [active, setActive] = useState(tabs[0]?.key);

    // Keep the active tab valid if the available tabs change (e.g. after data
    // finishes loading and new content appears).
    useEffect(() => {
        if (tabs.length && !tabs.some((t) => t.key === active)) {
            setActive(tabs[0].key);
        }
    }, [tabs, active]);

    if (tabs.length === 0) return null;

    return (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-card">
            {/* Tab bar */}
            <div
                role="tablist"
                aria-label="Course details"
                className="flex items-stretch gap-1 border-b border-gray-100 bg-gray-50/60 px-2 sm:px-4 overflow-x-auto"
            >
                {tabs.map((t) => {
                    const isActive = t.key === active;
                    return (
                        <button
                            key={t.key}
                            role="tab"
                            type="button"
                            aria-selected={isActive}
                            aria-controls={`tabpanel-${t.key}`}
                            id={`tab-${t.key}`}
                            onClick={() => setActive(t.key)}
                            className={`relative flex items-center gap-2 whitespace-nowrap px-4 sm:px-5 py-4 text-[14px] font-semibold transition-colors ${
                                isActive
                                    ? 'text-skin'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            <i className={`fa ${t.icon} text-[13px]`} />
                            {t.label}
                            {t.count > 0 && (
                                <span
                                    className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
                                        isActive ? 'bg-skin/10 text-skin' : 'bg-gray-200 text-gray-500'
                                    }`}
                                >
                                    {t.count}
                                </span>
                            )}
                            <span
                                className={`absolute left-3 right-3 -bottom-px h-0.5 rounded-full transition-opacity ${
                                    isActive ? 'bg-skin opacity-100' : 'opacity-0'
                                }`}
                            />
                        </button>
                    );
                })}
            </div>

            {/* Panels */}
            <div className="p-6 sm:p-8">
                {active === 'overview' && (
                    <div
                        role="tabpanel"
                        id="tabpanel-overview"
                        aria-labelledby="tab-overview"
                        className="space-y-8"
                    >
                        {outcomes.length > 0 && (
                            <div>
                                <SectionHeading icon="fa-trophy" title="What you'll learn" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-6">
                                    {outcomes.map((o, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-lightgreen flex items-center justify-center mt-0.5">
                                                <i className="fa fa-check text-skin text-xs" />
                                            </span>
                                            <span className="text-[15px] text-gray-700 leading-relaxed">{o}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {course.description && (
                            <div>
                                <SectionHeading icon="fa-document-lines" title="Description" />
                                <div
                                    className="mt-6 text-[15px] text-gray-700 leading-relaxed prose prose-sm max-w-none prose-headings:text-gray-900 prose-a:text-skin prose-strong:text-gray-900"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(course.description) }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {active === 'curriculum' && (
                    <div
                        role="tabpanel"
                        id="tabpanel-curriculum"
                        aria-labelledby="tab-curriculum"
                    >
                        <Curriculum course={course} />
                    </div>
                )}

                {active === 'faqs' && (
                    <div
                        role="tabpanel"
                        id="tabpanel-faqs"
                        aria-labelledby="tab-faqs"
                    >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <SectionHeading icon="fa-circle-question" title="Frequently Asked Questions" />
                                <p className="mt-3 text-[14px] text-gray-500 leading-relaxed max-w-xl">
                                    Everything you need to know before enrolling. Can’t find your answer?{' '}
                                    <Link to="/contact" className="text-skin font-semibold hover:text-skin-dark">
                                        Reach out to our team
                                    </Link>
                                    .
                                </p>
                            </div>
                            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-gray-900/5 text-gray-500 text-[12px] font-semibold px-3 py-1.5">
                                <i className="fa fa-list-ul text-[11px]" />
                                {faqs.length} question{faqs.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        <div className="mt-6 space-y-3">
                            {faqs.map((f, i) => (
                                <details
                                    key={i}
                                    className="group bg-white border border-gray-200 rounded-xl overflow-hidden transition-all hover:border-gray-300 open:border-skin/30 open:shadow-sm"
                                >
                                    <summary className="cursor-pointer list-none flex items-center gap-4 py-4 px-5">
                                        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-lightgreen to-softgreen text-skin text-[13px] font-bold flex items-center justify-center">
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <span className="flex-1 min-w-0 font-heading font-semibold text-gray-900 text-[15px]">
                                            {f.title}
                                        </span>
                                        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 group-hover:text-skin group-open:bg-skin group-open:text-white transition-all">
                                            <i className="fa fa-chevron-down text-[12px] group-open:rotate-180 transition-transform" />
                                        </span>
                                    </summary>
                                    <div className="px-5 pb-5 pl-[76px] text-[14px] text-gray-600 leading-relaxed">
                                        {f.description || 'No additional details provided.'}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Curriculum({ course }) {
    const totalLessons = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-5">
                <SectionHeading icon="fa-list-check" title="Course curriculum" />
                <p className="text-[13px] text-gray-400 whitespace-nowrap">
                    <span className="font-semibold text-gray-700">{course.sections.length}</span> sections ·{' '}
                    <span className="font-semibold text-gray-700">{totalLessons}</span> lessons
                </p>
            </div>
            <div className="space-y-3">
                {course.sections.map((sec, idx) => (
                    <details
                        key={sec.id}
                        className="group bg-white border border-gray-200 rounded-xl overflow-hidden transition-shadow hover:shadow-sm open:shadow-sm open:border-skin/30"
                        open={idx === 0}
                    >
                        <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3 group-open:bg-lightgreen/40 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-lightgreen to-softgreen text-skin text-[13px] font-bold flex items-center justify-center">
                                    {String(idx + 1).padStart(2, '0')}
                                </span>
                                <span className="font-heading font-semibold text-gray-900 text-[15px] truncate">{sec.title}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-[12px] text-gray-400 hidden sm:inline">{sec.lessons.length} lesson{sec.lessons.length === 1 ? '' : 's'}</span>
                                <i className="fa fa-chevron-down text-gray-400 text-[12px] group-open:rotate-180 transition-transform" />
                            </div>
                        </summary>
                        <ul className="border-t border-gray-100 divide-y divide-gray-100">
                            {sec.lessons.map((l, li) => (
                                <li
                                    key={l.id}
                                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3 text-[14px] min-w-0">
                                        <span className="flex-shrink-0 w-6 text-center text-[12px] text-gray-300 font-medium tabular-nums">
                                            {String(li + 1).padStart(2, '0')}
                                        </span>
                                        <LessonTypeIcon type={l.lesson_type} />
                                        <span className="text-gray-700 truncate">{l.title}</span>
                                    </div>
                                    {l.duration && l.duration !== '00:00:00' && (
                                        <span className="text-[12px] text-gray-400 whitespace-nowrap tabular-nums">{l.duration}</span>
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
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-lightgreen to-softgreen text-skin flex items-center justify-center flex-shrink-0 text-[15px]">
                <i className={`fa ${icon}`} />
            </span>
            <h3 className="font-heading text-xl font-bold text-gray-900 m-0 tracking-tight">{title}</h3>
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
