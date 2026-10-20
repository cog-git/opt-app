/**
 * End-to-end backend verification against in-process Postgres (PGlite):
 * real migrations, real repositories, real routes via fastify.inject.
 * Not part of the build — run with: npx tsx scripts/verify.ts
 */
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../src/migrate.js';
import { buildServer } from '../src/server.js';
import { seed } from '../src/seed.js';
import type { Queryable, Migrator } from '../src/db.js';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}`, extra ?? '');
  }
}

const pg = new PGlite();
const migrator: Migrator = {
  query: (t, p) => pg.query(t, p) as Promise<{ rows: never[] }>,
  exec: async (sql) => {
    // gen_random_uuid() is native to PGlite's PG16 core; pgcrypto isn't bundled,
    // so drop the extension line for the in-memory run only. Production keeps it.
    await pg.exec(sql.replace(/CREATE EXTENSION[^;]*pgcrypto[^;]*;/i, ''));
  },
};
const db: Queryable = { query: (t, p) => pg.query(t, p) as Promise<{ rows: never[] }> };

// 1. Migrations apply cleanly, and are idempotent on a second run.
const ran = await runMigrations(migrator);
check('migrations applied both files', ran.length === 2, ran);
const ranAgain = await runMigrations(migrator);
check('migrations idempotent (0 on rerun)', ranAgain.length === 0, ranAgain);

// 2. Seed a demo org + owner.
const creds = await seed(db);
check('seed returns owner creds', !!creds.ownerEmail && !!creds.ownerPassword);

const { app } = await buildServer({ db, logger: false });
await app.ready();

const json = (r: { payload: string }) => JSON.parse(r.payload);

// 3. Login — wrong password is rejected, right password issues a token.
const bad = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { subdomain: creds.subdomain, email: creds.ownerEmail, password: 'wrong' },
});
check('login rejects wrong password (401)', bad.statusCode === 401, bad.statusCode);

const login = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { subdomain: creds.subdomain, email: creds.ownerEmail, password: creds.ownerPassword },
});
check('login succeeds (200)', login.statusCode === 200, login.statusCode);
const token = json(login).token as string;
check('login returns a token', typeof token === 'string' && token.length > 20);
const auth = { authorization: `Bearer ${token}` };

// 4. Unauthenticated request is blocked.
const noAuth = await app.inject({ method: 'GET', url: '/jobs' });
check('unauthenticated /jobs blocked (401)', noAuth.statusCode === 401, noAuth.statusCode);

// 5. /auth/me echoes the owner.
const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth });
check('/auth/me returns owner', json(me).user?.email === creds.ownerEmail, me.payload);
check('/auth/me never leaks passwordHash', !('passwordHash' in (json(me).user ?? {})));

// 6. Seeded jobs are listed.
const jobs0 = await app.inject({ method: 'GET', url: '/jobs', headers: auth });
check('seeded jobs listed', json(jobs0).jobs?.length === 2, json(jobs0).jobs?.length);

// 7. Create a job.
const jobCreate = await app.inject({
  method: 'POST',
  url: '/jobs',
  headers: auth,
  payload: { jobNumber: '2001', title: 'Paint Prep' },
});
check('create job (201)', jobCreate.statusCode === 201, jobCreate.statusCode);
const jobId = json(jobCreate).job?.id as string;

// 8. Update + archive the job (soft-delete removes it from the live list).
const jobPatch = await app.inject({
  method: 'PATCH',
  url: `/jobs/${jobId}`,
  headers: auth,
  payload: { status: 'complete' },
});
check('update job status', json(jobPatch).job?.status === 'complete', jobPatch.payload);

const jobDelete = await app.inject({ method: 'DELETE', url: `/jobs/${jobId}`, headers: auth });
check('archive job (200)', jobDelete.statusCode === 200, jobDelete.statusCode);
const jobs1 = await app.inject({ method: 'GET', url: '/jobs', headers: auth });
check('archived job gone from live list', json(jobs1).jobs?.length === 2, json(jobs1).jobs?.length);

// 9. Create a staff user, then confirm staff is read-only.
const userCreate = await app.inject({
  method: 'POST',
  url: '/users',
  headers: auth,
  payload: { email: 'sarah@demo.opt', displayName: 'Sarah Mitchell', role: 'staff', password: 'staff-pass-1' },
});
check('create staff user (201)', userCreate.statusCode === 201, userCreate.payload);
check('created user has no passwordHash', !('passwordHash' in (json(userCreate).user ?? {})));

const staffLogin = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { subdomain: creds.subdomain, email: 'sarah@demo.opt', password: 'staff-pass-1' },
});
const staffToken = json(staffLogin).token as string;
const staffAuth = { authorization: `Bearer ${staffToken}` };
const staffCreateJob = await app.inject({
  method: 'POST',
  url: '/jobs',
  headers: staffAuth,
  payload: { jobNumber: '9999', title: 'Nope' },
});
check('staff forbidden from creating jobs (403)', staffCreateJob.statusCode === 403, staffCreateJob.statusCode);

// 10. Manual time entry (officer+), then it lists.
const users = await app.inject({ method: 'GET', url: '/users', headers: auth });
const staffId = json(users).users.find((u: { email: string }) => u.email === 'sarah@demo.opt')?.id;
const entry = await app.inject({
  method: 'POST',
  url: '/time-entries',
  headers: auth,
  payload: {
    userId: staffId,
    clockIn: '2026-08-21T08:00:00.000Z',
    clockOut: '2026-08-21T16:30:00.000Z',
  },
});
check('create manual time entry (201)', entry.statusCode === 201, entry.payload);
check('manual entry flagged manual', json(entry).entry?.manual === true);
const entries = await app.inject({ method: 'GET', url: '/time-entries', headers: auth });
check('time entry lists', json(entries).entries?.length === 1, json(entries).entries?.length);

// 11. Audit trail captured the writes and is append-only at the DB level.
const activity = await app.inject({ method: 'GET', url: '/activity', headers: auth });
const actions = json(activity).activity.map((a: { action: string }) => a.action);
check('activity log recorded job.create', actions.includes('job.create'), actions);
check('activity log recorded user.create', actions.includes('user.create'), actions);
check('activity log recorded time.manual', actions.includes('time.manual'), actions);

let appendOnly = false;
try {
  await db.query('UPDATE activity_log SET action = $1', ['tamper']);
} catch {
  appendOnly = true;
}
check('activity_log is DB-enforced append-only', appendOnly);

// 12. Tenant isolation — a second org cannot see the first org's jobs.
const other = await seedOther(db);
const otherLogin = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { subdomain: other.subdomain, email: other.ownerEmail, password: other.ownerPassword },
});
const otherAuth = { authorization: `Bearer ${json(otherLogin).token}` };
const otherJobs = await app.inject({ method: 'GET', url: '/jobs', headers: otherAuth });
check('tenant isolation: other org sees no jobs', json(otherJobs).jobs?.length === 0, json(otherJobs).jobs?.length);

await app.close();
await pg.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

// --- helpers -------------------------------------------------------------
async function seedOther(database: Queryable) {
  const { createTenant } = await import('../src/repos/tenants.js');
  const { createUser } = await import('../src/repos/users.js');
  const { hashPassword } = await import('../src/lib/password.js');
  const t = await createTenant(database, { org: 'Second Co', subdomain: 'second', tier: 'clockin' });
  await createUser(database, t.id, {
    email: 'owner@second.opt',
    displayName: 'Second Owner',
    role: 'owner',
    passwordHash: await hashPassword('second-pass-1'),
  });
  return { subdomain: 'second', ownerEmail: 'owner@second.opt', ownerPassword: 'second-pass-1' };
}
