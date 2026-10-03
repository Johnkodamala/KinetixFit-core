// api/scan-meal.js end to end, with Redis, the scan quota, rewards and the audit log mocked, and every outside call
// (Anthropic, USDA) answered from fixtures. The single-food snapshots are the contract the app relies on: a change to
// them has to be a deliberate fix. (This folder starts with "_", so Vercel doesn't deploy it as an endpoint.)
//
// fixtures/usda/*.json: USDA "foods/search" answers for each query, built from the SR Legacy (2018) and FNDDS
// (2024-10-31) CSV downloads; the few branded entries are marked with a _note (values seen on the live API, or synthetic).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEAL_SCHEMA } from '../_lib/identify.js';
import { FOOD_TABLE } from '../_lib/foodTable.js';
import { isPlausible } from '../../src/lib/foodLog.ts';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'usda');
const USDA = Object.fromEntries(readdirSync(FIXTURE_DIR).map(file => {
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8'));
  return [fixture.query, fixture];
}));

// --- mocks -------------------------------------------------------------------------------------------------------
const store = new Map();
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async key => store.get(key) ?? null,
      set: async (key, value) => { store.set(key, value); return 'OK'; },
      incr: async key => { const v = Number(store.get(key) ?? 0) + 1; store.set(key, v); return v; },
      expire: async () => 1,
    }),
  },
}));

const quota = { allowed: true, plus: false, limit: 2, used: 0 };
vi.mock('../_lib/scanQuota.js', () => ({
  checkScanQuota: vi.fn(async (_user, timeZone) => ({ ...quota, timeZone })),
  recordScan: vi.fn(async (_user, q) => Math.max(0, q.limit - q.used - 1)),
  quotaExceededBody: vi.fn(q => ({ error: 'Daily scan limit reached', code: 'SCAN_LIMIT', limit: q.limit })),
}));
vi.mock('../_lib/rewardConfig.js', () => ({ getRewardConfig: vi.fn(async () => ({ mealScanPointsAward: 2 })) }));
vi.mock('../_lib/auditLog.js', () => ({ logAuditEvent: vi.fn(async () => {}) }));
// A verified session (null = none, as older builds) and a points_ledger whose key is (user, day, award id).
let mockUserId = null;
let mockUserEmail = null; // the verified session's email (null: a session that names none, like an older build's missing one)
vi.mock('../_lib/supabaseAuth.js', () => ({
  verifiedUserId: async () => mockUserId,
  verifiedUser: async () => (mockUserId ? { id: mockUserId, email: mockUserEmail } : null),
}));
const ledger = [];
let failLedger = false;
vi.mock('../_lib/supabaseAdmin.js', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: async row => {
        if (failLedger) return { error: { code: '50000', message: 'down' } };
        if (ledger.some(r => r.user_id === row.user_id && r.day === row.day && r.award_id === row.award_id)) return { error: { code: '23505', message: 'duplicate key' } };
        ledger.push(row);
        return { error: null };
      },
    }),
  }),
}));
const { recordScan } = await import('../_lib/scanQuota.js');
// the per-scan usage line: kept out of the test output, read by the test that checks it
const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

// Outside calls: Anthropic answers with `claude.reply`; USDA from the fixtures (unknown queries find nothing).
const claude = { reply: null, requests: [] };
const usdaQueries = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function fakeFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const bodyText = init.body ?? (typeof input === 'string' ? undefined : await input.text());
  if (url.startsWith('https://api.anthropic.com/')) {
    const body = JSON.parse(bodyText);
    claude.requests.push(body);
    return json(claude.reply(body));
  }
  if (url.startsWith('https://api.nal.usda.gov/fdc/v1/foods/search')) {
    const { query, dataType } = JSON.parse(bodyText);
    const branded = dataType.includes('Branded');
    usdaQueries.push({ query, branded });
    const fixture = USDA[query];
    return json({ foods: fixture ? (branded ? fixture.branded : fixture.generic) : [] });
  }
  throw new Error(`unexpected fetch: ${url}`);
}

/**
 * A Messages API reply whose text is `text`, optionally after a thinking block (as Sonnet 5 sends when it thinks) or
 * split over two text blocks.
 */
function claudeReply(text, { thinkingFirst = false, split = false, stopReason = 'end_turn' } = {}) {
  const half = Math.floor(text.length / 2);
  const content = split ? [{ type: 'text', text: text.slice(0, half) }, { type: 'text', text: text.slice(half) }] : [{ type: 'text', text }];
  if (thinkingFirst) content.unshift({ type: 'thinking', thinking: '', signature: 'sig' });
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content,
    stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 40 },
  };
}

/** One food in the model's answer for a photo (the schema in api/_lib/identify.js). */
const seen = (name, extra = {}) => ({
  name, form: 'raw', amount: 100, unit: 'g', count: null, piece: null, confidence: 'high', amountConfidence: 'medium',
  alternatives: [], typicalPer100g: { kcal: 100, protein: 3, carbs: 15, fat: 3, fiber: 1 }, packaged: false, ...extra,
});
/** The model's answer for a photo of these foods, as text. */
const mealAnswer = (items, { kind = 'meal', mealName = items.map(i => i.name).join(' and ') } = {}) => JSON.stringify({ kind, mealName, items });
/** The top-level fields older apps read: everything but the new `items` and `mealName`. */
const legacy = ({ items, mealName, ...fields }) => fields;
const APPLE_SLICES = mealAnswer([seen('apple', { amount: 150, count: 2, piece: 'slice', typicalPer100g: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 } })], { mealName: 'Apple slices' });

let handler;
beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.USDA_FDC_API_KEY = 'test-key';
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  ({ default: handler } = await import('../scan-meal.js'));
});

beforeEach(() => {
  vi.clearAllMocks(); // call history only; the fakes keep working
  store.clear();
  Object.assign(quota, { allowed: true, plus: false, limit: 2, used: 0 });
  mockUserId = null; mockUserEmail = null; ledger.length = 0; failLedger = false;
  delete process.env.REQUIRE_SESSION;
  claude.reply = null;
  claude.requests.length = 0;
  usdaQueries.length = 0;
});

async function call(body, { method = 'POST', headers = {} } = {}) {
  const res = {
    statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {},
    end() { return this; },
  };
  await handler({ method, headers, body }, res);
  return res;
}
const typed = (foodText, extra = {}) => call({ foodText, ...extra });
const photo = (extra = {}) => call({ image: 'aGVsbG8=', mimeType: 'image/jpeg', appUserId: 'user@example.com', timeZone: 'Europe/London', ...extra });

// ------------------------------------------------------------------------------------------------------------------
describe('single foods: the contract the app relies on', () => {
  it('typed banana', async () => {
    const res = await typed('banana');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchInlineSnapshot(`
      {
        "calories": 89,
        "estimated": true,
        "estimatedPortionGrams": 100,
        "foodName": "banana",
        "macros": {
          "carbs": 23,
          "fat": 0,
          "fiber": 3,
          "protein": 1,
        },
        "matchedFood": "Bananas, raw",
        "micros": {
          "calcium": "5mg",
          "iron": "0.3mg",
          "potassium": "358mg",
          "sodium": "1mg",
        },
        "per100g": {
          "calciumMg": 5,
          "carbs": 22.84,
          "fat": 0.33,
          "fiber": 2.6,
          "ironMg": 0.26,
          "kcal": 89,
          "potassiumMg": 358,
          "protein": 1.09,
          "satFat": 0.11,
          "sodiumMg": 1,
          "sugars": 12.23,
        },
        "pointsAwarded": 0,
        "source": "USDA FoodData Central",
      }
    `);
  });

  it('typed rice', async () => {
    const res = await typed('rice');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchInlineSnapshot(`
      {
        "calories": 130,
        "estimated": true,
        "estimatedPortionGrams": 100,
        "foodName": "rice",
        "macros": {
          "carbs": 28,
          "fat": 0,
          "fiber": 0,
          "protein": 3,
        },
        "matchedFood": "Rice, white, long-grain, regular, enriched, cooked",
        "micros": {
          "calcium": "10mg",
          "iron": "1.2mg",
          "potassium": "35mg",
          "sodium": "1mg",
        },
        "per100g": {
          "calciumMg": 10,
          "carbs": 28.17,
          "fat": 0.28,
          "fiber": 0.4,
          "ironMg": 1.2,
          "kcal": 130,
          "potassiumMg": 35,
          "protein": 2.69,
          "satFat": 0.08,
          "sodiumMg": 1,
          "sugars": 0.05,
        },
        "pointsAwarded": 0,
        "source": "USDA FoodData Central",
      }
    `);
  });

  it('typed paneer', async () => {
    const res = await typed('paneer');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchInlineSnapshot(`
      {
        "calories": 299,
        "estimated": true,
        "estimatedPortionGrams": 100,
        "foodName": "paneer",
        "macros": {
          "carbs": 22,
          "fat": 16,
          "fiber": 0,
          "protein": 16,
        },
        "matchedFood": "Cheese, paneer",
        "micros": {
          "calcium": "597mg",
          "iron": "0.0mg",
          "potassium": "728mg",
          "sodium": "185mg",
        },
        "per100g": {
          "calciumMg": 597,
          "carbs": 22.46,
          "fat": 15.52,
          "fiber": 0,
          "ironMg": 0,
          "kcal": 299,
          "potassiumMg": 728,
          "protein": 15.86,
          "satFat": 9.02,
          "sodiumMg": 185,
          "sugars": 23.33,
        },
        "pointsAwarded": 0,
        "source": "USDA FoodData Central",
      }
    `);
  });

  // The same fields, unchanged, now that a photo can hold several foods (the new `items` and `mealName` come on top).
  it('photo of 2 apple slices: count, unit, scans left and the first-scan points', async () => {
    claude.reply = () => claudeReply(APPLE_SLICES);
    const res = await photo();
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.mealName).toBe('Apple slices');
    expect(legacy(res.body)).toMatchInlineSnapshot(`
      {
        "calories": 78,
        "count": 2,
        "estimated": true,
        "estimatedPortionGrams": 150,
        "foodName": "apple",
        "macros": {
          "carbs": 21,
          "fat": 0,
          "fiber": 4,
          "protein": 0,
        },
        "matchedFood": "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
        "micros": {
          "calcium": "9mg",
          "iron": "0.2mg",
          "potassium": "161mg",
          "sodium": "2mg",
        },
        "per100g": {
          "calciumMg": 6,
          "carbs": 13.81,
          "fat": 0.17,
          "fiber": 2.4,
          "ironMg": 0.12,
          "kcal": 52,
          "potassiumMg": 107,
          "protein": 0.26,
          "satFat": 0.03,
          "sodiumMg": 1,
          "sugars": 10.39,
        },
        "plus": false,
        "pointsAwarded": 2,
        "scanLimit": 2,
        "scansLeft": 1,
        "source": "USDA FoodData Central",
        "unit": "slice",
      }
    `);
  });

  it('the photo note reaches the prompt', async () => {
    claude.reply = () => claudeReply(APPLE_SLICES);
    await photo({ note: 'unsweetened, 2 tsp sugar' });
    const prompt = JSON.stringify(claude.requests[0].messages);
    expect(prompt).toContain('unsweetened, 2 tsp sugar');
  });

  it('points only for the first check of the day', async () => {
    expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(2);
    expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(0);
  });

  describe('the points ledger', () => {
    const today = new Date().toISOString().slice(0, 10);

    it('records the first check of the day as a ledger row when the session is verified', async () => {
      mockUserId = 'user-1';
      expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(2);
      expect(ledger).toEqual([{ user_id: 'user-1', day: today, award_id: 'meal_scan', points: 2, xp: 0 }]);
      await typed('banana', { appUserId: 'user@example.com' });
      expect(ledger).toHaveLength(1);
    });

    it('gives nothing when the ledger already has today’s bonus, even if Redis forgot it', async () => {
      mockUserId = 'user-1';
      ledger.push({ user_id: 'user-1', day: today, award_id: 'meal_scan', points: 2, xp: 0 });
      expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(0);
      expect(ledger).toHaveLength(1);
    });

    it('still gives the points (Redis dedup) when the ledger write fails', async () => {
      mockUserId = 'user-1';
      failLedger = true;
      expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(2);
      expect(ledger).toHaveLength(0);
    });

    it('writes no ledger row without a verified session (older builds), and the points work as before', async () => {
      expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(2);
      expect(ledger).toHaveLength(0);
    });
  });

  // "Your first food check of the day" is the phone's day when it sends its time zone (the same day the quests are filed
  // under, api/complete-quest.js), the UTC date when it doesn't. 00:30 on 4 Oct in India is still 3 Oct in UTC.
  describe('which day the first check belongs to', () => {
    const EVENING_IN_INDIA = new Date('2026-10-03T16:30:00Z'); // 22:00 on 3 Oct
    const NIGHT_IN_INDIA = new Date('2026-10-03T19:00:00Z'); //   00:30 on 4 Oct
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); mockUserId = 'user-1'; });
    afterEach(() => { vi.useRealTimers(); });

    it('is the UTC day when the request sends no time zone (builds from before)', async () => {
      vi.setSystemTime(EVENING_IN_INDIA);
      expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(2);
      vi.setSystemTime(NIGHT_IN_INDIA);
      expect((await typed('banana', { appUserId: 'user@example.com' })).body.pointsAwarded).toBe(0);
      expect(ledger.map(row => row.day)).toEqual(['2026-10-03']);
    });

    it("is the phone's own day when it sends its time zone: the first check after midnight earns again, once", async () => {
      const india = { appUserId: 'user@example.com', timeZone: 'Asia/Kolkata' };
      vi.setSystemTime(EVENING_IN_INDIA);
      expect((await typed('banana', india)).body.pointsAwarded).toBe(2);
      vi.setSystemTime(NIGHT_IN_INDIA);
      expect((await typed('banana', india)).body.pointsAwarded).toBe(2);
      expect((await typed('banana', india)).body.pointsAwarded).toBe(0);
      expect(ledger.map(row => row.day)).toEqual(['2026-10-03', '2026-10-04']);
    });
  });
});

// Lookups that used to go wrong, and what they give now: watermelon slice used to be a candy (207 kcal), curd soybean
// curd cheese (12.5 g protein), milk buttermilk, chai a soy chai. Muesli has no generic USDA entry, so it's branded.
const summary = res => ({
  status: res.statusCode, error: res.body.error, matchedFood: res.body.matchedFood,
  kcalPer100g: res.body.per100g?.kcal, proteinPer100g: res.body.per100g?.protein,
});
describe('reading Claude\'s answer', () => {
  const APPLE = APPLE_SLICES;

  it('asks once for a short structured answer: thinking off, effort low, the meal schema', async () => {
    claude.reply = () => claudeReply(APPLE);
    await photo();
    expect(claude.requests).toHaveLength(1);
    const request = claude.requests[0];
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.max_tokens).toBe(1200);
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.output_config.effort).toBe('low');
    expect(request.output_config.format).toEqual({ type: 'json_schema', schema: MEAL_SCHEMA });
  });

  // It used to read only the first block, so a thinking block first turned a good scan into a 500.
  it('a thinking block before the answer changes nothing', async () => {
    claude.reply = () => claudeReply(APPLE);
    const plain = await photo();
    store.clear();
    claude.reply = () => claudeReply(APPLE, { thinkingFirst: true });
    const withThinking = await photo();
    expect(withThinking.statusCode).toBe(200);
    expect(withThinking.body).toEqual(plain.body);
  });

  it('an answer split over two text blocks is read whole', async () => {
    claude.reply = () => claudeReply(APPLE);
    const plain = await photo();
    store.clear();
    claude.reply = () => claudeReply(APPLE, { split: true });
    const split = await photo();
    expect(split.statusCode).toBe(200);
    expect(split.body).toEqual(plain.body);
  });

  it('a cut-off answer is a clear 502 and isn\'t counted', async () => {
    claude.reply = () => claudeReply('{"kind": "meal", "mealName": "Apple sli', { stopReason: 'max_tokens' });
    const res = await photo();
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'The scan was cut off. Please try again.' });
    expect(recordScan).not.toHaveBeenCalled();
  });

  it('a declined photo is a 422 and isn\'t counted', async () => {
    claude.reply = () => claudeReply('', { stopReason: 'refusal' });
    const res = await photo();
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: 'Couldn’t read this photo. Try another one, or type what it is.' });
    expect(recordScan).not.toHaveBeenCalled();
  });

  it('logs the tokens each scan used', async () => {
    claude.reply = () => claudeReply(APPLE);
    await photo();
    const line = consoleLog.mock.calls.find(args => args[0] === 'scan-meal usage');
    expect(JSON.parse(line[1])).toMatchObject({ model: 'claude-sonnet-5', input: 1200, output: 40, stop: 'end_turn' });
  });
});

describe('lookups that used to go wrong', () => {
  it('typed watermelon slice', async () => {
    expect(summary(await typed('watermelon slice'))).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "kcalPer100g": 30,
        "matchedFood": "Watermelon, raw",
        "proteinPer100g": 0.61,
        "status": 200,
      }
    `);
  });

  it('typed curd', async () => {
    expect(summary(await typed('curd'))).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "kcalPer100g": 61,
        "matchedFood": "Yogurt, plain, whole milk",
        "proteinPer100g": 3.47,
        "status": 200,
      }
    `);
  });

  it('typed milk', async () => {
    expect(summary(await typed('milk'))).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "kcalPer100g": 61,
        "matchedFood": "Milk, whole, 3.25% milkfat, with added vitamin D",
        "proteinPer100g": 3.15,
        "status": 200,
      }
    `);
  });

  it('typed muesli (no generic entry at all)', async () => {
    expect(summary(await typed('muesli'))).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "kcalPer100g": 392,
        "matchedFood": "MUESLI",
        "proteinPer100g": 9.6,
        "status": 200,
      }
    `);
  });

  it('typed chai', async () => {
    expect(summary(await typed('chai'))).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "kcalPer100g": 51,
        "matchedFood": "Tea, hot, with milk",
        "proteinPer100g": 1.58,
        "status": 200,
      }
    `);
  });
});

describe('liquids', () => {
  it('a drink says so, with its density; its numbers stay per 100 g', async () => {
    const res = await typed('milk');
    expect(res.body).toMatchObject({ drink: true, density: 1.031, densityAssumed: false, estimatedPortionGrams: 100 });
    expect(res.body.per100g.kcal).toBe(61);
  });

  it('a branded drink sold by the ml is turned into per 100 g', async () => {
    const res = await typed('mango lassi');
    // 90 kcal per 100 ml, 1.03 g per ml
    expect(res.body.per100g.kcal).toBeCloseTo(87.38, 2);
    expect(res.body).toMatchObject({ drink: true, density: 1.03, densityAssumed: false });
  });

  it('solid foods get no liquid fields', async () => {
    const res = await typed('banana');
    expect(res.body).not.toHaveProperty('drink');
    expect(res.body).not.toHaveProperty('density');
  });
});

// --- step 4b: several foods in one photo ------------------------------------------------------------------------
const table = name => FOOD_TABLE.find(f => f.name === name).per100g;
const MUESLI = seen('muesli', { form: 'dry', amount: 50, typicalPer100g: { kcal: 370, protein: 10, carbs: 62, fat: 7, fiber: 8 } });
const MILK = seen('milk', { form: 'drink', amount: 200, unit: 'ml', typicalPer100g: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 } });
const BANANA = seen('banana', { amount: 80, count: 6, piece: 'slice', typicalPer100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 } });
const MUESLI_BOWL = mealAnswer([MUESLI, MILK, BANANA], { mealName: 'Muesli with milk and banana' });

describe('several foods in one photo', () => {
  it('looks each food up on its own, with its own amount', async () => {
    claude.reply = () => claudeReply(MUESLI_BOWL);
    const res = await photo();
    expect(res.statusCode).toBe(200);
    expect(res.body.mealName).toBe('Muesli with milk and banana');
    expect(res.body.items.map(i => [i.name, i.amount, i.unit, i.grams, i.matchedFood, i.source])).toEqual([
      ['muesli', 50, 'g', 50, 'MUESLI', 'USDA FoodData Central'],
      // 200 ml of milk weighs 206.2 g (1.031 g per ml, from USDA's "1 cup = 244 g")
      ['milk', 200, 'ml', 206.2, 'Milk, whole, 3.25% milkfat, with added vitamin D', 'USDA FoodData Central'],
      ['banana', 80, 'g', 80, 'Bananas, raw', 'USDA FoodData Central'],
    ]);
    // milk's own numbers are per 100 ml: 61 kcal per 100 g × 1.031
    expect(res.body.items[1]).toMatchObject({ density: 1.031, densityAssumed: false, per100: { kcal: 62.89 } });
    expect(res.body.items[2]).toMatchObject({ count: 6, piece: 'slice', needsReview: false });
    expect(recordScan).toHaveBeenCalledTimes(1);
  });

  it('adds the meal up from each food\'s unrounded numbers, rounding once, and its per 100 g gives back the totals', async () => {
    claude.reply = () => claudeReply(MUESLI_BOWL);
    const { body } = await photo();
    const grams = 50 + 200 * 1.031 + 80;
    const kcal = (50 * 392) / 100 + (200 * 1.031 * table('Milk, whole').kcal) / 100 + (80 * table('Banana').kcal) / 100;
    const protein = (50 * 9.6) / 100 + (200 * 1.031 * table('Milk, whole').protein) / 100 + (80 * table('Banana').protein) / 100;
    expect(body.calories).toBe(Math.round(kcal)); // 393: 196 + 125.8 + 71.2
    expect(body.macros.protein).toBe(Math.round(protein));
    expect(body.estimatedPortionGrams).toBe(Math.round(grams));
    // per 100 g of the whole meal × its weight = the totals (to the 2 decimals per100g is given in)
    expect(Math.abs((body.per100g.kcal * grams) / 100 - kcal)).toBeLessThan((0.005 * grams) / 100 + 1e-9);
    expect(Math.abs((body.per100g.protein * grams) / 100 - protein)).toBeLessThan((0.005 * grams) / 100 + 1e-9);
  });

  it('rounds only the meal\'s totals: three 20 g pieces of apple are 31 kcal, not 3 × 10', async () => {
    const piece = seen('apple', { amount: 20, typicalPer100g: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 } });
    claude.reply = () => claudeReply(mealAnswer([piece, piece, piece]));
    const { body } = await photo();
    // 60 g × 52 kcal per 100 g = 31.2
    expect(body.calories).toBe(31);
  });

  it('gives older apps one food for the whole meal, with numbers that can be right', async () => {
    claude.reply = () => claudeReply(MUESLI_BOWL);
    const { body } = await photo();
    expect(body).toMatchObject({ foodName: 'Muesli with milk and banana', count: 1, unit: 'serving',
      matchedFood: 'MUESLI + Milk, whole, 3.25% milkfat, with added vitamin D + Bananas, raw' });
    expect(isPlausible({ satFat: 0, sugars: 0, sodiumMg: 0, potassiumMg: 0, ironMg: 0, calciumMg: 0, ...body.per100g })).toBe(true);
    // a mineral one food lacks (the muesli's label gave only the main four) isn't passed off as known for the meal
    expect(body.per100g.calciumMg).toBeNull();
  });

  it('the person\'s own amounts replace the photo\'s', async () => {
    claude.reply = () => claudeReply(MUESLI_BOWL);
    const { body } = await photo({ note: '40 g muesli, 150 ml milk' });
    expect(body.items.map(i => [i.name, i.amount, i.amountSource, i.amountConfidence])).toEqual([
      ['muesli', 40, 'note', 'high'], ['milk', 150, 'note', 'high'], ['banana', 80, 'photo', 'medium'],
    ]);
    expect(body.estimatedPortionGrams).toBe(Math.round(40 + 150 * 1.031 + 80));
  });
});

describe('the right form, and the numbers from the database', () => {
  it('oats seen cooked are porridge, not dry oats', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('oats', { form: 'cooked', amount: 250, typicalPer100g: { kcal: 70, protein: 2.5, carbs: 12, fat: 1.5, fiber: 1.7 } })]));
    const { body } = await photo();
    // the table's oats are dry (389 kcal), far from what a bowl of porridge is: the cooked form is looked for first
    expect(usdaQueries[0]).toEqual({ query: 'oats cooked', branded: false });
    expect(body.matchedFood).toBe('Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt');
    expect(body.per100g.kcal).toBeLessThan(80);
  });

  it('oats seen dry are the table\'s dry oats, without asking USDA', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('oats', { form: 'dry', amount: 40, typicalPer100g: { kcal: 380, protein: 13, carbs: 67, fat: 7, fiber: 10 } })]));
    const { body } = await photo();
    expect(body.matchedFood).toBe('Cereals, oats, regular and quick, not fortified, dry');
    expect(usdaQueries).toHaveLength(0);
  });

  it('the model\'s typical numbers are only a guard: a close database food is used as it is', async () => {
    // the model thinks rice is 180 kcal per 100 g; the table's cooked rice (130) is close enough to be the rice seen
    claude.reply = () => claudeReply(mealAnswer([seen('rice', { form: 'cooked', amount: 200, typicalPer100g: { kcal: 180, protein: 4, carbs: 38, fat: 1, fiber: 1 } })]));
    const { body } = await photo();
    expect(body.matchedFood).toBe('Rice, white, long-grain, regular, enriched, cooked');
    expect(body.per100g.kcal).toBe(table('Rice, white, cooked').kcal);
  });

  it('with no database food that fits, the model\'s numbers are used — labelled as an AI estimate', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('poha', { form: 'cooked', amount: 150, typicalPer100g: { kcal: 130, protein: 2.5, carbs: 25, fat: 3, fiber: 1 } })]));
    const { body } = await photo();
    expect(body).toMatchObject({ source: 'AI estimate', matchedFood: 'poha (AI estimate, no database match)', calories: Math.round(1.5 * 130) });
    // only what the model gave: the rest is not known, rather than 0
    expect(body.per100g.sodiumMg).toBeNull();
    expect(body.items[0]).toMatchObject({ source: 'AI estimate', matchConfidence: 'estimate', matchedFood: null });
  });
});

describe('liquids in a photo', () => {
  it('a glass of milk: ml in its own entry, grams (ml × density) in the fields older apps read', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('milk', { form: 'drink', amount: 250, unit: 'ml', typicalPer100g: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 } })]));
    const { body } = await photo();
    // 250 ml × 1.031 g per ml = 257.75 g
    expect(body).toMatchObject({ estimatedPortionGrams: 258, calories: Math.round(2.5775 * 61), drink: true, density: 1.031 });
    expect(body.per100g.kcal).toBe(61);
    expect(body.items[0]).toMatchObject({ amount: 250, unit: 'ml', grams: 257.8, per100: { kcal: 62.89 } });
  });

  it('a branded drink sold by the ml: ml × its per-100 ml numbers, with no density guesswork in the total', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('mango lassi', { form: 'drink', amount: 300, unit: 'ml', packaged: true, typicalPer100g: { kcal: 87, protein: 2.7, carbs: 14.6, fat: 2.1, fiber: 0 } })]));
    const { body } = await photo();
    // 300 ml at 90 kcal per 100 ml = 270
    expect(body.calories).toBe(270);
    expect(body.items[0]).toMatchObject({ per100: { kcal: 90 }, density: 1.03 });
  });
});

describe('photos that give nothing to log', () => {
  it.each([
    ['not_food', 'Couldn’t see any food in this photo. Try again, or type what you ate.'],
    ['unclear', 'The photo is too dark or blurred to tell. Try again in better light, or type what you ate.'],
  ])('%s: a 422 with what to do, not counted', async (kind, message) => {
    claude.reply = () => claudeReply(mealAnswer([], { kind, mealName: '' }));
    const res = await photo();
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: message });
    expect(recordScan).not.toHaveBeenCalled();
    expect(usdaQueries).toHaveLength(0);
  });

  it('a food with no amount the photo could show: asked about, not guessed — and alone, not counted', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('dal', { form: 'cooked', amount: 0, amountConfidence: 'high' })]));
    const res = await photo();
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('Couldn’t tell how much is in this photo. Try again, or type what you ate.');
    expect(recordScan).not.toHaveBeenCalled();
  });
});

describe('uncertainty stays visible', () => {
  it('a guessed amount stays a guess: coarsely rounded, low confidence', async () => {
    claude.reply = () => claudeReply(mealAnswer([seen('chicken curry', { form: 'prepared', amount: 180, amountConfidence: 'low' })]));
    const { body } = await photo();
    expect(body.items[0]).toMatchObject({ amount: 175, amountConfidence: 'low', amountSource: 'photo' });
  });

  it('a food the model isn\'t sure about is marked for review, with what else it could be', async () => {
    claude.reply = () => claudeReply(mealAnswer([BANANA, seen('papaya', { amount: 120, confidence: 'low', alternatives: ['mango', 'melon'], typicalPer100g: { kcal: 43, protein: 0.5, carbs: 11, fat: 0.3, fiber: 1.7 } })]));
    const { body } = await photo();
    expect(body.items[1]).toMatchObject({ name: 'papaya', needsReview: true, alternatives: ['mango', 'melon'] });
    expect(body.items[0].needsReview).toBe(false);
  });

  it('a food with no amount is left out of the totals and marked for review', async () => {
    claude.reply = () => claudeReply(mealAnswer([BANANA, seen('dal', { form: 'cooked', amount: 0 })]));
    const { body } = await photo();
    expect(body.items[1]).toMatchObject({ name: 'dal', amount: null, grams: null, needsReview: true });
    // the banana alone
    expect(body).toMatchObject({ foodName: 'banana', calories: Math.round(0.8 * table('Banana').kcal) });
  });
});

describe('errors keep their status codes and messages', () => {
  it('400 without a photo or a food', async () => {
    const res = await call({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Provide either "image" (base64) or "foodText".' });
  });

  it('401 for a photo without a signed-in user', async () => {
    const res = await call({ image: 'aGVsbG8=' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in to scan a photo.' });
  });

  it('429 when the day\'s scans are used up, without calling Claude', async () => {
    quota.allowed = false;
    const res = await photo();
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'Daily scan limit reached', code: 'SCAN_LIMIT', limit: 2 });
    expect(claude.requests).toHaveLength(0);
  });

  it('404 when nothing matches', async () => {
    const res = await typed('muesli with milk');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Could not find nutrition data for "muesli with milk". Please try a more specific description.' });
  });

  it('405 for anything but POST', async () => {
    const res = await call(undefined, { method: 'GET' });
    expect(res.statusCode).toBe(405);
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('who is calling', () => {
  it('refuses a body that names another account than the signed-in one, and spends nothing of theirs', async () => {
    mockUserId = 'u-me'; mockUserEmail = 'me@example.com';
    claude.reply = () => claudeReply(APPLE_SLICES);
    const res = await photo({ appUserId: 'victim@example.com' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'WRONG_ACCOUNT' });
    expect(recordScan).not.toHaveBeenCalled();
    expect(claude.requests).toHaveLength(0); // no model call was paid for
    expect([...store.keys()].filter(k => k.includes('victim'))).toEqual([]);
  });

  it('refuses it for a typed check too', async () => {
    mockUserId = 'u-me'; mockUserEmail = 'me@example.com';
    const res = await typed('banana', { appUserId: 'victim@example.com' });
    expect(res.statusCode).toBe(403);
  });

  it('lets the signed-in account scan, whatever case its email was typed in', async () => {
    mockUserId = 'u-me'; mockUserEmail = 'user@example.com';
    claude.reply = () => claudeReply(APPLE_SLICES);
    const res = await photo({ appUserId: 'User@Example.com' });
    expect(res.statusCode).toBe(200);
    expect(recordScan).toHaveBeenCalledWith('User@Example.com', expect.anything()); // the body's spelling: that is what Redis and RevenueCat know
  });

  it('keeps an older build with no session working', async () => {
    claude.reply = () => claudeReply(APPLE_SLICES);
    expect((await photo()).statusCode).toBe(200);
  });

  it('with REQUIRE_SESSION=1, a photo scan needs the session, and a typed check still does not', async () => {
    process.env.REQUIRE_SESSION = '1';
    claude.reply = () => claudeReply(APPLE_SLICES);
    const res = await photo();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(claude.requests).toHaveLength(0);
    expect((await typed('banana')).statusCode).toBe(200);
  });
});
