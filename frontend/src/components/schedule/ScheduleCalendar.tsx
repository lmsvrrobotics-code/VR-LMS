import { useCallback, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  isSameMonth,
  isToday,
  isTomorrow,
  differenceInMinutes,
} from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Clock,
  Video,
  CalendarDays,
  GraduationCap,
  Presentation,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarClock,
  Link2,
  CheckCircle2,
} from "lucide-react";
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

/**
 * One place defining how each session type looks. `solid` paints the calendar
 * chip; the tint/text/ring trio styles the summary + rail on both themes.
 * Keeping them together stops the palette drifting between the three surfaces.
 */
const TYPE_STYLES: Record<
  ScheduleEventType,
  { solid: string; label: string; icon: typeof GraduationCap; tint: string; text: string; ring: string }
> = {
  class: {
    solid: "#ea580c",
    label: "Class",
    icon: GraduationCap,
    tint: "bg-orange-50 dark:bg-orange-500/10",
    text: "text-orange-700 dark:text-orange-300",
    ring: "ring-orange-200/70 dark:ring-orange-500/25",
  },
  demo: {
    solid: "#16a34a",
    label: "Demo",
    icon: Presentation,
    tint: "bg-emerald-50 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-200/70 dark:ring-emerald-500/25",
  },
};

// True when two dates fall on the same calendar day.
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today · 3:30 PM" / "Tomorrow · …" / "Thu, 16 Jul · …" — scannable at a glance. */
const relativeDay = (d: Date) =>
  isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE, dd MMM");

/** Compact duration, omitted when the session has no real length. */
const durationLabel = (start: Date, end: Date) => {
  const mins = differenceInMinutes(end, start);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

/** Calendar chip: time + title, with the course as a quiet second line. */
function EventChip({ event }: { event: ScheduleEvent }) {
  return (
    <div className="flex flex-col leading-tight overflow-hidden">
      <span className="truncate font-semibold">
        {format(event.start, "h:mm a")} · {event.title}
      </span>
      {event.courseTitle && (
        <span className="truncate text-[11px] opacity-85">{event.courseTitle}</span>
      )}
    </div>
  );
}

/**
 * One row in the sessions rail, shared by the Upcoming and Completed lists so
 * both read identically. `done` mutes the row and swaps in a "Done" badge, so a
 * finished session is obviously distinct without losing any of its detail.
 */
function SessionRow({
  event: e,
  onOpen,
  done = false,
}: {
  event: ScheduleEvent;
  onOpen: (e: ScheduleEvent) => void;
  done?: boolean;
}) {
  const s = TYPE_STYLES[e.type];
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={`group w-full text-left rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 hover:bg-muted/40 transition-colors ${
        done ? "opacity-70 hover:opacity-100" : ""
      }`}
      style={{ borderLeft: `3px solid ${done ? "hsl(var(--muted-foreground))" : s.solid}` }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${done ? "text-muted-foreground" : s.text}`}
        >
          {s.label}
        </span>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="w-2.5 h-2.5" /> Done
          </span>
        )}
        {!done && e.meetingLink && <Link2 className="w-3 h-3 text-muted-foreground" />}
      </div>
      <div
        className={`text-[13px] font-semibold truncate mt-0.5 transition-colors ${
          done ? "text-muted-foreground" : "group-hover:text-primary"
        }`}
      >
        {e.title}
      </div>
      <div className="text-[12px] text-muted-foreground">
        {relativeDay(e.start)} · {format(e.start, "h:mm a")}
      </div>
      {e.courseTitle && (
        <div className="text-[11.5px] text-muted-foreground/80 truncate">{e.courseTitle}</div>
      )}
    </button>
  );
}

/** Summary stat tile. */
function StatTile({
  icon: Icon,
  value,
  label,
  tint,
  text,
  ring,
}: {
  icon: typeof GraduationCap;
  value: number | string;
  label: string;
  tint: string;
  text: string;
  ring: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 ${tint} ${ring} transition-shadow hover:shadow-sm`}
    >
      <span className={`grid place-items-center w-9 h-9 rounded-lg bg-white/70 dark:bg-white/10 ${text}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="flex flex-col leading-none">
        <span className={`text-[19px] font-extrabold tracking-tight ${text}`}>{value}</span>
        <span className="text-[11.5px] font-medium text-muted-foreground mt-1">{label}</span>
      </span>
    </div>
  );
}

/**
 * Custom toolbar. rbc's default is a row of plain buttons with the month label
 * squeezed between them; this splits it into a titled month block, icon-only
 * prev/next, and a segmented view switcher — the pattern used elsewhere in the
 * dashboard.
 */
function Toolbar({
  label,
  onNavigate,
  view,
  onView,
  scopeCount = 0,
}: {
  label: string;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  view: View;
  onView: (v: View) => void;
  scopeCount?: number;
}) {
  const views: { key: View; label: string }[] = [
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
    { key: "day", label: "Day" },
    { key: "agenda", label: "Agenda" },
  ];
  const navBtn =
    "grid place-items-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-colors";

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous" className={navBtn} onClick={() => onNavigate("PREV")}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Next" className={navBtn} onClick={() => onNavigate("NEXT")}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <h3 className="text-[17px] font-bold tracking-tight m-0 ml-1">{label}</h3>

        {/* Confirms the drilled-into day/week is showing everything. */}
        {scopeCount > 0 && (view === "day" || view === "week") && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
            {scopeCount} session{scopeCount === 1 ? "" : "s"}
          </span>
        )}

        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="ml-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-colors"
        >
          Today
        </button>

        {/* Explicit way back after drilling into a single day. */}
        {view !== "month" && (
          <button
            type="button"
            onClick={() => onView("month")}
            className="text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-colors"
          >
            ← Month
          </button>
        )}
      </div>

      {/* Segmented control */}
      <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-muted/70 dark:bg-white/5">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onView(v.key)}
            aria-pressed={view === v.key}
            className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg transition-colors ${
              view === v.key
                ? "bg-white dark:bg-white/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
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
  // Which list the sessions rail shows: what's ahead, or what already ran.
  const [railTab, setRailTab] = useState<"upcoming" | "past">("upcoming");

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
          // Collapse to a point-in-time session when the stored end spans days
          // OR precedes the start. An INVERTED range is the important case:
          // react-big-calendar silently drops such events, so a real session
          // would vanish from the grid entirely.
          if (!sameDay(e.start, end) || end.getTime() < e.start.getTime()) {
            return { ...e, end: e.start };
          }
          return e;
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

  // A session is finished once its END has passed — one running right now is
  // still "live", not history.
  const endOf = (e: ScheduleEvent) => (e.end && e.end > e.start ? e.end : e.start);
  const isPast = (e: ScheduleEvent) => endOf(e) < now;

  const upcoming = useMemo(
    () => valid.filter((e) => !isPast(e)).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 6),
    [valid], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Completed sessions, most recent first. These used to be filtered out, so a
  // teacher couldn't review what had already run.
  const past = useMemo(
    () => valid.filter((e) => isPast(e)).sort((a, b) => b.start.getTime() - a.start.getTime()).slice(0, 8),
    [valid], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nextUp = upcoming[0] ?? null;

  const eventPropGetter = useCallback(
    (event: ScheduleEvent) => {
      // Finished sessions stay visible but muted, so "what's left" reads at a
      // glance without hiding history.
      const end = event.end && event.end > event.start ? event.end : event.start;
      const done = end < new Date();
      return {
        style: {
          backgroundColor: TYPE_STYLES[event.type]?.solid || "#64748b",
          border: "none",
          color: "#fff",
          borderRadius: 8,
          fontSize: 11.5,
          padding: "2px 7px",
          boxShadow: "0 1px 2px rgba(15,23,42,0.16)",
          opacity: done ? 0.55 : 1,
        },
      };
    },
    [],
  );

  // Sessions inside the currently-viewed scope — shown in the toolbar for
  // day/week so a teacher who drilled into a busy day can see the list is
  // complete (month cells can only render a couple before "+N more").
  const scopeCount = useMemo(() => {
    if (view === "day") return valid.filter((e) => sameDay(e.start, date)).length;
    if (view === "week") {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return valid.filter((e) => e.start >= weekStart && e.start < weekEnd).length;
    }
    return 0;
  }, [valid, date, view]);

  const calendarComponents = useMemo(
    () => ({
      event: EventChip as never,
      toolbar: ((props: Record<string, unknown>) => (
        <Toolbar {...(props as unknown as Parameters<typeof Toolbar>[0])} scopeCount={scopeCount} />
      )) as never,
    }),
    [scopeCount],
  );

  return (
    <div className="teacher-cal">
      {/* Summary tiles */}
      <div className="flex items-stretch gap-2.5 mb-5 flex-wrap">
        <StatTile
          icon={TYPE_STYLES.class.icon}
          value={counts.class}
          label={`Class${counts.class === 1 ? "" : "es"}`}
          tint={TYPE_STYLES.class.tint}
          text={TYPE_STYLES.class.text}
          ring={TYPE_STYLES.class.ring}
        />
        <StatTile
          icon={TYPE_STYLES.demo.icon}
          value={counts.demo}
          label={`Demo${counts.demo === 1 ? "" : "s"}`}
          tint={TYPE_STYLES.demo.tint}
          text={TYPE_STYLES.demo.text}
          ring={TYPE_STYLES.demo.ring}
        />
        <StatTile
          icon={CalendarDays}
          value={monthCount}
          label={`in ${format(date, "MMM yyyy")}`}
          tint="bg-muted/60 dark:bg-white/5"
          text="text-foreground"
          ring="ring-border"
        />
        {loading && (
          <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground px-2 self-center">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Loading…
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div
          style={{ height: "68vh" }}
          className="bg-card rounded-2xl border border-border p-4 shadow-sm"
        >
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
            // A day with many sessions can't fit in a month cell. Clicking the
            // "+N more" count (or the date number) opens that date's Day view,
            // which lists every session with no cap — rbc's default popup has
            // no max-height and runs off-screen once there are more than a few.
            onShowMore={(_evts, showMoreDate) => {
              setDate(showMoreDate);
              setView("day");
            }}
            onDrillDown={(drillDate) => {
              setDate(drillDate);
              setView("day");
            }}
            onSelectEvent={(e) => setSelected(e as ScheduleEvent)}
            eventPropGetter={eventPropGetter}
            components={calendarComponents}
            style={{ height: "100%" }}
          />
        </div>

        {/* Sessions rail — Upcoming / Completed. Finished sessions used to be
            filtered out entirely, leaving no way to review what already ran. */}
        <aside className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
              <Clock className="w-4 h-4" />
            </span>
            <h3 className="text-[14px] font-bold m-0">Sessions</h3>
          </div>

          <div className="inline-flex w-full items-center gap-0.5 p-1 rounded-xl bg-muted/70 dark:bg-white/5 mb-3">
            {([
              { key: "upcoming" as const, label: "Upcoming", n: upcoming.length },
              { key: "past" as const, label: "Completed", n: past.length },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setRailTab(t.key)}
                aria-pressed={railTab === t.key}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12.5px] font-semibold rounded-lg transition-colors ${
                  railTab === t.key
                    ? "bg-white dark:bg-white/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span className="tabular-nums opacity-70">{t.n}</span>
              </button>
            ))}
          </div>

          {railTab === "upcoming" ? (
            <>
              {/* Next-up highlight so the most relevant session is unmissable. */}
              {nextUp && (
                <button
                  type="button"
                  onClick={() => setSelected(nextUp)}
                  className="w-full text-left mb-3 rounded-xl p-3 bg-gradient-to-br from-primary/10 to-primary/[0.03] border border-primary/20 hover:border-primary/40 transition-colors"
                >
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-primary">
                    Next up
                  </span>
                  <div className="text-[13.5px] font-bold truncate mt-1">{nextUp.title}</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    {relativeDay(nextUp.start)} · {format(nextUp.start, "h:mm a")}
                  </div>
                </button>
              )}

              {upcoming.length === 0 ? (
                <div className="text-center py-6">
                  <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-[13px] text-muted-foreground m-0">Nothing scheduled ahead yet.</p>
                </div>
              ) : (
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {upcoming.slice(nextUp ? 1 : 0).map((e) => (
                    <li key={e.id}><SessionRow event={e} onOpen={setSelected} /></li>
                  ))}
                </ul>
              )}
            </>
          ) : past.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-[13px] text-muted-foreground m-0">No completed sessions yet.</p>
            </div>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {past.map((e) => (
                <li key={e.id}><SessionRow event={e} onOpen={setSelected} done /></li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Event details */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${TYPE_STYLES[selected.type].label} details`}
        >
          <div
            className="bg-card text-card-foreground rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Type-coloured header band */}
            <div className="px-5 py-4" style={{ background: TYPE_STYLES[selected.type].solid }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/90">
                    {(() => {
                      const Icon = TYPE_STYLES[selected.type].icon;
                      return <Icon className="w-3.5 h-3.5" />;
                    })()}
                    {TYPE_STYLES[selected.type].label}
                    {/* State badge so a finished session isn't mistaken for one
                        that's still to come. */}
                    {isPast(selected) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Completed
                      </span>
                    ) : selected.start <= now ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" /> Live now
                      </span>
                    ) : null}
                  </span>
                  <h3 className="text-[19px] font-bold text-white mt-1 mb-0 leading-snug break-words">
                    {selected.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <CalendarClock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="text-[13.5px]">
                  <div className="font-semibold">{format(selected.start, "EEEE, dd MMMM yyyy")}</div>
                  <div className="text-muted-foreground">
                    {format(selected.start, "h:mm a")}
                    {selected.end && ` – ${format(selected.end, "h:mm a")}`}
                    {(() => {
                      const d = durationLabel(selected.start, selected.end);
                      return d ? ` · ${d}` : "";
                    })()}
                  </div>
                </div>
              </div>

              {selected.courseTitle && (
                <div className="flex items-start gap-2.5">
                  <GraduationCap className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="text-[13.5px]">
                    <span className="text-muted-foreground">Course · </span>
                    <span className="font-medium">{selected.courseTitle}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {selected.meetingLink && isPast(selected) ? (
                  // A finished session's link is dead — don't offer "Join".
                  <span className="text-[12.5px] text-muted-foreground flex-1">
                    This session has ended.{" "}
                    <a
                      className="font-semibold text-primary underline underline-offset-2"
                      href={selected.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Meeting link
                    </a>
                  </span>
                ) : selected.meetingLink ? (
                  <a
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-hero text-white text-[13px] font-semibold px-4 py-2.5 flex-1 hover:opacity-90 transition-opacity"
                    href={selected.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Video className="w-4 h-4" /> Join session
                  </a>
                ) : (
                  <span className="text-[12.5px] text-muted-foreground flex-1">
                    No meeting link for this session.
                  </span>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="text-[13px] font-semibold px-4 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
