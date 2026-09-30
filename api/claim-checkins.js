// Private serverless endpoint: the daily check-in award (5 points + 10 XP, and +10 on every 7th day in a row) is given
// here and written to points_ledger, for the account the request's session token belongs to. The phone sends the days
// it has a check-in for; the server gives each once (sending a day again is harmless), so it can simply send the last
// few days whenever it is online. A check-in can only be claimed for today or the last couple of days, so a modified
// app can't fill in a year of them. A request with no valid session is refused.
import { handleCors } from './_lib/cors.js';
import { verifiedUserId } from './_lib/supabaseAuth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { awardCheckIns } from './_lib/pointsLedger.js';

const MAX_DAYS = 7;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dayKey = date => date.toISOString().slice(0, 10);

/** Days a check-in can be claimed for: the server's (UTC) today, back two days (a late check-in, or a phone ahead of
 * UTC whose "today" started before the server's) and forward one (a phone behind UTC). */
export function claimableDays(now = new Date()) {
  const at = offset => dayKey(new Date(now.getTime() + offset * 86400000));
  return { oldest: at(-2), newest: at(1) };
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const userId = await verifiedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Sign in to earn check-in points.', code: 'AUTH_REQUIRED' });
  }
  const admin = supabaseAdmin();
  if (!admin) {
    return res.status(503).json({ error: 'Points are unavailable right now. Please try again later.' });
  }

  const asked = req.body?.days;
  if (!Array.isArray(asked) || asked.length === 0 || asked.length > MAX_DAYS || !asked.every(d => typeof d === 'string' && DAY_PATTERN.test(d))) {
    return res.status(400).json({ error: `days must be 1–${MAX_DAYS} dates like 2026-10-01.` });
  }
  const now = new Date();
  const { oldest, newest } = claimableDays(now);
  const days = asked.filter(d => d >= oldest && d <= newest);

  try {
    const awarded = days.length ? await awardCheckIns(admin, userId, days, dayKey(now)) : { points: 0, xp: 0, streakBonus: 0 };
    if (!awarded) return res.status(503).json({ error: 'Could not check your points right now. Please try again.' });
    return res.status(200).json({ success: true, pointsAwarded: awarded.points, xpAwarded: awarded.xp, streakBonus: awarded.streakBonus, daysSkipped: asked.length - days.length });
  } catch (error) {
    return res.status(500).json({ error: 'Check-in award failed', details: error.message });
  }
}
