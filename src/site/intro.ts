// The opening animation: five running lanes, the mark runs a lap, the wordmark widens, then the lanes sprint off to
// the right onto the page — the app's launch intro (src/components/LaunchIntro.tsx) at the size of a big screen.
// Whether it plays is settled in the head of site/index.html before the first paint (once per visit; never with
// reduced motion or for a link straight to a section), so the page never flashes first. The run itself is CSS
// (site.css → Opening animation); this times the exit, lets any tap, key or scroll skip straight to it, and tells the
// hero when the page is showing.
export const INTRO_SEEN_KEY = 'kx_intro_seen';
/** From the first paint to the exit: the lines draw, the mark laps, the wordmark widens and holds a moment. */
export const RUN_MS = 1600;
/** The brand leaving and the five lanes sprinting off, the last one done. */
export const EXIT_MS = 760;

const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;

export interface Intro {
  /** Resolves as the lanes start to leave: the page underneath is showing from then on. */
  revealed: Promise<void>;
  /** Leave now (a tap, key or scroll does this too). */
  skip(): void;
}

/**
 * How far the run already is, in ms: the CSS started it at the first paint, which is often before this script runs
 * (read from the paint timing, so nothing has to be recalculated to find out). 0 before the first paint, or when the
 * browser can't say.
 */
export function runElapsed(win: Window): number {
  const perf = win.performance;
  const paint = perf?.getEntriesByName?.('first-paint')[0] ?? perf?.getEntriesByName?.('first-contentful-paint')[0];
  if (!paint) return 0;
  const since = perf.now() - paint.startTime;
  return Number.isFinite(since) && since > 0 ? since : 0;
}

/** Runs the exit when it's due. Returns null when the intro isn't playing (and tidies its markup away). */
export function initIntro(doc: Document = document): Intro | null {
  const root = doc.documentElement;
  const overlay = doc.querySelector<HTMLElement>('[data-intro-overlay]');
  const win = doc.defaultView;
  if (!overlay || !win || root.dataset.intro !== 'run') {
    overlay?.remove();
    return null;
  }
  try {
    win.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // storage blocked: it just plays again next time
  }

  let resolve!: () => void;
  const revealed = new Promise<void>(r => (resolve = r));
  let leaving = false;
  const exit = () => {
    if (leaving) return;
    leaving = true;
    win.clearTimeout(timer);
    SKIP_EVENTS.forEach(type => win.removeEventListener(type, exit));
    overlay.classList.add('is-exit');
    delete root.dataset.intro;
    resolve();
    win.setTimeout(() => overlay.remove(), EXIT_MS);
  };
  const timer = win.setTimeout(exit, Math.max(0, RUN_MS - runElapsed(win)));
  SKIP_EVENTS.forEach(type => win.addEventListener(type, exit, { passive: true }));
  return { revealed, skip: exit };
}
