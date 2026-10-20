import type { Queryable } from '../db.js';
import type { Job, JobStatus } from '../types.js';
import { mapJob } from './mappers.js';

/** Jobs in a tenant, newest first. Live only unless includeArchived is set. */
export async function listJobs(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<Job[]> {
  const { rows } = await db.query(
    `SELECT * FROM jobs
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapJob);
}

export async function getJob(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Job | null> {
  const { rows } = await db.query(
    `SELECT * FROM jobs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

export interface CreateJobInput {
  jobNumber: string;
  title: string;
  clientId?: string | null;
  workshopId?: string | null;
  allocatedMinutes?: number;
}

export async function createJob(
  db: Queryable,
  tenantId: string,
  input: CreateJobInput,
): Promise<Job> {
  const { rows } = await db.query(
    `INSERT INTO jobs (tenant_id, job_number, title, client_id, workshop_id, allocated_minutes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      input.jobNumber.trim(),
      input.title.trim(),
      input.clientId ?? null,
      input.workshopId ?? null,
      Math.max(0, Math.round(input.allocatedMinutes ?? 0)),
    ],
  );
  return mapJob(rows[0]);
}

export interface UpdateJobInput {
  title?: string;
  status?: JobStatus;
  /** Reassign (or clear) the workshop. Only written when setWorkshopId is true. */
  workshopId?: string | null;
  /** Distinguishes "leave workshop unchanged" from "set workshop to null". */
  setWorkshopId?: boolean;
  allocatedMinutes?: number;
}

export async function updateJob(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateJobInput,
): Promise<Job | null> {
  const { rows } = await db.query(
    `UPDATE jobs
        SET title             = COALESCE($3, title),
            status            = COALESCE($4::job_status, status),
            workshop_id       = CASE WHEN $5 THEN $6 ELSE workshop_id END,
            allocated_minutes = COALESCE($7, allocated_minutes)
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [
      tenantId,
      id,
      input.title ?? null,
      input.status ?? null,
      input.setWorkshopId ?? false,
      input.workshopId ?? null,
      input.allocatedMinutes == null ? null : Math.max(0, Math.round(input.allocatedMinutes)),
    ],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

export interface JobStaffMinutes {
  userId: string;
  displayName: string;
  minutes: number;
}
export interface JobDayMinutes {
  userId: string;
  day: string; // YYYY-MM-DD
  minutes: number;
}
export interface JobTimeSummary {
  loggedMinutes: number;
  staff: JobStaffMinutes[];
  timeline: JobDayMinutes[];
}

/**
 * Aggregate logged time on a job from its clock-in records. Only closed entries
 * (clock_out present) count towards totals. Returns per-staff totals and a
 * per-staff-per-day breakdown for the team timeline. Open shifts are ignored so
 * the numbers don't drift while someone is still clocked in.
 */
export async function jobTimeSummary(
  db: Queryable,
  tenantId: string,
  jobId: string,
): Promise<JobTimeSummary> {
  const { rows } = await db.query(
    `SELECT te.user_id,
            u.display_name,
            date_trunc('day', te.clock_in)::date AS day,
            EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 60 AS minutes
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
      WHERE te.tenant_id = $1
        AND te.job_id = $2
        AND te.archived_at IS NULL
        AND te.clock_out IS NOT NULL`,
    [tenantId, jobId],
  );

  const staffMap = new Map<string, JobStaffMinutes>();
  const dayMap = new Map<string, JobDayMinutes>();
  let loggedMinutes = 0;

  for (const r of rows) {
    const userId = String(r.user_id);
    const displayName = String(r.display_name ?? '');
    const day = String(r.day).slice(0, 10);
    const minutes = Math.max(0, Math.round(Number(r.minutes ?? 0)));
    loggedMinutes += minutes;

    const s = staffMap.get(userId) ?? { userId, displayName, minutes: 0 };
    s.minutes += minutes;
    staffMap.set(userId, s);

    const key = `${userId}|${day}`;
    const d = dayMap.get(key) ?? { userId, day, minutes: 0 };
    d.minutes += minutes;
    dayMap.set(key, d);
  }

  return {
    loggedMinutes,
    staff: [...staffMap.values()].sort((a, b) => b.minutes - a.minutes),
    timeline: [...dayMap.values()],
  };
}

export async function archiveJob(
  db: Queryable,
  tenantId: string,
  id: string,
  archivedBy: string | null,
): Promise<Job | null> {
  const { rows } = await db.query(
    `UPDATE jobs
        SET archived_at = now(), archived_by = $3
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, archivedBy],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function restoreJob(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Job | null> {
  const { rows } = await db.query(
    `UPDATE jobs
        SET archived_at = NULL, archived_by = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}
