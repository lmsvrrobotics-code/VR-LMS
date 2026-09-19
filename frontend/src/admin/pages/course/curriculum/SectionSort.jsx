import { useState } from 'react';
import { toast } from 'react-toastify';
import { sortSections } from '../../../api/curriculum';

// Drag-to-reorder using native HTML5 DnD — no library dependency. The list
// reorders LIVE on dragOver: as the cursor enters another row, the dragged
// item swaps into that row's position so the other rows visibly slide out of
// the way (no overlap, no "drop zone highlight"). dragIdx tracks where the
// dragged item currently sits in the array, which we keep updating as it
// moves so subsequent swaps work from the correct source index.
export default function SectionSort({ sections, onDone, onClose }) {
    const [items, setItems] = useState(sections.map((s) => ({ id: s.id, title: s.title })));
    const [saving, setSaving] = useState(false);
    const [dragIdx, setDragIdx] = useState(null);

    const onDragStart = (e, idx) => {
        setDragIdx(idx);
        // Required for Firefox to actually start the drag.
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* ignore */ }
    };

    const onDragOver = (e, idx) => {
        // preventDefault tells the browser this is a valid drop target —
        // without it onDrop never fires and the cursor stays as "not allowed".
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragIdx === null || dragIdx === idx) return;
        // Live swap: move the dragged item to the hovered slot so the list
        // visibly rearranges underneath the cursor. Update dragIdx so the
        // NEXT dragOver knows where the item is now sitting.
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
            await sortSections(items.map((i) => i.id));
            onDone();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        } finally {
            setSaving(false);
        }
    };

    if (items.length === 0) return <div className="text-[14px] text-gray">No sessions to sort.</div>;

    return (
        <div>
            <ul className="flex flex-col gap-3 mb-5 list-none p-0">
                {items.map((s, i) => {
                    const isDragging = dragIdx === i;
                    return (
                        <li
                            key={s.id}
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
                            aria-label={`Drag ${s.title} to reorder`}
                        >
                            <span className="text-[14px] text-dark truncate">{s.title}</span>
                            {/* Sort/sequence glyph matching the mockup: two
                                short horizontal lines with up/down arrows on
                                the right ("≡↕"). Indicates vertical-reorder. */}
                            <span
                                className="text-gray shrink-0 pointer-events-none"
                                title="Drag to reorder"
                                aria-hidden="true"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    {/* horizontal lines (left) */}
                                    <line x1="3" y1="7" x2="11" y2="7" />
                                    <line x1="3" y1="17" x2="11" y2="17" />
                                    {/* up/down arrow stem (right) */}
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
