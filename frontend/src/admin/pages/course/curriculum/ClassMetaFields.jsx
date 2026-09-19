import { useEffect, useState } from 'react';

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
                <label className="ol-form-label">Class description</label>
                <textarea
                    className="ol-form-control"
                    rows="4"
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    placeholder="What this class covers"
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
