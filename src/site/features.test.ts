// @vitest-environment jsdom
// The five feature chapters: each stage's timeline tells its story in order, the steps land on the page as the CSS
// expects, the player only plays on screen (and never with reduced motion), and — most of all — every number and every
// piece of the app's wording in the mockups is the app's own, worked out here with the app's code for Maya.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import appSource from '../App.tsx?raw';
import aboutYouSource from '../components/AboutYouFlow.tsx?raw';
import cycleCardSource from '../components/CycleCard.tsx?raw';
import mealResultSource from '../components/MealResultCard.tsx?raw';
import scanProgressSource from '../components/ScanProgress.tsx?raw';
import workoutSheetSource from '../components/WorkoutSheet.tsx?raw';
import { flagAllergies } from '../lib/allergens';
import { suggestGoal } from '../lib/bmi';
import { countryByCode, allergenLabel, fmtDate, fmtNumber, setActiveCountry } from '../lib/countries';
import { cycleToday, dayDiff, shiftDay, PHASE_TEXT } from '../lib/cycle';
import { FOOD_TABLE } from '../lib/foodTable';
import { entryNutrients, portionText, splitTypedMeal, sumNutrients, type LogEntry } from '../lib/foodLog';
import { MEALS, pageOf, rankMeals } from '../lib/mealIdeas';
import { mainTargets, moreTargets, statusOf, statusText, valueOf, type NutrientTarget } from '../lib/nutrition';
import { MINUTE_PRESETS, MORE_WORKOUT_TYPES, WORKOUT_TYPES, formatMinutes } from '../lib/workouts';
import { TIMELINES, initFeatures, paintStep, scrollFor, stepAt, stepsOf, touchAt, type FeatureId } from './features';
import { FakeIntersectionObserver, loadPage, nextFrame, stubBrowser } from './testing';

const IDS = Object.keys(TIMELINES) as FeatureId[];
const stage = (id: FeatureId) => document.querySelector<HTMLElement>(`[data-feature="${id}"]`)!;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map(text);
const listed = (list: string | undefined) => (list ?? '').split(' ').filter(Boolean);

beforeEach(() => {
  loadPage(pageHtml);
  setActiveCountry(countryByCode('GB'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the timelines', () => {
  it.each(IDS)('%s: runs in order inside one loop, starts on a step, and fades out last', id => {
    const t = TIMELINES[id];
    const times = t.beats.map(b => b.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(t.beats[0]).toMatchObject({ at: 0 });
    expect(t.beats[0].step).toBeTruthy();
    expect(times.at(-1)!).toBeLessThan(t.loopMs);
    expect(t.beats.at(-1)!.fade).toBe(true);
    expect(stepsOf(t)).toContain(t.still);
  });

  it.each(IDS)('%s: every tap lands on something there, a moment before what it causes', id => {
    const t = TIMELINES[id];
    t.beats.forEach((beat, i) => {
      if (!beat.touch) return;
      expect(stage(id).querySelector(`[data-touch-target="${beat.touch}"]`), beat.touch).not.toBeNull();
      const effect = t.beats[i + 1];
      expect(effect?.step, beat.touch).toBeDefined();
      expect(effect.at - beat.at).toBeGreaterThan(0);
      expect(effect.at - beat.at).toBeLessThanOrEqual(300);
    });
  });

  it.each(IDS)('%s: the page only names steps the timeline has', id => {
    const steps = stepsOf(TIMELINES[id]);
    stage(id).querySelectorAll<HTMLElement>('[data-when], [data-on], [data-scroll-when], [data-count-zero]').forEach(el => {
      for (const attr of ['when', 'on', 'scrollWhen', 'countZero'] as const) {
        for (const step of listed(el.dataset[attr])) expect(steps, `${attr}="${step}"`).toContain(step);
      }
    });
  });

  it('tells each chapter’s story', () => {
    expect(stepsOf(TIMELINES.body)).toEqual(['start', 'plan', 'fill', 'more']);
    expect(stepsOf(TIMELINES.meals)).toEqual(['start', 'in', 'foot', 'page2', 'ai', 'back']);
    expect(stepsOf(TIMELINES.scan)).toEqual(['rest', 'bc-scan', 'bc-read', 'bc-done', 'bc-result', 'ph-scan', 'ph-read', 'ph-done', 'ph-result', 'type', 'ty-result']);
    expect(stepsOf(TIMELINES.cycle)).toEqual(['d2', 'd9', 'd12', 'd15', 'd21', 'd27']);
    expect(stepsOf(TIMELINES.watch)).toEqual(['rest', 'sheet', 'yoga', 'min45', 'down', 'added']);
    expect(stepAt(TIMELINES.scan, 0)).toBe('rest');
    expect(stepAt(TIMELINES.scan, 5000)).toBe('bc-result');
    expect(stepAt(TIMELINES.scan, 26000)).toBe('ty-result');
  });

  it.each(IDS)('%s: the page is written in its still step, exactly as painting it gives', id => {
    const el = stage(id);
    expect(el.dataset.step).toBe(TIMELINES[id].still);
    const classes = () => [...el.querySelectorAll('[data-when], [data-on]')].map(n => n.className);
    const written = classes();
    paintStep(el, TIMELINES[id].still, null, window);
    expect(classes()).toEqual(written);
  });
});

describe('painting a step', () => {
  it('writes the step, shows its words and chooses its options', () => {
    const watch = stage('watch');
    paintStep(watch, 'yoga', 'sheet', window);
    expect(watch.dataset.step).toBe('yoga');
    expect(texts(watch, '.apx-primary .is-now')).toEqual(['Add yoga · 30 min']);
    expect(texts(watch, '.apx-choice.is-on')).toEqual(['Yoga', '30 min']);
    paintStep(watch, 'min45', 'yoga', window);
    expect(texts(watch, '.apx-choice.is-on')).toEqual(['Yoga', '45 min']);
    expect(texts(watch, '.apx-primary .is-now')).toEqual(['Add yoga · 45 min']);
  });

  it('shows the plan’s numbers at 0 on the first step, then counts them up', async () => {
    stubBrowser();
    const body = stage('body');
    paintStep(body, 'start', null, window);
    expect(texts(body, '[data-count-to]')).toEqual(['0', '0', '0']);
    paintStep(body, 'plan', 'start', window);
    await new Promise(r => setTimeout(r, 1100));
    expect(texts(body, '[data-count-to]')).toEqual(['2,085', '87', '30']);
  });

  it('shows a tap: the touch dot plays and the button presses in, briefly', () => {
    vi.useFakeTimers();
    touchAt(stage('scan'), 'barcode', window);
    const dot = stage('scan').querySelector<HTMLElement>('[data-feat-touch]')!;
    expect(dot.classList.contains('is-on')).toBe(true);
    expect(stage('scan').dataset.press).toBe('barcode');
    vi.advanceTimersByTime(300);
    expect(stage('scan').dataset.press).toBeUndefined();
  });

  it('scrolls a card to what the step shows, measured, and back to the top without one', () => {
    const body = stage('body');
    const viewport = body.querySelector<HTMLElement>('[data-viewport]')!;
    const scroller = viewport.querySelector<HTMLElement>('[data-scroller]')!;
    const card = scroller.firstElementChild as HTMLElement;
    const link = body.querySelector<HTMLElement>('[data-scroll-when="more"]')!;
    const layout = (el: HTMLElement, props: Record<string, unknown>) =>
      Object.entries(props).forEach(([k, v]) => Object.defineProperty(el, k, { configurable: true, value: v }));
    layout(viewport, { clientHeight: 400 });
    layout(card, { offsetTop: 2, offsetParent: scroller });
    layout(link, { offsetTop: 700, offsetHeight: 17, offsetParent: card });
    body.dataset.step = 'more';
    scrollFor(body, 'more');
    // the link's foot (2 + 700 + 17) sits 112px above the stage's fading foot (400)
    expect(scroller.style.transform).toBe('translateY(-431px)');
    scrollFor(body, 'fill');
    expect(scroller.style.transform).toBe('');

    const scan = stage('scan');
    const sv = scan.querySelector<HTMLElement>('[data-viewport]')!;
    const ss = sv.querySelector<HTMLElement>('[data-scroller]')!;
    const result = scan.querySelector<HTMLElement>('[data-scroll-when="ph-result"]')!;
    layout(sv, { clientHeight: 500 });
    layout(result, { offsetTop: 400, offsetHeight: 600, offsetParent: ss });
    scrollFor(scan, 'ph-result');
    // a result comes up to 88px under the top, however tall it is
    expect(ss.style.transform).toBe('translateY(-312px)');
  });
});

describe('initFeatures', () => {
  it('with reduced motion, shows each stage’s still step and plays nothing', () => {
    stubBrowser({ reducedMotion: true });
    expect(initFeatures()).toEqual([]);
    for (const id of IDS) expect(stage(id).dataset.step).toBe(TIMELINES[id].still);
    expect(texts(stage('body'), '[data-count-to]')).toEqual(['2,085', '87', '30']);
  });

  it('without IntersectionObserver, shows the still steps too', () => {
    stubBrowser({ observers: false });
    expect(initFeatures()).toEqual([]);
    expect(stage('cycle').dataset.step).toBe('d9');
  });

  it('readies each stage on its first step as it nears the screen, and plays it only while it’s on screen', async () => {
    stubBrowser();
    const players = initFeatures();
    expect(players.map(p => p.id)).toEqual(IDS);
    for (const p of players) {
      // nothing is painted at load: each shows the still step it's written in
      expect(p.stage.dataset.step).toBe(TIMELINES[p.id].still);
      expect(p.isPlaying()).toBe(false);
      expect(p.stage.classList.contains('is-paused')).toBe(true);
    }
    const meals = players.find(p => p.id === 'meals')!;
    FakeIntersectionObserver.fireAll(meals.stage, true);
    expect(meals.stage.dataset.step).toBe(TIMELINES.meals.beats[0].step);
    expect(meals.isPlaying()).toBe(true);
    expect(players.find(p => p.id === 'body')!.isPlaying()).toBe(false);
    expect(players.find(p => p.id === 'body')!.stage.dataset.step).toBe(TIMELINES.body.still);
    await nextFrame();
    FakeIntersectionObserver.fireAll(meals.stage, false);
    expect(meals.isPlaying()).toBe(false);
    expect(meals.stage.classList.contains('is-paused')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Maya (the hero's example member): female, 29, 165 cm, 62 kg, moderately active, goal Build endurance, eats everything,
// allergic to sesame, in the UK. Her day so far: porridge and a banana at 08:20, dal and two rotis at 12:31.
// ---------------------------------------------------------------------------------------------------------------------
const food = (name: string) => FOOD_TABLE.find(f => f.name === name)!;
const entry = (name: string, qty: number, unit?: string, unitGrams?: number): LogEntry => {
  const f = food(name);
  return {
    id: name, foodKey: name, name: f.name, qty, unit: unit ?? f.unit!.label, unitGrams: unitGrams ?? f.unit!.grams, eaten: 1,
    per100g: f.per100g, gramsKnown: true, estimated: false, at: 0,
  };
};
const mayaLog = [entry('Porridge (oats with water)', 1), entry('Banana', 1), entry('Dal', 1), entry('Roti / chapati', 2)];
const totals = sumNutrients(mayaLog);
const eaten = { kcal: Math.round(totals.kcal), protein: Math.round(totals.protein), fibre: Math.round(totals.fiber) };

// Her plan the way App.tsx's nhsTargets works it out (checked against its source below): Mifflin-St Jeor × 1.55 for
// moderate activity, 1.4 g protein per kg for Cardio Endurance, fat 27% of calories, carbs the rest, the UK's fibre.
const bmr = 10 * 62 + 6.25 * 165 - 5 * 29 - 161;
const calories = Math.round(bmr * 1.55);
const protein = Math.round(62 * 1.4);
const fat = Math.round((calories * 0.27) / 9);
const plan = { calories, protein, fat, carbs: Math.round((calories - protein * 4 - fat * 9) / 4), fiber: countryByCode('GB').fibre('female', calories) };
const person = { sex: 'female', age: 29, country: 'GB' as const };

describe('01 Nutrition: Maya’s plan and her 11 nutrients', () => {
  it('works her plan out the way the app does', () => {
    for (const piece of ['10 * p.weight + 6.25 * p.height - 5 * p.age', 'base - 161', 'moderate: 1.55', "'Cardio Endurance': 1.4", '(calories * 0.27) / 9', '(calories - protein * 4 - fat * 9) / 4']) {
      expect(appSource, piece).toContain(piece);
    }
    expect(plan).toEqual({ calories: 2085, protein: 87, fat: 63, carbs: 293, fiber: 30 });
    const tiles = [...stage('body').querySelectorAll<HTMLElement>('[data-count-to]')].map(el => Number(el.dataset.countTo));
    expect(tiles).toEqual([plan.calories, plan.protein, plan.fiber]);
  });

  it('suggests her goal from her BMI, in the app’s words', () => {
    const suggestion = suggestGoal({ height: 165, weight: 62, age: 29, country: 'GB', region: null })!;
    expect(suggestion.goal).toBe('Cardio Endurance');
    expect(text(stage('body').querySelector('.apx-note'))).toBe(suggestion.reason);
    expect(aboutYouSource).toContain("'Cardio Endurance': 'Build endurance'");
    expect(aboutYouSource).toContain('Your plan is ready, {firstName}');
    expect(text(stage('body').querySelector('.apx-plan__eyebrow'))).toBe('Build endurance');
  });

  it('shows every nutrient needed vs eaten, as Nourish does', () => {
    const body = stage('body');
    expect(text(body.querySelector('.apx-targets .ap-kcal b'))).toBe(fmtNumber(plan.calories - eaten.kcal));
    expect(text(body.querySelector('.apx-targets .ap-kcal small'))).toBe('kcal left');
    expect(text(body.querySelector('.apx-targets .ap-eaten'))).toBe(`${fmtNumber(eaten.kcal)} of ${fmtNumber(plan.calories)} kcal eaten · ${mayaLog.length} foods`);
    const targets: NutrientTarget[] = [...mainTargets(plan).slice(1), ...moreTargets(plan, person)];
    const meters = [...body.querySelectorAll<HTMLElement>('.apx-targets .ap-meter')];
    expect(meters).toHaveLength(targets.length);
    targets.forEach((t, i) => {
      const had = valueOf(totals, t.key);
      const amount = (n: number) => fmtNumber(Number(n.toFixed(t.decimals)), t.decimals);
      const fmt = (n: number) => `${amount(n)}${t.unit === 'kcal' ? ' kcal' : ` ${t.unit}`}`;
      const m = meters[i];
      expect(text(m.querySelector('.ap-meter__label'))).toBe(t.label);
      expect(text(m.querySelector('.ap-meter__value'))).toBe(`${amount(had)} of ${fmt(t.amount!)}`);
      expect(text(m.querySelector('.ap-meter__foot'))).toBe(`${statusText(t, had, fmt)}${t.kind === 'limit' ? ' · limit' : ''}`);
      expect(Number(m.getAttribute('style')!.match(/--fill:\s*([\d.]+)/)![1])).toBeCloseTo(Math.min(1, had / t.amount!), 2);
      expect(m.classList.contains('is-met'), t.label).toBe(statusOf(t, had) === 'met');
    });
  });

  it('lists the 11 nutrients the copy promises, and gets the iron example right', () => {
    const labels = [...mainTargets(plan), ...moreTargets(plan, person)].map(t => t.label);
    const tags = texts(document.body, '.feat--body .feat__tags li');
    expect(tags).toHaveLength(11);
    tags.forEach((tag, i) => expect(labels[i].startsWith(tag), `${tag} / ${labels[i]}`).toBe(true));
    const iron = (age: number) => moreTargets(plan, { ...person, age }).find(t => t.key === 'ironMg')!.amount;
    expect(iron(29)).toBe(14.8);
    expect(iron(51)).not.toBe(14.8);
    expect(text(document.querySelector('.feat--body .feat__copy'))).toContain('Maya needs 14.8 mg of iron a day because she’s under 51');
  });
});

describe('02 Meal ideas: her dinner, ranked by the app', () => {
  const ranked = rankMeals({
    slot: 'dinner', goal: 'Cardio Endurance', targets: { kcal: plan.calories, protein: plan.protein, fibre: plan.fiber }, eaten,
    diet: 'everything', allergens: ['sesame'], country: 'GB', recentFoods: mayaLog.map(e => e.name), hidden: [],
  });

  it('shows the app’s first two pages of ideas, word for word', () => {
    const pages = [...stage('meals').querySelectorAll('[data-page]')];
    expect(pages).toHaveLength(2);
    pages.forEach((p, n) => {
      const shown = [...p.querySelectorAll('.apx-idea')].map(card => ({
        name: text(card.querySelector('.apx-idea__name')),
        kcal: text(card.querySelector('.apx-idea__kcal')),
        portion: text(card.querySelector('.apx-idea__desc')),
        why: text(card.querySelector('.apx-idea__why')),
        meta: texts(card, '.apx-idea__meta span'),
      }));
      expect(shown).toEqual(pageOf(ranked, n).map(r => ({
        name: r.meal.name,
        kcal: `${fmtNumber(Math.round(r.n.kcal))} kcal`,
        portion: r.meal.portion,
        why: r.why,
        meta: [`${Math.round(r.n.protein)}g protein`, `${Math.round(r.n.carbs)}g carbs`, `${Math.round(r.n.fiber)}g fibre`, `${r.meal.prepMinutes} min`],
      })));
    });
    expect(texts(stage('meals'), '.apx-foot [data-when]')).toEqual([
      `1–3 of ${ranked.length} · nutrition from USDA data`, `4–6 of ${ranked.length} · nutrition from USDA data`,
    ]);
    // her allergy is a hard rule
    for (const r of [...pageOf(ranked, 0), ...pageOf(ranked, 1)]) expect(r.meal.allergens).not.toContain('sesame');
  });

  it('says what’s left of her day the way the card does', () => {
    const left = `For what’s left today: ${fmtNumber(plan.calories - eaten.kcal)} kcal, ${fmtNumber(Math.max(0, plan.protein - eaten.protein))} g protein and ${fmtNumber(Math.max(0, plan.fiber - eaten.fibre))} g fibre to go.`;
    expect(text(stage('meals').querySelector('.apx-sub'))).toBe(left);
    expect(appSource).toContain('`For what’s left today: ${');
    expect(text(document.querySelector('.feat--meals .feat__copy'))).toContain(`Maya still needs ${plan.protein - eaten.protein} g of protein`);
    for (const words of ['Ideas for your {currentMealSlot()}', 'Ranked for you', 'Personal AI meal ideas',
      'Plus asks our AI for nine ideas built from your goal, BMI and everything you’ve eaten and done today — three at a time.',
      "'I ate this'", '>Not for me<', 'Show 3 more', 'nutrition from USDA data']) {
      expect(appSource, words).toContain(words);
    }
  });
});

describe('03 Food logging: a barcode, a photo and a typed meal', () => {
  const nutrientsLine = (n: ReturnType<typeof entryNutrients>) =>
    [`${Math.round(n.carbs)}gcarbs`, `${Math.round(n.protein)}gprotein`, `${Math.round(n.fiber)}gfibre`, `${Math.round(n.fat)}gfat`];
  const result = (step: string) => stage('scan').querySelector(`.apx-result[data-when="${step}"]`)!;
  const macros = (el: Element) => [...el.querySelectorAll('.apx-result__macros span')].map(s => (s.textContent ?? '').replace(/\s+/g, ''));

  it('catches sesame on a pack of houmous, as the app would, with the label’s numbers for 30 g', () => {
    const card = result('bc-result');
    expect(flagAllergies(['sesame'], 'Classic houmous', ['sesame'])).toEqual(['sesame']);
    expect(text(card.querySelector('.apx-result__status'))).toBe(`Contains ${allergenLabel('sesame')}`);
    const serving = { ...entry('Hummus', 1, 'serving', 30) };
    const n = entryNutrients(serving);
    expect(text(card.querySelector('.apx-result__title span'))).toBe(portionText(serving));
    expect(text(card.querySelector('.apx-result__kcal'))).toBe(`${Math.round(n.kcal)} kcal`);
    expect(macros(card)).toEqual(nutrientsLine(n));
    expect([...card.querySelectorAll('.apx-result__minerals div')].map(d => `${text(d.querySelector('dt'))} ${text(d.querySelector('dd'))}`)).toEqual([
      `Sodium ${Math.round(n.sodiumMg)}mg`, `Potassium ${Math.round(n.potassiumMg)}mg`, `Iron ${n.ironMg.toFixed(1)}mg`, `Calcium ${Math.round(n.calciumMg)}mg`,
    ]);
    const note = text(card.querySelector('.apx-result__note p'));
    expect(appSource).toContain(`\`Contains \${allergyList(flagged)}${note.slice(`Contains ${allergenLabel('sesame')}`.length)}\``);
    expect(appSource).toContain(text(card.querySelector('.apx-result__logged')));
  });

  it('logs a photo of salmon, sweet potato and broccoli as three foods — the ideas’ own dinner', () => {
    const photo = [entry('Salmon, cooked', 1, 'fillet', 130), entry('Sweet potato, baked', 1, 'portion', 150), entry('Broccoli', 1, 'portion', 80)];
    const card = result('ph-result');
    expect(texts(card, '.ap-foodlog__kcal')).toEqual(photo.map(e => `${Math.round(entryNutrients(e).kcal)} kcal`));
    expect(texts(card, '.ap-foodlog__name small')).toEqual(photo.map(e => `${portionText(e)} · estimate`));
    const n = sumNutrients(photo);
    expect(text(card.querySelector('.apx-result__kcal'))).toBe(`${Math.round(n.kcal)} kcal`);
    expect(macros(card)).toEqual(nutrientsLine(n));
    expect(text(card.querySelector('.apx-result__status'))).toBe(`${photo.length} foods logged`);
    const idea = MEALS.find(m => m.name === 'Salmon with sweet potato and broccoli')!;
    expect(idea.ingredients).toEqual(photo.map(e => [e.name, e.unitGrams]));
  });

  it('splits “2 roti and dal” on the phone, into the food table’s own entries', () => {
    expect(splitTypedMeal('2 roti and dal')).toEqual([{ name: 'roti', qty: 2, unit: null }, { name: 'dal', qty: null, unit: null }]);
    const typed = [entry('Roti / chapati', 2), entry('Dal', 1)];
    const card = result('ty-result');
    expect(texts(card, '.ap-foodlog__name b')).toEqual(typed.map(e => e.name));
    expect(texts(card, '.ap-foodlog__name small')).toEqual(typed.map(portionText));
    expect(texts(card, '.ap-foodlog__kcal')).toEqual(typed.map(e => `${Math.round(entryNutrients(e).kcal)} kcal`));
    const n = sumNutrients(typed);
    expect(text(card.querySelector('.apx-result__kcal'))).toBe(`${Math.round(n.kcal)} kcal`);
    expect(macros(card)).toEqual(nutrientsLine(n));
    expect(text(stage('scan').querySelector('.apx-search__typed'))).toBe('2 roti and dal');
  });

  it('uses the app’s wording throughout', () => {
    const scan = stage('scan');
    for (const words of texts(scan, '.apx-scanfx__text b').filter(w => w !== 'Got it')) expect(scanProgressSource, words).toContain(`'${words}'`);
    expect(scanProgressSource).toContain('<strong>Got it</strong>');
    expect(mealResultSource).toContain('Each food on its own — tap one to change it');
    expect(mealResultSource).toContain('Added to today’s food above, each food on its own.');
    expect(mealResultSource).toContain('foods logged');
    const goal = texts(scan, '.apx-result:not(.is-warning) .apx-result__note p');
    expect(goal).toHaveLength(2);
    for (const g of goal) expect(appSource).toContain(`if (profile.target === 'Cardio Endurance') return \`${g}\``);
    for (const words of ['Check a food', 'Nutrition and allergens for anything you eat — checked against yours.', 'Search a food',
      'Scan a barcode', 'Packaged food', 'Photo of a meal', 'Home-cooked or eating out', 'What this means for you']) {
      expect(appSource, words).toContain(words);
    }
  });
});

describe('04 Cycle: her card through the month', () => {
  const periods = ['2026-04-19', '2026-05-17', '2026-06-14', '2026-07-13', '2026-08-10', '2026-09-07', '2026-10-05'];
  const short = (day: string) => fmtDate(new Date(`${day}T12:00:00`), { day: 'numeric', month: 'short' });

  it.each(stepsOf(TIMELINES.cycle))('%s: the day, phase, words and next period are cycleToday’s', step => {
    const n = Number(step.slice(1));
    const c = cycleToday(periods, 28, 5, shiftDay(periods.at(-1)!, n - 1))!;
    expect(c.day).toBe(n);
    const cycle = stage('cycle');
    const at = (selector: string) => text(cycle.querySelector(`${selector} [data-when="${step}"]`));
    expect(at('.ap-count')).toBe(`Day ${c.day}`);
    expect(text(cycle.querySelector(`.apx-cycle__about [data-when="${step}"] .apx-cycle__phase`))).toBe(PHASE_TEXT[c.phase].title);
    expect(text(cycle.querySelector(`.apx-cycle__about [data-when="${step}"] .apx-sub`))).toBe(PHASE_TEXT[c.phase].body);
    expect(at('.apx-cycle__next')).toBe(c.daysUntil > 1 ? `In about ${c.daysUntil} days` : c.daysUntil === 1 ? 'Likely tomorrow' : 'Due now');
    expect(text(cycle.querySelector('.apx-cycle__window'))).toBe(`${short(c.windowStart)} – ${short(c.windowEnd)}`);
  });

  it('rests on 13 October, the hero’s day, and says how sure the prediction is', () => {
    expect(TIMELINES.cycle.still).toBe(`d${cycleToday(periods, 28, 5, '2026-10-13')!.day}`);
    const c = cycleToday(periods, 28, 5, '2026-10-13')!;
    expect(c.stats.confidence).toBe('good');
    expect(text(stage('cycle').querySelector('.apx-hint'))).toBe(`Based on your last ${c.stats.lengths.length} cycles, which are regular (about ${c.stats.average} days).`);
    expect(cycleCardSource).toContain('`Based on your last ${n} cycles, which are regular (about ${c.stats.average} days).`');
  });

  it('lists her periods the way the app’s sheet does', () => {
    const newest = [...periods].reverse();
    const rows = newest.slice(0, 4).map((p, i) => `${fmtDate(new Date(`${p}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} ${i === 0 ? 'Latest' : `${dayDiff(p, newest[i - 1])}-day cycle`}`);
    expect([...stage('cycle').querySelectorAll('.apx-periods__list li')].map(li => `${text(li.querySelector('b'))} ${text(li.querySelector('small'))}`)).toEqual(rows);
  });

  it('uses the card’s own wording', () => {
    for (const words of ['Your cycle', 'Fertile window (estimate)', 'Next period', 'My period started today', 'Log or edit periods',
      'Estimates from your own dates — not a way to prevent pregnancy. Your dates are saved to your account when you sign in.']) {
      expect(cycleCardSource, words).toContain(words);
    }
  });
});

describe('05 Workouts: no watch needed, and honest about points', () => {
  const watch = () => stage('watch');

  it('offers the app’s own choices, lengths and buttons', () => {
    expect(texts(watch(), '[data-choices="type"] .apx-choice')).toEqual([...WORKOUT_TYPES, 'Other…']);
    expect(text(watch().querySelector('.apx-show-more'))).toBe(`Show more · ${MORE_WORKOUT_TYPES.length} activities`);
    expect(texts(watch(), '[data-choices="minutes"] .apx-choice')).toEqual([...MINUTE_PRESETS.map(formatMinutes), 'Custom']);
    const add = (type: string, minutes: number) => `Add ${type.toLowerCase()} · ${formatMinutes(minutes)}`;
    expect(texts(watch(), '.apx-primary [data-when]')).toEqual([add('Walk', 30), add('Yoga', 30), add('Yoga', 45)]);
    expect(workoutSheetSource).toContain("`Add ${name ? name.toLowerCase() : 'workout'} · ${formatMinutes(minutes)}`");
    expect(text(document.querySelector('.feat--watch .feat__copy'))).toContain(`${WORKOUT_TYPES.length + MORE_WORKOUT_TYPES.length} activities`);
  });

  it('never says a workout added by hand earns points', () => {
    const note = text(watch().querySelector('.apx-sheet .apx-hint'));
    expect(workoutSheetSource).toContain(note);
    expect(note).toBe('Workouts you add are for your own record. Only ones your watch or phone records count for quests and points.');
    const chapter = text(document.querySelector('.feat--watch'));
    expect(chapter).toContain('Quests and points only count what your phone or watch records.');
    expect(chapter).not.toMatch(/(add|log)\w*[^.]{0,60}\b(earns?|gets?|wins?)\b[^.]{0,20}points/i);
    expect(text(watch().querySelector('.apx-workout[data-when="added"] .apx-workout__tag'))).toBe('Added by you');
  });

  it('uses the card’s own wording', () => {
    expect(appSource).toContain('. Recorded workouts count towards your quests.`');
    for (const words of ['No workouts yet today. Start one on your watch or in your fitness app and it appears here.', 'Earlier this week', 'Add a workout', 'See all']) {
      expect(appSource, words).toContain(words);
    }
  });
});
