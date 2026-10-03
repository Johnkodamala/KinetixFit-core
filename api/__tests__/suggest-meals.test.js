// api/suggest-meals.js: who the AI meal ideas are for (Plus is checked per account, and a generation costs a model call), and which of
// the model's ideas reach the phone (an allergy, the diet and the country are rules, not suggestions to the model).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session = null; // the verified session: { id, email } or null
vi.mock('../_lib/supabaseAuth.js', () => ({ verifiedUser: async () => session, verifiedUserId: async () => session?.id ?? null }));
const isPlusUser = vi.fn(async () => false); // false: whoever gets past the identity check ends in the same 403 PLUS_REQUIRED
vi.mock('../_lib/plus.js', () => ({ isPlusUser: (...a) => isPlusUser(...a) }));
const redisSet = vi.fn(async () => 'OK');
const redisIncr = vi.fn(async () => 1);
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({ get: async () => null, set: (...a) => redisSet(...a), incr: (...a) => redisIncr(...a), expire: async () => 1 }) } }));
// What the model answers, set per test; with none set the model must not be called (the identity tests never get that far).
let modelReply = null;
const create = vi.fn(async (...a) => {
  if (!modelReply) throw new Error('the model must not be called in these tests');
  return modelReply(...a);
});
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class RateLimitError extends APIError {}
  // the handler asks through `beta` (server-side fallback), so the stand-in has it
  return { default: class { static APIError = APIError; static RateLimitError = RateLimitError; constructor() { this.messages = { create }; this.beta = { messages: { create } }; } } };
});

let handler;
beforeAll(async () => { process.env.ANTHROPIC_API_KEY = 'test-key'; ({ default: handler } = await import('../suggest-meals.js')); });
beforeEach(() => {
  isPlusUser.mockClear(); create.mockClear(); redisSet.mockClear(); redisIncr.mockClear();
  session = null; modelReply = null; delete process.env.REQUIRE_SESSION;
});

async function call(body) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body }, res);
  return res;
}

describe('who the meal ideas are for', () => {
  it('refuses a body that names another account than the signed-in one, before asking whether it has Plus', async () => {
    session = { id: 'u1', email: 'me@example.com' };
    const res = await call({ appUserId: 'plus.victim@example.com', mealSlot: 'dinner' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'WRONG_ACCOUNT' });
    expect(isPlusUser).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('asks about the signed-in account’s own plan, in the body’s spelling', async () => {
    session = { id: 'u1', email: 'me@example.com' };
    const res = await call({ appUserId: 'Me@Example.com', mealSlot: 'dinner' });
    expect(isPlusUser).toHaveBeenCalledWith('Me@Example.com', { whenUnknown: false });
    expect(res.body).toMatchObject({ code: 'PLUS_REQUIRED' });
  });

  it('still serves an older build with no session', async () => {
    const res = await call({ appUserId: 'old@example.com', mealSlot: 'dinner' });
    expect(isPlusUser).toHaveBeenCalledWith('old@example.com', { whenUnknown: false });
    expect(res.body).toMatchObject({ code: 'PLUS_REQUIRED' });
  });

  it('with REQUIRE_SESSION=1, wants a session', async () => {
    process.env.REQUIRE_SESSION = '1';
    const res = await call({ appUserId: 'old@example.com', mealSlot: 'dinner' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(isPlusUser).not.toHaveBeenCalled();
  });

  it('keeps its own message when no account is named at all', async () => {
    const res = await call({ mealSlot: 'dinner' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in to get meal ideas.' });
  });
});

// A model answer, as the SDK returns it: one text block of JSON (structured output).
const answer = (ideas, headline = 'Add protein and fibre') => async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ headline, suggestions: ideas }) }] });
const idea = (name, description, extra = {}) => ({
  name, description, why: 'Fits what is left of your day.', calories: 400, protein: 20, carbs: 45, fat: 12, fibre: 6, prepMinutes: 10,
  containsAllergens: [], containsMeatOrFish: false, containsEgg: false, ...extra,
});

// The nine ideas production's model gave a vegetarian with a sesame allergy on 3 Oct 2026 (the real answer from the Plus test). It
// listed no allergen for the hummus, which is made with tahini, which is sesame.
const REAL_NINE = [
  idea('Greek yoghurt with berries and oats', '200g Greek yoghurt topped with a handful of mixed berries, 30g rolled oats and a drizzle of honey.', { containsAllergens: ['milk'] }),
  idea('Baked beans on wholemeal toast', 'Half a tin of reduced-sugar baked beans on two slices of wholemeal toast with a scrape of butter.', { containsAllergens: ['wheat', 'milk'] }),
  idea('Hummus with pitta and crudites', '100g hummus with a wholemeal pitta and carrot and pepper sticks.', { containsAllergens: ['wheat'] }),
  idea('Cottage cheese with pineapple and crackers', '200g cottage cheese with fresh pineapple chunks and four wholegrain crackers.', { containsAllergens: ['milk', 'wheat'] }),
  idea('Banana and peanut butter on rye', 'Two slices of rye bread with 20g peanut butter and a sliced banana.', { containsAllergens: ['peanuts', 'wheat'] }),
  idea('Lentil and vegetable soup with bread roll', 'A bowl of red lentil and carrot soup with a wholemeal roll.', { containsAllergens: ['wheat'] }),
  idea('Milk and berry protein smoothie', '300ml semi-skimmed milk blended with frozen berries, a banana and 30g oats.', { containsAllergens: ['milk'] }),
  idea('Cheese and tomato wholemeal bagel', 'Toasted wholemeal bagel with 40g grated cheddar and sliced tomato, grilled.', { containsAllergens: ['milk', 'wheat'] }),
  idea('Rice pudding with stewed apple', 'A pot of rice pudding topped with cinnamon stewed apple and a few raisins.', { containsAllergens: ['milk'] }),
];
const profile = (extra = {}) => ({ goal: 'Weight Loss', sex: 'female', age: 33, heightCm: 165, weightKg: 72, bmi: 26.4, bmiCategory: 'Overweight', activityLevel: 'moderate', country: 'GB', diet: 'vegetarian', allergens: [], ...extra });
const ask = (extra = {}) => ({ appUserId: 'plus@example.com', mealSlot: 'dinner', timeZone: 'Europe/London', exclude: [], profile: profile(extra.profile), today: { calories: 800, protein: 30, carbs: 100, fibre: 8, foods: ['Oats'], steps: 5000 }, ...extra, ...(extra.profile ? { profile: profile(extra.profile) } : {}) });
const names = (res) => res.body.suggestions.map(s => s.name);

describe('which ideas reach the phone', () => {
  beforeEach(() => { session = { id: 'u1', email: 'plus@example.com' }; isPlusUser.mockImplementation(async () => true); });

  it('drops the hummus for a sesame allergy (the model didn’t say it holds sesame), keeps the other eight', async () => {
    modelReply = answer(REAL_NINE);
    const res = await call(ask({ profile: { allergens: ['sesame'] } }));
    expect(res.statusCode).toBe(200);
    expect(names(res)).not.toContain('Hummus with pitta and crudites');
    expect(res.body.suggestions).toHaveLength(8);
    expect(res.body.headline).toBe('Add protein and fibre');
    expect(res.body.ideasLeft).toBe(5);
  });

  it('hands on the model’s allergens as `allergens` and none of its bookkeeping fields', async () => {
    modelReply = answer(REAL_NINE);
    const res = await call(ask({ profile: { allergens: ['sesame'] } }));
    const first = res.body.suggestions[0];
    expect(first.allergens).toEqual(['milk']);
    for (const field of ['containsAllergens', 'containsMeatOrFish', 'containsEgg']) expect(first).not.toHaveProperty(field);
    expect(first).toMatchObject({ name: 'Greek yoghurt with berries and oats', calories: 400, prepMinutes: 10 });
  });

  it('stores the filtered answer (the 30-minute cache must not give the hummus back) and counts one set', async () => {
    modelReply = answer(REAL_NINE);
    await call(ask({ profile: { allergens: ['sesame'] } }));
    expect(redisSet).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(redisSet.mock.calls[0][1]);
    expect(stored.suggestions.map(s => s.name)).not.toContain('Hummus with pitta and crudites');
    expect(redisIncr).toHaveBeenCalledTimes(1);
  });

  it('tells the model the allergy and the diet, through the beta endpoint', async () => {
    modelReply = answer(REAL_NINE);
    await call(ask({ profile: { allergens: ['sesame', 'kiwi'] } }));
    expect(create).toHaveBeenCalledTimes(1);
    const sent = create.mock.calls[0][0];
    expect(sent.betas).toContain('server-side-fallback-2026-07-01');
    expect(sent.messages[0].content).toContain('"sesame"');
    expect(sent.messages[0].content).toContain('"kiwi"');
    expect(sent.messages[0].content).toContain('"diet": "vegetarian"');
  });

  it('keeps all nine when the person has no allergy', async () => {
    modelReply = answer(REAL_NINE);
    const res = await call(ask());
    expect(res.body.suggestions).toHaveLength(9);
  });

  it('believes the model when it declares an allergen the dish’s words don’t show', async () => {
    modelReply = answer([idea('Mixed grain bowl', 'Grains, leaves and a dressing.', { containsAllergens: ['Sesame'] }), idea('Plain rice and dal', 'Rice and dal.')]);
    const res = await call(ask({ profile: { allergens: ['sesame'] } }));
    expect(names(res)).toEqual(['Plain rice and dal']);
  });

  it('checks a typed allergy by its own words, and the wheat / milk lists for the label ones', async () => {
    modelReply = answer(REAL_NINE);
    const wheat = await call(ask({ profile: { allergens: ['wheat'] } }));
    expect(names(wheat)).toEqual(['Greek yoghurt with berries and oats', 'Milk and berry protein smoothie', 'Rice pudding with stewed apple']);
    modelReply = answer(REAL_NINE);
    const pineapple = await call(ask({ profile: { allergens: ['pineapple'] } }));
    expect(names(pineapple)).not.toContain('Cottage cheese with pineapple and crackers');
    expect(pineapple.body.suggestions).toHaveLength(8);
  });

  it('leaves out meat for a vegetarian and egg for someone who eats none', async () => {
    modelReply = answer([idea('Chicken salad', 'Chicken and leaves.', { containsMeatOrFish: true }), idea('Veg omelette', 'Eggs and peppers.', { containsEgg: true }), idea('Chana masala', 'Chickpeas in tomato.')]);
    const vegetarian = await call(ask({ profile: { diet: 'vegetarian' } }));
    expect(names(vegetarian)).toEqual(['Veg omelette', 'Chana masala']);
    modelReply = answer([idea('Chicken salad', 'Chicken and leaves.', { containsMeatOrFish: true }), idea('Veg omelette', 'Eggs and peppers.', { containsEgg: true }), idea('Chana masala', 'Chickpeas in tomato.')]);
    const noEgg = await call(ask({ profile: { diet: 'vegetarian-no-egg' } }));
    expect(names(noEgg)).toEqual(['Chana masala']);
  });

  it('leaves out beef in India and pork in the UAE, by the dish’s words', async () => {
    const dishes = [idea('Beef stir-fry', 'Beef with peppers.'), idea('Pork and rice', 'Roast pork.'), idea('Chicken tikka', 'Grilled chicken.')];
    modelReply = answer(dishes);
    const india = await call(ask({ profile: { country: 'IN', diet: 'everything' } }));
    expect(names(india)).toEqual(['Pork and rice', 'Chicken tikka']);
    modelReply = answer(dishes);
    const uae = await call(ask({ profile: { country: 'AE', diet: 'everything' } }));
    expect(names(uae)).toEqual(['Beef stir-fry', 'Chicken tikka']);
  });

  it('never gives back a dish already shown today', async () => {
    modelReply = answer(REAL_NINE);
    const res = await call(ask({ exclude: ['greek yoghurt with berries and oats'] }));
    expect(names(res)).not.toContain('Greek yoghurt with berries and oats');
    expect(res.body.suggestions).toHaveLength(8);
  });

  it('says so, and doesn’t count the set, when nothing is safe', async () => {
    modelReply = answer([idea('Tahini noodles', 'Noodles in a tahini sauce.'), idea('Hummus wrap', 'Hummus in a wrap.')]);
    const res = await call(ask({ profile: { allergens: ['sesame'] } }));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Couldn’t make meal ideas/);
    expect(redisIncr).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });
});
