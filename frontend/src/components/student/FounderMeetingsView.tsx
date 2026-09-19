import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock, Clock, Video, ArrowRight, Sparkles, Users,
  CheckCircle2, Radio, History, Ticket,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  getMyFounderMeetings, registerForFounderMeeting,
  type FounderMeeting,
} from "@/api/founderMeetingApi";
import { posterFor } from "@/lib/founderMeetingDefaults";
import { useAuth } from "@/hooks/useAuth";

const IST = "Asia/Kolkata";

const fmtParts = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: IST }),
    short: d.toLocaleString("en-IN", { day: "numeric", month: "short", timeZone: IST }),
    time: d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST }),
  };
};

/** Small coloured pill describing a meeting's current state. */
const StatePill = ({ state }: { state: FounderMeeting["state"] }) => {
  if (state === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-500">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        LIVE NOW
      </span>
    );
  }
  if (state === "past") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Ended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Upcoming
    </span>
  );
};

/** The featured card: the student's next live/upcoming registered meeting. */
const NextMeetingHero = ({ m }: { m: FounderMeeting }) => {
  const when = fmtParts(m.scheduled_at);
  const poster = posterFor(m);
  const isLive = m.state === "live";
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/5">
      <div className="grid lg:grid-cols-[1.1fr_1fr]">
        {/* Poster */}
        <div className="relative min-h-[220px] bg-muted">
          {poster && (
            <img
              src={poster}
              alt={m.title}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span className="absolute left-5 top-5">
            <StatePill state={m.state} />
          </span>
        </div>
        {/* Details */}
        <div className="relative flex flex-col justify-center gap-6 border-t border-border/60 bg-gradient-to-br from-primary/[0.05] via-transparent to-transparent p-7 lg:border-l lg:border-t-0 lg:p-10">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {isLive ? "Happening now" : "Your next session"}
            </p>
            <h3 className="mt-2 text-2xl font-bold leading-tight">{m.title}</h3>
            {m.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>
            )}
          </div>

          <dl className="space-y-3.5">
            {when && (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarClock className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date &amp; time</dt>
                  <dd className="mt-0.5 font-semibold leading-snug">
                    {when.date}
                    <span className="mt-0.5 block font-normal text-muted-foreground">{when.time} IST</span>
                  </dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Clock className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration</dt>
                <dd className="mt-0.5 font-semibold">{m.duration_mins} minutes</dd>
              </div>
            </div>
          </dl>

          {m.meeting_link ? (
            <div className="space-y-2.5">
              <a
                href={m.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-hero px-8 py-3.5 text-base font-bold text-white shadow-md shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
              >
                <Video className="h-5 w-5" aria-hidden="true" />
                {isLive ? "Join the meeting now" : "Join the meeting"}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </a>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                You&apos;re registered — this link was also emailed to you.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              You&apos;re registered — the joining link will be emailed to you.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/** Compact card used in the registered / upcoming grids. */
const MeetingCard = ({
  m, registered, onRegister, busy,
}: {
  m: FounderMeeting;
  registered: boolean;
  onRegister?: (m: FounderMeeting) => void;
  busy?: boolean;
}) => {
  const when = fmtParts(m.scheduled_at);
  const poster = posterFor(m);
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/9] bg-muted">
        {poster && (
          <img
            src={poster}
            alt={m.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <span className="absolute left-3 top-3">
          <StatePill state={m.state} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h4 className="line-clamp-2 font-bold leading-snug">{m.title}</h4>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          {when && (
            <p className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {when.short} · {when.time}
            </p>
          )}
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {m.duration_mins} min · Online
          </p>
        </div>

        <div className="mt-auto pt-1">
          {registered ? (
            m.meeting_link ? (
              <a
                href={m.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-hero px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:brightness-105"
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                {m.state === "live" ? "Join now" : "Join meeting"}
              </a>
            ) : (
              <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Registered
              </span>
            )
          ) : m.can_register ? (
            <button
              type="button"
              onClick={() => onRegister?.(m)}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-hero px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:brightness-105 disabled:opacity-60"
            >
              {busy ? "Registering…" : "Register"}
              {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          ) : (
            <span className="block rounded-lg border border-border px-4 py-2.5 text-center text-sm text-muted-foreground">
              Registration closed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({
  icon: Icon, title, count, sub,
}: {
  icon: typeof CalendarClock; title: string; count?: number; sub?: string;
}) => (
  <div className="mb-5 flex items-center gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold leading-tight m-0">
        {title}
        {typeof count === "number" && count > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">{count}</span>
        )}
      </h2>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground m-0">{sub}</p>}
    </div>
  </div>
);

const EmptyState = ({ title, text }: { title: string; text: string }) => (
  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 py-12 text-center">
    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Ticket className="h-6 w-6" aria-hidden="true" />
    </span>
    <p className="text-base font-semibold m-0">{title}</p>
    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground m-0">{text}</p>
  </div>
);

const CardSkeleton = () => (
  <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
    <div className="aspect-[16/9] animate-pulse bg-muted" />
    <div className="space-y-3 p-5">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-9 w-full animate-pulse rounded bg-muted" />
    </div>
  </div>
);

/**
 * "Founder Meetings" tab for the student dashboard.
 *
 * Shows the meetings the student registered for (the soonest live/upcoming one
 * promoted to a hero) and the upcoming meetings they can still join, with
 * one-click registration that reuses the student's account name/email.
 */
const FounderMeetingsView = () => {
  const { user } = useAuth();
  const [registered, setRegistered] = useState<FounderMeeting[]>([]);
  const [upcoming, setUpcoming] = useState<FounderMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState<number | null>(null);

  const load = async () => {
    try {
      const data = await getMyFounderMeetings();
      setRegistered(data.registered);
      setUpcoming(data.upcoming);
    } catch {
      // A dashboard tab must not hard-fail: fall back to empty state.
      setRegistered([]);
      setUpcoming([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // The soonest live/upcoming registered meeting becomes the hero; the rest go
  // to the grid below it (past ones always in the grid).
  const heroMeeting = useMemo(
    () => registered.find((m) => m.state === "live" || m.state === "upcoming") ?? null,
    [registered],
  );
  const restRegistered = useMemo(
    () => registered.filter((m) => m !== heroMeeting),
    [registered, heroMeeting],
  );

  const register = async (m: FounderMeeting) => {
    const name = (user?.name || "").trim();
    const email = (user?.email || "").trim();
    if (!name || !email) {
      toast.error("Add your name to your profile before registering.");
      return;
    }
    setRegisteringId(m.id);
    try {
      const res = await registerForFounderMeeting(m.id, { name, email });
      toast.success(res?.success || "You're registered.");
      await load();
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const serverMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      // A 401, or the "name" rejection that only fires when the request was
      // treated as anonymous, both mean the session token has expired — the
      // server no longer recognises this student. Say so plainly instead of
      // surfacing a confusing validation message.
      if (status === 401 || /name/i.test(serverMsg || "")) {
        toast.error("Your session has expired. Please log in again to register.");
      } else {
        toast.error(serverMsg || "Could not register. Please try again.");
      }
    } finally {
      setRegisteringId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-56 animate-pulse rounded-3xl bg-muted" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const nothingAtAll = registered.length === 0 && upcoming.length === 0;

  return (
    <div className="space-y-10">
      {/* Page intro */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Founder Meetings</h1>
        <p className="mt-1.5 text-muted-foreground">
          Live sessions with the founder — your registrations and what&apos;s coming up.
        </p>
      </div>

      {nothingAtAll ? (
        <EmptyState
          title="No founder meetings yet"
          text="When a session is scheduled it will appear here, ready for you to register."
        />
      ) : (
        <>
          {/* Hero: next registered meeting */}
          {heroMeeting && <NextMeetingHero m={heroMeeting} />}

          {/* Registered meetings */}
          {(restRegistered.length > 0 || (registered.length > 0 && !heroMeeting)) && (
            <section>
              <SectionHeader
                icon={CheckCircle2}
                title="Your registered meetings"
                count={registered.length}
                sub="Sessions you've signed up for."
              />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(heroMeeting ? restRegistered : registered).map((m) => (
                  <MeetingCard key={m.id} m={m} registered />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming meetings the student can still join */}
          <section>
            <SectionHeader
              icon={Radio}
              title="Upcoming meetings"
              count={upcoming.length}
              sub="Open sessions you can register for."
            />
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing open right now"
                text="You're registered for everything that's scheduled. Check back for new sessions."
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((m) => (
                  <MeetingCard
                    key={m.id}
                    m={m}
                    registered={false}
                    onRegister={register}
                    busy={registeringId === m.id}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default FounderMeetingsView;
