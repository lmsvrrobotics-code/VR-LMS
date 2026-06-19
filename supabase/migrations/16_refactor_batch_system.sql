-- =============================================================================
-- Migration: Refactor Batch System to 1 Course + 1 Teacher + Many Students
-- File 16: Update batch structure
-- =============================================================================

-- Add course_id directly to batches table (1:1 relationship with courses)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batches' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE lms_admin.batches ADD COLUMN course_id INTEGER;
  END IF;
END $$;

-- Drop batch_courses table (no longer needed - course is now in batches directly)
DROP TABLE IF EXISTS lms_admin.batch_courses CASCADE;

-- Ensure batch_members has the correct structure
-- (These should already exist from migration 15)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD COLUMN user_id VARCHAR(255) NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD COLUMN status VARCHAR(50) DEFAULT 'active';
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_batches_course_id ON lms_admin.batches(course_id);
CREATE INDEX IF NOT EXISTS idx_batches_teacher_id ON lms_admin.batches(primary_teacher_id);
CREATE INDEX IF NOT EXISTS idx_batch_members_user_id ON lms_admin.batch_members(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_members_status ON lms_admin.batch_members(status);

-- Create unique constraint on (batch_id, user_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND constraint_name = 'unique_batch_user'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD CONSTRAINT unique_batch_user UNIQUE (batch_id, user_id);
  END IF;
END $$;
