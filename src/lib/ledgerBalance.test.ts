import { describe, it, expect, vi, beforeEach } from 'vitest';

const result = { data: null as { points: number; xp: number }[] | null, error: null as Error | null };
let throwOnQuery = false;
let configured = true;
const selected: string[] = [];
vi.mock('./supabase', () => ({
  get isSupabaseConfigured() { return configured; },
  supabase: {
    from: (table: string) => ({
      select: async (columns: string) => {
        selected.push(`${table}:${columns}`);
        if (throwOnQuery) throw new Error('network down');
        return result;
      },
    }),
  },
}));

import { fetchServerBalance, reconcileBalance, readLocalBalance, writeLocalBalance } from './ledgerBalance';

beforeEach(() => {
  result.data = null; result.error = null; throwOnQuery = false; configured = true; selected.length = 0;
  localStorage.clear();
});

describe('fetchServerBalance', () => {
  it('sums the ledger rows the account can read', async () => {
    result.data = [{ points: 7, xp: 25 }, { points: 5, xp: 10 }, { points: -1000, xp: 0 }];
    expect(await fetchServerBalance()).toEqual({ points: -988, xp: 35 });
    expect(selected).toEqual(['points_ledger:points, xp']);
  });

  it('is an empty balance for an account with no rows', async () => {
    result.data = [];
    expect(await fetchServerBalance()).toEqual({ points: 0, xp: 0 });
  });

  it('is unknown (null) on an error, offline, or when Supabase is not set up', async () => {
    result.error = new Error('rls');
    expect(await fetchServerBalance()).toBeNull();
    result.error = null; throwOnQuery = true;
    expect(await fetchServerBalance()).toBeNull();
    throwOnQuery = false; configured = false;
    expect(await fetchServerBalance()).toBeNull();
    expect(selected).toHaveLength(2); // nothing was asked when not configured
  });

  it('is unknown when a full page means there may be more rows than were read', async () => {
    result.data = Array.from({ length: 1000 }, () => ({ points: 1, xp: 0 }));
    expect(await fetchServerBalance()).toBeNull();
  });
});

describe('reconcileBalance: the higher of the phone’s and the server’s, never lower', () => {
  const phone = { points: 0, xp: 0, level: 1 };

  it('a new phone takes the server’s points and XP', () => {
    expect(reconcileBalance(phone, { points: 120, xp: 340 })).toEqual({ points: 120, xp: 340, level: 1 });
  });

  it('keeps points the server never saw (earned on this phone before it was recording them)', () => {
    expect(reconcileBalance({ points: 90, xp: 200, level: 1 }, { points: 7, xp: 25 })).toEqual({ points: 90, xp: 200, level: 1 });
  });

  it('does not count an award both know about twice', () => {
    expect(reconcileBalance({ points: 12, xp: 35, level: 1 }, { points: 12, xp: 35 })).toEqual({ points: 12, xp: 35, level: 1 });
  });

  it('points and XP are compared on their own: one can come from each', () => {
    expect(reconcileBalance({ points: 50, xp: 10, level: 1 }, { points: 20, xp: 80 })).toEqual({ points: 50, xp: 80, level: 1 });
  });

  it('raises the level to match the XP (500 XP a level), and never lowers it', () => {
    expect(reconcileBalance(phone, { points: 0, xp: 1200 }).level).toBe(3);
    expect(reconcileBalance({ points: 0, xp: 0, level: 4 }, { points: 0, xp: 600 }).level).toBe(4);
  });

  it('leaves the phone as it was when the server is unknown', () => {
    const local = { points: 33, xp: 44, level: 2 };
    expect(reconcileBalance(local, null)).toBe(local);
  });
});

describe('the phone’s own copy', () => {
  it('reads zero points, zero XP and level 1 when nothing is stored', () => {
    expect(readLocalBalance()).toEqual({ points: 0, xp: 0, level: 1 });
  });
  it('writes and reads back what App.tsx keeps', () => {
    writeLocalBalance({ points: 12, xp: 620, level: 2 });
    expect(localStorage.getItem('kinetix_voucher_points')).toBe('12');
    expect(localStorage.getItem('kinetix_xp')).toBe('620');
    expect(localStorage.getItem('kinetix_level')).toBe('2');
    expect(readLocalBalance()).toEqual({ points: 12, xp: 620, level: 2 });
  });
  it('ignores a stored value that is not a number', () => {
    localStorage.setItem('kinetix_xp', 'lots');
    expect(readLocalBalance().xp).toBe(0);
  });
});
