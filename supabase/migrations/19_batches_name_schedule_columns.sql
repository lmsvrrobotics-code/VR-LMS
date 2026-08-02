-- =============================================================================
-- Migration 19: give lms_admin.batches the columns the Add Batch form writes
-- =============================================================================
-- Two batch systems share this table and disagree about its shape:
--
--   BatchNewService  (Batches → Add Batch: Course + Teacher + Students)
--       writes unique_id / course_id / primary_teacher_id / display_name
--       -> matches the table as it exists today.
--
--   BatchService     (College → Manage Batches "Add New Batch":
--                     Batch Name / Status / Description / Start Date / Students)
--       writes id / name / description / start_date / end_date / is_active
--       -> NONE of those columns existed, so every create died with
--          `column Batch.name does not exist` (surfacing as a 500), and the
--          stale validator's `course_id` requirement 400'd before that.
--
-- This migration adds the second system's columns so both can coexist. It is
-- additive only: no existing column is dropped or retyped, so BatchNewService
-- keeps working unchanged.
--
-- Safe to run: lms_admin.batches is empty at authoring time, and every step is
-- guarded, so re-running is a no-op.
-- =============================================================================

-- Step 1: surrogate integer key. BatchService addresses batches by a numeric
-- `id` (Batch.findOne({where:{id}}), and batch_members.batch_id casts to
-- Number), while the table's primary key is the varchar unique_id that
-- BatchNewService generates. Add `id` alongside rather than replacing the PK —
-- swapping the PK would break BatchNewService and batch_members' varchar FKs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='lms_admin' AND table_name='batches' AND column_name='id'
  ) THEN
    ALTER TABLE lms_admin.batches ADD COLUMN id SERIAL;
    CREATE UNIQUE INDEX IF NOT EXISTS batches_id_key ON lms_admin.batches (id);
  END IF;
END $$;

-- Step 2: the Add Batch form's own fields.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='lms_admin' AND table_name='batches' AND column_name='name') THEN
    ALTER TABLE lms_admin.batches ADD COLUMN name VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='lms_admin' AND table_name='batches' AND column_name='description') THEN
    ALTER TABLE lms_admin.batches ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='lms_admin' AND table_name='batches' AND column_name='start_date') THEN
    ALTER TABLE lms_admin.batches ADD COLUMN start_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='lms_admin' AND table_name='batches' AND column_name='end_date') THEN
    ALTER TABLE lms_admin.batches ADD COLUMN end_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='lms_admin' AND table_name='batches' AND column_name='is_active') THEN
    ALTER TABLE lms_admin.batches ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- Step 3: unique_id is the primary key and NOT NULL, but a BatchService-created
-- batch has no course/teacher to build one from. Default it so those inserts
-- don't violate the PK. BatchNewService always supplies its own value, so this
-- default never applies to it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='lms_admin' AND table_name='batches'
       AND column_name='unique_id' AND column_default IS NULL
  ) THEN
    ALTER TABLE lms_admin.batches
      ALTER COLUMN unique_id SET DEFAULT ('BATCH_' || to_char(NOW(),'YYMMDD') || '_' || substr(md5(random()::text), 1, 6));
  END IF;
END $$;

-- Step 4: BatchService creates batches with no course or teacher (they're
-- attached later), so these must be nullable. They are already nullable in the
-- live table — the NOT NULL lives only in the Sequelize model — but assert it
-- so a fresh database built from the base schema doesn't reintroduce it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='lms_admin' AND table_name='batches'
                AND column_name='course_id' AND is_nullable='NO') THEN
    ALTER TABLE lms_admin.batches ALTER COLUMN course_id DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='lms_admin' AND table_name='batches'
                AND column_name='primary_teacher_id' AND is_nullable='NO') THEN
    ALTER TABLE lms_admin.batches ALTER COLUMN primary_teacher_id DROP NOT NULL;
  END IF;
END $$;

-- Step 5: lookup index for the per-college list + duplicate-name check
-- (SELECT ... WHERE clg_id = ? AND name = ?).
CREATE INDEX IF NOT EXISTS batches_clg_name_idx ON lms_admin.batches (clg_id, name);
