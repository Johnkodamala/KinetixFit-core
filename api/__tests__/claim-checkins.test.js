// api/claim-checkins.js: check-in points are given by the server, once per day, into points_ledger.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockUserId = null;
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUserId: async () => mockUserId }));

const ledger = []; // { user_id, day, award_id, points, xp }
let adminConfigured = true;
let failLedgerRead = false;
vi.mock('../_lib/supabaseAdmin.js', () => ({
  supabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from: () => ({
        select: () => {
          const filters = [];
          let like = null;
          const chain = {
            eq(c, v) { filters.push([c, v]); return chain; },
            like(c, pattern) { like = [c, pattern.replace('%', '')]; return chain; },
            then(resolve) {
              if (failLedgerRead) return resolve({ data: null, error: new Error('read failed') });
              resolve({ data: ledger.filter(r => filters.every(([c, v]) => r[c] === v) && (!like || r[like[0]].startsWith(like[1]))), error: null });
            },
          };
          return chain;
        },
        insert: async row => {
          if (ledger.some(r => r.user_id === row.user_id && r.day === row.day && r.award_id === row.award_id)) return { error: { code: '23505' } };
          ledger.push(row);
          return { error: null };
        },
      }),
    };
  },
}));

const { default: handler, claimableDays } = await import('../claim-checkins.js');

const USER = 'user-1';
const iso = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const TODAY = iso(0);

function call(body) {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  return handler({ method: 'POST', body, headers: {} }, res).then(() => res);
}
const total = key => ledger.filter(r => r.user_id === USER).reduce((sum, r) => sum + r[key], 0);

beforeEach(() => {
  ledger.length = 0;
  mockUserId = USER; adminConfigured = true; failLedgerRead = false;
});

describe('who is asking, and what', () => {
  it('refuses a request with no valid session', async () => {
    mockUserId = null;
    expect((await call({ days: [TODAY] })).statusCode).toBe(401);
    expect(ledger).toHaveLength(0);
  });

  it('says so when the server cannot reach its database', async () => {
    adminConfigured = false;
    expect((await call({ days: [TODAY] })).statusCode).toBe(503);
  });

  it('wants one to seven real dates', async () => {
    for (const days of [undefined, [], ['yesterday'], [TODAY, 5], Array.from({ length: 8 }, (_, i) => iso(-i))]) {
      expect((await call({ days })).statusCode, JSON.stringify(days)).toBe(400);
    }
    expect(ledger).toHaveLength(0);
  });

  it('does not answer a GET', async () => {
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json() { return this; }, end() { return this; } };
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('a check-in day', () => {
  it('gives 5 points and 10 XP, once, however often it is sent', async () => {
    const first = await call({ days: [TODAY] });
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({ success: true, pointsAwarded: 5, xpAwarded: 10, streakBonus: 0 });
    const again = await call({ days: [TODAY] });
    expect(again.body).toMatchObject({ pointsAwarded: 0, xpAwarded: 0 });
    expect(ledger).toEqual([{ user_id: USER, day: TODAY, award_id: `checkin:${TODAY}`, points: 5, xp: 10 }]);
  });

  it('gives each of several days, and the same day twice in one request only once', async () => {
    const res = await call({ days: [iso(-1), TODAY, TODAY] });
    expect(res.body.pointsAwarded).toBe(10);
    expect(total('points')).toBe(10);
  });

  it('will not fill in old days, or days far ahead — a year of check-ins cannot be claimed', async () => {
    const res = await call({ days: [iso(-10), iso(-3), iso(5), TODAY] });
    expect(res.body).toMatchObject({ pointsAwarded: 5, daysSkipped: 3 });
    expect(ledger.map(r => r.day)).toEqual([TODAY]);
  });

  it('counts only this account’s days, never another’s', async () => {
    ledger.push({ user_id: 'someone-else', day: TODAY, award_id: `checkin:${TODAY}`, points: 5, xp: 10 });
    expect((await call({ days: [TODAY] })).body.pointsAwarded).toBe(5);
  });

  it('gives nothing when the ledger cannot be read', async () => {
    failLedgerRead = true;
    expect((await call({ days: [TODAY] })).statusCode).toBe(503);
  });
});

describe('the weekly streak bonus', () => {
  it('adds 10 on the 7th day in a row — and not before', async () => {
    // six earlier days already paid
    for (let back = 6; back >= 2; back -= 1) ledger.push({ user_id: USER, day: iso(-back), award_id: `checkin:${iso(-back)}`, points: 5, xp: 10 });
    const sixth = await call({ days: [iso(-1)] }); // the 6th in the run: no bonus
    expect(sixth.body).toMatchObject({ pointsAwarded: 5, streakBonus: 0 });
    const seventh = await call({ days: [TODAY] });
    expect(seventh.body).toMatchObject({ pointsAwarded: 15, xpAwarded: 10, streakBonus: 10 });
    expect(ledger.some(r => r.award_id === 'streak:7' && r.day === TODAY && r.points === 10)).toBe(true);
  });

  it('gives no bonus when a day is missing from the run', async () => {
    for (const back of [6, 5, 4, 3, 1]) ledger.push({ user_id: USER, day: iso(-back), award_id: `checkin:${iso(-back)}`, points: 5, xp: 10 });
    const res = await call({ days: [TODAY] }); // yesterday is there, two days ago is not: a run of 2
    expect(res.body.streakBonus).toBe(0);
  });

  it('does not pay the same week twice when days arrive out of order', async () => {
    const res = await call({ days: [TODAY, iso(-1)] });
    expect(res.body.pointsAwarded).toBe(10);
  });
});

describe('levelling up', () => {
  it('adds 10 when check-in XP reaches the next level (500 XP), once', async () => {
    ledger.push({ user_id: USER, day: '2026-01-01', award_id: 'quest:x', points: 5, xp: 495 });
    const res = await call({ days: [TODAY] }); // +10 XP: 505
    expect(res.body.pointsAwarded).toBe(5 + 10);
    expect(ledger.filter(r => r.award_id === 'levelup:2')).toHaveLength(1);
    expect((await call({ days: [iso(1)] })).body.pointsAwarded).toBe(5); // 515: still level 2
    expect(ledger.filter(r => r.award_id.startsWith('levelup:'))).toHaveLength(1);
  });
});

describe('claimableDays', () => {
  it('is the UTC day, two back and one forward', () => {
    expect(claimableDays(new Date('2026-10-01T00:30:00Z'))).toEqual({ oldest: '2026-09-29', newest: '2026-10-02' });
  });
});
