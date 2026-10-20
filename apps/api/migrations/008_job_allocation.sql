-- OPT Systems — allocated time budget per job.
-- The job detail compares hours logged (from time_entries) against an allocation
-- so managers can see a job's "health". Stored as minutes for the same integer
-- precision the time entries use. Existing jobs default to 0 (no budget set).

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS allocated_minutes integer NOT NULL DEFAULT 0;
