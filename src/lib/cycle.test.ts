// Period tracking (src/lib/cycle.ts): predictions from the person's own history.
import { describe, expect, it } from 'vitest';
import { addPeriod, removePeriod, loadPeriods, loadPeriodTombstones, savePeriods, cycleStats, cycleToday, cycleContext, shiftDay, dayDiff, PHASE_TEXT } from './cycle';
import { isDirty } from './sync';

describe('period log', () => {
  it('moves the old "last period started" date over once, and keeps starts in order', () => {
    expect(loadPeriods('2026-09-10')).toEqual(['2026-09-10']);
    expect(loadPeriods('2026-01-01')).toEqual(['2026-09-10']); // already moved
    const list = addPeriod(['2026-09-10'], '2026-08-12', '2026-09-28');
    expect(list).toEqual(['2026-08-12', '2026-09-10']);
    expect(removePeriod(list, '2026-08-12')).toEqual(['2026-09-10']);
  });

  it('a start within 10 days of another is the same period, and future days are ignored', () => {
    expect(addPeriod(['2026-09-10'], '2026-09-12', '2026-09-28')).toEqual(['2026-09-12']);
    expect(addPeriod(['2026-09-10'], '2026-10-02', '2026-09-28')).toEqual(['2026-09-10']);
  });

  it('removing a period tombstones it (for sync) and marks it dirty, instead of just disappearing', () => {
    savePeriods(['2026-09-10']);
    expect(loadPeriodTombstones()).toEqual({});
    savePeriods([]); // removed
    expect(Object.keys(loadPeriodTombstones())).toEqual(['2026-09-10']);
    expect(isDirty('periods')).toBe(true);
  });

  it('re-adding a previously removed day clears its tombstone', () => {
    savePeriods(['2026-09-10']);
    savePeriods([]);
    expect(loadPeriodTombstones()).not.toEqual({});
    savePeriods(['2026-09-10']);
    expect(loadPeriodTombstones()).toEqual({});
  });

  it('survives bad saved data', () => {
    localStorage.setItem('kx_periods', '["2026-09-01","nope",3]');
    expect(loadPeriods()).toEqual(['2026-09-01']);
    localStorage.setItem('kx_periods', '{');
    expect(loadPeriods()).toEqual([]);
  });
});

describe('cycle stats', () => {
  const starts = (first: string, lengths: number[]) => lengths.reduce((list, l) => [...list, shiftDay(list[list.length - 1], l)], [first]);

  it('uses the entered length until there are two periods', () => {
    const s = cycleStats(['2026-09-10'], 30);
    expect([s.average, s.confidence, s.spread]).toEqual([30, 'rough', 3]);
  });

  it('averages the last six cycles and knows how steady they are', () => {
    const s = cycleStats(starts('2026-01-01', [40, 29, 30, 31, 30, 29, 31]), 28);
    expect(s.lengths).toEqual([29, 30, 31, 30, 29, 31]);
    expect(s.average).toBe(30);
    expect(s.confidence).toBe('good');
    expect(s.irregular).toBe(false);
  });

  it('flags irregular cycles (NHS: outside 21–35 days, or varying a lot)', () => {
    expect(cycleStats(starts('2026-01-01', [24, 38, 27]), 28).irregular).toBe(true);
    expect(cycleStats(starts('2026-01-01', [28, 29, 27]), 28).irregular).toBe(false);
  });

  it('ignores gaps that can’t be one cycle (a missed log)', () => {
    expect(cycleStats(['2026-01-01', '2026-03-20', '2026-04-18'], 28).lengths).toEqual([29]);
  });
});

describe('today in the cycle', () => {
  it('puts ovulation 14 days before the next period, not mid-cycle', () => {
    const c = cycleToday(['2026-09-01'], 35, 5, '2026-09-10')!;
    expect(c.next).toBe('2026-10-06');
    expect(c.ovulation).toBe('2026-09-22'); // day 22 of a 35-day cycle
    expect(c.fertileStart).toBe('2026-09-17');
    expect(c.day).toBe(10);
    expect(c.phase).toBe('follicular');
  });

  it('walks through the phases of a 28-day cycle', () => {
    const at = (day: string) => cycleToday(['2026-09-01'], 28, 5, day)!.phase;
    expect(at('2026-09-03')).toBe('period');
    expect(at('2026-09-08')).toBe('follicular');
    expect(at('2026-09-11')).toBe('fertile');
    expect(at('2026-09-15')).toBe('ovulation');
    expect(at('2026-09-20')).toBe('luteal');
    expect(at('2026-09-27')).toBe('due');
    expect(at('2026-10-01')).toBe('due'); // inside the ± 3-day window of a first estimate
    const late = cycleToday(['2026-09-01'], 28, 5, '2026-10-05')!;
    expect([late.phase, late.lateBy]).toEqual(['late', 3]);
  });

  it('counts days from the last logged start, in local days', () => {
    const c = cycleToday(['2026-08-04', '2026-09-01'], 28, 5, '2026-09-01')!;
    expect(c.day).toBe(1);
    expect(dayDiff('2026-10-24', '2026-10-26')).toBe(2); // across the UK clock change
    expect(cycleToday([], 28)).toBeNull();
  });

  it('has words for every phase', () => {
    for (const phase of ['period', 'follicular', 'fertile', 'ovulation', 'luteal', 'due', 'late'] as const) {
      expect(PHASE_TEXT[phase].title.length).toBeGreaterThan(3);
    }
    expect(PHASE_TEXT.fertile.body).toMatch(/not a way to prevent pregnancy/);
  });
});

describe('context for this cycle', () => {
  const days = (from: string, n: number, v: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [shiftDay(from, i), v]));

  it('mentions short sleep, very hard training and under-eating — only when there’s enough to go on', () => {
    const notes = cycleContext({
      since: '2026-09-01', today: '2026-09-14',
      sleepHoursByDay: days('2026-09-01', 10, 5.5),
      workoutMinutesByDay: days('2026-09-01', 14, 75),
      kcalByDay: days('2026-09-01', 8, 1100), kcalTarget: 2000,
    });
    expect(notes.join(' ')).toMatch(/5\.5 h of sleep/);
    expect(notes.join(' ')).toMatch(/hours of workouts a week/);
    expect(notes.join(' ')).toMatch(/1,?100 kcal|1100 kcal/);
    expect(cycleContext({ since: '2026-09-01', today: '2026-09-03', sleepHoursByDay: days('2026-09-01', 3, 5), workoutMinutesByDay: {}, kcalByDay: {}, kcalTarget: 2000 })).toEqual([]);
  });

  it('notices HRV falling over the cycle', () => {
    const hrv = { ...days('2026-09-01', 6, 60), ...days('2026-09-07', 6, 40) };
    const notes = cycleContext({ since: '2026-09-01', today: '2026-09-12', sleepHoursByDay: {}, workoutMinutesByDay: {}, kcalByDay: {}, kcalTarget: 2000, hrvByDay: hrv });
    expect(notes.join(' ')).toMatch(/HRV has dropped/);
  });
});
