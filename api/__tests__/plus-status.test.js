// api/plus-status.js: the signed-in account's Plus status. The account comes from the verified session only.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockUser;
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => mockUser }));
let status;
let looked;
vi.mock('../_lib/plus.js', () => ({
  plusStatus: async email => {
    looked.push(email);
    if (status instanceof Error) throw status;
    return status;
  },
}));

const { default: handler } = await import('../plus-status.js');

function call({ method = 'POST', body = {}, headers = {} } = {}) {
  const res = { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method, body, headers }, res).then(() => res);
}

beforeEach(() => {
  mockUser = { id: 'uid-1', email: 'real@example.com' };
  status = { plus: true, lifetime: false, expiresAt: '2026-11-01T00:00:00Z', willRenew: false };
  looked = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('plus-status', () => {
  it('returns the plan of the verified account', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(status);
    expect(looked).toEqual(['real@example.com']);
  });

  it('ignores an email in the body: the session decides whose plan it is', async () => {
    await call({ body: { appUserId: 'someone-else@example.com', email: 'someone-else@example.com' } });
    expect(looked).toEqual(['real@example.com']);
  });

  it('answers 401 AUTH_REQUIRED without a verified session, and never asks RevenueCat', async () => {
    mockUser = null;
    const res = await call({ body: { appUserId: 'someone-else@example.com' } });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(looked).toEqual([]);
  });

  it('answers 502 PLAN_UNKNOWN when RevenueCat can not be reached (not "Free")', async () => {
    status = new Error('RevenueCat subscriber lookup failed: 500');
    const res = await call();
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('PLAN_UNKNOWN');
  });

  it('only takes POST', async () => {
    expect((await call({ method: 'GET' })).statusCode).toBe(405);
  });

  it('answers the native preflight for the iOS and Android origins', async () => {
    const res = await call({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } });
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
  });
});
