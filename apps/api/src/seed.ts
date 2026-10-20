import type { Queryable } from './db.js';
import { hashPassword } from './lib/password.js';
import { createTenant, findTenantBySubdomain } from './repos/tenants.js';
import { createUser, findUserByEmail } from './repos/users.js';
import { createJob, listJobs, updateJob } from './repos/jobs.js';
import { createWorkshop, listWorkshops } from './repos/workshops.js';
import { createScreen, listScreens } from './repos/screens.js';
import { createSchedule, listSchedules } from './repos/schedules.js';
import { createTask, listTasks } from './repos/tasks.js';
import { createManualEntry, listTimeEntries } from './repos/timeEntries.js';

export interface SeedResult {
  subdomain: string;
  ownerEmail: string;
  ownerPassword: string;
}

/** Idempotent demo seed for staging: one org, an owner login, a couple of jobs. */
export async function seed(db: Queryable): Promise<SeedResult> {
  const subdomain = 'demo';
  const ownerEmail = 'owner@demo.opt';
  const ownerPassword = 'opt-demo-2026';

  let tenant = await findTenantBySubdomain(db, subdomain);
  if (!tenant) {
    tenant = await createTenant(db, { org: 'Demo Workshop', subdomain, tier: 'production' });
  }

  const owner = await findUserByEmail(db, tenant.id, ownerEmail);
  if (!owner) {
    await createUser(db, tenant.id, {
      email: ownerEmail,
      displayName: 'Demo Owner',
      role: 'owner',
      passwordHash: await hashPassword(ownerPassword),
    });
  }

  // The demo owner drives the office console, which includes the cross-tenant
  // Organisations page — so it must be a platform admin. Idempotent.
  await db.query(
    `UPDATE users SET is_platform_admin = true
      WHERE tenant_id = $1 AND lower(email) = lower($2)`,
    [tenant.id, ownerEmail],
  );

  if ((await listWorkshops(db, tenant.id)).length === 0) {
    await createWorkshop(db, tenant.id, { name: 'Fabrication Bay' });
    await createWorkshop(db, tenant.id, { name: 'Paint & Finish' });
  }
  const workshops = await listWorkshops(db, tenant.id);
  const fabrication = workshops.find((w) => w.name === 'Fabrication Bay') ?? null;
  const paint = workshops.find((w) => w.name === 'Paint & Finish') ?? null;

  if ((await listJobs(db, tenant.id)).length === 0) {
    await createJob(db, tenant.id, {
      jobNumber: '1042',
      title: 'Frame Assembly',
      workshopId: fabrication?.id ?? null,
    });
    await createJob(db, tenant.id, {
      jobNumber: '1047',
      title: 'Welding, Bay 2',
      workshopId: fabrication?.id ?? null,
    });
  }

  if ((await listScreens(db, tenant.id)).length === 0) {
    await createScreen(db, tenant.id, {
      name: 'Fabrication Kiosk',
      workshopId: fabrication?.id ?? null,
    });
    await createScreen(db, tenant.id, {
      name: 'Paint Shop Kiosk',
      workshopId: paint?.id ?? null,
    });
  }

  if ((await listSchedules(db, tenant.id)).length === 0) {
    const weekday = { start: '09:00', end: '17:00', breakMinutes: 30 };
    await createSchedule(db, tenant.id, {
      name: 'Weekdays 9–5',
      status: 'active',
      days: { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday },
    });
    await createSchedule(db, tenant.id, {
      name: 'Early shift',
      status: 'active',
      days: {
        mon: { start: '06:00', end: '14:00', breakMinutes: 20 },
        tue: { start: '06:00', end: '14:00', breakMinutes: 20 },
        wed: { start: '06:00', end: '14:00', breakMinutes: 20 },
      },
    });
  }

  if ((await listTasks(db, tenant.id)).length === 0) {
    await createTask(db, tenant.id, { name: 'House Keeping', status: 'active' });
    await createTask(db, tenant.id, { name: 'Updating Documents', status: 'active' });
    await createTask(db, tenant.id, { name: 'Training', status: 'inactive' });
  }

  // One user per role so the demo can show the permission tiers (staff sees
  // jobs/clients only, officer adds staff + reports, admin runs the business).
  // Idempotent by email; all share the owner's demo password.
  const roleSeed: { email: string; displayName: string; role: 'admin' | 'officer' }[] = [
    { email: 'alex@demo.opt', displayName: 'Alex Admin', role: 'admin' },
    { email: 'olivia@demo.opt', displayName: 'Olivia Officer', role: 'officer' },
  ];
  for (const r of roleSeed) {
    if (!(await findUserByEmail(db, tenant.id, r.email))) {
      await createUser(db, tenant.id, {
        email: r.email,
        displayName: r.displayName,
        role: r.role,
        passwordHash: await hashPassword(ownerPassword),
      });
    }
  }

  // A few shop-floor staff, idempotent by email.
  const staffSeed = [
    { email: 'adam@demo.opt', displayName: 'Adam Joiner' },
    { email: 'mia@demo.opt', displayName: 'Mia Painter' },
    { email: 'tom@demo.opt', displayName: 'Tom Welder' },
  ];
  for (const s of staffSeed) {
    if (!(await findUserByEmail(db, tenant.id, s.email))) {
      await createUser(db, tenant.id, {
        email: s.email,
        displayName: s.displayName,
        role: 'staff',
        passwordHash: await hashPassword(ownerPassword),
      });
    }
  }

  // Demo time history so the job detail shows allocated-vs-logged, health and a
  // team timeline out of the box. Only runs on a fresh database (no entries yet).
  if ((await listTimeEntries(db, tenant.id, 1)).length === 0) {
    const jobs = await listJobs(db, tenant.id);
    const frame = jobs.find((j) => j.jobNumber === '1042') ?? jobs[0];
    const weld = jobs.find((j) => j.jobNumber === '1047') ?? jobs[1] ?? jobs[0];
    // Allocations chosen so the demo shows one healthy job (~82%) and one that
    // has tipped over budget (~110%).
    if (frame) await updateJob(db, tenant.id, frame.id, { allocatedMinutes: 160 * 60 });
    if (weld) await updateJob(db, tenant.id, weld.id, { allocatedMinutes: 120 * 60 });

    const staff = [];
    for (const s of staffSeed) {
      const u = await findUserByEmail(db, tenant.id, s.email);
      if (u) staff.push(u);
    }
    const seedOwner = await findUserByEmail(db, tenant.id, ownerEmail);
    const createdBy = seedOwner?.id ?? staff[0]?.id ?? '';

    if (frame && weld && staff.length && createdBy) {
      // Walk back over recent weekdays; each staffer logs a morning stint on one
      // job and an afternoon stint on the other, so both jobs get a spread of
      // people and days. Minutes vary a little to look real.
      const startHours = [8, 13];
      const entries: {
        userId: string;
        jobId: string;
        clockIn: string;
        clockOut: string;
        createdBy: string;
      }[] = [];
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      let placed = 0;
      while (placed < 11) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) {
          staff.forEach((u, i) => {
            startHours.forEach((h, slot) => {
              const job = (i + slot) % 2 === 0 ? frame : weld;
              const durMin = 210 + ((placed + i + slot) % 4) * 20; // 3h30–4h50
              const clockIn = new Date(cursor);
              clockIn.setHours(h, (i * 7) % 30, 0, 0);
              const clockOut = new Date(clockIn.getTime() + durMin * 60_000);
              entries.push({
                userId: u.id,
                jobId: job.id,
                clockIn: clockIn.toISOString(),
                clockOut: clockOut.toISOString(),
                createdBy,
              });
            });
          });
          placed += 1;
        }
        cursor.setDate(cursor.getDate() - 1);
      }
      for (const e of entries) {
        await createManualEntry(db, tenant.id, e);
      }
    }
  }

  return { subdomain, ownerEmail, ownerPassword };
}
