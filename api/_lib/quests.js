// The quests a claim can be for, and what each is worth. The phone offers these (src/lib/quests.ts); the server keeps its own
// copy so a claim is paid what the quest is worth here, whatever points, XP or verification type the request says, and a
// quest id that isn't in this list earns nothing. api/__tests__/quests.test.js checks the two lists match.
export const QUESTS = {
  'Q-steps-6000': { points: 8, xp: 30, verificationType: 'activity' },
  'Q-steps-7000': { points: 8, xp: 30, verificationType: 'activity' },
  'Q-steps-10000': { points: 8, xp: 30, verificationType: 'activity' },
  'Q-steps-12000': { points: 8, xp: 30, verificationType: 'activity' },
  'Q-sleep-7h': { points: 7, xp: 25, verificationType: 'recovery' },
  'Q-hrv': { points: 5, xp: 20, verificationType: 'recovery' },
  'Q-food-3': { points: 5, xp: 20, verificationType: 'nutrition' },
  'Q-protein': { points: 7, xp: 25, verificationType: 'nutrition' },
  'Q-fibre-30': { points: 7, xp: 25, verificationType: 'nutrition' },
  'Q-workout': { points: 8, xp: 30, verificationType: 'activity' },
};

/** The quest for an id, or null when it isn't one (including names like __proto__). */
export const questById = id => (typeof id === 'string' && Object.hasOwn(QUESTS, id) ? QUESTS[id] : null);
