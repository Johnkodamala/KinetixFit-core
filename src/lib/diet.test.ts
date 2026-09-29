import { describe, expect, it } from 'vitest';
import { checkFood, checkProduct, dietLabel, dietNote, fitsDiet, isVegetarian, tagFits } from './diet';

describe('checkFood', () => {
  it.each([
    ['Chicken biryani', 'chicken'],
    ['Chicken breast, roasted', 'chicken'],
    ['Mutton rogan josh', 'mutton'],
    ['Fish curry', 'fish'],
    ['Prawn masala', 'prawn'],
    ['Tuna, canned in water', 'tuna'],
    ['Beef mince, cooked', 'beef'],
    ['Chicken and vegetable soup', 'chicken'],
    ['Pepperoni pizza', 'pepperoni'],
    ['Hamburger', 'hamburger'],
    ['Chilli con carne', 'carne'],
    ['Gelatine sweets', 'gelatine'],
    ['Sausage roll', 'sausage'],
    ['Seekh kebab', 'seekh'],
  ])('%s has meat or fish (%s)', (name, word) => {
    expect(checkFood(name).meat).toBe(word);
  });

  it.each([
    'Vegetable biryani', 'Paneer tikka', 'Dal', 'Idli', 'Masala dosa', 'Palak paneer', 'Veg burger', 'Soya keema',
    'Vegan sausage', 'Bean burger', 'Mushroom and tofu stir-fry', 'Aubergine curry', 'Eggplant parmesan', 'Banana',
  ])('%s has no meat or fish', name => {
    expect(checkFood(name).meat).toBeNull();
  });

  it('finds egg as a whole word only', () => {
    expect(checkFood('Egg fried rice').egg).toBe(true);
    expect(checkFood('Masala omelette').egg).toBe(true);
    expect(checkFood('Anda bhurji').egg).toBe(true);
    expect(checkFood('Chicken mayo sandwich').egg).toBe(true);
    expect(checkFood('Eggplant bharta').egg).toBe(false);
    expect(checkFood('Eggless chocolate cake').egg).toBe(false);
    expect(checkFood('Vegan mayo').egg).toBe(false);
    expect(checkFood('Paneer bhurji').egg).toBe(false);
  });

  it('is not fooled by case or accents', () => {
    expect(checkFood('CHICKEN TIKKA').meat).toBe('chicken');
    expect(checkFood('Pâté').meat).toBe('pate');
  });
});

describe('checkProduct', () => {
  it('ignores "may contain" traces in the ingredients', () => {
    const r = checkProduct('Digestive biscuits', 'Wheat flour, sugar, palm oil. May contain fish, egg and milk.', null, []);
    expect(r).toEqual({ meat: null, egg: false });
  });

  it('uses the ingredients when Open Food Facts can’t tell', () => {
    expect(checkProduct('Instant noodles', 'Noodles, chicken powder, salt', null, []).meat).toBe('chicken');
  });

  it('trusts a clear Open Food Facts answer', () => {
    expect(checkProduct('Chicken flavour noodles', 'Noodles, flavourings', true, []).meat).toBeNull();
    expect(checkProduct('Crisps', 'Potato, oil, flavouring', false, []).meat).toBe('meat or fish');
  });

  it('counts eggs on the label as egg', () => {
    expect(checkProduct('Sponge cake', 'Flour, sugar', true, ['eggs', 'milk']).egg).toBe(true);
  });
});

describe('fitting a diet', () => {
  const chicken = checkFood('Chicken curry');
  const omelette = checkFood('Cheese omelette');
  const dal = checkFood('Dal');

  it('everything fits someone who eats everything (or hasn’t said)', () => {
    for (const d of ['everything', null, undefined] as const) {
      expect(fitsDiet(d, chicken)).toBe(true);
      expect(dietNote(d, chicken)).toBeNull();
    }
  });

  it('vegetarians eat eggs but not meat or fish', () => {
    expect(fitsDiet('vegetarian', chicken)).toBe(false);
    expect(fitsDiet('vegetarian', omelette)).toBe(true);
    expect(fitsDiet('vegetarian', dal)).toBe(true);
    expect(dietNote('vegetarian', chicken)).toBe('Not vegetarian: it has chicken.');
    expect(dietNote('vegetarian', omelette)).toBeNull();
  });

  it('vegetarians without eggs are told about egg too', () => {
    expect(fitsDiet('vegetarian-no-egg', omelette)).toBe(false);
    expect(dietNote('vegetarian-no-egg', omelette)).toMatch(/egg/i);
    expect(dietNote('vegetarian-no-egg', dal)).toBeNull();
  });

  it('filters hand-tagged ideas', () => {
    expect(tagFits('everything', 'meat')).toBe(true);
    expect(tagFits('vegetarian', 'meat')).toBe(false);
    expect(tagFits('vegetarian', 'egg')).toBe(true);
    expect(tagFits('vegetarian-no-egg', 'egg')).toBe(false);
    expect(tagFits('vegetarian-no-egg', 'veg')).toBe(true);
    expect(tagFits(null, 'meat')).toBe(true);
  });

  it('labels', () => {
    expect(dietLabel(null)).toBe('Everything');
    expect(dietLabel('vegetarian-no-egg')).toBe('Vegetarian, no eggs');
    expect(isVegetarian('vegetarian')).toBe(true);
    expect(isVegetarian('everything')).toBe(false);
  });
});
