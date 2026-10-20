import type { Queryable } from '../db.js';
import type { User, UserRole } from '../types.js';
import { mapUser } from './mappers.js';

/** Live (non-archived) user by email, for login. Case-insensitive on email. */
export async function findUserByEmail(
  db: Queryable,
  tenantId: string,
  email: string,
): Promise<User | null> {
  const { rows } = await db.query(
    `SELECT * FROM users
      WHERE tenant_id = $1 AND lower(email) = lower($2) AND archived_at IS NULL`,
    [tenantId, email],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function getUser(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<User | null> {
  const { rows } = await db.query(
    `SELECT * FROM users WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

/** Users in a tenant, newest first. Live only unless includeArchived is set. */
export async function listUsers(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<User[]> {
  const { rows } = await db.query(
    `SELECT * FROM users
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapUser);
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
}

export async function createUser(
  db: Queryable,
  tenantId: string,
  input: CreateUserInput,
): Promise<User> {
  const { rows } = await db.query(
    `INSERT INTO users (tenant_id, email, display_name, role, password_hash)
     VALUES ($1, $2, $3, $4::user_role, $5)
     RETURNING *`,
    [tenantId, input.email.trim(), input.displayName.trim(), input.role, input.passwordHash],
  );
  return mapUser(rows[0]);
}

export interface UpdateUserInput {
  displayName?: string;
  role?: UserRole;
  passwordHash?: string;
}

export async function updateUser(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateUserInput,
): Promise<User | null> {
  const { rows } = await db.query(
    `UPDATE users
        SET display_name  = COALESCE($3, display_name),
            role          = COALESCE($4::user_role, role),
            password_hash = COALESCE($5, password_hash)
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, input.displayName ?? null, input.role ?? null, input.passwordHash ?? null],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

/** Soft-delete: stamp archived_at/by. Never a hard DELETE (worked-time history). */
export async function archiveUser(
  db: Queryable,
  tenantId: string,
  id: string,
  archivedBy: string | null,
): Promise<User | null> {
  const { rows } = await db.query(
    `UPDATE users
        SET archived_at = now(), archived_by = $3
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, archivedBy],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function restoreUser(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<User | null> {
  const { rows } = await db.query(
    `UPDATE users
        SET archived_at = NULL, archived_by = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}
