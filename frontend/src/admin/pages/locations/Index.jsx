import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Search, MapPin } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import ManageCard from '../../components/ManageCard';
import {
    listLocations, storeLocation, updateLocation, deleteLocation,
    toggleLocationStatus, getLocation,
} from '../../api/locations';

/**
 * Manage Locations — admin CRUD for the public Locations page learning-center
 * cards (replaces the old hardcoded `centers` array). Add/Edit open a modal
 * with name, city, state, PIN, photo URL, map URL, "New" ribbon, sort order
 * and status. Anything saved here (status=Active) appears on the public page
 * via GET /api/public/locations.
 *
 * Rendered for both the "Manage Locations" and "Add Location" sidebar links;
 * ?action=add (from Add Location) auto-opens the Add modal.
 */
export default function LocationsIndex() {
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
            setData(await listLocations({ page: query.page, search: query.search }));
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load locations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    // Deep-link from the "Add Location" sidebar item opens the Add modal once.
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
            await deleteLocation(id);
            toast.success('Location deleted');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const handleToggle = async (id) => {
        try {
            await toggleLocationStatus(id);
            toast.success('Status updated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        }
    };

    const openEdit = async (id) => {
        try {
            const res = await getLocation(id);
            setEditItem(res.item);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to load location');
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading locations…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load locations</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.locations.data;
    const isEmpty = rows.length === 0;

    return (
        <div className="space-y-4">
            {/* Toolbar — shared professional layout across Marketing pages. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <MapPin className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Locations</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Centres shown on the public site.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="ol-form-control w-[240px] !pl-9" name="search" type="text" placeholder="Search by name, city, PIN" defaultValue={query.search || ''} />
                    </form>
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add Location
                    </button>
                </div>
            </div>

                    {isEmpty ? (
                        <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                                <MapPin className="h-6 w-6" />
                            </span>
                            <p className="mb-1 text-[15px] font-semibold text-dark">{query.search ? 'No locations match your search' : 'No locations yet'}</p>
                            <p className="text-[13px] text-gray">{query.search ? 'Try a different search.' : 'Click “Add Location” to create the first centre.'}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-gray text-[14px] mb-3">
                                Showing {rows.length} of {data.locations.total}
                                {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {rows.map((l) => (
                                    <ManageCard
                                        key={l.id}
                                        active={!!l.status}
                                        onEdit={() => openEdit(l.id)}
                                        onToggle={() => handleToggle(l.id)}
                                        onDelete={() => setConfirm(l.id)}
                                        cover={l.photo_url
                                            ? <img src={l.photo_url} alt={l.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                            : <div className="w-full h-full flex items-center justify-center text-[12px] text-gray bg-gradient-to-br from-orange-100 to-orange-50">No photo</div>}
                                    >
                                        <h4 className="text-[14px] font-semibold text-dark m-0 truncate">
                                            {l.name}{l.is_new ? <span className="ml-2 text-[10px] text-white bg-warm-green px-1.5 py-0.5 rounded">New</span> : null}
                                        </h4>
                                        <p className="text-[12px] text-gray mt-1 mb-0">
                                            {[l.city, l.state].filter(Boolean).join(', ')}{l.pin ? ` · PIN ${l.pin}` : ''}
                                        </p>
                                    </ManageCard>
                                ))}
                            </div>

                            {data.locations.last_page > 1 && (
                                <nav className="mt-4">
                                    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                        {Array.from({ length: data.locations.last_page }, (_, i) => i + 1).map((p) => (
                                            <li key={p}>
                                                <button
                                                    className={`e-page-link ${p === data.locations.current_page ? 'e-page-link-active' : ''}`}
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
                <Modal title="Add Location" size="md" onClose={() => setAddOpen(false)}>
                    <LocationForm
                        submitLabel="Add location"
                        onSubmit={async (body) => {
                            try {
                                await storeLocation(body);
                                toast.success('Location created');
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
                <Modal title="Edit Location" size="md" onClose={() => setEditItem(null)}>
                    <LocationForm
                        initial={editItem}
                        submitLabel="Update location"
                        onSubmit={async (body) => {
                            try {
                                await updateLocation(editItem.id, body);
                                toast.success('Location updated');
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
                    message="Delete this location?"
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm)}
                />
            )}
        </div>
    );
}

function LocationForm({ initial, onSubmit, submitLabel }) {
    const [form, setForm] = useState({
        name: initial?.name || '',
        city: initial?.city || '',
        state: initial?.state || '',
        pin: initial?.pin || '',
        photo_url: initial?.photo_url || '',
        map_url: initial?.map_url || '',
        is_new: initial?.is_new ? '1' : '0',
        sort_order: initial?.sort_order ?? 0,
        status: initial?.status === undefined ? '1' : String(initial.status),
    });
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await onSubmit(form);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <div className="mb-3">
                <label className="ol-form-label">Centre name<span className="text-danger ms-1">*</span></label>
                <input className="ol-form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Guntur (HQ)" />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">City</label>
                    <input className="ol-form-control" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Guntur" />
                </div>
                <div>
                    <label className="ol-form-label">State</label>
                    <input className="ol-form-control" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="Andhra Pradesh" />
                </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">PIN code</label>
                    <input className="ol-form-control" value={form.pin} onChange={(e) => set('pin', e.target.value)} placeholder="522001" />
                </div>
                <div>
                    <label className="ol-form-label">Sort order</label>
                    <input type="number" className="ol-form-control" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </div>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Photo URL <span className="text-gray text-[12px]">(optional)</span></label>
                <input className="ol-form-control" value={form.photo_url} onChange={(e) => set('photo_url', e.target.value)} placeholder="https://… (leave blank for a coloured placeholder)" />
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Map URL <span className="text-gray text-[12px]">(optional)</span></label>
                <input className="ol-form-control" value={form.map_url} onChange={(e) => set('map_url', e.target.value)} placeholder="https://maps.google.com/… (blank → built from the address)" />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">“New” ribbon</label>
                    <select className="ol-form-control" value={form.is_new} onChange={(e) => set('is_new', e.target.value)}>
                        <option value="0">No</option>
                        <option value="1">Yes — show “New”</option>
                    </select>
                </div>
                <div>
                    <label className="ol-form-label">Status</label>
                    <select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                        <option value="1">Active (visible on site)</option>
                        <option value="0">Hidden</option>
                    </select>
                </div>
            </div>
            <div className="flex justify-end">
                <button type="submit" className="ol-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
