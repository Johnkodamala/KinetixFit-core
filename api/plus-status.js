// The signed-in account's Plus status, read from RevenueCat on the server. The app uses it so Plus shows right after a
// promo code or a purchase, and on iOS builds that have no RevenueCat SDK key. The account is the verified session's,
// never anything in the request body (RevenueCat knows people by email, and a guessable email must not be enough).
import { handleCors } from './_lib/cors.js';
import { verifiedUser } from './_lib/supabaseAuth.js';
import { plusStatus } from './_lib/plus.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = await verifiedUser(req);
  if (!user?.email) {
    return res.status(401).json({ error: 'Sign in to see your plan.', code: 'AUTH_REQUIRED' });
  }

  try {
    return res.status(200).json(await plusStatus(user.email));
  } catch (error) {
    console.error('Plus status failed:', error.message);
    return res.status(502).json({ error: 'Could not check your plan right now.', code: 'PLAN_UNKNOWN' });
  }
}
