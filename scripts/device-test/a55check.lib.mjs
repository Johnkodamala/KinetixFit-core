// The script's own copy of the app's rules (src/lib/trendAverage.ts and distanceLabel in src/lib/vitals.ts).
// a55check.parity.ts runs both side by side on random inputs (npx vite-node scripts/device-test/a55check.parity.ts), so a drift
// shows up before a phone is involved.

export const STRIDE = 0.415;
export const MIN_STEPS = 500;

/** The card's mean of the 7 local days: whole days that have a reading, today (a partial day) left out; needs two. */
export function expectedAverage(map, keys, todayKey) {
  const vals = keys.filter(k => k !== todayKey).map(k => map[k]).filter(v => v !== undefined && Math.round(v) > 0).map(v => Math.round(v));
  if (vals.length < 2) return null;
  return { days: vals.length, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) };
}

/** What the card said before the fix: today's partial day counted with the full ones. */
export function oldAverage(map, keys) {
  const vals = keys.map(k => map[k]).filter(v => v !== undefined && Math.round(v) > 0).map(v => Math.round(v));
  return vals.length < 2 ? null : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export const labelFor = (meters, steps, h) =>
  (steps === null || steps < MIN_STEPS || !(h > 0)) ? 'Distance' : (meters < (steps * h * STRIDE / 100) * 0.5 ? 'Workout distance' : 'Distance');

export const digits = s => Number(String(s).replace(/[^0-9]/g, ''));
/** Hide the numbers in a card text before printing it (someone else's health data): keeps the words and the day count. */
export const mask = s => (s ?? '').replace(/^[\d.,]+/, '<n>').replace(/(average )[\d.,]+/, '$1<n>');
