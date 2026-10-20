import type { Queryable } from '../db.js';
import type { Schedule, ScheduleDay, ScheduleStatus, Weekday } from '../types.js';
import { mapSchedule } from './mappers.js';

export type ScheduleDays = Partial<Record<Weekday, ScheduleDay>>;

/** Schedules in a tenant, newest first. Live only unless includeArchived is set. */
export async function listSchedules(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<Schedule[]> {
  const { rows } = await db.query(
    `SELECT * FROM schedules
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapSchedule);
}

export async function getSchedule(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Schedule | null> {
  const { rows } = await db.query(
    `SELECT * FROM schedules WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapSchedule(rows[0]) : null;
}

export interface CreateScheduleInput {
  name: string;
  status?: ScheduleStatus;
  days: ScheduleDays;
}

export async function createSchedule(
  db: Queryable,
  tenantId: string,
  input: CreateScheduleInput,
): Promise<Schedule> {
  const { rows } = await db.query(
    `INSERT INTO schedules (tenant_id, name, status, days)
     VALUES ($1, $2, $3::schedule_status, $4::jsonb)
     RETURNING *`,
    [tenantId, input.name.trim(), input.status ?? 'active', JSON.stringify(input.days ?? {})],
  );
  return mapSchedule(rows[0]);
}

export interface UpdateScheduleInput {
  name?: string;
  status?: ScheduleStatus;
  days?: ScheduleDays;
}

export async function updateSchedule(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateScheduleInput,
): Promise<Schedule | null> {
  const { rows } = await db.query(
    `UPDATE schedules
        SET name   = COALESCE($3, name),
            status = COALESCE($4::schedule_status, status),
            days   = COALESCE($5::jsonb, days),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [
      tenantId,
      id,
      input.name?.trim() ?? null,
      input.status ?? null,
      input.days === undefined ? null : JSON.stringify(input.days),
    ],
  );
  return rows[0] ? mapSchedule(rows[0]) : null;
}

export async function archiveSchedule(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Schedule | null> {
  const { rows } = await db.query(
    `UPDATE schedules
        SET archived_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapSchedule(rows[0]) : null;
}

export async function restoreSchedule(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Schedule | null> {
  const { rows } = await db.query(
    `UPDATE schedules
        SET archived_at = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapSchedule(rows[0]) : null;
}
