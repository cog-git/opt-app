import type { Queryable } from '../db.js';
import type { ActivityEntry, UserRole } from '../types.js';
import { mapActivity } from './mappers.js';

export interface LogActivityInput {
  tenantId: string;
  actorId: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: unknown;
}

/**
 * Append one row to the audit trail. activity_log is DB-enforced append-only
 * (see migration 002), so this is the only write it will ever accept.
 */
export async function logActivity(db: Queryable, input: LogActivityInput): Promise<void> {
  await db.query(
    `INSERT INTO activity_log
       (tenant_id, actor_id, actor_role, action, entity_type, entity_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.tenantId,
      input.actorId,
      input.actorRole ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.detail == null ? null : JSON.stringify(input.detail),
    ],
  );
}

export async function listActivity(
  db: Queryable,
  tenantId: string,
  limit = 100,
): Promise<ActivityEntry[]> {
  const { rows } = await db.query(
    `SELECT * FROM activity_log
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows.map(mapActivity);
}
