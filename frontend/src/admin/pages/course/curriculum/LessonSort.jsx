import { useState } from 'react';
import { toast } from 'react-toastify';
import { sortLessons } from '../../../api/curriculum';

// Drag-to-reorder using native HTML5 DnD — same pattern as SectionSort.
// The list reorders LIVE on dragOver: as the cursor enters another row, the
// dragged item swaps into that row's position so the rest visibly slide out
// of the way. dragIdx tracks where the dragged item currently sits so the
// NEXT swap works from the correct source index.
export default function LessonSort({ section, onDone, onClose }) {
    const [items, setItems] = useState(section.lessons.map((l) => ({ id: l.id, title: l.title })));
    const [saving, setSaving] = useState(false);
    const [dragIdx, setDragIdx] = useState(null);

    const onDragStart = (e, idx) => {
        setDragIdx(idx);
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* ignore */ }
    };

    const onDragOver = (e, idx) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragIdx === null || dragIdx === idx) return;
        setItems((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(idx, 0, moved);
            return next;
        });
        setDragIdx(idx);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragIdx(null);
    };

    const onDragEnd = () => {
        setDragIdx(null);
    };

    const submit = async () => {
        setSaving(true);
        try {
            await sortLessons(items.map((i) => i.id));
            onDone();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        } finally {
            setSaving(false);
        }
    };

    if (items.length === 0) return <div className="text-[14px] text-gray">No classes to sort.</div>;

    return (
        <div>
            <div className="bg-lightgreen/60 border border-softgreen/70 rounded-ol-8 p-3 mb-3">
                <p className="text-[14px] text-dark m-0"><span className="text-gray">Session:</span> <strong>{section.title}</strong></p>
            </div>
            <ul className="flex flex-col gap-3 mb-5 list-none p-0">
                {items.map((l, i) => {
                    const isDragging = dragIdx === i;
                    return (
                        <li
                            key={l.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, i)}
                            onDragOver={(e) => onDragOver(e, i)}
                            onDrop={onDrop}
                            onDragEnd={onDragEnd}
                            className={[
                                'flex items-center justify-between gap-3 border rounded-ol-8 px-4 py-3 bg-white cursor-grab active:cursor-grabbing select-none transition-shadow',
                                isDragging
                                    ? 'border-skin shadow-md ring-2 ring-skin/30'
                                    : 'border-border',
                            ].join(' ')}
                            aria-grabbed={isDragging}
                            aria-label={`Drag ${l.title} to reorder`}
                        >
                            <span className="text-[14px] text-dark truncate">{l.title}</span>
                            {/* Vertical-reorder glyph: short horizontal lines on
                                the left + up/down arrow stem on the right. */}
                            <span
                                className="text-gray shrink-0 pointer-events-none"
                                title="Drag to reorder"
                                aria-hidden="true"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="3" y1="7" x2="11" y2="7" />
                                    <line x1="3" y1="17" x2="11" y2="17" />
                                    <line x1="17" y1="4" x2="17" y2="20" />
                                    <polyline points="14 7 17 4 20 7" />
                                    <polyline points="14 17 17 20 20 17" />
                                </svg>
                            </span>
                        </li>
                    );
                })}
            </ul>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <button
                    type="button"
                    className="ol-btn-primary"
                    disabled={saving}
                    onClick={submit}
                >
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
                {onClose && (
                    <button
                        type="button"
                        className="ol-btn-outline-secondary"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Close
                    </button>
                )}
            </div>
        </div>
    );
}
