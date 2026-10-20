-- OPT Systems — initial multi-tenant schema.
-- Requires PostgreSQL. Run against a fresh database:
--   psql "$DATABASE_URL" -f migrations/001_init.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE tenant_tier   AS ENUM ('clockin', 'production');
CREATE TYPE tenant_status AS ENUM ('active', 'paused', 'locked');
CREATE TYPE user_role     AS ENUM ('owner', 'admin', 'officer', 'staff');
CREATE TYPE job_status    AS ENUM ('active', 'complete');

-- ---------------------------------------------------------------------------
-- Tenants (organisations)
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org         text NOT NULL,
  subdomain   text NOT NULL UNIQUE,
  tier        tenant_tier   NOT NULL DEFAULT 'clockin',
  status      tenant_status NOT NULL DEFAULT 'active',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Users (belong to a tenant; soft-deleted via archived_at)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         text NOT NULL,
  display_name  text NOT NULL,
  role          user_role NOT NULL DEFAULT 'staff',
  password_hash text NOT NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Workshops (physical/logical shop floors within a tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE workshops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workshops_tenant ON workshops(tenant_id);

-- ---------------------------------------------------------------------------
-- Clients (optional/nullable-friendly billing counterparties)
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  reference   text,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_tenant ON clients(tenant_id);

-- ---------------------------------------------------------------------------
-- Jobs (client optional; unique job_number per tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  workshop_id uuid REFERENCES workshops(id) ON DELETE SET NULL,
  job_number  text NOT NULL,
  title       text NOT NULL,
  status      job_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_number)
);
CREATE INDEX idx_jobs_tenant_status ON jobs(tenant_id, status) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Screens (kiosk devices, per-tenant, authenticated by device token)
-- ---------------------------------------------------------------------------
CREATE TABLE screens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workshop_id  uuid REFERENCES workshops(id) ON DELETE SET NULL,
  name         text NOT NULL,
  device_token text NOT NULL UNIQUE,
  last_seen_at timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_screens_tenant ON screens(tenant_id);

-- ---------------------------------------------------------------------------
-- Time entries (clock in/out; job optional; supports manual adjustments)
-- ---------------------------------------------------------------------------
CREATE TABLE time_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES jobs(id) ON DELETE SET NULL,
  clock_in    timestamptz NOT NULL,
  clock_out   timestamptz,
  manual      boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_time_entries_user ON time_entries(user_id, clock_in DESC);
CREATE INDEX idx_time_entries_open ON time_entries(tenant_id) WHERE clock_out IS NULL;

-- ---------------------------------------------------------------------------
-- Activity log (audit trail: who did what, when)
-- ---------------------------------------------------------------------------
CREATE TABLE activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_tenant_time ON activity_log(tenant_id, created_at DESC);
