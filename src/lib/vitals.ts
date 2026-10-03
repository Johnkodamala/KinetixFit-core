// Health numbers from Health Connect / Apple Health beyond steps and sleep: the latest heart rate and when it was taken,
// today's heart-rate range, resting heart rate, blood oxygen, breathing rate, blood pressure, VO2 max, weight and body
// fat, plus distance and calories burned today. Pure helpers: App.tsx does the reads, and nothing here leaves the phone.
//
// - Watches don't stream to the phone. Samsung Health passes a Galaxy Watch's readings to Health Connect when it syncs,
//   and an Apple Watch's reach Apple Health in batches. The app used to show heart rate only while a reading was under
//   10 minutes old, so the card said "Waiting" nearly all day. Now it's the newest reading of the last day, with its time.
// - On Android the Health plugin reads records oldest first and stops at `limit` before sorting, so
//   `readSamples({ limit: 1, ascending: false })` returns the newest sample of the *oldest* record in the window. Read
//   the window whole and pick the newest here (latestSample). On iOS a newest-first limit-1 query is right.
// - Apple Health gives blood oxygen and body fat as fractions (0.97), Health Connect as percentages (97).
// - Typical ranges are information, never a diagnosis: resting heart rate 60 to 100 bpm (NHS, "How do I check my
//   pulse?"), blood pressure 90/60 to 120/80 ideal (NHS, "High blood pressure"), blood oxygen usually 95% or more (NHS,
//   "How to use a pulse oximeter"), breathing 12 to 20 times a minute at rest (the adult range in the Royal College of
//   Physicians' NEWS2 score).
import { fmtDate, fmtNumber, fmtTime } from './countries';
import { localDayKey, localDayKeyDaysAgo } from './dates';

/** The parts of a Health plugin sample these helpers use. */
export interface SampleLike {
  value: number;
  startDate: string;
  endDate: string;
  sourceId?: string;
  sourceName?: string;
  systolic?: number;
  diastolic?: number;
}

/** One reading: its value and when it was taken (ms). Blood pressure also has both numbers. */
export interface Reading {
  value: number;
  at: number;
  systolic?: number;
  diastolic?: number;
}

const takenAt = (s: SampleLike) => {
  const end = Date.parse(s.endDate);
  return Number.isFinite(end) ? end : Date.parse(s.startDate);
};

/** The newest sample by when it was taken, whatever order they came in; null when there are none. */
export function latestSample<T extends SampleLike>(samples: T[]): T | null {
  let best: T | null = null;
  for (const s of samples) {
    if (!Number.isFinite(s.value) || !Number.isFinite(takenAt(s))) continue;
    if (!best || takenAt(s) > takenAt(best)) best = s;
  }
  return best;
}

// Apple Health: 0.97 = 97 %
const PERCENT_TYPES = new Set(['oxygenSaturation', 'bodyFat']);

/** A sample as a reading, in the units the app shows (percentages as 0–100). */
export function toReading(s: SampleLike, dataType: string): Reading {
  const percent = PERCENT_TYPES.has(dataType) && s.value > 0 && s.value <= 1.5;
  return {
    value: percent ? s.value * 100 : s.value,
    at: takenAt(s),
    ...(s.systolic !== undefined && s.diastolic !== undefined ? { systolic: s.systolic, diastolic: s.diastolic } : {}),
  };
}

/** The newest reading in a set of samples, or null. */
export const latestReading = (samples: SampleLike[], dataType: string): Reading | null => {
  const s = latestSample(samples);
  return s ? toReading(s, dataType) : null;
};

/** The newest bucket that has a value (hourly heart-rate buckets narrow down where the latest reading is). */
export function latestBucket<T extends { startDate: string; endDate: string; value: number }>(buckets: T[]): T | null {
  let best: T | null = null;
  for (const b of buckets) {
    if (!(b.value > 0)) continue;
    if (!best || Date.parse(b.startDate) > Date.parse(best.startDate)) best = b;
  }
  return best;
}

/** Today's heart rate from a one-day aggregate with average, min and max. */
export interface HeartDay { avg: number; min: number; max: number; }
export function heartDay(bucket: { value: number; values?: Partial<Record<string, number>> } | undefined | null): HeartDay | null {
  if (!bucket) return null;
  const avg = bucket.values?.average ?? bucket.value;
  const min = bucket.values?.min;
  const max = bucket.values?.max;
  if (!(avg > 0) || !(min !== undefined && min > 0) || !(max !== undefined && max > 0)) return null;
  return { avg: Math.round(avg), min: Math.round(min), max: Math.round(max) };
}

/**
 * Calories burned today from Health Connect's total-calories records, counted from one app only (two apps writing the
 * same day would count twice; the app with the most is kept). Samsung Health writes these for its workouts only — the
 * records are the workouts, not the day — so records covering under half of the day so far count as workout calories.
 */
export function caloriesToday(samples: SampleLike[], dayStart: number, now: number): { kcal: number; kind: 'total' | 'workouts' } | null {
  const bySource = new Map<string, { kcal: number; ms: number }>();
  for (const s of samples) {
    if (!(s.value > 0)) continue;
    const key = s.sourceId || s.sourceName || '?';
    const from = Math.max(dayStart, Date.parse(s.startDate));
    const to = Math.min(now, Date.parse(s.endDate));
    const cur = bySource.get(key) ?? { kcal: 0, ms: 0 };
    cur.kcal += s.value;
    if (Number.isFinite(from) && Number.isFinite(to)) cur.ms += Math.max(0, to - from);
    bySource.set(key, cur);
  }
  if (bySource.size === 0) return null;
  const best = [...bySource.values()].sort((a, b) => b.kcal - a.kcal)[0];
  return { kcal: Math.round(best.kcal), kind: best.ms >= (now - dayStart) / 2 ? 'total' : 'workouts' };
}

/**
 * When a reading was taken: "at 14:05" today, then "yesterday", a weekday, or a date. Clock times rather than "25 min
 * ago", which would go stale on screen between reads.
 */
export function whenTaken(at: number, now = Date.now()): string {
  const day = localDayKey(new Date(at));
  const today = localDayKey(new Date(now));
  if (day === today) return `at ${fmtTime(new Date(at))}`;
  if (day === localDayKeyDaysAgo(1, new Date(now))) return 'yesterday';
  if (now - at < 6 * 86_400_000) return fmtDate(new Date(at), { weekday: 'short' });
  return fmtDate(new Date(at), { day: 'numeric', month: 'short' });
}

/* ----------------------------------------------------------------------------------------------- */
/* The Body and vitals card                                                                         */
/* ----------------------------------------------------------------------------------------------- */

export type VitalId = 'restingHeartRate' | 'oxygenSaturation' | 'respiratoryRate' | 'bloodPressure' | 'vo2Max' | 'weight' | 'bodyFat';

/** The Health plugin data type for each tile (the same names). */
export const VITAL_TYPES: VitalId[] = ['restingHeartRate', 'oxygenSaturation', 'respiratoryRate', 'bloodPressure', 'vo2Max', 'weight', 'bodyFat'];

export interface VitalTile {
  id: VitalId;
  label: string;
  value: string;
  unit: string;
  when: string;
  /** a typical range or what the number means */
  note?: string;
}

interface TileContext {
  units: 'metric' | 'us';
  /** for BMI next to weight */
  heightCm?: number | null;
  now?: number;
}

const one = (n: number) => fmtNumber(Math.round(n * 10) / 10, 1);

/** The tiles to show, in a fixed order, for the readings there are (none for a type with no reading). */
export function vitalTiles(readings: Partial<Record<VitalId, Reading | null>>, ctx: TileContext): VitalTile[] {
  const now = ctx.now ?? Date.now();
  const tiles: VitalTile[] = [];
  const add = (id: VitalId, label: string, value: string, unit: string, note?: string) => {
    const r = readings[id];
    if (r) tiles.push({ id, label, value, unit, when: whenTaken(r.at, now), ...(note ? { note } : {}) });
  };
  const r = readings;
  if (r.restingHeartRate) add('restingHeartRate', 'Resting heart rate', String(Math.round(r.restingHeartRate.value)), 'bpm', 'Usually 60 to 100 · lower when fitter');
  if (r.oxygenSaturation) add('oxygenSaturation', 'Blood oxygen', String(Math.round(r.oxygenSaturation.value)), '%', 'Usually 95% or more');
  if (r.respiratoryRate) add('respiratoryRate', 'Breathing rate', one(r.respiratoryRate.value), 'a min', 'Usually 12 to 20 at rest');
  if (r.bloodPressure?.systolic && r.bloodPressure.diastolic) {
    add('bloodPressure', 'Blood pressure', `${Math.round(r.bloodPressure.systolic)}/${Math.round(r.bloodPressure.diastolic)}`, 'mmHg', 'Ideal is 90/60 to 120/80');
  }
  if (r.vo2Max) add('vo2Max', 'VO₂ max', one(r.vo2Max.value), 'ml/kg/min', 'Cardio fitness · higher is fitter');
  if (r.weight) {
    const kg = r.weight.value;
    const bmi = ctx.heightCm ? kg / (ctx.heightCm / 100) ** 2 : null;
    add('weight', 'Weight', ctx.units === 'us' ? one(kg * 2.20462) : one(kg), ctx.units === 'us' ? 'lb' : 'kg',
      bmi && bmi > 10 && bmi < 80 ? `BMI ${one(bmi)}` : undefined);
  }
  if (r.bodyFat) add('bodyFat', 'Body fat', one(r.bodyFat.value), '%');
  return tiles;
}

/** Distance for the steps card: km, or miles where the country uses them. */
export const distanceText = (meters: number, unit: 'km' | 'mi') =>
  unit === 'mi' ? `${fmtNumber(meters / 1609.344, 1)} mi` : `${fmtNumber(meters / 1000, 1)} km`;

// A walking stride is about 41.5 % of a person's height (the onboarding's 10,000-step distance uses the same).
const STRIDE_OF_HEIGHT = 0.415;
// Fewer steps than this say too little about how much of the day a distance covers.
const MIN_STEPS_TO_JUDGE_DISTANCE = 500;

/**
 * What to call the day's distance on the steps card. Samsung Health writes distance to Health Connect only for recorded
 * workouts (a day of about 14,000 steps had 3.1 km: two walks), so next to the day's steps it would read as the whole day's
 * distance and look wrong; Apple Health and Google Fit count the whole day. Calories get the same treatment
 * (caloriesToday). A distance under half of what the day's steps cover at the person's stride can only be the workouts';
 * strides vary far less than that, so a whole day's distance is never mistaken for a workout's. With too few steps, or
 * no height, it isn't judged.
 */
export function distanceLabel(meters: number, steps: number | null, heightCm: number): 'Distance' | 'Workout distance' {
  if (steps === null || steps < MIN_STEPS_TO_JUDGE_DISTANCE || !(heightCm > 0)) return 'Distance';
  const coveredByStepsM = (steps * heightCm * STRIDE_OF_HEIGHT) / 100;
  return meters < coveredByStepsM * 0.5 ? 'Workout distance' : 'Distance';
}
