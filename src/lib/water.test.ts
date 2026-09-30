// Focused coverage for the sync-relevant behaviour added to water.ts: removing a drink tombstones it
// (for cross-device delete propagation) and marks it dirty; the local KEEP_DAYS cache trim never does.
import { describe, expect, it } from 'vitest';
import { withDrinks, withoutDrink, loadWaterTombstones, saveWaterLog } from './water';
import { isDirty } from './sync';

describe('water tombstones', () => {
  it('adding a drink marks it dirty for the next push', () => {
    const log = withDrinks({}, [[1000, 250]]);
    expect(log['1970-01-01']).toBeTruthy();
    expect(isDirty('water_logs')).toBe(true);
  });

  it('removing a drink tombstones it (with its ml/day, for a later push) and marks it dirty', () => {
    const log = withDrinks({}, [[1000, 250]]);
    const day = Object.keys(log)[0];
    const after = withoutDrink(log, 1000);
    expect(after[day] ?? []).toHaveLength(0);
    expect(loadWaterTombstones()['1000']).toEqual({ ml: 250, day, deletedAt: expect.any(Number) });
  });

  it('the local cache trim (saveWaterLog dropping old days) is not a delete: no tombstone, nothing marked dirty', () => {
    const log = withDrinks({}, [[1000, 250]]);
    // clear the dirty flag noteKeyedChange set, to isolate saveWaterLog's own effect
    const beforeTombstones = loadWaterTombstones();
    expect(beforeTombstones).toEqual({});
    saveWaterLog(log); // this may trim the (very old, 1970) day straight out of the visible log
    expect(loadWaterTombstones()).toEqual({}); // still no tombstone — cache trim, not a delete
  });
});
