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
