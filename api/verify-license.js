// Private serverless endpoint to verify corporate subscription status
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { appUserId } = req.body;
  const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY;

  if (!appUserId) {
    return res.status(400).json({ error: 'App User ID is required' });
  }

  try {
    // Cryptographic server-to-server handshake with RevenueCat's secure vault
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${appUserId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    // Check if the "KinetixFit Pro" corporate entitlement is active
    const isActive = data.subscriber?.entitlements?.['KinetixFit Pro']?.expires_date
      ? new Date(data.subscriber.entitlements['KinetixFit Pro'].expires_date) > new Date()
      : false;

    return res.status(200).json({
      status: isActive ? 'Active' : 'Expired/Trial Pending',
      licenseTier: '£14.99/mo Corporate Seat',
      details: data.subscriber || {}
    });
  } catch (error) {
    return res.status(500).json({ error: 'License verification handshake failed', details: error.message });
  }
}
