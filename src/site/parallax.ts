// Subtle depth in the hero: as the page scrolls, [data-parallax="speed"] elements shift by scroll × speed (capped),
// so the lanes lag behind like a far background and the phone drifts a touch slower than the words. Nothing moves
// at load (offset 0 at the top of the page), so layouts never overlap. The shift is written to --py, which the
// CSS turns into the `translate` property, so it never fights the entrance transforms. Off with reduced motion.
import { prefersReducedMotion, rafThrottle } from './motion';

export const MAX_SHIFT_PX = 120;

/** How far an element moves when the page has scrolled `scrollY` px: positive speeds lag (drift down). */
export function parallaxOffset(scrollY: number, speed: number, max = MAX_SHIFT_PX): number {
  const raw = Math.max(0, scrollY) * speed;
  const capped = Math.max(-max, Math.min(max, raw));
  return Math.round(capped * 10) / 10;
}

export function initParallax(doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win || prefersReducedMotion(win)) return () => {};
  const elements = [...doc.querySelectorAll<HTMLElement | SVGElement>('[data-parallax]')];
  if (elements.length === 0) return () => {};
  const hero = doc.querySelector<HTMLElement>('.hero');

  const update = () => {
    const y = win.scrollY;
    // past the hero there is nothing left to move
    if (hero && y > hero.offsetTop + hero.offsetHeight + 200) return;
    for (const el of elements) {
      el.style.setProperty('--py', `${parallaxOffset(y, Number(el.getAttribute('data-parallax')) || 0)}px`);
    }
  };
  const onScroll = rafThrottle(update, win);
  update();
  win.addEventListener('scroll', onScroll, { passive: true });
  return () => win.removeEventListener('scroll', onScroll);
}
