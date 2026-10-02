// Registers the `profiles` singleton domain (LWW) with the sync engine. Profile itself is still owned
// by App.tsx's React state + the raw `kinetix_profile` localStorage key (no call-site changes there) —
// this module only teaches sync.ts how to read/write that key and map it to/from the `profiles` table.
import type { UserProfile } from '../App';
import { readJson, writeJson } from './storage';
import { registerSingleton, noteLocalChange } from './sync';

const PROFILE_KEY = 'kinetix_profile';

registerSingleton<UserProfile | null>({
  name: 'profiles',
  table: 'profiles',
  load: () => readJson<UserProfile>(PROFILE_KEY),
  save: (value) => {
    if (!value) return;
    const existing = readJson<UserProfile>(PROFILE_KEY) ?? {};
    writeJson(PROFILE_KEY, { ...existing, ...value });
  },
  isEmpty: (value) => !value || !value.name,
  toRemote: (value, userId) => {
    const p = value as UserProfile;
    return {
      user_id: userId,
      name: p.name,
      height: p.height,
      weight: p.weight,
      target: p.target,
      personal_allergens: p.personalAllergens ?? [],
      workouts_logged: p.workoutsLogged ?? [],
      smart_device_connected: p.smartDeviceConnected,
      wearable: p.wearable,
      sex: p.sex,
      age: p.age,
      activity_level: p.activityLevel,
      last_period_start_date: p.lastPeriodStartDate,
      average_cycle_length: p.averageCycleLength,
      region: p.region,
      country: p.country,
      diet: p.diet,
    };
  },
  fromRemote: (row) => profileFromRemote(row) as UserProfile,
});

/**
 * The account's profile row as the phone's profile. Which health app is connected (`smart_device_connected`) is left
 * out on purpose: it describes one phone (Health Connect on Android, Apple Health on iPhone), so pulling it would make
 * a second phone claim a connection it never made. The column is still written, so nothing else about the row changes.
 */
export function profileFromRemote(row: Record<string, unknown>): Omit<UserProfile, 'email' | 'smartDeviceConnected'> {
  return {
    name: row.name as string,
    height: row.height as number,
    weight: row.weight as number,
    target: row.target as UserProfile['target'],
    personalAllergens: (row.personal_allergens as string[]) ?? [],
    workoutsLogged: (row.workouts_logged as string[]) ?? [],
    wearable: row.wearable as UserProfile['wearable'],
    sex: row.sex as UserProfile['sex'],
    age: row.age as number,
    activityLevel: row.activity_level as UserProfile['activityLevel'],
    lastPeriodStartDate: row.last_period_start_date as string | null,
    averageCycleLength: row.average_cycle_length as number,
    region: row.region as string | null,
    country: row.country as UserProfile['country'],
    diet: row.diet as UserProfile['diet'],
  };
}

/** Call right after `kinetix_profile` is written (saveProfileToStorage / patchProfile). */
export function noteProfileChanged() {
  noteLocalChange('profiles');
}

/** Re-reads `kinetix_profile` — used after a sync pull to bring the change into React state. */
export function readLocalProfile(): UserProfile | null {
  return readJson<UserProfile>(PROFILE_KEY);
}
