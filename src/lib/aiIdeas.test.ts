import { describe, expect, it } from 'vitest';
import { keepSafeIdeas, type AiIdea } from './aiIdeas';

// The nine ideas production's AI gave a vegetarian with a sesame allergy on 3 Oct 2026 (real answer, Nourish → AI ideas).
// One of them is hummus, which is made with tahini, which is sesame: the model didn't say so, and the phone only checked the
// allergies the person had typed, so it was shown.
const REAL: AiIdea[] = [
  { name: 'Greek yoghurt with berries and oats', description: '200g Greek yoghurt topped with a handful of mixed berries, 30g rolled oats and a drizzle of honey.' },
  { name: 'Baked beans on wholemeal toast', description: 'Half a tin of reduced-sugar baked beans on two slices of wholemeal toast with a scrape of butter.' },
  { name: 'Hummus with pitta and crudites', description: '100g hummus with a wholemeal pitta and carrot and pepper sticks.' },
  { name: 'Cottage cheese with pineapple and crackers', description: '200g cottage cheese with fresh pineapple chunks and four wholegrain crackers.' },
  { name: 'Banana and peanut butter on rye', description: 'Two slices of rye bread with 20g peanut butter and a sliced banana.' },
  { name: 'Lentil and vegetable soup with bread roll', description: 'A bowl of red lentil and carrot soup with a wholemeal roll.' },
  { name: 'Milk and berry protein smoothie', description: '300ml semi-skimmed milk blended with frozen berries, a banana and 30g oats.' },
  { name: 'Cheese and tomato wholemeal bagel', description: 'Toasted wholemeal bagel with 40g grated cheddar and sliced tomato, grilled.' },
  { name: 'Rice pudding with stewed apple', description: 'A pot of rice pudding topped with cinnamon stewed apple and a few raisins.' },
];
const names = (ideas: AiIdea[]) => ideas.map(i => i.name);

describe('the AI meal ideas the phone shows', () => {
  it('leaves out hummus for someone with a sesame allergy, and only hummus', () => {
    const kept = keepSafeIdeas(REAL, ['sesame'], 'GB');
    expect(names(kept)).not.toContain('Hummus with pitta and crudites');
    expect(kept).toHaveLength(8);
  });

  it('keeps every idea when the person has no allergy', () => {
    expect(keepSafeIdeas(REAL, [], 'GB')).toHaveLength(9);
  });

  it('knows the other places sesame hides: tahini, halva, baba ganoush, za’atar, falafel', () => {
    const dishes = ['Tahini dressing on roast carrots', 'Halva with fruit', 'Baba ganoush with flatbread', 'Falafel wrap', 'Cucumber salad with za’atar'];
    const ideas = dishes.map(name => ({ name, description: '' }));
    expect(keepSafeIdeas(ideas, ['sesame'], 'GB')).toEqual([]);
  });

  it('knows milk is in yoghurt, cheese, butter and a milk smoothie, but not in peanut butter', () => {
    const kept = names(keepSafeIdeas(REAL, ['milk'], 'GB'));
    for (const out of ['Greek yoghurt with berries and oats', 'Baked beans on wholemeal toast', 'Cottage cheese with pineapple and crackers',
      'Milk and berry protein smoothie', 'Cheese and tomato wholemeal bagel']) expect(kept, out).not.toContain(out);
    for (const stay of ['Banana and peanut butter on rye', 'Lentil and vegetable soup with bread roll']) expect(kept, stay).toContain(stay);
  });

  it('knows wheat is in toast, pitta, crackers, bread, rolls and bagels, and peanuts in peanut butter', () => {
    const wheat = names(keepSafeIdeas(REAL, ['wheat'], 'GB'));
    expect(wheat).toEqual(['Greek yoghurt with berries and oats', 'Milk and berry protein smoothie', 'Rice pudding with stewed apple']);
    const peanuts = names(keepSafeIdeas(REAL, ['peanuts'], 'GB'));
    expect(peanuts).not.toContain('Banana and peanut butter on rye');
    expect(peanuts).toHaveLength(8);
  });

  it('still checks an allergy the person typed, by its own words', () => {
    expect(names(keepSafeIdeas(REAL, ['pineapple'], 'GB'))).not.toContain('Cottage cheese with pineapple and crackers');
    expect(keepSafeIdeas(REAL, ['kiwi'], 'GB')).toHaveLength(9);
  });

  it('believes the server when it says a dish has an allergen the words don’t show', () => {
    const ideas: AiIdea[] = [{ name: 'Mixed salad bowl', description: 'Leaves and grains.', allergens: ['sesame'] }, { name: 'Plain rice and dal', description: 'Rice and dal.', allergens: [] }];
    expect(names(keepSafeIdeas(ideas, ['sesame'], 'GB'))).toEqual(['Plain rice and dal']);
    expect(names(keepSafeIdeas(ideas, ['Sesame'.toLowerCase()], 'GB'))).toEqual(['Plain rice and dal']);
  });

  it('leaves out meat that isn’t eaten where they live (beef in India)', () => {
    const ideas: AiIdea[] = [{ name: 'Beef stir-fry', description: 'Beef with peppers.' }, { name: 'Chicken tikka', description: 'Grilled chicken.' }];
    expect(names(keepSafeIdeas(ideas, [], 'IN'))).toEqual(['Chicken tikka']);
    expect(names(keepSafeIdeas(ideas, [], 'GB'))).toEqual(['Beef stir-fry', 'Chicken tikka']);
  });
});
