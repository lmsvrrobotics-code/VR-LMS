-- Add course approval workflow
-- is_approved: boolean flag (default false = pending approval)
-- approved_at: timestamp when course was approved
-- approved_by: admin user ID who approved

ALTER TABLE lms_admin.courses
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100) NULL;

-- Create index for faster filtering of approved courses
CREATE INDEX IF NOT EXISTS idx_courses_is_approved ON lms_admin.courses(is_approved);
CREATE INDEX IF NOT EXISTS idx_courses_approved_at ON lms_admin.courses(approved_at DESC);

-- Mark all existing courses as approved (backward compatibility)
UPDATE lms_admin.courses
SET is_approved = true, approved_at = NOW()
WHERE is_approved = false;
