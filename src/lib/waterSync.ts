// Registers the `water_logs` keyed domain — the first per-event (not per-day) domain, and the first to
// exercise tombstoned deletes end to end (see water.ts's DELETED_KEY). Each drink's own timestamp is
// its stable id (client-generated, unique enough per device — two drinks logged the same millisecond
// on the same device is not a real scenario this app produces).
import { entryTime, entryMl, loadWaterLog, saveWaterLog, loadWaterTombstones, saveWaterTombstones } from './water';
import { localDayKey } from './dates';
import { registerKeyed } from './sync';

interface WaterRecord { ml: number; day: string; deletedAt: number | null; }

registerKeyed<WaterRecord>({
  name: 'water_logs',
  table: 'water_logs',
  load: () => {
    const records: Record<string, WaterRecord> = {};
    const log = loadWaterLog();
    for (const [day, entries] of Object.entries(log)) {
      for (const e of entries) records[String(entryTime(e))] = { ml: entryMl(e), day, deletedAt: null };
    }
    for (const [id, t] of Object.entries(loadWaterTombstones())) {
      records[id] = { ml: t.ml, day: t.day, deletedAt: t.deletedAt };
    }
    return records;
  },
  save: (records) => {
    // sync.ts only passes records this device hasn't dirtied itself, so every entry here is either a
    // remote-only addition or a delete made on another device that must be applied here too.
    const log = loadWaterLog();
    const tombstones = loadWaterTombstones();
    let tombstonesChanged = false;
    for (const [id, rec] of Object.entries(records)) {
      const time = Number(id);
      const day = rec.day || localDayKey(new Date(time));
      if (rec.deletedAt) {
        if (log[day]) log[day] = log[day].filter(e => entryTime(e) !== time);
        if (!tombstones[id] || tombstones[id].deletedAt < rec.deletedAt) {
          tombstones[id] = { ml: rec.ml, day, deletedAt: rec.deletedAt };
          tombstonesChanged = true;
        }
      } else {
        const already = (log[day] ?? []).some(e => entryTime(e) === time);
        if (!already) log[day] = [...(log[day] ?? []), [time, rec.ml] as [number, number]];
      }
    }
    saveWaterLog(log);
    if (tombstonesChanged) saveWaterTombstones(tombstones);
  },
  toRemote: (id, value, userId) => ({
    user_id: userId,
    id,
    at: Number(id),
    ml: value.ml,
    day: value.day,
    deleted_at: value.deletedAt ? new Date(value.deletedAt).toISOString() : null,
  }),
  fromRemote: (row) => ({
    key: row.id as string,
    value: {
      ml: row.ml as number,
      day: row.day as string,
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string).getTime() : null,
    },
  }),
});
