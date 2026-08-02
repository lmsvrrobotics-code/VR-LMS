-- =============================================================================
-- Migration 18: Public student/teacher identifiers (VRS/VRT) on lucy_devdb.users
-- =============================================================================
-- Students and teachers live in lucy_devdb.users, which had no unique_id column
-- at all — StudentService/TeacherService generated an id and silently discarded
-- it. This adds the column that gives those ids somewhere to live.
--
-- Format: VRS202600001
--   VR    brand
--   S|T   student | teacher
--   2026  registration year
--   00001 5-digit serial, per year AND per role, resets each year
--
-- NULLABLE ON PURPOSE: a self-signup student has an account but no public id
-- until an admin converts their lead. NULL = "not yet converted". Admin-created
-- students and teachers are assigned one at creation.
--
-- Migration 09 added a unique_id to lms_admin.users (admins) using an older
-- FirstName+YYYYMMDD scheme. That column and this one are unrelated; this
-- migration deliberately leaves lms_admin.users untouched.
-- =============================================================================

-- Step 1: add the column (nullable — see note above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'lucy_devdb'
       AND table_name   = 'users'
       AND column_name  = 'unique_id'
  ) THEN
    ALTER TABLE lucy_devdb.users ADD COLUMN unique_id VARCHAR(32);
  END IF;
END $$;

-- Step 2: enforce uniqueness. This index is what makes concurrent id allocation
-- safe: two racing requests can compute the same serial, and the DB rejects the
-- loser so the application retries with the next one. A partial index keeps the
-- many NULL (unconverted) rows out of it.
CREATE UNIQUE INDEX IF NOT EXISTS users_unique_id_key
    ON lucy_devdb.users (unique_id)
    WHERE unique_id IS NOT NULL;

-- Step 3: lookup index for the "highest serial for this prefix" read that
-- drives generation (WHERE unique_id LIKE 'VRS2026%' ORDER BY unique_id DESC).
CREATE INDEX IF NOT EXISTS users_unique_id_prefix_idx
    ON lucy_devdb.users (unique_id varchar_pattern_ops)
    WHERE unique_id IS NOT NULL;

-- =============================================================================
-- Existing rows are intentionally left with unique_id = NULL. Backfilling would
-- have to invent a registration year and serial order for historical accounts;
-- assigning ids on conversion/creation from here on keeps the sequence honest.
-- =============================================================================
