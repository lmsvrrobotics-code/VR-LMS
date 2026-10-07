import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, ExternalLink, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import { listMyChallenges, type StudentChallenge } from "@/api/course/courseApi";

/**
 * The student's Challenges tab.
 *
 * Lists every challenge across the courses they can open — including ones they
 * have NOT attempted, because a tab that only showed submitted work would hide
 * the thing they are meant to go and do.
 *
 * The MARK is the state throughout: `score != null` means marked. Checking
 * against null rather than falsiness matters, because 0 is a real mark and must
 * not read as "not marked yet".
 */

const isMarked = (c: StudentChallenge) => c.submission?.score != null;
const isAwaiting = (c: StudentChallenge) => c.submission != null && c.submission.score == null;

const fmt = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  });
};

const ChallengeCard = ({ c }: { c: StudentChallenge }) => {
  const marked = isMarked(c);
  const awaiting = isAwaiting(c);
  const sub = c.submission;

  return (
    <article className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">{c.title}</h3>
          {/* Course · session — the same place the teacher's queue names, so a
              student asking about a mark and the teacher answering are talking
              about the same thing. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[c.course_title, c.session_title].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* The mark doubles as the status chip — one place to look. */}
        {marked ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
            {sub!.score} / {sub!.max_score}
          </span>
        ) : awaiting ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Awaiting mark
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            Not started
          </span>
        )}
      </div>

      {sub?.feedback && (
        <div className="mt-3 rounded-lg border-l-2 border-[#FF6A00]/50 bg-muted/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Teacher feedback
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{sub.feedback}</p>
        </div>
      )}

      {sub && (
        <p className="mt-2 text-xs text-muted-foreground">
          Submitted {fmt(sub.submitted_at)}
          {marked && sub.reviewed_at ? ` · Marked ${fmt(sub.reviewed_at)}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        {/* The challenge itself. noopener/noreferrer is required: without
            noopener the opened page can navigate this tab via window.opener. */}
        {c.challenge_url && (
          <a
            href={c.challenge_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Open challenge
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}

        {/* Submitting happens in the player, where the brief lives, so this
            routes there rather than duplicating the form. */}
        {c.course_slug && (
          <Link
            to={`/courses/programs/course-details/play/${c.course_slug}/${c.lesson_id}`}
            className="group inline-flex items-center gap-1.5 rounded-lg bg-gradient-hero px-4 py-2 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:brightness-105"
          >
            {sub ? "View in class" : "Submit your work"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
};

export default function ChallengesView() {
  const [challenges, setChallenges] = useState<StudentChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listMyChallenges()
      .then((d) => { if (alive) setChallenges(d.challenges || []); })
      .catch(() => { if (alive) setChallenges([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Unfinished work first: a student opening this tab wants to know what is
  // left to do, not to re-read marks they have already seen.
  const ordered = useMemo(() => {
    const rank = (c: StudentChallenge) => (c.submission == null ? 0 : isAwaiting(c) ? 1 : 2);
    return [...challenges].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [challenges]);

  const stats = useMemo(() => {
    const done = challenges.filter(isMarked);
    const total = done.reduce((n, c) => n + (c.submission?.score ?? 0), 0);
    return {
      marked: done.length,
      awaiting: challenges.filter(isAwaiting).length,
      // Average rather than a raw total: a running total would keep climbing
      // simply because more challenges exist, which says nothing about how
      // well the student is doing.
      average: done.length ? Math.round(total / done.length) : null,
    };
  }, [challenges]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your challenges…</p>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Challenges</h1>
        <p className="mt-1 text-muted-foreground">
          Hands-on tasks you complete on other sites — your teacher marks each one out of 100.
        </p>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold">No challenges yet</p>
          <p className="text-sm text-muted-foreground">
            When your teacher adds one to a course, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marked</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                {stats.marked}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Awaiting mark</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
                <Clock className="h-5 w-5 text-amber-500" aria-hidden="true" />
                {stats.awaiting}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Average mark</p>
              <p className="mt-1 text-2xl font-bold">
                {stats.average == null ? "—" : `${stats.average} / 100`}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {ordered.map((c) => <ChallengeCard key={c.lesson_id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
