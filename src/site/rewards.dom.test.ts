// @vitest-environment jsdom
// The Rewards story on the page: the finished story without motion, and the cup, counter, lane, milestones and beat
// highlights following the scroll when motion is allowed. Also the footer's follow links and the numbers JS fills in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { REWARDS } from './config';
import { fillRewardNumbers, initRewards } from './rewards';
import { renderFollowLinks, validProfiles } from './social';
import { FakeIntersectionObserver, loadPage, stubBrowser } from './testing';

beforeEach(() => loadPage(pageHtml));
afterEach(() => vi.unstubAllGlobals());

const count = () => document.querySelector('[data-points-count]')!.textContent;
const status = () => document.querySelector('[data-journey-status]')!.textContent;
const level = () => Number(document.querySelector<HTMLElement>('.journey__visual')!.style.getPropertyValue('--level'));
const cup = () => document.querySelector('[data-cup]')!;

/** Puts beat `index`'s top edge exactly on the reading line and every other beat above/below it. */
function scrollToBeat(index: number) {
  const line = window.innerHeight * 0.55;
  document.querySelectorAll<HTMLElement>('.beat').forEach((beat, i) => {
    const top = line + (i - index) * 300 - (i <= index ? 1 : -1);
    beat.getBoundingClientRect = () => ({ top, bottom: top + 280 } as DOMRect);
  });
  window.dispatchEvent(new Event('scroll'));
}
const settle = () => new Promise(r => setTimeout(r, 760));

describe('without motion', () => {
  it('shows the finished story: a full cup at 1,000', () => {
    stubBrowser({ reducedMotion: true });
    const story = initRewards()!;
    expect(story.total()).toBe(REWARDS.voucherPoints);
    expect(count()).toBe('1,000');
    expect(status()).toBe('Coffee’s on us.');
    expect(level()).toBe(1);
    expect(cup().classList.contains('is-full')).toBe(true);
    expect(document.querySelector('.journey')!.classList.contains('is-live')).toBe(false);
    document.querySelectorAll('.cup__mark').forEach(m => expect(m.classList.contains('is-reached')).toBe(true));
  });
});

describe('with motion, following the scroll', () => {
  beforeEach(() => {
    stubBrowser();
    initRewards();
    FakeIntersectionObserver.fireAll(document.querySelector('[data-rewards]')!, true);
  });

  it('starts empty, before the first beat', async () => {
    scrollToBeat(-1);
    await settle();
    expect(document.querySelector('.journey')!.classList.contains('is-live')).toBe(true);
    expect(level()).toBe(0);
    expect(count()).toBe('0');
    expect(cup().classList.contains('is-full')).toBe(false);
  });

  it('fills as the beats pass, highlighting the current one', async () => {
    scrollToBeat(1);
    await settle();
    expect(count()).toBe('13');
    expect(level()).toBeCloseTo(13 / REWARDS.voucherPoints, 5);
    expect(status()).toBe('Every small win adds up.');
    const beats = [...document.querySelectorAll('.beat')];
    expect(beats[0].classList.contains('is-past')).toBe(true);
    expect(beats[1].classList.contains('is-active')).toBe(true);
    expect(beats[2].classList.contains('is-active') || beats[2].classList.contains('is-past')).toBe(false);
  });

  it('brews the coffee on the last beat, not before', async () => {
    const beats = [...document.querySelectorAll<HTMLElement>('.beat')];
    scrollToBeat(beats.length - 2);
    await settle();
    expect(status()).not.toBe('Coffee’s on us.');
    expect(document.querySelector('.cup__mark--coffee')!.classList.contains('is-reached')).toBe(false);
    scrollToBeat(beats.length - 1);
    await settle();
    expect(count()).toBe('1,000');
    expect(cup().classList.contains('is-full')).toBe(true);
    expect(document.querySelector('.cup__mark--coffee')!.classList.contains('is-reached')).toBe(true);
  });

  it('empties again when scrolling back up', async () => {
    scrollToBeat(5);
    await settle();
    scrollToBeat(-1);
    await settle();
    expect(count()).toBe('0');
    expect(document.querySelectorAll('.beat.is-active, .beat.is-past')).toHaveLength(0);
  });

  it('only runs the cup’s wave while the section is on screen', () => {
    const section = document.querySelector('[data-rewards]')!;
    expect(section.classList.contains('is-visible')).toBe(true);
    FakeIntersectionObserver.fireAll(section, false);
    expect(section.classList.contains('is-visible')).toBe(false);
  });
});

describe('the cup’s milestone marks', () => {
  it('carry the real thresholds', () => {
    expect(document.querySelector<HTMLElement>('.cup__mark--coffee')!.dataset.points).toBe(String(REWARDS.voucherPoints));
  });
});

describe('numbers filled in from the config', () => {
  it('writes every [data-reward] from REWARDS', () => {
    document.querySelectorAll<HTMLElement>('[data-reward]').forEach(el => { el.textContent = '?'; });
    fillRewardNumbers();
    expect(document.querySelector('[data-reward="voucherPoints"]')!.textContent).toBe('1,000');
    expect(document.querySelector('[data-reward="voucherValue"]')!.textContent).toBe('£5');
    expect(document.querySelector('[data-reward="donationValue"]')!.textContent).toBe('£2.50');
    expect(document.querySelectorAll('[data-reward]')).toHaveLength(10);
    document.querySelectorAll('[data-reward]').forEach(el => expect(el.textContent).not.toBe('?'));
  });
});

describe('follow links', () => {
  it('say Coming soon until there is a real account', () => {
    expect(renderFollowLinks(document, [])).toBe(0);
    const column = document.querySelector<HTMLElement>('[data-follow]')!;
    expect(column.hidden).toBe(false);
    expect(column.querySelector('h2')!.textContent).toBe('Follow us');
    expect([...column.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Coming soon']);
    expect(column.querySelector('a')).toBeNull();
  });

  it('only accept complete https addresses of known networks', () => {
    expect(validProfiles([
      { network: 'instagram', url: 'https://www.instagram.com/example' },
      { network: 'tiktok', url: 'http://www.tiktok.com/@example' },
      { network: 'x', url: 'not a url' },
      { network: 'myspace' as never, url: 'https://myspace.com/example' },
    ])).toEqual([{ network: 'instagram', url: 'https://www.instagram.com/example' }]);
  });

  it('show up as safe new-tab links once added', () => {
    expect(renderFollowLinks(document, [
      { network: 'instagram', url: 'https://www.instagram.com/example' },
      { network: 'linkedin', url: 'https://www.linkedin.com/company/example' },
    ])).toBe(2);
    const column = document.querySelector<HTMLElement>('[data-follow]')!;
    expect(column.hidden).toBe(false);
    const links = [...column.querySelectorAll('a')];
    expect(links.map(a => a.firstChild?.textContent)).toEqual(['Instagram', 'LinkedIn']);
    links.forEach(a => {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
      expect(a.textContent).toContain('(opens in a new tab)');
    });
  });
});
