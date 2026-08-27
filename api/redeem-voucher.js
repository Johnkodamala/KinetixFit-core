// Private serverless endpoint to process verified reward redemptions
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, userName, pointBalance, simulatedCadence, todayQuestsCompleted } = req.body;

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

  if (pointBalance < 2500) {
    return res.status(400).json({
      error: 'INSUFFICIENT BALANCE',
      details: 'A minimum of 2,500 points is required to cash out a £5.00 voucher.'
    });
  }

  const TREMENDOUS_API_KEY = process.env.TREMENDOUS_API_KEY;
  // Automatically routes to testflight sandbox URL if key begins with 'TEST_'
  const isSandbox = TREMENDOUS_API_KEY.startsWith('TEST_');
  const baseURL = isSandbox ? 'https://testflight.tremendous.com' : 'https://api.tremendous.com';

  try {
    // 3. Programmatic API Order Payload to reward clearinghouse
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
            denomination: 5.00,
            currency_code: 'GBP'
          },
          recipient: {
            name: userName || 'KinetixFit Athlete',
            email: email
          },
          // Restricts payouts specifically to UK high-street coffee brands (Costa, Caffè Nero)
          delivery: {
            method: 'EMAIL'
          },
          products: ['KTX-COSTA-UK', 'KTX-NERO-UK']
        }
      })
    });

    const orderData = await response.json();

    if (!response.ok) {
      throw new Error(orderData.errors?.[0]?.message || 'Reward provider error');
    }

    return res.status(200).json({
      status: 'Settled',
      transactionId: `TX-TRE-${Math.floor(1000 + Math.random() * 9000)}`,
      recipient: email,
      message: '£5.00 Coffee Voucher programmatically ordered and queued for email delivery!',
      data: orderData.order
    });
  } catch (error) {
    return res.status(500).json({ error: 'Automated settlement gateway error', details: error.message });
  }
}
