// FAQ answers are native <details>, so they work without JS and with any keyboard or screen reader. This only
// smooths the opening and closing (height), and skips that with reduced motion.
import { prefersReducedMotion } from './motion';

const DURATION_MS = 320;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function initFaq(doc: Document = document): number {
  const win = doc.defaultView;
  const items = [...doc.querySelectorAll<HTMLDetailsElement>('[data-faq] details')];
  if (!win || items.length === 0) return 0;

  for (const details of items) {
    const summary = details.querySelector('summary');
    const answer = details.querySelector<HTMLElement>('.qa__a');
    if (!summary || !answer) continue;
    let running: Animation | null = null;

    summary.addEventListener('click', event => {
      if (prefersReducedMotion(win) || typeof answer.animate !== 'function') return; // the browser toggles it
      event.preventDefault();
      running?.cancel();
      if (!details.open) {
        details.open = true;
        const height = answer.scrollHeight;
        running = answer.animate(
          [{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }],
          { duration: DURATION_MS, easing: EASING },
        );
      } else {
        const height = answer.scrollHeight;
        running = answer.animate(
          [{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
          { duration: DURATION_MS * 0.8, easing: EASING },
        );
        running.onfinish = () => { details.open = false; };
      }
    });
  }
  return items.length;
}
