/**
 * Jobs page — jobs in the CURRENT organisation.
 * Add job (client field is OPTIONAL — not required), archive and restore.
 * Every action writes to the activity log via the store.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getJobs,
  loadJobs,
  addJob,
  updateJobStatus,
  updateJob,
  archiveJob,
  restoreJob,
  getJobById,
  getJobTimeSummary,
  getJobAttachments,
  countJobAttachments,
  addJobNote,
  addJobPhoto,
  addJobFile,
  getClients,
  loadClients,
  getClientById,
  getWorkshops,
  loadWorkshops,
  getWorkshopById,
} from './adminStore';
import type { Job, JobTimeSummary } from './adminStore';
import { JobStatusBadge, Badge, Modal, ConfirmDialog, SelectField } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';
import { toCsv, downloadCsv, todayStamp } from './csv';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function JobsPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingArchive, setPendingArchive] = useState<Job | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadJobs(), loadClients(), loadWorkshops()])
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getJobs();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((j) => (showArchived ? true : j.archivedAt === null))
    .filter((j) => !q || j.jobNumber.toLowerCase().includes(q) || j.title.toLowerCase().includes(q));

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveJob(pendingArchive.id);
      toast.success(`Archived #${pendingArchive.jobNumber}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the job.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(j: Job) {
    try {
      await restoreJob(j.id);
      toast.success(`Restored #${j.jobNumber}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the job.');
    }
  }

  async function handleToggleStatus(j: Job) {
    const next = j.status === 'complete' ? 'active' : 'complete';
    try {
      await updateJobStatus(j.id, next);
      toast.success(next === 'complete' ? `Marked #${j.jobNumber} complete.` : `Reopened #${j.jobNumber}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the job.');
    }
  }

  function handleExport() {
    if (visible.length === 0) {
      toast.error('Nothing to export.');
      return;
    }
    const csv = toCsv<Job>(
      [
        { header: 'Job number', value: (j) => j.jobNumber },
        { header: 'Title', value: (j) => j.title },
        { header: 'Client', value: (j) => (j.clientId ? getClientById(j.clientId)?.name ?? '' : '') },
        { header: 'Workshop', value: (j) => (j.workshopId ? getWorkshopById(j.workshopId)?.name ?? '' : '') },
        { header: 'Status', value: (j) => (j.archivedAt ? 'Archived' : j.status) },
        { header: 'Created', value: (j) => formatDate(j.createdAt) },
      ],
      visible,
    );
    downloadCsv(`jobs-${todayStamp()}.csv`, csv);
    toast.success(`Exported ${visible.length} ${visible.length === 1 ? 'job' : 'jobs'}.`);
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Jobs</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Add job
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by number or title"
          aria-label="Search jobs"
        />
        <label className="admin__toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <Button variant="ghost" onClick={handleExport} style={{ marginLeft: 'auto' }}>
          Export CSV
        </Button>
      </div>

      <div className="admin__card">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Job no.</th>
              <th>Title</th>
              <th>Client</th>
              <th>Workshop</th>
              <th>Status</th>
              <th>Files</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="admin__empty">
                    {loading
                      ? 'Loading jobs…'
                      : error
                        ? error
                        : q
                          ? 'No jobs match your search.'
                          : 'No jobs to show.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((j) => {
              const archived = j.archivedAt !== null;
              const files = countJobAttachments(j.id);
              const client = j.clientId ? getClientById(j.clientId) : undefined;
              const workshop = j.workshopId ? getWorkshopById(j.workshopId) : undefined;
              return (
                <tr
                  key={j.id}
                  className={`admin__row-click${archived ? ' is-archived' : ''}`}
                  onClick={() => setOpenJobId(j.id)}
                >
                  <td><span className="opt-mono admin__strong">#{j.jobNumber}</span></td>
                  <td><span className="admin__strong">{j.title}</span></td>
                  <td><span className="admin__sub">{client?.name ?? '—'}</span></td>
                  <td><span className="admin__sub">{workshop?.name ?? '—'}</span></td>
                  <td>
                    {archived ? <Badge tone="rose">Archived</Badge> : <JobStatusBadge status={j.status} />}
                  </td>
                  <td>
                    <span className="admin__sub">{files === 0 ? '—' : `${files} item${files === 1 ? '' : 's'}`}</span>
                  </td>
                  <td><span className="admin__sub">{formatDate(j.createdAt)}</span></td>
                  <td>
                    <div className="admin__actions">
                      {archived ? (
                        <button
                          className="admin__link-btn admin__link-btn--sky"
                          onClick={(e) => { e.stopPropagation(); handleRestore(j); }}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin__link-btn admin__link-btn--sky"
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(j); }}
                          >
                            {j.status === 'complete' ? 'Reopen' : 'Complete'}
                          </button>
                          <button
                            className="admin__link-btn admin__link-btn--rose"
                            onClick={(e) => { e.stopPropagation(); setPendingArchive(j); }}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddJobModal
          onClose={() => setAddOpen(false)}
          onAdded={(num) => {
            setAddOpen(false);
            toast.success(`Added job #${num}.`);
            refresh();
          }}
        />
      )}

      {openJobId && (
        <JobDetailModal
          jobId={openJobId}
          onClose={() => { setOpenJobId(null); refresh(); }}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archive job?"
          message={`Archive #${pendingArchive.jobNumber} ${pendingArchive.title}? Its time history is kept and it can be restored later.`}
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setPendingArchive(null)}
        />
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Minutes → "10h", "261h 15m", "45m", "0m". */
function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

function JobDetailModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [, forceRender] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => forceRender((n) => n + 1);

  const job: Job | undefined = getJobById(jobId);
  const attachments = getJobAttachments(jobId);

  const [summary, setSummary] = useState<JobTimeSummary | null>(null);
  const [allocHours, setAllocHours] = useState('');
  const [savingAlloc, setSavingAlloc] = useState(false);

  useEffect(() => {
    let active = true;
    getJobTimeSummary(jobId)
      .then((s) => active && setSummary(s))
      .catch(() => active && setSummary({ loggedMinutes: 0, staff: [], timeline: [] }));
    return () => {
      active = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (job) setAllocHours(job.allocatedMinutes ? String(job.allocatedMinutes / 60) : '');
  }, [job?.allocatedMinutes]);

  if (!job) return null;

  const workshopOptions = getWorkshops().filter(
    (w) => w.archivedAt === null || w.id === job.workshopId,
  );

  const allocatedMinutes = job.allocatedMinutes;
  const loggedMinutes = summary?.loggedMinutes ?? 0;
  const healthPct = allocatedMinutes > 0 ? Math.round((loggedMinutes / allocatedMinutes) * 100) : null;
  const healthTone = healthPct === null ? 'grey' : healthPct <= 85 ? 'flora' : healthPct <= 100 ? 'sky' : 'rose';

  // Unique days across all staff, sorted ascending, for the timeline columns.
  const days = summary
    ? [...new Set(summary.timeline.map((t) => t.day))].sort()
    : [];
  const minutesByCell = new Map(summary?.timeline.map((t) => [`${t.userId}|${t.day}`, t.minutes]));

  async function handleReassignWorkshop(next: string) {
    if (!job) return;
    try {
      await updateJob(job.id, { workshopId: next || null });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reassign the workshop.');
    }
  }

  async function handleSaveAlloc() {
    if (!job) return;
    const hrs = Number(allocHours);
    if (allocHours.trim() !== '' && (!Number.isFinite(hrs) || hrs < 0)) {
      setError('Enter a valid number of hours.');
      return;
    }
    setError('');
    setSavingAlloc(true);
    try {
      await updateJob(job.id, { allocatedMinutes: Math.round((hrs || 0) * 60) });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the allocation.');
    } finally {
      setSavingAlloc(false);
    }
  }

  function handleAddNote() {
    if (!note.trim()) { setError('Write something first.'); return; }
    setError('');
    addJobNote(jobId, note);
    setNote('');
    refresh();
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (file.type.startsWith('image/')) {
        addJobPhoto(jobId, { dataUrl, caption });
      } else {
        addJobFile(jobId, { dataUrl, fileName: file.name, caption });
      }
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      refresh();
    };
    reader.readAsDataURL(file);
  }

  return (
    <Modal
      title={`#${job.jobNumber} ${job.title}`}
      onClose={onClose}
      wide
    >
      {/* Stat cards: allocated vs logged, and job health */}
      <div className="admin__job-stats">
        <div className="admin__stat">
          <span className="admin__stat-label">Allocated</span>
          <span className="admin__stat-value">{allocatedMinutes > 0 ? formatMinutes(allocatedMinutes) : '—'}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Logged</span>
          <span className="admin__stat-value">{summary ? formatMinutes(loggedMinutes) : '…'}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Job health</span>
          <span className="admin__stat-value">{healthPct === null ? '—' : `${healthPct}%`}</span>
        </div>
      </div>

      {/* Job health bar */}
      <div className="admin__health">
        <div className={`admin__health-bar admin__health-bar--${healthTone}`}>
          <span style={{ width: `${healthPct === null ? 0 : Math.min(100, healthPct)}%` }} />
        </div>
        <p className="admin__sub">
          {healthPct === null
            ? 'Set an allocation to track this job against its budget.'
            : healthPct > 100
              ? `Over budget by ${formatMinutes(loggedMinutes - allocatedMinutes)}.`
              : `${formatMinutes(allocatedMinutes - loggedMinutes)} of the budget remaining.`}
        </p>
      </div>

      {/* Allocation editor */}
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="job-alloc">Time allocation (hours)</label>
        <div className="admin__inline-save">
          <input
            id="job-alloc"
            className="admin__input"
            type="number"
            min="0"
            step="0.25"
            value={allocHours}
            onChange={(e) => setAllocHours(e.target.value)}
            placeholder="e.g. 10"
          />
          <Button variant="primary" onClick={handleSaveAlloc} disabled={savingAlloc}>
            {savingAlloc ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Team timeline */}
      <div className="admin__section-head">Team timeline</div>
      {summary === null ? (
        <div className="admin__empty" style={{ padding: '16px 0' }}>Loading time…</div>
      ) : days.length === 0 ? (
        <div className="admin__empty" style={{ padding: '16px 0' }}>No time logged on this job yet.</div>
      ) : (
        <div className="admin__timeline-scroll">
          <table className="admin__timeline">
            <thead>
              <tr>
                <th className="admin__timeline-name">Staff</th>
                {days.map((d) => (
                  <th key={d}>{new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.staff.map((s) => (
                <tr key={s.userId}>
                  <td className="admin__timeline-name">{s.displayName}</td>
                  {days.map((d) => {
                    const mins = minutesByCell.get(`${s.userId}|${d}`) ?? 0;
                    return (
                      <td key={d} className={mins > 0 ? 'admin__timeline-on' : undefined}>
                        {mins > 0 ? formatMinutes(mins) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Time logging breakdown (per staff) */}
      <div className="admin__section-head">Time logging breakdown</div>
      {summary === null ? (
        <div className="admin__empty" style={{ padding: '16px 0' }}>Loading…</div>
      ) : summary.staff.length === 0 ? (
        <div className="admin__empty" style={{ padding: '16px 0' }}>Nobody has logged time yet.</div>
      ) : (
        <div className="admin__breakdown">
          {summary.staff.map((s) => (
            <div key={s.userId} className="admin__breakdown-row">
              <span className="admin__breakdown-name">{s.displayName}</span>
              <span className="admin__breakdown-bar">
                <span style={{ width: `${loggedMinutes > 0 ? Math.round((s.minutes / loggedMinutes) * 100) : 0}%` }} />
              </span>
              <span className="admin__breakdown-val">{formatMinutes(s.minutes)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Workshop assignment */}
      <SelectField
        label="Workshop"
        id="job-workshop"
        value={job.workshopId ?? ''}
        onChange={(e) => handleReassignWorkshop(e.target.value)}
      >
        <option value="">No workshop</option>
        {workshopOptions.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </SelectField>

      {/* Add note */}
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="job-note">Add a note</label>
        <textarea
          id="job-note"
          className="admin__textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Client approved the finish, ready for collection Friday."
          rows={3}
        />
        <div style={{ marginTop: 10 }}>
          <Button variant="primary" onClick={handleAddNote}>Add note</Button>
        </div>
      </div>

      {/* Add attachment (photo or document) */}
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="job-att-cap">Add a file</label>
        <input
          id="job-att-cap"
          className="admin__input"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption"
        />
        <div style={{ marginTop: 10 }}>
          <input
            ref={fileRef}
            type="file"
            onChange={handlePickFile}
            style={{ display: 'none' }}
          />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>Choose file</Button>
        </div>
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      {/* Attachments list */}
      <div className="admin__att-list">
        {attachments.length === 0 ? (
          <div className="admin__empty" style={{ padding: '24px 0' }}>Nothing attached yet.</div>
        ) : (
          attachments.map((a) => (
            <div key={a.id} className="admin__att">
              {a.kind === 'photo' && a.dataUrl ? (
                <img className="admin__att-thumb" src={a.dataUrl} alt={a.text || 'Job photo'} />
              ) : a.kind === 'file' && a.dataUrl ? (
                <a className="admin__att-file" href={a.dataUrl} download={a.fileName ?? 'attachment'}>
                  {a.fileName ?? 'Download file'}
                </a>
              ) : (
                <div className="admin__att-note">{a.text}</div>
              )}
              <div className="admin__att-meta">
                <Badge tone={a.kind === 'photo' ? 'sky' : a.kind === 'file' ? 'flora' : 'grey'}>
                  {a.kind === 'photo' ? 'Photo' : a.kind === 'file' ? 'File' : 'Note'}
                </Badge>
                {a.kind !== 'note' && a.text ? <span className="admin__att-cap">{a.text}</span> : null}
                <span className="admin__sub">{a.createdByName} · {formatDateTime(a.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

/** Next job number: one past the highest numeric job number in use, else 1001. */
function suggestJobNumber(): string {
  const nums = getJobs()
    .map((j) => parseInt(j.jobNumber, 10))
    .filter((n) => Number.isFinite(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1001;
  return String(next);
}

function AddJobModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (jobNumber: string) => void;
}) {
  const [jobNumber] = useState(suggestJobNumber);
  const [title, setTitle] = useState('');
  // Client is OPTIONAL by design — a job can exist without one.
  const [clientId, setClientId] = useState('');
  // Workshop is OPTIONAL — a job can be assigned to a floor later.
  const [workshopId, setWorkshopId] = useState('');
  const [allocHours, setAllocHours] = useState('');
  const [error, setError] = useState('');

  const [saving, setSaving] = useState(false);

  const clientOptions = getClients().filter((c) => c.archivedAt === null);
  const workshopOptions = getWorkshops().filter((w) => w.archivedAt === null);

  async function handleSave() {
    const t = title.trim();
    if (!t) { setError('Enter a job title.'); return; }
    // Recompute at save so the number stays correct if jobs changed while the
    // modal was open; the field itself is auto-assigned and not user-editable.
    const num = suggestJobNumber();
    const hrs = Number(allocHours);
    if (allocHours.trim() !== '' && (!Number.isFinite(hrs) || hrs < 0)) {
      setError('Enter a valid number of allocated hours.');
      return;
    }
    setSaving(true);
    try {
      await addJob({
        jobNumber: num,
        title: t,
        clientId: clientId || null,
        workshopId: workshopId || null,
        allocatedMinutes: allocHours.trim() === '' ? 0 : Math.round(hrs * 60),
      });
      onAdded(num);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the job.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add job"
      description="Add a job for the floor. The client is optional."
      onClose={onClose}
    >
      <div className="admin__form-row">
        <div className="admin__field">
          <label className="admin__field-label" htmlFor="new-job-num">Job number</label>
          <input
            id="new-job-num"
            className="admin__input"
            value={jobNumber}
            readOnly
            aria-describedby="new-job-num-hint"
            style={{ color: 'var(--muted)', cursor: 'default' }}
          />
          <span id="new-job-num-hint" className="admin__field-hint">Assigned automatically</span>
        </div>
        <SelectField
          label="Client (optional)"
          id="new-job-client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">No client</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-job-title">Title</label>
        <input
          id="new-job-title"
          className="admin__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Frame Assembly"
        />
      </div>

      <SelectField
        label="Workshop (optional)"
        id="new-job-workshop"
        value={workshopId}
        onChange={(e) => setWorkshopId(e.target.value)}
      >
        <option value="">No workshop</option>
        {workshopOptions.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </SelectField>

      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-job-alloc">Time allocation (hours, optional)</label>
        <input
          id="new-job-alloc"
          className="admin__input"
          type="number"
          min="0"
          step="0.25"
          value={allocHours}
          onChange={(e) => setAllocHours(e.target.value)}
          placeholder="e.g. 10"
        />
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Adding…' : 'Add job'}
        </Button>
      </div>
    </Modal>
  );
}
