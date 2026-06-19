-- =============================================================================
-- Migration: Remove Legacy Teaching Assignment Feature
-- File 12: Drop old teaching_assignments, assignment_members, lesson_releases
-- =============================================================================
-- The teaching assignment feature is replaced by the new Batch system:
--   OLD: teaching_assignments → assignment_members → lesson_releases
--   NEW: batches → batch_members → batch_lesson_releases
--
-- The new system is simpler, more intuitive, and handles all use cases.
-- =============================================================================

-- Step 1: Drop old teaching assignment feature tables
DROP TABLE IF EXISTS lms_admin.lesson_releases CASCADE;
DROP TABLE IF EXISTS lms_admin.assignment_members CASCADE;
DROP TABLE IF EXISTS lms_admin.teaching_assignments CASCADE;

-- =============================================================================
-- Migration Notes:
-- =============================================================================
-- 1. All course assignment logic now handled by the Batch system
-- 2. Teachers release content to batches (batch_lesson_releases)
-- 3. Students get access automatically when teacher releases
-- 4. No more intermediate "assignment" concept
-- 5. Simpler, cleaner architecture
-- =============================================================================
