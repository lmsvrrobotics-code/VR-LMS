import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { createBatch, listEligibleStudents, listEligibleTeachers } from '../../api/batch';
import { listCourses } from '../../api/course';

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

    // Optional course to attach to the batch on creation.
    const [courseId, setCourseId] = useState('');
    const [courses, setCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(true);

    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [studentsError, setStudentsError] = useState(null);
    const [search, setSearch] = useState('');

    // Teachers mirror the students picker: multi-select, own search + load state.
    const [selectedTeacherIds, setSelectedTeacherIds] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [teachersLoading, setTeachersLoading] = useState(true);
    const [teachersError, setTeachersError] = useState(null);
    const [teacherSearch, setTeacherSearch] = useState('');

    // Load selectable courses once. Paginated envelope: { courses: { data: [] } }.
    useEffect(() => {
        let alive = true;
        setCoursesLoading(true);
        listCourses({ per_page: 100 })
            .then((r) => { if (alive) setCourses(Array.isArray(r?.courses?.data) ? r.courses.data : []); })
            .catch(() => { if (alive) setCourses([]); })
            .finally(() => { if (alive) setCoursesLoading(false); });
        return () => { alive = false; };
    }, []);

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

    useEffect(() => {
        let alive = true;
        setTeachersLoading(true);
        setTeachersError(null);
        listEligibleTeachers(clgId)
            .then((r) => { if (alive) setTeachers(Array.isArray(r?.teachers) ? r.teachers : []); })
            .catch((e) => {
                if (alive) setTeachersError(e?.response?.data?.error || 'Failed to load teachers');
            })
            .finally(() => { if (alive) setTeachersLoading(false); });
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

    const filteredTeachers = useMemo(() => {
        const q = teacherSearch.trim().toLowerCase();
        if (!q) return teachers;
        return teachers.filter((t) =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.email || '').toLowerCase().includes(q)
        );
    }, [teachers, teacherSearch]);

    const toggle = (id) => {
        const s = String(id);
        setSelectedIds((cur) =>
            cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
        );
    };

    const toggleTeacher = (id) => {
        const s = String(id);
        setSelectedTeacherIds((cur) =>
            cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
        );
    };

    const reset = () => {
        setName('');
        setDescription('');
        setStartDate('');
        setIsActive(true);
        setCourseId('');
        setSelectedIds([]);
        setSelectedTeacherIds([]);
        setSearch('');
        setTeacherSearch('');
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) return setError('Batch name is required');
        // A batch needs a teacher. Checked here too so the admin gets the error
        // without a round-trip; the service enforces it authoritatively.
        if (selectedTeacherIds.length === 0) return setError('Pick at least one teacher');
        setSubmitting(true);
        try {
            await createBatch({
                name: name.trim(),
                description: description.trim() || null,
                start_date: startDate || null,
                is_active: isActive,
                courseId: courseId ? Number(courseId) : null,
                teacherIds: selectedTeacherIds,
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
            <div className="rounded-ol-12 border border-ebordermuted bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="border-b border-ebordermuted px-5 py-3.5">
                    <h4 className="m-0 text-[15px] font-semibold text-dark">Add New Batch</h4>
                    <p className="m-0 mt-0.5 text-[12px] text-gray">Name the batch, set its schedule, and pick the students to include.</p>
                </div>
                <div className="p-5 space-y-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <label className="block text-[13px] font-semibold text-dark mb-1">
                                Course{' '}
                                <span className="text-muted font-normal">(optional)</span>
                            </label>
                            <select
                                className="ol-form-control w-full"
                                value={courseId}
                                onChange={(e) => setCourseId(e.target.value)}
                                disabled={coursesLoading}
                            >
                                <option value="">
                                    {coursesLoading ? 'Loading courses…' : '— No course —'}
                                </option>
                                {courses.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.title}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-gray mt-1">
                                Attach a course now, or leave blank and add it later.
                            </p>
                        </div>
                    </div>

                    {/* Teachers — same multi-select treatment as Students below,
                        but required: a batch with no teacher can't be created. */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[13px] font-semibold text-dark m-0">
                                Teachers <span className="text-danger">*</span>{' '}
                                <span className="text-muted font-normal">
                                    ({selectedTeacherIds.length} selected)
                                </span>
                            </label>
                            <input
                                type="search"
                                placeholder="Search by name or email…"
                                className="ol-form-control w-[260px] text-[13px]"
                                value={teacherSearch}
                                onChange={(e) => setTeacherSearch(e.target.value)}
                            />
                        </div>

                        <div className="border border-border rounded-ol-8 max-h-[240px] overflow-y-auto">
                            {teachersLoading && (
                                <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                                    Loading teachers…
                                </p>
                            )}
                            {teachersError && (
                                <p className="px-4 py-6 text-center text-[12px] text-danger m-0">
                                    {teachersError}
                                </p>
                            )}
                            {!teachersLoading && !teachersError && filteredTeachers.length === 0 && (
                                <p className="px-4 py-6 text-center text-[12px] text-gray m-0">
                                    {teachers.length === 0
                                        ? 'No teachers yet. Add one from Users → Teacher.'
                                        : 'No teachers match your search.'}
                                </p>
                            )}
                            {!teachersLoading && !teachersError && filteredTeachers.map((t) => {
                                const id = String(t.id);
                                const picked = selectedTeacherIds.includes(id);
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
                                            onChange={() => toggleTeacher(id)}
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
                                                {s.unique_id && (
                                                    <span className="ml-2 font-mono text-[11px] font-normal text-gray">
                                                        {s.unique_id}
                                                    </span>
                                                )}
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

                    <div className="flex justify-end gap-2 border-t border-ebordermuted pt-4">
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
                            className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark disabled:opacity-60 disabled:cursor-not-allowed"
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
