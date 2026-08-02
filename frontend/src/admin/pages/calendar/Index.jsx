import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isSameMonth, isToday, isTomorrow, differenceInMinutes } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  CalendarDays, GraduationCap, Presentation, Clock, Users, RefreshCw, MapPin, X,
  ChevronLeft, ChevronRight, CalendarClock, Video, Plus, CalendarOff, AlertTriangle, CheckCircle2,
} from 'lucide-react';
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
/**
 * Normalise a session's end time for rendering.
 *
 * Two separate problems, both seen in real rows:
 *  1. An end on a LATER day paints the month-view bar across every cell in
 *     between (a Sun session stretching to the following Fri).
 *  2. An end BEFORE the start — e.g. start 26 Jul 23:50, end 26 Jul 12:50, or
 *     an end dated the previous day. react-big-calendar silently DROPS events
 *     whose range is inverted, so those sessions vanished from the grid
 *     entirely: four classes on 26 Jul rendered as one.
 *
 * Both collapse to "render it as a point-in-time session at `start`", which is
 * what these entries semantically are. Never return a range that ends before it
 * begins — a hidden session is worse than a zero-length one.
 */
const clampEnd = (start, end) => {
  if (!start) return end || start;
  if (!end) return start;
  if (!sameDay(start, end)) return start; // spans days → collapse to the start day
  if (end.getTime() < start.getTime()) return start; // inverted → collapse
  return end;
};

/** True when a stored row has an end that precedes its start (bad data). */
const hasInvalidRange = (start, end) =>
  Boolean(start && end && end.getTime() < start.getTime());
// Ask the (now per_page-aware) admin endpoints for the full schedule, not just
// the default 10-row page — the calendar must plot EVERY class/demo/slot.
const FEED_PARAMS = { per_page: 1000, page: 1 };

// "Today · 4:26 PM" / "Tomorrow · …" / "Sun, 26 Jul · …" — a relative day reads
// faster than an absolute date for the near-term sessions in the rail.
const relativeDay = (d) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE, dd MMM'));

// Compact session length, omitted when start === end (a point-in-time entry).
const durationLabel = (start, end) => {
  if (!start || !end) return null;
  const mins = differenceInMinutes(end, start);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};

/**
 * Custom rbc toolbar. The stock one renders three plain buttons with the month
 * label wedged between them, which was the last piece of this page still
 * looking like the library's default. This splits it into icon-only prev/next,
 * the month as a real heading, and a segmented view switcher — the same control
 * pattern used elsewhere in the admin shell.
 */
function CalendarToolbar({ label, onNavigate, view, onView, dayCount }) {
  const views = [
    { key: 'month', label: 'Month' },
    { key: 'week', label: 'Week' },
    { key: 'day', label: 'Day' },
    { key: 'agenda', label: 'Agenda' },
  ];
  const navBtn =
    'grid h-8 w-8 place-items-center rounded-ol-8 border border-ebordermuted bg-white text-gray transition-colors hover:border-skin hover:bg-lightgreen hover:text-skin';

  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous period" className={navBtn} onClick={() => onNavigate('PREV')}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Next period" className={navBtn} onClick={() => onNavigate('NEXT')}>
          <ChevronRight className="h-4 w-4" />
        </button>
        <h2 className="m-0 ml-1 text-[16px] font-bold tracking-[-0.01em] text-dark tabular-nums">{label}</h2>

        {/* In day/week view, show how many sessions are in scope so the admin
            knows the list is complete (this is where they land after clicking
            "+N more" on a busy day). */}
        {dayCount > 0 && (view === 'day' || view === 'week') && (
          <span className="rounded-full bg-lightgreen px-2 py-0.5 text-[11px] font-semibold text-skin tabular-nums">
            {dayCount} session{dayCount === 1 ? '' : 's'}
          </span>
        )}

        <button
          type="button"
          onClick={() => onNavigate('TODAY')}
          className="ml-1 rounded-ol-8 border border-ebordermuted bg-white px-2.5 py-1 text-[12px] font-semibold text-gray transition-colors hover:border-skin hover:bg-lightgreen hover:text-skin"
        >
          Today
        </button>

        {/* Explicit way back after drilling into a single day. */}
        {view !== 'month' && (
          <button
            type="button"
            onClick={() => onView('month')}
            className="rounded-ol-8 border border-ebordermuted bg-white px-2.5 py-1 text-[12px] font-semibold text-gray transition-colors hover:border-skin hover:bg-lightgreen hover:text-skin"
          >
            ← Month
          </button>
        )}
      </div>

      {/* Segmented view switcher */}
      <div className="inline-flex items-center gap-0.5 rounded-ol-10 bg-gray-100 p-1">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onView(v.key)}
            aria-pressed={view === v.key}
            className={`rounded-ol-8 px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              view === v.key ? 'bg-white text-skin shadow-sm' : 'text-gray hover:text-dark'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminCalendarIndex() {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [enabled, setEnabled] = useState({ slot: true, demo: true, class: true });
  const [data, setData] = useState({ slots: [], demos: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [addAt, setAddAt] = useState(null);
  // Which list the sessions rail is showing: what's ahead, or what already ran.
  const [railTab, setRailTab] = useState('upcoming');

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
    const push = (r, id, title, type) => {
      const start = toDate(r.start_at);
      const rawEnd = toDate(r.end_at);
      // clampEnd guarantees end >= start. Without that, rbc silently DROPS the
      // event and the session disappears from the grid (the "4 classes on 26 Jul
      // but only 1 shows" bug).
      out.push({ id, title, type, raw: r, start, end: clampEnd(start, rawEnd), badRange: hasInvalidRange(start, rawEnd) });
    };
    if (enabled.slot) data.slots.forEach((r) => push(r, `slot-${r.id}`, r.name || 'Slot', 'slot'));
    if (enabled.demo) data.demos.forEach((r) => push(r, `demo-${r.id}`, r.title || 'Demo', 'demo'));
    if (enabled.class) data.classes.forEach((r) => push(r, `class-${r.id}`, r.name || 'Class', 'class'));
    return out.filter((e) => e.start instanceof Date && !isNaN(e.start));
  }, [data, enabled]);

  const eventStyle = useCallback((event) => {
    // Finished sessions stay fully visible but are muted, so "what's left today"
    // reads at a glance without hiding any history.
    const end = event.end && event.end > event.start ? event.end : event.start;
    const done = end < new Date();
    return {
      style: {
        backgroundColor: TYPES[event.type]?.color || '#64748b',
        border: 'none',
        color: '#fff',
        borderRadius: 8,
        fontSize: 11.5,
        padding: '2px 7px',
        boxShadow: '0 1px 2px rgba(15,23,42,0.16)',
        opacity: done ? 0.55 : 1,
      },
    };
  }, []);

  // How many sessions are in the currently-viewed scope. Surfaced in the
  // toolbar for day/week so an admin who drilled into a busy day can confirm
  // they're seeing the full list (10 classes on one day is the case month view
  // physically can't render).
  const scopeCount = useMemo(() => {
    if (view === 'day') return events.filter((e) => sameDay(e.start, date)).length;
    if (view === 'week') {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return events.filter((e) => e.start >= weekStart && e.start < weekEnd).length;
    }
    return 0;
  }, [events, date, view]);

  // Memoised so rbc doesn't see a new component identity on every render (which
  // would remount the toolbar and drop focus mid-interaction). scopeCount is a
  // dependency because the toolbar closes over it.
  const calendarComponents = useMemo(
    () => ({
      event: AdminEventChip,
      toolbar: (props) => <CalendarToolbar {...props} dayCount={scopeCount} />,
    }),
    [scopeCount],
  );

  const counts = { slot: data.slots.length, demo: data.demos.length, class: data.classes.length };

  // Stat strip + "upcoming" rail derive from ALL loaded rows (ignoring the
  // legend filters) so the numbers always reflect the real schedule.
  const now = new Date();
  const allEvents = useMemo(() => {
    const out = [];
    // `badRange` marks rows whose stored end precedes their start. The end is
    // normalised for display (so the detail modal can't show "5:40 PM – 12:50 PM"),
    // but the flag is kept so the UI can tell the admin the row needs fixing
    // rather than quietly papering over corrupt data.
    const push = (r, id, title, type) => {
      const start = toDate(r.start_at);
      const rawEnd = toDate(r.end_at);
      out.push({
        id, title, type, raw: r,
        start,
        end: clampEnd(start, rawEnd),
        badRange: hasInvalidRange(start, rawEnd),
      });
    };
    data.slots.forEach((r) => push(r, `slot-${r.id}`, r.name || 'Slot', 'slot'));
    data.demos.forEach((r) => push(r, `demo-${r.id}`, r.title || 'Demo', 'demo'));
    data.classes.forEach((r) => push(r, `class-${r.id}`, r.name || 'Class', 'class'));
    return out.filter((e) => e.start instanceof Date && !isNaN(e.start));
  }, [data]);

  // Rows an admin should go fix: their saved end time is before their start.
  const invalidRows = useMemo(() => allEvents.filter((e) => e.badRange), [allEvents]);

  // A session counts as finished once its END has passed (not its start) — a
  // class running right now is still "live", not history.
  const endOf = (e) => (e.end && e.end > e.start ? e.end : e.start);
  const isPast = (e) => endOf(e) < now;

  const upcoming = useMemo(
    () => allEvents.filter((e) => !isPast(e)).sort((a, b) => a.start - b.start).slice(0, 6),
    [allEvents], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Finished sessions, most recent first — an admin reviewing the day cares
  // about what just happened, not what happened weeks ago.
  const past = useMemo(
    () => allEvents.filter((e) => isPast(e)).sort((a, b) => b.start - a.start).slice(0, 8),
    [allEvents], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nextUp = upcoming[0] || null;
  const monthCount = useMemo(() => allEvents.filter((e) => isSameMonth(e.start, date)).length, [allEvents, date]);
  const upcomingCount = useMemo(() => allEvents.filter((e) => !isPast(e)).length, [allEvents]); // eslint-disable-line react-hooks/exhaustive-deps
  const pastCount = useMemo(() => allEvents.filter((e) => isPast(e)).length, [allEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compact KPI tile — matches the dashboard's instrument-panel look: small
  // uppercase label, large tabular number, quiet type-tinted icon.
  const Kpi = ({ type, value, label, icon: Icon }) => {
    const t = TYPES[type];
    const color = t ? t.color : '#FF6A00';
    const accent = t ? t.accent : 'rgba(255,106,0,0.12)';
    return (
      // A hairline top rule in the type colour ties each tile to its legend chip
      // and calendar blocks, so the strip reads as an instrument panel rather
      // than four unrelated numbers.
      <div className="group relative flex items-center gap-3 p-4 transition-colors hover:bg-gray-50/70">
        <span
          className="absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity group-hover:opacity-100"
          style={{ background: color }}
        />
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ol-10 transition-transform group-hover:scale-105"
          style={{ background: accent }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </span>
        <div className="leading-tight">
          <div className="text-[24px] font-bold tracking-[-0.02em] text-dark tabular-nums">{value}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray">{label}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar — title left, filters + refresh right, matching the dashboard. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[18px] font-bold text-dark">Calendar</h1>
          <p className="m-0 mt-0.5 text-[12px] text-gray">Every class, demo and slot across the academy — in one view.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Type filters as toggle chips (clearer than bare checkboxes). */}
          {Object.entries(TYPES).map(([key, t]) => {
            const on = enabled[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEnabled((p) => ({ ...p, [key]: !p[key] }))}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${on ? 'border-transparent text-white' : 'border-ebordermuted bg-white text-gray hover:bg-gray-50'}`}
                style={on ? { backgroundColor: t.color } : undefined}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: on ? '#fff' : t.color }} />
                {t.label}
                <span className={on ? 'text-white/80' : 'text-gray-400'}>{counts[key]}</span>
              </button>
            );
          })}
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-ol-8 border border-ebordermuted bg-white px-3 py-1.5 text-[12.5px] font-semibold text-dark transition-colors hover:bg-gray-50 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI strip — one bordered, hairline-divided panel. */}
      <div className="overflow-hidden rounded-ol-8 border border-ebordermuted bg-white">
        <div className="grid grid-cols-2 divide-x divide-y divide-ebordermuted md:grid-cols-4 md:divide-y-0">
          <Kpi type="class" value={counts.class} label="Classes" icon={GraduationCap} />
          <Kpi type="demo" value={counts.demo} label="Demos" icon={Presentation} />
          <Kpi type="slot" value={counts.slot} label="Slots" icon={MapPin} />
          <Kpi value={monthCount} label={format(date, 'MMM yyyy')} icon={CalendarDays} />
        </div>
      </div>

      {error && <div className="rounded-ol-8 border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>}

      {/* Corrupt rows are shown (clamped to a point in time) rather than hidden,
          but the admin is told which ones need their end time corrected. */}
      {invalidRows.length > 0 && (
        <div className="rounded-ol-8 border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong className="font-semibold">
                {invalidRows.length} session{invalidRows.length === 1 ? '' : 's'} have an end time before the start time.
              </strong>
              <div className="mt-0.5 text-amber-700">
                They&apos;re shown at their start time so nothing is hidden — please edit and fix the end time:{' '}
                {invalidRows.slice(0, 4).map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      className="font-semibold underline underline-offset-2 hover:text-amber-900"
                    >
                      {e.title}
                    </button>
                  </span>
                ))}
                {invalidRows.length > 4 && ` and ${invalidRows.length - 4} more`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div style={{ height: '66vh' }} className="admin-cal rounded-ol-12 border border-ebordermuted bg-white p-4 shadow-sm">
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
            // A busy day (say 10 classes) can't fit in a month cell. rbc's
            // default "+N more" popup is a fixed white box that overflows the
            // viewport once there are more than a handful of entries. Instead,
            // clicking the count jumps to that date's Day view, which lists
            // EVERY session with no cap. The popup remains as a hover/secondary
            // affordance and is now scroll-capped in CSS.
            onShowMore={(evts, showMoreDate) => {
              setDate(showMoreDate);
              setView('day');
            }}
            // Clicking the date number does the same — a natural way to drill in.
            onDrillDown={(drillDate) => {
              setDate(drillDate);
              setView('day');
            }}
            selectable
            onSelectEvent={(e) => setSelected(e)}
            onSelectSlot={(slotInfo) => setAddAt(slotInfo.start)}
            eventPropGetter={eventStyle}
            components={calendarComponents}
            style={{ height: '100%' }}
          />
        </div>

        {/* Sessions rail — Upcoming / Completed. Finished sessions used to be
            filtered out entirely, so an admin had no way to review what had
            already run without hunting through the grid. */}
        <aside className="rounded-ol-8 border border-ebordermuted bg-white">
          <div className="border-b border-ebordermuted px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-[18px] w-[18px] text-skin" />
              <h2 className="m-0 text-[14px] font-semibold text-dark">Sessions</h2>
            </div>
            {/* Segmented switch so both lists are one click apart. */}
            <div className="mt-2.5 inline-flex w-full items-center gap-0.5 rounded-ol-10 bg-gray-100 p-1">
              {[
                { key: 'upcoming', label: 'Upcoming', n: upcomingCount },
                { key: 'past', label: 'Completed', n: pastCount },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setRailTab(t.key)}
                  aria-pressed={railTab === t.key}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-ol-8 px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    railTab === t.key ? 'bg-white text-skin shadow-sm' : 'text-gray hover:text-dark'
                  }`}
                >
                  {t.label}
                  <span className={`tabular-nums ${railTab === t.key ? 'text-skin/70' : 'text-gray-400'}`}>{t.n}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="p-3">
            {loading ? (
              <div className="flex items-center gap-2 px-1 py-2 text-[13px] text-gray">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-skin border-t-transparent" />
                Loading…
              </div>
            ) : railTab === 'upcoming' ? (
              upcoming.length === 0 ? (
                <div className="px-1 py-6 text-center">
                  <CalendarOff className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="m-0 text-[13px] text-gray">Nothing scheduled ahead.</p>
                  <p className="m-0 mt-0.5 text-[12px] text-gray-400">Click an empty day to add one.</p>
                </div>
              ) : (
                <>
                  {/* Next-up highlight: the single most imminent session, called
                      out so it isn't lost among identical-looking rows. */}
                  {nextUp && (
                    <button
                      type="button"
                      onClick={() => setSelected(nextUp)}
                      className="mb-2 w-full rounded-ol-10 border p-3 text-left transition-colors"
                      style={{
                        borderColor: `${TYPES[nextUp.type]?.color}55`,
                        background: TYPES[nextUp.type]?.accent,
                      }}
                    >
                      <span
                        className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: TYPES[nextUp.type]?.color }}
                      >
                        Next up
                      </span>
                      <div className="mt-1 truncate text-[13.5px] font-bold text-dark">{nextUp.title}</div>
                      <div className="mt-0.5 text-[12px] text-gray tabular-nums">
                        {relativeDay(nextUp.start)} · {format(nextUp.start, 'h:mm a')}
                      </div>
                      {nextUp.raw?.teacher_names?.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 text-[12px] text-gray">
                          <Users className="h-3 w-3" /> {nextUp.raw.teacher_names.join(', ')}
                        </div>
                      )}
                    </button>
                  )}

                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {upcoming.slice(nextUp ? 1 : 0).map((e) => (
                      <li key={e.id}><SessionRow event={e} onOpen={setSelected} /></li>
                    ))}
                  </ul>
                </>
              )
            ) : past.length === 0 ? (
              <div className="px-1 py-6 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="m-0 text-[13px] text-gray">No completed sessions yet.</p>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {past.map((e) => (
                  <li key={e.id}><SessionRow event={e} onOpen={setSelected} done /></li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Event details */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${TYPES[selected.type]?.label} details`}
        >
          <div className="w-full max-w-md overflow-hidden rounded-ol-12 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Type-coloured header band — the session's identity is the first
                thing read, instead of a 10px dot above a plain white row. */}
            <div className="px-5 py-4" style={{ background: TYPES[selected.type]?.color }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/90">
                    {(() => {
                      const Icon = TYPES[selected.type]?.icon;
                      return Icon ? <Icon className="h-3.5 w-3.5" /> : null;
                    })()}
                    {TYPES[selected.type]?.label?.replace(/s$/, '')}
                    {/* State badge so a finished session is never mistaken for
                        one that's still to come. */}
                    {isPast(selected) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Completed
                      </span>
                    ) : selected.start <= now ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-1.5 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live now
                      </span>
                    ) : null}
                  </span>
                  <h3 className="mb-0 mt-1 break-words text-[19px] font-bold leading-snug text-white">{selected.title}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-ol-8 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-start gap-2.5">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div className="text-[13.5px]">
                  <div className="font-semibold text-dark">{selected.start && format(selected.start, 'EEEE, dd MMMM yyyy')}</div>
                  <div className="text-gray tabular-nums">
                    {selected.start && format(selected.start, 'h:mm a')}
                    {selected.end && ` – ${format(selected.end, 'h:mm a')}`}
                    {(() => {
                      const d = durationLabel(selected.start, selected.end);
                      return d ? ` · ${d}` : '';
                    })()}
                  </div>
                </div>
              </div>

              {(selected.raw?.course_title || selected.raw?.course_id) && (
                <div className="flex items-start gap-2.5 text-[13.5px]">
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <span className="text-gray">Course · </span>
                    <span className="font-medium text-dark">{selected.raw.course_title || selected.raw.course_id}</span>
                  </div>
                </div>
              )}

              {selected.raw?.teacher_names?.length > 0 && (
                <div className="flex items-start gap-2.5 text-[13.5px]">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <span className="text-gray">{selected.raw.teacher_names.length > 1 ? 'Teachers · ' : 'Teacher · '}</span>
                    <span className="font-medium text-dark">{selected.raw.teacher_names.join(', ')}</span>
                  </div>
                </div>
              )}

              {/* A finished session's meeting link is dead, so don't offer
                  "Join" — show it as a plain reference link instead. */}
              {selected.raw?.meeting_link && (
                isPast(selected) ? (
                  <div className="mt-1 flex items-center gap-2 text-[12.5px] text-gray">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-gray-400" />
                    <span>
                      This session has ended.{' '}
                      <a
                        className="font-semibold text-skin underline underline-offset-2"
                        href={selected.raw.meeting_link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Meeting link
                      </a>
                    </span>
                  </div>
                ) : (
                  <a
                    className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-ol-10 px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: TYPES[selected.type]?.color }}
                    href={selected.raw.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Video className="h-4 w-4" /> Join session
                  </a>
                )
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-ebordermuted px-5 py-3">
              <Link to={TYPES[selected.type]?.addTo} className="rounded-ol-8 border border-ebordermuted px-3 py-1.5 text-[13px] font-semibold text-dark transition-colors hover:bg-gray-50">Manage {TYPES[selected.type]?.label}</Link>
              <button onClick={() => setSelected(null)} className="rounded-ol-8 bg-dark px-3 py-1.5 text-[13px] font-semibold text-white">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add chooser when an empty slot is clicked */}
      {addAt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setAddAt(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Choose what to schedule"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-ol-12 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-ebordermuted px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-ol-8 bg-lightgreen text-skin">
                    <Plus className="h-4 w-4" />
                  </span>
                  <h3 className="m-0 text-[15px] font-bold text-dark tabular-nums">
                    {format(addAt, 'EEE, dd MMM yyyy')}
                  </h3>
                </div>
                <p className="m-0 mt-1.5 text-[12.5px] text-gray">What would you like to schedule?</p>
              </div>
              <button
                onClick={() => setAddAt(null)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-ol-8 text-gray-400 transition-colors hover:bg-gray-100 hover:text-dark"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 px-5 py-4">
              {Object.entries(TYPES).map(([key, t]) => (
                <Link
                  key={key}
                  to={t.addTo}
                  className="group flex items-center gap-3 rounded-ol-10 border border-ebordermuted px-3 py-3 text-[13px] font-semibold text-dark transition-colors hover:border-skin/40 hover:bg-gray-50"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-ol-8 transition-transform group-hover:scale-105"
                    style={{ background: t.accent }}
                  >
                    <t.icon className="h-[18px] w-[18px]" style={{ color: t.color }} />
                  </span>
                  <span className="flex-1">{t.label.replace(/s$/, '')}</span>
                  <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-skin" />
                </Link>
              ))}
            </div>
            <div className="flex justify-end border-t border-ebordermuted px-5 py-3">
              <button onClick={() => setAddAt(null)} className="rounded-ol-8 bg-dark px-3 py-1.5 text-[13px] font-semibold text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact in-cell renderer: start time + title (+ first teacher when there's
// room), so each block reads as "who/what/when" at a glance.
/**
 * One row in the sessions rail. Shared by the Upcoming and Completed lists so
 * both read identically; `done` dims the row and swaps the type label for a
 * "Completed" badge, making finished sessions obviously distinct at a glance
 * without hiding any of their detail.
 */
function SessionRow({ event: e, onOpen, done = false }) {
  const color = TYPES[e.type]?.color;
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={`group w-full rounded-ol-8 border border-ebordermuted px-3 py-2.5 text-left transition-colors hover:border-skin/40 hover:bg-gray-50 ${
        done ? 'opacity-70 hover:opacity-100' : ''
      }`}
      style={{ borderLeft: `3px solid ${done ? '#c3c9da' : color}` }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: done ? '#878d97' : color }}
        >
          {TYPES[e.type]?.label?.replace(/s$/, '')}
        </span>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-gray">
            <CheckCircle2 className="h-2.5 w-2.5" /> Done
          </span>
        )}
        {!done && e.raw?.meeting_link && <Video className="h-3 w-3 text-gray-400" />}
      </div>
      <div className={`mt-0.5 truncate text-[13px] font-semibold ${done ? 'text-gray' : 'text-dark'}`}>
        {e.title}
      </div>
      <div className="mt-0.5 text-[12px] text-gray tabular-nums">
        {relativeDay(e.start)} · {format(e.start, 'h:mm a')}
      </div>
      {e.raw?.teacher_names?.length > 0 && (
        <div className="mt-0.5 flex items-center gap-1 text-[12px] text-gray">
          <Users className="h-3 w-3" /> {e.raw.teacher_names.join(', ')}
        </div>
      )}
    </button>
  );
}

function AdminEventChip({ event }) {
  const teacher = event.raw?.teacher_names?.[0];
  const extra = (event.raw?.teacher_names?.length || 0) - 1;
  return (
    <div className="flex flex-col overflow-hidden leading-tight">
      <span className="truncate font-semibold">
        {event.start ? `${format(event.start, 'h:mm a')} · ` : ''}{event.title}
      </span>
      {teacher && (
        <span className="truncate text-[11px] opacity-85">
          {teacher}{extra > 0 ? ` +${extra}` : ''}
        </span>
      )}
    </div>
  );
}
