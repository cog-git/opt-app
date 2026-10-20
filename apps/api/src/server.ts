import Fastify from 'fastify';
import cors, { type FastifyCorsOptions } from '@fastify/cors';
import jwt from '@fastify/jwt';
import { loadConfig, type AppConfig } from './config.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}
import { poolQueryable, type Queryable } from './db.js';
import { dbPlugin } from './plugins/db.js';
import { authPlugin } from './plugins/auth.js';
import { tenantPlugin } from './plugins/tenant.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { userRoutes } from './routes/users.js';
import { clientRoutes } from './routes/clients.js';
import { jobRoutes } from './routes/jobs.js';
import { workshopRoutes } from './routes/workshops.js';
import { screenRoutes } from './routes/screens.js';
import { scheduleRoutes } from './routes/schedules.js';
import { taskRoutes } from './routes/tasks.js';
import { timeRoutes } from './routes/time.js';
import { activityRoutes } from './routes/activity.js';

export interface BuildOptions {
  /** Inject a Queryable (PGlite) for tests; defaults to the pg pool. */
  db?: Queryable;
  logger?: boolean;
  /**
   * Override the CORS origin policy. The dev server passes a matcher that
   * accepts any localhost origin regardless of port; production leaves this
   * unset so CORS stays locked to the single configured origin.
   */
  corsOrigin?: FastifyCorsOptions['origin'];
}

export async function buildServer(opts: BuildOptions = {}) {
  const config = loadConfig();
  const app = Fastify({ logger: opts.logger ?? true });
  app.decorate('config', config);

  // CORS locked to a single configured origin in production — never wildcard.
  // Dev may pass a localhost matcher via opts.corsOrigin.
  await app.register(cors, {
    origin: opts.corsOrigin ?? config.corsOrigin,
    credentials: true,
  });

  // Tokens carry an expiry so a leaked/stale token stops working on its own.
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  // Baseline hardening headers on every response (no extra dependency needed).
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  await app.register(dbPlugin(opts.db ?? poolQueryable()));
  await app.register(authPlugin);
  await app.register(tenantPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(tenantRoutes);
  await app.register(userRoutes);
  await app.register(clientRoutes);
  await app.register(jobRoutes);
  await app.register(workshopRoutes);
  await app.register(screenRoutes);
  await app.register(scheduleRoutes);
  await app.register(taskRoutes);
  await app.register(timeRoutes);
  await app.register(activityRoutes);

  return { app, config };
}

async function start() {
  const { app, config } = await buildServer();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Run only when executed directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void start();
}
