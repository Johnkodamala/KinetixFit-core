import { describe, expect, it } from 'vitest';
import { caloriesToday, distanceLabel, distanceText, heartDay, latestBucket, latestReading, latestSample, toReading, vitalTiles, whenTaken } from './vitals';

const at = (iso: string) => ({ startDate: iso, endDate: iso });

describe('latestSample', () => {
  it('picks the newest reading whatever order the samples come in', () => {
    // Android: the oldest record's samples first, reversed — the old code took the first one
    const samples = [
      { value: 88, ...at('2026-09-28T08:10:00Z') },
      { value: 71, ...at('2026-09-28T14:05:00Z') },
      { value: 64, ...at('2026-09-28T02:00:00Z') },
    ];
    expect(latestSample(samples)?.value).toBe(71);
  });

  it('uses the end of a sample that spans time', () => {
    const samples = [
      { value: 1, startDate: '2026-09-28T09:00:00Z', endDate: '2026-09-28T10:00:00Z' },
      { value: 2, startDate: '2026-09-28T09:30:00Z', endDate: '2026-09-28T09:45:00Z' },
    ];
    expect(latestSample(samples)?.value).toBe(1);
  });

  it('is null for nothing, and skips broken samples', () => {
    expect(latestSample([])).toBeNull();
    expect(latestSample([{ value: NaN, ...at('2026-09-28T10:00:00Z') }])).toBeNull();
    expect(latestSample([{ value: 70, startDate: 'x', endDate: 'y' }])).toBeNull();
  });
});

describe('toReading', () => {
  it('turns Apple Health fractions into percentages', () => {
    expect(toReading({ value: 0.97, ...at('2026-09-28T03:00:00Z') }, 'oxygenSaturation').value).toBeCloseTo(97);
    expect(toReading({ value: 0.215, ...at('2026-09-28T03:00:00Z') }, 'bodyFat').value).toBeCloseTo(21.5);
    expect(toReading({ value: 96, ...at('2026-09-28T03:00:00Z') }, 'oxygenSaturation').value).toBe(96);
    expect(toReading({ value: 0.9, ...at('2026-09-28T03:00:00Z') }, 'weight').value).toBe(0.9);
  });

  it('keeps both blood pressure numbers', () => {
    const r = toReading({ value: 118, systolic: 118, diastolic: 76, ...at('2026-09-28T08:00:00Z') }, 'bloodPressure');
    expect([r.systolic, r.diastolic]).toEqual([118, 76]);
    expect(latestReading([], 'bloodPressure')).toBeNull();
  });
});

describe('latestBucket and heartDay', () => {
  it('finds the newest hour with readings', () => {
    const hours = [
      { startDate: '2026-09-28T10:00:00Z', endDate: '2026-09-28T11:00:00Z', value: 72 },
      { startDate: '2026-09-28T12:00:00Z', endDate: '2026-09-28T13:00:00Z', value: 0 },
      { startDate: '2026-09-28T11:00:00Z', endDate: '2026-09-28T12:00:00Z', value: 80 },
    ];
    expect(latestBucket(hours)?.value).toBe(80);
    expect(latestBucket([])).toBeNull();
  });

  it('reads today’s average, lowest and highest', () => {
    expect(heartDay({ value: 76.4, values: { average: 76.4, min: 54, max: 131 } })).toEqual({ avg: 76, min: 54, max: 131 });
    expect(heartDay({ value: 0, values: {} })).toBeNull();
    expect(heartDay(undefined)).toBeNull();
  });
});

describe('caloriesToday', () => {
  const dayStart = new Date(2026, 8, 28).getTime();
  const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m).toISOString();
  const now = new Date(2026, 8, 28, 22, 0).getTime();

  it('counts one app only, never two together', () => {
    const samples = [
      { value: 900, sourceId: 'com.fitbit.FitbitMobile', startDate: at(0), endDate: at(12) },
      { value: 800, sourceId: 'com.fitbit.FitbitMobile', startDate: at(12), endDate: at(22) },
      { value: 1400, sourceId: 'com.google.android.apps.fitness', startDate: at(0), endDate: at(22) },
    ];
    expect(caloriesToday(samples, dayStart, now)).toEqual({ kcal: 1700, kind: 'total' });
    expect(caloriesToday([], dayStart, now)).toBeNull();
  });

  it('knows Samsung Health’s records are its workouts, not the whole day', () => {
    // 28 Sep on the A55: a walk, a treadmill run and another walk — 525 kcal
    const samsung = [
      { value: 98, sourceId: 'com.sec.android.app.shealth', startDate: at(15, 15), endDate: at(15, 35) },
      { value: 349, sourceId: 'com.sec.android.app.shealth', startDate: at(19, 49), endDate: at(20, 34) },
      { value: 78, sourceId: 'com.sec.android.app.shealth', startDate: at(21, 1), endDate: at(21, 16) },
    ];
    expect(caloriesToday(samsung, dayStart, now)).toEqual({ kcal: 525, kind: 'workouts' });
  });
});

describe('whenTaken', () => {
  const now = new Date(2026, 8, 28, 15, 0).getTime();
  it('says when in plain words, with clock times today', () => {
    expect(whenTaken(now - 30_000, now)).toBe('at 14:59');
    expect(whenTaken(new Date(2026, 8, 28, 9, 5).getTime(), now)).toBe('at 09:05');
    expect(whenTaken(new Date(2026, 8, 27, 22, 0).getTime(), now)).toBe('yesterday');
    expect(whenTaken(new Date(2026, 8, 25, 8, 0).getTime(), now)).toBe('Fri');
    expect(whenTaken(new Date(2026, 8, 3, 8, 0).getTime(), now)).toBe('3 Sept');
  });
});

describe('vitalTiles', () => {
  const now = new Date(2026, 8, 28, 15, 0).getTime();
  const r = (value: number, extra = {}) => ({ value, at: now - 3_600_000, ...extra });

  it('shows only the readings there are, in order, with typical ranges', () => {
    const tiles = vitalTiles({ weight: r(72.44), oxygenSaturation: r(96.6), restingHeartRate: null }, { units: 'metric', heightCm: 175, now });
    expect(tiles.map(t => t.id)).toEqual(['oxygenSaturation', 'weight']);
    expect(tiles[0]).toMatchObject({ label: 'Blood oxygen', value: '97', unit: '%', note: 'Usually 95% or more', when: 'at 14:00' });
    expect(tiles[1]).toMatchObject({ value: '72.4', unit: 'kg', note: 'BMI 23.7' });
  });

  it('writes blood pressure as two numbers, and weight in pounds for the US', () => {
    const tiles = vitalTiles({ bloodPressure: r(121, { systolic: 121, diastolic: 79 }), weight: r(80) }, { units: 'us', now });
    expect(tiles[0]).toMatchObject({ value: '121/79', unit: 'mmHg' });
    expect(tiles[1]).toMatchObject({ value: '176.4', unit: 'lb' });
    expect(tiles[1].note).toBeUndefined();
  });

  it('is empty with no readings', () => {
    expect(vitalTiles({}, { units: 'metric', now })).toEqual([]);
  });
});

describe('distanceText', () => {
  it('uses the country’s unit', () => {
    expect(distanceText(4230, 'km')).toBe('4.2 km');
    expect(distanceText(4230, 'mi')).toBe('2.6 mi');
  });
});

// Health Connect's distance from Samsung Health covers only recorded workouts: on a day of about 14,000 steps it can be
// 3.1 km, which is two walks (0.9 km and 2.2 km). Beside the day's steps that reads as the whole day's distance and looks
// wrong, so it's labelled for what it is, the way calories already are.
describe('distanceLabel', () => {
  it('says Workout distance when the distance is far less than the day\'s steps cover (Samsung: workouts only)', () => {
    expect(distanceLabel(900 + 2200, 14200, 170)).toBe('Workout distance');
  });

  it('says Distance when the distance covers the day (Apple Health, Google Fit)', () => {
    // 14,200 steps at a 41.5 % of height stride is about 10 km
    expect(distanceLabel(10200, 14200, 170)).toBe('Distance');
  });

  it('says Distance for a short stride too: a whole day\'s distance is never judged a workout\'s', () => {
    // stride 30 % of height instead of 41.5 %: 7.2 km for the same steps, still well over half of the 10 km model
    expect(distanceLabel(7200, 14200, 170)).toBe('Distance');
  });

  it('says Distance when the distance is more than the steps explain (cycling, a treadmill)', () => {
    expect(distanceLabel(20000, 3000, 170)).toBe('Distance');
  });

  it('only calls it workout distance below half of what the steps cover', () => {
    const covered = 10000 * 170 * 0.415 / 100; // 7,055 m for 10,000 steps
    expect(distanceLabel(covered * 0.49, 10000, 170)).toBe('Workout distance');
    expect(distanceLabel(covered * 0.5, 10000, 170)).toBe('Distance');
  });

  it('does not judge on a few steps, an unknown step count or an unknown height', () => {
    expect(distanceLabel(100, 300, 170)).toBe('Distance');
    expect(distanceLabel(3100, null, 170)).toBe('Distance');
    expect(distanceLabel(3100, 14200, 0)).toBe('Distance');
    expect(distanceLabel(3100, 14200, NaN)).toBe('Distance');
  });
});
