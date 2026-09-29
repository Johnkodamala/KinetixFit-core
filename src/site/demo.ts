// The phone in the hero plays like a screen recording of the app, on a loop: on Today a glass of water is added and
// the screen scrolls down to the check-in and the trend cards; on Rewards the sleep quest is claimed (the app's
// "Quest verified" message drops in and the points count up); on Nourish the day's nutrients fill against Maya's
// targets; then back to Today and a short fade to the start. The timeline is a list of states: each is written onto
// the stage as data attributes (site.css → "The app in the hero" draws it), with a touch dot for every tap. It plays
// only while the phone is on screen and the tab is visible. With reduced motion, or without IntersectionObserver,
// nothing plays: the phone shows Today with the glass added.
import { formatPoints } from './format';
import { canAnimate } from './motion';
import { tweenNumber } from './rewards';

export type Scene = 'today' | 'rewards' | 'nourish';
export type Touch = 'water' | 'tab-today' | 'tab-nourish' | 'tab-rewards' | 'quest';

export interface DemoState {
  scene: Scene;
  /** Today scrolled down to the check-in and the trend cards */
  todayScroll: boolean;
  /** Rewards scrolled down to today's quests */
  rewardsScroll: boolean;
  /** a glass of water added on Today: 1 L → 1.25 L */
  glass: boolean;
  /** the sleep quest claimed: +7 points and +25 XP */
  claim: boolean;
  /** the app's "Quest verified" message on screen */
  toast: boolean;
  /** the screen fading out at the end of the loop */
  fade: boolean;
}

export interface Beat {
  /** ms from the start of the loop */
  at: number;
  set?: Partial<DemoState>;
  /** a finger lands here: the touch dot, and the button pressing in */
  touch?: Touch;
}

export const START: DemoState = {
  scene: 'today', todayScroll: false, rewardsScroll: false, glass: false, claim: false, toast: false, fade: false,
};
/** What the phone shows when nothing plays. */
export const STILL: DemoState = { ...START, glass: true };

/** Each tap comes a moment before what it causes, as it would under a thumb. */
export const BEATS: Beat[] = [
  { at: 1500, touch: 'water' },
  { at: 1650, set: { glass: true } },
  { at: 3500, set: { todayScroll: true } },
  { at: 6000, touch: 'tab-rewards' },
  { at: 6150, set: { scene: 'rewards', todayScroll: false } },
  { at: 7500, set: { rewardsScroll: true } },
  { at: 8900, touch: 'quest' },
  { at: 9050, set: { claim: true, toast: true } },
  { at: 11900, set: { toast: false } },
  { at: 12400, touch: 'tab-nourish' },
  { at: 12550, set: { scene: 'nourish', rewardsScroll: false } },
  { at: 17000, touch: 'tab-today' },
  { at: 17150, set: { scene: 'today' } },
  { at: 19400, set: { fade: true } },
];
export const LOOP_MS = 19800;
/** How long a tapped button stays pressed in */
const PRESS_MS = 220;
/** A longer gap between frames (a hidden tab, a busy moment) counts as this much, so nothing is skipped. */
const MAX_FRAME_MS = 100;

const FLAGS: (keyof Omit<DemoState, 'scene'>)[] = ['todayScroll', 'rewardsScroll', 'glass', 'claim', 'toast', 'fade'];

/** The state `ms` into the loop. */
export function stateAt(ms: number): DemoState {
  let state = { ...START };
  for (const beat of BEATS) {
    if (beat.at > ms) break;
    if (beat.set) state = { ...state, ...beat.set };
  }
  return state;
}

/**
 * Writes a state onto the stage: data attributes for the CSS (data-scene, and data-glass="on" and so on), the words
 * that change ([data-demo-swap="glass"] shows data-a, or data-b once `glass` is on) and the points, which count up
 * when the quest is claimed ([data-demo-count]).
 */
export function paint(stage: HTMLElement, state: DemoState, previous: DemoState | null, win: Window): void {
  stage.dataset.scene = state.scene;
  for (const flag of FLAGS) stage.dataset[flag] = state[flag] ? 'on' : 'off';
  stage.querySelectorAll<HTMLElement>('[data-demo-swap]').forEach(el => {
    const on = state[el.dataset.demoSwap as keyof DemoState] === true;
    el.textContent = (on ? el.dataset.b : el.dataset.a) ?? el.textContent;
  });
  stage.querySelectorAll<HTMLElement>('[data-demo-count]').forEach(el => {
    const key = el.dataset.demoCount as keyof DemoState;
    const from = Number(el.dataset.a);
    const to = Number(el.dataset.b);
    const on = state[key] === true;
    if (on && previous !== null && previous[key] !== true) tweenNumber(el, from, to, 700, win);
    else el.textContent = formatPoints(on ? to : from);
  });
}

/** A finger lands on `target`: the touch dot plays there and the button presses in. */
export function touch(stage: HTMLElement, target: Touch, win: Window): void {
  const dot = stage.querySelector<HTMLElement>('[data-demo-touch]');
  if (dot) {
    dot.dataset.at = target;
    dot.classList.remove('is-on');
    void dot.offsetWidth; // restart its animation
    dot.classList.add('is-on');
  }
  stage.dataset.press = target;
  win.setTimeout(() => {
    if (stage.dataset.press === target) delete stage.dataset.press;
  }, PRESS_MS);
}

export interface DemoPlayer {
  /** Starts the loop `delayMs` from now: once the hero has arrived, so the phone has landed first. */
  start(delayMs?: number): void;
  isPlaying(): boolean;
}

export function initDemo(doc: Document = document): DemoPlayer | null {
  const stage = doc.querySelector<HTMLElement>('[data-demo-stage]');
  const win = doc.defaultView;
  if (!stage || !win) return null;
  if (!canAnimate(win)) {
    paint(stage, STILL, null, win);
    return { start: () => {}, isPlaying: () => false };
  }

  // the page is written in the start state, so nothing needs writing until the first beat
  let state = START;
  let elapsed = 0;
  let next = 0;
  let last = 0;
  let frame = 0;
  let started = false;
  let onScreen = false;

  const set = (changes: Partial<DemoState>) => {
    const previous = state;
    state = { ...state, ...changes };
    paint(stage, state, previous, win);
  };

  // Back to the start while the screen is dark: every change lands at once, then the screen fades back in.
  const restart = () => {
    elapsed = 0;
    next = 0;
    stage.dataset.instant = '';
    set({ ...START, fade: true });
    void stage.offsetWidth;
    delete stage.dataset.instant;
    set({ fade: false });
  };

  const step = (now: number) => {
    elapsed += last ? Math.min(now - last, MAX_FRAME_MS) : 0;
    last = now;
    while (next < BEATS.length && BEATS[next].at <= elapsed) {
      const beat = BEATS[next];
      next += 1;
      if (beat.touch) touch(stage, beat.touch, win);
      if (beat.set) set(beat.set);
    }
    if (elapsed >= LOOP_MS) restart();
    frame = win.requestAnimationFrame(step);
  };

  const play = () => {
    if (frame || !started || !onScreen || doc.hidden) return;
    last = 0;
    stage.classList.remove('is-paused');
    frame = win.requestAnimationFrame(step);
  };
  const pause = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    stage.classList.add('is-paused');
  };

  new win.IntersectionObserver(entries => {
    onScreen = entries.some(entry => entry.isIntersecting);
    if (onScreen) play();
    else pause();
  }, { threshold: 0.2 }).observe(stage);
  doc.addEventListener('visibilitychange', () => (doc.hidden ? pause() : play()));

  return {
    start(delayMs = 0) {
      win.setTimeout(() => {
        started = true;
        play();
      }, delayMs);
    },
    isPlaying: () => frame !== 0,
  };
}
