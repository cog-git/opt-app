import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { Screen } from '../types.js';
import { mapScreen } from './mappers.js';

/** Screens (kiosk devices) in a tenant, newest first. Live only unless includeArchived is set. */
export async function listScreens(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<Screen[]> {
  const { rows } = await db.query(
    `SELECT * FROM screens
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapScreen);
}

export async function getScreen(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Screen | null> {
  const { rows } = await db.query(
    `SELECT * FROM screens WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapScreen(rows[0]) : null;
}

export interface CreateScreenInput {
  name: string;
  workshopId?: string | null;
}

/**
 * Register a kiosk device. The device token is generated here (never chosen by
 * the caller) so it is unguessable; the physical kiosk carries this token to
 * authenticate itself to the tenant.
 */
export async function createScreen(
  db: Queryable,
  tenantId: string,
  input: CreateScreenInput,
): Promise<Screen> {
  const deviceToken = `scr_${randomUUID().replace(/-/g, '')}`;
  const { rows } = await db.query(
    `INSERT INTO screens (tenant_id, name, workshop_id, device_token)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [tenantId, input.name.trim(), input.workshopId ?? null, deviceToken],
  );
  return mapScreen(rows[0]);
}

export interface UpdateScreenInput {
  name?: string;
  workshopId?: string | null;
}

/**
 * Rename a screen and/or reassign its workshop. The edit form always submits the
 * current workshop selection ("No workshop" being null), so workshop_id is set
 * outright rather than coalesced.
 */
export async function updateScreen(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateScreenInput,
): Promise<Screen | null> {
  const { rows } = await db.query(
    `UPDATE screens
        SET name = COALESCE($3, name),
            workshop_id = $4,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, input.name?.trim() ?? null, input.workshopId ?? null],
  );
  return rows[0] ? mapScreen(rows[0]) : null;
}

export async function archiveScreen(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Screen | null> {
  const { rows } = await db.query(
    `UPDATE screens
        SET archived_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapScreen(rows[0]) : null;
}

export async function restoreScreen(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Screen | null> {
  const { rows } = await db.query(
    `UPDATE screens
        SET archived_at = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapScreen(rows[0]) : null;
}
