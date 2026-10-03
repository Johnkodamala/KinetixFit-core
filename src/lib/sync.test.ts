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
// Runs while an upload is in flight (after the row was built, before the answer): the phone keeps being used during a
// flush that takes seconds on a mobile connection, so a test can make an edit "at that moment".
let onUpsert: ((table: string, row: Record<string, unknown>) => void) | null = null;
let selectCalls = 0; // how many times the account was read

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: () => getUser() },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { selectCalls++; return selectResult; },
          then: (resolve: (r: typeof selectManyResult) => void) => { selectCalls++; resolve(selectManyResult); },
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upsertCalls.push(row);
        onUpsert?.(table, row);
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
  syncWithAccount, pullIfDue, pullOnLaunch, onAccountDataChanged, fingerprint, syncOnAppState, cancelFlushRetry,
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
  onUpsert = null;
  selectCalls = 0;
  cancelFlushRetry(); // a failed flush in an earlier test must not fire in a later one
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

describe('fingerprint: what a person would see of some data', () => {
  it('ignores key order, at any depth', () => {
    expect(fingerprint({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: 3 } })).toBe(fingerprint({ a: { c: 3, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });

  it('counts a key holding null as a missing key: the account says null where this phone never stored the field', () => {
    expect(fingerprint({ a: 1, note: null })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: { b: null, c: 2 } })).toBe(fingerprint({ a: { c: 2 } }));
  });

  it('still tells real differences apart: array order, 0, an empty string and false are values, and an array that gains a null is longer', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint({ a: [1, 2] })).not.toBe(fingerprint({ a: [2, 1] }));
    expect(fingerprint({ a: 0 })).not.toBe(fingerprint({}));
    expect(fingerprint({ a: '' })).not.toBe(fingerprint({}));
    expect(fingerprint({ a: false })).not.toBe(fingerprint({}));
    expect(fingerprint({ a: [1] })).not.toBe(fingerprint({ a: [1, null] }));
  });
});

describe('syncAllOnLogin says which domains the account changed (only what the pull itself wrote counts)', () => {
  beforeEach(() => {
    selectManyResult.data = [];
    selectManyResult.error = null;
  });
  const told = async () => {
    const names: string[] = [];
    await syncAllOnLogin(name => names.push(name));
    return names;
  };

  it('names a keyed domain that got a record from the account, and not one whose record came back the same', async () => {
    let news: Record<string, { v: string }> = {};
    let same: Record<string, { v: string }> = { r1: { v: 'x' } };
    registerKeyed(makeKeyedDomain({ name: 'told-news', table: 'told_news', load: () => news, save: r => { news = r; } }));
    registerKeyed(makeKeyedDomain({ name: 'told-same', table: 'told_same', load: () => same, save: r => { same = r; } }));
    selectManyResult.data = [{ id: 'r1', v: 'x' }]; // both domains see this row: new to one, already held by the other
    const names = await told();
    expect(names).toContain('told-news');
    expect(names).not.toContain('told-same');
  });

  it('does not count something the app wrote itself while the pull was running', async () => {
    let own: Record<string, { v: string }> = {};
    let control: Record<string, { v: string }> = {};
    registerKeyed(makeKeyedDomain({ name: 'told-own', table: 'told_own', load: () => own, save: r => { own = r; } }));
    registerKeyed(makeKeyedDomain({ name: 'told-control', table: 'told_control', load: () => control, save: r => { control = r; } }));
    // the account holds a record that this phone also logs for itself, partway through the pull (here: while the account
    // is being asked who this is), so by the time the account's copy is applied it is nothing new to this phone
    selectManyResult.data = [{ id: 'mine', v: 'logged here' }];
    getUser.mockImplementation(async () => {
      own = { ...own, mine: { v: 'logged here' } };
      return { data: { user: { id: USER_ID } } };
    });
    const names = await told();
    expect(names).toContain('told-control'); // the record is news to a phone that did not have it...
    expect(names).not.toContain('told-own'); // ...but not to the one that wrote it itself while pulling
  });

  it('does not count a record that differs only by a field holding null', async () => {
    let records: Record<string, { v: string; note?: string | null }> = { k1: { v: 'same' } };
    registerKeyed({
      name: 'told-null', table: 'told_null', load: () => records, save: r => { records = r; },
      toRemote: (key, value, userId) => ({ user_id: userId, id: key, v: value.v }),
      fromRemote: row => ({ key: row.id as string, value: { v: row.v as string, note: (row.note as string | null) ?? null } }),
    });
    let control: Record<string, { v: string }> = {};
    registerKeyed(makeKeyedDomain({ name: 'told-null-control', table: 'told_null_control', load: () => control, save: r => { control = r; } }));
    selectManyResult.data = [{ id: 'k1', v: 'same', note: null }];
    const names = await told();
    expect(names).toContain('told-null-control'); // a record that really is new is reported...
    expect(names).not.toContain('told-null'); // ...one that differs only by a null is not
    expect(records.k1).toEqual({ v: 'same', note: null }); // it was still written; it just isn't news
  });

  it('writes a quiet domain’s records from the account without announcing them', async () => {
    let records: Record<string, { v: string }> = {};
    let loud: Record<string, { v: string }> = {};
    registerKeyed({ ...makeKeyedDomain({ name: 'told-quiet', table: 'told_quiet', load: () => records, save: r => { records = r; } }), quiet: true });
    registerKeyed(makeKeyedDomain({ name: 'told-loud', table: 'told_loud', load: () => loud, save: r => { loud = r; } }));
    selectManyResult.data = [{ id: 'q1', v: 'from the account' }];
    const names = await told();
    expect(records.q1).toEqual({ v: 'from the account' }); // the records still arrive
    expect(names).toContain('told-loud'); // the same record is news to an ordinary domain...
    expect(names).not.toContain('told-quiet'); // ...and not to a quiet one
  });

  it('names a singleton when the account’s copy is different, and not when it came back the same', async () => {
    let value: { v: string } | null = { v: 'same' };
    registerSingleton(makeDomain({ name: 'told-singleton', table: 'told_singleton', load: () => value, save: v => { value = v; } }));
    selectResult.data = { v: 'same', updated_at: new Date(Date.now() + 1_000).toISOString() };
    expect(await told()).not.toContain('told-singleton');
    selectResult.data = { v: 'changed elsewhere', updated_at: new Date(Date.now() + 2_000).toISOString() };
    expect(await told()).toContain('told-singleton');
    expect(value).toEqual({ v: 'changed elsewhere' });
  });
});

describe('a step that is given the account’s id does not ask for it again', () => {
  beforeEach(() => {
    selectManyResult.data = [];
    selectManyResult.error = null;
  });

  it('pull and push, singleton and keyed', async () => {
    const single = makeDomain({ name: 'known-uid-singleton', table: 'known_uid_singleton', load: () => ({ v: 'x' }) });
    const keyedDomain = makeKeyedDomain({ name: 'known-uid-keyed', table: 'known_uid_keyed', load: () => ({ a: { v: '1' } }) });
    noteKeyedChange('known-uid-keyed', 'a');
    getUser.mockClear();
    await pullSingleton(single, undefined, USER_ID);
    await pushSingleton(single, USER_ID);
    await pullKeyed(keyedDomain, undefined, USER_ID);
    await pushKeyed(keyedDomain, USER_ID);
    expect(getUser).not.toHaveBeenCalled();
    expect(upsertCalls.some(r => r.user_id === USER_ID && r.id === 'a')).toBe(true); // and what it sent is stamped with that id
  });

  it('a whole sync asks once', async () => {
    registerKeyed(makeKeyedDomain({ name: 'known-uid-sync', table: 'known_uid_sync', load: () => ({ a: { v: '1' } }) }));
    getUser.mockClear();
    await syncAllOnLogin();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('and stops there when nobody is signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const before = upsertCalls.length;
    await syncAllOnLogin();
    await syncKeepingThisPhone();
    expect(upsertCalls.length).toBe(before);
    expect(getUser).toHaveBeenCalledTimes(2); // once per sync
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

describe('an edit made while an upload is in flight is not forgotten', () => {
  // A flush takes seconds on a phone connection and the app keeps working meanwhile: a drink from the widget, a food
  // logged, a profile change. The push used to write back its own copy of "what is waiting" when it finished, so the
  // new edit's mark vanished: it never went up, and a later pull could put the account's older copy back over it.

  it('a record added during the push stays queued and goes up on the next flush', async () => {
    let records: Record<string, { v: string }> = { a: { v: '1' } };
    const domain = makeKeyedDomain({ name: 'race-add', table: 'race_add', load: () => records, save: r => { records = r; } });
    noteKeyedChange('race-add', 'a');
    onUpsert = (_table, row) => {
      if (row.id !== 'a') return;
      records = { ...records, b: { v: '2' } };
      noteKeyedChange('race-add', 'b');
    };
    await pushKeyed(domain);
    onUpsert = null;
    expect(isDirty('race-add')).toBe(true);
    registerKeyed(domain);
    expect(unsyncedDomains()).toContain('race-add');
    upsertCalls.length = 0;
    await pushKeyed(domain);
    expect(upsertCalls.map(r => r.id)).toEqual(['b']);
    expect(isDirty('race-add')).toBe(false);
  });

  it('the same record edited during its own push is sent again, and a pull in between does not put the older copy back', async () => {
    let records: Record<string, { v: string }> = { a: { v: 'first' } };
    const domain = makeKeyedDomain({ name: 'race-edit', table: 'race_edit', load: () => records, save: r => { records = r; } });
    noteKeyedChange('race-edit', 'a');
    onUpsert = () => { records = { a: { v: 'second' } }; noteKeyedChange('race-edit', 'a'); };
    await pushKeyed(domain);
    onUpsert = null;
    expect(isDirty('race-edit')).toBe(true);
    selectManyResult.data = [{ id: 'a', v: 'first' }]; // the account holds what was sent first
    await pullKeyed(domain);
    expect(records.a).toEqual({ v: 'second' });
    upsertCalls.length = 0;
    await pushKeyed(domain);
    expect(upsertCalls).toEqual([{ user_id: USER_ID, id: 'a', v: 'second' }]);
    expect(isDirty('race-edit')).toBe(false);
  });

  it('an unchanged record that was sent stops being queued, as before', async () => {
    const records: Record<string, { v: string }> = { a: { v: '1' }, b: { v: '2' } };
    const domain = makeKeyedDomain({ name: 'race-plain', table: 'race_plain', load: () => records });
    noteKeyedChange('race-plain', 'a');
    noteKeyedChange('race-plain', 'b');
    await pushKeyed(domain);
    expect(upsertCalls.map(r => r.id)).toEqual(['a', 'b']);
    expect(isDirty('race-plain')).toBe(false);
  });

  it('a record whose upload failed stays queued while one that went up does not', async () => {
    const records: Record<string, { v: string }> = { a: { v: '1' } };
    const domain = makeKeyedDomain({ name: 'race-fail', table: 'race_fail', load: () => records });
    noteKeyedChange('race-fail', 'a');
    failUpsertForTable = 'race_fail';
    await pushKeyed(domain);
    expect(isDirty('race-fail')).toBe(true);
    failUpsertForTable = null;
    await pushKeyed(domain);
    expect(isDirty('race-fail')).toBe(false);
  });

  it('a queued key whose record is gone is dropped instead of keeping the domain unsynced for ever (it would block every log out)', async () => {
    const domain = makeKeyedDomain({ name: 'race-gone', table: 'race_gone', load: () => ({}) });
    registerKeyed(domain);
    noteKeyedChange('race-gone', 'ghost');
    await pushKeyed(domain);
    expect(upsertCalls).toEqual([]);
    expect(isDirty('race-gone')).toBe(false);
    expect(unsyncedDomains()).not.toContain('race-gone');
  });

  it('a singleton edited during its push stays queued, and counts as newer than the row just written, so a pull cannot revert it', async () => {
    let value: { v: string } | null = { v: 'first' };
    const domain = makeDomain({ name: 'race-single', table: 'race_single', load: () => value, save: v => { value = v; } });
    noteLocalChange('race-single');
    // the account stamps its row a little after the edit: the edit was made after the request left but before the account wrote it
    const serverTime = new Date(Date.now() + 500).toISOString();
    upsertResult.data = { updated_at: serverTime };
    onUpsert = () => { value = { v: 'second' }; noteLocalChange('race-single'); };
    await pushSingleton(domain);
    onUpsert = null;
    expect(isDirty('race-single')).toBe(true);
    selectResult.data = { v: 'first', updated_at: serverTime };
    expect(await pullSingleton(domain)).toBe('local-newer');
    expect(value).toEqual({ v: 'second' });
    upsertCalls.length = 0;
    await pushSingleton(domain);
    expect(upsertCalls).toEqual([{ user_id: USER_ID, v: 'second' }]);
    expect(isDirty('race-single')).toBe(false);
  });
});

describe('syncOnAppState: push when leaving the app, push and read the account when coming back', () => {
  // Until now an edit was only sent the next time the app was opened, so a second phone opened in between didn't have it.
  const MINUTES_LATER = () => Date.now() + 10 * 60_000; // beyond pullIfDue's once-a-minute gap, whatever ran before

  function somethingWaiting(name: string) {
    registerKeyed(makeKeyedDomain({ name, table: name.replace(/-/g, '_'), load: () => ({ a: { v: '1' } }) }));
    noteKeyedChange(name, 'a');
  }

  it('leaving sends what is waiting and does not read the account', async () => {
    selectManyResult.data = [];
    somethingWaiting('leave-thing');
    expect(await syncOnAppState(false)).toBeNull();
    expect(upsertCalls.some(r => r.id === 'a')).toBe(true);
    expect(isDirty('leave-thing')).toBe(false);
    expect(selectCalls).toBe(0);
  });

  it('coming back sends what is waiting, then reads the account', async () => {
    selectManyResult.data = [];
    somethingWaiting('return-thing');
    const result = await syncOnAppState(true, MINUTES_LATER());
    expect(upsertCalls.some(r => r.id === 'a')).toBe(true);
    expect(isDirty('return-thing')).toBe(false);
    expect(selectCalls).toBeGreaterThan(0);
    expect(result).toEqual({ changed: false });
  });

  it('coming back again within a minute sends again but reads the account only once', async () => {
    selectManyResult.data = [];
    const first = MINUTES_LATER();
    await syncOnAppState(true, first);
    const reads = selectCalls;
    somethingWaiting('again-thing');
    expect(await syncOnAppState(true, first + 20_000)).toBeNull();
    expect(selectCalls).toBe(reads);
    expect(isDirty('again-thing')).toBe(false);
  });

  it('never throws when the connection is down: what is waiting stays queued for the next time', async () => {
    somethingWaiting('offline-thing');
    getUser.mockRejectedValue(new Error('Failed to fetch'));
    await expect(syncOnAppState(false)).resolves.toBeNull();
    await expect(syncOnAppState(true, Date.now() + 30 * 60_000)).resolves.toEqual({ changed: false });
    expect(isDirty('offline-thing')).toBe(true);
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
