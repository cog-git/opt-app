/**
 * Small sync-status badge for the kiosk footer.
 * Shows queue length and online/offline state.
 */

import { useSyncStatus } from './useSyncStatus';

export function SyncBadge() {
  const { queued, online, syncing } = useSyncStatus();

  const label = syncing
    ? 'Syncing…'
    : queued === 0
    ? 'All synced'
    : `${queued} event${queued === 1 ? '' : 's'} queued`;

  const dot = syncing ? 'var(--sky)' : queued === 0 ? 'var(--flora-deep)' : 'var(--rose-deep)';
  const sub = online ? 'online' : 'offline';

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 20,
      padding: '7px 14px',
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--ink)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dot,
        flexShrink: 0,
      }} />
      {label}
      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>·</span>
      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{sub}</span>
    </div>
  );
}
