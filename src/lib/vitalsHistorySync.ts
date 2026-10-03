// Registers the `vitals_history` keyed domain — additive, no delete semantics (a health reading is
// never edited or removed once recorded, on either side). Nothing on screen reads it, so it is `quiet`: readings from
// another phone come down without an "Updated from your account" notice.
import { loadVitalReadings, addRemoteVitalReadings, type VitalReading } from './vitalsHistory';
import { registerKeyed } from './sync';

registerKeyed<VitalReading>({
  name: 'vitals_history',
  table: 'vitals_history',
  quiet: true,
  load: () => loadVitalReadings(),
  save: (records) => addRemoteVitalReadings(records),
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
