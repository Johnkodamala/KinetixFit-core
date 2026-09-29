// @vitest-environment jsdom
// Reveals, the hero entrance, parallax and the FAQ animation: everything shows at once with reduced motion or
// without IntersectionObserver, and animates only when allowed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { initFaq } from './faq';
import { canAnimate, prefersReducedMotion, rafThrottle } from './motion';
import { initParallax, parallaxOffset, MAX_SHIFT_PX } from './parallax';
import { initHero, initReveal, staggerDelay, whenDisplayFontReady } from './reveal';
import { FakeIntersectionObserver, loadPage, nextFrame, stubBrowser } from './testing';

beforeEach(() => loadPage(pageHtml));
afterEach(() => vi.unstubAllGlobals());

describe('motion checks', () => {
  it('respects reduced motion and missing observers', () => {
    stubBrowser({ reducedMotion: true });
    expect(prefersReducedMotion()).toBe(true);
    expect(canAnimate()).toBe(false);
    stubBrowser({ reducedMotion: false, observers: false });
    expect(canAnimate()).toBe(false);
    stubBrowser();
    expect(canAnimate()).toBe(true);
  });

  it('rafThrottle runs once per frame with the latest arguments', async () => {
    stubBrowser();
    const fn = vi.fn();
    const throttled = rafThrottle(fn);
    throttled(1);
    throttled(2);
    throttled(3);
    await nextFrame();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });
});

describe('reveals', () => {
  it('staggers neighbours a beat apart, capped', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBe(80);
    expect(staggerDelay(3)).toBe(240);
    expect(staggerDelay(20)).toBe(400);
  });

  it('shows everything at once with reduced motion', () => {
    stubBrowser({ reducedMotion: true });
    expect(initReveal()).toBeNull();
    const reveals = [...document.querySelectorAll('.reveal')];
    expect(reveals.length).toBeGreaterThan(20);
    reveals.forEach(el => expect(el.classList.contains('is-in')).toBe(true));
    document.querySelectorAll('[data-sprint]:not(.hero [data-sprint])').forEach(el => expect(el.classList.contains('is-sprinted')).toBe(true));
  });

  it('shows everything at once without IntersectionObserver', () => {
    stubBrowser({ observers: false });
    initReveal();
    document.querySelectorAll('.reveal').forEach(el => expect(el.classList.contains('is-in')).toBe(true));
  });

  it('reveals each element once as it arrives, then opens its sprint line', async () => {
    stubBrowser();
    initReveal();
    const manifesto = document.querySelector<HTMLElement>('.why .manifesto')!;
    expect(manifesto.classList.contains('is-in')).toBe(false);
    FakeIntersectionObserver.fireAll(manifesto);
    expect(manifesto.classList.contains('is-in')).toBe(true);
    await whenDisplayFontReady(document, 10);
    await new Promise(r => setTimeout(r, 260));
    expect(manifesto.querySelector('[data-sprint]')!.classList.contains('is-sprinted')).toBe(true);
    // unobserved after the first time
    const io = FakeIntersectionObserver.instances.at(-1)!;
    expect(io.observed.has(manifesto)).toBe(false);
  });

  it('gives consecutive siblings increasing delays', () => {
    stubBrowser();
    initReveal();
    const principles = [...document.querySelectorAll<HTMLElement>('.principle')];
    expect(principles[0].style.getPropertyValue('--delay')).toBe('');
    expect(principles[1].style.getPropertyValue('--delay')).toBe('80ms');
    expect(principles[3].style.getPropertyValue('--delay')).toBe('240ms');
  });

  it('marks the how-it-works lane when it arrives', () => {
    stubBrowser();
    initReveal();
    const steps = document.querySelector('[data-steps]')!;
    FakeIntersectionObserver.fireAll(steps);
    expect(steps.classList.contains('is-in')).toBe(true);
  });
});

describe('the hero entrance', () => {
  it('plays the entrance and then opens "Real rewards." to full width', async () => {
    stubBrowser();
    const done = initHero();
    const hero = document.querySelector('.hero')!;
    await nextFrame();
    await nextFrame();
    expect(hero.classList.contains('is-ready')).toBe(true);
    await done;
    await new Promise(r => setTimeout(r, 220));
    expect(hero.querySelector('[data-sprint]')!.classList.contains('is-sprinted')).toBe(true);
  });

  it('is simply there with reduced motion', async () => {
    stubBrowser({ reducedMotion: true });
    await initHero();
    expect(document.querySelector('.hero')!.classList.contains('is-ready')).toBe(true);
    expect(document.querySelector('.hero [data-sprint]')!.classList.contains('is-sprinted')).toBe(true);
  });

  it('never waits long for the font', async () => {
    const slow = { fonts: { load: () => new Promise(() => {}) } } as unknown as Document;
    const start = Date.now();
    await whenDisplayFontReady(slow, 30);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('parallax', () => {
  it('starts at zero, lags with a positive speed, leads with a negative one, and is capped', () => {
    expect(parallaxOffset(0, 0.3)).toBe(0);
    expect(parallaxOffset(100, 0.3)).toBe(30);
    expect(parallaxOffset(100, -0.08)).toBe(-8);
    expect(parallaxOffset(10000, 0.3)).toBe(MAX_SHIFT_PX);
    expect(parallaxOffset(10000, -0.3)).toBe(-MAX_SHIFT_PX);
    // iOS rubber-band overscroll (negative scroll) doesn't move anything
    expect(parallaxOffset(-80, 0.3)).toBe(0);
  });

  it('writes --py on the hero layers as the page scrolls', async () => {
    stubBrowser();
    initParallax();
    const lanes = document.querySelector<SVGElement>('.hero__lanes')!;
    expect(lanes.style.getPropertyValue('--py')).toBe('0px');
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(lanes.style.getPropertyValue('--py')).toBe(`${parallaxOffset(200, 0.3)}px`);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('does nothing with reduced motion', () => {
    stubBrowser({ reducedMotion: true });
    initParallax();
    expect(document.querySelector<SVGElement>('.hero__lanes')!.style.getPropertyValue('--py')).toBe('');
  });
});

describe('FAQ', () => {
  it('uses native details, so answers work without JS', () => {
    const items = document.querySelectorAll('[data-faq] details');
    expect(items.length).toBeGreaterThanOrEqual(8);
    items.forEach(d => {
      expect(d.querySelector('summary')).not.toBeNull();
      expect(d.hasAttribute('open')).toBe(false);
    });
  });

  it('animates opening and closing when motion is allowed', async () => {
    stubBrowser();
    const animations: { keyframes: Keyframe[]; anim: { onfinish: (() => void) | null; cancel: () => void } }[] = [];
    HTMLElement.prototype.animate = function (keyframes: Keyframe[]) {
      const anim = { onfinish: null as (() => void) | null, cancel: vi.fn() };
      animations.push({ keyframes, anim });
      return anim as unknown as Animation;
    } as typeof HTMLElement.prototype.animate;
    expect(initFaq()).toBeGreaterThanOrEqual(8);
    const details = document.querySelector<HTMLDetailsElement>('[data-faq] details')!;
    const summary = details.querySelector('summary')!;
    summary.click();
    expect(details.open).toBe(true);
    expect(animations[0].keyframes[0]).toMatchObject({ height: '0px' });
    summary.click();
    expect(details.open).toBe(true); // stays open until the closing animation ends
    animations[1].anim.onfinish?.();
    expect(details.open).toBe(false);
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it('leaves the browser to toggle it with reduced motion', () => {
    stubBrowser({ reducedMotion: true });
    initFaq();
    const summary = document.querySelector('[data-faq] summary')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    summary.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
