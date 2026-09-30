// The server's side of the points balance: points_ledger (supabase/migrations/0001_source_of_truth.sql) holds one
// row per award (+) or spend (−), and the balance is their sum. Rewards that cost points read it here instead of
// trusting a balance the phone sends. Callers pass a service-role client (supabaseAdmin.js) and a user id that
// supabaseAuth.js's verifiedUserId already checked against the request's session token.

// PostgREST returns at most this many rows per request (Supabase's default max-rows). A ledger that long can't be
// summed from one page, so the balance reads as unknown rather than quietly coming out low. A SQL sum would lift it.
const PAGE_LIMIT = 1000;

/** { points, xp } summed over the user's ledger, or null when it can't be read (callers must not pay out then). */
export async function ledgerBalance(admin, userId) {
  const { data, error } = await admin.from('points_ledger').select('points, xp').eq('user_id', userId);
  if (error || !data || data.length >= PAGE_LIMIT) return null;
  return {
    points: data.reduce((sum, row) => sum + (Number(row.points) || 0), 0),
    xp: data.reduce((sum, row) => sum + (Number(row.xp) || 0), 0),
  };
}

/** Quest ids the user has claimed on `day` (the UTC date api/complete-quest.js files claims under), or null if unreadable. */
export async function claimedQuestIds(admin, userId, day) {
  const { data, error } = await admin.from('quest_claims').select('quest_id').eq('user_id', userId).eq('day', day);
  if (error || !data) return null;
  return data.map(row => row.quest_id);
}

/** Records points leaving the balance. `awardId` must be unique per spend for the day (the ledger's key is user, day,
 * award id). Returns true when the row was written. */
export async function recordSpend(admin, userId, { day, awardId, points }) {
  const { error } = await admin
    .from('points_ledger')
    .insert({ user_id: userId, day, award_id: awardId, points: -Math.abs(points), xp: 0 });
  return !error;
}

/** Takes a spend back out, for a payout that then failed. */
export async function undoSpend(admin, userId, { day, awardId }) {
  const { error } = await admin
    .from('points_ledger')
    .delete()
    .eq('user_id', userId).eq('day', day).eq('award_id', awardId);
  return !error;
}

// ---------------------------------------------------------------------------------------------------
// Earning. Each award is one ledger row, and the same award can never be given twice: the ledger's key is
// (user, day, award id), so an id that names its day (checkin:2026-10-01) is refused by the database itself.
// These numbers are the app's (src/lib/points.ts); api/__tests__/pointsLedger.test.js checks they match.
// ---------------------------------------------------------------------------------------------------
export const CHECKIN_POINTS = 5;
export const CHECKIN_XP = 10;
export const STREAK_WEEK_POINTS = 10;
export const LEVEL_XP = 500;
export const LEVEL_UP_POINTS = 10;

/** Gives an award once. 'granted', 'duplicate' (the ledger already has it), or 'error' (nothing was written). */
export async function grantOnce(admin, userId, { day, awardId, points, xp = 0 }) {
  const { error } = await admin
    .from('points_ledger')
    .insert({ user_id: userId, day, award_id: awardId, points, xp });
  if (!error) return 'granted';
  return error.code === '23505' ? 'duplicate' : 'error';
}

/**
 * Gives the +10 for every level the account's XP has reached and not yet been paid for (level n starts at (n-1) × 500
 * XP, so level 2 is at 500). The level is worked out from the ledger's own XP, not from anything the phone says. A
 * level-up has no day of its own, so "already paid" is read from the ledger, not enforced by its key: two claims
 * landing in the same instant could both pay a level, which is 10 points, so it is left at that.
 * Returns the points granted by this call.
 */
export async function awardLevelUps(admin, userId, day) {
  const { data, error } = await admin.from('points_ledger').select('award_id, xp').eq('user_id', userId);
  if (error || !data || data.length >= PAGE_LIMIT) return 0;
  const xp = data.reduce((sum, row) => sum + (Number(row.xp) || 0), 0);
  const paid = new Set(data.map(row => row.award_id));
  let granted = 0;
  for (let level = 2; level <= Math.floor(xp / LEVEL_XP) + 1; level += 1) {
    if (paid.has(`levelup:${level}`)) continue;
    if ((await grantOnce(admin, userId, { day, awardId: `levelup:${level}`, points: LEVEL_UP_POINTS })) === 'granted') granted += LEVEL_UP_POINTS;
  }
  return granted;
}

const dayNumber = day => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);

/** Length of the run of consecutive days, ending on `day`, that are all in `daysWithCheckIn` (a Set of 'YYYY-MM-DD'). */
export function streakEndingOn(daysWithCheckIn, day) {
  let run = 0;
  for (let n = dayNumber(day); daysWithCheckIn.has(new Date(n * 86400000).toISOString().slice(0, 10)); n -= 1) run += 1;
  return run;
}

/**
 * Gives the check-in award (5 points + 10 XP) for each day in `days`, oldest first, plus the streak bonus when a day
 * completes a week in a row (7, 14, 21…), then any level-ups that XP reached. Days already paid are skipped, so this is
 * safe to send again. Returns what this call newly granted.
 */
export async function awardCheckIns(admin, userId, days, today) {
  const { data, error } = await admin.from('points_ledger').select('award_id').eq('user_id', userId).like('award_id', 'checkin:%');
  if (error || !data) return null;
  const withCheckIn = new Set(data.map(row => row.award_id.slice('checkin:'.length)));
  const out = { points: 0, xp: 0, streakBonus: 0 };
  for (const day of [...new Set(days)].sort()) {
    if (withCheckIn.has(day)) continue;
    const given = await grantOnce(admin, userId, { day, awardId: `checkin:${day}`, points: CHECKIN_POINTS, xp: CHECKIN_XP });
    if (given !== 'granted') {
      if (given === 'duplicate') withCheckIn.add(day);
      continue;
    }
    withCheckIn.add(day);
    out.points += CHECKIN_POINTS;
    out.xp += CHECKIN_XP;
    const run = streakEndingOn(withCheckIn, day);
    if (run > 0 && run % 7 === 0 && (await grantOnce(admin, userId, { day, awardId: `streak:${run}`, points: STREAK_WEEK_POINTS })) === 'granted') {
      out.points += STREAK_WEEK_POINTS;
      out.streakBonus += STREAK_WEEK_POINTS;
    }
  }
  out.points += await awardLevelUps(admin, userId, today);
  return out;
}
