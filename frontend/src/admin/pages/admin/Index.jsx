import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ConfirmDialog from '../../components/ConfirmDialog';
import { listAdmins, deleteAdmin, grantAdminAccess, revokeAdminAccess } from '../../api/admin';
import { getStoredUser } from '@/admin/api/auth';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { Plus, Search, ShieldCheck } from 'lucide-react';

// Only a root admin may grant/revoke root access. Read from the cached admin
// profile; the backend enforces this too, so a stale cache can't bypass it.
const viewerIsRoot = () => getStoredUser()?.is_root_admin === true;

const API = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

const avatarUrl = (row) => row.photo
    ? `${API}/${row.photo}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || row.email || 'A')}&background=169f48&color=fff`;

export default function AdminIndex() {
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [confirm, setConfirm] = useState(null);

    const query = Object.fromEntries(params.entries());

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listAdmins(query);
            setData(res);
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load admins');
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
        setParams(next);
    };

    // Single dispatcher for the confirm dialog — handles delete + grant/revoke
    // root access depending on confirm.action.
    const runConfirm = async () => {
        if (!confirm) return;
        const { id, action } = confirm;
        try {
            if (action === 'grant') {
                const r = await grantAdminAccess(id);
                toast.success(r?.message || 'Root access granted');
            } else if (action === 'revoke') {
                const r = await revokeAdminAccess(id);
                toast.success(r?.message || 'Root access revoked');
            } else {
                await deleteAdmin(id);
                toast.success('Admin deleted successfully');
            }
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const confirmText = {
        grant: {
            title: 'Give root access',
            message: `Give ${confirm?.name || 'this user'} full root-admin access? They'll see the same root dashboard you do on their next login.`,
        },
        revoke: {
            title: 'Revoke root access',
            message: `Revoke root access from ${confirm?.name || 'this user'}? They'll return to their normal admin view on next login.`,
        },
        delete: {
            title: 'Delete admin',
            message: `Are you sure you want to delete ${confirm?.name || 'this admin'}?`,
        },
    };

    const handlePrint = () => window.print();

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading admins…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load admins</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.admins || [];
    const isEmpty = rows.length === 0;

    return (
        <div className="min-w-0 space-y-4">
            {/* Toolbar — shared professional layout across admin list pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <ShieldCheck className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Admins</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Platform administrators and their access level.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <ExportDropdown onPdf={handlePrint} onPrint={handlePrint} />
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            className="ol-form-control w-[220px] !pl-9"
                            name="search"
                            type="text"
                            placeholder="Search user"
                            defaultValue={query.search || ''}
                        />
                    </form>
                    <Link
                        to="/admin/admins/create"
                        className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark"
                    >
                        <Plus className="h-4 w-4" /> Add Admin
                    </Link>
                </div>
            </div>

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <ShieldCheck className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">No admins found</p>
                    <p className="text-[13px] text-gray">Try adjusting your search or add a new admin.</p>
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
                                            <th scope="col">#</th>
                                            <th scope="col">Name</th>
                                            <th scope="col">Phone</th>
                                            <th scope="col">School Name</th>
                                            <th scope="col">Options</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((a, i) => (
                                            <tr key={a.id}>
                                                <td>{((data.page || 1) - 1) * (data.per_page || rows.length) + i + 1}</td>
                                                <td className="min-w-[200px]">
                                                    <div className="flex items-center gap-2">
                                                        <img
                                                            src={avatarUrl(a)}
                                                            className="w-[45px] h-[45px] rounded-full object-cover"
                                                            alt=""
                                                        />
                                                        <div>
                                                            <h4 className="text-[14px] font-semibold text-dark m-0">{a.name}</h4>
                                                            <p className="text-[12px] text-gray m-0">{a.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><p className="m-0">{a.phone || '-'}</p></td>
                                                <td>
                                                    <p className="m-0 text-dark">
                                                        {a.college_name || <span className="text-gray">School Name</span>}
                                                    </p>
                                                </td>
                                                <td>
                                                    {/* Root admin used to show a "Root Admin" pill in place of the
                                                        three-dot menu, which broke row-action consistency. Now every
                                                        row gets the dots; the root row's dropdown just hides Delete
                                                        (the backend refuses it anyway — see AdminService.remove). */}
                                                    <AdminOptions
                                                        admin={a}
                                                        onDelete={() => setConfirm({ id: a.id, name: a.name, action: 'delete' })}
                                                        onGrant={() => setConfirm({ id: a.id, name: a.name, action: 'grant' })}
                                                        onRevoke={() => setConfirm({ id: a.id, name: a.name, action: 'revoke' })}
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
                    title={confirmText[confirm.action]?.title || 'Confirm'}
                    message={confirmText[confirm.action]?.message || ''}
                    onCancel={() => setConfirm(null)}
                    onConfirm={runConfirm}
                />
            )}
        </div>
    );
}

function AdminOptions({ admin, onDelete, onGrant, onRevoke }) {
    const canManageAccess = viewerIsRoot();
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const MENU_WIDTH = 180;
    const ESTIMATED_MENU_HEIGHT = 140;

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
                            to={`/admin/admins/edit/${admin.id}`}
                            className="block px-3 py-2 text-dark hover:bg-gray-50"
                            onClick={close}
                        >
                            Edit
                        </Link>
                    </li>
                    {/* Give / Revoke root access — only a root admin sees these.
                        Hidden for the primary root row (can't be revoked). */}
                    {canManageAccess && !admin.is_root_admin && (
                        <li>
                            <button
                                type="button"
                                className="w-full text-left block px-3 py-2 text-emerald-700 hover:bg-gray-50"
                                onClick={() => { close(); onGrant(); }}
                            >
                                Give Access
                            </button>
                        </li>
                    )}
                    {canManageAccess && admin.is_root_admin && !admin.is_primary_root && (
                        <li>
                            <button
                                type="button"
                                className="w-full text-left block px-3 py-2 text-amber-700 hover:bg-gray-50"
                                onClick={() => { close(); onRevoke(); }}
                            >
                                Revoke Access
                            </button>
                        </li>
                    )}
                    {!admin.is_root_admin && (
                        <li>
                            <button
                                type="button"
                                className="w-full text-left block px-3 py-2 text-danger hover:bg-gray-50"
                                onClick={() => { close(); onDelete(); }}
                            >
                                Delete
                            </button>
                        </li>
                    )}
                </ul>,
                document.body,
            )}
        </div>
    );
}

function ExportDropdown({ onPdf, onPrint }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="relative inline-block" ref={ref}>
            <button
                type="button"
                className="ol-btn-light inline-flex items-center gap-2"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                Export
                <i className="fi-rr-file-export" />
            </button>
            {open && (
                <ul className="absolute left-0 z-20 mt-1 min-w-[160px] bg-white border border-border rounded-ol-8 shadow-lg py-1 text-[13px]">
                    <li>
                        <button
                            type="button"
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-dark hover:bg-gray-50"
                            onClick={() => { setOpen(false); onPdf(); }}
                        >
                            <i className="fi-rr-file-pdf" /> PDF
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-dark hover:bg-gray-50"
                            onClick={() => { setOpen(false); onPrint(); }}
                        >
                            <i className="fi-rr-print" /> Print
                        </button>
                    </li>
                </ul>
            )}
        </div>
    );
}
