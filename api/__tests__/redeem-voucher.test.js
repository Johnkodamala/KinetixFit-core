// api/redeem-voucher.js: the points balance and the quests-done gate come from the database for the account the
// session token belongs to, not from the request body; a redemption writes a negative points_ledger row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockUserId = null;
let mockEmail = 'maya@example.com'; // the account's own address, from the verified session
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => (mockUserId ? { id: mockUserId, email: mockEmail } : null) }));

const ledger = []; // { user_id, day, award_id, points, xp }
const claims = []; // { user_id, day, quest_id }
let adminConfigured = true;
let failLedgerRead = false;
let failLedgerInsert = false;
vi.mock('../_lib/supabaseAdmin.js', () => ({
  supabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(table) {
        const store = table === 'quest_claims' ? claims : ledger;
        return {
          select: () => ({
            eq(column, value) {
              const filters = [[column, value]];
              const chain = {
                eq(c, v) { filters.push([c, v]); return chain; },
                then(resolve) {
                  if (table === 'points_ledger' && failLedgerRead) return resolve({ data: null, error: new Error('read failed') });
                  resolve({ data: store.filter(row => filters.every(([c, v]) => row[c] === v)), error: null });
                },
              };
              return chain;
            },
          }),
          insert: async row => {
            if (failLedgerInsert) return { error: new Error('insert failed') };
            store.push(row);
            return { error: null };
          },
        };
      },
    };
  },
}));

let plus = true;
const plusChecks = [];
vi.mock('../_lib/plus.js', () => ({ isPlusUser: async email => { plusChecks.push(email); return plus; } }));
let slotAllowed = true;
const released = [];
const slotsFor = [];
vi.mock('../_lib/rewardConfig.js', () => ({
  getRewardConfig: async () => ({ voucherPointsCost: 1000, voucherValueGBP: 2.5 }),
  reserveVoucherSlot: async email => { slotsFor.push(email); return slotAllowed ? { allowed: true } : { allowed: false, message: 'One a month.' }; },
  releaseVoucherSlot: async slot => { released.push(slot); },
}));
vi.mock('../_lib/auditLog.js', () => ({ logAuditEvent: async () => {} }));

const USER = 'user-1';
const TODAY = new Date().toISOString().slice(0, 10);
const { default: handler } = await import('../redeem-voucher.js');

function call(body = {}) {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  return handler({ method: 'POST', body: { country: 'GB', userName: 'Maya', ...body }, headers: {} }, res).then(() => res);
}

const earn = points => ledger.push({ user_id: USER, day: TODAY, award_id: `quest:${Math.random()}`, points, xp: 0 });
const claim = id => claims.push({ user_id: USER, day: TODAY, quest_id: id });

beforeEach(() => {
  ledger.length = 0; claims.length = 0; released.length = 0; plusChecks.length = 0; slotsFor.length = 0; mockEmail = 'maya@example.com';
  mockUserId = USER; adminConfigured = true; plus = true; slotAllowed = true;
  failLedgerRead = false; failLedgerInsert = false;
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ order: { id: 'ORD-1' } }) }));
});

describe('redeem-voucher: who is asking', () => {
  it('refuses a request with no valid session — a body that says it has 99,999 points is not enough', async () => {
    mockUserId = null;
    const res = await call({ pointBalance: 99999, todayQuestsCompleted: 5 });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('says so, without paying out, when the server cannot reach its database', async () => {
    adminConfigured = false;
    expect((await call()).statusCode).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('redeem-voucher: the voucher goes to the account’s own email', () => {
  beforeEach(() => { earn(1000); claim('Q-a'); claim('Q-b'); });

  it('sends the order to the signed-in account’s email and ignores an address in the request', async () => {
    const res = await call({ email: 'someone-else@example.com' });
    expect(res.statusCode).toBe(200);
    const order = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(order.reward.recipient.email).toBe('maya@example.com');
    expect(res.body.recipient).toBe('maya@example.com');
  });

  it('checks Plus and the monthly limit for that account, not for the address in the request', async () => {
    await call({ email: 'someone-else@example.com' });
    expect(plusChecks).toEqual(['maya@example.com']);
    expect(slotsFor).toEqual(['maya@example.com']);
  });

  it('refuses when the session has no email', async () => {
    mockEmail = null;
    const res = await call();
    expect(res.statusCode).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('redeem-voucher: the balance comes from the ledger', () => {
  it('ignores the balance and quest count the phone sends', async () => {
    earn(900); claim('Q-a'); claim('Q-b'); // 900 is under the 1,000 cost
    const res = await call({ pointBalance: 99999, todayQuestsCompleted: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT BALANCE');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('needs two quests claimed today in the database, whatever the phone says', async () => {
    earn(1000); claim('Q-a');
    const res = await call({ todayQuestsCompleted: 9 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('EFFORT THRESHOLD UNMET');
  });

  it('does not count another day\'s quests or another account\'s points', async () => {
    earn(1000); claim('Q-a'); claim('Q-b');
    ledger.push({ user_id: 'someone-else', day: TODAY, award_id: 'x', points: 5000, xp: 0 });
    claims.push({ user_id: USER, day: '2020-01-01', quest_id: 'Q-old' });
    mockUserId = 'third-user';
    expect((await call()).statusCode).toBe(400);
  });

  it('will not pay out when the ledger cannot be read', async () => {
    earn(1000); claim('Q-a'); claim('Q-b');
    failLedgerRead = true;
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('redeem-voucher: a redemption', () => {
  beforeEach(() => { earn(800); earn(400); claim('Q-a'); claim('Q-b'); });

  it('orders the voucher and takes 1,000 points out of the ledger', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Settled');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const spend = ledger.find(row => row.award_id === 'voucher');
    expect(spend).toMatchObject({ user_id: USER, day: TODAY, points: -1000 });
    expect(ledger.reduce((sum, row) => sum + row.points, 0)).toBe(200);
  });

  it('leaves the monthly limit as it was', async () => {
    slotAllowed = false;
    const res = await call();
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('VOUCHER_MONTHLY_LIMIT');
    expect(ledger.some(row => row.award_id === 'voucher')).toBe(false);
  });

  it('charges nothing when the voucher order fails, and gives the monthly slot back', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ errors: [{ message: 'provider down' }] }) }));
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(ledger.some(row => row.award_id === 'voucher')).toBe(false);
    expect(released).toHaveLength(1);
  });

  it('still reports the order when only the spend row could not be written', async () => {
    failLedgerInsert = true;
    const res = await call();
    expect(res.statusCode).toBe(200);
  });

  it('is still for Plus members only', async () => {
    plus = false;
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PLUS_REQUIRED');
  });
});

// "2 quests done today" means today on the phone: quests are filed under the phone's own date when it sends its time zone
// (api/complete-quest.js), so this gate reads the same day. 00:30 on 4 Oct in India is still 3 Oct in UTC.
describe('redeem-voucher: which day the two quests must be from', () => {
  const claimOn = (day, id) => claims.push({ user_id: USER, day, quest_id: id });
  beforeEach(() => {
    earn(1000);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T19:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("counts the quests claimed on the phone's own day when it sends its time zone", async () => {
    claimOn('2026-10-04', 'Q-a'); claimOn('2026-10-04', 'Q-b');
    expect((await call({ timeZone: 'Asia/Kolkata' })).statusCode).toBe(200);
  });

  it("does not count last evening's quests as today's for a phone that sends its time zone", async () => {
    claimOn('2026-10-03', 'Q-a'); claimOn('2026-10-03', 'Q-b');
    const res = await call({ timeZone: 'Asia/Kolkata' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('EFFORT THRESHOLD UNMET');
  });

  it('counts the UTC date for a request with no time zone (builds from before)', async () => {
    claimOn('2026-10-03', 'Q-a'); claimOn('2026-10-03', 'Q-b');
    expect((await call()).statusCode).toBe(200);
  });
});
