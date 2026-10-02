// Round-trip checks for the phase-4 keyed domain adapters: toRemote -> fromRemote must reproduce the
// exact local record, and save() must merge into (not replace) whatever else is stored locally.
import { describe, it, expect } from 'vitest';
import './gutSync';
import './checkinsSync';
import './periodsSync';
import './waterSync';
import './savedFoodsSync';
import './foodLogSync';
import './workoutsSync';
import './vitalsHistorySync';
import { recordVitalReading } from './vitalsHistory';
import { registeredKeyed } from './sync';
import { saveGutCheck, loadGutChecks } from './gut';
import { saveCheckIn, loadCheckIns } from './checkins';
import { savePeriods } from './cycle';
import { withDrinks, withoutDrink, saveWaterLog } from './water';
import { saveFoods, loadFoods, saveFoodDays, loadFoodDays, ZERO, type SavedFood, type LogEntry } from './foodLog';
import { addManualWorkout, removeManualWorkout, loadManualWorkouts, recordDetectedWorkouts, loadDetectedWorkoutHistory } from './workouts';
import { localDayKey } from './dates';

const domain = (name: string) => {
  const d = registeredKeyed(name);
  if (!d) throw new Error(`domain not registered: ${name}`);
  return d;
};

describe('gut_checks domain adapter', () => {
  it('round-trips through toRemote/fromRemote', () => {
    saveGutCheck(loadGutChecks(), '2026-09-29', { feel: 4, symptoms: ['bloating'], at: 1 });
    const d = domain('gut_checks');
    const local = d.load() as Record<string, unknown>;
    const value = local['2026-09-29'];
    const row = d.toRemote('2026-09-29', value, 'uid-1');
    const back = d.fromRemote(row as Record<string, unknown>);
    expect(back).toEqual({ key: '2026-09-29', value });
  });

  it('save() merges into existing local records instead of replacing them', () => {
    saveGutCheck(loadGutChecks(), '2026-09-28', { feel: 3, symptoms: [], at: 1 });
    const d = domain('gut_checks');
    d.save({ '2026-09-29': { feel: 5, symptoms: [], at: 2 } } as never);
    const all = loadGutChecks();
    expect(all['2026-09-28']).toBeTruthy();
    expect(all['2026-09-29']).toBeTruthy();
  });
});

describe('morning_checkins domain adapter', () => {
  it('round-trips through toRemote/fromRemote', () => {
    saveCheckIn(loadCheckIns(), { sleepHours: 7, energy: 4, at: Date.now() });
    const d = domain('morning_checkins');
    const local = d.load() as Record<string, unknown>;
    const [day, value] = Object.entries(local)[0];
    const row = d.toRemote(day, value, 'uid-1');
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: day, value });
  });
});

describe('periods domain adapter', () => {
  it('an active day maps to deletedAt: null and back', () => {
    savePeriods(['2026-09-10']);
    const d = domain('periods');
    const local = d.load() as Record<string, { deletedAt: number | null }>;
    expect(local['2026-09-10']).toEqual({ deletedAt: null });
    const row = d.toRemote('2026-09-10', local['2026-09-10'], 'uid-1');
    expect(row).toMatchObject({ user_id: 'uid-1', day: '2026-09-10', deleted_at: null });
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: '2026-09-10', value: { deletedAt: null } });
  });

  it('a tombstoned day maps to a deleted_at timestamp and back', () => {
    savePeriods(['2026-09-10']);
    savePeriods([]); // removed -> tombstoned
    const d = domain('periods');
    const local = d.load() as Record<string, { deletedAt: number | null }>;
    expect(local['2026-09-10'].deletedAt).toBeGreaterThan(0);
    const row = d.toRemote('2026-09-10', local['2026-09-10'], 'uid-1');
    expect(row.deleted_at).not.toBeNull();
    const back = d.fromRemote(row as Record<string, unknown>) as { key: string; value: { deletedAt: number | null } };
    expect(back.value.deletedAt).toBe(local['2026-09-10'].deletedAt);
  });
});

describe('water_logs domain adapter', () => {
  const t1 = Date.now() - 5000;
  const t2 = Date.now() - 6000;
  const t3 = Date.now() - 7000;
  const today = () => localDayKey(); // the phone's day, which is what the water log files a drink under (not the UTC date)

  it('an active drink maps to deletedAt: null and back', () => {
    saveWaterLog(withDrinks({}, [[t1, 300]]));
    const d = domain('water_logs');
    const local = d.load() as Record<string, { ml: number; day: string; deletedAt: number | null }>;
    expect(local[String(t1)]).toEqual({ ml: 300, day: today(), deletedAt: null });
    const row = d.toRemote(String(t1), local[String(t1)], 'uid-1');
    expect(row).toMatchObject({ user_id: 'uid-1', id: String(t1), at: t1, ml: 300, day: today(), deleted_at: null });
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: String(t1), value: local[String(t1)] });
  });

  it('a removed drink maps to a deleted_at timestamp, keeping its ml/day so the row stays valid', () => {
    const log = saveWaterLog(withDrinks({}, [[t2, 300]]));
    saveWaterLog(withoutDrink(log, t2));
    const d = domain('water_logs');
    const local = d.load() as Record<string, { ml: number; day: string; deletedAt: number | null }>;
    expect(local[String(t2)].deletedAt).toBeGreaterThan(0);
    const row = d.toRemote(String(t2), local[String(t2)], 'uid-1');
    expect(row).toMatchObject({ ml: 300, day: today() }); // still present, never null, on a tombstone row
    expect(row.deleted_at).not.toBeNull();
  });

  it('a drink whose time has a fraction (an iPhone widget reports one) still has a whole-number `at`: the server column is a bigint', () => {
    const fractional = 1790528200246.793;
    const d = domain('water_logs');
    const row = d.toRemote(String(fractional), { ml: 250, day: today(), deletedAt: null }, 'uid-1');
    expect(Number.isInteger(row.at)).toBe(true);
    expect(row.at).toBe(1790528200246);
    expect(row.id).toBe(String(fractional)); // the key stays as stored, so the drink is still the same one everywhere
  });

  it('new drinks are filed at a whole millisecond, whatever time they arrive with', () => {
    const log = withDrinks({}, [[1790528200246.793, 250]]);
    const times = Object.values(log).flat().map(e => (Array.isArray(e) ? e[0] : e));
    expect(times).toEqual([1790528200246]);
  });

  it("save() applies a remote delete for a drink this device hasn't touched", () => {
    saveWaterLog(withDrinks({}, [[t3, 300]]));
    const d = domain('water_logs');
    d.save({ [String(t3)]: { ml: 300, day: today(), deletedAt: Date.now() } } as never);
    const local = d.load() as Record<string, { ml: number; day: string; deletedAt: number | null }>;
    expect(local[String(t3)].deletedAt).toBeGreaterThan(0);
  });
});

// A name that isn't in the USDA table, so loadFoods()/loadFoodDays() never "repair" or drop it —
// this fixture is only exercising the sync adapter's mapping, not the lookup/plausibility logic.
const savedFood = (over: Partial<SavedFood> = {}): SavedFood => ({
  key: 'name:test-snack-xyz', name: 'test snack xyz', per100g: { ...ZERO, kcal: 250, carbs: 45, protein: 9, fat: 3, fiber: 3 },
  units: [], uses: 1, lastUsed: Date.now(),
  gramsKnown: true, estimated: false, source: 'search', lastQty: 2, lastUnit: 'slice',
  ...over,
} as SavedFood);

describe('saved_foods domain adapter', () => {
  it('round-trips through toRemote/fromRemote', () => {
    saveFoods({ [savedFood().key]: savedFood() });
    const d = domain('saved_foods');
    const local = d.load() as Record<string, SavedFood>;
    const food = local['name:test-snack-xyz'];
    const row = d.toRemote('name:test-snack-xyz', food, 'uid-1');
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: 'name:test-snack-xyz', value: food });
  });

  it("save() merges a remote-only food into what's already saved locally", () => {
    saveFoods({ 'name:test-snack-xyz': savedFood() });
    const d = domain('saved_foods');
    d.save({ 'name:test-snack-abc': savedFood({ key: 'name:test-snack-abc', name: 'test snack abc' }) } as never);
    const all = loadFoods();
    expect(all['name:test-snack-xyz']).toBeTruthy();
    expect(all['name:test-snack-abc']).toBeTruthy();
  });
});

const logEntry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'e1', foodKey: 'name:test-snack-xyz', name: 'test snack xyz', qty: 2, unit: 'slice', unitGrams: 36, eaten: 1,
  per100g: { ...ZERO, kcal: 250, carbs: 45, protein: 9, fat: 3, fiber: 3 }, gramsKnown: true, estimated: false,
  ...over,
} as LogEntry);

describe('food_log_entries domain adapter', () => {
  it('an active entry maps to deletedAt: null, entry: <the entry>, and back', () => {
    const day = '2026-09-29';
    saveFoodDays({ [day]: [logEntry({ id: 'active-1' })] });
    const d = domain('food_log_entries');
    const local = d.load() as Record<string, { day: string; entry: LogEntry | null; deletedAt: number | null }>;
    expect(local['active-1']).toEqual({ day, entry: logEntry({ id: 'active-1' }), deletedAt: null });
    const row = d.toRemote('active-1', local['active-1'], 'uid-1');
    expect(row).toMatchObject({ user_id: 'uid-1', id: 'active-1', day, deleted_at: null });
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: 'active-1', value: local['active-1'] });
  });

  it('a removed entry maps to deletedAt set, entry: null, and toRemote still satisfies the required day column', () => {
    const day = '2026-09-28';
    saveFoodDays({ [day]: [logEntry({ id: 'gone-1' })] });
    saveFoodDays({ [day]: [] });
    const d = domain('food_log_entries');
    const local = d.load() as Record<string, { day: string; entry: LogEntry | null; deletedAt: number | null }>;
    expect(local['gone-1']).toEqual({ day, entry: null, deletedAt: expect.any(Number) });
    const row = d.toRemote('gone-1', local['gone-1'], 'uid-1');
    expect(row).toMatchObject({ day, deleted_at: expect.any(String) });
  });

  it("save() applies a remote addition and a remote delete this device hasn't touched", () => {
    const day = '2026-09-27';
    saveFoodDays({ [day]: [logEntry({ id: 'mine' })] });
    const d = domain('food_log_entries');
    d.save({
      'remote-add': { day, entry: logEntry({ id: 'remote-add' }), deletedAt: null },
      'mine': { day, entry: null, deletedAt: Date.now() },
    } as never);
    const days = loadFoodDays();
    expect(days[day]?.some(e => e.id === 'remote-add')).toBe(true);
    expect(days[day]?.some(e => e.id === 'mine')).toBe(false);
  });
});

describe('workouts domain adapter', () => {
  it('an active hand-added workout maps to deletedAt: null and back', () => {
    const list = addManualWorkout([], { type: 'Run', minutes: 30, day: localDayKey() }, 1000);
    const w = list[0];
    const d = domain('workouts');
    const local = d.load() as Record<string, { kind: string; manual: typeof w | null; detected: unknown; day: string; deletedAt: number | null }>;
    expect(local[w.id]).toEqual({ kind: 'manual', manual: w, detected: null, day: w.day, deletedAt: null });
    const row = d.toRemote(w.id, local[w.id], 'uid-1');
    expect(row).toMatchObject({ user_id: 'uid-1', id: w.id, source: 'manual', deleted_at: null });
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: w.id, value: local[w.id] });
  });

  it('a removed workout maps to a deleted_at timestamp', () => {
    const list = addManualWorkout([], { type: 'Run', minutes: 30, day: localDayKey() }, 2000);
    const w = list[0];
    removeManualWorkout(list, w.id);
    const d = domain('workouts');
    const local = d.load() as Record<string, { deletedAt: number | null }>;
    expect(local[w.id].deletedAt).toBeGreaterThan(0);
    const row = d.toRemote(w.id, local[w.id], 'uid-1');
    expect(row.deleted_at).not.toBeNull();
  });

  it("save() applies a remote-only hand-added workout this device hasn't seen", () => {
    const d = domain('workouts');
    const remoteWorkout = { id: 'remote-w', type: 'Yoga', minutes: 20, day: localDayKey(), at: 5000 };
    d.save({ 'remote-w': { kind: 'manual', manual: remoteWorkout, detected: null, day: remoteWorkout.day, deletedAt: null } } as never);
    expect(loadManualWorkouts().some(w => w.id === 'remote-w')).toBe(true);
  });

  it('a detected (Health Connect/HealthKit) workout maps with source: detected, and back', () => {
    const detected = { id: 'hc-1', type: 'running', label: 'Run', start: Date.now() - 60_000, minutes: 25, kcal: 200, km: 4, source: 'Health Connect' };
    recordDetectedWorkouts([detected as never]);
    const d = domain('workouts');
    const local = d.load() as Record<string, { kind: string; manual: unknown; detected: typeof detected; day: string; deletedAt: number | null }>;
    expect(local['hc-1']).toMatchObject({ kind: 'detected', manual: null, detected });
    const row = d.toRemote('hc-1', local['hc-1'], 'uid-1');
    expect(row).toMatchObject({ user_id: 'uid-1', id: 'hc-1', source: 'detected', deleted_at: null });
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: 'hc-1', value: local['hc-1'] });
  });

  it("save() puts a remote-only detected workout into the history cache, never the hand-added list", () => {
    const d = domain('workouts');
    const remoteDetected = { id: 'remote-hc', type: 'cycling', label: 'Cycle', start: Date.now() - 60_000, minutes: 40, kcal: 300, km: 12, source: 'Garmin' };
    d.save({ 'remote-hc': { kind: 'detected', manual: null, detected: remoteDetected, day: localDayKey(), deletedAt: null } } as never);
    expect(loadManualWorkouts().some(w => w.id === 'remote-hc')).toBe(false);
    expect(loadDetectedWorkoutHistory()['remote-hc']).toEqual(remoteDetected);
  });
});

describe('vitals_history domain adapter', () => {
  it('round-trips through toRemote/fromRemote', () => {
    const t = Date.now() - 10_000;
    recordVitalReading('heartRate', 72, t, 'Apple Watch');
    const d = domain('vitals_history');
    const local = d.load() as Record<string, { metric: string; value: number; source: string | null; recordedAt: number; day: string }>;
    const rec = local[`heartRate:${t}`];
    expect(rec).toMatchObject({ metric: 'heartRate', value: 72, source: 'Apple Watch', recordedAt: t });
    const row = d.toRemote(`heartRate:${t}`, rec, 'uid-1');
    expect(row).toMatchObject({ user_id: 'uid-1', id: `heartRate:${t}`, metric: 'heartRate', value: 72, recorded_at: t });
    expect(d.fromRemote(row as Record<string, unknown>)).toEqual({ key: `heartRate:${t}`, value: rec });
  });
});
