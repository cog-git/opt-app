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
  // Null for staff: they are kiosk-only and never sign in with email/password.
  email: string | null;
  displayName: string;
  role: UserRole;
  passwordHash: string | null;
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
    [tenantId, input.email?.trim() || null, input.displayName.trim(), input.role, input.passwordHash],
  );
  return mapUser(rows[0]);
}

export interface CreateInvitedOwnerInput {
  email: string;
  displayName: string;
  inviteToken: string;
  inviteTokenExpiresAt: Date;
}

/**
 * Creates the owner for a freshly created organisation with no password —
 * they get one by following the invite link emailed to them (see
 * lib/mailer.ts and routes/auth.ts `/auth/accept-invite`). Such a user cannot
 * log in until the invite is accepted (see the login guard on passwordHash).
 */
export async function createInvitedOwner(
  db: Queryable,
  tenantId: string,
  input: CreateInvitedOwnerInput,
): Promise<User> {
  const { rows } = await db.query(
    `INSERT INTO users (tenant_id, email, display_name, role, password_hash, invite_token, invite_token_expires_at)
     VALUES ($1, $2, $3, 'owner'::user_role, NULL, $4, $5)
     RETURNING *`,
    [
      tenantId,
      input.email.trim(),
      input.displayName.trim(),
      input.inviteToken,
      input.inviteTokenExpiresAt.toISOString(),
    ],
  );
  return mapUser(rows[0]);
}

export interface PendingInvite {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  org: string;
  subdomain: string;
}

/** Looks up a not-yet-accepted, not-expired invite by its token, across tenants. */
export async function findInviteByToken(db: Queryable, token: string): Promise<PendingInvite | null> {
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.tenant_id, u.email, u.display_name, t.org, t.subdomain
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.invite_token = $1
        AND u.invite_token_expires_at > now()
        AND u.password_hash IS NULL
        AND u.archived_at IS NULL
        AND t.archived_at IS NULL`,
    [token],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    userId: String(r.user_id),
    tenantId: String(r.tenant_id),
    email: String(r.email),
    displayName: String(r.display_name),
    org: String(r.org),
    subdomain: String(r.subdomain),
  };
}

/** Sets the password for a pending invite and clears the token. */
export async function acceptInvite(
  db: Queryable,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db.query(
    `UPDATE users
        SET password_hash = $2, invite_token = NULL, invite_token_expires_at = NULL, updated_at = now()
      WHERE id = $1 AND password_hash IS NULL`,
    [userId, passwordHash],
  );
}

/** Sets a password-reset token for an existing user (see routes/auth.ts `/auth/forgot-password`). */
export async function setResetToken(
  db: Queryable,
  tenantId: string,
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  await db.query(
    `UPDATE users
        SET reset_token = $3, reset_token_expires_at = $4
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId, token, expiresAt.toISOString()],
  );
}

export interface ResetTokenUser {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  org: string;
  subdomain: string;
}

/** Looks up a not-expired password-reset token by its value, across tenants. */
export async function findUserByResetToken(db: Queryable, token: string): Promise<ResetTokenUser | null> {
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.tenant_id, u.email, u.display_name, t.org, t.subdomain
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.reset_token = $1
        AND u.reset_token_expires_at > now()
        AND u.archived_at IS NULL
        AND t.archived_at IS NULL`,
    [token],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    userId: String(r.user_id),
    tenantId: String(r.tenant_id),
    email: String(r.email),
    displayName: String(r.display_name),
    org: String(r.org),
    subdomain: String(r.subdomain),
  };
}

/** Completes a password reset: sets the new password and clears the token. */
export async function clearResetTokenAndSetPassword(
  db: Queryable,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db.query(
    `UPDATE users
        SET password_hash = $2, reset_token = NULL, reset_token_expires_at = NULL, updated_at = now()
      WHERE id = $1`,
    [userId, passwordHash],
  );
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
