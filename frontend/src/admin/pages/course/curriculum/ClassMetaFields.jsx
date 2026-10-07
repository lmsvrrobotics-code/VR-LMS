import { useEffect, useState } from 'react';
import RichTextEditor from '../../../components/RichTextEditor';

export const DIFFICULTY_LEVELS = [
    { value: '', label: 'Not specified' },
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
];

// Shared "class" metadata block used by both the add and edit lesson forms:
// image, description and difficulty level. Kept in one component so the two
// forms cannot drift apart.
//
// The parent owns the state (it builds the FormData), so every field is
// controlled from props — except the file input, which cannot be.
export default function ClassMetaFields({
    image, onImageChange,
    existingImage, onRemoveImage,
    description, onDescriptionChange,
    difficulty, onDifficultyChange,
    // A challenge renders this field as the student's Instructions tab, so it
    // gets a clearer label and a hint there. Every other class type keeps the
    // generic wording.
    descriptionLabel = 'Class description',
    descriptionHint = '',
}) {
    const [preview, setPreview] = useState(null);

    useEffect(() => {
        if (!image) { setPreview(null); return undefined; }
        const url = URL.createObjectURL(image);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [image]);

    const shown = preview || existingImage;

    return (
        <>
            <div className="mb-3">
                <label className="ol-form-label">Class image</label>
                <input
                    type="file"
                    className="ol-form-control"
                    accept="image/*"
                    onChange={(e) => onImageChange(e.target.files?.[0] || null)}
                />
                {shown && (
                    <div className="mt-2 flex items-center gap-3">
                        <img
                            src={shown}
                            alt="Class image preview"
                            className="h-20 w-32 object-cover rounded-ol-8 border border-ebordermuted"
                        />
                        <button
                            type="button"
                            className="ol-btn-outline-secondary ol-btn-sm"
                            onClick={() => {
                                onImageChange(null);
                                // Only a saved image needs the server told to
                                // clear it; an unsaved pick just resets.
                                if (!preview) onRemoveImage?.();
                            }}
                        >Remove</button>
                    </div>
                )}
            </div>

            <div className="mb-3">
                <label className="ol-form-label">{descriptionLabel}</label>
                {descriptionHint && (
                    <p className="text-[12px] text-gray mb-1.5">{descriptionHint}</p>
                )}
                {/* Rich text rather than a raw-HTML textarea: the stored value
                    is rendered through sanitizeHtml() in the player, so an
                    admin was previously expected to hand-write the markup to
                    get a list or a bold word. The editor emits the same plain
                    HTML the field always held, so existing rows keep working. */}
                <RichTextEditor
                    value={description}
                    onChange={onDescriptionChange}
                    placeholder="What this class covers"
                    rows={5}
                />
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Difficulty level</label>
                <select
                    className="ol-form-control"
                    value={difficulty}
                    onChange={(e) => onDifficultyChange(e.target.value)}
                >
                    {DIFFICULTY_LEVELS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                </select>
            </div>
        </>
    );
}
