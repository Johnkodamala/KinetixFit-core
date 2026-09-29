// Water, check-ins, quests, nutrition targets, BMI, countries, reminders and dates.
import { describe, expect, it } from 'vitest';
import { localDayKey, localDayKeyDaysAgo } from './dates';
import { dayMl, loadGlassMl, loadWaterGoalMl, saveWaterLog, loadWaterLog, waterAmount, withDrinks, withoutDrink, waterWeek } from './water';
import { saveCheckIn, loadCheckIns, sleepEnergyInsight, sleepChoiceLabel } from './checkins';
import { questsForToday, type QuestData } from './quests';
import { mainTargets, moreTargets, statusOf, statusText } from './nutrition';
import { bmiOf, suggestGoal } from './bmi';
import { countryByCode, countryOf, fmtNumber, setActiveCountry } from './countries';
import { reminderHours, hydrationWindow, gutReminderNotifications, GUT_REMINDER_IDS } from './notifications';

describe('dates', () => {
  it('uses the local calendar day', () => {
    expect(localDayKey(new Date(2026, 8, 28, 23, 59))).toBe('2026-09-28');
    expect(localDayKey(new Date(2026, 8, 29, 0, 1))).toBe('2026-09-29');
    expect(localDayKeyDaysAgo(1, new Date(2026, 2, 1, 9))).toBe('2026-02-28');
  });
});

describe('water', () => {
  it('logs drinks under their own day, oldest first, and removes one by its time', () => {
    const today = new Date(); today.setHours(10, 0, 0, 0);
    const t = today.getTime();
    let log = withDrinks({}, [[t + 60_000, 500], [t, 250]]);
    const day = localDayKey(today);
    expect(log[day]).toEqual([[t, 250], [t + 60_000, 500]]);
    expect(dayMl(log, day)).toBe(750);
    log = withoutDrink(log, t);
    expect(dayMl(log, day)).toBe(500);
  });

  it('counts an older bare-time entry as a 250 ml glass', () => {
    expect(dayMl({ d: [123, [456, 100]] }, 'd')).toBe(350);
  });

  it('keeps 35 days and survives bad data', () => {
    const old = localDayKeyDaysAgo(40);
    const recent = localDayKeyDaysAgo(2);
    saveWaterLog({ [old]: [[1, 250]], [recent]: [[2, 250]] });
    expect(Object.keys(loadWaterLog())).toEqual([recent]);
    localStorage.setItem('kinetix_water_log', 'oops');
    expect(loadWaterLog()).toEqual({});
  });

  it('converts an old goal in glasses to an amount, and defaults sensibly', () => {
    expect(loadWaterGoalMl()).toBe(2000);
    localStorage.setItem('kinetix_water_goal', '8');
    expect(loadWaterGoalMl()).toBe(2000);
    localStorage.setItem('kinetix_water_goal', '12');
    expect(loadWaterGoalMl()).toBe(3000);
    localStorage.setItem('kinetix_water_goal_ml', '2500');
    expect(loadWaterGoalMl()).toBe(2500);
    expect(loadGlassMl()).toBe(250);
    localStorage.setItem('kinetix_glass_ml', '999');
    expect(loadGlassMl()).toBe(250);
  });

  it('shows amounts in ml and L, and a 7-day week', () => {
    expect(waterAmount(750)).toBe('750 ml');
    expect(waterAmount(1500)).toBe('1.5 L');
    expect(waterAmount(1250)).toBe('1.25 L');
    expect(waterAmount(2000)).toBe('2 L');
    expect(waterWeek({})).toHaveLength(7);
  });
});

describe('morning check-in', () => {
  it('saves one per day', () => {
    const all = saveCheckIn({}, { sleepHours: 7, energy: 4, at: Date.now() });
    expect(Object.keys(all)).toEqual([localDayKey()]);
    expect(loadCheckIns()).toEqual(all);
  });

  it('only compares sleep and energy with three days on each side', () => {
    const days = (n: number, hours: number, energy: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`${hours}-${i}`, { sleepHours: hours, energy, at: 0 }]));
    expect(sleepEnergyInsight({ ...days(3, 8, 4), ...days(2, 5, 2) }, {})).toBeNull();
    expect(sleepEnergyInsight({ ...days(3, 8, 4), ...days(3, 5, 2) }, {})).toEqual({ rested: 4, short: 2 });
    expect(sleepChoiceLabel(9)).toBe('9+ h');
    expect(sleepChoiceLabel(4)).toBe('4 or less');
  });
});

describe('quests', () => {
  const data = (over: Partial<QuestData> = {}): QuestData => ({
    steps: 4000, sleepMinutes: 400, hrv: 55, foodChecks: 1, protein: 60, proteinTarget: 120, fibre: 10, fibreTarget: 30,
    workoutsToday: 0, ...over,
  });

  it('offers three quests the data can show, in the goal’s order', () => {
    const q = questsForToday('Weight Loss', data(), []);
    expect(q.map(x => x.id)).toEqual(['Q-steps-10000', 'Q-fibre-30', 'Q-workout']);
    expect(q[0].progressLabel).toBe('4,000 / 10,000 steps');
    expect(q[1].text).toBe('Get 30 g of fibre');
  });

  it('never offers HRV or workouts when the source doesn’t share them (Samsung Health)', () => {
    const q = questsForToday('Autonomic Recovery', data({ hrv: null, workoutsToday: null }), []);
    expect(q.map(x => x.id)).toEqual(['Q-sleep-7h', 'Q-steps-7000', 'Q-food-3']);
  });

  it('keeps claimed quests and marks met ones done', () => {
    const q = questsForToday('Weight Loss', data({ steps: 12000 }), ['Q-food-3']);
    expect(q.map(x => x.id)).toEqual(['Q-food-3', 'Q-steps-10000', 'Q-fibre-30']);
    expect(q.find(x => x.id === 'Q-steps-10000')!.done).toBe(true);
  });

  it('works with nothing shared but food', () => {
    const q = questsForToday('Cardio Endurance', data({ steps: null, sleepMinutes: null, hrv: null, workoutsToday: null }), []);
    expect(q.map(x => x.source)).toEqual(['food', 'food']);
  });
});

describe('nutrition targets', () => {
  const plan = { calories: 2000, protein: 100, carbs: 250, fat: 70, fiber: 30 };

  it('main five in order', () => {
    expect(mainTargets(plan).map(t => t.key)).toEqual(['kcal', 'protein', 'carbs', 'fat', 'fiber']);
  });

  it('follows the country’s guidance', () => {
    const uk = moreTargets(plan, { sex: 'female', age: 30, country: 'GB' });
    expect(uk.find(t => t.key === 'satFat')!.amount).toBe(20);
    expect(uk.find(t => t.key === 'sugars')!.kind).toBe('limit');
    expect(uk.find(t => t.key === 'ironMg')!.amount).toBe(14.8);
    const india = moreTargets(plan, { sex: 'male', age: 30, country: 'IN' });
    expect(india.find(t => t.key === 'sugars')!.kind).toBe('none');
    expect(india.find(t => t.key === 'satFat')!.amount).toBe(22); // 10% of 2000 kcal
  });

  it('status and wording', () => {
    const [kcal, protein] = mainTargets(plan);
    expect(statusOf(protein, 100)).toBe('met');
    expect(statusOf(protein, 50)).toBe('short');
    expect(statusOf(kcal, 1900)).toBe('met');
    expect(statusOf(kcal, 2300)).toBe('over');
    const fmt = (n: number) => `${Math.round(n)} g`;
    expect(statusText(protein, 52, fmt)).toBe('48 g to go');
    expect(statusText(protein, 120, fmt)).toBe('Reached');
    expect(statusText(kcal, 2100, fmt)).toBe('100 g over');
  });
});

describe('BMI and countries', () => {
  it('computes BMI', () => {
    expect(bmiOf(180, 81)).toBeCloseTo(25);
  });

  it('suggests a goal using the country’s cut-offs', () => {
    const p = { height: 170, weight: 68, age: 30, region: null };
    expect(suggestGoal({ ...p, country: 'GB' })!.goal).toBe('Cardio Endurance'); // 23.5, healthy in the UK
    expect(suggestGoal({ ...p, country: 'IN' })!.goal).toBe('Weight Loss'); // above India's 22.9
    expect(suggestGoal({ ...p, weight: 50, country: 'GB' })!.goal).toBe('Weight Gain');
    expect(suggestGoal({ ...p, age: 16, country: 'GB' })).toBeNull();
  });

  it('formats numbers the country’s way', () => {
    setActiveCountry(countryByCode('IN'));
    expect(fmtNumber(100000)).toBe('1,00,000');
    setActiveCountry(countryByCode('GB'));
    expect(fmtNumber(100000)).toBe('100,000');
    expect(countryOf({ country: null, region: 'london' }).code).toBe('GB');
  });
});

describe('reminders', () => {
  it('spreads water reminders across the active hours, overnight too', () => {
    expect(reminderHours(9, 17, 2)).toEqual([9, 11, 13, 15, 17]);
    expect(reminderHours(21, 3, 2)).toEqual([21, 23, 1, 3]);
    expect(reminderHours(9, 12, 0)).toEqual([9, 10, 11, 12]);
  });

  it('knows where now sits in the water schedule', () => {
    const at = (h: number) => new Date(2026, 8, 28, h, 30).getTime();
    const w = hydrationWindow(9, 17, 2, at(12));
    expect(new Date(w.next!).getHours()).toBe(13);
    expect(new Date(w.prev!).getHours()).toBe(11);
    expect(w.done).toBe(false);
    expect(hydrationWindow(9, 17, 2, at(19)).done).toBe(true);
  });

  it('gut check-in reminders: 20:00 on the next days without a check-in', () => {
    const now = new Date(2026, 8, 28, 18, 0);
    const answered = (d: Date) => d.getDate() === 28; // today is done
    const n = gutReminderNotifications(now, answered);
    expect(n).toHaveLength(7);
    expect(n.map(x => x.id)).toEqual(GUT_REMINDER_IDS);
    const first = (n[0].schedule as { at: Date }).at;
    expect([first.getDate(), first.getHours()]).toEqual([29, 20]);
    expect(n[0].extra).toEqual({ open: 'gut' });
  });

  it('includes today when it’s before 20:00 and not answered, and never a time already past', () => {
    const before = gutReminderNotifications(new Date(2026, 8, 28, 18, 0), () => false);
    expect((before[0].schedule as { at: Date }).at.getDate()).toBe(28);
    const after = gutReminderNotifications(new Date(2026, 8, 28, 21, 0), () => false);
    expect((after[0].schedule as { at: Date }).at.getDate()).toBe(29);
  });
});
