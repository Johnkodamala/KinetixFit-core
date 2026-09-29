// @vitest-environment jsdom
// Widgets (site/index.html → #widgets): the wall shows every home-screen widget the app has, named and marked Free or
// Plus exactly as the app sells them (src/lib/widgets.ts); every number on the widgets is Maya's at 15:30 on the hero's
// day, worked out with the app's own code; every word and colour is the widgets' own (their iPhone code in
// ios/App/KinetixFitWidgets — the Android layouts match); the home screen's story moves the water the way site.css
// draws it; and the Light / Dark switch works, with and without JS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../site/index.html?raw';
import appSource from '../App.tsx?raw';
import widgetViews from '../../ios/App/KinetixFitWidgets/WidgetViews.swift?raw';
import widgetStore from '../../ios/App/KinetixFitWidgets/WidgetStore.swift?raw';
import nightColours from '../../android/app/src/main/res/values-night/widget_glass_colors.xml?raw';
import { countryByCode, fmtNumber, setActiveCountry } from '../lib/countries';
import { localDayKey } from '../lib/dates';
import { FOOD_TABLE } from '../lib/foodTable';
import { sumNutrients, type LogEntry } from '../lib/foodLog';
import { hydrationWindow } from '../lib/notifications';
import { questsForToday } from '../lib/quests';
import { streakLabel, streakOf } from '../lib/streak';
import { waterAmount } from '../lib/water';
import { DEFAULT_WIDGET_PREFS, WIDGETS } from '../lib/widgets';
import { TIMELINES, paintStep, stepsOf } from './features';
import { initWidgets } from './widgets';
import { loadPage, stubBrowser } from './testing';

const section = () => document.querySelector<HTMLElement>('#widgets')!;
const home = () => document.querySelector<HTMLElement>('[data-feature="widgets"]')!;
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map(text);
const items = () => [...document.querySelectorAll<HTMLElement>('.wwall__item')];
const onWall = (name: string) => document.querySelector<HTMLElement>(`.wwall__item[data-widget="${name}"] .kw`)!;
/** The words a step shows in a swap: the .is-now one inside `selector`. */
const shown = (root: Element, selector: string) => text(root.querySelector(`${selector} .is-now`));
const nativeWords = widgetViews + widgetStore;
// The stylesheet, read from disk: a CSS import comes back empty in the tests, even with ?raw. (Node's types aren't part
// of the site's TypeScript setup, hence the loose types; the tests run from the project's root.)
const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as { readFileSync(path: string, encoding: 'utf8'): string };
const siteCss = fs.readFileSync(`${(globalThis as unknown as { process: { cwd(): string } }).process.cwd()}/src/site/site.css`, 'utf8');
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

beforeEach(() => {
  loadPage(pageHtml);
  setActiveCountry(countryByCode('GB'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('the wall: every widget the app has', () => {
  it('shows all of them, in the app’s order, named as the phone’s widget picker names them', () => {
    expect(items().map(li => li.dataset.widget)).toEqual(WIDGETS.map(w => w.name));
    expect(items().map(li => text(li.querySelector('.wwall__name')).replace(/ (Free|Plus)$/, ''))).toEqual(WIDGETS.map(w => w.name));
  });

  it('marks each Free or Plus as the app sells it', () => {
    items().forEach((li, i) => expect(text(li.querySelector('.wtier')), WIDGETS[i].name).toBe(WIDGETS[i].plus ? 'Plus' : 'Free'));
  });

  it('describes each for screen readers in the app’s own words, and hides the drawing', () => {
    items().forEach((li, i) => {
      expect(text(li.querySelector('.visually-hidden'))).toBe(WIDGETS[i].description);
      expect(li.querySelector('.wwall__art')!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('draws each at a size it comes in', () => {
    for (const w of WIDGETS) {
      const medium = onWall(w.name).classList.contains('kw--m');
      expect(w.sizes, w.name).toContain(medium ? 'Medium' : 'Small');
      expect(items().find(li => li.dataset.widget === w.name)!.classList.contains('is-m'), w.name).toBe(medium);
    }
  });

  it('counts them the way the copy does', () => {
    const plus = WIDGETS.filter(w => w.plus).length;
    expect(text(section().querySelector('.lead'))).toContain(`${cap(NUMBER_WORDS[WIDGETS.length])} home-screen widgets for iPhone and Android`);
    expect(text(document.querySelector('.wwall__title'))).toBe(`All ${WIDGETS.length} widgets`);
    const lead = text(document.querySelector('.wwall__lead'));
    expect(lead).toContain(`${cap(NUMBER_WORDS[WIDGETS.length - plus])} are free and ${NUMBER_WORDS[plus]} come with Plus`);
    expect(WIDGETS.filter(w => w.sizes === 'Small · Medium').length).toBeGreaterThan(WIDGETS.length / 2);
    expect(lead).toContain('Most come in small and medium');
  });

  it('gives every water widget the + the copy promises', () => {
    expect(text(section())).toContain('Tap + on any water widget and it fills');
    for (const w of WIDGETS.filter(x => x.name.startsWith('Water'))) {
      expect(onWall(w.name).querySelector('.kw-plus, .kw-cta'), w.name).not.toBeNull();
    }
  });

  it('only says what the widgets do: locked without Plus, buttons from iOS 17, a haptic on Android', () => {
    const note = text(document.querySelector('.wwall__note'));
    expect(note).toBe('Plus widgets show a locked card until you join Plus. On iPhone, widget buttons need iOS 17 or later; on Android they can give a haptic tap.');
    expect(widgetViews).toContain('struct LockedWidgetView');
    expect(widgetViews).toContain('Text("Tap to unlock")');
    expect(widgetViews).toContain('if #available(iOS 17.0, *) {\n            Button(intent: intent)');
    expect(WIDGETS.some(w => w.haptic)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Maya at 15:30 on Tuesday 13 October, the hero's day: the app last opened at 12:48 (the hero's phone), when she had
// 1.25 L of water, 6,842 steps, dal and two rotis after porridge and a banana, and had claimed two of three quests.
// ---------------------------------------------------------------------------------------------------------------------
const GOAL_ML = 2000;
const WATER = { rest: 1250, glass: 1500, goal: 2000 } as const;
const food = (name: string) => FOOD_TABLE.find(f => f.name === name)!;
const entry = (name: string, qty: number): LogEntry => {
  const f = food(name);
  return { id: name, foodKey: name, name: f.name, qty, unit: f.unit!.label, unitGrams: f.unit!.grams, eaten: 1, per100g: f.per100g, gramsKnown: true, estimated: false, at: 0 };
};
const eatenKcal = Math.round(sumNutrients([entry('Porridge (oats with water)', 1), entry('Banana', 1), entry('Dal', 1), entry('Roti / chapati', 2)]).kcal);
// her calories the way App.tsx's nhsTargets works them out (features.test.ts checks the formula against its source)
const planKcal = Math.round((10 * 62 + 6.25 * 165 - 5 * 29 - 161) * 1.55);
const quests = questsForToday('Cardio Endurance', {
  steps: 6842, sleepMinutes: 440, hrv: null, foodChecks: 4, protein: 43, proteinTarget: 87, fibre: 32, fibreTarget: 30, workoutsToday: 1,
}, ['Q-workout', 'Q-sleep-7h']);
const stepsGoal = quests.find(q => q.source === 'steps')?.goal ?? 10000;
const questsDone = quests.filter(q => ['Q-workout', 'Q-sleep-7h'].includes(q.id)).length;
const at1530 = new Date(2026, 9, 13, 15, 30);
const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const nextReminder = `Next ${clock(hydrationWindow(9, 17, 2, at1530.getTime()).next!)}`;
const streak = streakOf(Array.from({ length: 12 }, (_, i) => localDayKey(new Date(2026, 9, 13 - i))), at1530, 12);

describe('Maya’s numbers, worked out with the app’s code', () => {
  it('fills her water with a glass of her size, then Quick log’s bottle: 1.25 → 1.5 → 2 L of her 2 L goal', () => {
    expect(WATER.glass - WATER.rest).toBe(250);
    const bottle = DEFAULT_WIDGET_PREFS.quick.actions[1];
    expect(bottle).toEqual({ kind: 'water', ml: 500 });
    expect(WATER.goal - WATER.glass).toBe(bottle.kind === 'water' ? bottle.ml : NaN);
    const stage = home();
    for (const [step, ml] of [['rings', WATER.rest], ['glass', WATER.glass], ['goal', WATER.goal]] as const) {
      paintStep(stage, step, null, window);
      expect(shown(stage, '.kw--glass .kw-amt'), step).toBe(waterAmount(ml).replace(' ', ''));
      expect(shown(stage, '.kw--glass .kw-end'), step).toBe(`${Math.round((ml / GOAL_ML) * 100)}%`);
      expect(shown(stage, '.kw--glass .kw-t11'), step).toBe(ml >= GOAL_ML ? 'Goal reached' : nextReminder);
      expect(shown(stage, '.kw-today .kw-pill'), step).toBe(waterAmount(ml));
      expect(shown(stage, '.kw-quick .kw-mini'), step).toBe(waterAmount(ml));
      expect(shown(stage, '.kw-rings__rows .is-water'), step).toBe(`${waterAmount(ml)}/ ${waterAmount(GOAL_ML)}`);
      expect(shown(stage, '.kw-quick__line'), step).toBe(step === 'goal' ? `Logged ${waterAmount(500)} of water · 15:30` : 'Tap a button to log it');
    }
    // the wall is her afternoon before the taps
    expect(text(onWall('Water glass').querySelector('.kw-amt'))).toBe(waterAmount(WATER.rest).replace(' ', ''));
  });

  it('draws the water each step says: --w is today’s water over her goal, 1.25 L on the wall', () => {
    const w = Object.fromEntries([...siteCss.matchAll(/\.wshow__stage\[data-step='(\w+)'\] \{ --w: ([\d.]+);/g)].map(m => [m[1], Number(m[2])]));
    expect(w).toEqual({ start: WATER.rest / GOAL_ML, rings: WATER.rest / GOAL_ML, glass: WATER.glass / GOAL_ML });
    expect(siteCss).toMatch(/\.wshow__stage \{\n {2}--pw: [^\n]+\n {2}--w: 1;/); // the goal step: 2 of 2 L
    expect(siteCss).toMatch(/\.wwall \{\n {2}--w: 0\.625;/);
    expect(0.625).toBe(WATER.rest / GOAL_ML);
  });

  it('says when her next water reminder is, from the app’s default reminder hours', () => {
    for (const piece of ["localStorage.getItem('kinetix_hydration_interval') || '2'", "localStorage.getItem('kinetix_shift_start') || '9'", "localStorage.getItem('kinetix_shift_end') || '17'"]) {
      expect(appSource, piece).toContain(piece);
    }
    expect(nextReminder).toBe('Next 17:00');
    expect(widgetViews).toContain('return "Next " + WidgetStore.clock(next)');
    expect(widgetViews).toContain('if store.mlToday >= store.waterGoalMl { return "Goal reached" }');
    expect(texts(onWall('Water ring'), '.kw-wring__foot :is(.kw-t13, .kw-t11)')).toEqual([`${waterAmount(GOAL_ML - WATER.rest)} to go`, nextReminder]);
    expect(widgetViews).toContain('WidgetStore.amount(store.waterGoalMl - store.mlToday) + " to go"');
  });

  it('measures her steps against her steps quest, and counts the quests she’s claimed', () => {
    expect(appSource).toContain("const stepsQuestGoal = todayQuests.find(q => q.source === 'steps')?.goal ?? 10000;");
    expect(appSource).toContain('const questsDoneCount = todayQuests.filter(q => claimedQuestIds.includes(q.id)).length;');
    expect(stepsGoal).toBe(12000);
    for (const today of [home().querySelector('.kw-today')!, onWall('Kinetix Fit today')]) {
      expect(texts(today, '.kw-today__col .kw-num')).toEqual([fmtNumber(6842), fmtNumber(planKcal - eatenKcal), `${questsDone}/${quests.length}`]);
      expect(texts(today, '.kw-today__col .kw-t11')).toEqual([`of ${fmtNumber(stepsGoal)} steps`, 'kcal left', 'quests']);
      const bars = [...today.querySelectorAll<HTMLElement>('.kw-today__col .kw-bar i')].map(i => Number(i.style.getPropertyValue('--v')));
      [6842 / stepsGoal, eatenKcal / planKcal, questsDone / quests.length].forEach((v, n) => expect(bars[n]).toBeCloseTo(v, 3));
    }
    const steps = onWall('Steps');
    expect(text(steps.querySelector('.kw-end'))).toBe(`${Math.min(100, Math.floor((6842 / stepsGoal) * 100))}%`);
    expect(texts(steps, '.kw-ring__in > *')).toEqual([fmtNumber(6842), `of ${fmtNumber(stepsGoal)}`]);
    expect(widgetViews).toContain('"\\(min(100, Int(value * 100)))%"');
    for (const rings of [home().querySelector('.kw-rings')!, onWall('Daily rings')]) {
      expect(text(rings.querySelector('.kw-rings__rows .is-steps'))).toBe(`${fmtNumber(6842)}/ ${stepsGoal / 1000}k`);
      expect(text(rings.querySelector('.kw-rings__rows .is-food'))).toBe(`${fmtNumber(eatenKcal)}/ ${fmtNumber(planKcal)} kcal`);
    }
    expect(widgetViews).toContain('store.stepsGoal % 1000 == 0 ? "/ \\(store.stepsGoal / 1000)k"');
  });

  it('counts her food as Nourish does in the hero: 1,023 of 2,085 kcal', () => {
    expect(eatenKcal).toBe(1023);
    expect(planKcal).toBe(2085);
    expect(text(document.querySelector('[data-view="nourish"] .ap-eaten'))).toContain(`${fmtNumber(eatenKcal)} of ${fmtNumber(planKcal)} kcal eaten`);
    expect(texts(onWall('My stats'), '.kw-stat .kw-num')[2]).toBe(fmtNumber(planKcal - eatenKcal));
  });

  it('shows her 12-day streak, checked in today with energy 4/5, as the app works it out', () => {
    expect(streak).toMatchObject({ current: 12, today: true, best: 12 });
    for (const w of [home().querySelector('.kw-streak')!, onWall('Streak')]) {
      expect(texts(w, '.kw-streak__count > *')).toEqual([String(streak.current), 'day streak', `Best ${streak.best} days`]);
      expect(texts(w, '.kw-dots > span')).toEqual(streak.week.map(d => d.letter));
      expect(streak.week.every(d => d.done)).toBe(true);
      expect(text(w.querySelector('.kw-good'))).toBe('Done today');
    }
    expect(widgetViews).toContain('Text(s.today ? "Best \\(s.best) \\(s.best == 1 ? "day" : "days")" : status)');
    // Check-in: the hero's check-in said 4/5
    expect(text(document.querySelector('.ap-checkin__stats'))).toContain('4/5');
    expect(texts(onWall('Check-in'), '.kw-checkin__done > span:last-child > *')).toEqual(['Checked in', `Energy 4/5 · ${streakLabel(streak.current)}`]);
    expect(widgetViews).toContain('Text((e > 0 ? "Energy \\(e)/5 · " : "") + "\\(s.current)-day streak")');
    expect(text(onWall('Check-in').querySelector('.kw-end'))).toBe(String(streak.current));
  });

  it('dates Kinetix Fit today as the widget does, updated when the app last opened (12:48, the hero’s phone)', () => {
    const date = new Date(2026, 9, 13).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    expect(date).toBe('Tue 13 Oct');
    expect(text(home().querySelector('.kw-today__date'))).toBe(date);
    expect(text(document.querySelector('.ap__time'))).toBe('12:48');
    expect(text(home().querySelector('.kw-today > .kw-t10'))).toBe('Updated 12:48');
    expect(text(home().querySelector('.hs__time'))).toBe('15:30');
    expect(widgetViews).toContain('.dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(Locale(identifier: "en_GB"))');
  });

  it('draws her week: four days at her goal, today’s bar labelled the widget’s way', () => {
    const week = [1750, 2000, 2250, 1500, 2000, 2250, WATER.rest];
    const max = Math.max(GOAL_ML, ...week);
    const w = onWall('Water this week');
    const tracks = [...w.querySelectorAll<HTMLElement>('.kw-week__track')].map(t => Number(t.style.getPropertyValue('--v')));
    week.forEach((ml, n) => expect(tracks[n]).toBeCloseTo(ml / max, 2));
    expect(Number(w.querySelector<HTMLElement>('.kw-week__bars')!.style.getPropertyValue('--goal'))).toBeCloseTo(GOAL_ML / max, 2);
    expect(text(w.querySelector('.kw-pill'))).toBe(`Goal met ${week.filter(ml => ml >= GOAL_ML).length}/7`);
    expect(widgetViews).toContain('StatusPill(text: "Goal met \\(met)/7")');
    // Swift prints 1.25 with %.1f, which rounds half to even: "1.2"
    expect(widgetStore).toContain('String(format: "%.1f", Double(ml) / 1000).replacingOccurrences(of: ".0", with: "")');
    expect(text(w.querySelector('.kw-week__day.is-today b'))).toBe('1.2');
    expect(texts(w, '.kw-week__day').map(t => t.replace('1.2', ''))).toEqual(streak.week.map(d => d.letter));
  });

  it('sets the Plus widgets up as the app does out of the box', () => {
    const label = (a: (typeof DEFAULT_WIDGET_PREFS.quick.actions)[number]) => (a.kind === 'water' ? waterAmount(a.ml) : `${a.type} ${a.minutes}`);
    for (const quick of [home().querySelector('.kw-quick')!, onWall('Quick log')]) {
      expect(texts(quick, '.kw-qbtn')).toEqual(DEFAULT_WIDGET_PREFS.quick.actions.map(label));
    }
    expect(widgetStore).toContain('label: Self.amount(ml)');
    expect(widgetStore).toContain('label: "\\(type) \\(minutes)"');
    expect(widgetViews).toContain('WidgetStore.noteLogged(WidgetStore.amount(a.ml) + " of water")');
    expect(widgetStore).toContain('return "Logged \\(what) · " + Self.clock(');
    // My stats: steps, water, calories left and the streak, labelled as the widget labels them
    expect(DEFAULT_WIDGET_PREFS.stats.metrics).toEqual(['steps', 'water', 'kcalLeft', 'streak']);
    expect(texts(onWall('My stats'), '.kw-stat > .kw-t10')).toEqual(['steps', 'water', 'kcal left', 'day streak']);
    for (const words of ['label: "steps"', 'label: "water"', 'label: "kcal left"', 'label: "day streak"']) expect(widgetViews).toContain(words);
    // colours: Check-in violet, the others ocean (the site draws them so)
    expect(DEFAULT_WIDGET_PREFS.checkin.theme).toBe('violet');
    expect([DEFAULT_WIDGET_PREFS.quick.theme, DEFAULT_WIDGET_PREFS.stats.theme]).toEqual(['ocean', 'ocean']);
  });

  it('uses the widgets’ own words', () => {
    const everything = text(section());
    for (const words of ['TODAY', 'QUICK LOG', 'MY STATS', 'CHECK-IN', 'STREAK', 'WATER · THIS WEEK', 'STEPS', 'Checked in', 'Done today',
      'day streak', 'Snap food', 'Scan barcode', 'Tap a button to log it', 'today · of ', 'Add ']) {
      expect(nativeWords, words).toContain(`"${words}`);
      expect(everything, words).toContain(words.trim());
    }
    expect(nativeWords).toContain('"Updated "');
  });

  it('offers the dark look the widgets really have, in their own colours', () => {
    expect(text(section())).toContain('They follow your phone’s light or dark mode.');
    expect(nightColours).toMatch(/<color name="/);
    const light = siteCss.slice(siteCss.indexOf('.wshow {'), siteCss.indexOf('/* dark: the widgets’ -night colours'));
    const dark = siteCss.slice(siteCss.indexOf(".wshow:is([data-wtheme='dark']"), siteCss.indexOf('.wshow__intro {'));
    const token = (css: string, name: string) => css.match(new RegExp(`--${name}: (#[0-9A-F]{6});`))?.[1];
    const pairs: [string, string][] = [['kxInk', 'kw-ink'], ['kxInk2', 'kw-ink-2'], ['kxInk3', 'kw-ink-3'], ['kxWater', 'kw-water'],
      ['kxCardTop', 'kw-top'], ['kxCardBottom', 'kw-bottom'], ['kxFlame', 'kw-flame'], ['kxGood', 'kw-good']];
    for (const [swift, css] of pairs) {
      const m = widgetViews.match(new RegExp(`static let ${swift} = kx\\(0x([0-9A-F]{6}), 0x([0-9A-F]{6})\\)`))!;
      expect(m, swift).not.toBeNull();
      expect(token(light, css), `${css} light`).toBe(`#${m[1]}`);
      expect(token(dark, css), `${css} dark`).toBe(`#${m[2]}`);
    }
  });
});

describe('the home screen’s story', () => {
  it('closes the rings, adds a glass, then the bottle, and rests on her goal', () => {
    expect(stepsOf(TIMELINES.widgets)).toEqual(['start', 'rings', 'glass', 'goal']);
    expect(TIMELINES.widgets.still).toBe('goal');
    expect(TIMELINES.widgets.beats.filter(b => b.touch).map(b => b.touch)).toEqual(['glass', 'bottle']);
    expect(home().querySelector('[data-touch-target="glass"]')!.closest('.kw')!.classList.contains('kw--glass')).toBe(true);
    const bottle = home().querySelector('[data-touch-target="bottle"]')!;
    expect(bottle.closest('.kw')!.classList.contains('kw-quick')).toBe(true);
    expect(text(bottle)).toBe(waterAmount(500));
  });

  it('holds the rings back until they close: --rg is 0 only on the first step', () => {
    expect(siteCss).toContain(".wshow__stage[data-step='start'] { --w: 0.625; --rg: 0; }");
    expect(siteCss.match(/--rg: 0;/g)).toHaveLength(1);
  });

  it('tells it to screen readers in the same numbers', () => {
    const label = home().getAttribute('aria-label')!;
    for (const words of [`${fmtNumber(6842)} of ${fmtNumber(stepsGoal)} steps`, '1.25 of 2 litres of water', `${fmtNumber(eatenKcal)} of ${fmtNumber(planKcal)} kcal`,
      'fills to 1.5 litres', `taps ${waterAmount(500)} on her Quick log widget: 2 litres, her goal for the day`, `Her streak is ${streak.current} days, done today`]) {
      expect(label, words).toContain(words);
    }
    expect(home().getAttribute('role')).toBe('img');
    expect(home().querySelector('.phone')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the Light / Dark switch', () => {
  const choose = (value: 'light' | 'dark') => {
    const input = section().querySelector<HTMLInputElement>(`input[name="wtheme"][value="${value}"]`)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('is two labelled radios in a fieldset, Light first', () => {
    const radios = [...section().querySelectorAll<HTMLInputElement>('input[name="wtheme"]')];
    expect(radios.map(r => [r.value, r.checked, text(r.closest('label'))])).toEqual([['light', true, 'Light'], ['dark', false, 'Dark']]);
    expect(text(section().querySelector('.wswitch legend'))).toBe('See them in');
  });

  it('shows the light look first, the dark one when Dark is chosen, and back', () => {
    stubBrowser({ reducedMotion: true });
    expect(initWidgets()!.theme()).toBe('light');
    choose('dark');
    expect(section().dataset.wtheme).toBe('dark');
    choose('light');
    expect(section().dataset.wtheme).toBe('light');
  });

  it('cross-fades the change where the browser can, never with reduced motion', () => {
    const fade = vi.fn((update: () => void) => update());
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: fade });
    stubBrowser();
    initWidgets();
    choose('dark');
    expect(fade).toHaveBeenCalledTimes(1);
    expect(section().dataset.wtheme).toBe('dark');
    loadPage(pageHtml);
    stubBrowser({ reducedMotion: true });
    initWidgets();
    choose('dark');
    expect(fade).toHaveBeenCalledTimes(1);
    expect(section().dataset.wtheme).toBe('dark');
  });

  it('shows a choice the browser kept (back / forward) at once', () => {
    section().querySelector<HTMLInputElement>('#wtheme-dark')!.checked = true;
    stubBrowser({ reducedMotion: true });
    initWidgets();
    expect(section().dataset.wtheme).toBe('dark');
  });

  it('works without JS: the CSS reads the checked radio itself', () => {
    expect(section().dataset.wtheme).toBe('light');
    expect(siteCss).toContain(".wshow:is([data-wtheme='dark'], html:not(.js) .wshow:has(#wtheme-dark:checked)) {");
  });

  it('makes the wall a keyboard stop only while it scrolls sideways', async () => {
    const wall = document.querySelector<HTMLElement>('[data-wwall]')!;
    expect(wall.getAttribute('tabindex')).toBe('0'); // without JS, phones can still scroll it with the keys
    stubBrowser({ reducedMotion: true });
    initWidgets();
    expect(wall.hasAttribute('tabindex')).toBe(false); // jsdom lays nothing out: nothing to scroll
    Object.defineProperty(wall, 'scrollWidth', { configurable: true, value: 1640 });
    Object.defineProperty(wall, 'clientWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    await new Promise(r => setTimeout(r, 10));
    expect(wall.getAttribute('tabindex')).toBe('0');
    expect(wall.getAttribute('aria-labelledby')).toBe('wwall-title');
  });
});
