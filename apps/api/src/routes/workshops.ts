import type { FastifyInstance } from 'fastify';
import { requireRole } from '../plugins/auth.js';
import {
  archiveWorkshop,
  createWorkshop,
  listWorkshops,
  restoreWorkshop,
  updateWorkshop,
} from '../repos/workshops.js';
import { logActivity } from '../repos/activity.js';

// Business configuration — admin and above only. Officers and staff do not
// reshape the shop's workshops.
const manage = ['owner', 'admin'] as const;

interface CreateWorkshopBody {
  name?: string;
}
interface UpdateWorkshopBody {
  name?: string;
}

export async function workshopRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/workshops',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      return reply.send({
        workshops: await listWorkshops(app.db, req.user.tenantId, includeArchived),
      });
    },
  );

  app.post<{ Body: CreateWorkshopBody }>(
    '/workshops',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { name } = req.body ?? {};
      if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });

      const workshop = await createWorkshop(app.db, req.user.tenantId, { name });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'workshop.create',
        entityType: 'workshop',
        entityId: workshop.id,
        detail: { name: workshop.name },
      });
      return reply.code(201).send({ workshop });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateWorkshopBody }>(
    '/workshops/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      const workshop = await updateWorkshop(app.db, req.user.tenantId, req.params.id, {
        name: body.name,
      });
      if (!workshop) return reply.code(404).send({ error: 'workshop not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'workshop.update',
        entityType: 'workshop',
        entityId: workshop.id,
        detail: { name: workshop.name },
      });
      return reply.send({ workshop });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/workshops/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const workshop = await archiveWorkshop(app.db, req.user.tenantId, req.params.id);
      if (!workshop) return reply.code(404).send({ error: 'workshop not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'workshop.archive',
        entityType: 'workshop',
        entityId: workshop.id,
      });
      return reply.send({ workshop });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/workshops/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const workshop = await restoreWorkshop(app.db, req.user.tenantId, req.params.id);
      if (!workshop) return reply.code(404).send({ error: 'workshop not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'workshop.restore',
        entityType: 'workshop',
        entityId: workshop.id,
      });
      return reply.send({ workshop });
    },
  );
}
