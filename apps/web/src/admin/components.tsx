/**
 * Small presentational helpers shared across the admin pages.
 * These are inline (not part of @opt/ui) per the brief — Badge, Modal, Select,
 * LabelledInput and role/status badge mappers.
 */

import { useEffect } from 'react';
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react';
import { Button } from '@opt/ui';
import type { OrgStatus, OrgTier, UserRole, JobStatus } from './adminStore';
import { roleLabel } from './adminStore';

// ── Badge ────────────────────────────────────────────────────────────────────

type BadgeTone = 'sky' | 'flora' | 'rose' | 'grey' | 'ink';

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`admin__badge admin__badge--${tone}`}>{children}</span>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  const tone: BadgeTone =
    role === 'owner' ? 'sky' : role === 'admin' ? 'ink' : role === 'officer' ? 'flora' : 'grey';
  return <Badge tone={tone}>{roleLabel(role)}</Badge>;
}

export function StatusBadge({ status }: { status: OrgStatus }) {
  const tone: BadgeTone = status === 'active' ? 'flora' : status === 'paused' ? 'grey' : 'rose';
  return <Badge tone={tone}>{status}</Badge>;
}

export function TierBadge({ tier }: { tier: OrgTier }) {
  return <Badge tone={tier === 'production' ? 'sky' : 'grey'}>{tier}</Badge>;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={status === 'active' ? 'flora' : 'grey'}>{status}</Badge>;
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="admin__modal-scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={wide ? 'admin__modal admin__modal--wide' : 'admin__modal'}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
    </div>
  );
}

// ── Confirm dialog ───────────────────────────────────────────────────────────

/**
 * Guards a destructive action (archive) behind an explicit confirm. `tone`
 * colours the confirm button; `busy` disables both buttons mid-request.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel}>
      <p className="admin__confirm-msg">{message}</p>
      <div className="admin__modal-actions">
        <Button variant="ghost" fullWidth onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          fullWidth
          onClick={onConfirm}
          disabled={busy}
          style={tone === 'danger' ? { background: 'var(--rose-deep)' } : undefined}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function SelectField({ label, id, children, ...rest }: SelectFieldProps) {
  return (
    <div className="admin__field">
      <label className="admin__field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="admin__select" {...rest}>
        {children}
      </select>
    </div>
  );
}

// ── Plain labelled input (native, for date/time where @opt/ui Field's icon slot
//     isn't needed and we want a co-located class) ─────────────────────────────

export interface LabelledInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function LabelledInput({ label, id, ...rest }: LabelledInputProps) {
  return (
    <div className="admin__field">
      <label className="admin__field-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="admin__input" {...rest} />
    </div>
  );
}
