// Registers the `food_log_entries` keyed domain — the highest-volume, highest-stakes domain (every
// logged food, forever). Each LogEntry's own `id` (already a stable client-generated id via newId(),
// used for edit/remove) is the sync key; deletes are tombstoned in foodLog.ts's own tombstone map.
import { loadFoodDays, saveFoodDays, loadFoodEntryTombstones, type LogEntry, type FoodDays } from './foodLog';
import { registerKeyed } from './sync';

interface EntryRecord { day: string; entry: LogEntry | null; deletedAt: number | null; }

registerKeyed<EntryRecord>({
  name: 'food_log_entries',
  table: 'food_log_entries',
  load: () => {
    const records: Record<string, EntryRecord> = {};
    const days = loadFoodDays();
    for (const [day, entries] of Object.entries(days)) {
      for (const entry of entries) records[entry.id] = { day, entry, deletedAt: null };
    }
    for (const [id, t] of Object.entries(loadFoodEntryTombstones())) {
      if (!records[id]) records[id] = { day: t.day, entry: null, deletedAt: t.deletedAt };
    }
    return records;
  },
  save: (records) => {
    // sync.ts only calls save() with records this device hasn't dirtied itself: remote-only additions
    // and deletes made on another device, both applied straight into the day buckets here.
    const days: FoodDays = loadFoodDays();
    for (const [id, rec] of Object.entries(records)) {
      if (rec.deletedAt || !rec.entry) {
        for (const day of Object.keys(days)) days[day] = days[day].filter(e => e.id !== id);
        continue;
      }
      const already = (days[rec.day] ?? []).some(e => e.id === id);
      if (!already) days[rec.day] = [...(days[rec.day] ?? []), rec.entry];
    }
    saveFoodDays(days);
  },
  toRemote: (id, value, userId) => ({
    user_id: userId,
    id,
    day: value.day,
    per100g: value.entry?.per100g ?? null,
    extras: value.entry?.extras ?? null,
    meal: value.entry?.meal ?? null,
    amount_guess: value.entry?.amountGuess ?? null,
    note: value.entry?.note ?? null,
    data: value.entry ?? {},
    deleted_at: value.deletedAt ? new Date(value.deletedAt).toISOString() : null,
  }),
  fromRemote: (row) => ({
    key: row.id as string,
    value: {
      day: row.day as string,
      entry: row.deleted_at ? null : (row.data as LogEntry),
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string).getTime() : null,
    },
  }),
});
