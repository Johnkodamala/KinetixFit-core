import { describe, expect, it } from 'vitest';
import {
  EXTRAS, ZERO, entryFromFood, entryNutrients, extraAmountText, extrasFromNote, extrasFromNoteExcept, extrasText, farFromTable,
  findFoodByName, findTableFood, foodFromScan, foodFromScanItem, foodFromTable, isPlausible, loadFoodDays, loadFoods, mealCount, nameKey,
  parseTypedPortion, portionText, saveFoodDays, savedFoodPortion, splitTypedMeal, sumNutrients, typicalUnit, withExtra,
  type LogEntry, type SavedFood, type ScanItem, type ScanPayload,
} from './foodLog';
import { localDayKey, localDayKeyDaysAgo } from './dates';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'e1', foodKey: 'name:toast', name: 'toast', qty: 2, unit: 'slice', unitGrams: 36, eaten: 1,
  per100g: { ...ZERO, kcal: 250, carbs: 45, protein: 9, fat: 3, fiber: 3 }, gramsKnown: true, estimated: false, at: 0, ...over,
});

describe('parseTypedPortion', () => {
  it.each([
    ['2 slices of bread', { name: 'bread', qty: 2, unit: 'slice' }],
    ['150g rice', { name: 'rice', qty: 150, unit: 'g' }],
    ['150 g of rice', { name: 'rice', qty: 150, unit: 'g' }],
    ['0.2kg chicken', { name: 'chicken', qty: 200, unit: 'g' }],
    ['2 eggs', { name: 'eggs', qty: 2, unit: null }],
    ['a banana', { name: 'banana', qty: 1, unit: null }],
    ['half a cup of oats', { name: 'oats', qty: 0.5, unit: 'cup' }],
    ['half an apple', { name: 'apple', qty: 0.5, unit: null }],
    ['an apple', { name: 'apple', qty: 1, unit: null }],
    ['½ cup rice', { name: 'rice', qty: 0.5, unit: 'cup' }],
    ['banana', { name: 'banana', qty: null, unit: null }],
    ['100g', { name: '100g', qty: null, unit: null }],
    // millilitres and litres (kept as ml)
    ['200 ml milk', { name: 'milk', qty: 200, unit: 'ml' }],
    ['200ml milk', { name: 'milk', qty: 200, unit: 'ml' }],
    ['1.5 l water', { name: 'water', qty: 1500, unit: 'ml' }],
    ['1 litre of orange juice', { name: 'orange juice', qty: 1000, unit: 'ml' }],
    // "l" alone is litres only as a whole word
    ['1 large banana', { name: 'large banana', qty: 1, unit: null }],
    ['2 lemons', { name: 'lemons', qty: 2, unit: null }],
    // a number that's part of the name, not an amount
    ['vitamin b12', { name: 'vitamin b12', qty: null, unit: null }],
    ['omega 3', { name: 'omega 3', qty: null, unit: null }],
    ['chicken 65', { name: 'chicken 65', qty: null, unit: null }],
    ['7up', { name: '7up', qty: null, unit: null }],
    // the amount after the name ("pickle 5g" used to look up "pickle 5g" and log 100 g)
    ['pickle 5g', { name: 'pickle', qty: 5, unit: 'g' }],
    ['Pickle 5 grams', { name: 'pickle', qty: 5, unit: 'g' }],
    ['rice (150 g)', { name: 'rice', qty: 150, unit: 'g' }],
    ['milk - 200 ml', { name: 'milk', qty: 200, unit: 'ml' }],
    ['water 1,5 l', { name: 'water', qty: 1500, unit: 'ml' }],
    ['chicken 0.2kg', { name: 'chicken', qty: 200, unit: 'g' }],
    ['bread 2 slices', { name: 'bread', qty: 2, unit: 'slice' }],
    ['pickle 1 tsp', { name: 'pickle', qty: 1, unit: 'tsp' }],
    ['kitkat 4 fingers', { name: 'kitkat 4 fingers', qty: null, unit: null }],
  ])('%s', (text, expected) => {
    expect(parseTypedPortion(text)).toEqual(expected);
  });
});

describe('findTableFood', () => {
  it('matches what people type, ignoring filler words and plurals', () => {
    expect(findTableFood('banana')?.name).toBe('Banana');
    expect(findTableFood('a medium banana')?.name).toBe('Banana');
    expect(findTableFood('Bananas')?.name).toBe('Banana');
    expect(findTableFood('idli')?.unit).toEqual({ label: 'idli', grams: 38 });
    expect(findTableFood('banana bread')).toBeNull();
    expect(findTableFood('')).toBeNull();
  });

  it('the banana bug: the table’s banana is plausible and 105 kcal', () => {
    const banana = findTableFood('banana')!;
    expect(isPlausible(banana.per100g)).toBe(true);
    const { portion } = foodFromTable(banana, parseTypedPortion('1 banana'));
    expect(portion).toEqual({ qty: 1, unit: 'banana', unitGrams: 118 });
    expect(Math.round(banana.per100g.kcal * 1.18)).toBe(105);
  });

  it('honours a typed weight', () => {
    const rice = findTableFood('rice')!;
    expect(foodFromTable(rice, parseTypedPortion('150g rice')).portion).toEqual({ qty: 150, unit: 'g', unitGrams: 1 });
  });
});

describe('isPlausible', () => {
  it('rejects the per-serving-scaled "banana" that logged 152 g carbs', () => {
    expect(isPlausible({ ...ZERO, kcal: 820, carbs: 152, protein: 47, fat: 4 })).toBe(false);
  });
  it('rejects impossible numbers and accepts real foods', () => {
    expect(isPlausible({ ...ZERO, kcal: 950, fat: 100 })).toBe(false);
    expect(isPlausible({ ...ZERO, kcal: 100, carbs: 10, fiber: 12 })).toBe(false); // more fibre than carbs
    expect(isPlausible({ ...ZERO, kcal: 400, carbs: 10, protein: 5, fat: 2 })).toBe(false); // kcal don't match the macros
    expect(isPlausible({ ...ZERO, kcal: 884, fat: 100 })).toBe(true); // oil
    expect(isPlausible({ ...ZERO, kcal: 2 })).toBe(true); // black coffee
  });
});

describe('entries', () => {
  it('scales per-100 g numbers by amount and how much was eaten', () => {
    expect(entryNutrients(entry()).kcal).toBeCloseTo(180); // 72 g
    expect(entryNutrients(entry({ eaten: 0.5 })).kcal).toBeCloseTo(90);
  });

  it('adds add-ons, halved when half was eaten', () => {
    const e = withExtra(withExtra(entry({ eaten: 0.5 }), 'butter'), 'butter');
    expect(e.extras).toEqual([{ id: 'butter', count: 2 }]);
    expect(entryNutrients(e).kcal).toBeCloseTo(90 + 36);
    expect(withExtra(withExtra(e, 'butter', -1), 'butter', -1).extras ?? []).toEqual([]);
  });

  it('sums a day', () => {
    expect(sumNutrients([entry(), entry({ id: 'e2' })]).kcal).toBeCloseTo(360);
  });

  it('describes portions', () => {
    expect(portionText(entry())).toBe('2 slices · 72 g');
    expect(portionText(entry({ qty: 1, eaten: 0.5 }))).toBe('1 slice · ½ eaten · 18 g');
    expect(portionText(entry({ unit: 'g', unitGrams: 1, qty: 150 }))).toBe('150 g');
    expect(portionText(entry({ unit: 'bottle', unitGrams: 250, qty: 1, liquid: true }))).toBe('1 bottle · 250 ml');
  });
});

describe('add-ons from a note', () => {
  it.each([
    ['with 2 tsp sugar', [{ id: 'sugar', count: 2 }]],
    ['tea with milk and sugar', [{ id: 'sugar', count: 1 }, { id: 'milk', count: 1 }]],
    ['a pinch of salt', [{ id: 'salt', count: 1 }]],
    ['with 1 tbsp honey', [{ id: 'honey', count: 3 }]],
    ['unsweetened almond milk', []],
    ['sugar-free', []],
    ['no sugar, less salt', []],
  ])('%s', (note, expected) => {
    expect(extrasFromNote(note)).toEqual(expected);
  });

  it('writes amounts naturally', () => {
    const salt = EXTRAS.find(x => x.id === 'salt')!;
    expect(extraAmountText(salt, 1)).toBe('a pinch of salt');
    expect(extraAmountText(salt, 2)).toBe('2 pinches of salt');
    expect(extrasText({ extras: [{ id: 'sugar', count: 2 }, { id: 'salt', count: 1 }] })).toBe('2 tsp sugar, a pinch of salt');
  });
});

describe('typicalUnit', () => {
  it('prefers USDA’s portion, then a typical weight marked as an estimate', () => {
    expect(typicalUnit('banana', null)).toEqual({ label: 'banana', grams: 118 });
    expect(typicalUnit('boiled eggs', 'piece')).toEqual({ label: 'egg', grams: 50 }); // USDA's hard-boiled egg
    expect(typicalUnit('croissant', null)).toEqual({ label: 'croissant', grams: 60, estimated: true });
    expect(typicalUnit('mystery stew', null)).toBeNull();
  });
});

describe('food history storage', () => {
  it('keeps 90 days and drops empty days', () => {
    const today = localDayKey();
    saveFoodDays({ [today]: [entry()], [localDayKeyDaysAgo(89)]: [entry()], [localDayKeyDaysAgo(90)]: [entry()], [localDayKeyDaysAgo(3)]: [] });
    expect(Object.keys(loadFoodDays()).sort()).toEqual([localDayKeyDaysAgo(89), today].sort());
  });

  it('moves an older "today only" log in once', () => {
    const today = localDayKey();
    localStorage.setItem('kx_food_log', JSON.stringify({ date: today, value: [entry()] }));
    expect(loadFoodDays()[today]).toHaveLength(1);
    expect(localStorage.getItem('kx_food_log')).toBeNull();
  });
});

// --- step 5: several foods from one photo, liquids, and saved foods from wrong lookups ------------------------------

const saved = (over: Partial<SavedFood>): SavedFood => ({
  key: 'name:x', name: 'x', per100g: { ...ZERO, kcal: 100, carbs: 20, protein: 2, fat: 1, fiber: 1 }, units: [], gramsKnown: true,
  estimated: false, source: 'search', lastQty: 100, lastUnit: 'g', uses: 1, lastUsed: 0, ...over,
});
const APPLE = { kcal: 52, carbs: 13.81, protein: 0.26, fat: 0.17, fiber: 2.4, satFat: 0.03, sugars: 10.39, sodiumMg: 1, potassiumMg: 107, ironMg: 0.12, calciumMg: 6 };
const item = (over: Partial<ScanItem>): ScanItem => ({
  name: 'apple', amount: 150, unit: 'g', count: 2, piece: 'slice', per100: APPLE,
  matchedFood: 'Apples, raw, with skin', source: 'USDA FoodData Central', confidence: 'high', amountConfidence: 'medium', amountSource: 'photo',
  alternatives: [], needsReview: false, ...over,
});

describe('a photo\'s foods become entries', () => {
  it('one food from `items` is exactly the food and portion a one-food photo gives today', () => {
    const one = item({});
    const legacy: ScanPayload = {
      foodName: 'apple', estimatedPortionGrams: 150, count: 2, unit: 'slice', per100g: APPLE,
      calories: 78, macros: { carbs: 21, protein: 0, fat: 0, fiber: 4 }, micros: { sodium: '2mg', potassium: '161mg', iron: '0.2mg', calcium: '9mg' },
    };
    expect(foodFromScanItem(one)).toEqual(foodFromScan(legacy, 'photo', nameKey('apple')));
  });

  it('a food measured in ml is a drink kept per 100 ml', () => {
    const milk = foodFromScanItem(item({ name: 'milk', amount: 200, unit: 'ml', count: null, piece: null, density: 1.031,
      per100: { kcal: 62.89, carbs: 4.95, protein: 3.25, fat: 3.35, fiber: 0 } }))!;
    expect(milk.food).toMatchObject({ liquid: true, density: 1.031, estimated: true, source: 'photo' });
    const e = entryFromFood(milk.food, milk.portion);
    expect(portionText(e)).toBe('1 portion · 200 ml');
    expect(entryNutrients(e).kcal).toBeCloseTo(125.78, 2);
  });

  it('nothing to log without an amount or numbers', () => {
    expect(foodFromScanItem(item({ amount: null }))).toBeNull();
    expect(foodFromScanItem(item({ per100: null }))).toBeNull();
  });

  it('each food keeps its own amount, and changing one leaves the others', () => {
    const muesli = foodFromScanItem(item({ name: 'muesli', amount: 50, count: null, piece: null }))!;
    const banana = foodFromScanItem(item({ name: 'banana', amount: 80, count: 6, piece: 'slice' }))!;
    const [a, b] = [entryFromFood(muesli.food, muesli.portion), entryFromFood(banana.food, banana.portion)];
    const edited = { ...a, unit: 'g', unitGrams: 1, qty: 70 };
    expect(portionText(edited)).toBe('70 g');
    expect(portionText(b)).toBe('6 slices · 80 g');
  });
});

describe('meals count once', () => {
  it('the foods of one meal photo are one food check', () => {
    const meal = { id: 'm1', name: 'Muesli with milk and banana' };
    expect(mealCount([{ id: 'a', meal }, { id: 'b', meal }, { id: 'c', meal }, { id: 'd' }])).toBe(2);
    expect(mealCount([{ id: 'a' }, { id: 'b' }])).toBe(2);
  });
});

describe('a meal photo\'s note', () => {
  it('adds only the add-ons that aren\'t foods of the photo already', () => {
    expect(extrasFromNoteExcept('muesli with milk and 2 tsp sugar', ['muesli', 'milk', 'banana'])).toEqual([{ id: 'sugar', count: 2 }]);
    expect(extrasFromNoteExcept('tea with milk and sugar', ['tea'])).toEqual(extrasFromNote('tea with milk and sugar'));
  });
});

describe('liquids by density, typed', () => {
  it('a table drink is kept per 100 ml: "200 ml milk" is 200 ml, 126 kcal (not 122)', () => {
    const milk = findTableFood('milk')!;
    const { food, portion } = foodFromTable(milk, parseTypedPortion('200 ml milk'));
    expect(food).toMatchObject({ liquid: true, density: 1.031 });
    expect(portion).toEqual({ qty: 200, unit: 'g', unitGrams: 1 });
    const e = entryFromFood(food, portion);
    expect(portionText(e)).toBe('200 ml');
    expect(entryNutrients(e).kcal).toBeCloseTo((200 * 1.031 * milk.per100g.kcal) / 100, 6);
  });

  it('a glass of milk is the same 244 g, now shown in ml', () => {
    const milk = findTableFood('milk')!;
    const { food, portion } = foodFromTable(milk, parseTypedPortion('milk'));
    const e = entryFromFood(food, portion);
    expect(portionText(e)).toBe('1 glass · 237 ml');
    expect(entryNutrients(e).kcal).toBeCloseTo((244 * milk.per100g.kcal) / 100, 1);
  });

  it('grams of a drink are turned into its ml', () => {
    expect(foodFromTable(findTableFood('milk')!, parseTypedPortion('250 g milk')).portion).toEqual({ qty: 242.5, unit: 'g', unitGrams: 1 });
  });

  it('ml of a food kept by weight are turned into grams: "15 ml olive oil" is 13.7 g', () => {
    const { food, portion } = foodFromTable(findTableFood('olive oil')!, parseTypedPortion('15 ml olive oil'));
    expect(food.liquid).toBeUndefined();
    expect(portion).toEqual({ qty: 13.7, unit: 'g', unitGrams: 1 });
  });

  it('a food from the server with its density: "300 ml mango lassi" is 309 g', () => {
    const lassi: ScanPayload = { foodName: 'mango lassi', per100g: { kcal: 87.38, carbs: 14.56, protein: 2.72, fat: 2.14, fiber: 0 }, density: 1.03,
      calories: 87, macros: { carbs: 15, protein: 3, fat: 2, fiber: 0 }, micros: { sodium: '0mg', potassium: '0mg', iron: '0.0mg', calcium: '0mg' } };
    const { food, portion } = foodFromScan(lassi, 'search', nameKey('mango lassi'), parseTypedPortion('300 ml mango lassi'));
    expect(portion).toEqual({ qty: 309, unit: 'g', unitGrams: 1 });
    expect(food.density).toBe(1.03);
  });

  it('typed amounts on a saved food: ml, grams and units', () => {
    const drink = saved({ key: 'usda:1', name: 'Milk, whole', liquid: true, density: 1.031 });
    expect(savedFoodPortion(drink, parseTypedPortion('200 ml milk'))).toEqual({ qty: 200, unit: 'g', unitGrams: 1 });
    expect(savedFoodPortion(drink, parseTypedPortion('250 g milk'))).toEqual({ qty: 242.5, unit: 'g', unitGrams: 1 });
    const oil = saved({ key: 'usda:2', name: 'Olive oil', density: 0.913, units: [{ label: 'tbsp', grams: 13.5 }] });
    expect(savedFoodPortion(oil, parseTypedPortion('15 ml olive oil'))).toEqual({ qty: 13.7, unit: 'g', unitGrams: 1 });
    expect(savedFoodPortion(oil, parseTypedPortion('2 tbsp olive oil'))).toEqual({ qty: 2, unit: 'tbsp', unitGrams: 13.5 });
    expect(savedFoodPortion(oil, parseTypedPortion('olive oil'))).toEqual({ qty: 100, unit: 'g', unitGrams: 1 });
  });

  it('a saved food with the amount typed after its name: "pickle 5g" is 5 g of the saved pickle', () => {
    const pickle = saved({ key: 'name:pickle', name: 'pickle' });
    const typed = parseTypedPortion('pickle 5g');
    expect(findFoodByName({ [pickle.key]: pickle }, typed.name)).toBe(pickle);
    expect(savedFoodPortion(pickle, typed)).toEqual({ qty: 5, unit: 'g', unitGrams: 1 });
  });

  it('barcode drinks are as before: their label is per 100 ml, and grams typed count as ml', () => {
    const juice = saved({ key: 'bc:5000', name: 'orange juice', source: 'barcode', liquid: true });
    expect(savedFoodPortion(juice, parseTypedPortion('250 g orange juice'))).toEqual({ qty: 250, unit: 'g', unitGrams: 1 });
    expect(savedFoodPortion(juice, parseTypedPortion('330 ml orange juice'))).toEqual({ qty: 330, unit: 'g', unitGrams: 1 });
  });
});

describe('saved foods from wrong lookups', () => {
  const candy = saved({ key: 'name:watermelon slice', name: 'watermelon slice', per100g: { ...ZERO, kcal: 207, carbs: 51.8 } });
  const soybeanCurd = saved({ key: 'name:curd', name: 'curd', per100g: { ...ZERO, kcal: 151, protein: 12.5, carbs: 6.9, fat: 8.1 } });
  const banana = saved({ key: 'name:banana', name: 'banana', per100g: { ...ZERO, kcal: 89, protein: 1.09, carbs: 22.84, fat: 0.33, fiber: 2.6 } });
  const photoMilk = saved({ key: 'name:milk', name: 'milk', source: 'photo', liquid: true, per100g: { ...ZERO, kcal: 62.89, protein: 3.25, carbs: 4.95, fat: 3.35 } });
  const muesli = saved({ key: 'name:muesli', name: 'muesli', per100g: { ...ZERO, kcal: 392, protein: 9.6, carbs: 62.9, fat: 7.9 } });
  const oddBarcode = saved({ key: 'bc:123', name: 'milk', source: 'barcode', per100g: { ...ZERO, kcal: 250, protein: 20, carbs: 25, fat: 7 } });

  it('are far from the table\'s food of the same name; right ones, barcodes and foods not in the table aren\'t', () => {
    expect(farFromTable(candy)).toBe(true);
    expect(farFromTable(soybeanCurd)).toBe(true);
    expect([banana, photoMilk, muesli, oddBarcode].map(farFromTable)).toEqual([false, false, false, false]);
  });

  it('are no longer offered — and the log that has them is left as it was', () => {
    const foods = { candy, soybeanCurd, banana, photoMilk, muesli, oddBarcode };
    localStorage.setItem('kx_foods', JSON.stringify(Object.fromEntries(Object.values(foods).map(f => [f.key, f]))));
    expect(Object.keys(loadFoods()).sort()).toEqual(['bc:123', 'name:banana', 'name:milk', 'name:muesli']);
    const day = localDayKey();
    const logged = entry({ id: 'w', foodKey: candy.key, name: 'watermelon slice', unit: 'g', unitGrams: 1, qty: 250, per100g: candy.per100g });
    saveFoodDays({ [day]: [logged] });
    expect(loadFoodDays()[day]).toEqual([logged]);
  });
});

// --- step 6: typed meals, split on the phone ------------------------------------------------------------------------

describe('a typed meal is split into its foods', () => {
  const names = (text: string, foods?: Record<string, SavedFood>) => splitTypedMeal(text, foods)?.map(p => p.name) ?? null;

  it.each([
    ['muesli with milk and banana', ['muesli', 'milk', 'banana']],
    ['2 roti and dal', ['roti', 'dal']],
    ['rice & dal', ['rice', 'dal']],
    ['idli + sambar', ['idli', 'sambar']],
    ['rice, dal, and a glass of milk', ['rice', 'dal', 'milk']],
    ['Muesli With Milk And Banana', ['Muesli', 'Milk', 'Banana']],
    ['toast with butter', ['toast', 'butter']],
    // the table's own "tofu and vegetables" stays one food
    ['tofu and vegetables with rice', ['tofu and vegetables', 'rice']],
    // the tea keeps its milk (looked up as "tea with milk", as typing it alone is); milk with its own ml is a food
    ['tea with milk and a banana', ['tea with milk', 'banana']],
    ['tea with 50 ml milk', ['tea', 'milk']],
    // one food the phone doesn't know goes to the server
    ['rice, dal and chutney', ['rice', 'dal', 'chutney']],
  ])('%s', (text, expected) => {
    expect(names(text)).toEqual(expected);
  });

  it('keeps each food\'s own amount', () => {
    expect(splitTypedMeal('150 g rice, 2 roti and 200 ml milk')).toEqual([
      { name: 'rice', qty: 150, unit: 'g' }, { name: 'roti', qty: 2, unit: null }, { name: 'milk', qty: 200, unit: 'ml' },
    ]);
  });

  it.each([
    // one food
    'banana', '2 slices of bread', 'tofu and vegetables', 'congee with chicken',
    // dish names: fewer than two foods in them are known
    'mac and cheese', 'fish and chips', 'sweet and sour chicken', 'bread and butter pudding', 'peanut butter and jelly sandwich',
    // a drink and its add-ons
    'tea with milk', 'coffee with milk and sugar', 'tea with 2 tsp sugar', 'masala chai with sugar',
    // salt isn't a food to look up by the 100 g
    'eggs and toast with salt', 'eggs, toast and a pinch of salt',
    // two foods the phone doesn't know: more lookups than the one it took before
    'rice, dal, chutney and papad',
    // "butter chicken" isn't known until it's been logged once
    'butter chicken and naan',
    '1,5 l water', 'rice and', 'with milk',
  ])('%s stays one food, looked up as before', text => {
    expect(splitTypedMeal(text)).toBeNull();
  });

  it('foods logged before count as known, and a phrase saved as one food stays one', () => {
    const chicken = saved({ key: 'name:butter chicken', name: 'butter chicken' });
    expect(names('butter chicken and naan', { [chicken.key]: chicken })).toEqual(['butter chicken', 'naan']);
    const bowl = saved({ key: 'name:muesli with milk and banana', name: 'muesli with milk and banana' });
    expect(splitTypedMeal('muesli with milk and banana', { [bowl.key]: bowl })).toBeNull();
  });

  it('at most 8 foods', () => {
    const fruit = ['banana', 'apple', 'orange', 'mango', 'grapes', 'pear', 'kiwi', 'papaya', 'guava'];
    expect(names(fruit.slice(0, 8).join(', '))).toEqual(fruit.slice(0, 8));
    expect(splitTypedMeal(fruit.join(', '))).toBeNull();
  });

  // never more server lookups than typing the phrase took before (one)
  it.each([
    ['muesli with milk and banana', 1], ['rice, dal and chutney', 1], ['tea with milk and a banana', 1], ['2 roti and dal', 0], ['toast with butter', 0],
  ] as const)('%s needs %i server lookup(s)', (text, lookups) => {
    expect(splitTypedMeal(text)!.filter(p => !findTableFood(p.name))).toHaveLength(lookups);
  });

  it('each food is then what typing it alone gives: "muesli with milk and banana", "2 roti and dal"', () => {
    const [muesli, milk, banana] = splitTypedMeal('muesli with milk and banana')!;
    expect(findTableFood(muesli.name)).toBeNull(); // the one looked up on the server
    const glass = foodFromTable(findTableFood(milk.name)!, milk);
    expect(portionText(entryFromFood(glass.food, glass.portion))).toBe('1 glass · 237 ml');
    expect(foodFromTable(findTableFood(banana.name)!, banana).portion).toEqual({ qty: 1, unit: 'banana', unitGrams: 118 });
    const [roti, dal] = splitTypedMeal('2 roti and dal')!.map(p => foodFromTable(findTableFood(p.name)!, p).portion);
    expect(roti).toEqual({ qty: 2, unit: 'roti', unitGrams: 68 });
    expect(dal).toEqual({ qty: 1, unit: 'cup', unitGrams: 240 });
  });
});
