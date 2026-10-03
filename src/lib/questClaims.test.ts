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

import { claimDayKey, fetchTodaysClaimedQuestIds, mergeClaimedQuestIds } from './questClaims';

beforeEach(() => {
  result.data = null;
  result.error = null;
  eqCalls.length = 0;
  throwOnQuery = false;
  configured = true;
});

describe('claimDayKey', () => {
  it("is the phone's own date, which is what api/complete-quest.js files a claim under now that the phone sends its time zone", () => {
    // 02:00 on 1 Oct in India (UTC+5:30) is still 30 Sep 20:30 UTC: the quests on the phone are 1 Oct's, so the claims
    // to ask for are 1 Oct's too (it used to ask for the UTC date, 30 Sep: last evening's claims marked the new day's quests as claimed)
    expect(claimDayKey(new Date(2026, 9, 1, 2, 0))).toBe('2026-10-01');
    expect(claimDayKey(new Date(2026, 9, 1, 23, 59))).toBe('2026-10-01');
    expect(claimDayKey(new Date(2026, 9, 2, 0, 0))).toBe('2026-10-02');
  });
});

describe('fetchTodaysClaimedQuestIds', () => {
  it('returns the quest ids of the rows the server has for that day', async () => {
    result.data = [{ quest_id: 'Q-fibre-30' }, { quest_id: 'Q-food-3' }];
    expect(await fetchTodaysClaimedQuestIds('2026-09-30')).toEqual(['Q-fibre-30', 'Q-food-3']);
    expect(eqCalls).toEqual([['quest_claims.day', '2026-09-30']]);
  });

  it("asks for the phone's own day by default", async () => {
    result.data = [];
    await fetchTodaysClaimedQuestIds();
    expect(eqCalls[0][1]).toBe(claimDayKey());
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
