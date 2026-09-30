// api/_lib/pointsLedger.js: the ledger helpers, and the award numbers the server uses matching the app's (src/lib/points.ts).
import { describe, expect, it } from 'vitest';
import { CHECKIN_POINTS, CHECKIN_XP, STREAK_WEEK_POINTS, LEVEL_XP, LEVEL_UP_POINTS, streakEndingOn, grantOnce, ledgerBalance } from '../_lib/pointsLedger.js';
import { POINTS, XP, LEVEL_XP as APP_LEVEL_XP } from '../../src/lib/points.ts';

describe('the server and the app agree on what things are worth', () => {
  it('check-in, streak week, level-up and level size', () => {
    expect(CHECKIN_POINTS).toBe(POINTS.checkIn);
    expect(CHECKIN_XP).toBe(XP.checkIn);
    expect(STREAK_WEEK_POINTS).toBe(POINTS.streakWeek);
    expect(LEVEL_UP_POINTS).toBe(POINTS.levelUp);
    expect(LEVEL_XP).toBe(APP_LEVEL_XP);
  });
});

describe('streakEndingOn', () => {
  const days = (...list) => new Set(list);
  it('counts the run of consecutive days that ends on the day', () => {
    expect(streakEndingOn(days('2026-10-01'), '2026-10-01')).toBe(1);
    expect(streakEndingOn(days('2026-09-29', '2026-09-30', '2026-10-01'), '2026-10-01')).toBe(3);
  });
  it('stops at a gap', () => {
    expect(streakEndingOn(days('2026-09-28', '2026-09-30', '2026-10-01'), '2026-10-01')).toBe(2);
  });
  it('is 0 when the day itself has no check-in', () => {
    expect(streakEndingOn(days('2026-09-30'), '2026-10-01')).toBe(0);
  });
  it('runs across a month and a year end', () => {
    expect(streakEndingOn(days('2026-12-31', '2027-01-01'), '2027-01-01')).toBe(2);
    expect(streakEndingOn(days('2026-02-28', '2026-03-01'), '2026-03-01')).toBe(2);
  });
});

describe('grantOnce', () => {
  const adminThatAnswers = error => ({ from: () => ({ insert: async () => ({ error }) }) });
  it('says granted, duplicate (the ledger key was taken) or error', async () => {
    const award = { day: '2026-10-01', awardId: 'x', points: 5 };
    expect(await grantOnce(adminThatAnswers(null), 'u', award)).toBe('granted');
    expect(await grantOnce(adminThatAnswers({ code: '23505' }), 'u', award)).toBe('duplicate');
    expect(await grantOnce(adminThatAnswers({ code: '50000' }), 'u', award)).toBe('error');
  });
});

describe('ledgerBalance', () => {
  const adminWith = result => ({ from: () => ({ select: () => ({ eq: async () => result }) }) });
  it('sums points and XP', async () => {
    const balance = await ledgerBalance(adminWith({ data: [{ points: 5, xp: 10 }, { points: -3, xp: 0 }], error: null }), 'u');
    expect(balance).toEqual({ points: 2, xp: 10 });
  });
  it('is unknown (null) on an error, or when a full page means there may be more rows than were read', async () => {
    expect(await ledgerBalance(adminWith({ data: null, error: new Error('x') }), 'u')).toBeNull();
    expect(await ledgerBalance(adminWith({ data: Array.from({ length: 1000 }, () => ({ points: 1, xp: 0 })), error: null }), 'u')).toBeNull();
  });
});
