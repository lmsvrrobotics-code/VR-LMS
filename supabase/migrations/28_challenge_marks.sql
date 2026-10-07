-- =============================================================================
-- Migration: Challenge marks
-- File 28: score out of 100 on a challenge submission
-- =============================================================================
--
-- Review moved from an approve/needs-work verdict to a MARK. Every challenge is
-- scored out of 100 (no per-challenge maximum), and any score the teacher saves
-- completes the class for that student — there is no pass mark and no
-- resubmission loop.
--
-- `score` stays NULLABLE: a submission that has not been marked yet is the
-- normal starting state, and NULL is what "awaiting review" means. Using 0
-- as the sentinel would be wrong, since 0 is also a legitimate mark.
--
-- The old status vocabulary is kept so existing rows stay valid, but the only
-- two values the application now writes are 'submitted' (awaiting a mark) and
-- 'approved' (marked). 'needs_work' remains legal so rows written before this
-- migration do not violate the CHECK constraint.
--
-- Idempotent: safe to re-run.
-- =============================================================================

ALTER TABLE lms_admin.challenge_submissions
  ADD COLUMN IF NOT EXISTS score INTEGER;

-- A mark outside 0..100 is a bug, not a grading choice: it would render as a
-- nonsense percentage on the student's card. Reject it at the DB level so no
-- code path can store one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_schema = 'lms_admin'
       AND table_name = 'challenge_submissions'
       AND constraint_name = 'challenge_submissions_score_chk'
  ) THEN
    ALTER TABLE lms_admin.challenge_submissions
      ADD CONSTRAINT challenge_submissions_score_chk
      CHECK (score IS NULL OR (score >= 0 AND score <= 100));
  END IF;
END $$;

-- The student's "My Challenges" tab lists their own submissions newest first.
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_user_submitted
  ON lms_admin.challenge_submissions (user_id, submitted_at DESC);
