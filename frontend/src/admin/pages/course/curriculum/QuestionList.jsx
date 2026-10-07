import { useEffect, useState } from 'react';
import { FaPen, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { getQuiz, deleteQuestion } from '../../../api/quiz';
import QuestionForm from './QuestionForm';

const summary = (q) => {
    if (q.type === 'mcq') return 'Multiple choice';
    if (q.type === 'fill_blanks') return 'Fill in the blanks';
    if (q.type === 'true_false') return 'True / False';
    return q.type;
};

export default function QuestionList({ quizId, onClose }) {
    const [quiz, setQuiz] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);

    const load = async () => {
        const r = await getQuiz(quizId);
        setQuiz(r.quiz);
        setQuestions(r.questions || []);
    };
    useEffect(() => { load(); }, [quizId]);

    const handleDelete = async (id) => {
        try { await deleteQuestion(id); toast.success('Question has been deleted.'); setConfirm(null); load(); }
        catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    };

    if (!quiz) return <div className="text-[14px] text-gray">Loading…</div>;

    return (
        <div>
            <div className="bg-lightgreen/60 border border-softgreen/70 rounded-ol-8 p-3 mb-3 flex items-center justify-between">
                <p className="text-[14px] text-dark m-0"><span className="text-gray">Quiz:</span> <strong>{quiz.title}</strong></p>
                <button type="button" className="ol-btn-primary ol-btn-sm" onClick={() => setModal({ type: 'add' })}>+ Add question</button>
            </div>
            {questions.length === 0 ? (
                <div className="text-center py-6 text-[14px] text-gray">No questions yet.</div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {questions.map((q, i) => (
                        <li key={q.id} className="border border-border rounded-ol-8 p-3 flex items-start justify-between gap-3">
                            <div className="flex-1">
                                <p className="text-[14px] text-dark m-0"><strong>Q{i + 1}.</strong> {q.title}</p>
                                <span className="text-[12px] text-gray">{summary(q)}</span>
                                {/* Media is easy to forget once it's uploaded —
                                    flag it so the list shows what students see. */}
                                {(q.image || q.video) && (
                                    <span className="text-[12px] text-skin ml-2">
                                        {q.image && <span className="mr-2">🖼 Image</span>}
                                        {q.video && <span>🎬 Video</span>}
                                    </span>
                                )}
                            </div>
                            {/* Icons come from react-icons, NOT the `fi-rr-*`
                                Flaticon classes this list used to render. That
                                webfont is not loaded anywhere in the project (no
                                @font-face, no stylesheet, no package), so each
                                icon was an empty zero-width span: the Edit and
                                Delete buttons were present and clickable but
                                completely invisible. Matches the Edit/Delete
                                controls on the curriculum rows. */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    title="Edit question"
                                    aria-label={`Edit question ${i + 1}`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-ol-8 text-gray-400 hover:text-gray-600 hover:bg-lightgreen/50 transition-colors"
                                    onClick={() => setModal({ type: 'edit', question: q })}
                                ><FaPen className="text-[12px]" /></button>
                                <button
                                    type="button"
                                    title="Delete question"
                                    aria-label={`Delete question ${i + 1}`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-ol-8 text-gray-400 hover:text-danger hover:bg-lightgreen/50 transition-colors"
                                    onClick={() => setConfirm({ id: q.id, label: q.title })}
                                ><FaTrash className="text-[12px]" /></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {modal?.type === 'add' && (
                <Modal title="Add question" onClose={() => setModal(null)} size="lg">
                    <QuestionForm quizId={quizId} onDone={() => { toast.success('Question has been added.'); setModal(null); load(); }} />
                </Modal>
            )}
            {modal?.type === 'edit' && (
                <Modal title="Edit question" onClose={() => setModal(null)} size="lg">
                    <QuestionForm quizId={quizId} question={modal.question} onDone={() => { toast.success('Question has been updated.'); setModal(null); load(); }} />
                </Modal>
            )}
            {confirm && (
                <ConfirmDialog
                    title="Delete question"
                    message={`Are you sure you want to delete this question?`}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm.id)}
                />
            )}
        </div>
    );
}
