import type { FastifyInstance } from 'fastify';
import { requireRole } from '../plugins/auth.js';
import {
  archiveTimeEntry,
  createManualEntry,
  getTimeEntry,
  listTimeEntries,
  updateTimeEntry,
} from '../repos/timeEntries.js';
import { getUser } from '../repos/users.js';
import { getJob } from '../repos/jobs.js';
import { getWorkshop } from '../repos/workshops.js';
import { logActivity } from '../repos/activity.js';

interface ManualEntryBody {
  userId: string;
  jobId?: string | null;
  workshopId?: string | null;
  clockIn: string;
  clockOut?: string | null;
}

interface UpdateEntryBody {
  jobId?: string | null;
  workshopId?: string | null;
  clockIn: string;
  clockOut?: string | null;
}

export async function timeRoutes(app: FastifyInstance) {
  app.get('/time-entries', { preHandler: app.authenticate }, async (req, reply) => {
    return reply.send({ entries: await listTimeEntries(app.db, req.user.tenantId) });
  });

  app.post<{ Body: ManualEntryBody }>(
    '/time-entries',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const { userId, jobId, workshopId, clockIn, clockOut } = req.body ?? ({} as ManualEntryBody);
      if (!userId || !clockIn) {
        return reply.code(400).send({ error: 'userId and clockIn are required' });
      }
      // Timestamps must parse, and clock-out (if given) can't precede clock-in.
      const inTs = Date.parse(clockIn);
      if (Number.isNaN(inTs)) {
        return reply.code(400).send({ error: 'clockIn is not a valid date' });
      }
      if (clockOut != null && clockOut !== '') {
        const outTs = Date.parse(clockOut);
        if (Number.isNaN(outTs)) {
          return reply.code(400).send({ error: 'clockOut is not a valid date' });
        }
        if (outTs < inTs) {
          return reply.code(400).send({ error: 'clockOut cannot be before clockIn' });
        }
      }
      // The referenced user and job must belong to this tenant — never trust
      // client-supplied ids to cross the tenant boundary.
      const targetUser = await getUser(app.db, req.user.tenantId, userId);
      if (!targetUser || targetUser.archivedAt) {
        return reply.code(400).send({ error: 'userId is not a valid user in this organisation' });
      }
      if (jobId != null && jobId !== '') {
        const job = await getJob(app.db, req.user.tenantId, jobId);
        if (!job) {
          return reply.code(400).send({ error: 'jobId is not a valid job in this organisation' });
        }
      }
      if (workshopId != null && workshopId !== '') {
        const workshop = await getWorkshop(app.db, req.user.tenantId, workshopId);
        if (!workshop) {
          return reply.code(400).send({ error: 'workshopId is not a valid workshop in this organisation' });
        }
      }
      const entry = await createManualEntry(app.db, req.user.tenantId, {
        ...req.body,
        createdBy: req.user.sub,
      });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'time.manual',
        entityType: 'time_entry',
        entityId: entry.id,
        detail: { userId: entry.userId, clockIn: entry.clockIn, clockOut: entry.clockOut },
      });
      return reply.code(201).send({ entry });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateEntryBody }>(
    '/time-entries/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const { id } = req.params;
      const { jobId, workshopId, clockIn, clockOut } = req.body ?? ({} as UpdateEntryBody);
      if (!clockIn) {
        return reply.code(400).send({ error: 'clockIn is required' });
      }
      const inTs = Date.parse(clockIn);
      if (Number.isNaN(inTs)) {
        return reply.code(400).send({ error: 'clockIn is not a valid date' });
      }
      if (clockOut != null && clockOut !== '') {
        const outTs = Date.parse(clockOut);
        if (Number.isNaN(outTs)) {
          return reply.code(400).send({ error: 'clockOut is not a valid date' });
        }
        if (outTs < inTs) {
          return reply.code(400).send({ error: 'clockOut cannot be before clockIn' });
        }
      }
      const existing = await getTimeEntry(app.db, req.user.tenantId, id);
      if (!existing) {
        return reply.code(404).send({ error: 'Time entry not found' });
      }
      if (jobId != null && jobId !== '') {
        const job = await getJob(app.db, req.user.tenantId, jobId);
        if (!job) {
          return reply.code(400).send({ error: 'jobId is not a valid job in this organisation' });
        }
      }
      if (workshopId != null && workshopId !== '') {
        const workshop = await getWorkshop(app.db, req.user.tenantId, workshopId);
        if (!workshop) {
          return reply.code(400).send({ error: 'workshopId is not a valid workshop in this organisation' });
        }
      }
      const entry = await updateTimeEntry(app.db, req.user.tenantId, id, {
        jobId: jobId ?? null,
        workshopId: workshopId ?? null,
        clockIn,
        clockOut: clockOut ?? null,
      });
      if (!entry) {
        return reply.code(404).send({ error: 'Time entry not found' });
      }
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'time.update',
        entityType: 'time_entry',
        entityId: entry.id,
        detail: { userId: entry.userId, clockIn: entry.clockIn, clockOut: entry.clockOut },
      });
      return reply.send({ entry });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/time-entries/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin', 'officer')] },
    async (req, reply) => {
      const { id } = req.params;
      const entry = await archiveTimeEntry(app.db, req.user.tenantId, id, req.user.sub);
      if (!entry) {
        return reply.code(404).send({ error: 'Time entry not found' });
      }
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'time.archive',
        entityType: 'time_entry',
        entityId: entry.id,
        detail: { userId: entry.userId, clockIn: entry.clockIn, clockOut: entry.clockOut },
      });
      return reply.send({ entry });
    },
  );
}
