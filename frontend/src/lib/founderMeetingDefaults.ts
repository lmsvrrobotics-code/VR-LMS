/**
 * Poster resolution for "Weekly Meeting with Founder".
 *
 * There is deliberately NO hardcoded fallback path here any more. The default
 * poster lives in Cloudflare R2 and the server stamps its URL onto every
 * meeting that has no poster of its own, so `poster_url` is already correct by
 * the time it reaches the browser.
 *
 * That matters because a path like "/founder-meeting-poster.png" only resolves
 * if the file happens to be deployed with the frontend — it breaks on any
 * other host, and gives the admin no way to change the artwork without a code
 * change. Seeding R2 (`npm run seed:founder-poster` in admin-service) makes the
 * default a piece of DATA the admin owns.
 */

/**
 * The image to render in a meeting's media slot: the poster the server
 * resolved (the admin's upload, or the seeded default), or null when the
 * meeting has a video and no poster — in that case the video fills the slot.
 */
export const posterFor = (
  meeting: { poster_url?: string | null; video_url?: string | null } | null,
): string | null => meeting?.poster_url || null;

/** Below this share of seats remaining, availability becomes urgent. */
export const LOW_SEATS_THRESHOLD = 0.1;

/**
 * Is the session nearly full?
 *
 * True when 10% or fewer seats remain. Used to promote availability from a
 * quiet detail line to a prominent badge — scarcity is only worth shouting
 * about when it is real, so an uncapped session never qualifies.
 *
 * A sold-out session returns FALSE: zero seats is not "hurry", it is a
 * different message entirely, and the page already says "fully booked".
 */
export const isLowOnSeats = (
  seatsLeft: number | null | undefined,
  capacity: number | null | undefined,
): boolean => {
  const cap = Number(capacity);
  const left = Number(seatsLeft);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  if (!Number.isFinite(left) || left <= 0) return false;
  return left <= cap * LOW_SEATS_THRESHOLD;
};
