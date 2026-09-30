// Workouts on Today. Two kinds:
// - detected: recorded by the person's watch or phone and read from Health Connect / Apple Health. These count for the
//   workout quest, the Rewards stats and the badges.
// - added by hand: kept for the person's own record (and AI meal ideas), but they never count for quests or
//   rewards, because anyone could add one. They can be added, changed and removed (kx_workouts, below). Before
//   28 Sep 2026 they were strings in profile.workoutsLogged ("Run · 30 min (dd/mm/yyyy)", or an older
//   "Label (dd/mm/yyyy)"); loadManualWorkouts() moves those over once.
import type { Workout } from '@capgo/capacitor-health';
import { localDayKey, localDayKeyDaysAgo } from './dates';
import { primarySourceLabel } from './healthSources';
import { noteKeyedChange } from './sync';

export interface DetectedWorkout {
  id: string;
  type: string;
  label: string;
  start: number;
  minutes: number;
  kcal: number | null;
  km: number | null;
  source: string | null;
}

/** A session this short is usually an accidental start — not shown, not counted. */
export const MIN_WORKOUT_MINUTES = 5;

const LABELS: [RegExp, string][] = [
  [/^(running|runningTreadmill|trackAndField)$/, 'Run'],
  [/^(walking|hiking|stairs|stairClimbing|stairClimbingMachine|stepTraining)$/, 'Walk'],
  [/^(cycling|bikingStationary|handCycling)$/, 'Cycle'],
  [/^(swimming|swimmingPool|swimmingOpenWater|waterFitness)$/, 'Swim'],
  [/(strength|weightlifting|Press|Curl|Raise|Extension|deadlift|lunge|plank|crunch|calisthenics|latPullDown|benchSitUp)/i, 'Strength'],
  [/^(yoga|pilates|barre|flexibility|stretching|mindAndBody|taiChi)$/, 'Yoga'],
  [/^(highIntensityIntervalTraining|crossTraining|bootCamp|mixedCardio|burpee|jumpingJack|exerciseClass)$/, 'HIIT'],
  [/^(elliptical|rowing|rowingMachine)$/, 'Cardio machine'],
  [/(dance|dancing)/i, 'Dance'],
];

export function workoutLabel(type: string): string {
  for (const [re, label] of LABELS) if (re.test(type)) return label;
  if (!type || type === 'other') return 'Workout';
  // "tableTennis" → "Table tennis"
  const words = type.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toDetected(w: Workout): DetectedWorkout | null {
  const start = Date.parse(w.startDate);
  const minutes = Math.round((w.duration || (Date.parse(w.endDate) - start) / 1000) / 60);
  if (!Number.isFinite(start) || minutes < MIN_WORKOUT_MINUTES) return null;
  return {
    id: w.platformId ?? `${w.startDate}-${w.workoutType}`,
    type: w.workoutType,
    label: workoutLabel(w.workoutType),
    start,
    minutes,
    kcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : null,
    km: w.totalDistance ? Math.round(w.totalDistance / 100) / 10 : null,
    source: primarySourceLabel([{ sourceId: w.sourceId }]) ?? w.sourceName ?? null,
  };
}

// Every detected workout seen so far (ids), so the Rewards count and badges keep growing past the 30 days that
// are read each time.
const SEEN_KEY = 'kinetix_detected_workouts';
export function rememberDetected(workouts: DetectedWorkout[]): number {
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { /* start again */ }
  const all = new Set(seen);
  for (const w of workouts) all.add(w.id);
  if (all.size !== seen.length) localStorage.setItem(SEEN_KEY, JSON.stringify([...all].slice(-2000)));
  return all.size;
}
export function detectedWorkoutCount(): number {
  try { return (JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[]).length; } catch { return 0; }
}

// A durable local copy of the last 30 days of detected (watch/phone-tracked) workouts — the same
// window Health.queryWorkouts already reads live in App.tsx — so this data exists on the backend for
// trend analysis rather than only ever being read fresh from the device. Purely additive: reading,
// counting and awarding for detected workouts elsewhere is unchanged; this is a persistence-only copy.
const DETECTED_HISTORY_KEY = 'kx_detected_workouts_history';
const DETECTED_HISTORY_DAYS = 30;

export function loadDetectedWorkoutHistory(): Record<string, DetectedWorkout> {
  try {
    const saved = JSON.parse(localStorage.getItem(DETECTED_HISTORY_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}
export function saveDetectedWorkoutHistory(records: Record<string, DetectedWorkout>) {
  const oldest = Date.now() - DETECTED_HISTORY_DAYS * 86_400_000;
  const kept = Object.fromEntries(Object.entries(records).filter(([, w]) => w.start >= oldest));
  localStorage.setItem(DETECTED_HISTORY_KEY, JSON.stringify(kept));
}

/** Call with whatever Health.queryWorkouts just read (already a 30-day window). Only new/changed
 * workouts are marked dirty for the next sync push. */
export function recordDetectedWorkouts(workouts: DetectedWorkout[]): void {
  const records = loadDetectedWorkoutHistory();
  let changed = false;
  for (const w of workouts) {
    if (JSON.stringify(records[w.id]) === JSON.stringify(w)) continue;
    records[w.id] = w;
    changed = true;
    noteKeyedChange('workouts', w.id);
  }
  if (changed) saveDetectedWorkoutHistory(records);
}

export const isToday = (ms: number) => localDayKey(new Date(ms)) === localDayKey();

// --- added by hand (kx_workouts) ---

export interface ManualWorkout {
  id: string;
  /** "Run", "Yoga", or the person's own name for it ("Paddleboarding") */
  type: string;
  minutes: number;
  /** the local day it happened */
  day: string;
  /** when it was added or last changed (ms) — orders a day's workouts */
  at: number;
  note?: string;
}

/** The first choices in "Add a workout"; Show more adds MORE_WORKOUT_TYPES, and "Other" takes a typed name. */
export const WORKOUT_TYPES = ['Walk', 'Run', 'Cycle', 'Swim', 'Strength', 'Yoga', 'HIIT', 'Sport'];
export const MORE_WORKOUT_TYPES = [
  'Hike', 'Dance', 'Pilates', 'Stretching', 'Football', 'Cricket', 'Tennis', 'Badminton',
  'Basketball', 'Boxing', 'Martial arts', 'Rowing', 'Climbing', 'Skipping', 'Elliptical', 'Gardening',
];
/** Duration presets; "Custom" takes any whole number of minutes in range. */
export const MINUTE_PRESETS = [10, 15, 20, 30, 45, 60, 90];
export const MIN_WORKOUT_ENTRY = 1;
export const MAX_WORKOUT_ENTRY = 600;
export const MAX_TYPE_LENGTH = 30;
export const MAX_NOTE_LENGTH = 120;
/** A year of hand-added workouts is kept (a few dozen bytes each). */
const KEEP_DAYS = 366;
const KEY = 'kx_workouts';

/** "45 min", "1 h", "1 h 30 min" */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "Run · 30 min" — what AI meal ideas and the Today list show. */
export const manualLabel = (w: Pick<ManualWorkout, 'type' | 'minutes'>) => `${w.type} · ${formatMinutes(w.minutes)}`;

/** A typed activity name, tidied: trimmed, single spaces, first letter capital, at most MAX_TYPE_LENGTH. */
export function cleanType(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TYPE_LENGTH).trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export interface WorkoutDraft { type: string; minutes: number; day: string; note?: string }

/** Why a workout can't be saved (for the sheet), or null when it's fine. */
export function workoutProblem(d: WorkoutDraft, today = localDayKey()): string | null {
  if (!cleanType(d.type)) return 'Choose what you did, or type its name.';
  if (!Number.isInteger(d.minutes) || d.minutes < MIN_WORKOUT_ENTRY || d.minutes > MAX_WORKOUT_ENTRY) {
    return `Enter ${MIN_WORKOUT_ENTRY}–${MAX_WORKOUT_ENTRY} minutes.`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day) || d.day > today) return 'Pick a day up to today.';
  if (d.day < localDayKeyDaysAgo(KEEP_DAYS - 1, dayDate(today))) return 'That’s more than a year ago.';
  return null;
}

const dayDate = (day: string) => new Date(`${day}T12:00:00`);

function isWorkout(w: unknown): w is ManualWorkout {
  const x = w as ManualWorkout;
  return !!x && typeof x.id === 'string' && typeof x.type === 'string' && !!x.type && Number.isFinite(x.minutes)
    && x.minutes > 0 && typeof x.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.day) && Number.isFinite(x.at);
}

/** Newest day first; within a day, the latest added first. */
const byNewest = (a: ManualWorkout, b: ManualWorkout) => (a.day === b.day ? b.at - a.at : a.day < b.day ? 1 : -1);

let idCounter = 0;
const newId = (at: number) => `w${at.toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The person's hand-added workouts, newest first. The first time (no kx_workouts yet) it moves over the old
 * profile.workoutsLogged strings — pass them in — and saves the result, so it happens once.
 */
export function loadManualWorkouts(legacy: string[] = []): ManualWorkout[] {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return saveManualWorkouts(fromLegacy(legacy));
  try {
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved.filter(isWorkout).sort(byNewest) : [];
  } catch {
    return [];
  }
}

// A removed workout moves here (id -> its day + when) instead of disappearing outright, so sync can
// propagate the delete rather than an offline device resurrecting it (workoutsSync.ts, sync.ts). The
// KEEP_DAYS cap below is NOT a delete: an id whose day is already outside it is never tombstoned, since
// the server keeps complete history indefinitely regardless of the local cache's cap.
const DELETED_KEY = 'kx_workouts_deleted';
export function loadWorkoutTombstones(): Record<string, { day: string; deletedAt: number }> {
  try {
    const saved = JSON.parse(localStorage.getItem(DELETED_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}
function saveWorkoutTombstones(map: Record<string, { day: string; deletedAt: number }>) {
  localStorage.setItem(DELETED_KEY, JSON.stringify(map));
}

/** Saves (dropping anything older than a year) and returns the sorted list. */
export function saveManualWorkouts(list: ManualWorkout[]): ManualWorkout[] {
  const oldest = localDayKeyDaysAgo(KEEP_DAYS - 1);
  const kept = list.filter(w => isWorkout(w) && w.day >= oldest).sort(byNewest);

  const prevRaw = localStorage.getItem(KEY);
  const prev: ManualWorkout[] = (() => { try { return prevRaw ? JSON.parse(prevRaw) : []; } catch { return []; } })();
  const prevById = new Map(prev.map((w: ManualWorkout) => [w.id, w]));
  const nextById = new Map(kept.map(w => [w.id, w]));
  const tombstones = loadWorkoutTombstones();
  let tombstonesChanged = false;
  for (const [id, w] of prevById) {
    if (!nextById.has(id) && w.day >= oldest) {
      tombstones[id] = { day: w.day, deletedAt: Date.now() };
      tombstonesChanged = true;
      noteKeyedChange('workouts', id);
    }
  }
  for (const [id, w] of nextById) {
    const before = prevById.get(id);
    if (!before || JSON.stringify(before) !== JSON.stringify(w)) noteKeyedChange('workouts', id);
    if (tombstones[id]) { delete tombstones[id]; tombstonesChanged = true; }
  }
  if (tombstonesChanged) saveWorkoutTombstones(tombstones);

  localStorage.setItem(KEY, JSON.stringify(kept));
  return kept;
}

export function addManualWorkout(list: ManualWorkout[], d: WorkoutDraft, at = Date.now()): ManualWorkout[] {
  const note = d.note?.trim().slice(0, MAX_NOTE_LENGTH);
  const w: ManualWorkout = { id: newId(at), type: cleanType(d.type), minutes: Math.round(d.minutes), day: d.day, at, ...(note ? { note } : {}) };
  return saveManualWorkouts([w, ...list]);
}

export function updateManualWorkout(list: ManualWorkout[], id: string, d: WorkoutDraft, at = Date.now()): ManualWorkout[] {
  const note = d.note?.trim().slice(0, MAX_NOTE_LENGTH);
  return saveManualWorkouts(list.map(w => {
    if (w.id !== id) return w;
    const next: ManualWorkout = { id: w.id, type: cleanType(d.type), minutes: Math.round(d.minutes), day: d.day, at };
    return note ? { ...next, note } : next;
  }));
}

export function removeManualWorkout(list: ManualWorkout[], id: string): ManualWorkout[] {
  return saveManualWorkouts(list.filter(w => w.id !== id));
}

/** Hand-added workouts on one day, latest first. */
export const manualOnDay = (list: ManualWorkout[], day: string) => list.filter(w => w.day === day);

/** Hand-added workouts in the last `days` days (today included), newest first. */
export function manualWithinDays(list: ManualWorkout[], days: number, today = localDayKey()): ManualWorkout[] {
  const oldest = localDayKeyDaysAgo(days - 1, dayDate(today));
  return list.filter(w => w.day >= oldest && w.day <= today);
}

/**
 * The old profile.workoutsLogged strings: "Run · 30 min (28/09/2026)" or "Evening run (28/09/2026)" (no duration:
 * kept as 30 min, the old default). Unreadable ones are skipped. Times are spread 1 ms apart to keep their order.
 */
export function fromLegacy(entries: string[]): ManualWorkout[] {
  const out: ManualWorkout[] = [];
  entries.forEach((entry, i) => {
    const m = typeof entry === 'string' ? entry.match(/^(.*) \((\d{2})\/(\d{2})\/(\d{4})\)$/) : null;
    if (!m) return;
    const date = new Date(Number(m[4]), Number(m[3]) - 1, Number(m[2]), 12);
    if (Number.isNaN(date.getTime())) return;
    const [label, duration] = m[1].split(' · ');
    const mins = duration?.match(/^(\d+) min$/);
    const type = cleanType(label);
    if (!type) return;
    const at = date.getTime() + i;
    out.push({ id: newId(at), type, minutes: mins ? Math.min(MAX_WORKOUT_ENTRY, Math.max(1, Number(mins[1]))) : 30, day: localDayKey(date), at });
  });
  return out;
}
