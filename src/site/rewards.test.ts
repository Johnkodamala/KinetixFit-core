// @vitest-environment jsdom
// The Rewards section: its numbers must be the app's and the server's, the example run of small wins must be one
// the real rules allow, and the cup / counter / status must follow the running total.
import { describe, expect, it } from 'vitest';
import rewardConfig from '../../api/_lib/rewardConfig.js?raw';
import pageHtml from '../../site/index.html?raw';
import { COUNTRIES } from '../lib/countries';
import { MONTHLY_POINTS_GUIDE, POINTS, VOUCHER_POINTS } from '../lib/points';
import { allQuestValues } from '../lib/quests';
import { REWARDS } from './config';
import { formatGBP, formatPoints } from './format';
import { activeBeatIndex, cupLevel, statusFor } from './rewards';

const serverNumber = (name: string) => Number(rewardConfig.match(new RegExp(`${name}:\\s*([\\d.]+)`))?.[1]);

describe('the reward numbers the site quotes', () => {
  it('match the app (src/lib/points.ts)', () => {
    expect(REWARDS.voucherPoints).toBe(VOUCHER_POINTS);
    expect(REWARDS.checkIn).toBe(POINTS.checkIn);
    expect(REWARDS.firstScan).toBe(POINTS.firstScan);
    expect(REWARDS.streakWeek).toBe(POINTS.streakWeek);
    expect(REWARDS.levelUp).toBe(POINTS.levelUp);
    expect(REWARDS.perfectMonth).toBe(MONTHLY_POINTS_GUIDE);
  });

  it('match the server (api/_lib/rewardConfig.js defaults)', () => {
    expect(REWARDS.voucherPoints).toBe(serverNumber('voucherPointsCost'));
    expect(REWARDS.voucherValueGBP).toBe(serverNumber('voucherValueGBP'));
    expect(REWARDS.donationPoints).toBe(serverNumber('donationPointsCost'));
    expect(REWARDS.donationValueGBP).toBe(serverNumber('donationValueGBP'));
    expect(serverNumber('voucherMonthlyLimit')).toBe(1);
  });

  it('quote the everyday quests’ real range', () => {
    const points = allQuestValues().map(q => q.points);
    expect(REWARDS.questMin).toBe(Math.min(...points));
    expect(REWARDS.questMax).toBe(Math.max(...points));
  });

  it('say the UK donation is what the app gives', () => {
    const uk = COUNTRIES.find(c => c.code === 'GB')!;
    expect(uk.donationAmount).toBe(REWARDS.donationValueGBP);
    expect(uk.donationsLive && uk.vouchersLive).toBe(true);
    // rewards are UK-only: no other country is live yet, as the page says
    expect(COUNTRIES.filter(c => c.code !== 'GB').some(c => c.donationsLive || c.vouchersLive)).toBe(false);
  });
});

describe('the example run of small wins (the beats)', () => {
  const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
  const beats = [...doc.querySelectorAll<HTMLElement>('.beat')];
  const totals = beats.map(b => Number(b.dataset.total));

  it('only ever goes up, and ends exactly at the coffee', () => {
    expect(beats.length).toBeGreaterThanOrEqual(6);
    totals.forEach((t, i) => { if (i > 0) expect(t).toBeGreaterThan(totals[i - 1]); });
    expect(totals.at(-1)).toBe(REWARDS.voucherPoints);
  });

  it('ends on the coffee, at the price of a coffee', () => {
    const milestone = beats.find(b => Number(b.dataset.total) === REWARDS.voucherPoints);
    expect(milestone?.textContent).toMatch(new RegExp(formatGBP(REWARDS.voucherValueGBP)));
    expect(milestone?.matches('.beat--coffee')).toBe(true);
    expect(beats.at(-1)).toBe(milestone);
  });

  it('adds only real point values, one win at a time, on the days', () => {
    const real = new Set<number>([POINTS.checkIn, POINTS.firstScan, POINTS.streakWeek, POINTS.levelUp, ...allQuestValues().map(q => q.points)]);
    beats.filter(b => !b.matches('.beat--week, .beat--milestone')).forEach((beat, i) => {
      const shown = Number(beat.querySelector('.beat__pts')?.textContent?.replace('+', ''));
      const added = totals[i] - (i === 0 ? 0 : totals[i - 1]);
      expect(shown).toBe(added);
      expect(real.has(added)).toBe(true);
    });
  });

  it('never goes faster than a perfect month allows', () => {
    const perDay = REWARDS.perfectMonth / 30;
    beats.forEach((beat, i) => {
      const when = beat.querySelector('.beat__when')?.textContent ?? '';
      const [, unit, n] = when.match(/(Day|Week)\s+(\d+)/) ?? [];
      const days = unit === 'Week' ? Number(n) * 7 : Number(n);
      expect(days, when).toBeGreaterThan(0);
      // a little headroom for level-up bonuses landing early
      expect(totals[i], when).toBeLessThanOrEqual(Math.ceil(days * perDay * 1.1));
    });
  });

  it('shows running totals the way the page formats them', () => {
    beats.filter(b => b.matches('.beat--week, .beat--milestone')).forEach(beat => {
      expect(beat.querySelector('.beat__pts')?.textContent).toBe(formatPoints(Number(beat.dataset.total)));
    });
  });
});

describe('cupLevel', () => {
  it('runs from empty to a full cup at the voucher cost, and never past it', () => {
    expect(cupLevel(0)).toBe(0);
    expect(cupLevel(REWARDS.voucherPoints / 2)).toBe(0.5);
    expect(cupLevel(REWARDS.voucherPoints)).toBe(1);
    expect(cupLevel(99999)).toBe(1);
    expect(cupLevel(-10)).toBe(0);
    expect(cupLevel(Number.NaN)).toBe(0);
    expect(cupLevel(10, 0)).toBe(0);
  });
});

describe('statusFor', () => {
  it('stays short enough for two lines in the phone bar', () => {
    for (const total of [0, 25, REWARDS.donationPoints, REWARDS.voucherPoints]) expect(statusFor(total).length).toBeLessThanOrEqual(36);
  });
  it('says what the points are enough for', () => {
    expect(statusFor(0)).toBe('Watch the points add up.');
    expect(statusFor(25)).toBe('Every small win adds up.');
    // a coffee and a charity donation cost the same, so the coffee message is the one at their shared price
    expect(REWARDS.donationPoints).toBeGreaterThanOrEqual(REWARDS.voucherPoints);
    expect(statusFor(REWARDS.voucherPoints)).toBe('Coffee’s on us.');
  });
});

describe('activeBeatIndex', () => {
  const tops = [100, 400, 700, 1000];
  it('is the last beat whose top has passed the line', () => {
    expect(activeBeatIndex(tops, 50)).toBe(-1);
    expect(activeBeatIndex(tops, 100)).toBe(0);
    expect(activeBeatIndex(tops, 450)).toBe(1);
    expect(activeBeatIndex(tops, 5000)).toBe(3);
  });
  it('handles scrolling back up (tops move down)', () => {
    expect(activeBeatIndex(tops.map(t => t + 600), 450)).toBe(-1);
    expect(activeBeatIndex([], 450)).toBe(-1);
  });
});

describe('formatting', () => {
  it('writes points and pounds the UK way', () => {
    expect(formatPoints(1500)).toBe('1,500');
    expect(formatPoints(214.4)).toBe('214');
    expect(formatGBP(5)).toBe('£5');
    expect(formatGBP(2.5)).toBe('£2.50');
  });
});
