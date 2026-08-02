import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Search, Image } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import ManageCard from '../../components/ManageCard';
import {
    listGallery, storeGalleryItem, updateGalleryItem, deleteGalleryItem,
    toggleGalleryStatus, getGalleryItem,
} from '../../api/gallery';

/**
 * Manage Gallery — admin CRUD for the public Home → Gallery page.
 * Add/Edit open a modal with title, description, event date, sort order,
 * status, and an image/video upload. Anything saved here (status=Active)
 * appears on the public gallery via GET /api/public/gallery.
 *
 * The page is rendered for both the "Manage Gallery" and "Add Gallery"
 * sidebar links; ?action=add (from Add Gallery) auto-opens the Add modal.
 */

// Render a stored date as "AUG 18, 2024". Falls back to the raw value for
// legacy free-text dates that aren't ISO-parseable.
const fmtDate = (raw) => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
};

export default function GalleryIndex() {
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
            setData(await listGallery({ page: query.page, search: query.search }));
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load gallery');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    // Deep-link from the "Add Gallery" sidebar item opens the Add modal once.
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
            await deleteGalleryItem(id);
            toast.success('Gallery item deleted');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const handleToggle = async (id) => {
        try {
            await toggleGalleryStatus(id);
            toast.success('Status updated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        }
    };

    const openEdit = async (id) => {
        try {
            const res = await getGalleryItem(id);
            setEditItem(res.item);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to load item');
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading gallery…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load gallery</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.gallery.data;
    const isEmpty = rows.length === 0;

    return (
        <div className="space-y-4">
            {/* Toolbar — shared professional layout across Marketing pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <Image className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Gallery</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Images shown on the public site.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="ol-form-control w-[220px] !pl-9" name="search" type="text" placeholder="Search by title" defaultValue={query.search || ''} />
                    </form>
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add Gallery
                    </button>
                </div>
            </div>

                    {isEmpty ? (
                        <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                                <Image className="h-6 w-6" />
                            </span>
                            <p className="mb-1 text-[15px] font-semibold text-dark">{query.search ? 'No items match your search' : 'No gallery items yet'}</p>
                            <p className="text-[13px] text-gray">{query.search ? 'Try a different title.' : 'Click “Add Gallery” to create the first one.'}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-gray text-[14px] mb-3">
                                Showing {rows.length} of {data.gallery.total}
                                {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {rows.map((g) => (
                                    <ManageCard
                                        key={g.id}
                                        active={!!g.status}
                                        onEdit={() => openEdit(g.id)}
                                        onToggle={() => handleToggle(g.id)}
                                        onDelete={() => setConfirm(g.id)}
                                        cover={g.media_url
                                            ? (g.media_type === 'video'
                                                ? <iframe title={g.title} src={g.media_url} className="w-full h-full" allowFullScreen />
                                                : <img src={g.media_url} alt={g.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />)
                                            : <div className="w-full h-full flex items-center justify-center text-[12px] text-gray bg-gradient-to-br from-orange-100 to-orange-50">No media</div>}
                                    >
                                        <h4 className="text-[14px] font-semibold text-dark m-0 truncate">{g.title}</h4>
                                        {g.event_date && <p className="text-[12px] text-warm-green font-semibold mt-1 mb-0">{fmtDate(g.event_date)}</p>}
                                        {g.description && <p className="text-[12px] text-gray mt-1 mb-0 line-clamp-2">{g.description}</p>}
                                    </ManageCard>
                                ))}
                            </div>

                            {data.gallery.last_page > 1 && (
                                <nav className="mt-4">
                                    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                        {Array.from({ length: data.gallery.last_page }, (_, i) => i + 1).map((p) => (
                                            <li key={p}>
                                                <button
                                                    className={`e-page-link ${p === data.gallery.current_page ? 'e-page-link-active' : ''}`}
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
                <Modal title="Add Gallery" size="md" onClose={() => setAddOpen(false)}>
                    <GalleryForm
                        submitLabel="Add item"
                        onSubmit={async (fd) => {
                            try {
                                await storeGalleryItem(fd);
                                toast.success('Gallery item created');
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
                <Modal title="Edit Gallery" size="md" onClose={() => setEditItem(null)}>
                    <GalleryForm
                        initial={editItem}
                        submitLabel="Update item"
                        onSubmit={async (fd) => {
                            try {
                                await updateGalleryItem(editItem.id, fd);
                                toast.success('Gallery item updated');
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
                    message="Delete this gallery item?"
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm)}
                />
            )}
        </div>
    );
}

function GalleryForm({ initial, onSubmit, submitLabel }) {
    const [form, setForm] = useState({
        title: initial?.title || '',
        description: initial?.description || '',
        event_date: initial?.event_date || '',
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
            if (file) fd.append('media', file);
            await onSubmit(fd);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} encType="multipart/form-data">
            <div className="mb-3">
                <label className="ol-form-label">Title<span className="text-danger ms-1">*</span></label>
                <input className="ol-form-control" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. National Gold at Codeavour" />
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Description</label>
                <textarea className="ol-form-control" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short context about this photo/video" />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">Event date<span className="text-danger ms-1">*</span></label>
                    <input type="date" className="ol-form-control" required value={form.event_date} onChange={(e) => set('event_date', e.target.value)} />
                </div>
                <div>
                    <label className="ol-form-label">Sort order</label>
                    <input type="number" className="ol-form-control" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </div>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Status</label>
                <select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="1">Active (visible on site)</option>
                    <option value="0">Hidden</option>
                </select>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Image or Video</label>
                {initial?.media_url && (
                    <div className="mb-2">
                        {initial.media_type === 'video' ? (
                            <iframe title="current" src={initial.media_url} className="w-full h-40 rounded" allowFullScreen />
                        ) : (
                            <img src={initial.media_url} alt="" className="w-full h-40 object-cover rounded border border-ebordermuted" />
                        )}
                    </div>
                )}
                <input className="ol-form-control" type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files[0])} />
                <p className="text-[12px] text-gray mt-1">{initial ? 'Leave blank to keep the current media.' : 'Upload a photo (card) or a video (feature).'}</p>
            </div>
            <div className="flex justify-end">
                <button type="submit" className="ol-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
