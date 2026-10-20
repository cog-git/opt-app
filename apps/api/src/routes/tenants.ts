import type { FastifyInstance } from 'fastify';
import type { TenantStatus, TenantTier } from '../types.js';
import { requirePlatformAdmin } from '../plugins/auth.js';
import {
  createTenant,
  deleteTenant,
  listTenants,
  restoreTenant,
  updateTenantStatus,
  updateTenantTier,
} from '../repos/tenants.js';
import { logActivity } from '../repos/activity.js';

interface CreateOrgBody {
  org: string;
  subdomain: string;
  tier?: TenantTier;
}

const TIERS: TenantTier[] = ['clockin', 'production'];
const STATUSES: TenantStatus[] = ['active', 'paused', 'locked'];
const SUBDOMAIN_RE = /^[a-z0-9-]+$/;

/**
 * Platform organisation management — the office console's Organisations page.
 * Cross-tenant, so it is restricted to platform admins (the OPT operator), never
 * a single customer's own owner/admin.
 */
export async function tenantRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/orgs',
    { preHandler: [app.authenticate, requirePlatformAdmin()] },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1';
      return reply.send({ orgs: await listTenants(app.db, includeArchived) });
    },
  );

  app.post<{ Body: CreateOrgBody }>(
    '/orgs',
    { preHandler: [app.authenticate, requirePlatformAdmin()] },
    async (req, reply) => {
      const { org, subdomain, tier } = req.body ?? ({} as CreateOrgBody);
      if (!org || !subdomain) {
        return reply.code(400).send({ error: 'org and subdomain are required' });
      }
      if (!SUBDOMAIN_RE.test(subdomain.trim().toLowerCase())) {
        return reply
          .code(400)
          .send({ error: 'subdomain may only contain lowercase letters, numbers and hyphens' });
      }
      if (tier !== undefined && !TIERS.includes(tier)) {
        return reply.code(400).send({ error: 'invalid tier' });
      }
      const tenant = await createTenant(app.db, { org, subdomain, tier });
      await logActivity(app.db, {
        tenantId: tenant.id,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'org.create',
        entityType: 'tenant',
        entityId: tenant.id,
        detail: { org: tenant.org, subdomain: tenant.subdomain },
      });
      return reply.code(201).send({ org: tenant });
    },
  );

  app.patch<{ Params: { id: string }; Body: { tier?: TenantTier; status?: TenantStatus } }>(
    '/orgs/:id',
    { preHandler: [app.authenticate, requirePlatformAdmin()] },
    async (req, reply) => {
      const { tier, status } = req.body ?? {};

      if (status !== undefined) {
        if (!STATUSES.includes(status)) {
          return reply.code(400).send({ error: 'invalid status' });
        }
        if (req.params.id === req.user.tenantId && status !== 'active') {
          return reply.code(409).send({ error: 'you cannot pause your own organisation' });
        }
        const tenant = await updateTenantStatus(app.db, req.params.id, status);
        if (!tenant) {
          return reply.code(404).send({ error: 'organisation not found' });
        }
        await logActivity(app.db, {
          tenantId: tenant.id,
          actorId: req.user.sub,
          actorRole: req.user.role,
          action: 'org.status',
          entityType: 'tenant',
          entityId: tenant.id,
          detail: { org: tenant.org, status: tenant.status },
        });
        return reply.send({ org: tenant });
      }

      if (tier === undefined || !TIERS.includes(tier)) {
        return reply.code(400).send({ error: 'invalid tier' });
      }
      const tenant = await updateTenantTier(app.db, req.params.id, tier);
      if (!tenant) {
        return reply.code(404).send({ error: 'organisation not found' });
      }
      await logActivity(app.db, {
        tenantId: tenant.id,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'org.tier',
        entityType: 'tenant',
        entityId: tenant.id,
        detail: { org: tenant.org, tier: tenant.tier },
      });
      return reply.send({ org: tenant });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/orgs/:id/restore',
    { preHandler: [app.authenticate, requirePlatformAdmin()] },
    async (req, reply) => {
      const tenant = await restoreTenant(app.db, req.params.id);
      if (!tenant) {
        return reply.code(404).send({ error: 'organisation not found or not archived' });
      }
      await logActivity(app.db, {
        tenantId: tenant.id,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'org.restore',
        entityType: 'tenant',
        entityId: tenant.id,
        detail: { org: tenant.org, subdomain: tenant.subdomain },
      });
      return reply.send({ org: tenant });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/orgs/:id',
    { preHandler: [app.authenticate, requirePlatformAdmin()] },
    async (req, reply) => {
      if (req.params.id === req.user.tenantId) {
        return reply.code(409).send({ error: 'you cannot delete your own organisation' });
      }
      const tenant = await deleteTenant(app.db, req.params.id);
      if (!tenant) {
        return reply.code(404).send({ error: 'organisation not found' });
      }
      await logActivity(app.db, {
        tenantId: tenant.id,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'org.delete',
        entityType: 'tenant',
        entityId: tenant.id,
        detail: { org: tenant.org, subdomain: tenant.subdomain },
      });
      return reply.send({ org: tenant });
    },
  );
}
