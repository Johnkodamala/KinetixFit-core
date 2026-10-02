// api/_lib/plus.js: the server's own check of Plus against RevenueCat. isPlusUser is the contract every paid-feature
// endpoint relies on (scan quota, meal ideas, vouchers); plusStatus adds the expiry for the app's Account page.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ get: async k => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); }, del: async k => { store.delete(k); } }) },
}));

const { isPlusUser, plusStatus, entitlementIsActive } = await import('../_lib/plus.js');

const FUTURE = new Date(Date.now() + 10 * 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

let entitlement;
let subscription;
let rcStatus;
let fetchCalls;
beforeEach(() => {
  store.clear();
  fetchCalls = [];
  entitlement = undefined;
  subscription = undefined;
  rcStatus = 200;
  process.env.REVENUECAT_API_KEY = 'sk_test';
  vi.stubGlobal('fetch', async url => {
    fetchCalls.push(url);
    return {
      ok: rcStatus === 200,
      status: rcStatus,
      json: async () => ({ subscriber: { entitlements: entitlement ? { kinetixfit_pro: entitlement } : {}, subscriptions: subscription ? { [entitlement.product_identifier]: subscription } : {} } }),
    };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('entitlementIsActive', () => {
  it('is false with no entitlement, true when lifetime (null expiry), and follows the expiry date otherwise', () => {
    expect(entitlementIsActive(undefined)).toBe(false);
    expect(entitlementIsActive({ expires_date: null })).toBe(true);
    expect(entitlementIsActive({ expires_date: FUTURE })).toBe(true);
    expect(entitlementIsActive({ expires_date: PAST })).toBe(false);
  });
});

describe('isPlusUser', () => {
  it('is false for no user and never calls RevenueCat', async () => {
    expect(await isPlusUser('')).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });

  it('looks the email up in RevenueCat by identifier-safe URL', async () => {
    entitlement = { expires_date: FUTURE };
    expect(await isPlusUser('a+b@example.com')).toBe(true);
    expect(fetchCalls[0]).toBe('https://api.revenuecat.com/v1/subscribers/a%2Bb%40example.com');
  });

  it('is false for an expired or missing entitlement', async () => {
    entitlement = { expires_date: PAST };
    expect(await isPlusUser('u@example.com')).toBe(false);
    entitlement = undefined;
    expect(await isPlusUser('v@example.com')).toBe(false);
  });

  it('caches the answer, and fresh skips the cached read', async () => {
    entitlement = { expires_date: null };
    expect(await isPlusUser('u@example.com')).toBe(true);
    expect(await isPlusUser('u@example.com')).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(await isPlusUser('u@example.com', { fresh: true })).toBe(true);
    expect(fetchCalls).toHaveLength(2);
  });

  it('returns whenUnknown if RevenueCat fails', async () => {
    rcStatus = 500;
    expect(await isPlusUser('u@example.com')).toBe(false);
    expect(await isPlusUser('u@example.com', { whenUnknown: true })).toBe(true);
  });
});

describe('plusStatus', () => {
  it('reports a lifetime grant', async () => {
    entitlement = { expires_date: null };
    expect(await plusStatus('u@example.com')).toEqual({ plus: true, lifetime: true, expiresAt: null, willRenew: false });
  });

  it('reports the expiry and renewal of a subscription or a promo month', async () => {
    entitlement = { expires_date: FUTURE };
    const status = await plusStatus('u@example.com');
    expect(status).toEqual({ plus: true, lifetime: false, expiresAt: FUTURE, willRenew: false });
  });

  it('says a store subscription renews unless it was cancelled, had a billing problem, or is a promo grant', async () => {
    entitlement = { expires_date: FUTURE, product_identifier: 'plus_monthly' };
    subscription = { store: 'play_store', unsubscribe_detected_at: null, billing_issues_detected_at: null };
    expect((await plusStatus('u@example.com')).willRenew).toBe(true);
    subscription = { store: 'play_store', unsubscribe_detected_at: PAST, billing_issues_detected_at: null };
    expect((await plusStatus('u@example.com')).willRenew).toBe(false);
    subscription = { store: 'play_store', unsubscribe_detected_at: null, billing_issues_detected_at: PAST };
    expect((await plusStatus('u@example.com')).willRenew).toBe(false);
    subscription = { store: 'promotional', unsubscribe_detected_at: null, billing_issues_detected_at: null };
    expect((await plusStatus('u@example.com')).willRenew).toBe(false);
  });

  it('is Free with no expiry for an expired grant or no entitlement', async () => {
    entitlement = { expires_date: PAST };
    expect(await plusStatus('u@example.com')).toEqual({ plus: false, lifetime: false, expiresAt: null, willRenew: false });
    entitlement = undefined;
    expect(await plusStatus('v@example.com')).toEqual({ plus: false, lifetime: false, expiresAt: null, willRenew: false });
  });

  it('always asks RevenueCat (never the cache) and refreshes the cache for the other endpoints', async () => {
    store.set('plus:u@example.com', 0);
    entitlement = { expires_date: null };
    expect((await plusStatus('u@example.com')).plus).toBe(true);
    expect(store.get('plus:u@example.com')).toBe(1);
  });

  it('throws when RevenueCat can not be reached, so the caller can say so', async () => {
    rcStatus = 500;
    await expect(plusStatus('u@example.com')).rejects.toThrow();
  });
});
