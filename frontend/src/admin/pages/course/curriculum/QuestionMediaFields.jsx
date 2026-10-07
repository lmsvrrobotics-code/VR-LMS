import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { resolveMediaUrl, isEmbedUrl } from '@/components/course/player/QuestionMedia';

// Image/video pickers for a single quiz question. Purely presentational: the
// parent form owns the state and sends the files with the question.
//
// Images go to Cloudflare R2 and videos to Bunny Stream — the backend routes
// them off the mimetype — so the admin only has to pick a file.

// Keep a picked file within what the upload path handles comfortably. A phone
// photo is a couple of MB; a long clip belongs in a lesson, not a question.
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 200;

const mb = (bytes) => bytes / (1024 * 1024);

// A local preview for a just-picked file. Revoked on change so picking several
// files in a row doesn't leak object URLs.
const useObjectUrl = (file) => {
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (!file) { setUrl(''); return undefined; }
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    return url;
};

function MediaSlot({
    label, hint, accept, file, currentUrl, removed, onFile, onRemove, maxMb, kind,
}) {
    const previewUrl = useObjectUrl(file);
    // A newly picked file previews immediately; otherwise show what is stored,
    // unless the admin has ticked "remove".
    const stored = !removed && currentUrl ? resolveMediaUrl(currentUrl) : '';
    const shown = previewUrl || stored;

    const pick = (e) => {
        const f = e.target.files?.[0] || null;
        if (f && mb(f.size) > maxMb) {
            toast.error(`${label} must be under ${maxMb} MB.`);
            e.target.value = '';
            return;
        }
        onFile(f);
    };

    return (
        <div className="flex-1 min-w-[220px]">
            <label className="ol-form-label">{label} <span className="text-gray font-normal">(optional)</span></label>
            <input type="file" accept={accept} className="ol-form-control" onChange={pick} />
            <p className="text-[12px] text-gray mt-1 mb-0">{hint}</p>

            {shown && (
                <div className="mt-2 rounded-ol-8 border border-border p-2">
                    {kind === 'image' ? (
                        <img src={shown} alt={`${label} preview`} className="max-h-40 w-auto object-contain mx-auto" />
                    ) : isEmbedUrl(shown) ? (
                        <div className="aspect-video w-full bg-black rounded">
                            <iframe src={shown} title={`${label} preview`} allowFullScreen className="w-full h-full border-0" />
                        </div>
                    ) : (
                        <video src={shown} controls preload="metadata" className="max-h-40 w-full bg-black rounded" />
                    )}
                </div>
            )}

            {/* Only offer "remove" for something already stored — a file that
                hasn't been uploaded yet is cleared by picking another. */}
            {currentUrl && !file && (
                <label className="flex items-center gap-2 mt-2 text-[13px] text-dark">
                    <input
                        type="checkbox"
                        checked={removed}
                        onChange={(e) => onRemove(e.target.checked)}
                        className="accent-skin"
                    />
                    Remove the current {kind}
                </label>
            )}
        </div>
    );
}

export default function QuestionMediaFields({
    currentImage, currentVideo,
    imageFile, videoFile,
    removeImage, removeVideo,
    onImageFile, onVideoFile,
    onRemoveImage, onRemoveVideo,
}) {
    return (
        <div className="mb-3">
            <p className="ol-form-label mb-2">Question media</p>
            <div className="flex flex-wrap gap-4">
                <MediaSlot
                    kind="image"
                    label="Image"
                    hint={`Shown above the options. PNG, JPG, GIF or WebP, up to ${MAX_IMAGE_MB} MB.`}
                    accept="image/*"
                    file={imageFile}
                    currentUrl={currentImage}
                    removed={removeImage}
                    onFile={onImageFile}
                    onRemove={onRemoveImage}
                    maxMb={MAX_IMAGE_MB}
                />
                <MediaSlot
                    kind="video"
                    label="Video"
                    hint={`Plays inside the question. MP4 or WebM, up to ${MAX_VIDEO_MB} MB.`}
                    accept="video/*"
                    file={videoFile}
                    currentUrl={currentVideo}
                    removed={removeVideo}
                    onFile={onVideoFile}
                    onRemove={onRemoveVideo}
                    maxMb={MAX_VIDEO_MB}
                />
            </div>
        </div>
    );
}
