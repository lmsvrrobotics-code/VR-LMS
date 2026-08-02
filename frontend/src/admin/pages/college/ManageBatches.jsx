import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { RefreshCw, Users2, Pencil, Trash2, CalendarRange, GraduationCap } from 'lucide-react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
    listBatches,
    getBatch,
    updateBatch,
    deleteBatch,
    addBatchMembers,
    removeBatchMember,
    listEligibleStudents,
    listEligibleTeachers,
    addBatchTeachers,
    removeBatchTeacher,
} from '../../api/batch';
import { listCourses } from '../../api/course';

// Manage Batches tab. Lists every batch for the caller's college, with
// edit/delete and a "manage students" drawer that lets the admin add or
// remove members.
export default function ManageBatches({ refreshKey, clgId }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editing, setEditing] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [managing, setManaging] = useState(null);
    const [viewingTeachers, setViewingTeachers] = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listBatches(clgId);
            setRows(Array.isArray(data?.batches) ? data.batches : []);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Failed to load batches');
        } finally {
            setLoading(false);
        }
    };

    // refreshKey is bumped by the parent every time a new batch is created
    // via the Add Batch tab, so this list stays fresh without a page reload.
    // Also reload when the selected college (clgId) changes (root admin).
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [refreshKey, clgId]);

    const handleDelete = async (id) => {
        try {
            await deleteBatch(id, clgId);
            toast.success('Batch deleted');
            setConfirmDelete(null);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to delete batch');
            setConfirmDelete(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-[13px] text-gray">
                    {rows.length} batch{rows.length === 1 ? '' : 'es'}
                    {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                </p>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-ol-8 border border-ebordermuted px-3 py-1.5 text-[13px] font-semibold text-gray-600 transition-colors hover:border-skin hover:text-skin disabled:opacity-60"
                    onClick={load}
                    disabled={loading}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-16 text-gray">
                    <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                    <p className="text-[14px]">Loading batches…</p>
                </div>
            )}

            {error && !loading && (
                <div className="rounded-ol-8 border border-ebordermuted bg-white py-10 px-6 text-center">
                    <p className="text-[14px] text-danger mb-3">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            )}

            {!loading && !error && rows.length === 0 && (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <Users2 className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">No batches yet</p>
                    <p className="text-[13px] text-gray">
                        Switch to <strong>Add Batch</strong> to create the first one.
                    </p>
                </div>
            )}

            {!loading && !error && rows.length > 0 && (
                <div className="overflow-hidden rounded-ol-12 border border-ebordermuted bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="overflow-x-auto">
                        <table className="e-table w-full">
                            <thead>
                                <tr>
                                    <th className="w-[60px]">#</th>
                                    <th className="w-[120px]">Batch ID</th>
                                    <th>Batch</th>
                                    <th className="w-[140px]">Members</th>
                                    <th className="w-[130px]">Teachers</th>
                                    <th className="w-[180px]">Schedule</th>
                                    <th className="w-[100px]">Status</th>
                                    <th className="w-[240px] text-right">Options</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((b, i) => (
                                    <tr key={b.id} className="transition-colors hover:bg-lightgreen/40">
                                        <td>{i + 1}</td>
                                        <td>
                                            <span className="font-mono text-[12px] text-dark">
                                                {b.unique_id || '—'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2.5">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lightgreen text-skin">
                                                    <Users2 className="h-[18px] w-[18px]" />
                                                </span>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[14px] font-semibold text-dark truncate">
                                                        {b.name}
                                                    </span>
                                                    {b.description && (
                                                        <span className="text-[12px] text-gray truncate max-w-[420px]">
                                                            {b.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="inline-flex items-center gap-1 rounded-full bg-skin/10 px-2 py-0.5 text-[12px] font-semibold text-skin">
                                                <Users2 className="h-3 w-3" />
                                                {b.member_count ?? 0}
                                            </span>
                                        </td>
                                        {/* Teacher count — click to manage the roster. Clickable even
                                            at 0 so a batch that somehow lost its teachers (or predates
                                            the teacher roster) can still be given one. */}
                                        <td>
                                            <button
                                                type="button"
                                                title="Manage teachers"
                                                onClick={() => setViewingTeachers(b)}
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold transition-colors ${
                                                    (b.teacher_count ?? 0) > 0
                                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                }`}
                                            >
                                                <GraduationCap className="h-3 w-3" />
                                                {b.teacher_count ?? 0}
                                            </button>
                                        </td>
                                        <td>
                                            <span className="inline-flex items-center gap-1.5 text-[12px] text-dark">
                                                <CalendarRange className="h-3.5 w-3.5 text-gray-400" />
                                                {formatRange(b.start_date, b.end_date)}
                                            </span>
                                        </td>
                                        <td>
                                            <StatusBadge active={b.is_active} />
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    title="Manage students"
                                                    className="inline-flex items-center gap-1 rounded-lg border border-ebordermuted px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 transition-colors hover:border-skin hover:bg-skin hover:text-white"
                                                    onClick={() => setManaging(b)}
                                                >
                                                    <Users2 className="h-3.5 w-3.5" /> Students
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Edit batch"
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-gray-600 transition-colors hover:border-skin hover:bg-skin hover:text-white"
                                                    onClick={() => setEditing(b)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Delete batch"
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-ebordermuted text-danger transition-colors hover:border-danger hover:bg-danger hover:text-white"
                                                    onClick={() => setConfirmDelete({ id: b.id, name: b.name })}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {editing && (
                <Modal title={`Edit Batch — ${editing.name}`} size="lg" onClose={() => setEditing(null)}>
                    <EditBatchForm
                        batch={editing}
                        clgId={clgId}
                        onSaved={() => { setEditing(null); load(); }}
                    />
                </Modal>
            )}

            {managing && (
                <Modal
                    title={`Students — ${managing.name}`}
                    size="xl"
                    onClose={() => { setManaging(null); load(); }}
                >
                    <ManageMembers
                        batchId={managing.id}
                        clgId={clgId}
                        onChanged={load}
                    />
                </Modal>
            )}

            {viewingTeachers && (
                <Modal
                    title={`Teachers — ${viewingTeachers.name}`}
                    size="xl"
                    onClose={() => { setViewingTeachers(null); load(); }}
                >
                    <ManageTeachers
                        batchId={viewingTeachers.id}
                        clgId={clgId}
                        onChanged={load}
                    />
                </Modal>
            )}

            {confirmDelete && (
                <ConfirmDialog
                    message={`Delete batch "${confirmDelete.name}"? Members will be unassigned but their accounts stay.`}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={() => handleDelete(confirmDelete.id)}
                />
            )}
        </div>
    );
}

function formatRange(start, end) {
    if (!start && !end) return '—';
    const fmt = (d) => {
        if (!d) return '?';
        try { return new Date(d).toLocaleDateString(); } catch { return d; }
    };
    if (start && end) return `${fmt(start)} → ${fmt(end)}`;
    if (start) return `from ${fmt(start)}`;
    return `until ${fmt(end)}`;
}

function StatusBadge({ active }) {
    // MySQL TINYINT(1) comes back as a number (0/1), not a real bool — strict
    // === false used to miss the 0 case. Treat any falsy value as inactive.
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
            {active ? 'Active' : 'Inactive'}
        </span>
    );
}

// ── Edit form ───────────────────────────────────────────────────────────────
function EditBatchForm({ batch, onSaved, clgId }) {
    const [name, setName] = useState(batch.name || '');
    const [description, setDescription] = useState(batch.description || '');
    const [startDate, setStartDate] = useState(batch.start_date || '');
    const [endDate, setEndDate] = useState(batch.end_date || '');
    // Course the batch is tied to. Its members see this course in their
    // "Enrolled Courses" tab, so being able to set/change it here is what makes
    // that tab populate. '' = no course attached. Coerce to string for the
    // <select> value (course_id comes back as a number).
    const [courseId, setCourseId] = useState(
        batch.course_id == null ? '' : String(batch.course_id)
    );
    const [courses, setCourses] = useState([]);
    // Coerce defensively — MySQL TINYINT(1) round-trips as 0/1, not true/false,
    // so `!== false` would always be true and the dropdown would always start
    // on "Active" even for an already-inactive batch.
    const [isActive, setIsActive] = useState(Boolean(batch.is_active));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Load active courses for the dropdown. Same envelope shape the Add Batch
    // form uses: { courses: { data: [...] } }.
    useEffect(() => {
        let alive = true;
        listCourses({ per_page: 200 })
            .then((res) => { if (alive) setCourses(res?.courses?.data || []); })
            .catch(() => { /* dropdown just stays empty on failure */ });
        return () => { alive = false; };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) return setError('Batch name is required');
        if (startDate && endDate && startDate > endDate) {
            return setError('End date must be after the start date');
        }
        setSubmitting(true);
        try {
            await updateBatch(batch.id, {
                name: name.trim(),
                description: description.trim() || null,
                start_date: startDate || null,
                end_date: endDate || null,
                is_active: isActive,
                // '' clears the course; a value assigns it. Sent as course_id
                // which the update service validates against the courses table.
                course_id: courseId === '' ? null : Number(courseId),
            }, clgId);
            toast.success('Batch updated');
            onSaved?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to update batch');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="px-3 py-2 rounded bg-red-50 text-red-700 text-[13px]">
                    {error}
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[13px] font-semibold text-dark mb-1">
                        Batch Name <span className="text-danger">*</span>
                    </label>
                    <input
                        type="text"
                        className="ol-form-control w-full"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-[13px] font-semibold text-dark mb-1">
                        Status
                    </label>
                    <select
                        className="ol-form-control w-full"
                        value={isActive ? '1' : '0'}
                        onChange={(e) => setIsActive(e.target.value === '1')}
                    >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-[13px] font-semibold text-dark mb-1">
                    Course
                </label>
                <select
                    className="ol-form-control w-full"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                >
                    <option value="">— No course —</option>
                    {courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                </select>
                <p className="mt-1 text-[12px] text-gray">
                    Batch members see this course in their <strong>Enrolled Courses</strong> tab.
                </p>
            </div>
            <div>
                <label className="block text-[13px] font-semibold text-dark mb-1">
                    Description
                </label>
                <textarea
                    className="ol-form-control w-full"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[13px] font-semibold text-dark mb-1">
                        Start Date
                    </label>
                    <input
                        type="date"
                        className="ol-form-control w-full"
                        value={startDate || ''}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-[13px] font-semibold text-dark mb-1">
                        End Date
                    </label>
                    <input
                        type="date"
                        className="ol-form-control w-full"
                        value={endDate || ''}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-ebordermuted pt-4">
                <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={submitting}
                >
                    {submitting ? 'Saving…' : 'Save changes'}
                </button>
            </div>
        </form>
    );
}

// ── Teacher manager (inside the modal) ──────────────────────────────────────
// Mirrors ManageMembers: current roster on the left (with Remove), add picker
// on the right. The server refuses to remove the last teacher, so a one-teacher
// batch shows the Remove button disabled with the reason.
function ManageTeachers({ batchId, onChanged, clgId }) {
    const [batch, setBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [allTeachers, setAllTeachers] = useState([]);
    const [search, setSearch] = useState('');
    const [pendingIds, setPendingIds] = useState([]);
    const [adding, setAdding] = useState(false);
    const [removingId, setRemovingId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [b, e] = await Promise.all([getBatch(batchId, clgId), listEligibleTeachers(clgId)]);
            setBatch(b?.batch || null);
            setAllTeachers(Array.isArray(e?.teachers) ? e.teachers : []);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load batch');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [batchId]);

    const teacherIds = useMemo(
        () => new Set((batch?.teachers || []).map((t) => String(t.id))),
        [batch],
    );

    const candidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allTeachers
            .filter((t) => !teacherIds.has(String(t.id)))
            .filter((t) => {
                if (!q) return true;
                return (
                    (t.name || '').toLowerCase().includes(q) ||
                    (t.email || '').toLowerCase().includes(q)
                );
            });
    }, [allTeachers, teacherIds, search]);

    const toggleCandidate = (id) => {
        const s = String(id);
        setPendingIds((cur) =>
            cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
        );
    };

    const handleAdd = async () => {
        if (pendingIds.length === 0) return;
        setAdding(true);
        try {
            const res = await addBatchTeachers(batchId, pendingIds, clgId);
            toast.success(res?.message || `Added ${pendingIds.length}`);
            setPendingIds([]);
            setSearch('');
            setBatch(res?.batch || batch);
            onChanged?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to add teachers');
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (uid) => {
        setRemovingId(uid);
        try {
            await removeBatchTeacher(batchId, uid, clgId);
            toast.success('Teacher removed');
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to remove teacher');
        } finally {
            setRemovingId(null);
        }
    };

    if (loading) {
        return <p className="text-[13px] text-gray text-center py-6">Loading…</p>;
    }
    if (error) {
        return (
            <div className="text-center py-6">
                <p className="text-[14px] text-danger mb-3">{error}</p>
                <button className="ol-btn-primary" onClick={load}>Retry</button>
            </div>
        );
    }

    const teachers = batch?.teachers || [];
    // A batch must keep at least one teacher (enforced server-side).
    const isLastTeacher = teachers.length <= 1;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Current roster */}
            <div className="ol-card rounded-ol-8">
                <div className="px-4 py-3 border-b border-border">
                    <h6 className="text-[13px] font-semibold text-dark m-0">
                        Current teachers{' '}
                        <span className="text-muted font-normal">({teachers.length})</span>
                    </h6>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                    {teachers.length === 0 && (
                        <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                            No teachers assigned yet.
                        </p>
                    )}
                    {teachers.map((t) => (
                        <div
                            key={t.id}
                            className="flex items-center gap-3 px-4 py-2 border-b border-border text-[13px]"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                                <GraduationCap className="h-4 w-4" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-dark font-medium m-0 truncate">
                                    {t.name || '—'}
                                    {t.unique_id && (
                                        <span className="ml-2 font-mono text-[11px] font-normal text-gray">
                                            {t.unique_id}
                                        </span>
                                    )}
                                </p>
                                <p className="text-gray text-[11px] m-0 truncate">
                                    {t.email}
                                    {t.expertise ? ` · ${t.expertise}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="text-[12px] text-danger font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleRemove(t.id)}
                                disabled={removingId === t.id || isLastTeacher}
                                title={isLastTeacher ? 'A batch must have at least one teacher' : 'Remove teacher'}
                            >
                                {removingId === t.id ? 'Removing…' : 'Remove'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add picker */}
            <div className="ol-card rounded-ol-8">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h6 className="text-[13px] font-semibold text-dark m-0">
                        Add teachers{' '}
                        <span className="text-muted font-normal">({pendingIds.length} picked)</span>
                    </h6>
                    <input
                        type="search"
                        placeholder="Search…"
                        className="ol-form-control w-[150px] text-[12px]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {candidates.length === 0 && (
                        <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                            {allTeachers.length === 0
                                ? 'No teachers yet. Add one from Users → Teacher.'
                                : 'No teachers left to add.'}
                        </p>
                    )}
                    {candidates.map((t) => {
                        const id = String(t.id);
                        const picked = pendingIds.includes(id);
                        return (
                            <label
                                key={id}
                                className={`flex items-start gap-2 px-4 py-2 border-b border-border cursor-pointer text-[13px] ${
                                    picked ? 'bg-emerald-50' : 'hover:bg-gray-50'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={picked}
                                    onChange={() => toggleCandidate(id)}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-dark font-medium m-0 truncate">
                                        {t.name || '—'}
                                        {t.unique_id && (
                                            <span className="ml-2 font-mono text-[11px] font-normal text-gray">
                                                {t.unique_id}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-gray text-[11px] m-0 truncate">
                                        {t.email}
                                        {t.expertise ? ` · ${t.expertise}` : ''}
                                    </p>
                                </div>
                            </label>
                        );
                    })}
                </div>
                <div className="px-4 py-3 border-t border-border">
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={handleAdd}
                        disabled={adding || pendingIds.length === 0}
                    >
                        {adding ? 'Adding…' : `Add ${pendingIds.length || ''}`.trim()}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Members manager (inside the modal) ──────────────────────────────────────
function ManageMembers({ batchId, onChanged, clgId }) {
    const [batch, setBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [allStudents, setAllStudents] = useState([]);
    const [search, setSearch] = useState('');
    const [pendingIds, setPendingIds] = useState([]);
    const [adding, setAdding] = useState(false);
    const [removingId, setRemovingId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [b, e] = await Promise.all([getBatch(batchId, clgId), listEligibleStudents(clgId)]);
            setBatch(b?.batch || null);
            setAllStudents(Array.isArray(e?.students) ? e.students : []);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load batch');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [batchId]);

    const memberIds = useMemo(() => new Set((batch?.students || []).map((s) => String(s.id))), [batch]);

    const candidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allStudents
            .filter((s) => !memberIds.has(String(s.id)))
            .filter((s) => {
                if (!q) return true;
                return (
                    (s.name || '').toLowerCase().includes(q) ||
                    (s.email || '').toLowerCase().includes(q)
                );
            });
    }, [allStudents, memberIds, search]);

    const toggleCandidate = (id) => {
        const s = String(id);
        setPendingIds((cur) =>
            cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
        );
    };

    const handleAdd = async () => {
        if (pendingIds.length === 0) return;
        setAdding(true);
        try {
            const res = await addBatchMembers(batchId, pendingIds, clgId);
            toast.success(res?.message || `Added ${pendingIds.length}`);
            setPendingIds([]);
            setSearch('');
            setBatch(res?.batch || batch);
            onChanged?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to add students');
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (uid) => {
        setRemovingId(uid);
        try {
            await removeBatchMember(batchId, uid, clgId);
            toast.success('Student removed');
            await load();
            onChanged?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to remove student');
        } finally {
            setRemovingId(null);
        }
    };

    if (loading) {
        return <p className="text-[13px] text-gray text-center py-6">Loading…</p>;
    }
    if (error) {
        return (
            <div className="text-center py-6">
                <p className="text-[14px] text-danger mb-3">{error}</p>
                <button className="ol-btn-primary" onClick={load}>Retry</button>
            </div>
        );
    }

    const members = batch?.students || [];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Current roster */}
            <div className="ol-card rounded-ol-8">
                <div className="px-4 py-3 border-b border-border">
                    <h6 className="text-[13px] font-semibold text-dark m-0">
                        Current members{' '}
                        <span className="text-muted font-normal">({members.length})</span>
                    </h6>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                    {members.length === 0 && (
                        <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                            No students in this batch yet.
                        </p>
                    )}
                    {members.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center gap-3 px-4 py-2 border-b border-border text-[13px]"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-dark font-medium m-0 truncate">
                                    {s.name || '—'}
                                </p>
                                <p className="text-gray text-[11px] m-0 truncate">
                                    {s.email}
                                    {s.graduationYear ? ` · ${s.graduationYear}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="text-[12px] text-danger font-semibold disabled:opacity-50"
                                onClick={() => handleRemove(s.id)}
                                disabled={removingId === s.id}
                            >
                                {removingId === s.id ? 'Removing…' : 'Remove'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add picker */}
            <div className="ol-card rounded-ol-8">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h6 className="text-[13px] font-semibold text-dark m-0">
                        Add students{' '}
                        <span className="text-muted font-normal">
                            ({pendingIds.length} picked)
                        </span>
                    </h6>
                    <input
                        type="search"
                        placeholder="Search…"
                        className="ol-form-control h-[32px] text-[12px] w-[180px]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {candidates.length === 0 && (
                        <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                            {allStudents.length === 0
                                ? 'No students at your school yet.'
                                : 'No eligible students left to add.'}
                        </p>
                    )}
                    {candidates.map((s) => {
                        const id = String(s.id);
                        const picked = pendingIds.includes(id);
                        return (
                            <label
                                key={id}
                                className={`flex items-start gap-2 px-4 py-2 border-b border-border cursor-pointer text-[13px] ${
                                    picked ? 'bg-emerald-50' : 'hover:bg-gray-50'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={picked}
                                    onChange={() => toggleCandidate(id)}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-dark font-medium m-0 truncate">
                                        {s.name || '—'}
                                    </p>
                                    <p className="text-gray text-[11px] m-0 truncate">
                                        {s.email}
                                    </p>
                                </div>
                            </label>
                        );
                    })}
                </div>
                <div className="px-4 py-3 border-t border-border flex justify-end">
                    <button
                        type="button"
                        className="ol-btn-primary text-[13px] disabled:opacity-50"
                        onClick={handleAdd}
                        disabled={adding || pendingIds.length === 0}
                    >
                        {adding ? 'Adding…' : `Add ${pendingIds.length || ''} student(s)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
