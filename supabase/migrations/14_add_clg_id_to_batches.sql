-- Add clg_id column to batches table for school/college association
ALTER TABLE lms_admin.batches
ADD COLUMN IF NOT EXISTS clg_id VARCHAR(100) DEFAULT 'independent';

-- Create index for faster lookups by school
CREATE INDEX IF NOT EXISTS idx_batches_clg_id ON lms_admin.batches(clg_id);
