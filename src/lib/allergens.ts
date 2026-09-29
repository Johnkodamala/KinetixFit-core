// The person's own allergies (profile.personalAllergens): the allergens their country's food labels must declare
// (src/lib/countries.ts, stored by id: 'milk', 'crustaceans'…), plus anything else they type ("kiwi", "strawberries"),
// stored as typed, in lower case.
//
// - Offered by diet: a vegetarian isn't offered fish, crustaceans or molluscs, and someone who doesn't eat eggs isn't
//   offered eggs either. One they picked before stays on the list, so it can still be taken off.
// - Typed names that mean a label allergen become it ("shellfish" → crustaceans + molluscs, "gluten" → wheat, "soy" →
//   soya), so the allergen tags on meal ideas and barcode labels catch them too.
// - Checking a food: the food's words against each allergy's words — whole words, singular or plural. Label allergens
//   also match the foods they're in ("paneer" → milk, "prawn" → crustaceans, "roti" → wheat); anything typed matches its
//   own words ("kiwi" finds "Kiwi" and "Kiwifruit"). Barcode products also go by the allergens their label lists.
import { isVegetarian, type Diet } from './diet';

/** Every label allergen id, whichever country (the UK's 14 cover all the others). */
export const LABEL_ALLERGENS = ['peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'molluscs', 'soya', 'wheat', 'celery', 'mustard', 'sesame', 'sulphur dioxide', 'lupin'];
export const isLabelAllergen = (a: string) => LABEL_ALLERGENS.includes(a);

/** Allergens that come only from meat, fish or seafood, or eggs — nothing a vegetarian (or non-egg eater) eats. */
const FISH_AND_SEAFOOD = ['fish', 'crustaceans', 'molluscs'];

/** The label allergens to offer: the country's, minus what the diet rules out (unless already picked), plus any picked
 *  from another country's list before moving. */
export function allergenChoices(countryAllergens: string[], diet: Diet | null | undefined, selected: string[]): string[] {
  const hidden = new Set(isVegetarian(diet) ? [...FISH_AND_SEAFOOD, ...(diet === 'vegetarian-no-egg' ? ['eggs'] : [])] : []);
  const offered = countryAllergens.filter(a => !hidden.has(a) || selected.includes(a));
  return [...offered, ...selected.filter(a => isLabelAllergen(a) && !offered.includes(a))];
}

/** Allergies typed in, rather than picked from the label list. */
export const customAllergies = (selected: string[]) => selected.filter(a => !isLabelAllergen(a));

/** How an allergy reads on screen: a label allergen by the country's name for it, a typed one as typed. */
export const allergyName = (a: string, labelName: (id: string) => string) =>
  isLabelAllergen(a) ? labelName(a) : a.charAt(0).toUpperCase() + a.slice(1);

// Typed names that mean a label allergen
const SAME_AS: Record<string, string[]> = {
  peanut: ['peanuts'], peanuts: ['peanuts'], groundnut: ['peanuts'], groundnuts: ['peanuts'],
  nut: ['nuts'], nuts: ['nuts'], 'tree nut': ['nuts'], 'tree nuts': ['nuts'],
  milk: ['milk'], dairy: ['milk'], 'cows milk': ['milk'], "cow's milk": ['milk'], lactose: ['milk'],
  egg: ['eggs'], eggs: ['eggs'],
  fish: ['fish'],
  shellfish: ['crustaceans', 'molluscs'], crustacean: ['crustaceans'], crustaceans: ['crustaceans'],
  mollusc: ['molluscs'], molluscs: ['molluscs'], mollusk: ['molluscs'], mollusks: ['molluscs'],
  soy: ['soya'], soya: ['soya'], soybean: ['soya'], soybeans: ['soya'], soyabean: ['soya'],
  wheat: ['wheat'], gluten: ['wheat'], 'cereals with gluten': ['wheat'],
  celery: ['celery'], mustard: ['mustard'], sesame: ['sesame'], 'sesame seeds': ['sesame'], til: ['sesame'],
  sulphites: ['sulphur dioxide'], sulfites: ['sulphur dioxide'], sulphite: ['sulphur dioxide'], sulfite: ['sulphur dioxide'],
  'sulphur dioxide': ['sulphur dioxide'], 'sulfur dioxide': ['sulphur dioxide'], lupin: ['lupin'], lupine: ['lupin'],
};

export const MAX_TYPED = 20;
const MAX_LENGTH = 40;

/** Tidies what was typed: lower case, plain spaces, letters, digits, hyphens and apostrophes only. */
export const cleanTyped = (text: string) =>
  text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}' -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH).trim();

/**
 * Adds what was typed (commas separate several): label allergens by id, anything else as typed. Returns the new list
 * and what was added, for the confirmation ("Added Kiwi", "Added as Crustaceans and Molluscs").
 */
export function addTyped(selected: string[], typed: string): { next: string[]; added: string[]; full: boolean } {
  const next = [...selected];
  const added: string[] = [];
  let full = false;
  for (const part of typed.split(/,|;|\band\b|&/i)) {
    const name = cleanTyped(part);
    if (name.length < 2) continue;
    for (const a of SAME_AS[name] ?? [name]) {
      if (next.includes(a)) continue;
      if (!isLabelAllergen(a) && customAllergies(next).length >= MAX_TYPED) { full = true; continue; }
      next.push(a);
      added.push(a);
    }
  }
  return { next, added, full };
}

/* ----------------------------------------------------------------------------------------------- */
/* Does a food have one?                                                                            */
/* ----------------------------------------------------------------------------------------------- */

// Words in a food's name (or ingredients) that mean a label allergen is in it
const FOUND_IN: Record<string, string[]> = {
  milk: ['milk', 'milks', 'dairy', 'cheese', 'cheeses', 'paneer', 'curd', 'curds', 'dahi', 'yogurt', 'yogurts', 'yoghurt', 'yoghurts',
    'ghee', 'butter', 'buttermilk', 'cream', 'creamy', 'lassi', 'raita', 'kheer', 'khoa', 'khoya', 'malai', 'whey', 'casein', 'chaas',
    'latte', 'cappuccino', 'custard', 'kulfi', 'rasmalai', 'milkshake', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'ricotta',
    'labneh', 'tzatziki', 'halloumi', 'kefir', 'shrikhand', 'basundi', 'rabri', 'mawa'],
  eggs: ['egg', 'eggs', 'omelette', 'omelettes', 'omelet', 'frittata', 'mayo', 'mayonnaise', 'meringue', 'quiche', 'anda', 'custard'],
  fish: ['fish', 'fishes', 'salmon', 'tuna', 'cod', 'haddock', 'mackerel', 'sardine', 'sardines', 'anchovy', 'anchovies', 'trout',
    'tilapia', 'basa', 'pomfret', 'rohu', 'hilsa', 'surmai', 'bangda', 'kipper', 'kippers', 'pollock', 'hake', 'seabass', 'halibut',
    'snapper', 'catla', 'katla', 'swordfish', 'fishcake', 'fishcakes', 'hammour', 'grouper', 'bass', 'seabass', 'barramundi',
    'kingfish', 'worcestershire'],
  crustaceans: ['prawn', 'prawns', 'shrimp', 'shrimps', 'crab', 'crabs', 'lobster', 'lobsters', 'crayfish', 'langoustine',
    'langoustines', 'scampi', 'krill', 'shellfish', 'seafood'],
  molluscs: ['mussel', 'mussels', 'oyster', 'oysters', 'clam', 'clams', 'squid', 'calamari', 'octopus', 'scallop', 'scallops',
    'snail', 'snails', 'escargot', 'cuttlefish', 'whelk', 'whelks', 'cockle', 'cockles', 'abalone', 'shellfish', 'seafood'],
  nuts: ['nut', 'nuts', 'almond', 'almonds', 'badam', 'cashew', 'cashews', 'kaju', 'walnut', 'walnuts', 'akhrot', 'pistachio',
    'pistachios', 'pista', 'hazelnut', 'hazelnuts', 'pecan', 'pecans', 'macadamia', 'macadamias', 'praline', 'marzipan', 'nutella'],
  peanuts: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'moongphali', 'mungfali', 'satay', 'chikki'],
  soya: ['soy', 'soya', 'soybean', 'soybeans', 'soyabean', 'soyabeans', 'tofu', 'edamame', 'tempeh', 'miso', 'natto'],
  wheat: ['wheat', 'gluten', 'bread', 'breads', 'toast', 'roti', 'rotis', 'chapati', 'chapatis', 'chapatti', 'phulka', 'naan',
    'paratha', 'parathas', 'puri', 'puris', 'poori', 'bhatura', 'bhature', 'kulcha', 'pasta', 'spaghetti', 'macaroni', 'noodle',
    'noodles', 'couscous', 'semolina', 'sooji', 'suji', 'rava', 'upma', 'maida', 'atta', 'bulgur', 'dalia', 'daliya', 'seitan',
    'barley', 'rye', 'spelt', 'cracker', 'crackers', 'biscuit', 'biscuits', 'cookie', 'cookies', 'cake', 'cakes', 'croissant',
    'croissants', 'bagel', 'bagels', 'pizza', 'pita', 'pitta', 'sandwich', 'sandwiches', 'samosa', 'samosas', 'thepla', 'wrap', 'wraps'],
  celery: ['celery', 'celeriac'],
  mustard: ['mustard', 'sarson'],
  sesame: ['sesame', 'tahini', 'hummus', 'houmous', 'gingelly'],
  'sulphur dioxide': ['sulphite', 'sulphites', 'sulfite', 'sulfites', 'wine'],
  lupin: ['lupin', 'lupine'],
};
// "coconut milk", "peanut butter": the word before says it isn't dairy
const NOT_DAIRY_BEFORE = ['coconut', 'almond', 'soy', 'soya', 'oat', 'rice', 'cashew', 'peanut', 'cocoa', 'apple', 'nut', 'shea', 'plant', 'vegan'];
const FREE_OF = /\b(\w+)[- ]free\b|\bno (\w+)\b|\bwithout (\w+)\b/g;

const wordsOf = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]+/g) ?? [];
// singular, near enough: "strawberries" → "strawberry", "tomatoes" → "tomato", "kiwis" → "kiwi"
const stem = (w: string) => w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
  : w.length > 4 && /(ches|shes|oes|sses|xes)$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

/** Whether a label allergen's words are in the text. */
function hasLabelAllergen(id: string, words: string[], freeOf: Set<string>): boolean {
  if (freeOf.has(id) || (id === 'wheat' && freeOf.has('gluten')) || (id === 'milk' && (freeOf.has('dairy') || freeOf.has('lactose')))) return false;
  const list = FOUND_IN[id] ?? [id];
  return words.some((w, i) => {
    if (!list.includes(w)) return false;
    if (id === 'milk' && ['milk', 'milks', 'butter', 'cream'].includes(w) && NOT_DAIRY_BEFORE.includes(words[i - 1])) return false;
    if (id === 'nuts' && ['nut', 'nuts'].includes(w) && ['pea', 'ground', 'coco', 'dough', 'butter', 'pine'].includes(words[i - 1])) return false;
    return true;
  });
}

/** Whether a typed allergy's words are all in the text (singular or plural; "kiwi" also finds "kiwifruit"). */
function hasTyped(allergy: string, words: string[]): boolean {
  const wanted = wordsOf(allergy).map(stem);
  if (wanted.length === 0) return false;
  const have = words.map(stem);
  return wanted.every(w => have.some(h => h === w || (w.length >= 4 && h.startsWith(w))));
}

/** The person's allergies found in a food's name (and, for a product, its ingredients up to "may contain"). */
export function allergiesIn(text: string, allergies: string[]): string[] {
  const contents = text.split(/may contain|traces of|made in a|produced in a|manufactured in|packed in a|made on a/i)[0];
  const words = wordsOf(contents);
  const freeOf = new Set<string>();
  for (const m of contents.toLowerCase().matchAll(FREE_OF)) freeOf.add(m[1] ?? m[2] ?? m[3]);
  if (freeOf.has('egg')) freeOf.add('eggs');
  if (freeOf.has('nut')) freeOf.add('nuts');
  return allergies.filter(a => (isLabelAllergen(a) ? hasLabelAllergen(a, words, freeOf) : hasTyped(a, words)));
}

/** The allergies a food has: what its label lists (barcodes) plus what its name and ingredients show. */
export function flagAllergies(allergies: string[], name: string, labelAllergens?: string[], ingredients?: string): string[] {
  const fromLabel = labelAllergens ? allergies.filter(a => labelAllergens.includes(a)) : [];
  const fromWords = allergiesIn(`${name} ${ingredients ?? ''}`, allergies);
  return allergies.filter(a => fromLabel.includes(a) || fromWords.includes(a));
}
