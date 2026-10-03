// A flush that leaves something unsent (the phone said "connected" a moment before the connection carried traffic, or the
// account was briefly unreachable) used to wait for the next time the app was opened. Seen on the S21 FE: a drink logged
// offline was still unsent minutes after the connection came back. Now it is tried again a little later, a few times.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getUser = vi.fn();
let failUpserts = false;
const upserted: Record<string, unknown>[] = [];

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: () => getUser() },
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        upserted.push(row);
        const error = failUpserts ? new Error('unreachable') : null;
        return {
          select: () => ({ maybeSingle: async () => ({ data: null, error }) }),
          then: (resolve: (r: { error: Error | null }) => void) => resolve({ error }),
        };
      },
    }),
  },
}));

import { registerKeyed, noteKeyedChange, flushWithRetry, cancelFlushRetry, isDirty, unsyncedDomains, clearAllDomainData, type KeyedDomain } from './sync';

const thing: KeyedDomain<{ v: string }> = {
  name: 'things', table: 'things',
  load: () => ({ a: { v: '1' } }),
  save: () => {},
  toRemote: (key, value, userId) => ({ user_id: userId, id: key, v: value.v }),
  fromRemote: row => ({ key: row.id as string, value: { v: row.v as string } }),
};
registerKeyed(thing);

beforeEach(() => {
  localStorage.clear();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  failUpserts = false;
  upserted.length = 0;
  vi.useFakeTimers();
});
afterEach(() => { cancelFlushRetry(); vi.useRealTimers(); });

function somethingWaiting() {
  noteKeyedChange('things', 'a');
  // the first full upload of this domain already happened, so only the waiting record counts
  localStorage.setItem('kx_sync_backfilled_things', '1');
}

describe('flushWithRetry', () => {
  it('sends what is waiting, and sets no timer when that is everything', async () => {
    somethingWaiting();
    await flushWithRetry([1_000]);
    expect(upserted).toHaveLength(1);
    expect(isDirty('things')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing at all when nothing is waiting', async () => {
    localStorage.setItem('kx_sync_backfilled_things', '1');
    await flushWithRetry([1_000]);
    expect(upserted).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tries again after the delay, and stops as soon as everything is saved', async () => {
    somethingWaiting();
    failUpserts = true;
    await flushWithRetry([1_000, 5_000]);
    expect(isDirty('things')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    failUpserts = false; // the connection carries traffic now
    await vi.advanceTimersByTimeAsync(999);
    expect(isDirty('things')).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(isDirty('things')).toBe(false);
    expect(unsyncedDomains()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps trying at growing intervals, then gives up (the next time the app is opened it starts again)', async () => {
    somethingWaiting();
    failUpserts = true;
    await flushWithRetry([1_000, 5_000]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(upserted).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(upserted).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(upserted).toHaveLength(3);
    expect(isDirty('things')).toBe(true);
  });

  it('a new attempt replaces the pending retry instead of stacking another one', async () => {
    somethingWaiting();
    failUpserts = true;
    await flushWithRetry([1_000]);
    await flushWithRetry([1_000]);
    await Promise.all([flushWithRetry([1_000]), flushWithRetry([1_000])]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('never throws, even when the connection fails outright', async () => {
    somethingWaiting();
    getUser.mockRejectedValue(new Error('Failed to fetch'));
    await expect(flushWithRetry([1_000])).resolves.toBeUndefined();
    expect(isDirty('things')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('cancelFlushRetry stops a pending retry, and so does logging out (nothing is left to send)', async () => {
    somethingWaiting();
    failUpserts = true;
    await flushWithRetry([1_000]);
    cancelFlushRetry();
    expect(vi.getTimerCount()).toBe(0);
    await flushWithRetry([1_000]);
    expect(vi.getTimerCount()).toBe(1);
    clearAllDomainData();
    expect(vi.getTimerCount()).toBe(0);
  });
});
