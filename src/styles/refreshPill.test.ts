// The "Updated from your account · Refresh" pill is a fixed box centred with `left: 50%`. With no width of its own such a
// box can only grow into the right half of the screen, so its text was squeezed to one word a line: measured on the S21 FE
// and the iPhone 13 mini, a 194 x 84 px blob four lines tall, sitting on top of the page. Layout can't be run in a unit
// test, so this pins the rules that fix it; the real check is measuring the pill on a phone (it is 309 x 48 on one line).
import { describe, it, expect } from 'vitest';
import plusCss from './plus.css?raw';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rule(selector: string): string {
  const found = plusCss.match(new RegExp(`(?:^|\\n)${escape(selector)}\\s*\\{([^}]*)\\}`));
  if (!found) throw new Error(`plus.css has no rule for ${selector}`);
  return found[1].replace(/\/\*[\s\S]*?\*\//g, ''); // without the comments
}
const has = (body: string, declaration: string) => expect(body).toMatch(new RegExp(`(?:^|;|\\s)${escape(declaration)}\\s*;`));

describe('the refresh pill sizes itself', () => {
  const pill = rule('.kx-refresh-pill');

  it('has a width of its own, and never wider than the screen', () => {
    has(pill, 'width: max-content');
    has(pill, 'max-width: calc(100vw - 24px)');
    has(pill, 'box-sizing: border-box'); // so that the cap includes its padding
  });

  it('keeps the same top as the message pill, below the status bar', () => {
    has(pill, 'top: calc(env(safe-area-inset-top, 0px) + 10px)');
  });

  it('lets only the text wrap (a narrow phone, large system text); the buttons never shrink or break', () => {
    const text = rule('.kx-refresh-pill > span');
    has(text, 'flex: 1 1 auto');
    has(text, 'min-width: 0');
    has(rule('.kx-refresh-go'), 'flex: none');
    has(rule('.kx-refresh-go'), 'white-space: nowrap');
    has(rule('.kx-refresh-x'), 'flex: none');
  });

  it('has buttons that are easy to hit: at least 36 px tall, and the dismiss button a 36 px square', () => {
    has(rule('.kx-refresh-go'), 'min-height: 36px');
    const x = rule('.kx-refresh-x');
    has(x, 'width: 36px');
    has(x, 'height: 36px');
  });
});
