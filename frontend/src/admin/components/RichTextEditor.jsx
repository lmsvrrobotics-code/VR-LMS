import { useEffect, useRef, useState } from 'react';

/**
 * A small rich-text editor for admin-authored copy.
 *
 * Built on contentEditable rather than pulling in Quill/TipTap, for two
 * reasons: the value is plain HTML, which is exactly what the field already
 * stored and what sanitizeHtml() already renders on the student side, and a
 * ~100-line component avoids adding a ~200KB dependency plus its CSS to a
 * bundle that is already over the chunk-size warning.
 *
 * The output passes through DOMPurify before it ever reaches a student (see
 * lib/sanitizeHtml.ts), so the editor does not need to be a security boundary —
 * but it still only EMITS the handful of tags below, so a paste from Word does
 * not smuggle a wall of inline styles into the database.
 */

const TOOLS = [
    { cmd: 'bold', label: 'B', title: 'Bold', className: 'font-bold' },
    { cmd: 'italic', label: 'I', title: 'Italic', className: 'italic' },
    { cmd: 'underline', label: 'U', title: 'Underline', className: 'underline' },
    { cmd: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
    { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
];

export default function RichTextEditor({ value, onChange, placeholder = '', rows = 6 }) {
    const ref = useRef(null);
    const [focused, setFocused] = useState(false);

    // Only push an external value in when it differs from what is already in
    // the DOM. Writing on every render would reset the caret to the start on
    // each keystroke, which makes the field unusable.
    useEffect(() => {
        const el = ref.current;
        if (el && value !== el.innerHTML) el.innerHTML = value || '';
    }, [value]);

    const exec = (cmd) => {
        // execCommand is deprecated but is still the only API every browser
        // implements for contentEditable formatting; the alternative is a
        // full editor library. Focus first so the command applies to this
        // field rather than wherever the caret happened to be.
        ref.current?.focus();
        document.execCommand(cmd, false, null);
        onChange(ref.current?.innerHTML || '');
    };

    const addLink = () => {
        const url = window.prompt('Link URL (including https://)');
        if (!url) return;
        let parsed;
        try { parsed = new URL(url); } catch { window.alert('That is not a valid URL.'); return; }
        // Only http(s): a javascript: href here would be stored and later
        // clicked by a student. DOMPurify would strip it on render, but
        // rejecting it at the source keeps the stored data clean too.
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            window.alert('Only http:// and https:// links are allowed.');
            return;
        }
        ref.current?.focus();
        document.execCommand('createLink', false, parsed.toString());
        onChange(ref.current?.innerHTML || '');
    };

    // Paste as PLAIN TEXT. A copy from Word or a web page otherwise brings
    // font tags, inline styles and class names that make the stored HTML
    // unreadable and render inconsistently in the player.
    const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        onChange(ref.current?.innerHTML || '');
    };

    const isEmpty = !value || value === '<br>' || value === '<div><br></div>';

    return (
        <div
            className={`rounded-ol-8 border transition-colors ${
                focused ? 'border-skin' : 'border-border'
            }`}
        >
            <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
                {TOOLS.map((t) => (
                    <button
                        key={t.cmd}
                        type="button"
                        title={t.title}
                        // onMouseDown + preventDefault: a plain onClick would
                        // blur the editable area first, losing the selection
                        // the command is meant to apply to.
                        onMouseDown={(e) => { e.preventDefault(); exec(t.cmd); }}
                        className={`rounded px-2 py-1 text-[13px] text-gray hover:bg-lightgreen/60 hover:text-dark ${t.className || ''}`}
                    >
                        {t.label}
                    </button>
                ))}
                <button
                    type="button"
                    title="Insert link"
                    onMouseDown={(e) => { e.preventDefault(); addLink(); }}
                    className="rounded px-2 py-1 text-[13px] text-gray hover:bg-lightgreen/60 hover:text-dark"
                >
                    Link
                </button>
            </div>

            <div className="relative">
                {isEmpty && placeholder && (
                    <span className="pointer-events-none absolute left-3 top-2.5 text-[14px] text-gray">
                        {placeholder}
                    </span>
                )}
                <div
                    ref={ref}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Rich text"
                    onInput={() => onChange(ref.current?.innerHTML || '')}
                    onPaste={handlePaste}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    className="prose-custom w-full overflow-y-auto px-3 py-2.5 text-[14px] outline-none"
                    style={{ minHeight: `${rows * 1.6}rem` }}
                />
            </div>
        </div>
    );
}
