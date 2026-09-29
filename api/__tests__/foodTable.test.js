// The server's copy of the food table (api/_lib/foodTable.js) must match the app's (src/lib/foodTable.ts): both are
// written by scripts/food-table/gen.py, and a photo or a typed check should find the same food either way.
import { describe, expect, it } from 'vitest';
import { FOOD_TABLE as SERVER } from '../_lib/foodTable.js';
import { FOOD_TABLE as APP } from '../../src/lib/foodTable.ts';

describe('food table on the server', () => {
  it('has the same foods and numbers as the app', () => {
    expect(SERVER.map(({ description, ...food }) => food)).toEqual(APP);
  });

  it('names the USDA food each entry came from', () => {
    for (const food of SERVER) expect(food.description, food.name).toMatch(/\w/);
    expect(SERVER.find(f => f.name === 'Banana').description).toBe('Bananas, raw');
  });

  it('marks the drinks, and gives poured foods a density without making them drinks', () => {
    expect(SERVER.filter(f => f.drink).map(f => f.name).sort()).toEqual([
      'Buttermilk (chaas)', 'Coconut water', 'Coffee, black', 'Milk, semi-skimmed', 'Milk, skimmed', 'Milk, whole', 'Soya milk',
      'Tea, black (no milk)',
    ]);
    for (const name of ['Olive oil', 'Ghee', 'Honey', 'Sambar', 'Lentil soup', 'Curry sauce']) {
      const food = SERVER.find(f => f.name === name);
      expect(food.drink, name).toBeUndefined();
      expect(food.mlToG, name).toBeGreaterThan(0.8);
    }
    // USDA's own volume portions: honey 339 g a cup, olive oil 13.5 g a tablespoon
    expect(SERVER.find(f => f.name === 'Honey').mlToG).toBe(1.433);
    expect(SERVER.find(f => f.name === 'Olive oil').mlToG).toBe(0.913);
  });
});
