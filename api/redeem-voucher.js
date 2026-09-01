// Private serverless endpoint to process verified reward redemptions.
//
// IMPORTANT LIMITATION: pointBalance below is still client-submitted, not checked against a
// server-side point ledger — quest completions are now verified server-side (see
// api/complete-quest.js) and every earn/spend event is audit-logged, but the running point
// *balance* itself still lives client-side. What IS server-enforced here, independent of that:
// the monthly £ redemption cap (see api/_lib/rewardConfig.js) and no-double-redeem via the cap
// counter, since both only depend on tracking successful redemptions, not on point legitimacy.
import { getRewardConfig, checkMonthlyRedemptionCap, recordRedemption } from './_lib/rewardConfig.js';
import { logAuditEvent } from './_lib/auditLog.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, userName, pointBalance, simulatedCadence, todayQuestsCompleted } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'email is required.' });
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
  if (todayQuestsCompleted < 2) {
    return res.status(400).json({
      error: 'EFFORT THRESHOLD UNMET',
      details: 'A minimum of 2 daily quests must be verified to unlock reward redemptions.'
    });
  }

  if (pointBalance < config.voucherPointsCost) {
    return res.status(400).json({
      error: 'INSUFFICIENT BALANCE',
      details: `A minimum of ${config.voucherPointsCost} points is required to cash out a £${config.voucherValueGBP.toFixed(2)} voucher.`
    });
  }

  // 3. Monthly redemption cap — real, server-enforced, independent of point legitimacy.
  const capCheck = await checkMonthlyRedemptionCap(email, config.voucherValueGBP, config);
  if (!capCheck.allowed) {
    return res.status(429).json({ error: capCheck.message });
  }

  const TREMENDOUS_API_KEY = process.env.TREMENDOUS_API_KEY;
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
            name: userName || 'KinetixFit Athlete',
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

    await recordRedemption(email, config.voucherValueGBP);
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
    return res.status(500).json({ error: 'Automated settlement gateway error', details: error.message });
  }
}
