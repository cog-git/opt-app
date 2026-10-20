import type { FastifyInstance } from 'fastify';
import { requireRole } from '../plugins/auth.js';
import {
  archiveScreen,
  createScreen,
  listScreens,
  restoreScreen,
  updateScreen,
} from '../repos/screens.js';
import { getWorkshop } from '../repos/workshops.js';
import { logActivity } from '../repos/activity.js';

// Business configuration — admin and above only.
const manage = ['owner', 'admin'] as const;

interface CreateScreenBody {
  name?: string;
  workshopId?: string | null;
}
interface UpdateScreenBody {
  name?: string;
  workshopId?: string | null;
}

/** Reject a workshopId that isn't a live workshop in this tenant. */
async function assertWorkshop(
  app: FastifyInstance,
  tenantId: string,
  workshopId: string | null | undefined,
): Promise<boolean> {
  if (!workshopId) return true;
  const workshop = await getWorkshop(app.db, tenantId, workshopId);
  return Boolean(workshop && !workshop.archivedAt);
}

export async function screenRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/screens',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      return reply.send({
        screens: await listScreens(app.db, req.user.tenantId, includeArchived),
      });
    },
  );

  app.post<{ Body: CreateScreenBody }>(
    '/screens',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { name, workshopId } = req.body ?? {};
      if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });
      if (!(await assertWorkshop(app, req.user.tenantId, workshopId))) {
        return reply.code(400).send({ error: 'invalid workshop' });
      }

      const screen = await createScreen(app.db, req.user.tenantId, { name, workshopId });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'screen.create',
        entityType: 'screen',
        entityId: screen.id,
        detail: { name: screen.name },
      });
      return reply.code(201).send({ screen });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateScreenBody }>(
    '/screens/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      if (!(await assertWorkshop(app, req.user.tenantId, body.workshopId))) {
        return reply.code(400).send({ error: 'invalid workshop' });
      }
      const screen = await updateScreen(app.db, req.user.tenantId, req.params.id, {
        name: body.name,
        workshopId: body.workshopId,
      });
      if (!screen) return reply.code(404).send({ error: 'screen not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'screen.update',
        entityType: 'screen',
        entityId: screen.id,
        detail: { name: screen.name },
      });
      return reply.send({ screen });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/screens/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const screen = await archiveScreen(app.db, req.user.tenantId, req.params.id);
      if (!screen) return reply.code(404).send({ error: 'screen not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'screen.archive',
        entityType: 'screen',
        entityId: screen.id,
      });
      return reply.send({ screen });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/screens/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const screen = await restoreScreen(app.db, req.user.tenantId, req.params.id);
      if (!screen) return reply.code(404).send({ error: 'screen not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'screen.restore',
        entityType: 'screen',
        entityId: screen.id,
      });
      return reply.send({ screen });
    },
  );
}
