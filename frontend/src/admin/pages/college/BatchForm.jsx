import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { createBatch, listEligibleStudents } from '../../api/batch';

// Form used by the Add Batch tab. Mirrors ProgramForm's general shape
// (title/description plus a multi-select for membership) but the picker is
// inline rather than reusing CollegeMultiSelect — students aren't a global
// pool, they're the caller's college roster.
export default function BatchForm({ onCreated, clgId }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [studentsError, setStudentsError] = useState(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let alive = true;
        setStudentsLoading(true);
        setStudentsError(null);
        listEligibleStudents(clgId)
            .then((r) => { if (alive) setStudents(Array.isArray(r?.students) ? r.students : []); })
            .catch((e) => {
                if (alive) setStudentsError(e?.response?.data?.error || 'Failed to load students');
            })
            .finally(() => { if (alive) setStudentsLoading(false); });
        return () => { alive = false; };
    }, [clgId]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return students;
        return students.filter((s) =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q)
        );
    }, [students, search]);

    const toggle = (id) => {
        const s = String(id);
        setSelectedIds((cur) =>
            cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
        );
    };

    const reset = () => {
        setName('');
        setDescription('');
        setStartDate('');
        setIsActive(true);
        setSelectedIds([]);
        setSearch('');
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) return setError('Batch name is required');
        setSubmitting(true);
        try {
            await createBatch({
                name: name.trim(),
                description: description.trim() || null,
                start_date: startDate || null,
                is_active: isActive,
                userIds: selectedIds,
            }, clgId);
            toast.success('Batch created');
            reset();
            onCreated?.();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to create batch');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-12px px-20px my-3">
                    <h4 className="text-[16px] font-semibold text-dark m-0 flex items-center gap-2">
                        <i className="fi-rr-users-alt" />
                        Add New Batch
                    </h4>
                </div>
            </div>

            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body p-4 space-y-4">
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
                                placeholder="e.g. AI Frontier - Jan 2026"
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
                            Description
                        </label>
                        <textarea
                            className="ol-form-control w-full"
                            rows={2}
                            placeholder="Short note about this batch"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-[13px] font-semibold text-dark mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            className="ol-form-control w-full"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[13px] font-semibold text-dark m-0">
                                Students{' '}
                                <span className="text-muted font-normal">
                                    ({selectedIds.length} selected)
                                </span>
                            </label>
                            <input
                                type="search"
                                placeholder="Search by name or email…"
                                className="ol-form-control w-[260px] text-[13px]"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="border border-border rounded-ol-8 max-h-[320px] overflow-y-auto">
                            {studentsLoading && (
                                <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                                    Loading students…
                                </p>
                            )}
                            {studentsError && (
                                <p className="px-4 py-6 text-center text-[12px] text-danger m-0">
                                    {studentsError}
                                </p>
                            )}
                            {!studentsLoading && !studentsError && filtered.length === 0 && (
                                <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                                    {students.length === 0
                                        ? 'No students at your school yet.'
                                        : 'No students match your search.'}
                                </p>
                            )}
                            {!studentsLoading && !studentsError && filtered.map((s) => {
                                const id = String(s.id);
                                const picked = selectedIds.includes(id);
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
                                            onChange={() => toggle(id)}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-dark font-medium m-0 truncate">
                                                {s.name || '—'}
                                            </p>
                                            <p className="text-gray text-[11px] m-0 truncate">
                                                {s.email}
                                                {s.graduationYear ? ` · ${s.graduationYear}` : ''}
                                            </p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-gray mt-2">
                            Students can also be added later from Manage Batches.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="ol-btn-light"
                            onClick={reset}
                            disabled={submitting}
                        >
                            Reset
                        </button>
                        <button
                            type="submit"
                            className="ol-btn-primary"
                            disabled={submitting}
                        >
                            {submitting ? 'Creating…' : 'Create Batch'}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
}
