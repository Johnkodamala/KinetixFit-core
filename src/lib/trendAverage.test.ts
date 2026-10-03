import { describe, expect, it } from 'vitest';
import { trendAverage } from './trendAverage';

const day = (n: number, value: number | null) => ({ date: `2026-10-0${n}`, value });
const TODAY = '2026-10-07';
// six full days and today so far (steps, say 40 minutes into the day)
const week = [day(1, 18000), day(2, 21000), day(3, 15000), day(4, 16000), day(5, 18500), day(6, 14000), { date: TODAY, value: 17 }];

describe('trendAverage', () => {
  it('averages the days that have a reading and says how many that was', () => {
    expect(trendAverage([day(1, 10), day(2, 20), day(3, 30)], TODAY, false)).toEqual({ value: 20, days: 3 });
  });

  it('leaves out days with nothing (no reading, or a zero, which means nothing synced)', () => {
    expect(trendAverage([day(1, 10), day(2, null), day(3, 0), day(4, 30)], TODAY, false)).toEqual({ value: 20, days: 2 });
  });

  it('counts today when asked to (what every card did before: today so far pulled a step average down)', () => {
    const avg = trendAverage(week, TODAY, false)!;
    expect(avg.days).toBe(7);
    expect(Math.round(avg.value)).toBe(14645);
  });

  it('leaves today out when it is a day in progress, so the average is of full days', () => {
    const avg = trendAverage(week, TODAY, true)!;
    expect(avg.days).toBe(6);
    expect(Math.round(avg.value)).toBe(17083);
  });

  it('only ever leaves out today: yesterday is a full day', () => {
    const points = [{ date: '2026-10-05', value: 100 }, { date: '2026-10-06', value: 200 }, { date: TODAY, value: 5 }];
    expect(trendAverage(points, TODAY, true)).toEqual({ value: 150, days: 2 });
  });

  it('is the same either way when today has no reading yet (sleep before the morning, a watch that has not synced)', () => {
    const points = [day(1, 100), day(2, 200), { date: TODAY, value: null }];
    expect(trendAverage(points, TODAY, true)).toEqual({ value: 150, days: 2 });
    expect(trendAverage(points, TODAY, false)).toEqual({ value: 150, days: 2 });
  });

  it('needs two full days: a new person has no average until then', () => {
    expect(trendAverage([day(6, 14000), { date: TODAY, value: 17 }], TODAY, true)).toBeNull();
    expect(trendAverage([day(6, 14000)], TODAY, false)).toBeNull();
    expect(trendAverage([], TODAY, true)).toBeNull();
  });
});
