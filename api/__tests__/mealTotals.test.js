// api/_lib/mealTotals.js: a meal's totals and its numbers per 100 g.
import { describe, expect, it } from 'vitest';
import { combine, gramsOf } from '../_lib/mealTotals.js';

const KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'satFat', 'sugars', 'sodium', 'potassium', 'iron', 'calcium'];
const part = (grams, values, missing = []) => ({
  grams, nutrientValues: Object.fromEntries(KEYS.map((k, i) => [k, values[i] ?? 0])), missing: new Set(missing),
});

describe('gramsOf', () => {
  it('turns ml into grams with the density, never 1:1 by default', () => {
    expect(gramsOf(200, 'ml', 1.031)).toBeCloseTo(206.2, 10);
    expect(gramsOf(15, 'ml', 0.913)).toBeCloseTo(13.695, 10);
    expect(gramsOf(80, 'g', 1.031)).toBe(80);
  });
});

describe('combine', () => {
  it('adds each food\'s nutrients from its own numbers and weight', () => {
    const meal = combine([part(50, [392, 9.6]), part(206.2, [61, 3.15]), part(80, [89, 1.09])]);
    expect(meal.grams).toBeCloseTo(336.2, 10);
    expect(meal.totals.calories).toBeCloseTo(196 + 125.782 + 71.2, 10);
    expect(meal.totals.protein).toBeCloseTo(4.8 + 6.4953 + 0.872, 10);
  });

  it('its numbers per 100 g, times its weight, give back exactly the totals', () => {
    // any mix of foods and weights
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let run = 0; run < 50; run++) {
      const parts = Array.from({ length: 1 + Math.floor(random() * 6) }, () =>
        part(5 + random() * 400, KEYS.map(() => random() * 300)));
      const meal = combine(parts);
      for (const k of KEYS) expect((meal.nutrientValues[k] * meal.grams) / 100).toBeCloseTo(meal.totals[k], 8);
    }
  });

  it('a nutrient any food lacks is missing for the meal; the main five never are', () => {
    const meal = combine([part(100, [100, 5, 10, 2, 1, 1, 3, 50]), part(100, [200, 10, 20, 4, 2], ['satFat', 'sugars', 'sodium'])]);
    expect([...meal.missing].sort()).toEqual(['satFat', 'sodium', 'sugars']);
  });
});
