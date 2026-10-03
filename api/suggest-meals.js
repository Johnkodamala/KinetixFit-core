// AI meal ideas (Kinetix Fit Plus): nine suggestions for the user's next meal, best first, built from their goal, BMI,
// today's targets, what they've already eaten and how active they've been today. The app shows three at a time
// ("Show 3 more"), so one call covers three refreshes; "New ideas" asks again, leaving out the ones already shown.
//
// - Plus only, checked with RevenueCat here (api/_lib/plus.js) — the app hiding the button isn't enough.
// - Up to DAILY_LIMIT fresh generations per day (the phone's time zone; UK time for older builds); asking again with the same inputs within 30 min returns the
//   cached answer and doesn't count.
// - Allergens and diet are hard rules three times over: the prompt excludes them, any suggestion the model says contains
//   an allergen — or meat/fish for a vegetarian, or egg for a vegetarian who doesn't eat eggs — is dropped before it
//   reaches the user, and the dish's own words are checked too (the model once suggested hummus, which is tahini, which is
//   sesame, to someone allergic to sesame: api/_lib/ideaFilter.js, api/_lib/allergenWords.js). Allergies the person typed in
//   themselves ("kiwi") count too, and are checked by name.
// - Where they live decides the food (as the app's own list does, src/lib/mealIdeas.ts): India gets Indian dishes only
//   and never beef; the UAE Middle Eastern first and never pork; Singapore its own dishes (COUNTRY_FOOD). Suggestions
//   naming an avoided meat are dropped here too.
// - General wellness guidance only (NHS-style wording), never medical advice.
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { handleCors } from './_lib/cors.js';
import { isPlusUser } from './_lib/plus.js';
import { COUNTRY_REWARDS, dayKey, requestCountry } from './_lib/countries.js';
import { keepSuggestions } from './_lib/ideaFilter.js';

export const config = { maxDuration: 60 };

const redis = Redis.fromEnv();
const anthropic = new Anthropic(); // ANTHROPIC_API_KEY from the Vercel environment
const DAILY_LIMIT = 6;
const CACHE_SECONDS = 30 * 60;
const IDEAS = 9;

const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'suggestions'],
  properties: {
    headline: { type: 'string', description: 'One short sentence on what the next meal should focus on today.' },
    // "Nine" is asked for here and in the prompt, and capped below: structured outputs don't support array length
    // constraints (minItems above 1, maxItems), so they aren't in the schema.
    suggestions: {
      type: 'array',
      description: 'Nine different options, the best fit first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'why', 'calories', 'protein', 'carbs', 'fat', 'fibre', 'prepMinutes', 'containsAllergens', 'containsMeatOrFish', 'containsEgg'],
        properties: {
          name: { type: 'string', description: 'Generic dish name, no brands, max 60 characters.' },
          description: { type: 'string', description: 'One sentence: main ingredients and portion.' },
          why: { type: 'string', description: 'One short sentence tying it to their numbers today.' },
          calories: { type: 'integer' },
          protein: { type: 'integer', description: 'grams' },
          carbs: { type: 'integer', description: 'grams' },
          fat: { type: 'integer', description: 'grams' },
          fibre: { type: 'integer', description: 'grams' },
          prepMinutes: { type: 'integer' },
          containsAllergens: {
            type: 'array',
            description: 'Every allergen the dish contains: any from this list (celery, wheat, crustaceans, eggs, fish, lupin, milk, molluscs, mustard, nuts, peanuts, sesame, soya, sulphur dioxide), plus any of the user\'s own allergies from profile.allergens that it has, in the user\'s words.',
            items: { type: 'string' },
          },
          containsMeatOrFish: { type: 'boolean', description: 'true if the dish has any meat, poultry, fish or seafood, including stock, gelatine or fish sauce.' },
          containsEgg: { type: 'boolean', description: 'true if the dish has egg in any form, including mayonnaise or baked goods made with egg.' },
        },
      },
    },
  },
};

const DIETS = ['everything', 'vegetarian', 'vegetarian-no-egg'];

// What people eat where the user lives (keep in step with CUISINES_BY_COUNTRY and COUNTRY_AVOID in src/lib/mealIdeas.ts).
const COUNTRY_FOOD = {
  IN: { rule: 'Suggest Indian dishes only: everyday home cooking from across India (north, south, east and west), no Western or other cuisines. Never beef or veal — most people in India don\'t eat it.', avoid: ['beef', 'veal', 'steak'] },
  AE: { rule: 'Suggest what people in the UAE eat every day: Emirati and wider Middle Eastern home cooking first, then Mediterranean and Indian dishes. Never pork or pork products.', avoid: ['pork', 'ham', 'bacon', 'gammon', 'prosciutto', 'pancetta', 'chorizo'] },
  SG: { rule: 'Suggest Singaporean home and hawker favourites (Chinese, Malay and Indian), made lighter, plus other everyday Asian dishes.' },
};

// The user's country shapes the ingredients and the healthy-eating guidance (src/lib/countries.ts).
const systemFor = (country, code) => `You are the meal-planning assistant inside Kinetix Fit, a fitness and nutrition app. This user lives in ${country}.
Suggest nine different options for the user's next meal that fit what is left of their day, ordered from the best fit
to the least. The app shows them three at a time, so make each group of three varied (different main ingredients).

Rules:
- Never include any of the user's allergens, in any form (e.g. "milk" rules out cheese, yoghurt, butter, whey).
- Follow the user's diet: "vegetarian" means no meat, poultry, fish or seafood in any form (including stock, gelatine
  and fish sauce); "vegetarian-no-egg" also means no egg (including mayonnaise and baked goods made with egg).
- Fit the remaining calories and prioritise any protein or fibre still missing; a snack slot means a snack-sized portion.
- Use the goal: weight loss favours filling, high-protein, high-fibre meals; weight gain favours energy-dense meals with
  protein; cardio endurance favours carbohydrate for fuel plus protein for recovery; recovery favours balanced, steady meals.
- If they exercised today, account for recovery; if they've eaten little, don't overcompensate with one huge meal.
- Everyday ingredients from supermarkets in ${country}, suited to how people there eat, simple to make, varied across the
  options. Follow the healthy-eating guidance used in ${country}. Generic dish names, no brands.${COUNTRY_FOOD[code] ? `
- ${COUNTRY_FOOD[code].rule}` : ''}
- Never repeat a dish listed under "alreadySuggested".
- Nutrition numbers are sensible estimates for the stated portion.
- Wellness guidance only: no medical claims, no mention of treating conditions.`;


// Keep only what the model needs, with sane bounds, so a bad client can't inflate the prompt.
function cleanContext(body) {
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  const list = (v, max, len) => (Array.isArray(v) ? v.slice(0, max).map(x => str(x, len)).filter(Boolean) : []);
  const p = body.profile || {};
  const t = body.today || {};
  return {
    mealSlot: ['breakfast', 'lunch', 'afternoon snack', 'dinner', 'evening snack'].includes(body.mealSlot) ? body.mealSlot : 'next meal',
    profile: {
      goal: str(p.goal, 40), sex: str(p.sex, 10), age: num(p.age, 13, 110),
      heightCm: num(p.heightCm, 100, 250), weightKg: num(p.weightKg, 30, 350), bmi: num(p.bmi, 10, 80),
      bmiCategory: str(p.bmiCategory, 30), activityLevel: str(p.activityLevel, 20),
      // label allergens plus any the person typed in themselves
      allergens: list(p.allergens, 34, 40),
      diet: DIETS.includes(p.diet) ? p.diet : 'everything', // older app builds don't send it
    },
    targets: { calories: num(t.caloriesTarget, 800, 6000), protein: num(t.proteinTarget, 20, 400), fibre: num(t.fibreTarget, 10, 80) },
    eatenToday: {
      calories: num(t.calories, 0, 10000), protein: num(t.protein, 0, 600), carbs: num(t.carbs, 0, 1500), fibre: num(t.fibre, 0, 200),
      foods: list(t.foods, 20, 80),
    },
    activityToday: { steps: num(t.steps, 0, 100000), workouts: list(t.workouts, 5, 60), sleepHours: num(t.sleepHours, 0, 24) },
    // "New ideas": dishes already shown today, so the next set is different
    alreadySuggested: list(body.exclude, 27, 60),
  };
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { appUserId } = req.body || {};
  if (!appUserId) return res.status(401).json({ error: 'Sign in to get meal ideas.' });

  if (!(await isPlusUser(appUserId, { whenUnknown: false }))) {
    return res.status(403).json({ error: 'AI meal ideas are part of Kinetix Fit Plus.', code: 'PLUS_REQUIRED' });
  }

  const context = cleanContext(req.body);
  const countryCode = requestCountry(req.body.profile?.country) ?? 'GB';
  const countryName = COUNTRY_REWARDS[countryCode].name;
  const cacheKey = `meal_ideas:${appUserId}:${createHash('sha256').update(JSON.stringify({ countryCode, ...context })).digest('hex').slice(0, 24)}`;
  const countKey = `meal_ideas_count:${appUserId}:${dayKey(req.body.timeZone)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json({ ...(typeof cached === 'string' ? JSON.parse(cached) : cached), cached: true });
  } catch { /* cache is optional */ }

  let used = 0;
  try { used = Number((await redis.get(countKey)) || 0); } catch { /* if Redis is down, allow it */ }
  if (used >= DAILY_LIMIT) {
    return res.status(429).json({ error: `You've had today's ${DAILY_LIMIT} sets of meal ideas. More tomorrow.`, code: 'MEAL_IDEAS_LIMIT' });
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: MEAL_SCHEMA } },
      // If a safety classifier declines, Anthropic retries on its recommended fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: systemFor(countryName, countryCode),
      messages: [{ role: 'user', content: `Suggest my ${context.mealSlot}. My day so far:\n${JSON.stringify(context, null, 2)}` }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(502).json({ error: 'Couldn’t come up with ideas this time. Try again in a moment.' });
    }
    const text = response.content.find(b => b.type === 'text')?.text;
    if (!text || response.stop_reason === 'max_tokens') throw new Error(`Unusable response (stop_reason ${response.stop_reason})`);

    const parsed = JSON.parse(text);
    const suggestions = keepSuggestions(parsed.suggestions, {
      allergens: context.profile.allergens,
      countryAvoid: COUNTRY_FOOD[countryCode]?.avoid ?? [],
      diet: context.profile.diet,
      alreadySuggested: context.alreadySuggested,
      limit: IDEAS,
    });
    if (suggestions.length === 0) throw new Error('Every suggestion broke an allergen or diet rule');

    const result = { headline: parsed.headline, mealSlot: context.mealSlot, suggestions, ideasLeft: Math.max(0, DAILY_LIMIT - used - 1) };
    try {
      await redis.set(cacheKey, JSON.stringify(result), { ex: CACHE_SECONDS });
      await redis.incr(countKey);
      await redis.expire(countKey, 60 * 60 * 48);
    } catch { /* counting/caching is best effort */ }
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(503).json({ error: 'Meal ideas are busy right now. Try again in a minute.' });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Meal ideas API error', error.status, error.message);
      return res.status(502).json({ error: 'Couldn’t reach the meal-ideas service. Try again shortly.' });
    }
    console.error('Meal ideas failed:', error);
    return res.status(500).json({ error: 'Couldn’t make meal ideas this time. Try again shortly.' });
  }
}
