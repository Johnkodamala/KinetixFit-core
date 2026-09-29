// api/_lib/nutrition.js + foodNormalize.js: the lookup rules. Each rule is tested both ways — what it now rejects, and
// that ordinary foods still match (a stricter rule mustn't turn real foods into "not found").
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agrees, findTableFood, lookupNutrition, matchScore } from '../_lib/nutrition.js';
import { normalizeFoodName } from '../_lib/foodNormalize.js';
import { FOOD_TABLE } from '../_lib/foodTable.js';
import { findTableFood as phoneFindTableFood } from '../../src/lib/foodLog.ts';

const fixture = query => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'usda', `${query.replace(/\s+/g, '-')}.json`), 'utf8'));

// USDA search answers: { query: { generic: [...], branded: [...] } }; records what was asked
function stubUsda(answers) {
  const asked = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const { query, dataType } = JSON.parse(init.body);
    const branded = dataType.includes('Branded');
    asked.push({ query, branded });
    const answer = answers[query] ?? { generic: [], branded: [] };
    return new Response(JSON.stringify({ foods: (branded ? answer.branded : answer.generic) ?? [] }));
  }));
  return asked;
}
afterEach(() => vi.unstubAllGlobals());

const usdaFood = (description, [kcal, protein, carbs, fat], extra = {}) => ({
  description, dataType: 'SR Legacy', ...extra,
  foodNutrients: [{ nutrientId: 1008, value: kcal }, { nutrientId: 1003, value: protein }, { nutrientId: 1005, value: carbs }, { nutrientId: 1004, value: fat }],
});

describe('normalizeFoodName', () => {
  it.each([
    ['watermelon slice', 'watermelon'],
    ['2 slices of watermelon', 'watermelon'],
    ['Watermelon wedges', 'watermelon'],
    ['a large banana', 'banana'],
    ['glass of milk', 'milk'],
    ['a bowl of curd', 'yogurt'],
    ['dahi', 'yogurt'],
    ['cup of chai', 'tea with milk'],
    ['Masala chai', 'tea with milk'],
    // a dish, not curd on its own
    ['curd rice', 'curd rice'],
    ['veg biryani', 'vegetable biryani'],
    ['mixed veggies', 'mixed vegetable'],
    // names that have a piece word in them
    ['glass noodles', 'glass noodles'],
    ['bowl', 'bowl'],
    ['chicken curry', 'chicken curry'],
  ])('%s → %s', (name, query) => {
    expect(normalizeFoodName(name).query).toBe(query);
  });
});

describe('matchScore: whole words, singular or plural', () => {
  // real USDA names that must keep matching what people type
  it.each([
    ['banana', 'Bananas, raw'],
    ['tomato', 'Tomatoes, red, ripe, raw, year round average'],
    ['tomatoes', 'Tomatoes, red, ripe, raw, year round average'],
    ['cherry', 'Cherries, sweet, raw'],
    ['cherries', 'Cherries, sweet, raw'],
    ['grape', 'Grapes, red or green (European type, such as Thompson seedless), raw'],
    ['potato', 'Potatoes, boiled, cooked in skin, flesh, without salt'],
    ['egg', 'Egg, whole, cooked, hard-boiled'],
    ['eggs', 'Egg, whole, raw, fresh'],
    ['oats', 'Oats, raw'],
    ['hummus', 'Hummus, commercial'],
    ['couscous', 'Couscous, cooked'],
    ['mango', 'Mangos, raw'],
    ['peach', 'Peaches, yellow, raw'],
    ['turkey', 'Turkey, whole, meat only, cooked, roasted'],
    ['cashew', 'Nuts, cashew nuts, raw'],
    ['green beans', 'Beans, snap, green, cooked, boiled, drained, without salt'],
    ['chicken curry', 'Chicken curry'],
    ['tea with milk', 'Tea, hot, with milk'],
    // -ed / -ing forms, and two typed words written as one in USDA's name
    ['mung sprouts', 'Mung beans, mature seeds, sprouted, raw'],
    ['roast chicken', 'Chicken, broilers or fryers, meat only, roasted'],
    ['fried rice', 'Rice, fried, plain'],
    ['broad beans', 'Broadbeans (fava beans), mature seeds, cooked, boiled, without salt'],
    ['soy milk', 'Soymilk, original and vanilla, unfortified'],
    ['black eyed peas', 'Blackeyed peas, from dried'],
  ])('%s still matches "%s"', (query, description) => {
    expect(matchScore({ description, dataType: 'SR Legacy' }, query)).toBeGreaterThanOrEqual(0);
  });

  // a typed word that is only the start of a different food's name
  it.each([
    ['chai', 'Fast Food, Pizza Chain, 14" pizza, cheese topping, thin crust'],
    ['egg', 'Eggplant, raw'],
    ['pea', 'Peanuts, all types, raw'],
    ['corn', 'Cornstarch'],
    ['ham', 'Hamburger, single, regular patty'],
    ['apple', 'Applesauce, canned, unsweetened, without added ascorbic acid'],
    ['milk', 'Buttermilk'],
    ['chole', 'Mayonnaise dressing, no cholesterol'],
  ])('%s no longer matches "%s"', (query, description) => {
    expect(matchScore({ description, dataType: 'SR Legacy' }, query)).toBe(-1);
  });
});

describe('findTableFood on the server finds what the phone finds', () => {
  const names = [...FOOD_TABLE.flatMap(f => f.names), 'Bananas', 'a medium banana', 'fresh apple', 'raw carrots', 'whole milk', 'cheese pizza'];
  it.each(names)('%s', name => {
    expect(findTableFood(name)?.fdcId).toBe(phoneFindTableFood(name)?.fdcId);
  });
});

describe('agrees: a database food against the typical numbers for what was seen', () => {
  const per100 = (calories, protein) => ({ calories, protein });
  it('rejects the wrong food', () => {
    expect(agrees(per100(151, 12.5), { kcal: 61, protein: 3.5 })).toBe(false); // soybean curd cheese for curd
    expect(agrees(per100(207, 0), { kcal: 30, protein: 0.6 })).toBe(false); // candy for watermelon
    expect(agrees(per100(389, 16.9), { kcal: 70, protein: 2.5 })).toBe(false); // dry oats for a bowl of porridge
  });
  it('accepts the right one, and small differences', () => {
    expect(agrees(per100(392, 9.6), { kcal: 370, protein: 9 })).toBe(true); // muesli
    expect(agrees(per100(61, 3.15), { kcal: 61, protein: 3.2 })).toBe(true); // milk
    expect(agrees(per100(15, 0.65), { kcal: 15, protein: 0.7 })).toBe(true); // cucumber
    expect(agrees(per100(71, 2.5), { kcal: 70, protein: 2.5 })).toBe(true); // porridge
  });
  it('lets anything through when there is nothing to compare against', () => {
    expect(agrees(per100(151, 12.5), undefined)).toBe(true);
  });
});

describe('lookupNutrition', () => {
  it('answers table foods from the table, without asking USDA', async () => {
    const asked = stubUsda({});
    expect((await lookupNutrition('watermelon slice')).matched).toBe('Watermelon, raw');
    expect((await lookupNutrition('dahi')).matched).toBe('Yogurt, plain, whole milk');
    expect((await lookupNutrition('a bowl of curd')).nutrientValues.protein).toBe(3.47);
    expect(asked).toHaveLength(0);
  });

  it('gives table drinks their density', async () => {
    stubUsda({});
    expect(await lookupNutrition('milk')).toMatchObject({ drink: true, density: 1.031, densityAssumed: false });
    // poured, but not a drink
    const oil = await lookupNutrition('olive oil');
    expect(oil.density).toBe(0.913);
    expect(oil.drink).toBeUndefined();
  });

  it('searches USDA with the cleaned-up name', async () => {
    const asked = stubUsda({ 'tea with milk': fixture('tea with milk') });
    expect((await lookupNutrition('cup of chai')).matched).toBe('Tea, hot, with milk');
    expect(asked[0]).toEqual({ query: 'tea with milk', branded: false });
  });

  it('never uses sweets in place of a food', async () => {
    stubUsda({
      'dried apricot': {
        generic: [],
        branded: [
          usdaFood('DRIED APRICOT GUMMIES', [340, 4, 80, 0], { dataType: 'Branded', foodCategory: 'Candy' }),
          usdaFood('DRIED APRICOTS', [241, 3.4, 62.6, 0.5], { dataType: 'Branded', foodCategory: 'Dried Fruit' }),
        ],
      },
      'apricot gummies': { generic: [], branded: [usdaFood('APRICOT GUMMIES', [340, 4, 80, 0], { dataType: 'Branded', foodCategory: 'Candy' })] },
    });
    expect((await lookupNutrition('dried apricot')).matched).toBe('DRIED APRICOTS');
    // unless sweets are what was asked for
    expect((await lookupNutrition('apricot gummies')).matched).toBe('APRICOT GUMMIES');
  });

  it('still takes branded products when USDA has nothing generic', async () => {
    stubUsda({ muesli: fixture('muesli') });
    expect((await lookupNutrition('muesli')).matched).toBe('MUESLI');
  });

  it('reads branded drinks per 100 ml and gives the numbers per 100 g', async () => {
    stubUsda({ 'mango lassi': fixture('mango lassi') });
    const lassi = await lookupNutrition('mango lassi');
    // 90 kcal per 100 ml at 1.03 g per ml = 87.4 kcal per 100 g
    expect(lassi.nutrientValues.calories).toBeCloseTo(90 / 1.03, 5);
    expect(lassi.nutrientValues.protein).toBeCloseTo(2.8 / 1.03, 5);
    expect(lassi).toMatchObject({ drink: true, density: 1.03, densityAssumed: false });
  });

  it('keeps branded foods sold by weight as they are', async () => {
    stubUsda({ muesli: fixture('muesli') });
    const muesli = await lookupNutrition('muesli');
    expect(muesli.nutrientValues.calories).toBe(392);
    expect(muesli.drink).toBeUndefined();
  });
});
