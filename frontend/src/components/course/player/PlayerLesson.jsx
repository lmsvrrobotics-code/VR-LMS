import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import QuizPlayer from './QuizPlayer';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

// Same env var the rest of the app uses (Home/Overview/Programspage). System
// videos and uploaded documents are persisted as RELATIVE paths
// ("uploads/lesson_file/videos/foo.mp4") by CurriculumService, so they need
// the admin-service origin prepended before they're resolvable in <video>.
const ADMIN_BASE = (import.meta.env.VITE_ADMIN_API_URL) || 'http://localhost:5000';

// Build a playable URL for a stored upload. Absolute URLs (http://, https://,
// blob:, data:) pass through unchanged so YouTube/Vimeo/Drive embeds keep
// working; everything else gets joined onto ADMIN_BASE.
const resolveUploadUrl = (src) => {
    const s = String(src || '').trim();
    if (!s) return s;
    if (/^(https?:|blob:|data:)/i.test(s)) return s;
    return `${ADMIN_BASE.replace(/\/+$/, '')}/${s.replace(/^\/+/, '')}`;
};

const LessonTypeIcon = ({ type }) => {
    if (['video-url', 'system-video', 'vimeo-url', 'html5'].includes(type)) return <i className="fa fa-video" />;
    if (type === 'image') return <i className="fa fa-image" />;
    if (type === 'google_drive') return <i className="fab fa-google-drive" />;
    if (type === 'quiz') return <i className="fa fa-question-circle" />;
    return <i className="fa fa-file" />;
};

const vimeoIdFrom = (url) => {
    const m = String(url || '').match(/vimeo\.com\/(\d+)/);
    return m ? m[1] : '';
};

const toYouTubeEmbed = (url) => {
    const u = String(url || '');
    if (u.includes('/embed/')) return u;
    const watchMatch = u.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
    const shortMatch = u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
    return u;
};

const isYouTube = (url) => /youtu/i.test(String(url || ''));

const googleIdFrom = (url) => {
    const u = String(url || '');
    const dMatch = u.match(/\/d\/([^\/]+)/);
    if (dMatch) return dMatch[1];
    const eqMatch = u.match(/[?&]id=([^&]+)/);
    return eqMatch ? eqMatch[1] : '';
};

export default function PlayerLesson({ lesson, course, locked, lockedMessage, onLessonEnded, onTimeUpdate }) {
    if (locked) {
        return (
            <div className="bg-black/30 rounded-xl p-12 text-center text-white/80 my-8">
                <i className="fa fa-lock text-[48px] mb-4 text-amber-300" />
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(lockedMessage || '<p>This lesson is locked. Complete the previous lesson to unlock it.</p>') }} />
            </div>
        );
    }

    if (!lesson) {
        return (
            <div className="aspect-video-shell bg-black/40 rounded-xl flex items-center justify-center text-white/60">
                Select a lesson to start
            </div>
        );
    }

    return (
        <div className="rounded-xl overflow-hidden bg-black mb-4">
            <LessonRenderer lesson={lesson} course={course} onLessonEnded={onLessonEnded} onTimeUpdate={onTimeUpdate} />
        </div>
    );
}

function LessonRenderer({ lesson, course, onLessonEnded, onTimeUpdate }) {
    const t = lesson.lesson_type;

    if (t === 'text') {
        return (
            <article className="bg-white text-dark p-6 prose-custom" dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.attachment) }} />
        );
    }

    if (t === 'video-url') {
        const src = isYouTube(lesson.lesson_src) ? toYouTubeEmbed(lesson.lesson_src) : lesson.lesson_src;
        return (
            <div className="aspect-video-shell">
                <iframe
                    src={src}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="w-full h-full"
                    title={lesson.title}
                />
            </div>
        );
    }

    if (t === 'system-video' || t === 'html5') {
        // system-video is now a Bunny Stream HLS playlist (.m3u8) — played via
        // hls.js. Legacy rows may still be a relative local path or a direct
        // .mp4 URL; HlsVideo handles all three. resolveUploadUrl leaves
        // absolute (Bunny) URLs untouched and only prefixes relative paths.
        const videoUrl = resolveUploadUrl(lesson.lesson_src);
        return (
            <HlsVideo
                key={lesson.id}
                src={videoUrl}
                onEnded={onLessonEnded}
                onTimeUpdate={onTimeUpdate}
            />
        );
    }

    if (t === 'vimeo-url') {
        const vid = vimeoIdFrom(lesson.lesson_src);
        return (
            <div className="aspect-video-shell">
                <iframe
                    src={`https://player.vimeo.com/video/${vid}?title=0&byline=0&portrait=0`}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    className="w-full h-full"
                    title={lesson.title}
                />
            </div>
        );
    }

    if (t === 'google_drive') {
        const id = googleIdFrom(lesson.lesson_src);
        return (
            <div className="aspect-video-shell bg-black">
                <iframe
                    src={`https://drive.google.com/file/d/${id}/preview`}
                    allow="autoplay"
                    allowFullScreen
                    className="w-full h-full"
                    title={lesson.title}
                />
            </div>
        );
    }

    if (t === 'image') {
        const imgUrl = resolveUploadUrl(lesson.attachment || lesson.lesson_src);
        return <img src={imgUrl} alt={lesson.title} className="w-full max-h-[80vh] object-contain bg-black" />;
    }

    if (t === 'document_type') {
        const src = resolveUploadUrl(lesson.lesson_src || lesson.attachment);
        if (lesson.attachment_type === 'pdf') {
            return <iframe src={src} className="w-full h-[80vh] bg-white" title={lesson.title} />;
        }
        if (['doc', 'ppt'].includes(lesson.attachment_type)) {
            // Office viewer needs an ABSOLUTE, publicly reachable URL — passing
            // a relative path here would render an error page inside the iframe.
            return (
                <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`}
                    className="w-full h-[80vh] bg-white"
                    title={lesson.title}
                />
            );
        }
        return <iframe src={src} className="w-full h-[80vh] bg-white" title={lesson.title} />;
    }

    if (t === 'quiz') {
        // Reuse onLessonEnded so a submitted quiz ticks in the sidebar via
        // the same completeLesson path the video player uses. The `key` is
        // essential: without it, navigating between two quiz lessons keeps
        // the same component instance and leaks answers/submitted state
        // from the previous quiz, which made a stray Submit click record
        // the previous quiz's submission shape against the new quiz id.
        // Keying by lesson.id forces a clean unmount/remount per quiz.
        return <QuizPlayer key={lesson.id} lesson={lesson} onCompleted={onLessonEnded} />;
    }

    if (t === 'iframe' || t === 'scorm') {
        return (
            <div className="aspect-video-shell">
                <iframe src={lesson.lesson_src} allowFullScreen className="w-full h-full bg-white" title={lesson.title} />
            </div>
        );
    }

    return (
        <div className="bg-black/40 p-6 text-white/70 text-center">
            Unsupported lesson type: <code className="text-white">{t}</code>
        </div>
    );
}

// Plays a Bunny Stream HLS playlist (.m3u8) via hls.js, falling back to native
// playback for Safari (which plays HLS directly) and for plain .mp4 URLs /
// legacy local paths. Keeps the same <video> element so onEnded / onTimeUpdate
// continue to drive lesson-completion + progress tracking.
function HlsVideo({ src, onEnded, onTimeUpdate }) {
    const ref = useRef(null);

    useEffect(() => {
        const video = ref.current;
        if (!video || !src) return undefined;

        const isHls = /\.m3u8(\?|$)/i.test(src);
        if (!isHls) {
            video.src = src;
            return undefined;
        }
        // Safari / iOS play HLS natively — no hls.js needed.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            return undefined;
        }
        if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hls.loadSource(src);
            hls.attachMedia(video);
            return () => hls.destroy();
        }
        // No HLS support anywhere — best-effort direct assignment.
        video.src = src;
        return undefined;
    }, [src]);

    return (
        <video
            ref={ref}
            playsInline
            controls
            onContextMenu={(e) => e.preventDefault()}
            onEnded={onEnded}
            onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
            className="w-full max-h-[80vh] bg-black"
        />
    );
}

export { LessonTypeIcon };
