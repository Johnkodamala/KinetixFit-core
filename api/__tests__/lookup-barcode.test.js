// api/lookup-barcode.js: who it acts for (a barcode scan spends the account's daily scans).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session = null; // the verified session: { id, email } or null
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => session, verifiedUserId: async () => session?.id ?? null }));
const quota = { allowed: true, plus: false, limit: 2, used: 0 };
const checkScanQuota = vi.fn(async () => quota);
vi.mock('../_lib/scanQuota.js', () => ({
  checkScanQuota: (...a) => checkScanQuota(...a),
  recordScan: vi.fn(async () => 1),
  quotaExceededBody: vi.fn(q => ({ error: 'Daily scan limit reached', code: 'SCAN_LIMIT', limit: q.limit })),
}));

let handler;
beforeAll(async () => { ({ default: handler } = await import('../lookup-barcode.js')); });
beforeEach(() => {
  checkScanQuota.mockClear();
  session = null;
  delete process.env.REQUIRE_SESSION;
  // Open Food Facts is down: whoever gets past the identity check ends in the same, harmless 502
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
});

async function call(body) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body }, res);
  return res;
}

describe('who a barcode scan is for', () => {
  it('refuses a body that names another account than the signed-in one, and spends none of its scans', async () => {
    session = { id: 'u1', email: 'me@example.com' };
    const res = await call({ barcode: '5000000000000', appUserId: 'victim@example.com' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'WRONG_ACCOUNT' });
    expect(checkScanQuota).not.toHaveBeenCalled();
  });

  it('serves the signed-in account, in the body’s own spelling', async () => {
    session = { id: 'u1', email: 'me@example.com' };
    const res = await call({ barcode: '5000000000000', appUserId: 'Me@Example.com' });
    expect(res.statusCode).toBe(502); // got as far as Open Food Facts
    expect(checkScanQuota).toHaveBeenCalledWith('Me@Example.com', undefined);
  });

  it('still serves an older build with no session', async () => {
    const res = await call({ barcode: '5000000000000', appUserId: 'old@example.com' });
    expect(res.statusCode).toBe(502);
    expect(checkScanQuota).toHaveBeenCalledWith('old@example.com', undefined);
  });

  it('with REQUIRE_SESSION=1, wants a session', async () => {
    process.env.REQUIRE_SESSION = '1';
    const res = await call({ barcode: '5000000000000', appUserId: 'old@example.com' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(checkScanQuota).not.toHaveBeenCalled();
  });

  it('keeps its own messages for a missing barcode or no account at all', async () => {
    expect((await call({ appUserId: 'old@example.com' })).statusCode).toBe(400);
    const res = await call({ barcode: '5000000000000' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in to scan a barcode.' });
  });
});
