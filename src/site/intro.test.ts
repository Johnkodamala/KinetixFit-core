// @vitest-environment jsdom
// The opening animation: the head decides whether it plays (tested here by running the page's own gate script), the
// run is remembered for the visit, the exit comes on time or at once on a tap, key or scroll, and the page is revealed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { EXIT_MS, INTRO_SEEN_KEY, RUN_MS, initIntro, runElapsed } from './intro';
import { loadPage, stubBrowser } from './testing';

const page = new DOMParser().parseFromString(pageHtml, 'text/html');
const gate = [...page.querySelectorAll('head script:not([src]):not([type])')].find(s => s.textContent?.includes('data-intro'))!;

/**
 * Runs the head's gate script in this window, as the browser does before the first paint. jsdom's script elements lack
 * `noModule`, which every browser that can run the site's modules has; `modules: false` is an older browser.
 */
function runGate({ modules = true } = {}) {
  if (modules) Object.defineProperty(HTMLScriptElement.prototype, 'noModule', { value: false, configurable: true });
  try {
    new Function(gate.textContent!)();
  } finally {
    delete (HTMLScriptElement.prototype as Partial<HTMLScriptElement>).noModule;
  }
}

beforeEach(() => {
  loadPage(pageHtml);
  delete document.documentElement.dataset.intro; // loadPage replaces the page, not <html>'s own attributes
  sessionStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the gate in the head', () => {
  it('comes before anything paints, and the overlay is the first thing in the page (hidden without CSS)', () => {
    const scripts = [...page.querySelectorAll('head script')];
    expect(scripts.indexOf(gate)).toBeLessThan(scripts.findIndex(s => s.getAttribute('type') === 'module'));
    const overlay = page.body.firstElementChild!;
    expect(overlay.matches('[data-intro-overlay]')).toBe(true);
    expect(overlay.hasAttribute('hidden')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('plays on a first visit', () => {
    stubBrowser();
    runGate();
    expect(document.documentElement.dataset.intro).toBe('run');
  });

  it('plays once a visit: not after it has been seen (by the site or the web app)', () => {
    stubBrowser();
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    runGate();
    expect(document.documentElement.dataset.intro).toBeUndefined();
  });

  it('never plays where the page’s scripts can’t run it (no modules)', () => {
    stubBrowser();
    runGate({ modules: false });
    expect(document.documentElement.dataset.intro).toBeUndefined();
  });

  it('never plays with reduced motion', () => {
    stubBrowser({ reducedMotion: true });
    runGate();
    expect(document.documentElement.dataset.intro).toBeUndefined();
  });

  it('stays out of the way of a link straight to a section', () => {
    stubBrowser();
    window.location.hash = '#faq';
    runGate();
    expect(document.documentElement.dataset.intro).toBeUndefined();
  });
});

describe('initIntro', () => {
  it('does nothing when the gate said no, and takes its markup away', () => {
    stubBrowser();
    expect(initIntro()).toBeNull();
    expect(document.querySelector('[data-intro-overlay]')).toBeNull();
  });

  it('remembers the visit, leaves on time, reveals the page and then removes itself', async () => {
    vi.useFakeTimers();
    stubBrowser();
    document.documentElement.dataset.intro = 'run';
    const intro = initIntro()!;
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
    const overlay = document.querySelector<HTMLElement>('[data-intro-overlay]')!;
    let revealed = false;
    intro.revealed.then(() => { revealed = true; });

    vi.advanceTimersByTime(RUN_MS - 10);
    await Promise.resolve();
    expect(revealed).toBe(false);
    expect(overlay.classList.contains('is-exit')).toBe(false);

    vi.advanceTimersByTime(20);
    await Promise.resolve();
    expect(revealed).toBe(true);
    expect(overlay.classList.contains('is-exit')).toBe(true);
    expect(document.documentElement.dataset.intro).toBeUndefined();

    vi.advanceTimersByTime(EXIT_MS);
    expect(document.querySelector('[data-intro-overlay]')).toBeNull();
  });

  it.each(['keydown', 'pointerdown', 'wheel', 'touchmove'])('skips straight to the exit on %s', async type => {
    vi.useFakeTimers();
    stubBrowser();
    document.documentElement.dataset.intro = 'run';
    const intro = initIntro()!;
    let revealed = false;
    intro.revealed.then(() => { revealed = true; });
    window.dispatchEvent(new Event(type));
    await Promise.resolve();
    expect(revealed).toBe(true);
    expect(document.querySelector('[data-intro-overlay]')!.classList.contains('is-exit')).toBe(true);
  });

  /** A window whose first paint was `ago` ms before now (or never). */
  const paintedAgo = (ago: number | null) => ({
    performance: {
      now: () => 5000,
      getEntriesByName: (name: string) => (ago !== null && name === 'first-paint' ? [{ startTime: 5000 - ago }] : []),
    },
  }) as unknown as Window;

  it('counts the part of the run that played before the script arrived', () => {
    expect(runElapsed(paintedAgo(null))).toBe(0); // not painted yet
    expect(runElapsed(paintedAgo(900))).toBe(900);
  });

  it('leaves at once when the page arrives after the run has already finished', async () => {
    vi.useFakeTimers();
    stubBrowser();
    document.documentElement.dataset.intro = 'run';
    vi.spyOn(performance, 'getEntriesByName').mockImplementation(((name: string) =>
      name === 'first-paint' ? [{ startTime: performance.now() - (RUN_MS + 500) }] : []) as typeof performance.getEntriesByName);
    const intro = initIntro()!;
    let revealed = false;
    intro.revealed.then(() => { revealed = true; });
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(revealed).toBe(true);
  });
});
