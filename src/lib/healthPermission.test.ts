import { describe, expect, it } from 'vitest';
import { CORE_HEALTH_TYPES, healthPermissionRemoved } from './healthPermission';

describe('Health Connect permission taken away', () => {
  it('reads steps, heart rate and sleep first', () => {
    expect([...CORE_HEALTH_TYPES]).toEqual(['steps', 'heartRate', 'sleep']);
  });

  it('is removed when Health Connect allows none of them', () => {
    expect(healthPermissionRemoved([])).toBe(true);
    // allowing other things (workouts, vitals) doesn't make the cards work
    expect(healthPermissionRemoved(['workouts', 'distance', 'oxygenSaturation'])).toBe(true);
  });

  it('is not removed while any one of them is still allowed (a card or two can be switched off on purpose)', () => {
    expect(healthPermissionRemoved(['steps'])).toBe(false);
    expect(healthPermissionRemoved(['heartRate', 'workouts'])).toBe(false);
    expect(healthPermissionRemoved(['sleep', 'steps', 'heartRate'])).toBe(false);
  });
});
