// Registers the `saved_foods` keyed domain. No delete affordance exists for saved foods today (the
// 200-most-recent cap is cache hygiene, not a user delete — see foodLog.ts's saveFoods), so this
// adapter carries no tombstone logic; add one if a delete UI is ever added here.
import { loadFoods, saveFoods, type SavedFood } from './foodLog';
import { registerKeyed } from './sync';

registerKeyed<SavedFood>({
  name: 'saved_foods',
  table: 'saved_foods',
  load: () => loadFoods(),
  save: (records) => {
    saveFoods({ ...loadFoods(), ...records });
  },
  toRemote: (key, value, userId) => ({
    user_id: userId,
    key,
    per100g: value.per100g,
    units: value.units,
    density: value.density,
    uses: value.uses,
    last_used: value.lastUsed,
    data: value,
  }),
  fromRemote: (row) => ({ key: row.key as string, value: row.data as SavedFood }),
});
