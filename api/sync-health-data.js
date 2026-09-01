// Private serverless endpoint: receives periodic HealthKit/Health Connect snapshots from the
// client's existing polling loop. This is the missing piece that makes server-side quest
// verification possible at all — until now, synced health data never left the device.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { appUserId, steps, liveBpm, liveHrv, sleepQualityPercent } = req.body;
  if (!appUserId) {
    return res.status(400).json({ error: 'appUserId is required.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const snapshot = {
    steps: typeof steps === 'number' ? steps : null,
    liveBpm: typeof liveBpm === 'number' ? liveBpm : null,
    liveHrv: typeof liveHrv === 'number' ? liveHrv : null,
    sleepQualityPercent: typeof sleepQualityPercent === 'number' ? sleepQualityPercent : null,
    lastSyncedAt: new Date().toISOString()
  };

  try {
    await redis.set(`health_snapshot:${appUserId}:${today}`, JSON.stringify(snapshot), { ex: 60 * 60 * 24 * 2 });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Health sync failed', details: error.message });
  }
}
