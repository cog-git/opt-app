import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { JwtClaims } from '../types.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { findTenantBySubdomain, getTenant } from '../repos/tenants.js';
import {
  acceptInvite,
  clearResetTokenAndSetPassword,
  findInviteByToken,
  findUserByEmail,
  findUserByResetToken,
  getUser,
  setResetToken,
  updateUser,
} from '../repos/users.js';
import { toPublicUser } from '../repos/mappers.js';
import { logActivity } from '../repos/activity.js';
import { sendPasswordResetEmail } from '../lib/mailer.js';
import { checkLogin, recordFailure, recordSuccess } from '../lib/loginThrottle.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

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

interface AcceptInviteBody {
  token: string;
  password: string;
}

interface ForgotPasswordBody {
  subdomain: string;
  email: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
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
      // No passwordHash means an invite that hasn't been accepted yet.
      if (!user || !user.passwordHash) return invalid();

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
      if (!user || user.archivedAt || !user.passwordHash) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

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

  // Looks up an organisation-invite token so the accept-invite page can greet
  // the invitee by name before they set a password. No auth — the token
  // itself (a 32-byte random value) is the credential.
  app.get<{ Params: { token: string } }>(
    '/auth/invite/:token',
    async (req, reply) => {
      const invite = await findInviteByToken(app.db, req.params.token);
      if (!invite) {
        return reply.code(404).send({ error: 'This invite link is invalid or has expired.' });
      }
      return reply.send({
        org: invite.org,
        subdomain: invite.subdomain,
        email: invite.email,
        displayName: invite.displayName,
      });
    },
  );

  app.post<{ Body: AcceptInviteBody }>(
    '/auth/accept-invite',
    async (req, reply) => {
      const { token, password } = req.body ?? ({} as AcceptInviteBody);
      if (!token || !password) {
        return reply.code(400).send({ error: 'token and password are required' });
      }
      if (password.length < 8) {
        return reply.code(400).send({ error: 'password must be at least 8 characters' });
      }

      const invite = await findInviteByToken(app.db, token);
      if (!invite) {
        return reply.code(404).send({ error: 'This invite link is invalid or has expired.' });
      }

      await acceptInvite(app.db, invite.userId, await hashPassword(password));
      await logActivity(app.db, {
        tenantId: invite.tenantId,
        actorId: invite.userId,
        actorRole: 'owner',
        action: 'user.accept_invite',
        entityType: 'user',
        entityId: invite.userId,
      });

      // Sign them straight in so the UI can land on /admin immediately.
      const tenant = await getTenant(app.db, invite.tenantId);
      const user = await getUser(app.db, invite.tenantId, invite.userId);
      if (!tenant || !user) {
        return reply.code(500).send({ error: 'could not complete sign-in' });
      }
      const claims: JwtClaims = {
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
        isPlatformAdmin: user.isPlatformAdmin,
      };
      const jwtToken = await reply.jwtSign(claims, { expiresIn: app.config.jwtExpiresIn });

      return reply.send({ token: jwtToken, tokenType: 'Bearer', user: toPublicUser(user), tenant });
    },
  );

  // Self-service "forgot password". Always replies 200 with the same generic
  // body regardless of whether the account exists — never reveal account
  // existence via response shape or timing-sensitive branching (mirrors the
  // login route's uniform-failure `invalid()` helper). Throttled the same way
  // as /auth/login so it can't be hammered for enumeration or token spam.
  app.post<{ Body: ForgotPasswordBody }>(
    '/auth/forgot-password',
    async (req, reply) => {
      const { subdomain, email } = req.body ?? ({} as ForgotPasswordBody);
      if (!subdomain || !email) {
        return reply.code(400).send({ error: 'subdomain and email are required' });
      }

      const ip = req.ip;
      const throttle = checkLogin(ip, subdomain, email);
      if (throttle.limited) {
        return reply
          .code(429)
          .header('Retry-After', String(throttle.retryAfterSeconds))
          .send({ error: 'too many attempts, try again later' });
      }

      const tenant = await findTenantBySubdomain(app.db, subdomain);
      // Only ever act for a real, active user who already has a password —
      // a still-pending invite (no passwordHash yet) must go through
      // /auth/accept-invite instead, so a reset token here would never be
      // able to overwrite it.
      const user = tenant && tenant.status === 'active' ? await findUserByEmail(app.db, tenant.id, email) : null;
      if (tenant && user && user.passwordHash) {
        const token = randomBytes(32).toString('hex');
        await setResetToken(app.db, tenant.id, user.id, token, new Date(Date.now() + RESET_TTL_MS));

        const resetUrl = `${app.config.appUrl}/reset-password?token=${token}`;
        try {
          await sendPasswordResetEmail({ to: user.email, displayName: user.displayName, resetUrl });
        } catch (err) {
          app.log.error({ err }, 'failed to send password reset email');
        }

        await logActivity(app.db, {
          tenantId: tenant.id,
          actorId: user.id,
          actorRole: user.role,
          action: 'auth.forgot_password',
          entityType: 'user',
          entityId: user.id,
        });
      }

      // Record the attempt regardless of outcome, same as a failed login —
      // repeated calls lock out identically whether or not the account exists.
      recordFailure(ip, subdomain, email);

      return reply.send({ ok: true });
    },
  );

  // Looks up a password-reset token so the reset page can greet the user by
  // name before they choose a new password. No auth — the token itself (a
  // 32-byte random value) is the credential.
  app.get<{ Params: { token: string } }>(
    '/auth/reset-password/:token',
    async (req, reply) => {
      const reset = await findUserByResetToken(app.db, req.params.token);
      if (!reset) {
        return reply.code(404).send({ error: 'This reset link is invalid or has expired.' });
      }
      return reply.send({ email: reset.email, displayName: reset.displayName });
    },
  );

  app.post<{ Body: ResetPasswordBody }>(
    '/auth/reset-password',
    async (req, reply) => {
      const { token, password } = req.body ?? ({} as ResetPasswordBody);
      if (!token || !password) {
        return reply.code(400).send({ error: 'token and password are required' });
      }
      if (password.length < 8) {
        return reply.code(400).send({ error: 'password must be at least 8 characters' });
      }

      const reset = await findUserByResetToken(app.db, token);
      if (!reset) {
        return reply.code(404).send({ error: 'This reset link is invalid or has expired.' });
      }

      await clearResetTokenAndSetPassword(app.db, reset.userId, await hashPassword(password));

      // Sign them straight in so the UI can land on /admin immediately.
      const tenant = await getTenant(app.db, reset.tenantId);
      const user = await getUser(app.db, reset.tenantId, reset.userId);
      if (!tenant || !user) {
        return reply.code(500).send({ error: 'could not complete sign-in' });
      }

      await logActivity(app.db, {
        tenantId: reset.tenantId,
        actorId: reset.userId,
        actorRole: user.role,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: reset.userId,
      });

      const claims: JwtClaims = {
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
        isPlatformAdmin: user.isPlatformAdmin,
      };
      const jwtToken = await reply.jwtSign(claims, { expiresIn: app.config.jwtExpiresIn });

      return reply.send({ token: jwtToken, tokenType: 'Bearer', user: toPublicUser(user), tenant });
    },
  );
}
