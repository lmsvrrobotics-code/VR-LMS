import { useCallback, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameMonth } from "date-fns";
import { enUS } from "date-fns/locale";
import { Clock, Video, CalendarDays } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";

// Shared schedule calendar used by the teacher dashboard to visualise the
// Demos + Classes an admin scheduled with this teacher. The admin keeps its own
// richer calendar (admin/pages/calendar) which also plots Slots. Mirrors that
// file's localizer + event-style setup so both calendars feel consistent.
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

export type ScheduleEventType = "demo" | "class";

export interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: ScheduleEventType;
  courseTitle?: string | null;
  meetingLink?: string | null;
}

const COLORS: Record<ScheduleEventType, string> = {
  demo: "#16a34a", // green
  class: "#ea580c", // orange
};
const LABELS: Record<ScheduleEventType, string> = { demo: "Demo", class: "Class" };

// True when two dates fall on the same calendar day.
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function EventChip({ event }: { event: ScheduleEvent }) {
  return (
    <div className="flex flex-col leading-tight overflow-hidden">
      <span className="truncate">
        <strong>{format(event.start, "h:mm a")}</strong> {event.title}
      </span>
      {event.courseTitle && <span className="truncate text-[11px] opacity-90">{event.courseTitle}</span>}
    </div>
  );
}

export default function ScheduleCalendar({
  events,
  loading = false,
}: {
  events: ScheduleEvent[];
  loading?: boolean;
}) {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>("month");
  const [selected, setSelected] = useState<ScheduleEvent | null>(null);

  // Drop anything with an unparseable start so react-big-calendar never throws.
  // A demo/class is a point-in-time session, so clamp its end to the SAME day as
  // its start — otherwise a stored end on a later day paints the month-view bar
  // across every cell in between (e.g. a Fri session stretching to Sun).
  const valid = useMemo(
    () =>
      events
        .filter((e) => e.start instanceof Date && !Number.isNaN(e.start.getTime()))
        .map((e) => {
          const end = e.end instanceof Date && !Number.isNaN(e.end.getTime()) ? e.end : e.start;
          return sameDay(e.start, end) ? e : { ...e, end: e.start };
        }),
    [events],
  );

  const now = new Date();
  const counts = useMemo(() => {
    const c: Record<ScheduleEventType, number> = { demo: 0, class: 0 };
    valid.forEach((e) => { c[e.type] += 1; });
    return c;
  }, [valid]);
  const monthCount = useMemo(() => valid.filter((e) => isSameMonth(e.start, date)).length, [valid, date]);
  const upcoming = useMemo(
    () => valid.filter((e) => e.start >= now).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 6),
    [valid], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const eventPropGetter = useCallback(
    (event: ScheduleEvent) => ({
      style: {
        backgroundColor: COLORS[event.type] || "#64748b",
        border: "none",
        color: "#fff",
        borderRadius: 6,
        fontSize: 12,
        padding: "1px 6px",
      },
    }),
    [],
  );

  return (
    <div>
      {/* Summary chips + legend */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 dark:bg-orange-500/15 px-3 py-1.5 text-[13px] font-medium">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.class }} />
          {counts.class} Class{counts.class === 1 ? "" : "es"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-green-50 dark:bg-green-500/15 px-3 py-1.5 text-[13px] font-medium">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.demo }} />
          {counts.demo} Demo{counts.demo === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" /> {monthCount} in {format(date, "MMM yyyy")}
        </span>
        {loading && <span className="text-[13px] text-muted-foreground">Loading…</span>}
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div style={{ height: "66vh" }} className="bg-white rounded-2xl border border-gray-200 p-3">
          <Calendar
            localizer={localizer}
            events={valid}
            startAccessor="start"
            endAccessor="end"
            date={date}
            onNavigate={setDate}
            view={view}
            onView={setView}
            views={["month", "week", "day", "agenda"]}
            popup
            onSelectEvent={(e) => setSelected(e as ScheduleEvent)}
            eventPropGetter={eventPropGetter}
            components={{ event: EventChip as never }}
            style={{ height: "100%" }}
          />
        </div>

        {/* Upcoming rail */}
        <aside className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="text-[14px] font-bold m-0">Upcoming sessions</h3>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-[13px] text-muted-foreground m-0">Nothing scheduled ahead yet.</p>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    className="w-full text-left rounded-xl border border-border px-3 py-2 hover:shadow-sm transition-shadow"
                    style={{ borderLeft: `3px solid ${COLORS[e.type]}` }}
                  >
                    <div className="text-[13px] font-semibold truncate">{e.title}</div>
                    <div className="text-[12px] text-muted-foreground">{format(e.start, "EEE, dd MMM · h:mm a")}</div>
                    {e.courseTitle && <div className="text-[12px] text-muted-foreground truncate">{e.courseTitle}</div>}
                    {e.meetingLink && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-primary font-semibold">
                        <Video className="w-3 h-3" /> Has meeting link
                      </span>
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
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div className="bg-white rounded-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS[selected.type] }} />
              <span className="text-[12px] uppercase tracking-wide text-gray-500">{LABELS[selected.type]}</span>
            </div>
            <h3 className="text-lg font-bold text-dark mt-0 mb-2">{selected.title}</h3>
            <p className="text-[13px] text-gray-600 m-0">
              {format(selected.start, "EEE, dd MMM yyyy · h:mm a")}
              {selected.end && ` – ${format(selected.end, "h:mm a")}`}
            </p>
            {selected.courseTitle && (
              <p className="text-[13px] text-gray-600 m-0 mt-1">Course: {selected.courseTitle}</p>
            )}
            {selected.meetingLink && (
              <p className="text-[13px] m-0 mt-2">
                <a
                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-hero text-white text-xs font-semibold px-3 py-1.5"
                  href={selected.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Video className="w-3.5 h-3.5" /> Join session
                </a>
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="text-[13px] px-3 py-1.5 rounded-md bg-dark text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
