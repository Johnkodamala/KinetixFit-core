// The server's list of quests (api/_lib/quests.js) and the phone's (src/lib/quests.ts) must be the same list, with the same values.
import { describe, expect, it } from 'vitest';
import { QUESTS, questById } from '../_lib/quests.js';
import { allQuestValues } from '../../src/lib/quests.ts';
import { MAX_QUEST_POINTS, MAX_QUEST_XP } from '../../src/lib/points.ts';

describe('the server’s quests match the app’s', () => {
  const app = new Map(allQuestValues().map(q => [q.id, q]));

  it('every quest the app can offer is known to the server with the same points and XP', () => {
    expect(app.size).toBeGreaterThan(0);
    for (const [id, q] of app) {
      expect(QUESTS[id], id).toBeDefined();
      expect(QUESTS[id].points, `${id} points`).toBe(q.points);
      expect(QUESTS[id].xp, `${id} xp`).toBe(q.xp);
    }
  });

  it('the server knows no quest the app does not offer', () => {
    for (const id of Object.keys(QUESTS)) expect(app.has(id), id).toBe(true);
  });

  it('every quest is small enough to sit under the cap the economy is built on', () => {
    for (const [id, q] of Object.entries(QUESTS)) {
      expect(q.points, id).toBeLessThanOrEqual(MAX_QUEST_POINTS);
      expect(q.xp, id).toBeLessThanOrEqual(MAX_QUEST_XP);
    }
  });

  it('each quest verifies the way its kind of data does', () => {
    for (const [id, q] of Object.entries(QUESTS)) {
      const expected = /steps|workout/.test(id) ? 'activity' : /sleep|hrv/.test(id) ? 'recovery' : 'nutrition';
      expect(q.verificationType, id).toBe(expected);
    }
  });
});

describe('questById', () => {
  it('finds real quests and nothing else, including object-prototype names', () => {
    expect(questById('Q-food-3')).toBe(QUESTS['Q-food-3']);
    for (const id of ['__proto__', 'constructor', 'hasOwnProperty', 'nope', '', undefined, null, 7]) expect(questById(id), String(id)).toBeNull();
  });
});
