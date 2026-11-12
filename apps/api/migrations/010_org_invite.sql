-- OPT Systems — organisation main contact + first-login invite.
-- "New organisation" now takes a main contact name/email. Creating an org
-- also creates its owner user as a pending invite (no password yet, a random
-- token instead) and emails them a link to set one. Builds on 001 (tenants,
-- users) and 003 (roles).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text;

-- A freshly invited owner has no password until they accept the invite, so
-- password_hash must allow NULL for that pending window.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_invite_token
  ON users(invite_token) WHERE invite_token IS NOT NULL;
