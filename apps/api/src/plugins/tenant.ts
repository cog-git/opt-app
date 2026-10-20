import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Tenant } from '../types.js';
import { findTenantBySubdomain } from '../repos/tenants.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Tenant resolved from the request subdomain (null until wired to a DB). */
    tenant: Tenant | null;
  }
  interface FastifyInstance {
    /** Resolve a tenant from a hostname's leading subdomain label. */
    resolveTenant: (host: string | undefined) => Promise<Tenant | null>;
  }
}

/**
 * Resolves the active tenant from the request's leading subdomain label and
 * exposes it on request.tenant. Depends on app.db (dbPlugin must register first).
 */
export const tenantPlugin = fp(async function tenantPlugin(app: FastifyInstance) {
  app.decorate('resolveTenant', async function resolveTenant(host: string | undefined) {
    const subdomain = extractSubdomain(host);
    if (!subdomain) {
      return null;
    }
    const tenant = await findTenantBySubdomain(app.db, subdomain);
    return tenant && tenant.status === 'active' ? tenant : null;
  });

  app.decorateRequest('tenant', null);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.tenant = await app.resolveTenant(req.headers.host);
  });
});

export function extractSubdomain(host: string | undefined): string | null {
  if (!host) {
    return null;
  }
  const hostname = host.split(':')[0];
  const labels = hostname.split('.');
  // Need at least sub.domain.tld to have a meaningful subdomain.
  if (labels.length < 3) {
    return null;
  }
  const sub = labels[0];
  if (!sub || sub === 'www') {
    return null;
  }
  return sub;
}
