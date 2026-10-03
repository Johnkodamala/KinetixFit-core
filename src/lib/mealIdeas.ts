// Meal ideas for the next meal, worked out on the phone: about 110 everyday meals and snacks, each made of foods from
// the USDA table (src/lib/foodTable.ts) in stated amounts, so every number comes from USDA data rather than a guess.
// They're ranked for this person, right now:
//
//   - where they live (hard rule): only dishes people there eat (CUISINES_BY_COUNTRY) — India gets Indian dishes only,
//     the UAE Middle Eastern, Mediterranean and Indian ones, Singapore its own, other Asian and Indian ones, and the UK,
//     Ireland, the US, Canada, Australia and New Zealand the everyday Western list (with the curries that are everyday
//     food there too). Nothing with beef in India, nothing with pork in the UAE (COUNTRY_AVOID). Within that, the
//     country's own cuisine ranks first and its next one after it.
//   - what's left of today: calories for this meal (a share of what's left, by the time of day), the protein and fibre
//     still to eat
//   - the goal: weight loss favours protein and fibre per calorie; weight gain favours energy with protein; cardio
//     endurance favours carbohydrate; recovery favours balance
//   - what they eat and can't eat: diet (vegetarian / no eggs) and their own allergies are hard rules — label allergens by
//     each meal's tags, anything they typed in ("kiwi") by the meal's words (src/lib/allergens.ts)
//   - their gut week (src/lib/gut.ts): foods the report suggests rank higher, their possible triggers rank lower
//   - variety: foods eaten in the last two days rank lower, and a page of three doesn't repeat a main ingredient while
//     there are others left
//   - "Not for me": a meal the person hides never comes back
//
// USDA has no flattened rice, so poha is made from raw white rice, its nearest food; labneh is Greek yogurt.
// The list is paged three at a time ("Show 3 more"), so refreshing costs nothing. Kinetix Fit Plus adds AI ideas on top
// (api/suggest-meals.js); this list is what everyone gets, and what Plus falls back to if the AI can't be reached.
import { FOOD_TABLE } from './foodTable';
import { ZERO, type Nutrients } from './foodLog';
import { tagFits, type Diet, type DietTag } from './diet';
import type { CountryCode } from './countries';
import { allergiesIn, customAllergies } from './allergens';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type Cuisine = 'uk' | 'indian' | 'med' | 'asian' | 'american' | 'mideast' | 'sg';
type Goal = 'Weight Loss' | 'Weight Gain' | 'Cardio Endurance' | 'Autonomic Recovery';

export interface Meal {
  id: string;
  name: string;
  /** the amounts, in words */
  portion: string;
  slots: MealSlot[];
  diet: DietTag;
  /** allergen ids as in src/lib/countries.ts */
  allergens: string[];
  /** where it's everyday food: the first is its home */
  cuisines: Cuisine[];
  prepMinutes: number;
  /** the main thing in it, so a page doesn't show three dal dishes */
  base: string;
  /** has live cultures (the gut report counts fermented days) */
  fermented?: boolean;
  /** foods from the USDA table (by name) and grams */
  ingredients: [string, number][];
}

const m = (id: string, name: string, portion: string, slots: MealSlot[], diet: DietTag, allergens: string[], cuisine: Cuisine | Cuisine[],
  prepMinutes: number, base: string, ingredients: [string, number][], fermented = false): Meal =>
  ({ id, name, portion, slots, diet, allergens, cuisines: Array.isArray(cuisine) ? cuisine : [cuisine], prepMinutes, base, ingredients, ...(fermented ? { fermented } : {}) });

const B: MealSlot[] = ['breakfast'];
const LD: MealSlot[] = ['lunch', 'dinner'];
const S: MealSlot[] = ['snack'];

export const MEALS: Meal[] = [
  // --- breakfast ---
  m('porridge-banana-pb', 'Porridge with banana and peanut butter', '40 g oats in 200 ml semi-skimmed milk, a banana, a tablespoon of peanut butter',
    B, 'veg', ['milk', 'peanuts'], 'uk', 8, 'oats', [['Oats (dry)', 40], ['Milk, semi-skimmed', 200], ['Banana', 118], ['Peanut butter', 16]]),
  m('yogurt-berries-walnuts', 'Greek yogurt with berries and walnuts', 'A pot of Greek yogurt (170 g), a handful each of blueberries and strawberries, a few walnuts',
    [...B, 'snack'], 'veg', ['milk', 'nuts'], ['med', 'mideast'], 3, 'yogurt', [['Greek yogurt, plain', 170], ['Blueberries', 70], ['Strawberries', 70], ['Walnuts', 15]], true),
  m('eggs-toast-spinach', 'Scrambled eggs on wholemeal toast with spinach', 'Two eggs, two slices of wholemeal toast, a handful of spinach, a little butter',
    B, 'egg', ['eggs', 'wheat', 'milk'], 'uk', 10, 'egg', [['Egg', 100], ['Wholemeal bread', 72], ['Spinach', 30], ['Butter', 5]]),
  m('overnight-oats-kiwi', 'Overnight oats with curd and kiwi', '40 g oats soaked in 150 g plain yogurt or curd, a kiwi, a few almonds',
    B, 'veg', ['milk', 'nuts'], 'uk', 5, 'oats', [['Oats (dry)', 40], ['Yogurt / curd, plain', 150], ['Kiwi', 75], ['Almonds', 10]], true),
  m('idli-sambar', 'Idli with sambar', 'Three idlis and a bowl of sambar',
    B, 'veg', [], 'indian', 15, 'idli', [['Idli', 114], ['Sambar', 150]], true),
  m('masala-dosa', 'Masala dosa with sambar', 'One potato-filled dosa and a small bowl of sambar',
    [...B, 'lunch'], 'veg', [], 'indian', 20, 'dosa', [['Dosa, with filling', 180], ['Sambar', 120]], true),
  m('upma', 'Vegetable upma', 'A bowl of upma (about 220 g)',
    B, 'veg', ['wheat'], 'indian', 20, 'semolina', [['Upma', 220]]),
  m('paratha-curd', 'Paratha with curd', 'One paratha and a small bowl of plain curd',
    B, 'veg', ['wheat', 'milk'], 'indian', 15, 'paratha', [['Paratha', 80], ['Yogurt / curd, plain', 100]], true),
  m('pb-banana-toast', 'Peanut butter and banana on toast', 'Two slices of wholemeal toast, two tablespoons of peanut butter, a banana',
    B, 'veg', ['wheat', 'peanuts'], 'uk', 5, 'peanut', [['Wholemeal bread', 72], ['Peanut butter', 32], ['Banana', 118]]),
  m('cottage-pineapple-toast', 'Cottage cheese, pineapple and a slice of toast', '150 g cottage cheese, a few chunks of pineapple, one slice of wholemeal toast',
    B, 'veg', ['milk', 'wheat'], 'uk', 5, 'cottage cheese', [['Cottage cheese', 150], ['Pineapple', 80], ['Wholemeal bread', 36]]),
  m('tofu-scramble', 'Tofu scramble with peppers on toast', '150 g firm tofu with red pepper and onion, one slice of wholemeal toast',
    B, 'veg', ['soya', 'wheat'], 'uk', 12, 'tofu', [['Tofu, firm', 150], ['Red pepper', 60], ['Onion', 40], ['Wholemeal bread', 36], ['Olive oil', 5]]),
  m('egg-avocado-toast', 'Poached egg and avocado on toast', 'One egg, a third of an avocado, one slice of wholemeal toast',
    B, 'egg', ['eggs', 'wheat'], 'uk', 8, 'egg', [['Egg', 50], ['Avocado', 60], ['Wholemeal bread', 36]]),
  m('paneer-bhurji-roti', 'Paneer bhurji with a roti', '100 g paneer scrambled with onion and tomato, one roti',
    [...B, 'lunch', 'dinner'], 'veg', ['milk', 'wheat'], 'indian', 15, 'paneer', [['Paneer', 100], ['Onion', 40], ['Tomato', 60], ['Olive oil', 5], ['Roti / chapati', 68]]),
  m('egg-bhurji-roti', 'Egg bhurji with a roti', 'Two eggs scrambled with onion, tomato and spinach, one roti',
    [...B, 'dinner'], 'egg', ['eggs', 'wheat'], 'indian', 12, 'egg', [['Egg', 100], ['Onion', 40], ['Tomato', 50], ['Spinach', 30], ['Olive oil', 5], ['Roti / chapati', 68]]),
  m('sweet-potato-hash', 'Sweet potato hash with avocado', 'A baked sweet potato (150 g) fried with red pepper and onion, a third of an avocado',
    B, 'veg', [], ['uk', 'american'], 20, 'sweet potato', [['Sweet potato, baked', 150], ['Red pepper', 60], ['Onion', 40], ['Avocado', 50], ['Olive oil', 5]]),
  m('quinoa-berry-bowl', 'Breakfast quinoa with berries and almonds', '150 g cooked quinoa with blueberries, half a banana and a few almonds',
    B, 'veg', ['nuts'], ['american', 'uk'], 5, 'quinoa', [['Quinoa, cooked', 150], ['Blueberries', 70], ['Banana', 60], ['Almonds', 10]]),
  m('soya-smoothie', 'Banana and oat smoothie with soya milk', '250 ml soya milk, a banana and 20 g oats, blended',
    [...B, 'snack'], 'veg', ['soya'], ['uk', 'sg'], 4, 'soya milk', [['Soya milk', 250], ['Banana', 118], ['Oats (dry)', 20]]),

  // --- lunch and dinner ---
  m('chicken-rice-broccoli', 'Chicken, brown rice and broccoli', '130 g roast chicken breast, 150 g cooked brown rice, a portion of broccoli',
    LD, 'meat', [], 'uk', 25, 'chicken', [['Chicken breast, roasted', 130], ['Brown rice, cooked', 150], ['Broccoli', 90], ['Olive oil', 5]]),
  m('salmon-sweet-potato', 'Salmon with sweet potato and broccoli', 'A salmon fillet (130 g), a baked sweet potato, broccoli',
    LD, 'meat', ['fish'], 'uk', 30, 'salmon', [['Salmon, cooked', 130], ['Sweet potato, baked', 150], ['Broccoli', 80]]),
  m('tuna-bean-salad', 'Tuna and bean salad', 'A tin of tuna, kidney beans, sweetcorn, lettuce and tomato, a drizzle of olive oil',
    ['lunch'], 'meat', ['fish'], 'med', 10, 'tuna', [['Tuna, canned in water', 100], ['Kidney beans, cooked', 80], ['Sweetcorn', 50], ['Lettuce', 40], ['Tomato', 60], ['Olive oil', 7]]),
  m('dal-rice', 'Dal with brown rice and cucumber', 'A bowl of dal (250 g), 150 g cooked brown rice, sliced cucumber',
    LD, 'veg', [], ['indian', 'uk'], 30, 'lentils', [['Dal', 250], ['Brown rice, cooked', 150], ['Cucumber', 60]]),
  m('rajma-chawal', 'Rajma chawal', 'Kidney bean curry (150 g beans with onion and tomato) and 150 g rice',
    LD, 'veg', [], 'indian', 30, 'kidney beans', [['Kidney beans, cooked', 150], ['Onion', 30], ['Tomato', 60], ['Olive oil', 5], ['Rice, white, cooked', 150]]),
  m('chana-roti', 'Chana masala with two rotis', 'Chickpea curry (160 g chickpeas with tomato and onion) and two rotis',
    LD, 'veg', ['wheat'], 'indian', 30, 'chickpeas', [['Chickpeas, cooked', 160], ['Tomato', 80], ['Onion', 40], ['Olive oil', 8], ['Roti / chapati', 136]]),
  m('palak-paneer-roti', 'Palak paneer with two rotis', 'A bowl of palak paneer (220 g) and two rotis',
    LD, 'veg', ['milk', 'wheat'], 'indian', 30, 'paneer', [['Palak paneer', 220], ['Roti / chapati', 136]]),
  m('chicken-curry-rice', 'Chicken curry with rice', 'A bowl of chicken curry (250 g) and 150 g rice',
    LD, 'meat', [], ['indian', 'uk'], 40, 'chicken', [['Chicken curry', 250], ['Rice, white, cooked', 150]]),
  m('veg-biryani-raita', 'Vegetable biryani with raita', 'A plate of vegetable biryani (300 g) and cucumber raita',
    LD, 'veg', ['milk'], 'indian', 40, 'rice', [['Vegetable biryani', 300], ['Yogurt / curd, plain', 100], ['Cucumber', 40]], true),
  m('chicken-biryani-raita', 'Chicken biryani with raita', 'A plate of chicken biryani (300 g) and a small bowl of raita',
    LD, 'meat', ['milk'], 'indian', 45, 'chicken', [['Chicken biryani', 300], ['Yogurt / curd, plain', 100]], true),
  m('tofu-stirfry-noodles', 'Tofu and vegetable stir-fry with noodles', '150 g tofu, broccoli, pepper and mushrooms, 150 g cooked egg noodles',
    LD, 'egg', ['soya', 'eggs', 'wheat'], 'asian', 20, 'tofu', [['Tofu, firm', 150], ['Egg noodles, cooked', 150], ['Broccoli', 60], ['Red pepper', 60], ['Mushrooms', 50], ['Olive oil', 8]]),
  m('tofu-stirfry-rice', 'Tofu and vegetable stir-fry with brown rice', '150 g tofu, broccoli, pepper and mushrooms, 150 g cooked brown rice',
    LD, 'veg', ['soya'], 'asian', 20, 'tofu', [['Tofu, firm', 150], ['Brown rice, cooked', 150], ['Broccoli', 60], ['Red pepper', 60], ['Mushrooms', 50], ['Olive oil', 8]]),
  m('beef-chilli-rice', 'Beef chilli with rice', '100 g lean beef mince with kidney beans and tomato, 150 g rice',
    LD, 'meat', [], 'american', 35, 'beef', [['Beef mince, cooked', 100], ['Kidney beans, cooked', 80], ['Tomato', 100], ['Onion', 40], ['Rice, white, cooked', 150]]),
  m('pasta-chickpea-spinach', 'Pasta with tomato, chickpeas and spinach', '180 g cooked pasta, chickpeas, tomatoes and spinach, a little olive oil',
    LD, 'veg', ['wheat'], 'med', 20, 'pasta', [['Pasta, cooked', 180], ['Chickpeas, cooked', 80], ['Tomato', 100], ['Spinach', 30], ['Olive oil', 7]]),
  m('quinoa-bean-bowl', 'Quinoa, black bean and avocado bowl', '150 g cooked quinoa, black beans, avocado, sweetcorn and tomato',
    LD, 'veg', [], 'american', 15, 'quinoa', [['Quinoa, cooked', 150], ['Black beans, cooked', 100], ['Avocado', 50], ['Sweetcorn', 40], ['Tomato', 50]]),
  m('sweet-potato-cottage', 'Baked sweet potato with cottage cheese', 'A baked sweet potato (200 g) topped with cottage cheese, side salad',
    LD, 'veg', ['milk'], 'uk', 45, 'sweet potato', [['Sweet potato, baked', 200], ['Cottage cheese', 120], ['Lettuce', 30], ['Tomato', 50]]),
  m('chicken-sandwich', 'Chicken salad sandwich', 'Two slices of wholemeal bread, 80 g chicken breast, lettuce and tomato',
    ['lunch'], 'meat', ['wheat'], 'uk', 5, 'chicken', [['Wholemeal bread', 72], ['Chicken breast, roasted', 80], ['Lettuce', 20], ['Tomato', 40]]),
  m('egg-fried-rice', 'Egg fried rice with peas', '180 g rice fried with two eggs and peas',
    LD, 'egg', ['eggs'], 'asian', 15, 'rice', [['Rice, white, cooked', 180], ['Egg', 100], ['Peas', 60], ['Olive oil', 8]]),
  m('couscous-chickpeas', 'Couscous with roast pepper and chickpeas', '150 g couscous, chickpeas, roast red pepper and onion',
    LD, 'veg', ['wheat'], ['med', 'mideast'], 25, 'couscous', [['Couscous, cooked', 150], ['Chickpeas, cooked', 80], ['Red pepper', 60], ['Onion', 40], ['Olive oil', 8]]),
  m('salmon-quinoa', 'Salmon with quinoa and spinach', '120 g salmon, 150 g cooked quinoa, wilted spinach',
    LD, 'meat', ['fish'], 'med', 25, 'salmon', [['Salmon, cooked', 120], ['Quinoa, cooked', 150], ['Spinach', 40]]),
  m('lentil-soup', 'Lentil and carrot soup with bread', 'A big bowl of lentil, carrot and tomato soup, one slice of wholemeal bread',
    LD, 'veg', ['wheat'], 'uk', 35, 'lentils', [['Lentils, cooked', 150], ['Carrot', 60], ['Onion', 40], ['Tomato', 60], ['Wholemeal bread', 36]]),
  m('mushroom-omelette', 'Mushroom and pea omelette with salad', 'Three eggs with mushrooms and peas, side salad',
    LD, 'egg', ['eggs', 'milk'], 'uk', 12, 'egg', [['Egg', 150], ['Mushrooms', 60], ['Peas', 40], ['Lettuce', 30], ['Butter', 5]]),
  m('chicken-couscous', 'Grilled chicken with couscous and cucumber', '120 g chicken breast, 150 g couscous, cucumber and tomato',
    LD, 'meat', ['wheat'], ['med', 'mideast'], 25, 'chicken', [['Chicken breast, roasted', 120], ['Couscous, cooked', 150], ['Cucumber', 60], ['Tomato', 50]]),
  m('paneer-tikka-salad', 'Paneer tikka with salad', '120 g paneer grilled with pepper and onion, a yogurt dip, salad',
    LD, 'veg', ['milk'], 'indian', 25, 'paneer', [['Paneer', 120], ['Red pepper', 60], ['Onion', 40], ['Yogurt / curd, plain', 40], ['Lettuce', 30]], true),
  m('sambar-rice', 'Sambar rice', 'A bowl of sambar (250 g) with 150 g rice',
    LD, 'veg', [], 'indian', 30, 'lentils', [['Sambar', 250], ['Rice, white, cooked', 150]]),
  m('tuna-pasta', 'Tuna pasta with sweetcorn', '180 g cooked pasta, a tin of tuna, sweetcorn and tomato',
    LD, 'meat', ['fish', 'wheat'], 'uk', 15, 'tuna', [['Pasta, cooked', 180], ['Tuna, canned in water', 100], ['Sweetcorn', 50], ['Tomato', 60], ['Olive oil', 5]]),
  m('curd-rice', 'Curd rice with cucumber', '150 g rice mixed with 150 g plain curd, cucumber on the side',
    LD, 'veg', ['milk'], 'indian', 10, 'rice', [['Rice, white, cooked', 150], ['Yogurt / curd, plain', 150], ['Cucumber', 60]], true),
  m('plain-dosa-sambar', 'Plain dosa with sambar', 'Two plain dosas and a bowl of sambar',
    LD, 'veg', [], 'indian', 20, 'dosa', [['Dosa, plain', 160], ['Sambar', 150]], true),

  // --- snacks ---
  m('apple-pb', 'Apple with peanut butter', 'An apple and a tablespoon of peanut butter',
    S, 'veg', ['peanuts'], 'uk', 2, 'peanut', [['Apple', 182], ['Peanut butter', 16]]),
  m('egg-carrots', 'Boiled egg and carrot sticks', 'A hard-boiled egg and a carrot cut into sticks',
    S, 'egg', ['eggs'], 'uk', 10, 'egg', [['Egg, hard-boiled', 50], ['Carrot', 80]]),
  m('yogurt-honey', 'Greek yogurt with honey', 'A small pot of Greek yogurt (150 g) with a teaspoon of honey',
    S, 'veg', ['milk'], ['med', 'mideast'], 2, 'yogurt', [['Greek yogurt, plain', 150], ['Honey', 7]], true),
  m('almonds-orange', 'An orange and a handful of almonds', 'One orange, 25 g almonds',
    S, 'veg', ['nuts'], ['uk', 'indian', 'mideast'], 1, 'almonds', [['Almonds', 25], ['Orange', 131]]),
  m('chickpea-cup', 'Chana chaat', 'Chickpeas with cucumber, tomato and onion, a squeeze of lemon',
    S, 'veg', [], 'indian', 5, 'chickpeas', [['Chickpeas, cooked', 80], ['Cucumber', 50], ['Tomato', 50], ['Onion', 20]]),
  m('banana-milk', 'Banana and a glass of milk', 'A banana and 200 ml semi-skimmed milk',
    S, 'veg', ['milk'], ['uk', 'indian'], 1, 'banana', [['Banana', 118], ['Milk, semi-skimmed', 200]]),
  m('curd-pomegranate', 'Curd with pomegranate', '150 g plain curd with pomegranate seeds',
    S, 'veg', ['milk'], 'indian', 3, 'yogurt', [['Yogurt / curd, plain', 150], ['Pomegranate', 50]], true),
  m('cottage-cucumber', 'Cottage cheese and cucumber', '120 g cottage cheese with cucumber slices',
    S, 'veg', ['milk'], 'uk', 2, 'cottage cheese', [['Cottage cheese', 120], ['Cucumber', 60]]),
  m('chocolate-walnuts', 'Dark chocolate and walnuts', 'Two squares of dark chocolate (20 g) and a few walnuts',
    S, 'veg', ['milk', 'soya', 'nuts'], 'uk', 1, 'chocolate', [['Dark chocolate (70–85%)', 20], ['Walnuts', 15]]),
  m('fruit-bowl', 'Papaya, guava and pomegranate bowl', 'A bowl of papaya and guava with pomegranate seeds',
    S, 'veg', [], ['indian', 'sg'], 5, 'fruit', [['Papaya', 100], ['Guava', 55], ['Pomegranate', 40]]),
  m('pb-toast', 'Peanut butter on toast', 'One slice of wholemeal toast with a tablespoon of peanut butter',
    S, 'veg', ['wheat', 'peanuts'], 'uk', 3, 'peanut', [['Wholemeal bread', 36], ['Peanut butter', 16]]),
  m('pear-cashews', 'A pear and a few cashews', 'A pear and 20 g cashews',
    S, 'veg', ['nuts'], 'uk', 1, 'cashews', [['Pear', 178], ['Cashews', 20]]),

  // --- India (28 Sep): everyday dishes from across the country, so India gets Indian food only --------------------
  // breakfast
  m('poha', 'Poha with peas and peanuts', '60 g poha (flattened rice) with onion, peas and a few peanuts, a little oil',
    B, 'veg', ['peanuts'], 'indian', 15, 'poha', [['Rice, white, raw', 60], ['Peas', 30], ['Onion', 30], ['Peanuts, roasted', 10], ['Olive oil', 5]]),
  m('besan-chilla-curd', 'Besan chilla with curd', 'Two gram-flour pancakes (50 g besan) with onion, tomato and spinach, a small bowl of curd',
    B, 'veg', ['milk'], 'indian', 15, 'besan', [['Besan (gram flour)', 50], ['Onion', 30], ['Tomato', 40], ['Spinach', 20], ['Olive oil', 7], ['Yogurt / curd, plain', 100]], true),
  m('moong-chilla-curd', 'Moong dal chilla with curd', 'Two moong dal pancakes with onion and tomato, a small bowl of curd',
    B, 'veg', ['milk'], 'indian', 20, 'moong', [['Moong (mung beans), cooked', 150], ['Onion', 20], ['Tomato', 30], ['Olive oil', 7], ['Yogurt / curd, plain', 80]], true),
  m('veg-dalia', 'Vegetable dalia', 'A bowl of broken-wheat porridge (200 g cooked) with carrot and peas, a little ghee',
    B, 'veg', ['wheat', 'milk'], 'indian', 20, 'dalia', [['Dalia (bulgur), cooked', 200], ['Carrot', 30], ['Peas', 30], ['Onion', 20], ['Ghee', 5]]),
  m('ven-pongal', 'Ven pongal with sambar', 'Rice and moong dal cooked soft with ghee and pepper, a bowl of sambar',
    B, 'veg', ['milk'], 'indian', 25, 'pongal', [['Rice, white, cooked', 120], ['Moong (mung beans), cooked', 80], ['Ghee', 7], ['Sambar', 120]]),
  m('vada-sambar', 'Medu vada with sambar', 'Two medu vadas and a bowl of sambar',
    B, 'veg', [], 'indian', 20, 'vada', [['Vada', 60], ['Sambar', 150]]),
  m('aloo-paratha-curd', 'Aloo paratha with curd', 'One potato-stuffed paratha and a small bowl of plain curd',
    B, 'veg', ['wheat', 'milk'], 'indian', 25, 'paratha', [['Paratha', 80], ['Potato, boiled', 60], ['Ghee', 3], ['Yogurt / curd, plain', 100]], true),
  m('masala-omelette-toast', 'Masala omelette with toast', 'Two eggs with onion, tomato and green chilli, two slices of wholemeal toast',
    B, 'egg', ['eggs', 'wheat'], 'indian', 10, 'egg', [['Egg', 100], ['Onion', 20], ['Tomato', 30], ['Olive oil', 5], ['Wholemeal bread', 72]]),
  m('masala-oats', 'Masala oats with vegetables', '40 g oats cooked with peas, carrot and onion',
    B, 'veg', [], 'indian', 12, 'oats', [['Oats (dry)', 40], ['Peas', 30], ['Carrot', 30], ['Onion', 20], ['Olive oil', 5]]),
  m('onion-uttapam', 'Onion uttapam with sambar', 'One thick dosa topped with onion and tomato, a bowl of sambar',
    B, 'veg', [], 'indian', 20, 'dosa', [['Dosa, plain', 120], ['Onion', 30], ['Tomato', 20], ['Olive oil', 3], ['Sambar', 120]], true),
  // lunch and dinner
  m('dal-bhindi-roti', 'Dal, bhindi and two rotis', 'A bowl of dal (200 g), bhindi sabzi (120 g) and two rotis',
    LD, 'veg', ['wheat'], 'indian', 35, 'lentils', [['Dal', 200], ['Bhindi (okra), cooked', 120], ['Roti / chapati', 136]]),
  m('toor-dal-rice-cabbage', 'Toor dal, rice and cabbage sabzi', 'Toor dal (150 g) with a little ghee, 150 g rice, cabbage stir-fried in a little oil',
    LD, 'veg', ['milk'], 'indian', 35, 'toor dal', [['Toor dal (pigeon peas), cooked', 150], ['Ghee', 5], ['Rice, white, cooked', 150], ['Cabbage', 80], ['Olive oil', 4]]),
  m('chana-saag-roti', 'Chana saag with two rotis', 'Chickpeas cooked with spinach (a bowl, 245 g) and two rotis',
    LD, 'veg', ['wheat'], 'indian', 30, 'chickpeas', [['Chana saag', 245], ['Roti / chapati', 136]]),
  m('veg-curry-roti-curd', 'Mixed vegetable curry with rotis and curd', 'A bowl of mixed vegetable curry (240 g), two rotis and a small bowl of curd',
    LD, 'veg', ['wheat', 'milk'], 'indian', 30, 'vegetables', [['Vegetable curry', 240], ['Roti / chapati', 136], ['Yogurt / curd, plain', 100]], true),
  m('baingan-dal-roti', 'Baingan bharta, dal and two rotis', 'Roasted aubergine mash (150 g), a small bowl of dal and two rotis',
    LD, 'veg', ['wheat'], 'indian', 40, 'aubergine', [['Baingan (aubergine), cooked', 150], ['Dal', 150], ['Roti / chapati', 136]]),
  m('aloo-gobi-roti', 'Aloo gobi with two rotis', 'Potato and cauliflower cooked with onion and tomato, two rotis',
    LD, 'veg', ['wheat'], 'indian', 30, 'cauliflower', [['Potato, boiled', 120], ['Cauliflower', 120], ['Onion', 30], ['Tomato', 40], ['Olive oil', 10], ['Roti / chapati', 136]]),
  m('moong-khichdi', 'Moong dal khichdi with curd', 'Rice and moong dal cooked together (250 g) with a little ghee, a small bowl of curd',
    LD, 'veg', ['milk'], 'indian', 25, 'khichdi', [['Rice, white, cooked', 150], ['Moong (mung beans), cooked', 100], ['Ghee', 5], ['Yogurt / curd, plain', 100]], true),
  m('lemon-rice-curd', 'Lemon rice with peanuts and curd', '180 g rice tossed with lemon, curry leaves and a few peanuts, a small bowl of curd',
    LD, 'veg', ['peanuts', 'milk'], 'indian', 20, 'rice', [['Rice, white, cooked', 180], ['Peanuts, roasted', 15], ['Olive oil', 5], ['Yogurt / curd, plain', 100]], true),
  m('veg-pulao-raita', 'Vegetable pulao with raita', 'A plate of pulao (250 g) with peas and carrot, cucumber raita',
    LD, 'veg', ['milk'], 'indian', 30, 'rice', [['Pulao (rice pilaf)', 250], ['Peas', 40], ['Carrot', 30], ['Yogurt / curd, plain', 100], ['Cucumber', 40]], true),
  m('lobia-rice', 'Lobia curry with rice', 'Black-eyed peas (150 g) in onion and tomato gravy, 150 g rice',
    LD, 'veg', [], 'indian', 35, 'black-eyed peas', [['Lobia (black-eyed peas), cooked', 150], ['Onion', 30], ['Tomato', 60], ['Olive oil', 6], ['Rice, white, cooked', 150]]),
  m('sarson-saag-roti', 'Sarson ka saag with two rotis', 'Mustard greens and spinach cooked with a little ghee (250 g), two rotis',
    LD, 'veg', ['wheat', 'mustard', 'milk'], 'indian', 40, 'mustard greens', [['Mustard greens (sarson), cooked', 200], ['Spinach', 50], ['Ghee', 7], ['Roti / chapati', 136]]),
  m('lauki-dal-roti', 'Lauki dal with two rotis', 'Bottle gourd cooked with dal (300 g) and two rotis',
    LD, 'veg', ['wheat'], 'indian', 30, 'bottle gourd', [['Lauki (bottle gourd), cooked', 150], ['Dal', 150], ['Roti / chapati', 136]]),
  m('kadhi-chawal', 'Kadhi chawal', 'Curd and gram-flour curry (a bowl) with 150 g rice',
    LD, 'veg', ['milk'], 'indian', 30, 'kadhi', [['Yogurt / curd, plain', 150], ['Besan (gram flour)', 20], ['Olive oil', 5], ['Rice, white, cooked', 150]]),
  m('moong-dal-roti', 'Moong dal with two rotis', 'A bowl of moong dal (200 g) with a little ghee, two rotis',
    LD, 'veg', ['wheat', 'milk'], 'indian', 25, 'moong', [['Moong (mung beans), cooked', 200], ['Ghee', 5], ['Roti / chapati', 136]]),
  m('fish-curry-rice', 'Fish curry with rice', 'A bowl of fish curry (250 g) and 150 g rice',
    LD, 'meat', ['fish'], 'indian', 35, 'fish', [['Fish curry', 250], ['Rice, white, cooked', 150]]),
  m('surmai-dal-rice', 'Grilled surmai with dal and rice', 'A surmai (king mackerel) fillet, 120 g, a bowl of dal and 120 g rice',
    LD, 'meat', ['fish'], 'indian', 30, 'fish', [['Surmai (king mackerel), cooked', 120], ['Olive oil', 5], ['Dal', 150], ['Rice, white, cooked', 120]]),
  m('egg-curry-roti', 'Egg curry with two rotis', 'Two boiled eggs in onion and tomato gravy (120 g) and two rotis',
    LD, 'egg', ['eggs', 'wheat'], 'indian', 25, 'egg', [['Egg, hard-boiled', 100], ['Curry sauce', 120], ['Roti / chapati', 136]]),
  m('tandoori-chicken-salad', 'Tandoori chicken with salad and a roti', '150 g chicken marinated in curd and spices, grilled; onion, cucumber and tomato; one roti',
    LD, 'meat', ['milk', 'wheat'], 'indian', 40, 'chicken', [['Chicken breast, roasted', 150], ['Yogurt / curd, plain', 30], ['Onion', 30], ['Cucumber', 50], ['Tomato', 40], ['Roti / chapati', 68]]),
  m('mutton-curry-rice', 'Mutton curry with rice', '120 g mutton in onion and tomato gravy, 150 g rice',
    LD, 'meat', [], 'indian', 60, 'mutton', [['Mutton (goat), cooked', 120], ['Curry sauce', 100], ['Onion', 30], ['Rice, white, cooked', 150]]),
  m('keema-matar-roti', 'Keema matar with two rotis', '100 g lamb mince with peas, onion and tomato, two rotis',
    LD, 'meat', ['wheat'], 'indian', 35, 'keema', [['Lamb mince (keema), cooked', 100], ['Peas', 60], ['Onion', 30], ['Tomato', 50], ['Roti / chapati', 136]]),
  // snacks
  m('sprouts-salad', 'Moong sprouts salad', 'A bowl of moong sprouts with onion, tomato, cucumber, pomegranate and lemon',
    S, 'veg', [], 'indian', 8, 'sprouts', [['Moong sprouts', 120], ['Onion', 20], ['Tomato', 40], ['Cucumber', 40], ['Pomegranate', 20]]),
  m('chaas-peanuts', 'A glass of chaas and a few peanuts', 'A glass of buttermilk (250 ml) and 15 g roasted peanuts',
    S, 'veg', ['milk', 'peanuts'], 'indian', 3, 'buttermilk', [['Buttermilk (chaas)', 250], ['Peanuts, roasted', 15]], true),
  m('egg-chaat', 'Boiled egg chaat', 'Two boiled eggs with chopped onion, tomato and chaat masala',
    S, 'egg', ['eggs'], 'indian', 12, 'egg', [['Egg, hard-boiled', 100], ['Onion', 15], ['Tomato', 20]]),
  m('guava-peanuts', 'Guava and a few roasted peanuts', 'Two guavas and 15 g roasted peanuts',
    S, 'veg', ['peanuts'], 'indian', 2, 'guava', [['Guava', 110], ['Peanuts, roasted', 15]]),
  m('paneer-cucumber', 'Paneer cubes with cucumber and tomato', '60 g paneer with cucumber and tomato, a pinch of chaat masala',
    S, 'veg', ['milk'], 'indian', 5, 'paneer', [['Paneer', 60], ['Cucumber', 60], ['Tomato', 30]]),
  m('idli-snack', 'Two idlis with sambar', 'Two idlis and a small bowl of sambar',
    S, 'veg', [], 'indian', 10, 'idli', [['Idli', 76], ['Sambar', 100]], true),
  m('masala-corn', 'Masala sweetcorn cup', 'A cup of boiled sweetcorn with a little butter, lemon and chaat masala',
    S, 'veg', ['milk'], 'indian', 5, 'sweetcorn', [['Sweetcorn', 120], ['Butter', 5]]),
  m('coconut-water-almonds', 'Coconut water and a few almonds', 'A glass of coconut water (250 ml) and 15 g almonds',
    S, 'veg', ['nuts'], ['indian', 'sg'], 1, 'coconut water', [['Coconut water', 250], ['Almonds', 15]]),
  m('dates-walnuts', 'Two dates and a few walnuts', 'Two medjool dates and 10 g walnuts',
    S, 'veg', ['nuts'], ['indian', 'mideast'], 1, 'dates', [['Dates', 48], ['Walnuts', 10]]),

  // --- UAE (28 Sep): Middle Eastern dishes (the UAE also gets the Indian and Mediterranean ones) -------------------
  m('ful-medames-pitta', 'Ful medames with pitta', 'Fava beans (170 g) with olive oil, lemon and tomato, one wholemeal pitta',
    [...B, 'lunch'], 'veg', ['wheat'], 'mideast', 15, 'fava beans', [['Fava beans (ful), cooked', 170], ['Olive oil', 7], ['Tomato', 40], ['Pitta bread, wholemeal', 57]]),
  m('shakshuka-pitta', 'Shakshuka with pitta', 'Two eggs poached in tomato and pepper sauce, one wholemeal pitta',
    [...B, 'lunch'], 'egg', ['eggs', 'wheat'], ['mideast', 'med'], 25, 'egg', [['Egg', 100], ['Tomato', 150], ['Red pepper', 60], ['Onion', 40], ['Olive oil', 7], ['Pitta bread, wholemeal', 57]]),
  m('labneh-pitta', 'Labneh, cucumber and pitta', 'Labneh or thick Greek yogurt (100 g) with olive oil, cucumber, tomato and one wholemeal pitta',
    B, 'veg', ['milk', 'wheat'], 'mideast', 5, 'yogurt', [['Greek yogurt, plain', 100], ['Olive oil', 5], ['Cucumber', 60], ['Tomato', 40], ['Pitta bread, wholemeal', 57]], true),
  m('shish-tawook-tabbouleh', 'Shish tawook with tabbouleh', 'A chicken and vegetable skewer (200 g) with a cup of tabbouleh',
    LD, 'meat', ['wheat'], 'mideast', 30, 'chicken', [['Chicken shish kebab with vegetables', 202], ['Tabbouleh', 160]]),
  m('hammour-rice-salad', 'Grilled hammour with rice and salad', '150 g grilled hammour, 150 g rice, lettuce, tomato and cucumber with olive oil',
    LD, 'meat', ['fish'], 'mideast', 25, 'fish', [['Hammour (grouper), cooked', 150], ['Rice, white, cooked', 150], ['Lettuce', 40], ['Tomato', 40], ['Cucumber', 40], ['Olive oil', 5]]),
  m('lentil-soup-pitta', 'Lentil soup with pitta', 'A big bowl of lentil soup (350 g) with lemon, one wholemeal pitta',
    LD, 'veg', ['wheat'], ['mideast', 'med'], 30, 'lentils', [['Lentil soup', 350], ['Pitta bread, wholemeal', 57]]),
  m('mujaddara-yogurt', 'Mujaddara with yogurt', 'Lentils and rice with crispy onions (300 g), a spoonful of thick yogurt',
    LD, 'veg', ['milk'], 'mideast', 40, 'lentils', [['Lentils, cooked', 120], ['Rice, white, cooked', 120], ['Onion', 60], ['Olive oil', 8], ['Greek yogurt, plain', 80]], true),
  m('falafel-wrap', 'Falafel wrap with hummus and salad', 'Three falafel in a wholemeal pitta with hummus, lettuce, tomato and cucumber',
    LD, 'veg', ['wheat', 'sesame'], ['mideast', 'uk'], 15, 'falafel', [['Falafel', 51], ['Pitta bread, wholemeal', 57], ['Hummus', 30], ['Lettuce', 30], ['Tomato', 40], ['Cucumber', 30]]),
  m('lamb-kebab-tabbouleh', 'Lamb kebab with tabbouleh', 'A lamb and vegetable skewer (200 g) with half a cup of tabbouleh',
    LD, 'meat', ['wheat'], 'mideast', 30, 'lamb', [['Lamb shish kebab with vegetables', 202], ['Tabbouleh', 80]]),
  m('chicken-machboos', 'Chicken machboos', 'Spiced rice (250 g) with 120 g chicken, and a tomato and cucumber salad',
    LD, 'meat', [], 'mideast', 50, 'chicken', [['Pulao (rice pilaf)', 250], ['Chicken breast, roasted', 120], ['Tomato', 40], ['Cucumber', 40]]),
  m('hummus-veg-sticks', 'Hummus with carrot and cucumber sticks', '60 g hummus with a carrot and some cucumber',
    S, 'veg', ['sesame'], ['mideast', 'uk'], 3, 'hummus', [['Hummus', 60], ['Carrot', 60], ['Cucumber', 60]]),

  // --- Singapore (28 Sep): hawker and home favourites, made lighter (Singapore also gets the Indian and other Asian ones)
  m('eggs-toast-sg', 'Soft-boiled eggs and toast', 'Two soft-boiled eggs with a dash of soy sauce and pepper, two slices of wholemeal toast with a little butter',
    B, 'egg', ['eggs', 'wheat', 'milk', 'soya'], 'sg', 8, 'egg', [['Egg', 100], ['Wholemeal bread', 72], ['Butter', 5]]),
  m('chicken-congee', 'Chicken congee', 'A big bowl of rice porridge with chicken and vegetables (450 g)',
    [...B, 'lunch', 'dinner'], 'meat', [], ['sg', 'asian'], 30, 'congee', [['Congee with meat and vegetables', 450]]),
  m('congee-egg-greens', 'Plain congee with egg and greens', 'A bowl of plain rice porridge (300 g), a boiled egg and pak choi',
    B, 'egg', ['eggs'], ['sg', 'asian'], 20, 'congee', [['Congee', 300], ['Egg, hard-boiled', 50], ['Pak choi, cooked', 80]]),
  m('chicken-rice', 'Chicken rice with cucumber', '120 g poached chicken, 180 g rice, cucumber, with chilli and ginger on the side',
    LD, 'meat', [], 'sg', 35, 'chicken', [['Chicken breast, roasted', 120], ['Rice, white, cooked', 180], ['Cucumber', 50]]),
  m('fish-beehoon-soup', 'Sliced fish bee hoon soup', '120 g fish with rice noodles and pak choi in clear broth',
    LD, 'meat', ['fish'], 'sg', 20, 'fish', [['Sea bass, cooked', 120], ['Rice noodles, cooked', 175], ['Pak choi, cooked', 80]]),
  m('steamed-fish-rice', 'Steamed fish with rice and pak choi', '130 g sea bass steamed with ginger and soy, 150 g rice, pak choi',
    LD, 'meat', ['fish', 'soya', 'wheat'], ['sg', 'asian'], 25, 'fish', [['Sea bass, cooked', 130], ['Rice, white, cooked', 150], ['Pak choi, cooked', 100], ['Olive oil', 3]]),
  m('yong-tau-foo', 'Yong tau foo soup (tofu and greens)', 'Tofu, greens and mushrooms with rice noodles in clear soup',
    LD, 'veg', ['soya'], 'sg', 20, 'tofu', [['Tofu, firm', 100], ['Pak choi, cooked', 80], ['Mushrooms', 40], ['Rice noodles, cooked', 150]]),
  m('thunder-tea-rice', 'Thunder tea rice', 'Brown rice with green beans, pak choi, tofu and a few peanuts',
    LD, 'veg', ['soya', 'peanuts'], 'sg', 30, 'rice', [['Brown rice, cooked', 150], ['Green beans, cooked', 60], ['Pak choi, cooked', 60], ['Tofu, firm', 60], ['Peanuts, roasted', 10]]),
  m('chicken-chow-mein', 'Chicken chow mein', 'A plate of chicken chow mein (300 g)',
    LD, 'meat', ['wheat', 'soya', 'eggs'], ['sg', 'asian'], 20, 'noodles', [['Chicken chow mein', 300]]),
  m('dumplings-pak-choi', 'Steamed dumplings with pak choi', 'Seven steamed dumplings (chicken or pork) and a plate of pak choi',
    LD, 'meat', ['wheat', 'soya'], ['sg', 'asian'], 15, 'dumplings', [['Dumplings (meat), steamed', 175], ['Pak choi, cooked', 100]]),
  m('tofu-veg-rice', 'Tofu and vegetables with rice', 'Tofu and mixed vegetables in soy sauce (250 g) with 150 g rice',
    LD, 'veg', ['soya', 'wheat'], ['sg', 'asian'], 20, 'tofu', [['Tofu and vegetables in soy sauce', 250], ['Rice, white, cooked', 150]]),
];

const TABLE = new Map(FOOD_TABLE.map(f => [f.name, f]));

/** A meal's nutrition, from its USDA foods and amounts. */
export function mealNutrients(meal: Meal): Nutrients {
  const total = { ...ZERO };
  for (const [name, grams] of meal.ingredients) {
    const food = TABLE.get(name);
    if (!food) continue;
    for (const k of Object.keys(total) as (keyof Nutrients)[]) total[k] += (food.per100g[k] || 0) * grams / 100;
  }
  return total;
}

/** Ingredient names that aren't in the USDA table (a test keeps this empty). */
export const unknownIngredients = () => MEALS.flatMap(meal => meal.ingredients.map(([n]) => n)).filter(n => !TABLE.has(n));

/** The meal slot for a time of day. */
export function slotAt(date = new Date()): MealSlot {
  const h = date.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21) return 'dinner';
  return 'snack';
}

export interface RankInput {
  slot: MealSlot;
  goal: Goal;
  targets: { kcal: number; protein: number; fibre: number };
  eaten: { kcal: number; protein: number; fibre: number };
  diet: Diet | null | undefined;
  allergens: string[];
  country: CountryCode;
  /** food names eaten in the last two days */
  recentFoods: string[];
  /** meal ids the person said "not for me" to */
  hidden: string[];
  /** From this week's gut report, if there is one (GutRankHints in src/lib/gut.ts): foods to favour, and possible triggers to go
   * easy on. Each is a phrase: words that must ALL be in one ingredient's name or in the meal's name, so [['brown', 'rice']] is
   * brown rice and never white rice, and a lone "cooked" can't match anything. */
  gutFavour?: string[][];
  gutAvoid?: string[][];
  /** the gut report found few fermented foods this week, and the gut can take them */
  wantsFermented?: boolean;
}

export interface RankedMeal {
  meal: Meal;
  n: Nutrients;
  score: number;
  /** one line on why it fits */
  why: string;
}

const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];

/** The dishes each country gets (a hard rule), in order: its own cuisine ranks higher, the next one a little higher. */
export const CUISINES_BY_COUNTRY: Record<CountryCode, Cuisine[]> = {
  IN: ['indian'],
  AE: ['mideast', 'med', 'indian'],  // about a third of the UAE's people are from India
  SG: ['sg', 'asian', 'indian'],
  GB: ['uk', 'med', 'american', 'asian'], IE: ['uk', 'med', 'american', 'asian'],
  US: ['american', 'uk', 'med', 'asian'], CA: ['american', 'uk', 'med', 'asian'],
  AU: ['uk', 'med', 'asian', 'american'], NZ: ['uk', 'med', 'asian', 'american'],
};

/** Meats never suggested there: most people in India don't eat beef, and in the UAE pork isn't eaten by most. */
export const COUNTRY_AVOID: Partial<Record<CountryCode, string[]>> = {
  IN: ['beef', 'veal', 'steak'],
  AE: ['pork', 'ham', 'bacon', 'gammon', 'prosciutto', 'pancetta', 'chorizo'],
};
/** Whether a dish's name (or description) has a meat avoided where the person lives. */
export const avoidedThere = (text: string, country: CountryCode) => {
  const avoid = COUNTRY_AVOID[country];
  return !!avoid && words(text).some(w => avoid.includes(w));
};

/** How much of what's left today this meal should take: breakfast a third, lunch about half, dinner most of it. */
export function slotBudget(slot: MealSlot, kcalLeft: number): number {
  const left = Math.max(0, kcalLeft);
  if (slot === 'snack') return Math.min(350, Math.max(120, left * 0.2));
  const share = slot === 'breakfast' ? 0.3 : slot === 'lunch' ? 0.45 : 0.85;
  return Math.min(950, Math.max(250, left * share));
}


/** Every meal that fits the slot, diet, allergens and "not for me", best first. */
export function rankMeals(input: RankInput): RankedMeal[] {
  const kcalLeft = input.targets.kcal - input.eaten.kcal;
  const budget = slotBudget(input.slot, kcalLeft);
  const share = input.slot === 'snack' ? 0.2 : input.slot === 'breakfast' ? 0.3 : input.slot === 'lunch' ? 0.45 : 0.85;
  const proteinNeed = Math.max(0, input.targets.protein - input.eaten.protein);
  const fibreNeed = Math.max(0, input.targets.fibre - input.eaten.fibre);
  // what this meal should bring (at least a sensible amount even once a target is met)
  const proteinFor = Math.max(input.slot === 'snack' ? 5 : 15, proteinNeed * share);
  const fibreFor = Math.max(input.slot === 'snack' ? 2 : 5, fibreNeed * share);
  const recent = new Set(input.recentFoods.flatMap(words));
  const favour = input.gutFavour ?? [];
  const avoid = input.gutAvoid ?? [];
  const local = CUISINES_BY_COUNTRY[input.country] ?? CUISINES_BY_COUNTRY.GB;
  const typedAllergies = customAllergies(input.allergens);

  const out: RankedMeal[] = [];
  for (const meal of MEALS) {
    if (!meal.slots.includes(input.slot)) continue;
    if (!meal.cuisines.some(c => local.includes(c))) continue;
    if (!tagFits(input.diet, meal.diet)) continue;
    if (meal.allergens.some(a => input.allergens.includes(a))) continue;
    if (input.hidden.includes(meal.id)) continue;
    const text = `${meal.name} ${meal.portion} ${meal.ingredients.map(([name]) => name).join(' ')}`;
    if (avoidedThere(text, input.country)) continue;
    if (typedAllergies.length && allergiesIn(text, typedAllergies).length) continue;
    const n = mealNutrients(meal);
    // the meal's name and each ingredient's name, as words: a hint phrase has to be whole inside one of them
    const parts: string[][] = [words(meal.name), ...meal.ingredients.map(([name]) => words(name))];
    const hasPhrase = (phrases: string[][]) => phrases.some(phrase => phrase.length > 0 && parts.some(part => phrase.every(w => part.includes(w))));
    const favoured = hasPhrase(favour);

    // calories: close to this meal's budget; going well over it costs more than coming in under
    const over = n.kcal - budget;
    let score = 1 - Math.min(1, Math.abs(over) / budget) - (over > budget * 0.25 ? 0.5 : 0);
    const protein = Math.min(1, n.protein / proteinFor);
    const fibre = Math.min(1, n.fiber / fibreFor);
    const carbShare = n.kcal > 0 ? (n.carbs * 4) / n.kcal : 0;
    switch (input.goal) {
      case 'Weight Loss':
        // protein and fibre, and protein per 100 kcal
        score += 1.3 * protein + 1.0 * fibre + Math.min(0.5, (n.protein / Math.max(1, n.kcal)) * 100 / 16);
        if (over > 0) score -= 0.4;
        break;
      case 'Weight Gain':
        score += 1.3 * protein + 0.5 * fibre + (over < -budget * 0.2 ? -0.5 : 0.2);
        break;
      case 'Cardio Endurance':
        score += 0.9 * protein + 0.6 * fibre + (carbShare >= 0.45 ? 0.5 : 0);
        break;
      default: // recovery: steady and balanced
        score += 1.0 * protein + 0.8 * fibre + (carbShare >= 0.3 && carbShare <= 0.6 ? 0.3 : 0);
    }
    // the country's own dishes first, then its next cuisine (Singapore and the UAE also get Indian dishes, which would
    // otherwise lead on protein and fibre)
    const place = Math.min(...meal.cuisines.map(c => local.indexOf(c)).filter(i => i >= 0));
    score += place === 0 ? 1.5 : place === 1 ? 0.5 : 0;
    if (favoured) score += 0.35;
    if (input.wantsFermented && meal.fermented) score += 0.3;
    if (hasPhrase(avoid)) score -= 1.5;
    if (words(meal.base).some(w => recent.has(w))) score -= 0.35;
    if (input.slot !== 'dinner' && meal.prepMinutes <= 10) score += 0.1;

    out.push({ meal, n, score, why: whyLine(meal, n, { budget, proteinNeed, fibreNeed, favoured, wantsFermented: !!input.wantsFermented, goal: input.goal }) });
  }
  return diversify(out.sort((a, b) => b.score - a.score));
}

export const PAGE_SIZE = 3;

// What a meal is eaten with: two roti dinners and a paratha on one page read like the same idea three times
const STAPLES: [string, RegExp][] = [['bread', /^(Roti|Paratha|Puri|Naan|Pitta|Wholemeal bread|White bread)/], ['rice', /^(Rice, white, cooked|Brown rice|Pulao)/]];
const stapleOf = (meal: Meal) => STAPLES.find(([, re]) => meal.ingredients.some(([name]) => re.test(name)))?.[0] ?? null;

/**
 * Pages of three never repeat a main ingredient: each next pick is the best one whose base isn't on its page yet —
 * and, while there's a choice, whose staple (bread or rice) isn't either.
 */
function diversify(sorted: RankedMeal[], size = PAGE_SIZE): RankedMeal[] {
  const rest = [...sorted];
  const out: RankedMeal[] = [];
  while (rest.length) {
    const page = out.slice(out.length - (out.length % size)).map(r => r.meal);
    const newBase = (r: RankedMeal) => !page.some(m => m.base === r.meal.base);
    const newStaple = (r: RankedMeal) => { const st = stapleOf(r.meal); return !st || !page.some(m => stapleOf(m) === st); };
    let i = rest.findIndex(r => newBase(r) && newStaple(r));
    if (i < 0) i = rest.findIndex(newBase);
    out.push(rest.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return out;
}

function whyLine(meal: Meal, n: Nutrients, c: { budget: number; proteinNeed: number; fibreNeed: number; favoured: boolean; wantsFermented: boolean; goal: Goal }): string {
  const kcal = Math.round(n.kcal / 10) * 10;
  const protein = Math.round(n.protein);
  const fibre = Math.round(n.fiber);
  if (c.favoured) return 'On your gut report’s list of foods to try this week.';
  if (c.wantsFermented && meal.fermented) return 'Fermented — you had few fermented foods this week.';
  if (c.proteinNeed >= 20 && protein >= Math.min(25, c.proteinNeed * 0.4)) return `${protein} g protein, towards the ${Math.round(c.proteinNeed)} g you still need today.`;
  if (c.fibreNeed >= 8 && fibre >= Math.min(8, c.fibreNeed * 0.4)) return `${fibre} g fibre, towards the ${Math.round(c.fibreNeed)} g still to go.`;
  if (c.goal === 'Weight Gain' && kcal >= c.budget * 0.9) return `About ${kcal} kcal with ${protein} g protein — good for gaining.`;
  return `About ${kcal} kcal — fits the ${Math.round(c.budget / 10) * 10} or so you have for this meal.`;
}

export const pageCount = (list: unknown[]) => Math.max(1, Math.ceil(list.length / PAGE_SIZE));
/** Page `page` (0-based, wrapping round). */
export function pageOf<T>(list: T[], page: number): T[] {
  if (!list.length) return [];
  const count = pageCount(list);
  const p = ((page % count) + count) % count;
  return list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
}

// "Not for me": meal ids the person never wants suggested (on the phone)
const HIDDEN_KEY = 'kx_meals_hidden';
export function loadHiddenMeals(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function hideMeal(hidden: string[], id: string): string[] {
  const next = [...new Set([...hidden, id])].slice(-200);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
  return next;
}
export function unhideAllMeals(): string[] {
  localStorage.removeItem(HIDDEN_KEY);
  return [];
}
