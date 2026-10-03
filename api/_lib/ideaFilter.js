// Which of the model's meal ideas (api/suggest-meals.js) the person can have. The model is asked to leave out their allergens and
// to say what each dish contains, but it can miss that hummus is made with tahini, which is sesame. So the dish's own words are
// checked too (api/_lib/allergenWords.js, the same lists as the app's src/lib/allergens.ts).
import { labelAllergensIn } from './allergenWords.js';

export const LABEL_ALLERGENS = ['celery', 'wheat', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soya', 'sulphur dioxide'];

export const wordsOf = (text) => String(text).toLowerCase().match(/[a-z]+/g) ?? [];
// singular, near enough: "strawberries" → "strawberry", "kiwis" → "kiwi"
const stem = (w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && /(ches|shes|oes|sses|xes)$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** Whether every word of an allergy the person typed is in the text ("kiwi" also finds "kiwifruit"). */
export const mentions = (text, allergy) => {
  const have = wordsOf(text).map(stem);
  const wanted = wordsOf(allergy).map(stem);
  return wanted.length > 0 && wanted.every(w => have.some(h => h === w || (w.length >= 4 && h.startsWith(w))));
};

/**
 * The model's ideas that break none of the person's rules, best first, at most `limit`, with the model's `containsAllergens`
 * handed on as `allergens` and its other bookkeeping fields dropped.
 * - allergens: what the model says the dish contains; label allergens by the foods they're in; anything the person typed by its words
 * - the country's avoided meats by name, the diet (vegetarian: no meat or fish; no egg: no egg), dishes already shown today
 */
export function keepSuggestions(suggestions, { allergens, countryAvoid = [], diet, alreadySuggested = [], limit = Infinity }) {
  const allergies = allergens.map(a => String(a).toLowerCase());
  const labelIds = allergies.filter(a => LABEL_ALLERGENS.includes(a));
  const typed = allergies.filter(a => !LABEL_ALLERGENS.includes(a));
  return (suggestions || [])
    .filter(s => !(s.containsAllergens || []).some(a => allergies.includes(String(a).toLowerCase())))
    .filter(s => labelAllergensIn(`${s.name} ${s.description}`, labelIds).length === 0)
    .filter(s => !typed.some(a => mentions(`${s.name} ${s.description}`, a)))
    .filter(s => !wordsOf(`${s.name} ${s.description}`).some(w => countryAvoid.includes(w)))
    .filter(s => !(diet !== 'everything' && s.containsMeatOrFish) && !(diet === 'vegetarian-no-egg' && s.containsEgg))
    .filter(s => !alreadySuggested.some(n => n.toLowerCase() === String(s.name).toLowerCase()))
    .slice(0, limit)
    .map(({ containsAllergens, containsMeatOrFish, containsEgg, ...s }) => ({ ...s, allergens: containsAllergens }));
}
