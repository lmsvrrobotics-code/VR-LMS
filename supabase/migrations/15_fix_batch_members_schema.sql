-- =============================================================================
-- Migration: Fix Batch Members Schema
-- File 15: Add user_id and status fields to batch_members
-- =============================================================================

-- Add user_id and status columns if they don't exist
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND column_name = 'added_at'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD COLUMN added_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Ensure unique constraint on batch_id + user_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'lms_admin' AND table_name = 'batch_members' AND constraint_name = 'unique_batch_user'
  ) THEN
    ALTER TABLE lms_admin.batch_members ADD CONSTRAINT unique_batch_user UNIQUE (batch_id, user_id);
  END IF;
END $$;

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_batch_members_user_id ON lms_admin.batch_members(user_id);
