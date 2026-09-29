# Generates src/lib/foodTable.ts (the app) and api/_lib/foodTable.js (the same foods for the server) from USDA
# FoodData Central's CSV downloads — SR Legacy (2018) for basic foods and FNDDS 2021-2023 ("survey foods") for dishes —
# with USDA's own portion weights. Don't hand-edit either file: add or change a line in SPEC and run this again.
#
#   1. Download "SR Legacy" and "FNDDS" (CSV) from https://fdc.nal.usda.gov/download-datasets and unzip both into one
#      folder (FoodData_Central_sr_legacy_food_csv_2018-04/ and FoodData_Central_survey_food_csv_2024-10-31/).
#   2. USDA_DIR=<that folder> python3 scripts/food-table/gen.py   (from the project root)
#
# It prints each food's numbers and portion, then PROBLEMS (a description or portion that didn't match, or calories
# that don't add up from protein, carbs and fat) — fix those before using the table.
import csv, re, json, os, sys
BASE = os.environ.get('USDA_DIR', 'scripts/food-table/usda')
SR = os.path.join(BASE, 'FoodData_Central_sr_legacy_food_csv_2018-04')
FN = os.path.join(BASE, 'FoodData_Central_survey_food_csv_2024-10-31')
OUT = 'src/lib/foodTable.ts'
OUT_SERVER = 'api/_lib/foodTable.js'
NUT={1008:'kcal',1003:'protein',1005:'carbs',1004:'fat',1079:'fiber',1258:'satFat',2000:'sugars',1093:'sodiumMg',1092:'potassiumMg',1089:'ironMg',1087:'calciumMg'}
# FNDDS uses the legacy nutrient numbers
NUT_FN={208:'kcal',203:'protein',205:'carbs',204:'fat',291:'fiber',606:'satFat',269:'sugars',307:'sodiumMg',306:'potassiumMg',303:'ironMg',301:'calciumMg'}
def load(d):
    foods={r['description']:r['fdc_id'] for r in csv.DictReader(open(os.path.join(d, 'food.csv')))}
    nut={}
    for r in csv.DictReader(open(os.path.join(d, 'food_nutrient.csv'))):
        k=(NUT_FN if d == FN else NUT).get(int(float(r['nutrient_id'])))
        if k: nut.setdefault(r['fdc_id'],{})[k]=float(r['amount'])
    por={}
    for r in csv.DictReader(open(os.path.join(d, 'food_portion.csv'))):
        por.setdefault(r['fdc_id'],[]).append(r)
    return foods,nut,por
data={'SR':load(SR),'FN':load(FN)}
# (aliases, display name, dataset, exact description, unit label, portion regex (None = grams only))
SPEC=[
 (['banana','bananas'],'Banana','SR','Bananas, raw','banana',r'^medium'),
 (['apple','apples'],'Apple','SR',"Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",'apple',r'^medium'),
 (['orange','oranges'],'Orange','SR','Oranges, raw, all commercial varieties','orange',r'^fruit'),
 (['mango','mangoes','mangos'],'Mango','SR','Mangos, raw','mango',r'fruit without refuse'),
 (['grapes','grape'],'Grapes','SR','Grapes, red or green (European type, such as Thompson seedless), raw','cup',r'^cup'),
 (['strawberries','strawberry'],'Strawberries','SR','Strawberries, raw','cup',r'^cup, whole'),
 (['watermelon'],'Watermelon','SR','Watermelon, raw','cup',r'^cup, diced'),
 (['pineapple'],'Pineapple','SR','Pineapple, raw, all varieties','cup',r'^cup, chunks'),
 (['papaya'],'Papaya','SR','Papayas, raw','cup',r'cup 1" pieces|^cup'),
 (['pear','pears'],'Pear','SR',"Pears, raw, bartlett (Includes foods for USDA's Food Distribution Program)",'pear',r'^medium'),
 (['kiwi','kiwifruit','kiwis'],'Kiwi','SR','Kiwifruit, green, raw','kiwi',r'fruit'),
 (['blueberries','blueberry'],'Blueberries','SR','Blueberries, raw','cup',r'^cup'),
 (['avocado','avocados'],'Avocado','SR','Avocados, raw, all commercial varieties','avocado',r'^avocado|fruit'),
 (['dates','date','medjool dates'],'Dates','SR','Dates, medjool','date',r'^date'),
 (['pomegranate'],'Pomegranate','SR','Pomegranates, raw','pomegranate',r'pomegranate|fruit'),
 (['guava','guavas'],'Guava','SR','Guavas, common, raw','guava',r'fruit'),
 (['tomato','tomatoes'],'Tomato','SR','Tomatoes, red, ripe, raw, year round average','tomato',r'^medium'),
 (['cucumber'],'Cucumber','SR','Cucumber, with peel, raw','cup',r'^cup slices'),
 (['carrot','carrots'],'Carrot','SR','Carrots, raw','carrot',r'^medium'),
 (['potato','potatoes','boiled potato'],'Potato, boiled','SR','Potatoes, boiled, cooked in skin, flesh, without salt','potato',r'potato|medium'),
 (['sweet potato','sweet potatoes'],'Sweet potato, baked','SR','Sweet potato, cooked, baked in skin, flesh, without salt','sweet potato',r'medium'),
 (['broccoli'],'Broccoli','SR','Broccoli, raw','cup',r'cup chopped'),
 (['spinach'],'Spinach','SR','Spinach, raw','cup',r'^cup'),
 (['onion','onions'],'Onion','SR','Onions, raw','onion',r'^medium'),
 (['peas','green peas'],'Peas','SR','Peas, green, cooked, boiled, drained, without salt','cup',r'^cup'),
 (['sweetcorn','corn','sweet corn'],'Sweetcorn','SR','Corn, sweet, yellow, cooked, boiled, drained, without salt','cup',r'^cup'),
 (['rice','white rice','cooked rice','boiled rice'],'Rice, white, cooked','SR','Rice, white, long-grain, regular, enriched, cooked','cup',r'^cup'),
 (['brown rice'],'Brown rice, cooked','SR',"Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)",'cup',r'^cup'),
 (['oats','rolled oats','oat'],'Oats (dry)','SR','Cereals, oats, regular and quick, not fortified, dry','cup',r'^cup'),
 (['porridge','oatmeal'],'Porridge (oats with water)','SR','Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt','cup',r'^cup'),
 (['bread','white bread','toast'],'White bread','SR','Bread, white, commercially prepared (includes soft bread crumbs)','slice',r'^slice'),
 (['brown bread','wholemeal bread','whole wheat bread','wholewheat bread'],'Wholemeal bread','SR','Bread, whole-wheat, commercially prepared','slice',r'^slice'),
 (['roti','chapati','chapatti','phulka'],'Roti / chapati','SR','Bread, chapati or roti, plain, commercially prepared','roti',r'piece|bread'),
 (['naan'],'Naan','SR','Bread, naan, plain, commercially prepared, refrigerated','naan',r'piece'),
 (['paratha'],'Paratha','FN','Bread, paratha','paratha',r'^1 paratha'),
 (['pasta','spaghetti','cooked pasta'],'Pasta, cooked','SR','Pasta, cooked, enriched, without added salt','cup',r'^cup'),
 (['quinoa'],'Quinoa, cooked','SR','Quinoa, cooked','cup',r'^cup'),
 (['egg','eggs'],'Egg','SR','Egg, whole, raw, fresh','egg',r'^large'),
 (['boiled egg','hard boiled egg','boiled eggs'],'Egg, hard-boiled','SR','Egg, whole, cooked, hard-boiled','egg',r'^large'),
 (['chicken breast','chicken','grilled chicken'],'Chicken breast, roasted','SR','Chicken, broilers or fryers, breast, meat only, cooked, roasted',None,None),
 (['salmon'],'Salmon, cooked','SR','Fish, salmon, Atlantic, farmed, cooked, dry heat','portion',r'^oz'),
 (['tuna','canned tuna'],'Tuna, canned in water','SR',"Fish, tuna, light, canned in water, drained solids (Includes foods for USDA's Food Distribution Program)",'can',r'^can'),
 (['mince','beef mince','ground beef'],'Beef mince, cooked','SR','Beef, ground, 85% lean meat / 15% fat, patty, cooked, broiled',None,None),
 (['lentils','lentil'],'Lentils, cooked','SR','Lentils, mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['dal','daal','dhal'],'Dal','FN','Dal','cup',r'^1 cup'),
 (['chickpeas','chickpea','chana','chole'],'Chickpeas, cooked','SR','Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['kidney beans','rajma'],'Kidney beans, cooked','SR','Beans, kidney, all types, mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['black beans'],'Black beans, cooked','SR','Beans, black, mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['tofu'],'Tofu, firm','SR','Tofu, raw, firm, prepared with calcium sulfate','cup',r'^.5 cup|cup'),
 (['paneer'],'Paneer','FN','Cheese, paneer','cup',r'^1 cup'),
 (['almonds','almond'],'Almonds','SR','Nuts, almonds','almond',r'^almond'),
 (['peanuts','peanut'],'Peanuts, roasted','SR','Peanuts, all types, dry-roasted, without salt','oz',r'^oz'),
 (['peanut butter'],'Peanut butter','SR','Peanut butter, smooth style, without salt','tbsp',r'^tbsp'),
 (['walnuts','walnut'],'Walnuts','SR','Nuts, walnuts, english','oz',r'^oz'),
 (['cashews','cashew','cashew nuts'],'Cashews','SR','Nuts, cashew nuts, raw','oz',r'^oz'),
 (['milk','whole milk','full fat milk'],'Milk, whole','SR','Milk, whole, 3.25% milkfat, with added vitamin D','glass',r'^cup'),
 (['semi skimmed milk','semi-skimmed milk','toned milk','2% milk'],'Milk, semi-skimmed','SR','Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D','glass',r'^cup'),
 (['skimmed milk','skim milk'],'Milk, skimmed','SR','Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)','glass',r'^cup'),
 (['greek yogurt','greek yoghurt'],'Greek yogurt, plain','SR','Yogurt, Greek, plain, whole milk',None,None),
 (['yogurt','yoghurt','curd','dahi','plain yogurt'],'Yogurt / curd, plain','SR','Yogurt, plain, whole milk','cup',r'^cup'),
 (['cheddar','cheese','cheddar cheese'],'Cheddar cheese','FN','Cheese, Cheddar','slice',r'^1 slice'),
 (['butter'],'Butter','SR','Butter, salted','tbsp',r'^tbsp'),
 (['ghee'],'Ghee','SR','Butter oil, anhydrous','tbsp',r'^tbsp'),
 (['olive oil','oil'],'Olive oil','SR','Oil, olive, salad or cooking','tbsp',r'^tablespoon|^tbsp'),
 (['honey'],'Honey','SR','Honey','tbsp',r'^tbsp'),
 (['sugar'],'Sugar','SR','Sugars, granulated','tsp',r'^tsp'),
 (['dark chocolate'],'Dark chocolate (70–85%)','SR','Chocolate, dark, 70-85% cacao solids','oz',r'^oz'),
 (['crisps','chips','potato chips'],'Crisps (potato chips)','SR','Snacks, potato chips, plain, salted','oz',r'^oz'),
 (['coffee','black coffee'],'Coffee, black','SR','Beverages, coffee, brewed, prepared with tap water','cup',r'^cup'),
 (['tea','black tea'],'Tea, black (no milk)','SR','Beverages, tea, black, brewed, prepared with tap water','cup',r'^cup'),
 (['mushrooms','mushroom'],'Mushrooms','SR','Mushrooms, white, raw','cup',r'^cup, pieces|^cup'),
 (['cauliflower'],'Cauliflower','SR','Cauliflower, raw','cup',r'^cup'),
 (['cabbage'],'Cabbage','SR','Cabbage, raw','cup',r'^cup, chopped|^cup'),
 (['lettuce','salad leaves'],'Lettuce','SR','Lettuce, cos or romaine, raw','cup',r'^cup'),
 (['red pepper','bell pepper','capsicum'],'Red pepper','SR','Peppers, sweet, red, raw','pepper',r'medium'),
 (['coconut'],'Coconut, fresh','SR','Nuts, coconut meat, raw','cup',r'^cup'),
 (['coconut water'],'Coconut water','FN','Coconut water, unsweetened',None,None),
 (['soy milk','soya milk'],'Soya milk','SR','Soymilk, original and vanilla, unfortified','glass',r'^cup'),
 (['couscous'],'Couscous, cooked','SR','Couscous, cooked','cup',r'^cup'),
 (['noodles','egg noodles'],'Egg noodles, cooked','SR','Noodles, egg, cooked, enriched, with added salt','cup',r'^cup'),
 (['cornflakes','corn flakes'],'Cornflakes','FN','Cereal, corn flakes, plain','cup',r'^1 cup'),
 (['pizza','cheese pizza'],'Cheese pizza','SR','Pizza, cheese topping, regular crust, frozen, cooked','slice',r'9 servings per 24 oz'),
 (['idli','idly'],'Idli','FN','Idli','idli',r'^1 item'),
 (['dosa','plain dosa'],'Dosa, plain','FN','Dosa, plain','dosa',r'^1 medium'),
 (['masala dosa'],'Dosa, with filling','FN','Dosa, with filling','dosa',r'^1 medium'),
 (['upma'],'Upma','FN','Upma','cup',r'^1 cup'),
 (['sambar'],'Sambar','FN','Sambar, vegetable stew','cup',r'^1 cup'),
 (['chicken biryani'],'Chicken biryani','FN','Biryani with chicken','cup',r'^1 cup'),
 (['veg biryani','vegetable biryani','biryani'],'Vegetable biryani','FN','Biryani with vegetables','cup',r'^1 cup'),
 (['samosa'],'Samosa','FN','Samosa','samosa',r'^1 regular'),
 (['chicken curry'],'Chicken curry','FN','Chicken curry','cup',r'^1 cup'),
 (['palak paneer'],'Palak paneer','FN','Palak Paneer','cup',r'^1 cup'),
 (['cottage cheese'],'Cottage cheese','FN','Cheese, cottage, creamed, large or small curd','cup',r'^1 cup'),
 # 28 Sep: everyday Indian dishes and staples for the meal ideas (src/lib/mealIdeas.ts), and a few from the UAE and Singapore
 (['chana saag','channa saag','chole saag'],'Chana saag','FN','Channa Saag','cup',r'^1 cup'),
 (['fish curry','machli curry','meen curry','fish masala'],'Fish curry','FN','Fish curry','cup',r'^1 cup'),
 (['lentil curry'],'Lentil curry','FN','Lentil curry','cup',r'^1 cup'),
 (['vegetable curry','veg curry','mixed veg','mixed vegetable curry','sabzi','sabji','subzi'],'Vegetable curry','FN','Vegetable curry','cup',r'^1 cup'),
 (['vada','medu vada','vadai','wada'],'Vada','FN','Vada','vada',r'^1 item'),
 (['buttermilk','chaas','chhaas','chhachh','mattha','majjiga','moru'],'Buttermilk (chaas)','FN','Buttermilk','glass',r'^1 cup'),
 (['pulao','pulav','pilaf','rice pilaf','veg pulao','vegetable pulao'],'Pulao (rice pilaf)','FN','Rice pilaf','cup',r'^1 cup'),
 (['bhindi','okra','ladyfinger','lady finger','bhindi sabzi','bhindi masala'],'Bhindi (okra), cooked','FN','Okra, fresh, cooked, fat added','cup',r'^1 cup'),
 (['baingan','brinjal','aubergine','eggplant','baingan sabzi','baingan bharta'],'Baingan (aubergine), cooked','FN','Eggplant, cooked, fat added','cup',r'^1 cup'),
 (['puri','poori'],'Puri','FN','Bread, puri','puri',r'^1 puri'),
 (['curry sauce','curry gravy','masala gravy'],'Curry sauce','FN','Curry sauce','tbsp',r'^1 tablespoon'),
 (['hummus','houmous'],'Hummus','FN','Hummus, plain','tbsp',r'^1 tablespoon'),
 (['falafel','falafels'],'Falafel','FN','Falafel','falafel',r'^1 patty'),
 (['pita','pitta','pita bread','pitta bread','wholemeal pitta','khubz'],'Pitta bread, wholemeal','FN','Bread, pita, whole wheat','pitta',r'^1 medium pita'),
 (['tabbouleh','tabouleh','tabouli'],'Tabbouleh','FN','Tabbouleh','cup',r'^1 cup'),
 (['lentil soup','shorbat adas','adas soup'],'Lentil soup','FN','Soup, lentil','bowl',r'^1 cup'),
 (['chicken kebab','shish tawook','shish taouk','chicken shish kebab'],'Chicken shish kebab with vegetables','FN','Chicken or turkey shish kabob with vegetables, excluding potatoes','skewer',r'^1 shishkabob'),
 (['lamb kebab','lamb shish kebab','shish kebab'],'Lamb shish kebab with vegetables','FN','Lamb shish kabob with vegetables, excluding potatoes','skewer',r'^1 shishkabob'),
 (['congee','rice porridge','jook'],'Congee','FN','Congee','bowl',r'^1 cup'),
 (['chicken congee','fish congee','congee with chicken'],'Congee with meat and vegetables','FN','Congee, with meat, poultry, and/or seafood, and vegetables','bowl',r'^1 cup'),
 (['rice noodles','bee hoon','rice vermicelli','mee hoon'],'Rice noodles, cooked','FN','Rice noodles, cooked','cup',r'^1 cup, cooked'),
 (['tofu and vegetables','tofu stir fry','vegetable tofu'],'Tofu and vegetables in soy sauce','FN','Tofu and vegetables including carrots, broccoli, and/or dark-green leafy; no potatoes, with soy-based sauce','cup',r'^1 cup'),
 (['dumplings','dumpling','steamed dumplings','dim sum','wonton','wontons','momo','momos'],'Dumplings (meat), steamed','FN','Wonton, dumpling or pot sticker, steamed','dumpling',r'^1 item'),
 (['chicken chow mein','chow mein'],'Chicken chow mein','FN','Chicken or turkey chow mein or chop suey with noodles','cup',r'^1 cup'),
 (['toor dal','tuvar dal','toovar dal','arhar dal','pigeon peas','red gram'],'Toor dal (pigeon peas), cooked','SR','Pigeon peas (red gram), mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['sprouts','moong sprouts','mung sprouts','bean sprouts','sprouted moong'],'Moong sprouts','SR','Mung beans, mature seeds, sprouted, raw','cup',r'^cup'),
 (['moong','moong dal','mung dal','mung beans','green gram','whole moong'],'Moong (mung beans), cooked','SR','Mung beans, mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['besan','gram flour','chickpea flour'],'Besan (gram flour)','SR','Chickpea flour (besan)','cup',r'^cup'),
 (['mutton','goat','goat meat'],'Mutton (goat), cooked','SR','Game meat, goat, cooked, roasted',None,None),
 (['keema','lamb mince','mutton keema','lamb keema'],'Lamb mince (keema), cooked','SR','Lamb, ground, cooked, broiled',None,None),
 (['surmai','king mackerel','kingfish','seer fish','vanjaram'],'Surmai (king mackerel), cooked','SR','Fish, mackerel, king, cooked, dry heat',None,None),
 (['dalia','daliya','broken wheat','bulgur','burghul'],'Dalia (bulgur), cooked','SR','Bulgur, cooked','cup',r'^cup'),
 # poha (flattened rice) isn't in USDA's data: raw white rice is its nearest food, and the meal ideas use it for poha
 (['raw rice','uncooked rice'],'Rice, white, raw','SR','Rice, white, long-grain, regular, raw, enriched','cup',r'^cup'),
 (['sarson','sarson ka saag','mustard greens'],'Mustard greens (sarson), cooked','SR','Mustard greens, cooked, boiled, drained, without salt','cup',r'^cup'),
 (['karela','bitter gourd','bitter melon'],'Karela (bitter gourd), cooked','SR','Balsam-pear (bitter gourd), pods, cooked, boiled, drained, without salt','cup',r'^cup \(1'),
 (['lauki','bottle gourd','ghiya','dudhi','doodhi'],'Lauki (bottle gourd), cooked','SR','Gourd, white-flowered (calabash), cooked, boiled, drained, without salt','cup',r'^cup'),
 (['lobia','chawli','black eyed peas','black-eyed peas','black eyed beans','cowpeas'],'Lobia (black-eyed peas), cooked','SR','Cowpeas, common (blackeyes, crowder, southern), mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['ful medames','fava beans','broad beans'],'Fava beans (ful), cooked','SR','Broadbeans (fava beans), mature seeds, cooked, boiled, without salt','cup',r'^cup'),
 (['hammour','grouper'],'Hammour (grouper), cooked','SR','Fish, grouper, mixed species, cooked, dry heat',None,None),
 (['sea bass','seabass','barramundi'],'Sea bass, cooked','SR','Fish, sea bass, mixed species, cooked, dry heat',None,None),
 (['bok choy','pak choi','pak choy'],'Pak choi, cooked','SR','Cabbage, chinese (pak-choi), cooked, boiled, drained, without salt','cup',r'^cup'),
 (['green beans','french beans'],'Green beans, cooked','SR','Beans, snap, green, cooked, boiled, drained, without salt','cup',r'^cup'),
]
# Liquids. A drink is kept per 100 ml in the app with amounts in ml, like a barcode drink; foods that are sometimes
# poured ("15 ml oil") stay by weight. Both get mlToG, grams in one ml, from USDA's own volume portions (milk: 1 cup
# = 244 g, so 1.031), so ml is never simply counted as grams.
DRINKS = {'Milk, whole', 'Milk, semi-skimmed', 'Milk, skimmed', 'Soya milk', 'Coconut water', 'Buttermilk (chaas)',
          'Coffee, black', 'Tea, black (no milk)'}
POURED = {'Olive oil', 'Ghee', 'Honey', 'Lentil soup', 'Sambar', 'Curry sauce'}
VOLUME_ML = [('cup', 236.588), ('fl oz', 29.5735), ('tablespoon', 14.787), ('tbsp', 14.787), ('teaspoon', 4.929), ('tsp', 4.929)]
def ml_to_g(ds, rows):
    # the largest volume USDA gives (a cup before a spoon) for the most precise figure; "with ice" isn't the drink
    for unit, ml in VOLUME_ML:
        for r in rows:
            text = ((r.get('portion_description') if ds == 'FN' else r.get('modifier')) or '').strip().lower()
            m = re.match(r'^(\d+(?:\.\d+)?)?\s*' + re.escape(unit) + r'\b(?!.*\bwith ice\b)', text)
            if not m: continue
            count = float(m.group(1)) if m.group(1) else float(r.get('amount') or 1)
            return round(float(r['gram_weight']) / (count * ml), 3)
    return None
out=[]; problems=[]
for aliases, name, ds, desc, unit, pr in SPEC:
    foods,nut,por = data[ds]
    fid = foods.get(desc)
    if not fid: problems.append(('MISSING', name, desc)); continue
    n = nut.get(fid, {})
    per = {k: round(n.get(k, 0), 2) for k in NUT.values()}
    missing = [k for k in ['satFat','sugars','sodiumMg','potassiumMg','ironMg','calciumMg'] if k not in n]
    # the app treats these as always known (CORE_NUTRIENTS in src/lib/foodLog.ts): a food without one would show 0
    # (USDA gives no fibre for dried lotus seeds / makhana, so it isn't in the table)
    problems += [('NO ' + k, name) for k in ['kcal', 'protein', 'carbs', 'fat', 'fiber'] if k not in n]
    u = None
    if unit and pr:
        rows = por.get(fid, [])
        fn = ds == 'FN'
        def label(r): return ((r.get('portion_description') if fn else r.get('modifier')) or '').strip()
        cand = [r for r in rows if re.search(pr, label(r), re.I)]
        if cand:
            r = cand[0]; amt = 1 if (fn or unit in ('portion', 'slice')) else (float(r.get('amount') or 1) or 1)
            u = {'label': unit, 'grams': round(float(r['gram_weight']) / amt, 1), 'from': label(r).strip()[:60]}
        else: problems.append(('NO PORTION', name, [label(r).strip() for r in rows][:8]))
    # plausibility: kcal vs 4c+4p+9f
    est = 4*per['carbs'] + 4*per['protein'] + 9*per['fat']
    if per['kcal'] > 20 and abs(est - per['kcal']) / per['kcal'] > 0.3: problems.append(('KCAL?', name, per['kcal'], round(est)))
    ml = ml_to_g(ds, por.get(fid, [])) if name in DRINKS | POURED else None
    if name in DRINKS | POURED and not ml: problems.append(('NO VOLUME PORTION', name))
    out.append({'names': aliases, 'name': name, 'source': 'USDA ' + ('SR Legacy' if ds=='SR' else 'FNDDS'), 'fdcId': int(fid), 'per100g': per,
                'missing': missing, 'unit': u, 'mlToG': ml, 'drink': name in DRINKS, 'description': desc})
for o in out:
    u=o['unit']; p=o['per100g']
    print(f"{o['name'][:26]:26} {p['kcal']:6} kcal P{p['protein']:5} C{p['carbs']:5} F{p['fat']:5} Fi{p['fiber']:4} | {(u['label']+'='+str(u['grams'])+'g  ['+u['from']+']') if u else 'grams'}")
print('\nPROBLEMS:'); [print(x) for x in problems]

# --- src/lib/foodTable.ts ---------------------------------------------------------------------------------------------
def num(x):
    return str(int(x)) if float(x).is_integer() else repr(round(float(x), 2))
def quoted(t):
    assert "'" not in t, t
    return "'" + t + "'"
def row(o, server=False):
    u = o['unit']
    unit = f"{{ label: {quoted(u['label'])}, grams: {num(u['grams'])} }}" if u else 'null'
    per = ', '.join(f"{k}: {num(v)}" for k, v in o['per100g'].items())
    liquid = (f", mlToG: {o['mlToG']}" if o['mlToG'] else '') + (', drink: true' if o['drink'] else '')
    # the server also names the USDA food it came from ("Bananas, raw"), as its own lookups do
    description = f", description: {json.dumps(o['description'])}" if server else ''
    return (f"  {{ names: [{', '.join(quoted(n) for n in o['names'])}], name: {quoted(o['name'])}, fdcId: {o['fdcId']}, "
            f"source: {quoted(o['source'])}{description}, unit: {unit}, missing: [{', '.join(quoted(m) for m in o['missing'])}], per100g: {{ {per} }}{liquid} }},")
HEADER = """// Common foods with their nutrition per 100 g, straight from USDA FoodData Central — SR Legacy (2018) for basic foods and
// FNDDS 2021-2023 (survey foods) for dishes such as idli, dosa, dal and biryani — plus USDA's own portion weights
// ("1 medium banana = 118 g"). Typed checks for these foods are answered here, on the phone: accurate, instant and
// without a server call. Generated from the USDA CSV downloads (fdcId is each food's FoodData Central id) by
// scripts/food-table/gen.py; regenerate rather than hand-edit. Dishes are USDA's standard recipes, so a home-made
// version can differ.
import type { Nutrients, NutrientKey } from './foodLog';

export interface TableFood {
  /** what people type for it (lower case, singular and plural) */
  names: string[];
  name: string;
  fdcId: number;
  source: string;
  /** USDA's portion for one piece / serving, or null = weigh it in grams */
  unit: { label: string; grams: number } | null;
  /** nutrients USDA doesn't list for this food */
  missing: NutrientKey[];
  per100g: Nutrients;
  /** grams in one ml, from USDA's own volume portions: drinks and foods sometimes poured (oil, honey) */
  mlToG?: number;
  /** a drink: kept per 100 ml, with amounts in ml, like a barcode drink */
  drink?: boolean;
}

export const FOOD_TABLE: TableFood[] = [
"""
SERVER_HEADER = """// The app's food table (src/lib/foodTable.ts) for the server, so a photo or a typed check the phone sends on finds the
// same USDA food and numbers as the phone does, plus each food's USDA description for "matchedFood". Generated with it
// by scripts/food-table/gen.py; regenerate rather than hand-edit. api/__tests__/foodTable.test.js checks the two agree.
export const FOOD_TABLE = [
"""
if problems and '--force' not in sys.argv:
    sys.exit('Not written: fix the problems above (or run with --force to write anyway).')
with open(OUT, 'w') as f:
    f.write(HEADER + '\n'.join(row(o) for o in out) + '\n];\n')
with open(OUT_SERVER, 'w') as f:
    f.write(SERVER_HEADER + '\n'.join(row(o, server=True) for o in out) + '\n];\n')
print(f'Wrote {len(out)} foods to {OUT} and {OUT_SERVER}')
