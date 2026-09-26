// Small stroke icons, drawn on a 24px grid at 1.8 stroke so they sit with Hanken Grotesk's weight.
// They inherit currentColor, so the parent decides the colour (usually a metric token).
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps) {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true, ...rest
  };
}

export const StepsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8.5 3.5c1.7 0 2.7 1.9 2.4 4.4-.2 1.6-.9 2.9-2.2 3.1-1.4.2-2.4-1-2.6-2.8C5.8 5.6 6.8 3.5 8.5 3.5Z" />
    <path d="M6.6 13.6 10.8 13l.3 2.4c.2 1.4-.7 2.6-2 2.7-1.2.2-2.2-.7-2.4-1.9Z" />
    <path d="M15.5 6.5c1.7 0 2.7 2.1 2.4 4.6-.2 1.8-1.2 3-2.6 2.8-1.3-.2-2-1.5-2.2-3.1-.3-2.5.7-4.3 2.4-4.3Z" />
    <path d="M13.2 16.1 17.4 16.7l-.4 2.4c-.2 1.2-1.2 2.1-2.4 1.9-1.3-.1-2.2-1.3-2-2.7Z" />
  </svg>
);

export const HeartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20Z" />
    <path d="M7 12h2.4l1.3-2.4 2 4.6 1.4-2.2H17" />
  </svg>
);

export const SleepIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1Z" />
    <path d="M15 4h3l-3 3.4h3" />
  </svg>
);

export const StressIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12h3.5l2-5 3 10 2.5-7 1.5 2H21" />
  </svg>
);

export const ChevronIcon = (p: IconProps) => (
  <svg {...base({ size: 16, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CameraIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
);

export const RewardIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.5M17 6h2.5a2.5 2.5 0 0 1-2.6 3.5" />
  </svg>
);

export const BellIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5Z" />
    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);

// Glyph for the in-app message pill, one per tone (drawn heavier so it reads at 14px)
export const MessageIcon = ({ tone, ...p }: IconProps & { tone: 'success' | 'error' | 'warn' | 'info' }) => (
  <svg {...base({ strokeWidth: 2.6, ...p })}>
    {tone === 'success' && <path d="m5 12.5 4.5 4.5L19 7.5" />}
    {tone === 'error' && <path d="M7 7l10 10M17 7 7 17" />}
    {tone === 'warn' && <path d="M12 5v9M12 19v.01" />}
    {tone === 'info' && <path d="M12 11v8M12 5v.01" />}
  </svg>
);

export const TrendDownIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7l6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </svg>
);

export const TrendUpIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

export const SoundIcon = ({ muted, ...p }: IconProps & { muted?: boolean }) => (
  <svg {...base(p)}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
    {muted ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M16 9a4.2 4.2 0 0 1 0 6M18.6 6.5a7.8 7.8 0 0 1 0 11" />}
  </svg>
);

export const PinIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

// Achievement and level-up icons (shapes follow the Lucide set, ISC licence) — used instead of emoji.
export const FlameIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

export const DumbbellIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" />
    <path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
  </svg>
);

export const MedalIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="6" />
    <path d="M15.5 13.2 17 22l-5-3-5 3 1.5-8.8" />
  </svg>
);

export const TrophyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

export const LockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

// Activity and card-title icons (Lucide shapes, ISC licence).
export const RecoveryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" /><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1" />
    <path d="m11 7-3 5h4l-3 5" /><path d="M22 11v2" />
  </svg>
);

export const BikeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><circle cx="15" cy="5" r="1" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
  </svg>
);

export const WavesIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
  </svg>
);

export const BowlIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 11h18a9 9 0 0 1-18 0Z" /><path d="M7 21h10" /><path d="M12 7c0-2 1.5-3.5 3.5-4" /><path d="M9 7.5c-.5-1.5-.2-3 .8-4" />
  </svg>
);

export const TargetIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
  </svg>
);

export const GiftIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

export const BarcodeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" />
  </svg>
);
