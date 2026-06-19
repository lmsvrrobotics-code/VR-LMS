-- =============================================================================
-- Migration: Student & Teacher Unique ID System (Simplified)
-- File 09: Add unique_id column for tracking
-- =============================================================================

-- Step 1: Add unique_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='lms_admin' AND table_name='users' AND column_name='unique_id') THEN
    ALTER TABLE lms_admin.users ADD COLUMN unique_id VARCHAR(100) UNIQUE;
    -- Generate unique IDs from existing data
    UPDATE lms_admin.users SET unique_id = 'USER-' || id::TEXT WHERE unique_id IS NULL;
  END IF;
END $$;

-- Step 2: Create helper function for generating unique IDs for new users
CREATE OR REPLACE FUNCTION lms_admin.get_next_user_id(p_name VARCHAR(255))
RETURNS VARCHAR(100) AS $$
DECLARE
  v_first_name VARCHAR(255);
  v_date_str VARCHAR(8);
  v_serial_number INT;
  v_result VARCHAR(100);
BEGIN
  v_first_name := SPLIT_PART(TRIM(p_name), ' ', 1);
  IF v_first_name = '' OR v_first_name IS NULL THEN
    v_first_name := 'User';
  END IF;
  v_date_str := TO_CHAR(NOW(), 'YYYYMMDD');
  v_serial_number := COALESCE((SELECT COUNT(*) + 1 FROM lms_admin.users WHERE created_at::DATE = NOW()::DATE), 1);
  v_result := v_first_name || v_date_str || '-' || LPAD(v_serial_number::TEXT, 2, '0');
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Notes:
-- 1. unique_id is now available for tracking users
-- 2. Applications should call get_next_user_id() when creating new users
-- 3. This simplified version keeps the existing table structure intact
-- =============================================================================
