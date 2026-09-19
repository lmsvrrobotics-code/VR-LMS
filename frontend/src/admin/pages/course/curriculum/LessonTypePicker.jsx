import { useState } from 'react';

const TYPES = [
    { value: 'youtube', label: 'YouTube Video' },
    { value: 'vimeo', label: 'Vimeo Video' },
    { value: 'video', label: 'Video file' },
    { value: 'html5', label: 'Video url [ .mp4 ]' },
    { value: 'google_drive_video', label: 'Google drive video' },
    { value: 'document', label: 'Document file' },
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image' },
    { value: 'iframe', label: 'Iframe embed' },
    { value: 'scorm', label: 'Scorm Content' },
];

// Two-step picker. Step one asks what KIND of class this is:
//
//   Content — a lesson the student watches/reads; the ten content formats
//             below then apply.
//   Quiz    — a graded quiz, which has no content format at all, so the
//             format grid is hidden and Next hands off to the quiz form.
//
// Both kinds are `lessons` rows server-side; a quiz is just lesson_type 'quiz'.
const KINDS = [
    { value: 'content', label: 'Content', hint: 'Video, document, text or embed' },
    { value: 'quiz', label: 'Quiz', hint: 'Graded questions with a pass mark' },
];

export default function LessonTypePicker({ course, onNext, onNextQuiz }) {
    const [kind, setKind] = useState('content');
    const [selected, setSelected] = useState('youtube');

    const handleNext = () => {
        if (kind === 'quiz') onNextQuiz();
        else onNext(selected);
    };

    return (
        <div>
            <div className="bg-lightgreen/60 border border-softgreen/70 rounded-ol-8 p-3 mb-3">
                <p className="text-[14px] text-dark m-0"><span className="text-gray">Course:</span> <strong>{course.title}</strong></p>
            </div>

            <h6 className="text-[16px] font-semibold text-dark mb-3">Select class type</h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {KINDS.map((k) => (
                    <label
                        key={k.value}
                        className={`flex items-start justify-between gap-2 border rounded-ol-8 px-3 py-[10px] cursor-pointer transition-colors ${kind === k.value ? 'border-skin bg-lightgreen/40' : 'border-border hover:border-skin'}`}
                    >
                        <span>
                            <span className="block text-[14px] text-dark font-medium">{k.label}</span>
                            <span className="block text-[12px] text-gray">{k.hint}</span>
                        </span>
                        <input
                            type="radio"
                            name="lesson_kind"
                            value={k.value}
                            checked={kind === k.value}
                            onChange={(e) => setKind(e.target.value)}
                            className="accent-skin mt-1"
                        />
                    </label>
                ))}
            </div>

            {kind === 'content' && (
                <>
                    <h6 className="text-[16px] font-semibold text-dark mb-3">Select lesson type</h6>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {TYPES.map((t) => (
                            <label
                                key={t.value}
                                className={`flex items-center justify-between gap-2 border rounded-ol-8 px-3 py-[10px] cursor-pointer transition-colors ${selected === t.value ? 'border-skin bg-lightgreen/40' : 'border-border hover:border-skin'}`}
                            >
                                <span className="text-[14px] text-dark">{t.label}</span>
                                <input
                                    type="radio"
                                    name="lesson_type"
                                    value={t.value}
                                    checked={selected === t.value}
                                    onChange={(e) => setSelected(e.target.value)}
                                    className="accent-skin"
                                />
                            </label>
                        ))}
                    </div>
                </>
            )}

            <button type="button" className="ol-btn-primary" onClick={handleNext}>
                Next <span className="fi-rr-angle-small-right ms-1" />
            </button>
        </div>
    );
}
