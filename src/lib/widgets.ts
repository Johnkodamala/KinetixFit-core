// Hands today's numbers to the home-screen widgets, which keep showing them while the app is closed:
// Android android/.../WidgetBridgePlugin.java, iOS ios/App/App/WidgetBridgePlugin.swift (WidgetKit extension in
// ios/App/KinetixFitWidgets). No-op on the web.
//
// Also the widget catalogue for Account → Widgets (every widget, free and Plus, with a preview anyone can look at)
// and the settings of the Plus widgets — Check-in, Quick log and My stats — which the person edits in the app. The
// Plus widgets show a locked card on the home screen unless the app last said the person has Plus (`plus`).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { notePreferencesChanged } from './preferencesSync';

export interface WidgetSnapshot {
  day: string;
  hydrationEnabled: boolean;
  startHour: number;
  endHour: number;
  intervalHours: number;
  snoozedUntil: number | null;
  /** drinks logged today and the goal in glasses of the current size — what older widget code still reads */
  waterGlasses: number;
  waterGoal: number;
  /** today's water, the daily goal and the glass size, in ml (src/lib/water.ts) */
  waterMl: number;
  waterGoalMl: number;
  glassMl: number;
  steps: number | null;
  stepsGoal: number;
  kcalLeft: number;
  /** calories eaten today and the day's target (Daily rings widget) */
  kcalEaten: number;
  kcalTarget: number;
  /** ml per day for the last 7 days, oldest first, today last (Water this week widget) */
  waterWeek: number[];
  questsDone: number;
  questsTotal: number;
  /** protein eaten today and the target, in g (My stats) */
  protein: number;
  proteinTarget: number;
  /** the points balance (My stats) */
  points: number;
  /** workouts this week: recorded ones plus any added by hand (My stats) */
  workoutsWeek: number;
  /**
   * The check-in streak (src/lib/streak.ts): the run of days ending on `streakLastDay` (the last day with a
   * check-in, '' if none) — the widget works out whether it's still alive, so it's right even days later — and the
   * days with a check-in in the last 14 days, for the week dots.
   */
  streakRun: number;
  streakLastDay: string;
  streakBest: number;
  checkinDays: string[];
  /** today's check-in energy (1–5), 0 when not checked in yet (Check-in widget's done state) */
  energyToday: number;
  /** has KinetixFit Plus — left out while it isn't known yet, so the Plus widgets don't flicker to locked */
  plus?: boolean;
  /** the Plus widgets' settings (WidgetPrefs), flattened for the native side */
  statsMetrics: string;
  statsTheme: WidgetTheme;
  quickActions: string;
  quickTheme: WidgetTheme;
  quickHaptic: HapticStyle;
  checkinTheme: WidgetTheme;
  checkinHaptic: HapticStyle;
}

/** A check-in made on the Check-in widget, waiting for the app: when, and the energy tapped (1–5). */
export interface WidgetCheckIn { at: number; energy: number }
/** A workout logged with a Quick log button, waiting for the app. */
export interface WidgetWorkout { at: number; type: string; minutes: number }

const WidgetBridge = registerPlugin<{
  update(data: WidgetSnapshot): Promise<void>;
  takeGlasses(): Promise<{ times: number[]; mls?: number[] }>;
  takeCheckIns(): Promise<{ items: WidgetCheckIn[] }>;
  takeWorkouts(): Promise<{ items: WidgetWorkout[] }>;
  /** Android 8+: asks the launcher to place the widget (the launcher shows its own "Add" dialog). */
  pin(options: { kind: WidgetKind }): Promise<{ supported: boolean; requested: boolean }>;
  /** The kinds of KinetixFit widget currently placed on the home screen. */
  installed(): Promise<{ kinds: string[] }>;
}>('WidgetBridge');

export function updateWidgets(data: WidgetSnapshot) {
  if (!Capacitor.isNativePlatform()) return;
  WidgetBridge.update(data).catch(err => console.warn('Widget update failed:', err));
}

/**
 * Drinks added with a water widget's + since the app last asked: their time (ms) and, from Android widgets, their
 * amount (ml; iOS widgets send times only = one glass of the current size). The widget keeps them until the app takes
 * them, so each is counted once.
 */
export async function takeWidgetGlasses(): Promise<{ t: number; ml?: number }[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { times, mls } = await WidgetBridge.takeGlasses();
    return (times ?? []).map((t, i) => ({ t, ml: mls?.[i] && mls[i] > 0 ? mls[i] : undefined })).filter(d => Number.isFinite(d.t) && d.t > 0);
  } catch (err) {
    console.warn('Reading widget drinks failed:', err);
    return [];
  }
}

/** Check-ins tapped on the Check-in widget since the app last asked (older app-side builds: none). */
export async function takeWidgetCheckIns(): Promise<WidgetCheckIn[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { items } = await WidgetBridge.takeCheckIns();
    return (items ?? []).filter(c => Number.isFinite(c.at) && c.at > 0 && Number.isInteger(c.energy) && c.energy >= 1 && c.energy <= 5);
  } catch (err) {
    console.warn('Reading widget check-ins failed:', err);
    return [];
  }
}

/** Workouts logged with a Quick log button since the app last asked. */
export async function takeWidgetWorkouts(): Promise<WidgetWorkout[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { items } = await WidgetBridge.takeWorkouts();
    return (items ?? []).filter(w => Number.isFinite(w.at) && w.at > 0 && typeof w.type === 'string' && w.type.trim() && Number.isFinite(w.minutes) && w.minutes > 0);
  } catch (err) {
    console.warn('Reading widget workouts failed:', err);
    return [];
  }
}

/** Asks the launcher to add a widget (Android). `supported: false` on iOS, the web, or a launcher that can't. */
export async function pinWidget(kind: WidgetKind): Promise<{ supported: boolean; requested: boolean }> {
  if (Capacitor.getPlatform() !== 'android') return { supported: false, requested: false };
  try {
    return await WidgetBridge.pin({ kind });
  } catch (err) {
    console.warn('Pinning a widget failed:', err);
    return { supported: false, requested: false };
  }
}

/** The widgets on the home screen now (empty on the web or if the phone won't say). */
export async function installedWidgets(): Promise<WidgetKind[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { kinds } = await WidgetBridge.installed();
    return (kinds ?? []).filter((k): k is WidgetKind => WIDGETS.some(w => w.kind === k));
  } catch {
    return [];
  }
}

// --- The catalogue ---------------------------------------------------------------------------------------------

export type WidgetKind =
  | 'hydration' | 'waterLevel' | 'waterRing' | 'waterQuick' | 'waterWeek' | 'rings' | 'steps' | 'today' | 'scan'
  | 'glass' | 'streak' | 'checkin' | 'quick' | 'stats';

export interface WidgetInfo {
  kind: WidgetKind;
  name: string;
  description: string;
  /** "Small · Medium" (iOS names; the same on Android as 2×2 and 4×2) */
  sizes: string;
  plus: boolean;
  /** the buttons give a haptic tick on Android (iOS doesn't let widgets vibrate) */
  haptic: boolean;
  /** has settings in the app */
  editable: boolean;
}

/**
 * Every widget, in the order the gallery shows them. The names are the ones the phone's widget picker shows
 * (android/app/src/main/res/values/strings.xml, ios/App/KinetixFitWidgets/KinetixFitWidgets.swift).
 */
export const WIDGETS: WidgetInfo[] = [
  { kind: 'checkin', name: 'Check-in', plus: true, haptic: true, editable: true, sizes: 'Small · Medium',
    description: 'Tap how your energy is and you’re checked in — your streak and points, without opening the app.' },
  { kind: 'quick', name: 'Quick log', plus: true, haptic: true, editable: true, sizes: 'Small · Medium',
    description: 'Up to four buttons you choose — a glass, a bottle, your usual workout — logged in one tap.' },
  { kind: 'stats', name: 'My stats', plus: true, haptic: false, editable: true, sizes: 'Small · Medium',
    description: 'The numbers you care about — pick two to four and a colour.' },
  { kind: 'streak', name: 'Streak', plus: false, haptic: false, editable: false, sizes: 'Small · Medium',
    description: 'Your check-in streak and the last seven days.' },
  { kind: 'today', name: 'Kinetix Fit today', plus: false, haptic: false, editable: false, sizes: 'Medium',
    description: 'Steps, calories left, quests and today’s water.' },
  { kind: 'rings', name: 'Daily rings', plus: false, haptic: false, editable: false, sizes: 'Small · Medium',
    description: 'Steps, water and food as three rings towards today’s goals.' },
  { kind: 'steps', name: 'Steps', plus: false, haptic: false, editable: false, sizes: 'Small · Medium',
    description: 'Today’s steps in a ring towards your goal.' },
  { kind: 'hydration', name: 'Water bottle', plus: false, haptic: true, editable: false, sizes: 'Small · Medium',
    description: 'A bottle that fills up with today’s water, with a button to add a glass.' },
  { kind: 'waterLevel', name: 'Water level', plus: false, haptic: true, editable: false, sizes: 'Small · Medium',
    description: 'The whole widget fills with water as you drink.' },
  { kind: 'waterRing', name: 'Water ring', plus: false, haptic: true, editable: false, sizes: 'Small · Medium',
    description: 'A glowing ring towards today’s water goal.' },
  { kind: 'waterQuick', name: 'Water quick add', plus: false, haptic: true, editable: false, sizes: 'Small · Medium',
    description: 'Add a glass or a bottle in one tap, with today’s progress.' },
  { kind: 'waterWeek', name: 'Water this week', plus: false, haptic: true, editable: false, sizes: 'Small · Medium',
    description: 'Today’s water beside the last seven days and your goal.' },
  { kind: 'scan', name: 'Quick scan', plus: false, haptic: false, editable: false, sizes: 'Medium',
    description: 'Snap a meal or scan a barcode straight from your home screen.' },
  { kind: 'glass', name: 'Water glass', plus: false, haptic: true, editable: false, sizes: 'Small · Medium',
    description: 'A glass that fills up with today’s water on a frosted-glass card, with a button to add a glass.' },
];

export const widgetInfo = (kind: WidgetKind) => WIDGETS.find(w => w.kind === kind)!;

// --- Settings of the Plus widgets ------------------------------------------------------------------------------

export type StatId = 'steps' | 'water' | 'kcalLeft' | 'protein' | 'streak' | 'points' | 'quests' | 'workouts';
export type WidgetTheme = 'ocean' | 'ember' | 'forest' | 'violet' | 'mono';
export type HapticStyle = 'off' | 'light' | 'firm';
export type QuickAction = { kind: 'water'; ml: number } | { kind: 'workout'; type: string; minutes: number };

export const STAT_OPTIONS: { id: StatId; label: string }[] = [
  { id: 'steps', label: 'Steps' }, { id: 'water', label: 'Water' }, { id: 'kcalLeft', label: 'Calories left' },
  { id: 'protein', label: 'Protein' }, { id: 'streak', label: 'Streak' }, { id: 'points', label: 'Points' },
  { id: 'quests', label: 'Quests' }, { id: 'workouts', label: 'Workouts this week' },
];
/**
 * Colours: the card's accent gradient (numbers stay ink). The same five on every platform — the app's previews
 * (.kx-wp-theme-* in src/styles/widgets.css), Android (WidgetThemes.java) and iOS (WidgetViews.swift, WidgetTheme).
 */
export const THEMES: { id: WidgetTheme; label: string }[] = [
  { id: 'ocean', label: 'Ocean' },
  { id: 'ember', label: 'Ember' },
  { id: 'forest', label: 'Forest' },
  { id: 'violet', label: 'Violet' },
  { id: 'mono', label: 'Graphite' },
];
export const HAPTIC_OPTIONS: { id: HapticStyle; label: string }[] = [
  { id: 'off', label: 'Off' }, { id: 'light', label: 'Light' }, { id: 'firm', label: 'Firm' },
];
export const QUICK_WATER_ML = [150, 200, 250, 330, 500, 750, 1000];
export const MIN_STATS = 2, MAX_STATS = 4, MIN_QUICK = 1, MAX_QUICK = 4;

export interface WidgetPrefs {
  stats: { metrics: StatId[]; theme: WidgetTheme };
  quick: { actions: QuickAction[]; theme: WidgetTheme; haptic: HapticStyle };
  checkin: { theme: WidgetTheme; haptic: HapticStyle };
}

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  stats: { metrics: ['steps', 'water', 'kcalLeft', 'streak'], theme: 'ocean' },
  quick: { actions: [{ kind: 'water', ml: 250 }, { kind: 'water', ml: 500 }, { kind: 'workout', type: 'Walk', minutes: 30 }], theme: 'ocean', haptic: 'light' },
  checkin: { theme: 'violet', haptic: 'light' },
};

const PREFS_KEY = 'kx_widget_prefs';
const isTheme = (t: unknown): t is WidgetTheme => THEMES.some(x => x.id === t);
const isHaptic = (h: unknown): h is HapticStyle => HAPTIC_OPTIONS.some(x => x.id === h);

function cleanAction(a: unknown): QuickAction | null {
  const x = a as Record<string, unknown>;
  if (!x || typeof x !== 'object') return null;
  if (x.kind === 'water' && typeof x.ml === 'number' && x.ml >= 50 && x.ml <= 1000) return { kind: 'water', ml: Math.round(x.ml) };
  if (x.kind === 'workout' && typeof x.type === 'string' && x.type.trim() && typeof x.minutes === 'number' && x.minutes >= 1 && x.minutes <= 600) {
    return { kind: 'workout', type: x.type.trim().slice(0, 30), minutes: Math.round(x.minutes) };
  }
  return null;
}

/** Keeps saved settings inside what the widgets can draw; anything odd falls back to the default. */
export function cleanWidgetPrefs(raw: unknown): WidgetPrefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof WidgetPrefs, Record<string, unknown>>>;
  const d = DEFAULT_WIDGET_PREFS;
  const metrics = Array.isArray(p.stats?.metrics)
    ? [...new Set((p.stats.metrics as unknown[]).filter((m): m is StatId => STAT_OPTIONS.some(o => o.id === m)))].slice(0, MAX_STATS)
    : [];
  const actions = Array.isArray(p.quick?.actions)
    ? (p.quick.actions as unknown[]).map(cleanAction).filter((a): a is QuickAction => a !== null).slice(0, MAX_QUICK)
    : [];
  return {
    stats: { metrics: metrics.length >= MIN_STATS ? metrics : d.stats.metrics, theme: isTheme(p.stats?.theme) ? p.stats.theme : d.stats.theme },
    quick: {
      actions: actions.length >= MIN_QUICK ? actions : d.quick.actions,
      theme: isTheme(p.quick?.theme) ? p.quick.theme : d.quick.theme,
      haptic: isHaptic(p.quick?.haptic) ? p.quick.haptic : d.quick.haptic,
    },
    checkin: {
      theme: isTheme(p.checkin?.theme) ? p.checkin.theme : d.checkin.theme,
      haptic: isHaptic(p.checkin?.haptic) ? p.checkin.haptic : d.checkin.haptic,
    },
  };
}

export function loadWidgetPrefs(): WidgetPrefs {
  try {
    return cleanWidgetPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'));
  } catch {
    return cleanWidgetPrefs(null);
  }
}

export function saveWidgetPrefs(prefs: WidgetPrefs): WidgetPrefs {
  const clean = cleanWidgetPrefs(prefs);
  localStorage.setItem(PREFS_KEY, JSON.stringify(clean));
  notePreferencesChanged();
  return clean;
}

/** "Glass 250 ml", "Bottle 500 ml", "Run 30 min" — the button's label on the widget and in the editor. */
export function quickActionLabel(a: QuickAction): string {
  if (a.kind === 'workout') return `${a.type} ${a.minutes} min`;
  const amount = a.ml < 1000 ? `${a.ml} ml` : `${a.ml / 1000} L`;
  return `${a.ml >= 500 ? 'Bottle' : 'Glass'} ${amount}`;
}

/** The settings as the native widgets read them (see WidgetSnapshot). */
export function flattenPrefs(p: WidgetPrefs): Pick<WidgetSnapshot, 'statsMetrics' | 'statsTheme' | 'quickActions' | 'quickTheme' | 'quickHaptic' | 'checkinTheme' | 'checkinHaptic'> {
  return {
    statsMetrics: p.stats.metrics.join(','),
    statsTheme: p.stats.theme,
    // short keys: k = kind, ml, t = type, m = minutes, l = label
    quickActions: JSON.stringify(p.quick.actions.map(a => a.kind === 'water'
      ? { k: 'water', ml: a.ml, l: quickActionLabel(a) }
      : { k: 'workout', t: a.type, m: a.minutes, l: quickActionLabel(a) })),
    quickTheme: p.quick.theme,
    quickHaptic: p.quick.haptic,
    checkinTheme: p.checkin.theme,
    checkinHaptic: p.checkin.haptic,
  };
}
