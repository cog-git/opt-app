-- OPT Systems — self-service "forgot password" flow.
-- Separate from invite_token (010_org_invite.sql): invite_token's absence of a
-- password_hash is what gates login as "pending invite", so reusing it here
-- would conflate "never had a password" with "forgot an existing one" and
-- could clobber an in-flight invite. reset_token is purely additive — it never
-- touches password_hash until the reset is actually completed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token text,
  ADD COLUMN IF NOT EXISTS reset_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_reset_token
  ON users(reset_token) WHERE reset_token IS NOT NULL;
