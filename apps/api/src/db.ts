import pg from 'pg';
import { loadConfig } from './config.js';

/**
 * Minimal query surface shared by node-postgres (production) and PGlite
 * (in-process verification). Repositories depend only on this, so the same code
 * runs against a real Postgres pool and an in-memory WASM Postgres.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/**
 * A Queryable that can also run whole multi-statement SQL files. Used by the
 * migration runner; production and PGlite each supply their own exec.
 */
export interface Migrator extends Queryable {
  exec(sql: string): Promise<void>;
}

// Timestamptz -> keep as ISO string, not a JS Date, so the API speaks JSON
// consistently regardless of driver. 1114 = timestamp, 1184 = timestamptz.
pg.types.setTypeParser(1114, (v) => (v == null ? v : new Date(v + 'Z').toISOString()));
pg.types.setTypeParser(1184, (v) => (v == null ? v : new Date(v).toISOString()));

let pool: pg.Pool | null = null;

/**
 * Work out the TLS settings for the pool.
 *
 * DigitalOcean managed Postgres presents a self-signed CA, so node-postgres'
 * default verification rejects the connection with SELF_SIGNED_CERT_IN_CHAIN
 * and the API crashes on boot before it can run migrations. If the DO CA
 * certificate is supplied (DATABASE_CA_CERT), we verify against it properly;
 * otherwise, for any non-local database we fall back to an encrypted-but-
 * unverified connection so the app can still boot. Local dev (localhost) keeps
 * SSL off entirely.
 */
function sslConfig(databaseUrl: string): pg.PoolConfig['ssl'] {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
  if (isLocal) return undefined;

  const ca = process.env.DATABASE_CA_CERT;
  if (ca) return { ca, rejectUnauthorized: true };

  return { rejectUnauthorized: false };
}

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = loadConfig().databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl, ssl: sslConfig(databaseUrl) });
  }
  return pool;
}

/** Wrap a pg pool as the narrow Queryable the repositories consume. */
export function poolQueryable(p: pg.Pool = getPool()): Queryable {
  return {
    query: (text, params) => p.query(text, params) as Promise<{ rows: never[] }>,
  };
}

export function pgMigrator(p: pg.Pool = getPool()): Migrator {
  return {
    query: (text, params) => p.query(text, params) as Promise<{ rows: never[] }>,
    exec: async (sql) => {
      await p.query(sql);
    },
  };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
