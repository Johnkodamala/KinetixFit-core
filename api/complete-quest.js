// Private serverless endpoint: server-side quest completion, verified against real synced device
// data where a real data source exists. Points are awarded either way (soft-allow, per product
// decision) — what changes is whether the event is logged as verified or not, and why:
//
//   - 'activity'/'recovery'/'nutrition' quests: verified against real synced data when available;
//     unverified simply means no device is connected / nothing synced today yet — this CAN become
//     verified later once the user connects a device.
//   - 'unverifiable_by_design' quests (hydration): no wearable measures water intake. This is
//     permanently unverified, by design, not a gap waiting to be fixed.
//
// Rate-limited (max earn-events/day) and deduplicated (once per quest per day) regardless of
// verification outcome, so this closes the "replay the same award" and "claim forever" holes even
// where real verification isn't possible.
import { Redis } from '@upstash/redis';
import { logAuditEvent } from './_lib/auditLog.js';
import { handleCors } from './_lib/cors.js';
import { verifiedUserId } from './_lib/supabaseAuth.js';
import { awardLevelUps } from './_lib/pointsLedger.js';
import { questById } from './_lib/quests.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';

const redis = Redis.fromEnv();
const MAX_EARN_EVENTS_PER_DAY = 20;
const ACTIVITY_STEPS_THRESHOLD = 2000;

async function verifyQuest(appUserId, verificationType, today) {
  if (verificationType === 'unverifiable_by_design') {
    return { verified: false, verificationNote: 'No wearable measures this (hydration) — unverified by design, not a gap to fix.' };
  }

  if (verificationType === 'nutrition') {
    const scanHappened = await redis.get(`meal_scan_points_awarded:${appUserId}:${today}`);
    return scanHappened
      ? { verified: true, verificationNote: 'Meal scan logged today.' }
      : { verified: false, verificationNote: 'No meal scan logged today.' };
  }

  if (verificationType === 'activity' || verificationType === 'recovery') {
    const snapshotRaw = await redis.get(`health_snapshot:${appUserId}:${today}`);
    if (!snapshotRaw) {
      return { verified: false, verificationNote: 'No health data synced today — connect Apple Health/Health Connect to verify.' };
    }
    const snapshot = typeof snapshotRaw === 'string' ? JSON.parse(snapshotRaw) : snapshotRaw;

    if (verificationType === 'activity') {
      const verified = (snapshot.steps ?? 0) >= ACTIVITY_STEPS_THRESHOLD;
      return {
        verified,
        verificationNote: verified
          ? `${snapshot.steps} steps synced today.`
          : `Only ${snapshot.steps ?? 0} steps synced today (need ${ACTIVITY_STEPS_THRESHOLD}+).`
      };
    }

    const verified = snapshot.liveHrv != null || snapshot.sleepQualityPercent != null;
    return {
      verified,
      verificationNote: verified ? 'Real recovery data synced today.' : 'No recovery data synced today.'
    };
  }

  return { verified: false, verificationNote: 'Unknown verification type.' };
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { appUserId, taskId, completed } = req.body;
  if (!appUserId || !taskId) {
    return res.status(400).json({ error: 'appUserId and taskId are required.' });
  }
  // A claim is paid what the quest is worth on the server (api/_lib/quests.js), whatever points, XP or verification type the
  // request says; an id that isn't a quest earns nothing. Points turn into real donations and vouchers.
  const quest = questById(taskId);
  if (!quest) {
    return res.status(400).json({ error: 'Unknown quest.' });
  }
  const { points: pointsValue, xp: xpValue, verificationType } = quest;

  // Un-completing doesn't earn anything server-side — the dedup lock (once verified-complete for
  // the day) is intentionally one-way; see src/App.tsx for why.
  if (!completed) {
    return res.status(200).json({ success: true, verified: false, xpAwarded: 0, pointsAwarded: 0 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const rateLimitKey = `earn_event_count:${appUserId}:${today}`;
  const countToday = Number((await redis.get(rateLimitKey)) || 0);
  if (countToday >= MAX_EARN_EVENTS_PER_DAY) {
    return res.status(429).json({ error: 'Daily point-earning limit reached. Please try again tomorrow.' });
  }

  const dedupKey = `quest_award:${appUserId}:${taskId}:${today}`;
  const alreadyAwarded = await redis.get(dedupKey);
  if (alreadyAwarded) {
    return res.status(409).json({ error: 'This quest has already been completed today.' });
  }

  try {
    const { verified, verificationNote } = await verifyQuest(appUserId, verificationType, today);

    // Durable, authoritative record — only when the request carries a verified Supabase session (see
    // supabaseAuth.js); older app builds without one keep working on the Redis dedup/rate-limit alone,
    // exactly as before. quest_claims' own (user_id, day, quest_id) unique constraint is a second,
    // database-enforced dedup guard independent of Redis's TTL'd key, so a claim can never be double
    // counted even if a Redis key were ever evicted early.
    const userId = await verifiedUserId(req);
    const admin = userId ? supabaseAdmin() : null;
    if (userId && admin) {
      const { error: claimError } = await admin
        .from('quest_claims')
        .insert({ user_id: userId, day: today, quest_id: taskId, points: pointsValue, xp: xpValue });
      if (claimError) {
        // unique_violation: already claimed today on the server, regardless of what Redis says
        if (claimError.code === '23505') {
          return res.status(409).json({ error: 'This quest has already been completed today.' });
        }
        console.warn('quest_claims insert failed (Redis dedup still applies):', claimError.message);
      } else {
        const { error: ledgerError } = await admin
          .from('points_ledger')
          .insert({ user_id: userId, day: today, award_id: `quest:${taskId}`, points: pointsValue, xp: xpValue });
        if (ledgerError) console.warn('points_ledger insert failed:', ledgerError.message);
        else await awardLevelUps(admin, userId, today).catch(error => console.warn('level-up award failed:', error.message));
      }
    }

    await redis.set(dedupKey, '1', { ex: 60 * 60 * 24 * 2 });
    await redis.set(rateLimitKey, countToday + 1, { ex: 60 * 60 * 24 });

    await logAuditEvent(appUserId, {
      type: 'earn',
      category: 'quest',
      taskId,
      verificationType,
      verified,
      verificationNote,
      xp: xpValue,
      points: pointsValue
    });

    return res.status(200).json({ success: true, verified, verificationNote, xpAwarded: xpValue, pointsAwarded: pointsValue });
  } catch (error) {
    return res.status(500).json({ error: 'Quest completion failed', details: error.message });
  }
}
