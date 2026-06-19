-- Add missing buy_url column to kits table
-- The Kit model defines buy_url but the database table didn't have it,
-- causing "column buy_url does not exist" errors when trying to create kits.

ALTER TABLE lms_admin.kits ADD COLUMN IF NOT EXISTS buy_url TEXT;
