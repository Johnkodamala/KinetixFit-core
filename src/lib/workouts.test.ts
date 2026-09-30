// Hand-added workouts (add / change / remove, the old profile strings), the Plus widgets' settings and app icons.
import { describe, expect, it } from 'vitest';
import { localDayKey, localDayKeyDaysAgo } from './dates';
import {
  addManualWorkout, updateManualWorkout, removeManualWorkout, loadManualWorkouts, saveManualWorkouts, fromLegacy,
  manualOnDay, manualWithinDays, workoutProblem, cleanType, formatMinutes, manualLabel, WORKOUT_TYPES, MORE_WORKOUT_TYPES,
  MAX_WORKOUT_ENTRY, loadWorkoutTombstones, recordDetectedWorkouts, loadDetectedWorkoutHistory,
  type DetectedWorkout,
} from './workouts';
import { isDirty } from './sync';
import { cleanWidgetPrefs, loadWidgetPrefs, saveWidgetPrefs, flattenPrefs, quickActionLabel, DEFAULT_WIDGET_PREFS, WIDGETS } from './widgets';
import { APP_ICONS, canUseIcon, shouldRevertIcon, isAppIconId } from './appIcons';

const today = localDayKey();

describe('hand-added workouts', () => {
  it('adds, changes and removes one, newest first', () => {
    let list = addManualWorkout([], { type: 'Run', minutes: 30, day: today }, 1000);
    list = addManualWorkout(list, { type: 'yoga', minutes: 20, day: today, note: '  with Anna ' }, 2000);
    expect(list.map(w => w.type)).toEqual(['Yoga', 'Run']);
    expect(list[0].note).toBe('with Anna');
    const run = list[1];
    list = updateManualWorkout(list, run.id, { type: 'Run', minutes: 45, day: localDayKeyDaysAgo(1), note: '' }, 3000);
    const changed = list.find(w => w.id === run.id)!;
    expect([changed.minutes, changed.day, changed.note]).toEqual([45, localDayKeyDaysAgo(1), undefined]);
    expect(list.map(w => w.type)).toEqual(['Yoga', 'Run']); // today's first
    list = removeManualWorkout(list, run.id);
    expect(list).toHaveLength(1);
    expect(loadManualWorkouts()).toEqual(list);
  });

  it('recordDetectedWorkouts persists a 30-day-window read and marks new/changed ones dirty', () => {
    const w: DetectedWorkout = { id: 'hc-1', type: 'running', label: 'Run', start: Date.now() - 60_000, minutes: 25, kcal: 200, km: 4, source: 'Health Connect' };
    recordDetectedWorkouts([w]);
    expect(loadDetectedWorkoutHistory()['hc-1']).toEqual(w);
    expect(isDirty('workouts')).toBe(true);
  });

  it('recordDetectedWorkouts drops anything older than 30 days', () => {
    const stale: DetectedWorkout = { id: 'old-1', type: 'running', label: 'Run', start: Date.now() - 31 * 86_400_000, minutes: 25, kcal: 200, km: 4, source: 'Health Connect' };
    const fresh: DetectedWorkout = { id: 'new-1', type: 'running', label: 'Run', start: Date.now() - 60_000, minutes: 25, kcal: 200, km: 4, source: 'Health Connect' };
    recordDetectedWorkouts([stale]);
    recordDetectedWorkouts([fresh]); // the second call's own trim drops the now-stale first entry
    const history = loadDetectedWorkoutHistory();
    expect(history['old-1']).toBeUndefined();
    expect(history['new-1']).toEqual(fresh);
  });

  it('removing a workout tombstones it (for sync) and marks it dirty', () => {
    const list = addManualWorkout([], { type: 'Run', minutes: 30, day: today }, 1000);
    const run = list[0];
    removeManualWorkout(list, run.id);
    expect(loadWorkoutTombstones()[run.id]).toMatchObject({ day: today });
    expect(isDirty('workouts')).toBe(true);
  });

  it('lists a day, and the last few days', () => {
    let list = addManualWorkout([], { type: 'Walk', minutes: 15, day: today });
    list = addManualWorkout(list, { type: 'Swim', minutes: 40, day: localDayKeyDaysAgo(3) });
    list = addManualWorkout(list, { type: 'Cycle', minutes: 60, day: localDayKeyDaysAgo(10) });
    expect(manualOnDay(list, today).map(w => w.type)).toEqual(['Walk']);
    expect(manualWithinDays(list, 7).map(w => w.type)).toEqual(['Walk', 'Swim']);
  });

  it('moves the old profile strings over once', () => {
    const legacy = ['Run · 30 min (27/09/2026)', 'Evening stretch (26/09/2026)', 'rubbish', 'Swim · 90 min (28/09/2026)'];
    const first = loadManualWorkouts(legacy);
    expect(first.map(w => [w.type, w.minutes, w.day])).toEqual([
      ['Swim', 90, '2026-09-28'], ['Run', 30, '2026-09-27'], ['Evening stretch', 30, '2026-09-26'],
    ].filter(([, , d]) => (d as string) >= localDayKeyDaysAgo(365)));
    // already moved: the old strings are ignored from now on
    expect(loadManualWorkouts(['Walk · 10 min (28/09/2026)'])).toEqual(first);
    expect(fromLegacy(['Yoga · 999 min (01/01/2026)'])[0].minutes).toBe(MAX_WORKOUT_ENTRY);
  });

  it('survives bad saved data and drops workouts older than a year', () => {
    localStorage.setItem('kx_workouts', '{oops');
    expect(loadManualWorkouts()).toEqual([]);
    localStorage.setItem('kx_workouts', JSON.stringify([{ id: 'x' }, { id: 'y', type: 'Run', minutes: 20, day: today, at: 1 }]));
    expect(loadManualWorkouts().map(w => w.id)).toEqual(['y']);
    const kept = saveManualWorkouts([{ id: 'old', type: 'Run', minutes: 20, day: localDayKeyDaysAgo(400), at: 1 }]);
    expect(kept).toEqual([]);
  });

  it('checks a workout before saving', () => {
    expect(workoutProblem({ type: 'Run', minutes: 30, day: today })).toBeNull();
    expect(workoutProblem({ type: '  ', minutes: 30, day: today })).toMatch(/Choose what you did/);
    expect(workoutProblem({ type: 'Run', minutes: 0, day: today })).toMatch(/1–600 minutes/);
    expect(workoutProblem({ type: 'Run', minutes: 12.5, day: today })).toMatch(/minutes/);
    expect(workoutProblem({ type: 'Run', minutes: 601, day: today })).toMatch(/minutes/);
    expect(workoutProblem({ type: 'Run', minutes: 30, day: '2099-01-01' })).toMatch(/up to today/);
    expect(workoutProblem({ type: 'Run', minutes: 30, day: localDayKeyDaysAgo(500) })).toMatch(/more than a year/);
  });

  it('tidies names and shows durations', () => {
    expect(cleanType('  paddle   boarding ')).toBe('Paddle boarding');
    expect(cleanType('x'.repeat(50))).toHaveLength(30);
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(95)).toBe('1 h 35 min');
    expect(manualLabel({ type: 'Run', minutes: 30 })).toBe('Run · 30 min');
    expect(new Set([...WORKOUT_TYPES, ...MORE_WORKOUT_TYPES]).size).toBe(WORKOUT_TYPES.length + MORE_WORKOUT_TYPES.length);
  });
});

describe('Plus widget settings', () => {
  it('defaults, and keeps saved settings within what widgets can draw', () => {
    expect(loadWidgetPrefs()).toEqual(DEFAULT_WIDGET_PREFS);
    const p = cleanWidgetPrefs({
      stats: { metrics: ['steps', 'steps', 'bogus', 'points', 'water', 'quests', 'streak'], theme: 'pink' },
      quick: { actions: [{ kind: 'water', ml: 20 }, { kind: 'workout', type: 'Run', minutes: 30 }], theme: 'ember', haptic: 'firm' },
      checkin: { theme: 'forest', haptic: 'loud' },
    });
    expect(p.stats.metrics).toEqual(['steps', 'points', 'water', 'quests']);
    expect(p.stats.theme).toBe('ocean');
    expect(p.quick.actions).toEqual([{ kind: 'workout', type: 'Run', minutes: 30 }]);
    expect(p.quick.haptic).toBe('firm');
    expect(p.checkin).toEqual({ theme: 'forest', haptic: 'light' });
    // too few stats → the default four
    expect(cleanWidgetPrefs({ stats: { metrics: ['steps'] } }).stats.metrics).toEqual(DEFAULT_WIDGET_PREFS.stats.metrics);
  });

  it('saves and flattens for the native widgets', () => {
    const saved = saveWidgetPrefs({ ...DEFAULT_WIDGET_PREFS, stats: { metrics: ['streak', 'points'], theme: 'violet' } });
    expect(loadWidgetPrefs()).toEqual(saved);
    const flat = flattenPrefs(saved);
    expect(flat.statsMetrics).toBe('streak,points');
    expect(JSON.parse(flat.quickActions)).toEqual([
      { k: 'water', ml: 250, l: 'Glass 250 ml' }, { k: 'water', ml: 500, l: 'Bottle 500 ml' }, { k: 'workout', t: 'Walk', m: 30, l: 'Walk 30 min' },
    ]);
    expect(quickActionLabel({ kind: 'water', ml: 1000 })).toBe('Bottle 1 L');
  });

  it('three Plus widgets, all editable; the rest free', () => {
    expect(WIDGETS.filter(w => w.plus).map(w => w.kind)).toEqual(['checkin', 'quick', 'stats']);
    expect(WIDGETS.filter(w => w.plus).every(w => w.editable)).toBe(true);
    expect(new Set(WIDGETS.map(w => w.kind)).size).toBe(WIDGETS.length);
  });
});

describe('app icons', () => {
  it('two free icons, the rest Plus', () => {
    expect(APP_ICONS.filter(i => !i.plus).map(i => i.id)).toEqual(['classic', 'midnight']);
    expect(canUseIcon('gold', false)).toBe(false);
    expect(canUseIcon('gold', true)).toBe(true);
    expect(canUseIcon('midnight', false)).toBe(true);
    expect(isAppIconId('kx-mono')).toBe(true);
    expect(isAppIconId('kx-neon')).toBe(false); // replaced on 28 Sep: a phone still set to it shows Classic
    expect(isAppIconId('neon')).toBe(false);
  });

  it('only takes a Plus icon away once the plan is known and it isn’t Plus', () => {
    expect(shouldRevertIcon('gold', false, false)).toBe(false); // still loading
    expect(shouldRevertIcon('gold', true, true)).toBe(false);
    expect(shouldRevertIcon('gold', true, false)).toBe(true);
    expect(shouldRevertIcon('midnight', true, false)).toBe(false);
  });
});
