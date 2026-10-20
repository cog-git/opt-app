import type { FastifyInstance } from 'fastify';
import { listActivity } from '../repos/activity.js';

export async function activityRoutes(app: FastifyInstance) {
  app.get('/activity', { preHandler: app.authenticate }, async (req, reply) => {
    return reply.send({ activity: await listActivity(app.db, req.user.tenantId) });
  });
}
