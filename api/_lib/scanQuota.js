// Daily limit on photo and barcode scans: 2 a day on the free plan, 10 with KinetixFit Plus.
// Typed food checks don't count. Days follow the phone's time zone (sent by the app; UK time for older builds),
// so the limit resets at the person's own midnight.
// Only successful scans count; if Redis is down the scan is allowed (the limit is a cost guard,
// not a reason to break food checks).
import { Redis } from '@upstash/redis';
import { isPlusUser } from './plus.js';
import { dayKey } from './countries.js';

export const FREE_DAILY_SCANS = 2;
export const PLUS_DAILY_SCANS = 10;

const redis = Redis.fromEnv();

const counterKey = (appUserId, timeZone) => `scans:${appUserId}:${dayKey(timeZone)}`;

// { allowed, plus, limit, used } — call before doing the (paid) scan work.
export async function checkScanQuota(appUserId, timeZone) {
  const plus = await isPlusUser(appUserId, { whenUnknown: true });
  const limit = plus ? PLUS_DAILY_SCANS : FREE_DAILY_SCANS;
  let used = 0;
  try {
    used = Number((await redis.get(counterKey(appUserId, timeZone))) || 0);
  } catch (err) {
    console.error('Scan quota read failed:', err.message);
  }
  return { allowed: used < limit, plus, limit, used, timeZone };
}

// Counts one successful scan; returns how many are left today.
export async function recordScan(appUserId, quota) {
  try {
    const key = counterKey(appUserId, quota.timeZone);
    const used = await redis.incr(key);
    await redis.expire(key, 60 * 60 * 48);
    return Math.max(0, quota.limit - used);
  } catch (err) {
    console.error('Scan quota write failed:', err.message);
    return Math.max(0, quota.limit - quota.used - 1);
  }
}

export function quotaExceededBody(quota) {
  return {
    error: quota.plus
      ? `You've used all ${quota.limit} photo and barcode scans for today. They reset at midnight.`
      : `You've used your ${quota.limit} free photo and barcode scans for today. Kinetix Fit Plus gives you ${PLUS_DAILY_SCANS} a day — or type the food instead.`,
    code: 'SCAN_LIMIT',
    plus: quota.plus,
    scanLimit: quota.limit,
    scansLeft: 0
  };
}
