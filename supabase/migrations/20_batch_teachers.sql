-- =============================================================================
-- Migration 20: batch_teachers — many teachers per batch
-- =============================================================================
-- batches.primary_teacher_id holds ONE teacher (BatchNewService sets it from the
-- Course+Teacher+Students form). The College → Add Batch form assigns a batch to
-- MANY teachers, which a single column can't express, so teachers get their own
-- join table — the same shape batch_members uses for students.
--
-- primary_teacher_id is left in place and untouched: BatchNewService still
-- writes/reads it, and dropping it would break that flow.
--
-- batch_id is a FK to batches.unique_id (the varchar primary key), NOT the
-- surrogate integer batches.id — mirroring batch_members.batch_id. Getting this
-- backwards is what made every roster insert fail with an FK violation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lms_admin.batch_teachers (
    id          SERIAL PRIMARY KEY,
    batch_id    VARCHAR(100) NOT NULL
                  REFERENCES lms_admin.batches (unique_id) ON DELETE CASCADE,
    -- auth-service users.userId — an 11-digit STRING, not an int.
    user_id     VARCHAR(255) NOT NULL,
    status      VARCHAR(50) DEFAULT 'active',
    added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- A teacher appears at most once per batch. Also lets the roster insert use
-- ignoreDuplicates instead of a read-then-write race.
CREATE UNIQUE INDEX IF NOT EXISTS batch_teachers_batch_user_key
    ON lms_admin.batch_teachers (batch_id, user_id);

-- Lookup path for "teachers of this batch" and the grouped member count.
CREATE INDEX IF NOT EXISTS batch_teachers_batch_id_idx
    ON lms_admin.batch_teachers (batch_id);

-- Reverse lookup: "which batches does this teacher run?"
CREATE INDEX IF NOT EXISTS batch_teachers_user_id_idx
    ON lms_admin.batch_teachers (user_id);
