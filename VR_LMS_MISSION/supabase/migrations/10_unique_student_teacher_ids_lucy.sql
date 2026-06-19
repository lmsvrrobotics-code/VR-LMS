-- =============================================================================
-- Migration: Student & Teacher Unique ID System (lucy_devdb)
-- File 10: Add robust unique ID (FirstName+YYYYMMDD-SerialNumber) as primary key
-- =============================================================================
-- This migration replaces the UUID userId with a unique identifier that
-- combines: FirstName + DateOfJoin (YYYYMMDD) + "-" + SerialNumber
-- Example: John20260618-01, Priya20260615-03
--
-- NOTE: This is a breaking change. All foreign keys and references to userId
--       must be updated. This migration handles the core table; callers must
--       update their queries accordingly.
-- =============================================================================

-- Drop dependent foreign keys first (from courses, enrollments, etc. tables)
-- Note: lucy_devdb has limited FK enforcement; most are logical.
-- For clarity, we document the dependencies here:
--   lucy_devdb.courses.teacherId -> lucy_devdb.users.userId (self-referencing, not enforced)
--   lucy_devdb.enrollments.userId -> lucy_devdb.users.userId (not enforced)

-- Step 1: Add unique_id column to users table
ALTER TABLE lucy_devdb.users
  ADD COLUMN unique_id VARCHAR(100) DEFAULT NULL;

-- Step 2: Create a helper function to generate unique IDs based on name and creation time
CREATE OR REPLACE FUNCTION lucy_devdb.generate_unique_id_from_user(
  p_name VARCHAR(255),
  p_created_at TIMESTAMPTZ
) RETURNS VARCHAR(100) AS $$
DECLARE
  v_first_name VARCHAR(255);
  v_date_str VARCHAR(8);
  v_date_based_count INT;
BEGIN
  -- Extract first name (first word)
  v_first_name := SPLIT_PART(TRIM(p_name), ' ', 1);

  -- If empty, use "User"
  IF v_first_name = '' OR v_first_name IS NULL THEN
    v_first_name := 'User';
  END IF;

  -- Format date as YYYYMMDD
  v_date_str := TO_CHAR(p_created_at, 'YYYYMMDD');

  -- Count users created on the same date (for serial number)
  v_date_based_count := (
    SELECT COUNT(*) + 1
    FROM lucy_devdb.users
    WHERE "createdAt"::DATE = p_created_at::DATE
  );

  -- Combine: FirstName + Date + "-" + PaddedSerialNumber
  RETURN v_first_name || v_date_str || '-' || LPAD(v_date_based_count::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql;

-- Step 3: Generate unique IDs for all existing users
UPDATE lucy_devdb.users
SET unique_id = lucy_devdb.generate_unique_id_from_user(name, "createdAt")
WHERE unique_id IS NULL;

-- Step 4: Verify all users have unique_id
DO $$
DECLARE
  v_null_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM lucy_devdb.users WHERE unique_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'ERROR: % users still have NULL unique_id after generation', v_null_count;
  END IF;
  RAISE NOTICE 'SUCCESS: All users now have unique_id values';
END $$;

-- Step 5: Make unique_id NOT NULL and add UNIQUE constraint
ALTER TABLE lucy_devdb.users
  ALTER COLUMN unique_id SET NOT NULL;

CREATE UNIQUE INDEX idx_users_unique_id ON lucy_devdb.users (unique_id);

-- Step 6: Create a new users table with unique_id as primary key
CREATE TABLE lucy_devdb.users_new (
  unique_id              VARCHAR(100) PRIMARY KEY,
  "userId"               VARCHAR(255) UNIQUE NOT NULL,  -- Keep for backward compat, but not PK
  name                   VARCHAR(255) NOT NULL,
  email                  VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash"         VARCHAR(255) NOT NULL,
  phone                  VARCHAR(255),
  dob                    DATE,
  gender                 lucy_devdb.gender_enum,
  "yearOfEducation"      VARCHAR(255),
  "branchId"             VARCHAR(255),
  "collegeId"            VARCHAR(255),
  "yearOfStudy"          INTEGER,
  "educationLevel"       lucy_devdb.education_level_enum,
  branch                 VARCHAR(255),
  "collegeName"          VARCHAR(255),
  "graduationYear"       VARCHAR(255),
  "collegeCode"          VARCHAR(255),
  "orgId"                VARCHAR(255),
  "assessmentId"         VARCHAR(255),
  "programInterested"    VARCHAR(255),
  expertise              VARCHAR(255),
  bio                    VARCHAR(1000),
  "yearsOfExperience"    INTEGER,
  "linkedinUrl"          VARCHAR(255),
  "profileStatus"        lucy_devdb.profile_status_enum DEFAULT 'pending',
  location               VARCHAR(255),
  address                VARCHAR(255),
  "lastLogin"            TIMESTAMPTZ,
  "preScore"             INTEGER,
  "preScoreDuration"     INTEGER,
  "postScore"            INTEGER,
  "postScoreDuration"    INTEGER,
  "refreshToken"         VARCHAR(1024),
  "roleId"               VARCHAR(255) NOT NULL,
  "assignedProgram"      VARCHAR(255),
  "programResponseStatus" VARCHAR(255),
  "programRespondedAt"   TIMESTAMPTZ,
  "teacherPhoto"         VARCHAR(255),
  "studentPhoto"         VARCHAR(255),
  "quizScores"           JSONB,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 7: Copy data from old users table to new one
INSERT INTO lucy_devdb.users_new (
  unique_id, "userId", name, email, "passwordHash", phone, dob, gender,
  "yearOfEducation", "branchId", "collegeId", "yearOfStudy", "educationLevel",
  branch, "collegeName", "graduationYear", "collegeCode", "orgId", "assessmentId",
  "programInterested", expertise, bio, "yearsOfExperience", "linkedinUrl",
  "profileStatus", location, address, "lastLogin", "preScore", "preScoreDuration",
  "postScore", "postScoreDuration", "refreshToken", "roleId", "assignedProgram",
  "programResponseStatus", "programRespondedAt", "teacherPhoto", "studentPhoto",
  "quizScores", "createdAt", "updatedAt"
)
SELECT
  unique_id, "userId", name, email, "passwordHash", phone, dob, gender,
  "yearOfEducation", "branchId", "collegeId", "yearOfStudy", "educationLevel",
  branch, "collegeName", "graduationYear", "collegeCode", "orgId", "assessmentId",
  "programInterested", expertise, bio, "yearsOfExperience", "linkedinUrl",
  "profileStatus", location, address, "lastLogin", "preScore", "preScoreDuration",
  "postScore", "postScoreDuration", "refreshToken", "roleId", "assignedProgram",
  "programResponseStatus", "programRespondedAt", "teacherPhoto", "studentPhoto",
  "quizScores", "createdAt", "updatedAt"
FROM lucy_devdb.users
ORDER BY "createdAt", "userId";

-- Step 8: Drop old users table and rename new one
DROP TABLE lucy_devdb.users;
ALTER TABLE lucy_devdb.users_new RENAME TO users;

-- Step 9: Create indexes for common queries
CREATE INDEX idx_users_userId ON lucy_devdb.users ("userId");
CREATE INDEX idx_users_roleId ON lucy_devdb.users ("roleId");
CREATE INDEX idx_users_email ON lucy_devdb.users (email);

-- Step 10: Create function to generate unique_id for NEW users being created
-- Called from StudentService.create() and TeacherService.create()
CREATE OR REPLACE FUNCTION lucy_devdb.get_next_unique_id(
  p_name VARCHAR(255)
) RETURNS VARCHAR(100) AS $$
DECLARE
  v_first_name VARCHAR(255);
  v_date_str VARCHAR(8);
  v_serial_number INT;
  v_result VARCHAR(100);
BEGIN
  -- Extract first name (first word only)
  v_first_name := SPLIT_PART(TRIM(p_name), ' ', 1);

  IF v_first_name = '' OR v_first_name IS NULL THEN
    v_first_name := 'User';
  END IF;

  -- Get today's date in YYYYMMDD format
  v_date_str := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Count existing users created today and add 1
  v_serial_number := COALESCE(
    (SELECT COUNT(*) + 1
     FROM lucy_devdb.users
     WHERE "createdAt"::DATE = NOW()::DATE),
    1
  );

  -- Combine: FirstName + Date + "-" + PaddedSerialNumber
  v_result := v_first_name || v_date_str || '-' || LPAD(v_serial_number::TEXT, 2, '0');

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Migration Notes:
-- =============================================================================
-- 1. The unique_id is now the PRIMARY KEY for lucy_devdb.users
-- 2. userId is kept as a UNIQUE field for backward compatibility
-- 3. All existing userId references in the application should be updated
--    to use unique_id instead, but userId remains queryable
-- 4. The application code should call get_next_unique_id() when creating
--    new students or teachers
-- 5. Teachers and students now have a stable, memorable ID that:
--    - Never changes (immutable)
--    - Is based on their first name + join date + serial number
--    - Can be used for admin monitoring, course assignment, batch assignment
-- =============================================================================
