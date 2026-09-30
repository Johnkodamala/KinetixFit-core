// Registers the `gut_checks` keyed domain. Edit-in-place, no delete semantics today — one row per day.
import { loadGutChecks, type GutCheck } from './gut';
import { readJson, writeJson } from './storage';
import { registerKeyed } from './sync';

const KEY = 'kx_gut_checks';

registerKeyed<GutCheck>({
  name: 'gut_checks',
  table: 'gut_checks',
  load: () => loadGutChecks(),
  save: (records) => {
    const existing = readJson<Record<string, GutCheck>>(KEY) ?? {};
    writeJson(KEY, { ...existing, ...records });
  },
  toRemote: (day, value, userId) => ({ user_id: userId, day, data: value }),
  fromRemote: (row) => ({ key: row.day as string, value: row.data as GutCheck }),
});
