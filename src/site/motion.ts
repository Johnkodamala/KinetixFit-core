// Whether the page may animate: never when the visitor asks for reduced motion, or when the browser lacks the
// observers the scroll effects need (then everything simply shows in its final state).

export function prefersReducedMotion(win: Window = window): boolean {
  return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function canAnimate(win: Window = window): boolean {
  return !prefersReducedMotion(win) && 'IntersectionObserver' in win;
}

/** Calls `fn` at most once per animation frame, with the latest arguments. */
export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void, win: Window = window): (...args: A) => void {
  let queued = false;
  let last: A;
  return (...args: A) => {
    last = args;
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      fn(...last);
    });
  };
}
