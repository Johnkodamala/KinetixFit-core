// Registers the `workouts` keyed domain: hand-added workouts (kx_workouts) plus a 30-day history of
// detected (Health Connect / HealthKit) workouts (kx_detected_workouts_history) — both merged into the
// one `workouts` table via `source` ('manual' vs 'detected'). A remote-only detected workout (synced
// down from another device) only ever lands in the read-only history cache, never in the hand-added
// list or the live `detectedWorkouts` UI state, which stay driven by a fresh device read as before —
// this is additive persistence for trend analysis, not a change to how workouts are shown or counted.
import {
  loadManualWorkouts, saveManualWorkouts, loadWorkoutTombstones,
  loadDetectedWorkoutHistory, saveDetectedWorkoutHistory,
  type ManualWorkout, type DetectedWorkout,
} from './workouts';
import { localDayKey } from './dates';
import { registerKeyed } from './sync';

interface WorkoutRecord {
  kind: 'manual' | 'detected';
  manual: ManualWorkout | null;
  detected: DetectedWorkout | null;
  day: string;
  deletedAt: number | null;
}

registerKeyed<WorkoutRecord>({
  name: 'workouts',
  table: 'workouts',
  load: () => {
    const records: Record<string, WorkoutRecord> = {};
    for (const w of loadManualWorkouts()) {
      records[w.id] = { kind: 'manual', manual: w, detected: null, day: w.day, deletedAt: null };
    }
    for (const w of Object.values(loadDetectedWorkoutHistory())) {
      if (!records[w.id]) {
        records[w.id] = { kind: 'detected', manual: null, detected: w, day: localDayKey(new Date(w.start)), deletedAt: null };
      }
    }
    for (const [id, t] of Object.entries(loadWorkoutTombstones())) {
      if (!records[id]) records[id] = { kind: 'manual', manual: null, detected: null, day: t.day, deletedAt: t.deletedAt };
    }
    return records;
  },
  save: (records) => {
    const manualList = loadManualWorkouts();
    const manualById = new Map(manualList.map(w => [w.id, w]));
    const detectedHistory = loadDetectedWorkoutHistory();
    let detectedChanged = false;
    for (const [id, rec] of Object.entries(records)) {
      if (rec.kind === 'detected') {
        if (rec.detected && !detectedHistory[id]) { detectedHistory[id] = rec.detected; detectedChanged = true; }
        continue;
      }
      if (rec.deletedAt || !rec.manual) manualById.delete(id);
      else if (!manualById.has(id)) manualById.set(id, rec.manual);
    }
    saveManualWorkouts([...manualById.values()]);
    if (detectedChanged) saveDetectedWorkoutHistory(detectedHistory);
  },
  toRemote: (id, value, userId) => ({
    user_id: userId,
    id,
    source: value.kind,
    data: value.kind === 'detected' ? (value.detected ?? {}) : (value.manual ?? { day: value.day }),
    deleted_at: value.deletedAt ? new Date(value.deletedAt).toISOString() : null,
  }),
  fromRemote: (row) => {
    const kind = (row.source === 'detected' ? 'detected' : 'manual') as 'manual' | 'detected';
    const data = row.data as Record<string, unknown> | null;
    const deletedAt = row.deleted_at ? new Date(row.deleted_at as string).getTime() : null;
    if (kind === 'detected') {
      const detected = deletedAt ? null : (data as unknown as DetectedWorkout);
      return {
        key: row.id as string,
        value: { kind, manual: null, detected, day: detected ? localDayKey(new Date(detected.start)) : '', deletedAt },
      };
    }
    const manual = deletedAt ? null : (data as unknown as (ManualWorkout & { day?: string }));
    return {
      key: row.id as string,
      value: { kind, manual: manual as ManualWorkout | null, detected: null, day: (manual?.day as string) ?? '', deletedAt },
    };
  },
});
