// What someone eats: everything, or vegetarian with or without eggs. "Vegetarian" alone is ambiguous — eggs are usually
// fine in the UK and usually aren't in India — so the choice says which. Meat, fish and (for some) eggs are left out of
// every suggestion (meal ideas, gut report), and pointed out when a checked food has them.
//
// Checked foods are matched on their words: the name for typed and photo checks, name + ingredients for barcode products
// (which also carry Open Food Facts' own vegetarian status and label allergens). Whole words only, so "eggplant" is fine.

export type Diet = 'everything' | 'vegetarian' | 'vegetarian-no-egg';

export const DIET_OPTIONS: { value: Diet; label: string; hint: string }[] = [
  { value: 'everything', label: 'I eat everything', hint: 'Meat, fish and eggs included' },
  { value: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish · eggs are fine' },
  { value: 'vegetarian-no-egg', label: 'Vegetarian, no eggs', hint: 'No meat, fish or eggs' },
];

export const dietLabel = (diet: Diet | null | undefined) =>
  diet === 'vegetarian' ? 'Vegetarian' : diet === 'vegetarian-no-egg' ? 'Vegetarian, no eggs' : 'Everything';

export const isVegetarian = (diet: Diet | null | undefined) => diet === 'vegetarian' || diet === 'vegetarian-no-egg';

/** What a food has that a vegetarian might not eat: the meat or fish word found (null = none), and whether it has egg. */
export interface DietCheck { meat: string | null; egg: boolean; }

// Always meat or fish, whatever else the name says ("chicken and vegetable soup").
const MEAT_WORDS = [
  'chicken', 'mutton', 'lamb', 'beef', 'pork', 'ham', 'turkey', 'duck', 'goat', 'veal', 'venison', 'rabbit', 'salami',
  'pepperoni', 'chorizo', 'prosciutto', 'pancetta', 'gosht', 'nihari', 'haleem', 'boti', 'liver', 'steak', 'meat', 'meats',
  'gelatine', 'gelatin', 'lard', 'anchovy', 'anchovies', 'jerky', 'pate',
  'fish', 'fishes', 'salmon', 'tuna', 'cod', 'haddock', 'mackerel', 'sardine', 'sardines', 'trout', 'tilapia', 'basa',
  'hamburger', 'hamburgers', 'cheeseburger', 'hotdog', 'hotdogs', 'carne', 'doner',
  'pomfret', 'rohu', 'hilsa', 'surmai', 'bangda', 'kipper', 'kippers', 'hammour', 'grouper', 'bass', 'seabass', 'barramundi',
  'kingfish', 'snapper', 'prawn', 'prawns', 'shrimp', 'shrimps', 'crab',
  'lobster', 'squid', 'calamari', 'octopus', 'oyster', 'oysters', 'mussel', 'mussels', 'clam', 'clams', 'scallop',
  'scallops', 'seafood', 'caviar', 'fishcake', 'fishcakes',
];
// Meat unless the name says it's a vegetarian version ("veggie sausage", "soya keema", "vegan bacon").
const USUALLY_MEAT_WORDS = ['sausage', 'sausages', 'bacon', 'mince', 'keema', 'kheema', 'meatball', 'meatballs', 'nuggets', 'burger',
  'burgers', 'kebab', 'kebabs', 'kabab', 'seekh', 'shawarma', 'bolognese', 'carbonara'];
const VEG_VERSION_WORDS = ['veg', 'veggie', 'vegetable', 'vegetables', 'vegetarian', 'vegan', 'soya', 'soy', 'tofu', 'paneer',
  'mushroom', 'mushrooms', 'quorn', 'jackfruit', 'meatless', 'meat-free', 'plant-based', 'bean', 'beans', 'lentil', 'chickpea'];
const EGG_WORDS = ['egg', 'eggs', 'omelette', 'omelettes', 'omelet', 'frittata', 'anda', 'mayonnaise', 'mayo', 'quiche', 'meringue', 'eggnog'];
const NO_EGG_PHRASES = ['eggless', 'egg-free', 'egg free', 'without egg', 'without eggs', 'no egg', 'no eggs', 'vegan'];

const wordsOf = (text: string): string[] => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+(?:-[a-z]+)*/g) ?? [];

/** What a food's words say about meat, fish and egg. */
export function checkFood(text: string): DietCheck {
  const lower = text.toLowerCase();
  const words = wordsOf(text);
  const has = (list: string[]) => words.find(w => list.includes(w) || list.includes(w.replace(/-/g, ' '))) ?? null;
  const vegan = words.includes('vegan');
  const vegVersion = !!has(VEG_VERSION_WORDS);
  const meat = vegan ? null : has(MEAT_WORDS) ?? (vegVersion ? null : has(USUALLY_MEAT_WORDS));
  const noEgg = NO_EGG_PHRASES.some(p => lower.includes(p));
  return { meat, egg: !noEgg && !!has(EGG_WORDS) };
}

/**
 * A barcode product: its name and ingredients, plus what Open Food Facts says (vegetarian = false means it has meat or
 * fish even if no word here matched) and whether the label lists eggs as an allergen.
 */
export function checkProduct(name: string, ingredients: string | undefined, offVegetarian: boolean | null | undefined, allergens: string[] | undefined): DietCheck {
  // "May contain fish" / "made in a factory that handles egg" is about traces, not what's in it
  const contents = (ingredients ?? '').split(/may contain|traces of|made in a|produced in a|manufactured in|packed in a|made on a/i)[0];
  const found = checkFood(`${name} ${contents}`);
  return {
    // Open Food Facts reads the whole ingredient list: trust a clear answer either way over a word match
    meat: offVegetarian === true ? null : found.meat ?? (offVegetarian === false ? 'meat or fish' : null),
    egg: found.egg || !!allergens?.includes('eggs'),
  };
}

export function fitsDiet(diet: Diet | null | undefined, check: DietCheck): boolean {
  if (diet === 'vegetarian') return !check.meat;
  if (diet === 'vegetarian-no-egg') return !check.meat && !check.egg;
  return true;
}

/** A short line for the food result, or null when the food fits (or the person eats everything). */
export function dietNote(diet: Diet | null | undefined, check: DietCheck): string | null {
  if (!isVegetarian(diet)) return null;
  if (check.meat) return `Not vegetarian: it has ${check.meat}.`;
  if (diet === 'vegetarian-no-egg' && check.egg) return 'Has egg, which you’ve said you don’t eat.';
  return null;
}

/** For lists of ideas tagged by hand: 'veg' (no meat, fish or egg), 'egg' (has egg, no meat or fish), 'meat' (meat or fish). */
export type DietTag = 'veg' | 'egg' | 'meat';
export const tagFits = (diet: Diet | null | undefined, tag: DietTag) =>
  diet === 'vegetarian' ? tag !== 'meat' : diet === 'vegetarian-no-egg' ? tag === 'veg' : true;
