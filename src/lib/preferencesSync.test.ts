import { describe, expect, it } from 'vitest';
import { PREF_KEYS, setPref } from './preferencesSync';
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
