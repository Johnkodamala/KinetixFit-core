// Starts everything on the page. Each part checks for its own elements, so the 404 page (which has only the
// header and footer) uses the same code. What the first screen needs runs at once; the rest (everything below the
// hero) waits for the browser's first idle moment, so it never delays the first paint on a slow phone.
import { initDay } from './day';
import { initDemo } from './demo';
import { initEarlyAccess } from './earlyAccess';
import { initFaq } from './faq';
import { initFeatures } from './features';
import { initIntro } from './intro';
import { initAppLinks, initHeader, initMenu, initScrollSpy } from './nav';
import { initParallax } from './parallax';
import { initHero, initReveal } from './reveal';
import { fillRewardNumbers, initRewards } from './rewards';
import { renderFollowLinks } from './social';
import { initWidgets } from './widgets';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number };

/** Runs `fn` when the browser is next idle (within `timeoutMs` at the latest). */
export function whenIdle(fn: () => void, win: Window = window, timeoutMs = 400): void {
  const idle = (win as IdleWindow).requestIdleCallback;
  if (typeof idle === 'function') idle.call(win, fn, { timeout: timeoutMs });
  else win.setTimeout(fn, 1);
}

/** From the hero's arrival to the phone's demo starting: the phone rises in first (site.css → Motion). */
export const DEMO_AFTER_MS = 1100;

/**
 * The first screen: the header, the menu, the opening animation (when it plays), then the hero's entrance and the
 * phone's demo as the lanes leave, and the words and links the screen shows.
 */
export function initFirstScreen(doc: Document = document): void {
  doc.querySelectorAll<HTMLElement>('[data-year]').forEach(el => {
    el.textContent = String(new Date().getFullYear());
  });
  initAppLinks(doc);
  initHeader(doc);
  initMenu(doc);
  const demo = initDemo(doc);
  const arrive = () => {
    initHero(doc);
    demo?.start(DEMO_AFTER_MS);
  };
  const intro = initIntro(doc);
  if (intro) intro.revealed.then(arrive);
  else arrive();
}

/** Everything below the hero. */
export function initBelowTheFold(doc: Document = document): void {
  fillRewardNumbers(doc);
  renderFollowLinks(doc);
  initReveal(doc);
  initScrollSpy(doc);
  initFeatures(doc);
  initWidgets(doc);
  initDay(doc);
  initRewards(doc);
  initParallax(doc);
  initFaq(doc);
  initEarlyAccess(doc);
}

/**
 * The page's stylesheets that haven't arrived yet. The build links the stylesheet after the page's script, and Safari
 * can run that script before the stylesheet arrives (other browsers wait for it): whatever the script then measured
 * was worked out without the styles, and Safari was seen to keep some of it — the footer's text stayed black.
 */
export function pendingStyleSheets(doc: Document = document): HTMLLinkElement[] {
  return [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter(link => !link.sheet);
}

function start(doc: Document): void {
  initFirstScreen(doc);
  const win = doc.defaultView;
  if (win) whenIdle(() => initBelowTheFold(doc), win);
  else initBelowTheFold(doc);
}

/** Starts the page: at once when its styles are in (as they usually are), else as soon as they arrive (or fail). */
export function initSite(doc: Document = document): void {
  const pending = pendingStyleSheets(doc);
  if (pending.length === 0) {
    start(doc);
    return;
  }
  const arrived = pending.map(link => new Promise<void>(resolve => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  }));
  Promise.all(arrived).then(() => start(doc));
}
