-- Registrations for "Weekly Meeting with Founder"
--
-- The public home page no longer hands out the join link directly. Visitors
-- REGISTER, and the admin sees who signed up. The link is released to the
-- registrant (on the confirmation) rather than published on the page, so
-- attendance is known in advance and the meeting is not open to anyone who
-- finds the URL.
--
-- Idempotent: safe to re-run.

-- Registration can be turned off per meeting (e.g. a recording-only entry, or
-- once seats are full). NULL capacity = unlimited.
ALTER TABLE lms_admin.founder_meetings
    ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE lms_admin.founder_meetings
    ADD COLUMN IF NOT EXISTS capacity INTEGER;

CREATE TABLE IF NOT EXISTS lms_admin.founder_meeting_registrations (
    id           SERIAL PRIMARY KEY,

    meeting_id   INTEGER NOT NULL
                 REFERENCES lms_admin.founder_meetings (id) ON DELETE CASCADE,

    name         VARCHAR(150) NOT NULL,
    email        VARCHAR(254) NOT NULL,
    phone        VARCHAR(20),
    -- Free-text: "what would you like to ask the founder?"
    message      TEXT,

    -- Set when a logged-in student registers; NULL for an anonymous visitor.
    -- VARCHAR because auth-service user ids are 11-digit strings, not ints.
    user_id      VARCHAR(64),

    -- Admin workflow: registered → attended / no_show / cancelled.
    status       VARCHAR(20) NOT NULL DEFAULT 'registered',

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The admin list is always scoped to one meeting, newest first.
CREATE INDEX IF NOT EXISTS idx_fmr_meeting
    ON lms_admin.founder_meeting_registrations (meeting_id, created_at DESC);

-- One registration per email per meeting. Enforced in the DATABASE so a
-- double-submit (impatient click, retried request) cannot create duplicates
-- that would inflate the headcount the admin plans around.
-- Email is stored lowercased by the service, so a plain unique index is enough.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fmr_meeting_email
    ON lms_admin.founder_meeting_registrations (meeting_id, email);
