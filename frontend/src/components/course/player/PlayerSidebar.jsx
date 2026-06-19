import { useState } from 'react';
import { Link } from 'react-router-dom';

const VIDEO_TYPES = ['video-url', 'system-video', 'vimeo-url', 'html5', 'google_drive'];

// The lesson-type icon shown inside the tile. Video lessons use a camera glyph;
// quizzes (and any non-video / document) use the file glyph.
const TypeIcon = ({ type }) => {
    if (VIDEO_TYPES.includes(type)) return <i className="fa fa-video" />;
    if (type === 'image') return <i className="fa fa-image" />;
    // quiz, text, document, anything else → file glyph (matches the
    // round gray badge in the design).
    return <i className="fa fa-file" />;
};

// Video lessons sit in a rounded SQUARE tile; everything else (quizzes,
// documents…) sits in a ROUND tile, matching the approved design.
const isVideoType = (type) => VIDEO_TYPES.includes(type);

const PLAY_BASE = '/courses/programs/course-details/play';

export default function PlayerSidebar({ course, currentLessonId, completedIds, lockedIds, progress, completedCount, isAdmin }) {
    const [openSections, setOpenSections] = useState(() => {
        const m = {};
        course.sections.forEach((s) => {
            m[s.id] = s.lessons.some((l) => l.id === currentLessonId);
        });
        if (Object.values(m).every((v) => !v) && course.sections[0]) m[course.sections[0].id] = true;
        return m;
    });

    const toggle = (sid) => setOpenSections((m) => ({ ...m, [sid]: !m[sid] }));

    return (
        <aside className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden text-gray-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.18)]">
            {/* Premium header — dark gradient panel with the curriculum title and
                an animated progress bar. */}
            <div className="relative p-5 bg-gradient-to-br from-[#1b1f2a] via-[#23283a] to-[#1b1f2a] text-white overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#FF6A00]/20 blur-2xl" />
                <div className="relative">
                    <h2 className="text-[15px] font-bold mb-3 flex items-center gap-2">
                        <span className="inline-flex w-7 h-7 items-center justify-center rounded-lg bg-[#FF6A00]/20 text-[#FF8a3d]">
                            <i className="fa fa-list-ul text-[13px]" />
                        </span>
                        Course curriculum
                    </h2>
                    <div className="flex items-center justify-between text-[12px] mb-2">
                        <span className="font-bold text-[#FF8a3d]">{progress}% complete</span>
                        <span className="text-white/60 font-medium">{completedCount}/{course.lesson_count} lessons</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#FF6A00] to-[#ffb27a] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </div>

            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                {course.sections.map((section, sIdx) => {
                    const isOpen = openSections[section.id];
                    const secDone = section.lessons.filter((l) => completedIds.includes(l.id)).length;
                    return (
                        <div key={section.id} className="border-b border-gray-100 last:border-0">
                            <button
                                type="button"
                                onClick={() => toggle(section.id)}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                            >
                                <span className="flex items-center gap-3 min-w-0">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 text-gray-500 text-[12px] font-bold flex items-center justify-center">
                                        {String(sIdx + 1).padStart(2, '0')}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block font-bold text-[14px] text-gray-900 truncate">{section.title}</span>
                                        <span className="block text-[11px] text-gray-400 font-medium">{secDone}/{section.lessons.length} done</span>
                                    </span>
                                </span>
                                <i className={`fa fa-chevron-up text-[12px] text-gray-400 transition-transform ${isOpen ? '' : 'rotate-180'}`} />
                            </button>
                            {isOpen && (
                                <ul className="bg-gray-50/40 pb-2">
                                    {section.lessons.map((lesson) => {
                                        const isCurrent = lesson.id === currentLessonId;
                                        const isCompleted = completedIds.includes(lesson.id);
                                        // Admin preview mode bypasses locks — admins can see all lessons
                                        const isLocked = !isAdmin && lockedIds.includes(lesson.id);

                                        // Active row is a full orange gradient pill with white
                                        // content + a soft glow; inactive rows are normal text with
                                        // a muted icon tile. Locked items are dimmed and non-clickable.
                                        const rowCls = isCurrent
                                            ? 'bg-gradient-to-r from-[#FF6A00] to-[#ff8a3d] text-white rounded-xl shadow-[0_8px_20px_-6px_rgba(255,106,0,0.6)]'
                                            : isLocked
                                                ? 'text-gray-400 cursor-not-allowed pointer-events-none rounded-xl'
                                                : 'text-gray-600 hover:bg-white hover:shadow-sm rounded-xl';
                                        // Video → rounded square; everything else (quiz, document) → round.
                                        const tileShape = isVideoType(lesson.lesson_type) ? 'rounded-md' : 'rounded-full';
                                        const tileCls = isCurrent
                                            ? 'bg-white/20 text-white'
                                            : 'bg-gray-100 text-gray-400';
                                        const durationCls = isCurrent ? 'text-white/90' : 'text-gray-400';

                                        return (
                                            <li key={lesson.id} className="px-2 py-0.5">
                                                <Link
                                                    to={`${PLAY_BASE}/${course.slug}/${lesson.id}`}
                                                    className={`flex items-center gap-3 px-3 py-2 text-[13px] transition-colors ${rowCls}`}
                                                >
                                                    {/* Left: completion indicator (circle check) */}
                                                    <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                                                        {isLocked ? (
                                                            <i className="fa fa-lock text-amber-500 text-[14px]" title="Locked" />
                                                        ) : isCompleted ? (
                                                            <span
                                                                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                                                    isCurrent
                                                                        ? 'border-2 border-white text-white'
                                                                        : 'bg-skin text-white'
                                                                }`}
                                                                title="Completed"
                                                            >
                                                                <i className="fa fa-check text-[10px]" />
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className={`w-5 h-5 rounded-full border-2 ${
                                                                    isCurrent ? 'border-white/70' : 'border-gray-300'
                                                                }`}
                                                                title="Not watched yet"
                                                            />
                                                        )}
                                                    </span>

                                                    {/* Square icon tile (video / quiz / file) */}
                                                    <span className={`w-7 h-7 flex-shrink-0 flex items-center justify-center ${tileShape} ${tileCls}`}>
                                                        <TypeIcon type={lesson.lesson_type} />
                                                    </span>

                                                    {/* Title */}
                                                    <span className="flex-1 truncate font-bold">{lesson.title}</span>

                                                    {/* Right-aligned duration */}
                                                    {lesson.duration && lesson.duration !== '00:00:00' && (
                                                        <span className={`text-[12px] flex-shrink-0 tabular-nums font-bold ${durationCls}`}>
                                                            {lesson.duration}
                                                        </span>
                                                    )}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
