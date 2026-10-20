import type { ReactNode } from 'react';

export interface PillProps {
  children: ReactNode;
  className?: string;
}

/** Small rounded label — used for the brand-panel feature pills. */
export function Pill({ children, className }: PillProps) {
  return (
    <span
      className={className}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--grey)',
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        padding: '8px 13px',
        borderRadius: 20,
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}
