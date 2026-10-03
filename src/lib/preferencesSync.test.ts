import { describe, expect, it } from 'vitest';
import { PREF_KEYS, setPref } from './preferencesSync';
import { hideMeal, loadHiddenMeals, unhideAllMeals } from './mealIdeas';
import { isDirty, registeredSingleton } from './sync';

const prefs = () => {
  const d = registeredSingleton('preferences');
  if (!d) throw new Error('preferences not registered');
  return d as { load: () => Record<string, string>; save: (v: Record<string, string>) => void };
};

describe('reminder settings travel with the account', () => {
  it('syncs the water, gut and streak reminders, the active hours and the movement-break gap', () => {
    for (const key of ['kinetix_hydration_enabled', 'kinetix_hydration_interval', 'kinetix_shift_start', 'kinetix_shift_end', 'kinetix_move_minutes', 'kx_gut_reminder', 'kx_streak_reminder'])
      expect(PREF_KEYS, key).toContain(key);
  });

  it('keeps what depends on this phone’s own permissions to itself', () => {
    // "movement breaks on" needs this phone's Physical activity permission and step counter; "skipped" is this phone's notification answer
    expect(PREF_KEYS).not.toContain('kinetix_move_enabled');
    expect(PREF_KEYS).not.toContain('kx_notifications_skipped');
    expect(PREF_KEYS).not.toContain('kx_ai_ideas_consent');
  });

  it('setPref saves the setting and marks the preferences as waiting to be sent', () => {
    expect(isDirty('preferences')).toBe(false);
    setPref('kinetix_hydration_interval', '3');
    expect(localStorage.getItem('kinetix_hydration_interval')).toBe('3');
    expect(isDirty('preferences')).toBe(true);
    expect(prefs().load().kinetix_hydration_interval).toBe('3');
  });

  it('settings pulled from the account are written back for each feature to read', () => {
    prefs().save({ kx_gut_reminder: 'off', kinetix_shift_start: '7', kinetix_shift_end: '21' });
    expect(localStorage.getItem('kx_gut_reminder')).toBe('off');
    expect(localStorage.getItem('kinetix_shift_start')).toBe('7');
    expect(localStorage.getItem('kinetix_shift_end')).toBe('21');
  });
});

describe('meals hidden with "Not for me" travel with the account', () => {
  it('are one of the synced settings', () => {
    expect(PREF_KEYS).toContain('kx_meals_hidden');
  });

  it('hiding a meal marks the preferences as waiting to be sent, and showing them all again does too', () => {
    expect(isDirty('preferences')).toBe(false);
    const hidden = hideMeal([], 'upma');
    expect(hidden).toEqual(['upma']);
    expect(isDirty('preferences')).toBe(true);
    expect(prefs().load().kx_meals_hidden).toBe(JSON.stringify(['upma']));
  });

  it('unhiding all travels too, as an empty list (not by leaving the key out: the other phone would keep its list)', () => {
    hideMeal([], 'upma');
    expect(unhideAllMeals()).toEqual([]);
    expect(prefs().load().kx_meals_hidden).toBe('[]');
    expect(isDirty('preferences')).toBe(true);
    expect(loadHiddenMeals()).toEqual([]);
  });

  it('a list pulled from the account is the one this phone shows', () => {
    prefs().save({ kx_meals_hidden: JSON.stringify(['poha', 'upma']) });
    expect(loadHiddenMeals()).toEqual(['poha', 'upma']);
  });
});
