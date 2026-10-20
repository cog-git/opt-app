-- ---------------------------------------------------------------------------
-- Soft-delete for time entries.
--
-- The system never hard-deletes records with history (see 002). Manual time
-- entries logged in error must still be removable, so we archive rather than
-- delete: keep the row, stamp who removed it and when, and hide archived rows
-- from the default listing. This preserves the audit trail while letting
-- officers correct mistakes.
-- ---------------------------------------------------------------------------

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL;
