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
  // no longer grants CREATE to roles other than its owner. Report who we are so
  // boot logs are diagnosable, then make a best-effort claim of CREATE/USAGE on
  // public. These GRANTs succeed when our role owns the schema (the common case
  // once set up) and are harmless no-ops otherwise; a genuine lack of privilege
  // still surfaces clearly on the first CREATE below.
  try {
    const { rows } = await m.query<{
      current_user: string;
      current_database: string;
      has_create: boolean;
    }>(
      `SELECT current_user, current_database(),
              has_schema_privilege(current_user, 'public', 'CREATE') AS has_create`,
    );
    const r = rows[0];
    console.log(
      `[migrate] connected as "${r?.current_user}" to "${r?.current_database}"; CREATE on public: ${r?.has_create}`,
    );
  } catch (err) {
    console.log('[migrate] role introspection failed:', (err as Error).message);
  }
  for (const stmt of [
    'GRANT USAGE ON SCHEMA public TO CURRENT_USER',
    'GRANT CREATE ON SCHEMA public TO CURRENT_USER',
  ]) {
    try {
      await m.exec(stmt);
    } catch (err) {
      console.log(`[migrate] "${stmt}" skipped: ${(err as Error).message}`);
    }
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
