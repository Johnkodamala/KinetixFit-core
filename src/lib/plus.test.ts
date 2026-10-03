import { describe, expect, it } from 'vitest';
import { FREE_DAILY_SCANS, PLUS_DAILY_SCANS, usableScanAllowance } from './plus';

describe('the scans-left figure in the scan window', () => {
  it('shows what the server last said while it still describes the person’s plan', () => {
    const free = { left: 1, limit: FREE_DAILY_SCANS };
    const plus = { left: 7, limit: PLUS_DAILY_SCANS };
    expect(usableScanAllowance(free, false)).toBe(free);
    expect(usableScanAllowance(plus, true)).toBe(plus);
  });

  it('forgets a free plan’s "0 of 2" once the person is on Plus (and a Plus "7 of 10" when Plus ends)', () => {
    expect(usableScanAllowance({ left: 0, limit: FREE_DAILY_SCANS }, true)).toBeNull();
    expect(usableScanAllowance({ left: 7, limit: PLUS_DAILY_SCANS }, false)).toBeNull();
  });

  it('has nothing to show before the first scan', () => {
    expect(usableScanAllowance(null, true)).toBeNull();
    expect(usableScanAllowance(null, false)).toBeNull();
  });
});
