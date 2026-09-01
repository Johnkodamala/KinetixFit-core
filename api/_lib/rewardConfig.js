// Shared reward economics + monthly redemption cap enforcement. Centralized here so unit
// costs and the cap can be adjusted (by writing to the `config:rewards` Redis key) without a
// redeploy, and so the cap logic isn't duplicated across redeem-voucher/donate-charity/scan-meal.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const DEFAULT_CONFIG = {
  voucherValueGBP: 5.00,
  voucherPointsCost: 2500,
  donationValueGBP: 2.50,
  donationPointsCost: 1000,
  mealScanPointsAward: 50,
  monthlyRedemptionCapGBP: 3.00
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
