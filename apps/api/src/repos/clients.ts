import type { Queryable } from '../db.js';
import type { Client } from '../types.js';
import { mapClient } from './mappers.js';

/** Clients in a tenant, newest first. Live only unless includeArchived is set. */
export async function listClients(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<Client[]> {
  const { rows } = await db.query(
    `SELECT * FROM clients
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapClient);
}

export async function getClient(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Client | null> {
  const { rows } = await db.query(
    `SELECT * FROM clients WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapClient(rows[0]) : null;
}

export interface CreateClientInput {
  name: string;
  reference?: string | null;
}

export async function createClient(
  db: Queryable,
  tenantId: string,
  input: CreateClientInput,
): Promise<Client> {
  const reference = input.reference?.trim() || null;
  const { rows } = await db.query(
    `INSERT INTO clients (tenant_id, name, reference)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [tenantId, input.name.trim(), reference],
  );
  return mapClient(rows[0]);
}

export interface UpdateClientInput {
  name?: string;
  reference?: string | null;
}

export async function updateClient(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateClientInput,
): Promise<Client | null> {
  const reference = input.reference === undefined ? null : input.reference?.trim() || null;
  const { rows } = await db.query(
    `UPDATE clients
        SET name      = COALESCE($3, name),
            reference = CASE WHEN $4::boolean THEN $5 ELSE reference END
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, input.name?.trim() ?? null, input.reference !== undefined, reference],
  );
  return rows[0] ? mapClient(rows[0]) : null;
}

export async function archiveClient(
  db: Queryable,
  tenantId: string,
  id: string,
  archivedBy: string | null,
): Promise<Client | null> {
  const { rows } = await db.query(
    `UPDATE clients
        SET archived_at = now(), archived_by = $3
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, archivedBy],
  );
  return rows[0] ? mapClient(rows[0]) : null;
}

export async function restoreClient(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Client | null> {
  const { rows } = await db.query(
    `UPDATE clients
        SET archived_at = NULL, archived_by = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapClient(rows[0]) : null;
}
