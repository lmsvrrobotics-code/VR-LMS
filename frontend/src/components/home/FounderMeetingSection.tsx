import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Video, ArrowRight, Flame, Users, Check, Clock, Globe, LayoutDashboard } from "lucide-react";
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
          ) : null}

          {/* Route to the Founder Meetings tab, where this registration now
              lives alongside its joining link.

              Shown to EVERYONE, not only a logged-in student. The previous
              `isStudent` gate meant an anonymous registrant — the common case
              on a public marketing page — finished the flow with nothing to do
              but close the dialog, so the one place their booking exists was
              never offered to them. A guest lands on the dashboard route and is
              asked to sign in, which is the correct next step rather than a
              dead end.

              When the session has no join link yet this is the PRIMARY action,
              so it takes the brand-gradient treatment; alongside a join link it
              steps back to a quieter outline. */}
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/student/dashboard", { state: { tab: "Founder Meetings" } });
            }}
            className={
              joinLink
                ? "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-8 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                : "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-hero px-8 py-3.5 font-semibold text-white shadow-sm transition-all duration-300 hover:brightness-105 hover:shadow-lg"
            }
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            {isStudent ? "View in My Dashboard" : "View my meetings"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>

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
  // Used by the past/closed card's "Explore our courses" button. Declared here
  // because RegistrationForm's own `navigate` is scoped to that component and
  // is NOT visible in this one.
  const navigate = useNavigate();
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
  // Show the seat counter for ANY capped session, including a finished one.
  //
  // It was originally gated on `can_register`, which the server sets false once
  // a session is past — so the corner sat empty on exactly the meeting being
  // looked at. The details rail reports "30 of 30 seats left" regardless, so
  // hiding the corner chip only made the two disagree.
  //
  // An UNCAPPED session still shows nothing: capacity === null means there is
  // genuinely no number to report, and "unlimited seats" would be noise.
  const showSeatCount =
    meeting.capacity != null &&
    meeting.seats_left != null &&
    meeting.seats_left > 0;

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
      {/* A second, cooler glow low and to the side. Two offset washes read as
          depth; one centred circle reads as a flat vignette. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-0 -z-0 h-[360px] w-[520px] rounded-full bg-primary/[0.07] blur-[120px]"
      />
      <div className="container-ngo relative z-10">
        {/* Section header. The eyebrow is a proper pill rather than a loose
            line of text — it gives the block a confident entry point and, when
            the session is LIVE, carries a pulsing dot that earns attention
            honestly instead of shouting. Everything below it is admin data. */}
        <div className="text-center mb-12">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold ${
              isLive
                ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                : "border-primary/25 bg-primary/10 text-primary"
            }`}
          >
            {isLive ? (
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            ) : (
              <Video className="h-4 w-4" aria-hidden="true" />
            )}
            {isLive ? "Live right now" : isPast ? "Previous Session" : "Live Session"}
          </span>

          {/* The title is the single biggest thing on the section — this is
              the moment that has to land. The gradient is the brand's own
              `text-gradient`, already used by the hero. */}
          <h2
            id="founder-meeting-heading"
            className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl lg:text-6xl"
          >
            <span className="text-gradient">{meeting.title}</span>
          </h2>

          {meeting.description && (
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {meeting.description}
            </p>
          )}

          <div className="mx-auto mt-7 h-1 w-24 rounded-full bg-gradient-hero" aria-hidden="true" />
        </div>

        {/* Animated gradient edge. `.glow-border` is a 1px-padded wrapper whose
            ::before is a conic sheet that SPINS (see index.css) — the brand
            orange running through amber, cyan and indigo, so the card is
            outlined in moving light rather than a flat grey hairline.

            The rotation is a transform on a child, not an animated gradient:
            animating a conic-gradient needs `@property`, which Safari only
            supports from 16.4 and which silently fails to interpolate
            elsewhere. A transform works in every browser and stays on the
            compositor. It stops under prefers-reduced-motion, keeping the
            colour but dropping the motion. */}
        {/* `.glow-border-wrap` hosts the outer bloom. It has to be a SEPARATE
            element: .glow-border clips its own children to the card radius, so
            a glow drawn inside would be sliced off at the edge instead of
            spilling onto the page. */}
        <div className="glow-border-wrap rounded-[30px]">
        <div className="glow-border rounded-[30px] p-[5px] shadow-[0_40px_90px_-45px_rgba(255,106,0,0.45)]">
        <div className="glow-border__inner card-ngo-static relative overflow-hidden rounded-[25px] bg-card">
          {/* ---- Seat counter, pinned to the card's top-right ----------
              Always present while a capped session is open, not only once it
              is nearly full: a visitor arriving at "30 of 30" should still see
              that seats are limited and being tracked — that is what makes the
              count feel live rather than like a warning that appears out of
              nowhere.

              It is TIERED, so the styling carries the meaning:
                plenty  → calm glass chip, no animation
                low     → amber, pulsing (genuine scarcity, earns the emphasis)
                sold out→ solid slate, no pulse ("act now" is the wrong message
                          once there is nothing left to act on)

              z-20 keeps it above the poster and its backdrop. Announced
              politely so it never interrupts a screen-reader user mid-sentence. */}
          {isSoldOut ? (
            <div
              className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2 text-sm font-bold tracking-wide text-background shadow-xl backdrop-blur"
              role="status"
            >
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              SOLD OUT
            </div>
          ) : showSeatCount ? (
            <div
              className={`absolute right-4 top-4 z-20 flex items-center gap-2.5 rounded-full px-4 py-2 shadow-xl backdrop-blur-md ${
                isPast
                  ? "bg-background/70 text-muted-foreground ring-1 ring-border/60"
                  : lowOnSeats
                    ? "seat-badge bg-amber-500/95 text-white ring-1 ring-white/30"
                    : "bg-background/80 text-foreground ring-1 ring-border/70"
              }`}
              role="status"
              aria-live="polite"
            >
              {isPast ? (
                /* Finished: a neutral glyph. A live dot or a flame here would
                   imply the seats are still there to be taken. */
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : lowOnSeats ? (
                <Flame className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                /* A small live dot: quietly signals "this number is current"
                   without the urgency of a flame. */
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
              <span className="text-sm font-bold leading-none">
                {isPast ? (
                  <>
                    {meeting.capacity}
                    <span className="font-medium opacity-70"> seats</span>
                  </>
                ) : lowOnSeats ? (
                  <>Only {meeting.seats_left} {meeting.seats_left === 1 ? "seat" : "seats"} left</>
                ) : (
                  <>
                    {meeting.seats_left}
                    <span className="font-medium opacity-70"> / {meeting.capacity} seats left</span>
                  </>
                )}
              </span>
            </div>
          ) : null}

          <div className="grid lg:grid-cols-2">
            {/* Media — the admin's poster, else their uploaded video.
                The poster is stored WHOLE at 1600x900 (contain-fit, see
                FounderMeetingService.storeUpload), so it is shown whole here:
                `aspect-video` holds the box at the artwork's own 16:9 and
                object-contain guarantees nothing is ever sliced off, even if an
                admin uploads an off-ratio flyer.

                The column centres its image rather than stretching it. The
                details rail beside it is naturally taller, and an earlier
                version let the <img> fill that height with object-cover — which
                cropped the left and right edges and cut the academy logo and
                the "Register now" button out of the flyer. The subtle tinted
                ground behind the image absorbs the leftover height so the
                column reads as a deliberate frame instead of dead space. */}
            <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#1b1d2b] via-[#232637] to-[#15161f] p-4 sm:p-6 lg:p-10">
              {/* ---- Decorative backdrop ----------------------------------
                  The poster is 16:9 inside a taller column, so there is real
                  estate around it either way. Rather than leave that as flat
                  dead space, it becomes a deep "studio" ground the flyer is
                  presented against — the artwork reads as lit and deliberate
                  instead of pasted onto a blank panel.

                  Everything here is aria-hidden and pointer-events-none: it is
                  pure atmosphere and must never intercept a click or reach a
                  screen reader. The animations reuse the page's existing
                  orb-drift / glow-pulse / ring-spin helpers, which already have
                  prefers-reduced-motion guards in index.css, so this adds no
                  new motion a user cannot turn off. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                {/* Blueprint grid — a faint engineering lattice that suits a
                    robotics academy without competing with the flyer. */}
                <div
                  className="absolute inset-0 opacity-[0.18]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.09) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                  }}
                />
                {/* Brand orbs, drifting slowly at different depths. */}
                <div className="animate-orb-drift absolute -left-16 -top-16 h-64 w-64 rounded-full bg-primary/25 blur-[70px]" />
                <div className="animate-glow-pulse absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-primary/20 blur-[80px]" />
                {/* A slow concentric ring, echoing the robotics/orbit motif. */}
                <div className="animate-ring-spin absolute -right-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full border border-dashed border-white/[0.07]" />
                <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.05]" />
                {/* Vignette so the corners fall away and the eye lands on the
                    poster rather than wandering to the edges. */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
              </div>

              {poster ? (
                <img
                  src={poster}
                  alt={meeting.title}
                  className="relative z-10 aspect-video w-full rounded-xl object-contain shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/15 transition-transform duration-500 hover:scale-[1.015] motion-reduce:transition-none motion-reduce:hover:scale-100"
                  loading="lazy"
                  // If the default flyer has not been added to /public yet,
                  // hide the element rather than show a broken-image icon.
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="relative z-10 aspect-video w-full overflow-hidden rounded-xl shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/15">
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
                <span className="absolute left-7 top-7 z-20 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white shadow-lg sm:left-9 sm:top-9 lg:left-11 lg:top-11">
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

                {/* No AVAILABILITY row here. The seat count now lives in the
                    card's top-right chip, which reports the same number in the
                    same three tiers — repeating it as an info row said the same
                    thing twice a few hundred pixels apart. */}
              </dl>

              <div className="border-t border-border/60 pt-6">
                {meeting.can_register ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setFormOpen(true)}
                      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-hero px-8 py-4 text-base font-bold text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/40 focus-visible:-translate-y-1"
                    >
                      {/* A light sweep that crosses the button on hover. Pure
                          decoration, behind the label, and it never intercepts
                          the click (pointer-events-none). */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full motion-reduce:hidden"
                      />
                      <span className="relative">Register Now</span>
                      <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                    </button>
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
                  /* Past / closed. Previously a single grey line, which made an
                     otherwise rich card trail off into nothing — the visitor's
                     last impression was an apology. It is now a proper panel
                     that acknowledges the state AND points somewhere useful, so
                     a late arrival still has a next step. */
                  <div className="rounded-xl border border-border/60 bg-muted/40 p-5">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold leading-snug">
                          {isPast ? "This session has wrapped" : "Registration closed"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isPast
                            ? "A new session is announced here every week."
                            : "Seats are no longer being taken for this session."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate("/courses")}
                      className="group mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-6 py-3 text-sm font-bold text-primary transition-all duration-300 hover:bg-primary/10"
                    >
                      Explore our courses
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                    </button>
                  </div>
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
