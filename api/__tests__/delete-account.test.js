// api/delete-account.js: erases the signed-in person's data. The account comes from the verified session only, the
// account itself goes last and only if everything before it worked, and the short-lived anti-abuse counters stay.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map(); // key -> value
const zsets = new Map(); // key -> Set of members
const globToRegExp = glob => new RegExp('^' + glob.replace(/\\(.)/g, '\u0000$1\u0001').replace(/[.+^${}()|]/g, '\\$&').replace(/\*/g, '.*').replace(/\u0000(.)\u0001/g, (_, c) => c.replace(/[\\*?[\]]/g, '\\$&')) + '$');
let redisDown = false;
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async k => store.get(k) ?? null,
      set: async (k, v) => { store.set(k, v); },
      del: async (...keys) => { if (redisDown) throw new Error('redis down'); let n = 0; for (const k of keys) if (store.delete(k)) n += 1; return n; },
      scan: async (_cursor, { match }) => { if (redisDown) throw new Error('redis down'); const re = globToRegExp(match); return ['0', [...store.keys()].filter(k => re.test(k))]; },
      zrem: async (k, member) => { zsets.get(k)?.delete(member); },
    }),
  },
}));

let mockUser;
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => mockUser }));

let adminOn;
let dbErrors; // table -> error message
let deletedRows; // [table, user_id]
let deletedUsers;
let authDeleteError;
vi.mock('../_lib/supabaseAdmin.js', () => ({
  supabaseAdmin: () => adminOn ? ({
    from: table => ({ delete: () => ({ eq: async (_col, id) => { deletedRows.push([table, id]); return { error: dbErrors[table] ? { message: dbErrors[table] } : null }; } }) }),
    auth: { admin: { deleteUser: async id => { deletedUsers.push(id); return { error: authDeleteError ? { message: authDeleteError } : null }; } } },
  }) : null,
}));

const { default: handler, USER_TABLES } = await import('../delete-account.js');

function call(body, { method = 'POST' } = {}) {
  const res = { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method, body, headers: {} }, res).then(() => res);
}

let rcCalls;
let rcStatus;
const EMAIL = 'Maya@Example.com';
beforeEach(() => {
  store.clear(); zsets.clear(); redisDown = false;
  mockUser = { id: 'uid-1', email: EMAIL };
  adminOn = true; dbErrors = {}; deletedRows = []; deletedUsers = []; authDeleteError = null;
  rcCalls = []; rcStatus = 200;
  process.env.REVENUECAT_API_KEY = 'sk_test';
  vi.stubGlobal('fetch', async (url, opts) => { rcCalls.push({ url, method: opts.method }); return { ok: rcStatus < 300, status: rcStatus, json: async () => ({}) }; });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // the person's own data in Redis, in both spellings of the address the app and the website use
  for (const e of [EMAIL, EMAIL.toLowerCase()]) {
    store.set(`plus:${e}`, 1);
    store.set(`audit_log:${e}`, '[...]');
    store.set(`early_access:${e}`, '{"email":"x"}');
    store.set(`health_snapshot:${e}:2026-10-02`, '{"steps":1}');
    store.set(`meal_ideas:${e}:abc123`, '[]');
    store.set(`meal_ideas_count:${e}:2026-10-02`, 2);
    store.set(`donation_log:${e}:1759400000000`, '{"charity":"x"}');
  }
  zsets.set('early_access', new Set([EMAIL.toLowerCase(), 'someone@else.com']));
  // anti-abuse counters, which stay
  store.set(`scans:${EMAIL}:2026-10-02`, 3);
  store.set(`voucher_count:${EMAIL}:2026-10`, 1);
  store.set(`redemption_total:${EMAIL}:2026-10`, 3);
  store.set(`donation_count:${EMAIL}:2026-10-02`, 1);
  store.set(`earn_event_count:${EMAIL}:2026-10-02`, 4);
  store.set(`quest_award:${EMAIL}:steps:2026-10-02`, '1');
  // someone else's data, which must never be touched
  store.set('health_snapshot:other@example.com:2026-10-02', '{"steps":9}');
  store.set('audit_log:other@example.com', '[...]');
  store.set('plus:Maya@Example.com.au', 1);
  // promo codes: one used by this person, one by someone else
  store.set('promo_used:MAYA-CODE', JSON.stringify({ appUserId: 'maya@example.com', redeemedAt: '2026-10-01T10:00:00Z' }));
  store.set('promo_used:OTHER-CODE', JSON.stringify({ appUserId: 'other@example.com', redeemedAt: '2026-10-01T11:00:00Z' }));
});

describe('delete-account: who and what', () => {
  it('needs a verified session, and touches nothing without one', async () => {
    mockUser = null;
    const res = await call({ mode: 'account', confirm: true });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(deletedUsers).toEqual([]);
    expect(rcCalls).toEqual([]);
    expect(store.has(`plus:${EMAIL}`)).toBe(true);
  });

  it('ignores any email or id in the body: the session decides', async () => {
    await call({ mode: 'account', confirm: true, email: 'other@example.com', userId: 'uid-other' });
    expect(deletedUsers).toEqual(['uid-1']);
    expect(store.has('health_snapshot:other@example.com:2026-10-02')).toBe(true);
    expect(store.has('audit_log:other@example.com')).toBe(true);
  });

  it('wants a mode and an explicit confirmation', async () => {
    expect((await call({ confirm: true })).statusCode).toBe(400);
    expect((await call({ mode: 'everything', confirm: true })).statusCode).toBe(400);
    expect((await call({ mode: 'account' })).statusCode).toBe(400);
    expect((await call({ mode: 'account', confirm: 'yes' })).statusCode).toBe(400);
    expect(deletedUsers).toEqual([]);
  });

  it('only takes POST', async () => {
    expect((await call({}, { method: 'GET' })).statusCode).toBe(405);
  });

  it('says so when the server has no Supabase admin access, and changes nothing', async () => {
    adminOn = false;
    expect((await call({ mode: 'account', confirm: true })).statusCode).toBe(503);
    expect(store.has(`plus:${EMAIL}`)).toBe(true);
  });
});

describe('delete-account: mode "account"', () => {
  it('removes the Redis data in both spellings, the early-access entry and the RevenueCat record, then the account', async () => {
    const res = await call({ mode: 'account', confirm: true });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, mode: 'account' });
    for (const e of [EMAIL, EMAIL.toLowerCase()]) {
      for (const k of [`plus:${e}`, `audit_log:${e}`, `early_access:${e}`, `health_snapshot:${e}:2026-10-02`, `meal_ideas:${e}:abc123`, `meal_ideas_count:${e}:2026-10-02`, `donation_log:${e}:1759400000000`]) {
        expect(store.has(k), k).toBe(false);
      }
    }
    expect(zsets.get('early_access').has('maya@example.com')).toBe(false);
    expect(zsets.get('early_access').has('someone@else.com')).toBe(true);
    expect(rcCalls).toEqual([{ url: 'https://api.revenuecat.com/v1/subscribers/Maya%40Example.com', method: 'DELETE' }]);
    expect(deletedUsers).toEqual(['uid-1']); // Postgres rows go by the cascade from the account
    expect(deletedRows).toEqual([]);
  });

  it('keeps the short-lived anti-abuse counters, so deleting and re-creating gives no second voucher or fresh scans', async () => {
    await call({ mode: 'account', confirm: true });
    for (const k of [`scans:${EMAIL}:2026-10-02`, `voucher_count:${EMAIL}:2026-10`, `redemption_total:${EMAIL}:2026-10`, `donation_count:${EMAIL}:2026-10-02`, `earn_event_count:${EMAIL}:2026-10-02`, `quest_award:${EMAIL}:steps:2026-10-02`]) {
      expect(store.has(k), k).toBe(true);
    }
  });

  it('keeps a used promo code used, but no longer says who used it, and leaves other people\'s alone', async () => {
    await call({ mode: 'account', confirm: true });
    expect(JSON.parse(store.get('promo_used:MAYA-CODE'))).toEqual({ appUserId: null, redeemedAt: '2026-10-01T10:00:00Z' });
    expect(JSON.parse(store.get('promo_used:OTHER-CODE')).appUserId).toBe('other@example.com');
  });

  it('does not match another address that merely starts the same way', async () => {
    store.set('health_snapshot:Maya@Example.com.au:2026-10-02', '{"steps":5}');
    await call({ mode: 'account', confirm: true });
    expect(store.has('health_snapshot:Maya@Example.com.au:2026-10-02')).toBe(true);
    expect(store.has('plus:Maya@Example.com.au')).toBe(true);
  });

  it('treats a RevenueCat 404 (never a customer) as done', async () => {
    rcStatus = 404;
    expect((await call({ mode: 'account', confirm: true })).statusCode).toBe(200);
    expect(deletedUsers).toEqual(['uid-1']);
  });

  it('keeps the account if RevenueCat fails, so it can be retried', async () => {
    rcStatus = 500;
    const res = await call({ mode: 'account', confirm: true });
    expect(res.statusCode).toBe(500);
    expect(res.body.failed).toEqual(['subscription record']);
    expect(deletedUsers).toEqual([]);
  });

  it('keeps the account if Redis fails, and names the part that failed', async () => {
    redisDown = true;
    const res = await call({ mode: 'account', confirm: true });
    expect(res.statusCode).toBe(500);
    expect(res.body.failed).toContain('server cache');
    expect(deletedUsers).toEqual([]);
  });

  it('reports a failure to delete the account itself', async () => {
    authDeleteError = 'boom';
    const res = await call({ mode: 'account', confirm: true });
    expect(res.statusCode).toBe(500);
    expect(res.body.failed).toEqual(['account']);
  });
});

describe('delete-account: mode "data"', () => {
  it('deletes the rows in all 13 tables by the verified user id, keeps the account and RevenueCat, and clears Redis', async () => {
    const res = await call({ mode: 'data', confirm: true });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, mode: 'data' });
    expect(USER_TABLES).toHaveLength(13);
    expect(deletedRows).toEqual(USER_TABLES.map(t => [t, 'uid-1']));
    expect(deletedUsers).toEqual([]);
    expect(rcCalls).toEqual([]);
    expect(store.has(`health_snapshot:${EMAIL}:2026-10-02`)).toBe(false);
  });

  it('carries on after one table fails, then reports which', async () => {
    dbErrors = { periods: 'permission denied' };
    const res = await call({ mode: 'data', confirm: true });
    expect(res.statusCode).toBe(500);
    expect(res.body.failed).toEqual(['periods']);
    expect(deletedRows).toHaveLength(13);
  });
});
