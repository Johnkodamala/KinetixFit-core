// Meal ideas ranked on the phone (src/lib/mealIdeas.ts).
import { describe, expect, it } from 'vitest';
import { MEALS, mealNutrients, unknownIngredients, rankMeals, pageOf, pageCount, slotAt, slotBudget, hideMeal, loadHiddenMeals, avoidedThere, CUISINES_BY_COUNTRY, PAGE_SIZE, type RankInput } from './mealIdeas';

const base = (over: Partial<RankInput> = {}): RankInput => ({
  slot: 'lunch', goal: 'Weight Loss',
  targets: { kcal: 1900, protein: 110, fibre: 30 }, eaten: { kcal: 450, protein: 20, fibre: 6 },
  diet: 'everything', allergens: [], country: 'GB', recentFoods: [], hidden: [], ...over,
});

describe('meal library', () => {
  it('every ingredient is a USDA food in the table, and ids are unique', () => {
    expect(unknownIngredients()).toEqual([]);
    expect(new Set(MEALS.map(m => m.id)).size).toBe(MEALS.length);
  });

  it('works nutrition out from the USDA foods', () => {
    const porridge = mealNutrients(MEALS.find(m => m.id === 'porridge-banana-pb')!);
    expect(porridge.kcal).toBeGreaterThan(380);
    expect(porridge.kcal).toBeLessThan(560);
    expect(porridge.protein).toBeGreaterThan(14);
    const chicken = mealNutrients(MEALS.find(m => m.id === 'chicken-rice-broccoli')!);
    expect(chicken.protein).toBeGreaterThan(35);
  });

  it('every meal is a sensible size for its slot', () => {
    for (const meal of MEALS) {
      const kcal = mealNutrients(meal).kcal;
      if (meal.slots.every(s => s === 'snack')) expect(kcal, meal.id).toBeLessThan(420);
      else expect(kcal, meal.id).toBeGreaterThan(180);
      expect(kcal, meal.id).toBeLessThan(900);
    }
  });

  it('has enough for everyone: vegetarian-no-egg without milk or wheat still gets several ideas for every slot, everywhere', () => {
    for (const country of Object.keys(CUISINES_BY_COUNTRY) as RankInput['country'][]) {
      for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
        expect(rankMeals(base({ country, slot, diet: 'vegetarian-no-egg', allergens: ['milk', 'wheat'] })).length, `${country} ${slot}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives every country plenty to page through', () => {
    for (const country of Object.keys(CUISINES_BY_COUNTRY) as RankInput['country'][]) {
      for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
        expect(rankMeals(base({ country, slot })).length, `${country} ${slot}`).toBeGreaterThanOrEqual(slot === 'snack' ? 6 : 9);
      }
    }
  });

  it('every meal belongs somewhere', () => {
    const offered = new Set(Object.values(CUISINES_BY_COUNTRY).flat());
    for (const meal of MEALS) expect(meal.cuisines.some(c => offered.has(c)), meal.id).toBe(true);
  });
});

describe('ranking', () => {
  it('keeps to the slot, diet, allergens and "not for me"', () => {
    const list = rankMeals(base({ diet: 'vegetarian', allergens: ['milk'], hidden: ['dal-rice'] }));
    for (const r of list) {
      expect(r.meal.slots).toContain('lunch');
      expect(r.meal.diet).not.toBe('meat');
      expect(r.meal.allergens).not.toContain('milk');
    }
    expect(list.map(r => r.meal.id)).not.toContain('dal-rice');
  });

  it('with a lot of protein still to eat, weight loss ideas lead with protein', () => {
    const top = pageOf(rankMeals(base({ eaten: { kcal: 300, protein: 5, fibre: 3 } })), 0);
    expect(top.every(r => r.n.protein >= 18)).toBe(true);
  });

  it('keeps near the calories left for the meal', () => {
    const tight = rankMeals(base({ slot: 'dinner', eaten: { kcal: 1500, protein: 90, fibre: 25 } }));
    expect(slotBudget('dinner', 400)).toBe(340);
    expect(pageOf(tight, 0)[0].n.kcal).toBeLessThan(600);
  });

  it('the first pages of three never repeat a main ingredient (the last ones get what’s left)', () => {
    const list = rankMeals(base({ slot: 'dinner' }));
    for (let p = 0; p < Math.min(4, pageCount(list)); p++) {
      const page = pageOf(list, p);
      if (page.length === PAGE_SIZE) expect(new Set(page.map(r => r.meal.base)).size).toBe(PAGE_SIZE);
    }
  });

  it('India gets Indian dishes only, and never beef', () => {
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      for (const r of rankMeals(base({ slot, country: 'IN' }))) {
        expect(r.meal.cuisines, r.meal.id).toContain('indian');
        expect(`${r.meal.name} ${r.meal.ingredients.map(([n]) => n).join(' ')}`.toLowerCase()).not.toMatch(/beef|veal|steak/);
      }
    }
    // the UK still gets its everyday list, with the curries that are everyday food there
    const uk = rankMeals(base({ slot: 'dinner', country: 'GB' })).map(r => r.meal.id);
    expect(uk).toContain('chicken-curry-rice');
    expect(uk).toContain('beef-chilli-rice');
    expect(uk).not.toContain('rajma-chawal');
  });

  it('each country’s own dishes come up first', () => {
    const uae = pageOf(rankMeals(base({ slot: 'lunch', country: 'AE', goal: 'Autonomic Recovery' })), 0);
    expect(uae.filter(r => r.meal.cuisines.includes('mideast')).length).toBeGreaterThanOrEqual(2);
    const sg = pageOf(rankMeals(base({ slot: 'dinner', country: 'SG', goal: 'Autonomic Recovery' })), 0);
    expect(sg.filter(r => r.meal.cuisines.includes('sg')).length).toBeGreaterThanOrEqual(2);
  });

  it('knows which meats are avoided where', () => {
    expect(avoidedThere('Beef chilli with rice', 'IN')).toBe(true);
    expect(avoidedThere('Beef chilli with rice', 'GB')).toBe(false);
    expect(avoidedThere('Bacon sandwich', 'AE')).toBe(true);
    expect(avoidedThere('Chicken tikka', 'IN')).toBe(false);
    expect(avoidedThere('Hamburger', 'AE')).toBe(false); // whole words only
  });

  it('leaves out allergies typed in by the person', () => {
    const list = rankMeals(base({ slot: 'breakfast', country: 'IN', allergens: ['peanuts', 'moong'] })).map(r => r.meal.id);
    expect(list).not.toContain('poha');
    expect(list).not.toContain('moong-chilla-curd');
    expect(list).toContain('idli-sambar');
    const kiwi = rankMeals(base({ slot: 'breakfast', allergens: ['kiwi'] })).map(r => r.meal.id);
    expect(kiwi).not.toContain('overnight-oats-kiwi');
  });

  it('follows the gut report, and skips foods eaten in the last two days', () => {
    const india = (over: Partial<RankInput>) => rankMeals(base({ slot: 'snack', country: 'IN', ...over }));
    const plain = india({});
    const rank = (list: typeof plain, id: string) => list.findIndex(r => r.meal.id === id);
    const gut = india({ gutFavour: [['kiwi'], ['curd']], wantsFermented: true });
    expect(rank(gut, 'curd-pomegranate')).toBeLessThan(rank(plain, 'curd-pomegranate'));
    const noGuava = india({ recentFoods: ['Guava'] });
    expect(rank(noGuava, 'guava-peanuts')).toBeGreaterThan(rank(plain, 'guava-peanuts'));
    const trigger = india({ gutAvoid: [['chickpeas']] });
    expect(rank(trigger, 'chickpea-cup')).toBeGreaterThan(rank(plain, 'chickpea-cup'));
    const ukPlain = rankMeals(base({ slot: 'snack' }));
    const noPeanut = rankMeals(base({ slot: 'snack', recentFoods: ['Peanut butter toast'] }));
    expect(rank(noPeanut, 'apple-pb')).toBeGreaterThan(rank(ukPlain, 'apple-pb'));
  });

  it('says why each one fits', () => {
    const top = rankMeals(base())[0];
    expect(top.why).toMatch(/protein|fibre|kcal|gut|Fermented/);
  });
});

describe('the gut report’s hints: a phrase matches only when all its words are in one ingredient (or the meal’s name)', () => {
  const scoreOf = (list: ReturnType<typeof rankMeals>, id: string) => list.find(r => r.meal.id === id)!.score;
  const lunch = (over: Partial<RankInput> = {}) => rankMeals(base({ slot: 'lunch', country: 'IN', ...over }));
  const plain = lunch();
  const change = (list: ReturnType<typeof rankMeals>, id: string) => Math.round((scoreOf(list, id) - scoreOf(plain, id)) * 100) / 100;

  it('favours a meal with the food, and says why only for that meal', () => {
    const gut = lunch({ gutFavour: [['brown', 'rice']] });
    expect(change(gut, 'dal-rice')).toBe(0.35); // "Brown rice, cooked"
    expect(change(gut, 'rajma-chawal')).toBe(0); // white rice
    expect(gut.find(r => r.meal.id === 'dal-rice')!.why).toMatch(/gut report/);
    expect(gut.find(r => r.meal.id === 'rajma-chawal')!.why).not.toMatch(/gut report/);
  });

  it('goes easy on a meal that has the food, by all the words of its name', () => {
    const gut = lunch({ gutAvoid: [['rice', 'white', 'cooked']] });
    expect(change(gut, 'rajma-chawal')).toBe(-1.5); // "Rice, white, cooked"
    expect(change(gut, 'dal-rice')).toBe(0); // "Brown rice, cooked" is a different food
    expect(change(gut, 'dal-bhindi-roti')).toBe(0);
  });

  it('a modifier alone never matches: black coffee is not black beans, cooked rice is not cooked pasta', () => {
    const coffee = rankMeals(base({ slot: 'lunch', country: 'US', gutAvoid: [['coffee', 'black']] }));
    const usPlain = rankMeals(base({ slot: 'lunch', country: 'US' }));
    expect(scoreOf(coffee, 'quinoa-bean-bowl')).toBe(scoreOf(usPlain, 'quinoa-bean-bowl')); // "Black beans, cooked"
    const rice = rankMeals(base({ slot: 'lunch', country: 'GB', gutAvoid: [['rice', 'white', 'cooked']] }));
    const gbPlain = rankMeals(base({ slot: 'lunch', country: 'GB' }));
    expect(scoreOf(rice, 'pasta-chickpea-spinach')).toBe(scoreOf(gbPlain, 'pasta-chickpea-spinach')); // "Pasta, cooked"
  });

  it('cheese pizza is pizza, not every cheese', () => {
    const gut = rankMeals(base({ slot: 'lunch', country: 'GB', gutAvoid: [['cheese', 'pizza']] }));
    const gbPlain = rankMeals(base({ slot: 'lunch', country: 'GB' }));
    expect(scoreOf(gut, 'sweet-potato-cottage')).toBe(scoreOf(gbPlain, 'sweet-potato-cottage')); // cottage cheese
  });

  it('finds the food in the meal’s own name too, not only in its ingredients', () => {
    const gut = lunch({ gutAvoid: [['khichdi']] });
    expect(change(gut, 'moong-khichdi')).toBe(-1.5);
  });

  it('takes a whole list of phrases, any of which counts once', () => {
    const gut = lunch({ gutAvoid: [['dal'], ['rice', 'white', 'cooked']] });
    expect(change(gut, 'toor-dal-rice-cabbage')).toBe(-1.5); // "Toor dal" and "Rice, white, cooked": two phrases, one penalty, not -3
  });

  it('with no hints, or empty ones, nothing moves', () => {
    expect(lunch({ gutFavour: [], gutAvoid: [], wantsFermented: false }).map(r => r.meal.id)).toEqual(plain.map(r => r.meal.id));
  });
});

describe('paging and "not for me"', () => {
  it('pages wrap round', () => {
    const list = Array.from({ length: 7 }, (_, i) => i);
    expect(pageOf(list, 0)).toEqual([0, 1, 2]);
    expect(pageOf(list, 2)).toEqual([6]);
    expect(pageOf(list, 3)).toEqual([0, 1, 2]);
    expect(pageOf([], 1)).toEqual([]);
  });

  it('remembers hidden meals', () => {
    expect(loadHiddenMeals()).toEqual([]);
    const h = hideMeal([], 'upma');
    expect(hideMeal(h, 'upma')).toEqual(['upma']);
    expect(loadHiddenMeals()).toEqual(['upma']);
  });

  it('knows the meal slot from the time of day', () => {
    const at = (h: number) => new Date(2026, 8, 28, h);
    expect([slotAt(at(8)), slotAt(at(13)), slotAt(at(16)), slotAt(at(19)), slotAt(at(22))]).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'snack']);
  });
});
