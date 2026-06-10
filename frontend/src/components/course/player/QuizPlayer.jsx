import { useEffect, useMemo, useRef, useState } from 'react';
import { safeObj } from '@/components/course/format';
import { submitQuizAttempt } from '@/api/course/courseApi';

// "H:M:S" (or "HH:MM:SS") admin-set duration → total seconds. Defaults to 0
// when malformed so the timer simply doesn't start (UI hides it).
const parseDurationSeconds = (raw) => {
    if (!raw) return 0;
    const parts = String(raw).split(':').map((x) => Number(x) || 0);
    while (parts.length < 3) parts.unshift(0);
    const [h, m, s] = parts;
    return Math.max(0, h * 3600 + m * 60 + s);
};

// seconds → "HH:MM:SS" for the timer display.
const fmtClock = (secs) => {
    const s = Math.max(0, Math.floor(secs));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(r)}`;
};

export default function QuizPlayer({ lesson, onCompleted }) {
    // Primary source: questions the admin authored, served by the player API
    // (PublicCourseService normalises them to { q, type, options, answer }).
    // Fallback: legacy quizzes that embedded questions in attachment JSON.
    const questions = useMemo(() => {
        if (Array.isArray(lesson.questions)) return lesson.questions;
        const data = safeObj(lesson.attachment);
        return Array.isArray(data.questions) ? data.questions : [];
    }, [lesson.questions, lesson.attachment]);

    // The student gets the first attempt plus exactly one retry.
    const MAX_ATTEMPTS = 2;
    // Server-persisted prior attempts for this student+quiz, so re-entering the
    // page restores the last score and remaining-retry state.
    const priorState = lesson.quiz_state || { attempts_used: 0, last_score: null, last_total: null };

    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    // attempt = which attempt the student is currently on (1-based). Start
    // after however many they've already used.
    const [attempt, setAttempt] = useState((priorState.attempts_used || 0) + 1);
    // When they have a saved attempt and aren't actively retaking, show the
    // persisted result panel instead of a fresh quiz.
    const [showPrior, setShowPrior] = useState((priorState.attempts_used || 0) > 0);
    const [saving, setSaving] = useState(false);

    // Cover/intro screen gate: students see the admin-set metadata + a Start
    // Quiz button first, only entering the questions view after they click.
    const [started, setStarted] = useState(false);
    // Countdown driven by the admin-configured duration. Starts when the
    // student clicks Start Quiz; auto-submits when it hits zero.
    const totalSeconds = useMemo(() => parseDurationSeconds(lesson.duration), [lesson.duration]);
    const [timeLeft, setTimeLeft] = useState(totalSeconds);
    // Keep a ref to handleSubmit so the timer effect can call the latest
    // closure without re-binding on every state change.
    const submitRef = useRef(() => {});

    if (questions.length === 0) {
        return (
            <div className="bg-white text-dark p-10 sm:p-14 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mb-4">
                    <i className="fa fa-clipboard-question text-[26px]" />
                </div>
                <h3 className="text-[18px] font-bold text-gray-900 mb-1">{lesson.title || 'Quiz'}</h3>
                <p className="text-[14px] text-gray-500 max-w-md">
                    This quiz doesn’t have any questions yet. Once your instructor adds questions,
                    they’ll appear here. You can continue with the next lesson in the meantime.
                </p>
            </div>
        );
    }

    // fill_blanks answer is the typed text; mcq/true_false answer is an option
    // index. Score with the matching rule per type.
    const isCorrect = (q, picked) => {
        if (picked === undefined) return false;
        if (q.type === 'fill_blanks') {
            const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
            return accepted.includes(String(picked).trim().toLowerCase());
        }
        return picked === q.answer;
    };

    const score = submitted
        ? questions.reduce((s, q, i) => s + (isCorrect(q, answers[i]) ? 1 : 0), 0)
        : 0;

    // Pass threshold: 50% of total questions (rounded up — e.g. 3 questions
    // needs 2 correct).
    const passMark = Math.ceil(questions.length * 0.5);
    const passed = submitted && score >= passMark;
    const percent = Math.round((score / questions.length) * 100);
    const canRetry = submitted && attempt < MAX_ATTEMPTS;

    // Persist this attempt, then show its result. Score/total are saved so a
    // later page load can restore exactly this state. We also call onCompleted
    // so the curriculum sidebar marks this quiz lesson with a tick — the same
    // path the video player uses on lesson-ended. Guarded so a manual click
    // and a timer-driven auto-submit can't fire two POSTs.
    const handleSubmit = async () => {
        if (submitted || saving) return;
        setSubmitted(true);
        const s = questions.reduce((acc, q, i) => acc + (isCorrect(q, answers[i]) ? 1 : 0), 0);
        setSaving(true);
        try {
            await submitQuizAttempt(lesson.id, s, questions.length);
        } catch {
            /* non-fatal: result still shows for this session */
        } finally {
            setSaving(false);
        }
        // Best-effort tick. The parent handles network errors itself; we don't
        // gate the result UI on this.
        try { onCompleted?.(); } catch { /* ignore */ }
    };

    const reset = () => {
        setAnswers({});
        setSubmitted(false);
        setShowPrior(false);
        setStarted(false);
        setTimeLeft(totalSeconds);
        setAttempt((a) => a + 1);
    };

    // Keep submitRef pointed at the latest handleSubmit closure so the timer
    // effect (which closes over a snapshot) calls the up-to-date one.
    useEffect(() => { submitRef.current = handleSubmit; });

    // Countdown timer: starts when the student clicks Start Quiz; ticks every
    // second; auto-submits when time runs out. Pauses when submitted or when
    // the cover screen is showing.
    useEffect(() => {
        if (!started || submitted || totalSeconds <= 0) return;
        if (timeLeft <= 0) {
            submitRef.current?.();
            return;
        }
        const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [started, submitted, timeLeft, totalSeconds]);

    // Returning to the lesson after a saved attempt: show only the last score
    // and a Try again button (no questions re-rendered).
    if (showPrior) {
        const lastScore = Number(priorState.last_score ?? 0);
        const lastTotal = Number(priorState.last_total ?? questions.length) || questions.length;
        const priorCanRetry = (priorState.attempts_used || 0) < MAX_ATTEMPTS;
        const passedPrior = lastScore >= Math.ceil(lastTotal * 0.5);
        return (
            <div className="bg-white text-dark p-10 flex flex-col items-center text-center">
                <h3 className="text-[22px] font-semibold mb-6 text-gray-900">{lesson.title}</h3>

                {/* Score circle */}
                <div
                    className={`w-28 h-28 rounded-full flex flex-col items-center justify-center mb-4 ${
                        passedPrior
                            ? 'bg-skin/10 text-skin border-4 border-skin/30'
                            : 'bg-red-50 text-red-600 border-4 border-red-200'
                    }`}
                >
                    <span className="text-[28px] font-bold leading-none">{lastScore}</span>
                    <span className="text-[12px] opacity-70 mt-1">out of {lastTotal}</span>
                </div>

                <p className="text-[15px] text-gray-600 mb-6">
                    {passedPrior ? 'Great work — you passed this quiz.' : 'Keep going — give it another shot.'}
                </p>

                {priorCanRetry ? (
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-skin text-white font-semibold text-[14px] shadow-sm hover:bg-skin/90 transition-colors"
                    >
                        <i className="fa fa-rotate-right" />
                        Try again
                    </button>
                ) : (
                    <p className="text-sm text-gray-500">
                        No attempts remaining — this was your final attempt.
                    </p>
                )}
            </div>
        );
    }

    // Quiz cover/intro screen — shown before the student clicks Start Quiz.
    // Surfaces the admin-set metadata so they know what they're walking into.
    if (!started) {
        const durSecs = totalSeconds;
        const h = Math.floor(durSecs / 3600);
        const m = Math.floor((durSecs % 3600) / 60);
        const sLeft = durSecs % 60;
        const durationText = `${h} Hour ${m} Minute ${String(sLeft).padStart(2, '0')} Second`;
        const totalMark = lesson.total_mark ?? questions.length;
        const passMarkAdmin = lesson.pass_mark ?? Math.ceil(questions.length * 0.5);
        const retake = lesson.retake ?? (MAX_ATTEMPTS - 1);
        const qTypeLabel = (() => {
            const types = new Set(questions.map((q) => q.type));
            if (types.size === 1) return [...types][0].replace('_', ' ');
            return 'Mixed';
        })();
        return (
            <div className="bg-white rounded-xl p-8">
                <h3 className="text-[22px] font-bold text-center text-gray-900 pb-4 border-b border-gray-200 mb-6">
                    {lesson.title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-12 max-w-2xl mx-auto text-[15px] text-gray-700">
                    <div className="flex"><span className="font-semibold w-32">Duration</span><span>: {durationText}</span></div>
                    <div className="flex"><span className="font-semibold w-32">Question Type</span><span>: {qTypeLabel}</span></div>
                    <div className="flex"><span className="font-semibold w-32">Total Marks</span><span>: {totalMark}</span></div>
                    <div className="flex"><span className="font-semibold w-32">Attempts</span><span>: {String(priorState.attempts_used || 0).padStart(2, '0')}</span></div>
                    <div className="flex"><span className="font-semibold w-32">Pass Marks</span><span>: {passMarkAdmin}</span></div>
                    <div className="flex"><span className="font-semibold w-32">Total Question</span><span>: {String(questions.length).padStart(2, '0')}</span></div>
                    <div className="flex"><span className="font-semibold w-32">Retake</span><span>: {String(retake).padStart(2, '0')}</span></div>
                </div>
                <div className="flex justify-center mt-8">
                    <button
                        type="button"
                        onClick={() => { setTimeLeft(totalSeconds); setStarted(true); }}
                        className="px-8 py-3 rounded-lg bg-skin text-white font-semibold shadow hover:bg-skin/90 transition-colors"
                    >
                        Start Quiz
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white text-dark p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[20px] font-semibold">{lesson.title}</h3>
                {totalSeconds > 0 && !submitted && (
                    <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[14px] font-semibold tabular-nums ${
                            timeLeft <= 30 ? 'bg-red-50 text-red-600' : 'bg-skin/10 text-skin'
                        }`}
                        title="Time remaining"
                    >
                        <i className="fa fa-clock" />
                        {fmtClock(timeLeft)}
                    </span>
                )}
            </div>
            <ol className="space-y-5 list-decimal pl-5">
                {questions.map((q, qi) => (
                    <li key={qi}>
                        <p className="font-medium mb-2">{q.q}</p>
                        {q.type === 'fill_blanks' ? (
                            <div>
                                <input
                                    type="text"
                                    value={answers[qi] ?? ''}
                                    disabled={submitted}
                                    onChange={(e) => setAnswers((a) => ({ ...a, [qi]: e.target.value }))}
                                    placeholder="Type your answer"
                                    className={`w-full max-w-md px-3 py-2 rounded border ${
                                        submitted
                                            ? isCorrect(q, answers[qi])
                                                ? 'border-skin bg-lightgreen'
                                                : 'border-danger bg-red-50'
                                            : 'border-border focus:border-skin'
                                    }`}
                                />
                                {submitted && !isCorrect(q, answers[qi]) && (
                                    <p className="text-sm text-danger mt-1">
                                        Expected: {(Array.isArray(q.answer) ? q.answer : [q.answer]).join(' / ')}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {q.options.map((opt, oi) => {
                                    const isPicked = answers[qi] === oi;
                                    const correct = submitted && oi === q.answer;
                                    const wrong = submitted && isPicked && oi !== q.answer;
                                    return (
                                        <label
                                            key={oi}
                                            className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors ${
                                                correct ? 'border-skin bg-lightgreen' :
                                                wrong ? 'border-danger bg-red-50' :
                                                isPicked ? 'border-skin' : 'border-border hover:border-skin'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`q-${qi}`}
                                                checked={isPicked}
                                                disabled={submitted}
                                                onChange={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                                                className="accent-skin"
                                            />
                                            <span>{opt}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </li>
                ))}
            </ol>
            <div className="mt-6 flex items-center gap-3">
                {!submitted ? (
                    <button
                        type="button"
                        className="ol-btn-primary"
                        disabled={saving || questions.some((_, qi) => {
                            const v = answers[qi];
                            return v === undefined || (typeof v === 'string' && v.trim() === '');
                        })}
                        onClick={handleSubmit}
                    >
                        {saving ? 'Submitting…' : 'Submit'}
                    </button>
                ) : (
                    <div className="flex flex-col gap-2">
                        <p className={`text-lg font-bold ${passed ? 'text-skin' : 'text-danger'}`}>
                            {passed ? 'Passed' : 'Failed'}
                        </p>
                        <p className="font-semibold text-dark">
                            Score: {score} / {questions.length} ({percent}%) — Pass mark: {passMark} (50%)
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                            {canRetry ? (
                                <button type="button" className="ol-btn-outline" onClick={reset}>
                                    Try again
                                </button>
                            ) : (
                                <p className="text-sm text-muted">
                                    No attempts remaining — this was your final attempt.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
