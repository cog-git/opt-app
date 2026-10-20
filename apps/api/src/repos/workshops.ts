import type { Queryable } from '../db.js';
import type { Workshop } from '../types.js';
import { mapWorkshop } from './mappers.js';

/** Workshops in a tenant, newest first. Live only unless includeArchived is set. */
export async function listWorkshops(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<Workshop[]> {
  const { rows } = await db.query(
    `SELECT * FROM workshops
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapWorkshop);
}

export async function getWorkshop(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Workshop | null> {
  const { rows } = await db.query(
    `SELECT * FROM workshops WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapWorkshop(rows[0]) : null;
}

export interface CreateWorkshopInput {
  name: string;
}

export async function createWorkshop(
  db: Queryable,
  tenantId: string,
  input: CreateWorkshopInput,
): Promise<Workshop> {
  const { rows } = await db.query(
    `INSERT INTO workshops (tenant_id, name)
     VALUES ($1, $2)
     RETURNING *`,
    [tenantId, input.name.trim()],
  );
  return mapWorkshop(rows[0]);
}

export interface UpdateWorkshopInput {
  name?: string;
}

export async function updateWorkshop(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateWorkshopInput,
): Promise<Workshop | null> {
  const { rows } = await db.query(
    `UPDATE workshops
        SET name = COALESCE($3, name),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, input.name?.trim() ?? null],
  );
  return rows[0] ? mapWorkshop(rows[0]) : null;
}

export async function archiveWorkshop(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Workshop | null> {
  const { rows } = await db.query(
    `UPDATE workshops
        SET archived_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapWorkshop(rows[0]) : null;
}

export async function restoreWorkshop(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Workshop | null> {
  const { rows } = await db.query(
    `UPDATE workshops
        SET archived_at = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapWorkshop(rows[0]) : null;
}
