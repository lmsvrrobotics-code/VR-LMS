-- =============================================================================
-- Migration: Assignment attachments
-- File 21: let a teacher attach links / PDFs / images to an assignment
-- =============================================================================
--
-- `assignments.file_url` only ever held ONE value, which cannot represent the
-- common case of "here is the worksheet PDF, the reference image, and a link
-- to the video". `attachments` stores an ordered list instead:
--
--   [{ "kind": "file" | "link",
--      "url":   "https://…",
--      "name":  "worksheet.pdf",
--      "mime":  "application/pdf" }]
--
-- file_url is left in place (unused by new writes) so existing rows and any
-- older client keep working.
--
-- Idempotent: safe to re-run.

ALTER TABLE lms_admin.assignments
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

COMMENT ON COLUMN lms_admin.assignments.attachments IS
  'Ordered list of {kind,url,name,mime} attachments (links + uploaded files).';

-- Heading the teacher gives the resource block, e.g. "Reference material" or
-- "Read these before class". Falls back to "Reference material" when unset.
ALTER TABLE lms_admin.assignments
  ADD COLUMN IF NOT EXISTS attachments_title VARCHAR(200) DEFAULT NULL;

COMMENT ON COLUMN lms_admin.assignments.attachments_title IS
  'Teacher-supplied heading for the attachments block.';
