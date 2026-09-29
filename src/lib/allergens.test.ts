import { describe, expect, it } from 'vitest';
import { addTyped, allergenChoices, allergiesIn, allergyName, cleanTyped, customAllergies, flagAllergies, MAX_TYPED } from './allergens';

const CODEX = ['peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'soya', 'wheat', 'sulphur dioxide'];
const UK_14 = ['peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'molluscs', 'soya', 'wheat', 'celery', 'mustard', 'sesame', 'sulphur dioxide', 'lupin'];

describe('allergenChoices', () => {
  it('offers everything to someone who eats everything', () => {
    expect(allergenChoices(UK_14, 'everything', [])).toEqual(UK_14);
    expect(allergenChoices(UK_14, null, [])).toEqual(UK_14);
  });

  it('leaves fish and seafood out for vegetarians, and eggs too without eggs', () => {
    expect(allergenChoices(UK_14, 'vegetarian', [])).not.toEqual(expect.arrayContaining(['fish']));
    const veg = allergenChoices(UK_14, 'vegetarian', []);
    expect(veg).toContain('eggs');
    expect(veg.some(a => ['fish', 'crustaceans', 'molluscs'].includes(a))).toBe(false);
    const noEgg = allergenChoices(CODEX, 'vegetarian-no-egg', []);
    expect(noEgg).toEqual(['peanuts', 'nuts', 'milk', 'soya', 'wheat', 'sulphur dioxide']);
  });

  it('keeps one already picked, so it can be taken off', () => {
    expect(allergenChoices(CODEX, 'vegetarian', ['fish'])).toContain('fish');
    expect(allergenChoices(CODEX, 'vegetarian-no-egg', ['eggs'])).toContain('eggs');
  });

  it('keeps label allergens picked in another country, but not typed ones', () => {
    const choices = allergenChoices(CODEX, 'everything', ['lupin', 'kiwi']);
    expect(choices).toContain('lupin');
    expect(choices).not.toContain('kiwi');
  });
});

describe('addTyped', () => {
  it('adds what was typed, in lower case, once', () => {
    const { next, added } = addTyped(['milk'], '  Kiwi ');
    expect(next).toEqual(['milk', 'kiwi']);
    expect(added).toEqual(['kiwi']);
    expect(addTyped(next, 'kiwi').added).toEqual([]);
  });

  it('turns names of label allergens into them', () => {
    expect(addTyped([], 'Shellfish').next).toEqual(['crustaceans', 'molluscs']);
    expect(addTyped([], 'gluten').next).toEqual(['wheat']);
    expect(addTyped([], 'Soy').next).toEqual(['soya']);
    expect(addTyped([], 'egg').next).toEqual(['eggs']);
    expect(addTyped([], 'dairy').next).toEqual(['milk']);
  });

  it('takes several at once', () => {
    expect(addTyped([], 'kiwi, strawberries and banana').next).toEqual(['kiwi', 'strawberries', 'banana']);
  });

  it('ignores blanks and stops at the limit', () => {
    expect(addTyped([], ' , ;').next).toEqual([]);
    const many = Array.from({ length: MAX_TYPED }, (_, i) => `food${i}`);
    const r = addTyped(many, 'one more');
    expect(r.full).toBe(true);
    expect(r.next).toHaveLength(MAX_TYPED);
    expect(addTyped(many, 'peanut').next).toContain('peanuts'); // label allergens don't count towards it
  });

  it('cleans what was typed', () => {
    expect(cleanTyped('  Mustard!!  seeds ')).toBe('mustard seeds');
    expect(cleanTyped('Cow’s milk')).toBe('cow s milk');
  });
});

describe('customAllergies and allergyName', () => {
  it('tells typed allergies from label ones and names them', () => {
    expect(customAllergies(['milk', 'kiwi', 'sulphur dioxide', 'raw carrot'])).toEqual(['kiwi', 'raw carrot']);
    expect(allergyName('kiwi', id => id.toUpperCase())).toBe('Kiwi');
    expect(allergyName('nuts', () => 'Tree nuts')).toBe('Tree nuts');
  });
});

describe('allergiesIn', () => {
  it('finds label allergens in the foods they’re in', () => {
    expect(allergiesIn('Paneer tikka', ['milk'])).toEqual(['milk']);
    expect(allergiesIn('Prawn curry', ['crustaceans', 'fish'])).toEqual(['crustaceans']);
    expect(allergiesIn('Two rotis with dal', ['wheat'])).toEqual(['wheat']);
    expect(allergiesIn('Egg fried rice', ['eggs'])).toEqual(['eggs']);
    expect(allergiesIn('Badam milk', ['nuts', 'milk'])).toEqual(['nuts', 'milk']);
    expect(allergiesIn('Hummus and carrot sticks', ['sesame'])).toEqual(['sesame']);
  });

  it('isn’t fooled by look-alike words', () => {
    expect(allergiesIn('Coconut milk curry', ['milk', 'nuts'])).toEqual([]);
    expect(allergiesIn('Peanut butter on toast', ['milk'])).toEqual([]);
    expect(allergiesIn('Eggplant bharta', ['eggs'])).toEqual([]);
    expect(allergiesIn('Butternut squash soup', ['nuts'])).toEqual([]);
    expect(allergiesIn('Nutmeg latte', ['nuts'])).toEqual([]);
    expect(allergiesIn('Gluten-free bread', ['wheat'])).toEqual([]);
    expect(allergiesIn('Eggless cake', ['eggs'])).toEqual([]);
    expect(allergiesIn('Dairy-free yogurt', ['milk'])).toEqual([]);
  });

  it('finds typed allergies by their words, singular or plural', () => {
    expect(allergiesIn('Kiwi', ['kiwi'])).toEqual(['kiwi']);
    expect(allergiesIn('Kiwifruit smoothie', ['kiwi'])).toEqual(['kiwi']);
    expect(allergiesIn('Strawberries', ['strawberry'])).toEqual(['strawberry']);
    expect(allergiesIn('Tomato soup', ['tomatoes'])).toEqual(['tomatoes']);
    expect(allergiesIn('Mango lassi', ['mangoes'])).toEqual(['mangoes']);
    expect(allergiesIn('Green peas', ['pea'])).toEqual(['pea']);
    expect(allergiesIn('Peanut chikki', ['pea'])).toEqual([]);
    expect(allergiesIn('Sunflower seed butter', ['sunflower seeds'])).toEqual(['sunflower seeds']);
    expect(allergiesIn('Sunflower oil', ['sunflower seeds'])).toEqual([]);
  });

  it('skips what a pack only “may contain”', () => {
    expect(allergiesIn('Oat biscuits. Ingredients: oats, sugar. May contain nuts, milk', ['nuts', 'milk'])).toEqual([]);
  });
});

describe('flagAllergies', () => {
  it('uses the label’s allergens and the food’s words', () => {
    expect(flagAllergies(['milk', 'kiwi'], 'Fruit yogurt', ['milk'])).toEqual(['milk']);
    expect(flagAllergies(['nuts'], 'Almond drink', [])).toEqual(['nuts']);
    expect(flagAllergies(['kiwi'], 'Tropical juice', [], 'apple, kiwi, mango')).toEqual(['kiwi']);
    expect(flagAllergies([], 'Anything', ['milk'])).toEqual([]);
  });
});
