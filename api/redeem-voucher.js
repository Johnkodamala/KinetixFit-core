// Private serverless endpoint to process verified reward redemptions.
//
// The points balance and the "2 quests done today" gate are read from the database (points_ledger, quest_claims) for
// the account the request's session token belongs to — never from the request body, which a modified app could fill
// with anything. A redemption writes a negative points_ledger row. A request with no valid session is refused (older
// app builds sent none). The voucher goes to that account's own email, never to an address in the request body. Also server-enforced: the monthly £ redemption cap and one voucher a month (see
// api/_lib/rewardConfig.js).
import { getRewardConfig, reserveVoucherSlot, releaseVoucherSlot } from './_lib/rewardConfig.js';
import { logAuditEvent } from './_lib/auditLog.js';
import { handleCors } from './_lib/cors.js';
import { COUNTRY_REWARDS, requestCountry, requestDay } from './_lib/countries.js';
import { isPlusUser } from './_lib/plus.js';
import { verifiedUser } from './_lib/supabaseAuth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { ledgerBalance, claimedQuestIds, recordSpend } from './_lib/pointsLedger.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userName, simulatedCadence } = req.body;

  // Vouchers are live country by country (api/_lib/countries.js); elsewhere the app shows them as coming soon.
  const country = requestCountry(req.body.country);
  if (!country || !COUNTRY_REWARDS[country].vouchersLive) {
    return res.status(403).json({ error: `Vouchers in ${COUNTRY_REWARDS[country]?.name ?? 'your country'} are coming soon.`, code: 'COMING_SOON' });
  }

  // Whose points these are comes from the session token, not from anything in the request body.
  const user = await verifiedUser(req);
  const userId = user?.id;
  const email = user?.email;
  const admin = userId ? supabaseAdmin() : null;
  if (!userId || !email) {
    return res.status(401).json({ error: 'Sign in again (or update the app) to swap points for a voucher.', code: 'AUTH_REQUIRED' });
  }
  if (!admin) {
    return res.status(503).json({ error: 'Vouchers are unavailable right now. Please try again later.' });
  }

  // Vouchers (coffee etc.) are a KinetixFit Plus benefit. Checked fresh with RevenueCat and strict: if the
  // check can't be made, no payout.
  if (!(await isPlusUser(email, { fresh: true, whenUnknown: false }))) {
    return res.status(403).json({ error: 'Vouchers are a Kinetix Fit Plus benefit. Upgrade to Plus to swap points for vouchers.', code: 'PLUS_REQUIRED' });
  }

  const config = await getRewardConfig();

  // 1. Stage 1 Anti-Cheat: Validate raw mechanical inputs on the server
  if (simulatedCadence > 350) {
    return res.status(400).json({
      error: 'SECURITY INTERCEPT',
      details: 'Mechanical or software step-shaking simulation flagged (>350 SPM). Payload discarded. Financial settlement blocked.'
    });
  }

  // 2. Stage 2 Anti-Cheat: Validate effort thresholds
  // today's quests are the ones filed under the phone's own day (api/complete-quest.js), else the UTC date
  const today = requestDay(req.body.timeZone);
  const claimedToday = await claimedQuestIds(admin, userId, today);
  const balance = await ledgerBalance(admin, userId);
  if (!claimedToday || !balance) {
    return res.status(503).json({ error: 'Could not check your points right now. Please try again.' });
  }

  if (claimedToday.length < 2) {
    return res.status(400).json({
      error: 'EFFORT THRESHOLD UNMET',
      details: 'A minimum of 2 daily quests must be verified to unlock reward redemptions.'
    });
  }

  if (balance.points < config.voucherPointsCost) {
    return res.status(400).json({
      error: 'INSUFFICIENT BALANCE',
      details: `A minimum of ${config.voucherPointsCost} points is required to cash out a £${config.voucherValueGBP.toFixed(2)} voucher.`
    });
  }

  // 3. One voucher per calendar month — server-enforced, independent of point legitimacy.
  const slot = await reserveVoucherSlot(email, config);
  if (!slot.allowed) {
    return res.status(429).json({ error: slot.message, code: 'VOUCHER_MONTHLY_LIMIT' });
  }

  const TREMENDOUS_API_KEY = process.env.TREMENDOUS_API_KEY || '';
  // Automatically routes to testflight sandbox URL if key begins with 'test_' (case-insensitive)
  const isSandbox = TREMENDOUS_API_KEY.toLowerCase().startsWith('test_');
  const baseURL = isSandbox ? 'https://testflight.tremendous.com' : 'https://api.tremendous.com';

  try {
    // 4. Programmatic API Order Payload to reward clearinghouse
    // NOTE: `products` intentionally omitted (was hardcoded to real UK coffee brand codes,
    // a white-label violation) — Tremendous uses the account's default campaign/catalog
    // instead. Confirm the real generic product code for your Tremendous account if you want
    // to restrict this to a specific category.
    const response = await fetch(`${baseURL}/api/v2/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TREMENDOUS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payment: {
          funding_source_id: 'balance' // Debits pre-funded corporate float wallet
        },
        reward: {
          value: {
            denomination: config.voucherValueGBP,
            currency_code: 'GBP'
          },
          recipient: {
            name: userName || 'Kinetix Fit Athlete',
            email: email
          },
          delivery: {
            method: 'EMAIL'
          }
        }
      })
    });

    const orderData = await response.json();

    if (!response.ok) {
      throw new Error(orderData.errors?.[0]?.message || 'Reward provider error');
    }

    // The voucher is ordered, so the points go. The monthly slot above already stops a second redemption racing this one.
    // If the write fails the order still stands: say so loudly so it can be put right by hand.
    const spent = await recordSpend(admin, userId, { day: today, awardId: 'voucher', points: config.voucherPointsCost });
    if (!spent) console.error(`Voucher ordered for ${userId} but the points_ledger spend row was not written`);

    await logAuditEvent(email, {
      type: 'spend',
      category: 'voucher_redemption',
      verified: true,
      verificationNote: 'Real Tremendous order placed.',
      valueGBP: config.voucherValueGBP,
      pointsDeducted: config.voucherPointsCost
    });

    return res.status(200).json({
      status: 'Settled',
      transactionId: `TX-TRE-${Math.floor(1000 + Math.random() * 9000)}`,
      recipient: email,
      valueGBP: config.voucherValueGBP,
      message: `£${config.voucherValueGBP.toFixed(2)} Coffee Voucher programmatically ordered and queued for email delivery!`,
      data: orderData.order
    });
  } catch (error) {
    await releaseVoucherSlot(slot).catch(() => {});
    return res.status(500).json({ error: 'Automated settlement gateway error', details: error.message });
  }
}
