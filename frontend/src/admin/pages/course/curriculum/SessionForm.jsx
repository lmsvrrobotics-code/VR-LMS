import { useEffect, useState } from 'react';

// A session is a `section` row in the API/DB — only the wording differs. It
// carries a name, an optional cover image and an optional description.
//
// The image field is uncontrolled (a File in state, not a value on the input)
// because file inputs cannot be assigned a value programmatically. On edit we
// show the already-saved image as a preview until a new file is chosen.
export default function SessionForm({ session, onSubmit, submitLabel, saving = false }) {
    const [title, setTitle] = useState(session?.title || '');
    const [description, setDescription] = useState(session?.description || '');
    const [image, setImage] = useState(null);
    const [preview, setPreview] = useState(null);
    const [removeImage, setRemoveImage] = useState(false);

    // Object URLs are a leak if never revoked — tie each one to the File it
    // was made from and release it when the file changes or the form closes.
    useEffect(() => {
        if (!image) { setPreview(null); return undefined; }
        const url = URL.createObjectURL(image);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [image]);

    const existingImage = !removeImage && !image ? session?.image : null;

    const submit = (e) => {
        e.preventDefault();
        onSubmit({ title, description, image, removeImage });
    };

    return (
        <form onSubmit={submit}>
            <div className="mb-3">
                <label className="ol-form-label">Session name</label>
                <input
                    className="ol-form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Getting started with Scratch"
                    required
                    autoFocus
                />
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Session image</label>
                <input
                    type="file"
                    className="ol-form-control"
                    accept="image/*"
                    onChange={(e) => { setImage(e.target.files?.[0] || null); setRemoveImage(false); }}
                />
                {(preview || existingImage) && (
                    <div className="mt-2 flex items-center gap-3">
                        <img
                            src={preview || existingImage}
                            alt="Session cover preview"
                            className="h-20 w-32 object-cover rounded-ol-8 border border-ebordermuted"
                        />
                        <button
                            type="button"
                            className="ol-btn-outline-secondary ol-btn-sm"
                            onClick={() => {
                                setImage(null);
                                // Only an already-saved image needs the server
                                // told to clear it; an unsaved pick just resets.
                                if (!preview) setRemoveImage(true);
                            }}
                        >Remove</button>
                    </div>
                )}
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Session description</label>
                <textarea
                    className="ol-form-control"
                    rows="4"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this session covers"
                />
            </div>

            <div className="mb-2">
                <button className="ol-btn-primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
            </div>
        </form>
    );
}
