// Period tracking. The person logs the day each period starts; everything else is worked out from their own history —
// the standard method — rather than assuming a fixed 28 days:
//
// - Cycle length: the average of their last (up to) six cycles. With fewer than two logged periods, the length they
//   entered in Your details (28 by default) — so early estimates are rough, and the card says so.
// - Next period: the last start + that average, shown as a window: ± the spread of their cycles, at least ± 2 days.
// - Ovulation: about 14 days before the next period. The second half of the cycle (luteal phase) is fairly constant; it's
//   the first half that varies. So a 35-day cycle ovulates around day 21, not mid-cycle. Fertile window: the 5 days
//   before ovulation and the day itself (sperm live up to 5 days). An estimate for understanding the cycle — never for
//   contraception (NHS: "you cannot use a calendar to reliably work out your fertile time").
// - Late: past the window's end → "3 days late", with the usual reasons and a pregnancy-test note.
// - Irregular (NHS): cycles usually 21–35 days; lengths that vary by more than 7–9 days, or fall outside that range,
//   are worth mentioning to a GP.
// - Sleep, exercise, food and stress can't predict a cycle, but hard training, eating much less than usual, short sleep
//   and stress are known to delay or disrupt one — so they're shown as context for the current cycle, never as a forecast.
//
// Everything stays on the phone (health data; not sent to the server or the AI).
import { localDayKey } from './dates';

const noon = (day: string) => new Date(`${day}T12:00:00`);
export function shiftDay(day: string, n: number): string {
  const d = noon(day);
  d.setDate(d.getDate() + n);
  return localDayKey(d);
}
export const dayDiff = (from: string, to: string) => Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(noon(s).getTime());

/** Cycles shorter or longer than this are treated as a missed log or a skipped period, not a cycle. */
const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
const KEEP = 24;
export const LUTEAL_DAYS = 14;

// --- Storage: kx_periods = the days periods started, oldest first ---
const KEY = 'kx_periods';

/** Logged period starts. The first time, the profile's "last period started" date comes over as the first one. */
export function loadPeriods(profileLastStart?: string | null): string[] {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return isDay(profileLastStart) ? savePeriods([profileLastStart]) : [];
  try {
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? [...new Set(saved.filter(isDay))].sort() : [];
  } catch {
    return [];
  }
}

export function savePeriods(list: string[]): string[] {
  const clean = [...new Set(list.filter(isDay))].sort().slice(-KEEP);
  localStorage.setItem(KEY, JSON.stringify(clean));
  return clean;
}

/** Adds a period start. Within 10 days of another start it's the same period, so it replaces that one. */
export function addPeriod(list: string[], day: string, today = localDayKey()): string[] {
  if (!isDay(day) || day > today) return list;
  return savePeriods([...list.filter(p => Math.abs(dayDiff(p, day)) > 10), day]);
}

export const removePeriod = (list: string[], day: string) => savePeriods(list.filter(p => p !== day));

// --- Stats ---

export interface CycleStats {
  /** the lengths of recent complete cycles, oldest first */
  lengths: number[];
  /** what predictions use: the average of recent cycles, or the length entered */
  average: number;
  /** ± days around the prediction */
  spread: number;
  confidence: 'rough' | 'fair' | 'good';
  /** NHS: lengths outside 21–35 days, or varying by more than 8 days */
  irregular: boolean;
}

export function cycleStats(periods: string[], typicalLength: number): CycleStats {
  const lengths: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const len = dayDiff(periods[i - 1], periods[i]);
    if (len >= MIN_CYCLE && len <= MAX_CYCLE) lengths.push(len);
  }
  const recent = lengths.slice(-6);
  const typical = Math.min(45, Math.max(21, Math.round(typicalLength || 28)));
  const average = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : typical;
  const range = recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : 0;
  const spread = recent.length >= 2 ? Math.max(2, Math.ceil(range / 2)) : 3;
  const confidence = recent.length >= 4 && range <= 5 ? 'good' : recent.length >= 2 ? 'fair' : 'rough';
  const irregular = recent.length >= 3 && (range > 8 || recent.some(l => l < 21 || l > 35));
  return { lengths: recent, average, spread, confidence, irregular };
}

// --- Today ---

export type CyclePhase = 'period' | 'follicular' | 'fertile' | 'ovulation' | 'luteal' | 'due' | 'late';

export interface CycleToday {
  /** day of the cycle, 1 = the day the last period started */
  day: number;
  phase: CyclePhase;
  /** predicted start of the next period, and its window */
  next: string;
  windowStart: string;
  windowEnd: string;
  /** days until the predicted start (negative once past it) */
  daysUntil: number;
  /** days past the window's end (0 when not late) */
  lateBy: number;
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
  stats: CycleStats;
}

export function cycleToday(periods: string[], typicalLength: number, periodLength = 5, today = localDayKey()): CycleToday | null {
  const past = periods.filter(p => p <= today);
  if (!past.length) return null;
  const last = past[past.length - 1];
  const stats = cycleStats(past, typicalLength);
  const next = shiftDay(last, stats.average);
  const windowStart = shiftDay(next, -stats.spread);
  const windowEnd = shiftDay(next, stats.spread);
  const ovulation = shiftDay(next, -LUTEAL_DAYS);
  const fertileStart = shiftDay(ovulation, -5);
  const day = dayDiff(last, today) + 1;
  const daysUntil = dayDiff(today, next);
  const lateBy = Math.max(0, dayDiff(windowEnd, today));
  const len = Math.min(10, Math.max(2, Math.round(periodLength || 5)));
  const phase: CyclePhase = lateBy > 0 ? 'late'
    : day <= len ? 'period'
    : today === ovulation ? 'ovulation'
    : today >= fertileStart && today < ovulation ? 'fertile'
    : today >= windowStart ? 'due'
    : today < fertileStart ? 'follicular'
    : 'luteal';
  return { day, phase, next, windowStart, windowEnd, daysUntil, lateBy, ovulation, fertileStart, fertileEnd: ovulation, stats };
}

export const PHASE_TEXT: Record<CyclePhase, { title: string; body: string }> = {
  period: { title: 'Period', body: 'Energy can dip in the first days. Gentle movement and iron-rich foods (lentils, spinach, red meat) help.' },
  follicular: { title: 'Follicular phase', body: 'Oestrogen rises after your period, and many people feel more energetic — a good time for harder workouts.' },
  fertile: { title: 'Fertile window (estimate)', body: 'Around the days you’re most likely to conceive. An estimate from your dates — not a way to prevent pregnancy.' },
  ovulation: { title: 'Ovulation (estimate)', body: 'Around now an egg is likely released. Some people notice mild one-sided pain or more energy.' },
  luteal: { title: 'Luteal phase', body: 'Progesterone rises; bloating, cravings or low mood before a period are common. Keep meals regular and sleep steady.' },
  due: { title: 'Period due soon', body: 'Your period could start any day now.' },
  late: { title: 'Period late', body: 'Stress, illness, travel, big changes in exercise or eating, and pregnancy can all delay a period. If you might be pregnant, take a test.' },
};

// --- Context from the rest of the app (not a forecast) ---

export interface CycleContextInput {
  /** from the start of this cycle to today */
  since: string;
  today?: string;
  sleepHoursByDay: Record<string, number>;
  workoutMinutesByDay: Record<string, number>;
  kcalByDay: Record<string, number>;
  kcalTarget: number;
  /** HRV per day, if a watch shares it */
  hrvByDay?: Record<string, number>;
}

/** Things this cycle that are known to delay or disrupt periods — shown with the prediction, never as one. */
export function cycleContext(c: CycleContextInput): string[] {
  const today = c.today ?? localDayKey();
  const days: string[] = [];
  for (let d = c.since; d <= today && days.length < 60; d = shiftDay(d, 1)) days.push(d);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const notes: string[] = [];
  const sleep = days.map(d => c.sleepHoursByDay[d]).filter((h): h is number => typeof h === 'number' && h > 0);
  const avgSleep = avg(sleep);
  if (sleep.length >= 5 && avgSleep !== null && avgSleep < 6.5) {
    notes.push(`You’ve averaged ${Math.round(avgSleep * 10) / 10} h of sleep this cycle. Short sleep and stress can make a period come later.`);
  }
  const weeks = Math.max(1, days.length / 7);
  const trainingPerWeek = days.reduce((t, d) => t + (c.workoutMinutesByDay[d] ?? 0), 0) / weeks;
  if (days.length >= 7 && trainingPerWeek >= 420) {
    notes.push(`About ${Math.round(trainingPerWeek / 60)} hours of workouts a week this cycle. Very hard training, especially without eating enough, can delay periods.`);
  }
  const eaten = days.map(d => c.kcalByDay[d]).filter((k): k is number => typeof k === 'number' && k > 300);
  const avgKcal = avg(eaten);
  if (eaten.length >= 5 && avgKcal !== null && c.kcalTarget > 0 && avgKcal < c.kcalTarget * 0.7) {
    notes.push(`On the days you logged food you ate about ${Math.round(avgKcal / 10) * 10} kcal — well under your ${Math.round(c.kcalTarget / 10) * 10}. Eating too little can delay or stop periods.`);
  }
  const hrv = days.map(d => c.hrvByDay?.[d]).filter((h): h is number => typeof h === 'number' && h > 0);
  if (hrv.length >= 10) {
    const firstHalf = avg(hrv.slice(0, Math.floor(hrv.length / 2)))!;
    const secondHalf = avg(hrv.slice(Math.floor(hrv.length / 2)))!;
    if (secondHalf < firstHalf * 0.8) notes.push('Your HRV has dropped this cycle, which often goes with stress or poor recovery.');
  }
  return notes;
}
