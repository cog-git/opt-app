/**
 * Local development server — runs the full API against a file-backed in-process
 * Postgres (PGlite), so no external database is needed on this box. Applies the
 * real migrations and demo seed on boot. Production uses real Postgres via
 * src/server.ts; this file is dev-only.
 *
 *   npm run dev:local   (from apps/api)
 */
import { PGlite } from '@electric-sql/pglite';
import { buildServer } from './server.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';
import type { Migrator, Queryable } from './db.js';

const DATA_DIR = process.env.PGLITE_DIR ?? '.pglite';

async function main() {
  const pglite = new PGlite(DATA_DIR);

  const migrator: Migrator = {
    query: (t, p) => pglite.query(t, p) as Promise<{ rows: never[] }>,
    exec: async (sql) => {
      // gen_random_uuid() is native to PGlite's PG16 core; pgcrypto isn't
      // bundled, so drop the extension line for the local run only.
      await pglite.exec(sql.replace(/CREATE EXTENSION[^;]*pgcrypto[^;]*;/i, ''));
    },
  };
  const db: Queryable = { query: (t, p) => pglite.query(t, p) as Promise<{ rows: never[] }> };

  const applied = await runMigrations(migrator);
  const creds = await seed(db);

  const { app, config } = await buildServer({
    db,
    // Dev only: accept any localhost origin so the Vite dev server works on
    // whatever port it lands on. Requests with no Origin (curl) are allowed too.
    // A trycloudflare.com quick-tunnel origin is also accepted so the app can be
    // demoed from a phone; this branch is dev-only and never runs in production.
    corsOrigin: (origin, cb) => {
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)
      ) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(
    { applied, store: DATA_DIR, login: `${creds.ownerEmail} / ${creds.ownerPassword}`, subdomain: creds.subdomain },
    'local dev API (PGlite) ready',
  );
}

void main();
