// A meal of several foods as one: each food's nutrients from its own numbers per 100 g and its weight, added up
// unrounded; the meal's numbers per 100 g are those totals over the meal's total weight — so per 100 g × total weight
// gives back exactly the totals. Rounding is left to whoever shows them (buildResult in api/scan-meal.js), once.
import { NUTRIENT_IDS } from './nutrition.js';

const KEYS = Object.keys(NUTRIENT_IDS);
// every food has these; the rest (sat fat, sugars, minerals) are sometimes missing from a database
const CORE = ['calories', 'protein', 'carbs', 'fat', 'fiber'];

/** Weight in grams: ml × grams per ml for an amount in ml (never simply ml as grams). */
export const gramsOf = (amount, unit, density) => (unit === 'ml' ? amount * density : amount);

/**
 * parts: [{ grams, nutrientValues (per 100 g), missing: Set }] → { grams, totals, nutrientValues (per 100 g), missing }.
 * A nutrient any part lacks is missing for the meal too: a total that left some foods out would look complete.
 */
export function combine(parts) {
  const grams = parts.reduce((sum, p) => sum + p.grams, 0);
  const totals = Object.fromEntries(KEYS.map(k => [k, parts.reduce((sum, p) => sum + (p.nutrientValues[k] * p.grams) / 100, 0)]));
  return {
    grams,
    totals,
    nutrientValues: Object.fromEntries(KEYS.map(k => [k, grams > 0 ? (totals[k] * 100) / grams : 0])),
    missing: new Set(KEYS.filter(k => !CORE.includes(k) && parts.some(p => p.missing.has(k)))),
  };
}
