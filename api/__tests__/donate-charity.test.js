// api/donate-charity.js: a donation costs donationPointsCost points, checked against the account's points_ledger balance
// (the session token's account, not the body) and written as a negative ledger row, reserved before the pledge is logged.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisStore = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ get: async k => redisStore.get(k) ?? null, set: async (k, v) => { redisStore.set(k, v); return 'OK'; } }) },
}));

let mockUserId = null;
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUserId: async () => mockUserId }));

const ledger = [];
let adminConfigured = true;
let failLedgerRead = false;
let raceAfterReserve = 0; // points another request spends right after ours is reserved, to play a simultaneous request
let ledgerReads = 0;
let ledgerInserts = 0;
vi.mock('../_lib/supabaseAdmin.js', () => ({
  supabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from: () => ({
        select: () => ({
          eq: (column, value) => ({
            then: resolve => {
              ledgerReads += 1;
              if (failLedgerRead) return resolve({ data: null, error: new Error('read failed') });
              resolve({ data: ledger.filter(row => row[column] === value), error: null });
            },
          }),
        }),
        insert: async row => {
          ledgerInserts += 1;
          ledger.push(row);
          if (raceAfterReserve && row.award_id.startsWith('donation:')) {
            ledger.push({ user_id: row.user_id, day: row.day, award_id: 'race', points: -raceAfterReserve, xp: 0 });
          }
          return { error: null };
        },
        delete: () => ({
          eq(c1, v1) {
            const filters = [[c1, v1]];
            const chain = {
              eq(c, v) { filters.push([c, v]); return chain; },
              then(resolve) {
                for (let i = ledger.length - 1; i >= 0; i--) if (filters.every(([c, v]) => ledger[i][c] === v)) ledger.splice(i, 1);
                resolve({ error: null });
              },
            };
            return chain;
          },
        }),
      }),
    };
  },
}));

let capAllowed = true;
vi.mock('../_lib/rewardConfig.js', () => ({
  getRewardConfig: async () => ({ donationPointsCost: 1000, donationValueGBP: 2.5 }),
  checkMonthlyRedemptionCap: async () => (capAllowed ? { allowed: true } : { allowed: false, message: 'Monthly cap reached.' }),
  recordRedemption: async () => {},
}));
vi.mock('../_lib/auditLog.js', () => ({ logAuditEvent: async () => {} }));

const USER = 'user-1';
const TODAY = new Date().toISOString().slice(0, 10);
const { default: handler } = await import('../donate-charity.js');

function call(body = {}) {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  return handler({ method: 'POST', body: { charityId: 'CHAR-NHS', charityName: 'NHS Charities', appUserId: 'maya@example.com', country: 'GB', ...body }, headers: {} }, res).then(() => res);
}
const balance = () => ledger.filter(r => r.user_id === USER).reduce((s, r) => s + r.points, 0);

beforeEach(() => {
  redisStore.clear(); ledger.length = 0; ledgerReads = 0; ledgerInserts = 0;
  mockUserId = USER; adminConfigured = true; failLedgerRead = false; raceAfterReserve = 0; capAllowed = true;
  ledger.push({ user_id: USER, day: TODAY, award_id: 'earned', points: 1200, xp: 0 });
});

describe('donate-charity: who is asking and what they have', () => {
  it('refuses a request with no valid session', async () => {
    mockUserId = null;
    const res = await call({ pointsValue: 99999 });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(balance()).toBe(1200);
  });

  it('refuses when the ledger balance is under the cost, whatever the phone says it has', async () => {
    ledger[0].points = 400;
    const res = await call({ pointsValue: 99999 });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(balance()).toBe(400);
    expect(ledgerInserts).toBe(0); // turned away before anything was reserved
  });

  it('does not donate when the ledger cannot be read', async () => {
    failLedgerRead = true;
    expect((await call()).statusCode).toBe(503);
  });

  it('says so when the server cannot reach its database', async () => {
    adminConfigured = false;
    expect((await call()).statusCode).toBe(503);
  });
});

describe('donate-charity: a donation', () => {
  it('logs the pledge and takes 1,000 points out of the ledger', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, valueGBP: 2.5, pointsDeducted: 1000 });
    expect(balance()).toBe(200);
  });

  it('keeps the unchanged rules: country, charity, and the monthly cap', async () => {
    expect((await call({ country: 'IN' })).statusCode).toBe(403);
    expect((await call({ charityId: 'CHAR-NOPE' })).statusCode).toBe(400);
    capAllowed = false;
    expect((await call()).statusCode).toBe(429);
    expect(balance()).toBe(1200);
  });

  it('never overspends when another request spends the same points at the same moment', async () => {
    raceAfterReserve = 1000; // the other request's spend lands after ours, leaving the balance at -800
    const res = await call();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(ledger.some(r => r.award_id.startsWith('donation:'))).toBe(false); // ours was taken back out
  });
});
