import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ConfirmDialog from '../../components/ConfirmDialog';
import { listColleges, deleteCollege, setCollegeAccess } from '../../api/college';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { Plus, Search, School, MapPin } from 'lucide-react';

export default function CollegeIndex() {
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
            const res = await listColleges(query);
            setData(res);
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || 'Failed to load schools');
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

    const handleDelete = async (id) => {
        try {
            await deleteCollege(id);
            toast.success('School deleted successfully');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const handleSetAccess = async (id, isActive) => {
        try {
            await setCollegeAccess(id, isActive);
            toast.success(isActive ? 'Access granted' : 'Access revoked');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const handlePrint = () => window.print();

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading schools…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load schools</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.colleges || [];
    const isEmpty = rows.length === 0;

    return (
        <div className="min-w-0 space-y-4">
            {/* Toolbar — shared professional layout across admin list pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <School className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Schools</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Partner schools, their batches &amp; portal access.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <ExportDropdown onPdf={handlePrint} onPrint={handlePrint} />
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            className="ol-form-control w-[240px] !pl-9"
                            name="search"
                            type="text"
                            placeholder="Search school name or ID"
                            defaultValue={query.search || ''}
                        />
                    </form>
                    <Link
                        to="/admin/colleges/create"
                        className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark"
                    >
                        <Plus className="h-4 w-4" /> Add School
                    </Link>
                </div>
            </div>

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <School className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">No schools found</p>
                    <p className="text-[13px] text-gray">Try adjusting your search or add a new school.</p>
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
                                        <th scope="col">School</th>
                                        <th scope="col">School ID</th>
                                        <th scope="col">Batches</th>
                                        <th scope="col">Access</th>
                                        <th scope="col">Options</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((c, i) => (
                                        <tr key={c.clgId}>
                                            <td>{((data.page || 1) - 1) * (data.per_page || rows.length) + i + 1}</td>
                                            <td className="min-w-[220px]">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lightgreen text-skin">
                                                        <School className="h-[18px] w-[18px]" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <h4 className="text-[14px] font-semibold text-dark m-0 truncate">{c.clgName}</h4>
                                                        {c.clgAddress && (
                                                            <p className="text-[12px] text-gray m-0 inline-flex items-center gap-1">
                                                                <MapPin className="h-3 w-3 shrink-0" /> {c.clgAddress}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="font-mono text-[12px] text-dark">{c.clgId}</span>
                                            </td>
                                            <td>
                                                <span className="inline-block px-2 py-0.5 rounded text-[12px] font-semibold bg-skin/10 text-skin">
                                                    {c.batches_count ?? 0}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.isActive === false ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${c.isActive === false ? 'bg-gray-400' : 'bg-green-500'}`} />
                                                    {c.isActive === false ? 'Revoked' : 'Active'}
                                                </span>
                                            </td>
                                            <td>
                                                <CollegeOptions
                                                    college={c}
                                                    onDelete={() => setConfirm({ type: 'delete', id: c.clgId, name: c.clgName })}
                                                    onRevoke={() => setConfirm({ type: 'revoke', id: c.clgId, name: c.clgName })}
                                                    onGive={() => setConfirm({ type: 'give', id: c.clgId, name: c.clgName })}
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
                    message={
                        confirm.type === 'revoke'
                            ? `Revoke access for ${confirm.name}? The school admin will lose access until you grant it again.`
                            : confirm.type === 'give'
                                ? `Grant access for ${confirm.name}?`
                                : `Are you sure you want to delete ${confirm.name}?`
                    }
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => {
                        if (confirm.type === 'revoke') return handleSetAccess(confirm.id, false);
                        if (confirm.type === 'give') return handleSetAccess(confirm.id, true);
                        return handleDelete(confirm.id);
                    }}
                />
            )}
        </div>
    );
}

function CollegeOptions({ college, onDelete, onRevoke, onGive }) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const MENU_WIDTH = 180;
    const ESTIMATED_MENU_HEIGHT = 170;

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
                            to={`/admin/colleges/edit/${encodeURIComponent(college.clgId)}`}
                            className="block px-3 py-2 text-dark hover:bg-gray-50"
                            onClick={close}
                        >
                            Edit
                        </Link>
                    </li>
                    {college.isActive === false ? (
                        <li>
                            <button
                                type="button"
                                className="w-full text-left block px-3 py-2 text-success hover:bg-gray-50"
                                onClick={() => { close(); onGive(); }}
                            >
                                Give Access
                            </button>
                        </li>
                    ) : (
                        <li>
                            <button
                                type="button"
                                className="w-full text-left block px-3 py-2 text-danger hover:bg-gray-50"
                                onClick={() => { close(); onRevoke(); }}
                            >
                                Revoke Access
                            </button>
                        </li>
                    )}
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
