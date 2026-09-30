import { describe, it, expect, vi, beforeEach } from 'vitest';

const result = { data: null as { quest_id: string }[] | null, error: null as Error | null };
const eqCalls: [string, string][] = [];
let throwOnQuery = false;
let configured = true;

vi.mock('./supabase', () => ({
  get isSupabaseConfigured() { return configured; },
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: async (column: string, value: string) => {
          if (throwOnQuery) throw new Error('network down');
          eqCalls.push([`${table}.${column}`, value]);
          return result;
        },
      }),
    }),
  },
}));

import { fetchTodaysClaimedQuestIds, mergeClaimedQuestIds, serverDayKey } from './questClaims';

beforeEach(() => {
  result.data = null;
  result.error = null;
  eqCalls.length = 0;
  throwOnQuery = false;
  configured = true;
});

describe('serverDayKey', () => {
  it('is the UTC date, which is what api/complete-quest.js files a claim under', () => {
    // 02:00 on 1 Oct in India (UTC+5:30) is still 30 Sep 20:30 UTC: the server's day has not turned over yet
    expect(serverDayKey(new Date('2026-09-30T20:30:00Z'))).toBe('2026-09-30');
    expect(serverDayKey(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10-01');
  });
});

describe('fetchTodaysClaimedQuestIds', () => {
  it('returns the quest ids of the rows the server has for that day', async () => {
    result.data = [{ quest_id: 'Q-fibre-30' }, { quest_id: 'Q-food-3' }];
    expect(await fetchTodaysClaimedQuestIds('2026-09-30')).toEqual(['Q-fibre-30', 'Q-food-3']);
    expect(eqCalls).toEqual([['quest_claims.day', '2026-09-30']]);
  });

  it('asks for the server day by default', async () => {
    result.data = [];
    await fetchTodaysClaimedQuestIds();
    expect(eqCalls[0][1]).toBe(serverDayKey());
  });

  it('returns nothing when the lookup errors, so sign-in is never blocked', async () => {
    result.error = new Error('rls');
    expect(await fetchTodaysClaimedQuestIds('2026-09-30')).toEqual([]);
  });

  it('returns nothing when offline (the request throws)', async () => {
    throwOnQuery = true;
    expect(await fetchTodaysClaimedQuestIds('2026-09-30')).toEqual([]);
  });

  it('returns nothing without asking when Supabase is not configured', async () => {
    configured = false;
    expect(await fetchTodaysClaimedQuestIds('2026-09-30')).toEqual([]);
    expect(eqCalls).toEqual([]);
  });
});

describe('mergeClaimedQuestIds', () => {
  it('keeps what the phone had, adds what the server has, and lists nothing twice', () => {
    expect(mergeClaimedQuestIds(['Q-fibre-30'], ['Q-food-3', 'Q-fibre-30'])).toEqual(['Q-fibre-30', 'Q-food-3']);
  });
  it('leaves the list as it was when the server has nothing', () => {
    expect(mergeClaimedQuestIds(['Q-food-3'], [])).toEqual(['Q-food-3']);
  });
});
