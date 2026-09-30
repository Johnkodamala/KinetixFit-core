// api/redeem-promo.js: a valid code grants the RevenueCat entitlement by its *identifier* (`kinetixfit_pro`, not the
// display name "KinetixFit Pro"), each code works once, and nothing is marked used if RevenueCat refuses the grant.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ get: async k => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); }, del: async k => { store.delete(k); } }) },
}));

const { default: handler } = await import('../redeem-promo.js');

function call(body) {
  const res = { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method: 'POST', body, headers: {} }, res).then(() => res);
}

let fetchCalls;
let rcOk;
beforeEach(() => {
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
});
