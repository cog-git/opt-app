import type { FastifyInstance } from 'fastify';
import type { TaskStatus } from '../types.js';
import { requireRole } from '../plugins/auth.js';
import {
  archiveTask,
  createTask,
  listTasks,
  restoreTask,
  updateTask,
} from '../repos/tasks.js';
import { logActivity } from '../repos/activity.js';

// Business configuration — admin and above only.
const manage = ['owner', 'admin'] as const;
const STATUSES: TaskStatus[] = ['active', 'inactive'];

interface CreateTaskBody {
  name?: string;
  status?: TaskStatus;
}
interface UpdateTaskBody {
  name?: string;
  status?: TaskStatus;
}

export async function taskRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/tasks',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      return reply.send({
        tasks: await listTasks(app.db, req.user.tenantId, includeArchived),
      });
    },
  );

  app.post<{ Body: CreateTaskBody }>(
    '/tasks',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { name, status } = req.body ?? {};
      if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });
      if (status !== undefined && !STATUSES.includes(status)) {
        return reply.code(400).send({ error: 'invalid status' });
      }

      const task = await createTask(app.db, req.user.tenantId, { name, status });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'task.create',
        entityType: 'task',
        entityId: task.id,
        detail: { name: task.name },
      });
      return reply.code(201).send({ task });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateTaskBody }>(
    '/tasks/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      if (body.status !== undefined && !STATUSES.includes(body.status)) {
        return reply.code(400).send({ error: 'invalid status' });
      }

      const task = await updateTask(app.db, req.user.tenantId, req.params.id, {
        name: body.name,
        status: body.status,
      });
      if (!task) return reply.code(404).send({ error: 'task not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'task.update',
        entityType: 'task',
        entityId: task.id,
        detail: { name: task.name },
      });
      return reply.send({ task });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/tasks/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const task = await archiveTask(app.db, req.user.tenantId, req.params.id);
      if (!task) return reply.code(404).send({ error: 'task not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'task.archive',
        entityType: 'task',
        entityId: task.id,
      });
      return reply.send({ task });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/tasks/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const task = await restoreTask(app.db, req.user.tenantId, req.params.id);
      if (!task) return reply.code(404).send({ error: 'task not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'task.restore',
        entityType: 'task',
        entityId: task.id,
      });
      return reply.send({ task });
    },
  );
}
