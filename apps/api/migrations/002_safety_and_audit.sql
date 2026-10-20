-- OPT Systems — safety, soft-delete, idempotent sync, audit hardening, biometrics.
-- Builds on 001_init.sql. Requires PostgreSQL.
--   psql "$DATABASE_URL" -f migrations/002_safety_and_audit.sql
--
-- Driven by Ryan's brief (2026-08-21):
--   * "build in all contingencies for security, deleting users, jobs etc"
--   * "different organisations, full admin tracking"
--   * "Face should be the only way in" (face-only clock-in, no PIN/QR)
-- The theme: nothing is ever hard-deleted, every mutation is auditable, offline
-- events replay idempotently, and biometric data is consent-gated and erasable.

-- ===========================================================================
-- 1. Soft-delete correctness
-- ---------------------------------------------------------------------------
-- 001 declared UNIQUE (tenant_id, email) and UNIQUE (tenant_id, job_number).
-- Those block re-using an identifier after a user/job is archived, which breaks
-- "archive then recreate". Replace the blanket uniqueness with a PARTIAL unique
-- index that only applies to LIVE (non-archived) rows.
-- ===========================================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_live_email
  ON users(tenant_id, lower(email))
  WHERE archived_at IS NULL;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_tenant_id_job_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_live_number
  ON jobs(tenant_id, job_number)
  WHERE archived_at IS NULL;

-- Clients and workshops get the same live-only guard so a name can be reused
-- after archiving.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_live_name
  ON clients(tenant_id, lower(name))
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workshops_live_name
  ON workshops(tenant_id, lower(name))
  WHERE archived_at IS NULL;

-- Track who archived a record and when so an admin can be held to the action.
ALTER TABLE users     ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE jobs      ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- ===========================================================================
-- 2. Referential safety on time entries
-- ---------------------------------------------------------------------------
-- 001 set time_entries.user_id ... ON DELETE CASCADE. We never hard-delete a
-- user (we archive), but as a belt-and-braces guard against an accidental hard
-- delete wiping worked-time history, switch to RESTRICT: the DB refuses to drop
-- a user who has recorded time. Job link already uses ON DELETE SET NULL, which
-- is correct — losing the job pointer must not lose the worked hours.
-- ===========================================================================
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_user_id_fkey;
ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- A clock-out must never precede its clock-in.
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS chk_time_entries_order;
ALTER TABLE time_entries
  ADD CONSTRAINT chk_time_entries_order
  CHECK (clock_out IS NULL OR clock_out >= clock_in);

-- Manual (retrospective) entries must record who logged them, for the report flag.
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS chk_time_entries_manual_actor;
ALTER TABLE time_entries
  ADD CONSTRAINT chk_time_entries_manual_actor
  CHECK (manual = false OR created_by IS NOT NULL);

-- ===========================================================================
-- 3. Idempotent offline sync
-- ---------------------------------------------------------------------------
-- The kiosk queues clock events in IndexedDB while offline, each tagged with a
-- client-generated UUID, then replays them on reconnect. Give time_entries a
-- client_event_id that is unique per tenant so a replayed batch UPSERTs instead
-- of double-logging. Server ingest: INSERT ... ON CONFLICT (tenant_id,
-- client_event_id) DO UPDATE.
-- ===========================================================================
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS client_event_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_client_event
  ON time_entries(tenant_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

-- Raw device event log — the append-only source of truth the kiosk syncs up.
-- Each row is one queued action; unique per device+client id makes replay safe.
CREATE TABLE IF NOT EXISTS sync_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  screen_id        uuid REFERENCES screens(id) ON DELETE SET NULL,
  client_event_id  uuid NOT NULL,
  kind             text NOT NULL,          -- clock-in | clock-out | job-on | job-off
  user_id          uuid REFERENCES users(id) ON DELETE RESTRICT,
  job_id           uuid REFERENCES jobs(id) ON DELETE SET NULL,
  occurred_at      timestamptz NOT NULL,   -- when it happened on the device
  received_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_event_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_events_tenant_time ON sync_events(tenant_id, occurred_at DESC);

-- ===========================================================================
-- 4. Append-only audit trail (full admin tracking)
-- ---------------------------------------------------------------------------
-- activity_log is the record of who created/edited/archived what. It must be
-- tamper-evident: no UPDATE, no DELETE, ever. Enforce at the DB so even a
-- compromised app role cannot rewrite history.
-- ===========================================================================
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS actor_role user_role;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip inet;

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_log_no_update ON activity_log;
CREATE TRIGGER trg_activity_log_no_update
  BEFORE UPDATE OR DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ===========================================================================
-- 5. Biometric enrolment (face-only clock-in) with GDPR guardrails
-- ---------------------------------------------------------------------------
-- Face is now the ONLY clock-in method. Store the on-device face EMBEDDING (a
-- maths vector), never a raw image. Consent is explicit and timestamped;
-- right-to-erasure is a soft archive that also blanks the template bytes.
-- Face recognition can be toggled per organisation.
-- ===========================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS face_recognition_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS face_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Encrypted embedding vector (app encrypts before insert). NEVER a photo.
  template        bytea,
  algo            text NOT NULL DEFAULT 'face-api/128d',
  consent_at      timestamptz NOT NULL,     -- explicit opt-in, timestamped
  consent_text    text NOT NULL,            -- exact wording the user agreed to
  archived_at     timestamptz,              -- right-to-erasure (also blanks template)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- One live template per user; re-enrolment archives the old one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_templates_live_user
  ON face_templates(tenant_id, user_id)
  WHERE archived_at IS NULL;

-- ===========================================================================
-- 6. updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','users','workshops','clients','jobs','screens','time_entries','face_templates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION touch_updated_at();',
      t
    );
  END LOOP;
END $$;
