/**
 * Admin store — API-backed cache for the office console.
 *
 * Talks to the live OPT API (see ../api.ts). The API is single-tenant per JWT,
 * so every users/jobs/time/activity view is the logged-in tenant's data; the
 * Organisations page is the one platform-wide view. Job attachments (notes and
 * photos) have no backend table yet, so those stay session-only in memory.
 *
 * Data flow: pages call the async `load*` functions (typically in a mount
 * effect), which fetch from the API and refresh module-level caches. The sync
 * `get*` getters then read straight from those caches during render. Mutators
 * are async: they call the API, update the cache in place, and resolve.
 */

import * as api from '../api';
import type { ApiActivityEntry } from '../api';

// ── Entity types (the shapes the pages render) ───────────────────────────────

export type OrgTier = 'clockin' | 'production';
export type OrgStatus = 'active' | 'paused' | 'locked';
export type UserRole = 'owner' | 'admin' | 'officer' | 'staff';

// Display labels for roles. The "officer" tier is shown to users as "Manager";
// the stored role value stays 'officer' so the API and permissions are untouched.
export const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  officer: 'Manager',
  staff: 'Staff',
};

export function roleLabel(role: string): string {
  return (ROLE_LABEL as Record<string, string>)[role] ?? role;
}
export type JobStatus = 'active' | 'complete';
export type ScheduleStatus = 'active' | 'inactive';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TaskStatus = 'active' | 'inactive';

export interface Organisation {
  id: string;
  org: string;
  subdomain: string;
  tier: OrgTier;
  status: OrgStatus;
  archivedAt: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: UserRole;
  archivedAt: string | null;
  createdAt: string;
}

export interface Client {
  id: string;
  orgId: string;
  name: string;
  reference: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  orgId: string;
  clientId: string | null;
  workshopId: string | null;
  jobNumber: string;
  title: string;
  status: JobStatus;
  allocatedMinutes: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Workshop {
  id: string;
  orgId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface Screen {
  id: string;
  orgId: string;
  workshopId: string | null;
  name: string;
  deviceToken: string;
  lastSeenAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface ScheduleDay {
  start: string;
  end: string;
  breakMinutes: number;
}

export interface Schedule {
  id: string;
  orgId: string;
  name: string;
  status: ScheduleStatus;
  days: Partial<Record<Weekday, ScheduleDay>>;
  archivedAt: string | null;
  createdAt: string;
}

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface Task {
  id: string;
  orgId: string;
  name: string;
  status: TaskStatus;
  archivedAt: string | null;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  orgId: string;
  userId: string;
  jobId: string | null;
  workshopId: string | null;
  clockIn: string;
  clockOut: string | null;
  manual: boolean;
  createdBy: string | null;
  createdAt: string;
}

export type AttachmentKind = 'note' | 'photo' | 'file';

export interface JobAttachment {
  id: string;
  orgId: string;
  jobId: string;
  kind: AttachmentKind;
  text: string;
  dataUrl: string | null;
  /** Original filename, for non-image file attachments. */
  fileName: string | null;
  createdByName: string;
  createdAt: string;
}

export interface ActivityLogEntry {
  id: string;
  orgId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  detail?: string;
  at: string;
}

export type ReportPeriod = 'week' | 'month' | 'all';

// ── Mappers: API camelCase -> page shapes ────────────────────────────────────

function toOrganisation(t: api.ApiTenant): Organisation {
  return {
    id: t.id,
    org: t.org,
    subdomain: t.subdomain,
    tier: t.tier,
    status: t.status,
    archivedAt: t.archivedAt,
    createdAt: t.createdAt,
  };
}

function toAdminUser(u: api.ApiUser): AdminUser {
  return {
    id: u.id,
    orgId: u.tenantId,
    name: u.displayName,
    email: u.email,
    role: u.role,
    archivedAt: u.archivedAt,
    createdAt: u.createdAt,
  };
}

function toClient(c: api.ApiClient): Client {
  return {
    id: c.id,
    orgId: c.tenantId,
    name: c.name,
    reference: c.reference,
    archivedAt: c.archivedAt,
    createdAt: c.createdAt,
  };
}

function toJob(j: api.ApiJob): Job {
  return {
    id: j.id,
    orgId: j.tenantId,
    clientId: j.clientId,
    workshopId: j.workshopId,
    jobNumber: j.jobNumber,
    title: j.title,
    status: j.status,
    allocatedMinutes: j.allocatedMinutes,
    archivedAt: j.archivedAt,
    createdAt: j.createdAt,
  };
}

function toWorkshop(w: api.ApiWorkshop): Workshop {
  return {
    id: w.id,
    orgId: w.tenantId,
    name: w.name,
    archivedAt: w.archivedAt,
    createdAt: w.createdAt,
  };
}

function toScreen(s: api.ApiScreen): Screen {
  return {
    id: s.id,
    orgId: s.tenantId,
    workshopId: s.workshopId,
    name: s.name,
    deviceToken: s.deviceToken,
    lastSeenAt: s.lastSeenAt,
    archivedAt: s.archivedAt,
    createdAt: s.createdAt,
  };
}

function toSchedule(s: api.ApiSchedule): Schedule {
  return {
    id: s.id,
    orgId: s.tenantId,
    name: s.name,
    status: s.status,
    days: s.days,
    archivedAt: s.archivedAt,
    createdAt: s.createdAt,
  };
}

function toTask(t: api.ApiTask): Task {
  return {
    id: t.id,
    orgId: t.tenantId,
    name: t.name,
    status: t.status,
    archivedAt: t.archivedAt,
    createdAt: t.createdAt,
  };
}

function toTimeEntry(t: api.ApiTimeEntry): TimeEntry {
  return {
    id: t.id,
    orgId: t.tenantId,
    userId: t.userId,
    jobId: t.jobId,
    workshopId: t.workshopId,
    clockIn: t.clockIn,
    clockOut: t.clockOut,
    manual: t.manual,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
  };
}

// ── Caches (module-level, populated by the load* functions) ──────────────────

let orgsCache: Organisation[] = [];
let usersCache: AdminUser[] = [];
let clientsCache: Client[] = [];
let jobsCache: Job[] = [];
let workshopsCache: Workshop[] = [];
let screensCache: Screen[] = [];
let schedulesCache: Schedule[] = [];
let tasksCache: Task[] = [];
let timeEntriesCache: TimeEntry[] = [];
let activityCache: ActivityLogEntry[] = [];
// Attachments have no backend yet — session-only, cleared on reload.
const jobAttachments: JobAttachment[] = [];

// ── Current org (the logged-in tenant) ───────────────────────────────────────

export function getCurrentOrg(): Organisation {
  const session = api.getSession();
  if (session) return toOrganisation(session.tenant);
  // No session should only happen pre-login; the shell redirects in that case.
  return {
    id: '',
    org: '',
    subdomain: '',
    tier: 'clockin',
    status: 'active',
    archivedAt: null,
    createdAt: '',
  };
}

function currentActorName(): string {
  const session = api.getSession();
  return session?.user.displayName ?? 'Office';
}

// ── Organisations ────────────────────────────────────────────────────────────

/** Loads all organisations (archived included); the UI filters with the toggle. */
export async function loadOrganisations(): Promise<Organisation[]> {
  orgsCache = (await api.listOrgs(true)).map(toOrganisation);
  return orgsCache;
}

export function getOrganisations(): readonly Organisation[] {
  return orgsCache;
}

export async function createOrg(input: {
  org: string;
  subdomain: string;
  tier: OrgTier;
}): Promise<Organisation> {
  const created = toOrganisation(await api.createOrg(input));
  orgsCache = [created, ...orgsCache];
  return created;
}

export async function updateOrgTier(id: string, tier: OrgTier): Promise<Organisation> {
  const updated = toOrganisation(await api.updateOrgTier(id, tier));
  replaceInCache(orgsCache, updated);
  return updated;
}

export async function pauseOrg(id: string): Promise<Organisation> {
  const updated = toOrganisation(await api.updateOrgStatus(id, 'paused'));
  replaceInCache(orgsCache, updated);
  return updated;
}

export async function resumeOrg(id: string): Promise<Organisation> {
  const updated = toOrganisation(await api.updateOrgStatus(id, 'active'));
  replaceInCache(orgsCache, updated);
  return updated;
}

/** Soft-delete: archives the org but keeps it in the cache so it can be restored. */
export async function deleteOrg(id: string): Promise<void> {
  const updated = toOrganisation(await api.deleteOrg(id));
  replaceInCache(orgsCache, updated);
}

export async function restoreOrg(id: string): Promise<Organisation> {
  const updated = toOrganisation(await api.restoreOrg(id));
  replaceInCache(orgsCache, updated);
  return updated;
}

// ── Users ────────────────────────────────────────────────────────────────────

/** Loads all users (archived included); the UI filters with the toggle. */
export async function loadUsers(): Promise<AdminUser[]> {
  usersCache = (await api.listUsers(true)).map(toAdminUser);
  return usersCache;
}

export function getUsers(): readonly AdminUser[] {
  return usersCache;
}

export function getUserById(id: string): AdminUser | undefined {
  return usersCache.find((u) => u.id === id);
}

export async function addUser(input: {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}): Promise<AdminUser> {
  const created = toAdminUser(
    await api.createUser({
      email: input.email,
      displayName: input.name,
      role: input.role,
      password: input.password,
    }),
  );
  usersCache = [created, ...usersCache];
  return created;
}

export async function archiveUser(id: string): Promise<void> {
  const updated = toAdminUser(await api.archiveUser(id));
  replaceInCache(usersCache, updated);
}

export async function restoreUser(id: string): Promise<void> {
  const updated = toAdminUser(await api.restoreUser(id));
  replaceInCache(usersCache, updated);
}

export async function changeUserRole(id: string, role: UserRole): Promise<void> {
  const updated = toAdminUser(await api.updateUser(id, { role }));
  replaceInCache(usersCache, updated);
}

export async function setUserPassword(id: string, password: string): Promise<void> {
  await api.updateUser(id, { password });
}

// ── Clients ──────────────────────────────────────────────────────────────────

export async function loadClients(): Promise<Client[]> {
  clientsCache = (await api.listClients(true)).map(toClient);
  return clientsCache;
}

export function getClients(): readonly Client[] {
  return clientsCache;
}

export function getClientById(id: string): Client | undefined {
  return clientsCache.find((c) => c.id === id);
}

export async function addClient(input: {
  name: string;
  reference?: string | null;
}): Promise<Client> {
  const created = toClient(await api.createClient(input));
  clientsCache = [created, ...clientsCache];
  return created;
}

export async function updateClient(
  id: string,
  input: { name?: string; reference?: string | null },
): Promise<Client> {
  const updated = toClient(await api.updateClient(id, input));
  replaceInCache(clientsCache, updated);
  return updated;
}

export async function archiveClient(id: string): Promise<void> {
  const updated = toClient(await api.archiveClient(id));
  replaceInCache(clientsCache, updated);
}

export async function restoreClient(id: string): Promise<void> {
  const updated = toClient(await api.restoreClient(id));
  replaceInCache(clientsCache, updated);
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export async function loadJobs(): Promise<Job[]> {
  jobsCache = (await api.listJobs(true)).map(toJob);
  return jobsCache;
}

export function getJobs(): readonly Job[] {
  return jobsCache;
}

export function getJobById(id: string): Job | undefined {
  return jobsCache.find((j) => j.id === id);
}

export async function addJob(input: {
  jobNumber: string;
  title: string;
  clientId?: string | null;
  workshopId?: string | null;
  allocatedMinutes?: number;
}): Promise<Job> {
  const created = toJob(await api.createJob(input));
  jobsCache = [created, ...jobsCache];
  return created;
}

export type JobTimeSummary = api.ApiJobTimeSummary;

export function getJobTimeSummary(id: string): Promise<JobTimeSummary> {
  return api.getJobTimeSummary(id);
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<void> {
  const updated = toJob(await api.updateJob(id, { status }));
  replaceInCache(jobsCache, updated);
}

export async function updateJob(
  id: string,
  input: { title?: string; status?: JobStatus; workshopId?: string | null; allocatedMinutes?: number },
): Promise<Job> {
  const updated = toJob(await api.updateJob(id, input));
  replaceInCache(jobsCache, updated);
  return updated;
}

export async function archiveJob(id: string): Promise<void> {
  const updated = toJob(await api.archiveJob(id));
  replaceInCache(jobsCache, updated);
}

export async function restoreJob(id: string): Promise<void> {
  const updated = toJob(await api.restoreJob(id));
  replaceInCache(jobsCache, updated);
}

// ── Workshops ────────────────────────────────────────────────────────────────

export async function loadWorkshops(): Promise<Workshop[]> {
  workshopsCache = (await api.listWorkshops(true)).map(toWorkshop);
  return workshopsCache;
}

export function getWorkshops(): readonly Workshop[] {
  return workshopsCache;
}

export function getWorkshopById(id: string): Workshop | undefined {
  return workshopsCache.find((w) => w.id === id);
}

export async function addWorkshop(input: { name: string }): Promise<Workshop> {
  const created = toWorkshop(await api.createWorkshop(input));
  workshopsCache = [created, ...workshopsCache];
  return created;
}

export async function updateWorkshop(
  id: string,
  input: { name?: string },
): Promise<Workshop> {
  const updated = toWorkshop(await api.updateWorkshop(id, input));
  replaceInCache(workshopsCache, updated);
  return updated;
}

export async function archiveWorkshop(id: string): Promise<void> {
  const updated = toWorkshop(await api.archiveWorkshop(id));
  replaceInCache(workshopsCache, updated);
}

export async function restoreWorkshop(id: string): Promise<void> {
  const updated = toWorkshop(await api.restoreWorkshop(id));
  replaceInCache(workshopsCache, updated);
}

// ── Screens / kiosk devices ──────────────────────────────────────────────────

export async function loadScreens(): Promise<Screen[]> {
  screensCache = (await api.listScreens(true)).map(toScreen);
  return screensCache;
}

export function getScreens(): readonly Screen[] {
  return screensCache;
}

export function getScreenById(id: string): Screen | undefined {
  return screensCache.find((s) => s.id === id);
}

export async function addScreen(input: {
  name: string;
  workshopId?: string | null;
}): Promise<Screen> {
  const created = toScreen(await api.createScreen(input));
  screensCache = [created, ...screensCache];
  return created;
}

export async function updateScreen(
  id: string,
  input: { name?: string; workshopId?: string | null },
): Promise<Screen> {
  const updated = toScreen(await api.updateScreen(id, input));
  replaceInCache(screensCache, updated);
  return updated;
}

export async function archiveScreen(id: string): Promise<void> {
  const updated = toScreen(await api.archiveScreen(id));
  replaceInCache(screensCache, updated);
}

export async function restoreScreen(id: string): Promise<void> {
  const updated = toScreen(await api.restoreScreen(id));
  replaceInCache(screensCache, updated);
}

// ── Schedules ────────────────────────────────────────────────────────────────

export async function loadSchedules(): Promise<Schedule[]> {
  schedulesCache = (await api.listSchedules(true)).map(toSchedule);
  return schedulesCache;
}

export function getSchedules(): readonly Schedule[] {
  return schedulesCache;
}

export function getScheduleById(id: string): Schedule | undefined {
  return schedulesCache.find((s) => s.id === id);
}

export async function addSchedule(input: {
  name: string;
  status?: ScheduleStatus;
  days: Partial<Record<Weekday, ScheduleDay>>;
}): Promise<Schedule> {
  const created = toSchedule(await api.createSchedule(input));
  schedulesCache = [created, ...schedulesCache];
  return created;
}

export async function updateSchedule(
  id: string,
  input: {
    name?: string;
    status?: ScheduleStatus;
    days?: Partial<Record<Weekday, ScheduleDay>>;
  },
): Promise<Schedule> {
  const updated = toSchedule(await api.updateSchedule(id, input));
  replaceInCache(schedulesCache, updated);
  return updated;
}

export async function archiveSchedule(id: string): Promise<void> {
  const updated = toSchedule(await api.archiveSchedule(id));
  replaceInCache(schedulesCache, updated);
}

export async function restoreSchedule(id: string): Promise<void> {
  const updated = toSchedule(await api.restoreSchedule(id));
  replaceInCache(schedulesCache, updated);
}

/** Total worked hours in a week for a schedule (band minus breaks), and break hours. */
export function scheduleTotals(s: Schedule): { weeklyHours: number; breakHours: number } {
  let workedMin = 0;
  let breakMin = 0;
  for (const day of WEEKDAYS) {
    const d = s.days[day];
    if (!d) continue;
    const band = dayMinutes(d.end) - dayMinutes(d.start);
    if (band <= 0) continue;
    breakMin += d.breakMinutes;
    workedMin += band - d.breakMinutes;
  }
  return { weeklyHours: workedMin / 60, breakHours: breakMin / 60 };
}

function dayMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function loadTasks(): Promise<Task[]> {
  tasksCache = (await api.listTasks(true)).map(toTask);
  return tasksCache;
}

export function getTasks(): readonly Task[] {
  return tasksCache;
}

export function getTaskById(id: string): Task | undefined {
  return tasksCache.find((t) => t.id === id);
}

export async function addTask(input: {
  name: string;
  status?: TaskStatus;
}): Promise<Task> {
  const created = toTask(await api.createTask(input));
  tasksCache = [created, ...tasksCache];
  return created;
}

export async function updateTask(
  id: string,
  input: { name?: string; status?: TaskStatus },
): Promise<Task> {
  const updated = toTask(await api.updateTask(id, input));
  replaceInCache(tasksCache, updated);
  return updated;
}

export async function archiveTask(id: string): Promise<void> {
  const updated = toTask(await api.archiveTask(id));
  replaceInCache(tasksCache, updated);
}

export async function restoreTask(id: string): Promise<void> {
  const updated = toTask(await api.restoreTask(id));
  replaceInCache(tasksCache, updated);
}

// ── Job attachments (notes + photos): session-only, no backend ───────────────

export function getJobAttachments(jobId: string): readonly JobAttachment[] {
  const orgId = getCurrentOrg().id;
  return jobAttachments
    .filter((a) => a.jobId === jobId && a.orgId === orgId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countJobAttachments(jobId: string): number {
  const orgId = getCurrentOrg().id;
  return jobAttachments.filter((a) => a.jobId === jobId && a.orgId === orgId).length;
}

export function addJobNote(jobId: string, text: string): JobAttachment {
  const note: JobAttachment = {
    id: localId('at'),
    orgId: getCurrentOrg().id,
    jobId,
    kind: 'note',
    text: text.trim(),
    dataUrl: null,
    fileName: null,
    createdByName: currentActorName(),
    createdAt: new Date().toISOString(),
  };
  jobAttachments.push(note);
  return note;
}

export function addJobPhoto(
  jobId: string,
  input: { dataUrl: string; caption: string },
): JobAttachment {
  const photo: JobAttachment = {
    id: localId('at'),
    orgId: getCurrentOrg().id,
    jobId,
    kind: 'photo',
    text: input.caption.trim(),
    dataUrl: input.dataUrl,
    fileName: null,
    createdByName: currentActorName(),
    createdAt: new Date().toISOString(),
  };
  jobAttachments.push(photo);
  return photo;
}

/** Attach any non-image document (PDF, Word, spreadsheet, etc.) to a job. */
export function addJobFile(
  jobId: string,
  input: { dataUrl: string; fileName: string; caption: string },
): JobAttachment {
  const file: JobAttachment = {
    id: localId('at'),
    orgId: getCurrentOrg().id,
    jobId,
    kind: 'file',
    text: input.caption.trim(),
    dataUrl: input.dataUrl,
    fileName: input.fileName,
    createdByName: currentActorName(),
    createdAt: new Date().toISOString(),
  };
  jobAttachments.push(file);
  return file;
}

// ── Time entries ─────────────────────────────────────────────────────────────

export async function loadTimeEntries(): Promise<TimeEntry[]> {
  timeEntriesCache = (await api.listTimeEntries())
    .map(toTimeEntry)
    .sort((a, b) => b.clockIn.localeCompare(a.clockIn));
  return timeEntriesCache;
}

export function getTimeEntries(): readonly TimeEntry[] {
  return timeEntriesCache;
}

export function getManualTimeEntries(): readonly TimeEntry[] {
  return timeEntriesCache.filter((t) => t.manual);
}

/**
 * Completed time entries within the period, newest first. Open (not yet
 * clocked-out) shifts are excluded so report totals only count settled hours.
 */
export function getTimeEntriesInPeriod(period: ReportPeriod): readonly TimeEntry[] {
  const cutoff =
    period === 'week'
      ? Date.now() - 7 * 86_400_000
      : period === 'month'
        ? Date.now() - 30 * 86_400_000
        : 0;
  return timeEntriesCache.filter(
    (t) => t.clockOut !== null && new Date(t.clockIn).getTime() >= cutoff,
  );
}

export async function addManualTimeEntry(input: {
  userId: string;
  jobId: string | null;
  workshopId: string | null;
  clockIn: string;
  clockOut: string;
}): Promise<TimeEntry> {
  const created = toTimeEntry(await api.createManualEntry(input));
  timeEntriesCache = [created, ...timeEntriesCache].sort((a, b) =>
    b.clockIn.localeCompare(a.clockIn),
  );
  return created;
}

export async function updateTimeEntry(
  id: string,
  input: { jobId: string | null; workshopId: string | null; clockIn: string; clockOut: string | null },
): Promise<TimeEntry> {
  const updated = toTimeEntry(await api.updateTimeEntry(id, input));
  timeEntriesCache = timeEntriesCache
    .map((t) => (t.id === id ? updated : t))
    .sort((a, b) => b.clockIn.localeCompare(a.clockIn));
  return updated;
}

export async function archiveTimeEntry(id: string): Promise<void> {
  await api.archiveTimeEntry(id);
  timeEntriesCache = timeEntriesCache.filter((t) => t.id !== id);
}

// ── Activity log ─────────────────────────────────────────────────────────────

export async function loadActivityLog(): Promise<ActivityLogEntry[]> {
  // Users first, so actor ids can be resolved to display names.
  if (usersCache.length === 0) {
    try {
      await loadUsers();
    } catch {
      // Non-fatal: fall back to role/id when a name can't be resolved.
    }
  }
  activityCache = (await api.listActivity()).map(toActivityLogEntry);
  return activityCache;
}

export function getActivityLog(): readonly ActivityLogEntry[] {
  return activityCache;
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'signed in',
  'job.create': 'created',
  'job.update': 'updated',
  'job.archive': 'archived',
  'job.restore': 'restored',
  'user.create': 'added',
  'user.update': 'updated',
  'user.archive': 'archived',
  'user.restore': 'restored',
  'client.create': 'added',
  'client.update': 'updated',
  'client.archive': 'archived',
  'client.restore': 'restored',
  'org.create': 'created',
  'org.tier': 'changed the tier of',
  'org.status': 'changed the status of',
  'org.delete': 'archived',
  'org.restore': 'restored',
  'schedule.create': 'created',
  'schedule.update': 'updated',
  'schedule.archive': 'archived',
  'schedule.restore': 'restored',
  'task.create': 'created',
  'task.update': 'updated',
  'task.archive': 'archived',
  'task.restore': 'restored',
  'workshop.create': 'created',
  'workshop.update': 'updated',
  'workshop.archive': 'archived',
  'workshop.restore': 'restored',
  'screen.create': 'registered',
  'screen.update': 'updated',
  'screen.archive': 'archived',
  'screen.restore': 'restored',
  'time.manual': 'manually logged',
};

const ENTITY_LABELS: Record<string, string> = {
  job: 'job',
  user: 'user',
  client: 'client',
  tenant: 'organisation',
  schedule: 'schedule',
  task: 'task',
  workshop: 'workshop',
  screen: 'screen',
  time_entry: 'time entry',
};

function toActivityLogEntry(a: ApiActivityEntry): ActivityLogEntry {
  const actor = a.actorId ? getUserById(a.actorId) : undefined;
  const actorName = actor?.name ?? (a.actorRole ? roleLabel(a.actorRole) : 'System');
  const entityType = a.entityType
    ? (ENTITY_LABELS[a.entityType] ?? a.entityType.replace(/_/g, ' '))
    : '';
  return {
    id: a.id,
    orgId: a.tenantId,
    actorId: a.actorId ?? '',
    actorName,
    action: ACTION_LABELS[a.action] ?? a.action.replace(/\./g, ' '),
    entityType,
    entityId: a.entityId ?? '',
    detail: describeDetail(a.detail),
    at: a.createdAt,
  };
}

function describeDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object') {
    const parts = Object.entries(detail as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${String(v)}`);
    return parts.length ? parts.join(', ') : undefined;
  }
  return String(detail);
}

// ── Small helpers ────────────────────────────────────────────────────────────

function replaceInCache<T extends { id: string }>(cache: T[], next: T): void {
  const i = cache.findIndex((x) => x.id === next.id);
  if (i >= 0) cache[i] = next;
}

function localId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
