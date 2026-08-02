import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { listLeads, leadStats, updateLead, convertLead, deleteLead } from '../../api/leads';

const STATUSES = ['all', 'new', 'contacted', 'converted', 'rejected'];
const STATUS_STYLE = {
    new: 'bg-blue-100 text-blue-700',
    contacted: 'bg-amber-100 text-amber-700',
    converted: 'bg-green-100 text-green-700',
    rejected: 'bg-gray-200 text-gray-600',
};

export default function LeadsIndex() {
    const [params, setParams] = useSearchParams();
    const status = STATUSES.includes(params.get('status')) ? params.get('status') : 'all';
    const [leads, setLeads] = useState([]);
    const [stats, setStats] = useState({ total: 0, new: 0, contacted: 0, converted: 0, rejected: 0 });
    const [loading, setLoading] = useState(true);
    const [convertFor, setConvertFor] = useState(null); // lead being converted

    const load = async () => {
        setLoading(true);
        try {
            const [l, s] = await Promise.all([listLeads({ status }), leadStats()]);
            setLeads(l.leads || []);
            const fresh = s || stats;
            setStats(fresh);
            // Broadcast the live "new" count so the sidebar badge updates
            // immediately (instead of waiting for its 60s poll) after the admin
            // marks a lead contacted / converts / rejects it.
            window.dispatchEvent(new CustomEvent('leads:changed', { detail: { newCount: Number(fresh.new) || 0 } }));
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Failed to load leads');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

    const setStatusFilter = (s) => {
        const next = new URLSearchParams(params);
        if (s === 'all') next.delete('status'); else next.set('status', s);
        setParams(next, { replace: true });
    };

    const setStatus = async (lead, newStatus) => {
        try { await updateLead(lead.id, { status: newStatus }); toast.success('Status updated'); load(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };
    const saveNotes = async (lead, notes) => {
        try { await updateLead(lead.id, { notes }); toast.success('Saved'); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };
    // Convert. A self-signup (has_account) ALREADY has a login they chose the
    // password for — converting only reveals them in Manage Students, so there is
    // nothing to ask and we go straight through. Only a pure enquiry with no
    // account needs the password modal, because converting it creates the login.
    const convert = async (lead) => {
        if (!lead.has_account) return setConvertFor(lead);
        try {
            await convertLead(lead.id, {});
            toast.success(`${lead.name} added to Manage Students.`);
            load();
        } catch (e) {
            toast.error(e?.uiMessage || e?.response?.data?.error || 'Convert failed');
        }
    };

    const remove = async (lead) => {
        if (!window.confirm(`Delete lead ${lead.name}?`)) return;
        try { await deleteLead(lead.id); toast.success('Lead removed'); load(); }
        catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
    };

    return (
        <div>
            {/* Header + pipeline counts */}
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body px-5 py-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h4 className="text-[16px] font-semibold text-dark m-0">Leads</h4>
                            <p className="text-[13px] text-gray mt-1">New signups from the portal. Follow up and convert them — once converted they move to Manage Students and leave this list (see the “converted” tab for history).</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {STATUSES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1.5 rounded-ol-8 text-[12px] font-semibold capitalize ${status === s ? 'bg-primary text-white' : 'bg-bodybg text-gray hover:text-dark'}`}
                                >
                                    {s}{s === 'new' && stats.new ? ` (${stats.new})` : ''}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {stats.new > 0 && (
                <div className="rounded-ol-8 mb-3 border border-blue-200 bg-blue-50 text-blue-700 px-4 py-3 text-[13px]">
                    🔔 {stats.new} new lead{stats.new > 1 ? 's' : ''} waiting for follow-up.
                </div>
            )}

            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body px-0 py-0">
                    {loading ? (
                        <p className="text-[13px] text-gray px-5 py-8">Loading…</p>
                    ) : leads.length === 0 ? (
                        <p className="text-[13px] text-gray px-5 py-8 text-center">No leads in this view.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="text-left text-gray border-b border-ebordermuted">
                                        <th className="px-4 py-3 font-semibold">Name</th>
                                        <th className="px-4 py-3 font-semibold">Contact</th>
                                        <th className="px-4 py-3 font-semibold">Interest</th>
                                        <th className="px-4 py-3 font-semibold">When</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map((l) => (
                                        <tr key={l.id} className="border-b border-ebordermuted/60 align-top">
                                            <td className="px-4 py-3 text-dark font-semibold">{l.name}</td>
                                            <td className="px-4 py-3 text-gray">
                                                <div>{l.email}</div>
                                                {l.phone && <div>{l.phone}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-gray">{l.course_interest || '—'}</td>
                                            <td className="px-4 py-3 text-gray">{new Date(l.created_at).toLocaleDateString()}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_STYLE[l.status] || 'bg-bodybg text-gray'}`}>{l.status}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {l.status !== 'converted' && (
                                                        <>
                                                            {l.status === 'new' && (
                                                                <button type="button" onClick={() => setStatus(l, 'contacted')} className="text-[12px] text-amber-700 hover:underline">Mark contacted</button>
                                                            )}
                                                            <button type="button" onClick={() => convert(l)} className="text-[12px] text-green-700 font-semibold hover:underline">Convert</button>
                                                            {l.status !== 'rejected' && (
                                                                <button type="button" onClick={() => setStatus(l, 'rejected')} className="text-[12px] text-gray hover:underline">Reject</button>
                                                            )}
                                                        </>
                                                    )}
                                                    {l.converted_user_id && <span className="text-[11px] text-gray">→ student #{l.converted_user_id}</span>}
                                                    <button type="button" onClick={() => remove(l)} className="text-[12px] text-red-600 hover:underline">Delete</button>
                                                </div>
                                                <NotesCell lead={l} onSave={saveNotes} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {convertFor && (
                <ConvertModal
                    lead={convertFor}
                    onClose={() => setConvertFor(null)}
                    onDone={() => { setConvertFor(null); load(); }}
                />
            )}
        </div>
    );
}

function NotesCell({ lead, onSave }) {
    const [notes, setNotes] = useState(lead.notes || '');
    return (
        <div className="mt-2 flex items-start gap-2">
            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Follow-up notes…"
                rows={1}
                className="ol-form-control text-[12px] w-full min-w-[180px]"
            />
            {notes !== (lead.notes || '') && (
                <button type="button" onClick={() => onSave(lead, notes)} className="text-[12px] text-primary font-semibold whitespace-nowrap">Save</button>
            )}
        </div>
    );
}

function ConvertModal({ lead, onClose, onDone }) {
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (password.length < 8) return toast.error('Password must be at least 8 characters');
        setBusy(true);
        try {
            await convertLead(lead.id, { password });
            toast.success(`${lead.name} is now a student. Assign a course in Teacher Assignments.`);
            onDone();
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Convert failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-ol-8 w-full max-w-md p-5">
                <h5 className="text-[15px] font-semibold text-dark mb-1">Convert lead → student</h5>
                <p className="text-[13px] text-gray mb-4">Creates a login for <strong className="text-dark">{lead.name}</strong> ({lead.email}). Set their password below.</p>
                <label className="text-[12px] text-gray">Password (min 8 chars)</label>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="ol-form-control text-[13px] w-full mb-4" placeholder="Set a password" autoFocus />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-ol-8 text-[13px] text-gray">Cancel</button>
                    <button type="submit" disabled={busy} className="px-4 py-2 rounded-ol-8 bg-primary text-white text-[13px] font-semibold disabled:opacity-60">{busy ? 'Creating…' : 'Create student'}</button>
                </div>
            </form>
        </div>
    );
}
