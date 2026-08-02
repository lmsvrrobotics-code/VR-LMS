import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { Plus, Search, GraduationCap } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import { listTeachers, deleteTeacher } from '../../api/teacher';
import { API_BASE } from '../../api/client';

// Prefer the admin-uploaded photo (relative path served from admin-service's
// /uploads mount). Fall back to the initials avatar for teachers who
// haven't been given an image yet.
const avatarUrl = (row) =>
    row.photo
        ? `${API_BASE}/${row.photo}`
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || row.email || 'I')}&background=169f48&color=fff`;

export default function TeacherIndex() {
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [confirm, setConfirm] = useState(null);

    const query = { per_page: 1000, ...Object.fromEntries(params.entries()) };

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listTeachers(query);
            setData(res);
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load teachers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    const onSearch = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const term = (fd.get('search') || '').toString().trim();
        const next = { ...query };
        if (term) next.search = term; else delete next.search;
        delete next.per_page;
        setParams(next);
    };

    const handleDelete = async (id) => {
        try {
            await deleteTeacher(id);
            toast.success('Teacher removed successfully');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading teachers…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn't load teachers</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.teachers || [];
    const isEmpty = rows.length === 0;

    return (
        <div className="min-w-0 space-y-4">
            {/* Toolbar — shared professional layout across admin list pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <GraduationCap className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Teachers</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Instructors who deliver courses and live classes.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="ol-form-control w-[260px] !pl-9" name="search" type="text"
                            placeholder="Search by name, email, or expertise"
                            defaultValue={query.search || ''} />
                    </form>
                    <Link to="/admin/teachers/create" className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark">
                        <Plus className="h-4 w-4" /> Add Teacher
                    </Link>
                </div>
            </div>

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <GraduationCap className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">No teachers found</p>
                    <p className="text-[13px] text-gray">Try adjusting your search or add a new teacher.</p>
                </div>
            ) : (
                <>
                    <p className="text-gray text-[13px] m-0">
                        Showing {rows.length} of {data.total} data
                        {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                    </p>
                    <div className="overflow-hidden rounded-ol-12 border border-ebordermuted bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                        <div className="overflow-x-auto">
                            <table className="e-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Phone</th>
                                            <th>Expertise</th>
                                            <th>Years</th>
                                            <th>Options</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((s, i) => (
                                            <tr key={s.id}>
                                                <td>{i + 1}</td>
                                                {/* Public teacher id (VRT<year><serial>). Null for accounts
                                                    created before the id system — renders as —. */}
                                                <td>
                                                    {s.unique_id ? (
                                                        <span className="whitespace-nowrap font-mono text-[13px] text-dark">{s.unique_id}</span>
                                                    ) : (
                                                        <span className="text-gray">—</span>
                                                    )}
                                                </td>
                                                <td className="min-w-[220px]">
                                                    <div className="flex items-center gap-2">
                                                        <img src={avatarUrl(s)}
                                                            className="w-[45px] h-[45px] rounded-full object-cover" alt="" />
                                                        <div>
                                                            <h4 className="text-[14px] font-semibold text-dark m-0">{s.name}</h4>
                                                            <p className="text-[12px] text-gray m-0">{s.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><p className="m-0">{s.phone || '-'}</p></td>
                                                <td><p className="m-0">{s.expertise || <span className="text-gray">—</span>}</p></td>
                                                <td>
                                                    {s.yearsOfExperience != null
                                                        ? `${s.yearsOfExperience} yr${s.yearsOfExperience === 1 ? '' : 's'}`
                                                        : <span className="text-gray">—</span>}
                                                </td>
                                                <td>
                                                    <TeacherOptions
                                                        teacher={s}
                                                        onDelete={() => setConfirm({ id: s.id, name: s.name })}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                        </div>
                    </div>
                </>
            )}

            {confirm && (
                <ConfirmDialog
                    title="Remove teacher"
                    message={`Are you sure you want to remove ${confirm.name}?`}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm.id)}
                />
            )}
        </div>
    );
}

// Kebab (three-dots) row menu — identical behaviour to AdminOptions in
// Manage Admin: portal-positioned dropdown with Edit + Delete, closes on
// outside click / Escape / scroll / resize.
function TeacherOptions({ teacher, onDelete }) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const MENU_WIDTH = 180;
    const ESTIMATED_MENU_HEIGHT = 100;

    useEffect(() => {
        if (!open) return;
        const el = triggerRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            const GAP = 4;
            let left = rect.right - MENU_WIDTH;
            if (left < 8) left = 8;
            if (left + MENU_WIDTH > window.innerWidth - 8) left = window.innerWidth - MENU_WIDTH - 8;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            let top;
            if (spaceBelow >= ESTIMATED_MENU_HEIGHT + GAP || spaceBelow >= spaceAbove) {
                top = rect.bottom + GAP;
            } else {
                top = rect.top - ESTIMATED_MENU_HEIGHT - GAP;
                if (top < 8) top = 8;
            }
            setCoords({ top, left });
        }
        const onDoc = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        const onScroll = () => setOpen(false);
        const onResize = () => setOpen(false);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <div className="relative inline-block">
            <button
                ref={triggerRef}
                type="button"
                className="inline-flex items-center justify-center w-8 h-8 rounded-ol-8 border border-border text-gray hover:border-skin hover:text-skin"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <BsThreeDotsVertical className="text-[16px]" />
            </button>
            {open && createPortal(
                <ul
                    ref={menuRef}
                    role="menu"
                    style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH }}
                    className="z-[1000] bg-white border border-border rounded-ol-8 shadow-lg py-1 text-[13px]"
                >
                    <li>
                        <Link
                            to={`/admin/teachers/edit/${teacher.id}`}
                            className="block px-3 py-2 text-dark hover:bg-gray-50"
                            onClick={close}
                        >
                            Edit
                        </Link>
                    </li>
                    <li>
                        <button
                            type="button"
                            className="w-full text-left block px-3 py-2 text-danger hover:bg-gray-50"
                            onClick={() => { close(); onDelete(); }}
                        >
                            Delete
                        </button>
                    </li>
                </ul>,
                document.body,
            )}
        </div>
    );
}
