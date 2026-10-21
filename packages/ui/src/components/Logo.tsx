import type { CSSProperties } from 'react';

export interface LogoProps {
  /** Fill colour of the logo. Defaults to flora green. */
  color?: string;
  /** Rendered height in px. Width is derived from the 2556x543 (~4.71:1) aspect ratio. */
  height?: number;
  /** Path to the logo PNG used as the mask. Served from /public by Vite. */
  src?: string;
  className?: string;
  title?: string;
}

const ASPECT = 2556 / 543; // ~4.708

// Vite serves public assets under the app base (e.g. /opt-staging/ on staging),
// so mask paths must be prefixed with BASE_URL, not a bare root-absolute path.
const BASE = import.meta.env.BASE_URL;
const DEFAULT_SRC = `${BASE}brand/logo-white.png`;

/**
 * OPT wordmark rendered via CSS mask so it can be tinted any colour without
 * shipping multiple coloured PNGs. The element is a flat coloured block masked
 * by the logo artwork — no stretching because width tracks the fixed aspect.
 */
export function Logo({
  color = 'var(--flora)',
  height = 36,
  src = DEFAULT_SRC,
  className,
  title = 'OPT',
}: LogoProps) {
  const width = Math.round(height * ASPECT);
  const maskValue = `url(${src}) center / contain no-repeat`;

  const style: CSSProperties = {
    display: 'block',
    height: `${height}px`,
    width: `${width}px`,
    background: color,
    WebkitMaskImage: `url(${src})`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskImage: `url(${src})`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    // Shorthand fallbacks (harmless where longhands already applied).
    WebkitMask: maskValue,
    mask: maskValue,
  };

  return <span role="img" aria-label={title} className={className} style={style} />;
}
