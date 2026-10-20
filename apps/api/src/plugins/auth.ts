import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { UserRole } from '../types.js';
import { getUser } from '../repos/users.js';
import { getTenant } from '../repos/tenants.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler: verifies the bearer JWT, then re-checks that the subject is a
     * live user in an active tenant. 401s if the token is absent/invalid, the
     * user has been archived, or the tenant is no longer active — so a fired
     * employee's outstanding token stops working immediately.
     */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Higher rank = more authority. Used to stop a user granting a role >= their own. */
export const ROLE_RANK: Record<UserRole, number> = {
  owner: 3,
  admin: 2,
  officer: 1,
  staff: 0,
};

export const ALL_ROLES: UserRole[] = ['owner', 'admin', 'officer', 'staff'];

export function isRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (ALL_ROLES as string[]).includes(v);
}

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // Token is valid, but authorisation state can change after issue. Re-check
    // the subject and tenant on every request so archive/lock takes effect at once.
    const user = await getUser(app.db, req.user.tenantId, req.user.sub);
    if (!user || user.archivedAt) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const tenant = await getTenant(app.db, req.user.tenantId);
    if (!tenant || tenant.status !== 'active') {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
});

/**
 * preHandler factory gating a route to specific roles. Runs after `authenticate`,
 * so req.user is populated. Staff are read-only; management verbs pass the
 * writing roles here.
 */
export function requireRole(...roles: UserRole[]) {
  return async function requireRole(req: FastifyRequest, reply: FastifyReply) {
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  };
}

/**
 * preHandler gating a route to platform administrators (the OPT operator running
 * the office console), not merely a tenant's own owner/admin. Guards the
 * cross-tenant Organisations endpoints so one customer can never see or create
 * another customer's organisation.
 */
export function requirePlatformAdmin() {
  return async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply) {
    if (!req.user.isPlatformAdmin) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  };
}
