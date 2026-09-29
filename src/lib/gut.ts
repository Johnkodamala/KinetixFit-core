// Gut health: a daily check-in (how the gut feels, 1–5, and anything bothering it) and, after a week, a report that
// suggests foods from what the person actually ate that week and how their gut felt.
//
// - Everything stays on the phone: gut symptoms are health data (UK GDPR special category), so nothing here is sent to
//   the server or the AI.
// - Wellness guidance, never a diagnosis. The advice follows the NHS pages on constipation, diarrhoea, IBS diet tips,
//   bloating, farting and heartburn: add fibre gradually with plenty of fluid; oats and up to a tablespoon of linseeds a
//   day for wind and bloating; beans, onions, cabbage, broccoli, cauliflower and dried fruit can cause wind; cut down on
//   high-fibre foods, fatty/spicy food, caffeine, alcohol and sugar-free sweets (sorbitol) while stools are loose;
//   coffee, alcohol, chocolate, tomatoes and fatty or spicy food can bring on heartburn, as can eating 3–4 hours before
//   bed; see a GP about bowel changes lasting 3 weeks or more, blood in poo, weight loss or severe pain.
// - "30 different plants a week": the American Gut Project (McDonald et al., mSystems 2018) found people eating 30+ plant
//   types a week had more varied gut bacteria than those eating 10 or fewer. Two kiwifruit a day eased constipation in
//   trials (e.g. Chey et al., Am J Gastroenterol 2021).
// - Food–gut links are only "may be": a food eaten on ≥ 2 days that was followed by a worse gut — that day, or at half
//   weight the day after — ≥ 75% of the time and clearly more often than the person's usual; always worded as possibly a
//   coincidence. (Counting the next day in full flagged staples like rice that merely came the day before bad days.)
// - Lifestyle patterns (gutPatterns): over the last 14 days, how often the gut was rough after short vs. enough sleep,
//   on active vs. quiet days, with vs. without enough water or fibre, after late meals, and on lower-HRV days. Shown only
//   when both sides have ≥ 3 days and the difference is big (≥ 40 points), and always as a pattern, not a cause. With a
//   week or two of self-reported data nothing here can *predict* a bad gut day — it points at things worth testing.
import { localDayKey } from './dates';
import { entryNutrients, type FoodDays, type LogEntry } from './foodLog';
import { tagFits, type Diet, type DietTag } from './diet';
import { allergiesIn, customAllergies } from './allergens';
import type { CountryCode } from './countries';

export type GutFeel = 1 | 2 | 3 | 4 | 5;
export const GUT_FEELS: { value: GutFeel; label: string }[] = [
  { value: 1, label: 'Bad' },
  { value: 2, label: 'Not great' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];
export const feelLabel = (feel: number) => GUT_FEELS.find(f => f.value === feel)?.label ?? '';

export type SymptomId = 'bloating' | 'gas' | 'constipation' | 'loose' | 'heartburn' | 'pain' | 'nausea';
export const SYMPTOMS: { id: SymptomId; label: string }[] = [
  { id: 'bloating', label: 'Bloating' },
  { id: 'gas', label: 'Gas' },
  { id: 'constipation', label: 'Constipation' },
  { id: 'loose', label: 'Loose stools' },
  { id: 'heartburn', label: 'Heartburn' },
  { id: 'pain', label: 'Stomach pain' },
  { id: 'nausea', label: 'Nausea' },
];
export const symptomLabel = (id: SymptomId) => SYMPTOMS.find(s => s.id === id)?.label ?? id;

export interface GutCheck { feel: GutFeel; symptoms: SymptomId[]; at: number; }
/** local day key → that day's check-in */
export type GutChecks = Record<string, GutCheck>;

const KEY = 'kx_gut_checks';
const KEEP_DAYS = 90;
/** A report covers the last 7 days, and needs 7 days since the first check-in and check-ins on 4 of them. */
export const REPORT_DAYS = 7;
export const MIN_CHECKS_FOR_REPORT = 4;
/** The "30 plants a week" guide (American Gut Project). */
export const PLANTS_GOAL = 30;

/* ----------------------------------------------------------------------------------------------- */
/* Days                                                                                             */
/* ----------------------------------------------------------------------------------------------- */

const noon = (day: string) => new Date(`${day}T12:00:00`);
/** The day key n days after (or before, for negative n) a day key. Noon keeps it clear of DST changes. */
export function addDays(day: string, n: number): string {
  const d = noon(day);
  d.setDate(d.getDate() + n);
  return localDayKey(d);
}
export const daysBetween = (from: string, to: string) => Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);
/** The 7 days up to and including `today`, oldest first. */
export const reportDays = (today: string) => Array.from({ length: REPORT_DAYS }, (_, i) => addDays(today, i - (REPORT_DAYS - 1)));

/* ----------------------------------------------------------------------------------------------- */
/* Storage                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

const validCheck = (c: unknown): c is GutCheck => {
  const x = c as GutCheck;
  return !!x && Number.isInteger(x.feel) && x.feel >= 1 && x.feel <= 5 && Array.isArray(x.symptoms);
};

export function loadGutChecks(): GutChecks {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!saved || typeof saved !== 'object') return {};
    const known = new Set(SYMPTOMS.map(s => s.id));
    return Object.fromEntries(Object.entries(saved)
      .filter(([, c]) => validCheck(c))
      .map(([day, c]) => [day, { ...(c as GutCheck), symptoms: (c as GutCheck).symptoms.filter(s => known.has(s)) }]));
  } catch {
    return {};
  }
}

/** Saves one day's check-in (replacing any earlier one that day) and drops check-ins older than 90 days. */
export function saveGutCheck(all: GutChecks, day: string, check: GutCheck, today = localDayKey()): GutChecks {
  const oldest = addDays(today, -(KEEP_DAYS - 1));
  const next: GutChecks = { [day]: check };
  for (const [d, c] of Object.entries(all)) if (d >= oldest && d !== day) next[d] = c;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked: kept in memory */ }
  return next;
}

/* ----------------------------------------------------------------------------------------------- */
/* When the report is ready                                                                         */
/* ----------------------------------------------------------------------------------------------- */

export interface GutReportStatus {
  ready: boolean;
  /** days from the first check-in to today, counting both (0 = never checked in) */
  daysSinceFirst: number;
  /** check-ins in the last 7 days */
  checksThisWeek: number;
}

export function gutReportStatus(checks: GutChecks, today = localDayKey()): GutReportStatus {
  const days = Object.keys(checks).filter(d => d <= today).sort();
  if (days.length === 0) return { ready: false, daysSinceFirst: 0, checksThisWeek: 0 };
  const daysSinceFirst = daysBetween(days[0], today) + 1;
  const checksThisWeek = reportDays(today).filter(d => checks[d]).length;
  return { ready: daysSinceFirst >= REPORT_DAYS && checksThisWeek >= MIN_CHECKS_FOR_REPORT, daysSinceFirst, checksThisWeek };
}

/** The line under the check-in until the report is ready. */
export function reportProgressText(s: GutReportStatus): string {
  if (s.ready) return 'Your gut report for this week is ready.';
  if (s.daysSinceFirst < REPORT_DAYS) {
    return `Day ${s.daysSinceFirst} of ${REPORT_DAYS}. After a week you’ll get food ideas for your gut, based on what you ate and how you felt.`;
  }
  const more = MIN_CHECKS_FOR_REPORT - s.checksThisWeek;
  return `Check in on ${more} more ${more === 1 ? 'day' : 'days'} this week to get your gut report.`;
}

/* ----------------------------------------------------------------------------------------------- */
/* What the week's food names say                                                                   */
/* ----------------------------------------------------------------------------------------------- */

// word in a food name → the plant(s) it is. Counts towards "different plants this week" (fruit, vegetables, pulses,
// whole and other grains, nuts and seeds). A dish can be several: idli and dosa are rice + urad dal.
const PLANT_WORDS: Record<string, string[]> = {};
const plant = (name: string, ...words: string[]) => { for (const w of words) PLANT_WORDS[w] = [...(PLANT_WORDS[w] ?? []), name]; };
plant('banana', 'banana', 'bananas'); plant('apple', 'apple', 'apples'); plant('orange', 'orange', 'oranges');
plant('mango', 'mango', 'mangoes', 'mangos'); plant('grapes', 'grape', 'grapes'); plant('berries', 'strawberry', 'strawberries',
  'blueberry', 'blueberries', 'raspberry', 'raspberries', 'berries'); plant('watermelon', 'watermelon'); plant('melon', 'melon');
plant('pineapple', 'pineapple'); plant('papaya', 'papaya'); plant('pear', 'pear', 'pears'); plant('kiwi', 'kiwi', 'kiwis', 'kiwifruit');
plant('avocado', 'avocado', 'avocados'); plant('dates', 'dates'); plant('pomegranate', 'pomegranate'); plant('guava', 'guava', 'guavas');
plant('lemon', 'lemon', 'lime', 'nimbu'); plant('cherries', 'cherry', 'cherries'); plant('peach', 'peach', 'peaches');
plant('plum', 'plum', 'plums', 'prune', 'prunes'); plant('apricot', 'apricot', 'apricots'); plant('fig', 'fig', 'figs', 'anjeer');
plant('raisins', 'raisin', 'raisins', 'kishmish'); plant('coconut', 'coconut'); plant('jackfruit', 'jackfruit');
plant('tomato', 'tomato', 'tomatoes'); plant('cucumber', 'cucumber', 'kheera'); plant('carrot', 'carrot', 'carrots', 'gajar');
plant('potato', 'potato', 'potatoes', 'aloo', 'alu'); plant('sweet potato', 'shakarkandi'); plant('broccoli', 'broccoli');
plant('spinach', 'spinach', 'palak', 'saag'); plant('onion', 'onion', 'onions', 'pyaz'); plant('garlic', 'garlic');
plant('peas', 'peas', 'matar', 'mutter'); plant('sweetcorn', 'sweetcorn', 'corn', 'makki'); plant('mushroom', 'mushroom', 'mushrooms');
plant('cauliflower', 'cauliflower', 'gobi'); plant('cabbage', 'cabbage'); plant('lettuce', 'lettuce', 'salad');
plant('pepper', 'capsicum', 'peppers'); plant('okra', 'okra', 'bhindi'); plant('aubergine', 'aubergine', 'eggplant', 'brinjal', 'baingan');
plant('beetroot', 'beetroot', 'beet'); plant('radish', 'radish', 'mooli'); plant('pumpkin', 'pumpkin', 'kaddu');
plant('courgette', 'courgette', 'zucchini'); plant('kale', 'kale'); plant('gourd', 'lauki', 'karela', 'gourd', 'tinda');
plant('fenugreek', 'methi'); plant('beans', 'bean', 'beans'); plant('asparagus', 'asparagus'); plant('leek', 'leek', 'leeks');
plant('lentils', 'lentil', 'lentils', 'dal', 'daal', 'dhal', 'masoor', 'moong', 'toor', 'urad', 'sambar', 'khichdi', 'idli',
  'idlis', 'dosa', 'dosas', 'dosai', 'uttapam', 'vada');
plant('chickpeas', 'chickpea', 'chickpeas', 'chana', 'chole', 'hummus', 'houmous', 'besan', 'dhokla');
plant('kidney beans', 'rajma', 'kidney'); plant('soya', 'soya', 'soy', 'tofu', 'edamame', 'tempeh'); plant('peanuts', 'peanut', 'peanuts');
plant('oats', 'oat', 'oats', 'porridge', 'oatmeal', 'muesli', 'granola'); plant('rice', 'rice', 'biryani', 'pulao', 'poha', 'idli',
  'idlis', 'dosa', 'dosas', 'dosai', 'khichdi', 'uttapam'); plant('quinoa', 'quinoa');
plant('wheat', 'wheat', 'wholemeal', 'wholewheat', 'roti', 'chapati', 'chapatti', 'paratha', 'naan', 'bread', 'toast', 'pasta',
  'couscous', 'upma', 'semolina', 'suji', 'rava', 'dalia'); plant('millet', 'millet', 'ragi', 'bajra', 'jowar');
plant('barley', 'barley'); plant('rye', 'rye'); plant('almonds', 'almond', 'almonds', 'badam'); plant('walnuts', 'walnut', 'walnuts');
plant('cashews', 'cashew', 'cashews', 'kaju'); plant('pistachios', 'pistachio', 'pistachios'); plant('chia', 'chia');
plant('linseed', 'linseed', 'linseeds', 'flaxseed', 'flaxseeds', 'flax'); plant('sesame', 'sesame', 'til');
plant('sunflower seeds', 'sunflower'); plant('ginger', 'ginger', 'adrak');

const FERMENTED_WORDS = ['yogurt', 'yoghurt', 'curd', 'dahi', 'raita', 'lassi', 'buttermilk', 'chaas', 'kefir', 'idli', 'idlis',
  'dosa', 'dosas', 'dosai', 'dhokla', 'appam', 'uttapam', 'kimchi', 'sauerkraut', 'miso', 'tempeh', 'kombucha', 'natto', 'kanji', 'skyr'];
// Can cause wind and bloating (NHS: beans, onions, cabbage, broccoli, cauliflower, sprouts, dried fruit; fizzy drinks;
// sorbitol in sugar-free sweets)
const GASSY_WORDS = ['beans', 'bean', 'rajma', 'chana', 'chole', 'chickpea', 'chickpeas', 'lentil', 'lentils', 'dal', 'daal', 'dhal',
  'onion', 'onions', 'cabbage', 'broccoli', 'cauliflower', 'gobi', 'sprouts', 'raisins', 'prunes', 'dates', 'cola', 'fizzy',
  'soda', 'lemonade', 'sugar-free'];
// Can bring on heartburn (NHS: coffee, alcohol, chocolate, tomatoes, fatty or spicy food)
const HEARTBURN_WORDS = ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'mocha', 'chocolate', 'tomato', 'tomatoes',
  'pizza', 'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'rum', 'gin', 'fried', 'fries', 'chips', 'crisps', 'samosa', 'pakora',
  'pakoras', 'bhaji', 'bhajia', 'vada', 'puri', 'bhature', 'kachori', 'chilli', 'chili', 'spicy', 'vindaloo', 'pepperoni'];
// Worth going easy on while stools are loose (NHS: high-fibre wholegrains, nuts and seeds; fatty or spicy food; caffeine;
// alcohol; sorbitol)
const LOOSE_WORDS = ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'rum',
  'gin', 'fried', 'fries', 'chips', 'samosa', 'pakora', 'pakoras', 'bhaji', 'puri', 'bhature', 'chilli', 'chili', 'spicy',
  'vindaloo', 'prunes', 'sugar-free', 'bran'];

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
export function plantsIn(name: string): string[] {
  const found = new Set(wordsOf(name).flatMap(w => PLANT_WORDS[w] ?? []));
  // "kidney beans" is one plant, not kidney beans + beans
  if (found.has('beans') && ['kidney beans', 'chickpeas', 'soya', 'lentils'].some(p => found.has(p))) found.delete('beans');
  return [...found];
}
export const isFermented = (name: string) => wordsOf(name).some(w => FERMENTED_WORDS.includes(w));
const hasAny = (name: string, list: string[]) => wordsOf(name).some(w => list.includes(w));
// Words that say what a food is, singular ("eggs" → "egg"), without the ones that say how it's made or served
const NOT_TELLING = ['plain', 'boiled', 'hard-boiled', 'grilled', 'baked', 'cooked', 'fresh', 'small', 'handful', 'with', 'tea', 'day', 'tbsp', 'ground'];
const foodKeywords = (name: string) => wordsOf(name).map(w => w.replace(/s$/, '')).filter(w => w.length > 2 && !NOT_TELLING.includes(w));

/* ----------------------------------------------------------------------------------------------- */
/* Foods the report can suggest                                                                     */
/* ----------------------------------------------------------------------------------------------- */

export interface GutFood {
  id: string;
  name: string;
  diet: DietTag;
  /** the person's allergens that rule it out (ids from src/lib/countries.ts) */
  allergens?: string[];
  plants: string[];
  /** fibre-rich */
  fibre?: boolean;
  /** has live cultures */
  fermented?: boolean;
  /** usually easy on a sensitive gut (low in the carbohydrates that cause wind) */
  gentle?: boolean;
  /** plain and easy while stools are loose */
  settling?: boolean;
  /** helps constipation beyond its fibre (sorbitol, kiwifruit) */
  constipation?: boolean;
  /** low in fat, not spicy: kinder when heartburn is a problem */
  lightForHeartburn?: boolean;
  /** can bring on heartburn */
  heartburnTrigger?: boolean;
  /** may ease nausea */
  nausea?: boolean;
  /** can cause wind and bloating for some people */
  gassy?: boolean;
  /** only suggested in these countries (everyday food there) */
  only?: CountryCode[];
  /** never suggested in these countries (hard to find, or not how people eat there) */
  notIn?: CountryCode[];
  /** what it does, in a few words */
  what: string;
}

export const GUT_FOODS: GutFood[] = [
  { id: 'oats', name: 'Porridge oats', diet: 'veg', plants: ['oats'], fibre: true, gentle: true, constipation: true, lightForHeartburn: true,
    what: 'Soluble fibre that’s gentle on the gut.' },
  { id: 'linseed', name: 'Ground linseeds (up to 1 tbsp a day)', diet: 'veg', plants: ['linseed'], fibre: true, gentle: true, constipation: true,
    what: 'Stirred into porridge, cereal or a smoothie; eases constipation and bloating.' },
  { id: 'kiwi', name: 'Kiwi (two a day)', diet: 'veg', plants: ['kiwi'], fibre: true, gentle: true, constipation: true,
    what: 'Two a day eased constipation in trials.' },
  { id: 'pear', name: 'Pear', diet: 'veg', plants: ['pear'], fibre: true, constipation: true, gassy: true,
    what: 'Fibre plus natural sorbitol, which helps keep you regular.' },
  { id: 'guava', name: 'Guava', diet: 'veg', plants: ['guava'], fibre: true,
    what: 'One of the most fibre-rich fruits.' },
  { id: 'berries', name: 'Strawberries or blueberries', diet: 'veg', plants: ['berries'], fibre: true, gentle: true,
    what: 'Fibre and polyphenols, and easy on a sensitive gut.' },
  { id: 'papaya', name: 'Papaya', diet: 'veg', plants: ['papaya'], gentle: true, lightForHeartburn: true,
    what: 'Soft and easy on the stomach.' },
  { id: 'banana', name: 'Banana', diet: 'veg', plants: ['banana'], gentle: true, settling: true, lightForHeartburn: true,
    what: 'Easy to digest, with a little fibre that feeds gut bacteria.' },
  { id: 'dal', name: 'Dal (lentils)', diet: 'veg', plants: ['lentils'], fibre: true, gassy: true,
    what: 'Fibre and plant protein that feed your gut bacteria.' },
  { id: 'chickpeas', name: 'Chickpeas or chana', diet: 'veg', plants: ['chickpeas'], fibre: true, gassy: true,
    what: 'High in fibre and plant protein.' },
  { id: 'rajma', name: 'Kidney beans (rajma)', diet: 'veg', plants: ['kidney beans'], fibre: true, gassy: true,
    what: 'Fibre-rich beans — start with a small portion.' },
  { id: 'brown-rice', name: 'Brown rice', diet: 'veg', plants: ['rice'], fibre: true, gentle: true,
    what: 'A wholegrain swap with more fibre than white rice.' },
  { id: 'wholemeal', name: 'Wholemeal bread or roti', diet: 'veg', allergens: ['wheat'], plants: ['wheat'], fibre: true,
    what: 'Wholegrain fibre in something you already eat.' },
  { id: 'millet', name: 'Millet (ragi, bajra or jowar)', diet: 'veg', plants: ['millet'], fibre: true, gentle: true, only: ['IN'],
    what: 'A wholegrain with plenty of fibre, as roti or porridge.' },
  { id: 'carrots', name: 'Carrots', diet: 'veg', plants: ['carrot'], fibre: true, gentle: true, lightForHeartburn: true,
    what: 'Fibre that most sensitive guts handle well.' },
  { id: 'spinach', name: 'Spinach (palak)', diet: 'veg', plants: ['spinach'], fibre: true, gentle: true,
    what: 'Leafy greens with fibre, iron and folate.' },
  { id: 'broccoli', name: 'Broccoli', diet: 'veg', plants: ['broccoli'], fibre: true, gassy: true,
    what: 'Fibre-rich, and feeds gut bacteria.' },
  { id: 'almonds', name: 'A small handful of almonds', diet: 'veg', allergens: ['nuts'], plants: ['almonds'], fibre: true, gassy: true,
    what: 'Fibre and healthy fats.' },
  { id: 'walnuts', name: 'Walnuts', diet: 'veg', allergens: ['nuts'], plants: ['walnuts'], fibre: true, gentle: true,
    what: 'Fibre and omega-3 fats.' },
  { id: 'curd', name: 'Plain yogurt or curd (dahi)', diet: 'veg', allergens: ['milk'], plants: [], fermented: true, gentle: true, settling: true, lightForHeartburn: true,
    what: 'Live cultures — the easiest fermented food to add.' },
  { id: 'buttermilk', name: 'Buttermilk (chaas)', diet: 'veg', allergens: ['milk'], plants: [], fermented: true, settling: true,
    what: 'Fermented, light and hydrating.' },
  { id: 'kefir', name: 'Kefir', diet: 'veg', allergens: ['milk'], plants: [], fermented: true, notIn: ['IN'],
    what: 'A fermented milk drink with a wide mix of cultures.' },
  { id: 'idli', name: 'Idli', diet: 'veg', plants: ['rice', 'lentils'], fermented: true, gentle: true, settling: true, lightForHeartburn: true, only: ['IN', 'SG', 'AE'],
    what: 'Made from fermented batter, and light on the stomach.' },
  { id: 'dosa', name: 'Plain dosa', diet: 'veg', plants: ['rice', 'lentils'], fermented: true, only: ['IN', 'SG', 'AE'],
    what: 'Fermented rice and urad dal batter.' },
  { id: 'sauerkraut', name: 'Sauerkraut', diet: 'veg', plants: ['cabbage'], fermented: true, gassy: true, notIn: ['IN', 'AE'],
    what: 'Fermented cabbage — a spoonful with a meal is enough.' },
  { id: 'rice', name: 'Plain rice', diet: 'veg', plants: ['rice'], gentle: true, settling: true, lightForHeartburn: true,
    what: 'Plain and easy on an unsettled gut.' },
  { id: 'potato', name: 'Boiled potatoes', diet: 'veg', plants: ['potato'], gentle: true, settling: true, lightForHeartburn: true,
    what: 'Plain and filling while your gut settles.' },
  { id: 'toast', name: 'Plain toast', diet: 'veg', allergens: ['wheat'], plants: ['wheat'], settling: true,
    what: 'Plain and easy while your gut settles.' },
  { id: 'ginger', name: 'Ginger tea', diet: 'veg', plants: ['ginger'], nausea: true,
    what: 'Ginger may help settle nausea.' },
  { id: 'peppermint', name: 'Peppermint tea', diet: 'veg', plants: [], gentle: true, heartburnTrigger: true,
    what: 'Many people find it eases wind and bloating.' },
  { id: 'eggs', name: 'Boiled eggs', diet: 'egg', allergens: ['eggs'], plants: [], gentle: true, settling: true, lightForHeartburn: true,
    what: 'Easy protein that most guts handle well.' },
  { id: 'chicken', name: 'Plain grilled chicken', diet: 'meat', plants: [], gentle: true, settling: true, lightForHeartburn: true,
    what: 'Lean, plain protein — easy on an unsettled gut.' },
];

/* ----------------------------------------------------------------------------------------------- */
/* The weekly report                                                                                */
/* ----------------------------------------------------------------------------------------------- */

export interface GutReportInput {
  checks: GutChecks;
  foodDays: FoodDays;
  /** ml of water logged per day (days with none can be left out) */
  waterMlByDay: Record<string, number>;
  waterGoalMl: number;
  /** grams of fibre a day (the person's plan) */
  fibreTarget: number;
  diet: Diet | null | undefined;
  /** label allergen ids and anything the person typed in (src/lib/allergens.ts) */
  allergens: string[];
  /** where they live: some foods are only suggested where they're everyday food */
  country?: CountryCode;
  today?: string;
  /** optional, for the lifestyle patterns: hours slept the night before each day (check-in or watch) */
  sleepHoursByDay?: Record<string, number>;
  /** a workout that day or ≥ 7,000 steps */
  activeByDay?: Record<string, boolean>;
  /** HRV per day (a watch) */
  hrvByDay?: Record<string, number>;
}

export interface GutReport {
  days: string[];
  checkIns: number;
  avgFeel: number | null;
  goodDays: number;
  roughDays: number;
  /** symptoms noted this week, most frequent first */
  symptoms: { id: SymptomId; label: string; days: number }[];
  foodDaysLogged: number;
  /** average a day, over days with food logged; null with fewer than 3 such days */
  fibreAvg: number | null;
  fibreTarget: number;
  plants: string[];
  fermentedDays: number;
  /** average a day over days with water logged; null if none was */
  waterAvgMl: number | null;
  waterGoalMl: number;
  headline: string;
  suggestions: { food: GutFood; reason: string }[];
  goEasy: { name: string; reason: string }[];
  tips: string[];
  /** frequent problems this week: show the "see a doctor if…" note prominently */
  seeDoctor: boolean;
  /** lifestyle patterns over the last 14 days (gutPatterns), strongest first — at most three */
  patterns: string[];
}

/** A worse gut day: rated 1–2, or 3 with something bothering it. */
const isRough = (c: GutCheck | undefined) => !!c && (c.feel <= 2 || (c.feel === 3 && c.symptoms.length > 0));
const round1 = (n: number) => Math.round(n * 10) / 10;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Foods eaten on ≥ 2 days that were followed by a worse gut (that day; the next day counts half) much more often than usual. */
export function possibleTriggers(checks: GutChecks, foodDays: FoodDays, days: string[]): { name: string; times: number; rough: number; sameDay: number }[] {
  const checked = days.filter(d => checks[d]);
  if (checked.length < MIN_CHECKS_FOR_REPORT) return [];
  const usual = checked.filter(d => isRough(checks[d])).length / checked.length;
  if (usual >= 0.75) return []; // nearly every day was rough: nothing stands out
  const seen = new Map<string, { name: string; times: number; rough: number; sameDay: number; weight: number }>();
  for (const day of days) {
    const next = addDays(day, 1);
    if (!checks[day] && !checks[next]) continue; // no way to tell how the gut was after it
    const sameDay = isRough(checks[day]);
    const after = sameDay || isRough(checks[next]);
    const names = new Set((foodDays[day] ?? []).filter(e => e.foodKey !== 'earlier').map(e => e.name.trim().toLowerCase()));
    for (const name of names) {
      const s = seen.get(name) ?? { name, times: 0, rough: 0, sameDay: 0, weight: 0 };
      s.times += 1;
      if (after) s.rough += 1;
      if (sameDay) s.sameDay += 1;
      s.weight += sameDay ? 1 : after ? 0.5 : 0;
      seen.set(name, s);
    }
  }
  return [...seen.values()]
    .filter(s => s.times >= 2 && s.weight / s.times >= 0.75 && s.weight / s.times >= usual + 0.25)
    // eaten on the rough day itself ranks above the day before (most food reactions show within hours)
    .sort((a, b) => b.weight - a.weight || b.times - a.times)
    .slice(0, 3)
    .map(({ name, times, rough, sameDay }) => ({ name, times, rough, sameDay }));
}

export function buildGutReport(input: GutReportInput): GutReport {
  const today = input.today ?? localDayKey();
  const days = reportDays(today);
  const checks = days.map(d => input.checks[d]).filter((c): c is GutCheck => !!c);

  // How the gut was
  const avgFeel = checks.length ? round1(checks.reduce((sum, c) => sum + c.feel, 0) / checks.length) : null;
  const goodDays = checks.filter(c => c.feel >= 4).length;
  const roughDays = checks.filter(c => isRough(c)).length;
  const symptomDays = (id: SymptomId) => checks.filter(c => c.symptoms.includes(id)).length;
  const symptoms = SYMPTOMS.map(s => ({ ...s, days: symptomDays(s.id) })).filter(s => s.days > 0).sort((a, b) => b.days - a.days);

  // What they ate
  const entriesByDay = days.map(d => (input.foodDays[d] ?? []).filter((e: LogEntry) => e.foodKey !== 'earlier'));
  const loggedDays = entriesByDay.filter(es => es.length > 0);
  const foodDaysLogged = loggedDays.length;
  const fibreAvg = foodDaysLogged >= 3
    ? round1(loggedDays.reduce((sum, es) => sum + es.reduce((s, e) => s + entryNutrients(e).fiber, 0), 0) / foodDaysLogged)
    : null;
  const eatenNames = entriesByDay.flat().map(e => e.name);
  const plants = [...new Set(eatenNames.flatMap(plantsIn))].sort();
  const fermentedDays = entriesByDay.filter(es => es.some(e => isFermented(e.name))).length;
  const waterDays = days.map(d => input.waterMlByDay[d] ?? 0).filter(ml => ml > 0);
  const waterAvgMl = waterDays.length ? Math.round(waterDays.reduce((a, b) => a + b, 0) / waterDays.length) : null;
  // days this week the person already had it: by plant, or for the rest (curd, eggs…) by a telling word in the name
  const eatenOn = (food: GutFood) => {
    const foodWords = foodKeywords(food.name);
    return entriesByDay.filter(es => es.some(e => food.plants.length
      ? plantsIn(e.name).some(p => food.plants.includes(p))
      : foodKeywords(e.name).some(w => foodWords.includes(w)))).length;
  };

  // What stands out (≥ 2 days of a symptom counts; one day can be anything)
  const constipated = symptomDays('constipation') >= 2;
  const loose = symptomDays('loose') >= 2;
  const windy = symptomDays('bloating') >= 2 || symptomDays('gas') >= 2;
  const heartburn = symptomDays('heartburn') >= 2;
  const nauseous = symptomDays('nausea') >= 2;
  const sore = symptomDays('pain') >= 2;
  const lowFibre = fibreAvg !== null && input.fibreTarget > 0 && fibreAvg < input.fibreTarget * 0.7;
  const lowFermented = foodDaysLogged >= 3 && fermentedDays <= 1;
  const lowVariety = foodDaysLogged >= 3 && plants.length < 15;
  const lowWater = waterAvgMl !== null && waterAvgMl < input.waterGoalMl * 0.75;
  const triggers = possibleTriggers(input.checks, input.foodDays, days);

  // Foods to try: scored against this week, only ones that fit the diet and allergens
  const typedAllergies = customAllergies(input.allergens);
  const candidates = GUT_FOODS.filter(f => tagFits(input.diet, f.diet)
    && !(f.allergens ?? []).some(a => input.allergens.includes(a))
    && allergiesIn(f.name, typedAllergies).length === 0
    && (!input.country || ((!f.only || f.only.includes(input.country)) && !f.notIn?.includes(input.country))));
  const scored = candidates.map(f => {
    let score = 0;
    let reason = '';
    const add = (points: number, why: string) => { score += points; if (points > 0 && !reason) reason = why; };
    if (nauseous && f.nausea) add(5, `${f.what} You noted nausea on ${plural(symptomDays('nausea'), 'day')}.`);
    if (loose) {
      if (f.settling) add(4, `${f.what} Plain foods are kinder while your stools are loose.`);
      if (f.fibre && !f.gentle) score -= 4; // NHS: cut down on high-fibre foods while stools are loose
    }
    if (constipated && f.constipation) add(4, `${f.what} You noted constipation on ${plural(symptomDays('constipation'), 'day')}.`);
    if ((lowFibre || constipated) && f.fibre && !loose) {
      add(3, fibreAvg !== null ? `${f.what} Your fibre averaged ${Math.round(fibreAvg)} g of your ${input.fibreTarget} g a day.` : f.what);
    }
    if ((windy || sore) && f.gentle) add(2, `${f.what} A good pick when you’re bloated or windy.`);
    if ((windy || sore) && f.gassy) score -= 5;
    if (heartburn && f.lightForHeartburn) add(2, `${f.what} Light meals are kinder when you get heartburn.`);
    if (heartburn && f.heartburnTrigger) score -= 5;
    // fermented foods, but only gentle ones while the gut is unsettled (not sauerkraut with loose stools or bloating)
    if (lowFermented && f.fermented && !windy && (!loose || f.settling)) add(3, `${f.what} You had fermented foods on ${plural(fermentedDays, 'day')} this week.`);
    if (lowVariety && f.plants.some(p => !plants.includes(p))) add(1, `${f.what} A plant you didn’t have this week — more kinds of plants feed more kinds of gut bacteria.`);
    const eaten = eatenOn(f);
    if (eaten >= 3) score -= 3; // already a regular: suggest something new
    if (triggers.some(t => f.plants.some(p => plantsIn(t.name).includes(p)) || wordsOf(t.name).includes(f.id))) score -= 10;
    return { food: f, reason, score };
  });
  const suggestions = scored.filter(s => s.score > 0 && s.reason).sort((a, b) => b.score - a.score).slice(0, 5)
    .map(({ food, reason }) => ({ food, reason }));

  // Foods to go easy on: first the person's own possible triggers, then foods they ate this week that are known to
  // cause what they noted
  const goEasy: { name: string; reason: string }[] = triggers.map(t => ({
    name: titleCase(t.name),
    reason: `You had it on ${plural(t.times, 'day')}, and your gut was worse that day or the next ${t.rough === t.times ? 'every time' : `${t.rough} of those times`}. It could be a coincidence — try a few days without it and see.`,
  }));
  const eatenAlready = (name: string) => goEasy.some(g => g.name.toLowerCase() === name.toLowerCase());
  const addEaten = (words: string[], why: string) => {
    const names = [...new Set(eatenNames.filter(n => hasAny(n, words)).map(n => n.trim().toLowerCase()))];
    for (const n of names.slice(0, 2)) if (!eatenAlready(n) && goEasy.length < 4) goEasy.push({ name: titleCase(n), reason: why });
  };
  if (windy) addEaten(GASSY_WORDS, 'Can cause wind and bloating for some people.');
  if (heartburn) addEaten(HEARTBURN_WORDS, 'Can bring on heartburn.');
  if (loose) addEaten(LOOSE_WORDS, 'Worth cutting down while your stools are loose.');

  // Tips
  const tips: string[] = [];
  if (constipated) tips.push('Drink plenty of water and add fibre a little at a time — a sudden jump can cause wind. A daily walk helps too.');
  if (loose) tips.push('Keep drinking fluids. Go easy on high-fibre foods, fatty or spicy food, caffeine, alcohol and sugar-free sweets until it settles.');
  if (windy) tips.push('Eat regularly and slowly, and go easy on fizzy drinks and sugar-free sweets.');
  if (heartburn) tips.push('Try smaller meals, and finish eating 3–4 hours before bed.');
  if (nauseous) tips.push('Small, plain meals and sips of water are easier while you feel sick.');
  if (lowFibre && !loose && !constipated) tips.push('Build fibre up slowly over a few weeks, with plenty to drink.');
  if (lowWater && waterAvgMl !== null) tips.push(`You drank about ${waterAvgMl} ml a day, under your ${input.waterGoalMl} ml goal. Fibre works best with plenty of fluid.`);
  if (lowVariety) tips.push(`You had ${plural(plants.length, 'different plant')} this week. Aiming for ${PLANTS_GOAL} — fruit, vegetables, pulses, grains, nuts and seeds all count — is linked to more varied gut bacteria.`);
  if (foodDaysLogged < 3) tips.push('Log what you eat on more days, and the next report can match foods to how your gut felt.');

  const maxSymptomDays = symptoms[0]?.days ?? 0;
  const seeDoctor = roughDays >= 5 || maxSymptomDays >= 5 || symptomDays('pain') >= 3;

  const headline = checks.length === 0 ? 'No gut check-ins this week.'
    : avgFeel !== null && avgFeel >= 4 && roughDays <= 1 ? 'Your gut had a good week.'
    : avgFeel !== null && (avgFeel <= 2.5 || roughDays >= 4) ? 'Your gut had a rough week.'
    : 'A mixed week for your gut.';

  return {
    days, checkIns: checks.length, avgFeel, goodDays, roughDays, symptoms,
    foodDaysLogged, fibreAvg, fibreTarget: input.fibreTarget, plants, fermentedDays,
    waterAvgMl, waterGoalMl: input.waterGoalMl,
    headline, suggestions, goEasy, tips, seeDoctor,
    patterns: gutPatterns(input),
  };
}

/* ----------------------------------------------------------------------------------------------- */
/* Lifestyle patterns                                                                               */
/* ----------------------------------------------------------------------------------------------- */

export const PATTERN_DAYS = 14;
const MIN_SIDE = 3;
const MIN_GAP = 0.4;

/**
 * How the gut went on days with and without something (sleep, activity, water, fibre, late meals, HRV) over the last
 * 14 days. A pattern needs ≥ 3 checked-in days on each side and a ≥ 40-point difference in how often the gut was rough.
 */
export function gutPatterns(input: GutReportInput): string[] {
  const today = input.today ?? localDayKey();
  const days = Array.from({ length: PATTERN_DAYS }, (_, i) => addDays(today, i - (PATTERN_DAYS - 1))).filter(d => input.checks[d]);
  const rough = (d: string) => isRough(input.checks[d]);
  const found: { gap: number; text: string }[] = [];
  const compare = (has: (d: string) => boolean | null, yes: string, no: string, advice: string) => {
    const withIt = days.filter(d => has(d) === true), without = days.filter(d => has(d) === false);
    if (withIt.length < MIN_SIDE || without.length < MIN_SIDE) return;
    const a = withIt.filter(rough).length, b = without.filter(rough).length;
    const gap = b / without.length - a / withIt.length; // positive: better with it
    if (Math.abs(gap) < MIN_GAP) return;
    const [good, goodN, goodRough, bad, badN, badRough] = gap > 0
      ? [yes, withIt.length, a, no, without.length, b] : [no, without.length, b, yes, withIt.length, a];
    found.push({ gap: Math.abs(gap), text: `Your gut was rough on ${badRough} of ${badN} days ${bad}, and ${goodRough} of ${goodN} ${good}.${gap > 0 ? ` ${advice}` : ''}` });
  };

  const sleep = input.sleepHoursByDay ?? {};
  compare(d => (typeof sleep[d] === 'number' ? sleep[d] >= 7 : null), 'after 7 hours of sleep or more', 'after less than 7 hours of sleep', 'Sleep and gut health are linked — a steady bedtime may help.');
  const active = input.activeByDay ?? {};
  compare(d => (d in active ? active[d] : null), 'on active days', 'on quieter days', 'Moving more keeps things moving.');
  compare(d => (input.waterMlByDay[d] ? input.waterMlByDay[d] >= input.waterGoalMl * 0.75 : null), 'when you drank most of your water', 'with less water', 'Fibre needs fluid to work well.');
  const fibreOn = (d: string) => {
    const es = (input.foodDays[d] ?? []).filter(e => e.foodKey !== 'earlier');
    if (es.length === 0 || input.fibreTarget <= 0) return null;
    return es.reduce((t, e) => t + entryNutrients(e).fiber, 0) >= input.fibreTarget * 0.7;
  };
  compare(fibreOn, 'with most of your fibre', 'with little fibre', 'Build fibre up slowly, with plenty to drink.');
  const lateMealBefore = (d: string) => {
    const es = (input.foodDays[addDays(d, -1)] ?? []).filter(e => e.foodKey !== 'earlier' && Number.isFinite(e.at));
    if (es.length === 0) return null;
    return es.some(e => new Date(e.at).getHours() >= 21);
  };
  // "yes" here is the late meal, so the better side is usually "without": flip the wording
  compare(d => { const late = lateMealBefore(d); return late === null ? null : !late; }, 'after an earlier last meal', 'after eating after 9 pm', 'Finishing eating a few hours before bed can help, especially with heartburn.');
  const hrv = input.hrvByDay ?? {};
  const hrvValues = Object.values(hrv).filter(v => v > 0).sort((a, b) => a - b);
  if (hrvValues.length >= 6) {
    const median = hrvValues[Math.floor(hrvValues.length / 2)];
    compare(d => (typeof hrv[d] === 'number' ? hrv[d] >= median : null), 'on calmer days (higher HRV)', 'on more stressful days (lower HRV)', 'Stress affects the gut — even a short walk or some slow breathing can help.');
  }
  return found.sort((x, y) => y.gap - x.gap).slice(0, 3).map(f => f.text);
}
