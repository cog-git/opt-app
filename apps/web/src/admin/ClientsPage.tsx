/**
 * Clients page — customers/accounts in the CURRENT organisation.
 * Add client, edit details, archive (soft-delete) and restore. Never a hard
 * delete; every action writes to the activity log via the store.
 */

import { useEffect, useState } from 'react';
import { Button } from '@opt/ui';
import {
  getClients,
  loadClients,
  addClient,
  updateClient,
  archiveClient,
  restoreClient,
} from './adminStore';
import type { Client } from './adminStore';
import { Badge, Modal, ConfirmDialog } from './components';
import { PlusIcon } from './adminIcons';
import { useOrgScope } from './AdminLayout';
import { useToast } from './toast';
import { toCsv, downloadCsv, todayStamp } from './csv';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function ClientsPage() {
  const { version } = useOrgScope();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [query, setQuery] = useState('');
  const [pendingArchive, setPendingArchive] = useState<Client | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadClients()
      .then(() => active && (setError(''), setLoading(false), refresh()))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const all = getClients();
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((c) => (showArchived ? true : c.archivedAt === null))
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.reference ?? '').toLowerCase().includes(q),
    );

  async function confirmArchive() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      await archiveClient(pendingArchive.id);
      toast.success(`Archived ${pendingArchive.name}.`);
      setPendingArchive(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the client.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(c: Client) {
    try {
      await restoreClient(c.id);
      toast.success(`Restored ${c.name}.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore the client.');
    }
  }

  function handleExport() {
    if (visible.length === 0) {
      toast.error('Nothing to export.');
      return;
    }
    const csv = toCsv<Client>(
      [
        { header: 'Name', value: (c) => c.name },
        { header: 'Reference', value: (c) => c.reference ?? '' },
        { header: 'Status', value: (c) => (c.archivedAt ? 'Archived' : 'Active') },
      ],
      visible,
    );
    downloadCsv(`clients-${todayStamp()}.csv`, csv);
    toast.success(`Exported ${visible.length} ${visible.length === 1 ? 'client' : 'clients'}.`);
  }

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Clients</h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ gap: 8 }}>
          <PlusIcon stroke="#fff" />
          Add client
        </Button>
      </div>

      <div className="admin__toolbar">
        <input
          className="admin__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or reference"
          aria-label="Search clients"
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
              <th>Name</th>
              <th>Reference</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="admin__empty">
                    {loading
                      ? 'Loading clients…'
                      : error
                        ? error
                        : q
                          ? 'No clients match your search.'
                          : 'No clients to show.'}
                  </div>
                </td>
              </tr>
            )}
            {visible.map((c) => {
              const archived = c.archivedAt !== null;
              return (
                <tr key={c.id} className={archived ? 'is-archived' : undefined}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="admin__feed-av">{initials(c.name)}</div>
                      <span className="admin__strong">{c.name}</span>
                    </div>
                  </td>
                  <td><span className="admin__sub">{c.reference || '—'}</span></td>
                  <td>
                    {archived ? <Badge tone="rose">Archived</Badge> : <Badge tone="flora">Active</Badge>}
                  </td>
                  <td>
                    <div className="admin__actions">
                      {archived ? (
                        <button
                          className="admin__link-btn admin__link-btn--sky"
                          onClick={() => handleRestore(c)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin__link-btn admin__link-btn--sky"
                            onClick={() => setEditing(c)}
                          >
                            Edit
                          </button>
                          <button
                            className="admin__link-btn admin__link-btn--rose"
                            onClick={() => setPendingArchive(c)}
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
        <ClientModal
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            toast.success(`Added ${name}.`);
            refresh();
          }}
        />
      )}

      {editing && (
        <ClientModal
          client={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            toast.success(`Updated ${name}.`);
            refresh();
          }}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archive client?"
          message={`Archive ${pendingArchive.name}? They keep all their history and can be restored later.`}
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setPendingArchive(null)}
        />
      )}
    </div>
  );
}

function ClientModal({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const editing = Boolean(client);
  const [name, setName] = useState(client?.name ?? '');
  const [reference, setReference] = useState(client?.reference ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = name.trim();
    if (!n) { setError('Enter a name.'); return; }
    const ref = reference.trim();
    if (
      !editing &&
      getClients().some(
        (c) => c.name.toLowerCase() === n.toLowerCase() && c.archivedAt === null,
      )
    ) {
      setError('A client with that name already exists in this organisation.');
      return;
    }
    setSaving(true);
    try {
      if (client) {
        await updateClient(client.id, { name: n, reference: ref || null });
      } else {
        await addClient({ name: n, reference: ref || null });
      }
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the client.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit client' : 'Add client'}
      description={editing ? 'Update this client’s details.' : 'Add a customer to this organisation.'}
      onClose={onClose}
    >
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="client-name">Name</label>
        <input
          id="client-name"
          className="admin__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hillsborough Joinery Ltd"
          autoFocus
        />
      </div>
      <div className="admin__field">
        <label className="admin__field-label" htmlFor="client-reference">Reference (optional)</label>
        <input
          id="client-reference"
          className="admin__input"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. account code or PO reference"
        />
      </div>

      {error ? <div className="admin__form-error">{error}</div> : null}

      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add client'}
        </Button>
      </div>
    </Modal>
  );
}
