// Registers the `preferences` singleton domain (LWW) — a small blob of settings that are cheap to
// bundle: theme, sounds, glass size, water goal, widget prefs. Each feature keeps reading/writing its
// own localStorage key exactly as before (no call-site changes); this module only bundles a snapshot of
// those keys for sync and writes them back individually on pull.
import { registerSingleton, noteLocalChange } from './sync';

// Settings that follow the account to another phone. Reminder settings are here (water, gut check and streak reminders,
// the active hours, the movement-break gap) so a new phone opens with the same ones. Left out on purpose, because they
// describe one phone: "movement breaks on" (needs this phone's Physical activity permission and step counter),
// "notifications skipped" (this phone's answer to the permission) and the AI-ideas consent (asked again on each phone).
export const PREF_KEYS = [
  'kx_theme',
  'kx_sounds',
  'kinetix_glass_ml',
  'kinetix_water_goal_ml',
  'kx_widget_prefs',
  'kinetix_hydration_enabled',
  'kinetix_hydration_interval',
  'kinetix_shift_start',
  'kinetix_shift_end',
  'kinetix_move_minutes',
  'kx_gut_reminder',
  'kx_streak_reminder',
  'kx_meals_hidden', // meals hidden with "Not for me" (a JSON list of ids)
] as const;

export type PrefKey = (typeof PREF_KEYS)[number];

type PrefBlob = Partial<Record<(typeof PREF_KEYS)[number], string>>;

function snapshot(): PrefBlob {
  const blob: PrefBlob = {};
  for (const key of PREF_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) blob[key] = value;
  }
  return blob;
}

registerSingleton<PrefBlob>({
  name: 'preferences',
  table: 'preferences',
  load: snapshot,
  save: (value) => {
    for (const key of PREF_KEYS) {
      const v = value[key];
      if (v !== undefined) {
        try { localStorage.setItem(key, v); } catch { /* storage full or blocked */ }
      }
    }
  },
  isEmpty: (value) => Object.keys(value).length === 0,
  toRemote: (value, userId) => ({ user_id: userId, data: value }),
  fromRemote: (row) => (row.data as PrefBlob) ?? {},
});

/** Call right after any of PREF_KEYS is written locally. */
export function notePreferencesChanged() {
  noteLocalChange('preferences');
}

/** Saves one synced setting and marks the preferences as waiting to be sent to the account. */
export function setPref(key: PrefKey, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage full or blocked */ }
  notePreferencesChanged();
}
