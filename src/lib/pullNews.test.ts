// "Updated from your account · Refresh" must appear when ANOTHER phone changed something, and never because of what this
// phone did itself. End to end: the real sync engine, the real domain adapters, and a fake account that answers the way
// Postgres does (types as PostgREST returns them, jsonb with its own key order, columns and NOT NULLs from
// supabase/migrations/0001_source_of_truth.sql), so a domain that doesn't come back identically shows up here.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
type Kind = 'text' | 'int' | 'num' | 'date' | 'ts' | 'json' | 'bool';
interface Spec { pk: string[]; cols: Record<string, Kind>; required: string[]; defaults: Row }

class PgError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const UID = 'user-1';
const ID = (extra: Record<string, Kind> = {}) => ({ user_id: 'text' as Kind, ...extra });
const TABLES: Record<string, Spec> = {
  profiles: {
    pk: ['user_id'], required: [], defaults: { personal_allergens: [], workouts_logged: [], onboarded: false },
    cols: ID({
      name: 'text', height: 'num', weight: 'num', target: 'text', personal_allergens: 'json', workouts_logged: 'json',
      smart_device_connected: 'text', wearable: 'text', sex: 'text', age: 'int', activity_level: 'text',
      last_period_start_date: 'date', average_cycle_length: 'int', region: 'text', country: 'text', diet: 'text',
      onboarded: 'bool', ob_step: 'int', updated_at: 'ts',
    }),
  },
  preferences: { pk: ['user_id'], required: [], defaults: { data: {} }, cols: ID({ data: 'json', updated_at: 'ts' }) },
  saved_foods: {
    pk: ['user_id', 'key'], required: ['key'], defaults: { data: {} },
    cols: ID({ key: 'text', per100g: 'json', units: 'json', density: 'num', uses: 'int', last_used: 'int', data: 'json', updated_at: 'ts' }),
  },
  food_log_entries: {
    pk: ['user_id', 'id'], required: ['id', 'day'], defaults: { data: {} },
    cols: ID({ id: 'text', day: 'date', per100g: 'json', extras: 'json', meal: 'json', amount_guess: 'bool', note: 'text', data: 'json', deleted_at: 'ts', updated_at: 'ts' }),
  },
  water_logs: {
    pk: ['user_id', 'id'], required: ['id', 'at', 'ml', 'day'], defaults: {},
    cols: ID({ id: 'text', at: 'int', ml: 'num', day: 'date', deleted_at: 'ts', updated_at: 'ts' }),
  },
  workouts: {
    pk: ['user_id', 'id'], required: ['id', 'source'], defaults: { data: {} },
    cols: ID({ id: 'text', source: 'text', data: 'json', deleted_at: 'ts', updated_at: 'ts' }),
  },
  gut_checks: { pk: ['user_id', 'day'], required: ['day'], defaults: { data: {} }, cols: ID({ day: 'date', data: 'json', updated_at: 'ts' }) },
  morning_checkins: { pk: ['user_id', 'day'], required: ['day'], defaults: { data: {} }, cols: ID({ day: 'date', data: 'json', updated_at: 'ts' }) },
  periods: { pk: ['user_id', 'day'], required: ['day'], defaults: {}, cols: ID({ day: 'date', deleted_at: 'ts', updated_at: 'ts' }) },
  vitals_history: {
    pk: ['user_id', 'id'], required: ['id', 'metric', 'value', 'recorded_at', 'day'], defaults: {},
    cols: ID({ id: 'text', metric: 'text', value: 'num', source: 'text', recorded_at: 'int', day: 'date', updated_at: 'ts' }),
  },
};

// jsonb keeps its keys shortest first, then in byte order, and drops anything undefined
function jsonbOrder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Row)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
      .map(([k, x]) => [k, jsonbOrder(x)]));
  }
  return v;
}

/** What Postgres stores for an upserted row, and what PostgREST hands back on the next select. */
function shape(table: string, input: Row, updatedAt?: string): Row {
  const spec = TABLES[table];
  for (const col of Object.keys(input)) {
    if (!(col in spec.cols)) throw new PgError('PGRST204', `Could not find the '${col}' column of '${table}' in the schema cache`);
  }
  const out: Row = {};
  for (const [col, kind] of Object.entries(spec.cols)) {
    let v = input[col];
    if (col === 'updated_at') v = updatedAt ?? new Date().toISOString();
    if (v === undefined) v = col in spec.defaults ? spec.defaults[col] : null;
    if (v === null) {
      if (col === 'user_id' || spec.required.includes(col)) throw new PgError('23502', `null value in column "${col}" of relation "${table}" violates not-null constraint`);
      out[col] = null;
      continue;
    }
    if (kind === 'int' || kind === 'num') {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n !== 'number' || Number.isNaN(n) || (kind === 'int' && !Number.isInteger(n))) throw new PgError('22P02', `invalid input syntax for type ${kind === 'int' ? 'bigint' : 'numeric'}: "${String(v)}"`);
      out[col] = n;
    } else if (kind === 'date') {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) throw new PgError('22007', `invalid input syntax for type date: "${String(v)}"`);
      out[col] = v.slice(0, 10);
    } else if (kind === 'ts') {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) throw new PgError('22007', `invalid input syntax for type timestamp: "${String(v)}"`);
      out[col] = d.toISOString().replace('Z', '+00:00');
    } else if (kind === 'json') {
      out[col] = jsonbOrder(JSON.parse(JSON.stringify(v)));
    } else if (kind === 'bool') {
      out[col] = Boolean(v);
    } else {
      out[col] = String(v);
    }
  }
  return out;
}

const account = {
  tables: new Map<string, Map<string, Row>>(),
  getUserCalls: 0,
  /** runs inside every getUser(): the moment "while the pull is running" */
  duringPull: null as null | ((call: number) => void),
  reset() { this.tables.clear(); this.getUserCalls = 0; this.duringPull = null; },
  rows(table: string): Row[] { return [...(this.tables.get(table)?.values() ?? [])]; },
  /** An upsert as the client sends it, or one a different phone made (`updatedAt` chooses the server's clock). */
  upsert(table: string, row: Row, updatedAt?: string): { row: Row | null; error: { code: string; message: string } | null } {
    try {
      const stored = shape(table, row, updatedAt);
      const key = TABLES[table].pk.map(c => String(stored[c])).join('|');
      if (!this.tables.has(table)) this.tables.set(table, new Map());
      this.tables.get(table)!.set(key, stored);
      return { row: stored, error: null };
    } catch (e) {
      if (e instanceof PgError) return { row: null, error: { code: e.code, message: e.message } };
      throw e;
    }
  },
  /** The same, but a failure is a bug in the test or in an adapter's toRemote. */
  put(table: string, row: Row, updatedAt?: string): Row {
    const r = this.upsert(table, row, updatedAt);
    if (r.error) throw new Error(`${table}: ${r.error.code} ${r.error.message}`);
    return r.row as Row;
  },
};

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getUser: async () => {
        account.getUserCalls++;
        account.duringPull?.(account.getUserCalls);
        return { data: { user: { id: UID } } };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: account.rows(table)[0] ?? null, error: null }),
          then: (resolve: (r: { data: Row[]; error: null }) => void) => resolve({ data: account.rows(table), error: null }),
        }),
      }),
      upsert: (row: Row) => {
        const r = account.upsert(table, row);
        return {
          select: () => ({ maybeSingle: async () => (r.error ? { data: null, error: r.error } : { data: { updated_at: r.row!.updated_at }, error: null }) }),
          then: (resolve: (r: { error: unknown }) => void) => resolve({ error: r.error }),
        };
      },
    }),
  },
}));

import './profileSync';
import './preferencesSync';
import './gutSync';
import './checkinsSync';
import './periodsSync';
import './waterSync';
import './savedFoodsSync';
import './foodLogSync';
import './workoutsSync';
import './vitalsHistorySync';
import { syncAllOnLogin, syncWithAccount, registeredKeyed, registeredSingleton, fingerprint } from './sync';
import { noteProfileChanged } from './profileSync';
import { setPref } from './preferencesSync';
import { saveGutCheck, loadGutChecks } from './gut';
import { saveCheckIn, loadCheckIns } from './checkins';
import { savePeriods, loadPeriods } from './cycle';
import { withDrinks, saveWaterLog, loadWaterLog } from './water';
import { saveFoods, loadFoods, saveFoodDays, loadFoodDays, ZERO, type SavedFood, type LogEntry } from './foodLog';
import { addManualWorkout, loadManualWorkouts, recordDetectedWorkouts } from './workouts';
import { recordDailyVitalTotal, recordVitalReading, loadVitalReadings } from './vitalsHistory';
import { localDayKey, localDayKeyDaysAgo } from './dates';

const today = () => localDayKey();
const keyed = (name: string) => {
  const d = registeredKeyed(name);
  if (!d) throw new Error(`domain not registered: ${name}`);
  return d;
};

const PROFILE = {
  name: 'Test Person', email: 'test@example.com', height: 170, weight: 65.5, target: 'Weight Loss', personalAllergens: ['peanut'],
  workoutsLogged: [], smartDeviceConnected: 'Apple Health', wearable: null, sex: 'female', age: 31, activityLevel: 'moderate',
  lastPeriodStartDate: null, averageCycleLength: 28, region: null, country: 'GB', diet: 'vegetarian',
};
const food = (over: Partial<SavedFood> = {}): SavedFood => ({
  key: 'name:test-snack-xyz', name: 'test snack xyz', per100g: { ...ZERO, kcal: 250, carbs: 45, protein: 9, fat: 3, fiber: 3 },
  units: [], uses: 1, lastUsed: Date.now(), gramsKnown: true, estimated: false, source: 'search', lastQty: 2, lastUnit: 'slice', ...over,
} as SavedFood);
const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'e1', foodKey: 'name:test-snack-xyz', name: 'test snack xyz', qty: 2, unit: 'slice', unitGrams: 36, eaten: 1,
  per100g: { ...ZERO, kcal: 250, carbs: 45, protein: 9, fat: 3, fiber: 3 }, gramsKnown: true, estimated: false, ...over,
} as LogEntry);

/** This phone has been used for a few days: something in every synced domain. */
function useThisPhone() {
  localStorage.setItem('kinetix_profile', JSON.stringify(PROFILE));
  noteProfileChanged();
  setPref('kx_theme', 'dark');
  setPref('kinetix_hydration_interval', '2');
  saveGutCheck(loadGutChecks(), localDayKeyDaysAgo(1), { feel: 4, symptoms: ['bloating'], at: Date.now() - 86_400_000 });
  saveCheckIn(loadCheckIns(), { sleepHours: 7, energy: 4, at: Date.now() });
  savePeriods([localDayKeyDaysAgo(10)]);
  saveWaterLog(withDrinks({}, [[Date.now() - 5000, 300], [Date.now() - 4000, 250]]));
  saveFoods({ [food().key]: food() });
  saveFoodDays({ [today()]: [entry({ id: 'seed-food-1' })] });
  addManualWorkout([], { type: 'Run', minutes: 30, day: today() }, Date.now() - 3000);
  recordDetectedWorkouts([{ id: 'hc-1', type: 'running', label: 'Run', start: Date.now() - 60_000, minutes: 25, kcal: 200, km: 4, source: 'Health Connect' } as never]);
  recordDailyVitalTotal('steps', today(), 1365);
  recordDailyVitalTotal('sleepMinutes', localDayKeyDaysAgo(1), 410);
  recordVitalReading('heartRate', 72, Date.now() - 10_000, 'Apple Watch');
}

const FUTURE = () => new Date(Date.now() + 60_000).toISOString();

beforeEach(async () => {
  account.reset();
  useThisPhone();
  await syncAllOnLogin(); // signing in: everything this phone has goes up to the account
  await syncAllOnLogin(); // the next launch: the "waiting to upload" marks of that first upload are cleared; from here on it is steady state
  account.getUserCalls = 0;
});

describe('pulling back what this phone itself uploaded', () => {
  it('reached the account in every domain (so the checks below mean something)', () => {
    for (const table of Object.keys(TABLES)) expect(account.rows(table).length, table).toBeGreaterThan(0);
  });

  it('is not news, however often it is repeated: every domain comes back from Postgres identical to what was sent', async () => {
    expect((await syncWithAccount()).changed).toBe(false);
    expect((await syncWithAccount()).changed).toBe(false);
  });

  it('gives a second phone exactly what the first one had', async () => {
    const names = ['saved_foods', 'food_log_entries', 'water_logs', 'workouts', 'gut_checks', 'morning_checkins', 'periods', 'vitals_history'];
    const first = Object.fromEntries(names.map(n => [n, fingerprint(keyed(n).load())]));
    localStorage.clear(); // a different phone, signing in
    expect((await syncWithAccount()).changed).toBe(true);
    for (const n of names) expect(fingerprint(keyed(n).load()), n).toBe(first[n]);
    expect(registeredSingleton('preferences')?.load()).toMatchObject({ kx_theme: 'dark', kinetix_hydration_interval: '2' });
    expect(registeredSingleton('profiles')?.load()).toMatchObject({ name: 'Test Person', age: 31, diet: 'vegetarian' });
  });
});

describe('what this phone writes itself while the pull is running is not news from the account', () => {
  it('a health reading from Apple Health / Health Connect', async () => {
    account.duringPull = call => {
      if (call === 3) {
        recordDailyVitalTotal('steps', today(), 4321);
        recordVitalReading('heartRate', 80, Date.now(), 'Apple Watch');
      }
    };
    expect((await syncWithAccount()).changed).toBe(false);
    expect(loadVitalReadings()[`steps:${today()}`].value).toBe(4321); // and the new total was not thrown away
  });

  it('a drink logged here (or picked up from a widget)', async () => {
    account.duringPull = call => { if (call === 2) saveWaterLog(withDrinks(loadWaterLog(), [[Date.now(), 100]])); };
    expect((await syncWithAccount()).changed).toBe(false);
  });

  it('a food, a check-in and a workout from this phone, in any order', async () => {
    account.duringPull = call => {
      if (call === 4) saveFoodDays({ ...loadFoodDays(), [today()]: [...loadFoodDays()[today()], entry({ id: 'logged-while-pulling' })] });
      if (call === 6) saveCheckIn(loadCheckIns(), { sleepHours: 6, energy: 3, at: Date.now() });
      if (call === 8) addManualWorkout(loadManualWorkouts(), { type: 'Yoga', minutes: 20, day: today() }, Date.now());
    };
    expect((await syncWithAccount()).changed).toBe(false);
  });
});

describe("another phone's step total", () => {
  const otherPhone = (id: string, day: string, value: number) => account.put('vitals_history', {
    user_id: UID, id, metric: id.split(':')[0], value, source: null, recorded_at: new Date(`${day}T12:00:00`).getTime(), day,
  });

  it("never replaces this phone's own total for the same day, and is not news", async () => {
    otherPhone(`steps:${today()}`, today(), 999);
    expect((await syncWithAccount()).changed).toBe(false);
    expect(loadVitalReadings()[`steps:${today()}`].value).toBe(1365);
  });

  it('still brings days this phone does not have (a new phone gets the history), without announcing it', async () => {
    const earlier = localDayKeyDaysAgo(2);
    otherPhone(`steps:${earlier}`, earlier, 800);
    expect((await syncWithAccount()).changed).toBe(false);
    expect(loadVitalReadings()[`steps:${earlier}`].value).toBe(800);
  });

  it('does not bring history older than the 90 days this phone keeps', async () => {
    const old = localDayKeyDaysAgo(200);
    otherPhone(`steps:${old}`, old, 700);
    await syncWithAccount();
    expect(loadVitalReadings()[`steps:${old}`]).toBeUndefined();
  });
});

describe('what another phone changed is news, once', () => {
  const cases: [string, () => void][] = [
    ['a glass of water', () => account.put('water_logs', keyed('water_logs').toRemote('1790000000123', { ml: 200, day: today(), deletedAt: null }, UID))],
    ['a food entry', () => account.put('food_log_entries', keyed('food_log_entries').toRemote('other-food', { day: today(), entry: entry({ id: 'other-food' }), deletedAt: null }, UID))],
    ['a saved food', () => account.put('saved_foods', keyed('saved_foods').toRemote('name:other-snack', food({ key: 'name:other-snack', name: 'other snack' }), UID))],
    ['a morning check-in', () => account.put('morning_checkins', keyed('morning_checkins').toRemote(localDayKeyDaysAgo(2), { sleepHours: 8, energy: 5, at: Date.now() - 2 * 86_400_000 }, UID))],
    ['a gut check', () => account.put('gut_checks', keyed('gut_checks').toRemote(localDayKeyDaysAgo(3), { feel: 2, symptoms: [], at: Date.now() - 3 * 86_400_000 }, UID))],
    ['a period day', () => account.put('periods', keyed('periods').toRemote(localDayKeyDaysAgo(40), { deletedAt: null }, UID))],
    ['a hand-added workout', () => account.put('workouts', keyed('workouts').toRemote('other-w', { kind: 'manual', manual: { id: 'other-w', type: 'Yoga', minutes: 20, day: today(), at: Date.now() }, detected: null, day: today(), deletedAt: null }, UID))],
    ['a drink deleted there', () => {
      const [id] = Object.keys(keyed('water_logs').load());
      account.put('water_logs', keyed('water_logs').toRemote(id, { ml: 300, day: today(), deletedAt: Date.now() }, UID));
    }],
  ];
  it.each(cases)('%s', async (_name, otherPhoneDoesIt) => {
    otherPhoneDoesIt();
    expect((await syncWithAccount()).changed).toBe(true);
    expect((await syncWithAccount()).changed).toBe(false); // announced once, not on every return to the app
  });

  it("a profile edit (newest copy wins)", async () => {
    const row = account.rows('profiles')[0];
    account.put('profiles', { ...row, name: 'Renamed Elsewhere' }, FUTURE());
    expect((await syncWithAccount()).changed).toBe(true);
    expect(registeredSingleton('profiles')?.load()).toMatchObject({ name: 'Renamed Elsewhere' });
    expect((await syncWithAccount()).changed).toBe(false);
  });

  it('a reminder setting', async () => {
    const row = account.rows('preferences')[0];
    account.put('preferences', { ...row, data: { ...(row.data as Row), kinetix_hydration_interval: '3' } }, FUTURE());
    expect((await syncWithAccount()).changed).toBe(true);
    expect(localStorage.getItem('kinetix_hydration_interval')).toBe('3');
  });

  it('news is still news when this phone also wrote something of its own while pulling', async () => {
    account.put('water_logs', keyed('water_logs').toRemote('1790000000999', { ml: 200, day: today(), deletedAt: null }, UID));
    account.duringPull = call => { if (call === 3) recordDailyVitalTotal('steps', today(), 5000); };
    expect((await syncWithAccount()).changed).toBe(true);
  });
});

describe('the days the tests use are real days', () => {
  it('(guards the fixtures: nothing was dropped as too old before it could be compared)', () => {
    expect(loadPeriods().length).toBe(1);
    expect(Object.keys(loadFoods()).length).toBe(1);
  });
});
