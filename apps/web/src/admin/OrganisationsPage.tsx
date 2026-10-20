/**
 * Organisations page — list of all tenants with a working "New organisation"
 * flow. Creating an org writes to the mock store (which logs to activity).
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  createOrg,
  deleteOrg,
  getCurrentOrg,
  getOrganisations,
  loadOrganisations,
  pauseOrg,
  restoreOrg,
  resumeOrg,
  updateOrgTier,
} from './adminStore';
import type { OrgTier, Organisation } from './adminStore';
import { Badge, StatusBadge, TierBadge, Modal, SelectField, ConfirmDialog } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function OrganisationsPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pendingTier, setPendingTier] = useState<Organisation | null>(null);
  const [switching, setSwitching] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Organisation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingPause, setPendingPause] = useState<Organisation | null>(null);
  const [pausing, setPausing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  async function confirmPause() {
    if (!pendingPause) return;
    setPausing(true);
    try {
      await pauseOrg(pendingPause.id);
      toast.success(`${pendingPause.org} has been paused and can no longer sign in.`);
      setPendingPause(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not pause the organisation.');
    } finally {
      setPausing(false);
    }
  }

  async function handleResume(o: Organisation) {
    try {
      await resumeOrg(o.id);
      toast.success(`${o.org} is active again.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resume the organisation.');
    }
  }

  async function handleRestore(o: Organisation) {
    try {
      await restoreOrg(o.id);
      toast.success(`${o.org} has been restored.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the organisation.');
    }
  }

  async function confirmTierChange() {
    if (!pendingTier) return;
    const next: OrgTier = pendingTier.tier === 'production' ? 'clockin' : 'production';
    setSwitching(true);
    try {
      await updateOrgTier(pendingTier.id, next);
      toast.success(
        next === 'production'
          ? `${pendingTier.org} upgraded to the full version.`
          : `${pendingTier.org} moved to clock-in only.`,
      );
      setPendingTier(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the tier.');
    } finally {
      setSwitching(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteOrg(pendingDelete.id);
      toast.success(`${pendingDelete.org} has been deleted. You can restore it from Show archived.`);
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the organisation.');
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadOrganisations()
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const currentOrgId = getCurrentOrg().id;
  const orgs = getOrganisations().filter((o) => (showArchived ? true : o.archivedAt === null));

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Organisations</h1>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          New organisation
        </Button>
      </div>

      <div className="admin__toolbar">
        <label className="admin__toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="admin__card">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Subdomain</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="admin__empty">
                    {loading ? 'Loading organisations…' : error ? error : 'No organisations yet.'}
                  </div>
                </td>
              </tr>
            )}
            {orgs.map((o) => {
              const archived = o.archivedAt !== null;
              return (
                <tr key={o.id} className={archived ? 'is-archived' : undefined}>
                  <td>
                    <span className="admin__strong">{o.org}</span>
                  </td>
                  <td>
                    <span className="admin__sub">{o.subdomain}.opt.app</span>
                  </td>
                  <td><TierBadge tier={o.tier} /></td>
                  <td>{archived ? <Badge tone="rose">Archived</Badge> : <StatusBadge status={o.status} />}</td>
                  <td><span className="admin__sub">{formatDate(o.createdAt)}</span></td>
                  <td>
                    <div className="admin__actions">
                      {archived ? (
                        <button
                          className="admin__link-btn admin__link-btn--sky"
                          onClick={() => handleRestore(o)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className={`admin__link-btn ${o.tier === 'production' ? 'admin__link-btn--rose' : 'admin__link-btn--sky'}`}
                            onClick={() => setPendingTier(o)}
                          >
                            {o.tier === 'production' ? 'Move to clock-in' : 'Upgrade to full'}
                          </button>
                          {o.id !== currentOrgId &&
                            (o.status === 'active' ? (
                              <button
                                className="admin__link-btn"
                                onClick={() => setPendingPause(o)}
                              >
                                Pause
                              </button>
                            ) : (
                              <button
                                className="admin__link-btn admin__link-btn--sky"
                                onClick={() => handleResume(o)}
                              >
                                Resume
                              </button>
                            ))}
                          {o.id !== currentOrgId && (
                            <button
                              className="admin__link-btn admin__link-btn--rose"
                              onClick={() => setPendingDelete(o)}
                            >
                              Delete
                            </button>
                          )}
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

      {open && (
        <NewOrgModal
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}

      {pendingTier && (
        <ConfirmDialog
          title={pendingTier.tier === 'production' ? 'Move to clock-in only?' : 'Upgrade to full version?'}
          message={
            pendingTier.tier === 'production'
              ? `${pendingTier.org} will lose access to jobs, clients and reports. Their staff, time history and data are all kept and come straight back if you upgrade again.`
              : `${pendingTier.org} will unlock jobs, clients and reports on top of clock-in. Nothing about their existing data changes.`
          }
          confirmLabel={pendingTier.tier === 'production' ? 'Move to clock-in' : 'Upgrade'}
          busy={switching}
          onConfirm={confirmTierChange}
          onCancel={() => setPendingTier(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.org}?`}
          message={`${pendingDelete.org} will be removed from the console and can no longer sign in. All of its staff, jobs, time history and activity are kept, and you can bring it back any time from Show archived.`}
          confirmLabel="Delete organisation"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingPause && (
        <ConfirmDialog
          title={`Pause ${pendingPause.org}?`}
          message={`${pendingPause.org} will stay in the console but nobody there can sign in until you resume it. Their data is untouched and one click brings them back.`}
          confirmLabel="Pause organisation"
          busy={pausing}
          onConfirm={confirmPause}
          onCancel={() => setPendingPause(null)}
        />
      )}
    </div>
  );
}

function NewOrgModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [tier, setTier] = useState<OrgTier>('clockin');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedSub = subdomain.trim().toLowerCase();
    if (!trimmedName) {
      setError('Give the organisation a name.');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(trimmedSub)) {
      setError('Subdomain can only use lowercase letters, numbers and hyphens.');
      return;
    }
    if (getOrganisations().some((o) => o.subdomain === trimmedSub)) {
      setError('That subdomain is already taken.');
      return;
    }
    setSaving(true);
    try {
      await createOrg({ org: trimmedName, subdomain: trimmedSub, tier });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the organisation.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New organisation"
      description="Spin up a new tenant. Everything is recoverable and every change is logged."
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-org-name">Organisation name</label>
        <input
          id="new-org-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Harbour Engineering"
          autoFocus
        />
      </div>

      <div className="admin__field">
        <label className="admin__field-label" htmlFor="new-org-sub">Subdomain</label>
        <input
          id="new-org-sub"
          className="admin__input"
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
          placeholder="harbour"
        />
      </div>

      <SelectField
        id="new-org-tier"
        label="Tier"
        value={tier}
        onChange={(e) => setTier(e.target.value as OrgTier)}
      >
        <option value="clockin">Clock-in</option>
        <option value="production">Production</option>
      </SelectField>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Creating…' : 'Create organisation'}
        </Button>
      </div>
    </Modal>
  );
}
