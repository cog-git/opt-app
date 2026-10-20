import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'flora' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Show the small accent dot on the left (flora dot on the primary sign-in button). */
  dot?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const base: React.CSSProperties = {
  height: 54,
  border: 0,
  borderRadius: 14,
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  padding: '0 22px',
  transition: 'background 120ms ease',
};

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: 'var(--sky)', color: '#fff' },
  flora: { background: 'var(--flora)', color: 'var(--ink)' },
  ghost: { background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--line)' },
};

export function Button({
  variant = 'primary',
  dot = false,
  fullWidth = false,
  children,
  style,
  ...rest
}: ButtonProps) {
  const merged: React.CSSProperties = {
    ...base,
    ...variants[variant],
    ...(fullWidth ? { width: '100%' } : null),
    ...style,
    ...(rest.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
  };

  const dotColor = variant === 'primary' ? 'var(--flora)' : 'var(--sky)';

  return (
    <button style={merged} {...rest}>
      {dot ? (
        <span
          aria-hidden
          style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor }}
        />
      ) : null}
      {children}
    </button>
  );
}
