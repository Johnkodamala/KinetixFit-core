// Registers the `vitals_history` keyed domain — additive, no delete semantics (a health reading is
// never edited or removed once recorded, on either side).
import { loadVitalReadings, type VitalReading } from './vitalsHistory';
import { readJson, writeJson } from './storage';
import { registerKeyed } from './sync';

const KEY = 'kx_vitals_history';

registerKeyed<VitalReading>({
  name: 'vitals_history',
  table: 'vitals_history',
  load: () => loadVitalReadings(),
  save: (records) => {
    const existing = readJson<Record<string, VitalReading>>(KEY) ?? {};
    writeJson(KEY, { ...existing, ...records });
  },
  toRemote: (id, value, userId) => ({
    user_id: userId,
    id,
    metric: value.metric,
    value: value.value,
    source: value.source,
    recorded_at: value.recordedAt,
    day: value.day,
  }),
  fromRemote: (row) => ({
    key: row.id as string,
    value: {
      metric: row.metric as string,
      value: row.value as number,
      source: row.source as string | null,
      recordedAt: row.recorded_at as number,
      day: row.day as string,
    },
  }),
});
