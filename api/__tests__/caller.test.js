import { afterEach, describe, expect, it, vi } from 'vitest';

let session = null; // what the Bearer token verifies to: { id, email } or null
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => session }));
const { resolveCaller, callerProblem } = await import('../_lib/caller.js');

afterEach(() => { session = null; delete process.env.REQUIRE_SESSION; });

describe('who is calling', () => {
  it('is the account the session and the body both name, in the body’s own spelling (RevenueCat ids are case-sensitive)', async () => {
    session = { id: 'u1', email: 'siva@example.com' };
    expect(await resolveCaller({}, 'Siva@Example.com')).toEqual({ appUserId: 'Siva@Example.com', verified: true, mismatch: false });
    expect(await resolveCaller({}, ' siva@example.com ')).toEqual({ appUserId: 'siva@example.com', verified: true, mismatch: false });
  });

  it('is the session’s account when the body names nobody', async () => {
    session = { id: 'u1', email: 'siva@example.com' };
    expect(await resolveCaller({}, undefined)).toEqual({ appUserId: 'siva@example.com', verified: true, mismatch: false });
    expect(await resolveCaller({}, '')).toEqual({ appUserId: 'siva@example.com', verified: true, mismatch: false });
  });

  it('is a mismatch when the body names someone else than the session: nobody is acted for', async () => {
    session = { id: 'u1', email: 'siva@example.com' };
    expect(await resolveCaller({}, 'someone.else@example.com')).toEqual({ appUserId: null, verified: true, mismatch: true });
  });

  it('is the account the body names when there is no session (an older build), unverified', async () => {
    expect(await resolveCaller({}, 'old@example.com')).toEqual({ appUserId: 'old@example.com', verified: false, mismatch: false });
    expect(await resolveCaller({}, undefined)).toEqual({ appUserId: null, verified: false, mismatch: false });
    expect(await resolveCaller({}, 42)).toEqual({ appUserId: null, verified: false, mismatch: false });
  });

  it('treats a session without an email as no session', async () => {
    session = { id: 'u1', email: null };
    expect(await resolveCaller({}, 'x@example.com')).toEqual({ appUserId: 'x@example.com', verified: false, mismatch: false });
  });
});

describe('what to answer', () => {
  const verified = { appUserId: 'a@example.com', verified: true, mismatch: false };
  const legacy = { appUserId: 'a@example.com', verified: false, mismatch: false };
  const mismatch = { appUserId: null, verified: true, mismatch: true };

  it('refuses a body that names another account, always', () => {
    expect(callerProblem(mismatch, { needsIdentity: true })).toMatchObject({ status: 403, body: { code: 'WRONG_ACCOUNT' } });
    expect(callerProblem(mismatch, { needsIdentity: false })).toMatchObject({ status: 403 });
    process.env.REQUIRE_SESSION = '1';
    expect(callerProblem(mismatch, { needsIdentity: false })).toMatchObject({ status: 403 });
  });

  it('lets a signed-in caller and an older build through while the switch is off', () => {
    expect(callerProblem(verified, { needsIdentity: true })).toBeNull();
    expect(callerProblem(legacy, { needsIdentity: true })).toBeNull();
  });

  it('with REQUIRE_SESSION=1, wants a session wherever the endpoint is about a person, and nowhere else', () => {
    process.env.REQUIRE_SESSION = '1';
    expect(callerProblem(legacy, { needsIdentity: true })).toMatchObject({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(callerProblem(legacy, { needsIdentity: false })).toBeNull();
    expect(callerProblem(verified, { needsIdentity: true })).toBeNull();
  });
});
