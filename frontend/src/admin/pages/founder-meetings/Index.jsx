import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Search, CalendarClock, Users, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import ManageCard from '../../components/ManageCard';
import {
    listFounderMeetings, storeFounderMeeting, updateFounderMeeting,
    deleteFounderMeeting, toggleFounderMeetingStatus, getFounderMeeting,
    listMeetingRegistrations, setRegistrationStatus, deleteRegistration,
} from '../../api/founderMeetings';
import { posterFor } from '../../../lib/founderMeetingDefaults';

/**
 * Weekly Meeting with Founder — admin CRUD.
 *
 * Each entry carries a schedule, a join link, an optional promo/recorded video
 * (→ Bunny) and an optional poster image (→ R2). The one marked FEATURED is
 * rendered on the public home page under the hero; the DB enforces that only
 * one row can hold that flag.
 *
 * Mirrors Manage Demo Videos: list + add/edit modal + status toggle.
 */

const IST = 'Asia/Kolkata';

/** "10 Sep 2026, 06:30 pm" — the timezone the academy actually runs in. */
const fmtWhen = (iso) => {
    if (!iso) return 'No date set';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'No date set';
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST,
    });
};

/**
 * An ISO timestamp rendered for <input type="datetime-local">, which needs
 * "YYYY-MM-DDTHH:mm" in LOCAL time and silently shows nothing if handed a Z
 * suffix or an offset.
 */
const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function FounderMeetingsIndex() {
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [regsFor, setRegsFor] = useState(null);

    const query = Object.fromEntries(params.entries());

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await listFounderMeetings({ page: query.page, search: query.search }));
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load meetings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    const onSearch = (e) => {
        e.preventDefault();
        const search = e.target.search.value.trim();
        const next = { ...query };
        if (search) next.search = search; else delete next.search;
        delete next.page;
        setParams(next);
    };

    const openEdit = async (id) => {
        try {
            const res = await getFounderMeeting(id);
            setEditItem(res.item);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Could not open that meeting');
        }
    };

    const handleToggle = async (id) => {
        try {
            await toggleFounderMeetingStatus(id);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to change status');
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteFounderMeeting(id);
            toast.success('Meeting deleted');
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to delete');
        }
    };

    const rows = data?.meetings?.data || [];
    const isEmpty = !loading && rows.length === 0;

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-[20px] font-bold text-dark m-0">Weekly Meeting with Founder</h2>
                    <p className="text-[13px] text-gray m-0 mt-1">
                        The meeting marked <strong>Featured</strong> appears on the home page under the hero.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={onSearch} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="ol-form-control w-[220px] !pl-9" name="search" type="text" placeholder="Search by title" defaultValue={query.search || ''} />
                    </form>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark"
                        onClick={() => setAddOpen(true)}
                    >
                        <Plus className="h-4 w-4" /> Add Meeting
                    </button>
                </div>
            </div>

            {error && <div className="ol-alert-danger mb-3">{error}</div>}

            {isEmpty ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted bg-white py-16 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightgreen text-skin">
                        <CalendarClock className="h-6 w-6" />
                    </span>
                    <p className="mb-1 text-[15px] font-semibold text-dark">
                        {query.search ? 'No meetings match your search' : 'No meetings yet'}
                    </p>
                    <p className="text-[13px] text-gray">
                        {query.search ? 'Try a different title.' : 'Click “Add Meeting” to schedule the first one.'}
                    </p>
                </div>
            ) : (
                <>
                    <p className="text-gray text-[14px] mb-3">
                        Showing {rows.length} of {data?.meetings?.total ?? 0}
                        {loading && <span className="ml-2 text-[12px]">Refreshing…</span>}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rows.map((m) => (
                            <ManageCard
                                key={m.id}
                                active={!!m.status}
                                onEdit={() => openEdit(m.id)}
                                onToggle={() => handleToggle(m.id)}
                                onDelete={() => setConfirm(m.id)}
                                // Mirrors the public page's fallback, so the card
                                // previews exactly what visitors will see.
                                cover={posterFor(m)
                                    ? <img
                                        src={posterFor(m)}
                                        alt={m.title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    : <iframe title={m.title} src={m.video_url} className="w-full h-full" allowFullScreen />}
                            >
                                <div className="flex items-center gap-2">
                                    <h4 className="text-[14px] font-semibold text-dark m-0 truncate">{m.title}</h4>
                                    {m.is_featured && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-skin text-white shrink-0">FEATURED</span>
                                    )}
                                </div>
                                <p className="text-[12px] text-gray mt-1 mb-0">{fmtWhen(m.scheduled_at)}</p>
                                {m.description && <p className="text-[12px] text-gray mt-1 mb-0 line-clamp-2">{m.description}</p>}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRegsFor(m)}
                                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-skin hover:underline"
                                    >
                                        <Users className="h-3.5 w-3.5" /> View registrations
                                    </button>
                                    <span className="text-[11px] text-gray">
                                        {m.capacity ? `${m.capacity} seats` : 'Unlimited seats'}
                                        {!m.registration_open && ' · registration closed'}
                                    </span>
                                </div>
                            </ManageCard>
                        ))}
                    </div>

                    {data?.meetings?.last_page > 1 && (
                        <nav className="mt-4">
                            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                {Array.from({ length: data.meetings.last_page }, (_, i) => i + 1).map((p) => (
                                    <li key={p}>
                                        <button
                                            className={`e-page-link ${p === data.meetings.current_page ? 'e-page-link-active' : ''}`}
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
                <Modal title="Add Meeting" size="md" onClose={() => setAddOpen(false)}>
                    <MeetingForm
                        submitLabel="Add meeting"
                        onSubmit={async (fd) => {
                            try {
                                await storeFounderMeeting(fd);
                                toast.success('Meeting saved');
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
                <Modal title="Edit Meeting" size="md" onClose={() => setEditItem(null)}>
                    <MeetingForm
                        initial={editItem}
                        submitLabel="Update meeting"
                        onSubmit={async (fd) => {
                            try {
                                await updateFounderMeeting(editItem.id, fd);
                                toast.success('Meeting updated');
                                setEditItem(null);
                                load();
                            } catch (e) {
                                toast.error(e.response?.data?.error || 'Failed');
                            }
                        }}
                    />
                </Modal>
            )}

            {regsFor && (
                <Modal title={`Registrations — ${regsFor.title}`} size="xl" onClose={() => setRegsFor(null)}>
                    <RegistrationsPanel meeting={regsFor} />
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    message="Delete this meeting? The uploaded video and poster are removed too."
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => handleDelete(confirm)}
                />
            )}
        </div>
    );
}

function MeetingForm({ initial, onSubmit, submitLabel }) {
    const [form, setForm] = useState({
        title: initial?.title || 'Weekly Meeting with Founder',
        description: initial?.description || '',
        scheduled_at: toLocalInput(initial?.scheduled_at),
        duration_mins: initial?.duration_mins ?? 60,
        meeting_link: initial?.meeting_link || '',
        // Blank = unlimited. The server treats '' as NULL capacity.
        capacity: initial?.capacity ?? '',
        // New meetings default to accepting registrations; an existing row
        // keeps whatever it has (the column is NOT NULL DEFAULT TRUE).
        registration_open: initial ? (initial.registration_open ? '1' : '0') : '1',
        is_featured: initial?.is_featured ? '1' : '0',
        status: initial?.status === undefined ? '1' : String(initial.status),
    });
    const [video, setVideo] = useState(null);
    const [poster, setPoster] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
            if (video) fd.append('video', video);
            if (poster) fd.append('poster', poster);
            await onSubmit(fd);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} encType="multipart/form-data">
            <div className="mb-3">
                <label className="ol-form-label">Title<span className="text-danger ms-1">*</span></label>
                <input
                    className="ol-form-control" required value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="e.g. Weekly Meeting with Founder"
                />
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Description</label>
                <textarea
                    className="ol-form-control" rows="3" value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Shown under the title on the home page"
                />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">Date &amp; time</label>
                    <input
                        type="datetime-local" className="ol-form-control" value={form.scheduled_at}
                        onChange={(e) => set('scheduled_at', e.target.value)}
                    />
                    <p className="text-[12px] text-gray mt-1">Leave blank to announce without a fixed slot.</p>
                </div>
                <div>
                    <label className="ol-form-label">Duration (minutes)</label>
                    <input
                        type="number" min="1" max="1440" className="ol-form-control" value={form.duration_mins}
                        onChange={(e) => set('duration_mins', e.target.value)}
                    />
                    <p className="text-[12px] text-gray mt-1">The Join button stays live this long.</p>
                </div>
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Meeting link</label>
                <input
                    className="ol-form-control" value={form.meeting_link}
                    onChange={(e) => set('meeting_link', e.target.value)}
                    placeholder="https://meet.google.com/…"
                />
                <p className="text-[12px] text-gray mt-1">
                    Google Meet, Zoom or Teams. Must start with https://. This is
                    never shown on the public page — it is released to people
                    after they register.
                </p>
            </div>

            {/* Seats. Capacity is enforced server-side at submit time, so a
                form left open in a tab while others take the last places gets
                "fully booked" rather than overbooking the session. */}
            <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="ol-form-label">Seats</label>
                    <input
                        type="number" min="1" step="1" className="ol-form-control"
                        value={form.capacity}
                        onChange={(e) => set('capacity', e.target.value)}
                        placeholder="Unlimited"
                    />
                    <p className="text-[12px] text-gray mt-1">
                        Leave blank for unlimited. Registration closes on its own
                        once the seats are taken.
                    </p>
                </div>
                <div>
                    <label className="ol-form-label">Registration</label>
                    <select
                        className="ol-form-control" value={form.registration_open}
                        onChange={(e) => set('registration_open', e.target.value)}
                    >
                        <option value="1">Open</option>
                        <option value="0">Closed</option>
                    </select>
                    <p className="text-[12px] text-gray mt-1">
                        Closing hides the form without unpublishing the meeting.
                    </p>
                </div>
            </div>

            <div className="mb-3">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox" checked={form.is_featured === '1'}
                        onChange={(e) => set('is_featured', e.target.checked ? '1' : '0')}
                        className="accent-skin w-4 h-4"
                    />
                    <span className="ol-form-label m-0">Featured — show this on the home page</span>
                </label>
                <p className="text-[12px] text-gray mt-1">Only one meeting can be featured; marking this one clears the others.</p>
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Status</label>
                <select className="ol-form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="1">Published (visible)</option>
                    <option value="0">Draft (hidden)</option>
                </select>
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Poster image</label>
                {/* Previews the admin's upload, or the site-wide default when
                    there is none — so the form shows what the home page will
                    actually render rather than an empty slot. */}
                {initial?.poster_url && (
                    <img
                        src={initial.poster_url}
                        alt=""
                        className="mb-2 w-full h-40 object-cover rounded border border-ebordermuted"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                )}
                <input className="ol-form-control" type="file" accept="image/*" onChange={(e) => setPoster(e.target.files[0])} />
                <p className="text-[12px] text-gray mt-1">
                    {initial?.poster_url
                        ? 'Leave blank to keep the current one.'
                        : 'Leave blank to use the default poster stored in Cloudflare.'}
                </p>
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Video</label>
                {initial?.video_url && (
                    <iframe title="current" src={initial.video_url} className="mb-2 w-full h-40 rounded" allowFullScreen />
                )}
                <input className="ol-form-control" type="file" accept="video/*" onChange={(e) => setVideo(e.target.files[0])} />
                <p className="text-[12px] text-gray mt-1">
                    Optional promo or recording (MP4/MOV, streamed via Bunny).
                    {initial ? ' Leave blank to keep the current one.' : ''}
                </p>
            </div>

            <div className="flex justify-end">
                <button type="submit" className="ol-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}

/**
 * Who registered for one meeting.
 *
 * The join link is not published on the public page, so this list IS the
 * attendance picture — it is the only record of who asked for the link.
 */
function RegistrationsPanel({ meeting }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = async (q = search) => {
        setLoading(true);
        try {
            setData(await listMeetingRegistrations(meeting.id, { search: q || undefined }));
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to load registrations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(''); /* eslint-disable-next-line */ }, [meeting.id]);

    const rows = data?.registrations?.data || [];
    const total = data?.registrations?.total ?? 0;

    const changeStatus = async (id, status) => {
        try {
            await setRegistrationStatus(id, status);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to update');
        }
    };

    // Deleting erases the person entirely. Cancelling (the status dropdown)
    // frees the seat but keeps the record — so this asks first, and the prompt
    // names who is being removed rather than saying "this item".
    const handleDelete = async (id) => {
        try {
            await deleteRegistration(id);
            toast.success('Registration deleted');
            setConfirmDel(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to delete');
        }
    };

    /** CSV of the current list, so the team can work from a spreadsheet. */
    const exportCsv = () => {
        const header = ['Name', 'Email', 'Phone', 'Message', 'Status', 'Registered at'];
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const body = rows.map((r) => [r.name, r.email, r.phone, r.message, r.status,
            new Date(r.created_at).toLocaleString('en-IN', { timeZone: IST })].map(esc).join(','));
        const blob = new Blob([[header.map(esc).join(','), ...body].join(String.fromCharCode(10))], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `registrations-meeting-${meeting.id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-gray m-0">
                    {loading ? 'Loading…' : `${total} registration${total === 1 ? '' : 's'}`}
                    {meeting.capacity ? ` of ${meeting.capacity} seats` : ''}
                </p>
                <div className="flex items-center gap-2">
                    <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            className="ol-form-control w-[200px] !pl-9"
                            placeholder="Name or email"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </form>
                    <button type="button" className="ol-btn-outline-secondary" onClick={exportCsv} disabled={!rows.length}>
                        Export CSV
                    </button>
                </div>
            </div>

            {!loading && rows.length === 0 ? (
                <div className="rounded-ol-8 border border-dashed border-ebordermuted py-12 text-center">
                    <p className="text-[14px] font-semibold text-dark mb-1">No registrations yet</p>
                    <p className="text-[13px] text-gray">They appear here as people sign up on the home page.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="e-table w-full">
                        <thead>
                            <tr>
                                <th>Name</th><th>Email</th><th>Phone</th><th>Question</th><th>Status</th><th>Registered</th><th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.name}</td>
                                    <td className="whitespace-nowrap">{r.email}</td>
                                    <td className="whitespace-nowrap">{r.phone || '—'}</td>
                                    <td className="max-w-[220px]">{r.message || '—'}</td>
                                    <td>
                                        <select
                                            className="ol-form-control !py-1 !text-[12px]"
                                            value={r.status}
                                            onChange={(e) => changeStatus(r.id, e.target.value)}
                                        >
                                            <option value="registered">Registered</option>
                                            <option value="attended">Attended</option>
                                            <option value="no_show">No show</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </td>
                                    <td className="whitespace-nowrap">{fmtWhen(r.created_at)}</td>
                                    <td>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDel(r)}
                                            aria-label={`Delete registration for ${r.name}`}
                                            title="Delete registration"
                                            className="text-gray transition-colors hover:text-danger"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {confirmDel && (
                <ConfirmDialog
                    message={`Delete the registration for ${confirmDel.name} (${confirmDel.email})? This cannot be undone — to keep the record but free the seat, set the status to Cancelled instead.`}
                    onCancel={() => setConfirmDel(null)}
                    onConfirm={() => handleDelete(confirmDel.id)}
                />
            )}
        </div>
    );
}
