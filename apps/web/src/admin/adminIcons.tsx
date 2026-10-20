/** Small inline SVG glyphs for the admin shell (16px, stroke-based). */

interface IconProps {
  size?: number;
  stroke?: string;
}

function base(size: number, stroke: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function DashboardIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function OrgIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01M9 12h.01M9 15h.01M15 9h.01M15 12h.01M15 15h.01" />
    </svg>
  );
}

export function UsersIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function ClientsIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M3 21V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13" />
      <path d="M13 21V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16" />
      <path d="M2 21h20" />
      <path d="M6 10h.01M6 14h.01M9 10h.01M9 14h.01M17 8h.01M17 12h.01" />
    </svg>
  );
}

export function JobsIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function ActivityIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function ClipboardIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 13h6M9 17h4M9 9h1" />
    </svg>
  );
}

export function ScheduleIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <path d="M7 13h3M7 17h3M14 13h3M14 17h3" />
    </svg>
  );
}

export function TasksIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function PlusIcon({ size = 18, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ReportsIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="5" rx="0.5" />
      <rect x="12" y="8" width="3" height="9" rx="0.5" />
      <rect x="17" y="5" width="3" height="12" rx="0.5" />
    </svg>
  );
}

export function DownloadIcon({ size = 18, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function WorkshopIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M3 21V9l6-4 6 4v12" />
      <path d="M15 21V11l6 4v6" />
      <path d="M2 21h20" />
      <path d="M7 12h.01M11 12h.01M7 16h.01M11 16h.01" />
    </svg>
  );
}

export function KioskIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M12 17v4M8 21h8" />
    </svg>
  );
}
