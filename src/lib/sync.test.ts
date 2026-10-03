import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const selectResult = { data: null as Record<string, unknown> | null, error: null as Error | null };
const selectManyResult = { data: null as Record<string, unknown>[] | null, error: null as Error | null };
const upsertResult = { data: null as Record<string, unknown> | null, error: null as Error | null };
const upsertCalls: Record<string, unknown>[] = [];
// When set to a table name, every upsert() against that table resolves with an error instead of null —
// lets a test force one domain's push to fail without affecting other domains still registered from
// earlier tests in this file (the singleton/keyed domain registries are module-level and never reset).
let failUpsertForTable: string | null = null;

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: () => getUser() },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => selectResult,
          then: (resolve: (r: typeof selectManyResult) => void) => resolve(selectManyResult),
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upsertCalls.push(row);
        const error = table === failUpsertForTable ? new Error(`upsert failed for ${table}`) : null;
        return {
          select: () => ({
            maybeSingle: async () => upsertResult,
          }),
          then: (resolve: (r: { error: Error | null }) => void) => resolve({ error }),
        };
      },
    }),
  },
}));

import {
  noteLocalChange, isDirty, localMtime, registerSingleton, pushSingleton, pullSingleton,
  syncAllOnLogin, flushOutbox, clearAllDomainData, type SingletonDomain,
  noteKeyedChange, registerKeyed, pushKeyed, pullKeyed, type KeyedDomain, unsyncedDomains, syncKeepingThisPhone,
  syncWithAccount, pullIfDue, pullOnLaunch, onAccountDataChanged, stableStringify,
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
  failUpsertForTable = null;
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

describe('unsyncedDomains: what a log out would throw away', () => {
  it('is empty once everything has been pushed', async () => {
    upsertResult.data = { updated_at: new Date().toISOString() };
    registerSingleton(makeDomain({ name: 'safe-thing', table: 'safe_things', load: () => ({ v: 'a' }) }));
    noteLocalChange('safe-thing');
    await flushOutbox();
    expect(unsyncedDomains()).not.toContain('safe-thing');
  });

  it('lists a domain whose push failed (offline, or the server said no)', async () => {
    registerSingleton(makeDomain({ name: 'failing-thing', table: 'failing_things', load: () => ({ v: 'a' }) }));
    noteLocalChange('failing-thing');
    upsertResult.error = new Error('offline');
    await flushOutbox();
    expect(unsyncedDomains()).toContain('failing-thing');
  });

  it('lists changes made while signed out of the session (no user to push as)', async () => {
    registerSingleton(makeDomain({ name: 'nouser-thing', table: 'nouser_things', load: () => ({ v: 'a' }) }));
    noteLocalChange('nouser-thing');
    getUser.mockResolvedValue({ data: { user: null } });
    await flushOutbox();
    expect(unsyncedDomains()).toContain('nouser-thing');
  });

  it('does not count a domain with nothing in it: there is nothing to lose', async () => {
    registerSingleton(makeDomain({ name: 'blank-thing', table: 'blank_things', load: () => null }));
    noteLocalChange('blank-thing');
    await flushOutbox();
    expect(unsyncedDomains()).not.toContain('blank-thing');
  });

  it('lists a keyed domain with a record that has not reached the server', async () => {
    registerKeyed(makeKeyedDomain({ name: 'keyed-unsynced', table: 'keyed_unsynced', load: () => ({ k1: { v: 'a' } }) }));
    noteKeyedChange('keyed-unsynced', 'k1');
    failUpsertForTable = 'keyed_unsynced';
    await flushOutbox();
    expect(unsyncedDomains()).toContain('keyed-unsynced');
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

describe('syncAllOnLogin — keyed-domain backfill', () => {
  beforeEach(() => {
    selectManyResult.data = [];
    selectManyResult.error = null;
  });

  it('does not mark a domain backfilled when its one-time push fails — a retry must run again next login', async () => {
    const domain = makeKeyedDomain({
      name: 'keyed-backfill-fail', table: 'keyed_backfill_fail_table', load: () => ({ a: { v: '1' } }),
    });
    registerKeyed(domain);
    failUpsertForTable = 'keyed_backfill_fail_table';

    await syncAllOnLogin();

    expect(upsertCalls.some(r => r.id === 'a')).toBe(true); // the push was attempted
    expect(localStorage.getItem('kx_sync_backfilled_keyed-backfill-fail')).not.toBe('1');
  });

  it('marks a domain backfilled once its one-time push succeeds', async () => {
    const domain = makeKeyedDomain({
      name: 'keyed-backfill-ok', table: 'keyed_backfill_ok_table', load: () => ({ a: { v: '1' } }),
    });
    registerKeyed(domain);

    await syncAllOnLogin();

    expect(upsertCalls.some(r => r.id === 'a')).toBe(true);
    expect(localStorage.getItem('kx_sync_backfilled_keyed-backfill-ok')).toBe('1');
  });
});

describe('records that failed their first upload are retried, and count as unsynced meanwhile', () => {
  beforeEach(() => {
    selectManyResult.data = [];
    selectManyResult.error = null;
  });

  it('flushOutbox sends a never-backfilled domain’s records, even ones not marked dirty, and then marks it backfilled', async () => {
    registerKeyed(makeKeyedDomain({ name: 'retry-first-upload', table: 'retry_first_upload', load: () => ({ old1: { v: 'a' }, old2: { v: 'b' } }) }));
    expect(unsyncedDomains()).toContain('retry-first-upload'); // has records the account may not have
    const before = upsertCalls.length;
    await flushOutbox();
    expect(upsertCalls.slice(before).filter(r => r.id === 'old1' || r.id === 'old2')).toHaveLength(2);
    expect(localStorage.getItem('kx_sync_backfilled_retry-first-upload')).toBe('1');
    expect(unsyncedDomains()).not.toContain('retry-first-upload');
  });

  it('stays unsynced while the retry keeps failing', async () => {
    registerKeyed(makeKeyedDomain({ name: 'retry-still-failing', table: 'retry_still_failing', load: () => ({ x: { v: 'a' } }) }));
    failUpsertForTable = 'retry_still_failing';
    await flushOutbox();
    expect(localStorage.getItem('kx_sync_backfilled_retry-still-failing')).not.toBe('1');
    expect(unsyncedDomains()).toContain('retry-still-failing');
  });

  it('does not count a domain with no records', () => {
    registerKeyed(makeKeyedDomain({ name: 'retry-empty', table: 'retry_empty', load: () => ({}) }));
    expect(unsyncedDomains()).not.toContain('retry-empty');
  });
});

describe('stableStringify: equal data compares equal whatever order its keys were built in', () => {
  it('ignores key order, at any depth', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(stableStringify({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });
  it('still tells different data apart (and keeps array order)', () => {
    expect(stableStringify({ a: [1, 2] })).not.toBe(stableStringify({ a: [2, 1] }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe('syncWithAccount: pull the account’s data and say whether anything here changed', () => {
  beforeEach(() => {
    selectManyResult.data = [];
    selectManyResult.error = null;
  });

  it('reports a change when the account had a record this phone lacked, then none the second time', async () => {
    registerKeyed(makeKeyedDomain({ name: 'pull-open-keyed', table: 'pull_open_keyed' }));
    selectManyResult.data = [{ id: 'from-other-phone', v: 'hello' }];
    const first = await syncWithAccount();
    expect(first.changed).toBe(true);
    const second = await syncWithAccount();
    expect(second.changed).toBe(false);
  });

  it('reports no change when the account has nothing new', async () => {
    selectManyResult.data = [];
    expect((await syncWithAccount()).changed).toBe(false);
  });
});

describe('pullIfDue: opening or returning to the app should not hammer the account', () => {
  it('pulls once, then not again within the gap', async () => {
    selectManyResult.data = [];
    expect(await pullIfDue(60_000, 1_000_000)).not.toBeNull();
    expect(await pullIfDue(60_000, 1_030_000)).toBeNull(); // 30 s later
    expect(await pullIfDue(60_000, 1_070_000)).not.toBeNull(); // 70 s later
  });
});

describe('pullOnLaunch: the account’s data is in before the app draws, but a slow network never holds the app up', () => {
  it('returns quickly when the pull is done', async () => {
    selectManyResult.data = [];
    await expect(pullOnLaunch(500)).resolves.toBeUndefined();
  });

  it('gives up waiting after the timeout, and announces the change if the pull finishes with news later', async () => {
    vi.useFakeTimers();
    try {
      let release: (v: unknown) => void = () => {};
      getUser.mockImplementation(() => new Promise(res => { release = res; })); // the network is stuck
      registerKeyed(makeKeyedDomain({ name: 'pull-late-keyed', table: 'pull_late_keyed' }));
      selectManyResult.data = [{ id: 'late-one', v: 'x' }];
      const heard = vi.fn();
      const stopListening = onAccountDataChanged(heard);
      const done = pullOnLaunch(1800);
      await vi.advanceTimersByTimeAsync(1800);
      await done; // resolved on the timeout, while the pull is still waiting
      expect(heard).not.toHaveBeenCalled();
      getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
      release({ data: { user: { id: USER_ID } } });
      await vi.advanceTimersByTimeAsync(50);
      await vi.runAllTimersAsync();
      expect(heard).toHaveBeenCalled();
      stopListening();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('syncKeepingThisPhone: a phone that held data the account never received', () => {
  beforeEach(() => {
    selectManyResult.data = [];
    selectManyResult.error = null;
  });

  it('sends this phone’s profile/settings even when the account’s copy is newer, and does not overwrite them', async () => {
    const saved: unknown[] = [];
    selectResult.data = { v: 'account-newer', updated_at: new Date(Date.now() + 100_000).toISOString() };
    upsertResult.data = { updated_at: new Date().toISOString() };
    registerSingleton(makeDomain({ name: 'keep-phone-thing', table: 'keep_phone_things', load: () => ({ v: 'phone-copy' }), save: v => { saved.push(v); } }));
    await syncKeepingThisPhone();
    expect(upsertCalls.some(r => r.v === 'phone-copy')).toBe(true);
    expect(saved).toEqual([]);
  });

  it('pushes this phone’s records before bringing the account’s down', async () => {
    const order: string[] = [];
    registerKeyed(makeKeyedDomain({
      name: 'keep-phone-keyed', table: 'keep_phone_keyed', load: () => ({ a: { v: '1' } }),
      save: () => { order.push('pulled'); },
    }));
    const before = upsertCalls.length;
    await syncKeepingThisPhone();
    expect(upsertCalls.slice(before).some(r => r.id === 'a')).toBe(true);
    expect(localStorage.getItem('kx_sync_backfilled_keep-phone-keyed')).toBe('1');
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
