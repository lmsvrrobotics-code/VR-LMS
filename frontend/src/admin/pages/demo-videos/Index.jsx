import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import ManageCard from '../../components/ManageCard';
import {
    listDemoVideos, storeDemoVideo, updateDemoVideo, deleteDemoVideo,
    toggleDemoVideoStatus, getDemoVideo,
} from '../../api/demoVideos';

/**
 * Manage Demo Videos — admin CRUD for the marketing/demo videos shown to
 * newly-registered students (CEO intro + sample teasers) above their course
 * cards. Mirrors Manage Gallery: add/edit modal + video/image upload (video →
 * Bunny). Active items appear via GET /api/public/demo-videos.
 */
export default function DemoVideosIndex() {
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
            setData(await listDemoVideos({ page: query.page, search: query.search }));
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load demo videos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

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
            await deleteDemoVideo(id);
            toast.success('Demo video deleted');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
            setConfirm(null);
        }
    };

    const handleToggle = async (id) => {
        try {
            await toggleDemoVideoStatus(id);
            toast.success('Status updated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        }
    };

    const openEdit = async (id) => {
        try {
            const res = await getDemoVideo(id);
            setEditItem(res.item);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to load item');
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading demo videos…</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load demo videos</p>
                    <p className="text-[13px] text-gray mb-4">{error}</p>
                    <button className="ol-btn-primary" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    const rows = data.demo_videos.data;
    const isEmpty = rows.length === 0;

    return (
        <div>
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h4 className="text-[16px] font-semibold text-dark m-0">Demo Videos</h4>
                            <p className="text-[12px] text-gray mt-1 mb-0">Marketing/intro videos shown to students above their courses (e.g. CEO intro + sample teasers).</p>
                        </div>
                        <button
                            type="button"
                            className="ol-btn-outline-secondary flex items-center gap-10px"
                            onClick={() => setAddOpen(true)}
                        >
                            <span className="fi-rr-plus" />
                            <span>Add Demo Video</span>
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
                            <p className="text-[16px] font-semibold text-dark mb-1">No demo videos yet</p>
                            <p className="text-[13px] text-gray">Click “Add Demo Video” to upload the first one.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-gray text-[14px] mb-3">
                                Showing {rows.length} of {data.demo_videos.total}
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
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-[14px] font-semibold text-dark m-0 truncate">{g.title}</h4>
                                            {g.is_intro && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-skin text-white shrink-0">INTRO</span>}
                                        </div>
                                        {g.description && <p className="text-[12px] text-gray mt-1 mb-0 line-clamp-2">{g.description}</p>}
                                    </ManageCard>
                                ))}
                            </div>

                            {data.demo_videos.last_page > 1 && (
                                <nav className="mt-4">
                                    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                        {Array.from({ length: data.demo_videos.last_page }, (_, i) => i + 1).map((p) => (
                                            <li key={p}>
                                                <button
                                                    className={`e-page-link ${p === data.demo_videos.current_page ? 'e-page-link-active' : ''}`}
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
                <Modal title="Add Demo Video" size="md" onClose={() => setAddOpen(false)}>
                    <DemoVideoForm
                        submitLabel="Add video"
                        onSubmit={async (fd) => {
                            try {
                                await storeDemoVideo(fd);
                                toast.success('Demo video saved');
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
                <Modal title="Edit Demo Video" size="md" onClose={() => setEditItem(null)}>
                    <DemoVideoForm
                        initial={editItem}
                        submitLabel="Update video"
                        onSubmit={async (fd) => {
                            try {
                                await updateDemoVideo(editItem.id, fd);
                                toast.success('Demo video updated');
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
                    message="Delete this demo video?"
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm)}
                />
            )}
        </div>
    );
}

function DemoVideoForm({ initial, onSubmit, submitLabel }) {
    const [form, setForm] = useState({
        title: initial?.title || '',
        description: initial?.description || '',
        is_intro: initial?.is_intro ? '1' : '0',
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
                <input className="ol-form-control" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Welcome to VR Robotics — by our CEO" />
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Description</label>
                <textarea className="ol-form-control" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short pitch shown under the video" />
            </div>
            <div className="mb-3">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_intro === '1'} onChange={(e) => set('is_intro', e.target.checked ? '1' : '0')} className="accent-skin w-4 h-4" />
                    <span className="ol-form-label m-0">Intro video (CEO welcome — shown first &amp; large)</span>
                </label>
                <p className="text-[12px] text-gray mt-1">Only one video can be the intro; marking this one clears the others.</p>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">Sort order</label>
                    <input type="number" className="ol-form-control" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </div>
                <div>
                    <label className="ol-form-label">Status</label>
                    <select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                        <option value="1">Active (visible to students)</option>
                        <option value="0">Hidden</option>
                    </select>
                </div>
            </div>
            <div className="mb-3">
                <label className="ol-form-label">Video {initial ? '' : <span className="text-danger ms-1">*</span>}</label>
                {initial?.media_url && (
                    <div className="mb-2">
                        {initial.media_type === 'video' ? (
                            <iframe title="current" src={initial.media_url} className="w-full h-40 rounded" allowFullScreen />
                        ) : (
                            <img src={initial.media_url} alt="" className="w-full h-40 object-cover rounded border border-ebordermuted" />
                        )}
                    </div>
                )}
                <input className="ol-form-control" type="file" accept="video/*,image/*" onChange={(e) => setFile(e.target.files[0])} />
                <p className="text-[12px] text-gray mt-1">{initial ? 'Leave blank to keep the current video.' : 'Upload an MP4/MOV video (streamed via Bunny), like the course lesson videos.'}</p>
            </div>
            <div className="flex justify-end">
                <button type="submit" className="ol-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
