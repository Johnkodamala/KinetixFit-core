// Grams per ml (api/_lib/density.js): where the figure comes from, in order, and what's never assumed.
import { describe, expect, it } from 'vitest';
import { KNOWN_DENSITIES, densityFor, densityFromMeasures } from '../_lib/density.js';
import { FOOD_TABLE } from '../_lib/foodTable.js';
import { KNOWN_DENSITIES as APP_DENSITIES } from '../../src/lib/foodLog.ts';

it('the app uses the same known densities as the server', () => {
  const list = densities => densities.map(([pattern, gPerMl]) => [pattern.source, pattern.flags, gPerMl]);
  expect(list(APP_DENSITIES)).toEqual(list(KNOWN_DENSITIES));
});

const table = name => FOOD_TABLE.find(f => f.name === name);

describe('densityFor', () => {
  it('uses the food table first: whole milk is 244 g a cup', () => {
    expect(densityFor('milk', { tableFood: table('Milk, whole') })).toEqual({ gPerMl: 1.031, from: 'table' });
    expect(Math.abs(1.031 - 244 / 236.588)).toBeLessThan(0.001);
  });

  it('then a USDA volume portion: tea with milk, 1 cup = 240 g', () => {
    const measures = [{ disseminationText: '1 small', gramWeight: 360 }, { disseminationText: '1 cup', gramWeight: 240 }];
    expect(densityFor('tea with milk', { foodMeasures: measures })).toEqual({ gPerMl: 1.014, from: 'usda' });
  });

  it('then the known list, first match winning', () => {
    expect(densityFor('olive oil')).toEqual({ gPerMl: 0.92, from: 'known' });
    expect(densityFor('honey')).toEqual({ gPerMl: 1.42, from: 'known' });
    expect(densityFor('coconut milk').gPerMl).toBe(1.02);
    expect(densityFor('milk').gPerMl).toBe(1.03);
    expect(densityFor('masala chai').gPerMl).toBe(1.0);
    expect(densityFor('orange juice').gPerMl).toBe(1.04);
    expect(densityFor('vanilla ice cream').gPerMl).toBe(0.55);
  });

  it('otherwise 1 g per ml, marked as assumed', () => {
    expect(densityFor('mystery drink')).toEqual({ gPerMl: 1, from: 'assumed' });
    // whole words only: "boiled" isn't oil
    expect(densityFor('boiled rice')).toEqual({ gPerMl: 1, from: 'assumed' });
  });
});

describe('densityFromMeasures', () => {
  it('prefers a cup to a spoon and skips portions weighed with ice', () => {
    expect(densityFromMeasures([{ disseminationText: '1 tablespoon', gramWeight: 16 }, { disseminationText: '2 cup', gramWeight: 480 }])).toBe(1.014);
    expect(densityFromMeasures([{ disseminationText: '1 fl oz (with ice)', gramWeight: 23 }, { disseminationText: '1 fl oz (no ice)', gramWeight: 30 }])).toBe(1.014);
  });

  it('gives nothing without a volume portion', () => {
    expect(densityFromMeasures([{ disseminationText: '1 medium', gramWeight: 118 }])).toBeNull();
    expect(densityFromMeasures(undefined)).toBeNull();
  });
});
