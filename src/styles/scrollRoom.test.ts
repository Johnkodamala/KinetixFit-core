// The room under the last card (so the floating tab bar never hides it) used to be `padding-bottom` on `.app-scroll-body`, a
// flex scroller. iOS WebKit leaves that padding out of the scrollable height whenever the content ends inside it: on an
// iPhone 13 mini the App icon page was 737 px of content on an 812 px screen, so its footnote ended under the tab bar with
// nothing to scroll (the same box with `display: block`, or an element in the flow, scrolls as it should; Android's WebView
// counts the padding either way). Layout can't be run in a unit test; this pins the rules that fix it.
import { describe, it, expect } from 'vitest';
import appCss from './app.css?raw';
import responsiveCss from './responsive.css?raw';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
function rules(css: string, selector: string): string[] {
  const found = [...noComments(css).matchAll(new RegExp(`(?:^|[\\s}])${escape(selector)}\\s*\\{([^}]*)\\}`, 'g'))];
  return found.map(m => m[1]);
}

describe('the room under the last card is a real element, not padding', () => {
  it('has a spacer after the last card that does not shrink and is as tall as the room, less the gap before it', () => {
    const spacer = rules(appCss, '.app-scroll-body::after').join(' ');
    expect(spacer).toMatch(/content:\s*''/);
    expect(spacer).toMatch(/flex:\s*none\s*;/);
    expect(spacer).toMatch(/height:\s*calc\(var\(--clear-bottom\)\s*-\s*16px\)/); // 16px is the scroller's gap
  });

  it('sets how much room in one place, with the safe area included', () => {
    const base = rules(appCss, '.app-scroll-body').join(' ');
    expect(base).toMatch(/--clear-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*112px\)/);
    expect(base).toMatch(/gap:\s*16px/);
  });

  it('never goes back to padding-bottom on the scroller, in any breakpoint', () => {
    for (const css of [appCss, responsiveCss]) {
      for (const body of rules(css, '.app-scroll-body')) expect(body).not.toMatch(/padding-bottom/);
    }
    // the padding shorthand (top, sides, bottom) leaves the bottom at 0
    expect(rules(appCss, '.app-scroll-body').join(' ')).toMatch(/padding:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*8px\)\s+16px\s+0\s*;/);
  });

  it('adjusts the room for smaller screens and for landscape through the same variable', () => {
    const all = rules(responsiveCss, '.app-scroll-body').join(' ');
    expect(all).toMatch(/--clear-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*96px\)/);
    expect(all).toMatch(/--clear-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*76px\)/);
  });
});
