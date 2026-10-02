// Erasing one person's data from the server's own stores (Upstash Redis) and from RevenueCat. Postgres is handled in
// api/delete-account.js (it cascades from auth.users). Everything here is keyed by the account's email.
//
// What is deliberately NOT deleted: the short-lived anti-abuse counters (scans, voucher_count, redemption_total,
// donation_count, earn_event_count, quest_award, meal_scan_points_awarded). They hold only a number, expire on their
// own within 35 days, and deleting them would let someone delete and recreate an account for a second voucher, a
// fresh daily allowance of scans or a reset of the £ cap. The privacy policy says so.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// key prefix -> keys are `${prefix}:${email}` (exact) or `${prefix}:${email}:...` (suffixed by a day, hash or time)
const EXACT_KEYS = ['plus', 'audit_log', 'early_access'];
const SUFFIXED_KEYS = ['health_snapshot', 'meal_ideas', 'meal_ideas_count', 'donation_log'];

// Redis glob characters that could appear in an email address
const escapeGlob = value => value.replace(/[\\*?[\]]/g, '\\$&');

async function scanKeys(match) {
  const found = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, { match, count: 200 });
    found.push(...keys);
    cursor = String(next);
  } while (cursor !== '0');
  return found;
}

/** The addresses to look for: as sent by the app (the case typed at sign-up) and lower-cased (the website's form). */
const variants = email => [...new Set([email, email.toLowerCase()])];

/** Deletes the account's keys. Returns how many were removed. Throws if Redis fails, so the caller can report it. */
export async function deleteRedisData(email) {
  let removed = 0;
  for (const address of variants(email)) {
    const keys = EXACT_KEYS.map(prefix => `${prefix}:${address}`);
    for (const prefix of SUFFIXED_KEYS) keys.push(...await scanKeys(`${prefix}:${escapeGlob(address)}:*`));
    if (keys.length) removed += Number(await redis.del(...keys)) || 0;
    await redis.zrem('early_access', address);
  }
  return removed;
}

/** promo_used:<CODE> stays (a used code must stay used) but no longer says who used it. */
export async function anonymisePromoUse(email) {
  const addresses = new Set(variants(email).map(a => a.toLowerCase()));
  let changed = 0;
  for (const key of await scanKeys('promo_used:*')) {
    const raw = await redis.get(key);
    let record;
    try { record = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
    if (record && typeof record.appUserId === 'string' && addresses.has(record.appUserId.toLowerCase())) {
      await redis.set(key, JSON.stringify({ appUserId: null, redeemedAt: record.redeemedAt }));
      changed += 1;
    }
  }
  return changed;
}

/** Removes the person from RevenueCat (their purchases history there and any promo grant). A 404 means they were never
 * known to it, which is fine. Throws on any other failure. A store subscription is NOT cancelled by this: only the
 * App Store or Google Play can do that, and the app tells the person so. */
export async function deleteRevenueCatSubscriber(email) {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`RevenueCat delete failed: ${response.status}`);
}
