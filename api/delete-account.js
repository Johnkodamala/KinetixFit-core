// Erases the signed-in person's data, for the in-app "Delete account or data" (required by Google Play and the App Store).
//   mode 'account': everything, then the account itself (they can no longer sign in)
//   mode 'data':    everything, but the account stays (they can sign in again and start fresh)
// Only the verified session decides whose data it is. Order matters so a failure can be retried: the account itself is
// removed last, and only if everything before it worked.
import { handleCors } from './_lib/cors.js';
import { verifiedUser } from './_lib/supabaseAuth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { anonymisePromoUse, deleteRedisData, deleteRevenueCatSubscriber } from './_lib/accountData.js';
import { clearPlusCache } from './_lib/plus.js';

// Every table keyed by user_id (supabase/migrations/0001_source_of_truth.sql). Deleting the account cascades to all of
// them; 'data' mode deletes the rows and keeps the account.
export const USER_TABLES = [
  'profiles', 'preferences', 'saved_foods', 'food_log_entries', 'water_logs', 'workouts', 'gut_checks',
  'morning_checkins', 'periods', 'vitals_history', 'points_ledger', 'streaks', 'quest_claims',
];

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = await verifiedUser(req);
  if (!user?.id || !user.email) {
    return res.status(401).json({ error: 'Sign in again to delete your data.', code: 'AUTH_REQUIRED' });
  }

  const { mode, confirm } = req.body ?? {};
  if (mode !== 'account' && mode !== 'data') {
    return res.status(400).json({ error: 'Choose what to delete: "account" or "data".' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'Deleting needs your confirmation.' });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    return res.status(503).json({ error: 'Deleting is not available right now. Please try again later.' });
  }

  const failed = [];
  const attempt = async (name, work) => {
    try { await work(); } catch (error) { console.error(`Delete ${name} failed:`, error.message); failed.push(name); }
  };

  await attempt('server cache', async () => { await deleteRedisData(user.email); await anonymisePromoUse(user.email); await clearPlusCache(user.email); });
  if (mode === 'account') await attempt('subscription record', () => deleteRevenueCatSubscriber(user.email));
  if (mode === 'data') {
    for (const table of USER_TABLES) {
      await attempt(table, async () => {
        const { error } = await admin.from(table).delete().eq('user_id', user.id);
        if (error) throw new Error(error.message);
      });
    }
  }
  // The account goes last, and only when the rest worked: a retry then still finds the account to sign in to.
  if (mode === 'account' && failed.length === 0) {
    await attempt('account', async () => {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw new Error(error.message);
    });
  }

  if (failed.length > 0) {
    return res.status(500).json({ error: 'Some of your data could not be deleted. Nothing was lost; please try again.', failed });
  }
  return res.status(200).json({ success: true, mode });
}
