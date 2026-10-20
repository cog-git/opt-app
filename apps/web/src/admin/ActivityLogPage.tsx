/**
 * Activity log — reverse-chronological audit feed for the CURRENT organisation.
 * Read-only. Demonstrates full admin tracking: every create / edit / archive /
 * restore / manual log lands here.
 */

import { useEffect, useState } from 'react';
import { getActivityLog, loadActivityLog } from './adminStore';
import { Badge } from './components';
import { useOrgScope } from './AdminLayout';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActivityLogPage() {
  const { version } = useOrgScope();
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadActivityLog()
      .then(() => active && (setError(''), setLoading(false), setTick((n) => n + 1)))
      .catch((e) => active && (setError(String(e.message ?? e)), setLoading(false)));
    return () => {
      active = false;
    };
  }, [version]);

  void tick;
  const entries = getActivityLog();

  return (
    <div>
      <div className="admin__page-head">
        <div>
          <h1>Activity log</h1>
        </div>
      </div>

      <div className="admin__card">
        <div className="admin__feed">
          {entries.length === 0 && (
            <div className="admin__empty">
              {loading ? 'Loading activity…' : error ? error : 'No activity recorded yet.'}
            </div>
          )}
          {entries.map((e) => (
            <div key={e.id} className="admin__feed-item">
              <div className="admin__feed-av">{initials(e.actorName)}</div>
              <div className="admin__feed-body">
                <div className="l1">
                  <b>{e.actorName}</b> {e.action}{' '}
                  <Badge tone="grey">{e.entityType}</Badge>
                </div>
                {e.detail ? <div className="l2">{e.detail}</div> : null}
              </div>
              <div className="admin__feed-time">{formatWhen(e.at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
