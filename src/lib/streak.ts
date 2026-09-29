// The streak: days in a row with the daily check-in (src/lib/checkins.ts). Until today's check-in is done, the
// streak through yesterday is still alive (it only breaks once a whole day passes without one), so the app and the
// Streak widget show it with "Check in today". Worked out from the saved check-ins every time, so it can't drift or
// count a day twice; the best streak is also saved, because it can outlive the check-ins that are kept.
import { localDayKey, localDayKeyDaysAgo } from './dates';

export interface Streak {
  /** days in a row ending today (if checked in) or yesterday; 0 when broken */
  current: number;
  /** checked in today */
  today: boolean;
  best: number;
  /** the last 7 days, oldest first, today last */
  week: { day: string; letter: string; done: boolean }[];
  /** the next streak badge and the days still to go (null once every badge is earned) */
  next: { days: number; toGo: number } | null;
}

/** Streak badges on Rewards → Achievements (earned by the best streak, so they stay earned). */
export const STREAK_BADGES = [3, 7, 14, 30, 60, 100];

const BEST_KEY = 'kx_streak_best';

export function loadBestStreak(): number {
  const n = Number(localStorage.getItem(BEST_KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Saves `n` if it beats the best so far; returns the best. */
export function saveBestStreak(n: number): number {
  const best = Math.max(loadBestStreak(), n);
  if (best > 0) localStorage.setItem(BEST_KEY, String(best));
  return best;
}

/** Days in a row with a check-in, ending on `day` (0 when `day` has none). */
export function runEndingOn(days: ReadonlySet<string>, day: string): number {
  let n = 0;
  const d = new Date(`${day}T12:00:00`);
  while (days.has(localDayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** The streak on `now`, from the days that have a check-in. */
export function streakOf(checkInDays: Iterable<string>, now = new Date(), savedBest = 0): Streak {
  const days = new Set(checkInDays);
  const today = localDayKey(now);
  const yesterday = localDayKeyDaysAgo(1, now);
  const doneToday = days.has(today);
  const current = runEndingOn(days, doneToday ? today : yesterday);
  const best = Math.max(savedBest, current);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = localDayKeyDaysAgo(6 - i, now);
    return { day, letter: new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }), done: days.has(day) };
  });
  const target = STREAK_BADGES.find(b => b > best);
  return { current, today: doneToday, best, week, next: target ? { days: target, toGo: target - current } : null };
}

/** "12-day streak", "1-day streak" */
export const streakLabel = (n: number) => `${n}-day streak`;

/** What the streak card and widget say under the number. */
export function streakMessage(s: Streak): string {
  if (s.current === 0) return s.best > 0 ? `Check in today to start again. Best: ${s.best} days.` : 'Check in today to start a streak.';
  if (!s.today) return 'Check in today to keep it going.';
  const weeks = s.current / 7;
  if (Number.isInteger(weeks)) return weeks === 1 ? 'A full week in a row.' : `${weeks} full weeks in a row.`;
  const toWeek = 7 - (s.current % 7);
  return `${toWeek} more ${toWeek === 1 ? 'day' : 'days'} for the weekly streak bonus.`;
}
