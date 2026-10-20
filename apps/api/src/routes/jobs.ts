import type { FastifyInstance } from 'fastify';
import type { JobStatus } from '../types.js';
import { requireRole } from '../plugins/auth.js';
import { archiveJob, createJob, getJob, jobTimeSummary, listJobs, restoreJob, updateJob } from '../repos/jobs.js';
import { getWorkshop } from '../repos/workshops.js';
import { logActivity } from '../repos/activity.js';

interface CreateJobBody {
  jobNumber: string;
  title: string;
  clientId?: string | null;
  workshopId?: string | null;
  allocatedMinutes?: number;
}
interface UpdateJobBody {
  title?: string;
  status?: JobStatus;
  workshopId?: string | null;
  allocatedMinutes?: number;
}

// Staff own the day-to-day job records (create/edit); archiving and deleting
// is reserved for officer and above.
const manage = ['owner', 'admin', 'officer', 'staff'] as const;
const JOB_STATUSES: JobStatus[] = ['active', 'complete'];

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

export async function jobRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/jobs',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      return reply.send({ jobs: await listJobs(app.db, req.user.tenantId, includeArchived) });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/jobs/:id/time-summary',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const job = await getJob(app.db, req.user.tenantId, req.params.id);
      if (!job) return reply.code(404).send({ error: 'job not found' });
      const summary = await jobTimeSummary(app.db, req.user.tenantId, req.params.id);
      return reply.send({ summary });
    },
  );

  app.post<{ Body: CreateJobBody }>(
    '/jobs',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { jobNumber, title, workshopId } = req.body ?? ({} as CreateJobBody);
      if (!jobNumber || !title) {
        return reply.code(400).send({ error: 'jobNumber and title are required' });
      }
      if (!(await assertWorkshop(app, req.user.tenantId, workshopId))) {
        return reply.code(400).send({ error: 'invalid workshop' });
      }
      const job = await createJob(app.db, req.user.tenantId, req.body);
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'job.create',
        entityType: 'job',
        entityId: job.id,
        detail: { jobNumber: job.jobNumber, title: job.title },
      });
      return reply.code(201).send({ job });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateJobBody }>(
    '/jobs/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      if (body.status !== undefined && !JOB_STATUSES.includes(body.status)) {
        return reply.code(400).send({ error: 'invalid status' });
      }
      const setWorkshopId = Object.prototype.hasOwnProperty.call(body, 'workshopId');
      if (setWorkshopId && !(await assertWorkshop(app, req.user.tenantId, body.workshopId))) {
        return reply.code(400).send({ error: 'invalid workshop' });
      }
      if (body.allocatedMinutes !== undefined && (!Number.isFinite(body.allocatedMinutes) || body.allocatedMinutes < 0)) {
        return reply.code(400).send({ error: 'invalid allocated time' });
      }
      const job = await updateJob(app.db, req.user.tenantId, req.params.id, {
        title: body.title,
        status: body.status,
        workshopId: body.workshopId,
        setWorkshopId,
        allocatedMinutes: body.allocatedMinutes,
      });
      if (!job) return reply.code(404).send({ error: 'job not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'job.update',
        entityType: 'job',
        entityId: job.id,
        detail: req.body ?? {},
      });
      return reply.send({ job });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/jobs/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const job = await archiveJob(app.db, req.user.tenantId, req.params.id, req.user.sub);
      if (!job) return reply.code(404).send({ error: 'job not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'job.archive',
        entityType: 'job',
        entityId: job.id,
      });
      return reply.send({ job });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/jobs/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const job = await restoreJob(app.db, req.user.tenantId, req.params.id);
      if (!job) return reply.code(404).send({ error: 'job not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'job.restore',
        entityType: 'job',
        entityId: job.id,
      });
      return reply.send({ job });
    },
  );
}
