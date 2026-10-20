import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Migrator } from './db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Apply every migrations/*.sql file that has not run yet, in filename order,
 * recording each in schema_migrations. Idempotent: already-applied files are
 * skipped, so it is safe to run on every boot. Returns the files it applied.
 */
export async function runMigrations(m: Migrator): Promise<string[]> {
  // Managed Postgres (e.g. DigitalOcean) runs PG15+, where the `public` schema
  // no longer grants CREATE to roles other than its owner. A DO App Platform
  // dev database connects as a restricted role that does NOT own `public` and
  // cannot grant itself rights there, so migrating into `public` fails with
  // "permission denied for schema public". Instead, if we lack CREATE on
  // public, migrate into a schema OUR role owns and set the role's default
  // search_path to it — that search_path carries to every later connection
  // (the running API), so it finds the same tables with no further change.
  try {
    const { rows } = await m.query<{
      current_user: string;
      current_database: string;
      pub_create: boolean;
      db_create: boolean;
    }>(
      `SELECT current_user, current_database(),
              has_schema_privilege(current_user, 'public', 'CREATE') AS pub_create,
              has_database_privilege(current_user, current_database(), 'CREATE') AS db_create`,
    );
    const r = rows[0];
    console.log(
      `[migrate] connected as "${r?.current_user}" to "${r?.current_database}"; ` +
        `CREATE on public: ${r?.pub_create}; CREATE on database: ${r?.db_create}`,
    );

    if (r && !r.pub_create) {
      const schema = process.env.DB_SCHEMA ?? 'opt';
      try {
        await m.exec(`CREATE SCHEMA IF NOT EXISTS "${schema}" AUTHORIZATION CURRENT_USER`);
        await m.exec(`ALTER ROLE CURRENT_USER SET search_path = "${schema}", public`);
        await m.exec(`SET search_path TO "${schema}", public`);
        console.log(`[migrate] no CREATE on public -> migrating into owned schema "${schema}"`);
      } catch (err) {
        console.log(
          `[migrate] could not provision owned schema "${schema}": ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    console.log('[migrate] role introspection failed:', (err as Error).message);
  }

  await m.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await m.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await m.exec(sql);
    await m.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    ran.push(file);
  }
  return ran;
}
