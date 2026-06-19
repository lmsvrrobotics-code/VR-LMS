-- =============================================================================
-- Migration: Ensure Batch Members Schema Is Complete
-- File 17: Idempotent fixes for batch_members columns
-- =============================================================================

-- Ensure batch_members table has user_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD COLUMN user_id VARCHAR(255) NOT NULL DEFAULT 'unknown';
    CREATE INDEX idx_batch_members_user_id ON lms_admin.batch_members(user_id);
    RAISE NOTICE 'Added user_id column to batch_members';
  ELSE
    RAISE NOTICE 'user_id column already exists in batch_members';
  END IF;
END $$;

-- Ensure batch_members table has status column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD COLUMN status VARCHAR(50) DEFAULT 'active';
    CREATE INDEX idx_batch_members_status ON lms_admin.batch_members(status);
    RAISE NOTICE 'Added status column to batch_members';
  ELSE
    RAISE NOTICE 'status column already exists in batch_members';
  END IF;
END $$;

-- Ensure batch_members has student_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND column_name = 'student_id'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD COLUMN student_id VARCHAR(100) DEFAULT '';
    RAISE NOTICE 'Added student_id column to batch_members';
  ELSE
    RAISE NOTICE 'student_id column already exists in batch_members';
  END IF;
END $$;

-- Ensure batches table has course_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batches' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE lms_admin.batches ADD COLUMN course_id INTEGER;
    CREATE INDEX idx_batches_course_id ON lms_admin.batches(course_id);
    RAISE NOTICE 'Added course_id column to batches';
  ELSE
    RAISE NOTICE 'course_id column already exists in batches';
  END IF;
END $$;

-- Create unique constraint if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND constraint_name = 'unique_batch_user'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD CONSTRAINT unique_batch_user UNIQUE (batch_id, user_id);
    RAISE NOTICE 'Added unique constraint on batch_members(batch_id, user_id)';
  ELSE
    RAISE NOTICE 'Unique constraint already exists on batch_members(batch_id, user_id)';
  END IF;
END $$;

-- Log completion
SELECT 'Migration 17: Batch schema verification complete' as status;
