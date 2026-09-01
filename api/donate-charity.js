// Private serverless endpoint to log a charity donation pledge for later manual/batched
// reconciliation. Does NOT call a live payment API — see project notes: a real programmatic
// donation from company funds needs a JustGiving corporate partner agreement, not a plain API key.
// Points are still earned/tracked entirely client-side today, so this cannot verify a user's real
// balance — it only rate-limits how many donation pledges one user can log per day, and enforces
// the shared monthly £ redemption cap (see api/_lib/rewardConfig.js).
import { Redis } from '@upstash/redis';
import { getRewardConfig, checkMonthlyRedemptionCap, recordRedemption } from './_lib/rewardConfig.js';
import { logAuditEvent } from './_lib/auditLog.js';

const redis = Redis.fromEnv();
const MAX_DONATIONS_PER_DAY = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { charityId, charityName, appUserId } = req.body;
  if (!charityId || !charityName || !appUserId) {
    return res.status(400).json({ error: 'charityId, charityName and appUserId are required.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const countKey = `donation_count:${appUserId}:${today}`;

  const countToday = Number((await redis.get(countKey)) || 0);
  if (countToday >= MAX_DONATIONS_PER_DAY) {
    return res.status(429).json({ error: `Daily donation limit reached (${MAX_DONATIONS_PER_DAY}/day). Please try again tomorrow.` });
  }

  const config = await getRewardConfig();
  const capCheck = await checkMonthlyRedemptionCap(appUserId, config.donationValueGBP, config);
  if (!capCheck.allowed) {
    return res.status(429).json({ error: capCheck.message });
  }

  try {
    const timestamp = new Date().toISOString();
    await redis.set(`donation_log:${appUserId}:${timestamp}`, JSON.stringify({
      charityId, charityName, valueGBP: config.donationValueGBP, timestamp
    }));
    await redis.set(countKey, countToday + 1, { ex: 60 * 60 * 24 });
    await recordRedemption(appUserId, config.donationValueGBP);
    await logAuditEvent(appUserId, {
      type: 'spend',
      category: 'donation',
      verified: true,
      verificationNote: 'Donation pledge logged.',
      valueGBP: config.donationValueGBP,
      charityId
    });

    return res.status(200).json({ success: true, valueGBP: config.donationValueGBP });
  } catch (error) {
    return res.status(500).json({ error: 'Donation logging failed', details: error.message });
  }
}
