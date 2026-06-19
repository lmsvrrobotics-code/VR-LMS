import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
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
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading kits…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn't load kits</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.kits.data;
    const isEmpty = rows.length === 0;

    return (
        <div>
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h4 className="text-[16px] font-semibold text-dark m-0">🛍️ Kits (Sellable Products)</h4>
                        <button
                            type="button"
                            className="ol-btn-outline-secondary flex items-center gap-10px"
                            onClick={() => setAddOpen(true)}
                        >
                            <span className="fi-rr-plus" />
                            <span>Add Kit</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="ol-card">
                <div className="ol-card-body p-3">
                    <form onSubmit={onSearch} className="flex justify-end gap-3 mb-3 mt-3">
                        <input
                            className="ol-form-control max-w-[280px]"
                            name="search"
                            type="text"
                            placeholder="Search by title"
                            defaultValue={query.search || ''}
                        />
                        <button type="submit" className="ol-btn-primary">Search</button>
                    </form>

                    {isEmpty ? (
                        <div className="py-12 text-center border border-dashed border-border rounded-ol-8">
                            <p className="text-[16px] font-semibold text-dark mb-1">No kits yet</p>
                            <p className="text-[13px] text-gray">Click "Add Kit" to create your first sellable product.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-gray text-[14px] mb-3">
                                Showing {rows.length} of {data.kits.total}
                                {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {rows.map((k) => (
                                    <div key={k.id} className="border border-ebordermuted rounded-ol-12 overflow-hidden bg-white hover:shadow-md transition">
                                        <div className="h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                                            {k.cover_url ? (
                                                <img src={k.cover_url} alt={k.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-[12px] text-gray">No cover</span>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <h4 className="text-[14px] font-semibold text-dark m-0">{k.title}</h4>
                                                <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                    k.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {k.status ? 'Active' : 'Hidden'}
                                                </span>
                                            </div>
                                            {k.subtitle && <p className="text-[12px] text-warm-green font-semibold mb-1">{k.subtitle}</p>}
                                            {k.price && <p className="text-[14px] font-bold text-emerald-600 mb-1">₹ {Number(k.price).toFixed(2)}</p>}
                                            {k.description && <p className="text-[12px] text-gray mb-2 line-clamp-2">{k.description}</p>}
                                            <div className="flex gap-2">
                                                <button className="ol-btn-light text-[12px] px-3 py-1 flex-1" onClick={() => openEdit(k.id)}>Edit</button>
                                                <button className="ol-btn-outline-secondary text-[12px] px-3 py-1 flex-1" onClick={() => handleToggle(k.id)}>
                                                    {k.status ? 'Hide' : 'Show'}
                                                </button>
                                                <button className="ol-btn-danger text-[12px] px-3 py-1" onClick={() => setConfirm(k.id)}>Delete</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {data.kits.last_page > 1 && (
                                <nav className="mt-4">
                                    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
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
                </div>
            </div>

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
