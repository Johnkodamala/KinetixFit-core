// Shared reward economics + monthly redemption cap enforcement. Centralized here so unit
// costs and the cap can be adjusted (by writing to the `config:rewards` Redis key) without a
// redeploy, and so the cap logic isn't duplicated across redeem-voucher/donate-charity/scan-meal.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const DEFAULT_CONFIG = {
  voucherValueGBP: 5.00,
  // 1,000 since 1 Oct 2026 (was 1,500, and 2,500 before 28 Sep): about a month of doing everything, the same as a charity
  // donation. Same as src/lib/points.ts VOUCHER_POINTS.
  voucherPointsCost: 1000,
  donationValueGBP: 2.50,
  donationPointsCost: 1000,
  // today's first food scan (once a day). Small, like every award since 28 Sep 2026: a perfect month comes to about
  // 1,000 points (src/lib/points.ts). NB a `config:rewards` value in Redis overrides this default.
  mealScanPointsAward: 2,
  // £ cap for charity donations. Vouchers aren't counted against it — they have their own limit below
  // (the £5 voucher could never fit under a £3 cap, so vouchers were impossible to redeem).
  monthlyRedemptionCapGBP: 3.00,
  voucherMonthlyLimit: 1 // one coffee voucher per person per calendar month
};

export async function getRewardConfig() {
  try {
    const stored = await redis.get('config:rewards');
    if (stored) {
      return { ...DEFAULT_CONFIG, ...(typeof stored === 'string' ? JSON.parse(stored) : stored) };
    }
  } catch (err) {
    console.warn('Failed to read config:rewards from Redis, using defaults:', err.message);
  }
  return DEFAULT_CONFIG;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function firstOfNextMonthLabel(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// Returns { allowed: true } or { allowed: false, message } — never throws for a normal cap hit.
export async function checkMonthlyRedemptionCap(appUserId, valueGBP, config) {
  const key = `redemption_total:${appUserId}:${monthKey()}`;
  const currentTotal = Number((await redis.get(key)) || 0);

  if (currentTotal + valueGBP > config.monthlyRedemptionCapGBP) {
    return {
      allowed: false,
      message: `You've reached this month's redemption limit — resets on ${firstOfNextMonthLabel()}.`
    };
  }
  return { allowed: true, key, currentTotal };
}

export async function recordRedemption(appUserId, valueGBP) {
  const key = `redemption_total:${appUserId}:${monthKey()}`;
  const newTotal = await redis.incrbyfloat(key, valueGBP);
  // Expire ~35 days out so old monthly counters don't accumulate forever.
  await redis.expire(key, 60 * 60 * 24 * 35);
  return newTotal;
}

// One-per-month voucher limit. Reserves the slot atomically (INCR first) so two taps at once can't both
// get a voucher; call releaseVoucherSlot if the order then fails, so the user can try again.
export async function reserveVoucherSlot(appUserId, config) {
  const key = `voucher_count:${appUserId}:${monthKey()}`;
  const count = await redis.incr(key);
  await redis.expire(key, 60 * 60 * 24 * 35);
  if (count > config.voucherMonthlyLimit) {
    await redis.decr(key);
    return {
      allowed: false,
      message: `You've had this month's coffee voucher — the next one unlocks on ${firstOfNextMonthLabel()}.`
    };
  }
  return { allowed: true, key };
}

export async function releaseVoucherSlot(slot) {
  if (slot?.key) await redis.decr(slot.key);
}
