// Private serverless endpoint: identifies food (from a photo or free text) and returns real nutrition data.
// A photo can hold several foods — muesli, milk and banana — each looked up on its own, with its own amount
// (`items`); the top-level fields older apps read describe the one food, or the whole meal. Personalization
// (allergens, dietary recommendations) still stays entirely client-side in src/App.tsx — the only per-user state
// here is a Redis flag tracking whether the once-per-day meal-scan point award has already been given, keyed by
// appUserId (profile.email).
import Anthropic from '@anthropic-ai/sdk';
import { getRewardConfig } from './_lib/rewardConfig.js';
import { logAuditEvent } from './_lib/auditLog.js';
import { Redis } from '@upstash/redis';
import { handleCors } from './_lib/cors.js';
import { checkScanQuota, recordScan, quotaExceededBody } from './_lib/scanQuota.js';
import { fromTypical, lookupNutrition } from './_lib/nutrition.js';
import { IdentifyError } from './_lib/identify.js';
import { identifyMealWithClaude } from './_lib/identifyClaude.js';
import { combine, gramsOf } from './_lib/mealTotals.js';

// A photo of several foods looks each one up (a USDA search can take a few seconds): more than the default time.
export const config = { maxDuration: 30 };

const redis = Redis.fromEnv();
// ANTHROPIC_API_KEY from the Vercel environment. A scan should answer in seconds: one retry, then give up.
// The model is SCAN_MODEL (default claude-sonnet-5), read in _lib/identifyClaude.js.
const anthropic = new Anthropic({ timeout: 20_000, maxRetries: 1 });

// Photos that give no foods to look up. The app shows the message; the scan isn't counted.
const NO_FOODS = {
  not_food: [422, 'Couldn’t see any food in this photo. Try again, or type what you ate.'],
  unclear: [422, 'The photo is too dark or blurred to tell. Try again in better light, or type what you ate.'],
  refused: [422, 'Couldn’t read this photo. Try another one, or type what it is.'],
  truncated: [502, 'The scan was cut off. Please try again.'],
  noAmounts: [422, 'Couldn’t tell how much is in this photo. Try again, or type what you ate.'],
};

// what a scan costs, for comparing models later
const logUsage = usage => console.log('scan-meal usage', JSON.stringify(usage));

function buildResult(foodName, estimatedGrams, nutrientValues, basisGrams, missing = new Set()) {
  const scale = estimatedGrams / basisGrams;
  const scaled = {};
  const per100 = {};
  for (const key of Object.keys(nutrientValues)) {
    scaled[key] = nutrientValues[key] * scale;
    // null = the database has no value for it (the app counts those as "not given", not as 0)
    per100[key] = missing.has(key) && !['calories', 'protein', 'carbs', 'fat', 'fiber'].includes(key)
      ? null : Math.round((nutrientValues[key] * 100 / basisGrams) * 100) / 100;
  }

  return {
    foodName,
    estimatedPortionGrams: Math.round(estimatedGrams),
    estimated: true,
    calories: Math.round(scaled.calories),
    macros: {
      carbs: Math.round(scaled.carbs),
      protein: Math.round(scaled.protein),
      fat: Math.round(scaled.fat),
      fiber: Math.round(scaled.fiber)
    },
    micros: {
      sodium: `${Math.round(scaled.sodium)}mg`,
      potassium: `${Math.round(scaled.potassium)}mg`,
      iron: `${scaled.iron.toFixed(1)}mg`,
      calcium: `${Math.round(scaled.calcium)}mg`
    },
    // exact per-100 g values, so the app can change the amount eaten without asking again
    per100g: {
      kcal: per100.calories, carbs: per100.carbs, protein: per100.protein, fat: per100.fat, fiber: per100.fiber,
      satFat: per100.satFat, sugars: per100.sugars,
      sodiumMg: per100.sodium, potassiumMg: per100.potassium, ironMg: per100.iron, calciumMg: per100.calcium
    },
    source: 'USDA FoodData Central'
  };
}

// Where the numbers came from, so the app can show it and the person can tell if it's the wrong food; and, for
// liquids (new; older apps ignore them), a drink and grams in one ml, so "200 ml" is never simply counted as grams.
function matchFields(nutrition, name) {
  const fields = { matchedFood: nutrition.estimate ? `${name} (AI estimate, no database match)` : nutrition.matched };
  if (nutrition.estimate) fields.source = 'AI estimate';
  if (nutrition.drink) fields.drink = true;
  if (nutrition.density) Object.assign(fields, { density: nutrition.density, densityAssumed: nutrition.densityAssumed });
  return fields;
}

// A food's numbers per 100 of its own unit (per 100 ml for one measured in ml), in the app's names; null = not given.
// Rounded exactly as buildResult's per100g, so a food measured in grams has the very same numbers in both.
function per100Of(nutrientValues, missing, perUnit) {
  const value = key => (missing.has(key) && !['calories', 'protein', 'carbs', 'fat', 'fiber'].includes(key)
    ? null : Math.round((nutrientValues[key] * perUnit * 100 / 100) * 100) / 100);
  return {
    kcal: value('calories'), carbs: value('carbs'), protein: value('protein'), fat: value('fat'), fiber: value('fiber'),
    satFat: value('satFat'), sugars: value('sugars'),
    sodiumMg: value('sodium'), potassiumMg: value('potassium'), ironMg: value('iron'), calciumMg: value('calcium'),
  };
}

// One food of a photo, as the app gets it in `items`: its amount as seen (or as the person's note gave it), its own
// numbers, how sure the model was, and whether to ask before logging it.
function itemResult(item, nutrition) {
  const perUnit = item.unit === 'ml' && nutrition ? nutrition.density : 1;
  return {
    name: item.name,
    form: item.form,
    amount: item.amount,
    unit: item.unit,
    grams: item.amount !== null && nutrition ? Math.round(gramsOf(item.amount, item.unit, perUnit) * 10) / 10 : null,
    ...(item.unit === 'ml' && nutrition ? { density: nutrition.density, densityAssumed: nutrition.densityAssumed } : {}),
    count: item.count,
    piece: item.piece,
    per100: nutrition ? per100Of(nutrition.nutrientValues, nutrition.missing, perUnit) : null,
    matchedFood: nutrition?.matched ?? null,
    source: !nutrition ? null : nutrition.estimate ? 'AI estimate' : 'USDA FoodData Central',
    matchConfidence: !nutrition ? 'none' : nutrition.estimate ? 'estimate' : 'database',
    confidence: item.confidence,
    amountConfidence: item.amountConfidence,
    amountSource: item.amountSource,
    alternatives: item.alternatives,
    packaged: item.packaged,
    needsReview: item.confidence === 'low' || item.amount === null || !nutrition,
  };
}

// A photo → { result } or { error: [status, message] }. Every food is looked up on its own (the numbers come from the
// food table or USDA; the model's own only as a labelled estimate when no database food fits), and a meal's totals
// are added up from those, unrounded.
async function photoResult(image, mimeType, note) {
  let identified;
  try {
    identified = await identifyMealWithClaude({ image, mimeType, note }, { client: anthropic });
  } catch (error) {
    if (!(error instanceof IdentifyError)) throw error;
    if (error.usage) logUsage(error.usage);
    if (NO_FOODS[error.reason]) return { error: NO_FOODS[error.reason] };
    throw error; // an answer that can't be read: "Meal scan failed", as before
  }
  logUsage(identified.usage);
  const { meal } = identified;
  if (meal.kind !== 'meal') return { error: NO_FOODS[meal.kind] };

  const foods = await Promise.all(meal.items.map(async item => ({
    item,
    nutrition: await lookupNutrition(item.name, { typical: item.typicalPer100g, form: item.form, unit: item.unit })
      ?? fromTypical(item.typicalPer100g, item.name, item.unit),
  })));
  // the ones that count: an amount and numbers for it
  const counted = foods.filter(f => f.item.amount !== null && f.nutrition)
    .map(f => ({ ...f, grams: gramsOf(f.item.amount, f.item.unit, f.nutrition.density) }));
  if (!counted.length) {
    if (foods.some(f => f.nutrition)) return { error: NO_FOODS.noAmounts };
    const name = meal.items.length === 1 ? meal.items[0].name : meal.mealName;
    return { error: [404, `Could not find nutrition data for "${name}". Please try a more specific description.`] };
  }

  let result;
  if (counted.length === 1) {
    // one food: the same fields as always
    const [{ item, nutrition, grams }] = counted;
    result = { ...buildResult(item.name, grams, nutrition.nutrientValues, nutrition.basisGrams, nutrition.missing), ...matchFields(nutrition, item.name) };
    // "2 slices" instead of "a portion", when it makes sense
    if (item.count >= 1) result.count = item.count;
    if (item.piece) result.unit = item.piece;
  } else {
    // several: one serving of the whole meal, for apps that log a photo as one food
    const whole = combine(counted.map(({ grams, nutrition }) => ({ grams, nutrientValues: nutrition.nutrientValues, missing: nutrition.missing })));
    result = {
      ...buildResult(meal.mealName, whole.grams, whole.nutrientValues, 100, whole.missing),
      count: 1,
      unit: 'serving',
      matchedFood: counted.map(({ item, nutrition }) => (nutrition.estimate ? `${item.name} (AI estimate)` : nutrition.matched)).join(' + '),
    };
    if (counted.some(f => f.nutrition.estimate)) result.source = 'USDA FoodData Central + AI estimate';
  }
  result.mealName = meal.mealName;
  result.items = foods.map(({ item, nutrition }) => itemResult(item, nutrition));
  return { result };
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { image, mimeType, foodText, appUserId } = req.body;
  // The person's own description of a photo ("unsweetened almond milk, 250 ml"): plain text, kept short.
  const note = typeof req.body.note === 'string' ? req.body.note.replace(/[\u0000-\u001f"\\]/g, ' ').trim().slice(0, 200) : '';

  try {
    let result;
    let quota = null;
    if (image) {
      // Photo scans are limited per day (free 2, Plus 10) — typed checks aren't.
      if (!appUserId) return res.status(401).json({ error: 'Sign in to scan a photo.' });
      quota = await checkScanQuota(appUserId, req.body?.timeZone);
      if (!quota.allowed) return res.status(429).json(quotaExceededBody(quota));
      const scanned = await photoResult(image, mimeType || 'image/jpeg', note);
      if (scanned.error) return res.status(scanned.error[0]).json({ error: scanned.error[1] });
      result = scanned.result;
    } else if (foodText) {
      const nutrition = await lookupNutrition(foodText);
      if (!nutrition) {
        return res.status(404).json({ error: `Could not find nutrition data for "${foodText}". Please try a more specific description.` });
      }
      result = { ...buildResult(foodText, 100, nutrition.nutrientValues, nutrition.basisGrams, nutrition.missing), ...matchFields(nutrition, foodText) };
    } else {
      return res.status(400).json({ error: 'Provide either "image" (base64) or "foodText".' });
    }

    // Only a scan that gave foods back counts towards the day's limit.
    if (quota) {
      result.scansLeft = await recordScan(appUserId, quota);
      result.scanLimit = quota.limit;
      result.plus = quota.plus;
    }

    // Award meal-scan points once per calendar day, regardless of how many scans happen —
    // dedup enforced server-side (a resettable localStorage flag could be gamed by re-scanning).
    result.pointsAwarded = 0;
    // Points are a bonus: if Redis is unreachable (e.g. bad credentials), still return the nutrition —
    // before, a Redis error turned every signed-in food check into a 500.
    try {
      if (appUserId) {
        const today = new Date().toISOString().slice(0, 10);
        const awardKey = `meal_scan_points_awarded:${appUserId}:${today}`;
        const alreadyAwarded = await redis.get(awardKey);
        if (!alreadyAwarded) {
          const config = await getRewardConfig();
          result.pointsAwarded = config.mealScanPointsAward;
          await redis.set(awardKey, '1', { ex: 60 * 60 * 24 * 2 });
          await logAuditEvent(appUserId, {
            type: 'earn',
            category: 'meal_scan',
            verified: true,
            verificationNote: 'Real Claude vision/USDA scan completed.',
            points: result.pointsAwarded
          });
        }
      }
    } catch (pointsError) {
      console.error('Meal-scan points award failed:', pointsError);
      result.pointsAwarded = 0;
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Meal scan failed', details: error.message });
  }
}
