import { useEffect, useState } from 'react';
import axios from 'axios';

const ADMIN_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

// "My Learnings" — the student's own per-lesson note (title + description),
// loaded/saved per (student, lesson) via the public learnings endpoints.
export default function MyLearnings({ courseId, lessonId }) {
    const studentId = localStorage.getItem('userId') || '';
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!studentId || !lessonId) return;
        let cancelled = false;
        setSaved(false);
        axios
            .get(`${ADMIN_BASE}/api/public/learnings/by-student/${studentId}`, {
                params: { lessonId, t: Date.now() }, headers: { 'Cache-Control': 'no-cache' }, timeout: 30000,
            })
            .then(({ data }) => {
                if (cancelled) return;
                const l = data?.learning;
                setTitle(l?.title || '');
                setDescription(l?.description || '');
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [studentId, lessonId]);

    const save = async (e) => {
        e.preventDefault();
        if (!studentId || !lessonId) return;
        setSaving(true); setSaved(false);
        try {
            await axios.post(`${ADMIN_BASE}/api/public/learnings`, { studentId, courseId, lessonId, title, description });
            setSaved(true);
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    if (!lessonId) return null;
    const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15 text-sm transition-all';

    if (!studentId) {
        return <p className="text-sm text-gray-500">Sign in as a student to save your notes for this lesson.</p>;
    }

    return (
        <form onSubmit={save} className="space-y-4">
            <p className="text-[13px] text-gray-500 -mt-1">
                <i className="fa fa-circle-info mr-1.5 text-[#FF6A00]" />
                A private note just for this lesson — it auto-loads whenever you reopen the lesson.
            </p>
            <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">Title</label>
                <input className={inputCls} value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} placeholder="e.g. Key takeaways" />
            </div>
            <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">Notes</label>
                <textarea rows={5} className={inputCls} value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
                    placeholder="What did you learn? Jot down notes on this lesson — it'll help you revise later." />
            </div>
            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[14px] font-bold text-white bg-gradient-to-r from-[#FF6A00] to-[#ff8a3d] shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-60"
                >
                    <i className="fa fa-floppy-disk" />{saving ? 'Saving…' : 'Save note'}
                </button>
                {saved && <span className="text-[13px] text-emerald-600 font-semibold"><i className="fa fa-check mr-1" />Saved</span>}
            </div>
        </form>
    );
}
