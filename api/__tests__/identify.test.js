// api/_lib/identify.js (the contract any vision model answers to) and identifyClaude.js (asking Claude). Claude is a
// stand-in client here that answers with what each test gives it: these tests check how answers are read, checked and
// corrected — how well a real model sees a photo is checked on the Vercel preview with real photos.
import { describe, expect, it, vi } from 'vitest';
import {
  IdentifyError, MAX_ITEMS, MEAL_SCHEMA, amountsFromNote, applyNoteAmounts, finishMeal, mealPrompt, roundAmount, validateMeal,
} from '../_lib/identify.js';
import { identifyMealWithClaude } from '../_lib/identifyClaude.js';

const item = (name, extra = {}) => ({
  name, form: 'prepared', amount: 100, unit: 'g', count: null, piece: null, confidence: 'high', amountConfidence: 'medium',
  alternatives: [], typicalPer100g: { kcal: 100, protein: 3, carbs: 15, fat: 3, fiber: 1 }, packaged: false, ...extra,
});
const MUESLI_BOWL = {
  kind: 'meal', mealName: 'Muesli with milk and banana',
  items: [
    item('muesli', { form: 'dry', amount: 48, typicalPer100g: { kcal: 370, protein: 10, carbs: 62, fat: 7, fiber: 8 } }),
    item('milk', { form: 'drink', amount: 205, unit: 'ml', typicalPer100g: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 } }),
    item('banana', { form: 'raw', amount: 83, count: 6, piece: 'slice', typicalPer100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 } }),
  ],
};

// A stand-in for the Anthropic client: answers every call with `reply`, and remembers what it was asked
function fakeClaude(reply) {
  const create = vi.fn(async () => (typeof reply === 'function' ? reply() : reply));
  return { client: { messages: { create } }, create };
}
const answer = (content, stopReason = 'end_turn') => ({
  model: 'claude-sonnet-5', stop_reason: stopReason, usage: { input_tokens: 1400, output_tokens: 180 },
  content: typeof content === 'string' ? [{ type: 'text', text: content }] : content,
});
const photo = { image: 'aGVsbG8=', mimeType: 'image/jpeg' };

describe('several foods from one photo', () => {
  it('keeps each food separately, with its own amount, piece count and hint', () => {
    const meal = validateMeal(MUESLI_BOWL);
    expect(meal.kind).toBe('meal');
    expect(meal.mealName).toBe('Muesli with milk and banana');
    expect(meal.items.map(i => [i.name, i.amount, i.unit, i.count, i.piece])).toEqual([
      ['muesli', 50, 'g', null, null],
      ['milk', 210, 'ml', null, null],
      ['banana', 80, 'g', 6, 'slice'],
    ]);
    expect(meal.items.every(i => i.amountSource === 'photo')).toBe(true);
    expect(meal.items[0].typicalPer100g).toEqual({ kcal: 370, protein: 10, carbs: 62, fat: 7, fiber: 8 });
  });

  it('names the meal from its foods when the answer doesn\'t', () => {
    expect(validateMeal({ ...MUESLI_BOWL, mealName: '' }).mealName).toBe('muesli, milk, banana');
  });

  it('keeps at most 8 foods', () => {
    const meal = validateMeal({ kind: 'meal', mealName: 'Thali', items: Array.from({ length: 12 }, (_, i) => item(`food ${i}`)) });
    expect(meal.items).toHaveLength(MAX_ITEMS);
  });
});

describe('amounts: rounded to what a photo can show', () => {
  it.each([
    [7, 'medium', 5], [12, 'high', 10], [23, 'medium', 25], [48, 'medium', 50], [152, 'medium', 150], [205, 'high', 210],
    [265, 'medium', 275], [1234, 'medium', 1225],
    // a guess is rounded more coarsely, and never down to nothing
    [7, 'low', 10], [152, 'low', 150], [180, 'low', 175], [265, 'low', 250], [1234, 'low', 1250],
  ])('%s g (%s) → %s g', (amount, confidence, rounded) => {
    expect(roundAmount(amount, confidence)).toBe(rounded);
  });

  it('clamps an amount no single food has', () => {
    expect(validateMeal({ kind: 'meal', mealName: 'x', items: [item('rice', { amount: 5000 })] }).items[0].amount).toBe(2000);
  });
});

describe('uncertain amounts are said to be uncertain', () => {
  it('keeps a low amountConfidence, with the coarser rounding', () => {
    const [curry] = validateMeal({ kind: 'meal', mealName: 'x', items: [item('chicken curry', { amount: 180, amountConfidence: 'low' })] }).items;
    expect(curry).toMatchObject({ amount: 175, amountConfidence: 'low' });
  });

  it('treats a missing or unknown confidence as low', () => {
    const [a, b] = validateMeal({ kind: 'meal', mealName: 'x', items: [item('dal', { amountConfidence: undefined }), item('rice', { amountConfidence: 'very' })] }).items;
    expect(a.amountConfidence).toBe('low');
    expect(b.amountConfidence).toBe('low');
  });

  it('gives no amount at all rather than inventing one', () => {
    for (const amount of [null, -20, 0, Number.NaN, 'lots']) {
      const [food] = validateMeal({ kind: 'meal', mealName: 'x', items: [item('dal', { amount, amountConfidence: 'high' })] }).items;
      expect(food).toMatchObject({ amount: null, amountConfidence: 'low' });
    }
  });
});

describe('the person\'s note comes first', () => {
  it('reads amounts in either order, in g, kg, ml and l', () => {
    expect(amountsFromNote('50 g muesli, milk 200ml and 1 banana')).toEqual([
      { name: 'muesli', amount: 50, unit: 'g' }, { name: 'milk', amount: 200, unit: 'ml' }, { name: 'banana', count: 1 },
    ]);
    expect(amountsFromNote('0.5 kg rice; 1.5 l water')).toEqual([{ name: 'rice', amount: 500, unit: 'g' }, { name: 'water', amount: 1500, unit: 'ml' }]);
    expect(amountsFromNote('unsweetened almond milk')).toEqual([]);
  });

  it('uses the exact amounts given, instead of the photo\'s', () => {
    const meal = finishMeal(MUESLI_BOWL, '55 g muesli, 180 ml milk');
    expect(meal.items[0]).toMatchObject({ name: 'muesli', amount: 55, unit: 'g', amountConfidence: 'high', amountSource: 'note' });
    expect(meal.items[1]).toMatchObject({ name: 'milk', amount: 180, unit: 'ml', amountConfidence: 'high', amountSource: 'note' });
    // not mentioned: the photo's estimate stays
    expect(meal.items[2]).toMatchObject({ name: 'banana', amount: 80, amountSource: 'photo' });
  });

  it('scales a counted food by the photo\'s weight per piece', () => {
    const [, , banana] = finishMeal(MUESLI_BOWL, '9 slices banana').items;
    // 80 g for 6 slices in the photo → 9 slices
    expect(banana).toMatchObject({ count: 9, amount: 120, amountConfidence: 'medium', amountSource: 'note' });
  });

  it('gives each amount to one food only, the same-named one first', () => {
    const meal = applyNoteAmounts(validateMeal({ kind: 'meal', mealName: 'x', items: [item('milk tea', { unit: 'ml' }), item('milk', { unit: 'ml' })] }), '200 ml milk');
    expect(meal.items.map(i => [i.name, i.amount, i.amountSource])).toEqual([['milk tea', 100, 'photo'], ['milk', 200, 'note']]);
  });

  it('matches plain and plural names ("whole milk", "rotis")', () => {
    const meal = finishMeal({ kind: 'meal', mealName: 'x', items: [item('whole milk', { unit: 'ml' }), item('roti', { amount: 80, count: 2, piece: 'roti' })] }, '250 ml milk, 3 rotis');
    expect(meal.items.map(i => [i.amount, i.count])).toEqual([[250, null], [120, 3]]);
  });
});

describe('photos that aren\'t a meal', () => {
  it('a blurred or dark photo is unclear, with no foods', () => {
    expect(validateMeal({ kind: 'unclear', mealName: '', items: [] })).toEqual({ kind: 'unclear', mealName: '', items: [] });
  });

  it('a photo without food is not_food, whatever else the answer lists', () => {
    expect(validateMeal({ kind: 'not_food', mealName: 'A cat', items: [item('cat')] })).toEqual({ kind: 'not_food', mealName: '', items: [] });
  });

  it('"a meal" with no usable food in it is unclear', () => {
    expect(validateMeal({ kind: 'meal', mealName: 'Dinner', items: [item(''), { name: 42 }] }).kind).toBe('unclear');
  });
});

describe('answers that can\'t be trusted as they are', () => {
  it('rejects an answer that isn\'t a meal description', () => {
    for (const raw of [null, 'banana', {}, { kind: 'snack', items: [] }]) {
      expect(() => validateMeal(raw)).toThrow(IdentifyError);
    }
  });

  it('makes each field safe: hints, alternatives, pieces, counts, forms', () => {
    const [food] = validateMeal({ kind: 'meal', mealName: 'x', items: [item('Paneer "tikka"', {
      typicalPer100g: { kcal: 5000, protein: 20, carbs: 5, fat: 20, fiber: 0 },
      alternatives: ['paneer "tikka"', 'tofu', 'halloumi', 'feta'],
      piece: '<b>cube</b>', count: 99, form: 'grilled',
    })] }).items;
    expect(food).toMatchObject({ name: 'paneer tikka', typicalPer100g: null, alternatives: ['tofu', 'halloumi'], piece: null, count: null, form: 'prepared' });
  });
});

describe('the instructions', () => {
  it('ask for separate foods, one item per cooked dish, ml for drinks, rounded amounts and honest confidence', () => {
    const prompt = mealPrompt();
    expect(prompt).toMatch(/muesli, milk and banana/);
    expect(prompt).toMatch(/biryani, upma/);
    expect(prompt).toMatch(/ml for drinks/);
    expect(prompt).toMatch(/round it/);
    expect(prompt).toMatch(/Never give a precise-looking amount/);
    expect(prompt).toMatch(/not_food/);
    expect(prompt).toMatch(/unclear/);
    expect(prompt).not.toMatch(/The person says/);
  });

  it('carry the person\'s note, cleaned', () => {
    expect(mealPrompt('50 g "muesli"\n and milk')).toContain('The person says: "50 g muesli and milk"');
  });

  it('the schema is one structured outputs accepts: closed objects, every property required, no number limits', () => {
    const check = node => {
      if (node?.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect([...node.required].sort()).toEqual(Object.keys(node.properties).sort());
      }
      expect(node).not.toHaveProperty('minimum');
      expect(node).not.toHaveProperty('maxItems');
      for (const child of [...Object.values(node?.properties ?? {}), node?.items, ...(node?.anyOf ?? [])].filter(Boolean)) check(child);
    };
    check(MEAL_SCHEMA);
  });
});

describe('identifyMealWithClaude', () => {
  it('asks once, briefly: thinking off, effort low, the meal schema', async () => {
    const { client, create } = fakeClaude(answer(JSON.stringify(MUESLI_BOWL)));
    const { meal, usage } = await identifyMealWithClaude({ ...photo, note: '55 g muesli' }, { client });
    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 1200, thinking: { type: 'disabled' } });
    expect(request.output_config).toEqual({ format: { type: 'json_schema', schema: MEAL_SCHEMA }, effort: 'low' });
    expect(request.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } });
    expect(request.messages[0].content[1].text).toContain('55 g muesli');
    expect(meal.items[0]).toMatchObject({ name: 'muesli', amount: 55, amountSource: 'note' });
    expect(usage).toMatchObject({ model: 'claude-sonnet-5', input: 1400, output: 180, stop: 'end_turn' });
  });

  it('leaves out effort for Haiku 4.5, which doesn\'t take it', async () => {
    const { client, create } = fakeClaude(answer(JSON.stringify(MUESLI_BOWL)));
    await identifyMealWithClaude(photo, { client, model: 'claude-haiku-4-5' });
    expect(create.mock.calls[0][0].output_config).toEqual({ format: { type: 'json_schema', schema: MEAL_SCHEMA } });
  });

  it('reads the answer whatever comes before it, and however it is split', async () => {
    const text = JSON.stringify(MUESLI_BOWL);
    const { client } = fakeClaude(answer([
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: text.slice(0, 40) }, { type: 'text', text: text.slice(40) },
    ]));
    expect((await identifyMealWithClaude(photo, { client })).meal.items).toHaveLength(3);
  });

  it.each([
    ['truncated', answer('{"kind": "meal", "mealName": "Muesli with', 'max_tokens')],
    ['refused', answer([], 'refusal')],
    ['invalid', answer('The photo shows muesli with milk.')],
    ['invalid', answer('{"kind": "breakfast", "items": []}')],
  ])('an answer it can\'t use is an IdentifyError (%s), with the tokens it cost', async (reason, reply) => {
    const { client } = fakeClaude(reply);
    const error = await identifyMealWithClaude(photo, { client }).catch(e => e);
    expect(error).toBeInstanceOf(IdentifyError);
    expect(error.reason).toBe(reason);
    expect(error.usage).toMatchObject({ input: 1400, output: 180 });
  });

  it('passes a blurred photo\'s "unclear" through, not as an error', async () => {
    const { client } = fakeClaude(answer('{"kind": "unclear", "mealName": "", "items": []}'));
    expect((await identifyMealWithClaude(photo, { client })).meal).toEqual({ kind: 'unclear', mealName: '', items: [] });
  });
});
