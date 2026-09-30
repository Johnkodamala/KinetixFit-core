// Private serverless endpoint to log a charity donation pledge for later manual/batched
// reconciliation. Does NOT call a live payment API — see project notes: a real programmatic
// donation from company funds needs a JustGiving corporate partner agreement, not a plain API key.
// The points a donation costs are checked against the account's points_ledger balance (the account the request's
// session token belongs to, not anything in the body) and written to the ledger as a spend. A request with no valid
// session is refused. It also rate-limits how many donation pledges one user can log per day, and enforces the shared
// monthly £ redemption cap (see api/_lib/rewardConfig.js).
import { Redis } from '@upstash/redis';
import { getRewardConfig, checkMonthlyRedemptionCap, recordRedemption } from './_lib/rewardConfig.js';
import { logAuditEvent } from './_lib/auditLog.js';
import { handleCors } from './_lib/cors.js';
import { COUNTRY_REWARDS, requestCountry } from './_lib/countries.js';
import { verifiedUserId } from './_lib/supabaseAuth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { ledgerBalance, recordSpend, undoSpend } from './_lib/pointsLedger.js';

const redis = Redis.fromEnv();
const MAX_DONATIONS_PER_DAY = 3;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { charityId, charityName, appUserId } = req.body;
  if (!charityId || !charityName || !appUserId) {
    return res.status(400).json({ error: 'charityId, charityName and appUserId are required.' });
  }

  // Donations are live country by country (api/_lib/countries.js); elsewhere the app shows them as coming soon.
  const country = requestCountry(req.body.country);
  if (!country) return res.status(400).json({ error: 'Unsupported country.' });
  const rules = COUNTRY_REWARDS[country];
  if (!rules.donationsLive) {
    return res.status(403).json({ error: `Charity donations in ${rules.name} are coming soon.`, code: 'COMING_SOON' });
  }
  if (!rules.charities.includes(charityId)) {
    return res.status(400).json({ error: 'That charity isn’t available in your country.' });
  }

  const userId = await verifiedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Sign in again (or update the app) to donate your points.', code: 'AUTH_REQUIRED' });
  }
  const admin = supabaseAdmin();
  if (!admin) {
    return res.status(503).json({ error: 'Donations are unavailable right now. Please try again later.' });
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

  const balance = await ledgerBalance(admin, userId);
  if (!balance) {
    return res.status(503).json({ error: 'Could not check your points right now. Please try again.' });
  }
  if (balance.points < config.donationPointsCost) {
    return res.status(400).json({ error: `A donation costs ${config.donationPointsCost} points.`, code: 'INSUFFICIENT_BALANCE' });
  }

  // Take the points first, then check the balance again: two requests arriving together both pass the check above,
  // but only the ones the balance can cover keep their spend.
  const timestamp = new Date().toISOString();
  const spend = { day: today, awardId: `donation:${timestamp}`, points: config.donationPointsCost };
  if (!(await recordSpend(admin, userId, spend))) {
    return res.status(503).json({ error: 'Could not reserve your points right now. Please try again.' });
  }
  const after = await ledgerBalance(admin, userId);
  if (!after || after.points < 0) {
    await undoSpend(admin, userId, spend);
    return res.status(after ? 400 : 503).json({ error: after ? `A donation costs ${config.donationPointsCost} points.` : 'Could not check your points right now. Please try again.', code: after ? 'INSUFFICIENT_BALANCE' : undefined });
  }

  try {
    await redis.set(`donation_log:${appUserId}:${timestamp}`, JSON.stringify({
      charityId, charityName, country, valueGBP: config.donationValueGBP, timestamp
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

    return res.status(200).json({ success: true, valueGBP: config.donationValueGBP, pointsDeducted: config.donationPointsCost });
  } catch (error) {
    await undoSpend(admin, userId, spend).catch(() => {});
    return res.status(500).json({ error: 'Donation logging failed', details: error.message });
  }
}
