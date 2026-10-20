import type { FastifyInstance } from 'fastify';
import type { UserRole } from '../types.js';
import { ROLE_RANK, isRole, requireRole } from '../plugins/auth.js';
import { hashPassword } from '../lib/password.js';
import { archiveUser, createUser, getUser, listUsers, restoreUser, updateUser } from '../repos/users.js';
import { toPublicUser } from '../repos/mappers.js';
import { logActivity } from '../repos/activity.js';

interface CreateUserBody {
  email: string;
  displayName: string;
  role: UserRole;
  password: string;
}
interface UpdateUserBody {
  displayName?: string;
  role?: UserRole;
  password?: string;
}

const manage = ['owner', 'admin', 'officer'] as const;

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    '/users',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const includeArchived = req.query.archived === '1' || req.query.archived === 'true';
      const users = await listUsers(app.db, req.user.tenantId, includeArchived);
      return reply.send({ users: users.map(toPublicUser) });
    },
  );

  app.post<{ Body: CreateUserBody }>(
    '/users',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const { email, displayName, role, password } = req.body ?? ({} as CreateUserBody);
      if (!email || !displayName || !role || !password) {
        return reply.code(400).send({ error: 'email, displayName, role and password are required' });
      }
      if (!isRole(role)) {
        return reply.code(400).send({ error: 'invalid role' });
      }
      // No one may mint a user at or above their own rank (blocks, e.g., an
      // officer creating an owner). Platform-admin status is never grantable here.
      if (ROLE_RANK[role] >= ROLE_RANK[req.user.role]) {
        return reply.code(403).send({ error: 'cannot grant a role at or above your own' });
      }
      const user = await createUser(app.db, req.user.tenantId, {
        email,
        displayName,
        role,
        passwordHash: await hashPassword(password),
      });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
        detail: { email: user.email, role: user.role },
      });
      return reply.code(201).send({ user: toPublicUser(user) });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateUserBody }>(
    '/users/:id',
    { preHandler: [app.authenticate, requireRole(...manage)] },
    async (req, reply) => {
      const body = req.body ?? {};
      const actorRank = ROLE_RANK[req.user.role];

      const target = await getUser(app.db, req.user.tenantId, req.params.id);
      if (!target || target.archivedAt) return reply.code(404).send({ error: 'user not found' });
      // Can't manage a peer or superior (e.g. an admin editing an owner).
      if (ROLE_RANK[target.role] >= actorRank) {
        return reply.code(403).send({ error: 'cannot modify a user at or above your own role' });
      }
      if (body.role !== undefined) {
        if (!isRole(body.role)) return reply.code(400).send({ error: 'invalid role' });
        // Can't promote to a role at or above your own (blocks self/other escalation).
        if (ROLE_RANK[body.role] >= actorRank) {
          return reply.code(403).send({ error: 'cannot grant a role at or above your own' });
        }
      }
      if (body.password !== undefined && body.password.length < 8) {
        return reply.code(400).send({ error: 'password must be at least 8 characters' });
      }

      const user = await updateUser(app.db, req.user.tenantId, req.params.id, {
        displayName: body.displayName,
        role: body.role,
        passwordHash: body.password ? await hashPassword(body.password) : undefined,
      });
      if (!user) return reply.code(404).send({ error: 'user not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'user.update',
        entityType: 'user',
        entityId: user.id,
        detail: {
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.password !== undefined ? { passwordReset: true } : {}),
        },
      });
      return reply.send({ user: toPublicUser(user) });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      if (req.params.id === req.user.sub) {
        return reply.code(400).send({ error: 'you cannot archive your own account' });
      }
      const target = await getUser(app.db, req.user.tenantId, req.params.id);
      if (!target || target.archivedAt) return reply.code(404).send({ error: 'user not found' });
      if (ROLE_RANK[target.role] >= ROLE_RANK[req.user.role]) {
        return reply.code(403).send({ error: 'cannot archive a user at or above your own role' });
      }
      const user = await archiveUser(app.db, req.user.tenantId, req.params.id, req.user.sub);
      if (!user) return reply.code(404).send({ error: 'user not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'user.archive',
        entityType: 'user',
        entityId: user.id,
      });
      return reply.send({ user: toPublicUser(user) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/users/:id/restore',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req, reply) => {
      const user = await restoreUser(app.db, req.user.tenantId, req.params.id);
      if (!user) return reply.code(404).send({ error: 'user not found' });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'user.restore',
        entityType: 'user',
        entityId: user.id,
      });
      return reply.send({ user: toPublicUser(user) });
    },
  );
}
