// Test helpers for the website's DOM tests (jsdom): put a page into the test document, and stand-ins for the
// browser features jsdom doesn't have (IntersectionObserver, matchMedia, requestAnimationFrame).
import { vi } from 'vitest';

/** Replaces the test document's content with a page's HTML (scripts don't run in jsdom). */
export function loadPage(html: string, { js = true } = {}): void {
  const inner = html.replace(/<!DOCTYPE html>/i, '').replace(/<\/?html[^>]*>/gi, '');
  document.documentElement.innerHTML = inner;
  document.documentElement.className = js ? 'js' : 'no-js';
}

/** An IntersectionObserver the test drives: `fire(el, true)` reports `el` entering (or leaving) the screen. */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  readonly options?: IntersectionObserverInit;
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  takeRecords() { return []; }
  fire(el: Element, isIntersecting: boolean) {
    this.callback([{ target: el, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  static fireAll(el: Element, isIntersecting = true) {
    for (const io of FakeIntersectionObserver.instances) if (io.observed.has(el)) io.fire(el, isIntersecting);
  }
}

/** Motion allowed (or not) and observers available: the conditions the scroll effects need. */
export function stubBrowser({ reducedMotion = false, observers = true } = {}): void {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reducedMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  if (observers) vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  else delete (window as unknown as Record<string, unknown>).IntersectionObserver;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
}

export const nextFrame = () => new Promise(resolve => setTimeout(resolve, 5));
