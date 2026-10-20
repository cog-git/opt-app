-- ---------------------------------------------------------------------------
-- Optional workshop on a time entry.
--
-- Manual time entries can now be attributed to a workshop directly, not only
-- inferred via the job. This lets officers log hours against a workshop for
-- work that isn't tied to a specific job, and keeps reporting accurate when a
-- job's workshop differs from where the time was actually spent. Nullable:
-- existing entries and job-inferred reporting are unaffected.
-- ---------------------------------------------------------------------------

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS workshop_id uuid REFERENCES workshops(id) ON DELETE SET NULL;
