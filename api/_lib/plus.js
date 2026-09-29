// KinetixFit Plus membership, checked server-side against RevenueCat so the app can't just claim it.
// ENTITLEMENT_ID is the entitlement *identifier* in the RevenueCat dashboard; customers see "KinetixFit Plus".
// Promo codes (redeem-promo.js) grant this same entitlement.
import { Redis } from '@upstash/redis';

export const ENTITLEMENT_ID = 'KinetixFit Pro';

const redis = Redis.fromEnv();
const CACHE_SECONDS = 5 * 60;

// Active = granted and not expired. RevenueCat reports lifetime grants with expires_date null.
export function entitlementIsActive(entitlement, now = new Date()) {
  if (!entitlement) return false;
  if (entitlement.expires_date === null) return true;
  return new Date(entitlement.expires_date) > now;
}

async function fetchPlusFromRevenueCat(appUserId) {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` }
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed: ${response.status}`);
  const data = await response.json();
  return entitlementIsActive(data.subscriber?.entitlements?.[ENTITLEMENT_ID]);
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
