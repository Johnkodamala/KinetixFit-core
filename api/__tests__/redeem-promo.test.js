// api/redeem-promo.js: a valid code grants the RevenueCat entitlement by its *identifier* (`kinetixfit_pro`, not the
// display name "KinetixFit Pro"), each code works once, and nothing is marked used if RevenueCat refuses the grant.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ get: async k => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); }, del: async k => { store.delete(k); } }) },
}));

let mockUser = null;
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => mockUser }));

const { default: handler } = await import('../redeem-promo.js');

function call(body) {
  const res = { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method: 'POST', body, headers: {} }, res).then(() => res);
}

let fetchCalls;
let rcOk;
beforeEach(() => {
  mockUser = null;
  store.clear();
  fetchCalls = [];
  rcOk = true;
  process.env.PROMO_CODES_JSON = JSON.stringify({ 'MONTH-1': '30day', 'FOREVER-1': 'lifetime' });
  process.env.REVENUECAT_API_KEY = 'sk_test';
  vi.stubGlobal('fetch', async (url, opts) => {
    fetchCalls.push({ url, body: JSON.parse(opts.body) });
    return { ok: rcOk, json: async () => ({}) };
  });
});

describe('redeem-promo', () => {
  it('grants a month of the kinetixfit_pro entitlement for a 30day code', async () => {
    const res = await call({ code: ' month-1 ', appUserId: 'user-1' });
    expect(res.statusCode).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.revenuecat.com/v1/subscribers/user-1/entitlements/kinetixfit_pro/promotional');
    expect(fetchCalls[0].body).toEqual({ duration: 'monthly' });
  });

  it('grants lifetime for a lifetime code', async () => {
    await call({ code: 'FOREVER-1', appUserId: 'user-1' });
    expect(fetchCalls[0].body).toEqual({ duration: 'lifetime' });
  });

  it('works once per code', async () => {
    expect((await call({ code: 'MONTH-1', appUserId: 'user-1' })).statusCode).toBe(200);
    expect((await call({ code: 'MONTH-1', appUserId: 'user-2' })).statusCode).toBe(409);
    expect(fetchCalls).toHaveLength(1);
  });

  it('rejects unknown codes without calling RevenueCat', async () => {
    expect((await call({ code: 'NOPE', appUserId: 'user-1' })).statusCode).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it('does not use up the code when RevenueCat refuses the grant', async () => {
    rcOk = false;
    expect((await call({ code: 'MONTH-1', appUserId: 'user-1' })).statusCode).toBe(502);
    rcOk = true;
    expect((await call({ code: 'MONTH-1', appUserId: 'user-1' })).statusCode).toBe(200);
  });

  // A signed-in app (1.9+) sends its session; the grant then goes to that account, whatever the body says.
  it('grants the verified account, and accepts a body that names the same account in another case', async () => {
    mockUser = { id: 'uid-1', email: 'Real@Example.com' };
    expect((await call({ code: 'MONTH-1', appUserId: 'real@example.com' })).statusCode).toBe(200);
    expect(fetchCalls[0].url).toBe('https://api.revenuecat.com/v1/subscribers/Real%40Example.com/entitlements/kinetixfit_pro/promotional');
  });

  it('grants the verified account when the body names no one', async () => {
    mockUser = { id: 'uid-1', email: 'real@example.com' };
    expect((await call({ code: 'MONTH-1' })).statusCode).toBe(200);
    expect(fetchCalls[0].url).toContain('/subscribers/real%40example.com/');
  });

  it('refuses a session whose account differs from the one in the body, before using up the code', async () => {
    mockUser = { id: 'uid-1', email: 'real@example.com' };
    expect((await call({ code: 'MONTH-1', appUserId: 'victim@example.com' })).statusCode).toBe(403);
    expect(fetchCalls).toHaveLength(0);
    expect(store.size).toBe(0);
  });

  it('still takes the body account when there is no session (apps up to 1.8 send none)', async () => {
    expect((await call({ code: 'MONTH-1', appUserId: 'old-app@example.com' })).statusCode).toBe(200);
    expect(fetchCalls[0].url).toContain('/subscribers/old-app%40example.com/');
  });

  it('needs a code, and an account from the session or the body', async () => {
    expect((await call({ appUserId: 'u@example.com' })).statusCode).toBe(400);
    expect((await call({ code: 'MONTH-1' })).statusCode).toBe(400);
  });
});
