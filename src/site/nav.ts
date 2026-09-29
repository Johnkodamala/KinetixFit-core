// The header: frosted once the page scrolls, the section in view marked in the nav, the full-screen menu on
// phones (a modal dialog: focus stays inside, Escape or a link closes it, the page behind doesn't scroll), and
// "Log in" becoming "Open the app" for someone already logged in on this browser.
import { LOGGED_IN_KEY } from './config';
import { prefersReducedMotion, rafThrottle } from './motion';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Whether the header's middle line (`y` px from the top) sits over one of the dark sections. */
export function overDarkSection(sections: Element[], y: number): boolean {
  return sections.some(section => {
    const rect = section.getBoundingClientRect();
    return rect.top <= y && rect.bottom >= y;
  });
}

export function initHeader(doc: Document = document): () => void {
  const header = doc.querySelector<HTMLElement>('[data-header]');
  const win = doc.defaultView;
  if (!header || !win) return () => {};
  // over the floodlit Rewards section and the footer, the frosted header turns dark so it doesn't go grey
  const darkSections = [...doc.querySelectorAll('[data-header-dark]')];
  const update = () => {
    header.classList.toggle('is-scrolled', win.scrollY > 8);
    header.classList.toggle('is-dark', overDarkSection(darkSections, header.offsetHeight / 2));
  };
  const onScroll = rafThrottle(update, win);
  update();
  win.addEventListener('scroll', onScroll, { passive: true });
  return () => win.removeEventListener('scroll', onScroll);
}

export interface MenuControls {
  open(): void;
  close(options?: { restoreFocus?: boolean }): void;
  isOpen(): boolean;
}

export function initMenu(doc: Document = document): MenuControls | null {
  const toggle = doc.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = doc.querySelector<HTMLElement>('[data-menu]');
  const win = doc.defaultView;
  if (!toggle || !menu || !win) return null;
  const closeButton = menu.querySelector<HTMLButtonElement>('[data-menu-close]');
  let openState = false;
  let hideTimer = 0;

  const focusables = () => [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.hasAttribute('hidden'));

  const onKeydown = (event: KeyboardEvent) => {
    if (!openState) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !menu.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !menu.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  function open() {
    if (openState) return;
    openState = true;
    win!.clearTimeout(hideTimer);
    menu!.hidden = false;
    // next frame, so the fade and slide run from the hidden state
    win!.requestAnimationFrame(() => menu!.classList.add('is-open'));
    toggle!.setAttribute('aria-expanded', 'true');
    doc.documentElement.style.overflow = 'hidden';
    doc.addEventListener('keydown', onKeydown);
    (focusables()[0] ?? menu!).focus();
  }

  function close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!openState) return;
    openState = false;
    menu!.classList.remove('is-open');
    toggle!.setAttribute('aria-expanded', 'false');
    doc.documentElement.style.overflow = '';
    doc.removeEventListener('keydown', onKeydown);
    hideTimer = win!.setTimeout(() => { menu!.hidden = true; }, 280);
    if (restoreFocus) toggle!.focus();
  }

  toggle.addEventListener('click', () => (openState ? close() : open()));
  closeButton?.addEventListener('click', () => close());
  // a tap on the dimmed area outside the panel closes it
  menu.addEventListener('click', event => {
    if (event.target === menu) close();
  });
  // A section link closes the menu, then (once the page can scroll again, next frame) brings the section in under
  // the header, updates the address and moves focus there, so keyboard and screen-reader users land with it too.
  // Letting the browser jump while the page was still locked landed the section a header's height too low.
  menu.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
    link.addEventListener('click', event => {
      close({ restoreFocus: false });
      const href = link.getAttribute('href') ?? '';
      const target = href.startsWith('#') ? doc.getElementById(href.slice(1)) : null;
      if (!target) return; // another page: let the browser go there
      event.preventDefault();
      win.requestAnimationFrame(() => goToSection(target, href, win));
    });
  });
  // growing past the phone layout closes it (the full nav takes over)
  const wide = win.matchMedia?.('(min-width: 1120px)'); // where the full nav appears (site.css)
  wide?.addEventListener?.('change', event => {
    if (event.matches) close({ restoreFocus: false });
  });

  return { open, close, isOpen: () => openState };
}

/** Scrolls a section in under the header (scroll-padding-top), puts its #id in the address and focuses it. */
export function goToSection(target: HTMLElement, hash: string, win: Window = window): void {
  target.scrollIntoView?.({ behavior: prefersReducedMotion(win) ? 'auto' : 'smooth', block: 'start' });
  if (win.location.hash !== hash) win.history.pushState(null, '', hash);
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** Marks the nav link of the section in view (aria-current + .is-active). Returns the observer, if any. */
export function initScrollSpy(doc: Document = document): IntersectionObserver | null {
  const win = doc.defaultView;
  const links = [...doc.querySelectorAll<HTMLAnchorElement>('.site-nav__link[href^="#"]')];
  if (!win || links.length === 0 || !('IntersectionObserver' in win)) return null;
  const byId = new Map(links.map(link => [link.getAttribute('href')!.slice(1), link]));
  const sections = [...byId.keys()].map(id => doc.getElementById(id)).filter((el): el is HTMLElement => !!el);

  const setActive = (id: string | null) => {
    for (const [key, link] of byId) {
      const on = key === id;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  const visible = new Set<string>();
  const observer = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target.id);
      else visible.delete(entry.target.id);
    }
    // the first section in page order that crosses the band just under the header
    const current = sections.find(section => visible.has(section.id));
    setActive(current ? current.id : null);
  }, { rootMargin: '-35% 0px -60% 0px' });
  sections.forEach(section => observer.observe(section));
  return observer;
}

/** "Log in" → "Open the app" when the app says someone is logged in on this browser. */
export function initAppLinks(doc: Document = document, storage?: Pick<Storage, 'getItem'>): boolean {
  let loggedIn = false;
  try {
    loggedIn = (storage ?? doc.defaultView?.localStorage)?.getItem(LOGGED_IN_KEY) === 'true';
  } catch {
    // storage blocked (private mode, cookies off): keep "Log in"
  }
  if (!loggedIn) return false;
  doc.querySelectorAll<HTMLElement>('[data-app-link][data-logged-in-text]').forEach(link => {
    link.textContent = link.dataset.loggedInText ?? link.textContent;
  });
  return true;
}
