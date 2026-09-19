import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FaPen, FaTrash, FaChevronDown, FaChevronRight, FaSort } from 'react-icons/fa';
import Modal from '../../../components/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { listCurriculum, storeSection, updateSection, deleteSection, deleteLesson } from '../../../api/curriculum';
import SessionForm from '../curriculum/SessionForm';
import LessonTypePicker from '../curriculum/LessonTypePicker';
import LessonAddForm from '../curriculum/LessonAddForm';
import LessonEditForm from '../curriculum/LessonEditForm';
import SectionSort from '../curriculum/SectionSort';
import LessonSort from '../curriculum/LessonSort';
import QuizForm from '../curriculum/QuizForm';
import QuestionList from '../curriculum/QuestionList';

export default function CurriculumTab({ course }) {
    const [sections, setSections] = useState([]);
    const [expanded, setExpanded] = useState(new Set());
    const [modal, setModal] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [savingSession, setSavingSession] = useState(false);

    const load = async () => {
        const r = await listCurriculum(course.id);
        setSections(r.sections);
    };
    useEffect(() => { load(); }, [course.id]);

    const toggle = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const closeModal = () => setModal(null);
    const afterChange = () => { closeModal(); load(); };

    // A session posts multipart because of its cover image. The API keys stay
    // `section*` — only the UI wording changed.
    const sessionFormData = (data) => {
        const fd = new FormData();
        fd.append('title', data.title);
        fd.append('description', data.description || '');
        if (data.image) fd.append('image', data.image);
        return fd;
    };

    const handleAddSession = async (data) => {
        setSavingSession(true);
        try {
            const fd = sessionFormData(data);
            fd.append('course_id', course.id);
            await storeSection(fd);
            toast.success('Session added successfully');
            afterChange();
        } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
        finally { setSavingSession(false); }
    };

    const handleUpdateSession = async (data) => {
        setSavingSession(true);
        try {
            const fd = sessionFormData(data);
            fd.append('section_id', modal.session.id);
            if (data.removeImage) fd.append('remove_image', '1');
            await updateSection(fd);
            toast.success('Updated successfully');
            afterChange();
        } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
        finally { setSavingSession(false); }
    };

    const handleDeleteSession = async (id) => {
        try { await deleteSection(id); toast.success('Delete successfully'); setConfirm(null); load(); }
        catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    };

    const handleDeleteLesson = async (id) => {
        try { await deleteLesson(id); toast.success('Deleted successfully'); setConfirm(null); load(); }
        catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    };

    return (
        <div className="w-full">
            <div className="flex items-center mb-3 flex-wrap gap-2">
                <button className="ol-btn-light ol-btn-sm" onClick={() => setModal({ type: 'add-session' })}>Add session</button>
                {sections.length > 0 && (
                    <>
                        {/* One entry point for both class kinds — the picker's
                            first step routes to content vs quiz. */}
                        <button className="ol-btn-light ol-btn-sm" onClick={() => setModal({ type: 'lesson-type-picker' })}>Add class</button>
                        <button className="ol-btn-light ol-btn-sm" onClick={() => setModal({ type: 'sort-sections' })}>Sort Sessions</button>
                    </>
                )}
            </div>

            <ul className="flex flex-col gap-2">
                {sections.length === 0 ? (
                    <li>
                        <button
                            type="button"
                            className="w-full md:w-2/3 mt-4 border-2 border-dashed border-border rounded-ol-12 p-10 text-center hover:border-skin hover:text-skin transition-colors"
                            onClick={() => setModal({ type: 'add-session' })}
                        >
                            <p className="text-[24px] text-gray mb-2">+</p>
                            <h3 className="text-[15px] font-medium text-dark">Add a new Session</h3>
                        </button>
                    </li>
                ) : sections.map((s, i) => (
                    // `group/section` lets the inline controls react to the
                    // ROW's hover (not just their own). The Sort Lessons / Edit
                    // / Delete buttons fade in only when the section is hovered;
                    // the expand chevron stays visible so users can always see
                    // and toggle the open/closed state.
                    <li key={s.id} className="ol-card border border-ebordermuted group/section">
                        <div className="flex items-center justify-between px-4 py-3">
                            <button type="button" className="flex items-center gap-3 flex-grow text-left min-w-0" onClick={() => toggle(s.id)}>
                                {s.image && (
                                    <img
                                        src={s.image}
                                        alt=""
                                        className="h-10 w-16 shrink-0 object-cover rounded-ol-8 border border-ebordermuted"
                                    />
                                )}
                                <span className="min-w-0">
                                    <h4 className="text-[15px] font-semibold text-dark m-0 truncate">{i + 1}. {s.title}</h4>
                                    {s.description && (
                                        <span className="block text-[12px] text-gray truncate">{s.description}</span>
                                    )}
                                </span>
                            </button>
                            <div className="flex items-center gap-2">
                                {s.lessons.length > 0 && (
                                    <button
                                        type="button"
                                        className="ol-btn-outline-secondary ol-btn-sm inline-flex items-center gap-1.5 opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 transition-opacity"
                                        onClick={(e) => { e.stopPropagation(); setModal({ type: 'sort-lessons', section: s }); }}
                                    >
                                        <FaSort className="text-[11px] text-gray-400" />
                                        <span>Sort Classes</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    title="Edit session"
                                    aria-label={`Edit session ${s.title}`}
                                    className="text-gray-400 hover:text-gray-600 px-2 opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); setModal({ type: 'edit-session', session: s }); }}
                                ><FaPen className="text-[13px]" /></button>
                                <button
                                    type="button"
                                    title="Delete session"
                                    aria-label={`Delete session ${s.title}`}
                                    className="text-gray-400 hover:text-gray-600 px-2 opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); setConfirm({ kind: 'session', id: s.id, label: s.title }); }}
                                ><FaTrash className="text-[13px]" /></button>
                                {/* Chevron stays visible at rest — it's also a
                                    state indicator (down = open, right = closed). */}
                                <button
                                    type="button"
                                    title={expanded.has(s.id) ? 'Collapse' : 'Expand'}
                                    aria-label={expanded.has(s.id) ? `Collapse ${s.title}` : `Expand ${s.title}`}
                                    aria-expanded={expanded.has(s.id)}
                                    className="text-gray-400 hover:text-gray-600 px-2 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); toggle(s.id); }}
                                >
                                    {expanded.has(s.id)
                                        ? <FaChevronDown className="text-[12px]" />
                                        : <FaChevronRight className="text-[12px]" />}
                                </button>
                            </div>
                        </div>
                        {expanded.has(s.id) && (
                            <ul className="border-t border-ebordermuted">
                                {s.lessons.length === 0 ? (
                                    <li className="px-4 py-3 text-[14px] text-gray">No classes are available.</li>
                                ) : s.lessons.map((l) => (
                                    // `group/lesson` scopes hover to THIS row only.
                                    // Edit / Delete (and the quiz "Questions" pill)
                                    // fade in when the lesson row is hovered.
                                    <li key={l.id} className="flex items-center justify-between px-4 py-3 border-b border-ebordermuted last:border-b-0 group/lesson">
                                        <h4 className="text-[14px] font-medium text-dark m-0 flex items-center gap-2">
                                            {l.lesson_type === 'quiz' && <span className="text-[11px] uppercase bg-lightgreen/60 text-skin px-2 py-[2px] rounded-ol-8">Quiz</span>}
                                            {l.title}
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            {l.lesson_type === 'quiz' ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        title="Manage questions"
                                                        className="ol-btn-outline-secondary ol-btn-sm opacity-0 group-hover/lesson:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                        onClick={() => setModal({ type: 'questions', quizId: l.id })}
                                                    >Questions</button>
                                                    <button
                                                        type="button"
                                                        title="Edit quiz"
                                                        aria-label={`Edit ${l.title}`}
                                                        className="text-gray-400 hover:text-gray-600 px-2 opacity-0 group-hover/lesson:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                        onClick={() => setModal({ type: 'edit-quiz', quizId: l.id })}
                                                    ><FaPen className="text-[12px]" /></button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    title="Edit class"
                                                    aria-label={`Edit ${l.title}`}
                                                    className="text-gray-400 hover:text-gray-600 px-2 opacity-0 group-hover/lesson:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                    onClick={() => setModal({ type: 'edit-lesson', lesson: l })}
                                                ><FaPen className="text-[12px]" /></button>
                                            )}
                                            <button
                                                type="button"
                                                title="Delete class"
                                                aria-label={`Delete ${l.title}`}
                                                className="text-gray-400 hover:text-gray-600 px-2 opacity-0 group-hover/lesson:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                onClick={() => setConfirm({ kind: 'lesson', id: l.id, label: l.title })}
                                            ><FaTrash className="text-[12px]" /></button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>

            {modal?.type === 'add-session' && (
                <Modal title="Add new session" onClose={closeModal} size="lg">
                    <SessionForm onSubmit={handleAddSession} submitLabel="Submit" saving={savingSession} />
                </Modal>
            )}
            {modal?.type === 'edit-session' && (
                <Modal title="Edit session" onClose={closeModal} size="lg">
                    <SessionForm session={modal.session} onSubmit={handleUpdateSession} submitLabel="Update" saving={savingSession} />
                </Modal>
            )}
            {modal?.type === 'lesson-type-picker' && (
                <Modal title="Add new class" onClose={closeModal}>
                    <LessonTypePicker
                        course={course}
                        onNext={(lesson_type) => setModal({ type: 'add-lesson', lesson_type })}
                        onNextQuiz={() => setModal({ type: 'add-quiz' })}
                    />
                </Modal>
            )}
            {modal?.type === 'add-lesson' && (
                <Modal title="Add new class" onClose={closeModal} size="lg">
                    <LessonAddForm
                        course={course}
                        sections={sections}
                        lessonType={modal.lesson_type}
                        onDone={() => { toast.success('Class added successfully'); afterChange(); }}
                    />
                </Modal>
            )}
            {modal?.type === 'edit-lesson' && (
                <Modal title="Edit class" onClose={closeModal} size="lg">
                    <LessonEditForm
                        lessonId={modal.lesson.id}
                        sections={sections}
                        onDone={() => { toast.success('Class updated successfully'); afterChange(); }}
                    />
                </Modal>
            )}
            {modal?.type === 'add-quiz' && (
                <Modal title="Add new quiz" onClose={closeModal} size="lg">
                    <QuizForm course={course} sections={sections} onDone={() => { toast.success('Quiz has been created.'); afterChange(); }} />
                </Modal>
            )}
            {modal?.type === 'edit-quiz' && (
                <Modal title="Edit quiz" onClose={closeModal} size="lg">
                    <QuizForm course={course} sections={sections} quizId={modal.quizId} onDone={() => { toast.success('Quiz has been updated.'); afterChange(); }} />
                </Modal>
            )}
            {modal?.type === 'questions' && (
                <Modal title="Quiz questions" onClose={closeModal} size="xl">
                    <QuestionList quizId={modal.quizId} onClose={closeModal} />
                </Modal>
            )}
            {modal?.type === 'sort-sections' && (
                <Modal title="Sort sessions" onClose={closeModal}>
                    <SectionSort
                        sections={sections}
                        onDone={() => { toast.success('Sessions sorted successfully'); afterChange(); }}
                        onClose={closeModal}
                    />
                </Modal>
            )}
            {modal?.type === 'sort-lessons' && (
                <Modal title="Sort classes" onClose={closeModal}>
                    <LessonSort
                        section={modal.section}
                        onDone={() => { toast.success('Classes sorted successfully'); afterChange(); }}
                        onClose={closeModal}
                    />
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    title={`Delete ${confirm.kind}`}
                    message={`Are you sure you want to delete ${confirm.label}?`}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => confirm.kind === 'session' ? handleDeleteSession(confirm.id) : handleDeleteLesson(confirm.id)}
                />
            )}
        </div>
    );
}
