// Water the person says they drank. Self-reported, so it only ever fills the bottle, the Hydration page and the
// widgets — never quests, points or rewards (anyone could tap it).
// Saved per local day as one entry per drink: its time and how much it was. The glass size (50–500 ml) is the
// person's own setting and the daily goal is an amount (1.5–3 L), so a small glass doesn't make the goal smaller.
import { localDayKey, localDayKeyDaysAgo } from './dates';
import { readJson, writeJson } from './storage';
import { notePreferencesChanged } from './preferencesSync';
import { noteKeyedChange } from './sync';

/** Older logs (and widget-added drinks without an amount) count as one 250 ml glass. */
export const LEGACY_GLASS_ML = 250;
export const GLASS_SIZES = [50, 100, 150, 200, 250, 300, 500];
export const WATER_GOAL_ML_OPTIONS = [1500, 2000, 2500, 3000];
const LOG_KEY = 'kinetix_water_log';
const GOAL_KEY = 'kinetix_water_goal'; // glasses, before goals were amounts
const GOAL_ML_KEY = 'kinetix_water_goal_ml';
const GLASS_KEY = 'kinetix_glass_ml';
const KEEP_DAYS = 35;
// A removed drink moves here (id = its time, as a string) instead of disappearing outright, so sync
// can propagate the delete rather than an offline device resurrecting it (waterSync.ts, sync.ts). Local
// cache trimming (KEEP_DAYS, below) is NOT a delete — it never touches this map or marks anything dirty,
// since the server keeps complete history indefinitely regardless of the local cache's cap.
const DELETED_KEY = 'kx_water_deleted';
export interface WaterTombstone { ml: number; day: string; deletedAt: number; }

export function loadWaterTombstones(): Record<string, WaterTombstone> {
  const saved = readJson<Record<string, WaterTombstone>>(DELETED_KEY);
  return saved && typeof saved === 'object' ? saved : {};
}
export function saveWaterTombstones(map: Record<string, WaterTombstone>) {
  writeJson(DELETED_KEY, map);
}

/** One drink: [time ms, ml]. A bare number is an older entry: a 250 ml glass at that time. */
export type WaterEntry = number | [number, number];
/** Day key → that day's drinks. */
export type WaterLog = Record<string, WaterEntry[]>;

export const entryTime = (e: WaterEntry) => (Array.isArray(e) ? e[0] : e);
export const entryMl = (e: WaterEntry) => (Array.isArray(e) ? e[1] : LEGACY_GLASS_ML);

export function loadWaterLog(): WaterLog {
  const saved = readJson<WaterLog>(LOG_KEY);
  return saved && typeof saved === 'object' ? saved : {};
}

export function saveWaterLog(log: WaterLog) {
  const oldest = localDayKeyDaysAgo(KEEP_DAYS);
  const trimmed: WaterLog = {};
  for (const [day, entries] of Object.entries(log)) if (day >= oldest && entries.length) trimmed[day] = entries;
  writeJson(LOG_KEY, trimmed);
  return trimmed;
}

/** Drinks added (from the app or a home-screen widget), each filed under its own day. */
export function withDrinks(log: WaterLog, drinks: [number, number][]): WaterLog {
  const next = { ...log };
  for (const [t, ml] of drinks) {
    const day = localDayKey(new Date(t));
    next[day] = [...(next[day] ?? []), [t, ml] as [number, number]].sort((a, b) => entryTime(a) - entryTime(b));
    noteKeyedChange('water_logs', String(t));
  }
  return next;
}

export function withoutDrink(log: WaterLog, time: number): WaterLog {
  const day = localDayKey(new Date(time));
  const removed = (log[day] ?? []).find(e => entryTime(e) === time);
  if (removed) {
    const tombstones = loadWaterTombstones();
    tombstones[String(time)] = { ml: entryMl(removed), day, deletedAt: Date.now() };
    saveWaterTombstones(tombstones);
    noteKeyedChange('water_logs', String(time));
  }
  return { ...log, [day]: (log[day] ?? []).filter(e => entryTime(e) !== time) };
}

export const dayMl = (log: WaterLog, day: string) => (log[day] ?? []).reduce<number>((sum, e) => sum + entryMl(e), 0);

/** The daily goal in ml. An older goal in glasses (6/8/10/12) becomes the nearest amount (8 glasses → 2 L). */
export function loadWaterGoalMl(): number {
  const ml = parseInt(localStorage.getItem(GOAL_ML_KEY) || '', 10);
  if (WATER_GOAL_ML_OPTIONS.includes(ml)) return ml;
  const glasses = parseInt(localStorage.getItem(GOAL_KEY) || '', 10);
  if (glasses > 0) {
    const wanted = glasses * LEGACY_GLASS_ML;
    return WATER_GOAL_ML_OPTIONS.reduce((best, o) => (Math.abs(o - wanted) < Math.abs(best - wanted) ? o : best));
  }
  return 2000;
}

export function saveWaterGoalMl(ml: number) {
  localStorage.setItem(GOAL_ML_KEY, String(ml));
  notePreferencesChanged();
}

export function loadGlassMl(): number {
  const ml = parseInt(localStorage.getItem(GLASS_KEY) || '', 10);
  return GLASS_SIZES.includes(ml) ? ml : LEGACY_GLASS_ML;
}

export function saveGlassMl(ml: number) {
  localStorage.setItem(GLASS_KEY, String(ml));
  notePreferencesChanged();
}

/** The last `days` days, oldest first: { day key, ml }. */
export function waterWeek(log: WaterLog, days = 7): { day: string; ml: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = localDayKeyDaysAgo(days - 1 - i);
    return { day, ml: dayMl(log, day) };
  });
}

/** "750 ml" / "1.5 L" / "1.25 L" */
export function waterAmount(ml: number): string {
  return ml < 1000 ? `${Math.round(ml)} ml` : `${(ml / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} L`;
}
