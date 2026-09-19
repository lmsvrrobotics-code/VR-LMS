import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlayer, completeLesson, updateLessonProgress } from '@/api/course/courseApi';
import PlayerLesson from '@/components/course/player/PlayerLesson';

// Plays one class in a dialog over the curriculum, instead of routing away to
// the full player page. Progress reporting mirrors CoursePlayer exactly (5s
// ticks, 5s buckets, playback-time OR time-on-lesson) so a class watched here
// counts the same as one watched there — the server is the single source of
// truth for completion either way.
//
// The lesson payload comes from /api/public/player, which is what resolves
// signed video URLs, attachments and the lock state. The curriculum's own
// lesson rows do not carry a playable source, so this fetches on open.
export default function LessonModal({ slug, lessonId, onClose, onProgress }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const dialogRef = useRef(null);

    // Load the lesson whenever the modal opens on a different class.
    useEffect(() => {
        if (!lessonId) return undefined;
        let alive = true;
        setLoading(true);
        setError(null);
        getPlayer(slug, lessonId)
            .then((r) => { if (alive) setData(r); })
            .catch((e) => {
                console.warn('[lesson-modal] load failed:', e);
                if (alive) setError('This class could not be loaded.');
            })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [slug, lessonId]);

    // Esc closes, and focus moves into the dialog so keyboard users are not
    // left behind on the page underneath.
    useEffect(() => {
        if (!lessonId) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        dialogRef.current?.focus();
        // Lock body scroll so the page behind does not move while the modal is
        // open; restore whatever was there before rather than assuming ''.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [lessonId, onClose]);

    const lesson = data?.lesson || null;
    const course = data?.course || null;
    const lockedIds = data?.locked_lesson_ids || [];
    const isLocked = lesson ? lockedIds.includes(lesson.id) : false;
    const completedIds = data?.history?.completed_lesson || [];
    const isCompleted = lesson ? completedIds.includes(lesson.id) : false;

    // Latest playback second reported by the <video>; for non-video lessons we
    // fall back to wall-clock time on the lesson.
    const playbackTimeRef = useRef(0);
    const openedAtRef = useRef(Date.now());
    const handleTimeUpdate = useCallback((t) => {
        playbackTimeRef.current = Number(t) || 0;
    }, []);

    const refresh = useCallback(async () => {
        try {
            const fresh = await getPlayer(slug, lessonId);
            setData(fresh);
            onProgress?.();
        } catch (e) {
            console.warn('[lesson-modal] refresh failed:', e);
        }
    }, [slug, lessonId, onProgress]);

    const onLessonEnded = useCallback(async () => {
        if (!course || !lesson) return;
        try {
            await completeLesson(course.id, lesson.id);
            await refresh();
        } catch (e) {
            console.warn('[lesson-modal] complete failed:', e);
        }
    }, [course, lesson, refresh]);

    // Stamp "last opened" as soon as the class is open. This is deliberately
    // SEPARATE from the progress ticker below, which skips quizzes (they
    // complete on submission) and locked classes (they must not auto-complete)
    // — but opening either is still an "open" the curriculum card should show.
    // Sending 0 advances no high-water mark; it only touches updated_at.
    useEffect(() => {
        if (!lesson || !course) return;
        updateLessonProgress(course.id, lesson.id, 0).catch((e) => {
            console.warn('[lesson-modal] open stamp failed:', e);
        });
    }, [lesson?.id, course?.id]);

    // Progress ticks. Same cadence and bucketing as the full player so the two
    // surfaces cannot disagree about how much of a class was watched.
    useEffect(() => {
        if (!lesson || !course) return undefined;
        // Quizzes complete on submission, not on elapsed time.
        if (lesson.lesson_type === 'quiz') return undefined;
        // A locked class must never auto-complete just by being open.
        if (isLocked) return undefined;

        playbackTimeRef.current = 0;
        openedAtRef.current = Date.now();

        let lastReported = -1;
        let stopped = false;

        const TICK_MS = 5000;
        const BUCKET = 5;
        const interval = setInterval(async () => {
            if (stopped) return;
            const wallElapsed = Math.floor((Date.now() - openedAtRef.current) / 1000);
            const playbackElapsed = Math.floor(playbackTimeRef.current);
            const current = Math.max(playbackElapsed, wallElapsed);
            const tick = Math.floor(current / BUCKET) * BUCKET;
            if (tick <= 0 || tick === lastReported) return;
            lastReported = tick;

            try {
                const result = await updateLessonProgress(course.id, lesson.id, tick);
                if (result?.is_completed === 1 && !completedIds.includes(lesson.id)) {
                    if (!stopped) await refresh();
                }
            } catch (e) {
                console.warn('[lesson-modal] progress update failed:', e);
            }
        }, TICK_MS);

        return () => { stopped = true; clearInterval(interval); };
        // completedIds is intentionally not a dep: it changes on every refresh
        // and would restart the ticker mid-lesson.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lesson?.id, course?.id, isLocked, refresh]);

    if (!lessonId) return null;

    return (
        <div
            className="lesson-modal-backdrop"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="lesson-modal"
                role="dialog"
                aria-modal="true"
                aria-label={lesson?.title || 'Class'}
                tabIndex={-1}
                ref={dialogRef}
                // Clicks inside must not reach the backdrop's close handler.
                onClick={(e) => e.stopPropagation()}
            >
                <div className="lesson-modal-head">
                    <div className="lesson-modal-titles">
                        <h3>{lesson?.title || (loading ? 'Loading…' : 'Class')}</h3>
                        {isCompleted && <span className="lesson-modal-done">Completed</span>}
                    </div>
                    <button
                        type="button"
                        className="lesson-modal-close"
                        onClick={onClose}
                        aria-label="Close class"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="lesson-modal-body">
                    {loading ? (
                        <div className="curriculum-loading">
                            <span className="dots" aria-hidden="true"><span /><span /><span /></span>
                            <p className="loading-label">Loading class…</p>
                        </div>
                    ) : error ? (
                        <p className="curriculum-empty">{error}</p>
                    ) : (
                        <PlayerLesson
                            lesson={lesson}
                            course={course}
                            locked={isLocked}
                            lockedMessage={data?.locked_message}
                            onLessonEnded={onLessonEnded}
                            onTimeUpdate={handleTimeUpdate}
                            resumeAt={data?.resume_at || 0}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
