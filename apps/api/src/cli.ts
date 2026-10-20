import { closePool, pgMigrator, poolQueryable } from './db.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

/** `npm run migrate` / `npm run seed` — operate against the configured Postgres. */
const command = process.argv[2];

if (command === 'migrate') {
  const ran = await runMigrations(pgMigrator());
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations.');
} else if (command === 'seed') {
  await runMigrations(pgMigrator());
  const result = await seed(poolQueryable());
  console.log(`Seeded org "${result.subdomain}". Login: ${result.ownerEmail} / ${result.ownerPassword}`);
} else {
  console.error('Usage: node dist/cli.js <migrate|seed>');
  process.exitCode = 1;
}

await closePool();
