// Points, the check-in streak and what they add up to in a month.
import { describe, expect, it } from 'vitest';
import { localDayKey, localDayKeyDaysAgo } from './dates';
// the server's reward defaults, as text (importing it would need Redis)
import rewardConfig from '../../api/_lib/rewardConfig.js?raw';
import { POINTS, XP, LEVEL_XP, MAX_QUEST_POINTS, MAX_QUEST_XP, MONTHLY_POINTS_GUIDE, VOUCHER_POINTS, awardCheckIn, giveOnce, wasGiven, levelAfter, xpIntoLevel } from './points';
import { streakOf, runEndingOn, loadBestStreak, saveBestStreak, streakMessage, STREAK_BADGES } from './streak';
import { bestQuestDay, allQuestValues } from './quests';
import { saveCheckIn, loadCheckIns } from './checkins';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);
const days = (...keys: string[]) => new Set(keys);

describe('points economy', () => {
  it('a perfect month is about 1,000 points — never more than 1,050 for any goal', () => {
    for (const target of ['Weight Loss', 'Weight Gain', 'Cardio Endurance', 'Autonomic Recovery'] as const) {
      const quest = bestQuestDay(target);
      const month = 30;
      const xp = month * (quest.xp + XP.checkIn);
      const levels = Math.floor(xp / LEVEL_XP);
      const total = month * (quest.points + POINTS.checkIn + POINTS.firstScan)
        + Math.floor(month / 7) * POINTS.streakWeek + levels * POINTS.levelUp;
      expect(total, target).toBeLessThanOrEqual(MONTHLY_POINTS_GUIDE + 50);
      expect(total, target).toBeGreaterThanOrEqual(800);
    }
  });

  it('a donation (1,000 points) can’t be reached within a week or two', () => {
    const best = Math.max(...(['Weight Loss', 'Weight Gain', 'Cardio Endurance', 'Autonomic Recovery'] as const).map(t => bestQuestDay(t).points));
    const perDay = best + POINTS.checkIn + POINTS.firstScan;
    expect(14 * perDay).toBeLessThan(600);
  });

  it('the coffee voucher costs the same in the app and on the server — about a month of everything', () => {
    const server = rewardConfig.match(/voucherPointsCost:\s*(\d+)/);
    expect(Number(server?.[1])).toBe(VOUCHER_POINTS);
    expect(VOUCHER_POINTS).toBe(1000);
    expect(VOUCHER_POINTS / MONTHLY_POINTS_GUIDE).toBeGreaterThanOrEqual(0.9);
    expect(VOUCHER_POINTS / MONTHLY_POINTS_GUIDE).toBeLessThanOrEqual(1.2);
  });

  it('every quest fits under the server’s cap on one claim', () => {
    for (const q of allQuestValues()) {
      expect(q.points, q.id).toBeLessThanOrEqual(MAX_QUEST_POINTS);
      expect(q.xp, q.id).toBeLessThanOrEqual(MAX_QUEST_XP);
      expect(q.points, q.id).toBeGreaterThan(0);
    }
  });

  it('levels go up one at a time, even for an account holding more XP than its level', () => {
    expect(levelAfter(499, 1)).toBe(1);
    expect(levelAfter(500, 1)).toBe(2);
    expect(levelAfter(5000, 2)).toBe(3);
    expect(xpIntoLevel(620, 2)).toBe(120);
    expect(xpIntoLevel(5000, 2)).toBe(LEVEL_XP);
  });
});

describe('once-a-day awards', () => {
  it('gives a check-in’s points once a day; changing the answer gives nothing', () => {
    const today = localDayKey();
    expect(awardCheckIn(today, 1)).toEqual({ points: POINTS.checkIn, xp: XP.checkIn, streakBonus: 0 });
    expect(awardCheckIn(today, 1)).toEqual({ points: 0, xp: 0, streakBonus: 0 });
    expect(wasGiven(today, 'checkin')).toBe(true);
  });

  it('adds the streak bonus on every seventh day', () => {
    const today = localDayKey();
    const a = awardCheckIn(today, 7);
    expect(a.streakBonus).toBe(POINTS.streakWeek);
    expect(a.points).toBe(POINTS.checkIn + POINTS.streakWeek);
    expect(awardCheckIn(localDayKeyDaysAgo(1), 6).streakBonus).toBe(0);
    expect(awardCheckIn(localDayKeyDaysAgo(2), 14).streakBonus).toBe(POINTS.streakWeek);
  });

  it('refuses days in the future or older than the ledger keeps', () => {
    const today = '2026-09-28';
    expect(giveOnce('2026-09-29', 'checkin', today)).toBe(false);
    expect(giveOnce('2026-08-01', 'checkin', today)).toBe(false);
    expect(giveOnce('2026-09-01', 'checkin', today)).toBe(true);
  });

  it('forgets days older than 40 and survives bad data', () => {
    localStorage.setItem('kx_points_given', '{"2020-01-01":["checkin"]}');
    giveOnce(localDayKey(), 'checkin');
    expect(JSON.parse(localStorage.getItem('kx_points_given')!)).not.toHaveProperty('2020-01-01');
    localStorage.setItem('kx_points_given', 'nope');
    expect(giveOnce(localDayKey(), 'checkin')).toBe(true);
  });
});

describe('check-in streak', () => {
  const now = at(2026, 9, 28, 20);

  it('counts days in a row ending today', () => {
    const s = streakOf(['2026-09-26', '2026-09-27', '2026-09-28'], now);
    expect(s.current).toBe(3);
    expect(s.today).toBe(true);
  });

  it('keeps yesterday’s streak alive until today is over', () => {
    const s = streakOf(['2026-09-25', '2026-09-26', '2026-09-27'], now);
    expect(s.current).toBe(3);
    expect(s.today).toBe(false);
    expect(streakMessage(s)).toBe('Check in today to keep it going.');
  });

  it('breaks after a whole day without a check-in', () => {
    const s = streakOf(['2026-09-24', '2026-09-25', '2026-09-26'], now);
    expect(s.current).toBe(0);
    // the best is read off the history too (a phone that never saw that streak happen still knows it), as well as what was saved
    expect(s.best).toBe(3);
    expect(streakOf(['2026-09-24', '2026-09-25', '2026-09-26'], now, 3).best).toBe(3);
    expect(streakOf(['2026-09-24', '2026-09-25', '2026-09-26'], now, 5).best).toBe(5);
  });

  it('crosses months and the clock change', () => {
    expect(runEndingOn(days('2026-02-27', '2026-02-28', '2026-03-01'), '2026-03-01')).toBe(3);
    expect(runEndingOn(days('2026-10-24', '2026-10-25', '2026-10-26'), '2026-10-26')).toBe(3); // UK clocks go back 25 Oct
    expect(runEndingOn(days(), '2026-10-26')).toBe(0);
  });

  it('shows the last seven days, today last, and the next badge', () => {
    const s = streakOf(['2026-09-22', '2026-09-27', '2026-09-28'], now);
    expect(s.week.map(d => d.done)).toEqual([true, false, false, false, false, true, true]);
    expect(s.week[6].day).toBe('2026-09-28');
    expect(s.week[6].letter).toBe('M');
    expect(s.next).toEqual({ days: 3, toGo: 1 });
    const long = streakOf(Array.from({ length: 10 }, (_, i) => localDayKeyDaysAgo(i, now)), now);
    expect(long.current).toBe(10);
    expect(long.next).toEqual({ days: 14, toGo: 4 });
  });

  it('points at the weekly bonus, and says when the streak has to start again', () => {
    const five = streakOf(Array.from({ length: 5 }, (_, i) => localDayKeyDaysAgo(i, now)), now);
    expect(streakMessage(five)).toBe('2 more days for the weekly streak bonus.');
    const week = streakOf(Array.from({ length: 7 }, (_, i) => localDayKeyDaysAgo(i, now)), now);
    expect(streakMessage(week)).toBe('A full week in a row.');
    const fortnight = streakOf(Array.from({ length: 14 }, (_, i) => localDayKeyDaysAgo(i, now)), now);
    expect(streakMessage(fortnight)).toBe('2 full weeks in a row.');
    expect(streakMessage(streakOf([], now))).toBe('Check in today to start a streak.');
    expect(streakMessage(streakOf([], now, 12))).toBe('Check in today to start again. Best: 12 days.');
  });

  it('remembers the best streak', () => {
    expect(loadBestStreak()).toBe(0);
    expect(saveBestStreak(5)).toBe(5);
    expect(saveBestStreak(3)).toBe(5);
    expect(loadBestStreak()).toBe(5);
  });

  it('badges run from 3 to 100 days', () => {
    expect(STREAK_BADGES[0]).toBe(3);
    expect(STREAK_BADGES.at(-1)).toBe(100);
  });

  it('check-ins are kept long enough for a long streak', () => {
    let all = {};
    const d = new Date();
    for (let i = 0; i < 120; i++) all = saveCheckIn(all, { sleepHours: 7, energy: 3, at: new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime() });
    expect(Object.keys(loadCheckIns()).length).toBeGreaterThanOrEqual(119);
    expect(streakOf(Object.keys(loadCheckIns())).current).toBeGreaterThanOrEqual(119);
  });
});
