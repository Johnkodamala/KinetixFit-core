// api/complete-quest.js with Redis and Supabase replaced by in-memory stand-ins: the existing
// Redis dedup/rate-limit path (unauthenticated or older clients), and the new durable
// quest_claims/points_ledger write once a request carries a verified Supabase session.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisStore = { strings: new Map(), lists: new Map() };
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async key => redisStore.strings.get(key) ?? null,
      set: async (key, value) => { redisStore.strings.set(key, value); return 'OK'; },
      lpush: async (key, value) => {
        const list = redisStore.lists.get(key) ?? [];
        list.unshift(value);
        redisStore.lists.set(key, list);
        return list.length;
      },
      ltrim: async () => 'OK',
    }),
  },
}));

// A verified user id: null means "no/invalid token" (the pre-existing Redis-only path).
let mockUserId = null;
vi.mock('../_lib/supabaseAuth.js', () => ({
  verifiedUserId: async () => mockUserId,
}));

const claimsStore = []; // { user_id, day, quest_id }
const ledgerStore = [];
let adminConfigured = true;
vi.mock('../_lib/supabaseAdmin.js', () => ({
  supabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(table) {
        const store = table === 'quest_claims' ? claimsStore : ledgerStore;
        return {
          insert: async (row) => {
            const dupe = table === 'quest_claims' && store.some(r => r.user_id === row.user_id && r.day === row.day && r.quest_id === row.quest_id);
            if (dupe) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
            store.push(row);
            return { error: null };
          },
        };
      },
    };
  },
}));

const { default: handler } = await import('../complete-quest.js');

function call({ body = {}, headers = {} } = {}) {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  const req = { method: 'POST', body, headers };
  return handler(req, res).then(() => res);
}

const claimBody = (over = {}) => ({
  appUserId: 'maya@example.com', taskId: 'quest-steps', verificationType: 'unverifiable_by_design',
  xpValue: 10, pointsValue: 5, completed: true, ...over,
});

beforeEach(() => {
  redisStore.strings.clear();
  redisStore.lists.clear();
  claimsStore.length = 0;
  ledgerStore.length = 0;
  mockUserId = null;
  adminConfigured = true;
});

describe('without a verified session (older app builds)', () => {
  it('still awards on the Redis-only path and never touches Postgres', async () => {
    const res = await call({ body: claimBody() });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, xpAwarded: 10, pointsAwarded: 5 });
    expect(claimsStore).toHaveLength(0);
    expect(ledgerStore).toHaveLength(0);
  });

  it('still dedupes the same quest/day via Redis', async () => {
    await call({ body: claimBody() });
    const res = await call({ body: claimBody() });
    expect(res.statusCode).toBe(409);
  });
});

describe('with a verified session', () => {
  beforeEach(() => { mockUserId = 'uid-123'; });

  it('writes a durable quest_claims row and a points_ledger row', async () => {
    const res = await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    expect(res.statusCode).toBe(200);
    expect(claimsStore).toEqual([{ user_id: 'uid-123', day: expect.any(String), quest_id: 'quest-steps', points: 5, xp: 10 }]);
    expect(ledgerStore).toEqual([{ user_id: 'uid-123', day: expect.any(String), award_id: 'quest:quest-steps', points: 5, xp: 10 }]);
  });

  it("rejects a second claim for the same quest/day at the database level, even if Redis's key were gone", async () => {
    await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    redisStore.strings.clear(); // simulate the Redis dedup key having been evicted
    const res = await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    expect(res.statusCode).toBe(409);
    expect(claimsStore).toHaveLength(1); // never double-written
  });

  it('falls back to Redis-only behaviour when Supabase admin is not configured', async () => {
    adminConfigured = false;
    const res = await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    expect(res.statusCode).toBe(200);
    expect(claimsStore).toHaveLength(0);
  });
});
