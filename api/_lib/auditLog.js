// Shared server-side audit trail: every point-earning and point-spending event, timestamped,
// with a `verified` flag so unverifiable-but-allowed events (see complete-quest.js) stay visible
// rather than silently blending in with genuinely device-verified ones.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const MAX_EVENTS_PER_USER = 500;

export async function logAuditEvent(appUserId, event) {
  const entry = JSON.stringify({
    ...event,
    appUserId,
    timestamp: new Date().toISOString()
  });
  const key = `audit_log:${appUserId}`;
  await redis.lpush(key, entry);
  await redis.ltrim(key, 0, MAX_EVENTS_PER_USER - 1);
}
