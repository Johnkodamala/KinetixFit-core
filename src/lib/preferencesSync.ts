// Registers the `preferences` singleton domain (LWW) — a small blob of settings that are cheap to
// bundle: theme, sounds, glass size, water goal, widget prefs. Each feature keeps reading/writing its
// own localStorage key exactly as before (no call-site changes); this module only bundles a snapshot of
// those keys for sync and writes them back individually on pull.
import { registerSingleton, noteLocalChange } from './sync';

const PREF_KEYS = [
  'kx_theme',
  'kx_sounds',
  'kinetix_glass_ml',
  'kinetix_water_goal_ml',
  'kx_widget_prefs',
] as const;

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
