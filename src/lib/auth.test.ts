// Sign-up and log-in messages (src/lib/auth.ts): the cases Supabase is quiet about, and its errors in plain words.
import { describe, expect, it } from 'vitest';
import { alreadyRegistered, authErrorText, isRecoveryLink, linkErrorText, needsAccountSignIn, sameAccount, signOutThisPhone } from './auth';

describe('sign-up', () => {
  it('knows when the email already had an account (Supabase sends nothing then)', () => {
    expect(alreadyRegistered({ identities: [] })).toBe(true);
    expect(alreadyRegistered({ identities: [{ provider: 'email' }] })).toBe(false);
    expect(alreadyRegistered({})).toBe(false);
    expect(alreadyRegistered(null)).toBe(false);
  });
});

describe('links from the emails', () => {
  it('spots a password-reset link, not other links', () => {
    expect(isRecoveryLink('#access_token=abc&expires_in=3600&refresh_token=x&token_type=bearer&type=recovery')).toBe(true);
    expect(isRecoveryLink('#type=recovery&access_token=abc')).toBe(true);
    expect(isRecoveryLink('', '?type=recovery')).toBe(true);
    expect(isRecoveryLink('#access_token=abc&type=signup')).toBe(false);
    expect(isRecoveryLink('#account/details')).toBe(false);
  });

  it('explains an expired or used link, and says nothing otherwise', () => {
    expect(linkErrorText('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
      .toMatch(/expired or was already used/);
    expect(linkErrorText('#error=server_error')).toMatch(/didn’t work/);
    expect(linkErrorText('#vitals')).toBeNull();
    expect(linkErrorText('')).toBeNull();
  });
});

describe('auth errors in plain words', () => {
  it('an unconfirmed email offers to send the link again', () => {
    const r = authErrorText({ code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 });
    expect(r.resend).toBe(true);
    expect(r.text).toMatch(/Confirm your email/);
    expect(authErrorText({ message: 'Email not confirmed' }).resend).toBe(true);
  });

  it('rate limits, wrong passwords, blocked addresses and network trouble', () => {
    expect(authErrorText({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 }).text).toMatch(/Too many emails/);
    expect(authErrorText({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429 }).text).toMatch(/Too many emails/);
    expect(authErrorText({ code: 'invalid_credentials', message: 'Invalid login credentials' }).text).toMatch(/don’t match/);
    expect(authErrorText({ code: 'email_address_not_authorized', message: 'Email address "a@b.com" cannot be used as it is not authorized' }).text)
      .toMatch(/couldn’t send an email/);
    expect(authErrorText({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).text).toMatch(/Couldn’t reach the server/);
    expect(authErrorText({ code: 'same_password' }).text).toMatch(/current password/);
    expect(authErrorText({ name: 'AuthSessionMissingError', message: 'Auth session missing!' }).text).toMatch(/reset link has expired/);
    expect(authErrorText({ message: 'Something odd' }).text).toBe('Something odd');
    expect(authErrorText({}).text).toMatch(/Something went wrong/);
  });
});

describe('signOutThisPhone', () => {
  it('ends only this phone’s session: supabase signOut() with no scope signs the account out of every phone', async () => {
    const calls: unknown[] = [];
    await signOutThisPhone({ signOut: async (options) => { calls.push(options); return { error: null }; } });
    expect(calls).toEqual([{ scope: 'local' }]);
  });
});

describe('needsAccountSignIn: logged in on the phone, but with no account session', () => {
  const base = { loggedIn: true, configured: true, sessionChecked: true, hasSession: false };
  it('is true when the phone says logged in and has no session: nothing it holds reaches the account', () => {
    expect(needsAccountSignIn(base)).toBe(true);
  });
  it('is false with a session, before the session has been looked for, when logged out, or with no account service', () => {
    expect(needsAccountSignIn({ ...base, hasSession: true })).toBe(false);
    expect(needsAccountSignIn({ ...base, sessionChecked: false })).toBe(false);
    expect(needsAccountSignIn({ ...base, loggedIn: false })).toBe(false);
    expect(needsAccountSignIn({ ...base, configured: false })).toBe(false);
  });
});

describe('sameAccount', () => {
  it('compares emails ignoring case and spaces', () => {
    expect(sameAccount('Siva@Test.dev', ' siva@test.dev ')).toBe(true);
    expect(sameAccount('a@test.dev', 'b@test.dev')).toBe(false);
  });
  it('is false when either is missing', () => {
    expect(sameAccount(null, 'a@test.dev')).toBe(false);
    expect(sameAccount('a@test.dev', undefined)).toBe(false);
    expect(sameAccount('', '')).toBe(false);
  });
});
