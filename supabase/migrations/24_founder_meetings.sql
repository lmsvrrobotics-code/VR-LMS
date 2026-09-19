-- Weekly Meeting with Founder
--
-- One admin-managed announcement: a scheduled live session with the founder,
-- an optional recorded/promo video, and an optional poster image. Surfaced on
-- the public home page directly under the hero.
--
-- Only ONE meeting is featured at a time (see is_featured + the partial unique
-- index below), so the home page never has to choose between two.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS lms_admin.founder_meetings (
    id              SERIAL PRIMARY KEY,

    title           VARCHAR(255) NOT NULL,
    -- Short blurb shown under the title on the home page.
    description     TEXT,

    -- When the live session happens. NULL = an announcement with no fixed
    -- slot yet (video-only promo), which the UI renders without a countdown.
    scheduled_at    TIMESTAMPTZ,
    -- Minutes. Used to decide whether a meeting is still "live" rather than
    -- past, so the join link stays up for the duration of the call.
    duration_mins   INTEGER NOT NULL DEFAULT 60,

    -- Where attendees join (Meet/Zoom/Teams). Optional so a recording-only
    -- entry is still valid.
    meeting_link    TEXT,

    -- Promo/recorded video. Bunny embed URL for video uploads.
    video_url       TEXT,
    -- Poster/banner image (R2 public URL) — the workshop flyer shown beside
    -- the details on the home page.
    poster_url      TEXT,

    -- Exactly one row may be featured; the home page reads that one.
    is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
    -- 1 = published/visible, 0 = draft.
    status          SMALLINT NOT NULL DEFAULT 1,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Home page reads "the featured, published meeting" on every visit.
CREATE INDEX IF NOT EXISTS idx_founder_meetings_featured
    ON lms_admin.founder_meetings (is_featured, status);

-- Admin list orders by upcoming-first.
CREATE INDEX IF NOT EXISTS idx_founder_meetings_scheduled
    ON lms_admin.founder_meetings (scheduled_at DESC NULLS LAST);

-- Enforce "only one featured" in the DATABASE, not just in application code.
-- A partial unique index lets many rows be false while allowing only one true,
-- so a concurrent double-feature fails loudly instead of silently leaving the
-- home page with two candidates.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_founder_meetings_one_featured
    ON lms_admin.founder_meetings ((is_featured))
    WHERE is_featured = TRUE;
