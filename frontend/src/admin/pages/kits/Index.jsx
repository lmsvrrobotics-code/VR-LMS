import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Search, Package, ImageOff } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import ManageCard from '../../components/ManageCard';
import {
    listKits, storeKit, updateKit, deleteKit,
    toggleKitStatus, getKit,
} from '../../api/kits';

/**
 * Manage Kits — admin CRUD for sellable products.
 * Add/Edit open a modal with title, subtitle, description, price, Razorpay link,
 * sort order, status, and a cover image upload. Kits are the core revenue model.
 * Anything saved here (status=Active) appears on the public Kits page.
 *
 * The page is rendered for both the "Manage Kits" and "Add Kit" sidebar
 * links; ?action=add (from Add Kit) auto-opens the Add modal.
 */
export default function KitsIndex() {
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [confirm, setConfirm] = useState(null);

    const query = Object.fromEntries(params.entries());

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await listKits({ page: query.page, search: query.search }));
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load kits');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    // Deep-link from the "Add Kit" sidebar item opens the Add modal once.
    useEffect(() => {
        if (query.action === 'add') {
            setAddOpen(true);
            const next = { ...query };
            delete next.action;
            setParams(next, { replace: true });
        }
        // eslint-disable-next-line
    }, []);

    const onSearch = (e) => {
        e.preventDefault();
        const term = (new FormData(e.target).get('search') || '').toString().trim();
        const next = { ...query };
        if (term) next.search = term; else delete next.search;
        delete next.page;
        setParams(next);
    };

    const handleDelete = async (id) => {
        try {
            await deleteKit(id);
            toast.success('Kit deleted');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const handleToggle = async (id) => {
        try {
            await toggleKitStatus(id);
            toast.success('Status updated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        }
    };

    const openEdit = async (id) => {
        try {
            const res = await getKit(id);
            setEditItem(res.item);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to load kit');
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-skin" />
                <p className="text-[14px]">Loading kits…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="rounded-ol-8 border border-ebordermuted bg-white">
                <div className="px-6 py-10 text-center">
                    <p className="mb-2 text-[16px] font-semibold text-danger">Couldn't load kits</p>
                    <p className="mb-4 text-[13px] text-gray">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.kits.data;
    const isEmpty = rows.length === 0;

    return (
        <div className="space-y-4">
            {/* Toolbar — title + subtitle on the left, search and primary action
                on the right (shared professional layout across Marketing). */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <Package className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Kits</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Sellable products shown on the public Kits page.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            className="ol-form-control w-[220px] !pl-9"
                            name="search"
                            type="text"
                            placeholder="Search by title"
                            defaultValue={query.search || ''}
                        />
                    </form>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark"
                        onClick={() => setAddOpen(true)}
                    >
                        <Plus className="h-4 w-4" /> Add Kit
                    </button>
                </div>
            </div>

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <Package className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">
                        {query.search ? 'No kits match your search' : 'No kits yet'}
                    </p>
                    <p className="text-[13px] text-gray">
                        {query.search ? 'Try a different title.' : 'Click "Add Kit" to create your first sellable product.'}
                    </p>
                </div>
            ) : (
                <>
                    <p className="text-[13px] text-gray tabular-nums">
                        Showing {rows.length} of {data.kits.total}
                        {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {rows.map((k) => (
                            <ManageCard
                                key={k.id}
                                active={!!k.status}
                                onEdit={() => openEdit(k.id)}
                                onToggle={() => handleToggle(k.id)}
                                onDelete={() => setConfirm(k.id)}
                                cover={k.cover_url
                                    ? <img src={k.cover_url} alt={k.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                    : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400"><ImageOff className="h-6 w-6" /><span className="text-[11px]">No cover</span></div>}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h4 className="m-0 truncate text-[14px] font-semibold text-dark">{k.title}</h4>
                                    {k.price != null && k.price !== '' && (
                                        <span className="shrink-0 text-[14px] font-bold text-emerald-600 tabular-nums">₹{Number(k.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                    )}
                                </div>
                                {k.subtitle && <p className="mt-0.5 mb-0 text-[12px] font-medium text-skin line-clamp-1">{k.subtitle}</p>}
                                {k.description && <p className="mt-1 mb-0 text-[12px] text-gray line-clamp-2">{k.description}</p>}
                            </ManageCard>
                        ))}
                    </div>

                    {data.kits.last_page > 1 && (
                        <nav className="mt-1">
                            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                                {Array.from({ length: data.kits.last_page }, (_, i) => i + 1).map((p) => (
                                    <li key={p}>
                                        <button
                                            className={`e-page-link ${p === data.kits.current_page ? 'e-page-link-active' : ''}`}
                                            onClick={() => setParams({ ...query, page: p })}
                                        >
                                            {p}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    )}
                </>
            )}

            {addOpen && (
                <Modal title="Add Kit" size="md" onClose={() => setAddOpen(false)}>
                    <KitForm
                        submitLabel="Add kit"
                        onSubmit={async (fd) => {
                            try {
                                await storeKit(fd);
                                toast.success('Kit created');
                                setAddOpen(false);
                                load();
                            } catch (e) {
                                toast.error(e.response?.data?.error || 'Failed');
                            }
                        }}
                    />
                </Modal>
            )}

            {editItem && (
                <Modal title="Edit Kit" size="md" onClose={() => setEditItem(null)}>
                    <KitForm
                        initial={editItem}
                        submitLabel="Update kit"
                        onSubmit={async (fd) => {
                            try {
                                await updateKit(editItem.id, fd);
                                toast.success('Kit updated');
                                setEditItem(null);
                                load();
                            } catch (e) {
                                toast.error(e.response?.data?.error || 'Failed');
                            }
                        }}
                    />
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    message="Delete this kit?"
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm)}
                />
            )}
        </div>
    );
}

function KitForm({ initial, onSubmit, submitLabel }) {
    const [form, setForm] = useState({
        title: initial?.title || '',
        subtitle: initial?.subtitle || '',
        description: initial?.description || '',
        price: initial?.price ?? 0,
        buy_url: initial?.buy_url || '',
        sort_order: initial?.sort_order ?? 0,
        status: initial?.status === undefined ? '1' : String(initial.status),
    });
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
            if (file) fd.append('cover', file);
            await onSubmit(fd);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} encType="multipart/form-data">
            <div className="mb-3">
                <label className="ol-form-label">Kit Name<span className="text-danger ms-1">*</span></label>
                <input className="ol-form-control" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Arduino Starter Kit Pro" />
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Subtitle</label>
                <input className="ol-form-control" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="e.g. Complete robotics bundle with accessories" />
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Description</label>
                <textarea className="ol-form-control" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What's included in this kit?" />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">Price (₹)</label>
                    <input type="number" step="0.01" className="ol-form-control" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="e.g. 2999" />
                </div>
                <div>
                    <label className="ol-form-label">Sort order</label>
                    <input type="number" className="ol-form-control" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </div>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Razorpay Order Link<span className="text-danger ms-1">*</span></label>
                <input className="ol-form-control" required value={form.buy_url} onChange={(e) => set('buy_url', e.target.value)} placeholder="e.g. https://razorpay.com/l/abcd1234" />
                <p className="text-[12px] text-gray mt-1">Paste your Razorpay payment link here</p>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Status</label>
                <select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="1">Active (visible & sellable)</option>
                    <option value="0">Hidden (draft)</option>
                </select>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Cover image</label>
                {initial?.cover_url && (
                    <div className="mb-2">
                        <img src={initial.cover_url} alt="" className="w-32 h-40 object-cover rounded border border-ebordermuted" />
                    </div>
                )}
                <input className="ol-form-control" type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
                <p className="text-[12px] text-gray mt-1">{initial ? 'Leave blank to keep the current cover.' : 'Upload the kit cover image.'}</p>
            </div>
            <div className="flex justify-end">
                <button type="submit" className="ol-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
