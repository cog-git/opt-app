-- Schedules — reusable weekly shift templates (per-day start/end + breaks).
-- Mirrors the legacy "Schedules" feature: office admin defines named shifts
-- with a time band for each weekday and a break allowance, from which weekly
-- and break-hour totals are derived.

CREATE TYPE schedule_status AS ENUM ('active', 'inactive');

CREATE TABLE schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  status      schedule_status NOT NULL DEFAULT 'active',
  -- Object keyed by weekday (mon..sun); each present day is
  -- { start: "HH:MM", end: "HH:MM", breakMinutes: int }. Absent = day off.
  days        jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_schedules_tenant ON schedules(tenant_id) WHERE archived_at IS NULL;
