import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const selectResult = { data: null as Record<string, unknown> | null, error: null as Error | null };
const selectManyResult = { data: null as Record<string, unknown>[] | null, error: null as Error | null };
const upsertResult = { data: null as Record<string, unknown> | null, error: null as Error | null };
const upsertCalls: Record<string, unknown>[] = [];

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: () => getUser() },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => selectResult,
          then: (resolve: (r: typeof selectManyResult) => void) => resolve(selectManyResult),
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upsertCalls.push(row);
        return {
          select: () => ({
            maybeSingle: async () => upsertResult,
          }),
          then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
        };
      },
    }),
  },
}));

import {
  noteLocalChange, isDirty, localMtime, registerSingleton, pushSingleton, pullSingleton,
  syncAllOnLogin, flushOutbox, clearAllDomainData, type SingletonDomain,
  noteKeyedChange, registerKeyed, pushKeyed, pullKeyed, type KeyedDomain,
} from './sync';

const USER_ID = 'user-1';

function makeDomain(overrides: Partial<SingletonDomain<{ v: string } | null>> = {}): SingletonDomain<{ v: string } | null> {
  let value: { v: string } | null = null;
  return {
    name: 'thing',
    table: 'things',
    load: () => value,
    save: (v) => { value = v; },
    isEmpty: (v) => !v,
    toRemote: (v, userId) => ({ user_id: userId, v: v?.v }),
    fromRemote: (row) => ({ v: row.v as string }),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  selectResult.data = null;
  selectResult.error = null;
  upsertResult.data = null;
  upsertResult.error = null;
  upsertCalls.length = 0;
});

describe('outbox bookkeeping', () => {
  it('marks a domain dirty and stamps a local mtime', () => {
    expect(isDirty('thing')).toBe(false);
    expect(localMtime('thing')).toBe(0);
    noteLocalChange('thing');
    expect(isDirty('thing')).toBe(true);
    expect(localMtime('thing')).toBeGreaterThan(0);
  });
});

describe('pushSingleton', () => {
  it('does nothing without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const domain = makeDomain({ load: () => ({ v: 'x' }) });
    const pushed = await pushSingleton(domain);
    expect(pushed).toBe(false);
    expect(upsertCalls).toHaveLength(0);
  });

  it('skips an empty local value — never pushes a blank row over a real one', async () => {
    const domain = makeDomain(); // load() returns null
    const pushed = await pushSingleton(domain);
    expect(pushed).toBe(false);
    expect(upsertCalls).toHaveLength(0);
  });

  it('upserts the local value and clears the dirty flag on success', async () => {
    noteLocalChange('thing');
    upsertResult.data = { updated_at: new Date().toISOString() };
    const domain = makeDomain({ load: () => ({ v: 'x' }) });
    const pushed = await pushSingleton(domain);
    expect(pushed).toBe(true);
    expect(upsertCalls).toEqual([{ user_id: USER_ID, v: 'x' }]);
    expect(isDirty('thing')).toBe(false);
  });
});

describe('pullSingleton — last-write-wins', () => {
  it('reports empty when the server has no row (first-run backfill signal)', async () => {
    selectResult.data = null;
    const domain = makeDomain();
    expect(await pullSingleton(domain)).toBe('empty');
  });

  it('applies the remote row when the local copy has never been edited', async () => {
    selectResult.data = { v: 'from-server', updated_at: new Date().toISOString() };
    let saved: { v: string } | null = null;
    const domain = makeDomain({ save: (v) => { saved = v; } });
    const result = await pullSingleton(domain);
    expect(result).toBe('applied');
    expect(saved).toEqual({ v: 'from-server' });
  });

  it('keeps the local copy when it was edited after the remote row — never silently overwritten by a stale pull', async () => {
    noteLocalChange('thing'); // stamps local mtime = now
    selectResult.data = { v: 'stale-server', updated_at: new Date(Date.now() - 100_000).toISOString() };
    let saved: { v: string } | null = null;
    const domain = makeDomain({ save: (v) => { saved = v; } });
    const result = await pullSingleton(domain);
    expect(result).toBe('local-newer');
    expect(saved).toBe(null);
  });
});

describe('syncAllOnLogin', () => {
  it('backfills: pushes local data straight up when the server has nothing for a domain', async () => {
    selectResult.data = null;
    upsertResult.data = { updated_at: new Date().toISOString() };
    const domain = makeDomain({ load: () => ({ v: 'local-only' }) });
    registerSingleton(domain);
    await syncAllOnLogin();
    expect(upsertCalls.some(r => r.v === 'local-only')).toBe(true);
  });

  it('pushes when the local copy is newer than what the server has (unflushed edits from before login)', async () => {
    noteLocalChange('newer-thing');
    selectResult.data = { v: 'server-old', updated_at: new Date(Date.now() - 100_000).toISOString() };
    upsertResult.data = { updated_at: new Date().toISOString() };
    const domain = makeDomain({ name: 'newer-thing', load: () => ({ v: 'local-new' }) });
    registerSingleton(domain);
    await syncAllOnLogin();
    expect(upsertCalls.some(r => r.v === 'local-new')).toBe(true);
  });
});

describe('flushOutbox', () => {
  it('only pushes domains marked dirty', async () => {
    upsertResult.data = { updated_at: new Date().toISOString() };
    const clean = makeDomain({ name: 'clean-thing', load: () => ({ v: 'clean' }) });
    const dirty = makeDomain({ name: 'dirty-thing', load: () => ({ v: 'dirty' }) });
    registerSingleton(clean);
    registerSingleton(dirty);
    noteLocalChange('dirty-thing');
    await flushOutbox();
    expect(upsertCalls.some(r => r.v === 'dirty')).toBe(true);
    expect(upsertCalls.some(r => r.v === 'clean')).toBe(false);
  });
});

function makeKeyedDomain(overrides: Partial<KeyedDomain<{ v: string }>> = {}): KeyedDomain<{ v: string }> {
  let records: Record<string, { v: string }> = {};
  return {
    name: 'keyedthing',
    table: 'keyedthings',
    load: () => records,
    save: (r) => { records = r; },
    toRemote: (key, value, userId) => ({ user_id: userId, id: key, v: value.v }),
    fromRemote: (row) => ({ key: row.id as string, value: { v: row.v as string } }),
    ...overrides,
  };
}

describe('keyed domains', () => {
  beforeEach(() => {
    selectManyResult.data = null;
    selectManyResult.error = null;
  });

  it('pushKeyed only pushes records noted dirty, then clears them', async () => {
    let records: Record<string, { v: string }> = { a: { v: '1' }, b: { v: '2' } };
    const domain = makeKeyedDomain({ load: () => records, save: (r) => { records = r; } });
    registerKeyed(domain);
    noteKeyedChange('keyedthing', 'a');
    await pushKeyed(domain);
    expect(upsertCalls.some(r => r.id === 'a')).toBe(true);
    expect(upsertCalls.some(r => r.id === 'b')).toBe(false);
    expect(isDirty('keyedthing')).toBe(false);
  });

  it('pullKeyed merges remote-only records into local without touching a locally-dirty key', async () => {
    let records: Record<string, { v: string }> = { local: { v: 'mine' }, edited: { v: 'old' } };
    const domain = makeKeyedDomain({ load: () => records, save: (r) => { records = r; } });
    noteKeyedChange('keyedthing2', 'edited');
    selectManyResult.data = [
      { id: 'edited', v: 'server-says-different' },
      { id: 'remote-only', v: 'from-server' },
    ];
    const domain2 = { ...domain, name: 'keyedthing2' };
    const result = await pullKeyed(domain2);
    expect(result).toBe('applied');
    expect(records.local).toEqual({ v: 'mine' });
    expect(records.edited).toEqual({ v: 'old' }); // locally-dirty key: not overwritten by the pull
    expect(records['remote-only']).toEqual({ v: 'from-server' });
  });

  it('pullKeyed reports empty when the server has no rows', async () => {
    selectManyResult.data = [];
    const domain = makeKeyedDomain({ name: 'keyedthing3' });
    expect(await pullKeyed(domain)).toBe('empty');
  });
});

describe('clearAllDomainData', () => {
  it('wipes every account-scoped key and the sync bookkeeping, keeping the account-identity marker', () => {
    localStorage.setItem('kinetix_profile', '{"name":"x"}');
    localStorage.setItem('kx_food_days', '{"2026-01-01":[]}');
    localStorage.setItem('kx_theme', 'dark');
    localStorage.setItem('kinetix_onboarded_email', 'a@b.com');
    noteLocalChange('profiles');

    clearAllDomainData();

    expect(localStorage.getItem('kinetix_profile')).toBeNull();
    expect(localStorage.getItem('kx_food_days')).toBeNull();
    expect(localStorage.getItem('kx_theme')).toBeNull();
    expect(localStorage.getItem('kx_sync_outbox')).toBeNull();
    expect(localStorage.getItem('kx_sync_mtime_profiles')).toBeNull();
    // account-identity marker survives so the same account skips onboarding on the next login
    expect(localStorage.getItem('kinetix_onboarded_email')).toBe('a@b.com');
  });

  it('wipes every domain-added tombstone/history cache too (found missing in real-device testing)', () => {
    for (const key of [
      'kx_vitals_history', 'kx_detected_workouts_history', 'kx_food_log_deleted',
      'kx_workouts_deleted', 'kx_periods_deleted', 'kx_water_deleted',
    ]) {
      localStorage.setItem(key, '{"x":1}');
    }
    clearAllDomainData();
    for (const key of [
      'kx_vitals_history', 'kx_detected_workouts_history', 'kx_food_log_deleted',
      'kx_workouts_deleted', 'kx_periods_deleted', 'kx_water_deleted',
    ]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });
});
