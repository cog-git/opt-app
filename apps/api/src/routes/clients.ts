import type { FastifyInstance } from 'fastify';
import { requireRole } from '../plugins/auth.js';
import {
  archiveClient,
  createClient,
  listClients,
  restoreClient,
  updateClient,
} from '../repos/clients.js';
import { logActivity } from '../repos/activity.js';

interface CreateClientBody {
  name: string;
  reference?: string | null;
}
interface UpdateClientBody {
  name?: string;
  reference?: string | null;
}

// Staff own client records (create/edit); archiving/deleting is officer and above.
const manage = ['owner', 'admin', 'officer', 'staff'] as const;

export async function clientRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/clients',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      return reply.send({ clients: await listClients(app.db, req.user.tenantId, includeArchived) });
    },
  );

  app.post<{ Body: CreateClientBody }>(
    '/clients',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { name } = req.body ?? ({} as CreateClientBody);
      if (!name || !name.trim()) {
        return reply.code(400).send({ error: 'name is required' });
      }
      const client = await createClient(app.db, req.user.tenantId, req.body);
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'client.create',
        entityType: 'client',
        entityId: client.id,
        detail: { name: client.name, reference: client.reference },
      });
      return reply.code(201).send({ client });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateClientBody }>(
    '/clients/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      if (body.name !== undefined && !body.name.trim()) {
        return reply.code(400).send({ error: 'name cannot be empty' });
      }
      const client = await updateClient(app.db, req.user.tenantId, req.params.id, body);
      if (!client) return reply.code(404).send({ error: 'client not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'client.update',
        entityType: 'client',
        entityId: client.id,
        detail: req.body ?? {},
      });
      return reply.send({ client });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/clients/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const client = await archiveClient(app.db, req.user.tenantId, req.params.id, req.user.sub);
      if (!client) return reply.code(404).send({ error: 'client not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'client.archive',
        entityType: 'client',
        entityId: client.id,
      });
      return reply.send({ client });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/clients/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const client = await restoreClient(app.db, req.user.tenantId, req.params.id);
      if (!client) return reply.code(404).send({ error: 'client not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'client.restore',
        entityType: 'client',
        entityId: client.id,
      });
      return reply.send({ client });
    },
  );
}
