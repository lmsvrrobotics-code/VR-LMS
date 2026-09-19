import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Video, ArrowRight, Flame, Users, Check, Clock, Globe, ShieldCheck, MailCheck, LayoutDashboard } from "lucide-react";
import { posterFor, isLowOnSeats } from "@/lib/founderMeetingDefaults";
import { validateEmail, validateName, validatePhone } from "@/lib/fieldValidation";
import { apiErrorMessage } from "@/lib/apiErrorMessage";
import { useAuth } from "@/hooks/useAuth";

/**
 * "Weekly Meeting with Founder" — the public home-page section, rendered
 * directly under the hero.
 *
 * Content is entirely admin-driven: whatever the admin marks as FEATURED in
 * Admin → Founder Meetings appears here. When nothing is featured the API
 * returns { meeting: null } and this renders nothing at all, so the home page
 * closes up rather than showing an empty shell.
 *
 * Layout is two columns on desktop — poster on one side, details on the other
 * — which is what the promo flyer is designed for.
 */

const BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";



type FounderMeeting = {
  id: number;
  title: string;
  description: string;
  scheduled_at: string | null;
  duration_mins: number;
  video_url: string | null;
  poster_url: string | null;
  /** Computed SERVER-side, so every visitor agrees regardless of device clock. */
  state: "unscheduled" | "upcoming" | "live" | "past";
  /** False once the meeting is past, the admin closed it, or seats ran out. */
  can_register: boolean;
  capacity: number | null;
  seats_left: number | null;
  registered_count: number;
};

const IST = "Asia/Kolkata";

const fmtWhen = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST,
  });
};

/**
 * Split the schedule into a human date and a human time so the details rail can
 * present them as two distinct, scannable rows rather than one dense string.
 * Same IST basis as fmtWhen, so a visitor never sees two different clocks.
 */
const fmtDateParts = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleString("en-IN", {
    weekday: "long", day: "numeric", month: "long", timeZone: IST,
  });
  const time = d.toLocaleString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST,
  });
  return { date, time };
};



/**
 * Modal shell around the registration form.
 *
 * Follows the site's existing BookDemoModal convention (fixed overlay,
 * click-outside to close) and adds the two behaviours a dialog needs to not
 * trap people: Escape closes it, and the page behind does not scroll while it
 * is open.
 */
const RegistrationModal = ({
  meeting, joinLink, onDone, onClose,
}: {
  meeting: FounderMeeting;
  joinLink: string | null;
  onDone: (link: string | null) => void;
  onClose: () => void;
}) => {
  // Once registration succeeds the header and the scarcity line are no longer
  // true framing — that last seat is now theirs — so the panel hands the whole
  // surface to the confirmation.
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Stop the page behind scrolling under the overlay on touch devices.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="founder-register-heading"
    >
      {/* stopPropagation so a click inside the panel does not close it. */}
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-4 ${registered ? "mb-0" : "mb-6"}`}>
          <div className={registered ? "sr-only" : undefined}>
            <h3 id="founder-register-heading" className="text-xl font-bold">
              Register
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{meeting.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Same rule as the card: seat numbers appear only when running low,
            so the two never disagree about how urgent this is. Hidden after
            registering — "only 1 seat left" reads as a warning when that seat
            is the one they just took. */}
        {!registered && isLowOnSeats(meeting.seats_left, meeting.capacity) && (
          <p className="mb-5 flex items-center gap-2 border-b border-border/60 pb-4 text-sm font-semibold text-amber-600 dark:text-amber-500">
            <Flame className="h-4 w-4 shrink-0" aria-hidden="true" />
            Only {meeting.seats_left} {meeting.seats_left === 1 ? "seat" : "seats"} left
          </p>
        )}

        <RegistrationForm
          meeting={meeting}
          onRegistered={() => setRegistered(true)}
          onDone={onDone}
          joinLink={joinLink}
          onClose={onClose}
        />
      </div>
    </div>
  );
};

/**
 * Registration form for a founder meeting.
 *
 * The join link is not on the page — it comes back in this response, which is
 * the point of registering: the admin learns who is attending, and the meeting
 * is not open to anyone who reads the page source.
 */
const RegistrationForm = ({
  meeting, onDone, onRegistered, joinLink, onClose,
}: {
  meeting: FounderMeeting;
  onDone: (link: string | null) => void;
  onRegistered: () => void;
  joinLink: string | null;
  onClose: () => void;
}) => {
  const meetingId = meeting.id;
  const navigate = useNavigate();
  // Only logged-in students have a dashboard to route to; an anonymous
  // registrant should not be sent to a login wall after succeeding.
  const { user } = useAuth();
  const isStudent = !!user && (user.role === "student" || user.role === null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    // Validated client-side first so a typo is caught before a round trip;
    // the server applies the same rules regardless.
    const nameErr = validateName(name);
    if (nameErr) return setErr(nameErr);
    const emailErr = validateEmail(email);
    if (emailErr) return setErr(emailErr);
    const phoneErr = validatePhone(phone, { required: false });
    if (phoneErr) return setErr(phoneErr);

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/public/founder-meeting/${meetingId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Could not complete your registration. Please try again.");
        return;
      }
      setDone(data?.success || "You are registered.");
      onRegistered();
      onDone(data?.meeting_link ?? null);
    } catch (e2) {
      setErr(apiErrorMessage(e2, "Could not reach the server. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const confirmedWhen = fmtWhen(meeting.scheduled_at);
    return (
      /* Centred confirmation rather than a green alert box: this is the end of
         a flow, not a notice inside a form. The tick leads, the booked details
         are restated so the person can verify what they got, and the join link
         is the one obvious next action. */
      <div className="py-2 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <Check className="h-7 w-7" strokeWidth={3} aria-hidden="true" />
        </span>

        <h4 className="text-lg font-bold">{"You're registered"}</h4>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {done}
        </p>

        {/* What they actually booked — a receipt, so nobody has to trust that
            the right thing was saved. */}
        {confirmedWhen && (
          <div className="mx-auto mt-5 max-w-sm rounded-lg border border-border/60 bg-muted/40 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your session
            </p>
            <p className="mt-1 font-semibold">{meeting.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {confirmedWhen} · {meeting.duration_mins} min
            </p>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {joinLink ? (
            <>
              <a
                href={joinLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-hero px-8 py-3.5 font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-105 hover:shadow-lg"
              >
                Join the meeting
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <p className="text-xs text-muted-foreground">
                {"Save this link — we've also sent it to your email."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {"We'll email you the joining details before the session."}
            </p>
          )}

          {/* Logged-in students get a direct route into their Founder Meetings
              tab, where this registration now lives alongside the join link. */}
          {isStudent && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/student/dashboard", { state: { tab: "Founder Meetings" } });
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-8 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              View in My Dashboard
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-border px-8 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
          placeholder="Your name"
          value={name}
          onChange={(e) => { setName(e.target.value); if (err) setErr(null); }}
          required
        />
        <input
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (err) setErr(null); }}
          required
        />
      </div>
      <input
        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
        type="tel"
        inputMode="numeric"
        placeholder="Mobile number (optional)"
        value={phone}
        onChange={(e) => { setPhone(e.target.value); if (err) setErr(null); }}
      />
      <textarea
        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
        rows={2}
        placeholder="Anything you'd like to ask the founder? (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-hero px-8 py-3.5 font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-105 hover:shadow-lg disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Complete Registration"}
        {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>
    </form>
  );
};

const FounderMeetingSection = () => {
  const [meeting, setMeeting] = useState<FounderMeeting | null>(null);
  // Held here rather than in the form so the link survives the form unmounting
  // into its confirmation state.
  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    // Deliberately a bare fetch with NO Authorization header and no
    // credentials: this section is public and must render identically for a
    // signed-out visitor. Sending cookies would also make the response vary by
    // session for no reason.
    fetch(`${BASE}/api/public/founder-meeting`)
      .then((r) => (r.ok ? r.json() : { meeting: null }))
      .then((d) => { if (alive) setMeeting(d?.meeting ?? null); })
      .catch((e) => {
        // A marketing section must never break the home page, so it stays
        // hidden on failure — but log it, because a silent catch here is
        // indistinguishable from "no meeting is featured" and hid a real
        // outage for as long as nobody checked the network tab.
        console.warn("[founder-meeting] could not load:", e);
        if (alive) setMeeting(null);
      });
    return () => { alive = false; };
  }, []);

  if (!meeting) return null;

  const when = fmtWhen(meeting.scheduled_at);
  const dateParts = fmtDateParts(meeting.scheduled_at);
  const isLive = meeting.state === "live";
  const isPast = meeting.state === "past";
  // The admin's poster, else the default flyer — null only when a video is
  // present with no poster, in which case the video fills the media slot.
  const poster = posterFor(meeting);
  // Promote availability to a badge only when scarcity is real: a capped
  // session with 10% or fewer seats left, and not already sold out.
  const lowOnSeats = meeting.can_register && isLowOnSeats(meeting.seats_left, meeting.capacity);
  // Sold out only when a cap was actually set and every seat is gone. An
  // uncapped session has seats_left === null and can never be "full".
  const isSoldOut = !isPast && meeting.capacity != null && meeting.seats_left === 0;

  return (
    <section
      className="section-padding relative overflow-hidden bg-background"
      aria-labelledby="founder-meeting-heading"
    >
      {/* Soft ambient brand glow so the section has depth behind the card
          instead of a flat wall. Decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[420px] w-[820px] max-w-[95vw] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />
      <div className="container-ngo relative z-10">
        {/* Section header in the page's established pattern: small primary
            eyebrow, a heading with one gradient accent, supporting line. The
            eyebrow is fixed UI chrome; every word below it is admin data. */}
        <div className="text-center space-y-3 mb-12">
          <p className="text-primary font-semibold">
            {isPast ? "Previous Session" : "Live Session"}
          </p>
          <h2
            id="founder-meeting-heading"
            className="text-3xl md:text-4xl font-bold"
          >
            {meeting.title}
          </h2>
          {meeting.description && (
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {meeting.description}
            </p>
          )}
        </div>

        <div className="card-ngo-static relative overflow-hidden rounded-3xl border border-border/60 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/5">
          {/* Almost-full badge, pinned to the card's top-right. z-10 keeps it
              above the poster; it is announced politely rather than
              interrupting whatever a screen-reader user is already reading. */}
          {lowOnSeats && (
            <div
              className="seat-badge absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-white shadow-lg"
              role="status"
              aria-live="polite"
            >
              <Flame className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-sm font-bold">
                Only {meeting.seats_left} {meeting.seats_left === 1 ? "seat" : "seats"} left
              </span>
            </div>
          )}

          {/* Sold out takes the same corner slot — the two are mutually
              exclusive, so the card never carries both. No pulse here: the
              glow says "act now", which is the wrong message once there is
              nothing left to act on. */}
          {isSoldOut && (
            <div
              className="absolute right-4 top-4 z-10 rounded-full bg-foreground/85 px-4 py-2 text-sm font-bold tracking-wide text-background shadow-lg backdrop-blur"
              role="status"
            >
              SOLD OUT
            </div>
          )}

          <div className="grid lg:grid-cols-2">
            {/* Media — the admin's poster, else their uploaded video. */}
            <div className="relative bg-muted">
              {poster ? (
                <img
                  src={poster}
                  alt={meeting.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  // If the default flyer has not been added to /public yet,
                  // hide the element rather than show a broken-image icon.
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="aspect-video w-full">
                  <iframe
                    title={meeting.title}
                    src={meeting.video_url as string}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {isLive && (
                <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white shadow-lg">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  LIVE NOW
                </span>
              )}
            </div>

            {/* Details rail — a considered registration panel rather than a
                near-empty column. A faint tinted ground and a left brand edge
                separate it from the vibrant poster; the info rows carry every
                real field the API returns (nothing is invented), and the CTA
                sits in its own anchored block with trust microcopy so the
                right side reads as deliberate, not as leftover whitespace. */}
            <div className="relative flex flex-col justify-center gap-7 border-t border-border/60 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent p-8 lg:border-l lg:border-t-0 lg:p-12">
              {/* Eyebrow: reads as a titled panel, not a stray field. */}
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
                  {isPast ? "Session details" : "Reserve your spot"}
                </p>
                <div className="mt-3 h-px w-12 bg-gradient-hero" aria-hidden="true" />
              </div>

              {/* Info list — aligned icon rows. Each appears only when its
                  field is present, so a minimally-configured meeting still
                  looks intentional. */}
              <dl className="space-y-5">
                {dateParts && (
                  <div className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarClock className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Date &amp; time
                      </dt>
                      <dd className="mt-0.5 font-semibold leading-snug">
                        {dateParts.date}
                        <span className="mt-0.5 block font-normal text-muted-foreground">
                          {dateParts.time} IST
                        </span>
                      </dd>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Duration
                    </dt>
                    <dd className="mt-0.5 font-semibold">{meeting.duration_mins} minutes</dd>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Globe className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Format
                    </dt>
                    <dd className="mt-0.5 font-semibold">Online · Live with the founder</dd>
                  </div>
                </div>

                {/* Seats: only when a real cap exists. Frames availability as
                    reference info here; the amber badge handles urgency. */}
                {meeting.capacity != null && meeting.seats_left != null && (
                  <div className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Availability
                      </dt>
                      <dd className="mt-0.5 font-semibold">
                        {meeting.seats_left > 0
                          ? <>{meeting.seats_left} of {meeting.capacity} seats left</>
                          : <>All {meeting.capacity} seats taken</>}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              <div className="border-t border-border/60 pt-6">
                {meeting.can_register ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setFormOpen(true)}
                      className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-hero px-8 py-4 text-base font-bold text-white shadow-md shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
                    >
                      Register Now
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                    </button>
                    {/* Trust microcopy — two guarantees that are literally true
                        of this flow (instant confirmation, emailed link), so
                        the promise is honest, not marketing filler. */}
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        Instant confirmation
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MailCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        Joining link sent to your email
                      </span>
                    </div>
                  </div>
                ) : isSoldOut ? (
                  /* Sold out is the state worth designing for: it is the only
                     one that reflects DEMAND rather than a closed door, so it
                     gets the emphasis a "SOLD OUT" stamp carries — and it
                     tells the visitor what to do next instead of dead-ending. */
                  <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-5 dark:bg-amber-500/10">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                        <Users className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="font-bold tracking-wide text-amber-900 dark:text-amber-300">
                          FULLY BOOKED
                        </p>
                        <p className="text-sm text-amber-800/80 dark:text-amber-400/80">
                          All {meeting.capacity} seats have been taken.
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 border-t border-amber-500/20 pt-3 text-sm text-amber-800/80 dark:text-amber-400/80">
                      Check back for the next session.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isPast
                      ? "This session has finished."
                      : "Registration is closed for this session."}
                  </p>
                )}

                {/* Only a separate link when a poster occupies the media slot;
                    otherwise the video IS the media slot and is already shown. */}
                {meeting.video_url && poster && (
                  <a
                    href={meeting.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    <Video className="h-4 w-4" aria-hidden="true" /> Watch the recording
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {formOpen && (
        <RegistrationModal
          meeting={meeting}
          joinLink={joinLink}
          onDone={setJoinLink}
          onClose={() => setFormOpen(false)}
        />
      )}
    </section>
  );
};

export default FounderMeetingSection;
