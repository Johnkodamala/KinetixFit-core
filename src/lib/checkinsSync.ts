// Registers the `morning_checkins` keyed domain. Edit-in-place, no delete semantics — one row per day.
import { loadCheckIns, type CheckIn } from './checkins';
import { readJson, writeJson } from './storage';
import { registerKeyed } from './sync';

const KEY = 'kinetix_checkins';

registerKeyed<CheckIn>({
  name: 'morning_checkins',
  table: 'morning_checkins',
  load: () => loadCheckIns(),
  save: (records) => {
    const existing = readJson<Record<string, CheckIn>>(KEY) ?? {};
    writeJson(KEY, { ...existing, ...records });
  },
  toRemote: (day, value, userId) => ({ user_id: userId, day, data: value }),
  fromRemote: (row) => ({ key: row.day as string, value: row.data as CheckIn }),
});
