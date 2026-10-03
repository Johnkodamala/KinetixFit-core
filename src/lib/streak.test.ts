import { describe, expect, it } from 'vitest';
import { longestRun, runEndingOn, streakOf, streakMessage } from './streak';

const NOW = new Date('2026-10-03T21:00:00');
/** n consecutive day keys ending `endDaysAgo` days before 3 Oct 2026 */
const run = (n: number, endDaysAgo = 0) => Array.from({ length: n }, (_, i) => {
  const d = new Date('2026-10-03T12:00:00');
  d.setDate(d.getDate() - endDaysAgo - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

describe('the current streak', () => {
  it('counts the days in a row ending today', () => {
    const s = streakOf(run(5), NOW);
    expect(s).toMatchObject({ current: 5, today: true, best: 5 });
  });

  it('is still alive until a whole day passes: through yesterday counts, with "Check in today"', () => {
    const s = streakOf(run(5, 1), NOW);
    expect(s).toMatchObject({ current: 5, today: false });
    expect(streakMessage(s)).toBe('Check in today to keep it going.');
  });

  it('is broken after a whole day without a check-in', () => {
    expect(streakOf(run(5, 2), NOW).current).toBe(0);
  });

  it('shows the last 7 days, today last, and the next badge', () => {
    const s = streakOf(run(3), NOW);
    expect(s.week.map(d => d.done)).toEqual([false, false, false, false, true, true, true]);
    expect(s.next).toEqual({ days: 7, toGo: 4 });
  });

  it('runEndingOn counts back from a day', () => {
    expect(runEndingOn(new Set(run(4)), run(1)[0])).toBe(4);
    expect(runEndingOn(new Set(run(4, 1)), run(1)[0])).toBe(0);
  });
});

describe('the best streak', () => {
  it('is never below the one this phone saved (it can outlive the check-ins that are kept)', () => {
    expect(streakOf(run(2), NOW, 40).best).toBe(40);
  });

  it('is the longest run in the check-in history, even on a phone that never saw it happen', () => {
    // a 9-day streak that ended 20 days ago, then a 2-day streak now: a second phone signs in with the history and no saved best
    const history = [...run(9, 20), ...run(2)];
    const s = streakOf(history, NOW, 0);
    expect(s.current).toBe(2);
    expect(s.best).toBe(9);
    expect(s.next).toEqual({ days: 14, toGo: 12 });
  });

  it('finds the longest run among several, whichever order the days come in', () => {
    const days = [...run(3, 30), ...run(6, 15), ...run(2, 5)].sort(() => 0.5 - Math.random());
    expect(longestRun(days)).toBe(6);
    expect(longestRun([])).toBe(0);
    expect(longestRun(['2026-10-01'])).toBe(1);
  });

  it('counts a run across a month end and a clock change (the UK clocks go back on 25 Oct 2026)', () => {
    expect(longestRun(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])).toBe(4);
  });

  it('counts a repeated day once', () => {
    expect(longestRun(['2026-10-01', '2026-10-01', '2026-10-02'])).toBe(2);
  });
});
