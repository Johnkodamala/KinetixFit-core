// @vitest-environment jsdom
// The phone's demo: the timeline tells one story in order, each state lands on the stage as data attributes and
// words, the numbers are the app's own, and it only plays when motion is allowed and the phone is on screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import { questsForToday } from '../lib/quests';
import { BEATS, LOOP_MS, START, STILL, initDemo, paint, stateAt, touch } from './demo';
import { FakeIntersectionObserver, loadPage, stubBrowser } from './testing';

const stage = () => document.querySelector<HTMLElement>('[data-demo-stage]')!;
const text = (selector: string) => document.querySelector(selector)!.textContent!.replace(/\s+/g, ' ').trim();

beforeEach(() => loadPage(pageHtml));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the timeline', () => {
  it('runs in order, inside one loop, and every tap comes just before what it causes', () => {
    const times = BEATS.map(b => b.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.at(-1)!).toBeLessThan(LOOP_MS);
    BEATS.forEach((beat, i) => {
      if (!beat.touch) return;
      const effect = BEATS[i + 1];
      expect(effect?.set, beat.touch).toBeDefined();
      expect(effect.at - beat.at).toBeGreaterThan(0);
      expect(effect.at - beat.at).toBeLessThanOrEqual(300);
    });
  });

  it('tells the story: water on Today, a quest claimed on Rewards, nutrients on Nourish, back to Today', () => {
    expect(stateAt(0)).toEqual(START);
    const scenes = BEATS.filter(b => b.set?.scene).map(b => b.set!.scene);
    expect(scenes).toEqual(['rewards', 'nourish', 'today']);
    const glassAt = BEATS.find(b => b.set?.glass)!.at;
    const rewardsAt = BEATS.find(b => b.set?.scene === 'rewards')!.at;
    const claimAt = BEATS.find(b => b.set?.claim)!.at;
    const nourishAt = BEATS.find(b => b.set?.scene === 'nourish')!.at;
    expect(stateAt(glassAt)).toMatchObject({ scene: 'today', glass: true });
    expect(stateAt(rewardsAt)).toMatchObject({ scene: 'rewards', todayScroll: false });
    expect(stateAt(claimAt)).toMatchObject({ scene: 'rewards', claim: true, toast: true });
    expect(stateAt(nourishAt)).toMatchObject({ scene: 'nourish', toast: false });
    // the screen fades out before the loop starts over
    expect(stateAt(LOOP_MS - 1).fade).toBe(true);
  });

  it('shows Today with the glass added when nothing plays', () => {
    expect(STILL).toMatchObject({ scene: 'today', glass: true, claim: false, toast: false, fade: false });
  });
});

describe('painting a state', () => {
  it('writes the scene and every flag as data attributes', () => {
    paint(stage(), { ...START, scene: 'rewards', claim: true }, null, window);
    expect(stage().dataset.scene).toBe('rewards');
    expect(stage().dataset.claim).toBe('on');
    expect(stage().dataset.glass).toBe('off');
    expect(stage().getAttribute('data-today-scroll')).toBe('off');
  });

  it('changes the words with the state: the water, the XP, the quest and the points', () => {
    paint(stage(), START, null, window);
    expect(text('.ap-hydro__amount')).toBe('1 L');
    expect(text('.ap-hydro__sub')).toBe('1 L to go');
    expect(text('[data-demo-count]')).toBe('1,112');
    expect(text('[data-demo-quest] .ap-quest__meta')).toBe('Done — tap to claim');
    paint(stage(), { ...START, glass: true, claim: true }, null, window);
    expect(text('.ap-hydro__amount')).toBe('1.25 L');
    expect(text('.ap-hydro__sub')).toBe('750 ml to go');
    expect(text('[data-demo-count]')).toBe('1,119');
    expect(text('[data-demo-quest] .ap-quest__meta')).toBe('Claimed');
    expect(text('[data-view="rewards"] .ap-count')).toBe('2 of 3 done');
  });

  it('counts the points up when the quest is claimed', async () => {
    stubBrowser();
    paint(stage(), START, null, window);
    paint(stage(), { ...START, claim: true }, START, window);
    expect(text('[data-demo-count]')).toBe('1,112');
    await new Promise(r => setTimeout(r, 800));
    expect(text('[data-demo-count]')).toBe('1,119');
  });

  it('shows a tap: the touch dot plays and the button presses in, briefly', () => {
    vi.useFakeTimers();
    touch(stage(), 'water', window);
    const dot = document.querySelector<HTMLElement>('[data-demo-touch]')!;
    expect(dot.dataset.at).toBe('water');
    expect(dot.classList.contains('is-on')).toBe(true);
    expect(stage().dataset.press).toBe('water');
    vi.advanceTimersByTime(300);
    expect(stage().dataset.press).toBeUndefined();
  });
});

describe('the numbers are the app’s own', () => {
  it('uses quests the app really offers, with their points', () => {
    // Maya's goal is Cardio Endurance; her watch recorded a workout (claimed) and 7h 20m of sleep; 6,842 steps so far
    const quests = questsForToday('Cardio Endurance', {
      steps: 6842, sleepMinutes: 440, hrv: null, foodChecks: 4, protein: 43, proteinTarget: 87, fibre: 32, fibreTarget: 30, workoutsToday: 1,
    }, ['Q-workout']);
    const shown = [...document.querySelectorAll('[data-view="rewards"] .ap-quest')].map(q => ({
      text: q.querySelector('.ap-quest__text')!.textContent,
      points: q.querySelector('.ap-quest__pts')!.textContent,
    }));
    expect(shown).toEqual(quests.map(q => ({ text: q.text, points: `+${q.pointsValue}` })));
    const steps = quests.find(q => q.source === 'steps')!;
    expect(text('[data-view="rewards"] .ap-quest:nth-child(2) .ap-quest__meta')).toBe(steps.progressLabel);
    expect(quests.find(q => q.source === 'sleep')!.done).toBe(true);
    const sleep = quests.find(q => q.text === 'Sleep 7 hours or more')!;
    expect(document.querySelector('[data-demo-count]')!.getAttribute('data-b')).toBe(String(1112 + sleep.pointsValue));
  });
});

describe('initDemo', () => {
  it('shows the still picture with reduced motion, and never plays', () => {
    stubBrowser({ reducedMotion: true });
    const demo = initDemo()!;
    demo.start();
    expect(stage().dataset.glass).toBe('on');
    expect(stage().dataset.scene).toBe('today');
    expect(demo.isPlaying()).toBe(false);
  });

  it('plays only once started and on screen, and rests off screen', async () => {
    stubBrowser();
    const demo = initDemo()!;
    expect(stage().dataset.glass).toBeUndefined(); // the page is written in the start state: nothing to write yet
    demo.start(0);
    await new Promise(r => setTimeout(r, 5));
    expect(demo.isPlaying()).toBe(false); // not on screen yet
    FakeIntersectionObserver.fireAll(stage(), true);
    expect(demo.isPlaying()).toBe(true);
    FakeIntersectionObserver.fireAll(stage(), false);
    expect(demo.isPlaying()).toBe(false);
    expect(stage().classList.contains('is-paused')).toBe(true);
  });
});
