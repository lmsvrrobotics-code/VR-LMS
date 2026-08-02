import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    Plus, Search, MonitorPlay, Pencil, Eye, EyeOff, Trash2,
    Calendar, BookOpen, Users, ExternalLink,
} from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import { listDemos, storeDemo, updateDemo, deleteDemo, toggleDemoStatus, getDemo } from '../../api/demo';
import { listCourses } from '../../api/course';
import { listTeachers } from '../../api/teacher';
import { MultiSelect, fmtDateTime, toLocalInput } from '../../components/scheduling';

/**
 * Manage Demos — admin CRUD for demo sessions (title + course + time window +
 * teacher(s)). ?action=add (from the "Add Demo" sidebar link) auto-opens Add.
 *
 * UI mirrors the professional Marketing pages (Demo Videos / Gallery):
 * icon-badge toolbar header, search-with-icon, gradient primary action, and a
 * clean card-style table with status pills and icon actions.
 */
export default function DemosIndex() {
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);

    const query = Object.fromEntries(params.entries());

    const load = async () => {
        setLoading(true); setError(null);
        try { setData(await listDemos({ page: query.page, search: query.search })); }
        catch (err) { setError(err?.response?.data?.error || 'Failed to load demos'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    useEffect(() => {
        (async () => {
            try { const c = await listCourses({ status: 'all', per_page: 1000 }); setCourses((c?.courses?.data || []).map((x) => ({ value: String(x.id), label: x.title || x.name || `Course #${x.id}` }))); } catch { /* */ }
            try { const t = await listTeachers({ per_page: 1000 }); setTeachers((t?.teachers || []).map((x) => ({ value: String(x.id ?? x.userId), label: x.name || x.email || `Teacher ${x.id ?? x.userId}`, sub: x.email }))); } catch { /* */ }
        })();
    }, []);

    useEffect(() => {
        if (query.action === 'add') { setAddOpen(true); const next = { ...query }; delete next.action; setParams(next, { replace: true }); }
        // eslint-disable-next-line
    }, []);

    const courseName = useMemo(() => { const m = new Map(courses.map((c) => [c.value, c.label])); return (id) => { if (id == null || id === '') return '—'; return m.get(String(id)) || String(id); }; }, [courses]);
    const teacherNames = useMemo(() => { const m = new Map(teachers.map((o) => [o.value, o.label])); return (ids) => (Array.isArray(ids) ? ids : []).map((id) => m.get(String(id)) || String(id)); }, [teachers]);

    const onSearch = (e) => { e.preventDefault(); const term = (new FormData(e.target).get('search') || '').toString().trim(); const next = { ...query }; if (term) next.search = term; else delete next.search; delete next.page; setParams(next); };
    const handleDelete = async (id) => { try { await deleteDemo(id); toast.success('Demo deleted'); setConfirm(null); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); setConfirm(null); } };
    const handleToggle = async (id) => { try { await toggleDemoStatus(id); toast.success('Status updated'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } };
    const openEdit = async (id) => { try { const res = await getDemo(id); setEditItem(res.item); } catch (e) { toast.error(e.response?.data?.error || 'Failed to load demo'); } };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading demos…</p>
            </div>
        );
    }
    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load demos</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.demos.data;
    const isEmpty = rows.length === 0;
    const formProps = { courses, teachers };

    return (
        <div className="space-y-4">
            {/* Toolbar — shared professional layout across Marketing pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <MonitorPlay className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Demos</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Free live demo sessions students can book — course, schedule &amp; teachers.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="ol-form-control w-[220px] !pl-9" name="search" type="text" placeholder="Search by title" defaultValue={query.search || ''} />
                    </form>
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add Demo
                    </button>
                </div>
            </div>

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <MonitorPlay className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">{query.search ? 'No demos match your search' : 'No demos yet'}</p>
                    <p className="text-[13px] text-gray">{query.search ? 'Try a different title.' : 'Click “Add Demo” to create the first one.'}</p>
                </div>
            ) : (
                <>
                    <p className="text-gray text-[13px]">
                        Showing {rows.length} of {data.demos.total}
                        {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                    </p>

                    <div className="overflow-hidden rounded-ol-12 border border-ebordermuted bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b border-ebordermuted bg-gray-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Demo</th>
                                        <th className="px-4 py-3">Course</th>
                                        <th className="px-4 py-3">Schedule</th>
                                        <th className="px-4 py-3">Teachers</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((d) => {
                                        const tN = teacherNames(d.teacher_ids);
                                        return (
                                            <tr key={d.id} className="border-b border-ebordermuted last:border-0 align-middle transition-colors hover:bg-lightgreen/40">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lightgreen text-skin">
                                                            <MonitorPlay className="h-4 w-4" />
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="truncate font-semibold text-dark">{d.title}</div>
                                                            {d.meeting_link && (
                                                                <a href={d.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-skin hover:underline">
                                                                    <ExternalLink className="h-3 w-3" /> Meeting link
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-dark">
                                                        <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                                                        {courseName(d.course_id)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5 text-dark">
                                                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                        {fmtDateTime(d.start_at)}
                                                    </div>
                                                    <div className="mt-0.5 pl-5 text-[12px] text-gray">→ {fmtDateTime(d.end_at)}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {tN.length ? (
                                                        <span className="inline-flex items-center gap-1.5 text-dark" title={tN.join(', ')}>
                                                            <Users className="h-3.5 w-3.5 text-gray-400" />
                                                            <span className="truncate max-w-[180px]">{tN.slice(0, 2).join(', ')}{tN.length > 2 ? ` +${tN.length - 2}` : ''}</span>
                                                        </span>
                                                    ) : <span className="text-gray">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.status ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${d.status ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        {d.status ? 'Active' : 'Hidden'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button type="button" title="Edit" onClick={() => openEdit(d.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-gray-600 transition-colors hover:border-skin hover:bg-skin hover:text-white">
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button type="button" title={d.status ? 'Hide' : 'Show'} onClick={() => handleToggle(d.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-gray-600 transition-colors hover:border-skin hover:bg-skin hover:text-white">
                                                            {d.status ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        </button>
                                                        <button type="button" title="Delete" onClick={() => setConfirm(d.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-danger transition-colors hover:border-danger hover:bg-danger hover:text-white">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {data.demos.last_page > 1 && (
                        <nav className="mt-4">
                            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                {Array.from({ length: data.demos.last_page }, (_, i) => i + 1).map((p) => (
                                    <li key={p}>
                                        <button className={`e-page-link ${p === data.demos.current_page ? 'e-page-link-active' : ''}`} onClick={() => setParams({ ...query, page: p })}>{p}</button>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    )}
                </>
            )}

            {addOpen && (<Modal title="Add Demo" size="lg" onClose={() => setAddOpen(false)}><DemoForm {...formProps} submitLabel="Add demo" onSubmit={async (body) => { try { await storeDemo(body); toast.success('Demo created'); setAddOpen(false); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } }} /></Modal>)}
            {editItem && (<Modal title="Edit Demo" size="lg" onClose={() => setEditItem(null)}><DemoForm {...formProps} initial={editItem} submitLabel="Update demo" onSubmit={async (body) => { try { await updateDemo(editItem.id, body); toast.success('Demo updated'); setEditItem(null); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } }} /></Modal>)}
            {confirm && (<ConfirmDialog message="Delete this demo?" onCancel={() => setConfirm(null)} onConfirm={() => handleDelete(confirm)} />)}
        </div>
    );
}

function DemoForm({ initial, onSubmit, submitLabel, courses, teachers }) {
    const [form, setForm] = useState({
        title: initial?.title || '',
        course_id: initial?.course_id != null ? String(initial.course_id) : '',
        start_at: toLocalInput(initial?.start_at),
        end_at: toLocalInput(initial?.end_at),
        teacher_ids: (initial?.teacher_ids || []).map(String),
        meeting_link: initial?.meeting_link || '',
        status: initial?.status === undefined ? '1' : String(initial.status),
    });
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
    const submit = async (e) => {
        e.preventDefault(); setSubmitting(true);
        try {
            await onSubmit({
                title: form.title,
                course_id: form.course_id || null,
                start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
                end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
                teacher_ids: form.teacher_ids,
                meeting_link: form.meeting_link || null,
                status: form.status,
            });
        } finally { setSubmitting(false); }
    };
    return (
        <form onSubmit={submit}>
            <div className="mb-3"><label className="ol-form-label">Title<span className="text-danger ms-1">*</span></label><input className="ol-form-control" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Free Arduino Demo" /></div>
            <div className="mb-3"><label className="ol-form-label">Course</label><input className="ol-form-control" value={form.course_id} onChange={(e) => set('course_id', e.target.value)} placeholder="e.g. Robotics 101" /></div>
            <div className="mb-3 grid grid-cols-2 gap-3"><div><label className="ol-form-label">Start</label><input type="datetime-local" className="ol-form-control" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} /></div><div><label className="ol-form-label">End</label><input type="datetime-local" className="ol-form-control" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} /></div></div>
            <div className="mb-3"><MultiSelect label="Teachers" options={teachers} selected={form.teacher_ids} onChange={(v) => set('teacher_ids', v)} emptyHint="No teachers found." /></div>
            <div className="mb-3"><label className="ol-form-label">Meeting link</label><input className="ol-form-control" value={form.meeting_link} onChange={(e) => set('meeting_link', e.target.value)} placeholder="https://meet.google.com/…" /></div>
            <div className="mb-3"><label className="ol-form-label">Status</label><select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}><option value="1">Active</option><option value="0">Hidden</option></select></div>
            <div className="flex justify-end"><button type="submit" className="ol-btn-primary" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</button></div>
        </form>
    );
}
