import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    Plus, Search, GraduationCap, Pencil, Eye, EyeOff, Trash2,
    Calendar, BookOpen, Users, Video,
} from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import { listClasses, storeClass, updateClass, deleteClass, toggleClassStatus, getClass } from '../../api/class';
import { listCourses } from '../../api/course';
import { listTeachers } from '../../api/teacher';
import { listStudents } from '../../api/student';
import { MultiSelect, fmtDateTime, toLocalInput } from '../../components/scheduling';

/**
 * Manage Classes — admin CRUD for class sessions (name + course + time window
 * + teacher(s) + student(s) + meeting link). ?action=add auto-opens Add.
 *
 * UI mirrors the professional Marketing pages (Demo Videos / Demos): icon-badge
 * toolbar header, search-with-icon, gradient primary action, and a clean
 * card-style table with status pills and icon actions.
 */
export default function ClassesIndex() {
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);

    const query = Object.fromEntries(params.entries());

    const load = async () => {
        setLoading(true); setError(null);
        try { setData(await listClasses({ page: query.page, search: query.search })); }
        catch (err) { setError(err?.response?.data?.error || 'Failed to load classes'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    useEffect(() => {
        (async () => {
            try { const c = await listCourses({ status: 'all', per_page: 1000 }); setCourses((c?.courses?.data || []).map((x) => ({ value: String(x.id), label: x.title || x.name || `Course #${x.id}` }))); } catch { /* */ }
            try { const t = await listTeachers({ per_page: 1000 }); setTeachers((t?.teachers || []).map((x) => ({ value: String(x.id ?? x.userId), label: x.name || x.email || `Teacher ${x.id ?? x.userId}`, sub: x.email }))); } catch { /* */ }
            try { const s = await listStudents({ per_page: 1000 }); setStudents((s?.students || []).map((x) => ({ value: String(x.id), label: x.name || x.email || `Student ${x.id}`, sub: x.email }))); } catch { /* */ }
        })();
    }, []);

    useEffect(() => {
        if (query.action === 'add') { setAddOpen(true); const next = { ...query }; delete next.action; setParams(next, { replace: true }); }
        // eslint-disable-next-line
    }, []);

    const courseName = useMemo(() => { const m = new Map(courses.map((c) => [c.value, c.label])); return (id) => (id == null ? '—' : (m.get(String(id)) || `Course #${id}`)); }, [courses]);
    const teacherNames = useMemo(() => { const m = new Map(teachers.map((o) => [o.value, o.label])); return (ids) => (Array.isArray(ids) ? ids : []).map((id) => m.get(String(id)) || String(id)); }, [teachers]);
    const studentNames = useMemo(() => { const m = new Map(students.map((o) => [o.value, o.label])); return (ids) => (Array.isArray(ids) ? ids : []).map((id) => m.get(String(id)) || String(id)); }, [students]);

    const onSearch = (e) => { e.preventDefault(); const term = (new FormData(e.target).get('search') || '').toString().trim(); const next = { ...query }; if (term) next.search = term; else delete next.search; delete next.page; setParams(next); };
    const handleDelete = async (id) => { try { await deleteClass(id); toast.success('Class deleted'); setConfirm(null); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); setConfirm(null); } };
    const handleToggle = async (id) => { try { await toggleClassStatus(id); toast.success('Status updated'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } };
    const openEdit = async (id) => { try { const res = await getClass(id); setEditItem(res.item); } catch (e) { toast.error(e.response?.data?.error || 'Failed to load class'); } };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading classes…</p>
            </div>
        );
    }
    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load classes</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.classes.data;
    const isEmpty = rows.length === 0;
    const formProps = { courses, teachers, students };

    return (
        <div className="space-y-4">
            {/* Toolbar — shared professional layout across Marketing/Scheduling pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <GraduationCap className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Classes</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Live class sessions — course, schedule, teachers &amp; meeting link.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="ol-form-control w-[220px] !pl-9" name="search" type="text" placeholder="Search by class name" defaultValue={query.search || ''} />
                    </form>
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add Class
                    </button>
                </div>
            </div>

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <GraduationCap className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">{query.search ? 'No classes match your search' : 'No classes yet'}</p>
                    <p className="text-[13px] text-gray">{query.search ? 'Try a different name.' : 'Click “Add Class” to create the first one.'}</p>
                </div>
            ) : (
                <>
                    <p className="text-gray text-[13px]">
                        Showing {rows.length} of {data.classes.total}
                        {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                    </p>

                    <div className="overflow-hidden rounded-ol-12 border border-ebordermuted bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b border-ebordermuted bg-gray-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Class</th>
                                        <th className="px-4 py-3">Course</th>
                                        <th className="px-4 py-3">Schedule</th>
                                        <th className="px-4 py-3">Teachers</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((c) => {
                                        const tN = teacherNames(c.teacher_ids);
                                        return (
                                            <tr key={c.id} className="border-b border-ebordermuted last:border-0 align-middle transition-colors hover:bg-lightgreen/40">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lightgreen text-skin">
                                                            <GraduationCap className="h-4 w-4" />
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="truncate font-semibold text-dark">{c.name}</div>
                                                            {c.meeting_link && (
                                                                <a href={c.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-skin hover:underline">
                                                                    <Video className="h-3 w-3" /> Join meeting
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-dark">
                                                        <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                                                        {courseName(c.course_id)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5 text-dark">
                                                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                        {fmtDateTime(c.start_at)}
                                                    </div>
                                                    <div className="mt-0.5 pl-5 text-[12px] text-gray">→ {fmtDateTime(c.end_at)}</div>
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
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${c.status ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        {c.status ? 'Active' : 'Hidden'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button type="button" title="Edit" onClick={() => openEdit(c.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-gray-600 transition-colors hover:border-skin hover:bg-skin hover:text-white">
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button type="button" title={c.status ? 'Hide' : 'Show'} onClick={() => handleToggle(c.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-gray-600 transition-colors hover:border-skin hover:bg-skin hover:text-white">
                                                            {c.status ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        </button>
                                                        <button type="button" title="Delete" onClick={() => setConfirm(c.id)}
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

                    {data.classes.last_page > 1 && (
                        <nav className="mt-4">
                            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                {Array.from({ length: data.classes.last_page }, (_, i) => i + 1).map((p) => (
                                    <li key={p}>
                                        <button className={`e-page-link ${p === data.classes.current_page ? 'e-page-link-active' : ''}`} onClick={() => setParams({ ...query, page: p })}>{p}</button>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    )}
                </>
            )}

            {addOpen && (<Modal title="Add Class" size="lg" onClose={() => setAddOpen(false)}><ClassForm {...formProps} submitLabel="Add class" onSubmit={async (body) => { try { await storeClass(body); toast.success('Class created'); setAddOpen(false); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } }} /></Modal>)}
            {editItem && (<Modal title="Edit Class" size="lg" onClose={() => setEditItem(null)}><ClassForm {...formProps} initial={editItem} submitLabel="Update class" onSubmit={async (body) => { try { await updateClass(editItem.id, body); toast.success('Class updated'); setEditItem(null); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } }} /></Modal>)}
            {confirm && (<ConfirmDialog message="Delete this class?" onCancel={() => setConfirm(null)} onConfirm={() => handleDelete(confirm)} />)}
        </div>
    );
}

function ClassForm({ initial, onSubmit, submitLabel, courses, teachers, students }) {
    const [form, setForm] = useState({
        name: initial?.name || '',
        course_id: initial?.course_id != null ? String(initial.course_id) : '',
        start_at: toLocalInput(initial?.start_at),
        end_at: toLocalInput(initial?.end_at),
        teacher_ids: (initial?.teacher_ids || []).map(String),
        meeting_link: initial?.meeting_link || '',
        status: initial?.status === undefined ? '1' : String(initial.status),
    });
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    // Teachers assigned (via Teacher Assignments) to the selected course.
    // Changing the course resets the picked teachers so only assigned ones apply.
    const onCourseChange = (v) => setForm((s) => ({ ...s, course_id: v, teacher_ids: [] }));

    // All teachers available (teaching assignment feature removed - no longer filtered by course)
    const teacherOptions = useMemo(() => teachers, [teachers]);
    const teacherHint = 'Select teacher(s) for this class';

    const submit = async (e) => {
        e.preventDefault(); setSubmitting(true);
        try {
            await onSubmit({
                name: form.name,
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
            <div className="mb-3"><label className="ol-form-label">Class name<span className="text-danger ms-1">*</span></label><input className="ol-form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Batch A — Lesson 3" /></div>
            <div className="mb-3"><label className="ol-form-label">Course</label><select className="ol-form-control" value={form.course_id} onChange={(e) => onCourseChange(e.target.value)}><option value="">— Select a course —</option>{courses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div className="mb-3 grid grid-cols-2 gap-3"><div><label className="ol-form-label">Start</label><input type="datetime-local" className="ol-form-control" value={form.start_at} onChange={(e) => set('start_at', e.target.value)} /></div><div><label className="ol-form-label">End</label><input type="datetime-local" className="ol-form-control" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} /></div></div>
            <div className="mb-3">
                <MultiSelect label="Teachers" options={teacherOptions} selected={form.teacher_ids} onChange={(v) => set('teacher_ids', v)} emptyHint={teacherHint} />
            </div>
            <div className="mb-3"><label className="ol-form-label">Meeting link</label><input className="ol-form-control" value={form.meeting_link} onChange={(e) => set('meeting_link', e.target.value)} placeholder="https://meet.google.com/…" /></div>
            <div className="mb-3"><label className="ol-form-label">Status</label><select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}><option value="1">Active</option><option value="0">Hidden</option></select></div>
            <div className="flex justify-end"><button type="submit" className="ol-btn-primary" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</button></div>
        </form>
    );
}
