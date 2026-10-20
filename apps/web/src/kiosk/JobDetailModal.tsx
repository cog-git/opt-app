/**
 * Read-only job detail sheet for the kiosk. A worker taps the "info" button on a
 * job to see its number, client, workshop, allocated time and any attachments
 * (photos, files, notes) the office added. It reuses the admin store's job and
 * attachment caches, which are populated when the kiosk is opened alongside a
 * signed-in session; with no live job it shows a gentle fallback.
 */

import { useEffect } from 'react';
import { Button } from '@opt/ui';
import {
  getJobById,
  getClientById,
  getWorkshopById,
  getJobAttachments,
} from '../admin/adminStore';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAllocated(minutes: number): string {
  if (!minutes) return 'Not set';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 15 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function JobDetailModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  // Close on Escape for keyboard/kiosk-with-keyboard use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const job = getJobById(jobId);
  const client = job?.clientId ? getClientById(job.clientId) : null;
  const workshop = job?.workshopId ? getWorkshopById(job.workshopId) : null;
  const attachments = getJobAttachments(jobId);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,28,40,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--porcelain)',
          borderRadius: 24,
          width: '100%',
          maxWidth: 560,
          maxHeight: '86vh',
          overflowY: 'auto',
          padding: '32px 34px 26px',
          boxShadow: '0 24px 60px rgba(20,28,40,.28)',
        }}
      >
        {!job ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>Job details unavailable</h2>
            <p style={{ color: 'var(--muted)', fontSize: 16, marginBottom: 24 }}>
              This job's details aren't loaded on the kiosk right now.
            </p>
            <Button variant="primary" fullWidth onClick={onClose} style={{ height: 60, fontSize: 18 }}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: 'var(--sky)', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                #{job.jobNumber}
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.4px' }}>{job.title}</h2>
            </div>

            <div style={{ marginBottom: 24 }}>
              <MetaRow label="Client" value={client?.name ?? 'None'} />
              <MetaRow label="Workshop" value={workshop?.name ?? 'None'} />
              <MetaRow label="Allocated time" value={formatAllocated(job.allocatedMinutes)} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
              Attachments {attachments.length > 0 && `(${attachments.length})`}
            </h3>

            {attachments.length === 0 ? (
              <div style={{
                border: '2px dashed var(--line)',
                borderRadius: 16,
                padding: '20px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontWeight: 600,
                marginBottom: 24,
              }}>
                Nothing attached to this job yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      background: 'var(--paper)',
                      border: '1.5px solid var(--line)',
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    {a.kind === 'photo' && a.dataUrl ? (
                      <img
                        src={a.dataUrl}
                        alt={a.text || 'Job photo'}
                        style={{ width: '100%', borderRadius: 12, marginBottom: 10, display: 'block' }}
                      />
                    ) : a.kind === 'file' && a.dataUrl ? (
                      <a
                        href={a.dataUrl}
                        download={a.fileName ?? 'attachment'}
                        style={{ color: 'var(--sky)', fontWeight: 700, fontSize: 16, wordBreak: 'break-all' }}
                      >
                        {a.fileName ?? 'Download file'}
                      </a>
                    ) : (
                      <div style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                        {a.text}
                      </div>
                    )}
                    {a.kind !== 'note' && a.text && (
                      <div style={{ color: 'var(--ink)', fontSize: 15, marginTop: 8 }}>{a.text}</div>
                    )}
                    <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500, marginTop: 8 }}>
                      {a.createdByName} · {formatDateTime(a.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="primary" fullWidth onClick={onClose} style={{ height: 60, fontSize: 18 }}>
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
