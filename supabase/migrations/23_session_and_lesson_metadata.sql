-- =============================================================================
-- Migration: Session (section) + class (lesson) metadata
-- File 23: richer curriculum authoring fields for the admin course builder
-- =============================================================================
--
-- The admin curriculum builder now presents a section as a "Session" and a
-- lesson as a "Class". Both gained authoring fields the tables never had:
--
--   sections.image        cover image for the session card
--   sections.description  what the session covers
--   lessons.difficulty    'easy' | 'medium' | 'hard'
--
-- Naming note: the UI says Session/Class but the tables, models, routes and
-- payload keys stay `sections`/`lessons`. Renaming them would break the
-- student player, quiz service, release gates and teacher course service for
-- no user-visible gain.
--
-- lessons.description already exists (TEXT) and is reused for the class
-- description — no new column needed there.
--
-- All columns are nullable so existing rows stay valid.
-- Idempotent: safe to re-run.

ALTER TABLE lms_admin.sections
  ADD COLUMN IF NOT EXISTS image VARCHAR(255) DEFAULT NULL;

COMMENT ON COLUMN lms_admin.sections.image IS
  'R2 key/URL of the session cover image (uploads/courses/<id>/sessions/...).';

ALTER TABLE lms_admin.sections
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

COMMENT ON COLUMN lms_admin.sections.description IS
  'Session description shown under the session title in the curriculum.';

ALTER TABLE lms_admin.lessons
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) DEFAULT NULL;

COMMENT ON COLUMN lms_admin.lessons.difficulty IS
  'Class difficulty level: easy | medium | hard. NULL = unspecified.';

-- Guard against typos from any client writing this column directly. Added
-- separately from the column so re-runs on an already-migrated DB do not fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lessons_difficulty_check'
      AND conrelid = 'lms_admin.lessons'::regclass
  ) THEN
    ALTER TABLE lms_admin.lessons
      ADD CONSTRAINT lessons_difficulty_check
      CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard'));
  END IF;
END $$;
