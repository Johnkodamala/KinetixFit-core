// Grams in one millilitre, so an amount in ml is never simply counted as grams (200 ml of milk is 206 g; 15 ml of oil
// is 13.7 g). Where it comes from, first match wins:
//   1. the food table's own figure (scripts/food-table/gen.py works it out from USDA's volume portions),
//   2. the matched USDA food's volume portion — survey (FNDDS) foods come with them: "1 cup = 240 g",
//   3. a short list of known densities by name,
//   4. otherwise 1 g per ml, marked as assumed so the app can show the amount as an estimate.
// No conversion is needed at all when the amount and the nutrition are in the same unit (ml × per 100 ml).

// Volumes in ml. The largest one USDA gives is the most precise (a cup before a spoon).
const VOLUME_ML = [['cup', 236.588], ['fl oz', 29.5735], ['tablespoon', 14.787], ['tbsp', 14.787], ['teaspoon', 4.929], ['tsp', 4.929]];

// Typical densities, first match wins: "coconut milk" before "milk", "tea with milk" as tea.
export const KNOWN_DENSITIES = [
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

/** Grams per ml from USDA volume portions ({ disseminationText: '1 cup', gramWeight: 240 }), or null. */
export function densityFromMeasures(foodMeasures) {
  for (const [unit, ml] of VOLUME_ML) {
    for (const m of foodMeasures ?? []) {
      const text = String(m.disseminationText ?? '').trim().toLowerCase();
      // "1 fl oz (with ice)" weighs the ice too
      const match = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*${unit}\\b(?!.*\\bwith ice\\b)`));
      if (!match || !(m.gramWeight > 0)) continue;
      return Math.round((m.gramWeight / ((match[1] ? Number(match[1]) : 1) * ml)) * 1000) / 1000;
    }
  }
  return null;
}

/**
 * The density to use for a food: { gPerMl, from } where from is 'table', 'usda', 'known' or 'assumed' (1 g per ml,
 * nothing better known).
 */
export function densityFor(name, { tableFood, foodMeasures } = {}) {
  if (tableFood?.mlToG) return { gPerMl: tableFood.mlToG, from: 'table' };
  const measured = densityFromMeasures(foodMeasures);
  if (measured) return { gPerMl: measured, from: 'usda' };
  const text = String(name ?? '').toLowerCase();
  const known = KNOWN_DENSITIES.find(([pattern]) => pattern.test(text));
  if (known) return { gPerMl: known[1], from: 'known' };
  return { gPerMl: 1, from: 'assumed' };
}
