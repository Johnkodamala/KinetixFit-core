// Nutrition lookup for api/scan-meal.js: the app's own food table first (the same foods and numbers the phone uses),
// then USDA FoodData Central — the search, how well each result matches what was asked for, and its numbers per 100 g.
// No model calls here — the same name always finds the same food.
import { FOOD_TABLE } from './foodTable.js';
import { normalizeFoodName, singularWord } from './foodNormalize.js';
import { densityFor } from './density.js';

export const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
  satFat: 1258,
  sugars: 2000,
  sodium: 1093,
  potassium: 1092,
  iron: 1089,
  calcium: 1087
};

// Words that mean a different form of the food than someone typing plain "banana" or "rice" means — unless they typed them.
const FORM_WORDS = ['dehydrated', 'dried', 'powder', 'chips', 'juice', 'canned', 'baby', 'frozen', 'sweetened', 'candied', 'fried',
  'flour', 'syrup', 'concentrate', 'dessert', 'pudding', 'bread', 'cake', 'pie', 'muffin', 'smoothie', 'flavored', 'mix', 'sauce', 'spread',
  'yolk', 'egg white', 'meat and skin', 'skin only', 'giblets', 'breaded', 'batter', 'nfs', 'ns as to', 'smoked', 'sheep', 'goat',
  'buffalo', 'imitation', 'reduced sodium', 'low sodium'];
// Foods people eat cooked: "rice" means cooked rice, not raw grains
const EATEN_COOKED = ['rice', 'pasta', 'spaghetti', 'noodle', 'lentil', 'bean', 'chickpea', 'quinoa', 'chicken', 'beef', 'pork', 'lamb',
  'turkey', 'salmon', 'fish', 'cod', 'prawn', 'shrimp', 'mince', 'sausage', 'bacon'];

export const nutrientValue = (food, ids) => {
  for (const id of ids) {
    const found = food.foodNutrients?.find(n => n.nutrientId === id);
    if (typeof found?.value === 'number') return found.value;
  }
  return null;
};

// Same check as the app's isPlausible() (src/lib/foodLog.ts): per-100 g numbers that can physically exist.
export function plausible(v) {
  const kcal = v.calories, p = v.protein, c = v.carbs, f = v.fat;
  if (!(kcal >= 0) || kcal > 905 || p + c + f > 101) return false;
  const fromMacros = 4 * p + 4 * c + 9 * f;
  return kcal < 40 || Math.abs(fromMacros - kcal) / kcal < 0.4;
}

// A word as a whole word — singular or plural, or ending -ed / -ing: "tomato" finds "Tomatoes", "cherry" "Cherries",
// "sprouts" "Sprouted", "fry" "Fried" — but "chai" doesn't find "Chain", "egg" "Eggplant" or "pea" "Peanuts".
function wordPattern(word) {
  const base = singularWord(word);
  if (/[^aeiou]y$/.test(base)) return new RegExp(`\\b${base.slice(0, -1)}(?:y|ies|ied)\\b`);
  if (base.endsWith('e')) return new RegExp(`\\b(?:${base}(?:s|d)?|${base.slice(0, -1)}ing)\\b`);
  return new RegExp(`\\b${base}(?:s|es|ed|ing)?\\b`);
}

// Every typed word is in the name. Two typed words may also be one word there: "broad beans" → "Broadbeans",
// "soy milk" → "Soymilk".
function allWordsIn(words, desc) {
  for (let i = 0; i < words.length; i++) {
    if (wordPattern(words[i]).test(desc)) continue;
    if (i + 1 < words.length && wordPattern(words[i] + words[i + 1]).test(desc)) { i++; continue; }
    return false;
  }
  return true;
}

// How well a USDA food matches what was typed: every typed word present, the name starting with it, plain forms over
// processed ones ("Bananas, raw" over "Bananas, dehydrated, or banana powder"), shorter names over long recipes.
export function matchScore(food, query) {
  const desc = (food.description || '').toLowerCase();
  const q = query.toLowerCase().trim();
  const words = q.split(/[^a-z]+/).filter(w => w.length > 1);
  const stem = w => w.replace(/(es|s)$/, '');
  // every typed word as a whole word in the name ("milk" doesn't match "buttermilk")
  if (!words.length || !allWordsIn(words, desc)) return -1;
  let score = 10;
  // a whole part of the name is exactly what was typed: "Cheese, paneer" for paneer, "Bananas, raw" for banana
  const parts = desc.split(',').map(t => t.trim());
  if (parts.some(t => stem(t) === stem(q) || t === q)) score += 8;
  if (desc.startsWith(stem(words[0]))) score += 6;
  // a part of the food rather than the food ("Egg, white", "Potatoes, raw, skin") unless that's what was typed
  for (const partName of ['white', 'yolk', 'skin', 'leaves', 'peel', 'feet', 'neck', 'liver', 'heart', 'gizzard', 'back', 'wing', 'sticks'])
    if (parts.includes(partName) && !q.includes(partName)) score -= 8;
  // a brand in capitals ("UNCLE BENS", "KELLOGG") — a generic entry fits a generic name better
  if (/\b[A-Z]{3,}\b/.test(food.description || '')) score -= 6;
  if (parts.includes('whole') || parts.includes('plain')) score += 2;
  // "Rice, cooked, with milk", "Lentils, …, with salt": something added that wasn't typed
  if (/\bwith\b/.test(desc) && !/\bwith\b/.test(q)) score -= 4;
  if (EATEN_COOKED.some(w => q.includes(w)) && !/\braw\b/.test(q)) {
    if (/\b(cooked|boiled|roasted|baked|broiled|grilled|steamed)\b/.test(desc)) score += 4;
    if (/\braw\b/.test(desc)) score -= 4;
  }
  if (/\braw\b/.test(desc) && !/\bcooked|boiled|roasted|baked\b/.test(query) && !EATEN_COOKED.some(w => q.includes(w))) score += 3;
  for (const w of FORM_WORDS) if (desc.includes(w) && !query.toLowerCase().includes(w)) score -= 6;
  score -= desc.length / 40;
  if (food.dataType === 'Foundation' || food.dataType === 'SR Legacy') score += 2;
  return score;
}

export async function searchFoods(foodName, dataTypes) {
  const USDA_FDC_API_KEY = process.env.USDA_FDC_API_KEY;
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_FDC_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: foodName, dataType: dataTypes, pageSize: 25 }),
    // a slow USDA answer shouldn't hold up the whole scan
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`USDA lookup failed: ${response.status}`);
  const data = await response.json();
  return data.foods || [];
}

// --- the app's food table ------------------------------------------------------------------------------------------
// Found the same way the phone finds it (findTableFood in src/lib/foodLog.ts; a test checks they agree), so a photo, a
// typed check and the phone all give the same food and numbers.
const TABLE_FILLER = /\b(a|an|one|the|medium|large|small|big|fresh|raw|ripe|whole|plain|some|of)\b/g;
const phoneNormalise = name => name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const phoneSingular = word => word.replace(/ies$/, 'y').replace(/(o|ch|sh|x)es$/, '$1').replace(/([^s])s$/, '$1');
const tableNorm = text => phoneNormalise(text).replace(TABLE_FILLER, ' ').replace(/\s+/g, ' ').trim().split(' ').map(phoneSingular).join(' ');

export function findTableFood(name) {
  const wanted = tableNorm(String(name ?? ''));
  if (!wanted) return null;
  return FOOD_TABLE.find(f => f.names.some(n => tableNorm(n) === wanted)) ?? null;
}

// the table's nutrient names → this file's
const TABLE_KEYS = { kcal: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat', fiber: 'fiber', satFat: 'satFat', sugars: 'sugars',
  sodiumMg: 'sodium', potassiumMg: 'potassium', ironMg: 'iron', calciumMg: 'calcium' };

function fromTable(food) {
  const nutrientValues = {};
  for (const [tableKey, key] of Object.entries(TABLE_KEYS)) nutrientValues[key] = food.per100g[tableKey];
  return {
    nutrientValues, basisGrams: 100, missing: new Set(food.missing.map(k => TABLE_KEYS[k])), matched: food.description,
    ...(food.mlToG ? { density: food.mlToG, densityAssumed: false } : {}), ...(food.drink ? { drink: true } : {}),
  };
}

/**
 * Whether a food's numbers per 100 g are close enough to the typical ones the model gave for what it saw to be the
 * same food: kcal within 60 kcal or 50%, protein within 4 g or 60%. Soybean curd cheese (151 kcal, 12.5 g protein)
 * isn't curd (61, 3.5); dry oats (389) aren't a bowl of porridge (70). Used once the photo answer carries those
 * numbers (step 4); with nothing to compare against, anything passes.
 */
export function agrees(nutrientValues, typical) {
  if (!typical) return true;
  const near = (a, b, abs, rel) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(a, b));
  return near(nutrientValues.calories, typical.kcal, 60, 0.5) && near(nutrientValues.protein, typical.protein, 4, 0.6);
}

// Sweets sold under a food's name ("WATERMELON SLICE" gummies, "PEACH RINGS"): never a stand-in for the food itself,
// unless sweets are what was asked for.
const SWEETS = /\b(candy|candies|gumm(?:y|ies)|confection\w*|lollipops?|taffy|licorice|liquorice|jelly beans?|marshmallows?)\b/i;
const isSweetsNotAskedFor = (food, query) =>
  SWEETS.test(`${food.description ?? ''} ${food.foodCategory ?? ''} ${food.brandedFoodCategory ?? ''}`) && !SWEETS.test(query);

// Branded foods are stored per 100 g or per 100 ml, whichever unit the label's serving is in (USDA's Branded Foods
// documentation). Everything else is per 100 g.
const perMl = food => food.dataType === 'Branded' && /^(ml|mlt)$/i.test(String(food.servingSizeUnit ?? '').trim());

const GENERIC = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

// Every search result that matches the words, with its numbers per 100 g, best match first.
function rank(candidates, query) {
  return candidates
    .map(food => {
      const nutrientValues = {};
      for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
        // energy: 1008 kcal, or the Atwater values Foundation foods use instead
        const v = nutrientValue(food, key === 'calories' ? [1008, 2047, 2048] : [id]);
        // USDA analyses occasionally report a slightly negative value ("carbs by difference") — that's zero
        nutrientValues[key] = v === null ? null : Math.max(0, v);
      }
      return { food, nutrientValues, score: matchScore(food, query) };
    })
    .filter(c => c.score >= 0 && c.nutrientValues.calories !== null)
    .map(c => {
      const missing = new Set(Object.keys(c.nutrientValues).filter(k => c.nutrientValues[k] === null));
      for (const k of missing) c.nutrientValues[k] = 0;
      if (!perMl(c.food)) return { ...c, missing };
      // a branded drink: per 100 ml → per 100 g (100 ml weighs 100 × density grams)
      const density = densityFor(query);
      for (const k of Object.keys(c.nutrientValues)) c.nutrientValues[k] /= density.gPerMl;
      return { ...c, missing, liquid: { drink: true, density: density.gPerMl, densityAssumed: density.from === 'assumed' } };
    })
    .filter(c => plausible(c.nutrientValues))
    .sort((a, b) => b.score - a.score);
}

const found = best => ({
  nutrientValues: best.nutrientValues, basisGrams: 100, missing: best.missing, matched: best.food.description,
  foodMeasures: best.food.foodMeasures, ...best.liquid,
});

// An amount in ml needs grams in one ml: the match's own figure, or densityFor's.
function withDensity(result, query) {
  if (result.density) return result;
  const density = densityFor(query, { foodMeasures: result.foodMeasures });
  return { ...result, density: density.gPerMl, densityAssumed: density.from === 'assumed' };
}

/**
 * The app's table first; then generic USDA foods (Foundation, SR Legacy, survey foods); branded products only when
 * nothing generic matches, and never sweets in place of a food. The search API gives every food's nutrients per 100 g
 * (or 100 ml, for branded drinks) — branded values used to be treated as per serving (so a 32 g-serving "BANANA"
 * spread came out ~3× too high and was logged as a banana). Returned numbers are always per 100 g; null = nothing
 * trustworthy found.
 *
 * A typed check passes just the name. A food from a photo also passes what the model saw:
 * - `typical`: its rough numbers per 100 g. Only a guard: a database food far from them (agrees()) isn't what was seen,
 *   so the next one is tried — the numbers used always come from the database. Branded products must agree too.
 * - `form` (cooked, raw, dry): searched for first, so oats in a bowl of porridge find cooked oats, not dry ones.
 * - `unit` 'ml': the density comes along, to turn the ml into grams.
 */
export async function lookupNutrition(foodName, { typical = null, form, unit } = {}) {
  const { query } = normalizeFoodName(foodName);
  const fits = candidate => agrees(candidate.nutrientValues, typical);
  const done = result => (unit === 'ml' ? withDensity(result, query) : result);

  const tableFood = findTableFood(foodName) ?? findTableFood(query);
  if (tableFood && fits(fromTable(tableFood))) return done(fromTable(tableFood));

  const queries = typical && ['cooked', 'raw', 'dry'].includes(form) ? [`${query} ${form}`, query] : [query];
  let wordsMatched = false;
  for (const q of queries) {
    const candidates = await searchFoods(q, GENERIC);
    wordsMatched ||= candidates.some(f => matchScore(f, q) >= 0);
    const best = rank(candidates, q).find(fits);
    if (best) return done(found(best));
  }
  // branded: when nothing generic matched the words — or, for a food from a photo, nothing generic agreed
  if (wordsMatched && !typical) return null;
  const branded = (await searchFoods(query, ['Branded'])).filter(f => !isSweetsNotAskedFor(f, query));
  const best = rank(branded, query).find(fits);
  return best ? done(found(best)) : null;
}

/**
 * The model's own typical numbers, for a food no database has (or none that agrees): used only as a labelled
 * "AI estimate", and only when they can physically be right. The minerals etc. are unknown.
 */
export function fromTypical(typical, foodName, unit) {
  if (!typical) return null;
  const nutrientValues = { calories: typical.kcal, protein: typical.protein, carbs: typical.carbs, fat: typical.fat, fiber: typical.fiber,
    satFat: 0, sugars: 0, sodium: 0, potassium: 0, iron: 0, calcium: 0 };
  if (!plausible(nutrientValues)) return null;
  const estimate = { nutrientValues, basisGrams: 100, missing: new Set(['satFat', 'sugars', 'sodium', 'potassium', 'iron', 'calcium']), matched: null, estimate: true };
  return unit === 'ml' ? withDensity(estimate, normalizeFoodName(foodName).query) : estimate;
}
