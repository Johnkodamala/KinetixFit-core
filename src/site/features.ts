// The five feature chapters (site/index.html → Features) each have a stage where the app's own card plays like a
// screen recording, the way the hero's phone does (demo.ts), and so does the home screen in Widgets (#widgets), with
// the home-screen widgets on it. A stage's story is a timeline of steps: the step is written
// onto the stage as data-step (site.css → "Features" draws each one), the words that change are swapped
// ([data-when] shows while the step is in its list), the options that are chosen follow it ([data-on]), numbers count up
// as their step arrives ([data-count-to]), a touch dot lands on whatever is tapped ([data-touch-target]), and a card
// longer than its stage scrolls, as a thumb would, to what the step is about ([data-scroll-when], measured, so it works
// at any size). A stage plays only while it's on screen and the tab is visible, and loops, fading out before it starts
// over. The page is written in each stage's still step, so with reduced motion, without IntersectionObserver or without
// JS it simply shows that.
import { formatPoints } from './format';
import { canAnimate, rafThrottle } from './motion';
import { tweenNumber } from './rewards';

export type FeatureId = 'body' | 'meals' | 'scan' | 'cycle' | 'watch' | 'widgets';

export interface FeatureBeat {
  /** ms from the start of the loop */
  at: number;
  step?: string;
  /** a finger lands on [data-touch-target="…"]: the touch dot plays there and it presses in */
  touch?: string;
  /** the stage fades out, ready to start over */
  fade?: boolean;
}

export interface FeatureTimeline {
  /** the first beat (at 0) sets the step each loop starts from */
  beats: FeatureBeat[];
  loopMs: number;
  /** what the stage shows when nothing plays; the page is written in it */
  still: string;
}

export const TIMELINES: Record<FeatureId, FeatureTimeline> = {
  // Maya's plan counts up, Nourish's meters fill, then "Show more" opens the other six (iron and calcium included)
  body: {
    still: 'fill',
    loopMs: 15000,
    beats: [
      { at: 0, step: 'start' },
      { at: 350, step: 'plan' },
      { at: 1700, step: 'fill' },
      { at: 5000, touch: 'more' },
      { at: 5150, step: 'more' },
      { at: 14200, fade: true },
    ],
  },
  // her dinner ideas rise in; "Show 3 more"; the AI ideas tab (Plus); back to the ranked list
  meals: {
    still: 'in',
    loopMs: 18000,
    beats: [
      { at: 0, step: 'start' },
      { at: 450, step: 'in' },
      { at: 4600, step: 'foot' },
      { at: 5700, touch: 'next' },
      { at: 5850, step: 'page2' },
      { at: 10200, touch: 'ai' },
      { at: 10350, step: 'ai' },
      { at: 14200, touch: 'ranked' },
      { at: 14350, step: 'back' },
      { at: 17300, fade: true },
    ],
  },
  // a barcode (the app's scan animation, then sesame caught), a photo of three foods, then "2 roti and dal" typed
  scan: {
    still: 'bc-result',
    loopMs: 27500,
    beats: [
      { at: 0, step: 'rest' },
      { at: 900, touch: 'barcode' },
      { at: 1050, step: 'bc-scan' },
      { at: 2550, step: 'bc-read' },
      { at: 4050, step: 'bc-done' },
      { at: 5000, step: 'bc-result' },
      { at: 9600, step: 'rest' },
      { at: 10300, touch: 'photo' },
      { at: 10450, step: 'ph-scan' },
      { at: 11950, step: 'ph-read' },
      { at: 13450, step: 'ph-done' },
      { at: 14400, step: 'ph-result' },
      { at: 19000, step: 'rest' },
      { at: 19500, step: 'type' },
      { at: 21000, touch: 'check' },
      { at: 21150, step: 'ty-result' },
      { at: 26500, fade: true },
    ],
  },
  // her cycle card through the month: period, follicular, fertile window, ovulation, luteal, due soon
  cycle: {
    still: 'd9',
    loopMs: 16800,
    beats: [
      { at: 0, step: 'd2' },
      { at: 2800, step: 'd9' },
      { at: 5600, step: 'd12' },
      { at: 8400, step: 'd15' },
      { at: 11200, step: 'd21' },
      { at: 14000, step: 'd27' },
      { at: 16300, fade: true },
    ],
  },
  // steps from the phone; Add a workout → Yoga → 45 min → the note about points → added to Today
  watch: {
    still: 'added',
    loopMs: 15000,
    beats: [
      { at: 0, step: 'rest' },
      { at: 1300, touch: 'add' },
      { at: 1450, step: 'sheet' },
      { at: 3000, touch: 'yoga' },
      { at: 3150, step: 'yoga' },
      { at: 4400, touch: 'min45' },
      { at: 4550, step: 'min45' },
      { at: 5700, step: 'down' },
      { at: 7300, touch: 'save' },
      { at: 7450, step: 'added' },
      { at: 14200, fade: true },
    ],
  },
  // Widgets: Maya's home screen at 15:30. Her rings close; + on the Water glass (1.25 → 1.5 L); 500 ml on Quick log
  // (2 L, her goal: the water ring closes)
  widgets: {
    still: 'goal',
    loopMs: 16000,
    beats: [
      { at: 0, step: 'start' },
      { at: 500, step: 'rings' },
      { at: 3600, touch: 'glass' },
      { at: 3750, step: 'glass' },
      { at: 7900, touch: 'bottle' },
      { at: 8050, step: 'goal' },
      { at: 15200, fade: true },
    ],
  },
};

/** Room kept under something scrolled up into view (the stage's foot fades out), and over something scrolled to the top */
const ROOM_BELOW = 112;
const ROOM_ABOVE = 88;
/** How long a tapped button stays pressed in */
const PRESS_MS = 220;
/** How long a number takes to count up */
const COUNT_MS = 900;
/** A longer gap between frames (a hidden tab, a busy moment) counts as this much, so nothing is skipped. */
const MAX_FRAME_MS = 100;

/** Every step a timeline uses, in order of first use. */
export const stepsOf = (timeline: FeatureTimeline): string[] =>
  [...new Set(timeline.beats.flatMap(beat => (beat.step ? [beat.step] : [])))];

/** The step `ms` into the loop. */
export function stepAt(timeline: FeatureTimeline, ms: number): string {
  let step = timeline.beats[0].step!;
  for (const beat of timeline.beats) {
    if (beat.at > ms) break;
    if (beat.step) step = beat.step;
  }
  return step;
}

const listed = (list: string | undefined, step: string) => (list ?? '').split(' ').includes(step);

/**
 * Writes a step onto a stage: data-step for the CSS, .is-now on the words for it ([data-when]), .is-on on the options
 * chosen in it ([data-on]), and the numbers ([data-count-to]): 0 in the steps listed in data-count-zero, counting up
 * when the stage moves on from one of those.
 */
export function paintStep(stage: HTMLElement, step: string, previous: string | null, win: Window): void {
  stage.dataset.step = step;
  stage.querySelectorAll<HTMLElement>('[data-when]').forEach(el => el.classList.toggle('is-now', listed(el.dataset.when, step)));
  stage.querySelectorAll<HTMLElement>('[data-on]').forEach(el => el.classList.toggle('is-on', listed(el.dataset.on, step)));
  stage.querySelectorAll<HTMLElement>('[data-count-to]').forEach(el => {
    const to = Number(el.dataset.countTo);
    const zero = listed(el.dataset.countZero, step);
    if (!zero && previous !== null && listed(el.dataset.countZero, previous)) tweenNumber(el, 0, to, COUNT_MS, win);
    else el.textContent = formatPoints(zero ? 0 : to);
  });
  // a frame later, once the step's layout has settled (with reduced motion even a card opening is a 1 ms transition)
  win.requestAnimationFrame(() => scrollFor(stage, step));
}

/** How far down `el` is laid out in `scroller` (offsetTop, so a card that's still rising in doesn't throw it off). */
function offsetIn(el: HTMLElement, scroller: HTMLElement): number {
  let y = 0;
  for (let node: HTMLElement | null = el; node && node !== scroller; node = node.offsetParent as HTMLElement | null) y += node.offsetTop;
  return y;
}

/**
 * Scrolls each card of the stage ([data-viewport] → its [data-scroller]) to what the step shows: the element whose
 * data-scroll-when lists the step comes up into view, or to the top with data-scroll-align="top"; with none, back to
 * the top.
 */
export function scrollFor(stage: HTMLElement, step: string): void {
  stage.querySelectorAll<HTMLElement>('[data-viewport]').forEach(viewport => {
    const scroller = viewport.querySelector<HTMLElement>('[data-scroller]');
    if (!scroller) return;
    const anchor = [...viewport.querySelectorAll<HTMLElement>('[data-scroll-when]')].find(el => listed(el.dataset.scrollWhen, step));
    let y = 0;
    if (anchor) {
      const top = offsetIn(anchor, scroller);
      y = anchor.dataset.scrollAlign === 'top'
        ? top - ROOM_ABOVE
        : top + anchor.offsetHeight - (viewport.clientHeight - ROOM_BELOW);
    }
    scroller.style.transform = y > 0 ? `translateY(${-Math.round(y)}px)` : '';
  });
}

/** A finger lands on [data-touch-target="target"]: the touch dot plays over it and it presses in, briefly. */
export function touchAt(stage: HTMLElement, target: string, win: Window): void {
  const dot = stage.querySelector<HTMLElement>('[data-feat-touch]');
  const el = stage.querySelector<HTMLElement>(`[data-touch-target="${target}"]`);
  if (dot && el) {
    const box = (dot.offsetParent as HTMLElement | null ?? stage).getBoundingClientRect();
    const r = el.getBoundingClientRect();
    dot.style.left = `${r.left + r.width / 2 - box.left}px`;
    dot.style.top = `${r.top + r.height / 2 - box.top}px`;
    dot.classList.remove('is-on');
    void dot.offsetWidth; // restart its animation
    dot.classList.add('is-on');
  }
  stage.dataset.press = target;
  win.setTimeout(() => {
    if (stage.dataset.press === target) delete stage.dataset.press;
  }, PRESS_MS);
}

export interface FeaturePlayer {
  id: FeatureId;
  stage: HTMLElement;
  isPlaying(): boolean;
}

function player(stage: HTMLElement, id: FeatureId, timeline: FeatureTimeline, doc: Document, win: NonNullable<Document['defaultView']>): FeaturePlayer {
  const first = timeline.beats[0].step!;
  let step = first;
  let elapsed = 0;
  let next = 0;
  let last = 0;
  let frame = 0;
  let onScreen = false;

  const set = (to: string) => {
    const previous = step;
    step = to;
    paintStep(stage, to, previous, win);
  };

  // Back to the first step while the stage is faded out: every change lands at once, then it fades back in.
  const restart = () => {
    elapsed = 0;
    next = 0;
    stage.dataset.instant = '';
    set(first);
    void stage.offsetWidth;
    delete stage.dataset.instant;
    delete stage.dataset.fade;
  };

  const tick = (now: number) => {
    elapsed += last ? Math.min(now - last, MAX_FRAME_MS) : 0;
    last = now;
    while (next < timeline.beats.length && timeline.beats[next].at <= elapsed) {
      const beat = timeline.beats[next];
      next += 1;
      if (beat.touch) touchAt(stage, beat.touch, win);
      if (beat.step && beat.step !== step) set(beat.step);
      if (beat.fade) stage.dataset.fade = 'on';
    }
    if (elapsed >= timeline.loopMs) restart();
    frame = win.requestAnimationFrame(tick);
  };

  const play = () => {
    if (frame || !onScreen || doc.hidden) return;
    last = 0;
    stage.classList.remove('is-paused');
    frame = win.requestAnimationFrame(tick);
  };
  const pause = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    stage.classList.add('is-paused');
  };

  // As it nears the screen (not at load: every stage's first paint forces a layout of the whole page), the stage goes to
  // its first step at once, out of sight; until then it shows the still step it's written in.
  let ready = false;
  const getReady = () => {
    if (ready) return;
    ready = true;
    stage.dataset.instant = '';
    paintStep(stage, first, null, win);
    void stage.offsetWidth;
    delete stage.dataset.instant;
  };
  stage.classList.add('is-paused');

  const near = new win.IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    getReady();
    near.disconnect();
  }, { rootMargin: '0px 0px 90% 0px' });
  near.observe(stage);
  new win.IntersectionObserver(entries => {
    onScreen = entries.some(entry => entry.isIntersecting);
    if (onScreen) {
      getReady();
      play();
    } else pause();
  }, { threshold: 0.3 }).observe(stage);
  doc.addEventListener('visibilitychange', () => (doc.hidden ? pause() : play()));

  return { id, stage, isPlaying: () => frame !== 0 };
}

/** Starts every feature stage on the page (none on the 404 page). */
export function initFeatures(doc: Document = document): FeaturePlayer[] {
  const win = doc.defaultView;
  if (!win) return [];
  const stages = [...doc.querySelectorAll<HTMLElement>('[data-feature]')]
    .filter(stage => (stage.dataset.feature as FeatureId) in TIMELINES);
  // a new size moves what's in view: scroll each card again for the step it's on
  win.addEventListener('resize', rafThrottle(() => stages.forEach(stage => scrollFor(stage, stage.dataset.step ?? '')), win));
  if (!canAnimate(win)) {
    stages.forEach(stage => paintStep(stage, TIMELINES[stage.dataset.feature as FeatureId].still, null, win));
    return [];
  }
  return stages.map(stage => {
    const id = stage.dataset.feature as FeatureId;
    return player(stage, id, TIMELINES[id], doc, win);
  });
}
