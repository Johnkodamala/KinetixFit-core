// Widgets (site/index.html → #widgets). The Light / Dark switch shows the home-screen widgets in either look: its radios
// set data-wtheme on the section, which site.css turns into the widgets' own light or dark palette (the page itself
// stays light). Where the browser can, the change cross-fades (a view transition); with reduced motion it's instant.
// Without JS, CSS reads the checked radio itself (:has). The wall of all 14 scrolls sideways on phones: only then is
// it a keyboard stop, so it can be scrolled with the arrow keys.
import { prefersReducedMotion, rafThrottle } from './motion';

export type WidgetTheme = 'light' | 'dark';

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

export interface WidgetsSection {
  section: HTMLElement;
  theme(): WidgetTheme;
}

/** Wires the switch and the wall (none on the 404 page). */
export function initWidgets(doc: Document = document): WidgetsSection | null {
  const section = doc.querySelector<HTMLElement>('[data-wtheme]');
  const win = doc.defaultView;
  if (!section || !win) return null;
  const inputs = [...section.querySelectorAll<HTMLInputElement>('[data-wtheme-input]')];
  const chosen = (): WidgetTheme => (inputs.find(input => input.checked)?.value === 'dark' ? 'dark' : 'light');
  const show = () => {
    section.dataset.wtheme = chosen();
  };
  inputs.forEach(input => input.addEventListener('change', () => {
    const fade = (doc as TransitionDocument).startViewTransition;
    if (typeof fade === 'function' && !prefersReducedMotion(win)) fade.call(doc, show);
    else show();
  }));
  // a choice the browser kept (back / forward) shows at once
  show();

  const wall = section.querySelector<HTMLElement>('[data-wwall]');
  if (wall) {
    const focusable = () => {
      if (wall.scrollWidth > wall.clientWidth + 1) wall.setAttribute('tabindex', '0');
      else wall.removeAttribute('tabindex');
    };
    focusable();
    win.addEventListener('resize', rafThrottle(focusable, win));
  }

  return { section, theme: () => (section.dataset.wtheme === 'dark' ? 'dark' : 'light') };
}
