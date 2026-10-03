import { describe, expect, it } from 'vitest';
import { profileFromRemote, profileAfterEdit } from './profileSync';
import type { UserProfile } from '../App';

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

describe('profileAfterEdit: an edit goes onto the newest copy, not the one the screen drew', () => {
  const drawn = { name: 'Siva', email: 'a@b.co', age: 30, weight: 75, height: 180 } as UserProfile;

  it('keeps what another phone changed since the screen drew (a pull wrote it to this phone, and the notice was dismissed)', () => {
    // the other phone set the weight to 71.5; this phone's screen still holds 75 and the person now edits the age
    const stored = { ...drawn, weight: 71.5 };
    const next = profileAfterEdit(drawn, stored, { age: 31 });
    expect(next.weight).toBe(71.5); // was reverted to 75 and uploaded over the other phone's edit
    expect(next.age).toBe(31);
  });

  it('puts the edit itself over both copies', () => {
    expect(profileAfterEdit(drawn, { ...drawn, age: 40 }, { age: 31 }).age).toBe(31);
  });

  it('works with nothing stored yet (the first save after logging out) and keeps the fields only the screen has', () => {
    expect(profileAfterEdit(drawn, null, { age: 31 })).toEqual({ ...drawn, age: 31 });
    expect(profileAfterEdit({ ...drawn, smartDeviceConnected: 'Health Connect' } as UserProfile, { age: 30 }, { weight: 70 }).smartDeviceConnected).toBe('Health Connect');
  });
});
