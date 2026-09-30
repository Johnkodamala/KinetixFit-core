import { describe, expect, it } from 'vitest';
import { recordVitalReading, recordDailyVitalTotal, loadVitalReadings } from './vitalsHistory';
import { isDirty } from './sync';

describe('vitals history', () => {
  it('records a reading as its own event, keyed by metric + exact timestamp', () => {
    const t = Date.now() - 10_000;
    recordVitalReading('heartRate', 72, t);
    const all = loadVitalReadings();
    expect(all[`heartRate:${t}`]).toMatchObject({ metric: 'heartRate', value: 72, recordedAt: t });
    expect(isDirty('vitals_history')).toBe(true);
  });

  it('never collapses two same-day readings of the same metric — each recorded_at is its own event', () => {
    const t1 = Date.now() - 20_000;
    const t2 = t1 + 3600_000; // an hour later, same day
    recordVitalReading('heartRate', 65, t1);
    recordVitalReading('heartRate', 80, t2);
    const all = loadVitalReadings();
    expect(all[`heartRate:${t1}`].value).toBe(65);
    expect(all[`heartRate:${t2}`].value).toBe(80);
  });

  it('is a no-op for a reading already recorded (same metric + exact timestamp)', () => {
    const t = Date.now() - 30_000;
    recordVitalReading('steps', 100, t);
    recordVitalReading('steps', 999, t); // re-run of the same read: must not overwrite
    expect(loadVitalReadings()[`steps:${t}`].value).toBe(100);
  });
});

describe('daily vital totals (steps, sleep, day-averages)', () => {
  it('upserts a day’s running total — unlike recordVitalReading, a later call for the same day overwrites', () => {
    const day = '2026-09-30';
    recordDailyVitalTotal('steps', day, 3000);
    recordDailyVitalTotal('steps', day, 8500); // later in the day: the total has grown
    expect(loadVitalReadings()[`steps:${day}`].value).toBe(8500);
    expect(isDirty('vitals_history')).toBe(true);
  });

  it('is a no-op when the value has not changed since the last read', () => {
    const day = '2026-09-29';
    recordDailyVitalTotal('sleepMinutes', day, 420);
    recordDailyVitalTotal('sleepMinutes', day, 420);
    expect(loadVitalReadings()[`sleepMinutes:${day}`].value).toBe(420);
  });
});
