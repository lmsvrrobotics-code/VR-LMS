-- =============================================================================
-- 08 — Consolidated: everything admin-service's boot self-heal applies.
--
-- The boot code in backend/admin-service/src/server.js (column ensures) and
-- src/scripts/ensureIndexes.js (hot-path indexes) self-heal these on every
-- start, so a running deployment never needs this file. It exists so the SQL
-- migrations remain the complete, reviewable source of truth for the schema —
-- a fresh database restored from migrations alone matches what boot would
-- have built. Every statement is idempotent; re-running is always safe.
--
-- Keep in sync: when server.js gains a new ensureCourseCol/ensureProgramCol
-- (or ensureIndexes.js a new index), mirror it here.
-- =============================================================================

-- ---- lms_admin.courses — late-added columns -------------------------------
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS has_certificate BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS batch_ids JSONB;
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS bunny_collection_id VARCHAR(64);
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS class_from SMALLINT;
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS class_to SMALLINT;
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS score_max INTEGER;
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS lectures_label VARCHAR(255);
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS is_marketing BOOLEAN NOT NULL DEFAULT FALSE;
-- Admin "push to Home page" flag (Home "Our Courses" preview).
ALTER TABLE lms_admin.courses ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT FALSE;

-- ---- lms_admin.programs — late-added columns ------------------------------
ALTER TABLE lms_admin.programs ADD COLUMN IF NOT EXISTS clg_ids JSONB;
ALTER TABLE lms_admin.programs ADD COLUMN IF NOT EXISTS course_id INTEGER;
ALTER TABLE lms_admin.programs ADD COLUMN IF NOT EXISTS course_ids JSONB;
ALTER TABLE lms_admin.programs ADD COLUMN IF NOT EXISTS batch_ids JSONB;

-- ---- lms_admin.users / slots / resources ----------------------------------
ALTER TABLE lms_admin.users ADD COLUMN IF NOT EXISTS is_root_admin BOOLEAN NOT NULL DEFAULT FALSE;
-- NOTE: slots table is created at boot-time by Model.sync(), not in migrations,
-- so we don't ALTER it here. The boot code (server.js) handles column ensures.
ALTER TABLE lms_admin.resources ADD COLUMN IF NOT EXISTS resource_category_id INTEGER;
ALTER TABLE lms_admin.resources ADD COLUMN IF NOT EXISTS course_id INTEGER;
ALTER TABLE lms_admin.resources ADD COLUMN IF NOT EXISTS section VARCHAR(255);

-- ---- lucy_devdb (auth schema) ----------------------------------------------
ALTER TABLE lucy_devdb.users ADD COLUMN IF NOT EXISTS "teacherPhoto" VARCHAR(255);
ALTER TABLE lucy_devdb.users ADD COLUMN IF NOT EXISTS "studentPhoto" VARCHAR(255);
ALTER TABLE lucy_devdb.users ADD COLUMN IF NOT EXISTS "postScoreDuration" INTEGER;
ALTER TABLE lucy_devdb.colleges ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

-- ---- Hot-path indexes (mirrors src/scripts/ensureIndexes.js) ---------------
-- Sized for ~5k users / ~500 concurrent students: player, progress, paywall,
-- leaderboard, delegation, teacher dashboard panels.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_completions_user_lesson_uniq ON lms_admin.lesson_completions (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS lesson_completions_user_course_idx ON lms_admin.lesson_completions (user_id, course_id);
CREATE INDEX IF NOT EXISTS lesson_completions_course_idx ON lms_admin.lesson_completions (course_id);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_watch_progress_user_lesson_uniq ON lms_admin.lesson_watch_progress (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS lesson_watch_progress_user_course_idx ON lms_admin.lesson_watch_progress (user_id, course_id);
CREATE INDEX IF NOT EXISTS user_progress_user_idx ON lms_admin.user_progress (user_id);
CREATE INDEX IF NOT EXISTS user_progress_user_course_idx ON lms_admin.user_progress (user_id, course_id);
CREATE INDEX IF NOT EXISTS quiz_submissions_user_quiz_idx ON lms_admin.quiz_submissions (user_id, quiz_id);
CREATE INDEX IF NOT EXISTS quiz_submissions_quiz_idx ON lms_admin.quiz_submissions (quiz_id);
CREATE INDEX IF NOT EXISTS payments_user_course_idx ON lms_admin.payments (user_id, course_id);
CREATE INDEX IF NOT EXISTS payments_order_idx ON lms_admin.payments (razorpay_order_id);
CREATE INDEX IF NOT EXISTS student_records_teacher_student_idx ON lms_admin.student_records (teacher_id, student_id);
CREATE INDEX IF NOT EXISTS student_records_student_idx ON lms_admin.student_records (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS batch_members_batch_user_uniq ON lms_admin.batch_members (batch_id, user_id);
CREATE INDEX IF NOT EXISTS batch_members_user_idx ON lms_admin.batch_members (user_id);
CREATE INDEX IF NOT EXISTS certificates_user_idx ON lms_admin.certificates (user_id);
CREATE INDEX IF NOT EXISTS feedback_responses_student_idx ON lms_admin.feedback_responses (student_id);

-- NOTE: feature tables created by boot-time Model.sync() (forums, leads,
-- payments, slots, demos, books, locations, app_settings, feedback_forms,
-- teaching_assignments, …) are defined canonically in 03_lms_admin_tables.sql
-- and later patches; boot sync only creates ones that are missing.
