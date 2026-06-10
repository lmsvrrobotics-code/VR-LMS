import { useEffect, useState } from 'react';
import { Mail, RefreshCw, Trash2, MailOpen, Inbox } from 'lucide-react';
import { listMessages, updateMessage, deleteMessage } from '../../api/contact';

const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'Unread' },
    { key: 'read', label: 'Read' },
];

export default function AdminMessagesIndex() {
    const [messages, setMessages] = useState([]);
    const [unread, setUnread] = useState(0);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const load = (status = filter) => {
        setLoading(true);
        listMessages(status === 'all' ? {} : { status })
            .then((d) => { setMessages(d?.messages || []); setUnread(d?.unread || 0); })
            .catch(() => setMessages([]))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

    const toggleRead = async (m) => {
        setBusyId(m.id);
        try { await updateMessage(m.id, { status: m.status === 'new' ? 'read' : 'new' }); load(); }
        catch { /* ignore */ }
        finally { setBusyId(null); }
    };

    const remove = async (m) => {
        if (!window.confirm(`Delete the message from ${m.name || m.email}?`)) return;
        setBusyId(m.id);
        try { await deleteMessage(m.id); load(); }
        catch { /* ignore */ }
        finally { setBusyId(null); }
    };

    return (
        <div className="p-1">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                    <h1 className="text-xl font-bold text-dark m-0 flex items-center gap-2">
                        Messages
                        {unread > 0 && <span className="text-[12px] font-bold text-white bg-[#FF6A00] rounded-full px-2 py-0.5">{unread} new</span>}
                    </h1>
                    <p className="text-[13px] text-gray mt-1 mb-0">Submissions from the public "Send us a Message" contact form.</p>
                </div>
                <button onClick={() => load()} className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md border border-border hover:bg-gray-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-border">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-4 py-2.5 text-[14px] font-semibold border-b-2 -mb-px transition-colors ${filter === f.key ? 'border-skin text-skin' : 'border-transparent text-gray hover:text-dark'}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="text-[13px] text-gray">Loading…</p>
            ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 bg-white border border-border rounded-xl">
                    <Inbox className="w-9 h-9 text-gray-300 mb-2" />
                    <p className="text-[14px] font-semibold text-dark">No messages</p>
                    <p className="text-[13px] text-gray">New contact-form submissions will appear here.</p>
                </div>
            ) : (
                <ul className="list-none p-0 m-0 space-y-3">
                    {messages.map((m) => (
                        <li key={m.id} className={`rounded-xl border p-4 ${m.status === 'new' ? 'border-[#FF6A00]/40 bg-orange-50/40' : 'border-border bg-white'}`}>
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[15px] font-bold text-dark">{m.name || 'Anonymous'}</span>
                                        {m.status === 'new' && <span className="text-[10px] font-bold text-white bg-[#FF6A00] rounded-full px-2 py-0.5">NEW</span>}
                                    </div>
                                    <a href={`mailto:${m.email}`} className="text-[13px] text-skin hover:underline inline-flex items-center gap-1">
                                        <Mail className="w-3.5 h-3.5" /> {m.email}
                                    </a>
                                    <span className="text-[12px] text-gray ml-3">{fmtDate(m.created_at)}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => toggleRead(m)}
                                        disabled={busyId === m.id}
                                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg border border-border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        <MailOpen className="w-3.5 h-3.5" /> {m.status === 'new' ? 'Mark read' : 'Mark unread'}
                                    </button>
                                    <button
                                        onClick={() => remove(m)}
                                        disabled={busyId === m.id}
                                        className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {m.subject && <p className="text-[14px] font-semibold text-dark mt-3 mb-1">{m.subject}</p>}
                            <p className="text-[13px] text-dark whitespace-pre-wrap leading-relaxed">{m.message}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
