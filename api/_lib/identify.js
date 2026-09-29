// What a meal photo is: every food seen separately and how much of each, as one short structured answer. This file is
// the contract, the same for any vision model — the answer's JSON schema, the instructions, and the checks the answer
// goes through (clamped, rounded, the person's own amounts first). No model calls here: identifyClaude.js asks Claude;
// another model would sit next to it and use the same contract.
//
// An answer only names foods and amounts. Its typical numbers per 100 g are a hint for checking the database match
// later (nutrition.js agrees()); the numbers logged come from the food table or USDA.
import { normalizeFoodName, singularWord } from './foodNormalize.js';

export const MAX_ITEMS = 8;
const MAX_AMOUNT = 2000; // g or ml, per item
const MAX_COUNT = 50;
const LEVELS = ['high', 'medium', 'low'];
const FORMS = ['raw', 'cooked', 'dry', 'drink', 'prepared'];

const number = { type: 'number' };
export const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'mealName', 'items'],
  properties: {
    kind: { type: 'string', enum: ['meal', 'not_food', 'unclear'] },
    mealName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'form', 'amount', 'unit', 'count', 'piece', 'confidence', 'amountConfidence', 'alternatives', 'typicalPer100g', 'packaged'],
        properties: {
          name: { type: 'string' },
          form: { type: 'string', enum: FORMS },
          amount: number,
          unit: { type: 'string', enum: ['g', 'ml'] },
          count: { anyOf: [number, { type: 'null' }] },
          piece: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          confidence: { type: 'string', enum: LEVELS },
          amountConfidence: { type: 'string', enum: LEVELS },
          alternatives: { type: 'array', items: { type: 'string' } },
          typicalPer100g: {
            type: 'object',
            additionalProperties: false,
            required: ['kcal', 'protein', 'carbs', 'fat', 'fiber'],
            properties: { kcal: number, protein: number, carbs: number, fat: number, fiber: number },
          },
          packaged: { type: 'boolean' },
        },
      },
    },
  },
};

/** The instructions, with the person's note when there is one (plain text, at most 200 characters). */
export function mealPrompt(rawNote) {
  const note = clean(rawNote, 200);
  return [
    'List every food and drink you can see separately in this photo, and how much of each there is.',
    '- One item per separately visible food: a bowl of muesli with milk and banana slices is muesli, milk and banana. A dish ' +
      'cooked as one (biryani, upma, curry, dal, soup, a sandwich, pizza) is one item — don\'t split it into its ingredients.',
    '- name: the short, common, singular name of the food, with no amounts or piece words ("watermelon", not "watermelon ' +
      'slice"). mealName: a short name for the whole meal.',
    '- amount: grams for food; ml for drinks and liquids poured into a glass, cup or bowl (milk, juice, tea, soup). Judge ' +
      'it from the plate, bowl, cup, glass or spoon and round it (5 g under 30 g, 10 g up to 250 g, 25 g above).',
    '- count and piece: how many pieces and what one is called (6 and "slice", 2 and "roti"), or null for both.',
    '- amountConfidence: high when the amount is clear (a whole fruit, a standard glass, an amount the person gives), medium ' +
      'for a usual serving you can judge, low when you can\'t tell (food hidden in a bowl, nothing to show the scale). ' +
      'Never give a precise-looking amount you can\'t see: say low.',
    '- confidence: how sure you are what the food is. When it isn\'t high, up to 2 other foods it could be in alternatives; ' +
      'otherwise alternatives is [].',
    '- form: raw, cooked, dry (dry cereal, nuts, flour), drink, or prepared (a made dish or product).',
    '- typicalPer100g: rough typical kcal, protein, carbs, fat and fibre in 100 g of this food as eaten.',
    '- packaged: true for a packed product with a label.',
    '- kind: meal when there is food or drink; not_food when there is none; unclear when the photo is too dark, blurred ' +
      'or far away to tell (then items is []).',
    ...(note ? [`The person says: "${note}". Amounts they give are what they had: use them. Use their words for what the ` +
      'food is, but trust the photo for what you can see.'] : []),
  ].join('\n');
}

/** An answer that couldn't be used: 'refused', 'truncated' (cut off) or 'invalid'. */
export class IdentifyError extends Error {
  constructor(reason, message, usage) {
    super(message);
    this.reason = reason;
    this.usage = usage;
  }
}

/**
 * Amounts rounded to what a photo can show: 5 g steps under 30 g, 10 g up to 250 g, 25 g above; coarser when the
 * amount is a guess (10 / 25 / 50). Never below one step.
 */
export function roundAmount(amount, amountConfidence) {
  const low = amountConfidence === 'low';
  const step = amount < 30 ? (low ? 10 : 5) : amount < 250 ? (low ? 25 : 10) : (low ? 50 : 25);
  return Math.max(step, Math.round(amount / step) * step);
}

const clean = (text, max) => (typeof text === 'string' ? text.replace(/[\u0000-\u001f"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const level = value => (LEVELS.includes(value) ? value : 'low');
const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

function validateHint(hint) {
  if (!hint || typeof hint !== 'object') return null;
  const values = ['kcal', 'protein', 'carbs', 'fat', 'fiber'].map(key => Number(hint[key]));
  // a hint that can't be right is no hint
  if (!between(values[0], 0, 900) || values.slice(1).some(v => !between(v, 0, 100))) return null;
  const [kcal, protein, carbs, fat, fiber] = values;
  return { kcal, protein, carbs, fat, fiber };
}

function validateItem(raw) {
  const name = clean(raw?.name, 40).toLowerCase();
  if (!name) return null;
  const amountConfidence = level(raw.amountConfidence);
  const amount = Number(raw.amount);
  const count = Number(raw.count);
  const piece = clean(raw.piece, 20).toLowerCase();
  return {
    name,
    form: FORMS.includes(raw.form) ? raw.form : 'prepared',
    // no usable amount: nothing to guess from, so the person is asked (amount null)
    amount: between(amount, 0.5, Infinity) ? roundAmount(Math.min(amount, MAX_AMOUNT), amountConfidence) : null,
    unit: raw.unit === 'ml' ? 'ml' : 'g',
    count: between(count, 0.5, MAX_COUNT) && raw.count !== null ? Math.round(count * 2) / 2 : null,
    piece: /^[a-z ]{2,20}$/.test(piece) ? piece : null,
    confidence: level(raw.confidence),
    amountConfidence: between(amount, 0.5, Infinity) ? amountConfidence : 'low',
    amountSource: 'photo',
    alternatives: (Array.isArray(raw.alternatives) ? raw.alternatives : [])
      .map(a => clean(a, 40).toLowerCase()).filter(a => a && a !== name).slice(0, 2),
    typicalPer100g: validateHint(raw.typicalPer100g),
    packaged: raw.packaged === true,
  };
}

/** A model's answer, checked: at most MAX_ITEMS foods, amounts clamped and rounded, unknown values made safe. */
export function validateMeal(raw) {
  if (!raw || typeof raw !== 'object' || !['meal', 'not_food', 'unclear'].includes(raw.kind)) {
    throw new IdentifyError('invalid', 'The answer isn\'t a meal description');
  }
  if (raw.kind !== 'meal') return { kind: raw.kind, mealName: '', items: [] };
  const items = (Array.isArray(raw.items) ? raw.items : []).map(validateItem).filter(Boolean).slice(0, MAX_ITEMS);
  // "a meal" with nothing in it is a photo that couldn't be read
  if (!items.length) return { kind: 'unclear', mealName: '', items: [] };
  return { kind: 'meal', mealName: clean(raw.mealName, 60) || items.map(i => i.name).join(', '), items };
}

// --- the person's own amounts -------------------------------------------------------------------------------------

const UNITS = { g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l' };
const COUNTS = { a: 1, an: 1, one: 1, half: 0.5, two: 2, three: 3, four: 4, five: 5, six: 6 };
const UNIT_WORDS = Object.keys(UNITS).join('|');

/**
 * Amounts in the person's note: "50 g muesli, 200ml milk and 1 banana" → [{ name 'muesli', amount 50, unit 'g' },
 * { name 'milk', amount 200, unit 'ml' }, { name 'banana', count 1 }]. Parts without an amount are left out.
 */
export function amountsFromNote(note) {
  const found = [];
  for (const part of String(note ?? '').toLowerCase().split(/,|;|\+|&|\band\b|\bwith\b/)) {
    const text = part.trim();
    let m = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})\\b\\s*(?:of\\s+)?(.+)$`))
      ?? text.match(new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})$`));
    if (m) {
      const [amount, unit, name] = /^\d/.test(m[1]) ? [m[1], m[2], m[3]] : [m[2], m[3], m[1]];
      const base = UNITS[unit];
      found.push({ name: name.trim(), amount: Number(amount) * (base === 'kg' || base === 'l' ? 1000 : 1), unit: base === 'kg' || base === 'g' ? 'g' : 'ml' });
      continue;
    }
    m = text.match(/^(\d+(?:\.\d+)?|a|an|one|half|two|three|four|five|six)\s+(.+)$/);
    if (m) found.push({ name: m[2].trim(), count: COUNTS[m[1]] ?? Number(m[1]) });
  }
  return found.filter(f => normalizeFoodName(f.name).query);
}

const wordsOf = name => normalizeFoodName(name).query.split(' ').map(singularWord).filter(Boolean);
// "milk" and "whole milk" are the same food here; so are "banana" and "bananas"
function sameFood(a, b) {
  const [x, y] = [wordsOf(a), wordsOf(b)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length > 0 && short.every(w => long.includes(w));
}

/**
 * The meal with the person's own amounts in place of the photo's estimates. Each amount they give goes to one food:
 * the one with the same name, else the closest ("200 ml milk" → milk, not also milk tea).
 */
export function applyNoteAmounts(meal, note) {
  if (meal.kind !== 'meal' || !note) return meal;
  const items = [...meal.items];
  const done = new Set();
  for (const own of amountsFromNote(note)) {
    const same = i => !done.has(i) && wordsOf(items[i].name).join(' ') === wordsOf(own.name).join(' ');
    const close = i => !done.has(i) && sameFood(own.name, items[i].name);
    const i = [items.findIndex((_, j) => same(j)), items.findIndex((_, j) => close(j))].find(j => j >= 0);
    if (i === undefined) continue;
    done.add(i);
    const item = items[i];
    if (own.amount) {
      // exactly what they said: not rounded
      items[i] = { ...item, amount: Math.min(own.amount, MAX_AMOUNT), unit: own.unit, amountConfidence: 'high', amountSource: 'note' };
      continue;
    }
    // a count: the pieces are certain, each piece's weight is still the photo's estimate
    const count = Math.min(own.count, MAX_COUNT);
    const perPiece = item.amount && item.count ? item.amount / item.count : null;
    items[i] = {
      ...item, count, amountSource: 'note',
      amount: perPiece ? Math.round(perPiece * count) : item.amount,
      amountConfidence: perPiece ? 'medium' : item.amountConfidence,
    };
  }
  return { ...meal, items };
}

/** A model's raw answer → the checked meal, with the person's amounts applied. */
export const finishMeal = (raw, note) => applyNoteAmounts(validateMeal(raw), note);
