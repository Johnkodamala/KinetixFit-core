import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GUT_FOODS, addDays, buildGutReport, daysBetween, gutReportStatus, gutPatterns, isFermented, loadGutChecks, plantsIn, possibleTriggers,
  reportDays, reportProgressText, saveGutCheck, tellingWords, type GutCheck, type GutChecks, type GutReportInput, type SymptomId,
} from './gut';
import { ZERO, type FoodDays, type LogEntry } from './foodLog';

const TODAY = '2026-09-28';
const day = (n: number) => addDays(TODAY, -n); // n days ago

const check = (feel: GutCheck['feel'], symptoms: SymptomId[] = []): GutCheck => ({ feel, symptoms, at: 0 });

/** One food eaten: `grams` of something with `fibre` g per 100 g. */
const food = (name: string, fibre = 1, grams = 100): LogEntry => ({
  id: `${name}-${Math.random()}`, foodKey: `name:${name}`, name, qty: grams, unit: 'g', unitGrams: 1, eaten: 1,
  per100g: { ...ZERO, kcal: 100, carbs: 15, fiber: fibre }, gramsKnown: true, estimated: false, at: 0,
});

/** The same check-in on each of the last 7 days (today first in `feels` is not implied: index 0 = 6 days ago). */
const week = (feels: GutCheck[]): GutChecks => Object.fromEntries(feels.map((c, i) => [day(6 - i), c]));

const input = (overrides: Partial<GutReportInput>): GutReportInput => ({
  checks: {}, foodDays: {}, waterMlByDay: {}, waterGoalMl: 2000, fibreTarget: 25, diet: 'everything', allergens: [], today: TODAY,
  ...overrides,
});

describe('days', () => {
  it('adds and counts calendar days', () => {
    expect(addDays('2026-09-28', 1)).toBe('2026-09-29');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-22', '2026-09-28')).toBe(6);
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('is DST-safe (UK clocks change on 29 March and 25 October 2026)', () => {
    vi.stubEnv('TZ', 'Europe/London');
    expect(new Date(2026, 2, 29, 12).getTimezoneOffset()).toBe(-60); // really on UK summer time
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
    expect(daysBetween('2026-03-27', '2026-03-31')).toBe(4);
  });

  it('reports cover the 7 days up to today, oldest first', () => {
    expect(reportDays(TODAY)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28']);
  });
});

describe('storage', () => {
  it('saves one check-in per day and keeps 90 days', () => {
    let all: GutChecks = { [day(95)]: check(3), [day(10)]: check(4) };
    all = saveGutCheck(all, TODAY, check(2, ['bloating']), TODAY);
    all = saveGutCheck(all, TODAY, check(5), TODAY); // changed later the same day
    expect(Object.keys(all).sort()).toEqual([day(10), TODAY]);
    expect(all[TODAY].feel).toBe(5);
    expect(loadGutChecks()).toEqual(all);
  });

  it('drops malformed check-ins and unknown symptoms when loading', () => {
    localStorage.setItem('kx_gut_checks', JSON.stringify({
      a: { feel: 4, symptoms: ['bloating', 'hiccups'], at: 1 },
      b: { feel: 9, symptoms: [], at: 1 },
      c: { feel: 3 },
      d: null,
    }));
    expect(loadGutChecks()).toEqual({ a: { feel: 4, symptoms: ['bloating'], at: 1 } });
    localStorage.setItem('kx_gut_checks', 'not json');
    expect(loadGutChecks()).toEqual({});
  });
});

describe('when the report is ready', () => {
  it('not before the first check-in', () => {
    const s = gutReportStatus({}, TODAY);
    expect(s).toEqual({ ready: false, daysSinceFirst: 0, checksThisWeek: 0 });
  });

  it('counts the days from the first check-in', () => {
    const s = gutReportStatus({ [day(2)]: check(4), [TODAY]: check(4) }, TODAY);
    expect(s.daysSinceFirst).toBe(3);
    expect(s.ready).toBe(false);
    expect(reportProgressText(s)).toMatch(/^Day 3 of 7\./);
  });

  it('after 7 days with check-ins on at least 4 of them', () => {
    const checks = { [day(6)]: check(4), [day(4)]: check(3), [day(2)]: check(4), [TODAY]: check(5) };
    const s = gutReportStatus(checks, TODAY);
    expect(s).toEqual({ ready: true, daysSinceFirst: 7, checksThisWeek: 4 });
    expect(reportProgressText(s)).toMatch(/ready/);
  });

  it('asks for more check-ins when a week has passed but too few were made this week', () => {
    const checks = { [day(20)]: check(4), [day(5)]: check(4), [day(1)]: check(4), [TODAY]: check(4) };
    const s = gutReportStatus(checks, TODAY);
    expect(s.ready).toBe(false);
    expect(reportProgressText(s)).toBe('Check in on 1 more day this week to get your gut report.');
  });

  it('ignores check-ins dated after today', () => {
    expect(gutReportStatus({ [addDays(TODAY, 3)]: check(4) }, TODAY).daysSinceFirst).toBe(0);
  });
});

describe('what food names say', () => {
  it('finds plants, counting a dish as each plant in it once', () => {
    expect(plantsIn('Idli').sort()).toEqual(['lentils', 'rice']);
    expect(plantsIn('Kidney beans, cooked')).toEqual(['kidney beans']);
    expect(plantsIn('Rajma chawal')).toEqual(['kidney beans']);
    expect(plantsIn('Baked beans on toast').sort()).toEqual(['beans', 'wheat']);
    expect(plantsIn('Palak paneer')).toEqual(['spinach']);
    expect(plantsIn('Chicken breast, roasted')).toEqual([]);
  });

  it('finds fermented foods', () => {
    expect(isFermented('Yogurt / curd, plain')).toBe(true);
    expect(isFermented('Masala dosa')).toBe(true);
    expect(isFermented('Buttermilk')).toBe(true);
    expect(isFermented('Paneer')).toBe(false);
  });
});

describe('possible trigger foods', () => {
  const days = reportDays(TODAY);

  it('flags a food eaten on ≥ 2 days that was followed by a worse gut each time', () => {
    const checks = week([check(4), check(2, ['bloating']), check(4), check(4), check(1, ['bloating', 'pain']), check(4), check(4)]);
    const foodDays: FoodDays = {
      [day(5)]: [food('Cheese pizza'), food('Rice')],
      [day(2)]: [food('Cheese pizza')],
      [day(6)]: [food('Rice')],
      [day(0)]: [food('Rice')],
    };
    const triggers = possibleTriggers(checks, foodDays, days);
    expect(triggers).toEqual([{ name: 'cheese pizza', times: 2, rough: 2, sameDay: 2 }]);
  });

  it('counts the day after at half weight: only ever coming the day before a rough day isn’t enough', () => {
    const checks = week([check(4), check(4), check(2), check(4), check(4), check(2), check(4)]);
    const foodDays: FoodDays = { [day(5)]: [food('Rice')], [day(2)]: [food('Rice')] };
    expect(possibleTriggers(checks, foodDays, days)).toEqual([]);
  });

  it('but helps a food that was mostly eaten on the rough days', () => {
    // rough on 5, 3 and 1 days ago; rajma on 5 and 3 (same day) and 2 (the day before a rough day)
    const checks = week([check(4), check(2), check(4), check(2), check(4), check(2), check(4)]);
    const foodDays: FoodDays = { [day(5)]: [food('Rajma')], [day(3)]: [food('Rajma')], [day(2)]: [food('Rajma')] };
    expect(possibleTriggers(checks, foodDays, days)).toEqual([{ name: 'rajma', times: 3, rough: 3, sameDay: 2 }]);
  });

  it('flags nothing when nearly every day was rough, or with too few check-ins', () => {
    const rough = week([check(2), check(1), check(2), check(2), check(1), check(2), check(4)]);
    const foodDays: FoodDays = { [day(5)]: [food('Dal')], [day(3)]: [food('Dal')] };
    expect(possibleTriggers(rough, foodDays, days)).toEqual([]);
    expect(possibleTriggers({ [day(5)]: check(1), [day(3)]: check(1) }, foodDays, days)).toEqual([]);
  });

  it('needs at least two days with the food', () => {
    const checks = week([check(4), check(1), check(4), check(4), check(4), check(4), check(4)]);
    expect(possibleTriggers(checks, { [day(5)]: [food('Samosa')] }, days)).toEqual([]);
  });
});

describe('the weekly report', () => {
  const lowFibreWeek: FoodDays = {
    [day(6)]: [food('White bread', 2), food('Rice', 0.4)],
    [day(5)]: [food('Rice', 0.4), food('Paneer', 0)],
    [day(4)]: [food('White bread', 2)],
    [day(3)]: [food('Rice', 0.4)],
  };

  it('constipation and little fibre: fibre and constipation foods, fluids and fibre tips', () => {
    const report = buildGutReport(input({
      checks: week([check(3, ['constipation']), check(2, ['constipation']), check(3), check(3, ['constipation']), check(4), check(3), check(3)]),
      foodDays: lowFibreWeek,
      diet: 'vegetarian-no-egg',
      allergens: ['milk'],
    }));
    const ids = report.suggestions.map(s => s.food.id);
    expect(report.fibreAvg).toBeLessThan(25 * 0.7);
    expect(ids.slice(0, 3)).toEqual(expect.arrayContaining(['oats', 'linseed', 'kiwi']));
    expect(ids).not.toContain('eggs');
    expect(ids).not.toContain('chicken');
    expect(ids).not.toContain('curd'); // milk allergy
    expect(report.suggestions.find(s => s.food.id === 'kiwi')!.reason).toMatch(/constipation on 3 days/);
    expect(report.tips.join(' ')).toMatch(/Drink plenty of water/);
    expect(report.symptoms[0]).toMatchObject({ id: 'constipation', days: 3 });
  });

  it('loose stools: plain foods, not high-fibre ones; caffeine eaten this week goes on "go easy"', () => {
    const report = buildGutReport(input({
      checks: week([check(2, ['loose']), check(2, ['loose']), check(3), check(3, ['loose']), check(4), check(4), check(3)]),
      foodDays: { ...lowFibreWeek, [day(1)]: [food('Coffee, black', 0)] },
    }));
    const ids = report.suggestions.map(s => s.food.id);
    expect(ids).toEqual(expect.arrayContaining(['banana', 'potato']));
    expect(ids).not.toContain('rice'); // already eaten on 3 days: something new is suggested instead
    for (const high of ['dal', 'chickpeas', 'rajma', 'wholemeal', 'almonds', 'sauerkraut']) expect(ids).not.toContain(high);
    expect(report.goEasy.map(g => g.name)).toContain('Coffee, black');
    expect(report.tips.join(' ')).toMatch(/Keep drinking fluids/);
  });

  it('bloating: nothing that causes wind is suggested, and gassy foods eaten this week are named', () => {
    const report = buildGutReport(input({
      checks: week([check(3, ['bloating']), check(2, ['gas', 'bloating']), check(3), check(4), check(2, ['bloating']), check(4), check(4)]),
      foodDays: { ...lowFibreWeek, [day(2)]: [food('Rajma', 6)] },
    }));
    const gassy = GUT_FOODS.filter(f => f.gassy).map(f => f.id);
    for (const s of report.suggestions) expect(gassy).not.toContain(s.food.id);
    expect(report.goEasy.map(g => g.name)).toContain('Rajma');
    expect(report.tips.join(' ')).toMatch(/fizzy drinks/);
  });

  it('heartburn: no peppermint, and coffee is named', () => {
    const report = buildGutReport(input({
      checks: week([check(3, ['heartburn']), check(2, ['heartburn']), check(3), check(4), check(4), check(4), check(4)]),
      foodDays: { ...lowFibreWeek, [day(1)]: [food('Latte', 0)] },
    }));
    expect(report.suggestions.map(s => s.food.id)).not.toContain('peppermint');
    expect(report.goEasy.map(g => g.name)).toContain('Latte');
    expect(report.tips.join(' ')).toMatch(/3–4 hours before bed/);
  });

  it('nausea: ginger first', () => {
    const report = buildGutReport(input({
      checks: week([check(2, ['nausea']), check(2, ['nausea']), check(3), check(4), check(4), check(4), check(4)]),
    }));
    expect(report.suggestions[0].food.id).toBe('ginger');
  });

  it('only suggests foods that fit the diet', () => {
    const loose = week([check(2, ['loose']), check(2, ['loose']), check(3), check(4), check(4), check(4), check(4)]);
    const everything = buildGutReport(input({ checks: loose }));
    const veg = buildGutReport(input({ checks: loose, diet: 'vegetarian' }));
    const noEgg = buildGutReport(input({ checks: loose, diet: 'vegetarian-no-egg' }));
    const all = (r: typeof veg) => r.suggestions.map(s => s.food.diet);
    expect(all(veg)).not.toContain('meat');
    expect(all(noEgg)).not.toContain('meat');
    expect(all(noEgg)).not.toContain('egg');
    expect(everything.suggestions.length).toBeGreaterThan(0);
  });

  it('puts the person’s own possible trigger first on "go easy", worded as maybe', () => {
    const report = buildGutReport(input({
      checks: week([check(4), check(2, ['bloating']), check(4), check(4), check(1, ['bloating']), check(4), check(4)]),
      foodDays: { ...lowFibreWeek, [day(5)]: [food('Cheese pizza')], [day(2)]: [food('Cheese pizza')] },
    }));
    // rice happened to be eaten the day before both rough days; pizza was eaten on them — only pizza is named
    expect(report.goEasy.map(g => g.name)).toEqual(['Cheese pizza']);
    expect(report.goEasy[0].reason).toMatch(/every time.*could be a coincidence/);
  });

  it('a good week: good headline, no doctor warning', () => {
    const report = buildGutReport(input({ checks: week(Array.from({ length: 7 }, () => check(5))), foodDays: lowFibreWeek }));
    expect(report.headline).toBe('Your gut had a good week.');
    expect(report.avgFeel).toBe(5);
    expect(report.goodDays).toBe(7);
    expect(report.seeDoctor).toBe(false);
  });

  it('a rough week: rough headline and the doctor note', () => {
    const report = buildGutReport(input({
      checks: week([check(2, ['pain']), check(1, ['pain']), check(2), check(2, ['pain']), check(2), check(3), check(4)]),
    }));
    expect(report.headline).toBe('Your gut had a rough week.');
    expect(report.roughDays).toBe(5);
    expect(report.seeDoctor).toBe(true);
  });

  it('few food days: no fibre figure, and a nudge to log meals', () => {
    const report = buildGutReport(input({
      checks: week([check(4), check(4), check(4), check(4), check(3), check(4), check(4)]),
      foodDays: { [day(1)]: [food('Dal', 8)] },
    }));
    expect(report.fibreAvg).toBeNull();
    expect(report.foodDaysLogged).toBe(1);
    expect(report.tips.join(' ')).toMatch(/Log what you eat/);
  });

  it('water: the average over days with water logged, and a tip when it’s under goal', () => {
    const report = buildGutReport(input({
      checks: week([check(3, ['constipation']), check(3, ['constipation']), check(4), check(4), check(4), check(4), check(4)]),
      waterMlByDay: { [day(3)]: 1000, [day(2)]: 1200, [day(1)]: 1400 },
    }));
    expect(report.waterAvgMl).toBe(1200);
    expect(report.tips.join(' ')).toMatch(/1200 ml a day, under your 2000 ml goal/);
    expect(buildGutReport(input({})).waterAvgMl).toBeNull();
  });

  it('counts different plants and suggests variety when there are few', () => {
    const report = buildGutReport(input({ checks: week(Array.from({ length: 7 }, () => check(4))), foodDays: lowFibreWeek }));
    expect(report.plants).toEqual(['rice', 'wheat']);
    expect(report.tips.join(' ')).toMatch(/2 different plants this week/);
  });

  it('with no check-ins it says so', () => {
    expect(buildGutReport(input({})).headline).toBe('No gut check-ins this week.');
  });
});

describe('lifestyle patterns', () => {
  // 14 days of check-ins: rough (2) on the even days, good (4) on the odd ones
  const fortnight: GutChecks = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(i), check(i % 2 === 0 ? 2 : 4)]));

  it('finds that short sleep went with rough days — and says it’s a pattern, not proof', () => {
    const sleepHoursByDay = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(i), i % 2 === 0 ? 5.5 : 8]));
    const p = gutPatterns(input({ checks: fortnight, sleepHoursByDay }));
    expect(p[0]).toBe('Your gut was rough on 7 of 7 days after less than 7 hours of sleep, and 0 of 7 after 7 hours of sleep or more. Sleep and gut health are linked — a steady bedtime may help.');
  });

  it('needs three days on each side and a big difference', () => {
    const fewShort = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(i), i < 2 ? 5 : 8]));
    expect(gutPatterns(input({ checks: fortnight, sleepHoursByDay: fewShort }))).toEqual([]);
    const noDifference = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(i), i % 4 < 2 ? 5 : 8]));
    expect(gutPatterns(input({ checks: fortnight, sleepHoursByDay: noDifference }))).toEqual([]);
  });

  it('looks at late meals the evening before', () => {
    const late = (d: string) => ({ ...food('curry'), at: new Date(`${d}T22:15:00`).getTime() });
    const early = (d: string) => ({ ...food('curry'), at: new Date(`${d}T18:30:00`).getTime() });
    // the evening before each rough (even) day was a late meal
    const foodDays: FoodDays = Object.fromEntries(Array.from({ length: 15 }, (_, i) => {
      const d = day(i + 1);
      return [d, [(i % 2 === 0) ? late(d) : early(d)]];
    }));
    const p = gutPatterns(input({ checks: fortnight, foodDays }));
    expect(p.some(x => /after eating after 9 pm/.test(x))).toBe(true);
  });

  it('is part of the weekly report', () => {
    const activeByDay = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(i), i % 2 === 1]));
    expect(buildGutReport(input({ checks: fortnight, activeByDay })).patterns[0]).toMatch(/on quieter days/);
  });
});

describe('foods eaten almost every day', () => {
  const days = reportDays(TODAY);
  // rough on 5, 3, 2 and 0 days ago (4 of 7)
  const checks = week([check(4), check(2), check(4), check(2), check(2), check(4), check(2)]);

  it('are not flagged as a trigger: with no days without it there is nothing to compare', () => {
    // rice on 6 of the 7 days, so a rough day or the day before one was always going to have rice
    const sixDays: FoodDays = Object.fromEntries([0, 1, 2, 3, 5, 6].map(n => [day(n), [food('Rice, white, cooked')]]));
    expect(possibleTriggers(checks, sixDays, days)).toEqual([]);
  });

  it('but a food that leaves two days to compare against still can be', () => {
    const fiveDays: FoodDays = Object.fromEntries([0, 2, 3, 5, 6].map(n => [day(n), [food('Rice, white, cooked')]]));
    expect(possibleTriggers(checks, fiveDays, days).map(t => t.name)).toEqual(['rice, white, cooked']);
  });

  it('counts only the days the gut can be told: in a short week "almost every day" is fewer days', () => {
    const short: GutChecks = { [day(6)]: check(4), [day(5)]: check(2), [day(4)]: check(2), [day(3)]: check(2), [day(2)]: check(4) };
    const rice: FoodDays = Object.fromEntries([6, 5, 4, 3].map(n => [day(n), [food('Rice')]])); // 4 of the 5 days that can tell
    const dal: FoodDays = Object.fromEntries([5, 4, 3].map(n => [day(n), [food('Dal')]])); // 3 of the 5
    expect(possibleTriggers(short, rice, days)).toEqual([]);
    expect(possibleTriggers(short, dal, days).map(t => t.name)).toEqual(['dal']);
  });
});

describe('words for the meal ideas', () => {
  const FILLER = ['a', 'an', 'the', 'of', 'or', 'and', 'with', 'to', 'up', 'on', 'day', 'two', 'few', 'tbsp', 'tsp', 'cup', 'glass', 'handful', 'small', 'plain', 'ground'];

  it('names a food by the words that say what it is: amounts and joining words go', () => {
    expect(tellingWords('Kiwi (two a day)')).toEqual(['kiwi']);
    expect(tellingWords('Strawberries or blueberries')).toEqual(['strawberries', 'blueberries']);
    expect(tellingWords('Ground linseeds (up to 1 tbsp a day)')).toEqual(['ground', 'linseeds']);
    expect(tellingWords('A handful of almonds')).toEqual(['almonds']);
  });

  it('splits a name the way the meal ideas read their own ingredient names (hyphens split)', () => {
    expect(tellingWords('Egg, hard-boiled')).toEqual(['egg', 'hard', 'boiled']);
    expect(tellingWords('Rice, white, cooked')).toEqual(['rice', 'white', 'cooked']);
  });

  it('every food to try says how meals name it, in lower-case words and never filler', () => {
    for (const f of GUT_FOODS) {
      expect(f.inMeals.length, f.id).toBeGreaterThan(0);
      for (const phrase of f.inMeals) {
        expect(phrase.length, f.id).toBeGreaterThan(0);
        for (const w of phrase) {
          expect(w, f.id).toMatch(/^[a-z]+$/);
          expect(FILLER, `${f.id}: ${w}`).not.toContain(w);
        }
      }
    }
  });

  const constipated = () => buildGutReport(input({
    checks: week([check(3, ['constipation']), check(2, ['constipation']), check(3), check(3, ['constipation']), check(4), check(3), check(3)]),
    foodDays: {
      [day(6)]: [food('White bread', 2), food('Rice, white, cooked', 0.4)],
      [day(5)]: [food('Rice, white, cooked', 0.4), food('Dal', 3)],
      [day(4)]: [food('White bread', 2)],
      [day(3)]: [food('Rice, white, cooked', 0.4)],
    },
    diet: 'vegetarian',
  }));

  it('hands the meal ideas the suggested foods’ meal words, and only those', () => {
    const report = constipated();
    expect(report.suggestions.length).toBeGreaterThan(0);
    const expected = report.suggestions.flatMap(s => s.food.inMeals);
    expect(report.rankHints.favour).toEqual(expect.arrayContaining(expected));
    expect(report.rankHints.favour.length).toBe(new Set(expected.map(p => p.join(' '))).size);
    for (const w of report.rankHints.favour.flat()) expect(FILLER, w).not.toContain(w);
  });

  it('asks them to go easy on a food by all the words of its name, so "cooked" or "white" alone never match', () => {
    // dal on 3 of the 4 rough-ish days: a possible trigger, named the way it was logged
    const checks = week([check(4), check(2, ['constipation']), check(4), check(2, ['bloating']), check(4), check(2, ['bloating']), check(4)]);
    const foodDays: FoodDays = {
      [day(5)]: [food('Rice, white, cooked'), food('Dal')], [day(3)]: [food('Rice, white, cooked'), food('Dal')],
      [day(1)]: [food('Dal')], [day(2)]: [food('Pasta, cooked')],
    };
    const report = buildGutReport(input({ checks, foodDays, diet: 'vegetarian' }));
    expect(report.goEasy.map(g => g.name)).toContain('Dal');
    expect(report.rankHints.avoid).toContainEqual(['dal']);
    // a lone modifier ("cooked", "white") would match half the meals: a phrase is the food's whole name
    for (const phrase of report.rankHints.avoid) if (phrase.length === 1) expect(['cooked', 'white', 'black', 'plain', 'brown']).not.toContain(phrase[0]);
  });

  it('only nudges towards fermented meals when the report would suggest fermented food: not while bloated', () => {
    const foods: FoodDays = { [day(6)]: [food('Rice')], [day(5)]: [food('Rice')], [day(4)]: [food('Rice')] };
    const calm = buildGutReport(input({ checks: week([check(4), check(4), check(4), check(4), check(4), check(4), check(4)]), foodDays: foods }));
    const bloated = buildGutReport(input({ checks: week([check(3, ['bloating']), check(2, ['bloating']), check(4), check(4), check(4), check(4), check(4)]), foodDays: foods }));
    expect(calm.rankHints.wantsFermented).toBe(true);
    expect(bloated.rankHints.wantsFermented).toBe(false);
    // the same rule as the report's own list: no fermented food suggested while bloated either
    expect(bloated.suggestions.some(s => s.food.fermented)).toBe(false);
  });
});
