import type { Queryable } from '../db.js';
import type { Tenant, TenantStatus, TenantTier } from '../types.js';
import { mapTenant } from './mappers.js';

export async function findTenantBySubdomain(
  db: Queryable,
  subdomain: string,
): Promise<Tenant | null> {
  const { rows } = await db.query(
    `SELECT * FROM tenants WHERE subdomain = $1 AND archived_at IS NULL`,
    [subdomain.toLowerCase()],
  );
  return rows[0] ? mapTenant(rows[0]) : null;
}

export async function getTenant(db: Queryable, id: string): Promise<Tenant | null> {
  const { rows } = await db.query(
    `SELECT * FROM tenants WHERE id = $1 AND archived_at IS NULL`,
    [id],
  );
  return rows[0] ? mapTenant(rows[0]) : null;
}

/**
 * Every organisation on the platform — the office console's org picker. Live
 * only by default; pass includeArchived to also return archived tenants so the
 * console can offer a restore.
 */
export async function listTenants(db: Queryable, includeArchived = false): Promise<Tenant[]> {
  const { rows } = await db.query(
    `SELECT * FROM tenants
      ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY org ASC`,
  );
  return rows.map(mapTenant);
}

export interface CreateTenantInput {
  org: string;
  subdomain: string;
  tier?: TenantTier;
}

export async function createTenant(db: Queryable, input: CreateTenantInput): Promise<Tenant> {
  const { rows } = await db.query(
    `INSERT INTO tenants (org, subdomain, tier)
     VALUES ($1, $2, COALESCE($3, 'clockin')::tenant_tier)
     RETURNING *`,
    [input.org.trim(), input.subdomain.trim().toLowerCase(), input.tier ?? null],
  );
  return mapTenant(rows[0]);
}

export async function updateTenantTier(
  db: Queryable,
  id: string,
  tier: TenantTier,
): Promise<Tenant | null> {
  const { rows } = await db.query(
    `UPDATE tenants SET tier = $2::tenant_tier, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, tier],
  );
  return rows[0] ? mapTenant(rows[0]) : null;
}

/**
 * Flips a live tenant between active and paused (or locked). A paused org stays
 * visible in the console but can no longer authenticate — see the tenant status
 * check in auth. Only touches non-archived rows. Returns the updated row.
 */
export async function updateTenantStatus(
  db: Queryable,
  id: string,
  status: TenantStatus,
): Promise<Tenant | null> {
  const { rows } = await db.query(
    `UPDATE tenants SET status = $2::tenant_status, updated_at = now()
     WHERE id = $1 AND archived_at IS NULL RETURNING *`,
    [id, status],
  );
  return rows[0] ? mapTenant(rows[0]) : null;
}

/**
 * Soft-deletes a tenant by stamping archived_at. The org then disappears from
 * the console and can no longer authenticate, while its rows (and the
 * append-only activity_log) are preserved. Returns the archived row, or null if
 * it did not exist or was already archived.
 */
export async function deleteTenant(db: Queryable, id: string): Promise<Tenant | null> {
  const { rows } = await db.query(
    `UPDATE tenants SET archived_at = now(), updated_at = now()
     WHERE id = $1 AND archived_at IS NULL RETURNING *`,
    [id],
  );
  return rows[0] ? mapTenant(rows[0]) : null;
}

/**
 * Reverses an archive by clearing archived_at, bringing the org back into the
 * console. Only affects rows that are currently archived. Returns the restored
 * row, or null if it did not exist or was already live.
 */
export async function restoreTenant(db: Queryable, id: string): Promise<Tenant | null> {
  const { rows } = await db.query(
    `UPDATE tenants SET archived_at = NULL, updated_at = now()
     WHERE id = $1 AND archived_at IS NOT NULL RETURNING *`,
    [id],
  );
  return rows[0] ? mapTenant(rows[0]) : null;
}
