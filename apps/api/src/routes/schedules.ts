import type { FastifyInstance } from 'fastify';
import type { ScheduleStatus, Weekday } from '../types.js';
import { requireRole } from '../plugins/auth.js';
import {
  archiveSchedule,
  createSchedule,
  listSchedules,
  restoreSchedule,
  updateSchedule,
  type ScheduleDays,
} from '../repos/schedules.js';
import { logActivity } from '../repos/activity.js';

// Business configuration — admin and above only.
const manage = ['owner', 'admin'] as const;
const STATUSES: ScheduleStatus[] = ['active', 'inactive'];
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface CreateScheduleBody {
  name?: string;
  status?: ScheduleStatus;
  days?: unknown;
}
interface UpdateScheduleBody {
  name?: string;
  status?: ScheduleStatus;
  days?: unknown;
}

/**
 * Coerce and validate the days payload. Returns the cleaned map, or a string
 * describing the first problem found. Absent/invalid days are simply dropped;
 * a present day must have valid HH:MM start < end and a non-negative break that
 * fits inside the band.
 */
function parseDays(input: unknown): ScheduleDays | string {
  if (input == null) return {};
  if (typeof input !== 'object') return 'days must be an object';
  const src = input as Record<string, unknown>;
  const out: ScheduleDays = {};
  for (const day of WEEKDAYS) {
    const d = src[day];
    if (d == null) continue;
    if (typeof d !== 'object') return `${day} must be an object`;
    const { start, end, breakMinutes } = d as Record<string, unknown>;
    if (typeof start !== 'string' || typeof end !== 'string') {
      return `${day} needs start and end times`;
    }
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
      return `${day} times must be HH:MM`;
    }
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (endMin <= startMin) return `${day} end must be after start`;
    const brk = breakMinutes == null ? 0 : Number(breakMinutes);
    if (!Number.isFinite(brk) || brk < 0) return `${day} break is invalid`;
    if (brk >= endMin - startMin) return `${day} break is longer than the shift`;
    out[day] = { start, end, breakMinutes: brk };
  }
  return out;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export async function scheduleRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/schedules',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      return reply.send({
        schedules: await listSchedules(app.db, req.user.tenantId, includeArchived),
      });
    },
  );

  app.post<{ Body: CreateScheduleBody }>(
    '/schedules',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { name, status, days } = req.body ?? {};
      if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });
      if (status !== undefined && !STATUSES.includes(status)) {
        return reply.code(400).send({ error: 'invalid status' });
      }
      const parsed = parseDays(days);
      if (typeof parsed === 'string') return reply.code(400).send({ error: parsed });

      const schedule = await createSchedule(app.db, req.user.tenantId, {
        name,
        status,
        days: parsed,
      });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'schedule.create',
        entityType: 'schedule',
        entityId: schedule.id,
        detail: { name: schedule.name },
      });
      return reply.code(201).send({ schedule });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateScheduleBody }>(
    '/schedules/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      if (body.status !== undefined && !STATUSES.includes(body.status)) {
        return reply.code(400).send({ error: 'invalid status' });
      }
      let days: ScheduleDays | undefined;
      if (body.days !== undefined) {
        const parsed = parseDays(body.days);
        if (typeof parsed === 'string') return reply.code(400).send({ error: parsed });
        days = parsed;
      }

      const schedule = await updateSchedule(app.db, req.user.tenantId, req.params.id, {
        name: body.name,
        status: body.status,
        days,
      });
      if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'schedule.update',
        entityType: 'schedule',
        entityId: schedule.id,
        detail: { name: schedule.name },
      });
      return reply.send({ schedule });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/schedules/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const schedule = await archiveSchedule(app.db, req.user.tenantId, req.params.id);
      if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'schedule.archive',
        entityType: 'schedule',
        entityId: schedule.id,
      });
      return reply.send({ schedule });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/schedules/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const schedule = await restoreSchedule(app.db, req.user.tenantId, req.params.id);
      if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'schedule.restore',
        entityType: 'schedule',
        entityId: schedule.id,
      });
      return reply.send({ schedule });
    },
  );
}
