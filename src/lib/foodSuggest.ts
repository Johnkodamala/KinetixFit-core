// "Did you mean avocado?" for a mistyped food. Compares what was typed with the names the app already knows (the food
// table and the person's saved foods) by edit distance, so a typo asks first instead of searching a database where a
// misspelling can match a branded product's misspelt name ("avacado" once logged a 46 kcal/100 g spread as an avocado).
// Deliberately small: it never changes anything by itself, says nothing for a food that is spelt right or is not close
// to anything, and stays silent when two different foods are equally close.
import { FOOD_TABLE } from './foodTable';
import { parseTypedPortion } from './foodLog';

/** `name` is what to show ("chicken breast"), `food` identifies the food it names, `norm` is what typed text is compared with. */
export interface VocabEntry { name: string; food: string; norm: string; }

// Words that don't change which food it is (as in findTableFood)
const FILLER = /\b(a|an|one|the|medium|large|small|big|fresh|raw|ripe|whole|plain|some|of)\b/g;
const singular = (word: string) => word.replace(/ies$/, 'y').replace(/(o|ch|sh|x)es$/, '$1').replace(/([^s])s$/, '$1');
const norm = (text: string) =>
  text.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map(singular).join(' ');

/** Every name the app knows, each tied to the food it names: the table's names, and the person's saved foods. */
export function typoVocabulary(savedNames: string[]): VocabEntry[] {
  const entries: VocabEntry[] = [];
  for (const f of FOOD_TABLE) for (const n of f.names) entries.push({ name: n, food: f.name, norm: norm(n) });
  for (const n of savedNames) entries.push({ name: n, food: n, norm: norm(n) });
  return entries.filter(e => e.norm);
}

// Edit distance where swapping two neighbouring letters ("paratah") counts as one edit.
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Of two names for one food, the one worth showing: plural if the person typed a plural ("lentills" → "lentils"), else the shorter.
const plural = (t: string) => /s$/i.test(t.trim());
const closer = (a: string, b: string, typed: string) =>
  plural(a) !== plural(b) ? plural(a) === plural(typed) : a.length < b.length;

// How many edits still look like a typo: none for very short words, 1 up to 8 letters, 2 beyond.
const allowedEdits = (len: number) => (len < 4 ? 0 : len < 9 ? 1 : 2);

/** The name of the food the person probably meant by `typed` (a food name, no amount), or null: spelt right, too far off, or ambiguous. */
export function suggestFoodName(typed: string, vocab: VocabEntry[]): string | null {
  const wanted = norm(typed);
  if (wanted.length < 4 || vocab.some(e => e.norm === wanted)) return null;
  const max = allowedEdits(wanted.length);
  let best = Infinity;
  // per food, its closest name — the shortest when several are as close ("avocado" over "avocados")
  let foods = new Map<string, string>();
  for (const e of vocab) {
    if (Math.abs(e.norm.length - wanted.length) > max) continue;
    const dist = distance(wanted, e.norm);
    // a wrong first letter is rarely a slip of the fingers: only trust it for a single edit in a longer word
    if (dist > max || (e.norm[0] !== wanted[0] && !(dist === 1 && wanted.length >= 6))) continue;
    if (dist > best) continue;
    if (dist < best) { best = dist; foods = new Map(); }
    const have = foods.get(e.food);
    if (have === undefined || closer(e.name, have, typed)) foods.set(e.food, e.name);
  }
  return foods.size === 1 ? [...foods.values()][0] : null;
}

/**
 * For whatever was typed in the search box ("2 avacados", "150 g chiken breast"): the food it was probably meant to be
 * and the same text with that name put in, so the amount is kept. null when nothing looks mistyped.
 */
export function suggestionFor(input: string, vocab: VocabEntry[]): { name: string; corrected: string } | null {
  const { name } = parseTypedPortion(input);
  const name2 = suggestFoodName(name, vocab);
  if (!name2) return null;
  const at = input.toLowerCase().lastIndexOf(name.toLowerCase());
  const corrected = at < 0 ? name2 : `${input.slice(0, at)}${name2}${input.slice(at + name.length)}`;
  return { name: name2, corrected };
}
