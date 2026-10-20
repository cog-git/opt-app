import type { Queryable } from '../db.js';
import type { TimeEntry } from '../types.js';
import { mapTimeEntry } from './mappers.js';

/** Time entries in a tenant, most recent clock-in first. Archived rows hidden. */
export async function listTimeEntries(
  db: Queryable,
  tenantId: string,
  limit = 200,
): Promise<TimeEntry[]> {
  const { rows } = await db.query(
    `SELECT * FROM time_entries
      WHERE tenant_id = $1
        AND archived_at IS NULL
      ORDER BY clock_in DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows.map(mapTimeEntry);
}

/** A single, non-archived time entry scoped to its tenant, or null. */
export async function getTimeEntry(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<TimeEntry | null> {
  const { rows } = await db.query(
    `SELECT * FROM time_entries
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] ? mapTimeEntry(rows[0]) : null;
}

export interface UpdateTimeEntryInput {
  jobId?: string | null;
  workshopId?: string | null;
  clockIn: string;
  clockOut?: string | null;
}

/** Adjust an existing entry's job, workshop and clock times. */
export async function updateTimeEntry(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateTimeEntryInput,
): Promise<TimeEntry | null> {
  const { rows } = await db.query(
    `UPDATE time_entries
       SET job_id = $3, workshop_id = $4, clock_in = $5, clock_out = $6, updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
     RETURNING *`,
    [tenantId, id, input.jobId ?? null, input.workshopId ?? null, input.clockIn, input.clockOut ?? null],
  );
  return rows[0] ? mapTimeEntry(rows[0]) : null;
}

/** Soft-delete: stamp who archived the entry and when, keeping the row. */
export async function archiveTimeEntry(
  db: Queryable,
  tenantId: string,
  id: string,
  archivedBy: string,
): Promise<TimeEntry | null> {
  const { rows } = await db.query(
    `UPDATE time_entries
       SET archived_at = now(), archived_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
     RETURNING *`,
    [tenantId, id, archivedBy],
  );
  return rows[0] ? mapTimeEntry(rows[0]) : null;
}

export interface CreateManualEntryInput {
  userId: string;
  jobId?: string | null;
  workshopId?: string | null;
  clockIn: string;
  clockOut?: string | null;
  createdBy: string;
}

/**
 * Retrospective (manual) time entry logged by an officer. The DB CHECK requires
 * manual entries to carry created_by, so it is mandatory here.
 */
export async function createManualEntry(
  db: Queryable,
  tenantId: string,
  input: CreateManualEntryInput,
): Promise<TimeEntry> {
  const { rows } = await db.query(
    `INSERT INTO time_entries
       (tenant_id, user_id, job_id, workshop_id, clock_in, clock_out, manual, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7)
     RETURNING *`,
    [
      tenantId,
      input.userId,
      input.jobId ?? null,
      input.workshopId ?? null,
      input.clockIn,
      input.clockOut ?? null,
      input.createdBy,
    ],
  );
  return mapTimeEntry(rows[0]);
}
