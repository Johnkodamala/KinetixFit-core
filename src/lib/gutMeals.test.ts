// A week of slow guts, end to end: the gut report (src/lib/gut.ts) feeding the meal ideas (src/lib/mealIdeas.ts), the way
// App.tsx wires them. The week is the one simulated on 3 Oct 2026 (a vegetarian in the UK: white bread, pasta and rice with
// dal, little water; constipation and bloating), built with the app's own food table so the logged names are the real ones
// ("Rice, white, cooked", "Cheddar cheese"…). It pinned two bugs: filler words from the foods' labels ("a" from
// "Kiwi (two a day)") made unrelated meals "on your gut report's list", and modifiers from logged names ("cooked" from
// "Rice, white, cooked") took 1.5 points off most lunches.
import { describe, expect, it } from 'vitest';
import { addDays, buildGutReport, reportDays, type GutChecks, type SymptomId } from './gut';
import { entryFromFood, findTableFood, foodFromTable, parseTypedPortion, type FoodDays } from './foodLog';
import { MEALS, rankMeals, type MealSlot } from './mealIdeas';

const TODAY = '2026-10-03';
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).getTime();

interface Day { feel: 1 | 2 | 3 | 4 | 5; sym?: SymptomId[]; sleep: number; water: number; foods: [string, string][] }
const WEEK: Day[] = [
  { feel: 3, sleep: 7, water: 1400, foods: [['09:30', '2 slices bread'], ['09:30', '2 slices cheddar'], ['13:30', '200 g pasta'], ['13:30', '3 tbsp curry sauce'], ['19:45', '1 cup rice'], ['19:45', '1 cup dal']] },
  { feel: 2, sym: ['bloating', 'constipation'], sleep: 5, water: 1000, foods: [['08:00', '2 slices bread'], ['08:00', '1 slice cheddar'], ['13:00', '2 slices pizza'], ['16:00', '30 g crisps'], ['20:00', '1 cup rice'], ['20:00', '1 cup dal']] },
  { feel: 3, sleep: 6, water: 1400, foods: [['08:15', '1 cup cornflakes'], ['08:15', '1 glass milk'], ['13:00', '2 slices bread'], ['13:00', '2 slices cheddar'], ['13:00', '1 tomato'], ['19:30', '150 g pasta'], ['19:30', '3 tbsp curry sauce'], ['19:30', '100 g peas']] },
  { feel: 2, sym: ['constipation', 'bloating'], sleep: 7, water: 1700, foods: [['08:00', '2 slices bread'], ['12:45', '1 cup rice'], ['12:45', '1 cup dal'], ['16:15', '1 banana'], ['20:30', '1 cup pasta']] },
  { feel: 3, sym: ['constipation'], sleep: 6, water: 1600, foods: [['08:20', '1 cup cornflakes'], ['08:20', '1 glass milk'], ['13:10', '2 slices pizza'], ['19:50', '1 cup rice'], ['19:50', '1 cup dal'], ['19:50', '1 cup yogurt']] },
  { feel: 4, sleep: 8, water: 1900, foods: [['08:30', '1 cup porridge'], ['08:30', '1 banana'], ['13:00', '2 slices brown bread'], ['13:00', '1 tomato'], ['13:00', '1 carrot'], ['19:30', '1 cup rice'], ['19:30', '100 g broccoli'], ['19:30', '1 cup chickpeas']] },
  { feel: 3, sym: ['bloating'], sleep: 6, water: 1400, foods: [['09:30', '2 slices bread'], ['09:30', '2 slices cheddar'], ['13:30', '1 cup pasta'], ['20:00', '1 cup rice'], ['20:00', '1 cup dal']] },
];

const checks: GutChecks = {};
const foodDays: FoodDays = {};
const waterMlByDay: Record<string, number> = {};
const sleepHoursByDay: Record<string, number> = {};
WEEK.forEach((d, i) => {
  const day = addDays(TODAY, i - 6);
  checks[day] = { feel: d.feel, symptoms: d.sym ?? [], at: at(day, '20:30') };
  waterMlByDay[day] = d.water;
  sleepHoursByDay[day] = d.sleep;
  foodDays[day] = d.foods.map(([time, text]) => {
    const typed = parseTypedPortion(text);
    const table = findTableFood(typed.name);
    if (!table) throw new Error(`not in the food table: ${text}`);
    const { food, portion } = foodFromTable(table, typed);
    return { ...entryFromFood(food, portion), id: `${day}-${time}-${table.fdcId}`, at: at(day, time) };
  });
});

const report = buildGutReport({
  checks, foodDays, waterMlByDay, waterGoalMl: 2000, fibreTarget: 30, diet: 'vegetarian', allergens: ['sesame'], country: 'GB',
  today: TODAY, sleepHoursByDay,
});

const wordsOf = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];
const mealWords = (meal: (typeof MEALS)[number]) => new Set([...wordsOf(meal.name), ...meal.ingredients.flatMap(([n]) => wordsOf(n))]);
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const rank = (slot: MealSlot, hints: boolean) => rankMeals({
  slot, goal: 'Cardio Endurance', targets: { kcal: 2362, protein: 102, fibre: 30 }, eaten: { kcal: 0, protein: 0, fibre: 0 },
  diet: 'vegetarian', allergens: ['sesame'], country: 'GB', recentFoods: [], hidden: [],
  ...(hints ? { gutFavour: report.rankHints.favour, gutAvoid: report.rankHints.avoid, wantsFermented: report.rankHints.wantsFermented } : {}),
});

describe('the report for a slow week', () => {
  it('is ready on the seventh day and says what the week called for', () => {
    expect(reportDays(TODAY)).toHaveLength(7);
    expect(report.headline).toBe('Your gut had a rough week.');
    expect(report.symptoms.map(s => s.id).sort()).toEqual(['bloating', 'constipation']);
    expect(report.suggestions.map(s => s.food.id)).toEqual(expect.arrayContaining(['linseed', 'kiwi', 'oats']));
  });

  it('does not tell the person to go easy on the rice they have every day', () => {
    // rice was on 6 of the 7 days: nothing to compare it with
    expect(report.goEasy.map(g => g.name.toLowerCase())).not.toContain('rice, white, cooked');
    // dal was on 5 of 7 and every one of those days was rough, with two days without it to compare
    expect(report.goEasy.map(g => g.name)).toContain('Dal');
  });
});

describe('what the report does to the meal ideas', () => {
  // the words of the foods the report suggests, in plain English: what a person means by "on the list"
  const suggestedWords = new Set(['oats', 'oat', 'porridge', 'linseed', 'linseeds', 'kiwi', 'strawberries', 'blueberries', 'berries', 'spinach', 'palak', 'saag']);

  it('says "on your gut report’s list" only for meals that have a suggested food', () => {
    for (const slot of SLOTS) {
      for (const r of rank(slot, true).filter(m => m.why.startsWith('On your gut report'))) {
        expect([...mealWords(r.meal)].some(w => suggestedWords.has(w)), `${slot}: ${r.meal.name}`).toBe(true);
      }
    }
  });

  it('does not put "a" or "plain" on the list: a pear and a few cashews is not a suggested food', () => {
    const snack = rank('snack', true);
    for (const id of ['pear-cashews', 'banana-milk', 'almonds-orange']) {
      expect(snack.find(r => r.meal.id === id)!.why, id).not.toMatch(/gut report/);
    }
  });

  it('takes points off only the meals that have a food to go easy on', () => {
    const goEasy = new Set(['dal', 'broccoli', 'pizza']);
    for (const slot of SLOTS) {
      const plain = rank(slot, false), gut = rank(slot, true);
      for (const r of gut) {
        const before = plain.find(p => p.meal.id === r.meal.id)!.score;
        const drop = Math.round((before - r.score) * 100) / 100;
        const hasFood = [...mealWords(r.meal)].some(w => goEasy.has(w));
        if (!hasFood) expect(drop, `${slot}: ${r.meal.name}`).toBeLessThanOrEqual(0); // a boost at most, never a penalty
      }
    }
  });

  it('leaves the quinoa breakfast with berries where it was: "cooked" is not a food', () => {
    const plain = rank('breakfast', false).find(r => r.meal.id === 'quinoa-berry-bowl')!;
    const gut = rank('breakfast', true).find(r => r.meal.id === 'quinoa-berry-bowl')!;
    expect(gut.score).toBeGreaterThanOrEqual(plain.score);
  });

  it('still takes a point and a half off the dal meals', () => {
    const plain = rank('lunch', false).find(r => r.meal.id === 'dal-rice')!;
    const gut = rank('lunch', true).find(r => r.meal.id === 'dal-rice')!;
    expect(Math.round((plain.score - gut.score) * 100) / 100).toBe(1.5);
  });
});
