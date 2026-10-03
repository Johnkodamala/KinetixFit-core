// api/suggest-meals.js: who the AI meal ideas are for. (Plus is checked per account, and a generation costs a model call.)
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session = null; // the verified session: { id, email } or null
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => session, verifiedUserId: async () => session?.id ?? null }));
const isPlusUser = vi.fn(async () => false); // false: whoever gets past the identity check ends in the same 403 PLUS_REQUIRED
vi.mock('../_lib/plus.js', () => ({ isPlusUser: (...a) => isPlusUser(...a) }));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({ get: async () => null, set: async () => 'OK', incr: async () => 1, expire: async () => 1 }) } }));
const create = vi.fn(async () => { throw new Error('the model must not be called in these tests'); });
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { this.messages = { create }; } } }));

let handler;
beforeAll(async () => { process.env.ANTHROPIC_API_KEY = 'test-key'; ({ default: handler } = await import('../suggest-meals.js')); });
beforeEach(() => { isPlusUser.mockClear(); create.mockClear(); session = null; delete process.env.REQUIRE_SESSION; });

async function call(body) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body }, res);
  return res;
}

describe('who the meal ideas are for', () => {
  it('refuses a body that names another account than the signed-in one, before asking whether it has Plus', async () => {
    session = { id: 'u1', email: 'me@example.com' };
    const res = await call({ appUserId: 'plus.victim@example.com', mealSlot: 'dinner' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'WRONG_ACCOUNT' });
    expect(isPlusUser).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('asks about the signed-in account’s own plan, in the body’s spelling', async () => {
    session = { id: 'u1', email: 'me@example.com' };
    const res = await call({ appUserId: 'Me@Example.com', mealSlot: 'dinner' });
    expect(isPlusUser).toHaveBeenCalledWith('Me@Example.com', { whenUnknown: false });
    expect(res.body).toMatchObject({ code: 'PLUS_REQUIRED' });
  });

  it('still serves an older build with no session', async () => {
    const res = await call({ appUserId: 'old@example.com', mealSlot: 'dinner' });
    expect(isPlusUser).toHaveBeenCalledWith('old@example.com', { whenUnknown: false });
    expect(res.body).toMatchObject({ code: 'PLUS_REQUIRED' });
  });

  it('with REQUIRE_SESSION=1, wants a session', async () => {
    process.env.REQUIRE_SESSION = '1';
    const res = await call({ appUserId: 'old@example.com', mealSlot: 'dinner' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(isPlusUser).not.toHaveBeenCalled();
  });

  it('keeps its own message when no account is named at all', async () => {
    const res = await call({ mealSlot: 'dinner' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in to get meal ideas.' });
  });
});
