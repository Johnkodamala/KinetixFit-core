// @vitest-environment jsdom
// "Your day": the lane fills as the reading line moves down the list and empties as it moves back up; a time's dot
// fills once it's reached; with reduced motion or no IntersectionObserver the whole day shows filled.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { READING_LINE, dayProgress, initDay } from './day';
import { FakeIntersectionObserver, loadPage, nextFrame, stubBrowser } from './testing';

const list = () => document.querySelector<HTMLElement>('[data-day]')!;
const items = () => [...list().querySelectorAll<HTMLElement>('.day__item')];
const passed = () => items().map(i => i.classList.contains('is-passed'));

/** Lays the list out `top` px from the top of an 800px screen: 1,600px tall, a time every 400px. */
function layOut(top: number) {
  vi.stubGlobal('innerHeight', 800);
  const box = (t: number, h: number) => ({ top: t, bottom: t + h, height: h, left: 0, right: 300, width: 300, x: 0, y: t, toJSON() {} }) as DOMRect;
  list().getBoundingClientRect = () => box(top, 1600);
  items().forEach((item, n) => {
    item.querySelector<HTMLElement>('.day__time')!.getBoundingClientRect = () => box(top + n * 400, 30);
  });
}

beforeEach(() => loadPage(pageHtml));
afterEach(() => vi.unstubAllGlobals());

describe('dayProgress', () => {
  it('is 0 until the reading line reaches the list, 1 once it has passed it, in proportion between', () => {
    expect(READING_LINE).toBe(0.55);
    expect(dayProgress(900, 1600, 800)).toBe(0);
    expect(dayProgress(460, 1600, 800)).toBe(0);
    expect(dayProgress(-360, 1600, 800)).toBe(0.5);
    expect(dayProgress(-1200, 1600, 800)).toBe(1);
    expect(dayProgress(0, 0, 800)).toBe(0);
  });
});

describe('initDay', () => {
  it('shows the whole day filled with reduced motion', () => {
    stubBrowser({ reducedMotion: true });
    initDay();
    expect(list().style.getPropertyValue('--p')).toBe('1');
    expect(passed()).toEqual([true, true, true, true]);
  });

  it('shows it filled without IntersectionObserver too', () => {
    stubBrowser({ observers: false });
    initDay();
    expect(passed().every(Boolean)).toBe(true);
  });

  it('fills the lane and the dots as the day scrolls up the screen, and empties them on the way back', async () => {
    stubBrowser();
    layOut(1000);
    const lane = initDay()!;
    expect(list().style.getPropertyValue('--p')).toBe('0.0000');
    expect(passed()).toEqual([false, false, false, false]);
    // the list comes near the screen: the lane starts listening to the scroll
    FakeIntersectionObserver.fireAll(list(), true);
    layOut(0); // reading line at 440: the times at 0 and 400 are passed
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(passed()).toEqual([true, true, false, false]);
    expect(Number(list().style.getPropertyValue('--p'))).toBeCloseTo(440 / 1600, 4);
    layOut(-500); // times at -500, -100, 300, 700: three passed
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(passed()).toEqual([true, true, true, false]);
    layOut(200); // back up: only the time at 200 is above the line
    lane.update();
    expect(passed()).toEqual([true, false, false, false]);
    expect(Number(list().style.getPropertyValue('--p'))).toBeCloseTo(240 / 1600, 4);
  });

  it('stops listening to the scroll once the day is out of the way', async () => {
    stubBrowser();
    layOut(0);
    initDay();
    FakeIntersectionObserver.fireAll(list(), true);
    FakeIntersectionObserver.fireAll(list(), false);
    layOut(-1200);
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(passed()).toEqual([true, true, false, false]); // still as at 0: nothing's listening
  });
});
