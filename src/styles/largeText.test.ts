// Nothing may run off the screen: not with a long name at normal text size, and not with the phone's text at 2.0x. Measured
// on the S21 FE (2.0x) and the iPhone 13 mini simulator (a 33-letter name):
//  - the Account header: plus.css sets `overflow: visible` on the name (so the PLUS badge's glow isn't clipped), which also
//    switched off its ellipsis, so a long name ran off the right edge, pushed the badge off-screen and made the whole page
//    scroll sideways (scrollWidth 528 on a 375 px screen);
//  - the tab bar: `1fr` columns can't shrink below their content, so with large text the Account tab ran past the bar;
//  - Today's targets row: three fixed columns, the third ("25g fibre") ended up off the card;
//  - Plan & billing: two `1fr` columns that overflowed the card by 12 px; card titles ("Achievements") ran out of their card.
// Layout can't run in a unit test; this pins the rules that fix those (each is a no-op while everything fits).
import { describe, it, expect } from 'vitest';
import appCss from './app.css?raw';
import plusCss from './plus.css?raw';
import responsiveCss from './responsive.css?raw';

const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
function rules(css: string, selector: string): string {
  const found: string[] = [];
  for (const m of noComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').map(x => x.trim().replace(/^[\s\S]*\n/, '')).includes(selector)) found.push(m[2]);
  }
  return found.join('\n');
}

describe('the Account header with a long name', () => {
  it('truncates the name itself and keeps the badge beside it, whatever the length', () => {
    expect(rules(appCss, '.kx-account-name')).toMatch(/display:\s*flex\s*;/);
    const text = rules(appCss, '.kx-account-name-text');
    expect(text).toMatch(/min-width:\s*0\s*;/);
    expect(text).toMatch(/overflow:\s*hidden\s*;/);
    expect(text).toMatch(/text-overflow:\s*ellipsis\s*;/);
    expect(text).toMatch(/white-space:\s*nowrap\s*;/);
    expect(rules(plusCss, '.kx-account-name .kx-plus-badge')).toMatch(/flex:\s*none\s*;/);
  });
});

describe('with the phone\'s text at 2.0x', () => {
  it('the tab bar keeps four equal columns inside the bar and cuts a label that is too wide', () => {
    expect(rules(appCss, '.phone-bottom-nav')).toMatch(/grid-template-columns:\s*repeat\(var\(--tab-count\),\s*minmax\(0,\s*1fr\)\)\s*;/);
    expect(rules(appCss, '.nav-item-btn')).toMatch(/min-width:\s*0\s*;/);
    const label = rules(appCss, '.nav-label');
    expect(label).toMatch(/max-width:\s*100%\s*;/);
    expect(label).toMatch(/overflow:\s*hidden\s*;/);
    expect(label).toMatch(/text-overflow:\s*ellipsis\s*;/);
  });

  it("Today's targets wrap onto a second line instead of leaving the card", () => {
    const row = rules(appCss, '.kx-hero-target-row');
    expect(row).toMatch(/display:\s*flex\s*;/);
    expect(row).toMatch(/flex-wrap:\s*wrap\s*;/);
  });

  it('the two plans stay inside the card, and a long word breaks rather than overflow', () => {
    expect(rules(appCss, '.kx-plan-grid')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);
    const plan = rules(appCss, '.kx-plan');
    expect(plan).toMatch(/min-width:\s*0\s*;/);
    expect(plan).toMatch(/overflow-wrap:\s*anywhere\s*;/);
  });

  it('card titles break a word that is too wide for the card', () => {
    expect(rules(appCss, '.quests-title')).toMatch(/overflow-wrap:\s*anywhere\s*;/);
  });

  it('the small-screen override of the targets row keeps the wrap', () => {
    expect(rules(responsiveCss, '.kx-hero-target-row')).not.toMatch(/grid-template-columns/);
  });
});
