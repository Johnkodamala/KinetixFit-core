// The Rewards section's story: an example run of small wins scrolls past and the cup fills with the points they
// add up to, from the first check-in to a coffee at 1,000. The beat whose top has passed the middle of the screen is
// the current one; its running total (data-total) sets the counter, the cup, the lane and the milestones.
// Without JS, or with reduced motion, the section just shows the finished story (a full cup, every beat).
import { REWARDS } from './config';
import { formatGBP, formatPoints } from './format';
import { canAnimate, rafThrottle } from './motion';

/** How full the cup is for a running total: 0 empty … 1 = a coffee. */
export function cupLevel(total: number, goal: number = REWARDS.voucherPoints): number {
  if (!Number.isFinite(total) || goal <= 0) return 0;
  return Math.max(0, Math.min(1, total / goal));
}

/** The line under the counter. */
export function statusFor(total: number): string {
  if (total >= REWARDS.voucherPoints) return 'Coffee’s on us.';
  // short enough for two lines in the phone's compact bar (it keeps room for two, so nothing below it moves)
  if (total >= REWARDS.donationPoints) return `${formatGBP(REWARDS.donationValueGBP)} for charity, or keep going.`;
  if (total > 0) return 'Every small win adds up.';
  return 'Watch the points add up.';
}

/**
 * The current beat: the last one whose top edge is above the line at `lineY` (px from the top of the viewport).
 * -1 before the first. `tops` are the beats' top edges in viewport px, in page order.
 */
export function activeBeatIndex(tops: number[], lineY: number): number {
  let index = -1;
  for (let i = 0; i < tops.length; i += 1) {
    if (tops[i] <= lineY) index = i;
    else break;
  }
  return index;
}

/** Eases a number shown in `el` towards `to` over `ms` (ease-out cubic). Returns a cancel function. */
export function tweenNumber(el: HTMLElement, from: number, to: number, ms: number, win: Window = window): () => void {
  let frame = 0;
  const start = win.performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatPoints(from + (to - from) * eased);
    if (t < 1) frame = win.requestAnimationFrame(step);
  };
  frame = win.requestAnimationFrame(step);
  return () => win.cancelAnimationFrame(frame);
}

export interface RewardsStory {
  /** show the state for a running total (also used by tests) */
  show(total: number): void;
  total(): number;
}

export function initRewards(doc: Document = document): RewardsStory | null {
  const section = doc.querySelector<HTMLElement>('[data-rewards]');
  const win = doc.defaultView;
  if (!section || !win) return null;
  const journey = section.querySelector<HTMLElement>('.journey');
  const visual = section.querySelector<HTMLElement>('.journey__visual');
  const cup = section.querySelector<HTMLElement>('[data-cup]');
  const count = section.querySelector<HTMLElement>('[data-points-count]');
  const status = section.querySelector<HTMLElement>('[data-journey-status]');
  const beats = [...section.querySelectorAll<HTMLElement>('.beat')];
  const marks = [...section.querySelectorAll<HTMLElement>('.cup__mark')];
  if (!journey || !visual || !cup || !count || !status || beats.length === 0) return null;

  let current: number = REWARDS.voucherPoints;
  let cancelTween = () => {};

  const paint = (total: number, animate: boolean) => {
    const level = cupLevel(total);
    visual.style.setProperty('--level', String(level));
    cup.classList.toggle('is-full', level >= 1);
    // milestones compare points, not cup fractions (a rounded --at never quite equals the exact ratio)
    marks.forEach(mark => mark.classList.toggle('is-reached', total >= (Number(mark.dataset.points) || Infinity)));
    status.textContent = statusFor(total);
    cancelTween();
    if (animate) cancelTween = tweenNumber(count, current, total, 700, win);
    else count.textContent = formatPoints(total);
    current = total;
  };

  const story: RewardsStory = {
    show: total => paint(total, false),
    total: () => current,
  };

  if (!canAnimate(win)) {
    paint(REWARDS.voucherPoints, false);
    return story;
  }

  // Live: start empty and follow the scroll.
  journey.classList.add('is-live');
  let activeIndex = -2;
  paint(0, false);

  const update = () => {
    const line = win.innerHeight * 0.55;
    const index = activeBeatIndex(beats.map(beat => beat.getBoundingClientRect().top), line);
    if (index === activeIndex) return;
    activeIndex = index;
    beats.forEach((beat, i) => {
      beat.classList.toggle('is-active', i === index);
      beat.classList.toggle('is-past', i < index);
    });
    const total = index >= 0 ? Number(beats[index].dataset.total) || 0 : 0;
    paint(total, true);
  };
  const onScroll = rafThrottle(update, win);

  // Only listen while the section is on screen; also runs the cup's wave only then.
  let listening = false;
  const visibility = new win.IntersectionObserver(entries => {
    const on = entries.some(entry => entry.isIntersecting);
    section.classList.toggle('is-visible', on);
    if (on && !listening) {
      listening = true;
      win.addEventListener('scroll', onScroll, { passive: true });
      win.addEventListener('resize', onScroll);
      update();
    } else if (!on && listening) {
      listening = false;
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onScroll);
    }
  });
  visibility.observe(section);
  update();
  return story;
}

/** Fills [data-reward] spans from REWARDS, so the page can never quote a stale number. */
export function fillRewardNumbers(doc: Document = document): void {
  const values: Record<string, string> = {
    voucherPoints: formatPoints(REWARDS.voucherPoints),
    voucherValue: formatGBP(REWARDS.voucherValueGBP),
    donationPoints: formatPoints(REWARDS.donationPoints),
    donationValue: formatGBP(REWARDS.donationValueGBP),
    checkIn: String(REWARDS.checkIn),
    firstScan: String(REWARDS.firstScan),
    streakWeek: String(REWARDS.streakWeek),
    levelUp: String(REWARDS.levelUp),
    questMin: String(REWARDS.questMin),
    questMax: String(REWARDS.questMax),
  };
  doc.querySelectorAll<HTMLElement>('[data-reward]').forEach(el => {
    const value = values[el.dataset.reward ?? ''];
    if (value !== undefined) el.textContent = value;
  });
}
