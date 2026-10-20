/** Domain types mirroring the multi-tenant Postgres schema (migrations/001_init.sql). */

export type TenantTier = 'clockin' | 'production';
export type TenantStatus = 'active' | 'paused' | 'locked';
export type UserRole = 'owner' | 'admin' | 'officer' | 'staff';
export type JobStatus = 'active' | 'complete';
export type ScheduleStatus = 'active' | 'inactive';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TaskStatus = 'active' | 'inactive';

export interface Tenant {
  id: string;
  org: string;
  subdomain: string;
  tier: TenantTier;
  status: TenantStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  isPlatformAdmin: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  reference: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  tenantId: string;
  clientId: string | null;
  workshopId: string | null;
  jobNumber: string;
  title: string;
  status: JobStatus;
  allocatedMinutes: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One working day within a schedule. Times are "HH:MM" (24h). */
export interface ScheduleDay {
  start: string;
  end: string;
  breakMinutes: number;
}

/** Weekly shift template: a time band + break allowance per weekday. */
export interface Schedule {
  id: string;
  tenantId: string;
  name: string;
  status: ScheduleStatus;
  days: Partial<Record<Weekday, ScheduleDay>>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A physical/logical shop floor within a tenant; jobs and screens belong to one. */
export interface Workshop {
  id: string;
  tenantId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A kiosk device registered to a tenant, optionally tied to a workshop. */
export interface Screen {
  id: string;
  tenantId: string;
  workshopId: string | null;
  name: string;
  deviceToken: string;
  lastSeenAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A non-job task staff can clock onto (e.g. housekeeping, admin). */
export interface Task {
  id: string;
  tenantId: string;
  name: string;
  status: TaskStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  tenantId: string;
  userId: string;
  jobId: string | null;
  workshopId: string | null;
  clockIn: string;
  clockOut: string | null;
  manual: boolean;
  createdBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorRole: UserRole | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: unknown;
  createdAt: string;
}

/** User without the password hash — the only shape that leaves the API. */
export type PublicUser = Omit<User, 'passwordHash'>;

/** Claims carried in the signed JWT. */
export interface JwtClaims {
  sub: string; // user id
  tenantId: string;
  role: UserRole;
  isPlatformAdmin: boolean;
}
