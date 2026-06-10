import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPlayer, completeLesson, updateLessonProgress } from '@/api/course/courseApi';
import { safeObj } from '@/components/course/format';
import Navbar from '@/components/layout/Navbar';
import PlayerSidebar from '@/components/course/player/PlayerSidebar';
import PlayerLesson from '@/components/course/player/PlayerLesson';
import PlayerTabs from '@/components/course/player/PlayerTabs';

const PLAY_BASE = '/courses/programs/course-details/play';

export default function CoursePlayer() {
    const { slug, lessonId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [marking, setMarking] = useState(false);
    const shellRef = useRef(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);

        // Minimum-visible-time for the skeleton. On localhost getPlayer()
        // can resolve in ~50ms, which is faster than the human eye registers
        // a state change — the skeleton would flicker and the user would
        // perceive an abrupt jump. We hold the skeleton for at least 500ms
        // so the transition feels intentional. If the API takes longer than
        // 500ms, this delay is a no-op (the API is the slow path, not us).
        const MIN_SKELETON_MS = 500;
        const startedAt = Date.now();
        const finish = (fn) => {
            const elapsed = Date.now() - startedAt;
            const wait = Math.max(0, MIN_SKELETON_MS - elapsed);
            setTimeout(() => { if (alive) fn(); }, wait);
        };

        getPlayer(slug, lessonId)
            .then((res) => finish(() => { setData(res); setLoading(false); }))
            .catch((err) => finish(() => {
                if (err?.response?.status === 404) setError('Course not found.');
                else setError(err?.response?.data?.error || 'Failed to load player');
                setLoading(false);
            }));
        return () => { alive = false; };
    }, [slug, lessonId]);

    const onFullscreen = () => {
        const el = shellRef.current || document.documentElement;
        if (!document.fullscreenElement) el.requestFullscreen?.();
        else document.exitFullscreen?.();
    };

    const onMarkComplete = async () => {
        if (!data?.lesson || marking) return;
        setMarking(true);
        try {
            await completeLesson(data.course.id, data.lesson.id);
            // Refetch to update progress + locked-state for drip content.
            const fresh = await getPlayer(slug, data.lesson.id);
            setData(fresh);
        } catch (e) {
            console.warn(e);
        } finally {
            setMarking(false);
        }
    };

    // Latest playback time (in seconds) reported by the <video> element. For non-<video>
    // lesson types we fall back to wall-clock elapsed time since the lesson opened.
    const playbackTimeRef = useRef(0);
    const lessonOpenedAtRef = useRef(Date.now());

    const handleTimeUpdate = (t) => { playbackTimeRef.current = Number(t) || 0; };

    // Auto-tick: every 5s, post the latest watched position in 5s buckets. Fine
    // enough that an admin-configured "minimum duration" (e.g. 10–15s) auto-
    // completes promptly. (5s × N students is the write cost; acceptable, and the
    // server only persists when the high-water mark actually advances.)
    useEffect(() => {
        if (!data?.lesson) return;
        const lesson = data.lesson;
        // Run for every lesson type EXCEPT quizzes (those complete on submission).
        // Videos count playback time; readable lessons (pdf/text/document) count
        // time-on-lesson — so the drip "minimum duration" applies to all of them
        // and a PDF-first course no longer gets stuck.
        if (lesson.lesson_type === 'quiz') return;
        // A locked lesson (drip not yet reached, or teacher hasn't released it)
        // must NOT auto-complete just by sitting on the page.
        const lockedNow = (data.locked_lesson_ids || []).includes(lesson.id);
        if (lockedNow) return;

        playbackTimeRef.current = 0;
        lessonOpenedAtRef.current = Date.now();
        let lastReported = -1;
        let stopped = false;

        const TICK_MS = 5000;
        const BUCKET = 5;
        const interval = setInterval(async () => {
            if (stopped) return;
            const wallElapsed = Math.floor((Date.now() - lessonOpenedAtRef.current) / 1000);
            const playbackElapsed = Math.floor(playbackTimeRef.current);
            const current = Math.max(playbackElapsed, wallElapsed);
            // Round down to a 5s bucket and skip duplicates.
            const tick = Math.floor(current / BUCKET) * BUCKET;
            if (tick <= 0 || tick === lastReported) return;
            lastReported = tick;

            try {
                const result = await updateLessonProgress(data.course.id, lesson.id, tick);
                if (result?.is_completed === 1 && !(data.history?.completed_lesson || []).includes(lesson.id)) {
                    const fresh = await getPlayer(slug, lesson.id);
                    if (!stopped) setData(fresh);
                }
            } catch (e) {
                console.warn('progress update failed:', e);
            }
        }, TICK_MS);

        return () => { stopped = true; clearInterval(interval); };
    }, [data?.lesson?.id, slug]);

    const goRelative = (delta) => {
        if (!data) return;
        const flat = data.course.sections.flatMap((s) => s.lessons.map((l) => ({ section: s, lesson: l })));
        const idx = flat.findIndex((x) => x.lesson.id === data.lesson?.id);
        if (idx < 0) return;
        const next = flat[idx + delta];
        if (!next) return;
        navigate(`${PLAY_BASE}/${data.course.slug}/${next.lesson.id}`);
    };

    if (loading && !data) {
        // Fullscreen loading overlay — identical style to CourseDetails'
        // "Loading your course…" overlay, so the user sees one continuous
        // loading state from the click on the previous page through to
        // the player being ready. Min 500ms hold (set in the effect above)
        // ensures it's visibly there even when the API resolves in tens
        // of milliseconds on localhost.
        return (
            <div
                className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
                role="status"
                aria-live="polite"
            >
                <div className="w-12 h-12 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-gray-700 font-medium">Loading your course…</p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="player-shell flex flex-col items-center justify-center min-h-screen p-8 text-center">
                <p className="text-white text-[18px] font-semibold mb-2">{error}</p>
                <button onClick={() => navigate('/courses/programs')} className="ol-btn-primary mt-4">Back to courses</button>
            </div>
        );
    }
    if (!data) return null;

    const { course, lesson, history, locked_lesson_ids: lockedIds = [], progress, completed_lesson_count, delegated, paywalled } = data;
    const completedIds = history.completed_lesson || [];
    const isCurrentLocked = lesson && lockedIds.includes(lesson.id);
    const dripSettings = safeObj(course.drip_content_settings);
    // A lesson is gated by drip, by teacher release (delegated — universal now),
    // or by the paywall. In every case the backend has already stripped the
    // video src, so we just show the lock UI with the most actionable reason.
    const gatingOn = course.enable_drip_content === 1 || delegated === true || paywalled === true;
    // Prefer the paywall message: an unpaid student can act on it (buy), and
    // payment is required even once a lesson is released. Otherwise fall back to
    // the teacher-release message, then the drip message.
    const lockedMessage = paywalled
        ? 'Purchase this course to unlock this lesson.'
        : delegated
            ? 'Your teacher hasn’t released this lesson yet.'
            : dripSettings.locked_lesson_message;

    const isDone = lesson && completedIds.includes(lesson.id);

    return (
        <div ref={shellRef} className="player-shell flex flex-col">
            <Navbar />

            <section className="flex-1 py-6 sm:py-8">
                <div className="player-container">
                    {/* Premium lesson header — course eyebrow + current lesson title,
                        with a live progress pill on the right. */}
                    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF6A00] mb-1.5">
                                {course.title}
                            </p>
                            <h1 className="text-[22px] sm:text-[28px] font-extrabold text-gray-900 leading-tight">
                                {lesson?.title || 'Select a lesson to begin'}
                            </h1>
                        </div>
                        <div className="flex items-center gap-2.5 rounded-full bg-white border border-gray-200 shadow-sm px-4 py-2 shrink-0">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-[#FF6A00] opacity-60 animate-ping" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FF6A00]" />
                            </span>
                            <span className="text-[13px] font-bold text-gray-900 tabular-nums">{progress}%</span>
                            <span className="text-[12px] text-gray-400 font-medium">complete</span>
                        </div>
                    </div>

                    {/* LEFT = curriculum, RIGHT = video. On mobile the video stacks
                        first (order-1) so the player is the focus. */}
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,1fr)_2fr] gap-6 items-start">
                        {/* ---- LEFT: Course curriculum ---- */}
                        <div className="order-2 lg:order-1 lg:sticky lg:top-[88px]">
                            <PlayerSidebar
                                course={course}
                                currentLessonId={lesson?.id}
                                completedIds={completedIds}
                                lockedIds={lockedIds}
                                progress={progress}
                                completedCount={completed_lesson_count}
                            />
                        </div>

                        {/* ---- RIGHT: Video / lesson + actions + tabs ---- */}
                        <div className="order-1 lg:order-2 space-y-5">
                            <div className="relative rounded-2xl overflow-hidden bg-black ring-1 ring-black/5 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.45)]">
                                <PlayerLesson
                                    lesson={lesson}
                                    course={course}
                                    locked={gatingOn && isCurrentLocked}
                                    lockedMessage={lockedMessage}
                                    onLessonEnded={onMarkComplete}
                                    onTimeUpdate={handleTimeUpdate}
                                />
                                <button
                                    type="button"
                                    onClick={onFullscreen}
                                    className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-black/55 text-white backdrop-blur-sm hover:bg-[#FF6A00] transition-colors"
                                    title="Fullscreen"
                                    aria-label="Fullscreen"
                                >
                                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M8.08917 11.9108C8.415 12.2367 8.415 12.7633 8.08917 13.0892L2.845 18.3333H6.66667C7.1275 18.3333 7.5 18.7067 7.5 19.1667C7.5 19.6267 7.1275 20 6.66667 20H2.5C1.12167 20 0 18.8783 0 17.5V13.3333C0 12.8733 0.3725 12.5 0.833333 12.5C1.29417 12.5 1.66667 12.8733 1.66667 13.3333V17.155L6.91083 11.9108C7.23667 11.585 7.76333 11.585 8.08917 11.9108ZM17.5 0H13.3333C12.8725 0 12.5 0.373333 12.5 0.833333C12.5 1.29333 12.8725 1.66667 13.3333 1.66667H17.155L11.9108 6.91083C11.585 7.23667 11.585 7.76333 11.9108 8.08917C12.0733 8.25167 12.2867 8.33333 12.5 8.33333C12.7133 8.33333 12.9267 8.25167 13.0892 8.08917L18.3333 2.845V6.66667C18.3333 7.12667 18.7058 7.5 19.1667 7.5C19.6275 7.5 20 7.12667 20 6.66667V2.5C20 1.12167 18.8783 0 17.5 0Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>

                            {lesson && !isCurrentLocked && (
                                <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => goRelative(-1)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-gray-700 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors"
                                        >
                                            <i className="fa fa-arrow-left" /> Previous
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => goRelative(1)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-gray-700 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors"
                                        >
                                            Next <i className="fa fa-arrow-right" />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onMarkComplete}
                                        disabled={marking || isDone}
                                        className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[14px] font-bold text-white shadow-sm transition-all ${
                                            isDone
                                                ? 'bg-emerald-500 cursor-default'
                                                : 'bg-gradient-to-r from-[#FF6A00] to-[#ff8a3d] hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60'
                                        }`}
                                    >
                                        {isDone
                                            ? <><i className="fa fa-check" />Completed</>
                                            : marking ? 'Saving…' : <><i className="fa fa-circle-check" />Mark as complete</>}
                                    </button>
                                </div>
                            )}

                            <PlayerTabs
                                course={course}
                                lesson={lesson}
                                progress={progress}
                                completedCount={completed_lesson_count}
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

// Skeleton renders while the player payload is in flight. Mirrors the real
// CoursePlayer shell: dark header bar, large video block, action buttons,
// tab strip, and a lesson list on the right. Tones are picked from the
// existing player theme (slate/zinc-ish on a near-black background) so the
// skeleton blends with the real UI when it swaps in. `animate-pulse` is
// Tailwind's built-in 1.5s opacity wave — no extra CSS or libraries.
function PlayerSkeleton() {
    return (
        <div className="player-shell flex flex-col min-h-screen">
            {/* Header bar — matches PlayerHeader's height/spacing */}
            <header className="player-header">
                <div className="player-container">
                    <div className="player-header-row">
                        <div className="h-6 w-28 rounded bg-white/15 animate-pulse" />
                        <div className="h-5 w-1/3 rounded bg-white/10 animate-pulse hidden md:block" />
                        <div className="flex gap-3">
                            <div className="h-9 w-9 rounded bg-white/10 animate-pulse" />
                            <div className="h-9 w-28 rounded bg-white/10 animate-pulse" />
                        </div>
                    </div>
                </div>
            </header>

            <section className="flex-1 py-5">
                <div className="player-container grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Main column: video + actions + tabs */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Video placeholder — 16:9 ratio so it matches the real player area. */}
                        <div className="aspect-video w-full rounded-lg bg-white/10 animate-pulse" />

                        {/* Lesson title line */}
                        <div className="h-6 w-2/3 rounded bg-white/12 animate-pulse" />

                        {/* Prev / Next + Mark complete row */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex gap-2">
                                <div className="h-9 w-24 rounded bg-white/10 animate-pulse" />
                                <div className="h-9 w-24 rounded bg-white/10 animate-pulse" />
                            </div>
                            <div className="h-9 w-40 rounded bg-skin/30 animate-pulse" />
                        </div>

                        {/* Tab strip + body — 3 short lines under the strip */}
                        <div className="space-y-3 pt-2">
                            <div className="flex gap-4 border-b border-white/10 pb-2">
                                {[60, 80, 70, 90].map((w, i) => (
                                    <div key={i} className="h-4 rounded bg-white/12 animate-pulse" style={{ width: w }} />
                                ))}
                            </div>
                            <div className="h-4 w-11/12 rounded bg-white/8 animate-pulse" />
                            <div className="h-4 w-5/6 rounded bg-white/8 animate-pulse" />
                            <div className="h-4 w-4/6 rounded bg-white/8 animate-pulse" />
                        </div>
                    </div>

                    {/* Right column: lesson list (PlayerSidebar) */}
                    <div className="lg:col-span-1">
                        <div className="rounded-lg border border-white/10 p-4 space-y-3">
                            <div className="h-5 w-1/2 rounded bg-white/12 animate-pulse" />
                            <div className="h-3 w-1/3 rounded bg-white/8 animate-pulse" />
                            {/* 6 lesson rows: small dot + title + meta */}
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 pt-2">
                                    <div className="h-6 w-6 rounded-full bg-white/12 animate-pulse" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3.5 rounded bg-white/12 animate-pulse" style={{ width: `${60 + (i * 7) % 30}%` }} />
                                        <div className="h-3 w-1/3 rounded bg-white/8 animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
