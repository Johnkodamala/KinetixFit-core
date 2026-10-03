import { describe, expect, it } from 'vitest';
import { keepSuggestions } from '../_lib/ideaFilter.js';

const idea = (name, description = '', extra = {}) => ({ name, description, why: 'because', calories: 400, containsAllergens: [], containsMeatOrFish: false, containsEgg: false, ...extra });
const names = (list) => list.map(s => s.name);
const rules = (over = {}) => ({ allergens: [], countryAvoid: [], diet: 'everything', alreadySuggested: [], limit: 9, ...over });

describe('the model’s ideas the person can have (what the handler did inline before)', () => {
  it('drops what the model says holds one of their allergens, and hands the rest on as `allergens`', () => {
    const out = keepSuggestions([idea('Cheese toastie', 'Toasted.', { containsAllergens: ['milk', 'wheat'] }), idea('Fruit bowl', 'Fruit.', { containsAllergens: [] })], rules({ allergens: ['milk'] }));
    expect(names(out)).toEqual(['Fruit bowl']);
    expect(out[0]).toMatchObject({ name: 'Fruit bowl', allergens: [] });
    expect(out[0]).not.toHaveProperty('containsAllergens');
    expect(out[0]).not.toHaveProperty('containsMeatOrFish');
    expect(out[0]).not.toHaveProperty('containsEgg');
  });

  it('checks an allergy the person typed by its words', () => {
    const out = keepSuggestions([idea('Kiwifruit and yoghurt', 'Two kiwi.'), idea('Oat bowl', 'Oats.')], rules({ allergens: ['kiwi'] }));
    expect(names(out)).toEqual(['Oat bowl']);
  });

  it('leaves out the country’s avoided meats by name', () => {
    const out = keepSuggestions([idea('Beef curry', 'Beef.'), idea('Dal tadka', 'Lentils.')], rules({ countryAvoid: ['beef', 'veal', 'steak'] }));
    expect(names(out)).toEqual(['Dal tadka']);
  });

  it('follows the diet', () => {
    const ideas = [idea('Chicken salad', 'Chicken.', { containsMeatOrFish: true }), idea('Egg wrap', 'Egg.', { containsEgg: true }), idea('Bean wrap', 'Beans.')];
    expect(names(keepSuggestions(ideas, rules({ diet: 'everything' })))).toEqual(['Chicken salad', 'Egg wrap', 'Bean wrap']);
    expect(names(keepSuggestions(ideas, rules({ diet: 'vegetarian' })))).toEqual(['Egg wrap', 'Bean wrap']);
    expect(names(keepSuggestions(ideas, rules({ diet: 'vegetarian-no-egg' })))).toEqual(['Bean wrap']);
  });

  it('skips dishes already shown today (any case) and stops at the limit', () => {
    const ideas = ['A', 'B', 'C', 'D'].map(n => idea(n));
    expect(names(keepSuggestions(ideas, rules({ alreadySuggested: ['b'] })))).toEqual(['A', 'C', 'D']);
    expect(names(keepSuggestions(ideas, rules({ limit: 2 })))).toEqual(['A', 'B']);
  });

  it('copes with a missing list', () => {
    expect(keepSuggestions(undefined, rules())).toEqual([]);
  });
});

describe('the dish’s own words (the model missed that hummus is tahini, which is sesame)', () => {
  // the nine ideas production gave a vegetarian with a sesame allergy on 3 Oct 2026, with what the model declared for each
  const REAL = [
    idea('Greek yoghurt with berries and oats', '200g Greek yoghurt topped with a handful of mixed berries, 30g rolled oats and a drizzle of honey.', { containsAllergens: ['milk'] }),
    idea('Baked beans on wholemeal toast', 'Half a tin of reduced-sugar baked beans on two slices of wholemeal toast with a scrape of butter.', { containsAllergens: ['wheat', 'milk'] }),
    idea('Hummus with pitta and crudites', '100g hummus with a wholemeal pitta and carrot and pepper sticks.', { containsAllergens: ['wheat'] }),
    idea('Cottage cheese with pineapple and crackers', '200g cottage cheese with fresh pineapple chunks and four wholegrain crackers.', { containsAllergens: ['milk', 'wheat'] }),
    idea('Banana and peanut butter on rye', 'Two slices of rye bread with 20g peanut butter and a sliced banana.', { containsAllergens: ['peanuts', 'wheat'] }),
    idea('Lentil and vegetable soup with bread roll', 'A bowl of red lentil and carrot soup with a wholemeal roll.', { containsAllergens: ['wheat'] }),
    idea('Milk and berry protein smoothie', '300ml semi-skimmed milk blended with frozen berries, a banana and 30g oats.', { containsAllergens: ['milk'] }),
    idea('Cheese and tomato wholemeal bagel', 'Toasted wholemeal bagel with 40g grated cheddar and sliced tomato, grilled.', { containsAllergens: ['wheat', 'milk'] }),
    idea('Rice pudding with stewed apple', 'A pot of rice pudding topped with cinnamon stewed apple and a few raisins.', { containsAllergens: ['milk'] }),
  ];

  it('drops the hummus for a sesame allergy, though the model never said sesame', () => {
    const out = keepSuggestions(REAL, rules({ allergens: ['sesame'], diet: 'vegetarian' }));
    expect(names(out)).not.toContain('Hummus with pitta and crudites');
    expect(out).toHaveLength(8);
  });

  it('still lets a person without the allergy have it', () => {
    expect(names(keepSuggestions(REAL, rules({ allergens: ['peanuts'] })))).toContain('Hummus with pitta and crudites');
  });

  it('knows tahini, halva, baba ganoush, za’atar and falafel too', () => {
    const dishes = ['Roast carrots with tahini', 'Halva and fruit', 'Baba ganoush with flatbread', 'Salad with za’atar', 'Falafel wrap'].map(n => idea(n));
    expect(keepSuggestions(dishes, rules({ allergens: ['sesame'] }))).toEqual([]);
  });

  it('finds milk and wheat by the foods that hold them, but not in oat milk or peanut butter', () => {
    const dishes = [idea('Porridge with oat milk', 'Oats and oat milk.'), idea('Peanut butter on a banana', 'Peanut butter and banana.'), idea('Yoghurt pot', 'Plain yoghurt.'), idea('Cheddar sandwich', 'Cheddar between two slices of bread.')];
    expect(names(keepSuggestions(dishes, rules({ allergens: ['milk'] })))).toEqual(['Porridge with oat milk', 'Peanut butter on a banana']);
    expect(names(keepSuggestions(dishes, rules({ allergens: ['wheat'] })))).toEqual(['Porridge with oat milk', 'Peanut butter on a banana', 'Yoghurt pot']);
  });

  it('believes "gluten-free" and "dairy-free" in the dish’s name', () => {
    const dishes = [idea('Gluten-free toast with jam', 'Gluten-free bread, toasted.'), idea('Dairy-free yoghurt bowl', 'Dairy-free yoghurt with fruit.')];
    expect(names(keepSuggestions(dishes, rules({ allergens: ['wheat', 'milk'] })))).toEqual(['Gluten-free toast with jam', 'Dairy-free yoghurt bowl']);
  });
});
