// KinetixFit Plus membership, checked server-side against RevenueCat so the app can't just claim it.
// ENTITLEMENT_ID is the entitlement *identifier* in the RevenueCat dashboard; customers see "KinetixFit Plus".
// Promo codes (redeem-promo.js) grant this same entitlement.
import { Redis } from '@upstash/redis';

export const ENTITLEMENT_ID = 'kinetixfit_pro';

const redis = Redis.fromEnv();
const CACHE_SECONDS = 5 * 60;

// Active = granted and not expired. RevenueCat reports lifetime grants with expires_date null.
export function entitlementIsActive(entitlement, now = new Date()) {
  if (!entitlement) return false;
  if (entitlement.expires_date === null) return true;
  return new Date(entitlement.expires_date) > now;
}

// The subscriber's entitlement plus the subscription behind it, as RevenueCat reports them.
async function fetchSubscriber(appUserId) {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` }
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed: ${response.status}`);
  const data = await response.json();
  const entitlement = data.subscriber?.entitlements?.[ENTITLEMENT_ID];
  return { entitlement, subscription: entitlement ? data.subscriber?.subscriptions?.[entitlement.product_identifier] : undefined };
}

async function fetchPlusFromRevenueCat(appUserId) {
  return entitlementIsActive((await fetchSubscriber(appUserId)).entitlement);
}

// Plus for the Account page: whether it's active, when it ends, whether a store subscription will renew and whether it's a promo grant. Always asks
// RevenueCat (a promo grant or a purchase must show straight away), then refreshes the cache the other endpoints read.
// Throws if RevenueCat can't be reached, so the caller can tell "unknown" from "Free".
export async function plusStatus(appUserId) {
  const { entitlement, subscription } = await fetchSubscriber(appUserId);
  const plus = entitlementIsActive(entitlement);
  try { await redis.set(`plus:${appUserId}`, plus ? 1 : 0, { ex: CACHE_SECONDS }); } catch { /* cache is optional */ }
  if (!plus) return { plus: false, lifetime: false, expiresAt: null, willRenew: false, promo: false };
  const lifetime = entitlement.expires_date === null;
  // A promo code (redeem-promo.js) is a free grant, not a store subscription: RevenueCat lists it as store "promotional" with a
  // product named rc_promo_<entitlement>_<monthly|lifetime>. Nothing is billed for it and there is no store account behind it.
  const promo = subscription?.store === 'promotional' || String(entitlement.product_identifier ?? '').startsWith('rc_promo_');
  // A store subscription renews unless the user cancelled it or the payment failed; a promo grant never does.
  const willRenew = !lifetime && !promo && !!subscription
    && !subscription.unsubscribe_detected_at && !subscription.billing_issues_detected_at;
  return { plus: true, lifetime, expiresAt: lifetime ? null : entitlement.expires_date, willRenew, promo };
}

// Returns true/false. When RevenueCat can't be reached, returns `whenUnknown` — callers choose: generous for
// scan limits (a paying user shouldn't be blocked by an outage), strict for anything that pays out money.
export async function isPlusUser(appUserId, { whenUnknown = false, fresh = false } = {}) {
  if (!appUserId) return false;
  const cacheKey = `plus:${appUserId}`;
  if (!fresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached === 1 || cached === '1') return true;
      if (cached === 0 || cached === '0') return false;
    } catch { /* cache is optional */ }
  }
  try {
    const plus = await fetchPlusFromRevenueCat(appUserId);
    try { await redis.set(cacheKey, plus ? 1 : 0, { ex: CACHE_SECONDS }); } catch { /* cache is optional */ }
    return plus;
  } catch (err) {
    console.error('Plus check failed:', err.message);
    return whenUnknown;
  }
}

// Forget the cached answer, e.g. right after a promo code grants Plus.
export async function clearPlusCache(appUserId) {
  try { await redis.del(`plus:${appUserId}`); } catch { /* cache is optional */ }
}
