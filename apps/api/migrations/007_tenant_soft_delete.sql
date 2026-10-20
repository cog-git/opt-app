-- OPT Systems — soft-delete for organisations.
-- Consistent with 002's principle that nothing is ever hard-deleted: removing a
-- company sets archived_at instead of dropping the row (a hard delete would also
-- fight the append-only activity_log trigger via ON DELETE CASCADE). Archived
-- tenants are hidden from the console and can no longer authenticate.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tenants_live ON tenants(org) WHERE archived_at IS NULL;
