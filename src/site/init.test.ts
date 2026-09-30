// @vitest-environment jsdom
// Start-up order: the first screen is ready at once (once the styles are in); everything below the hero follows at the
// first idle moment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import notFoundHtml from '../../site/404.html?raw';
import { initSite, pendingStyleSheets, whenIdle } from './init';
import { loadPage, stubBrowser } from './testing';

afterEach(() => vi.unstubAllGlobals());

describe('whenIdle', () => {
  it('uses requestIdleCallback with a deadline when the browser has it', () => {
    const idle = vi.fn();
    const win = { requestIdleCallback: idle, setTimeout: vi.fn() } as unknown as Window;
    const fn = () => {};
    whenIdle(fn, win, 250);
    expect(idle).toHaveBeenCalledWith(fn, { timeout: 250 });
  });

  it('falls back to a timeout (Safari has no requestIdleCallback)', () => {
    const timeout = vi.fn();
    const win = { setTimeout: timeout } as unknown as Window;
    whenIdle(() => {}, win);
    expect(timeout).toHaveBeenCalledTimes(1);
  });
});

describe('initSite on the home page', () => {
  beforeEach(() => {
    loadPage(pageHtml);
    stubBrowser({ reducedMotion: true });
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  it('readies the first screen straight away and the rest right after', async () => {
    initSite(document);
    expect(document.querySelector('.hero')!.classList.contains('is-ready')).toBe(true);
    expect(document.querySelector('[data-year]')!.textContent).toBe(String(new Date().getFullYear()));
    // below the fold: not yet…
    expect(document.querySelector('.why .manifesto')!.classList.contains('is-in')).toBe(false);
    await new Promise(r => setTimeout(r, 10));
    // …now
    expect(document.querySelector('.why .manifesto')!.classList.contains('is-in')).toBe(true);
    expect(document.querySelector('[data-points-count]')!.textContent).toBe('1,000');
  });

  it('wires the form, so a bad email gets its message', async () => {
    initSite(document);
    await new Promise(r => setTimeout(r, 10));
    const form = document.querySelector<HTMLFormElement>('[data-signup]')!;
    form.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'nope';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(form.querySelector<HTMLElement>('[data-error]')!.hidden).toBe(false);
  });
});

describe('initSite and the stylesheet', () => {
  beforeEach(() => {
    loadPage(pageHtml);
    stubBrowser({ reducedMotion: true });
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  // Safari can run the page's script before the stylesheet linked after it arrives; what it measured then, unstyled,
  // could stick (the footer's text stayed black), so the page waits for it, as other browsers do
  const addSheet = () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/main.css';
    document.head.append(link);
    return link;
  };

  it('starts at once when the styles are in', () => {
    expect(pendingStyleSheets()).toEqual([]);
    initSite(document);
    expect(document.querySelector('.hero')!.classList.contains('is-ready')).toBe(true);
  });

  it('waits for a stylesheet still on its way, then starts', async () => {
    const link = addSheet();
    expect(pendingStyleSheets()).toEqual([link]);
    initSite(document);
    expect(document.querySelector('.hero')!.classList.contains('is-ready')).toBe(false);
    link.dispatchEvent(new Event('load'));
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.hero')!.classList.contains('is-ready')).toBe(true);
  });

  it('starts anyway if the stylesheet fails', async () => {
    const link = addSheet();
    initSite(document);
    link.dispatchEvent(new Event('error'));
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.hero')!.classList.contains('is-ready')).toBe(true);
  });
});

describe('initSite on the 404 page', () => {
  it('runs without the home page’s sections', async () => {
    loadPage(notFoundHtml);
    stubBrowser({ reducedMotion: true });
    expect(() => initSite(document)).not.toThrow();
    await new Promise(r => setTimeout(r, 10));
    expect(document.querySelector('[data-year]')!.textContent).toBe(String(new Date().getFullYear()));
  });
});
