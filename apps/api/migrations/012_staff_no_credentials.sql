-- OPT Systems — staff are kiosk-only and never sign in with email/password.
-- The admin "add user" flow stops collecting email/password for the staff
-- role, so both columns need to accept NULL. Postgres allows multiple NULLs
-- under UNIQUE (tenant_id, email), so no constraint change is needed there.

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN password_hash DROP NOT NULL;
