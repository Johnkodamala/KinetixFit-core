// The morning check-in: how long the person slept and how much energy they have, one tap each. It gives
// people without a watch a sleep record, and after a week it can show how sleep and energy go together.
// It's the daily habit the streak is built on (src/lib/streak.ts) and earns a few points once a day
// (src/lib/points.ts: 5 points, a small amount on purpose because it's self-reported). It never counts for quests.
// Kept for 400 days so a long streak can still be worked out from it.
import { localDayKey, localDayKeyDaysAgo } from './dates';

export interface CheckIn {
  /** hours slept, as answered (null when the watch already recorded sleep and the question was skipped) */
  sleepHours: number | null;
  /** 1 (drained) … 5 (full of energy) */
  energy: number;
  at: number;
}

const KEY = 'kinetix_checkins';
const KEEP_DAYS = 400;
const INSIGHT_DAYS = 60;

export const SLEEP_CHOICES = [4, 5, 6, 7, 8, 9];
export const ENERGY_LABELS = ['Drained', 'Low', 'Okay', 'Good', 'Full of energy'];

export function loadCheckIns(): Record<string, CheckIn> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

export function saveCheckIn(all: Record<string, CheckIn>, entry: CheckIn): Record<string, CheckIn> {
  const oldest = localDayKeyDaysAgo(KEEP_DAYS);
  const next: Record<string, CheckIn> = { [localDayKey(new Date(entry.at))]: entry };
  for (const [day, c] of Object.entries(all)) if (day >= oldest && !next[day]) next[day] = c;
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** "9+" for the last choice */
export const sleepChoiceLabel = (h: number) => (h === SLEEP_CHOICES[SLEEP_CHOICES.length - 1] ? `${h}+ h` : h === SLEEP_CHOICES[0] ? `${h} or less` : `${h} h`);

/**
 * Energy after 7 h+ of sleep vs. less, once there are at least three days on each side — otherwise null.
 * Sleep is the person's answer, or the watch's figure for that day when they weren't asked.
 */
export function sleepEnergyInsight(all: Record<string, CheckIn>, watchSleepHours: Record<string, number>): { rested: number; short: number } | null {
  const rested: number[] = [];
  const short: number[] = [];
  const since = localDayKeyDaysAgo(INSIGHT_DAYS); // recent weeks only, now that a year is kept for the streak
  for (const [day, c] of Object.entries(all)) {
    if (day < since) continue;
    const hours = c.sleepHours ?? watchSleepHours[day];
    if (hours === undefined || hours === null) continue;
    (hours >= 7 ? rested : short).push(c.energy);
  }
  if (rested.length < 3 || short.length < 3) return null;
  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return { rested: avg(rested), short: avg(short) };
}
