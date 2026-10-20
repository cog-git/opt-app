import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Queryable } from '../db.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Tenant-agnostic query surface; repositories scope every call by tenant_id. */
    db: Queryable;
  }
}

/** Decorate the app with a Queryable — a pg pool in production, PGlite in tests. */
export function dbPlugin(db: Queryable) {
  return fp(async function dbPlugin(app: FastifyInstance) {
    app.decorate('db', db);
  });
}
