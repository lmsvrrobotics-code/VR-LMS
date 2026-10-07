import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { listChallengeSubmissions, markChallengeSubmission } from '../../../api/challenge';

/**
 * Teacher review queue for one CHALLENGE class.
 *
 * Each row is one student's current submission — there is only ever one per
 * student, because a resubmission updates the same row (see migration 27). The
 * teacher opens the link, then approves it or sends it back with feedback.
 *
 * Approving is what marks the class complete for that student; the server owns
 * that rule, so this component only has to report the verdict.
 */

const MAX_SCORE = 100;

const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        hour12: true, timeZone: 'Asia/Kolkata',
    });
};

export default function ChallengeSubmissions({ lesson }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    // Per-row drafts, keyed by submission id, so typing in one row never bleeds
    // into another.
    const [drafts, setDrafts] = useState({});
    const [scores, setScores] = useState({});
    const [busyId, setBusyId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            setData(await listChallengeSubmissions(lesson.id));
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Could not load submissions.');
            setData({ submissions: [] });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [lesson.id]);

    const saveMark = async (row) => {
        // Fall back to the stored score so re-saving only the feedback does not
        // need the teacher to retype a mark they already gave.
        const raw = scores[row.id] ?? (row.score == null ? '' : String(row.score));
        if (String(raw).trim() === '') { toast.error(`Enter a mark out of ${MAX_SCORE}.`); return; }
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0 || value > MAX_SCORE) {
            toast.error(`Enter a whole number between 0 and ${MAX_SCORE}.`);
            return;
        }
        setBusyId(row.id);
        try {
            await markChallengeSubmission(row.id, {
                score: value,
                feedback: (drafts[row.id] ?? row.feedback ?? '').trim(),
            });
            toast.success('Mark saved — the class is now complete for this student.');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Could not save the mark.');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <div className="text-[14px] text-gray">Loading…</div>;

    const rows = data?.submissions || [];
    // "Unmarked" is score == null, NOT status — 0 is a real mark.
    const pending = rows.filter((r) => r.score == null).length;

    return (
        <div>
            <div className="bg-lightgreen/60 border border-softgreen/70 rounded-ol-8 p-3 mb-3">
                {data?.lesson?.session_title && (
                    <p className="text-[12px] text-gray m-0">{data.lesson.session_title}</p>
                )}
                <p className="text-[14px] text-dark m-0">
                    <span className="text-gray">Challenge:</span> <strong>{lesson.title}</strong>
                </p>
                {data?.lesson?.challenge_url && (
                    <a
                        href={data.lesson.challenge_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-skin hover:underline break-all"
                    >
                        {data.lesson.challenge_url}
                    </a>
                )}
                <p className="text-[12px] text-gray m-0 mt-1">
                    {rows.length} submission{rows.length === 1 ? '' : 's'}
                    {pending > 0 && <> · <strong>{pending} awaiting a mark</strong></>}
                </p>
            </div>

            {rows.length === 0 ? (
                <div className="text-center py-6 text-[14px] text-gray">
                    No submissions yet.
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {rows.map((r) => {
                        const marked = r.score != null;
                        return (
                            <li key={r.id} className="border border-border rounded-ol-8 p-3">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                        <p className="text-[14px] font-semibold text-dark m-0 truncate">
                                            {r.student?.name || r.user_id}
                                        </p>
                                        <p className="text-[12px] text-gray m-0">
                                            {r.student?.student_id ? `${r.student.student_id} · ` : ''}
                                            Submitted {fmt(r.submitted_at)}
                                        </p>
                                    </div>
                                    {/* The mark IS the status: a score means marked,
                                        null means awaiting one. 0 is a real mark, so
                                        the check is against null, never falsiness. */}
                                    <span className={`shrink-0 text-[11px] font-bold px-2 py-[3px] rounded-ol-8 ${marked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {marked ? `${r.score} / ${MAX_SCORE}` : 'Awaiting mark'}
                                    </span>
                                </div>

                                {/* The student's link. noopener/noreferrer is required:
                                    this is student-supplied and opened by a teacher. */}
                                <a
                                    href={r.submission_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[13px] text-skin hover:underline break-all"
                                >
                                    {r.submission_url}
                                </a>

                                {r.submission_note && (
                                    <p className="text-[13px] text-gray mt-1 mb-0 whitespace-pre-wrap">
                                        {r.submission_note}
                                    </p>
                                )}

                                <textarea
                                    rows={2}
                                    className="ol-form-control mt-2"
                                    placeholder="Feedback for the student (optional)"
                                    value={drafts[r.id] ?? r.feedback ?? ''}
                                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                                />

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <label className="text-[13px] text-gray" htmlFor={`score-${r.id}`}>
                                        Mark
                                    </label>
                                    <input
                                        id={`score-${r.id}`}
                                        type="number"
                                        min={0}
                                        max={MAX_SCORE}
                                        step={1}
                                        className="ol-form-control w-[88px]"
                                        value={scores[r.id] ?? (r.score == null ? '' : String(r.score))}
                                        onChange={(e) => setScores((v) => ({ ...v, [r.id]: e.target.value }))}
                                        placeholder="0"
                                    />
                                    <span className="text-[13px] text-gray">/ {MAX_SCORE}</span>
                                    <button
                                        type="button"
                                        disabled={busyId === r.id}
                                        className="ol-btn-primary ol-btn-sm disabled:opacity-60"
                                        onClick={() => saveMark(r)}
                                    >
                                        {busyId === r.id ? 'Saving…' : marked ? 'Update mark' : 'Save mark'}
                                    </button>
                                    {r.reviewed_at && (
                                        <span className="text-[12px] text-gray">
                                            Marked {fmt(r.reviewed_at)}
                                        </span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
