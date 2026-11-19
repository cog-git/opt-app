import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type TileTone = 'flora' | 'sky';

export interface TileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone: TileTone;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children?: ReactNode;
}

interface ToneStyles {
  bg: string;
  fg: string;
  sub: string;
  iconBg: string;
  goBg: string;
  goFg: string;
}

/*
 * Brand rule: every colour here must be one of the 8 official brand hexes
 * (see packages/ui/src/tokens.css). --sky and --flora are now the same
 * flora-green brand colour, so both tones use the ink-on-flora-green
 * treatment for contrast rather than the old white-on-blue styling.
 */
const tones: Record<TileTone, ToneStyles> = {
  flora: {
    bg: 'var(--flora)',
    fg: 'var(--ink)',
    sub: 'var(--ink)',
    iconBg: 'rgba(10,10,10,.12)',
    goBg: 'var(--ink)',
    goFg: 'var(--flora)',
  },
  sky: {
    bg: 'var(--sky)',
    fg: 'var(--ink)',
    sub: 'var(--ink)',
    iconBg: 'rgba(10,10,10,.12)',
    goBg: 'var(--ink)',
    goFg: 'var(--sky)',
  },
};

/** Big flat kiosk action tile. */
export function Tile({ tone, title, subtitle, icon, style, ...rest }: TileProps) {
  const t = tones[tone];
  return (
    <button
      style={{
        textAlign: 'left',
        border: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: t.bg,
        color: t.fg,
        borderRadius: 26,
        padding: '38px 34px',
        minHeight: 290,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: t.iconBg,
        }}
      >
        {icon}
      </span>
      <span style={{ display: 'block', paddingRight: 72 }}>
        <span
          style={{ display: 'block', fontSize: 38, fontWeight: 800, letterSpacing: '-.5px' }}
        >
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 500, marginTop: 6, color: t.sub }}>
          {subtitle}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: 30,
          bottom: 34,
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          background: t.goBg,
          color: t.goFg,
        }}
      >
        &#8594;
      </span>
    </button>
  );
}
