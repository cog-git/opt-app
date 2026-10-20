import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Optional trailing icon rendered inside the input (e.g. mail / eye glyph). */
  icon?: ReactNode;
}

/** Labelled text input matching the sign-in form styling. */
export function Field({ label, icon, id, style, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div style={{ marginTop: 22 }}>
      <label
        htmlFor={fieldId}
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--grey)',
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={fieldId}
          style={{
            width: '100%',
            height: 54,
            border: '1.5px solid var(--line)',
            borderRadius: 14,
            padding: icon ? '0 46px 0 16px' : '0 16px',
            fontSize: 16,
            fontFamily: 'inherit',
            color: 'var(--ink)',
            background: 'var(--paper)',
            outline: 'none',
            ...style,
          }}
          {...inputProps}
        />
        {icon ? (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              display: 'inline-flex',
            }}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}
