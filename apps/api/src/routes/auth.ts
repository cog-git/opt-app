import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { JwtClaims } from '../types.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { findTenantBySubdomain } from '../repos/tenants.js';
import { findUserByEmail, getUser, updateUser } from '../repos/users.js';
import { toPublicUser } from '../repos/mappers.js';
import { logActivity } from '../repos/activity.js';
import { checkLogin, recordFailure, recordSuccess } from '../lib/loginThrottle.js';

// Augment @fastify/jwt so request.user is strongly typed.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtClaims;
    user: JwtClaims;
  }
}

interface LoginBody {
  subdomain: string;
  email: string;
  password: string;
  // "Keep me signed in": mint a long-lived token instead of the 12h default.
  remember?: boolean;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    async (req: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { subdomain, email, password, remember } = req.body ?? ({} as LoginBody);
      if (!subdomain || !email || !password) {
        return reply.code(400).send({ error: 'subdomain, email and password are required' });
      }

      const ip = req.ip;
      const throttle = checkLogin(ip, subdomain, email);
      if (throttle.limited) {
        return reply
          .code(429)
          .header('Retry-After', String(throttle.retryAfterSeconds))
          .send({ error: 'too many attempts, try again later' });
      }

      // Uniform 401 for every failure mode — never reveal which part was wrong.
      const invalid = () => {
        recordFailure(ip, subdomain, email);
        return reply.code(401).send({ error: 'invalid credentials' });
      };

      const tenant = await findTenantBySubdomain(app.db, subdomain);
      if (!tenant || tenant.status !== 'active') return invalid();

      const user = await findUserByEmail(app.db, tenant.id, email);
      if (!user) return invalid();

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return invalid();

      recordSuccess(ip, subdomain, email);

      const claims: JwtClaims = {
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
        isPlatformAdmin: user.isPlatformAdmin,
      };
      const expiresIn = remember ? app.config.jwtRememberExpiresIn : app.config.jwtExpiresIn;
      const token = await reply.jwtSign(claims, { expiresIn });

      await logActivity(app.db, {
        tenantId: tenant.id,
        actorId: user.id,
        actorRole: user.role,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
      });

      return reply.send({ token, tokenType: 'Bearer', user: toPublicUser(user), tenant });
    },
  );

  app.get('/auth/me', { preHandler: app.authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await getUser(app.db, req.user.tenantId, req.user.sub);
    if (!user || user.archivedAt) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send({ user: toPublicUser(user) });
  });

  // Self-service password change. The /users route deliberately blocks anyone
  // from editing a user at or above their own rank, which also stops an
  // admin/owner resetting their OWN password there — so this is the only path
  // by which they can. Requires the current password to prevent a walked-up
  // session from silently changing it.
  app.post<{ Body: ChangePasswordBody }>(
    '/auth/change-password',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { currentPassword, newPassword } = req.body ?? ({} as ChangePasswordBody);
      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: 'currentPassword and newPassword are required' });
      }
      if (newPassword.length < 8) {
        return reply.code(400).send({ error: 'password must be at least 8 characters' });
      }

      const user = await getUser(app.db, req.user.tenantId, req.user.sub);
      if (!user || user.archivedAt) return reply.code(401).send({ error: 'unauthorized' });

      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) return reply.code(403).send({ error: 'current password is incorrect' });

      await updateUser(app.db, req.user.tenantId, req.user.sub, {
        passwordHash: await hashPassword(newPassword),
      });
      await logActivity(app.db, {
        tenantId: req.user.tenantId,
        actorId: req.user.sub,
        actorRole: req.user.role,
        action: 'user.password_change',
        entityType: 'user',
        entityId: req.user.sub,
      });

      return reply.send({ ok: true });
    },
  );
}
