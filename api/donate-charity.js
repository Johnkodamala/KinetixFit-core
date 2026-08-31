// Private serverless endpoint to log a charity donation pledge for later manual/batched
// reconciliation. Does NOT call a live payment API — see project notes: a real programmatic
// donation from company funds needs a JustGiving corporate partner agreement, not a plain API key.
// Points are still earned/tracked entirely client-side today, so this cannot verify a user's real
// balance — it only rate-limits how many donation pledges one user can log per day.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const MAX_DONATIONS_PER_DAY = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { charityId, charityName, pointsValue, appUserId } = req.body;
  if (!charityId || !charityName || !appUserId) {
    return res.status(400).json({ error: 'charityId, charityName and appUserId are required.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const countKey = `donation_count:${appUserId}:${today}`;

  const countToday = Number((await redis.get(countKey)) || 0);
  if (countToday >= MAX_DONATIONS_PER_DAY) {
    return res.status(429).json({ error: `Daily donation limit reached (${MAX_DONATIONS_PER_DAY}/day). Please try again tomorrow.` });
  }

  try {
    const timestamp = new Date().toISOString();
    await redis.set(`donation_log:${appUserId}:${timestamp}`, JSON.stringify({
      charityId, charityName, pointsValue: pointsValue || null, timestamp
    }));
    await redis.set(countKey, countToday + 1, { ex: 60 * 60 * 24 });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Donation logging failed', details: error.message });
  }
}
