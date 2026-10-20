import type {
  ActivityEntry,
  Client,
  Job,
  JobStatus,
  PublicUser,
  Schedule,
  ScheduleStatus,
  Screen,
  Task,
  TaskStatus,
  Tenant,
  TenantStatus,
  TenantTier,
  TimeEntry,
  User,
  UserRole,
  Weekday,
  Workshop,
  ScheduleDay,
} from '../types.js';

// Drivers already hand back timestamptz as ISO strings (see db.ts type parsers /
// PGlite defaults), so mapping is just snake_case -> camelCase with null-safety.
type Row = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function mapTenant(r: Row): Tenant {
  return {
    id: str(r.id),
    org: str(r.org),
    subdomain: str(r.subdomain),
    tier: str(r.tier) as TenantTier,
    status: str(r.status) as TenantStatus,
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapUser(r: Row): User {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    email: str(r.email),
    displayName: str(r.display_name),
    role: str(r.role) as UserRole,
    passwordHash: str(r.password_hash),
    isPlatformAdmin: Boolean(r.is_platform_admin),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function toPublicUser(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

export function mapClient(r: Row): Client {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    name: str(r.name),
    reference: strOrNull(r.reference),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapJob(r: Row): Job {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    clientId: strOrNull(r.client_id),
    workshopId: strOrNull(r.workshop_id),
    jobNumber: str(r.job_number),
    title: str(r.title),
    status: str(r.status) as JobStatus,
    allocatedMinutes: Number(r.allocated_minutes ?? 0),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function mapScheduleDays(v: unknown): Partial<Record<Weekday, ScheduleDay>> {
  const raw = typeof v === 'string' ? safeParse(v) : v;
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<Weekday, ScheduleDay>> = {};
  for (const day of WEEKDAYS) {
    const d = src[day];
    if (!d || typeof d !== 'object') continue;
    const { start, end, breakMinutes } = d as Record<string, unknown>;
    if (typeof start !== 'string' || typeof end !== 'string') continue;
    out[day] = { start, end, breakMinutes: Number(breakMinutes) || 0 };
  }
  return out;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function mapSchedule(r: Row): Schedule {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    name: str(r.name),
    status: str(r.status) as ScheduleStatus,
    days: mapScheduleDays(r.days),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapTask(r: Row): Task {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    name: str(r.name),
    status: str(r.status) as TaskStatus,
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapWorkshop(r: Row): Workshop {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    name: str(r.name),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapScreen(r: Row): Screen {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    workshopId: strOrNull(r.workshop_id),
    name: str(r.name),
    deviceToken: str(r.device_token),
    lastSeenAt: strOrNull(r.last_seen_at),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapTimeEntry(r: Row): TimeEntry {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    userId: str(r.user_id),
    jobId: strOrNull(r.job_id),
    workshopId: strOrNull(r.workshop_id),
    clockIn: str(r.clock_in),
    clockOut: strOrNull(r.clock_out),
    manual: Boolean(r.manual),
    createdBy: strOrNull(r.created_by),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapActivity(r: Row): ActivityEntry {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    actorId: strOrNull(r.actor_id),
    actorRole: (strOrNull(r.actor_role) as UserRole | null) ?? null,
    action: str(r.action),
    entityType: strOrNull(r.entity_type),
    entityId: strOrNull(r.entity_id),
    detail: r.detail ?? null,
    createdAt: str(r.created_at),
  };
}
