// Registers the `periods` keyed domain — the one domain in this phase that exercises soft-delete:
// a removed period moves into cycle.ts's tombstone map instead of disappearing, so sync can propagate
// the delete instead of an offline device resurrecting it.
import { loadPeriods, loadPeriodTombstones, savePeriods } from './cycle';
import { registerKeyed } from './sync';

interface PeriodRecord { deletedAt: number | null; }

registerKeyed<PeriodRecord>({
  name: 'periods',
  table: 'periods',
  load: () => {
    const records: Record<string, PeriodRecord> = {};
    for (const day of loadPeriods()) records[day] = { deletedAt: null };
    for (const [day, at] of Object.entries(loadPeriodTombstones())) records[day] = { deletedAt: at };
    return records;
  },
  save: (records) => {
    const active = Object.entries(records).filter(([, v]) => !v.deletedAt).map(([day]) => day);
    savePeriods(active);
  },
  toRemote: (day, value, userId) => ({
    user_id: userId,
    day,
    deleted_at: value.deletedAt ? new Date(value.deletedAt).toISOString() : null,
  }),
  fromRemote: (row) => ({
    key: row.day as string,
    value: { deletedAt: row.deleted_at ? new Date(row.deleted_at as string).getTime() : null },
  }),
});
