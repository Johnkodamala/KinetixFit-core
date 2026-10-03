// A durable, event-level record of health readings — new functionality (phase 10): today's Health
// Connect/HealthKit reads only ever land in React state and vanish, so there's no history to draw on
// for future trend/AI-insight work. This opportunistically persists every reading the app already
// fetches (readLatest/readLatestHeartRate in App.tsx) as its own event, never collapsing same-day
// readings of the same metric into one — a metric can be sampled many times a day (heart rate, steps).
// Local cache only keeps 90 days for on-device performance; the server (vitals_history table) keeps
// everything indefinitely, per the sync engine's usual rule.
import { readJson, writeJson } from './storage';
import { localDayKey } from './dates';
import { noteKeyedChange } from './sync';

export interface VitalReading {
  metric: string;
  value: number;
  source: string | null;
  recordedAt: number;
  day: string;
}

const KEY = 'kx_vitals_history';
const KEEP_DAYS = 90;

export function loadVitalReadings(): Record<string, VitalReading> {
  const saved = readJson<Record<string, VitalReading>>(KEY);
  return saved && typeof saved === 'object' ? saved : {};
}

function saveVitalReadings(records: Record<string, VitalReading>) {
  const oldest = localDayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  const kept = Object.fromEntries(Object.entries(records).filter(([, r]) => r.day >= oldest));
  writeJson(KEY, kept);
}

/** Adds the readings the account has that this phone doesn't. One this phone already holds stays as it is: for a day's
 * total the account's copy may be another phone's, and each phone writes its own back when it changes, so letting the
 * account's version win only made two phones keep replacing each other's numbers. The 90-day limit applies to what comes
 * down too, so a long history on the account never fills this phone's storage. */
export function addRemoteVitalReadings(remote: Record<string, VitalReading>): void {
  saveVitalReadings({ ...remote, ...loadVitalReadings() });
}

/** Call right after a fresh reading for a metric arrives. A no-op for a reading already recorded
 * (same metric + exact timestamp) — readLatest* is often re-run on foreground/resume with the same
 * newest sample. Never overwrites an existing event, so it's safe to call on every read. */
export function recordVitalReading(metric: string, value: number, recordedAt: number, source: string | null = null): void {
  const id = `${metric}:${recordedAt}`;
  const records = loadVitalReadings();
  if (records[id]) return;
  records[id] = { metric, value, source, recordedAt, day: localDayKey(new Date(recordedAt)) };
  saveVitalReadings(records);
  noteKeyedChange('vitals_history', id);
}

/** For a metric that's naturally a running total for the day (steps so far, minutes slept that
 * night, a day's average heart rate for the trend chart) rather than a single instant reading:
 * one record per day, overwritten as the day's figure changes — unlike recordVitalReading's
 * once-only events. Used to persist the 30-day trend arrays the app already reads live, so that
 * history exists on the server rather than only ever being read fresh from the device. */
export function recordDailyVitalTotal(metric: string, day: string, value: number, source: string | null = null): void {
  const id = `${metric}:${day}`;
  const recordedAt = new Date(`${day}T12:00:00`).getTime();
  const records = loadVitalReadings();
  if (records[id]?.value === value) return; // nothing changed since the last read
  records[id] = { metric, value, source, recordedAt, day };
  saveVitalReadings(records);
  noteKeyedChange('vitals_history', id);
}
