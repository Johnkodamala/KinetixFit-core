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
