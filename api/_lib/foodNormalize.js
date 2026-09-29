// What a food is called, turned into what to look it up by: "2 slices of watermelon" → "watermelon", "a bowl of curd"
// → "yogurt", "masala chai" → "tea with milk". Plain word rules, no model calls: the same words always give the same
// query. Amounts are the app's business (it keeps them); here they only get in the way of the lookup.

// How food is served or cut, not what it is
const PIECE_WORDS = ['slice', 'wedge', 'piece', 'chunk', 'cube', 'bowl', 'cup', 'glass', 'mug', 'plate', 'katori', 'serving',
  'portion', 'helping', 'handful', 'scoop', 'spoonful', 'tablespoon', 'teaspoon', 'tbsp', 'tsp'];
const SIZE_WORDS = ['small', 'medium', 'large', 'big', 'little', 'regular'];
const FILLER_WORDS = ['a', 'an', 'the', 'some', 'of', 'one', 'half'];
// Foods whose name has a piece word in it
const KEEP_WHOLE = ['glass noodle', 'cup noodle'];
// Short forms of a word, wherever they appear: "veg biryani" is vegetable biryani
const WORD_SYNONYMS = { veg: 'vegetable', veggie: 'vegetable', veggies: 'vegetable' };
// Whole names only: "curd" is yogurt, but "curd rice" is a dish of its own
const SYNONYMS = {
  curd: 'yogurt', dahi: 'yogurt',
  chai: 'tea with milk', 'masala chai': 'tea with milk', 'cutting chai': 'tea with milk', 'milk tea': 'tea with milk',
};

/** "slices" → "slice", "glasses" → "glass", "berries" → "berry", "tomatoes" → "tomato" */
export const singularWord = word => word.replace(/ies$/, 'y').replace(/sses$/, 'ss').replace(/(o|ch|sh|x)es$/, '$1').replace(/([^s])s$/, '$1');

/** { query }: the words to search the food databases with. */
export function normalizeFoodName(name) {
  const text = String(name ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b\d+(\.\d+)?\b/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(w => w && !FILLER_WORDS.includes(w)).map(w => WORD_SYNONYMS[w] ?? w);
  const keepWhole = KEEP_WHOLE.some(k => words.map(singularWord).join(' ').includes(k));
  const food = keepWhole ? words : words.filter(w => !SIZE_WORDS.includes(w) && !PIECE_WORDS.includes(singularWord(w)));
  // nothing left ("a bowl"): the name as it was
  const query = food.join(' ') || text;
  return { query: SYNONYMS[query] ?? query };
}
