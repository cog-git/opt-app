-- OPT Systems — platform administrators.
-- Builds on 001/002. Requires PostgreSQL.
--   psql "$DATABASE_URL" -f migrations/003_platform_admin.sql
--
-- The office console has a cross-tenant Organisations view (list/create every
-- organisation on the platform). That must be reserved for the OPT operator, not
-- a customer's own owner/admin — otherwise one tenant can enumerate and create
-- others. Mark platform operators explicitly; everyone else defaults to false.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
