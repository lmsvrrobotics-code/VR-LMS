-- Quiz question media: an image and/or a video attached to a single question.
--
-- Teachers asked to ask questions ABOUT something — a circuit photo, a short
-- clip of a robot misbehaving — rather than text alone. Both columns hold the
-- value fileUploader.upload() persists: an R2 public URL (or legacy
-- "uploads/..." key) for the image, and a Bunny Stream embed/HLS URL for the
-- video. NULL means "no media", which is every existing row.
--
-- Idempotent: safe to re-run.

ALTER TABLE lms_admin.questions
    ADD COLUMN IF NOT EXISTS image TEXT;

ALTER TABLE lms_admin.questions
    ADD COLUMN IF NOT EXISTS video TEXT;
