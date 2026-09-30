// Today's food log and the person's own food list — both on the phone (localStorage), so changing how much was
// eaten, removing an entry, logging a food again or re-scanning a barcode never calls the server (or spends a scan).
//
// - A SavedFood keeps a food's nutrition per 100 g plus the portion units whose weight is known ("slice" = 36 g),
//   keyed by barcode or by name. It's filled from real scan results; nothing is invented.
// - A LogEntry is one thing eaten today: quantity × unit × how much of it was eaten. It keeps its own copy of
//   the per-100 g numbers, so editing or deleting it never depends on the food list.
import { localDayKey } from './dates';
import { FOOD_TABLE, type TableFood } from './foodTable';
import type { DietCheck } from './diet';
import { readJson, writeJson } from './storage';
import { noteKeyedChange } from './sync';

export interface Nutrients {
  kcal: number; carbs: number; protein: number; fat: number; fiber: number;
  satFat: number; sugars: number;
  sodiumMg: number; potassiumMg: number; ironMg: number; calciumMg: number;
}
export type NutrientKey = keyof Nutrients;
/** Always known for a logged food. The rest are often missing from labels and databases (see LogEntry.missing). */
export const CORE_NUTRIENTS: NutrientKey[] = ['kcal', 'carbs', 'protein', 'fat', 'fiber'];
export const EXTRA_NUTRIENTS: NutrientKey[] = ['satFat', 'sugars', 'sodiumMg', 'potassiumMg', 'ironMg', 'calciumMg'];

/** A portion whose weight is known, e.g. { label: 'slice', grams: 36 }. Grams are always available as well. */
export interface FoodUnit { label: string; grams: number; /** a typical weight, not read off the pack */ estimated?: boolean; }

export type FoodSource = 'barcode' | 'photo' | 'search' | 'idea' | 'earlier';

export interface SavedFood {
  key: string;
  name: string;
  per100g: Nutrients;
  units: FoodUnit[];
  /** false for meal ideas and older log totals: only "serving" makes sense, not grams */
  gramsKnown: boolean;
  estimated: boolean;
  source: FoodSource;
  /** nutrients the label or database didn't give (counted as 0, and shown as "from N of M foods") */
  missing?: NutrientKey[];
  /** a drink: amounts in ml (labels give drinks per 100 ml, and 1 ml is counted as 1 g) */
  liquid?: boolean;
  allergens?: string[];
  /** meat, fish or egg in it (src/lib/diet.ts), worked out when it was first checked */
  diet?: DietCheck;
  /** grams in one ml, when known: turns a typed "200 ml" into grams for a food kept by weight */
  density?: number;
  lastQty: number;
  lastUnit: string;
  uses: number;
  lastUsed: number;
}

export interface LogEntry {
  id: string;
  foodKey: string;
  name: string;
  qty: number;
  /** 'g' or one of the food's unit labels */
  unit: string;
  /** grams in one unit (1 for 'g') */
  unitGrams: number;
  /** how much of it was eaten, 0.25–1 */
  eaten: number;
  per100g: Nutrients;
  gramsKnown: boolean;
  estimated: boolean;
  missing?: NutrientKey[];
  liquid?: boolean;
  /** the person's own words: "unsweetened", "homemade, extra chilli" */
  note?: string;
  /** things added to it: 2 × sugar (tsp), 1 × salt (pinch) */
  extras?: { id: ExtraId; count: number }[];
  /** one of several foods from the same meal photo (each is its own entry, with its own amount) */
  meal?: { id: string; name: string };
  /** the photo couldn't show how much there was: the amount is a guess until the person changes it */
  amountGuess?: boolean;
  at: number;
}

// Things people add to a food, with the nutrition of one usual amount. Rounded from UK CoFID / USDA FoodData Central.
export type ExtraId = 'sugar' | 'honey' | 'salt' | 'butter' | 'ghee' | 'oil' | 'milk' | 'cheese' | 'mayo';
export interface Extra { id: ExtraId; label: string; amount: string; n: Partial<Nutrients>; }
export const EXTRAS: Extra[] = [
  { id: 'sugar', label: 'Sugar', amount: 'tsp', n: { kcal: 16, carbs: 4, sugars: 4 } },
  { id: 'salt', label: 'Salt', amount: 'pinch', n: { sodiumMg: 140 } },
  { id: 'honey', label: 'Honey', amount: 'tsp', n: { kcal: 21, carbs: 5.8, sugars: 5.7 } },
  { id: 'butter', label: 'Butter', amount: 'tsp', n: { kcal: 36, fat: 4.1, satFat: 2.6, sodiumMg: 30 } },
  { id: 'ghee', label: 'Ghee', amount: 'tsp', n: { kcal: 45, fat: 5, satFat: 3.1 } },
  { id: 'oil', label: 'Oil', amount: 'tsp', n: { kcal: 40, fat: 4.5, satFat: 0.6 } },
  { id: 'milk', label: 'Milk', amount: 'splash', n: { kcal: 19, carbs: 1.4, protein: 1, fat: 1.1, satFat: 0.7, sugars: 1.4, calciumMg: 36 } },
  { id: 'cheese', label: 'Cheese', amount: 'slice', n: { kcal: 83, protein: 5, fat: 7, satFat: 4.3, sodiumMg: 130, calciumMg: 145 } },
  { id: 'mayo', label: 'Mayo', amount: 'tbsp', n: { kcal: 100, fat: 11, satFat: 1.7, sodiumMg: 90 } },
];
const EXTRA_BY_ID = Object.fromEntries(EXTRAS.map(e => [e.id, e])) as Record<ExtraId, Extra>;

// tsp and tbsp stay as they are; the others take a plural
const EXTRA_PLURAL: Record<string, string> = { tsp: 'tsp', tbsp: 'tbsp', pinch: 'pinches', splash: 'splashes', slice: 'slices' };

/** "2 tsp sugar", "a pinch of salt", "2 slices cheese" */
export function extraAmountText(extra: Extra, count: number): string {
  if (extra.amount === 'pinch' && count === 1) return `a pinch of ${extra.label.toLowerCase()}`;
  if (extra.amount === 'splash' && count === 1) return `a splash of ${extra.label.toLowerCase()}`;
  const unit = count === 1 ? extra.amount : EXTRA_PLURAL[extra.amount] ?? `${extra.amount}s`;
  return `${count} ${unit}${extra.amount === 'pinch' || extra.amount === 'splash' ? ' of' : ''} ${extra.label.toLowerCase()}`;
}

/** "2 tsp sugar, a pinch of salt" */
export function extrasText(e: Pick<LogEntry, 'extras'>): string {
  return (e.extras ?? []).filter(x => x.count > 0 && EXTRA_BY_ID[x.id]).map(x => extraAmountText(EXTRA_BY_ID[x.id], x.count)).join(', ');
}

const EXTRA_WORDS: Record<ExtraId, string> = {
  sugar: 'sugar', salt: 'salt', honey: 'honey', butter: 'butter', ghee: 'ghee', oil: 'oil', milk: 'milk', cheese: 'cheese', mayo: 'mayo(?:nnaise)?',
};
const NOTE_COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Add-ons the person's note spells out: "with 2 tsp sugar", "tea with milk and sugar", "a pinch of salt".
 * Only when the note says it was added (a count, or with / and / plus / added before it) — "almond milk" is the food
 * itself, not an add-on — and never when it's negated ("no sugar", "sugar-free", "less salt").
 */
export function extrasFromNote(note: string): { id: ExtraId; count: number }[] {
  const text = ` ${note.toLowerCase().replace(/[^a-z0-9+. -]/g, ' ')} `;
  const found: { id: ExtraId; count: number }[] = [];
  for (const extra of EXTRAS) {
    const re = new RegExp(`((?:\\S+\\s+){0,4})${EXTRA_WORDS[extra.id]}\\b(\\s*-?\\s*free)?`, 'g');
    for (const m of text.matchAll(re)) {
      const before = m[1].trim().split(/\s+/).filter(Boolean);
      if (m[2] || before.slice(-2).some(w => /^(no|without|less|zero|free|un\w*|low)$/.test(w))) continue;
      const qty = before.map((w, i) => ({ w, i })).reverse().find(({ w }) => /^\d+(\.\d+)?$/.test(w) || w in NOTE_COUNTS);
      const added = before.some(w => /^(with|and|plus|\+|added|add|extra)$/.test(w));
      if (!qty && !added) continue;
      let count = qty ? (NOTE_COUNTS[qty.w] ?? parseFloat(qty.w)) : 1;
      const unitWord = qty ? before[qty.i + 1] ?? '' : '';
      if (extra.amount === 'tsp' && /^(tbsp|tablespoons?)$/.test(unitWord)) count *= 3;
      count = Math.max(1, Math.min(20, Math.round(count)));
      found.push({ id: extra.id, count });
      break;
    }
  }
  return found;
}

/**
 * A meal photo's add-ons from its note, less those the photo has as foods of their own: "muesli with milk and 2 tsp
 * sugar" adds the sugar, but not a splash of milk when the milk is already its own entry.
 */
export function extrasFromNoteExcept(note: string, foodNames: string[]): { id: ExtraId; count: number }[] {
  return extrasFromNote(note).filter(x => !foodNames.some(name => new RegExp(`\\b${EXTRA_WORDS[x.id]}\\b`).test(name.toLowerCase())));
}

/** Adds one more (or one fewer, dir -1) of an add-on. */
export function withExtra(e: LogEntry, id: ExtraId, dir: 1 | -1 = 1): LogEntry {
  const list = [...(e.extras ?? [])];
  const i = list.findIndex(x => x.id === id);
  const count = Math.max(0, Math.min(20, (i >= 0 ? list[i].count : 0) + dir));
  if (i >= 0) list[i] = { id, count }; else if (count > 0) list.push({ id, count });
  return { ...e, extras: list.filter(x => x.count > 0) };
}

export const GRAMS = 'g';
/** a typed amount in millilitres ("200 ml milk") — only ever a TypedPortion unit; entries of drinks keep ml as GRAMS */
export const ML = 'ml';
export const EATEN_OPTIONS = [1, 0.75, 0.5, 0.25] as const;
export const EATEN_LABELS: Record<number, string> = { 1: 'All', 0.75: '¾', 0.5: '½', 0.25: '¼' };

const LOG_KEY = 'kx_food_log'; // today only (before food history); migrated into DAYS_KEY
const DAYS_KEY = 'kx_food_days';
/** how many days of food history the phone keeps */
export const HISTORY_DAYS = 90;
const FOODS_KEY = 'kx_foods';
const LEGACY_INTAKE_KEY = 'kinetix_today_intake';
const MAX_FOODS = 200;

export const ZERO: Nutrients = { kcal: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, satFat: 0, sugars: 0, sodiumMg: 0, potassiumMg: 0, ironMg: 0, calciumMg: 0 };
const NUTRIENT_KEYS = Object.keys(ZERO) as (keyof Nutrients)[];

const scaleNutrients = (n: Nutrients, factor: number): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map(k => [k, (n[k] || 0) * factor])) as unknown as Nutrients;

export const entryGrams = (e: Pick<LogEntry, 'qty' | 'unitGrams' | 'eaten'>) => e.qty * e.unitGrams * e.eaten;
export function entryNutrients(e: LogEntry): Nutrients {
  const n = scaleNutrients(e.per100g, entryGrams(e) / 100);
  // add-ons were in what was eaten too, so "ate half" halves them as well
  for (const x of e.extras ?? []) {
    const extra = EXTRA_BY_ID[x.id];
    if (!extra) continue;
    for (const [k, v] of Object.entries(extra.n) as [NutrientKey, number][]) n[k] += v * x.count * e.eaten;
  }
  return n;
}

/**
 * Whether per-100 g numbers are physically possible: no food has more than ~900 kcal or more than 100 g of
 * protein + carbs + fat in 100 g, and the calories must roughly match the macros (4/4/9 kcal per g). Catches lookups
 * that went wrong — the server once scaled a branded "BANANA" spread's per-100 g values as per 32 g serving and logged a
 * banana with 152 g carbs and 47 g protein.
 */
export function isPlausible(n: Nutrients): boolean {
  if (!(n.kcal >= 0) || n.kcal > 905) return false;
  if (n.protein + n.carbs + n.fat > 101) return false;
  if (n.fiber > n.carbs + 1 || n.sugars > n.carbs + 1 || n.satFat > n.fat + 0.5) return false;
  const fromMacros = 4 * n.protein + 4 * n.carbs + 9 * n.fat;
  return n.kcal < 40 || Math.abs(fromMacros - n.kcal) / n.kcal < 0.4;
}

/** Foods checked: the foods of one meal photo count once, like the one photo they came from. */
export const mealCount = (entries: Pick<LogEntry, 'id' | 'meal'>[]) => new Set(entries.map(e => e.meal?.id ?? e.id)).size;

/** How many of these entries actually had a value for the nutrient (the rest were missing from the label/database). */
export const knownCount = (entries: LogEntry[], key: NutrientKey) =>
  entries.filter(e => CORE_NUTRIENTS.includes(key) || (e.missing ? !e.missing.includes(key) : (e.per100g[key] ?? 0) > 0)).length;

export function sumNutrients(entries: LogEntry[]): Nutrients {
  const total = { ...ZERO };
  for (const e of entries) {
    const n = entryNutrients(e);
    for (const k of NUTRIENT_KEYS) total[k] += n[k];
  }
  return total;
}

// "slice" → "slices" for 2; units already plural or ending in s stay as they are.
const plural = (label: string, qty: number) => (qty === 1 || /s$/.test(label) ? label : `${label}s`);
const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(1).replace(/\.0$/, ''));

/** "2 slices · 72 g", "150 g", "1 bottle · 250 ml", "1 serving · ½ eaten" */
export function portionText(e: Pick<LogEntry, 'qty' | 'unit' | 'unitGrams' | 'eaten' | 'gramsKnown' | 'liquid'>): string {
  const eatenPart = e.eaten < 1 ? ` · ${EATEN_LABELS[e.eaten] ?? `${Math.round(e.eaten * 100)}%`} eaten` : '';
  const g = e.liquid ? 'ml' : 'g';
  if (e.unit === GRAMS) return `${fmtQty(e.qty)} ${g}${eatenPart}`;
  const grams = e.gramsKnown ? ` · ${Math.round(entryGrams(e))} ${g}` : '';
  return `${fmtQty(e.qty)} ${plural(e.unit, e.qty)}${eatenPart}${grams}`;
}

/** Food names arrive lowercase from the nutrition database ("greek yogurt"); show them with a capital. */
export const foodTitle = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ----------------------------------------------------------------------------------------------- */
/* Storage                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

export type FoodDays = Record<string, LogEntry[]>;

const earlierEntry = (v: { calories: number; carbs: number; protein: number; fiber: number }): LogEntry => ({
  id: newId(), foodKey: 'earlier', name: 'Earlier today', qty: 1, unit: 'serving', unitGrams: 100, eaten: 1,
  per100g: { ...ZERO, kcal: v.calories, carbs: v.carbs, protein: v.protein, fiber: v.fiber },
  gramsKnown: false, estimated: false, missing: EXTRA_NUTRIENTS, at: Date.now(),
});

// Days older than HISTORY_DAYS are dropped. Day keys are local YYYY-MM-DD, so they sort as strings.
function pruneDays(days: FoodDays, today = localDayKey()): FoodDays {
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - (HISTORY_DAYS - 1));
  const oldest = localDayKey(cutoff);
  return Object.fromEntries(Object.entries(days).filter(([day, entries]) => day >= oldest && entries.length > 0));
}

/** Every day's entries (local day → entries). Older formats — today's log alone, or just running totals — are moved in once. */
export function loadFoodDays(): FoodDays {
  const days: FoodDays = { ...(readJson<FoodDays>(DAYS_KEY) ?? {}) };
  const today = readJson<{ date: string; value: LogEntry[] }>(LOG_KEY);
  if (today?.date && Array.isArray(today.value) && today.value.length && !days[today.date]) days[today.date] = today.value;
  const legacy = readJson<{ date: string; value: { calories: number; carbs: number; protein: number; fiber: number } }>(LEGACY_INTAKE_KEY);
  if (legacy?.date && legacy.value?.calories > 0 && !days[legacy.date]) days[legacy.date] = [earlierEntry(legacy.value)];
  try { localStorage.removeItem(LOG_KEY); localStorage.removeItem(LEGACY_INTAKE_KEY); } catch { /* blocked storage */ }
  for (const day of Object.keys(days)) days[day] = days[day].map(repairEntry);
  return pruneDays(days);
}

// A removed entry moves here (id -> its day + when) instead of disappearing outright, so sync can
// propagate the delete rather than an offline device resurrecting it (foodLogSync.ts, sync.ts). The
// 90-day history cap in pruneDays is NOT a delete: it never touches this map, since the server keeps
// complete history indefinitely regardless of the local cache's cap.
const DELETED_ENTRIES_KEY = 'kx_food_log_deleted';
export function loadFoodEntryTombstones(): Record<string, { day: string; deletedAt: number }> {
  const saved = readJson<Record<string, { day: string; deletedAt: number }>>(DELETED_ENTRIES_KEY);
  return saved && typeof saved === 'object' ? saved : {};
}
function saveFoodEntryTombstones(map: Record<string, { day: string; deletedAt: number }>) {
  writeJson(DELETED_ENTRIES_KEY, map);
}
function flattenDays(days: FoodDays): Record<string, { day: string; entry: LogEntry }> {
  const flat: Record<string, { day: string; entry: LogEntry }> = {};
  for (const [day, entries] of Object.entries(days)) for (const entry of entries) flat[entry.id] = { day, entry };
  return flat;
}

// The oldest day still inside the history cap "today" — the same cutoff pruneDays uses. An id whose
// day falls before this is aging out of the local cache, not being deleted, so it's never tombstoned
// even if the caller's (already-pruned) `days` no longer has it while the raw stored copy still does.
function oldestKeptDay(today = localDayKey()): string {
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - (HISTORY_DAYS - 1));
  return localDayKey(cutoff);
}

export const saveFoodDays = (days: FoodDays) => {
  const prevFlat = flattenDays(readJson<FoodDays>(DAYS_KEY) ?? {});
  const nextFlat = flattenDays(days);
  const oldest = oldestKeptDay();
  const tombstones = loadFoodEntryTombstones();
  let tombstonesChanged = false;
  for (const [id, prev] of Object.entries(prevFlat)) {
    if (!(id in nextFlat) && prev.day >= oldest) {
      tombstones[id] = { day: prev.day, deletedAt: Date.now() };
      tombstonesChanged = true;
      noteKeyedChange('food_log_entries', id);
    }
  }
  for (const [id, next] of Object.entries(nextFlat)) {
    const prev = prevFlat[id];
    if (!prev || JSON.stringify(prev.entry) !== JSON.stringify(next.entry)) noteKeyedChange('food_log_entries', id);
    if (tombstones[id]) { delete tombstones[id]; tombstonesChanged = true; }
  }
  if (tombstonesChanged) saveFoodEntryTombstones(tombstones);
  writeJson(DAYS_KEY, pruneDays(days));
};

export function loadFoods(): Record<string, SavedFood> {
  const saved = readJson<Record<string, SavedFood>>(FOODS_KEY);
  if (!saved || typeof saved !== 'object') return {};
  // drop foods saved from a lookup that went wrong (impossible numbers, or plainly another food): they'd be logged
  // again on every re-use. The log itself keeps its own copies and isn't changed.
  return Object.fromEntries(Object.entries(saved).filter(([, f]) => f?.per100g && isPlausible({ ...ZERO, ...f.per100g }) && !farFromTable(f)));
}

// How food was served or cut, in a saved name: "watermelon slice" is the table's watermelon.
const SERVED = /\b(slices?|wedges?|pieces?|chunks?|cubes?|bowls?|cups?|glass(?:es)?|mugs?|plates?|katoris?|servings?|portions?)\b/g;

/**
 * A saved food whose numbers are far from the table's food of the same name: an old lookup matched the wrong food
 * ("watermelon slice" was a candy at 207 kcal per 100 g, "curd" soybean curd cheese at 12.5 g protein). Far means
 * what the server's agrees() calls far: over 60 kcal and 50% apart, or 4 g and 60% of protein. Barcode foods (a pack's
 * own label) and the table's own foods are never touched.
 */
export function farFromTable(food: Pick<SavedFood, 'key' | 'name' | 'per100g' | 'source' | 'liquid'>): boolean {
  if (food.source === 'barcode' || food.source === 'earlier' || food.key.startsWith('bc:') || food.key.startsWith('usda:')) return false;
  const t = findTableFood(food.name) ?? findTableFood(food.name.toLowerCase().replace(SERVED, ' '));
  if (!t) return false;
  // a drink saved per 100 ml against the table's per 100 g
  const table = food.liquid && t.mlToG ? scaleNutrients(t.per100g, t.mlToG) : t.per100g;
  const near = (a: number, b: number, abs: number, rel: number) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(a, b));
  return !(near(food.per100g.kcal, table.kcal, 60, 0.5) && near(food.per100g.protein, table.protein, 4, 0.6));
}

/** An entry logged from a wrong lookup gets USDA's numbers when it's a food in the table; otherwise it's left as is. */
function repairEntry(e: LogEntry): LogEntry {
  if (!e.per100g || isPlausible({ ...ZERO, ...e.per100g })) return e;
  const t = findTableFood(e.name);
  return t ? { ...e, name: t.name, per100g: { ...t.per100g }, missing: t.missing, foodKey: tableKey(t) } : e;
}

export function saveFoods(foods: Record<string, SavedFood>) {
  const list = Object.values(foods);
  if (list.length > MAX_FOODS) {
    // keep the most recently used
    list.sort((a, b) => b.lastUsed - a.lastUsed);
    foods = Object.fromEntries(list.slice(0, MAX_FOODS).map(f => [f.key, f]));
  }
  // No delete affordance for saved foods today — only new/changed ones get marked dirty; the 200-cap
  // eviction above is cache hygiene, like the day/history caps elsewhere, not a user delete.
  const prev = readJson<Record<string, SavedFood>>(FOODS_KEY) ?? {};
  for (const [key, food] of Object.entries(foods)) {
    if (!prev[key] || JSON.stringify(prev[key]) !== JSON.stringify(food)) noteKeyedChange('saved_foods', key);
  }
  writeJson(FOODS_KEY, foods);
  return foods;
}

/* ----------------------------------------------------------------------------------------------- */
/* Food keys, lookups and typed portions                                                            */
/* ----------------------------------------------------------------------------------------------- */

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// "bananas" and "banana" are the same food; "tomatoes" → "tomato", "berries" → "berry"
const singular = (word: string) => word.replace(/ies$/, 'y').replace(/(o|ch|sh|x)es$/, '$1').replace(/([^s])s$/, '$1');
const nameKeyOf = (name: string) => `name:${normalise(name).split(' ').map(singular).join(' ')}`;

export const barcodeKey = (barcode: string) => `bc:${barcode.trim()}`;
export const nameKey = nameKeyOf;

export function findFoodByName(foods: Record<string, SavedFood>, name: string): SavedFood | null {
  const key = nameKeyOf(name);
  if (foods[key]) return foods[key];
  // a scanned product saved under its barcode can still be found by its name
  return Object.values(foods).find(f => nameKeyOf(f.name) === key) ?? null;
}

/** Saved foods whose name contains every typed word — for suggestions while typing. */
export function searchFoods(foods: Record<string, SavedFood>, query: string, limit = 4): SavedFood[] {
  const words = normalise(query).split(' ').filter(Boolean).map(singular);
  if (!words.length) return [];
  return Object.values(foods)
    .filter(f => f.uses > 0 && words.every(w => normalise(f.name).split(' ').map(singular).some(fw => fw.startsWith(w))))
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, limit);
}

export const recentFoods = (foods: Record<string, SavedFood>, limit = 6) =>
  Object.values(foods).filter(f => f.uses > 0 && f.source !== 'earlier').sort((a, b) => b.lastUsed - a.lastUsed).slice(0, limit);

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, half: 0.5, two: 2, three: 3, four: 4, five: 5, six: 6 };
const UNIT_WORDS = ['slice', 'piece', 'serving', 'portion', 'cup', 'bowl', 'plate', 'bar', 'biscuit', 'cookie', 'bite', 'handful',
  'tbsp', 'tablespoon', 'tsp', 'teaspoon', 'glass', 'can', 'bottle', 'pack', 'packet', 'scoop', 'pot', 'tub'];

export interface TypedPortion { name: string; qty: number | null; unit: string | null; }

// grams or ml (kg and litres as 1000 of them)
const byWeightOrVolume = (qty: number, word: string) => {
  const ml = /^(ml|l|litres?|liters?)$/.test(word);
  return { qty: word === 'kg' || (ml && word !== 'ml') ? qty * 1000 : qty, unit: ml ? ML : GRAMS };
};
// "pickle 5g", "rice (150 g)", "milk - 200 ml", "bread 2 slices": the amount after the food's name
const AMOUNT_AFTER = /^(.+?)[\s,(-]+(\d+(?:[.,]\d+)?)\s*([a-z]+)\)?$/;

/**
 * "2 slices of bread" → { qty 2, unit 'slice', name 'bread' }; "150g rice" → { qty 150, unit 'g', name 'rice' };
 * "200 ml milk" → { qty 200, unit 'ml', name 'milk' } (litres as ml). The amount can also come after the name, with
 * its unit: "pickle 5g", "bread 2 slices" ("chicken 65" has no unit: it's the name).
 */
export function parseTypedPortion(text: string): TypedPortion {
  const t = text.trim().toLowerCase().replace(/½/g, '0.5');
  // "half a cup of oats": the "a" after the amount is skipped, so "cup" is still read as the unit
  const m = t.match(/^(\d+(?:[.,]\d+)?|a|an|one|half|two|three|four|five|six)\s*(g|gm|gms|grams?|kg|ml|l|litres?|liters?)?\b\s*(?:x\s*)?(?:an?\s+)?([a-z]+)?\s*(.*)$/);
  if (!m) {
    const after = t.match(AMOUNT_AFTER);
    const qty = after ? parseFloat(after[2].replace(',', '.')) : NaN;
    if (after && /^(g|gm|gms|grams?|kg|ml|l|litres?|liters?)$/.test(after[3])) return { name: after[1].trim(), ...byWeightOrVolume(qty, after[3]) };
    const unit = after ? UNIT_WORDS.find(u => u === singular(after[3])) : undefined;
    if (after && unit) return { name: after[1].trim(), qty, unit };
    return { name: text.trim(), qty: null, unit: null };
  }
  const qtyRaw = m[1];
  const qty = COUNT_WORDS[qtyRaw] ?? parseFloat(qtyRaw.replace(',', '.'));
  if (m[2]) {
    const rest = `${m[3] ?? ''} ${m[4]}`.replace(/^(of\s+)?(an?\s+)?/, '').trim();
    return rest ? { name: rest, ...byWeightOrVolume(qty, m[2]) } : { name: text.trim(), qty: null, unit: null };
  }
  const word = m[3] ? singular(m[3]) : '';
  const unit = UNIT_WORDS.find(u => word === u) ?? null;
  const rest = (unit ? m[4] : `${m[3] ?? ''} ${m[4]}`).replace(/^(of\s+)?(an?\s+)?/, '').trim();
  if (!rest) return { name: text.trim(), qty: null, unit: null };
  return { name: rest, qty, unit };
}

// Typical weights for foods people count ("2 eggs"), used only when a search result gives no piece weight.
// Rounded averages from common food tables; shown to the person as an estimate they can change.
const TYPICAL_PIECE_GRAMS: [RegExp, string, number][] = [
  [/\begg\b/, 'egg', 50], [/\bbanana\b/, 'banana', 120], [/\bapple\b/, 'apple', 180], [/\borange\b/, 'orange', 130],
  [/\bbread\b|\btoast\b/, 'slice', 36], [/\broti\b|\bchapati\b|\bchapatti\b/, 'roti', 40], [/\bidli\b/, 'idli', 40],
  [/\bdosa\b/, 'dosa', 90], [/\bnaan\b/, 'naan', 90], [/\bbiscuit\b|\bcookie\b/, 'biscuit', 12], [/\bpotato\b/, 'potato', 170],
  [/\btomato\b/, 'tomato', 120], [/\bcarrot\b/, 'carrot', 60], [/\bbagel\b/, 'bagel', 100], [/\bcroissant\b/, 'croissant', 60],
  [/\bsamosa\b/, 'samosa', 60], [/\bdate\b/, 'date', 8], [/\bkiwi\b/, 'kiwi', 70], [/\bpear\b/, 'pear', 180],
];

// Words that don't change which food it is: "a medium banana", "fresh apple", "raw carrots"
const FILLER = /\b(a|an|one|the|medium|large|small|big|fresh|raw|ripe|whole|plain|some|of)\b/g;

/** A common food from the USDA table (src/lib/foodTable.ts) matching what was typed, if any. */
export function findTableFood(name: string): TableFood | null {
  const norm = (t: string) => normalise(t).replace(FILLER, ' ').replace(/\s+/g, ' ').trim().split(' ').map(singular).join(' ');
  const wanted = norm(name);
  if (!wanted) return null;
  return FOOD_TABLE.find(f => f.names.some(n => norm(n) === wanted)) ?? null;
}

export const tableKey = (t: TableFood) => `usda:${t.fdcId}`;

const round1 = (x: number) => Math.round(x * 10) / 10;

// Typical densities (grams in one ml), first match wins — the same list as api/_lib/density.js, where it's explained
// (a test checks the two agree). Used when a food has no density of its own.
export const KNOWN_DENSITIES: [RegExp, number][] = [
  [/\bice cream\b/, 0.55],
  [/\bhoney\b/, 1.42],
  [/\bsyrup\b/, 1.33],
  [/\bghee\b/, 0.91],
  [/\boil\b/, 0.92],
  [/\b(water|tea|coffee|chai)\b/, 1.0],
  [/\b(coconut|almond|oat|soy|soya|rice|cashew)\s+milk\b|\bsoymilk\b/, 1.02],
  [/\b(milk|buttermilk|chaas|lassi|kefir|milkshake)\b/, 1.03],
  [/\b(juice|smoothie|soda|cola|lemonade)\b/, 1.04],
  [/\b(soup|dal|daal|dhal|sambar|rasam|broth|stock|curry)\b/, 1.03],
];
export const knownDensity = (name: string) => KNOWN_DENSITIES.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1] ?? null;

/** Grams in one ml of a food: its own figure, the table's (USDA's volume portions), the known list, else 1. */
export const densityOf = (food: Pick<SavedFood, 'name' | 'density'>) =>
  food.density ?? findTableFood(food.name)?.mlToG ?? knownDensity(food.name) ?? 1;

// A table drink: kept per 100 ml with amounts in ml, like a barcode drink (a glass of milk is 244 g, 236.7 ml).
function drinkFromTable(t: TableFood, gPerMl: number, typed?: TypedPortion): { food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>; portion: Portion } {
  const unit = t.unit ? { label: t.unit.label, grams: round1(t.unit.grams / gPerMl) } : null;
  let portion: Portion;
  if (typed?.unit === ML && typed.qty) portion = { qty: typed.qty, unit: GRAMS, unitGrams: 1 };
  else if (typed?.unit === GRAMS && typed.qty) portion = { qty: round1(typed.qty / gPerMl), unit: GRAMS, unitGrams: 1 };
  else if (unit) portion = { qty: typed?.qty ?? 1, unit: unit.label, unitGrams: unit.grams };
  else portion = { qty: 100, unit: GRAMS, unitGrams: 1 };
  return {
    food: {
      key: tableKey(t), name: t.name, per100g: scaleNutrients(t.per100g, gPerMl), missing: t.missing, units: unit ? [unit] : [],
      gramsKnown: true, estimated: false, source: 'search', liquid: true, density: gPerMl,
    },
    portion,
  };
}

/**
 * A saved-food shape and first portion for a table food, honouring a typed amount ("2 bananas", "150 g rice",
 * "200 ml milk"). Millilitres of a food kept by weight ("15 ml oil") are turned into grams by its density.
 */
export function foodFromTable(t: TableFood, typed?: TypedPortion): { food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>; portion: Portion } {
  if (t.drink && t.mlToG) return drinkFromTable(t, t.mlToG, typed);
  const units: FoodUnit[] = t.unit ? [{ label: t.unit.label, grams: t.unit.grams }] : [];
  let portion: Portion;
  if (typed?.unit === ML && typed.qty) portion = { qty: round1(typed.qty * (t.mlToG ?? knownDensity(t.name) ?? 1)), unit: GRAMS, unitGrams: 1 };
  else if (typed?.unit === GRAMS && typed.qty) portion = { qty: typed.qty, unit: GRAMS, unitGrams: 1 };
  else if (t.unit) portion = { qty: typed?.qty ?? 1, unit: t.unit.label, unitGrams: t.unit.grams };
  else portion = { qty: typed?.unit === GRAMS && typed.qty ? typed.qty : 100, unit: GRAMS, unitGrams: 1 };
  return {
    food: {
      key: tableKey(t), name: t.name, per100g: { ...t.per100g }, missing: t.missing, units, gramsKnown: true, estimated: false, source: 'search',
      ...(t.mlToG ? { density: t.mlToG } : {}),
    },
    portion,
  };
}

export function typicalUnit(name: string, unit: string | null): FoodUnit | null {
  // USDA's own portion first ("1 medium banana = 118 g"), then the rough list below
  const table = findTableFood(name);
  if (table?.unit && (!unit || unit === table.unit.label || unit === 'piece')) return { label: table.unit.label, grams: table.unit.grams };
  const n = normalise(name).split(' ').map(singular).join(' ');
  const hit = TYPICAL_PIECE_GRAMS.find(([re, label]) => re.test(n) && (!unit || unit === label || unit === 'piece' || unit === 'slice'));
  if (!hit) return null;
  return { label: unit && unit !== 'piece' ? unit : hit[1], grams: hit[2], estimated: true };
}

// What joins the foods of a typed meal: a comma, +, &, "and" or "with" (", and" counts once).
const MEAL_JOIN = /(\s*(?:[,+&]\s*)+(?:(?:and|with)\s+)?|\s+(?:and|with)\s+)/i;
// An add-on typed as a part of a meal: "milk", "sugar", "a pinch of salt", "2 tsp honey" (grams or ml make it a food)
const ADD_ON_PART = new RegExp(`^(?:(?:\\d+|a|an|one|two|three|some|little|bit|pinch|splash|dash|drop|drizzle|knob|dollop|tsps?|teaspoons?|tbsps?|tablespoons?|spoons?|spoonfuls?|of)\\s+)*(?:${Object.values(EXTRA_WORDS).join('|')})$`);
const HOT_DRINK = /\b(tea|coffee|chai)\b/;
const MAX_MEAL_FOODS = 8;

/**
 * A typed meal's foods, each with its own amount: "muesli with milk and banana", "2 roti and dal", "rice, dal + a
 * glass of milk". Worked out on the phone (no AI); each food is then looked up the way one typed food is. Null — look
 * the text up as one food, as before — unless it's plainly several foods:
 * - the longest run that's a food the phone knows (saved, or in the table) stays one food ("tofu and vegetables"),
 *   so a known phrase is never split;
 * - at least two of the foods are ones the phone knows, so dish names stay whole: "mac and cheese", "sweet and sour
 *   chicken", "bread and butter pudding";
 * - at most one isn't (it's looked up on the server), so a typed meal never needs more lookups than typing it did;
 * - tea, coffee and chai keep their add-ons: "tea with milk and sugar" is one drink, not tea and a glass of milk
 *   ("50 ml milk", with its own grams or ml, is a food);
 * - an add-on the phone doesn't know ("salt", "a pinch of salt", "mayo") would be looked up as 100 g: the text stays whole.
 */
export function splitTypedMeal(text: string, foods: Record<string, SavedFood> = {}): TypedPortion[] | null {
  // "1,5 l water": a decimal comma doesn't join two foods
  const pieces = text.replace(/(\d),(\d)/g, '$1.$2').split(MEAL_JOIN);
  const parts: string[] = [];
  const joins: string[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const part = pieces[i].trim();
    if (!part) continue;
    if (parts.length) joins.push(pieces[i - 1]);
    parts.push(part);
  }
  if (parts.length < 2 || parts.length > 2 * MAX_MEAL_FOODS) return null;

  const known = (t: string) => { const name = parseTypedPortion(t).name; return !!(findFoodByName(foods, name) || findTableFood(name)); };
  const isAddOn = (t: string) => { const unit = parseTypedPortion(t).unit; return unit !== GRAMS && unit !== ML && ADD_ON_PART.test(normalise(t)); };
  // parts from..to with the words that joined them: "tofu and vegetables"
  const joined = (from: number, to: number) => parts.slice(from, to + 1).reduce((t, p, k) => `${t}${joins[from + k - 1]}${p}`);

  const spans: { from: number; to: number; drink: string | null }[] = [];
  for (let i = 0; i < parts.length;) {
    let j = parts.length - 1;
    while (j > i && !known(joined(i, j))) j--;
    const run = joined(i, j);
    const last = spans[spans.length - 1];
    if (last?.drink && isAddOn(run)) last.to = j; // the tea's milk
    else spans.push({ from: i, to: j, drink: HOT_DRINK.test(parseTypedPortion(run).name.toLowerCase()) ? run : null });
    i = j + 1;
  }
  if (spans.length < 2 || spans.length > MAX_MEAL_FOODS) return null;

  const groups = spans.map(s => ({ text: joined(s.from, s.to), drink: s.drink }));
  const onPhone = groups.map(g => known(g.text));
  const foodsKnown = groups.filter((g, k) => onPhone[k] || (g.drink !== null && known(g.drink))).length;
  const lookups = groups.filter((_, k) => !onPhone[k]);
  if (foodsKnown < 2 || lookups.length > 1 || lookups.some(g => isAddOn(g.text))) return null;
  return groups.map(g => parseTypedPortion(g.text));
}

/* ----------------------------------------------------------------------------------------------- */
/* Turning a server result into a food                                                               */
/* ----------------------------------------------------------------------------------------------- */

export interface ScanPayload {
  foodName: string;
  calories: number;
  macros: { carbs: number; protein: number; fat: number; fiber: number };
  micros: { sodium: string; potassium: string; iron: string; calcium: string };
  estimated?: boolean;
  estimatedPortionGrams?: number;
  /** newer servers: exact values per 100 g */
  per100g?: Partial<Nutrients>;
  /** barcode: the pack's serving text, e.g. "1 slice (36 g)" */
  servingLabel?: string;
  /** barcode: the whole pack's weight in grams (ml for drinks) */
  packageGrams?: number;
  /** barcode: a drink — label values per 100 ml, amounts in ml */
  liquid?: boolean;
  /** photo: how many of what was seen, e.g. 2 × "slice" */
  count?: number;
  unit?: string;
  allergens?: string[];
  /** which USDA food a typed or photo check was matched to (newer servers) */
  matchedFood?: string;
  /** barcode: the pack's ingredient list */
  ingredientsText?: string;
  /** barcode (newer servers): Open Food Facts' vegetarian status — true, false, or null when it can't tell */
  vegetarian?: boolean | null;
  /** typed or photo (newer servers): a liquid's grams in one ml */
  density?: number;
  /** photo (newer servers): every food seen, each with its own amount — the fields above are then the whole meal */
  items?: ScanItem[];
  mealName?: string;
}

/** One food of a meal photo, as the server gives it (itemResult in api/scan-meal.js). */
export interface ScanItem {
  name: string;
  /** g, or ml for a drink; null = the photo couldn't show how much */
  amount: number | null;
  unit: 'g' | 'ml';
  /** grams in one ml, for an amount in ml */
  density?: number;
  count: number | null;
  piece: string | null;
  /** numbers per 100 of `unit` (per 100 ml for a drink); null = none found */
  per100: Partial<Record<NutrientKey, number | null>> | null;
  matchedFood: string | null;
  source: string | null;
  confidence: 'high' | 'medium' | 'low';
  amountConfidence: 'high' | 'medium' | 'low';
  /** 'note': the amount the person gave, exactly */
  amountSource: 'photo' | 'note';
  alternatives: string[];
  /** not sure what it is (or how much, or no numbers): ask before logging it */
  needsReview: boolean;
}

const mg = (s: string | undefined) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : 0; };

/**
 * Per-100 g numbers: the server's own when it sends them (null = not on the label), otherwise worked back from the
 * portion it scaled to. Older servers send 0 for anything missing, so a 0 there counts as "not given".
 */
export function per100gOf(p: ScanPayload): { per100g: Nutrients; missing: NutrientKey[] } {
  if (p.per100g && typeof p.per100g.kcal === 'number') {
    const given = p.per100g as Partial<Record<NutrientKey, number | null>>;
    const per100g = { ...ZERO };
    const missing: NutrientKey[] = [];
    for (const k of Object.keys(ZERO) as NutrientKey[]) {
      const v = given[k];
      if (typeof v === 'number' && Number.isFinite(v)) per100g[k] = v;
      else if (EXTRA_NUTRIENTS.includes(k)) missing.push(k);
    }
    return { per100g, missing };
  }
  const grams = p.estimatedPortionGrams && p.estimatedPortionGrams > 0 ? p.estimatedPortionGrams : 100;
  const per100g = scaleNutrients({
    ...ZERO,
    kcal: p.calories, carbs: p.macros.carbs, protein: p.macros.protein, fat: p.macros.fat, fiber: p.macros.fiber,
    sodiumMg: mg(p.micros.sodium), potassiumMg: mg(p.micros.potassium), ironMg: mg(p.micros.iron), calciumMg: mg(p.micros.calcium),
  }, 100 / grams);
  return { per100g, missing: EXTRA_NUTRIENTS.filter(k => !per100g[k]) };
}

// "1 slice (36 g)" → { label 'slice', grams 36 }; "2 biscuits (25g)" → { 'biscuit', 12.5 }; "30 g" → serving of 30 g
export function unitFromServing(label: string | undefined, servingGrams: number): FoodUnit | null {
  if (!servingGrams || servingGrams <= 0) return null;
  const m = (label ?? '').toLowerCase().match(/^\s*(\d+(?:[.,]\d+)?)?\s*([a-z][a-z ]*?)\s*\(/);
  if (m && !/^(g|gram|grams|ml)$/.test(m[2].trim())) {
    const count = m[1] ? parseFloat(m[1].replace(',', '.')) : 1;
    const word = singular(m[2].trim().split(' ').pop() ?? 'serving');
    return { label: word, grams: servingGrams / (count || 1) };
  }
  return { label: 'serving', grams: servingGrams };
}

export interface Portion { qty: number; unit: string; unitGrams: number; }

/** Builds (or refreshes) a saved food from a scan result, and the portion to log first. */
export function foodFromScan(p: ScanPayload, source: FoodSource, key: string, typed?: TypedPortion): { food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>; portion: Portion } {
  const { per100g, missing } = per100gOf(p);
  const units: FoodUnit[] = [];
  let portion: Portion;
  const grams = p.estimatedPortionGrams && p.estimatedPortionGrams > 0 ? p.estimatedPortionGrams : 100;

  if (source === 'barcode') {
    // a real serving ("1 slice (36 g)", "200 ml") unless it's just the whole pack again; then the pack itself
    const pack = p.packageGrams && p.packageGrams > 0 ? p.packageGrams : null;
    const unit = p.servingLabel ? unitFromServing(p.servingLabel, grams) : null;
    if (unit && !(pack && Math.abs(unit.grams - pack) < 1)) units.push(unit);
    if (pack) units.push({ label: p.liquid && pack <= 2000 ? 'bottle' : 'pack', grams: pack });
    // one serving if there is one; a single-serve pack (up to 1 kg / 1 l) as a whole; otherwise 100 g
    const first = units[0] && (units[0] !== units[units.length - 1] || !pack || pack <= 1000) ? units[0] : null;
    portion = first ? { qty: 1, unit: first.label, unitGrams: first.grams } : { qty: 100, unit: GRAMS, unitGrams: 1 };
  } else if (source === 'photo') {
    const count = p.count && p.count > 0 ? p.count : 1;
    const label = p.unit ? singular(normalise(p.unit)) : 'portion';
    units.push({ label, grams: grams / count });
    portion = { qty: count, unit: label, unitGrams: grams / count };
  } else {
    // typed: grams as typed (ml by the food's density), or a counted unit when we know (or can reasonably estimate) its weight
    const guess = typicalUnit(p.foodName, typed?.unit === GRAMS || typed?.unit === ML ? null : typed?.unit ?? null);
    if (guess) units.push(guess);
    if (typed?.unit === ML && typed.qty) portion = { qty: round1(typed.qty * (p.density ?? knownDensity(p.foodName) ?? 1)), unit: GRAMS, unitGrams: 1 };
    else if (typed?.unit === GRAMS && typed.qty) portion = { qty: typed.qty, unit: GRAMS, unitGrams: 1 };
    else if (guess) portion = { qty: typed?.qty ?? 1, unit: guess.label, unitGrams: guess.grams };
    else portion = { qty: 100, unit: GRAMS, unitGrams: 1 };
  }

  return {
    // "estimated" = the amount is a guess: a photo's portion, or a typical weight for a counted food ("2 eggs").
    // Typed grams and a pack's own serving are what the person or the label said.
    food: { key, name: p.foodName, per100g, missing, units, gramsKnown: true, source, allergens: p.allergens, liquid: p.liquid || undefined,
      estimated: source === 'photo' || (source === 'search' && units.some(u => u.estimated && u.label === portion.unit)),
      ...(p.density ? { density: p.density } : {}) },
    portion,
  };
}

/**
 * One food of a meal photo (the server's `items`) as a saved food and the portion seen, built the way a one-food
 * photo is (foodFromScan's photo branch): "6 slices" when it was counted, else one portion of the amount seen. An
 * amount in ml makes it a drink kept per 100 ml, like a barcode drink. Null when there's nothing to log: no amount,
 * or no numbers.
 */
export function foodFromScanItem(item: ScanItem): { food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>; portion: Portion } | null {
  if (item.amount === null || !(item.amount > 0) || !item.per100 || typeof item.per100.kcal !== 'number') return null;
  const { per100g, missing } = per100gOf({ per100g: item.per100 } as ScanPayload);
  const count = item.count && item.count > 0 ? item.count : 1;
  const label = item.piece ? singular(normalise(item.piece)) : 'portion';
  return {
    food: {
      key: nameKey(item.name), name: item.name, per100g, missing, units: [{ label, grams: item.amount / count }], gramsKnown: true,
      source: 'photo', allergens: undefined, liquid: item.unit === 'ml' || undefined, estimated: true,
      ...(item.density ? { density: item.density } : {}),
    },
    portion: { qty: count, unit: label, unitGrams: item.amount / count },
  };
}

/** Remembers a food and the portion just logged, so it's one tap next time. */
export function rememberFood(foods: Record<string, SavedFood>, food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>, portion: Portion): Record<string, SavedFood> {
  const prev = foods[food.key];
  const units = [...food.units];
  for (const u of prev?.units ?? []) if (!units.some(x => x.label === u.label)) units.push(u);
  return {
    ...foods,
    [food.key]: { ...food, units, uses: (prev?.uses ?? 0) + 1, lastUsed: Date.now(), lastQty: portion.qty, lastUnit: portion.unit },
  };
}

export function entryFromFood(food: Pick<SavedFood, 'key' | 'name' | 'per100g' | 'gramsKnown' | 'estimated' | 'missing' | 'liquid'>, portion: Portion, eaten = 1): LogEntry {
  return {
    liquid: food.liquid,
    id: newId(), foodKey: food.key, name: food.name, qty: portion.qty, unit: portion.unit, unitGrams: portion.unitGrams, eaten,
    per100g: { ...ZERO, ...food.per100g }, gramsKnown: food.gramsKnown, estimated: food.estimated,
    missing: food.missing ?? EXTRA_NUTRIENTS.filter(k => !food.per100g[k]), at: Date.now(),
  };
}

/** The same food and amount as a new entry, eaten now (logging a past day's food again). */
export const copyEntry = (e: LogEntry): LogEntry => ({ ...e, id: newId(), at: Date.now() });

/** A saved food just used again. */
export const touchFood = (f: SavedFood): SavedFood => ({ ...f, uses: f.uses + 1, lastUsed: Date.now() });

/**
 * The portion to log a saved food with: what was typed when it makes sense for this food ("2 slices", "150 g",
 * "200 ml"), otherwise the amount used last time. ml is a drink's own unit (kept per 100 ml); for a food kept by
 * weight it's turned into grams by the food's density — and grams typed for a drink into its ml.
 */
export function savedFoodPortion(food: SavedFood, typed?: TypedPortion): Portion {
  if (!typed?.qty) return lastPortion(food);
  if (typed.unit === ML && food.gramsKnown) {
    return { qty: food.liquid ? typed.qty : round1(typed.qty * densityOf(food)), unit: GRAMS, unitGrams: 1 };
  }
  if (typed.unit === GRAMS && food.gramsKnown) {
    // a drink with a known density: 250 g of milk is 242.5 ml (barcode drinks, with none, take grams as ml as before)
    return { qty: food.liquid && food.density ? round1(typed.qty / food.density) : typed.qty, unit: GRAMS, unitGrams: 1 };
  }
  const unit = food.units.find(u => u.label === typed.unit) ?? (typed.unit ? typicalUnit(food.name, typed.unit) : food.units[0]);
  return unit ? { qty: typed.qty, unit: unit.label, unitGrams: unit.grams } : lastPortion(food);
}

/** The last portion of a saved food, falling back to its first unit or 100 g. */
export function lastPortion(food: SavedFood): Portion {
  if (food.lastUnit === GRAMS && food.gramsKnown) return { qty: food.lastQty || 100, unit: GRAMS, unitGrams: 1 };
  const unit = food.units.find(u => u.label === food.lastUnit) ?? food.units[0];
  if (unit) return { qty: food.lastQty || 1, unit: unit.label, unitGrams: unit.grams };
  return { qty: 100, unit: GRAMS, unitGrams: 1 };
}
