// @vitest-environment jsdom
// The header, the phone menu (a modal: focus trapped, Escape closes, focus returns), the section highlight in the
// nav, and "Log in" becoming "Open the app".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { initAppLinks, initHeader, initMenu, initScrollSpy, overDarkSection } from './nav';
import { FakeIntersectionObserver, loadPage, nextFrame, stubBrowser } from './testing';

beforeEach(() => {
  loadPage(pageHtml);
  stubBrowser();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.overflow = '';
});

const key = (k: string, shiftKey = false) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));

describe('the phone menu', () => {
  it('opens as a modal: visible, announced, page locked, focus inside', async () => {
    const menu = initMenu()!;
    const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')!;
    const panel = document.querySelector<HTMLElement>('[data-menu]')!;
    expect(panel.hidden).toBe(true);
    toggle.click();
    await nextFrame();
    expect(menu.isOpen()).toBe(true);
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('closes on Escape and hands focus back to the menu button', async () => {
    const menu = initMenu()!;
    const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')!;
    toggle.click();
    key('Escape');
    expect(menu.isOpen()).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(toggle);
    await new Promise(r => setTimeout(r, 320));
    expect(document.querySelector<HTMLElement>('[data-menu]')!.hidden).toBe(true);
  });

  it('keeps Tab inside the menu, both ways', () => {
    initMenu()!.open();
    const panel = document.querySelector<HTMLElement>('[data-menu]')!;
    const items = [...panel.querySelectorAll<HTMLElement>('a[href], button')];
    items.at(-1)!.focus();
    key('Tab');
    expect(document.activeElement).toBe(items[0]);
    key('Tab', true);
    expect(document.activeElement).toBe(items.at(-1));
  });

  it('closes when a link is chosen, then brings the section in, updates the address and focuses the section', async () => {
    const scrolled: Element[] = [];
    HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this); };
    const menu = initMenu()!;
    menu.open();
    const link = document.querySelector<HTMLAnchorElement>('.mobile-menu__list a[href="#rewards"]')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(menu.isOpen()).toBe(false);
    expect(click.defaultPrevented).toBe(true);
    await nextFrame();
    const section = document.getElementById('rewards')!;
    expect(scrolled).toEqual([section]);
    expect(location.hash).toBe('#rewards');
    expect(section.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(section);
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    history.replaceState(null, '', location.pathname);
  });

  it('lets links to other pages leave normally', () => {
    const menu = initMenu()!;
    menu.open();
    const link = document.querySelector<HTMLAnchorElement>('.mobile-menu__actions a[href="/app/"]')!;
    let preventedByMenu: boolean | null = null;
    // runs after the menu's own listener: note what it did, then keep jsdom from trying to navigate
    link.addEventListener('click', e => { preventedByMenu = e.defaultPrevented; e.preventDefault(); }, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(menu.isOpen()).toBe(false);
    expect(preventedByMenu).toBe(false);
  });

  it('closes from its close button and from a tap outside the panel', () => {
    const menu = initMenu()!;
    menu.open();
    document.querySelector<HTMLButtonElement>('[data-menu-close]')!.click();
    expect(menu.isOpen()).toBe(false);
    menu.open();
    document.querySelector<HTMLElement>('[data-menu]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('does nothing on a page without a menu', () => {
    document.body.innerHTML = '<p>No menu here</p>';
    expect(initMenu()).toBeNull();
  });
});

describe('the header', () => {
  it('turns frosted once the page scrolls', async () => {
    initHeader();
    const header = document.querySelector('[data-header]')!;
    expect(header.classList.contains('is-scrolled')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(header.classList.contains('is-scrolled')).toBe(true);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('knows when it sits over a dark section', () => {
    const section = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom }) }) as Element;
    expect(overDarkSection([section(-200, 400)], 38)).toBe(true);
    expect(overDarkSection([section(100, 900)], 38)).toBe(false);
    expect(overDarkSection([section(-900, 20)], 38)).toBe(false);
    expect(overDarkSection([], 38)).toBe(false);
  });

  it('marks the Rewards section and the footer as dark', () => {
    expect(document.querySelector('#rewards')!.hasAttribute('data-header-dark')).toBe(true);
    expect(document.querySelector('footer')!.hasAttribute('data-header-dark')).toBe(true);
  });
});

describe('the section highlight', () => {
  it('marks the link of the section in view, and only that one', () => {
    const observer = initScrollSpy();
    expect(observer).not.toBeNull();
    const io = FakeIntersectionObserver.instances.at(-1)!;
    io.fire(document.getElementById('rewards')!, true);
    const active = [...document.querySelectorAll('.site-nav__link.is-active')];
    expect(active.map(a => a.getAttribute('href'))).toEqual(['#rewards']);
    expect(active[0].getAttribute('aria-current')).toBe('true');
    io.fire(document.getElementById('rewards')!, false);
    expect(document.querySelectorAll('.site-nav__link.is-active')).toHaveLength(0);
    expect(document.querySelectorAll('.site-nav__link[aria-current]')).toHaveLength(0);
  });

  it('prefers the section higher up the page when two are in view', () => {
    initScrollSpy();
    const io = FakeIntersectionObserver.instances.at(-1)!;
    io.fire(document.getElementById('how')!, true);
    io.fire(document.getElementById('features')!, true);
    expect(document.querySelector('.site-nav__link.is-active')?.getAttribute('href')).toBe('#features');
  });

  it('stays quiet without IntersectionObserver', () => {
    stubBrowser({ observers: false });
    expect(initScrollSpy()).toBeNull();
  });
});

describe('Log in / Open the app', () => {
  it('keeps "Log in" for visitors', () => {
    expect(initAppLinks(document, localStorage)).toBe(false);
    expect(document.querySelector('.site-header__login')!.textContent).toBe('Log in');
  });

  it('says "Open the app" to someone logged in on this browser', () => {
    localStorage.setItem('kinetix_logged_in', 'true');
    expect(initAppLinks(document, localStorage)).toBe(true);
    expect(document.querySelector('.site-header__login')!.textContent).toBe('Open the app');
    expect(document.querySelector('.mobile-menu__actions [data-app-link]')!.textContent).toBe('Open the app');
    // the links still go to the app
    expect(document.querySelector('.site-header__login')!.getAttribute('href')).toBe('/app/');
  });

  it('keeps "Log in" when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('SecurityError'); } };
    expect(initAppLinks(document, blocked)).toBe(false);
    expect(document.querySelector('.site-header__login')!.textContent).toBe('Log in');
  });
});
