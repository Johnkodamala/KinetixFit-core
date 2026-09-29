// "Your day" (site/index.html → #day): the lane down the left fills in clay as you read down the day, and each time's
// dot fills once it's reached — at the reading line, a little below the middle of the screen. It follows the scroll
// both ways (scroll back up and it empties again), and only listens while the day is near the screen. Written as --p
// (0–1) on the list and .is-passed on the items (site.css → A day with Kinetix Fit). With reduced motion or without
// IntersectionObserver the whole day shows filled; without JS the lane stays dashed, as it was.
import { canAnimate, rafThrottle } from './motion';

/** Where readers' eyes are: this far down the screen. */
export const READING_LINE = 0.55;

/** How far down the list the reading line is: 0 above its top, 1 at its bottom. */
export function dayProgress(listTop: number, listHeight: number, viewportHeight: number): number {
  if (listHeight <= 0) return 0;
  return Math.min(1, Math.max(0, (viewportHeight * READING_LINE - listTop) / listHeight));
}

export interface DayLane {
  list: HTMLElement;
  update(): void;
}

export function initDay(doc: Document = document): DayLane | null {
  const list = doc.querySelector<HTMLElement>('[data-day]');
  const win = doc.defaultView;
  if (!list || !win) return null;
  const items = [...list.querySelectorAll<HTMLElement>('.day__item')];

  if (!canAnimate(win)) {
    list.style.setProperty('--p', '1');
    items.forEach(item => item.classList.add('is-passed'));
    return { list, update: () => {} };
  }

  const update = () => {
    const box = list.getBoundingClientRect();
    const line = win.innerHeight * READING_LINE;
    list.style.setProperty('--p', dayProgress(box.top, box.height, win.innerHeight).toFixed(4));
    for (const item of items) {
      const time = item.querySelector<HTMLElement>('.day__time') ?? item;
      item.classList.toggle('is-passed', time.getBoundingClientRect().top <= line);
    }
  };
  const onScroll = rafThrottle(update, win);
  let listening = false;
  new win.IntersectionObserver(entries => {
    const near = entries.some(entry => entry.isIntersecting);
    if (near === listening) return;
    listening = near;
    if (near) {
      win.addEventListener('scroll', onScroll, { passive: true });
      win.addEventListener('resize', onScroll);
    } else {
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onScroll);
    }
    update();
  }, { rootMargin: '25% 0px' }).observe(list);
  update();
  return { list, update };
}
