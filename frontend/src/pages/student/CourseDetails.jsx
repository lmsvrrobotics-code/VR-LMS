import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import StudentSidebar from '@/components/student/StudentSidebar';
import { completeLesson } from '@/api/course/courseApi';
import LessonModal from './LessonModal';
import './CourseDetails.css';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

// The real player (CoursePlayer.jsx). Opening a class hands off to it.
// Inline SVG icons. The `fi-rr-*` Flaticon webfont this file used to reference
// is never loaded anywhere in the app, so those <i> glyphs rendered as nothing
// — the bulb and clock were simply invisible. These always draw.
const IconBulb = () => (
    <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
);

const IconClock = () => (
    <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </svg>
);

const IconLock = () => (
    <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
);

const IconSearch = () => (
    <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
    </svg>
);

const IconDots = () => (
    <svg className="card-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.9" />
        <circle cx="12" cy="12" r="1.9" />
        <circle cx="12" cy="19" r="1.9" />
    </svg>
);

// Completion mark: an open ring with a heavy check that breaks out past the
// top-right of it, rather than a tick inside a filled disc. The ring has a
// deliberate gap where the check crosses it, which is what gives the mark its
// hand-drawn look.
const IconTick = () => (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        {/* Ring, opened where the check passes through it. The 99-unit dash on
            a ~119-unit circumference leaves a ~61° gap, rotated so its centre
            (318°) lands on the check's exit point (317°). */}
        <circle
            cx="24" cy="24" r="19"
            stroke="currentColor" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="99 120" transform="rotate(-12 24 24)"
        />
        {/* Check, weighted thicker on the rising stroke and running well past
            the ring, as in the reference. */}
        <path
            d="M14 24.5 L22 33 L37 12"
            stroke="currentColor" strokeWidth="7.5"
            strokeLinecap="round" strokeLinejoin="round"
        />
    </svg>
);

// Fallback artwork for a session with no cover image.
const IconFolder = () => (
    <svg className="media-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
);

// Fallback artwork for a class with no thumbnail.
const IconPlay = () => (
    <svg className="media-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5l6 3.5-6 3.5z" />
    </svg>
);

const IconLockLarge = () => (
    <svg className="media-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
);

// "8 activities" style count, pluralised. Session cards say "activities"; the
// header inside a session still says "classes", since that is the wording the
// class cards and the player use for an individual item.
const activityCountLabel = (n) => `${n} ${n === 1 ? 'activity' : 'activities'}`;

// "Last opened - 4 days ago". Returns null when the student has never opened
// it, so the footer is omitted entirely rather than showing a placeholder.
const lastOpenedLabel = (iso) => {
    if (!iso) return null;
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return null;
    const secs = Math.floor((Date.now() - then.getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
};

// Shared footer: right-aligned "Last opened - N ago", omitted when never opened.
const LastOpened = ({ at }) => {
    const label = lastOpenedLabel(at);
    // The row is ALWAYS rendered, even with nothing to say, so a never-opened
    // card keeps the same height and divider as one that has been opened.
    // Returning null here made cards in the same row disagree on height.
    return (
        <div className="card-foot">
            {label && (
                <>
                    <IconClock />
                    <span>Last opened - {label}</span>
                </>
            )}
        </div>
    );
};

// Three-dot loader used for every wait on this page: the initial course
// fetch and the session/class level switch. One component so the two never
// drift apart.
const Dots = () => (
    <span className="dots" aria-hidden="true">
        <span /><span /><span />
    </span>
);

const Loading = ({ label }) => (
    <div className="curriculum-loading" role="status" aria-live="polite">
        <Dots />
        {label && <p className="loading-label">{label}</p>}
    </div>
);

// A session card: cover image, name, description and how many classes it holds.
// A session has no completion of its own — it is complete when every class
// inside it is, so the tick here is DERIVED rather than separately stored.
const SessionCard = ({ session, onOpen, completedIds = [] }) => {
    const total = session.lessons.length;
    const done = session.lessons.filter((l) => completedIds.includes(l.id)).length;
    // An empty session is not "complete" — there is nothing to have finished.
    const complete = total > 0 && done === total;

    return (
    <button
        type="button"
        className={`curriculum-card${complete ? ' is-complete' : ''}`}
        onClick={onOpen}
    >
        {complete && (
            <span className="card-complete-mark" title="All classes completed" aria-label="All classes completed">
                <IconTick />
            </span>
        )}
        <div className="card-media">
            {session.image
                ? <img src={session.image} alt="" loading="lazy" />
                : <IconFolder />}
        </div>
        <div className="card-body">
            <h4 className="card-title">{session.title}</h4>
            {session.description && <p className="card-desc">{session.description}</p>}
            <div className="card-meta">
                <span className="meta-count">
                    <IconBulb />{activityCountLabel(total)}
                </span>
                {/* Progress toward the derived tick, so a partly-finished
                    session is distinguishable from an untouched one. */}
                {done > 0 && !complete && (
                    <span className="meta-muted">{done}/{total} done</span>
                )}
            </div>
        </div>
        <LastOpened at={session.last_opened_at} />
    </button>
    );
};

// Difficulty meter: three segments filled to the level, with the label under
// them — easy 1/3, medium 2/3, hard 3/3. Sits beneath the thumbnail so the
// card's left column reads as "what this is" at a glance.
const LEVEL_STEPS = { easy: 1, medium: 2, hard: 3 };

const LevelMeter = ({ level }) => {
    const filled = LEVEL_STEPS[level] || 0;
    if (!filled) return null;
    return (
        <div className={`level-meter level-${level}`}>
            <div className="level-bars" role="img" aria-label={`Difficulty: ${level}`}>
                {[1, 2, 3].map((i) => (
                    <span key={i} className={i <= filled ? 'is-on' : ''} />
                ))}
            </div>
            <span className="level-label">Level : {level.charAt(0).toUpperCase() + level.slice(1)}</span>
        </div>
    );
};

// A class card inside a session. Locked classes (not yet released by the
// teacher) still render so students can see what is coming, but do not open.
const ClassCard = ({ lesson, onOpen, opening = false, completed = false, onMarkComplete }) => {
    const locked = lesson.locked === true;
    const level = String(lesson.difficulty || '').toLowerCase();
    const isQuiz = lesson.lesson_type === 'quiz';
    const [menuOpen, setMenuOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const menuRef = useRef(null);

    // Close on an outside click or Escape, the way a menu is expected to behave.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (e) => {
            if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const markComplete = async () => {
        setMenuOpen(false);
        if (completed || saving) return;
        setSaving(true);
        try { await onMarkComplete(lesson.id); }
        finally { setSaving(false); }
    };

    const activate = () => { if (!locked && !opening) onOpen(); };

    return (
        /* A div, not a button: the kebab menu below is itself a button, and
           nesting one inside another is invalid HTML (the inner one stops
           receiving clicks in some browsers). role/tabIndex/keydown restore
           the keyboard and screen-reader behaviour a button would have given. */
        <div
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked || opening}
            onClick={activate}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
            }}
            className={`curriculum-card${locked ? ' is-locked' : ''}${opening ? ' is-opening' : ''}${completed ? ' is-complete' : ''}`}
        >
            {/* Completion tick, top-right. */}
            {completed && (
                <span className="card-complete-mark" title="Completed" aria-label="Completed">
                    <IconTick />
                </span>
            )}

            {/* Kebab menu. stopPropagation everywhere so opening the menu or
                choosing an item never also opens the class. */}
            <div className="card-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    className="card-menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Class options"
                    onClick={() => setMenuOpen((v) => !v)}
                >
                    <IconDots />
                </button>
                {menuOpen && (
                    <div className="card-menu-pop" role="menu">
                        <button
                            type="button"
                            role="menuitem"
                            className="card-menu-item"
                            onClick={markComplete}
                            disabled={completed || saving}
                        >
                            {completed ? 'Completed' : saving ? 'Saving…' : 'Mark as Complete'}
                        </button>
                    </div>
                )}
            </div>

            <div className="card-aside">
                <div className="card-media">
                    {/* While the player route loads, the thumbnail is covered
                        by a spinner so the click has visible feedback. */}
                    {opening && <span className="media-spinner" />}
                    {lesson.thumbnail
                        ? <img src={lesson.thumbnail} alt="" loading="lazy" />
                        : (locked ? <IconLockLarge /> : <IconPlay />)}
                </div>
                <LevelMeter level={level} />
            </div>
            <div className="card-body">
                <h4 className="card-title">
                    {/* Quizzes look like any other class otherwise, so the
                        badge is how a student tells them apart before opening. */}
                    {isQuiz && <span className="quiz-badge">Quiz</span>}
                    {lesson.title}
                </h4>
                {lesson.description && <p className="card-desc">{lesson.description}</p>}
                <div className="card-meta">
                    {lesson.duration && lesson.duration !== '00:00:00' && (
                        <span className="meta-muted"><IconClock />{lesson.duration}</span>
                    )}
                    {locked && <span className="meta-muted"><IconLock />Locked</span>}
                </div>
            </div>
            <LastOpened at={lesson.last_opened_at} />
        </div>
    );
};

export default function CourseDetails() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [batch, setBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    // Which session the page has drilled into; null = the sessions grid.
    const [openSessionId, setOpenSessionId] = useState(null);
    // Brief skeleton while switching between the two levels. The data is
    // already in memory, so this is a deliberate ~250ms beat that makes the
    // change of level legible instead of an abrupt swap.
    const [switching, setSwitching] = useState(false);
    // The class currently open in the modal player; null = none.
    const [playingLessonId, setPlayingLessonId] = useState(null);
    // Mobile drawer state for the student navigation sidebar.
    const [navOpen, setNavOpen] = useState(false);
    // Classes this student has completed. Seeded from the course payload and
    // updated optimistically when they use the card menu.
    const [completedIds, setCompletedIds] = useState([]);
    // Curriculum search + filters. These apply to whichever level is showing:
    // the sessions grid, or the classes inside an opened session.
    const [query, setQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const switchTimer = useRef(null);

    // Clear any pending level-switch timer on unmount.
    useEffect(() => () => {
        if (switchTimer.current) clearTimeout(switchTimer.current);
    }, []);

    useEffect(() => {
        fetchData();
    }, [courseId]);

    // `silent` refetches without the full-page loader — used after the class
    // modal closes, so updated progress lands without the page blanking out.
    const fetchData = async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        // The app stores the Supabase JWT under `accessToken` (see
        // api/axiosInstance.tsx). Reading 'token' here sent "Bearer null" and
        // 401'd every authenticated call.
        const token = localStorage.getItem('accessToken');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Course details, including the session/class tree. The endpoint takes
        // a slug or a numeric id and wraps the course as { course, reviews }.
        try {
            const courseRes = await axios.get(
                `${API_BASE}/api/public/course/${courseId}`,
                { headers }
            );
            const fetched = courseRes.data?.course || courseRes.data;
            setCourse(fetched);
            setCompletedIds(fetched?.completed_lesson_ids || []);
        } catch (error) {
            // A silent background refresh failing is not worth a toast — the
            // page already has good data on screen.
            if (!silent) {
                toast.error('Failed to load course details');
                setLoading(false);
            }
            console.error('[course-details] course fetch failed:', error);
            return;
        }

        // Batch is decoration on the header — a signed-out viewer or a student
        // in no batch must not turn the whole page into an error, so this is
        // deliberately separate from the course fetch above.
        try {
            const batchesRes = await axios.get(
                `${API_BASE}/api/public/batches/my`,
                { headers }
            );
            const batches = batchesRes.data?.batches || [];
            if (batches.length > 0) setBatch(batches[0]);
        } catch (error) {
            console.warn('[course-details] batch lookup skipped:', error?.message);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Level changes run through here so both directions get the same beat.
    // The timer id is kept in a ref so a fast second click (or unmounting
    // mid-transition) cancels the pending clear instead of firing a state
    // update on a gone component.
    const goToSession = (id) => {
        // Reset the search when changing level: a query typed against sessions
        // rarely means the same thing against that session's classes, and a
        // stale filter would land the student on an apparently empty session.
        setQuery('');
        setLevelFilter('');
        setStatusFilter('');
        setSwitching(true);
        setOpenSessionId(id);
        if (switchTimer.current) clearTimeout(switchTimer.current);
        switchTimer.current = window.setTimeout(() => setSwitching(false), 650);
    };

    // Classes play in a dialog over the curriculum — no route change, so the
    // student keeps their place in the session they were browsing.
    const openLesson = (lessonId) => setPlayingLessonId(lessonId);

    // "Mark as Complete" from a card's menu. Optimistic: the tick appears at
    // once, and a failed write rolls it back rather than leaving a card
    // claiming a completion the server never recorded.
    const markLessonComplete = async (lessonId) => {
        setCompletedIds((prev) => (prev.includes(lessonId) ? prev : [...prev, lessonId]));
        try {
            await completeLesson(course.id, lessonId);
            fetchData({ silent: true });
        } catch (e) {
            setCompletedIds((prev) => prev.filter((id) => id !== lessonId));
            toast.error(e.response?.data?.error || 'Could not mark this class complete');
        }
    };

    // Every return goes through this so the student navigation is present
    // while loading and on the not-found state too — not only once the course
    // has arrived.
    const withShell = (content) => (
        <div className="student-shell">
            {navOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-30 bg-black/40"
                    onClick={() => setNavOpen(false)}
                    aria-hidden="true"
                />
            )}
            <StudentSidebar
                active="My Courses"
                collapsible
                open={navOpen}
                onClose={() => setNavOpen(false)}
            />
            <div className="course-details-container">
                <button
                    type="button"
                    className="student-nav-toggle lg:hidden"
                    onClick={() => setNavOpen(true)}
                    aria-label="Open menu"
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M3 6h18M3 12h18M3 18h18" />
                    </svg>
                </button>
                {content}
            </div>
        </div>
    );

    // Initial fetch — the three-dot loader stands in for the whole page.
    if (loading) {
        return withShell(
            /* Taller than the in-page variant because this stands in for the
               entire page, not just the grid. */
            <div className="curriculum-full is-page-loading">
                <Loading label="Loading course…" />
            </div>
        );
    }

    if (!course) {
        return withShell(
            <div className="empty-state">
                <IconFolder />
                <p>Course not found.</p>
                <p className="empty-state-hint">
                    It may have been unpublished, or you may not have access to it.
                </p>
                {/* An explicit destination, not navigate(-1): a student who
                    arrived here by direct link or a refresh has no useful
                    history, and going "back" can land them on this same
                    broken page again. */}
                <button onClick={() => navigate('/student/dashboard', { state: { tab: 'My Courses' } })}>
                    Back to My Courses
                </button>
            </div>
        );
    }

    const progress = course.progress || 0;
    // Sessions (sections) with their classes, as shaped by the public course
    // API. Each carries image/description; each class carries thumbnail,
    // description and difficulty. Older responses may omit `sections`, so the
    // curriculum falls back to an empty grid rather than throwing.
    const sessions = (course.sections || []).map((s) => ({ ...s, lessons: s.lessons || [] }));
    const openSession = sessions.find((s) => s.id === openSessionId) || null;

    const q = query.trim().toLowerCase();
    const matchesText = (...fields) =>
        !q || fields.some((f) => String(f || '').toLowerCase().includes(q));

    // A class passes when it matches the text AND every active filter.
    const classMatches = (l) => {
        if (!matchesText(l.title, l.description)) return false;
        if (levelFilter && String(l.difficulty || '').toLowerCase() !== levelFilter) return false;
        if (statusFilter === 'completed' && !completedIds.includes(l.id)) return false;
        if (statusFilter === 'pending' && completedIds.includes(l.id)) return false;
        return true;
    };

    // At the sessions level, searching should find a session by its OWN name
    // or by any class inside it — otherwise typing a class name from the top
    // level returns nothing and looks broken.
    const visibleSessions = sessions.filter((s) => {
        const ownMatch = matchesText(s.title, s.description);
        const hasMatchingClass = s.lessons.some(classMatches);
        const filtering = !!(levelFilter || statusFilter);
        // With a filter active, a session only shows if it still has a class
        // that passes it; text alone is not enough.
        return filtering ? hasMatchingClass : (ownMatch || hasMatchingClass);
    });

    const visibleLessons = openSession ? openSession.lessons.filter(classMatches) : [];
    const filtersActive = !!(q || levelFilter || statusFilter);
    const clearFilters = () => { setQuery(''); setLevelFilter(''); setStatusFilter(''); };
    const lessons = course.lesson_count ?? sessions.reduce((n, s) => n + s.lessons.length, 0);
    const totalHours = course.total_hours || '';
    return withShell(
        <>
            {/* Header — course identity, progress and the resume action. The
                page below is nothing but the curriculum, so the header carries
                the context the old Overview tab used to hold. */}
            <div className="details-header">
                <div className="header-left">
                    {/* The heading tracks the level the student is on. Inside a
                        session the session is the subject and the course name
                        sits above it as context — otherwise, with the
                        breadcrumb gone, nothing on screen said which session
                        these classes belong to. */}
                    <div className="header-info">
                        {openSession && <p className="header-eyebrow">{course.title}</p>}
                        <h1 className="course-title">
                            {openSession ? openSession.title : course.title}
                        </h1>
                        <p className="course-subline">
                            {openSession ? (
                                <span>
                                    {openSession.lessons.length}{' '}
                                    {openSession.lessons.length === 1 ? 'class' : 'classes'}
                                </span>
                            ) : (
                                <>
                                    {batch && <span>Batch: {batch.display_name}</span>}
                                    <span>{course.section_count ?? sessions.length} sessions</span>
                                    <span>{lessons} {lessons === 1 ? 'class' : 'classes'}</span>
                                    {totalHours && <span>{totalHours}</span>}
                                </>
                            )}
                        </p>
                    </div>
                </div>
                <div className="header-right">
                    <div className="header-progress">
                        <div className="progress-label">
                            <span>Progress</span>
                            <span className="progress-percent">{progress}%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => {
                            // Opens in the same modal as a card click — never
                            // the old full-page player.
                            const firstLessonId = sessions.find((s) => s.lessons.length)?.lessons[0]?.id;
                            if (firstLessonId) openLesson(firstLessonId);
                        }}
                        disabled={!sessions.some((s) => s.lessons.length)}
                    >
                        {progress > 0 ? 'Continue' : 'Start learning'}
                    </button>
                </div>
            </div>

            {/* Curriculum — the whole page. Sessions, then the classes inside
                the session you open. `key` remounts the subtree on every level
                change so the rise animation restarts. */}
            {/* Search + filters. Scoped to the level currently showing, so the
                same controls narrow sessions or the classes inside one. */}
            <div className="curriculum-toolbar">
                <div className="toolbar-search">
                    <IconSearch />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={openSession ? 'Search classes…' : 'Search sessions and classes…'}
                        aria-label="Search curriculum"
                    />
                </div>

                <select
                    className="toolbar-select"
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    aria-label="Filter by level"
                >
                    <option value="">All levels</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                </select>

                <select
                    className="toolbar-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                >
                    <option value="">All classes</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Not completed</option>
                </select>

                {filtersActive && (
                    <button type="button" className="toolbar-clear" onClick={clearFilters}>
                        Clear
                    </button>
                )}
            </div>

            {/* Back control sits under the search/filter row, directly above
                the grid it returns you from — so it reads as "out of this
                list" rather than as part of the course header.
                The label is always "Back"; where it goes depends on the level
                (up to the session list, or out to My Courses) and is carried
                in aria-label/title rather than in the visible text. */}
            <div className="curriculum-back">
                <button
                    className="back-btn"
                    onClick={() => (openSession ? goToSession(null) : navigate('/student/dashboard', { state: { tab: 'My Courses' } }))}
                    aria-label={openSession ? 'Back to all sessions' : 'Back to My Courses'}
                    title={openSession ? 'Back to all sessions' : 'Back to My Courses'}
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                    <span className="back-btn-label">Back</span>
                </button>
            </div>

            <div className="curriculum-full" key={openSessionId ?? 'root'}>
                {openSession ? (
                    <>
                        {switching ? (
                            <Loading label="Loading classes…" />
                        ) : visibleLessons.length === 0 ? (
                            <p className="curriculum-empty">
                                {openSession.lessons.length === 0
                                    ? 'No classes in this session yet.'
                                    : 'No classes match your search.'}
                            </p>
                        ) : (
                            <div className="card-grid">
                                {visibleLessons.map((l) => (
                                    <ClassCard
                                        key={l.id}
                                        lesson={l}
                                        onOpen={() => openLesson(l.id)}
                                        opening={playingLessonId === l.id}
                                        completed={completedIds.includes(l.id)}
                                        onMarkComplete={markLessonComplete}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                ) : switching ? (
                    <Loading label="Loading sessions…" />
                ) : visibleSessions.length === 0 ? (
                    <p className="curriculum-empty">
                        {sessions.length === 0
                            ? 'No sessions available yet.'
                            : 'No sessions match your search.'}
                    </p>
                ) : (
                    <div className="card-grid">
                        {visibleSessions.map((s) => (
                            <SessionCard
                                key={s.id}
                                session={s}
                                completedIds={completedIds}
                                onOpen={() => goToSession(s.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Class player. Mounted here (not routed) so closing it returns
                the student to exactly the session they were browsing. */}
            <LessonModal
                slug={course.slug}
                lessonId={playingLessonId}
                onClose={() => { setPlayingLessonId(null); fetchData({ silent: true }); }}
                onProgress={() => fetchData({ silent: true })}
            />
        </>
    );
}
