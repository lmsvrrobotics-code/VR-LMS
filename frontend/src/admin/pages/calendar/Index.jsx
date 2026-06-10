import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isSameMonth } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { CalendarDays, GraduationCap, Presentation, Clock, Users, RefreshCw, MapPin } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { listSlots } from '../../api/slot';
import { listDemos } from '../../api/demo';
import { listClasses } from '../../api/class';

const localizer = dateFnsLocalizer({
  format, parse, startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), getDay, locales: { 'en-US': enUS },
});

// Visual identity per scheduled type.
const TYPES = {
  slot:  { label: 'Slots',   color: '#2563eb', addTo: '/admin/slots',   icon: MapPin,        accent: 'rgba(37,99,235,0.12)' },   // blue
  demo:  { label: 'Demos',   color: '#16a34a', addTo: '/admin/demos',   icon: Presentation,  accent: 'rgba(22,163,74,0.12)' },   // green
  class: { label: 'Classes', color: '#ea580c', addTo: '/admin/classes', icon: GraduationCap, accent: 'rgba(234,88,12,0.12)' },  // orange
};
// list endpoints wrap the array as { slots:{data:[]} } etc — extract defensively.
const rows = (res, key) => res?.[key]?.data || res?.[key] || res?.data || (Array.isArray(res) ? res : []);
const toDate = (v) => (v ? new Date(v) : null);
// True when two dates fall on the same calendar day.
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Slots/demos/classes are point sessions — clamp the end to the start's day so a
// later stored end doesn't paint the month-view bar across multiple cells.
const clampEnd = (start, end) => (start && end && !sameDay(start, end) ? start : (end || start));
// Ask the (now per_page-aware) admin endpoints for the full schedule, not just
// the default 10-row page — the calendar must plot EVERY class/demo/slot.
const FEED_PARAMS = { per_page: 1000, page: 1 };

export default function AdminCalendarIndex() {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [enabled, setEnabled] = useState({ slot: true, demo: true, class: true });
  const [data, setData] = useState({ slots: [], demos: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [addAt, setAddAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, d, c] = await Promise.all([
        listSlots(FEED_PARAMS).catch(() => ({})),
        listDemos(FEED_PARAMS).catch(() => ({})),
        listClasses(FEED_PARAMS).catch(() => ({})),
      ]);
      setData({ slots: rows(s, 'slots'), demos: rows(d, 'demos'), classes: rows(c, 'classes') });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load schedule');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live reflection: re-pull when the admin returns to this tab (e.g. after
  // adding a class/demo on another page) and when any schedule page broadcasts
  // a change. Keeps the calendar in sync without a manual refresh.
  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onChanged = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('schedule:changed', onChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('schedule:changed', onChanged);
    };
  }, [load]);

  // One-off scheduled events: slots / demos / classes.
  const events = useMemo(() => {
    const out = [];
    if (enabled.slot) data.slots.forEach((r) => out.push({ id: `slot-${r.id}`, title: r.name || 'Slot', start: toDate(r.start_at), end: clampEnd(toDate(r.start_at), toDate(r.end_at)), type: 'slot', raw: r }));
    if (enabled.demo) data.demos.forEach((r) => out.push({ id: `demo-${r.id}`, title: r.title || 'Demo', start: toDate(r.start_at), end: clampEnd(toDate(r.start_at), toDate(r.end_at)), type: 'demo', raw: r }));
    if (enabled.class) data.classes.forEach((r) => out.push({ id: `class-${r.id}`, title: r.name || 'Class', start: toDate(r.start_at), end: clampEnd(toDate(r.start_at), toDate(r.end_at)), type: 'class', raw: r }));
    return out.filter((e) => e.start instanceof Date && !isNaN(e.start));
  }, [data, enabled]);

  const eventStyle = useCallback((event) => ({
    style: { backgroundColor: TYPES[event.type]?.color || '#64748b', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12, padding: '1px 6px' },
  }), []);

  const counts = { slot: data.slots.length, demo: data.demos.length, class: data.classes.length };

  // Stat strip + "upcoming" rail derive from ALL loaded rows (ignoring the
  // legend filters) so the numbers always reflect the real schedule.
  const now = new Date();
  const allEvents = useMemo(() => {
    const out = [];
    data.slots.forEach((r) => out.push({ id: `slot-${r.id}`, title: r.name || 'Slot', start: toDate(r.start_at), end: toDate(r.end_at) || toDate(r.start_at), type: 'slot', raw: r }));
    data.demos.forEach((r) => out.push({ id: `demo-${r.id}`, title: r.title || 'Demo', start: toDate(r.start_at), end: toDate(r.end_at) || toDate(r.start_at), type: 'demo', raw: r }));
    data.classes.forEach((r) => out.push({ id: `class-${r.id}`, title: r.name || 'Class', start: toDate(r.start_at), end: toDate(r.end_at) || toDate(r.start_at), type: 'class', raw: r }));
    return out.filter((e) => e.start instanceof Date && !isNaN(e.start));
  }, [data]);

  const upcoming = useMemo(
    () => allEvents.filter((e) => e.start >= now).sort((a, b) => a.start - b.start).slice(0, 6),
    [allEvents], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const monthCount = useMemo(() => allEvents.filter((e) => isSameMonth(e.start, date)).length, [allEvents, date]);

  const StatCard = ({ type, value, label, icon: Icon }) => {
    const t = TYPES[type];
    return (
      <div className="flex items-center gap-3 rounded-ol-12 bg-white border border-border px-4 py-3">
        <span className="flex items-center justify-center w-10 h-10 rounded-ol-10 shrink-0" style={{ background: t ? t.accent : 'rgba(255,106,0,0.12)' }}>
          <Icon className="w-5 h-5" style={{ color: t ? t.color : '#FF6A00' }} />
        </span>
        <div className="leading-tight">
          <div className="text-[20px] font-bold text-dark">{value}</div>
          <div className="text-[12px] text-gray">{label}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-1">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-dark m-0">Calendar</h1>
          <p className="text-[13px] text-gray mt-1 mb-0">Every class, demo and slot across the academy — in one view.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(TYPES).map(([key, t]) => (
            <label key={key} className="flex items-center gap-1.5 text-[13px] cursor-pointer select-none">
              <input type="checkbox" checked={enabled[key]} onChange={() => setEnabled((p) => ({ ...p, [key]: !p[key] }))} />
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: t.color }} />
              {t.label} <span className="text-gray-400">({counts[key]})</span>
            </label>
          ))}
          <button onClick={load} className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md border border-border hover:bg-gray-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard type="class" value={counts.class} label="Classes scheduled" icon={GraduationCap} />
        <StatCard type="demo" value={counts.demo} label="Demos scheduled" icon={Presentation} />
        <StatCard value={monthCount} label={`In ${format(date, 'MMMM yyyy')}`} icon={CalendarDays} />
      </div>

      {error && <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div style={{ height: '64vh' }} className="bg-white rounded-xl border border-border p-3">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            date={date}
            onNavigate={setDate}
            view={view}
            onView={setView}
            views={['month', 'week', 'day', 'agenda']}
            popup
            selectable
            onSelectEvent={(e) => setSelected(e)}
            onSelectSlot={(slotInfo) => setAddAt(slotInfo.start)}
            eventPropGetter={eventStyle}
            components={{ event: AdminEventChip }}
            style={{ height: '100%' }}
          />
        </div>

        {/* Upcoming rail */}
        <aside className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-skin" />
            <h2 className="text-[14px] font-bold text-dark m-0">Upcoming sessions</h2>
          </div>
          {loading ? (
            <p className="text-[13px] text-gray m-0">Loading…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-[13px] text-gray m-0">Nothing scheduled ahead. Click an empty day to add one.</p>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    className="w-full text-left rounded-ol-10 border border-border px-3 py-2 hover:shadow-sm transition-shadow"
                    style={{ borderLeft: `3px solid ${TYPES[e.type]?.color}` }}
                  >
                    <div className="text-[13px] font-semibold text-dark truncate">{e.title}</div>
                    <div className="text-[12px] text-gray">{format(e.start, 'EEE, dd MMM · h:mm a')}</div>
                    {e.raw?.teacher_names?.length > 0 && (
                      <div className="text-[12px] text-gray flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3" /> {e.raw.teacher_names.join(', ')}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Event details */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TYPES[selected.type]?.color }} />
              <span className="text-[12px] uppercase tracking-wide text-gray-500">{TYPES[selected.type]?.label}</span>
            </div>
            <h3 className="text-lg font-bold text-dark mt-0 mb-2">{selected.title}</h3>
            <p className="text-[13px] text-gray-600 m-0">
              {selected.start && format(selected.start, 'EEE, dd MMM yyyy · h:mm a')}
              {selected.end && ` – ${format(selected.end, 'h:mm a')}`}
            </p>
            {(selected.raw?.course_title || selected.raw?.course_id) && (
              <p className="text-[13px] text-gray-600 m-0 mt-1">Course: {selected.raw.course_title || selected.raw.course_id}</p>
            )}
            {selected.raw?.teacher_names?.length > 0 && (
              <p className="text-[13px] text-gray-600 m-0 mt-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {selected.raw.teacher_names.join(', ')}</p>
            )}
            {selected.raw?.meeting_link && <p className="text-[13px] m-0 mt-2"><a className="text-blue-600 underline" href={selected.raw.meeting_link} target="_blank" rel="noreferrer">Join link</a></p>}
            <div className="mt-4 flex justify-end gap-2">
              <Link to={TYPES[selected.type]?.addTo} className="text-[13px] px-3 py-1.5 rounded-md border border-border hover:bg-gray-50">Manage {TYPES[selected.type]?.label}</Link>
              <button onClick={() => setSelected(null)} className="text-[13px] px-3 py-1.5 rounded-md bg-dark text-white">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add chooser when an empty slot is clicked */}
      {addAt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAddAt(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-dark mt-0 mb-1">Schedule on {format(addAt, 'dd MMM yyyy')}</h3>
            <p className="text-[13px] text-gray-500 mt-0 mb-4">What do you want to add?</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPES).map(([key, t]) => (
                <Link key={key} to={t.addTo} className="text-[13px] px-3 py-2 rounded-md border border-border hover:bg-gray-50 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: t.color }} />{t.label}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><button onClick={() => setAddAt(null)} className="text-[13px] px-3 py-1.5 rounded-md bg-dark text-white">Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact in-cell renderer: start time + title (+ first teacher when there's
// room), so each block reads as "who/what/when" at a glance.
function AdminEventChip({ event }) {
  const teacher = event.raw?.teacher_names?.[0];
  return (
    <div className="flex flex-col leading-tight overflow-hidden">
      <span className="truncate"><strong>{event.start ? format(event.start, 'h:mm a') : ''}</strong> {event.title}</span>
      {teacher && <span className="truncate opacity-90 text-[11px]">{teacher}</span>}
    </div>
  );
}
