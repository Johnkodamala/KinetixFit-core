// Verifies a Supabase session token sent by the app, so a server-side write into an RLS-protected
// table (quest_claims, points_ledger) is attributed to the account that token actually belongs to —
// never to whatever appUserId string the request body claims. Uses the anon key + the caller's own
// token (not the service-role key), so Postgres RLS is the real backstop even if this code has a bug.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Reads the Bearer token from the request and verifies it with Supabase Auth (anon key + the caller's
 * own token — no elevated privilege needed just to ask "whose token is this"). Returns the verified
 * user id, or null when there's no token, it's invalid, or Supabase isn't configured — callers fall
 * back to their existing (non-Postgres) behaviour in that case, so older app builds that don't send a
 * token keep working exactly as before.
 */
export async function verifiedUserId(req) {
  return (await verifiedUser(req))?.id ?? null;
}

/** The verified account itself — { id, email } — or null on the same terms as verifiedUserId. For things that must go to
 * the account's own address (a voucher) rather than one the request names. */
export async function verifiedUser(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const header = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
