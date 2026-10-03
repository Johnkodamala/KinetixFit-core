// The sign-in screen with the phone's text size at 2.0x (Android's WebView scales the glyphs of every font size, in any unit, but
// not lengths in em; measured on the S21 FE): the title "Welcome back" ran out of its card ("Welcom" and nothing after it), and
// the password field's placeholder ran on under its "Show" button (text may spill into a field's padding, and that padding is
// where the button sits). The legal links under the form were 17px tall, a hard target to hit. Layout can't run in a unit test;
// this pins the rules that fix those (at normal text size every one of them leaves the screen exactly as it was).
import { describe, it, expect } from 'vitest';
import onboardingCss from './onboarding.css?raw';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
function rule(selector: string): string {
  const found = noComments(onboardingCss).match(new RegExp(`(?:^|[\\s}])${escape(selector)}\\s*\\{([^}]*)\\}`));
  if (!found) throw new Error(`onboarding.css has no rule for ${selector}`);
  return found[1];
}

describe('the sign-in screen at large text sizes', () => {
  it('ends text that is too wide for a field in an ellipsis at its content edge, so a placeholder never runs on under the Show button', () => {
    expect(rule('.ob-input')).toMatch(/text-overflow:\s*ellipsis\s*;/);
    expect(rule('.ob-password .ob-input')).toMatch(/padding-right:\s*72px\s*;/); // the room the Show button sits in, unchanged
  });

  it('lets a word that is too wide for the title break, rather than be cut off at the edge of the card', () => {
    expect(rule('.ob-hero-title')).toMatch(/overflow-wrap:\s*anywhere\s*;/);
  });

  it('gives the legal links a tap area of about 45px without moving anything (vertical padding on an inline link adds hit area only)', () => {
    const links = rule('.ob-footnote a');
    expect(links).toMatch(/padding:\s*14px\s+2px\s*;/);
    expect(links).toMatch(/margin:\s*-14px\s+-2px\s*;/);
  });
});
