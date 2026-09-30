// The points economy. Points turn into real things: a charity donation at 1,000 points and, with Plus, a coffee
// voucher at 1,000 too (VOUCHER_POINTS; api/_lib/rewardConfig.js). So they come slowly. Someone who does everything, every day earns
// about 1,000 points in a month (the "perfect month" test in points.test.ts keeps it there). A typical month is
// about half that.
//
//   quests            5–8 each, 3 a day at most (src/lib/quests.ts)            ≈ 690 a month at most
//   daily check-in    5, once a day                                            150
//   first food scan   2, once a day (server: mealScanPointsAward)              60
//   streak            10 for every 7 days in a row of check-ins (streak.ts)    ≈ 40
//   level up          10 per level (LEVEL_XP each)                             ≈ 60
//
// The server caps what one quest claim can award (api/complete-quest.js: MAX_QUEST_POINTS / MAX_QUEST_XP), so an
// older app build asking for its old 220 points gets the cap. Keep these in step with it.
import { localDayKey, localDayKeyDaysAgo } from './dates';

export const POINTS = {
  checkIn: 5,
  /** display only — the server awards it (api/_lib/rewardConfig.js mealScanPointsAward) */
  firstScan: 2,
  /** every 7th day of a check-in streak */
  streakWeek: 10,
  levelUp: 10,
} as const;

export const XP = {
  checkIn: 10,
} as const;

/** XP per level: level n runs from (n-1) × LEVEL_XP to n × LEVEL_XP. */
export const LEVEL_XP = 500;

/** The most points a perfect month can earn (the donation threshold, on purpose). */
export const MONTHLY_POINTS_GUIDE = 1000;

/**
 * What a coffee voucher costs (Plus, one a month): 1,000 since 1 Oct 2026 (was 1,500 from 28 Sep, and 2,500 before that —
 * with about 1,000 points in a perfect month the 2,500 took 2.5–5 months). The same as a charity donation. The server
 * decides: keep api/_lib/rewardConfig.js voucherPointsCost the same (rewards.test.ts checks), and note a `config:rewards`
 * value in production Redis overrides that default.
 */
export const VOUCHER_POINTS = 1000;

/** The most one quest may be worth — a sanity check on src/lib/quests.ts (rewards.test.ts). The server pays from its own table, api/_lib/quests.js. */
export const MAX_QUEST_POINTS = 10;
export const MAX_QUEST_XP = 40;

/** XP within the current level (0 – LEVEL_XP). */
export const xpIntoLevel = (xp: number, level: number) => Math.min(LEVEL_XP, Math.max(0, xp - (level - 1) * LEVEL_XP));

/** The level an XP total has reached (level 2 starts at 500 XP). The server works it out the same way for the level-up bonus. */
export const levelForXp = (xp: number) => Math.floor(Math.max(0, xp) / LEVEL_XP) + 1;

/** One level at a time: the level after gaining XP up to `newXp` (older accounts can hold more XP than their level). */
export const levelAfter = (newXp: number, level: number) => (newXp >= level * LEVEL_XP ? level + 1 : level);

// Awards that can only happen once a day (the check-in, a streak bonus): day → the award ids given that day.
// Kept 40 days, so a check-in filed late (from a widget) can't be rewarded twice either.
const LEDGER_KEY = 'kx_points_given';
const LEDGER_DAYS = 40;

function loadLedger(): Record<string, string[]> {
  try {
    const saved = JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

/** Whether `id` was already given on `day`. */
export function wasGiven(day: string, id: string): boolean {
  return (loadLedger()[day] ?? []).includes(id);
}

/**
 * Records award `id` for `day` and returns true — or false when it was already given (then award nothing).
 * Days older than the ledger keeps can't be given at all.
 */
export function giveOnce(day: string, id: string, today = localDayKey()): boolean {
  const oldest = localDayKeyDaysAgo(LEDGER_DAYS - 1, new Date(`${today}T12:00:00`));
  if (day < oldest || day > today) return false;
  const ledger = loadLedger();
  if ((ledger[day] ?? []).includes(id)) return false;
  const next: Record<string, string[]> = { [day]: [...(ledger[day] ?? []), id] };
  for (const [d, ids] of Object.entries(ledger)) if (d >= oldest && d !== day) next[d] = ids;
  localStorage.setItem(LEDGER_KEY, JSON.stringify(next));
  return true;
}

export interface CheckInAward {
  points: number;
  xp: number;
  /** the streak bonus included in `points` (0 when none) */
  streakBonus: number;
}

/**
 * What a check-in on `day` earns, recorded so it's only given once: 5 points + 10 XP the first time that day, and
 * the streak bonus when it completes a week (`streak` = the streak including that day: 7, 14, 21…). Changing an
 * answer later the same day earns nothing more.
 */
export function awardCheckIn(day: string, streak: number, today = localDayKey()): CheckInAward {
  if (!giveOnce(day, 'checkin', today)) return { points: 0, xp: 0, streakBonus: 0 };
  const bonus = streak > 0 && streak % 7 === 0 && giveOnce(day, `streak-${streak}`, today) ? POINTS.streakWeek : 0;
  return { points: POINTS.checkIn + bonus, xp: XP.checkIn, streakBonus: bonus };
}
