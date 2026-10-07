import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { getMyChallengeSubmission, submitChallenge } from '@/api/course/courseApi';

/**
 * A CHALLENGE class: the student does the task on an external site, then comes
 * back and submits a link to their result. A teacher marks it out of 100, and
 * that mark is what the student sees here.
 *
 * Three states, driven entirely by the server's copy of the submission:
 *   no submission  → the form
 *   submitted      → waiting for a mark
 *   marked         → the score, large, plus any feedback
 *
 * Submitting does NOT complete the class — the teacher's mark does. There is no
 * resubmission loop: once the work is in, the form closes and stays closed.
 */

// The MARK is the state: a score means marked, null means awaiting one. The
// check is against null rather than falsiness, because 0 is a real mark.
const isMarkedSub = (sub) => sub != null && sub.score != null;

const ADMIN_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

// An uploaded file is stored as a relative `uploads/...` key when no public R2
// domain is configured, so it needs the API origin prefixed. An absolute URL
// (R2, YouTube, anything the admin pasted) is left alone.
const resolveUploadUrl = (src) => {
    const v = String(src || '').trim();
    if (!v) return v;
    if (/^(https?:|blob:|data:)/i.test(v)) return v;
    return `${ADMIN_BASE.replace(/\/+$/, '')}/${v.replace(/^\/+/, '')}`;
};

const isYouTube = (url) => /youtu/i.test(String(url || ''));

const toYouTubeEmbed = (url) => {
    const u = String(url || '');
    if (u.includes('/embed/')) return u;
    const watch = u.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (watch) return `https://www.youtube.com/embed/${watch[1]}`;
    const short = u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (short) return `https://www.youtube.com/embed/${short[1]}`;
    return u;
};

/**
 * The "Expected output" the admin attached — what finished work looks like.
 *
 * `attachment_type` says how to render it ('image' | 'video' | 'url'), set when
 * the challenge was saved. Sniffing the extension instead would get a YouTube
 * link wrong, since it has none.
 */
const ExpectedOutput = ({ lesson }) => {
    const src = lesson.attachment;
    if (!src) return null;
    const type = lesson.attachment_type;

    if (type === 'video') {
        return (
            <video
                src={resolveUploadUrl(src)}
                controls
                className="w-full rounded-lg border border-gray-200 bg-black"
            />
        );
    }
    if (type === 'url' && isYouTube(src)) {
        return (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-gray-200">
                <iframe
                    src={toYouTubeEmbed(src)}
                    title="Expected output"
                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                />
            </div>
        );
    }
    // Everything else is treated as an image: an uploaded picture, or a pasted
    // link to one. onError hides it rather than leaving a broken-image icon.
    return (
        <img
            src={resolveUploadUrl(src)}
            alt="Expected output"
            className="w-full rounded-lg border border-gray-200"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
    );
};

export default function ChallengePlayer({ lesson }) {
    const [submission, setSubmission] = useState(null);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    // Which briefing tab is open. Instructions first: a student should read
    // what to do before seeing what it should look like.
    const [tab, setTab] = useState('instructions');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setSubmission(await getMyChallengeSubmission(lesson.id));
        } catch {
            // A failed read must not hide the challenge itself — the brief and
            // the external link are the important part and are already here.
            setSubmission(null);
        } finally {
            setLoading(false);
        }
    }, [lesson.id]);

    useEffect(() => { load(); }, [load]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed) { toast.error('Add the link to your work.'); return; }
        setSaving(true);
        try {
            const res = await submitChallenge(lesson.id, {
                submission_url: trimmed,
                submission_note: note.trim(),
            });
            setSubmission(res.submission);
            toast.success(res.message || 'Submitted.');
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Could not submit. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // A mark is NOT a completion. Seeing a score used to fire the player's
    // mark-complete handler, which ticked the class off on the student's
    // behalf — so a challenge completed itself while every other class type
    // waited for the student to press the button. The score and feedback are
    // shown below; the student decides when the class is done.
    const isMarked = isMarkedSub(submission);

    return (
        <div className="bg-white text-dark rounded-xl p-6">
            {/* ---- The brief, as two tabs ---------------------------------
                Instructions (what to do) and Expected output (what done looks
                like) answer different questions, and the output is often a
                large image or a video — stacking both would push the actual
                task button far below the fold.

                The tab strip only appears when there IS something to switch
                between; with instructions alone it would be chrome around a
                single panel. */}
            {(lesson.description || lesson.attachment) && (
                <div className="mb-5">
                    {lesson.description && lesson.attachment && (
                        <div className="mb-4 flex gap-1 border-b border-gray-200" role="tablist">
                            {[
                                ['instructions', 'Instructions'],
                                ['output', 'Expected output'],
                            ].map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === key}
                                    onClick={() => setTab(key)}
                                    className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                                        tab === key
                                            ? 'border-[#FF6A00] text-[#FF6A00]'
                                            : 'border-transparent text-gray hover:text-dark'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* With only one of the two present, show it regardless of
                        which tab the state happens to hold. */}
                    {(tab === 'instructions' || !lesson.attachment) && lesson.description && (
                        <article
                            className="prose-custom"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.description) }}
                        />
                    )}
                    {(tab === 'output' || !lesson.description) && lesson.attachment && (
                        <div>
                            <p className="text-[13px] text-gray mb-2">
                                This is what your finished work should look like.
                            </p>
                            <ExpectedOutput lesson={lesson} />
                        </div>
                    )}
                </div>
            )}

            {/* The external task. rel="noopener noreferrer" is required, not
                cosmetic: without noopener the opened page can reach back
                through window.opener and navigate this tab. */}
            {lesson.lesson_src && (
                <a
                    href={lesson.lesson_src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-hero px-6 py-3 font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-105"
                >
                    Open the challenge
                    <span aria-hidden="true">↗</span>
                </a>
            )}

            <hr className="my-6 border-gray-200" />

            {loading ? (
                <p className="text-[14px] text-gray">Loading your submission…</p>
            ) : (
                <>
                    {submission && (
                        <div
                            className={`mb-4 rounded-lg border px-4 py-3 ${
                                isMarked
                                    ? 'border-emerald-500/30 bg-emerald-50 text-emerald-900'
                                    : 'border-amber-500/30 bg-amber-50 text-amber-900'
                            }`}
                        >
                            {isMarked ? (
                                <>
                                    {/* The mark, given the weight it deserves — this
                                        is what the student came back to see. */}
                                    <p className="text-[13px] font-semibold uppercase tracking-wider m-0 opacity-75">
                                        Your mark
                                    </p>
                                    <p className="text-[32px] font-bold leading-none mt-1 mb-0">
                                        {submission.score}
                                        <span className="text-[18px] font-semibold opacity-60">
                                            {' '}/ {submission.max_score}
                                        </span>
                                    </p>
                                </>
                            ) : (
                                <div className="flex items-start gap-2.5">
                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                                    <div>
                                        <p className="text-[14px] font-bold m-0">Waiting for your mark</p>
                                        <p className="text-[13px] m-0 opacity-90">
                                            Your teacher will mark this and it will show up here.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {submission.feedback && (
                                <div className="mt-3 rounded-lg border-l-2 border-black/15 bg-black/[0.04] p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider m-0 opacity-70">
                                        Teacher feedback
                                    </p>
                                    <p className="text-[13px] mt-1 m-0 whitespace-pre-wrap">
                                        {submission.feedback}
                                    </p>
                                </div>
                            )}

                            <p className="text-[12px] mt-2 m-0 opacity-75 break-all">
                                You sent:{' '}
                                <a
                                    href={submission.submission_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                >
                                    {submission.submission_url}
                                </a>
                            </p>
                        </div>
                    )}

                    {!submission ? (
                        <form onSubmit={handleSubmit}>
                            <h4 className="text-[15px] font-semibold m-0 mb-1">Submit your work</h4>
                            <p className="text-[13px] text-gray mb-3">
                                Paste a link to what you built, then your teacher will mark it.
                            </p>

                            <label className="block text-[13px] font-medium mb-1" htmlFor="challenge-url">
                                Link to your work
                            </label>
                            <input
                                id="challenge-url"
                                type="url"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] mb-3"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://scratch.mit.edu/projects/..."
                                required
                            />

                            <label className="block text-[13px] font-medium mb-1" htmlFor="challenge-note">
                                Notes <span className="font-normal text-gray">(optional)</span>
                            </label>
                            <textarea
                                id="challenge-note"
                                rows={3}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] mb-4"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Anything you want your teacher to know…"
                            />

                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-hero px-8 py-3 font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-105 disabled:opacity-60"
                            >
                                {saving ? 'Submitting…' : 'Submit'}
                            </button>
                        </form>
                    ) : isMarked ? (
                        <p className="text-[14px] text-gray m-0">
                            Nice work — use <strong>Mark as complete</strong> below when you are
                            ready to tick this class off.
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );
}
