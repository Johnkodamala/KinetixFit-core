// Run from the repo root: npx vite-node scripts/device-test/a55check.parity.ts
// The check script's own copy of the rules must give exactly what the app's real functions give.
import { trendAverage } from '../../src/lib/trendAverage';
import { distanceLabel } from '../../src/lib/vitals';
// @ts-expect-error plain .mjs next to this file
import { expectedAverage, oldAverage, labelFor, mask, digits } from './a55check.lib.mjs';

let seed = 987654321;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const keys = Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`); // oldest first
const today = keys[6];

let cases = 0, bad = 0;
const fail = (what: string, detail: unknown) => { bad++; if (bad <= 6) console.log('MISMATCH', what, JSON.stringify(detail)); };

for (let t = 0; t < 20000; t++) {
  const map: Record<string, number> = {};
  for (const k of keys) {
    const r = rnd();
    if (r < 0.15) continue;                                   // no bucket at all
    map[k] = r < 0.25 ? 0 : r < 0.3 ? rnd() * 0.9 : Math.round(rnd() * 20000) + rnd(); // zero, rounds-to-zero, or a real value
  }
  // the card's own pipeline: Math.round per day, null when missing, hasReading = value > 0 (BiometricTrendCard)
  const points = keys.map(k => ({ date: k, value: map[k] === undefined ? null : Math.round(map[k]) }));
  const real = points.filter(d => d.value !== null && d.value > 0);
  const app = trendAverage(real, today, true);
  const mine = expectedAverage(map, keys, today);
  cases++;
  if (!((app === null && mine === null) || (app && mine && app.days === mine.days && Math.round(app.value) === mine.avg))) fail('new rule', { map, app, mine });
  const appOld = trendAverage(real, today, false);
  const myOld = oldAverage(map, keys);
  if (!((appOld === null && myOld === null) || (appOld && myOld !== null && Math.round(appOld.value) === myOld))) fail('old rule', { map, appOld, myOld });
}

for (let t = 0; t < 20000; t++) {
  const meters = rnd() * 20000;
  const steps = rnd() < 0.1 ? null : Math.round(rnd() * 25000);
  const h = rnd() < 0.05 ? 0 : 140 + rnd() * 60;
  cases++;
  if (distanceLabel(meters, steps, h) !== labelFor(meters, steps, h)) fail('distance label', { meters, steps, h });
}

// the text helpers on the card strings the app really produces
const samples: [string, string][] = [
  ['12,345 steps Latest · 3 Oct · 6-day average 11,200', '<n> steps Latest · 3 Oct · 6-day average <n>'],
  ['89 bpm Average on 4 Oct · 5-day average 74 bpm', '<n> bpm Average on 4 Oct · 5-day average <n> bpm'],
];
for (const [inp, want] of samples) { cases++; if (mask(inp) !== want) fail('mask', { inp, got: mask(inp), want }); }
cases++; if (digits('12,345') !== 12345 || digits('1.2k') !== 12) fail('digits', 0);

console.log(`${cases} cases, ${bad} mismatches`);
if (bad) process.exit(1);
