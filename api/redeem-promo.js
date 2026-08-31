// Private serverless endpoint to redeem a promo code for a RevenueCat promotional entitlement.
// Valid codes live server-side only (PROMO_CODES_JSON env var) — never in client code. Redis
// (via Upstash) tracks which codes have already been redeemed so each one works exactly once.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const DURATION_BY_TIER = {
  lifetime: 'lifetime',
  '30day': 'monthly'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code, appUserId } = req.body;
  if (!code || !appUserId) {
    return res.status(400).json({ error: 'Both "code" and "appUserId" are required.' });
  }

  const normalizedCode = code.trim().toUpperCase();

  let validCodes;
  try {
    validCodes = JSON.parse(process.env.PROMO_CODES_JSON || '{}');
  } catch {
    return res.status(500).json({ error: 'Promo code configuration is invalid on the server.' });
  }

  const tier = validCodes[normalizedCode];
  if (!tier || !DURATION_BY_TIER[tier]) {
    return res.status(400).json({ error: 'Invalid promo code.' });
  }

  const usedKey = `promo_used:${normalizedCode}`;
  const alreadyUsed = await redis.get(usedKey);
  if (alreadyUsed) {
    return res.status(409).json({ error: 'This promo code has already been redeemed.' });
  }

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}/entitlements/KinetixFit Pro/promotional`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REVENUECAT_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ duration: DURATION_BY_TIER[tier] })
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return res.status(502).json({ error: 'RevenueCat rejected the entitlement grant.', details: errorBody });
    }

    await redis.set(usedKey, JSON.stringify({ appUserId, redeemedAt: new Date().toISOString() }));

    return res.status(200).json({ success: true, tier });
  } catch (error) {
    return res.status(500).json({ error: 'Promo redemption failed', details: error.message });
  }
}
