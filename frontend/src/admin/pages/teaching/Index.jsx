import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    listAssignments,
    createAssignment,
    deleteAssignment,
    getRoster,
    addMembers,
    removeMember,
    listReleases,
    releaseLessons,
    revokeRelease,
} from '../../api/teaching';
import { listCourses } from '../../api/course';
import { listTeachers } from '../../api/teacher';
import { listCurriculum } from '../../api/curriculum';
import { listBatchesByColleges } from '../../api/batch';
import { listStudents } from '../../api/student';
import { getStoredUser } from '../../api/auth';
import Modal from '../../components/Modal';
import { getToken } from '../../api/client';

// Decode JWT payload without a lib (same approach AdminLayout uses) so we can
// tell admin vs teacher for which controls to show. Security is enforced on the
// server regardless — this only shapes the UI.
const decodeJwt = (token) => {
    try {
        const part = token.split('.')[1];
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch (_e) {
        return null;
    }
};

const unwrap = (res, key) =>
    Array.isArray(res) ? res : (res?.[key] || res?.data || []);

// The admin course list comes back as a Laravel-style paginator nested under
// `courses`: { courses: { data: [...], total, ... } }. Pull the array out of
// whichever shape we get so the course dropdown actually populates.
const unwrapCourses = (res) => {
    const c = res?.courses;
    if (Array.isArray(c)) return c;
    if (c && Array.isArray(c.data)) return c.data;
    if (Array.isArray(res?.data)) return res.data;
    return Array.isArray(res) ? res : [];
};

// -- New assignment form (admin only) --------------------------------------
function NewAssignment({ onCreated }) {
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [courseId, setCourseId] = useState('');
    const [teacherId, setTeacherId] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        listCourses({ per_page: 1000 })
            .then((r) => setCourses(unwrapCourses(r).map((c) => ({ id: c.id, title: c.title || c.name || `Course #${c.id}` }))))
            .catch(() => setCourses([]));
        listTeachers({ per_page: 1000 })
            .then((r) => setTeachers(unwrap(r, 'teachers').map((t) => ({ id: t.id || t.userId, name: t.name || t.email }))))
            .catch(() => setTeachers([]));
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        if (!courseId || !teacherId) return toast.error('Pick a course and a teacher');
        setSaving(true);
        try {
            await createAssignment({ course_id: courseId, teacher_id: teacherId });
            toast.success('Course assigned to teacher');
            setCourseId(''); setTeacherId('');
            onCreated?.();
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to assign');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="ol-card rounded-ol-8 mb-3">
            <div className="ol-card-body px-5 py-4 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[12px] text-gray">Course</label>
                    <select className="ol-form-control text-[13px] min-w-[220px]" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                        <option value="">— Select course —</option>
                        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[12px] text-gray">Teacher</label>
                    <select className="ol-form-control text-[13px] min-w-[220px]" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                        <option value="">— Select teacher —</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-ol-8 bg-primary text-white text-[13px] font-semibold disabled:opacity-60">
                    {saving ? 'Assigning…' : 'Assign course → teacher'}
                </button>
            </div>
        </form>
    );
}

// -- Roster card (admin edits; teacher views) ------------------------------
function RosterCard({ assignment, canEdit }) {
    const [data, setData] = useState(null);
    const [batches, setBatches] = useState([]);
    const [students, setStudents] = useState([]);
    const [batchSel, setBatchSel] = useState('');
    const [studentSel, setStudentSel] = useState('');
    const [showStudents, setShowStudents] = useState(false);

    const load = () => getRoster(assignment.id).then(setData).catch(() => setData({ students: [], members: [] }));
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [assignment.id]);

    useEffect(() => {
        if (!canEdit) return;
        const clg = assignment.clg_id;
        listBatchesByColleges(clg ? [clg] : [])
            .then((r) => setBatches(unwrap(r, 'batches')))
            .catch(() => setBatches([]));
        // ALL students (not college-scoped) — assignments can target B2C students
        // with no school. The college-scoped eligible-students endpoint returned
        // nothing for school-less students.
        listStudents({ per_page: 1000 })
            .then((r) => setStudents(r?.students || unwrap(r, 'students')))
            .catch(() => setStudents([]));
    }, [assignment.id, assignment.clg_id, canEdit]);

    const addBatch = async () => {
        if (!batchSel) return;
        try { await addMembers(assignment.id, { batchIds: [batchSel] }); toast.success('Batch added'); setBatchSel(''); load(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };
    const addStudent = async () => {
        if (!studentSel) return;
        try { await addMembers(assignment.id, { studentIds: [studentSel] }); toast.success('Student added'); setStudentSel(''); load(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };
    const remove = async (m) => {
        try { await removeMember(assignment.id, { member_type: m.member_type, member_ref: m.member_ref }); load(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };

    // Remove a single student from the roster (DB). Works for individually-added
    // students; a student who came in via a batch can't be removed one-by-one —
    // the batch must be removed instead (we detect and tell the admin).
    const removeStudent = async (s) => {
        const addedIndividually = (data?.members || []).some(
            (m) => m.member_type === 'student' && String(m.member_ref) === String(s.id),
        );
        if (!addedIndividually) {
            toast.info('This student was added via a batch — remove the batch to remove them.');
            return;
        }
        try {
            await removeMember(assignment.id, { member_type: 'student', member_ref: String(s.id) });
            toast.success('Student removed');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to remove student');
        }
    };

    const members = data?.members || [];
    const batchLabel = (ref) => batches.find((b) => String(b.id) === String(ref))?.name || `Batch #${ref}`;

    return (
        <div className="ol-card rounded-ol-8 mb-3">
            <div className="ol-card-body px-5 py-4">
                <h5 className="text-[14px] font-semibold text-dark mb-3">Roster ({data?.member_count ?? 0} students)</h5>

                {/* A rosterless assignment is "global": its released lessons are
                    visible to EVERY student of the course, not a fixed roster.
                    Spell that out so an empty roster doesn't look like a mistake. */}
                {data && (data.member_count ?? 0) === 0 && (
                    <p className="text-[12px] text-skin bg-lightgreen rounded-ol-8 px-3 py-2 mb-3">
                        No roster — released lessons are visible to <strong>all</strong> students enrolled in this course. Add a batch or individual students only if you want to limit access to a specific group.
                    </p>
                )}

                {canEdit && (
                    <div className="flex flex-wrap gap-3 mb-4">
                        <div className="flex items-end gap-2">
                            <select className="ol-form-control text-[13px] min-w-[180px]" value={batchSel} onChange={(e) => setBatchSel(e.target.value)}>
                                <option value="">— Add a batch —</option>
                                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <button type="button" onClick={addBatch} className="px-3 py-2 rounded-ol-8 bg-lightgreen text-skin text-[13px] font-semibold">Add batch</button>
                        </div>
                        <div className="flex items-end gap-2">
                            <select className="ol-form-control text-[13px] min-w-[180px]" value={studentSel} onChange={(e) => setStudentSel(e.target.value)}>
                                <option value="">— Add an individual student —</option>
                                {students.map((s) => <option key={s.id || s.userId} value={s.id || s.userId}>{s.name || s.email}</option>)}
                            </select>
                            <button type="button" onClick={addStudent} className="px-3 py-2 rounded-ol-8 bg-lightgreen text-skin text-[13px] font-semibold">Add student</button>
                        </div>
                    </div>
                )}

                {/* Batch chips only — individual students are listed (with ID +
                    Remove) in the View Students modal, so we no longer show
                    redundant per-student id chips here. Batches still need their
                    own chip since the modal can't remove a whole batch. */}
                {members.some((m) => m.member_type === 'batch') && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {members.filter((m) => m.member_type === 'batch').map((m) => (
                            <span key={`${m.member_type}-${m.member_ref}`} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-bodybg text-[12px] text-dark border border-ebordermuted">
                                {`📦 ${batchLabel(m.member_ref)}`}
                                {canEdit && <button type="button" onClick={() => remove(m)} className="text-gray hover:text-red-600">✕</button>}
                            </span>
                        ))}
                    </div>
                )}

                {/* Resolved students — opened in a modal via View Students */}
                <button
                    type="button"
                    onClick={() => setShowStudents(true)}
                    className="text-[13px] text-skin font-semibold hover:underline"
                >
                    View Students ({(data?.students || []).length})
                </button>

                {showStudents && (
                    <Modal title="Students in this roster" onClose={() => setShowStudents(false)}>
                        {(data?.students || []).length === 0 ? (
                            <p className="text-[13px] text-gray py-6 text-center">
                                No students yet. Add a batch or individual students above.
                            </p>
                        ) : (
                            <div className="max-h-[60vh] overflow-y-auto">
                                <p className="text-[12px] text-gray mb-2">
                                    {data.students.length} student{data.students.length === 1 ? '' : 's'} in this roster.
                                </p>
                                <table className="e-table w-full">
                                    <thead>
                                        <tr>
                                            <th className="w-[50px]">#</th>
                                            <th>Student ID</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                            {canEdit && <th className="w-[90px]">Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.students.map((s, i) => (
                                            <tr key={s.id}>
                                                <td>{i + 1}</td>
                                                <td className="text-[12px] text-gray font-mono">{s.id}</td>
                                                <td className="text-dark">{s.name || '—'}</td>
                                                <td className="text-gray text-[13px]">{s.email || '—'}</td>
                                                {canEdit && (
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="text-[12px] text-danger font-semibold hover:underline"
                                                            onClick={() => removeStudent(s)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Modal>
                )}
            </div>
        </div>
    );
}

// -- Release card (admin + teacher) ----------------------------------------
function ReleaseCard({ assignment, onChanged }) {
    const [sections, setSections] = useState([]);
    const [releases, setReleases] = useState([]);
    const [sel, setSel] = useState(() => new Set());
    const [busy, setBusy] = useState(false);

    const loadReleases = () => listReleases(assignment.id).then((r) => setReleases(unwrap(r, 'releases'))).catch(() => setReleases([]));
    useEffect(() => {
        listCurriculum(assignment.course_id)
            .then((r) => setSections(unwrap(r, 'sections')))
            .catch(() => setSections([]));
        loadReleases();
        setSel(new Set());
        /* eslint-disable-next-line */
    }, [assignment.id, assignment.course_id]);

    // Active (not-revoked) released lesson ids + a lesson_id -> release record map
    // so each lesson row can show its own Revoke button inline.
    const releasedIds = useMemo(
        () => new Set(releases.filter((r) => !r.revoked_at).map((r) => Number(r.lesson_id))),
        [releases],
    );
    const releaseByLesson = useMemo(() => {
        const map = {};
        releases.filter((r) => !r.revoked_at).forEach((r) => { map[Number(r.lesson_id)] = r; });
        return map;
    }, [releases]);

    const toggle = (id) => setSel((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const doRelease = async () => {
        const ids = [...sel];
        if (!ids.length) return toast.error('Tick the lessons to release');
        setBusy(true);
        try {
            await releaseLessons(assignment.id, { lessonIds: ids });
            toast.success(`Released ${ids.length} lesson(s) to the roster`);
            setSel(new Set());
            loadReleases();
            onChanged?.(); // refresh the list count + Student progress panel
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to release');
        } finally {
            setBusy(false);
        }
    };

    const doRevoke = async (rel) => {
        try { await revokeRelease(assignment.id, rel.id); toast.success('Access revoked'); loadReleases(); onChanged?.(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };

    return (
        <div className="ol-card rounded-ol-8">
            <div className="ol-card-body px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                    <h5 className="text-[14px] font-semibold text-dark m-0">Release lessons (daily drip)</h5>
                    <button type="button" onClick={doRelease} disabled={busy || sel.size === 0} className="px-4 py-2 rounded-ol-8 bg-primary text-white text-[13px] font-semibold disabled:opacity-60">
                        {busy ? 'Releasing…' : `Release selected (${sel.size})`}
                    </button>
                </div>

                {sections.length === 0 ? (
                    <p className="text-[13px] text-gray">This course has no lessons yet.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {sections.map((sec) => (
                            <div key={sec.id}>
                                <p className="text-[12px] font-semibold text-gray uppercase tracking-wide mb-1">{sec.title || `Section ${sec.id}`}</p>
                                <ul className="list-none p-0 m-0 flex flex-col gap-1">
                                    {(sec.lessons || []).map((l) => {
                                        const isReleased = releasedIds.has(Number(l.id));
                                        return (
                                            <li key={l.id} className="flex items-center gap-2 text-[13px] px-2 py-1 rounded bg-bodybg">
                                                <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} disabled={isReleased} title={isReleased ? 'Already released — use Revoke' : ''} />
                                                <span className="text-dark">{l.title}</span>
                                                <span className="text-[11px] text-gray">· {l.lesson_type}</span>
                                                {isReleased && (
                                                    <span className="ml-auto flex items-center gap-3">
                                                        <span className="text-[11px] text-skin font-semibold">● released</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => { const rel = releaseByLesson[Number(l.id)]; if (rel) doRevoke(rel); }}
                                                            className="text-[11px] text-red-600 font-semibold hover:underline"
                                                        >
                                                            Revoke
                                                        </button>
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}


export default function TeachingAssignmentsIndex() {
    const claims = useMemo(() => { const t = getToken() || localStorage.getItem('accessToken'); return t ? decodeJwt(t) : null; }, []);
    const user = useMemo(() => getStoredUser(), []);
    const role = claims?.role || claims?.user_metadata?.role || claims?.app_metadata?.role || user?.role || '';
    const isAdmin = claims?.is_root_admin === true || role === 'root' || role === 'admin';

    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [params, setParams] = useSearchParams();
    // ?tab=add → show ONLY the "assign course → teacher" form. Otherwise show
    // the manage view (list grouped by teacher + roster/release/progress).
    const showAdd = isAdmin && params.get('tab') === 'add';

    const load = async () => {
        setLoading(true);
        try {
            const res = await listAssignments();
            const rows = unwrap(res, 'assignments');
            setAssignments(rows);
            setSelectedId((cur) => cur || rows[0]?.id || null);
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to load assignments');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const removeAssignment = async (id) => {
        if (!window.confirm('Remove this assignment (roster + releases)?')) return;
        try { await deleteAssignment(id); toast.success('Assignment removed'); setSelectedId(null); load(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };

    const selected = assignments.find((a) => a.id === selectedId) || null;

    return (
        <div>
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body px-5 py-4">
                    <h4 className="text-[16px] font-semibold text-dark m-0">{isAdmin ? 'Teacher Assignments' : 'My Classes'}</h4>
                    <p className="text-[13px] text-gray mt-1">
                        {isAdmin
                            ? 'Assign a course to a teacher, then add their students (a whole batch or individuals). The teacher releases lessons day by day.'
                            : 'Release today’s lessons to your students after each class. Students only see what you release.'}
                    </p>
                </div>
            </div>

            {showAdd ? (
                <>
                    <NewAssignment onCreated={async () => { await load(); setParams({}); }} />
                    <p className="mt-2">
                        <button type="button" onClick={() => setParams({})} className="text-[13px] text-skin font-semibold hover:underline">← View all assignments</button>
                    </p>
                </>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
                {/* List */}
                <div className="ol-card rounded-ol-8 h-fit">
                    <div className="ol-card-body px-3 py-3">
                        {loading ? (
                            <p className="text-[13px] text-gray px-2 py-2">Loading…</p>
                        ) : assignments.length === 0 ? (
                            <p className="text-[13px] text-gray px-2 py-2">No assignments yet.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {/* Grouped by TEACHER → their assigned courses, so you can
                                    see at a glance which courses each teacher owns. */}
                                {Object.entries(
                                    assignments.reduce((acc, a) => {
                                        const key = a.teacher?.name || a.teacher_id || '—';
                                        (acc[key] = acc[key] || []).push(a);
                                        return acc;
                                    }, {})
                                ).map(([teacherName, items]) => (
                                    <div key={teacherName}>
                                        <p className="text-[11px] uppercase tracking-wide text-gray font-semibold px-1 mb-1">
                                            👤 {teacherName} · {items.length} course{items.length > 1 ? 's' : ''}
                                        </p>
                                        <ul className="list-none p-0 m-0 flex flex-col gap-1">
                                            {items.map((a) => (
                                                <li key={a.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedId(a.id)}
                                                        className={`w-full text-left px-3 py-2 rounded-ol-8 transition-colors ${a.id === selectedId ? 'bg-lightgreen text-skin' : 'hover:bg-bodybg text-dark'}`}
                                                    >
                                                        <span className="block text-[13px] font-semibold">{a.course_title || `Course #${a.course_id}`}</span>
                                                        <span className="block text-[12px] text-gray">
                                                            {(a.individual_count || 0)} student{(a.individual_count || 0) === 1 ? '' : 's'} · {(a.batch_count || 0)} batch · {(a.released_lesson_count || 0)} released
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Detail */}
                <div>
                    {!selected ? (
                        <div className="ol-card rounded-ol-8"><div className="ol-card-body py-12 text-center text-[13px] text-gray">Select an assignment to manage its roster and releases.</div></div>
                    ) : (
                        <>
                            {isAdmin && (
                                <div className="flex justify-end mb-2">
                                    <button type="button" onClick={() => removeAssignment(selected.id)} className="text-[12px] text-red-600 hover:underline">Remove assignment</button>
                                </div>
                            )}
                            <RosterCard key={`roster-${selected.id}`} assignment={selected} canEdit={isAdmin} />
                            <ReleaseCard key={`rel-${selected.id}`} assignment={selected} onChanged={() => load()} />
                        </>
                    )}
                </div>
            </div>
            )}
        </div>
    );
}
