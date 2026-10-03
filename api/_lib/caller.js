// Who is calling an endpoint that costs money or counts something per person (a photo scan, a barcode scan, AI meal ideas).
//
// Until now these endpoints took the account from the request body ("appUserId": the email), so anyone could name someone
// else's email and use their Plus plan, spend their daily scans or read their meal-idea quota. The app sends the Supabase
// session as a Bearer token; this checks the body against it:
//  - a session that names the same account (any case) is the caller. The body's own spelling is kept, because Redis keys and
//    RevenueCat's customer ids are made from it and RevenueCat ids are case-sensitive;
//  - a body that names a DIFFERENT account than the session is refused (403);
//  - no session at all is an older app build (up to 1.8, and 1.9's meal ideas and barcodes): it still works as before,
//    unless the server is switched to REQUIRE_SESSION=1 (Vercel environment variable) once those builds are gone.
import { verifiedUser } from './supabaseAuth.js';

/** { appUserId, verified, mismatch }: the account to act for (null when none was named or the body names someone else). */
export async function resolveCaller(req, claimed) {
  const named = typeof claimed === 'string' ? claimed.trim() : '';
  const user = await verifiedUser(req);
  if (user?.email) {
    if (named && named.toLowerCase() !== user.email.toLowerCase()) return { appUserId: null, verified: true, mismatch: true };
    return { appUserId: named || user.email, verified: true, mismatch: false };
  }
  return { appUserId: named || null, verified: false, mismatch: false };
}

/** The reply to send instead of doing the work, or null when the caller may go on. `needsIdentity`: the endpoint is about a
 *  person (a quota, a plan), not just a lookup. */
export function callerProblem(caller, { needsIdentity }) {
  if (caller.mismatch) {
    return { status: 403, body: { error: 'This request can only be made for the account you are signed in to.', code: 'WRONG_ACCOUNT' } };
  }
  if (needsIdentity && !caller.verified && process.env.REQUIRE_SESSION === '1') {
    return { status: 401, body: { error: 'Sign in again to continue.', code: 'AUTH_REQUIRED' } };
  }
  return null;
}
