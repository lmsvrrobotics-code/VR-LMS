import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

// Media attached to a single quiz question — the picture or clip the question
// is asking about. The admin uploads it per question; the player API passes it
// through on the question payload as `image` / `video`.
//
// Storage decides the shape of each value:
//   image → a Cloudflare R2 public URL, or a legacy relative "uploads/..." key
//   video → a Bunny Stream embed URL (iframe), an HLS playlist (.m3u8), or a
//           plain file URL
// so this handles all of them rather than assuming one.

const ADMIN_BASE = (import.meta.env.VITE_ADMIN_API_URL) || 'http://localhost:5000';

// Absolute URLs (http://, https://, blob:, data:) pass through unchanged;
// a legacy relative key is joined onto the admin-service origin. Mirrors
// PlayerLesson's resolver so both render the same stored values.
export const resolveMediaUrl = (src) => {
    const s = String(src || '').trim();
    if (!s) return '';
    if (/^(https?:|blob:|data:)/i.test(s)) return s;
    return `${ADMIN_BASE.replace(/\/+$/, '')}/${s.replace(/^\/+/, '')}`;
};

// Bunny Stream persists an embed URL for uploaded videos; those must render in
// an <iframe>, not a <video> element.
export const isEmbedUrl = (src) =>
    /iframe\.mediadelivery\.net\/embed\//i.test(String(src || '')) ||
    /(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/i.test(String(src || ''));

const isHlsUrl = (src) => /\.m3u8(\?|$)/i.test(String(src || ''));

// Plays an HLS playlist through hls.js, falling back to native playback on
// Safari and for plain .mp4 URLs.
function QuestionVideo({ src, title }) {
    const ref = useRef(null);

    useEffect(() => {
        const video = ref.current;
        if (!video || !src) return undefined;
        if (!isHlsUrl(src) || video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            return undefined;
        }
        if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hls.loadSource(src);
            hls.attachMedia(video);
            return () => hls.destroy();
        }
        video.src = src;
        return undefined;
    }, [src]);

    return (
        <video
            ref={ref}
            playsInline
            controls
            preload="metadata"
            title={title}
            className="w-full max-w-xl rounded-lg bg-black"
        />
    );
}

export default function QuestionMedia({ image, video, title = 'Question media' }) {
    // Clicking the picture opens it full-size: a circuit diagram shrunk into a
    // quiz column is often unreadable, and the student cannot answer what they
    // cannot see.
    const [zoomed, setZoomed] = useState(false);

    if (!image && !video) return null;

    const imageUrl = resolveMediaUrl(image);
    const videoUrl = resolveMediaUrl(video);

    return (
        <div className="flex flex-col gap-3 mb-3">
            {imageUrl && (
                <>
                    <button
                        type="button"
                        onClick={() => setZoomed(true)}
                        className="block w-fit max-w-full rounded-lg overflow-hidden border border-border hover:border-skin transition-colors"
                        title="Click to enlarge"
                    >
                        <img
                            src={imageUrl}
                            alt={title}
                            loading="lazy"
                            className="max-h-80 w-auto max-w-full object-contain bg-gray-50"
                        />
                    </button>
                    {zoomed && (
                        <div
                            role="presentation"
                            onClick={() => setZoomed(false)}
                            className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
                        >
                            <img src={imageUrl} alt={title} className="max-h-full max-w-full object-contain" />
                        </div>
                    )}
                </>
            )}

            {videoUrl && (
                isEmbedUrl(videoUrl) ? (
                    <div className="w-full max-w-xl aspect-video rounded-lg overflow-hidden bg-black">
                        <iframe
                            src={videoUrl}
                            title={title}
                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowFullScreen
                            loading="lazy"
                            className="w-full h-full border-0"
                        />
                    </div>
                ) : (
                    <QuestionVideo src={videoUrl} title={title} />
                )
            )}
        </div>
    );
}
