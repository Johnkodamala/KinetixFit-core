import { useEffect, useState, type CSSProperties } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { applyTheme } from '../lib/theme';

// The ~2s opening sequence, played once per session (every cold start in the native apps, once per
// visit on the website). The screen is five running lanes: their lines draw in, the infinity mark
// runs one lap, the wordmark widens like a sprinter leaving the blocks, then the lanes themselves
// sprint off to the right to reveal the app. Tap or press any key to skip.
//
// index.html sets <html data-intro="run"> before anything renders, so the page is already the
// launch colour (no flash) and the app's own entrance animations wait underneath until the lanes
// leave. Styles live in src/styles/intro.css.
export const INTRO_SEEN_KEY = 'kx_intro_seen';

const RUN_MS = 1500;
const EXIT_MS = 660;
const REDUCED_RUN_MS = 500;

// The same infinity path as the in-app logo (viewBox 0 0 100 50)
const MARK_PATH = 'M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z';
const LANES = [0, 1, 2, 3, 4];

type Phase = 'run' | 'exit' | 'done';

// The intro is always dark, so the phone's status/navigation icons must be light while it plays,
// even in light mode; afterwards applyTheme() restores the user's theme.
function setBarIcons(style: SystemBarsStyle) {
  if (Capacitor.isNativePlatform()) SystemBars.setStyle({ style }).catch(() => { /* older shells: ignore */ });
}

export default function LaunchIntro() {
  const [phase, setPhase] = useState<Phase>(() =>
    document.documentElement.dataset.intro === 'run' ? 'run' : 'done'
  );

  useEffect(() => {
    if (phase === 'done') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (phase === 'run') {
      setBarIcons(SystemBarsStyle.Dark);
      try { sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* private mode: replays next load */ }
      const skip = () => setPhase('exit');
      window.addEventListener('keydown', skip);
      const t = window.setTimeout(skip, reduced ? REDUCED_RUN_MS : RUN_MS);
      return () => { window.clearTimeout(t); window.removeEventListener('keydown', skip); };
    }

    // exit: hand the page back to the app so its entrance animations run as the lanes clear
    delete document.documentElement.dataset.intro;
    applyTheme(); // bar icons back to the user's theme
    const t = window.setTimeout(() => setPhase('done'), reduced ? 1 : EXIT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`kx-intro kx-intro-${phase}`}
      onPointerDown={() => setPhase('exit')}
      aria-hidden="true"
    >
      {LANES.map(i => (
        <span key={i} className="kx-intro-lane" style={{ '--lane': i } as CSSProperties} />
      ))}
      <div className="kx-intro-brand">
        <svg className="kx-intro-mark" viewBox="-6 -6 112 62" fill="none">
          <path className="kx-intro-trace" d={MARK_PATH} pathLength={1} />
          <path className="kx-intro-runner" d={MARK_PATH} pathLength={1} />
        </svg>
        <span className="kx-intro-word">KINETIXFIT</span>
      </div>
    </div>
  );
}
