import { describe, it, expect, vi, beforeEach } from 'vitest';

let headers: Record<string, string> = { Authorization: 'Bearer good-token' };
vi.mock('./sessionToken', () => ({ bearerHeader: async () => headers }));
vi.mock('./server', () => ({ serverUrl: (path: string) => `https://server.test${path}` }));

import { billingNote, canManageSubscription, fetchPlusStatus, planLabel, type PlusStatus } from './plusStatus';

const fetchMock = vi.fn();
beforeEach(() => {
  headers = { Authorization: 'Bearer good-token' };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('fetchPlusStatus', () => {
  it('posts to the server with the session token and returns the plan', async () => {
    const plan = { plus: true, lifetime: false, expiresAt: '2026-11-01T00:00:00Z', willRenew: true, promo: false };
    fetchMock.mockResolvedValue({ ok: true, json: async () => plan });
    expect(await fetchPlusStatus()).toEqual(plan);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://server.test/api/plus-status');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer good-token' });
  });

  it('does not ask when signed out', async () => {
    headers = {};
    expect(await fetchPlusStatus()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is null (unknown, never "Free") on a server error, a bad answer or no network', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await fetchPlusStatus()).toBeNull();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ nonsense: 1 }) });
    expect(await fetchPlusStatus()).toBeNull();
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await fetchPlusStatus()).toBeNull();
  });

  it('fills the optional fields an older answer leaves out', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ plus: false }) });
    expect(await fetchPlusStatus()).toEqual({ plus: false, lifetime: false, expiresAt: null, willRenew: false, promo: false });
  });

  it('carries whether the grant is a promo code, and treats an older answer as a store plan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ plus: true, lifetime: false, expiresAt: '2026-11-03T17:44:18Z', willRenew: false, promo: true }) });
    expect((await fetchPlusStatus())?.promo).toBe(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ plus: true, lifetime: false, expiresAt: '2026-11-03T17:44:18Z', willRenew: false }) });
    expect((await fetchPlusStatus())?.promo).toBe(false);
  });
});

describe('planLabel', () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  it('words each plan the way Account always has', () => {
    expect(planLabel({ plus: false, lifetime: false, expiresAt: null, willRenew: false, promo: false }, fmt)).toBe('Free plan');
    expect(planLabel({ plus: true, lifetime: true, expiresAt: null, willRenew: false, promo: false }, fmt)).toBe('Kinetix Fit Plus · lifetime');
    expect(planLabel({ plus: true, lifetime: false, expiresAt: '2026-11-01T00:00:00Z', willRenew: true, promo: false }, fmt)).toBe('Kinetix Fit Plus · renews 2026-11-01');
    expect(planLabel({ plus: true, lifetime: false, expiresAt: '2026-11-01T00:00:00Z', willRenew: false, promo: false }, fmt)).toBe('Kinetix Fit Plus · ends 2026-11-01');
  });
});

describe('what Plan & billing says about billing', () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const store: PlusStatus = { plus: true, lifetime: false, expiresAt: '2026-11-01T00:00:00Z', willRenew: true, promo: false };
  const promoMonth: PlusStatus = { plus: true, lifetime: false, expiresAt: '2026-11-03T17:44:18Z', willRenew: false, promo: true };
  const promoForever: PlusStatus = { plus: true, lifetime: true, expiresAt: null, willRenew: false, promo: true };

  it('a store subscription is billed through the store, and can be managed there', () => {
    expect(billingNote(store, 'Google Play', fmt)).toBe('Billed through your Google Play account; cancel any time.');
    expect(billingNote(store, 'App Store', fmt)).toBe('Billed through your App Store account; cancel any time.');
    expect(canManageSubscription(store)).toBe(true);
    // a cancelled one still has a store account behind it
    expect(canManageSubscription({ ...store, willRenew: false })).toBe(true);
  });

  it('a promo code is free: nothing is billed, nothing renews, and there is nothing to manage in a store', () => {
    expect(billingNote(promoMonth, 'Google Play', fmt)).toBe('Plus is free for you until 2026-11-03. Nothing is billed, and it won’t renew.');
    expect(billingNote(promoForever, 'Google Play', fmt)).toBe('Plus is yours for good. Nothing is billed.');
    expect(canManageSubscription(promoMonth)).toBe(false);
    expect(canManageSubscription(promoForever)).toBe(false);
  });
});
