import { describe, expect, it } from 'vitest';
import { profileFromRemote } from './profileSync';

const row = {
  name: 'Siva', height: 178, weight: 80, target: 'Weight Loss', personal_allergens: ['peanuts'], workouts_logged: [],
  smart_device_connected: 'Health Connect', wearable: 'yes', sex: 'male', age: 31, activity_level: 'active',
  last_period_start_date: null, average_cycle_length: 28, region: 'england', country: 'GB', diet: 'vegetarian',
};

describe('profileFromRemote', () => {
  it('brings the account’s answers to the phone', () => {
    const p = profileFromRemote(row);
    expect(p).toMatchObject({ name: 'Siva', height: 178, weight: 80, target: 'Weight Loss', diet: 'vegetarian', country: 'GB', personalAllergens: ['peanuts'] });
  });

  it('leaves out which health app is connected: that is about the phone, not the account', () => {
    // an iPhone signing in must not be told "Connected to Health Connect" because an Android phone connected it
    expect('smartDeviceConnected' in profileFromRemote(row)).toBe(false);
  });
});
