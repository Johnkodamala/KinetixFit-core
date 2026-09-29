// Scroll reveals. Each .reveal rises in once as it arrives, neighbours a beat apart; [data-sprint] lines then
// open from condensed to wide (Archivo's width axis, like the app's launch intro). The hero plays its own
// entrance on load. With reduced motion, or no IntersectionObserver, everything is simply shown.
import { canAnimate } from './motion';

const STAGGER_MS = 80;
const MAX_STAGGER_MS = 400;
const SPRINT_FONT = '850 125% 1em "Archivo Variable"';
const FONT_WAIT_MS = 1200;

/** The delay for the n-th of a run of consecutive .reveal siblings. */
export function staggerDelay(index: number): number {
  return Math.min(index * STAGGER_MS, MAX_STAGGER_MS);
}

/** Resolves once the display font's wide cut is ready (or after a short wait, so nothing hangs on a slow font). */
export function whenDisplayFontReady(doc: Document = document, waitMs = FONT_WAIT_MS): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, waitMs);
    fonts.load(SPRINT_FONT).then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); },
    );
  });
}

function assignStagger(elements: HTMLElement[]) {
  for (const el of elements) {
    let index = 0;
    let prev = el.previousElementSibling;
    while (prev && prev.classList.contains('reveal')) {
      index += 1;
      prev = prev.previousElementSibling;
    }
    if (index > 0) el.style.setProperty('--delay', `${staggerDelay(index)}ms`);
  }
}

export function initReveal(doc: Document = document): IntersectionObserver | null {
  const win = doc.defaultView;
  const reveals = [...doc.querySelectorAll<HTMLElement>('.reveal')];
  const sprints = [...doc.querySelectorAll<HTMLElement>('[data-sprint]')].filter(el => !el.closest('.hero'));
  const groups = [...doc.querySelectorAll<HTMLElement>('[data-steps]')];

  if (!win || !canAnimate(win)) {
    reveals.forEach(el => el.classList.add('is-in'));
    sprints.forEach(el => el.classList.add('is-sprinted'));
    groups.forEach(el => el.classList.add('is-in'));
    return null;
  }

  assignStagger(reveals);
  const fontReady = whenDisplayFontReady(doc);
  const observer = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      observer.unobserve(el);
      el.classList.add('is-in');
      const sprint = el.matches('[data-sprint]') ? el : el.querySelector<HTMLElement>('[data-sprint]');
      if (sprint && !sprint.closest('.hero')) {
        fontReady.then(() => win.setTimeout(() => sprint.classList.add('is-sprinted'), 220));
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  reveals.forEach(el => observer.observe(el));
  groups.forEach(el => observer.observe(el));
  // a sprint line that isn't inside a .reveal still needs to arrive
  sprints.filter(el => !el.closest('.reveal')).forEach(el => observer.observe(el));
  return observer;
}

/** The hero's entrance: lanes draw in, copy and phone rise, then "Real rewards." opens up to full width. */
export function initHero(doc: Document = document): Promise<void> {
  const hero = doc.querySelector<HTMLElement>('.hero');
  const win = doc.defaultView;
  if (!hero || !win) return Promise.resolve();
  const sprint = hero.querySelector<HTMLElement>('[data-sprint]');
  if (!canAnimate(win)) {
    hero.classList.add('is-ready');
    sprint?.classList.add('is-sprinted');
    return Promise.resolve();
  }
  // two frames: the hidden starting state must be painted before .is-ready, or nothing transitions
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => hero.classList.add('is-ready')));
  return whenDisplayFontReady(doc).then(() => {
    win.setTimeout(() => sprint?.classList.add('is-sprinted'), 180);
  });
}
