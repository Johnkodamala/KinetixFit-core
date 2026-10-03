// api/complete-quest.js with Redis and Supabase replaced by in-memory stand-ins: the existing
// Redis dedup/rate-limit path (unauthenticated or older clients), and the new durable
// quest_claims/points_ledger write once a request carries a verified Supabase session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
          select: () => ({ eq: (column, value) => ({ then: resolve => resolve({ data: store.filter(r => r[column] === value), error: null }) }) }),
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
  // Q-steps-10000 is worth 8 points and 30 XP on the server (api/_lib/quests.js); what the request says it is worth is ignored.
  appUserId: 'maya@example.com', taskId: 'Q-steps-10000', verificationType: 'activity',
  xpValue: 30, pointsValue: 8, completed: true, ...over,
});

beforeEach(() => {
  redisStore.strings.clear();
  redisStore.lists.clear();
  claimsStore.length = 0;
  ledgerStore.length = 0;
  mockUserId = null;
  adminConfigured = true;
});

describe('which quests, and what they are worth', () => {
  it('pays what the quest is worth on the server, whatever the request says', async () => {
    const res = await call({ body: claimBody({ taskId: 'Q-sleep-7h', xpValue: 999, pointsValue: 999, verificationType: 'unverifiable_by_design' }) });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ xpAwarded: 25, pointsAwarded: 7 });
  });

  it('refuses an id that is not a quest, and earns nothing for it', async () => {
    for (const taskId of ['quest-steps', 'Q-invented-1', 'q-food-3', '__proto__', 'constructor', 'toString', 42]) {
      const res = await call({ body: claimBody({ taskId }), headers: { authorization: 'Bearer good-token' } });
      expect(res.statusCode, String(taskId)).toBe(400);
    }
    expect(claimsStore).toHaveLength(0);
    expect(ledgerStore).toHaveLength(0);
  });

  it('cannot be farmed by inventing ids: only real quests, once each a day, pay', async () => {
    mockUserId = 'uid-123';
    for (let i = 0; i < 15; i += 1) await call({ body: claimBody({ taskId: `Q-fake-${i}` }), headers: { authorization: 'Bearer good-token' } });
    expect(ledgerStore).toHaveLength(0);
  });
});

describe('without a verified session (older app builds)', () => {
  it('still awards on the Redis-only path and never touches Postgres', async () => {
    const res = await call({ body: claimBody() });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, xpAwarded: 30, pointsAwarded: 8 });
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
    expect(claimsStore).toEqual([{ user_id: 'uid-123', day: expect.any(String), quest_id: 'Q-steps-10000', points: 8, xp: 30 }]);
    expect(ledgerStore).toEqual([{ user_id: 'uid-123', day: expect.any(String), award_id: 'quest:Q-steps-10000', points: 8, xp: 30 }]);
  });

  it("rejects a second claim for the same quest/day at the database level, even if Redis's key were gone", async () => {
    await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    redisStore.strings.clear(); // simulate the Redis dedup key having been evicted
    const res = await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    expect(res.statusCode).toBe(409);
    expect(claimsStore).toHaveLength(1); // never double-written
  });

  it('pays the level-up bonus when a claim takes the ledger’s XP to a new level (500 XP a level), once', async () => {
    ledgerStore.push({ user_id: 'uid-123', day: '2026-09-01', award_id: 'checkin:x', points: 5, xp: 480 });
    await call({ body: claimBody({ taskId: 'Q-workout' }), headers: { authorization: 'Bearer good-token' } }); // 520 XP: level 2
    const levelUps = () => ledgerStore.filter(r => r.award_id.startsWith('levelup:'));
    expect(levelUps()).toEqual([{ user_id: 'uid-123', day: expect.any(String), award_id: 'levelup:2', points: 10, xp: 0 }]);
    await call({ body: claimBody({ taskId: 'Q-hrv' }), headers: { authorization: 'Bearer good-token' } }); // 560 XP: still level 2
    expect(levelUps()).toHaveLength(1);
  });

  it('gives no level-up bonus for XP the phone merely says it has', async () => {
    await call({ body: claimBody({ xpValue: 400 }), headers: { authorization: 'Bearer good-token' } });
    expect(ledgerStore.some(r => r.award_id.startsWith('levelup:'))).toBe(false);
  });

  it('falls back to Redis-only behaviour when Supabase admin is not configured', async () => {
    adminConfigured = false;
    const res = await call({ body: claimBody(), headers: { authorization: 'Bearer good-token' } });
    expect(res.statusCode).toBe(200);
    expect(claimsStore).toHaveLength(0);
  });
});

// The server files a claim under a day: the phone's own date when the request sends its time zone (requestDay in
// api/_lib/countries.js), the UTC date when it doesn't (builds from before). The phone offers quests by its own day, so
// in India (UTC+5:30) the UTC date lags the phone's for the first five and a half hours of every day: last evening's
// claim was then "the same day", and a quest done at 01:00 answered "already claimed" with no points.
describe('which day a claim is filed under', () => {
  const EVENING_IN_INDIA = new Date('2026-10-03T16:30:00Z'); // 22:00 on 3 Oct
  const NIGHT_IN_INDIA = new Date('2026-10-03T19:00:00Z'); //   00:30 on 4 Oct: still 3 Oct in UTC
  const signedIn = { authorization: 'Bearer good-token' };
  const at = when => vi.setSystemTime(when);

  beforeEach(() => { mockUserId = 'uid-123'; vi.useFakeTimers({ toFake: ['Date'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('uses the UTC date when the request sends no time zone (builds from before)', async () => {
    at(NIGHT_IN_INDIA);
    await call({ body: claimBody(), headers: signedIn });
    expect(claimsStore.map(c => c.day)).toEqual(['2026-10-03']);
    expect(ledgerStore.map(l => l.day)).toEqual(['2026-10-03']);
  });

  it("uses the phone's own date when it sends its time zone: the claim row, the ledger row", async () => {
    at(NIGHT_IN_INDIA);
    await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn });
    expect(claimsStore.map(c => c.day)).toEqual(['2026-10-04']);
    expect(ledgerStore.map(l => l.day)).toEqual(['2026-10-04']);
  });

  it("lets the new day's quest be claimed just after midnight although last evening's was claimed", async () => {
    at(EVENING_IN_INDIA);
    expect((await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn })).statusCode).toBe(200);
    at(NIGHT_IN_INDIA);
    const res = await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ pointsAwarded: 8 });
    expect(claimsStore.map(c => c.day)).toEqual(['2026-10-03', '2026-10-04']);
  });

  it('still answers 409 in those hours without a time zone: it is the same UTC day (builds from before)', async () => {
    at(EVENING_IN_INDIA);
    await call({ body: claimBody(), headers: signedIn });
    at(NIGHT_IN_INDIA);
    expect((await call({ body: claimBody(), headers: signedIn })).statusCode).toBe(409);
    expect(claimsStore).toHaveLength(1);
  });

  it("still refuses a second claim of the same quest on the same day of the phone's own", async () => {
    at(NIGHT_IN_INDIA);
    await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn });
    at(new Date('2026-10-03T21:30:00Z')); // 03:00 on 4 Oct
    expect((await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn })).statusCode).toBe(409);
    expect(claimsStore).toHaveLength(1);
  });

  it('applies the daily limit to the phone\'s own day too, not to the UTC day', async () => {
    at(EVENING_IN_INDIA);
    redisStore.strings.set('earn_event_count:maya@example.com:2026-10-03', 20); // today's limit used up (UTC and India agree at 22:00)
    expect((await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn })).statusCode).toBe(429);
    at(NIGHT_IN_INDIA); // a new day in India
    expect((await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn })).statusCode).toBe(200);
  });

  it('treats a time zone that is not one as none: the UTC date, never an error', async () => {
    at(NIGHT_IN_INDIA);
    for (const timeZone of ['Mars/Phobos', '', 42, 'x'.repeat(70)]) {
      claimsStore.length = 0; ledgerStore.length = 0; redisStore.strings.clear();
      const res = await call({ body: claimBody({ timeZone }), headers: signedIn });
      expect(res.statusCode, String(timeZone)).toBe(200);
      expect(claimsStore.map(c => c.day)).toEqual(['2026-10-03']);
    }
  });

  it('checks a steps quest against the health snapshot filed under that same day', async () => {
    at(NIGHT_IN_INDIA);
    redisStore.strings.set('health_snapshot:maya@example.com:2026-10-04', JSON.stringify({ steps: 5000 }));
    const withZone = await call({ body: claimBody({ timeZone: 'Asia/Kolkata' }), headers: signedIn });
    expect(withZone.body).toMatchObject({ verified: true, verificationNote: '5000 steps synced today.' });
    // the same snapshot is not found by a build that asks for the UTC date
    redisStore.strings.delete('quest_award:maya@example.com:Q-steps-10000:2026-10-04');
    claimsStore.length = 0; ledgerStore.length = 0;
    const withoutZone = await call({ body: claimBody(), headers: signedIn });
    expect(withoutZone.body.verified).toBe(false);
  });

  it("checks a food quest against the first-scan bonus filed under the phone's own day", async () => {
    at(NIGHT_IN_INDIA);
    redisStore.strings.set('meal_scan_points_awarded:maya@example.com:2026-10-04', '1');
    const res = await call({ body: claimBody({ taskId: 'Q-food-3', verificationType: 'nutrition', timeZone: 'Asia/Kolkata' }), headers: signedIn });
    expect(res.body).toMatchObject({ verified: true, verificationNote: 'Meal scan logged today.' });
  });
});
