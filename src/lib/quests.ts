// Today's quests, built only from things KinetixFit can actually see: steps / sleep / HRV / workouts when the user's
// device shares them, and food checks in the app. Nothing self-reported (water glasses, the morning check-in,
// hand-added workouts) ever counts, because points turn into real donations and vouchers.
// Each quest has real progress and can only be claimed once it's met. Points are small on purpose: three quests a
// day, every day, is about 690 of the ~1,000 a perfect month can earn (src/lib/points.ts). The server caps one claim
// at MAX_QUEST_POINTS / MAX_QUEST_XP.
import type { UserProfile } from '../App';
import { fmtNumber } from './countries';

export type QuestSource = 'steps' | 'sleep' | 'hrv' | 'food' | 'workout';

export interface QuestData {
  steps: number | null;          // today, from Health Connect / Apple Health (null = source not sharing)
  sleepMinutes: number | null;   // last night
  hrv: number | null;            // today's latest HRV reading (Samsung Health never shares one)
  foodChecks: number;            // foods checked in the app today
  protein: number;               // grams logged today
  proteinTarget: number;
  fibre: number;
  /** the person's country's daily fibre guidance (src/lib/countries.ts) */
  fibreTarget: number;
  /** workouts recorded by a watch/phone today (src/lib/workouts.ts); null = workouts aren't shared or aren't recorded */
  workoutsToday: number | null;
}

export interface Quest {
  id: string;
  text: string;
  source: QuestSource;
  pointsValue: number;
  xpValue: number;
  verificationType: 'activity' | 'recovery' | 'nutrition';
  current: number;
  goal: number;
  /** "6,842 / 10,000 steps" */
  progressLabel: string;
  done: boolean;
}

interface QuestDef {
  id: string;
  text: string | ((d: QuestData) => string);
  source: QuestSource;
  pointsValue: number;
  xpValue: number;
  goal: (d: QuestData) => number;
  current: (d: QuestData) => number;
  label: (current: number, goal: number) => string;
}

const n = (v: number) => fmtNumber(Math.round(v));
const hours = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

const stepsQuest = (goal: number): QuestDef => ({
  id: `Q-steps-${goal}`, text: `Walk ${n(goal)} steps`, source: 'steps', pointsValue: 8, xpValue: 30,
  goal: () => goal, current: d => d.steps ?? 0, label: (c, g) => `${n(Math.min(c, g))} / ${n(g)} steps`,
});
const sleepQuest: QuestDef = {
  id: 'Q-sleep-7h', text: 'Sleep 7 hours or more', source: 'sleep', pointsValue: 7, xpValue: 25,
  goal: () => 420, current: d => d.sleepMinutes ?? 0, label: (c, g) => `${hours(Math.min(c, g))} of ${hours(g)}`,
};
const hrvQuest: QuestDef = {
  id: 'Q-hrv', text: 'Get an HRV reading today', source: 'hrv', pointsValue: 5, xpValue: 20,
  goal: () => 1, current: d => (d.hrv !== null ? 1 : 0), label: c => (c ? 'Reading synced' : 'Wear your watch for a while'),
};
const foodChecksQuest: QuestDef = {
  id: 'Q-food-3', text: 'Check 3 foods you eat today', source: 'food', pointsValue: 5, xpValue: 20,
  goal: () => 3, current: d => d.foodChecks, label: (c, g) => `${Math.min(c, g)} of ${g} checked`,
};
const proteinQuest: QuestDef = {
  id: 'Q-protein', text: 'Hit your protein target', source: 'food', pointsValue: 7, xpValue: 25,
  goal: d => d.proteinTarget, current: d => d.protein, label: (c, g) => `${n(Math.min(c, g))} / ${n(g)} g`,
};
// The id keeps its old name (claimed quests are stored by id); the goal is the country's fibre guidance.
const fibreQuest: QuestDef = {
  id: 'Q-fibre-30', text: d => `Get ${d.fibreTarget} g of fibre`, source: 'food', pointsValue: 7, xpValue: 25,
  goal: d => d.fibreTarget, current: d => d.fibre, label: (c, g) => `${n(Math.min(c, g))} / ${g} g`,
};
const workoutQuest: QuestDef = {
  id: 'Q-workout', text: 'Do a workout', source: 'workout', pointsValue: 8, xpValue: 30,
  goal: () => 1, current: d => Math.min(1, d.workoutsToday ?? 0), label: c => (c ? 'Recorded' : 'Record it on your watch or phone'),
};

// In priority order per goal; the first three the user's data supports are offered.
const POOLS: Record<UserProfile['target'], QuestDef[]> = {
  'Weight Loss': [stepsQuest(10000), fibreQuest, workoutQuest, foodChecksQuest, sleepQuest],
  'Weight Gain': [proteinQuest, workoutQuest, foodChecksQuest, sleepQuest, stepsQuest(6000)],
  'Cardio Endurance': [stepsQuest(12000), workoutQuest, sleepQuest, foodChecksQuest, fibreQuest],
  'Autonomic Recovery': [sleepQuest, hrvQuest, stepsQuest(7000), workoutQuest, foodChecksQuest],
};

const VERIFICATION: Record<QuestSource, Quest['verificationType']> = {
  steps: 'activity', workout: 'activity', sleep: 'recovery', hrv: 'recovery', food: 'nutrition',
};

export function sourceAvailable(source: QuestSource, d: QuestData): boolean {
  if (source === 'steps') return d.steps !== null;
  if (source === 'sleep') return d.sleepMinutes !== null;
  if (source === 'hrv') return d.hrv !== null;
  if (source === 'workout') return d.workoutsToday !== null;
  return true; // food checks are logged in the app
}

/** Three quests for today. Already-claimed ones always stay, so a list never changes under the user. */
export function questsForToday(target: UserProfile['target'], d: QuestData, claimedIds: string[]): Quest[] {
  const pool = POOLS[target] ?? POOLS['Autonomic Recovery'];
  const picked = pool.filter(q => claimedIds.includes(q.id));
  for (const q of pool) {
    if (picked.length >= 3) break;
    if (!picked.includes(q) && sourceAvailable(q.source, d)) picked.push(q);
  }
  return picked.map(q => {
    const goal = Math.max(1, q.goal(d));
    const current = q.current(d);
    return {
      id: q.id, text: typeof q.text === 'function' ? q.text(d) : q.text, source: q.source, pointsValue: q.pointsValue, xpValue: q.xpValue,
      verificationType: VERIFICATION[q.source], current, goal,
      progressLabel: q.label(current, goal), done: current >= goal,
    };
  });
}

/** The most quest points and XP one day can bring for a goal: its three best-paying quests (points.test.ts). */
export function bestQuestDay(target: UserProfile['target']): { points: number; xp: number } {
  const top = [...(POOLS[target] ?? [])].sort((a, b) => b.pointsValue - a.pointsValue).slice(0, 3);
  return { points: top.reduce((t, q) => t + q.pointsValue, 0), xp: top.reduce((t, q) => t + q.xpValue, 0) };
}

/** Every quest's points and XP, for checking them against the server's caps. */
export const allQuestValues = () => Object.values(POOLS).flat().map(q => ({ id: q.id, points: q.pointsValue, xp: q.xpValue }));
