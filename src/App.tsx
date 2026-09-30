import React, { useState, useEffect, useRef, useMemo, useCallback, useEffectEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Purchases, type CustomerInfo, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Health, type HealthSample, type HealthDataType } from '@capgo/capacitor-health';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase, isSupabaseConfigured, openedFromRecoveryLink, openedLinkError } from './lib/supabase';
import { syncAllOnLogin, flushOutbox, clearAllDomainData } from './lib/sync';
import { fetchTodaysClaimedQuestIds, mergeClaimedQuestIds } from './lib/questClaims';
import { bearerHeader } from './lib/sessionToken';
import { claimCheckIns, claimableCheckInDays } from './lib/checkinClaims';
import { fetchServerBalance, reconcileBalance, readLocalBalance, writeLocalBalance, type Balance } from './lib/ledgerBalance';
import { noteProfileChanged, readLocalProfile } from './lib/profileSync';
import './lib/preferencesSync';
import './lib/gutSync';
import './lib/checkinsSync';
import './lib/periodsSync';
import './lib/waterSync';
import './lib/savedFoodsSync';
import './lib/foodLogSync';
import './lib/workoutsSync';
import './lib/vitalsHistorySync';
import { recordVitalReading, recordDailyVitalTotal } from './lib/vitalsHistory';
import { alreadyRegistered, authErrorText, EMAIL_CONFIRMED_URL, PASSWORD_RESET_URL, RESEND_WAIT_S } from './lib/auth';
import { serverUrl } from './lib/server';
import { localDayKey, localDayKeyDaysAgo } from './lib/dates';
import { bmiOf } from './lib/bmi';
import { countryOf, countryByCode, setActiveCountry, fmtNumber, fmtDate, fmtTime, fmtMoney, allergenLabel, deviceTimeZone, type CountryCode } from './lib/countries';
import { primarySourceLabel, isSamsungDevice } from './lib/healthSources';
import { getThemePref, setThemePref, type ThemePref } from './lib/theme';
import { selection as hapticSelection, tap as hapticTap } from './lib/feedback';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import BiometricTrendCard, { type DailyPoint } from './components/BiometricTrendCard';
import { ProfileSettingsList } from './components/ProfileFields';
import AboutYouFlow from './components/AboutYouFlow';
import HealthConnectSheet from './components/HealthConnectSheet';
import { healthConnectProblem, type HealthConnectProblem } from './lib/healthConnect';
import TabBar from './components/TabBar';
import { ChoiceCards, Segmented, Sheet, SheetRow } from './components/Pickers';
import { StepsIcon, HeartIcon, SleepIcon, StressIcon, CameraIcon, BellIcon, MessageIcon, ChevronIcon, FlameIcon, DumbbellIcon, MedalIcon, TrophyIcon, LockIcon, RecoveryIcon, BikeIcon, WavesIcon, BowlIcon, TargetIcon, GiftIcon, SearchIcon, BarcodeIcon } from './components/Icons';
import TrackLanes from './components/TrackLanes';
import HydrationHero, { HydrationSheet } from './components/HydrationHero';
import FoodEntrySheet, { ExtrasPicker } from './components/FoodEntrySheet';
import FoodHistorySheet from './components/FoodHistorySheet';
import ScanProgress, { type ScanKind } from './components/ScanProgress';
import NutritionMeters from './components/NutritionMeters';
import { ONBOARDED_EMAIL_KEY, hasOnboarded, markOnboarded, markLoggedInAccount, savedOnboardingStep, saveOnboardingStep, clearOnboardingStep } from './lib/onboarding';
import { handleBack, useBackHandler } from './lib/backButton';
import { DIET_OPTIONS, dietLabel, checkFood, checkProduct, dietNote, isVegetarian, type Diet } from './lib/diet';
import { GUT_FEELS, SYMPTOMS, PLANTS_GOAL, feelLabel, symptomLabel, loadGutChecks, saveGutCheck, gutReportStatus, reportProgressText, reportDays, buildGutReport, type GutChecks, type GutFeel, type SymptomId } from './lib/gut';
import { mainTargets as planNutrientTargets, moreTargets as guidanceNutrientTargets } from './lib/nutrition';
import {
  loadFoodDays, saveFoodDays, loadFoods, isPlausible, findTableFood, foodFromTable, per100gOf, saveFoods, sumNutrients, entryNutrients, portionText, foodFromScan, rememberFood,
  entryFromFood, lastPortion, copyEntry, touchFood, findFoodByName, searchFoods, recentFoods, parseTypedPortion, barcodeKey, nameKey, savedFoodPortion,
  foodFromScanItem, extrasFromNoteExcept, mealCount, newId, splitTypedMeal, GRAMS, ML,
  ZERO, foodTitle, extrasText, withExtra, extrasFromNote, type FoodDays, type LogEntry, type SavedFood, type ScanPayload, type ScanItem, type FoodSource, type TypedPortion, type Nutrients, type Portion,
} from './lib/foodLog';
import MealResultCard, { type MealCard } from './components/MealResultCard';
import { setupNotifications, styled, scheduleNotifications, nutritionAlert, reminderHours, hydrationNotifications, hydrationSnoozeNotification, cancelHydration, ACTION_SNOOZE, ACTION_ADD_GLASS, ACTION_CHECK_IN, NUTRITION_BASE_ID, gutReminderNotifications, cancelGutReminders, GUT_REMINDER_HOUR, streakReminderNotifications, cancelStreakReminders, STREAK_REMINDER_TIME } from './lib/notifications';
import { questsForToday, allQuestValues, type Quest } from './lib/quests';
import { updateWidgets, takeWidgetGlasses, takeWidgetCheckIns, takeWidgetWorkouts, flattenPrefs, loadWidgetPrefs, saveWidgetPrefs, type WidgetPrefs } from './lib/widgets';
import { POINTS, LEVEL_XP, MONTHLY_POINTS_GUIDE, VOUCHER_POINTS, awardCheckIn, levelAfter, levelForXp, xpIntoLevel as xpIntoLevelOf } from './lib/points';
import { rankMeals, pageOf, pageCount, slotAt, loadHiddenMeals, hideMeal, unhideAllMeals, avoidedThere, PAGE_SIZE, type RankedMeal } from './lib/mealIdeas';
import { streakOf, runEndingOn, loadBestStreak, saveBestStreak, streakMessage, STREAK_BADGES } from './lib/streak';
import { APP_ICONS, DEFAULT_APP_ICON, appIconInfo, appIconPreview, appIconSupported, canUseIcon, changeAppIcon, currentAppIcon, shouldRevertIcon, type AppIconId } from './lib/appIcons';
import WidgetGallery, { type WidgetData } from './components/WidgetGallery';
import { loadWaterLog, saveWaterLog, withDrinks, withoutDrink, loadWaterGoalMl, saveWaterGoalMl, loadGlassMl, saveGlassMl, dayMl, waterWeek, waterAmount, type WaterLog } from './lib/water';
import { loadCheckIns, saveCheckIn, sleepEnergyInsight, SLEEP_CHOICES, ENERGY_LABELS, sleepChoiceLabel } from './lib/checkins';
import { toDetected, rememberDetected, detectedWorkoutCount, recordDetectedWorkouts, isToday, loadManualWorkouts, addManualWorkout, updateManualWorkout, removeManualWorkout, manualOnDay, manualWithinDays, manualLabel, formatMinutes, type DetectedWorkout, type ManualWorkout, type WorkoutDraft } from './lib/workouts';
import WorkoutSheet, { WorkoutHistorySheet } from './components/WorkoutSheet';
import CycleCard from './components/CycleCard';
import VitalsCard from './components/VitalsCard';
import AllergyPicker from './components/AllergyPicker';
import { allergyName, flagAllergies, allergiesIn, customAllergies } from './lib/allergens';
import { loadPeriods, addPeriod, removePeriod, cycleContext } from './lib/cycle';
import { applyMoveReminders, MOVE_MINUTES_OPTIONS } from './lib/moveReminders';
import { PLUS_ENTITLEMENT, FREE_DAILY_SCANS, PLUS_DAILY_SCANS, PLUS_BENEFITS } from './lib/plus';
import { latestReading, latestBucket, heartDay, caloriesToday, whenTaken, vitalTiles, distanceText, VITAL_TYPES, type Reading, type HeartDay, type VitalId } from './lib/vitals';

// ============================================================================
// KINETIXFIT ENTERPRISE BIOMETRIC PORTAL - FLAGSHIP ADVANCED VISION CORE (V12)
// Designed with Sci-Fi Tactical HUD & Hollywood-Level Operations Architecture
// 100% White-Labeled & White-Space Aligned under Proprietary Security Policies
// Compliant with UK GDPR, Data Protection Act 2018, and NHS/FSA Guidelines
// ============================================================================

// --- TYPE DEFINITIONS & SCHEMAS ---
interface TelemetryStream {
  id: string;
  metric: string;
  system: string;
  reading: string | number;
  status: 'Optimal' | 'Syncing' | 'Calibrating' | 'Critical';
  behavior: string;
  details: {
    title: string;
    description: string;
    subMetrics: { label: string; value: string; color: string }[];
  };
}

export interface UserProfile {
  name: string;
  email: string;
  height: number;
  weight: number;
  target: 'Weight Loss' | 'Weight Gain' | 'Cardio Endurance' | 'Autonomic Recovery';
  personalAllergens: string[];
  workoutsLogged: string[];
  smartDeviceConnected: string | null;
  /** The answer to "Do you wear a smartwatch or fitness band?" — only asked when no heart rate has arrived. */
  wearable: 'yes' | 'no' | null;
  sex: 'male' | 'female' | null;
  age: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  lastPeriodStartDate: string | null;
  averageCycleLength: number;
  /** onboarding region id (src/lib/regions.ts) — UK only; null until chosen */
  region: string | null;
  /** src/lib/countries.ts; null until chosen (then worked out from the region or the phone) */
  country: CountryCode | null;
  /** what they eat (src/lib/diet.ts): asked on the last onboarding step; null (not asked yet) counts as everything */
  diet: Diet | null;
}

// In-app message pill (see notify()). The tone picks its icon and colour.
type MessageTone = 'success' | 'error' | 'warn' | 'info';
interface AppMessage { tone: MessageTone; text: string; }

// Onboarding step index at which the real dashboard becomes visible. Steps: 0-1 (old Welcome screens, now
// shown as the sign-in screen), 2 Sign up/Log in, 3 Health permission, 4 Notifications permission, 5 Profile, 6 Allergies.
const DASHBOARD_STEP = 7;


// Reminder hours, shown as 24-hour times
const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour(h) }));

// Bottom-nav order; the sliding indicator's position is this index.
const TAB_IDS = ['vitals', 'nourish', 'rewards', 'account'];

// Account is a settings menu; each row opens one of these pages at #account/<page>, so the browser
// and Android back button return to the menu.
type AccountPage = 'details' | 'allergies' | 'devices' | 'reminders' | 'icon' | 'widgets' | 'subscription' | 'promo' | 'about' | 'privacy' | 'help';
const ACCOUNT_PAGE_TITLES: Record<AccountPage, string> = {
  details: 'Your details', allergies: 'Diet & allergies', devices: 'Connected devices', reminders: 'Reminders',
  icon: 'App icon', widgets: 'Widgets',
  subscription: 'Plan & billing', promo: 'Promo code', about: 'About Kinetix Fit', privacy: 'Your data & privacy', help: 'Get help'
};
// The icon for a workout label (src/lib/workouts.ts labels, or a hand-added "Run · 30 min").
const workoutIcon = (label: string) => /Run|Walk|Hike|Skipping/.test(label) ? <StepsIcon size={20} />
  : /Cycle/.test(label) ? <BikeIcon size={20} />
  : /Swim|Rowing/.test(label) ? <WavesIcon size={20} />
  : /Yoga|Pilates|Stretching/.test(label) ? <RecoveryIcon size={20} />
  : <DumbbellIcon size={20} />;

// Points one charity donation costs (the "Donate 1,000 pts · £2.50" buttons; the amount is per country)
const CHARITY_DONATION_POINTS = 1000;
// What one quest pays, for "How you earn points" ("5–8")
const QUEST_POINTS_RANGE = (() => {
  const pts = allQuestValues().map(q => q.points);
  return `${Math.min(...pts)}–${Math.max(...pts)}`;
})();

// One-tap examples under the food search
const FOOD_SUGGESTIONS = ['Porridge', 'Banana', 'Greek yogurt', 'Chicken breast'];

const THEME_LABELS: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// Old links: Profile and Hub were split into Rewards and Account, and Account now holds their settings.
const LEGACY_TABS: Record<string, string> = { profile: 'account', hub: 'account' };

function parseRoute(hash: string): { tab: string; page: AccountPage | null } | null {
  const [rawTab, rawPage] = hash.replace('#', '').split('/');
  const tab = LEGACY_TABS[rawTab] ?? rawTab;
  if (!TAB_IDS.includes(tab)) return null;
  const page = tab === 'account' && rawPage && rawPage in ACCOUNT_PAGE_TITLES ? rawPage as AccountPage : null;
  return { tab, page };
}



// How many days of history the 7/30-day trend graphs fetch/keep. Health Connect and HealthKit
// both hold far more than this; 30 is just the widest range the UI currently offers.
const TRENDS_LOOKBACK_DAYS = 30;
const STRESS_HISTORY_STORAGE_KEY = 'kinetix_stress_history';
const NOTIFICATIONS_SKIPPED_KEY = 'kx_notifications_skipped'; // "Skip for now" on the reminders screen
const NO_STRESS_NOTICE_KEY = 'kx_no_stress_notice_seen'; // "Samsung Health doesn't share stress" shown once
// Everything KinetixFit reads from Health Connect / Apple Health. Android: each type's permission must also stay in
// AndroidManifest.xml (the rest are stripped). 'workouts' was added later, so older connections are asked again, and so
// were the body and vitals types (MORE_HEALTH_TYPES, 28 Sep) — src/lib/vitals.ts. On iOS 'totalCalories' is the same
// Apple Health type as 'calories' (active energy), so it's only read on Android.
const MORE_HEALTH_TYPES: HealthDataType[] = ['distance', 'calories', 'totalCalories', 'oxygenSaturation', 'respiratoryRate', 'bloodPressure', 'vo2Max', 'weight', 'bodyFat'];
const HEALTH_READ_TYPES: HealthDataType[] = ['heartRate', 'heartRateVariability', 'restingHeartRate', 'sleep', 'steps', 'workouts', ...MORE_HEALTH_TYPES];
const WORKOUTS_ASKED_KEY = 'kx_workouts_asked';
const MORE_HEALTH_ASKED_KEY = 'kx_more_health_asked';

// Turns aggregated device-history samples into { day, value } entries keyed by calendar day,
// ready for buildDailyPoints. Rounding/unit conversion (e.g. sleep minutes -> quality %) happens
// at the call site since it differs per metric.
function toDayEntries(samples: { startDate: string; value: number }[]): { day: string; value: number }[] {
  return samples.map(s => ({ day: localDayKey(new Date(s.startDate)), value: s.value }));
}

// Minutes actually asleep across a set of sleep samples. Health Connect returns one sample per
// session (value = time in bed) with optional stages; HealthKit returns one sample per state, where
// 'inBed' overlaps the asleep samples. Awake time is left out, and 'inBed' only counts when nothing
// more specific was recorded (e.g. a phone-only HealthKit user).
function totalSleepMinutes(samples: HealthSample[]): number {
  const isAsleep = (state?: string) => state !== 'awake' && state !== 'inBed';
  const asleep = samples.filter(s => isAsleep(s.sleepState));
  const counted = asleep.length > 0 ? asleep : samples.filter(s => s.sleepState === 'inBed');
  return counted.reduce((sum, s) => {
    if (s.stages && s.stages.length > 0) {
      return sum + s.stages.filter(st => isAsleep(st.stage)).reduce((t, st) => t + st.durationMinutes, 0);
    }
    return sum + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
  }, 0);
}

// Health Connect can't aggregate sleep, so trend points are built from raw samples, each night
// credited to the day it ended on (the morning you woke up).
function sleepDayEntries(samples: HealthSample[]): { day: string; value: number }[] {
  const byDay = new Map<string, HealthSample[]>();
  for (const s of samples) {
    const day = localDayKey(new Date(s.endDate));
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  return [...byDay].map(([day, daySamples]) => ({ day, value: totalSleepMinutes(daySamples) }));
}

// Samples from one settled health query, or none (with a warning) if that query failed.
function settledSamples<T>(result: PromiseSettledResult<{ samples: T[] }>, label: string): T[] {
  if (result.status === 'fulfilled') return result.value.samples;
  console.warn(`Health data read failed (${label}):`, result.reason);
  return [];
}

// The newest reading of one type (src/lib/vitals.ts says why Android reads a window whole). Android looks back a day,
// then a week, then a month, so a sparse type (weight, blood pressure) is still found without reading a month of a busy
// one (blood oxygen through the night); iOS asks for the newest one directly.
async function readLatest(dataType: HealthDataType, days: number[] = [1, 7, 30]): Promise<Reading | null> {
  const end = new Date();
  const ios = Capacitor.getPlatform() === 'ios';
  for (const d of ios ? [Math.max(...days)] : days) {
    const startDate = new Date(end.getTime() - d * 86_400_000).toISOString();
    const { samples } = await Health.readSamples(ios
      ? { dataType, startDate, endDate: end.toISOString(), limit: 1, ascending: false }
      : { dataType, startDate, endDate: end.toISOString(), limit: 5000 });
    const reading = latestReading(samples, dataType);
    if (reading) return reading;
  }
  return null;
}

// The newest heart rate of the last day. A day of watch readings can be thousands of samples, so on Android hourly
// averages find the newest hour with readings first, and only that hour is read sample by sample.
async function readLatestHeartRate(): Promise<Reading | null> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  if (Capacitor.getPlatform() === 'ios') return readLatest('heartRate', [1]);
  const { samples: hours } = await Health.queryAggregated({ dataType: 'heartRate', startDate: dayAgo, endDate: now.toISOString(), bucket: 'hour', aggregation: 'average' });
  const hour = latestBucket(hours);
  if (!hour) return null;
  const { samples } = await Health.readSamples({ dataType: 'heartRate', startDate: hour.startDate, endDate: now.toISOString(), limit: 5000 });
  return latestReading(samples, 'heartRate');
}

function formatMinutesAsHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

// Fills in the last `days` calendar days (oldest first) from whatever real entries exist,
// leaving genuinely missing days as null rather than interpolating or zero-filling — a gap in
// the graph is more honest than a fabricated flat value.
function buildDailyPoints(entries: { day: string; value: number }[], days: number): DailyPoint[] {
  const byDay = new Map(entries.map(e => [e.day, e.value]));
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    const raw = byDay.get(key);
    points.push({
      date: key,
      label: fmtDate(d, { day: 'numeric', month: 'short' }),
      value: raw === undefined ? null : raw
    });
  }
  return points;
}

// Stress has no queryable device history, so this is our own local record of each day's real
// HRV reading — the only honest basis for a "stress trend" until enough days accumulate.
function loadStressHistory(): { day: string; value: number }[] {
  try {
    const raw = localStorage.getItem(STRESS_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordStressSnapshot(hrv: number): { day: string; value: number }[] {
  const today = localDayKey();
  const history = loadStressHistory();
  const idx = history.findIndex(h => h.day === today);
  if (idx >= 0) {
    history[idx] = { day: today, value: hrv };
  } else {
    history.push({ day: today, value: hrv });
  }
  const trimmed = history.slice(-TRENDS_LOOKBACK_DAYS);
  localStorage.setItem(STRESS_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  email: '',
  height: 180,
  weight: 75.0,
  target: 'Autonomic Recovery',
  personalAllergens: [],
  workoutsLogged: [],
  smartDeviceConnected: null,
  wearable: null,
  sex: null,
  age: 30,
  activityLevel: 'moderate',
  lastPeriodStartDate: null,
  averageCycleLength: 28,
  region: null,
  country: null,
  diet: null
};

const ACTIVITY_MULTIPLIERS: Record<UserProfile['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

// NHS weight-loss advice: about 600 kcal a day under what you burn, for 0.5–1 kg a week (the plan quotes it)
const GOAL_CALORIE_ADJUSTMENT: Record<UserProfile['target'], number> = {
  'Weight Loss': -600,
  'Weight Gain': 300,
  'Cardio Endurance': 0,
  'Autonomic Recovery': 0
};

const GOAL_PROTEIN_PER_KG: Record<UserProfile['target'], number> = {
  'Weight Loss': 2.0,
  'Weight Gain': 1.8,
  'Cardio Endurance': 1.4,
  'Autonomic Recovery': 1.6
};

// Protein per kg is meant for lean mass: above a BMI of 30 it's worked out from the weight at a BMI of 25
// instead (the usual "adjusted weight" approach), or a 120 kg person was told to eat 240 g a day.
function proteinReferenceWeight(p: UserProfile): number {
  const heightM = p.height / 100;
  return bmiOf(p.height, p.weight) >= 30 ? 25 * heightM * heightM : p.weight;
}

// Mifflin-St Jeor equation. Falls back to the midpoint of the male/female offset when sex is unset.
function calculateBmr(p: UserProfile): number {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  if (p.sex === 'male') return base + 5;
  if (p.sex === 'female') return base - 161;
  return base - 78;
}

// Reads a value saved for today only (keyed by local day), so yesterday's claimed quests
// don't carry over, but an app restart during the day doesn't wipe them.
function loadToday<T>(key: string, fallback: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.date === localDayKey()) return saved.value as T;
  } catch { /* ignore a malformed entry */ }
  return fallback;
}

interface MealScanResult {
  foodName: string;
  /** the log entry it was added as; the card follows that entry when its amount changes */
  entryId: string | null;
  /** numbers for a food that wasn't logged (it has one of the person's allergens) */
  nutrients: Nutrients;
  portion: string;
  allergensFlagged: string[];
  complianceStatus: 'CLEARED' | 'HAZARD_DETECTED';
  dietaryRecommendation: string;
  estimated?: boolean;
  /** logged from the person's own saved foods: no server call, no scan used */
  fromSaved?: boolean;
  /** allergens the pack's label lists (for information — only the person's own allergens are warnings) */
  labelAllergens?: string[];
  /** where the numbers came from, e.g. "USDA: Bananas, raw" — so a wrong match is easy to spot */
  source?: string;
  /** vegetarians: "Not vegetarian: it has chicken." (information only — it's still logged) */
  dietNote?: string;
  /** a meal photo of several foods (or one the photo wasn't sure of): shown by MealResultCard instead */
  meal?: MealCard;
}

interface VoucherLog {
  id: string;
  provider: string;
  value: string;
  sku: string;
  state: 'Authorized' | 'Settled' | 'Donated';
  timestamp: string;
}

export default function App() {
  // --- 1. PERSISTENT CORE STATES & AUTHENTICATION FLOW ---
  const [isLoggedIn, setIsLogged] = useState<boolean>(() => {
    markLoggedInAccount(); // once, for accounts that finished onboarding before the marker existed
    const saved = localStorage.getItem('kinetix_logged_in');
    return saved === 'true';
  });

  // 2: Sign up/Log in (the app opens here; 0-1 were Welcome screens), 3: Health permission, 4: Notifications permission,
  // 5: Profile setup, 6: Allergies, 7 (DASHBOARD_STEP): main app
  const [onboardingStep, setOnboardingStep] = useState<number>(() => {
    const devStep = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('ob') : null;
    if (devStep !== null) return Number(devStep);
    // Someone who finished onboarding (kinetix_logged_in) starts on the dashboard. Starting them at 0 left the
    // step at 3 after the session restore, so every effect gated on DASHBOARD_STEP (health reads, reminders,
    // quest sync) silently never ran after an app restart, even though the dashboard was on screen.
    return localStorage.getItem('kinetix_logged_in') === 'true' ? DASHBOARD_STEP : 2;
  });
  // About you opens on its first page, or on its Plan page when coming back from the step after it
  const [aboutYouStart, setAboutYouStart] = useState<0 | 5>(0);
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  // Someone who has used the app on this phone before most likely has an account: open on Log in. A password-reset link
  // (on the website) opens "Choose a new password" ('reset'); a link that failed says why.
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'forgot' | 'reset'>(() =>
    openedFromRecoveryLink ? 'reset'
      : localStorage.getItem(ONBOARDED_EMAIL_KEY) || localStorage.getItem('kinetix_profile') ? 'login' : 'signup');
  const [authError, setAuthError] = useState<string | null>(openedLinkError);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  // The address waiting for its confirmation email ("Send it again" on Log in), and whether that can be used yet:
  // Supabase sends one email per address a minute (src/lib/auth.ts)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(true);
  const [isResending, setIsResending] = useState(false);
  useEffect(() => {
    if (canResend) return;
    const t = setTimeout(() => setCanResend(true), RESEND_WAIT_S * 1000);
    return () => clearTimeout(t);
  }, [canResend]);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);

  // --- 2. ACTIVE NAVIGATION TAB (Sync with URL Hash to support Browser Back Button) ---
  const [activeTab, setActiveTab] = useState<string>(() => parseRoute(window.location.hash)?.tab ?? 'vitals');
  const [accountPage, setAccountPage] = useState<AccountPage | null>(() => parseRoute(window.location.hash)?.page ?? null);
  // true when the open account page was reached from the menu, so Back can pop history instead of adding to it
  const accountPageFromMenu = useRef(false);
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref);

  // Force correct viewport meta for mobile layout scaling (no tiny letters/stretching)
  useEffect(() => {
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      document.head.appendChild(metaViewport);
    }
    metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  }, []);

  // Listen to browser Back / Forward navigation events (prevents exiting link)
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseRoute(window.location.hash);
      if (!route) return;
      setActiveTab(route.tab);
      setAccountPage(route.page);
      if (!route.page) accountPageFromMenu.current = false;
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Set URL hash when tab is switched via clicking bottoms navigation icons
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setAccountPage(null);
    accountPageFromMenu.current = false;
    window.location.assign(`#${tabId}`); // same as setting location.hash: a history entry + hashchange
  };

  const openAccountPage = (page: AccountPage) => {
    hapticSelection();
    setAccountPage(page);
    accountPageFromMenu.current = true;
    window.history.pushState(null, '', `#account/${page}`);
  };

  const openRemindersPage = () => {
    setActiveTab('account');
    setAccountPage('reminders');
    accountPageFromMenu.current = false;
    window.history.pushState(null, '', '#account/reminders');
  };


  const closeAccountPage = () => {
    hapticSelection();
    if (accountPageFromMenu.current) {
      window.history.back(); // the hashchange handler shows the menu again
      return;
    }
    // opened straight from a link: replace it, so Back doesn't return to the page we just left
    setAccountPage(null);
    window.history.replaceState(null, '', '#account');
  };

  // Each tab and account page starts at the top, not wherever the previous one was scrolled to.
  useEffect(() => {
    document.querySelector('.app-scroll-body')?.scrollTo({ top: 0 });
  }, [activeTab, accountPage]);

  // Android back button: an open sheet, pop-up or onboarding step first (src/lib/backButton.ts), then an account
  // page, then back through the tabs, then leave the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (handleBack()) { hapticSelection(); return; }
      if (canGoBack) { hapticSelection(); window.history.back(); }
      else CapacitorApp.exitApp();
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // --- 4. USER PROFILE DATA STATE (With LocalStorage Persistence) ---
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('kinetix_profile');
    if (saved) {
      try {
        const loaded: UserProfile = { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
        setActiveCountry(countryOf(loaded));
        return loaded;
      } catch (e) {
        console.error("Failed to parse saved profile data.", e);
      }
    }
    setActiveCountry(countryOf(DEFAULT_PROFILE));
    return DEFAULT_PROFILE;
  });

  const [rewardGateway] = useState<'primary' | 'direct' | 'local'>('local'); // Gateway selector disabled until live provider approval; defaults to local
  const [showLevelUpModal, setShowLevelUpModal] = useState<boolean>(false);
  const [showDeviceSyncModal, setShowDeviceSyncModal] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [isConnectingHealth, setIsConnectingHealth] = useState<boolean>(false);
  // Connect found no Health Connect on this Android phone: HealthConnectSheet explains and links to the Play Store
  const [healthConnectIssue, setHealthConnectIssue] = useState<HealthConnectProblem | null>(null);
  const [liveSteps, setLiveSteps] = useState<number | null>(null);
  const [liveSleepMinutes, setLiveSleepMinutes] = useState<number | null>(null);
  const isLiveHealthData = Capacitor.isNativePlatform() && profile.smartDeviceConnected !== null;
  // The person's country: units, formats, guidance, allergens and rewards all follow it (src/lib/countries.ts).
  // The display formatters' copy (setActiveCountry) is kept in step where the profile is loaded and saved.
  const country = countryOf(profile);

  // --- LOCAL PUSH NOTIFICATIONS (hydration, activity, nutrition) ---
  const [hydrationRemindersEnabled, setHydrationRemindersEnabled] = useState<boolean>(() => localStorage.getItem('kinetix_hydration_enabled') !== 'false');
  const [hydrationIntervalHours, setHydrationIntervalHours] = useState<number>(() => parseInt(localStorage.getItem('kinetix_hydration_interval') || '2'));
  const [shiftStartHour, setShiftStartHour] = useState<number>(() => parseInt(localStorage.getItem('kinetix_shift_start') || '9'));
  const [shiftEndHour, setShiftEndHour] = useState<number>(() => parseInt(localStorage.getItem('kinetix_shift_end') || '17'));

  // Requests notification permission only the first time it's actually needed (lazily, from
  // whichever of the three notification features fires first), never proactively on app open.
  // Someone who chose "Skip for now" on the reminders screen is never asked by the app on its own — only
  // when they turn reminders on themselves (iOS gives one chance to ask; a "Don't Allow" is final).
  const ensureNotificationPermission = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      if (localStorage.getItem(NOTIFICATIONS_SKIPPED_KEY) === '1') return false;
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    } catch (err) {
      console.warn('Notification permission check failed:', err);
      return false;
    }
  };

  // Save profile helper
  const saveProfileToStorage = (updatedProfile: UserProfile) => {
    setActiveCountry(countryOf(updatedProfile));
    setProfile(updatedProfile);
    localStorage.setItem('kinetix_profile', JSON.stringify(updatedProfile));
    noteProfileChanged();
  };
  // Merge a few fields into the latest profile — safe for rapid updates (ruler scrolling, typing)
  const patchProfile = (changes: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...changes };
      setActiveCountry(countryOf(next));
      localStorage.setItem('kinetix_profile', JSON.stringify(next));
      return next;
    });
    noteProfileChanged();
  };

  // --- 5. DYNAMIC MOTIVATION POPUPS & REVENUE DEFENSE CONTROLS ---
  // One message at a time in the pill at the top of the app. It clears itself after a few seconds
  // (a little longer for long text), a tap dismisses it early, and a newer message restarts the timer.
  const [motivationMessage, setMotivationMessage] = useState<AppMessage | null>(null);
  const notify = (tone: MessageTone, text: string) => setMotivationMessage({ tone, text });
  const messageMs = motivationMessage ? Math.min(6000, Math.max(2500, motivationMessage.text.length * 40)) : 0;
  const messageTouchY = useRef<number | null>(null);
  useEffect(() => {
    if (!motivationMessage) return;
    const t = window.setTimeout(() => setMotivationMessage(null), messageMs);
    return () => window.clearTimeout(t);
  }, [motivationMessage, messageMs]);

  // One coffee voucher per calendar month (the server enforces it; this saves a wasted tap).
  const thisMonthKey = localDayKey().slice(0, 7);
  const [lastVoucherMonth, setLastVoucherMonth] = useState<string | null>(() => localStorage.getItem('kinetix_last_voucher_month'));
  const voucherUsedThisMonth = lastVoucherMonth === thisMonthKey;
  const [requiredTaskCountForRedeem] = useState<number>(2); // Multi-step validation defense

  // --- 6. LIVE HEART RATE / HRV STATE ---
  // null until a real device reading arrives — no demo/simulated data is ever substituted here,
  // so a disconnected user always sees an honest "connect a device" state, never a fake number.
  // liveBpm is the newest heart rate of the last day (watches sync in batches, so "live" means latest, with its time)
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [liveBpmAt, setLiveBpmAt] = useState<number | null>(null);
  const [heartToday, setHeartToday] = useState<HeartDay | null>(null);
  const [liveHrv, setLiveHrv] = useState<number | null>(null);
  // Body and vitals (src/lib/vitals.ts): resting heart rate, blood oxygen, breathing, blood pressure, VO2 max, weight,
  // body fat — the newest of each — plus distance and calories burned today. Read every few minutes, not every 30 s.
  const [vitals, setVitals] = useState<Partial<Record<VitalId, Reading | null>>>({});
  const [activityToday, setActivityToday] = useState<{ meters: number | null; kcal: number | null; kcalKind: 'total' | 'active' | 'workouts' }>({ meters: null, kcal: null, kcalKind: 'total' });
  // Whether the body and vitals types can be read: 'needs-access' for connections made before they were added
  const [moreHealth, setMoreHealth] = useState<'unknown' | 'ok' | 'needs-access'>('unknown');
  const [moreHealthTick, setMoreHealthTick] = useState(0);
  // true once Health Connect has answered an HRV read — "no HRV" only means something after that
  const [hrvChecked, setHrvChecked] = useState(false);

  // --- 7-DAY/30-DAY HEALTH TRENDS (real device history, plus a locally-persisted HRV/stress log) ---
  // Stress has no queryable device history (it's an estimate derived from HRV, not a stored
  // health metric), so its initial value is read from our own local, honest record here —
  // built up one real day at a time from here on, rather than a backdated trend that never happened.
  const [healthTrends, setHealthTrends] = useState<{ steps: DailyPoint[]; heartRate: DailyPoint[]; sleep: DailyPoint[]; stress: DailyPoint[] }>(() => ({
    steps: [], heartRate: [], sleep: [], stress: buildDailyPoints(loadStressHistory(), TRENDS_LOOKBACK_DAYS)
  }));
  const [trendRangeDays, setTrendRangeDays] = useState<7 | 30>(7);
  const [expandedTrendId, setExpandedTrendId] = useState<string | null>(null);

  // Health Connect only answers apps that are on screen, so reads pause in the background and run again the
  // moment the app comes back (for example from Health Connect settings after allowing Samsung Health).
  const appActiveRef = useRef(true);
  // Guards onSessionChange's sync-on-login block against running twice concurrently; reset on logout
  // so the next login cycle (same app session) can sync again.
  const loginSyncInFlightRef = useRef(false);
  const [foregroundTick, setForegroundTick] = useState(0);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      appActiveRef.current = isActive;
      if (isActive) {
        setForegroundTick(t => t + 1);
        flushOutbox().catch(() => { /* offline: the outbox stays queued for the next foreground/reconnect */ });
      }
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // Flush the sync outbox the moment connectivity comes back — offline edits (any platform, including
  // the website) don't have to wait for the next app-foreground to reach the server.
  useEffect(() => {
    const listener = Network.addListener('networkStatusChange', ({ connected }) => {
      if (connected) flushOutbox().catch(() => { /* still offline, or a transient error: stays queued */ });
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // What the last health read found. 'no-data' means every read worked but came back empty — usually because
  // Samsung Health (or the user's tracker app) hasn't been allowed to share with Health Connect yet.
  const [healthDataState, setHealthDataState] = useState<'unknown' | 'has-data' | 'no-data'>('unknown');
  // The app that actually wrote the data ("Samsung Health"), once a read tells us.
  const [healthSource, setHealthSource] = useState<string | null>(null);
  // Whether any heart rate arrived in the trend window (null until the first read finishes).
  const [heartRateSeen, setHeartRateSeen] = useState<boolean | null>(null);

  const openHealthConnectSettings = () => {
    Health.openHealthConnectSettings().catch(err => {
      console.warn('Could not open Health Connect settings:', err);
      notify('error', "Couldn't open Health Connect. Open it from your phone's Settings instead.");
    });
  };
  // iOS has no settings API for HealthKit; the Health app's own URL scheme opens it (Capacitor hands
  // non-app URLs to the system), and the setup card says where KinetixFit's permissions live in there.
  const openAppleHealth = () => { window.location.href = 'x-apple-health://'; };
  const openHealthSettings = Capacitor.getPlatform() === 'ios' ? openAppleHealth : openHealthConnectSettings;

  // Real steps/heart-rate/sleep history from HealthKit/Health Connect once a device is connected.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData) return;

    const fetchHealthTrends = async () => {
      if (!appActiveRef.current) return;
      try {
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - (TRENDS_LOOKBACK_DAYS - 1));
        startDate.setHours(0, 0, 0, 0);

        // allSettled, not all: one metric failing (no permission, no data source) must not blank
        // the other cards.
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
        const [stepsResult, hrResult, sleepResult, recentStepsResult] = await Promise.allSettled([
          Health.queryAggregated({ dataType: 'steps', startDate: startDate.toISOString(), endDate: now.toISOString(), bucket: 'day', aggregation: 'sum' }),
          Health.queryAggregated({ dataType: 'heartRate', startDate: startDate.toISOString(), endDate: now.toISOString(), bucket: 'day', aggregation: 'average' }),
          Health.readSamples({ dataType: 'sleep', startDate: startDate.toISOString(), endDate: now.toISOString(), limit: 2000, ascending: true }),
          // raw samples carry the writing app's package name, which aggregates don't
          Health.readSamples({ dataType: 'steps', startDate: weekAgo, endDate: now.toISOString(), limit: 200 })
        ]);
        const results = [stepsResult, hrResult, sleepResult, recentStepsResult];
        results.forEach((r, i) => {
          if (r.status === 'rejected') console.warn(`Health trend fetch failed (${['steps', 'heartRate', 'sleep', 'recent steps'][i]}):`, r.reason);
        });

        const rawSamples = [
          ...(sleepResult.status === 'fulfilled' ? sleepResult.value.samples : []),
          ...(recentStepsResult.status === 'fulfilled' ? recentStepsResult.value.samples : [])
        ];
        const hasAnyData = rawSamples.length > 0
          || (stepsResult.status === 'fulfilled' && stepsResult.value.samples.some(x => x.value > 0))
          || (hrResult.status === 'fulfilled' && hrResult.value.samples.some(x => x.value > 0));
        if (hasAnyData) setHealthDataState('has-data');
        else if (results.every(r => r.status === 'fulfilled')) setHealthDataState('no-data');
        if (hrResult.status === 'fulfilled') setHeartRateSeen(hrResult.value.samples.some(x => x.value > 0));
        const source = primarySourceLabel(rawSamples);
        if (source) setHealthSource(source);

        // Persist the last 30 days of these trend figures (steps, sleep, the daily heart-rate average),
        // not just read them live — one upserted row per day, so a fresh device (or the backend, for
        // future trend/insight work) has real history instead of only ever seeing what's on the phone
        // right now. `source` and `recordedAt` in the trend cards themselves are unaffected.
        if (stepsResult.status === 'fulfilled') {
          for (const { day, value } of toDayEntries(stepsResult.value.samples)) recordDailyVitalTotal('steps', day, Math.round(value));
        }
        if (hrResult.status === 'fulfilled') {
          for (const { day, value } of toDayEntries(hrResult.value.samples)) recordDailyVitalTotal('heartRateDailyAverage', day, Math.round(value));
        }
        if (sleepResult.status === 'fulfilled') {
          for (const { day, value } of sleepDayEntries(sleepResult.value.samples)) recordDailyVitalTotal('sleepMinutes', day, Math.round(value));
        }

        setHealthTrends(prev => ({
          ...prev,
          ...(stepsResult.status === 'fulfilled' && {
            steps: buildDailyPoints(toDayEntries(stepsResult.value.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS)
          }),
          ...(hrResult.status === 'fulfilled' && {
            heartRate: buildDailyPoints(toDayEntries(hrResult.value.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS)
          }),
          ...(sleepResult.status === 'fulfilled' && {
            // minutes actually asleep per night (it used to be "% of 8 hours", which the chart showed as a percentage)
            sleep: buildDailyPoints(sleepDayEntries(sleepResult.value.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS)
          })
        }));
      } catch (err) {
        console.warn('Health trend fetch failed:', err);
      }
    };

    fetchHealthTrends();
    const interval = setInterval(fetchHealthTrends, 30 * 60000);
    return () => clearInterval(interval);
    // foregroundTick: fetch again as soon as the app returns to the screen
  }, [isLoggedIn, onboardingStep, isLiveHealthData, foregroundTick]);

  // Samsung Health shares steps, heart rate and sleep through Health Connect, but never HRV — and stress
  // (and the Recovery card) are estimated from HRV. For its users those cards are hidden rather than left
  // waiting for a reading that will never come, and a one-time notice says why. If another app starts
  // sharing HRV, liveHrv arrives and the cards come back on their own.
  const hasStressHistory = healthTrends.stress.some(d => d.value !== null);
  const noHrvFromSource = hrvChecked && healthDataState === 'has-data' && healthSource === 'Samsung Health' && liveHrv === null && !hasStressHistory;
  // Shown on the first sync that finds no HRV, until it's acknowledged — then never again
  const [noStressNoticeSeen, setNoStressNoticeSeen] = useState(() => localStorage.getItem(NO_STRESS_NOTICE_KEY) === '1');

  // Wearable or phone only. Heart rate is the tell: a phone counts steps on its own, but only a watch or band
  // measures heart rate (and HRV, and proper sleep). Data beats the answer to "Do you wear a smartwatch?"; the
  // answer settles it when there's no data. Phone-only people get a steps-first Today without cards that could
  // only ever say "Waiting".
  const wearableDataSeen = heartRateSeen === true || liveBpm !== null || liveHrv !== null;
  const deviceMode: 'watch' | 'phone' | 'ask' | 'unknown' = !isLiveHealthData ? 'unknown'
    : wearableDataSeen || profile.wearable === 'yes' ? 'watch'
    : profile.wearable === 'no' ? 'phone'
    : heartRateSeen === false && healthDataState === 'has-data' ? 'ask'
    : 'unknown';
  const phoneOnly = deviceMode === 'phone';
  // Said yes, but no heart rate has ever arrived: usually the watch's app isn't sharing with Health Connect/Apple Health.
  const waitingForWatch = deviceMode === 'watch' && !wearableDataSeen && heartRateSeen === false && healthDataState === 'has-data';
  const hasSleepData = healthTrends.sleep.some(d => d.value !== null) || liveSleepMinutes !== null;
  // Sleep chart axis every 3 hours, tall enough for the longest night shown (at least 9 h).
  const sleepTicks = useMemo(() => {
    const longest = Math.max(0, ...healthTrends.sleep.map(d => d.value ?? 0));
    const topHours = Math.max(9, Math.ceil(longest / 180) * 3);
    return Array.from({ length: topHours / 3 + 1 }, (_, i) => i * 180);
  }, [healthTrends.sleep]);
  // Of the last 7 nights with sleep recorded, how many reached 7 hours.
  const sleepWeek = useMemo(() => {
    const nights = healthTrends.sleep.slice(-7).filter(d => d.value !== null && d.value > 0);
    return { nights: nights.length, enough: nights.filter(d => (d.value ?? 0) >= 420).length };
  }, [healthTrends.sleep]);
  const setWearableAnswer = (answer: 'yes' | 'no') => {
    patchProfile({ wearable: answer });
    notify('success', answer === 'no'
      ? 'Got it — Today now focuses on what your phone tracks.'
      : 'Got it — heart rate, sleep and stress will fill in once your watch syncs.');
  };

  const showNoStressNotice = noHrvFromSource && !noStressNoticeSeen && !phoneOnly;
  const dismissNoStressNotice = () => {
    localStorage.setItem(NO_STRESS_NOTICE_KEY, '1');
    setNoStressNoticeSeen(true);
  };

  // Last snapshot the server accepted, so an unchanged reading isn't posted again every 30 s.
  const lastSyncedSnapshot = useRef<string | null>(null);

  // Real periodic reads from HealthKit/Health Connect once a device is actually connected.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData) return;

    const readLiveHealthData = async () => {
      if (!appActiveRef.current) return;
      try {
        const now = new Date();
        const dayWindowStart = new Date(now.getTime() - 24 * 60 * 60000).toISOString();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfToday = todayStart.toISOString();
        const nowIso = now.toISOString();

        // allSettled so one metric failing doesn't stop the others updating (see the trend fetch).
        // Heart rate and HRV are the newest readings of the last day — the old 10-minute window was almost always empty,
        // because watches sync in batches, so the card sat on "Waiting".
        const [hrResult, hrDayResult, hrvResult, stepsResult, sleepResult] = await Promise.allSettled([
          readLatestHeartRate(),
          Health.queryAggregated({ dataType: 'heartRate', startDate: startOfToday, endDate: nowIso, bucket: 'day', aggregation: ['average', 'min', 'max'] }),
          readLatest('heartRateVariability', [1]),
          Health.queryAggregated({ dataType: 'steps', startDate: startOfToday, endDate: nowIso, bucket: 'day', aggregation: 'sum' }),
          Health.readSamples({ dataType: 'sleep', startDate: dayWindowStart, endDate: nowIso, limit: 50 })
        ]);
        if (hrResult.status === 'rejected') console.warn('Health data read failed (heartRate):', hrResult.reason);
        if (hrvResult.status === 'rejected') console.warn('Health data read failed (heartRateVariability):', hrvResult.reason);
        const heart = hrResult.status === 'fulfilled' ? hrResult.value : null;
        const hrv = hrvResult.status === 'fulfilled' ? hrvResult.value : null;
        if (hrvResult.status === 'fulfilled') setHrvChecked(true);
        const stepsSamples = settledSamples(stepsResult, 'steps');
        const sleepSamples = settledSamples(sleepResult, 'sleep');
        if (heart || hrv || stepsSamples.some(x => x.value > 0) || sleepSamples.length) setHealthDataState('has-data');

        let syncedBpm: number | null = null;
        let syncedHrv: number | null = null;
        let syncedSteps: number | null = null;
        let syncedSleepQuality: number | null = null;

        if (heart) {
          setLiveBpm(Math.round(heart.value));
          setLiveBpmAt(heart.at);
          // the server keeps today's snapshot, so only a reading from today goes there
          if (heart.at >= todayStart.getTime()) syncedBpm = Math.round(heart.value);
          recordVitalReading('heartRate', heart.value, heart.at);
        } else if (hrResult.status === 'fulfilled') {
          setLiveBpm(null);
          setLiveBpmAt(null);
        }
        if (hrDayResult.status === 'fulfilled') setHeartToday(heartDay(hrDayResult.value.samples[0]));
        if (hrv) {
          syncedHrv = Math.round(hrv.value);
          setLiveHrv(syncedHrv);
          recordVitalReading('heartRateVariability', hrv.value, hrv.at);
          const trimmedHistory = recordStressSnapshot(syncedHrv);
          setHealthTrends(prev => ({ ...prev, stress: buildDailyPoints(trimmedHistory, TRENDS_LOOKBACK_DAYS) }));
        }
        if (stepsSamples.length > 0) {
          syncedSteps = Math.round(stepsSamples[0].value);
          setLiveSteps(syncedSteps);
        }
        if (sleepSamples.length > 0) {
          const totalMinutes = totalSleepMinutes(sleepSamples);
          // the server's quest check only needs to know sleep was read; it keeps its old "% of 8 h" field
          syncedSleepQuality = Math.min(100, Math.round((totalMinutes / (8 * 60)) * 100));
          setLiveSleepMinutes(Math.round(totalMinutes));
        }

        // Push this reading to the server so quest completion can be verified against it — but only when
        // there's a reading and it changed: this runs every 30 s, and empty or repeated snapshots were
        // being posted each time.
        const snapshot = { steps: syncedSteps, liveBpm: syncedBpm, liveHrv: syncedHrv, sleepQualityPercent: syncedSleepQuality };
        const snapshotKey = JSON.stringify(snapshot);
        const hasReading = Object.values(snapshot).some(v => v !== null);
        if (hasReading && profile.email && snapshotKey !== lastSyncedSnapshot.current) {
          fetch(serverUrl('/api/sync-health-data'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appUserId: profile.email, ...snapshot })
          })
            .then(async r => {
              if (r.ok) lastSyncedSnapshot.current = snapshotKey;
              else console.warn('Health data sync failed:', r.status, await r.text().catch(() => ''));
            })
            .catch(err => console.warn('Health data sync failed:', err));
        }
      } catch (err) {
        console.warn('Health data read failed:', err);
      }
    };

    readLiveHealthData();
    const interval = setInterval(readLiveHealthData, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn, onboardingStep, isLiveHealthData, profile.email, foregroundTick]);

  // Body and vitals, and today's distance and calories burned (src/lib/vitals.ts): every 5 minutes and whenever the app
  // comes back. Connections made before these types were added are asked once to allow them (moreHealth).
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData) return;
    const readVitals = async () => {
      if (!appActiveRef.current) return;
      const android = Capacitor.getPlatform() === 'android';
      const asked = localStorage.getItem(MORE_HEALTH_ASKED_KEY) === '1';
      // Android says which types are allowed; Apple Health never tells an app, so there it's "asked yet?"
      let allowed: HealthDataType[] = [...MORE_HEALTH_TYPES, 'restingHeartRate'];
      if (android) {
        try {
          const status = await Health.checkAuthorization({ read: [...MORE_HEALTH_TYPES, 'restingHeartRate'] });
          allowed = status.readAuthorized;
          setMoreHealth(!asked && status.readDenied.some(t => MORE_HEALTH_TYPES.includes(t)) ? 'needs-access' : 'ok');
        } catch (err) {
          console.warn('Health permission check failed:', err);
        }
      } else {
        setMoreHealth(asked ? 'ok' : 'needs-access');
      }
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const today = { startDate: startOfToday, endDate: now.toISOString() };
      const types = VITAL_TYPES.filter(t => allowed.includes(t));
      const [readings, distance, active, total] = await Promise.all([
        Promise.allSettled(types.map(t => readLatest(t))),
        allowed.includes('distance') ? Health.queryAggregated({ dataType: 'distance', ...today, bucket: 'day', aggregation: 'sum' }).catch(() => null) : null,
        allowed.includes('calories') ? Health.queryAggregated({ dataType: 'calories', ...today, bucket: 'day', aggregation: 'sum' }).catch(() => null) : null,
        // Samsung Health writes total calories (not active); Health Connect can't add those up itself here
        android && allowed.includes('totalCalories') ? Health.readSamples({ dataType: 'totalCalories', ...today, limit: 5000 }).catch(() => null) : null,
      ]);
      const next: Partial<Record<VitalId, Reading | null>> = {};
      readings.forEach((r, i) => {
        if (r.status === 'fulfilled') next[types[i]] = r.value;
        else console.warn(`Health data read failed (${types[i]}):`, r.reason);
      });
      setVitals(next);
      for (const [metric, reading] of Object.entries(next)) {
        if (reading) recordVitalReading(metric, reading.value, reading.at);
      }
      const meters = distance?.samples[0]?.value;
      const activeKcal = active?.samples[0]?.value;
      // Samsung Health's "total calories" are its workouts only (caloriesToday tells them from a whole day's)
      const totalKcal = total ? caloriesToday(total.samples, new Date(startOfToday).getTime(), now.getTime()) : null;
      setActivityToday({
        meters: meters && meters > 0 ? meters : null,
        kcal: totalKcal?.kcal ?? (activeKcal && activeKcal > 0 ? Math.round(activeKcal) : null),
        kcalKind: totalKcal?.kind ?? 'active',
      });
    };
    readVitals();
    const interval = setInterval(readVitals, 5 * 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn, onboardingStep, isLiveHealthData, foregroundTick, moreHealthTick]);
  const allowMoreHealth = async () => {
    try {
      await Health.requestAuthorization({ read: HEALTH_READ_TYPES });
      localStorage.setItem(MORE_HEALTH_ASKED_KEY, '1');
      setMoreHealth('ok');
      setMoreHealthTick(t => t + 1);
    } catch (err) {
      console.warn('Health permission request failed:', err);
      notify('error', 'Could not ask for access. Please try again.');
    }
  };
  const vitalsTiles = useMemo(() => vitalTiles({ ...vitals }, { units: country.units, heightCm: profile.height }), [vitals, country.units, profile.height]);

  // Hydration reminders: repeating daily local notifications at fixed times across the active hours
  // (copy and styling in src/lib/notifications.ts). Rescheduled whenever settings change; turning them
  // off now cancels them too — before, switching off left the old reminders firing.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !Capacitor.isNativePlatform()) return;

    (async () => {
      await setupNotifications();
      await cancelHydration(!hydrationRemindersEnabled);
      if (!hydrationRemindersEnabled) return;

      const granted = await ensureNotificationPermission();
      if (!granted) return;

      const hours = reminderHours(shiftStartHour, shiftEndHour, hydrationIntervalHours);
      if (hours.length === 0) return;
      await scheduleNotifications(hydrationNotifications(hours, loadWaterGoalMl()))
        .catch(err => console.warn('Hydration reminder scheduling failed:', err));
    })();
  }, [isLoggedIn, onboardingStep, hydrationRemindersEnabled, hydrationIntervalHours, shiftStartHour, shiftEndHour]);

  // "Remind me in 30 min" — from the Today card or the button on a water notification.
  const [hydrationSnoozedUntil, setHydrationSnoozedUntil] = useState<number | null>(() => Number(localStorage.getItem('kinetix_hydration_snooze')) || null);
  const remindAboutWaterSoon = async () => {
    if (!(await ensureNotificationPermission())) {
      notify('warn', 'Notifications are off for Kinetix Fit — turn them on in your phone’s Settings.');
      return;
    }
    await setupNotifications();
    const at = new Date(Date.now() + 30 * 60_000);
    await scheduleNotifications([hydrationSnoozeNotification(at)])
      .catch(err => console.warn('Snooze scheduling failed:', err));
    setHydrationSnoozedUntil(at.getTime());
    localStorage.setItem('kinetix_hydration_snooze', String(at.getTime()));
    notify('success', `We’ll remind you at ${fmtTime(at)}.`);
  };
  const remindAboutWaterSoonRef = useRef(remindAboutWaterSoon);
  useEffect(() => { remindAboutWaterSoonRef.current = remindAboutWaterSoon; });
  // From the Streak widget and Rewards → Achievements: Today, scrolled to the daily check-in
  const openCheckIn = () => {
    handleTabChange('vitals');
    window.setTimeout(() => document.querySelector('.kx-checkin-daily')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  };
  // From the gut check-in reminder: Today, scrolled to the gut card
  const openGutCardRef = useRef(() => {});
  useEffect(() => {
    openGutCardRef.current = () => {
      handleTabChange('vitals');
      window.setTimeout(() => document.querySelector('.kx-gut')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    };
  });
  // A tap on a notification or one of its buttons (set below, once everything it calls exists)
  const notificationActionRef = useRef<(actionId: string, extra: { open?: string } | undefined) => void>(() => {});
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
      notificationActionRef.current(actionId, notification?.extra);
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // One switch for water reminders, used by the Today card and Account → Reminders.
  const setWaterReminders = async (on: boolean) => {
    setHydrationRemindersEnabled(on);
    localStorage.setItem('kinetix_hydration_enabled', on.toString());
    if (!on || !Capacitor.isNativePlatform()) return;
    // turning reminders on is an explicit yes — ask now if we haven't been allowed yet
    localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY);
    if (!(await ensureNotificationPermission())) {
      setHydrationRemindersEnabled(false);
      localStorage.setItem('kinetix_hydration_enabled', 'false');
      notify('warn', Capacitor.getPlatform() === 'ios'
        ? 'Notifications are off for Kinetix Fit. Turn them on in Settings → Notifications → Kinetix Fit.'
        : 'Notifications are off for Kinetix Fit. Turn them on in your phone’s Settings → Notifications.');
    }
  };


  // --- Water the person logs (src/lib/water.ts): the bottle on Today, the Hydration page and the widgets ---
  const [waterLog, setWaterLog] = useState<WaterLog>(() => loadWaterLog());
  // The goal is an amount and the glass size is the person's own (50–500 ml), so + logs one glass of that size.
  const [waterGoalMl, setWaterGoalMl] = useState(() => loadWaterGoalMl());
  const [glassMl, setGlassMl] = useState(() => loadGlassMl());
  const [showHydration, setShowHydration] = useState(false);
  const waterMlToday = dayMl(waterLog, localDayKey());
  const drinksToday = waterLog[localDayKey()]?.length ?? 0;
  const addDrinks = (drinks: [number, number][]) => setWaterLog(prev => saveWaterLog(withDrinks(prev, drinks)));
  const addGlass = () => {
    hapticTap();
    addDrinks([[Date.now(), glassMl]]);
    if (waterMlToday < waterGoalMl && waterMlToday + glassMl >= waterGoalMl) notify('success', `That's ${waterAmount(waterGoalMl)} — today's water goal done.`);
  };
  const removeGlass = (time: number) => setWaterLog(prev => saveWaterLog(withoutDrink(prev, time)));
  const changeWaterGoal = (ml: number) => { setWaterGoalMl(ml); saveWaterGoalMl(ml); };
  const changeGlassSize = (ml: number) => { setGlassMl(ml); saveGlassMl(ml); };
  // Drinks added with a widget's + while the app was closed (each with its amount; older widgets send none = a glass now)
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    takeWidgetGlasses().then(drinks => { if (drinks.length) addDrinks(drinks.map(d => [d.t, d.ml ?? loadGlassMl()])); });
  }, [isLoggedIn, onboardingStep, foregroundTick]);

  // --- Morning check-in (src/lib/checkins.ts): sleep + energy, one tap each ---
  const [checkIns, setCheckIns] = useState(() => loadCheckIns());
  const todayCheckIn = checkIns[localDayKey()] ?? null;
  const [checkInSleep, setCheckInSleep] = useState<number | null>(null);
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const submitCheckIn = (energy: number, sleepHours: number | null) => {
    hapticTap();
    const first = !todayCheckIn;
    const next = saveCheckIn(checkIns, { sleepHours, energy, at: Date.now() });
    setCheckIns(next);
    setCheckInSleep(null);
    setEditingCheckIn(false);
    if (first) {
      rewardCheckIns(next, [localDayKey()]);
      void claimCheckIns([localDayKey()]);
    }
  };
  // The check-in streak (src/lib/streak.ts): days in a row with a check-in, worked out from them; the best is saved.
  const [bestStreakSaved, setBestStreakSaved] = useState(() => loadBestStreak());
  const streak = streakOf(Object.keys(checkIns), new Date(), bestStreakSaved);
  // Check-ins tapped on the Check-in widget (Plus) while the app was closed: filed under their own day, unless that day
  // already has one from the app; the sleep question stays unanswered (the watch's figure shows when there is one).
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    takeWidgetCheckIns().then(items => {
      if (!items.length) return;
      const saved = loadCheckIns();
      let next = saved;
      const added: string[] = [];
      for (const c of [...items].sort((a, b) => a.at - b.at)) {
        const day = localDayKey(new Date(c.at));
        if (next[day] || added.includes(day)) continue;
        next = saveCheckIn(next, { sleepHours: null, energy: c.energy, at: c.at });
        added.push(day);
      }
      if (!added.length) return;
      setCheckIns(next);
      rewardCheckIns(next, added);
    });
    // rewardCheckIns reads the latest points/XP when it runs; this only needs to run on open and on return to the app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, onboardingStep, foregroundTick]);

  // What a notification tap or button does (the listener above calls this)
  useEffect(() => {
    notificationActionRef.current = (actionId, extra) => {
      if (actionId === ACTION_SNOOZE) remindAboutWaterSoon();
      else if (actionId === ACTION_ADD_GLASS) { addDrinks([[Date.now(), glassMl]]); handleTabChange('vitals'); notify('success', `Added ${waterAmount(glassMl)} of water.`); }
      else if (actionId === ACTION_CHECK_IN || extra?.open === 'checkin') openCheckIn();
      else if (extra?.open === 'gut') openGutCardRef.current();
    };
  });

  // --- Workouts (src/lib/workouts.ts): recorded by a watch/phone and read from Health; hand-added ones don't count ---
  const [detectedWorkouts, setDetectedWorkouts] = useState<DetectedWorkout[]>([]);
  // 'needs-access': connected before workouts were asked for, or Health Connect refused the read
  const [workoutsAsked, setWorkoutsAsked] = useState(() => localStorage.getItem(WORKOUTS_ASKED_KEY) === '1');
  const [workoutsRead, setWorkoutsRead] = useState<'unknown' | 'ok' | 'needs-access'>('unknown');
  const workoutsAccess = workoutsAsked ? workoutsRead : 'needs-access';
  const [detectedTotal, setDetectedTotal] = useState(() => detectedWorkoutCount());
  // Workouts added by hand (kx_workouts): added, changed and deleted on Today; the old profile.workoutsLogged strings
  // move over the first time (after that the profile field is never read).
  const [manualWorkouts, setManualWorkouts] = useState<ManualWorkout[]>(() => loadManualWorkouts(profile.workoutsLogged ?? []));
  // The add / change sheet. `key` remounts it fresh each time it opens; `open` stays separate so it can slide away.
  const [workoutSheet, setWorkoutSheet] = useState<{ open: boolean; editing: ManualWorkout | null; key: number }>({ open: false, editing: null, key: 0 });
  const [showWorkoutHistory, setShowWorkoutHistory] = useState(false);
  const openWorkoutSheet = (editing: ManualWorkout | null) => setWorkoutSheet(s => ({ open: true, editing, key: s.key + 1 }));
  const closeWorkoutSheet = () => setWorkoutSheet(s => ({ ...s, open: false }));
  const saveWorkout = (draft: WorkoutDraft) => {
    const editing = workoutSheet.editing;
    setManualWorkouts(prev => (editing ? updateManualWorkout(prev, editing.id, draft) : addManualWorkout(prev, draft)));
    closeWorkoutSheet();
    hapticTap();
    const when = draft.day === localDayKey() ? '' : draft.day === localDayKeyDaysAgo(1) ? ' yesterday'
      : ` on ${fmtDate(new Date(`${draft.day}T12:00:00`), { day: 'numeric', month: 'short' })}`;
    notify('success', `${editing ? 'Saved' : 'Added'}: ${manualLabel(draft)}${when}`);
  };
  const deleteWorkout = (id: string) => {
    const gone = manualWorkouts.find(w => w.id === id);
    setManualWorkouts(prev => removeManualWorkout(prev, id));
    closeWorkoutSheet();
    if (gone) notify('info', `Deleted: ${manualLabel(gone)}`);
  };
  // Workouts logged with a Quick log widget button (Plus) while the app was closed
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    takeWidgetWorkouts().then(items => {
      if (!items.length) return;
      setManualWorkouts(prev => items.reduce((list, w) => addManualWorkout(list, {
        type: w.type, minutes: Math.min(600, Math.max(1, Math.round(w.minutes))), day: localDayKey(new Date(w.at)),
      }, w.at), prev));
    });
  }, [isLoggedIn, onboardingStep, foregroundTick]);
  const [workoutsTick, setWorkoutsTick] = useState(0);
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData || !workoutsAsked) return;
    const readWorkouts = async () => {
      if (!appActiveRef.current) return;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 29);
      try {
        const { workouts } = await Health.queryWorkouts({ startDate: start.toISOString(), endDate: new Date().toISOString(), limit: 200, ascending: false });
        const list = workouts.map(toDetected).filter((w): w is DetectedWorkout => w !== null);
        setDetectedWorkouts(list);
        setDetectedTotal(rememberDetected(list));
        recordDetectedWorkouts(list);
        setWorkoutsRead('ok');
      } catch (err) {
        console.warn('Workout read failed:', err);
        if (/permission|authori[sz]/i.test(String(err))) setWorkoutsRead('needs-access');
      }
    };
    readWorkouts();
    const interval = setInterval(readWorkouts, 5 * 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn, onboardingStep, isLiveHealthData, workoutsAsked, foregroundTick, workoutsTick]);
  const allowWorkouts = async () => {
    try {
      await Health.requestAuthorization({ read: HEALTH_READ_TYPES });
      localStorage.setItem(WORKOUTS_ASKED_KEY, '1');
      localStorage.setItem(MORE_HEALTH_ASKED_KEY, '1');
      setWorkoutsAsked(true);
      setWorkoutsRead('unknown');
      setWorkoutsTick(t => t + 1);
    } catch (err) {
      console.warn('Workout permission failed:', err);
      notify('error', 'Could not ask for workout access. Please try again.');
    }
  };

  // --- Movement breaks (src/lib/moveReminders.ts) ---
  const moveWaterHours = hydrationRemindersEnabled ? reminderHours(shiftStartHour, shiftEndHour, hydrationIntervalHours) : [];
  const [moveEnabled, setMoveEnabled] = useState(() => localStorage.getItem('kinetix_move_enabled') === 'true');
  const [moveMinutes, setMoveMinutes] = useState(() => parseInt(localStorage.getItem('kinetix_move_minutes') || '60'));
  const [movePromptDone, setMovePromptDone] = useState(() => localStorage.getItem('kinetix_move_prompt') === '1');
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !Capacitor.isNativePlatform()) return;
    applyMoveReminders({ enabled: moveEnabled, startHour: shiftStartHour, endHour: shiftEndHour, minutes: moveMinutes, waterHours: moveWaterHours })
      .catch(err => console.warn('Movement breaks failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- moveWaterHours is derived from the reminder settings listed
  }, [isLoggedIn, onboardingStep, moveEnabled, moveMinutes, shiftStartHour, shiftEndHour, hydrationRemindersEnabled, hydrationIntervalHours]);
  const setMoveBreaks = async (on: boolean) => {
    localStorage.setItem('kinetix_move_prompt', '1');
    setMovePromptDone(true);
    if (!on || !Capacitor.isNativePlatform()) {
      setMoveEnabled(false);
      localStorage.setItem('kinetix_move_enabled', 'false');
      if (on) notify('info', 'Movement breaks come from the Kinetix Fit app on your phone.');
      return;
    }
    localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY);
    if (!(await ensureNotificationPermission())) {
      notify('warn', 'Notifications are off for Kinetix Fit — turn them on in your phone’s Settings first.');
      return;
    }
    const result = await applyMoveReminders({ enabled: true, startHour: shiftStartHour, endHour: shiftEndHour, minutes: moveMinutes, waterHours: moveWaterHours }, true)
      .catch(() => 'no-permission' as const);
    if (result !== 'ok') {
      await applyMoveReminders({ enabled: false, startHour: shiftStartHour, endHour: shiftEndHour, minutes: moveMinutes, waterHours: moveWaterHours }).catch(() => {});
      notify('warn', result === 'no-sensor'
        ? 'This phone has no step counter, so it can’t tell when you’ve been still.'
        : 'Kinetix Fit needs Physical activity access to notice when you’ve been still. Allow it in Settings → Apps → Kinetix Fit → Permissions.');
      return;
    }
    setMoveEnabled(true);
    localStorage.setItem('kinetix_move_enabled', 'true');
    notify('success', Capacitor.getPlatform() === 'android'
      ? `Movement breaks on — we’ll nudge you after ${moveMinutes} min on your phone without moving.`
      : `Movement breaks on — a reminder every ${moveMinutes} min in your active hours.`);
  };
  const changeMoveMinutes = (minutes: number) => { setMoveMinutes(minutes); localStorage.setItem('kinetix_move_minutes', String(minutes)); };

  // --- 7. CORE HEALTH TELEMETRY ARRAY ---
  const [biometrics] = useState<TelemetryStream[]>([
    {
      id: 'BIO-1',
      metric: 'Activity and Movement',
      system: 'Steps',
      reading: 'Not connected',
      status: 'Calibrating',
      behavior: 'Connect a device in Account to see your real steps',
      details: {
        title: 'Step Details',
        description: 'Tracks your daily steps and filters out fake step-counting from shaking your phone.',
        subMetrics: [
          { label: 'Steps', value: '--', color: 'var(--ink-3)' },
          { label: 'Max Speed Limit', value: '350 SPM', color: 'var(--warn)' }
        ]
      }
    },
    {
      id: 'BIO-2',
      metric: 'Heart Health',
      system: 'Heart Rate',
      reading: 'Not connected',
      status: 'Calibrating',
      behavior: 'Connect a device to see your real heart rate',
      details: {
        title: 'Heart Rate Details',
        description: 'Tracks your heart rate and HRV (a marker of recovery) throughout the day.',
        subMetrics: [
          { label: 'Resting Heart Rate', value: '--', color: 'var(--danger)' },
          { label: 'HRV', value: '--', color: 'var(--info)' },
          { label: 'Recovery', value: '--', color: 'var(--accent)' }
        ]
      }
    },
    {
      id: 'BIO-4',
      metric: 'Sleep and Rest',
      system: 'Sleep',
      reading: 'Not connected',
      status: 'Calibrating',
      behavior: 'Connect a device in Account to see your real sleep',
      details: {
        title: 'Sleep Details',
        description: 'Tracks your overall sleep quality from your connected device.',
        subMetrics: [
          { label: 'Time Asleep', value: '--', color: 'var(--ink-3)' },
          { label: 'Sleep Quality', value: '--', color: 'var(--ink-3)' }
        ]
      }
    },
    {
      id: 'BIO-5',
      metric: 'Stress',
      system: 'Stress',
      reading: 'Not connected',
      status: 'Calibrating',
      behavior: 'Connect a device to see a stress estimate',
      details: {
        title: 'Stress Details',
        description: 'Estimates your stress from your HRV — this app has no way to directly measure stress hormones.',
        subMetrics: [
          { label: 'Stress Level', value: '--', color: 'var(--ink-3)' }
        ]
      }
    },
  ]);

  // Sex-specific 6th telemetry card — computed live, never hardcoded. Hidden entirely until
  // profile.sex is set; shape depends on which sex is selected.
  const sexCard: TelemetryStream | null = useMemo(() => {
    // Women see Today → Your cycle instead (src/components/CycleCard.tsx, src/lib/cycle.ts)
    if (profile.sex === 'male') {
      if (liveHrv === null || liveBpm === null) {
        return {
          id: 'BIO-6',
          metric: 'Recovery',
          system: 'Recovery estimate',
          reading: isLiveHealthData ? 'Waiting for data' : 'Not connected',
          status: 'Calibrating',
          behavior: isLiveHealthData ? 'No recent heart rate data from your device yet' : 'Connect a device to see your recovery estimate',
          details: {
            title: 'Recovery & Stress Load',
            description: 'This app has no way to directly measure hormone levels — this card is a recovery/stress-load estimate built from your HRV, heart rate and sleep data instead.',
            subMetrics: []
          }
        };
      }
      // a real resting heart rate when the device gives one; otherwise the latest reading (it used to be called resting)
      const resting = vitals.restingHeartRate ? Math.round(vitals.restingHeartRate.value) : null;
      const bpm = resting ?? liveBpm;
      const recoveryLabel = liveHrv > 60 && bpm < 80 ? 'High' : liveHrv > 45 ? 'Moderate' : 'Low — take it easy today';
      return {
        id: 'BIO-6',
        metric: 'Recovery',
        system: 'Recovery estimate',
        reading: recoveryLabel,
        status: liveHrv > 45 ? 'Optimal' : 'Critical',
        behavior: resting !== null ? 'Derived from HRV and resting heart rate' : 'Derived from HRV and heart rate',
        details: {
          title: 'Recovery & Stress Load',
          description: 'This app has no way to directly measure hormone levels — this card is a recovery/stress-load estimate built from your existing HRV, heart rate and sleep data instead.',
          subMetrics: [
            { label: 'HRV', value: `${liveHrv} ms`, color: 'var(--info)' },
            { label: resting !== null ? 'Resting heart rate' : 'Heart rate', value: `${bpm} bpm`, color: 'var(--danger)' },
            { label: 'Sleep last night', value: liveSleepMinutes !== null ? formatMinutesAsHoursMinutes(liveSleepMinutes) : '--', color: 'var(--accent)' }
          ]
        }
      };
    }

    return null;
  }, [profile.sex, liveHrv, liveBpm, liveSleepMinutes, isLiveHealthData, vitals.restingHeartRate]);

  // Each card gets its own honest empty state — not connected, or connected but no reading yet —
  // instead of relying on the shared panel-level DEMO DATA / LIVE badge to explain what's real.
  const allBiometrics = useMemo(() => {
    const withLiveData = biometrics.map(item => {
      if (item.id === 'BIO-1') {
        if (!isLiveHealthData) {
          return {
            ...item,
            reading: 'Not connected',
            status: 'Calibrating' as const,
            behavior: 'Connect a device in Account to see your real steps',
            details: { ...item.details, subMetrics: [{ label: 'Steps', value: '--', color: 'var(--ink-3)' }, ...item.details.subMetrics.slice(1)] }
          };
        }
        if (liveSteps === null) {
          return {
            ...item,
            reading: 'Waiting for data…',
            status: 'Calibrating' as const,
            behavior: 'No step data from your device yet today',
            details: { ...item.details, subMetrics: [{ label: 'Steps', value: '--', color: 'var(--ink-3)' }, ...item.details.subMetrics.slice(1)] }
          };
        }
        return {
          ...item,
          reading: `${fmtNumber(liveSteps)} steps today`,
          status: 'Optimal' as const, // a real reading — the pill used to stay on "Calibrating"
          behavior: 'Synced from your device',
          // distance and calories burned when the device shares them (Health Connect: Samsung Health writes total calories)
          details: { ...item.details, subMetrics: [
            { label: 'Steps today', value: fmtNumber(liveSteps), color: 'var(--accent)' },
            ...(activityToday.meters !== null ? [{ label: 'Distance', value: distanceText(activityToday.meters, country.distance), color: 'var(--m-steps)' }] : []),
            ...(activityToday.kcal !== null ? [{ label: { total: 'Calories burned', active: 'Active calories', workouts: 'Workout calories' }[activityToday.kcalKind], value: `${fmtNumber(activityToday.kcal)} kcal`, color: 'var(--warn)' }] : []),
          ] }
        };
      }
      if (item.id === 'BIO-2') {
        // The newest reading of the last day, with its time: watches sync in batches, and the old "last 10 minutes" left
        // this card on "Waiting" nearly all day. Heart rate needs only a heart-rate reading; HRV and resting are extras.
        const resting = vitals.restingHeartRate ?? null;
        const extras = [
          ...(resting ? [{ label: 'Resting', value: `${Math.round(resting.value)} bpm`, color: 'var(--m-heart)' }] : []),
          ...(liveHrv !== null ? [{ label: 'HRV', value: `${liveHrv} ms`, color: 'var(--info)' }] : []),
        ];
        if (liveBpm === null || liveBpmAt === null) {
          // the newest day in the trend with heart rate says when the watch last synced any
          const lastDay = [...healthTrends.heartRate].reverse().find(d => d.value !== null && d.value > 0);
          return {
            ...item,
            reading: !isLiveHealthData ? 'Not connected' : lastDay ? 'Nothing in the last day' : 'No readings yet',
            status: 'Calibrating' as const,
            behavior: !isLiveHealthData ? 'Connect a device to see your real heart rate'
              : lastDay ? `The last heart rate arrived ${lastDay.label}. Open ${healthSource ?? 'your watch’s app'} so it syncs, then come back.`
              : 'Heart rate comes from a watch or band, through its app.',
            details: { ...item.details, subMetrics: extras }
          };
        }
        const high = liveBpm > 100;
        return {
          ...item,
          reading: `${liveBpm} bpm · ${whenTaken(liveBpmAt)}`,
          status: high ? 'Critical' as const : 'Optimal' as const,
          behavior: high
            ? 'Above a resting rate — normal if you were moving.'
            : `Latest from ${healthSource ?? 'your device'}${heartToday ? ` · today ${heartToday.min} to ${heartToday.max} bpm` : ''}.`,
          details: {
            ...item.details,
            subMetrics: [
              { label: 'Latest', value: `${liveBpm} bpm ${whenTaken(liveBpmAt)}`, color: 'var(--m-heart)' },
              ...(heartToday ? [
                { label: 'Today', value: `${heartToday.min}–${heartToday.max} bpm`, color: 'var(--ink)' },
                { label: 'Today’s average', value: `${heartToday.avg} bpm`, color: 'var(--ink)' },
              ] : []),
              ...extras,
            ]
          }
        };
      }
      if (item.id === 'BIO-4') {
        const emptySleepSubMetrics = [
          { label: 'Time Asleep', value: '--', color: 'var(--ink-3)' },
          { label: 'Sleep Quality', value: '--', color: 'var(--ink-3)' }
        ];
        if (!isLiveHealthData) {
          return {
            ...item,
            reading: 'Not connected',
            status: 'Calibrating' as const,
            behavior: 'Connect a device in Account to see your real sleep',
            details: { ...item.details, subMetrics: emptySleepSubMetrics }
          };
        }
        if (liveSleepMinutes === null) {
          return {
            ...item,
            reading: 'Waiting for data…',
            status: 'Calibrating' as const,
            behavior: 'No sleep data from your device yet',
            details: { ...item.details, subMetrics: emptySleepSubMetrics }
          };
        }
        return {
          ...item,
          reading: formatMinutesAsHoursMinutes(liveSleepMinutes),
          status: 'Optimal' as const,
          behavior: 'Time asleep, synced from your device. Most adults need 7 to 9 hours.',
          details: {
            ...item.details,
            // real figures only: the old "Sleep Quality" was just time asleep divided by 8 hours
            subMetrics: [
              { label: 'Last night', value: formatMinutesAsHoursMinutes(liveSleepMinutes), color: 'var(--m-sleep)' },
              { label: '7 h or more', value: sleepWeek.nights ? `${sleepWeek.enough} of ${sleepWeek.nights} nights` : '--', color: 'var(--info)' }
            ]
          }
        };
      }
      if (item.id === 'BIO-5') {
        if (liveHrv === null) {
          return {
            ...item,
            reading: isLiveHealthData ? 'Waiting for data…' : 'Not connected',
            status: 'Calibrating' as const,
            behavior: isLiveHealthData ? 'No recent HRV data from your device yet' : 'Connect a device to see a stress estimate',
            details: { ...item.details, subMetrics: [{ label: 'Stress Level', value: '--', color: 'var(--ink-3)' }, ...item.details.subMetrics.slice(1)] }
          };
        }
        const stressLabel = liveHrv > 60 ? 'Low' : liveHrv > 45 ? 'Moderate' : 'High';
        return {
          ...item,
          reading: `${stressLabel} Stress`,
          status: stressLabel === 'High' ? 'Critical' as const : 'Optimal' as const,
          behavior: isLiveHealthData ? 'Estimated from your HRV' : 'Demo estimate — connect a device for a real reading',
          details: {
            ...item.details,
            description: 'Estimates your stress from your HRV — this app has no way to directly measure stress hormones.',
            subMetrics: [
              { label: 'Stress Level', value: stressLabel, color: stressLabel === 'High' ? 'var(--danger)' : 'var(--accent)' },
              ...item.details.subMetrics.slice(1)
            ]
          }
        };
      }
      return item;
    });
    return sexCard ? [...withLiveData, sexCard] : withLiveData;
  }, [biometrics, liveBpm, liveBpmAt, heartToday, liveHrv, liveSteps, liveSleepMinutes, isLiveHealthData, sexCard, sleepWeek, vitals.restingHeartRate, activityToday, country.distance, healthTrends.heartRate, healthSource]);

  // --- 8. GAMIFICATION ENGINE (With Custom Points & Quotas) ---
  const [xp, setXp] = useState<number>(() => parseInt(localStorage.getItem('kinetix_xp') || '0'));
  const [level, setLevel] = useState<number>(() => parseInt(localStorage.getItem('kinetix_level') || '1'));
  // Level n runs from (n-1) × LEVEL_XP to n × LEVEL_XP (src/lib/points.ts)
  const xpIntoLevel = xpIntoLevelOf(xp, level);
  const [totalVoucherPoints, setTotalVoucherPoints] = useState<number>(() => parseInt(localStorage.getItem('kinetix_voucher_points') || '0'));

  // Every award goes through here (quests, check-ins, the streak bonus): points, and XP — which levels up one level at
  // a time, with the level-up celebration (its bonus is claimed from the pop-up).
  const awardPoints = (points: number, xpGain: number) => {
    if (points) {
      setTotalVoucherPoints(prev => {
        const next = Math.max(0, prev + points);
        localStorage.setItem('kinetix_voucher_points', next.toString());
        return next;
      });
    }
    if (xpGain) {
      const newXp = Math.max(0, xp + xpGain);
      const newLevel = levelAfter(newXp, level);
      if (newLevel > level) {
        localStorage.setItem('kinetix_level', newLevel.toString());
        setLevel(newLevel);
        setTimeout(() => setShowLevelUpModal(true), 350);
      }
      setXp(newXp);
      localStorage.setItem('kinetix_xp', newXp.toString());
    }
  };

  // The server keeps the record of what this account has earned (points_ledger), so points and XP follow the account to a
  // new phone or back after a logout. The phone keeps the higher of its own and the server's, so nothing is ever lowered
  // (src/lib/ledgerBalance.ts). Does nothing when offline or signed out.
  const applyServerBalance = (server: Balance | null) => {
    if (!server) return;
    setTotalVoucherPoints(prev => {
      const next = Math.max(prev, server.points);
      if (next !== prev) localStorage.setItem('kinetix_voucher_points', next.toString());
      return next;
    });
    setXp(prev => {
      const next = Math.max(prev, server.xp);
      if (next !== prev) localStorage.setItem('kinetix_xp', next.toString());
      return next;
    });
    setLevel(prev => {
      const next = Math.max(prev, levelForXp(server.xp));
      if (next !== prev) localStorage.setItem('kinetix_level', next.toString());
      return next;
    });
  };
  // On opening the app and each time it returns to the screen: tell the server about recent check-ins (it gives each day's
  // points once, so asking again is harmless, and it covers a check-in made while offline), then read the balance back.
  const claimThenReadBalance = useEffectEvent(() => claimCheckIns(claimableCheckInDays(checkIns)).then(() => fetchServerBalance()));
  const applyBalance = useEffectEvent((server: Balance | null) => applyServerBalance(server));
  useEffect(() => {
    if (!isLoggedIn) return;
    let current = true;
    void claimThenReadBalance().then(server => { if (current) applyBalance(server); });
    return () => { current = false; };
  }, [isLoggedIn, foregroundTick]);

  // Points for check-ins newly filed on `days` (src/lib/points.ts: once a day, + the weekly streak bonus), and the
  // best streak saved if it grew.
  function rewardCheckIns(all: Record<string, { at: number }>, days: string[]) {
    const withCheckIn = new Set(Object.keys(all));
    let points = 0, xpGain = 0, bonus = 0, run = 0;
    for (const day of [...days].sort()) {
      run = runEndingOn(withCheckIn, day);
      const award = awardCheckIn(day, run);
      points += award.points;
      xpGain += award.xp;
      bonus += award.streakBonus;
    }
    if (points > 0) {
      awardPoints(points, xpGain);
      notify('success', bonus > 0 ? `${run} days in a row · +${points} points with the streak bonus` : `Checked in · +${points} points`);
    }
    const now = streakOf(withCheckIn, new Date(), bestStreakSaved);
    if (now.best > bestStreakSaved) setBestStreakSaved(saveBestStreak(now.best));
  }

  // Quests claimed today (saved, so a restart doesn't offer the same points again).
  const [claimedQuestIds, setClaimedQuestIds] = useState<string[]>(() => loadToday('kinetix_quests_claimed', [] as string[]));
  useEffect(() => {
    localStorage.setItem('kinetix_quests_claimed', JSON.stringify({ date: localDayKey(), value: claimedQuestIds }));
  }, [claimedQuestIds]);
  const tasksCompletedTodayCount = claimedQuestIds.length;
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // Quest completion is now server-verified (see api/complete-quest.js) and, once awarded, is a
  // one-way action for the day — the server's dedup lock means a client-side "un-complete" would
  // just desync from a server that still considers it claimed. No optimistic local completion.
  const toggleTask = async (id: string) => {
    const task = todayQuests.find(t => t.id === id);
    if (!task || claimedQuestIds.includes(id) || completingTaskId) return;
    if (!task.done) {
      notify('info', `${task.text}: ${task.progressLabel}. Claim it once it's done.`);
      return;
    }

    setCompletingTaskId(id);
    try {
      // A verified session lets the server also write a durable, deduped record (quest_claims +
      // points_ledger) — see api/complete-quest.js. Older sessions / signed-out edge cases still work
      // exactly as before on the Redis-only path if there's no token to send.
      const accessToken = isSupabaseConfigured ? (await supabase.auth.getSession()).data.session?.access_token : null;
      const response = await fetch(serverUrl('/api/complete-quest'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          appUserId: profile.email,
          taskId: id,
          verificationType: task.verificationType,
          xpValue: task.xpValue,
          pointsValue: task.pointsValue,
          completed: true
        })
      });
      const data = await response.json();

      if (response.status === 409) {
        // the server already has this claimed (another phone, or before this one's data was wiped): show it as claimed
        // instead of leaving it on "tap to claim" for ever. The points were given when it was first claimed.
        setClaimedQuestIds(prev => mergeClaimedQuestIds(prev, [id]));
        notify('info', `"${task.text}" was already claimed today.`);
        return;
      }
      if (!response.ok) {
        notify('error', `${data.error || 'Could not complete this quest. Please try again.'}`);
        return;
      }

      // the server caps one claim (api/complete-quest.js), so use what it awarded, not what was asked for
      awardPoints(Number(data.pointsAwarded) || 0, Number(data.xpAwarded) || 0);
      setClaimedQuestIds([...claimedQuestIds, id]);

      notify('success', data.verified
        ? `Quest verified from your device data: "${task.text}" · +${data.pointsAwarded} points`
        : `Quest logged: "${task.text}" · +${data.pointsAwarded} points — ${data.verificationNote}`);
    } catch {
      notify('error', 'Could not reach the server to verify this quest. Please try again.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  // Regenerate today's quest set whenever the user's fitness target changes, OR a new calendar
  // day begins — quests previously never reset daily at all, only on a target change, meaning a
  // completed quest stayed "completed" forever. Adjusted directly during render (React's
  // documented pattern for this) rather than in an effect, since an effect here would cause an
  // extra, avoidable render pass.
  const todayDateKey = localDayKey();

  // --- Gut check-in (src/lib/gut.ts): how the gut feels each day; after a week, a report with food ideas. On the phone only.
  const [gutChecks, setGutChecks] = useState<GutChecks>(() => loadGutChecks());
  const todayGut = gutChecks[todayDateKey];
  // the answer being given (or changed) on the Today card
  const [gutDraft, setGutDraft] = useState<{ feel: GutFeel; symptoms: SymptomId[] } | null>(null);
  const [showGutReport, setShowGutReport] = useState(false);
  // It's about the whole day, so it's asked for in the evening (reminder at GUT_REMINDER_HOUR). Missed it? The next
  // morning, until noon, yesterday's can still be added.
  const [gutForYesterday, setGutForYesterday] = useState(false);
  const yesterdayKey = localDayKeyDaysAgo(1);
  const canLogYesterdaysGut = new Date().getHours() < 12 && !gutChecks[yesterdayKey];
  const saveGut = () => {
    if (!gutDraft) return;
    const forYesterday = gutForYesterday && canLogYesterdaysGut;
    setGutChecks(prev => saveGutCheck(prev, forYesterday ? yesterdayKey : localDayKey(), { ...gutDraft, at: Date.now() }));
    setGutDraft(null);
    setGutForYesterday(false);
    hapticTap();
    if (forYesterday) notify('success', 'Saved for yesterday.');
  };
  // An evening reminder on days without a check-in yet (on unless notifications were skipped; Account → Reminders)
  const [gutReminderOn, setGutReminderOn] = useState(() =>
    localStorage.getItem('kx_gut_reminder') !== 'off' && !localStorage.getItem(NOTIFICATIONS_SKIPPED_KEY));
  const setGutReminder = async (on: boolean) => {
    setGutReminderOn(on);
    localStorage.setItem('kx_gut_reminder', on ? 'on' : 'off');
    if (!on || !Capacitor.isNativePlatform()) return;
    localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY); // turning it on is an explicit yes
    if (!(await ensureNotificationPermission())) {
      setGutReminderOn(false);
      localStorage.setItem('kx_gut_reminder', 'off');
      notify('warn', 'Notifications are off for Kinetix Fit — turn them on in your phone’s Settings.');
    }
  };
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !Capacitor.isNativePlatform()) return;
    (async () => {
      await setupNotifications();
      await cancelGutReminders();
      if (!gutReminderOn || !(await ensureNotificationPermission())) return;
      const answered = (day: Date) => !!gutChecks[localDayKey(day)];
      await scheduleNotifications(gutReminderNotifications(new Date(), answered))
        .catch(err => console.warn('Gut reminder scheduling failed:', err));
    })();
  }, [isLoggedIn, onboardingStep, gutReminderOn, gutChecks, todayDateKey]);

  // The streak reminder: 19:30 on days without a check-in (src/lib/notifications.ts), on unless notifications were
  // skipped; Account → Reminders. Re-planned whenever check-ins change.
  const [streakReminderOn, setStreakReminderOn] = useState(() =>
    localStorage.getItem('kx_streak_reminder') !== 'off' && !localStorage.getItem(NOTIFICATIONS_SKIPPED_KEY));
  const setStreakReminder = async (on: boolean) => {
    setStreakReminderOn(on);
    localStorage.setItem('kx_streak_reminder', on ? 'on' : 'off');
    if (!on || !Capacitor.isNativePlatform()) return;
    localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY);
    if (!(await ensureNotificationPermission())) {
      setStreakReminderOn(false);
      localStorage.setItem('kx_streak_reminder', 'off');
      notify('warn', 'Notifications are off for Kinetix Fit — turn them on in your phone’s Settings.');
    }
  };
  const streakNow = streak.current;
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !Capacitor.isNativePlatform()) return;
    (async () => {
      await setupNotifications();
      await cancelStreakReminders();
      if (!streakReminderOn || !(await ensureNotificationPermission())) return;
      const checkedIn = (day: Date) => !!checkIns[localDayKey(day)];
      await scheduleNotifications(streakReminderNotifications(new Date(), checkedIn, streakNow))
        .catch(err => console.warn('Streak reminder scheduling failed:', err));
    })();
  }, [isLoggedIn, onboardingStep, streakReminderOn, checkIns, streakNow, todayDateKey]);

  // --- 9. LIVE Energy Balance & NHS Dietary Metrics ---
  // The food log (src/lib/foodLog.ts): every day's entries (90 days kept on the phone), one per food eaten, each
  // with its own amount, so any of them can be changed or removed — today's or a past day's. The person's saved
  // foods make re-logging and re-scanning a food instant — no server call, no scan used.
  const [foodDays, setFoodDays] = useState<FoodDays>(() => loadFoodDays());
  useEffect(() => { saveFoodDays(foodDays); }, [foodDays]);
  const foodLog = useMemo(() => foodDays[todayDateKey] ?? [], [foodDays, todayDateKey]);
  // Changes one day's entries (the day is read when the change runs, so a change just after midnight lands on the new day).
  const updateFoodDay = (day: string | null, update: (entries: LogEntry[]) => LogEntry[]) =>
    setFoodDays(prev => { const key = day ?? localDayKey(); return { ...prev, [key]: update(prev[key] ?? []) }; });
  const [savedFoods, setSavedFoods] = useState<Record<string, SavedFood>>(() => loadFoods());
  useEffect(() => { saveFoods(savedFoods); }, [savedFoods]);
  // Totals everything else reads (targets, quests, widgets, meal ideas) — always worked out from the entries.
  const dailyConsumables = useMemo(() => {
    const t = sumNutrients(foodLog);
    return {
      calories: Math.round(t.kcal), carbs: Math.round(t.carbs), protein: Math.round(t.protein), fiber: Math.round(t.fiber),
      // the foods of one meal photo are one check, like the one photo
      checks: mealCount(foodLog),
      foods: foodLog.slice(-20).map(e => `${e.name}, ${portionText(e)} (${Math.round(entryNutrients(e).kcal)} kcal)`),
    };
  }, [foodLog]);
  // A new day while the app stays open: fresh food log and quests.
  const [questDaySnapshot, setQuestDaySnapshot] = useState(todayDateKey);
  if (todayDateKey !== questDaySnapshot) {
    setQuestDaySnapshot(todayDateKey);
    setClaimedQuestIds([]);
  }
  const caloriesBurned = 0; // no real source yet — the old step simulator used to add made-up burn here

  const nhsTargets = useMemo(() => {
    const bmr = calculateBmr(profile);
    const tdee = bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel];
    // A deficit never takes the target under the usual unsupervised minimum (1,200 kcal women, 1,500 men)
    // — a small, sedentary woman was offered ~760 kcal.
    const floor = profile.sex === 'male' ? 1500 : 1200;
    const adjusted = tdee + GOAL_CALORIE_ADJUSTMENT[profile.target];
    const calories = Math.round(GOAL_CALORIE_ADJUSTMENT[profile.target] < 0 ? Math.max(adjusted, floor) : adjusted);
    const protein = Math.round(proteinReferenceWeight(profile) * GOAL_PROTEIN_PER_KG[profile.target]);
    const fat = Math.round((calories * 0.27) / 9);
    const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
    // The country's own fibre guidance (UK 30 g, US 14 g per 1,000 kcal…) — the same figure Nourish, Today and quests show
    const fiber = countryOf(profile).fibre(profile.sex, calories);
    return { calories, carbs, protein, fat, fiber };
  }, [profile]);
  // Needed vs eaten per nutrient (src/lib/nutrition.ts): the plan's five, then the country's guidance for the rest.
  const nutrientTargets = useMemo(() => planNutrientTargets(nhsTargets), [nhsTargets]);
  const extraNutrientTargets = useMemo(
    () => guidanceNutrientTargets(nhsTargets, { sex: profile.sex, age: profile.age, country: countryOf(profile).code }),
    [nhsTargets, profile]);
  const todayTotals = useMemo(() => sumNutrients(foodLog), [foodLog]);
  const [showAllNutrients, setShowAllNutrients] = useState(false);
  const [showFoodHistory, setShowFoodHistory] = useState(false);

  const caloriesRemaining = nhsTargets.calories - dailyConsumables.calories + caloriesBurned;

  // Only quests the user's own data can show (see src/lib/quests.ts) — no water, no stress for Samsung.
  const todayQuests: Quest[] = questsForToday(profile.target, {
    steps: isLiveHealthData ? liveSteps : null,
    sleepMinutes: isLiveHealthData ? liveSleepMinutes : null,
    hrv: isLiveHealthData ? liveHrv : null,
    foodChecks: dailyConsumables.checks ?? 0,
    protein: dailyConsumables.protein,
    proteinTarget: nhsTargets.protein,
    fibre: dailyConsumables.fiber,
    fibreTarget: nhsTargets.fiber,
    // only workouts a watch or phone recorded; offered once the person is known to record them
    workoutsToday: isLiveHealthData && workoutsAccess === 'ok' && (deviceMode === 'watch' || detectedWorkouts.length > 0)
      ? detectedWorkouts.filter(w => isToday(w.start)).length : null,
  }, claimedQuestIds);

  // --- Meal ideas: ranked on the phone for everyone (src/lib/mealIdeas.ts), three at a time; Plus can also ask the AI
  // (api/suggest-meals.js: nine per call, also shown three at a time, so "Show 3 more" never costs a call) ---
  interface MealIdea { name: string; description: string; why: string; calories: number; protein: number; carbs: number; fat: number; fibre: number; prepMinutes: number; allergens: string[] }
  const [mealIdeas, setMealIdeas] = useState<{ headline: string; mealSlot: string; suggestions: MealIdea[]; ideasLeft?: number } | null>(null);
  const [isLoadingMealIdeas, setIsLoadingMealIdeas] = useState(false);
  const [mealIdeasError, setMealIdeasError] = useState<string | null>(null);
  const [eatenIdeaNames, setEatenIdeaNames] = useState<string[]>([]);
  const [ideasSource, setIdeasSource] = useState<'foods' | 'ai'>('foods');
  const [ideasPage, setIdeasPage] = useState(0);
  const [aiPage, setAiPage] = useState(0);
  // AI dishes already shown today: "New ideas" asks for different ones
  const [aiShown, setAiShown] = useState<string[]>([]);
  const [hiddenMeals, setHiddenMeals] = useState<string[]>(() => loadHiddenMeals());

  const currentMealSlot = () => {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 17) return 'afternoon snack';
    if (h < 21) return 'dinner';
    return 'evening snack';
  };

  const requestMealIdeas = async () => {
    if (!profile.email) return;
    setIsLoadingMealIdeas(true);
    setMealIdeasError(null);
    const bmi = profile.height && profile.weight ? bmiOf(profile.height, profile.weight) : null;
    try {
      const response = await fetch(serverUrl('/api/suggest-meals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appUserId: profile.email,
          mealSlot: currentMealSlot(),
          timeZone: deviceTimeZone(),
          exclude: aiShown.slice(-27),
          profile: {
            goal: profile.target, sex: profile.sex, age: profile.age, heightCm: profile.height, weightKg: profile.weight,
            bmi: bmi ? Math.round(bmi * 10) / 10 : null,
            // the country's own cut-offs (India and Singapore use 22.9, not 24.9)
            bmiCategory: bmi === null ? null : bmi < 18.5 ? 'below the healthy range' : bmi < country.bmiHealthyMax + 0.1 ? 'healthy range'
              : bmi < country.bmiHealthyMax + 5.1 ? 'above the healthy range' : 'well above the healthy range',
            activityLevel: profile.activityLevel, region: country.name, country: country.code,
            allergens: profile.personalAllergens,
            diet: profile.diet ?? 'everything',
          },
          today: {
            caloriesTarget: nhsTargets.calories, proteinTarget: nhsTargets.protein, fibreTarget: nhsTargets.fiber,
            calories: dailyConsumables.calories, protein: dailyConsumables.protein, carbs: dailyConsumables.carbs, fibre: dailyConsumables.fiber,
            foods: dailyConsumables.foods ?? [],
            steps: isLiveHealthData ? liveSteps : null,
            sleepHours: isLiveHealthData && liveSleepMinutes ? Math.round(liveSleepMinutes / 6) / 10 : null,
            workouts: [
              ...detectedWorkouts.filter(w => isToday(w.start)).map(w => `${w.label} · ${w.minutes} min`),
              ...manualOnDay(manualWorkouts, localDayKey()).map(manualLabel),
            ],
          },
        }),
      });
      const data = await response.json();
      if (response.status === 403 && data.code === 'PLUS_REQUIRED') { setPlusFromServer(false); openPlusPage(); return; }
      if (!response.ok) { setMealIdeasError(data.error || 'Couldn’t make meal ideas this time.'); return; }
      // allergies typed in by the person (not on any label list) and meats not eaten where they live (beef in India):
      // the server checks both too once it has this build's rules, but older servers don't
      const typedAllergies = customAllergies(profile.personalAllergens);
      setMealIdeas({ ...data, suggestions: (data.suggestions ?? []).filter((i: MealIdea) =>
        allergiesIn(`${i.name} ${i.description}`, typedAllergies).length === 0 && !avoidedThere(`${i.name} ${i.description}`, country.code)) });
      setAiPage(0);
      setAiShown(prev => [...prev, ...(data.suggestions ?? []).map((i: MealIdea) => i.name)]);
      setEatenIdeaNames([]);
    } catch {
      setMealIdeasError('Couldn’t reach Kinetix Fit. Check your connection and try again.');
    } finally {
      setIsLoadingMealIdeas(false);
    }
  };

  // "I ate this" on a ranked meal: logged with its USDA numbers (one serving = all its foods)
  const logRankedMeal = (r: RankedMeal) => {
    const grams = r.meal.ingredients.reduce((t, [, g]) => t + g, 0);
    const per100g = Object.fromEntries(Object.entries(r.n).map(([k, v]) => [k, Math.round((v * 100 / grams) * 100) / 100])) as unknown as Nutrients;
    logFood({
      key: `meal:${r.meal.id}`, name: r.meal.name, source: 'idea', estimated: false, gramsKnown: true, per100g,
      units: [{ label: 'serving', grams }], allergens: r.meal.allergens,
    }, { qty: 1, unit: 'serving', unitGrams: grams });
    setEatenIdeaNames(names => [...names, r.meal.name]);
    hapticTap();
    notify('success', `Logged ${r.meal.name} · ${fmtNumber(Math.round(r.n.kcal))} kcal`);
  };
  const hideRankedMeal = (r: RankedMeal) => {
    setHiddenMeals(prev => hideMeal(prev, r.meal.id));
    notify('info', `We won’t suggest ${r.meal.name} again.`);
  };

  // "I ate this": logs the suggestion's estimated numbers to today, like a food check.
  const logMealIdea = (idea: MealIdea) => {
    // one "serving" is the whole suggestion; the per-100 g slot holds that serving's numbers (no gram basis)
    logFood({
      key: `idea:${idea.name.toLowerCase()}`, name: idea.name, source: 'idea', estimated: true, gramsKnown: false,
      per100g: { ...ZERO, kcal: idea.calories, carbs: idea.carbs, protein: idea.protein, fat: idea.fat, fiber: idea.fibre },
      units: [{ label: 'serving', grams: 100 }],
    }, { qty: 1, unit: 'serving', unitGrams: 100 });
    setEatenIdeaNames(names => [...names, idea.name]);
    notify('success', `Logged ${idea.name} · ${idea.calories} kcal (estimate)`);
  };


  // Calorie/macro progress alerts: fires once per threshold (90%/100%) per metric per day.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      const todayKey = localDayKey();
      let firedToday: string[] = [];
      const savedRaw = localStorage.getItem('kinetix_nutrition_alerts_fired');
      if (savedRaw) {
        try {
          const parsed = JSON.parse(savedRaw);
          if (parsed.date === todayKey) firedToday = parsed.keys;
        } catch { /* ignore malformed cache */ }
      }

      const metrics: { key: string; label: string; current: number; target: number; unit: string }[] = [
        { key: 'calories', label: 'calorie', current: dailyConsumables.calories, target: nhsTargets.calories, unit: 'kcal' },
        { key: 'protein', label: 'protein', current: dailyConsumables.protein, target: nhsTargets.protein, unit: 'g' },
        { key: 'fiber', label: 'fibre', current: dailyConsumables.fiber, target: nhsTargets.fiber, unit: 'g' }
      ];

      // wording in src/lib/notifications.ts nutritionAlert (calories are information, protein and fibre a win)
      const toFire: { alertKey: string; title: string; body: string; largeBody: string }[] = [];
      for (const m of metrics) {
        if (m.target <= 0) continue;
        const pct = (m.current / m.target) * 100;
        const remaining = Math.max(0, Math.round(m.target - m.current));
        const key = m.key as 'calories' | 'protein' | 'fiber';
        if (pct >= 100 && !firedToday.includes(`${m.key}-100`)) {
          toFire.push({ alertKey: `${m.key}-100`, ...nutritionAlert(key, true, remaining, Math.round(m.target)) });
        } else if (pct >= 90 && !firedToday.includes(`${m.key}-90`)) {
          toFire.push({ alertKey: `${m.key}-90`, ...nutritionAlert(key, false, remaining, Math.round(m.target)) });
        }
      }

      if (toFire.length === 0) return;
      const granted = await ensureNotificationPermission();
      if (!granted) return;

      await setupNotifications();
      await scheduleNotifications(toFire.map((f, idx) => styled('nutrition', {
        id: NUTRITION_BASE_ID + idx,
        title: f.title,
        body: f.body,
        largeBody: f.largeBody,
        schedule: { at: new Date(Date.now() + 1000) }
      }))).catch(err => console.warn('Nutrition alert scheduling failed:', err));

      localStorage.setItem('kinetix_nutrition_alerts_fired', JSON.stringify({ date: todayKey, keys: [...firedToday, ...toFire.map(f => f.alertKey)] }));
    })();
  }, [isLoggedIn, onboardingStep, dailyConsumables.calories, dailyConsumables.protein, dailyConsumables.fiber, nhsTargets.calories, nhsTargets.protein, nhsTargets.fiber]);

  // Day-by-day lifestyle data for the gut report's patterns and the cycle card's context (never a forecast): sleep from
  // the check-in (or the watch), workout minutes, active days (≥ 7,000 steps or a workout), calories eaten, HRV.
  const lifestyle = useMemo(() => {
    const sleepHoursByDay: Record<string, number> = {};
    for (const p of healthTrends.sleep) if (p.value !== null && p.value > 0) sleepHoursByDay[p.date] = Math.round(p.value / 6) / 10;
    for (const [d, c] of Object.entries(checkIns)) if (c.sleepHours !== null) sleepHoursByDay[d] = c.sleepHours;
    const workoutMinutesByDay: Record<string, number> = {};
    for (const w of detectedWorkouts) { const d = localDayKey(new Date(w.start)); workoutMinutesByDay[d] = (workoutMinutesByDay[d] ?? 0) + w.minutes; }
    for (const w of manualWorkouts) workoutMinutesByDay[w.day] = (workoutMinutesByDay[w.day] ?? 0) + w.minutes;
    const activeByDay: Record<string, boolean> = {};
    for (const p of healthTrends.steps) if (p.value !== null) activeByDay[p.date] = p.value >= 7000;
    for (const d of Object.keys(workoutMinutesByDay)) activeByDay[d] = true;
    const kcalByDay: Record<string, number> = {};
    for (const [d, es] of Object.entries(foodDays)) if (es.length) kcalByDay[d] = sumNutrients(es).kcal;
    const hrvByDay: Record<string, number> = {};
    for (const p of healthTrends.stress) if (p.value !== null) hrvByDay[p.date] = p.value;
    return { sleepHoursByDay, workoutMinutesByDay, activeByDay, kcalByDay, hrvByDay };
  }, [healthTrends, checkIns, detectedWorkouts, manualWorkouts, foodDays]);

  // Period starts (src/lib/cycle.ts), kept in step with "Last period started" in Your details
  const [periods, setPeriods] = useState<string[]>(() => loadPeriods(profile.lastPeriodStartDate));
  const logPeriod = (day: string) => {
    const next = addPeriod(periods, day);
    setPeriods(next);
    if (next.length) patchProfile({ lastPeriodStartDate: next[next.length - 1] });
    notify('success', day === localDayKey() ? 'Logged — your period started today.' : `Logged — a period that started ${fmtDate(new Date(`${day}T12:00:00`), { day: 'numeric', month: 'short' })}.`);
  };
  const removePeriodDay = (day: string) => {
    const next = removePeriod(periods, day);
    setPeriods(next);
    patchProfile({ lastPeriodStartDate: next.length ? next[next.length - 1] : null });
  };
  const patchDetails = (changes: Partial<UserProfile>) => {
    patchProfile(changes);
    if (changes.lastPeriodStartDate) setPeriods(prev => addPeriod(prev, changes.lastPeriodStartDate!));
  };

  // The ranked meal list (src/lib/mealIdeas.ts), with this week's gut report nudging it when there is one.
  const gutHints = useMemo(() => {
    if (!gutReportStatus(gutChecks, todayDateKey).ready) return null;
    const r = buildGutReport({
      checks: gutChecks, foodDays, waterGoalMl, fibreTarget: nhsTargets.fiber, diet: profile.diet, allergens: profile.personalAllergens, country: country.code,
      waterMlByDay: Object.fromEntries(reportDays(todayDateKey).map(d => [d, dayMl(waterLog, d)])), today: todayDateKey,
      sleepHoursByDay: lifestyle.sleepHoursByDay, activeByDay: lifestyle.activeByDay, hrvByDay: lifestyle.hrvByDay,
    });
    return { favour: r.suggestions.map(sg => sg.food.name), avoid: r.goEasy.map(g => g.name), wantsFermented: r.foodDaysLogged >= 3 && r.fermentedDays <= 1 };
  }, [gutChecks, foodDays, waterGoalMl, nhsTargets.fiber, profile.diet, profile.personalAllergens, country.code, waterLog, todayDateKey, lifestyle]);
  const recentFoodNames = [...(foodDays[todayDateKey] ?? []), ...(foodDays[localDayKeyDaysAgo(1)] ?? [])].map(e => e.name).join('|');
  const mealSlot = slotAt();
  const rankedMeals = useMemo(() => rankMeals({
    slot: mealSlot, goal: profile.target,
    targets: { kcal: nhsTargets.calories, protein: nhsTargets.protein, fibre: nhsTargets.fiber },
    eaten: { kcal: dailyConsumables.calories, protein: dailyConsumables.protein, fibre: dailyConsumables.fiber },
    diet: profile.diet, allergens: profile.personalAllergens, country: country.code,
    recentFoods: recentFoodNames ? recentFoodNames.split('|') : [], hidden: hiddenMeals,
    gutFavour: gutHints?.favour, gutAvoid: gutHints?.avoid, wantsFermented: gutHints?.wantsFermented,
  }), [mealSlot, profile.target, nhsTargets, dailyConsumables, profile.diet, profile.personalAllergens, country.code, recentFoodNames, hiddenMeals, gutHints]);

  // --- 10. OPTICAL INGESTION SCANNER & DIETARY MATRICES ---
  const [mealInput, setMealInput] = useState<string>('');
  const [scanResult, setScanResult] = useState<MealScanResult | null>(null);
  // Optional description typed in the scan window: sent with a photo (helps the AI), kept as the logged food's note.
  const [scanNote, setScanNote] = useState('');
  // Saved foods matching what's being typed, and the most recent ones — logged again without a lookup.
  const typedMatches = useMemo(() => searchFoods(savedFoods, parseTypedPortion(mealInput).name), [savedFoods, mealInput]);
  const recent = useMemo(() => recentFoods(savedFoods), [savedFoods]);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  // From anywhere (scan limit, locked vouchers) to Account → Your plan.
  const openPlusPage = () => {
    setShowCameraModal(false);
    setActiveTab('account');
    setAccountPage('subscription');
    accountPageFromMenu.current = false;
    window.history.pushState(null, '', '#account/subscription');
  };
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);
  const [isScanLoading, setIsScanLoading] = useState<boolean>(false);
  // The scan animation (src/components/ScanProgress.tsx): on while a lookup runs, "done" once the result is in.
  const [scanFx, setScanFx] = useState<{ kind: ScanKind; phase: 'working' | 'done'; label?: string } | null>(null);
  const startScanFx = (kind: ScanKind) => setScanFx({ kind, phase: 'working' });
  // a failed or cancelled lookup: the animation just goes (the error message says why)
  const dropScanFx = () => setScanFx(prev => (prev?.phase === 'working' ? null : prev));
  const endScanFx = useCallback(() => {
    setScanFx(null);
    // then bring the result into view
    window.setTimeout(() => document.querySelector('.kx-food-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }, []);
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeFileInputRef = useRef<HTMLInputElement>(null);


  // --- 11. REWARDS LEDGERS (100% Branded & White-Labeled) ---
  const [vouchers, setVouchers] = useState<VoucherLog[]>([]);

  // --- CSR CHARITY DONATIONS REGISTRY ---
  const [charityDonations, setCharityDonations] = useState<number>(() => parseInt(localStorage.getItem('kinetix_charity_donations') || '0'));
  const [isDonating, setIsDonating] = useState<boolean>(false);
  const [isRedeemingVoucher, setIsRedeemingVoucher] = useState<boolean>(false);


  const handleDonateToCharity = async (charityId: string, charityName: string) => {
    const requiredPoints = 1000;
    if (!country.donationsLive) {
      notify('info', `Donations in ${country.name} are coming soon — keep earning, your points are saved.`);
      return;
    }

    if (totalVoucherPoints < requiredPoints) {
      notify('info', `You need ${requiredPoints} points to donate. Complete quests to earn them.`);
      return;
    }

    setIsDonating(true);
    try {
      const response = await fetch(serverUrl('/api/donate-charity'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await bearerHeader()) },
        body: JSON.stringify({ charityId, charityName, pointsValue: requiredPoints, appUserId: profile.email, country: country.code })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || 'Donation could not be logged. Please try again.'}`);
        return;
      }

      const newTx: VoucherLog = {
        id: `TX-DON-${new Date().getTime()}`,
        provider: charityName,
        value: `${fmtMoney(country.donationAmount)} donation`,
        sku: 'CSR-CHARITY-DIRECT',
        state: 'Donated',
        timestamp: 'Just Now'
      };

      const newPts = totalVoucherPoints - requiredPoints;
      setTotalVoucherPoints(newPts);
      localStorage.setItem('kinetix_voucher_points', newPts.toString());

      const updatedDonationsTotal = charityDonations + 1;
      setCharityDonations(updatedDonationsTotal);
      localStorage.setItem('kinetix_charity_donations', updatedDonationsTotal.toString());

      setVouchers([newTx, ...vouchers]);
      notify('success', `Donation to ${charityName} recorded. Thank you!`);
    } catch {
      notify('error', 'Could not reach the donation server. Please try again.');
    } finally {
      setIsDonating(false);
    }
  };

  // --- SUBSCRIPTIONS & ADMIN MANAGED PROMOS ---
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [promoMessage, setPromoMessage] = useState<AppMessage | null>(null);
  const [isRedeemingPromo, setIsRedeemingPromo] = useState<boolean>(false);
  // null until RevenueCat reports a real status (native only) — the card never guesses one
  const [revenueCatStatus, setRevenueCatStatus] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  // What the server last said (scan responses carry it) — the website has no RevenueCat SDK to ask.
  const [plusFromServer, setPlusFromServer] = useState(false);
  const isPlus = !!customerInfo?.entitlements.active[PLUS_ENTITLEMENT] || plusFromServer;
  // The store package for Plus (its localised price), once RevenueCat has offerings set up.
  const [plusPackage, setPlusPackage] = useState<PurchasesPackage | null>(null);
  const [isBuyingPlus, setIsBuyingPlus] = useState(false);
  // Photo/barcode scans left today, as last reported by the server (null until the first scan).
  const [scanAllowance, setScanAllowance] = useState<{ left: number; limit: number } | null>(null);

  // The Plus widgets' settings (Account → Widgets → Customise), saved on the phone and handed to the widgets below
  const [widgetPrefs, setWidgetPrefs] = useState<WidgetPrefs>(() => loadWidgetPrefs());
  const changeWidgetPrefs = (next: WidgetPrefs) => setWidgetPrefs(saveWidgetPrefs(next));

  // Keep the home-screen widgets in step with the app (Android + iOS).
  const stepsQuestGoal = todayQuests.find(q => q.source === 'steps')?.goal ?? 10000;
  const questsDoneCount = todayQuests.filter(q => claimedQuestIds.includes(q.id)).length;
  const workoutsWeekCount = detectedWorkouts.filter(w => localDayKey(new Date(w.start)) >= localDayKeyDaysAgo(6)).length
    + manualWithinDays(manualWorkouts, 7, todayDateKey).length;
  // The streak as the widgets need it: the run ending on the last day with a check-in (they work out if it's still alive)
  const checkInDayKeys = Object.keys(checkIns).sort();
  const lastCheckInDay = checkInDayKeys.at(-1) ?? '';
  const streakRunToLast = lastCheckInDay ? runEndingOn(new Set(checkInDayKeys), lastCheckInDay) : 0;
  const recentCheckInDays = checkInDayKeys.filter(d => d >= localDayKeyDaysAgo(13)).join(',');
  // Plus as far as it's known: RevenueCat has answered, or the server said so (scans). Unknown → the widgets keep
  // whatever they were last told, so the Plus ones don't flash "locked" on every start.
  const planKnown = customerInfo !== null || plusFromServer;
  const widgetPlus = planKnown ? isPlus : undefined;
  const widgetPrefsFlat = JSON.stringify(flattenPrefs(widgetPrefs));
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    const t = window.setTimeout(() => updateWidgets({
      day: todayDateKey,
      hydrationEnabled: hydrationRemindersEnabled,
      startHour: shiftStartHour,
      endHour: shiftEndHour,
      intervalHours: hydrationIntervalHours,
      snoozedUntil: hydrationSnoozedUntil,
      // older fields: drinks today and the goal in glasses of the current size
      waterGlasses: drinksToday,
      waterGoal: Math.max(1, Math.round(waterGoalMl / glassMl)),
      waterMl: waterMlToday,
      waterGoalMl,
      glassMl,
      steps: isLiveHealthData ? liveSteps : null,
      stepsGoal: stepsQuestGoal,
      kcalLeft: Math.round(caloriesRemaining),
      kcalEaten: dailyConsumables.calories,
      kcalTarget: nhsTargets.calories,
      waterWeek: waterWeek(waterLog).map(d => d.ml),
      questsDone: questsDoneCount,
      questsTotal: todayQuests.length,
      protein: dailyConsumables.protein,
      proteinTarget: nhsTargets.protein,
      points: totalVoucherPoints,
      workoutsWeek: workoutsWeekCount,
      streakRun: streakRunToLast,
      streakLastDay: lastCheckInDay,
      streakBest: streak.best,
      checkinDays: recentCheckInDays ? recentCheckInDays.split(',') : [],
      energyToday: todayCheckIn?.energy ?? 0,
      ...(widgetPlus === undefined ? {} : { plus: widgetPlus }),
      ...JSON.parse(widgetPrefsFlat),
    }), 800);
    return () => window.clearTimeout(t);
  }, [isLoggedIn, onboardingStep, todayDateKey, hydrationRemindersEnabled, shiftStartHour, shiftEndHour, hydrationIntervalHours,
      hydrationSnoozedUntil, drinksToday, waterMlToday, waterGoalMl, glassMl, isLiveHealthData, liveSteps, stepsQuestGoal, caloriesRemaining, questsDoneCount, todayQuests.length,
      dailyConsumables.calories, nhsTargets.calories, waterLog, dailyConsumables.protein, nhsTargets.protein, totalVoucherPoints, workoutsWeekCount,
      streakRunToLast, lastCheckInDay, streak.best, recentCheckInDays, widgetPlus, widgetPrefsFlat, todayCheckIn?.energy]);

  // --- App icon (src/lib/appIcons.ts): two free, the rest Plus. A Plus icon goes back to Classic once the plan is known
  // not to be Plus (never while it's still loading).
  const [appIcon, setAppIcon] = useState<AppIconId>(DEFAULT_APP_ICON);
  const [iconShown, setIconShown] = useState<AppIconId | null>(null); // the icon previewed on the App icon page
  const [changingIcon, setChangingIcon] = useState(false);
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !appIconSupported()) return;
    currentAppIcon().then(setAppIcon);
  }, [isLoggedIn, onboardingStep]);
  const pickAppIcon = async (id: AppIconId) => {
    if (id === appIcon || changingIcon) return;
    if (!canUseIcon(id, isPlus)) { openPlusPage(); return; }
    setChangingIcon(true);
    try {
      const now = await changeAppIcon(id);
      setAppIcon(now);
      hapticTap();
      // Android switches the launcher icon as you leave the app (AppIconPlugin.java); iOS shows its own alert
      if (Capacitor.getPlatform() === 'android') notify('success', `${appIconInfo(now).name} is set — you’ll see it when you leave the app.`);
    } catch (err) {
      console.warn('App icon change failed:', err);
      notify('error', 'Could not change the icon. Please try again.');
    } finally {
      setChangingIcon(false);
    }
  };
  useEffect(() => {
    if (!shouldRevertIcon(appIcon, planKnown, isPlus)) return;
    changeAppIcon(DEFAULT_APP_ICON)
      .then(now => { setAppIcon(now); notify('info', 'Your app icon is back to Classic — Plus icons come with Kinetix Fit Plus.'); })
      .catch(err => console.warn('App icon reset failed:', err));
  }, [appIcon, planKnown, isPlus]);

  // Identify this customer to RevenueCat by email (a stable ID) instead of the SDK's default
  // anonymous per-device ID, so promo grants and entitlement checks target the right person
  // regardless of whether they redeemed on web or in the app.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !profile.email) return;
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { isConfigured } = await Purchases.isConfigured();
        if (!isConfigured) return;
        await Purchases.logIn({ appUserID: profile.email });
      } catch (err) {
        console.warn('RevenueCat logIn unavailable:', err);
      }
    })();
  }, [isLoggedIn, onboardingStep, profile.email]);

  const refreshRevenueCatStatus = async () => {
    try {
      const { isConfigured } = await Purchases.isConfigured();
      if (!isConfigured) return;

      const { customerInfo: info } = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      const entitlement = info.entitlements.active[PLUS_ENTITLEMENT];
      if (entitlement) {
        const expiry = entitlement.expirationDate ? new Date(entitlement.expirationDate) : null;
        setRevenueCatStatus(`Kinetix Fit Plus${expiry ? ` · ${entitlement.willRenew ? 'renews' : 'ends'} ${fmtDate(expiry, { day: 'numeric', month: 'short', year: 'numeric' })}` : ' · lifetime'}`);
      } else {
        setRevenueCatStatus('Free plan');
      }
    } catch (err) {
      console.warn('RevenueCat getCustomerInfo unavailable:', err);
    }
  };

  // Pull real subscription status from RevenueCat (native platforms only). Falls back to the
  // existing demo-mode revenueCatStatus text (e.g. from a promo code) when unavailable.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      await refreshRevenueCatStatus();
    })();
  }, [isLoggedIn, onboardingStep]);

  // Plus is sold as the current offering's first package (set up in Play Console / App Store Connect and
  // RevenueCat). Until products exist there, there's no package and the button explains that instead.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const { isConfigured } = await Purchases.isConfigured();
        if (!isConfigured) return;
        const offerings = await Purchases.getOfferings();
        setPlusPackage(offerings.current?.availablePackages[0] ?? null);
      } catch (err) {
        console.warn('RevenueCat offerings unavailable:', err);
      }
    })();
  }, [isLoggedIn, onboardingStep]);

  const handleBuyPlus = async () => {
    if (!Capacitor.isNativePlatform()) {
      notify('info', 'Get Kinetix Fit Plus in the Kinetix Fit app for Android or iPhone.');
      return;
    }
    if (!plusPackage) {
      notify('info', "Kinetix Fit Plus isn't on sale yet — check back soon.");
      return;
    }
    setIsBuyingPlus(true);
    try {
      const { customerInfo: info } = await Purchases.purchasePackage({ aPackage: plusPackage });
      setCustomerInfo(info);
      await refreshRevenueCatStatus();
      if (info.entitlements.active[PLUS_ENTITLEMENT]) notify('success', 'Welcome to Kinetix Fit Plus.');
    } catch (err) {
      if ((err as { userCancelled?: boolean | null })?.userCancelled) return;
      notify('error', 'The purchase didn’t go through. You haven’t been charged — try again.');
    } finally {
      setIsBuyingPlus(false);
    }
  };

  const handleRestorePurchases = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { customerInfo: info } = await Purchases.restorePurchases();
      setCustomerInfo(info);
      await refreshRevenueCatStatus();
      notify(info.entitlements.active[PLUS_ENTITLEMENT] ? 'success' : 'info',
        info.entitlements.active[PLUS_ENTITLEMENT] ? 'Kinetix Fit Plus restored.' : 'No Kinetix Fit Plus purchase found on this account.');
    } catch {
      notify('error', 'Could not reach the store to restore purchases. Try again.');
    }
  };

  const handleManageSubscription = async () => {
    if (!Capacitor.isNativePlatform()) {
      notify('info', 'Subscriptions are managed through your App Store or Google Play account. Open Kinetix Fit on your mobile device to manage your subscription.');
      return;
    }

    try {
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'
      let manageUrl = customerInfo?.managementURL || null;

      if (!manageUrl) {
        manageUrl = platform === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions?package=com.jnglobalventures.kinetixfit';
      }

      await Browser.open({ url: manageUrl });
    } catch (err) {
      console.warn('Unable to open subscription management screen:', err);
      notify('error', 'Could not open subscription management. Please try again from your device settings.');
    }
  };

  // --- CONTACT FORM STATE ---
  const [contactName, setContactName] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactMsg, setContactMsg] = useState<string>('');
  const [contactSuccess, setContactSuccess] = useState<boolean>(false);

  // --- ACTION HANDLERS ---

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);

    if (!isSupabaseConfigured) {
      setAuthError('Sign-up/login is not configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    // Opened from a reset link: save the new password (the link signed them in for just this), then log in as usual
    if (authMode === 'reset') {
      if (!passwordInput || passwordInput.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        return;
      }
      setIsSubmittingAuth(true);
      const { data, error } = await supabase.auth.updateUser({ password: passwordInput });
      setIsSubmittingAuth(false);
      if (error) {
        setAuthError(authErrorText(error).text);
        return;
      }
      await supabase.auth.signOut();
      setEmailInput(data.user?.email ?? emailInput);
      setPasswordInput('');
      setAuthMode('login');
      setAuthMessage('Password changed. Log in with your new password, here or in the Kinetix Fit app.');
      return;
    }

    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (authMode === 'forgot') {
      setIsSubmittingAuth(true);
      const { error } = await supabase.auth.resetPasswordForEmail(emailInput, { redirectTo: PASSWORD_RESET_URL });
      setIsSubmittingAuth(false);
      if (error) {
        setAuthError(authErrorText(error).text);
      } else {
        setAuthMessage(`If ${emailInput} has an account, a reset link is on its way. It opens our website, where you choose a new password. Check your spam folder too.`);
      }
      return;
    }

    if (!passwordInput || passwordInput.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmittingAuth(true);
    const { data, error } =
      authMode === 'signup'
        ? await supabase.auth.signUp({ email: emailInput, password: passwordInput, options: { emailRedirectTo: EMAIL_CONFIRMED_URL } })
        : await supabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    setIsSubmittingAuth(false);

    if (error) {
      const { text, resend } = authErrorText(error);
      setAuthError(text);
      if (resend) setConfirmEmail(emailInput);
      return;
    }

    // Supabase "signs up" an email that already has an account without sending anything — say so
    if (authMode === 'signup' && alreadyRegistered(data.user)) {
      setAuthMode('login');
      setConfirmEmail(emailInput);
      setAuthMessage('That email already has an account. Log in, or use “Forgot password?”. Never confirmed it? Send the confirmation email again.');
      return;
    }

    if (authMode === 'signup' && !data.session) {
      setAuthMode('login');
      setConfirmEmail(emailInput);
      setCanResend(false);
      setAuthMessage(`We’ve sent a confirmation link to ${emailInput}. Tap it, then log in here. It can take a few minutes, and it may land in spam or promotions.`);
      return;
    }

    // The onAuthStateChange listener (onSessionChange) fires from this same sign-in and picks up
    // from here — see syncThenContinue's comment for why this doesn't also act directly.
  };

  // "Send the confirmation email again" (Log in), for the address that signed up or was told to confirm
  const resendConfirmation = async () => {
    const email = confirmEmail ?? emailInput;
    if (!email || !canResend || isResending) return;
    setIsResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: EMAIL_CONFIRMED_URL } });
    setIsResending(false);
    setCanResend(false);
    if (error) {
      setAuthMessage(null);
      setAuthError(authErrorText(error).text);
    } else {
      setAuthError(null);
      setAuthMessage(`Sent again to ${email}. It can take a few minutes, and it may land in spam or promotions.`);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setAuthError('Sign-up/login is not configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    if (Capacitor.isNativePlatform()) {
      // Completing an OAuth redirect on native requires a custom URL scheme + deep-link listener
      // that isn't wired up yet (the same category of native-return complexity flagged for Oura
      // earlier) — being honest here rather than starting a flow that can't complete.
      setAuthError('Google sign-in is available on the web for now — please use email/password in the app.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) setAuthError(error.message);
  };

  // Signing in (or finishing onboarding) always opens Today, whatever tab was open before logging out.
  const openTodayFresh = () => {
    setActiveTab('vitals');
    setAccountPage(null);
    accountPageFromMenu.current = false;
    window.history.replaceState(null, '', '#vitals');
  };

  const openAboutYou = (atPlan = false) => {
    setAboutYouStart(atPlan ? 5 : 0);
    setOnboardingStep(5);
  };

  const handleCompleteOnboarding = () => {
    if (profile.email) markOnboarded(profile.email);
    clearOnboardingStep();
    setIsLogged(true);
    localStorage.setItem('kinetix_logged_in', 'true');
    setOnboardingStep(DASHBOARD_STEP);
    openTodayFresh();
  };

  // After signing in: an account that already finished onboarding on this device goes straight to Today;
  // anyone else carries on from the step they had reached (the Health permission step the first time).
  function continueAfterSignIn(alreadyOnboarded: boolean, email: string | null | undefined) {
    if (alreadyOnboarded) {
      handleCompleteOnboarding();
    } else {
      const resume = savedOnboardingStep(email) ?? 3;
      setOnboardingStep(prev => (prev < 3 ? resume : prev));
    }
  }

  // The one place a fresh sign-in/sign-up reaches the dashboard from: pulls remote account data (or
  // back-fills it from this device, if the account has none yet) before deciding where onboarding
  // resumes, so an existing account's data is there from the first frame on a new device, and a
  // phone-only user's existing data is never lost. Reached only via onSessionChange (Supabase's
  // onAuthStateChange listener) — handleAuthSubmit used to also call an equivalent path directly right
  // after signInWithPassword/signUp resolved, but that ran before this pull and could push a local
  // placeholder profile (just the typed email, no synced fields yet) over data this call had already
  // pulled down correctly. The listener alone is reliable: it fires as part of the same sign-in call.
  const syncThenContinue = useEffectEvent((email: string) => {
    if (loginSyncInFlightRef.current) return;
    loginSyncInFlightRef.current = true;
    syncAllOnLogin()
      .catch(() => { /* offline or a transient error: local data stays authoritative until the next sync */ })
      .finally(async () => {
        const pulled = readLocalProfile();
        const withEmail = { ...profile, ...pulled, email, name: (pulled?.name || profile.name) || email.split('@')[0] };
        saveProfileToStorage(withEmail);
        const onboarded = hasOnboarded(email);
        continueAfterSignIn(onboarded, email);
        // quests this account already claimed today, from a phone or a session this one knows nothing about
        const claimedIds = await fetchTodaysClaimedQuestIds();
        const serverBalance = await fetchServerBalance();
        if (onboarded) {
          // Food, water, points and the rest of the dashboard state are read from storage once, when the app starts, so
          // what the sign-in just pulled would stay invisible until the next launch. Reloading starts from it; the
          // logged-in flag is already saved, so it comes back on Today without signing in again.
          if (claimedIds.length) {
            localStorage.setItem('kinetix_quests_claimed', JSON.stringify({
              date: localDayKey(),
              value: mergeClaimedQuestIds(loadToday('kinetix_quests_claimed', [] as string[]), claimedIds),
            }));
          }
          writeLocalBalance(reconcileBalance(readLocalBalance(), serverBalance));
          window.location.reload();
        } else {
          if (claimedIds.length) setClaimedQuestIds(prev => mergeClaimedQuestIds(prev, claimedIds));
          applyServerBalance(serverBalance);
        }
      });
  });

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await flushOutbox().catch(() => { /* best-effort: local data is wiped regardless below */ });
      await supabase.auth.signOut();
    }
    clearAllDomainData();
    setProfile(DEFAULT_PROFILE);
    setActiveCountry(countryOf(DEFAULT_PROFILE));
    loginSyncInFlightRef.current = false;
    localStorage.removeItem('kinetix_logged_in');
    clearOnboardingStep();
    setIsLogged(false);
    setOnboardingStep(2);
    openTodayFresh(); // so the next sign-in doesn't reopen Account, where Log out lives
    setEmailInput('');
    setPasswordInput('');
    setAuthMode('login');
    setAuthError(null);
    setAuthMessage(null);
    // The wipe above clears storage, but points, XP, claimed quests and the rest of the dashboard state live in memory
    // here and would show the next account the last one's numbers until the app restarted. A reload starts from the
    // wiped storage, so nothing can carry over.
    window.location.reload();
  };

  // Restore/track the real Supabase session. If a session already exists (e.g. the app was
  // closed mid-onboarding after signing up), skip straight past Welcome/Auth rather than asking
  // an already-authenticated person to sign in again.
  // Only from the sign-in screen: the auth library also reports the session when the app comes back to the foreground
  // or refreshes its token, and acting on that mid-onboarding used to jump people past the rest of it.
  const onSessionChange = useEffectEvent((newSession: Session | null, event?: AuthChangeEvent) => {
    setSession(newSession);
    // a password-reset link signs in only to choose a new password: stay on that form
    if (event === 'PASSWORD_RECOVERY') {
      setAuthMode('reset');
      setAuthError(null);
      return;
    }
    if (newSession && !isLoggedIn && onboardingStep <= 2 && authMode !== 'reset') {
      syncThenContinue(newSession.user.email ?? '');
    }
  });
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => onSessionChange(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      onSessionChange(newSession, event);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const setPersonalAllergens = (personalAllergens: string[]) => patchProfile({ personalAllergens });


  // Adds a food to today and remembers it (with this amount) for next time. Returns the new entry. A meal photo's foods
  // also pass `more`: the meal they belong to, whether the amount is a guess, and the note's add-ons for that food.
  const logFood = (food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>, portion: Portion, eaten = 1, note?: string,
    more?: Pick<LogEntry, 'meal' | 'amountGuess' | 'extras'>): LogEntry => {
    // a note like "with 2 tsp sugar" adds those add-ons (shown as chips, so they can be taken off again)
    const entry = { ...entryFromFood(food, portion, eaten), note: note?.trim() || undefined, extras: note ? extrasFromNote(note) : undefined, ...more };
    updateFoodDay(null, prev => [...prev, entry]);
    setSavedFoods(prev => rememberFood(prev, food, portion));
    return entry;
  };

  // The person's own allergies this food has — only the ones they chose. "None" means no warnings: it used to fall
  // back to every allergen the country's labels list, so "badam milk" (milk, nuts) was flagged for someone with none.
  // Barcode lookups carry the label's allergens; every food is also checked by its words (src/lib/allergens.ts):
  // "paneer" has milk, "roti" wheat, and anything typed in ("kiwi") by its own name.
  const flaggedAllergens = (foodName: string, labelAllergens?: string[], ingredients?: string) =>
    flagAllergies(profile.personalAllergens, foodName, labelAllergens, ingredients);
  const allergyList = (list: string[]) => list.map(a => allergyName(a, allergenLabel)).join(', ');

  const goalRecommendation = () => {
    if (profile.target === 'Weight Loss') return `A good fit for weight loss. Add some lean protein later today and drink a glass of water to help you stay full.`;
    if (profile.target === 'Weight Gain') return `Logged towards your weight-gain goal. A carb-rich snack with some protein later will help you reach today's calories.`;
    if (profile.target === 'Cardio Endurance') return `Good fuel for cardio. Drink plenty of water before and after your next session.`;
    return `A steady, balanced choice for a recovery day. Add some healthy fats and keep sipping water through the day.`; // Autonomic Recovery
  };

  // Logs a food (unless it has one of the person's allergens) and shows the result card for it.
  const showLoggedFood = (food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>, portion: Portion, fromSaved: boolean, note?: string, source?: string, ingredients?: string,
    more?: Pick<LogEntry, 'amountGuess'>) => {
    const flagged = flaggedAllergens(food.name, food.allergens, ingredients);
    const vegNote = dietNote(profile.diet, food.diet ?? checkFood(food.name)) ?? undefined;
    if (flagged.length > 0) {
      notify('warn', 'This contains one of your allergens.');
      const preview = entryFromFood(food, portion);
      setScanResult({
        foodName: food.name, entryId: null, nutrients: entryNutrients(preview), portion: portionText(preview),
        allergensFlagged: flagged, complianceStatus: 'HAZARD_DETECTED', estimated: food.estimated, fromSaved, dietNote: vegNote,
        dietaryRecommendation: `Contains ${allergyList(flagged)}, which you've marked as an allergen. Try something else — the meal ideas on this page leave your allergens out.`,
      });
      return;
    }
    const entry = logFood(food, portion, 1, note, more);
    const n = entryNutrients(entry);
    notify('success', `Logged ${foodTitle(food.name)} · ${fmtNumber(Math.round(n.kcal))} kcal`);
    setScanResult({
      foodName: food.name, entryId: entry.id, nutrients: n, portion: portionText(entry),
      allergensFlagged: [], complianceStatus: 'CLEARED', estimated: food.estimated, fromSaved, labelAllergens: food.allergens, source, dietNote: vegNote,
      dietaryRecommendation: goalRecommendation(),
    });
  };

  // A real nutrition result from the server (photo, typed check or barcode) → a saved food + today's entry.
  const finalizeScanResult = (payload: ScanPayload, source: FoodSource, key: string, typed?: TypedPortion, note?: string) => {
    // Never log numbers that can't be right (a lookup that matched the wrong food or mis-scaled it)
    if (!isPlausible(per100gOf(payload).per100g)) {
      setScanFx(null);
      notify('error', source === 'barcode'
        ? 'That product’s nutrition data looks wrong, so it wasn’t added. Try a photo or type the food instead.'
        : 'That result didn’t look right, so it wasn’t added. Try a more specific name (e.g. “banana, raw”) or scan the barcode.');
      return;
    }
    const scanned = foodFromScan(payload, source, key, typed);
    // meat, fish or egg in it: barcode products also have their ingredients and Open Food Facts' own answer
    const diet = source === 'barcode'
      ? checkProduct(scanned.food.name, payload.ingredientsText, payload.vegetarian, payload.allergens)
      : checkFood(scanned.food.name);
    const food = { ...scanned.food, diet };
    const portion = scanned.portion;
    showLoggedFood(food, portion, false, note,
      payload.matchedFood ? `USDA: ${payload.matchedFood}` : source === 'barcode' ? 'Open Food Facts (the pack’s label)' : undefined,
      source === 'barcode' ? payload.ingredientsText : undefined);
    setScanFx(prev => (prev ? { ...prev, phase: 'done', label: foodTitle(food.name) } : prev));
  };

  // A saved food logged again: the typed amount when it makes sense for this food ("2 slices", "150 g", "200 ml"),
  // otherwise the amount used last time.
  const logSavedFood = (food: SavedFood, typed?: TypedPortion, note?: string) => {
    showLoggedFood(food, savedFoodPortion(food, typed), true, note);
  };

  // --- A meal photo: every food it saw, each its own entry (servers that send `items`) ---
  // Where a photo food's numbers came from, as the result card says it.
  const photoSource = (item: ScanItem) =>
    item.source === 'AI estimate' ? 'an AI estimate (no food database has it)' : item.matchedFood ? `USDA: ${item.matchedFood}` : undefined;

  // Logs one of a meal's foods under the meal — unless it has one of the person's allergens, like any food (then it's
  // left out and said so). Updates `card` (a copy the caller owns) and returns the entry, or null.
  const logMealFood = (built: { food: Omit<SavedFood, 'uses' | 'lastUsed' | 'lastQty' | 'lastUnit'>; portion: Portion }, card: MealCard, amountGuess: boolean): LogEntry | null => {
    const food = { ...built.food, diet: built.food.diet ?? checkFood(built.food.name) };
    const flagged = flaggedAllergens(food.name, food.allergens);
    if (flagged.length > 0) {
      card.notAdded.push(`${foodTitle(food.name)} — it has ${allergyList(flagged)}`);
      return null;
    }
    const vegNote = dietNote(profile.diet, food.diet);
    if (vegNote) card.dietNotes.push(`${foodTitle(food.name)}: ${vegNote}`);
    // the photo's note (and its add-ons) goes with the first food logged, once
    const first = card.entryIds.length === 0;
    const entry = logFood(food, built.portion, 1, first ? card.note : undefined, {
      meal: { id: card.id, name: card.name }, amountGuess: amountGuess || undefined, extras: first ? card.extras : undefined,
    });
    card.entryIds.push(entry.id);
    return entry;
  };

  // A photo the server described food by food. One food: logged and shown as always. Several: each its own entry, with
  // its own amount, linked as one meal. A food the photo wasn't sure about — or couldn't tell how much of — waits on the
  // card for the person to say what it is; it's never logged on a guess.
  const finalizeMealPhoto = (payload: ScanPayload, note?: string) => {
    const items = payload.items ?? [];
    const ready = (item: ScanItem) => {
      const built = foodFromScanItem(item);
      return !item.needsReview && built !== null && isPlausible({ ...ZERO, ...built.food.per100g }) ? built : null;
    };
    const one = items.length === 1 ? ready(items[0]) : null;
    if (one) {
      showLoggedFood({ ...one.food, diet: checkFood(one.food.name) }, one.portion, false, note, photoSource(items[0]), undefined,
        { amountGuess: items[0].amountConfidence === 'low' || undefined });
      setScanFx(prev => (prev ? { ...prev, phase: 'done', label: foodTitle(one.food.name) } : prev));
      return;
    }
    const card: MealCard = {
      id: newId(), name: payload.mealName || payload.foodName, entryIds: [], pending: [], notAdded: [], dietNotes: [],
      // the note's add-ons, less those the photo has as foods of their own (no second splash of milk)
      note: note?.trim() || undefined, extras: note ? extrasFromNoteExcept(note, items.map(i => i.name)) : undefined,
    };
    const logged: LogEntry[] = [];
    for (const item of items) {
      const built = ready(item);
      if (!built) { card.pending.push(item); continue; }
      const entry = logMealFood(built, card, item.amountConfidence === 'low');
      if (entry) logged.push(entry);
    }
    const kcal = logged.reduce((sum, e) => sum + entryNutrients(e).kcal, 0);
    if (logged.length) notify('success', `Logged ${logged.length === 1 ? '1 food' : `${logged.length} foods`} · ${fmtNumber(Math.round(kcal))} kcal`);
    else if (card.notAdded.length) notify('warn', 'This contains one of your allergens.');
    else notify('info', 'Not sure what’s in this photo — check the foods below.');
    setScanResult({
      foodName: card.name, entryId: null, nutrients: ZERO, portion: '', allergensFlagged: [], complianceStatus: 'CLEARED',
      estimated: true, dietaryRecommendation: goalRecommendation(), meal: card,
    });
    setScanFx(prev => (prev ? { ...prev, phase: 'done', label: foodTitle(card.name) } : prev));
  };

  // A food on a meal card, as the person answers: logged as seen ("Yes, add it"), as another food with the amount the
  // photo saw ("It's mango"), or dropped ("Skip").
  const updateMealCard = (card: MealCard, change: (next: MealCard) => void) => {
    const next = { ...card, entryIds: [...card.entryIds], pending: [...card.pending], notAdded: [...card.notAdded], dietNotes: [...card.dietNotes] };
    change(next);
    setScanResult(prev => (prev?.meal?.id === card.id ? { ...prev, meal: next } : prev));
  };
  const confirmMealFood = (item: ScanItem) => {
    const card = scanResult?.meal;
    const built = foodFromScanItem(item);
    if (!card || !built) return;
    updateMealCard(card, next => {
      next.pending = next.pending.filter(p => p !== item);
      const entry = logMealFood(built, next, item.amountConfidence === 'low');
      if (entry) notify('success', `Logged ${foodTitle(entry.name)} · ${fmtNumber(Math.round(entryNutrients(entry).kcal))} kcal`);
      else notify('warn', 'This contains one of your allergens.');
    });
  };
  const skipMealFood = (item: ScanItem) => {
    const card = scanResult?.meal;
    if (card) updateMealCard(card, next => { next.pending = next.pending.filter(p => p !== item); });
  };
  // A typed check's food without logging it: saved → table → server, as handleMealScan looks.
  const foodForName = async (name: string, typed: TypedPortion) => {
    const saved = findFoodByName(savedFoods, name);
    if (saved) return { food: saved, portion: savedFoodPortion(saved, typed) };
    const table = findTableFood(name);
    if (table) return foodFromTable(table, typed);
    try {
      const response = await fetch(serverUrl('/api/scan-meal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await bearerHeader()) },
        body: JSON.stringify({ foodText: name, appUserId: profile.email, timeZone: deviceTimeZone() })
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!isPlausible(per100gOf(data).per100g)) return null;
      applyPointsAwarded(data.pointsAwarded);
      return foodFromScan(data, 'search', nameKey(name), typed);
    } catch {
      return null;
    }
  };
  const chooseMealFood = async (item: ScanItem, name: string) => {
    const card = scanResult?.meal;
    if (!card || item.amount === null) return;
    // the amount the photo saw, the named food's numbers
    const found = await foodForName(name, { name, qty: item.amount, unit: item.unit === 'ml' ? ML : GRAMS });
    if (!found) { notify('error', `Couldn’t find ${name}. Type it in the search box instead.`); return; }
    updateMealCard(card, next => {
      next.pending = next.pending.filter(p => p !== item);
      const entry = logMealFood(found, next, item.amountConfidence === 'low');
      if (entry) notify('success', `Logged ${foodTitle(entry.name)} · ${fmtNumber(Math.round(entryNutrients(entry).kcal))} kcal`);
      else notify('warn', 'This contains one of your allergens.');
    });
  };
  const typeMealFood = (name: string) => {
    setMealInput(name);
    notify('info', `Add how much, e.g. “150 g ${name}”, then Check.`);
  };

  // A typed meal, split on the phone (splitTypedMeal): each food looked up the way one typed food is — saved → table →
  // server, which typed checks do without using a scan (at most one of them needs it) — and logged as its own entry
  // under one meal, on the same card as a meal photo's foods.
  const logTypedMeal = async (text: string, parts: TypedPortion[]) => {
    const lookUp = parts.some(p => !findFoodByName(savedFoods, p.name) && !findTableFood(p.name));
    if (lookUp) { setIsScanLoading(true); startScanFx('text'); }
    try {
      const found = await Promise.all(parts.map(p => foodForName(p.name, p)));
      const card: MealCard = { id: newId(), name: foodTitle(text), entryIds: [], pending: [], notAdded: [], dietNotes: [] };
      const logged: LogEntry[] = [];
      found.forEach((built, i) => {
        if (!built) { card.notAdded.push(`${foodTitle(parts[i].name)} — couldn’t look it up. Check it on its own.`); return; }
        const entry = logMealFood(built, card, false);
        if (entry) logged.push(entry);
      });
      const kcal = logged.reduce((sum, e) => sum + entryNutrients(e).kcal, 0);
      if (logged.length) notify('success', `Logged ${logged.length === 1 ? '1 food' : `${logged.length} foods`} · ${fmtNumber(Math.round(kcal))} kcal`);
      else notify('warn', 'Nothing was added — see why below.');
      setScanResult({
        foodName: card.name, entryId: null, nutrients: ZERO, portion: '', allergensFlagged: [], complianceStatus: 'CLEARED',
        dietaryRecommendation: goalRecommendation(), meal: card,
      });
      setScanFx(prev => (prev ? { ...prev, phase: 'done', label: card.name } : prev));
    } catch {
      notify('error', 'Scan failed — check your connection and try again.');
    } finally {
      if (lookUp) { setIsScanLoading(false); dropScanFx(); }
    }
  };

  // --- Changing and removing today's entries (FoodEntrySheet) ---
  // day = the day the entry belongs to (today, or a past day opened from Food history)
  const [foodSheet, setFoodSheet] = useState<{ entry: LogEntry; mode: 'edit' | 'add'; day: string } | null>(null);
  const openFoodEntry = (id: string, day = todayDateKey) => {
    const entry = (foodDays[day] ?? []).find(e => e.id === id);
    if (entry) setFoodSheet({ entry, mode: 'edit', day });
  };
  const openSavedFood = (food: SavedFood) => setFoodSheet({ entry: entryFromFood(food, lastPortion(food)), mode: 'add', day: todayDateKey });
  // A past day's food, eaten again today: same food and amount, a new entry today.
  const logEntryAgain = (entry: LogEntry) => {
    const food = savedFoods[entry.foodKey];
    const copy = copyEntry(entry);
    const flagged = flaggedAllergens(entry.name, food?.allergens);
    if (flagged.length > 0) { notify('warn', `Not added — it contains ${allergyList(flagged)}.`); return; }
    updateFoodDay(null, prev => [...prev, copy]);
    if (food) setSavedFoods(prev => ({ ...prev, [food.key]: touchFood(food) }));
    notify('success', `Logged ${foodTitle(entry.name)} today · ${fmtNumber(Math.round(entryNutrients(copy).kcal))} kcal`);
    setFoodSheet(null);
  };
  const saveFoodEntry = (entry: LogEntry) => {
    const food = savedFoods[entry.foodKey];
    if (foodSheet?.mode === 'add') {
      if (food) logSavedFoodExact(food, entry);
    } else {
      // an amount the person has set is theirs, no longer the photo's guess
      const before = foodSheet?.entry;
      const changed = before && (before.qty !== entry.qty || before.unit !== entry.unit);
      const saved = changed && entry.amountGuess ? { ...entry, amountGuess: undefined } : entry;
      updateFoodDay(foodSheet?.day ?? null, prev => prev.map(e => (e.id === entry.id ? saved : e)));
      // next time this food is logged, start from this amount
      if (food) setSavedFoods(prev => ({ ...prev, [food.key]: { ...food, lastQty: entry.qty, lastUnit: entry.unit } }));
      notify('success', `Updated ${foodTitle(entry.name)} · ${fmtNumber(Math.round(entryNutrients(entry).kcal))} kcal`);
    }
    setFoodSheet(null);
  };
  const logSavedFoodExact = (food: SavedFood, draft: LogEntry) => {
    const flagged = flaggedAllergens(food.name, food.allergens);
    if (flagged.length > 0) { notify('warn', `Not added — it contains ${allergyList(flagged)}.`); return; }
    const entry = logFood(food, { qty: draft.qty, unit: draft.unit, unitGrams: draft.unitGrams }, draft.eaten);
    notify('success', `Logged ${foodTitle(food.name)} · ${fmtNumber(Math.round(entryNutrients(entry).kcal))} kcal`);
  };
  const removeFoodEntry = (id: string) => {
    const day = foodSheet?.day ?? todayDateKey;
    const entry = (foodDays[day] ?? []).find(e => e.id === id);
    updateFoodDay(day, prev => prev.filter(e => e.id !== id));
    setScanResult(prev => (prev?.entryId === id ? null : prev));
    setFoodSheet(null);
    if (entry) notify('info', `Removed ${foodTitle(entry.name)}`);
  };

  // Applies a server-confirmed points award (e.g. the once-per-day meal-scan bonus) to the
  // client's running total. A no-op when 0 (award already claimed today).
  const applyPointsAwarded = (amount: number | undefined) => {
    if (!amount) return;
    setTotalVoucherPoints(prev => {
      const next = prev + amount;
      localStorage.setItem('kinetix_voucher_points', next.toString());
      return next;
    });
    notify('success', `+${amount} points for today's first scan`);
  };

  const handleMealScan = async (inputStr?: string) => {
    const activeInput = inputStr || mealInput;
    const userInput = activeInput.trim();
    if (!userInput) return;

    // "2 slices of bread": the amount stays on the phone, only the food's name is looked up
    const typed = parseTypedPortion(userInput);
    // A food the person has logged before needs no lookup at all.
    const saved = findFoodByName(savedFoods, typed.name);
    if (saved) { logSavedFood(saved, typed); return; }
    // Common foods come from USDA's own data on the phone (src/lib/foodTable.ts): accurate, instant, no server call.
    const table = findTableFood(typed.name);
    if (table) {
      const { food, portion } = foodFromTable(table, typed);
      showLoggedFood(food, portion, true, undefined, `${table.source}: ${table.name}`);
      return;
    }
    // "muesli with milk and banana", "2 roti and dal": several foods, split on the phone and logged as one meal
    const parts = splitTypedMeal(userInput, savedFoods);
    if (parts) { await logTypedMeal(userInput, parts); return; }

    setIsScanLoading(true);
    startScanFx('text');
    try {
      const response = await fetch(serverUrl('/api/scan-meal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await bearerHeader()) },
        body: JSON.stringify({ foodText: typed.name, appUserId: profile.email, timeZone: deviceTimeZone() })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || 'Could not scan that item. Please try again.'}`);
        return;
      }

      finalizeScanResult(data, 'search', nameKey(typed.name), typed);
      applyPointsAwarded(data.pointsAwarded);
    } catch {
      notify('error', 'Scan failed — check your connection and try again.');
    } finally {
      setIsScanLoading(false);
      dropScanFx();
    }
  };

  // Photo and barcode scans report how many are left today (free 2, Plus 10 — the server counts).
  const noteScanAllowance = (data: { scansLeft?: number; scanLimit?: number }) => {
    if (typeof (data as { plus?: boolean }).plus === 'boolean') setPlusFromServer((data as { plus: boolean }).plus);
    if (typeof data.scansLeft === 'number' && typeof data.scanLimit === 'number') {
      setScanAllowance({ left: data.scansLeft, limit: data.scanLimit });
    }
  };

  const handleMealScanFromPhoto = async (base64Image: string, mimeType: string) => {
    setIsCameraScanning(true);
    startScanFx('photo');
    try {
      const response = await fetch(serverUrl('/api/scan-meal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await bearerHeader()) },
        body: JSON.stringify({ image: base64Image, mimeType, appUserId: profile.email, timeZone: deviceTimeZone(), note: scanNote.trim() || undefined })
      });
      const data = await response.json();

      noteScanAllowance(data);
      if (!response.ok) {
        notify('error', `${data.error || 'Could not identify that photo. Please try again or enter it manually.'}`);
        return;
      }

      setShowCameraModal(false);
      setMealInput(data.foodName);
      // newer servers list every food seen (`items`); older ones describe the photo as one food
      if (Array.isArray(data.items) && data.items.length > 0) finalizeMealPhoto(data, scanNote);
      else finalizeScanResult(data, 'photo', nameKey(data.foodName), undefined, scanNote);
      setScanNote('');
      applyPointsAwarded(data.pointsAwarded);
    } catch {
      notify('error', 'Photo scan failed — check your connection and try again.');
    } finally {
      setIsCameraScanning(false);
      dropScanFx();
    }
  };

  // In the apps, photos come from the Camera plugin, not <input type="file">: that input only offered the camera
  // (no gallery), and Android often kills the app while the camera is open (Samsung frees memory for it), which
  // silently lost the photo. getPhoto — not the newer takePhoto — survives that restart and hands the photo back
  // through 'appRestoredResult' below.
  const handleNativePhoto = async (fromGallery: boolean) => {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    let photo;
    try {
      photo = await Camera.getPhoto({
        source: fromGallery ? CameraSource.Photos : CameraSource.Camera,
        resultType: CameraResultType.Base64,
        quality: 80,
        width: 1024,
        height: 1024,
        correctOrientation: true,
        saveToGallery: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('cancel')) return;
      notify('error', message.includes('denied') || message.includes('permission')
        ? `${fromGallery ? 'Photo' : 'Camera'} access is off — allow it in Settings → Apps → Kinetix Fit.`
        : `Could not open the ${fromGallery ? 'gallery' : 'camera'}. Please try again.`);
      return;
    }
    if (!photo.base64String) {
      notify('error', `The ${fromGallery ? 'photo' : 'camera'} didn’t send a picture back. Please try again.`);
      return;
    }
    await handleMealScanFromPhoto(photo.base64String, `image/${photo.format === 'jpg' ? 'jpeg' : photo.format}`);
  };

  // A photo taken just before Android killed the app arrives here after the restart.
  const resumeRestoredPhoto = useRef<(base64: string, mimeType: string) => void>(() => {});
  useEffect(() => {
    resumeRestoredPhoto.current = (base64, mimeType) => {
      handleTabChange('nourish');
      setShowCameraModal(true);
      handleMealScanFromPhoto(base64, mimeType);
    };
  });
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appRestoredResult', (event) => {
      if (event.pluginId !== 'Camera' || event.methodName !== 'getPhoto' || !event.success) return;
      const photo = event.data as { base64String?: string; format?: string } | undefined;
      if (!photo?.base64String) return;
      resumeRestoredPhoto.current(photo.base64String, `image/${photo.format === 'jpg' ? 'jpeg' : photo.format ?? 'jpeg'}`);
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  const lookupBarcode = async (barcode: string) => {
    // A product scanned before is already on the phone: log it straight away, no lookup and no scan used.
    const saved = savedFoods[barcodeKey(barcode)];
    if (saved) {
      setShowCameraModal(false);
      setMealInput(saved.name);
      logSavedFood(saved, undefined, scanNote);
      setScanNote('');
      return;
    }
    setIsCameraScanning(true);
    startScanFx('barcode');
    try {
      const response = await fetch(serverUrl('/api/lookup-barcode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, appUserId: profile.email, timeZone: deviceTimeZone() })
      });
      const data = await response.json();
      noteScanAllowance(data);

      if (!response.ok) {
        notify('error', `${data.error || 'Product not found — try manual entry.'}`);
        return;
      }

      setShowCameraModal(false);
      setMealInput(data.foodName);
      finalizeScanResult(data, 'barcode', barcodeKey(barcode), undefined, scanNote);
      setScanNote('');
    } catch {
      notify('error', 'Barcode lookup failed — check your connection and try again.');
    } finally {
      setIsCameraScanning(false);
      dropScanFx();
    }
  };

  // Reads a barcode from a saved photo (a picture of the pack, a screenshot). Android's WebView has the built-in
  // BarcodeDetector; iOS WebKit doesn't, so there html5-qrcode (ZXing) reads the file instead.
  const readBarcodeFromImage = async (image: Blob): Promise<string | null> => {
    type Detector = { detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]> };
    const NativeDetector = (window as unknown as { BarcodeDetector?: new () => Detector }).BarcodeDetector;
    if (NativeDetector) {
      const bitmap = await createImageBitmap(image);
      try {
        const codes = await new NativeDetector().detect(bitmap);
        if (codes[0]?.rawValue) return codes[0].rawValue;
      } finally {
        bitmap.close();
      }
    }
    const { Html5Qrcode } = await import('html5-qrcode');
    const host = document.createElement('div');
    host.id = 'kx-barcode-file-reader';
    host.hidden = true;
    document.body.appendChild(host);
    try {
      return await new Html5Qrcode(host.id).scanFile(new File([image], 'barcode.jpg', { type: image.type || 'image/jpeg' }), false);
    } catch {
      return null;
    } finally {
      host.remove();
    }
  };

  const handleBarcodeFromPhoto = async (file?: File) => {
    let image: Blob | undefined = file;
    if (!image && Capacitor.isNativePlatform()) {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      try {
        const photo = await Camera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.Uri, quality: 95 });
        if (!photo.webPath) return;
        image = await (await fetch(photo.webPath)).blob();
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        if (!message.includes('cancel')) notify('error', 'Could not open the gallery. Please try again.');
        return;
      }
    }
    if (!image) return;

    setIsCameraScanning(true);
    const barcode = await readBarcodeFromImage(image).catch(() => null);
    if (!barcode) {
      setIsCameraScanning(false);
      notify('error', "Couldn't find a barcode in that photo. Try a sharper, closer photo of the barcode.");
      return;
    }
    await lookupBarcode(barcode);
  };

  const handleBarcodeScan = async () => {
    try {
      // Lazy-loaded: this plugin bundles html5-qrcode for its web fallback, which is too heavy
      // to include in the main bundle for a feature most page loads never touch.
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
      const { ScanResult: barcode } = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.ALL });
      if (!barcode) return;
      await lookupBarcode(barcode);
    } catch (err) {
      // The plugin rejects the promise on user-cancelled scans too — only surface real failures.
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (!message.includes('cancel')) {
        notify('error', 'Barcode scan failed. Please try again or enter manually.');
      }
    } finally {
      setIsCameraScanning(false);
    }
  };

  // Home-screen widget shortcuts (android/.../ScanWidget.java, ios/App/KinetixFitWidgets): kinetixfit://scan/photo opens the
  // camera, kinetixfit://scan/barcode the barcode scanner, kinetixfit://today the Today tab, kinetixfit://hydration the Hydration page,
  // kinetixfit://checkin the daily check-in, kinetixfit://plus Plan & billing (locked Plus widgets). Works from a cold start
  // (getLaunchUrl) and while the app is open (appUrlOpen). Ignored until someone is signed in.
  const openWidgetLink = useRef<(url: string) => void>(() => {});
  const lastWidgetLink = useRef({ url: '', at: 0 });
  useEffect(() => {
    openWidgetLink.current = (url: string) => {
      if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
      // A widget tap that starts the app arrives twice on Android (getLaunchUrl and appUrlOpen). Acting on both
      // opened two cameras / barcode scanners on top of each other, and a photo taken in one could be lost.
      const now = Date.now();
      if (url === lastWidgetLink.current.url && now - lastWidgetLink.current.at < 3000) return;
      lastWidgetLink.current = { url, at: now };
      const path = url.replace(/^kinetixfit:\/\//, '');
      if (path.startsWith('scan')) {
        handleTabChange('nourish');
        setShowCameraModal(true);
        if (path === 'scan/photo') handleNativePhoto(false);
        else if (path === 'scan/barcode') handleBarcodeScan();
      } else if (path === 'today') {
        handleTabChange('vitals');
      } else if (path === 'hydration') {
        handleTabChange('vitals');
        setShowHydration(true);
      } else if (path.startsWith('checkin')) {
        openCheckIn(); // Streak / Check-in widgets
      } else if (path === 'plus') {
        openPlusPage(); // a locked Plus widget
      } else if (path === 'widgets') {
        setActiveTab('account');
        setAccountPage('widgets');
        accountPageFromMenu.current = false;
        window.history.pushState(null, '', '#account/widgets');
      } else if (path === 'rewards') {
        handleTabChange('rewards');
      }
    };
  });
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    CapacitorApp.getLaunchUrl().then(launch => { if (launch?.url) openWidgetLink.current(launch.url); }).catch(() => {});
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => openWidgetLink.current(url));
    return () => { listener.then(l => l.remove()); };
  }, []);

  // Downscales a captured photo client-side (max 1024px edge, JPEG ~0.8 quality) before upload,
  // to keep the request small and fast for both the vision call and Vercel's body size limit.
  const resizeImageToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected photo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not process the selected photo.'));
        img.onload = () => {
          const maxEdge = 1024;
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas not supported.'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoFileSelected = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { base64, mimeType } = await resizeImageToBase64(file);
      await handleMealScanFromPhoto(base64, mimeType);
    } catch {
      notify('error', 'Could not process that photo. Please try again.');
    }
  };

  const triggerCameraScan = (item: string) => {
    setIsCameraScanning(true);
    setMealInput(item);
    handleMealScan(item).finally(() => {
      setIsCameraScanning(false);
      setShowCameraModal(false);
    });
  };

  const handleConnectHealthSource = async () => {
    if (!Capacitor.isNativePlatform()) {
      notify('info', 'Live health sync needs the iOS or Android app. Open Kinetix Fit on your phone to connect.');
      return;
    }

    setIsConnectingHealth(true);
    try {
      const availability = await Health.isAvailable();
      if (!availability.available) {
        // Android 9–13 often don't have Health Connect (it's a Play Store app there): show how to get it, not a
        // two-second message
        const problem = Capacitor.getPlatform() === 'android' ? healthConnectProblem(availability, navigator.userAgent) : null;
        if (problem) {
          setShowDeviceSyncModal(false);
          setHealthConnectIssue(problem);
        } else {
          notify('error', "Apple Health isn't available on this device.");
        }
        return;
      }
      setHealthConnectIssue(null);

      const status = await Health.requestAuthorization({ read: HEALTH_READ_TYPES });
      localStorage.setItem(WORKOUTS_ASKED_KEY, '1');
      localStorage.setItem(MORE_HEALTH_ASKED_KEY, '1');
      setWorkoutsAsked(true);

      if (status.readAuthorized.length === 0) {
        notify('info', "Health data access wasn't granted. You can enable it later from your device's Health settings.");
        return;
      }

      const sourceName = Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect';
      saveProfileToStorage({ ...profile, smartDeviceConnected: sourceName });
      setShowDeviceSyncModal(false);
      notify('success', `Connected to ${sourceName}. Your data can take a moment to appear.`);
      // Onboarding: carry on. The step used to stay put with the same Connect button, and tapping it again did
      // nothing visible (the phone only shows its permission screen once).
      if (!isLoggedIn && onboardingStep === 3) setOnboardingStep(4);
    } catch (err) {
      console.warn('Health connection failed:', err);
      notify('error', 'Could not connect to health data. Please try again.');
    } finally {
      setIsConnectingHealth(false);
    }
  };

  const applyPromoCode = async () => {
    const code = promoCodeInput.trim();
    if (!code || !profile.email) return;

    setIsRedeemingPromo(true);
    try {
      const response = await fetch(serverUrl('/api/redeem-promo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, appUserId: profile.email })
      });
      const data = await response.json();

      if (!response.ok) {
        setPromoMessage({ tone: 'error', text: data.error || "That code isn't valid. Check it and try again." });
        return;
      }

      setPromoMessage({ tone: 'success', text: data.tier === 'lifetime'
        ? 'Lifetime access is now active.'
        : '30 days of Kinetix Fit Plus are now active.' });
      await refreshRevenueCatStatus();
    } catch {
      setPromoMessage({ tone: 'error', text: 'Could not reach the server to check your code. Try again.' });
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  const triggerRewardVaultSettlement = async () => {
    // The server checks Plus too; this just saves a pointless round trip.
    if (!isPlus && Capacitor.isNativePlatform()) {
      openPlusPage();
      return;
    }
    if (tasksCompletedTodayCount < requiredTaskCountForRedeem) {
      notify('info', `Finish ${requiredTaskCountForRedeem} of today's quests to unlock redeeming — you've done ${tasksCompletedTodayCount} so far.`);
      return;
    }

    if (totalVoucherPoints < VOUCHER_POINTS) {
      notify('info', `You need ${fmtNumber(VOUCHER_POINTS)} points to redeem a voucher. Complete quests to earn more.`);
      return;
    }

    if (voucherUsedThisMonth) {
      notify('info', "You've had this month's coffee voucher — the next one unlocks on the 1st.");
      return;
    }

    // Handle Active Payout Gateway
    let prefix: string;
    let voucherTitle: string;
    let sku: string;

    if (rewardGateway === 'primary') {
      notify('error', 'Rewards are temporarily unavailable. Try again later.');
      return;
    } else if (rewardGateway === 'direct') {
      prefix = 'TX-API-';
      voucherTitle = 'Direct API Payout: Coffee Voucher';
      sku = 'KTX-DIRECT-UK';
    } else {
      prefix = 'TX-LOC-';
      voucherTitle = 'Local Coffee Voucher Claim';
      sku = 'JN-LOCAL-CLAIM';
    }

    setIsRedeemingVoucher(true);
    try {
      const response = await fetch(serverUrl('/api/redeem-voucher'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await bearerHeader()) },
        body: JSON.stringify({
          country: country.code,
          userName: profile.name,
          simulatedCadence: 0
        })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || data.details || 'Redemption failed. Please try again.'}`);
        return;
      }

      const newTx: VoucherLog = {
        id: `${prefix}${1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000)}`,
        provider: voucherTitle,
        value: fmtMoney(data.valueGBP ?? 5, countryByCode('GB')),
        sku,
        state: 'Settled',
        timestamp: 'Just Now'
      };

      // what the server took (it has the final say on the price), else the app's own figure
      const deducted = Number(data.pointsDeducted) > 0 ? Number(data.pointsDeducted) : VOUCHER_POINTS;
      const newPts = Math.max(0, totalVoucherPoints - deducted);
      setVouchers([newTx, ...vouchers]);
      setTotalVoucherPoints(newPts);
      localStorage.setItem('kinetix_voucher_points', newPts.toString());
      setLastVoucherMonth(thisMonthKey);
      localStorage.setItem('kinetix_last_voucher_month', thisMonthKey);
      notify('success', data.message || 'Voucher redeemed.');
    } catch {
      notify('error', 'Could not reach the redemption server. Please try again.');
    } finally {
      setIsRedeemingVoucher(false);
    }
  };

  const handleSendContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMsg) {
      notify('error', 'Fill in your name, email and message to send it.');
      return;
    }
    setContactSuccess(true);
    setContactName('');
    setContactEmail('');
    setContactMsg('');
    setTimeout(() => setContactSuccess(false), 5000);
  };

  const getPersonalizedWelcome = () => {
    const hours = new Date().getHours();
    let timeGreeting = "Good morning";
    if (hours >= 12 && hours < 17) timeGreeting = "Good afternoon";
    if (hours >= 17) timeGreeting = "Good evening";

    const today = fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });

    return (
      <>
        <div>
          <p className="kx-hero-eyebrow">{today}</p>
          <h2 className="kx-hero-greeting">
            {timeGreeting},<br /><em>{profile.name.trim().split(/\s+/)[0] || 'there'}</em>
          </h2>
          <p className="kx-hero-status">
            {!profile.smartDeviceConnected
              ? 'Connect a device to see your steps, heart rate and sleep.'
              : healthDataState === 'no-data'
                ? `Connected to ${profile.smartDeviceConnected} — no data yet.`
                : `Synced with ${healthSource ?? profile.smartDeviceConnected}`}
          </p>
        </div>
        <div className="kx-hero-targets" aria-label="Today's targets">
          <span className="kx-hero-eyebrow">Today's targets</span>
          <div className="kx-hero-target-row">
            <span><strong>{fmtNumber(nhsTargets.calories)}</strong> kcal</span>
            <span><strong>{nhsTargets.protein}g</strong> protein</span>
            <span><strong>{nhsTargets.fiber}g</strong> fibre</span>
          </div>
        </div>
        {!profile.smartDeviceConnected && (
          <button type="button" onClick={() => setShowDeviceSyncModal(true)} className="kx-hero-cta">Connect a device</button>
        )}
      </>
    );
  };

  // --- RENDERING ROUTER ---

  // A. MARKETING FRONT HOME LANDING PAGE
  // Remember the onboarding step reached, so a restart mid-onboarding carries on from it (src/lib/onboarding.ts)
  useEffect(() => {
    if (!isLoggedIn && profile.email && onboardingStep >= 3 && onboardingStep < DASHBOARD_STEP) saveOnboardingStep(profile.email, onboardingStep);
  }, [isLoggedIn, onboardingStep, profile.email]);

  // Android back button during onboarding: one step back at a time (About you handles its own pages). On the sign-in
  // screen and the first step after it there's nothing to go back to, so it leaves the app — the step is remembered.
  useBackHandler(!isLoggedIn && onboardingStep <= 3, () => {
    if (onboardingStep <= 2 && authMode === 'forgot') { setAuthMode('login'); setAuthError(null); setAuthMessage(null); return; }
    CapacitorApp.exitApp();
  });
  useBackHandler(!isLoggedIn && onboardingStep === 4, () => setOnboardingStep(3));
  useBackHandler(onboardingStep === 6, () => openAboutYou(true));
  // Pop-ups close on back (sheets do it themselves, in Pickers.tsx). The level-up celebration waits for its button.
  useBackHandler(showCameraModal, () => setShowCameraModal(false));
  useBackHandler(showDeviceSyncModal, () => setShowDeviceSyncModal(false));
  useBackHandler(showLogoutConfirm, () => setShowLogoutConfirm(false));
  useBackHandler(showNoStressNotice, () => dismissNoStressNotice());
  useBackHandler(showLevelUpModal, () => {});

  // --- NEW ONBOARDING: Sign up / Log in / Forgot password (real Supabase Auth) ---
  if (!isLoggedIn && onboardingStep <= 2) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="ob-container">
            <div className="ob-card">
              <div className="ob-hero-panel ob-hero-compact">
                <TrackLanes />
                <div className="ob-logo">
                  <svg width="44" height="22" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="ob-wordmark">KINETIX FIT</span>
                </div>
                <h1 className="ob-hero-title">
                  {authMode === 'reset' ? <>Choose a new <em>password</em></> : authMode === 'forgot' ? <>Reset your <em>password</em></> : authMode === 'login' ? <>Welcome <em>back</em></> : <>Welcome to <em>Kinetix Fit</em></>}
                </h1>
              </div>
              <p className="ob-body">
                {authMode === 'reset'
                  ? 'Pick a new password for your account, then log in with it.'
                  : authMode === 'forgot'
                  ? 'We’ll email you a link to set a new one.'
                  : authMode === 'login'
                    ? 'Log in to pick up where you left off.'
                    : 'Track your fitness, nutrition and progress, all in one place. Create your account to start.'}
              </p>
              {!isSupabaseConfigured && (
                <p className="ob-error">Sign-up isn't configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
              )}
              <form onSubmit={handleAuthSubmit}>
                {authMode !== 'reset' && (
                  <>
                    <label className="ob-label">Email address</label>
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="ob-input"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint={authMode === 'forgot' ? 'send' : 'next'}
                    />
                  </>
                )}
                {authMode !== 'forgot' && (
                  <>
                    <label className="ob-label">{authMode === 'reset' ? 'New password' : 'Password'}</label>
                    <div className="ob-password">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="At least 6 characters"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="ob-input"
                        autoComplete={authMode === 'signup' || authMode === 'reset' ? 'new-password' : 'current-password'}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                      />
                      <button type="button" className="ob-password-toggle" onClick={() => setShowPassword(v => !v)} aria-pressed={showPassword}>
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </>
                )}
                {authMode === 'login' && (
                  <button type="button" onClick={() => { setAuthMode('forgot'); setAuthError(null); setAuthMessage(null); }} className="ob-link" style={{ display: 'block', marginBottom: '16px' }}>
                    Forgot password?
                  </button>
                )}
                {authError && <p className="ob-error">{authError}</p>}
                {authMessage && <p className="ob-success">{authMessage}</p>}
                {confirmEmail && authMode === 'login' && (
                  <button type="button" onClick={resendConfirmation} disabled={!canResend || isResending} className="ob-link ob-resend">
                    {isResending ? 'Sending…' : canResend ? 'Send the confirmation email again' : 'Didn’t get it? You can send it again in a minute.'}
                  </button>
                )}
                <button type="submit" disabled={isSubmittingAuth} className="ob-btn-primary">
                  {isSubmittingAuth ? 'Please wait…' : authMode === 'reset' ? 'Save new password' : authMode === 'forgot' ? 'Send reset email' : authMode === 'login' ? 'Log in' : 'Sign up'}
                </button>
              </form>

              {/* Google sign-in only works on the website (native needs a deep-link return that isn't built yet), and
                  on iOS offering it would also require Sign in with Apple (App Store guideline 4.8) — so apps don't show it */}
              {authMode !== 'forgot' && authMode !== 'reset' && !Capacitor.isNativePlatform() && (
                <>
                  <div className="ob-divider">or</div>
                  <button onClick={handleGoogleSignIn} className="ob-btn-google">
                    <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
                    Continue with Google
                  </button>
                </>
              )}

              <p className="ob-footnote">
                {authMode === 'reset' ? (
                  <button type="button" onClick={() => { supabase.auth.signOut(); setAuthMode('login'); setAuthError(null); setAuthMessage(null); }} className="ob-link">Back to log in</button>
                ) : authMode === 'forgot' ? (
                  <button type="button" onClick={() => { setAuthMode('login'); setAuthError(null); setAuthMessage(null); }} className="ob-link">Back to log in</button>
                ) : authMode === 'login' ? (
                  <>Don't have an account? <button type="button" onClick={() => { setAuthMode('signup'); setAuthError(null); setAuthMessage(null); }} className="ob-link">Sign up</button></>
                ) : (
                  <>Already have an account? <button type="button" onClick={() => { setAuthMode('login'); setAuthError(null); setAuthMessage(null); }} className="ob-link">Log in</button></>
                )}
              </p>
              <p className="ob-footnote">
                By continuing, you agree to our <a href={serverUrl('/privacy-policy')} target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href={serverUrl('/terms-of-service')} target="_blank" rel="noopener noreferrer">Terms of Service</a>.
              </p>
            </div>
          </div>
        </div>
              </div>
    );
  }

  // --- NEW ONBOARDING: Health permission priming (explains before the OS prompt fires) ---
  if (!isLoggedIn && onboardingStep === 3) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="ob-container">
            <div className="ob-card">
              <div className="ob-badge" style={{ ['--metric' as string]: 'var(--m-heart)' }}><HeartIcon size={30} /></div>
              <h1 className="ob-title">See your real stats</h1>
              <p className="ob-body">
                We use {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'} to show your real steps, heart rate, and sleep — no guessing, no placeholder numbers. You can disconnect at any time in Account.
              </p>
              <ul className="ob-perm-list" aria-label="What Kinetix Fit reads">
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-steps)' }}><StepsIcon size={16} /></span><span><strong>Steps</strong>Your daily activity and streak</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><HeartIcon size={16} /></span><span><strong>Heart rate</strong>Recovery and stress estimates</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-sleep)' }}><SleepIcon size={16} /></span><span><strong>Sleep</strong>Nightly sleep and your trend</span></li>
              </ul>
              <p className="ob-footnote ob-perm-note">Read only — Kinetix Fit doesn't add or change anything in {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}.</p>
              {profile.smartDeviceConnected ? (
                <>
                  <p className="ob-success" role="status">Connected to {profile.smartDeviceConnected}. You can change this later in Account → Connected devices.</p>
                  <button onClick={() => setOnboardingStep(4)} className="ob-btn-primary">Continue</button>
                </>
              ) : (
                <>
                  <button onClick={handleConnectHealthSource} disabled={isConnectingHealth} className="ob-btn-primary" style={{ marginBottom: '10px' }}>
                    {isConnectingHealth ? 'Connecting…' : `Connect ${Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}`}
                  </button>
                  <button onClick={() => setOnboardingStep(4)} className="ob-btn-secondary">Skip for now</button>
                </>
              )}
              {!Capacitor.isNativePlatform() && (
                <p className="ob-footnote">Live sync needs the iOS or Android app — you can skip this on the website.</p>
              )}
            </div>
          </div>
        </div>
        <HealthConnectSheet problem={healthConnectIssue} busy={isConnectingHealth}
          onRetry={handleConnectHealthSource} onClose={() => setHealthConnectIssue(null)} />
              </div>
    );
  }

  // --- NEW ONBOARDING: Notifications permission priming ---
  if (!isLoggedIn && onboardingStep === 4) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="ob-container">
            <div className="ob-card">
              <div className="ob-badge" style={{ ['--metric' as string]: 'var(--m-sleep)' }}><BellIcon size={30} /></div>
              <h1 className="ob-title">Stay on track</h1>
              <p className="ob-body">
                A few helpful reminders, only if you want them. You can change or turn them off anytime in Account.
              </p>
              <ul className="ob-perm-list" aria-label="Reminders Kinetix Fit sends">
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--info)' }}><WavesIcon size={16} /></span><span><strong>Water breaks</strong>During the hours you choose</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><DumbbellIcon size={16} /></span><span><strong>Movement breaks</strong>When you've been sitting still for a long time</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><TargetIcon size={16} /></span><span><strong>Target alerts</strong>When you're close to your protein, fibre or calories</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><BowlIcon size={16} /></span><span><strong>Gut check-in</strong>An evening nudge to note how your gut feels</span></li>
              </ul>
              <button
                onClick={async () => { localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY); await ensureNotificationPermission(); openAboutYou(); }}
                className="ob-btn-primary"
                style={{ marginBottom: '10px' }}
              >
                Turn on reminders
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(NOTIFICATIONS_SKIPPED_KEY, '1');
                  localStorage.setItem('kinetix_hydration_enabled', 'false');
                  setHydrationRemindersEnabled(false);
                  localStorage.setItem('kx_gut_reminder', 'off');
                  setGutReminderOn(false);
                  openAboutYou();
                }}
                className="ob-btn-secondary"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
              </div>
    );
  }

  // C. ONBOARDING STEP 5: About you — name/region, body, goal and plan, with a moment after each
  if (onboardingStep === 5) {
    return (
      <AboutYouFlow
        profile={profile}
        onChange={patchProfile}
        bmr={Math.round(calculateBmr(profile))}
        targets={nhsTargets}
        initialStage={aboutYouStart}
        onBack={() => setOnboardingStep(4)}
        onDone={() => setOnboardingStep(6)}
      />
    );
  }

  // D. ONBOARDING STEP 6: Personal Allergy Manager Setup
  if (onboardingStep === 6) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div className="ob-container">
            <div className="ob-card">
              <span className="ob-step">Last step</span>
              <h1 className="ob-title">Your food</h1>
              <p className="ob-body" style={{ marginBottom: '18px' }}>
                So meal ideas and food tips fit how you eat, and we can flag your allergens when you check a food.
              </p>

              <ChoiceCards label="What do you eat?" options={DIET_OPTIONS} value={profile.diet} onChange={d => patchProfile({ diet: d })} />

              <span className="kx-field-label" style={{ marginTop: '20px' }}>Any food allergies? Tap any you have, or add your own.</span>
              <div style={{ marginBottom: '24px' }}>
                <AllergyPicker countryAllergens={country.allergens} diet={profile.diet} selected={profile.personalAllergens}
                  onChange={setPersonalAllergens} onMessage={notify} />
              </div>
              <div className="ob-actions" style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => openAboutYou(true)} className="secondary-btn" style={{ flex: 1 }}>
                  Back
                </button>
                <button onClick={handleCompleteOnboarding} disabled={!profile.diet} className="primary-btn" style={{ flex: 1.6 }}>
                  {!profile.diet ? 'Choose what you eat' : profile.personalAllergens.length ? 'Finish' : 'No allergies — finish'}
                </button>
              </div>
            </div>
                      </div>
        </div>
      </div>
    );
  }

  // Individual live-derived biometric entries for the 7-day trend cards below.
  const stepsBio = allBiometrics.find(b => b.id === 'BIO-1')!;
  // today's bar follows the live count: the trend is re-read every 30 minutes, the count every 30 seconds
  const stepsTrend = liveSteps === null ? healthTrends.steps
    : healthTrends.steps.map(d => (d.date === todayDateKey && (d.value ?? 0) < liveSteps ? { ...d, value: liveSteps } : d));
  const heartRateBio = allBiometrics.find(b => b.id === 'BIO-2')!;
  const sleepBio = allBiometrics.find(b => b.id === 'BIO-4')!;
  const stressBio = allBiometrics.find(b => b.id === 'BIO-5')!;

  // Workouts card: today's workouts (recorded + added by hand), then the three latest from earlier this week.
  const weekStartKey = localDayKeyDaysAgo(6);
  const detectedThisWeek = detectedWorkouts.filter(w => localDayKey(new Date(w.start)) >= weekStartKey);
  const todaysDetected = detectedThisWeek.filter(w => isToday(w.start));
  const manualThisWeek = manualWithinDays(manualWorkouts, 7, todayDateKey);
  const manualToday = manualOnDay(manualWorkouts, todayDateKey);
  const earlierWorkouts = [
    ...detectedThisWeek.filter(w => !isToday(w.start)).map(w => ({ kind: 'detected' as const, day: localDayKey(new Date(w.start)), at: w.start, w })),
    ...manualThisWeek.filter(w => w.day !== todayDateKey).map(w => ({ kind: 'manual' as const, day: w.day, at: w.at, w })),
  ].sort((a, b) => (a.day === b.day ? b.at - a.at : a.day < b.day ? 1 : -1));
  const workoutsThisWeek = detectedThisWeek.length + manualThisWeek.length;
  const hasAnyWorkout = manualWorkouts.length > 0 || detectedWorkouts.length > 0;
  const workoutMeta = (w: DetectedWorkout) => [
    `${w.minutes} min`,
    w.km ? (country.distance === 'mi' ? `${fmtNumber(w.km / 1.609, 1)} mi` : `${fmtNumber(w.km, 1)} km`) : null,
    fmtTime(new Date(w.start)),
    w.source,
  ].filter(Boolean).join(' · ');

  // Check-in card: the watch's sleep for last night (skips the sleep question), the last 7 days, and the insight.
  const watchSleepHours = isLiveHealthData && liveSleepMinutes !== null && liveSleepMinutes > 0 ? Math.round(liveSleepMinutes / 6) / 10 : null;
  const watchSleepByDay: Record<string, number> = {};
  for (const p of healthTrends.sleep) if (p.value !== null) watchSleepByDay[p.date] = Math.round(p.value / 6) / 10;
  // Gut card: the last 7 days, whether the report is ready, and the report itself while it's open
  const gutStatus = gutReportStatus(gutChecks, todayDateKey);
  const gutWeek = reportDays(todayDateKey).map(day => ({
    day,
    letter: new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }),
    feel: gutChecks[day]?.feel ?? null,
  }));
  const gutReport = showGutReport ? buildGutReport({
    checks: gutChecks, foodDays, waterGoalMl, fibreTarget: nhsTargets.fiber, diet: profile.diet, allergens: profile.personalAllergens, country: country.code,
    // 14 days of water: the lifestyle patterns look back two weeks
    waterMlByDay: Object.fromEntries(Array.from({ length: 14 }, (_, i) => localDayKeyDaysAgo(i)).map(d => [d, dayMl(waterLog, d)])), today: todayDateKey,
    sleepHoursByDay: lifestyle.sleepHoursByDay, activeByDay: lifestyle.activeByDay, hrvByDay: lifestyle.hrvByDay,
  }) : null;
  // The cycle card's context: things this cycle known to shift a period (src/lib/cycle.ts cycleContext)
  const lastPeriodStart = periods.filter(p => p <= todayDateKey).at(-1) ?? null;
  const cycleNotes = profile.sex === 'female' && lastPeriodStart ? cycleContext({
    since: lastPeriodStart, today: todayDateKey, sleepHoursByDay: lifestyle.sleepHoursByDay, workoutMinutesByDay: lifestyle.workoutMinutesByDay,
    kcalByDay: lifestyle.kcalByDay, kcalTarget: nhsTargets.calories, hrvByDay: lifestyle.hrvByDay,
  }) : [];

  const checkInWeek = Array.from({ length: 7 }, (_, i) => {
    const day = localDayKeyDaysAgo(6 - i);
    const c = checkIns[day];
    return {
      day,
      letter: new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }),
      sleep: c?.sleepHours ?? watchSleepByDay[day] ?? null,
      energy: c?.energy ?? null,
    };
  });
  const checkInInsight = sleepEnergyInsight(checkIns, watchSleepByDay);

  const hydrationReminders = {
    enabled: hydrationRemindersEnabled, intervalHours: hydrationIntervalHours, startHour: shiftStartHour, endHour: shiftEndHour,
    canRemind: Capacitor.isNativePlatform(), snoozedUntil: hydrationSnoozedUntil,
  };

  // App icon page: the icon shown large (tapped in the grid, else the one in use)
  const iconShownId = iconShown ?? appIcon;
  const iconShownInfo = appIconInfo(iconShownId);
  // Widgets page: today's numbers for the previews
  const widgetData: WidgetData = {
    waterMl: waterMlToday, waterGoalMl, glassMl, waterWeek: waterWeek(waterLog).map(d => d.ml),
    steps: isLiveHealthData ? liveSteps : null, stepsGoal: stepsQuestGoal,
    kcalLeft: Math.round(caloriesRemaining), kcalEaten: dailyConsumables.calories, kcalTarget: nhsTargets.calories,
    protein: dailyConsumables.protein, proteinTarget: nhsTargets.protein,
    questsDone: questsDoneCount, questsTotal: todayQuests.length, points: totalVoucherPoints, workoutsWeek: workoutsWeekCount,
    streak, energy: todayCheckIn?.energy ?? null, nextReminder: '',
  };

  // Account menu: grouped rows, each opening its own page; the value is a short summary of what's inside.
  const accountEmail = session?.user?.email || profile.email;
  const accountSections: { title: string; rows: { page: AccountPage; value?: string }[] }[] = [
    { title: 'Profile', rows: [
      { page: 'details' },
      { page: 'allergies', value: `${dietLabel(profile.diet)} · ${profile.personalAllergens.length ? `${profile.personalAllergens.length} ${profile.personalAllergens.length === 1 ? 'allergy' : 'allergies'}` : 'no allergies'}` }
    ] },
    { title: 'Devices & reminders', rows: [
      { page: 'devices', value: profile.smartDeviceConnected ? (healthSource ?? profile.smartDeviceConnected) : 'Not connected' },
      { page: 'reminders', value: hydrationRemindersEnabled ? `Every ${hydrationIntervalHours} h` : 'Off' }
    ] },
    { title: 'Subscription', rows: [
      { page: 'subscription', value: revenueCatStatus ?? undefined },
      { page: 'promo' }
    ] },
    { title: 'Help & legal', rows: [{ page: 'about' }, { page: 'privacy' }, { page: 'help' }] }
  ];

  // F. MAIN HOLLYWOOD HUD PLATFORM PORTAL SCREEN WITH GLASS SCI-FI OVERLAYS
  return (
    <div className="workspace-container">
      <div className="app-viewport-container">
        {/* --- DYNAMIC GLOWING ANNOUNCEMENT TICKER --- */}
        {motivationMessage && (
          <div key={motivationMessage.text} className={`alert-ticker tone-${motivationMessage.tone}`} role="status" aria-live="polite"
            onClick={() => setMotivationMessage(null)}
            onTouchStart={e => { messageTouchY.current = e.touches[0].clientY; }}
            onTouchMove={e => {
              // swipe up to dismiss
              if (messageTouchY.current !== null && e.touches[0].clientY - messageTouchY.current < -18) setMotivationMessage(null);
            }}>
            <span className="alert-ticker-icon"><MessageIcon tone={motivationMessage.tone} size={16} /></span>
            <span>{motivationMessage.text}</span>
            <span className="alert-ticker-timer" style={{ animationDuration: `${messageMs}ms` }} aria-hidden="true" />
          </div>
        )}

        {/* --- APP PORTAL BODY SCROLL AREA --- */}
        <div className="app-scroll-body">

          {/* Header Dashboard Branding */}
          <header className="app-brand-header kx-desktop-only">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="glowing-logo">
                <svg width="40" height="20" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h1 className="app-brand-title">KINETIX FIT</h1>
              </div>
            </div>
          </header>

          {(activeTab === 'nourish' || activeTab === 'rewards') && (
            <h1 className="kx-tab-title">{activeTab === 'nourish' ? 'Nourish' : 'Rewards'}</h1>
          )}

          {/* ==================== TAB 1: TODAY ==================== */}
          {activeTab === 'vitals' && (
            <div className="tab-fade-in vitals-dashboard-grid">
              <div className="vitals-left-panel">

              {/* Welcome banner */}
              <div className="vitals-hero-card">
                <TrackLanes />
                {getPersonalizedWelcome()}
                {streak.current > 0 && (
                  <div className="kx-hero-foot">
                    <div className="kx-lap" aria-label={`${streak.current}-day check-in streak`}>
                      <span className="kx-lap-num">{streak.current}</span>
                      <span className="kx-lap-label">day streak</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Hydration: the bottle fills with the glasses logged today; tap for the Hydration page */}
              <HydrationHero
                ml={waterMlToday}
                goalMl={waterGoalMl}
                glassMl={glassMl}
                reminders={hydrationReminders}
                onAddGlass={addGlass}
                onOpen={() => setShowHydration(true)}
              />

              {/* Connected, but Health Connect is empty — almost always a tracker app that isn't allowed to share yet */}
              {isLiveHealthData && healthDataState === 'no-data' && Capacitor.getPlatform() === 'android' && (
                <div className="hub-support-card kx-setup-card">
                  <span className="vitals-label">One more step</span>
                  <h3 className="card-header-title">
                    {isSamsungDevice() ? 'Let Samsung Health share your data' : 'Let your tracker app share its data'}
                  </h3>
                  <p className="card-header-desc">
                    {isSamsungDevice()
                      ? 'Kinetix Fit is connected to Health Connect, but nothing from Samsung Health has arrived yet. Samsung Health only shares activity recorded after you allow it — older days stay in Samsung Health.'
                      : 'Kinetix Fit is connected to Health Connect, but no app is sharing steps, heart rate or sleep with it yet.'}
                  </p>
                  <ol className="kx-steps">
                    <li>Tap <strong>Open Health Connect</strong>, then <strong>App permissions</strong>.</li>
                    <li>Choose <strong>{isSamsungDevice() ? 'Samsung Health' : 'the app that tracks your activity'}</strong> and turn on <strong>Allow all</strong>.</li>
                    <li>{isSamsungDevice()
                      ? <>Walk for a few minutes, then open Samsung Health and pull down on its home screen to sync. Come back here.</>
                      : 'Open that app once so it syncs, then come back here.'}</li>
                  </ol>
                  <div className="kx-setup-actions">
                    <button type="button" className="primary-btn" onClick={openHealthConnectSettings}>Open Health Connect</button>
                    <button type="button" className="edit-bio-btn" onClick={() => setForegroundTick(t => t + 1)}>Check again</button>
                  </div>
                </div>
              )}

              {/* iPhone: Apple Health never tells an app whether it may read, so "nothing arrived" usually means the
                  categories were left off in the permission sheet (or there's no data yet, e.g. no Apple Watch) */}
              {isLiveHealthData && healthDataState === 'no-data' && Capacitor.getPlatform() === 'ios' && (
                <div className="hub-support-card kx-setup-card">
                  <span className="vitals-label">One more step</span>
                  <h3 className="card-header-title">Let Kinetix Fit read Apple Health</h3>
                  <p className="card-header-desc">
                    Nothing has arrived from Apple Health yet. Apple doesn’t tell apps whether reading was allowed, so if you
                    skipped any categories when asked, they stay off until you turn them on.
                  </p>
                  <ol className="kx-steps">
                    <li>Tap <strong>Open Health</strong>, then your <strong>profile picture</strong> at the top right.</li>
                    <li>Under Privacy, tap <strong>Apps</strong>, then <strong>Kinetix Fit</strong>, and choose <strong>Turn On All</strong>.</li>
                    <li>Come back here. Your iPhone counts steps on its own; heart rate and sleep need an Apple Watch or another tracker.</li>
                  </ol>
                  <div className="kx-setup-actions">
                    <button type="button" className="primary-btn" onClick={openAppleHealth}>Open Health</button>
                    <button type="button" className="edit-bio-btn" onClick={() => setForegroundTick(t => t + 1)}>Check again</button>
                  </div>
                </div>
              )}

              {/* No heart rate has ever arrived: ask whether there's a watch at all, rather than leave cards "Waiting" */}
              {deviceMode === 'ask' && (
                <div className="hub-support-card kx-setup-card">
                  <span className="vitals-label">Tailor Today to you</span>
                  <h3 className="card-header-title">Do you wear a smartwatch or fitness band?</h3>
                  <p className="card-header-desc">
                    Your health data is connected, but no heart rate has arrived. Heart rate, sleep and stress need a watch
                    or band — if it's just your phone, Today will focus on what your phone tracks.
                  </p>
                  <div className="kx-setup-actions is-choice">
                    <button type="button" className="primary-btn" onClick={() => setWearableAnswer('yes')}>Yes, I wear one</button>
                    <button type="button" className="edit-bio-btn" onClick={() => setWearableAnswer('no')}>No, just my phone</button>
                  </div>
                </div>
              )}

              {/* Has a watch, but none of its readings reach Health Connect / Apple Health yet */}
              {waitingForWatch && (
                <div className="hub-support-card kx-setup-card">
                  <span className="vitals-label">Waiting for your watch</span>
                  <h3 className="card-header-title">No heart rate from your watch yet</h3>
                  <p className="card-header-desc">
                    {Capacitor.getPlatform() === 'ios'
                      ? 'Apple Watch readings reach Apple Health on their own once the watch has been worn for a while.'
                      : 'Watches send their readings through their own app (Samsung Health, Fitbit, Garmin Connect…), which has to be allowed to share with Health Connect.'}
                  </p>
                  <ol className="kx-steps">
                    {Capacitor.getPlatform() === 'ios' ? (
                      <>
                        <li>Wear your watch for a while so it records your heart rate.</li>
                        <li>In Health, tap your <strong>profile picture</strong> → <strong>Apps</strong> → <strong>Kinetix Fit</strong> and check <strong>Heart Rate</strong> and <strong>Sleep</strong> are on.</li>
                      </>
                    ) : (
                      <>
                        <li>Open your watch's app and let it sync.</li>
                        <li>In Health Connect → <strong>App permissions</strong>, choose that app and turn on <strong>Allow all</strong>.</li>
                      </>
                    )}
                  </ol>
                  <div className="kx-setup-actions">
                    <button type="button" className="primary-btn" onClick={openHealthSettings}>
                      {Capacitor.getPlatform() === 'ios' ? 'Open Health' : 'Open Health Connect'}
                    </button>
                    <button type="button" className="edit-bio-btn" onClick={() => setWearableAnswer('no')}>I don't wear one</button>
                  </div>
                </div>
              )}

              {/* Morning check-in: sleep (unless the watch recorded it) and energy, one tap each */}
              <div className="hub-support-card kx-checkin kx-checkin-daily">
                <div className="kx-card-head">
                  <h3 className="card-header-title">
                    <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-sleep)' }}><SleepIcon size={16} /></span>
                    {todayCheckIn && !editingCheckIn ? 'Today’s check-in' : new Date().getHours() < 12 ? 'Morning check-in' : 'Daily check-in'}
                  </h3>
                  {todayCheckIn && !editingCheckIn && (
                    <button type="button" className="kx-hs-remove" onClick={() => { setEditingCheckIn(true); setCheckInSleep(todayCheckIn.sleepHours); }}>Change</button>
                  )}
                </div>
                {todayCheckIn && !editingCheckIn ? (
                  <>
                    <div className="kx-checkin-done">
                      <div className="kx-checkin-stats">
                        <div className="kx-checkin-stat">
                          <strong>{todayCheckIn.sleepHours !== null ? sleepChoiceLabel(todayCheckIn.sleepHours).replace(' or less', ' h') : watchSleepHours !== null ? `${watchSleepHours} h` : '—'}</strong>
                          <span>{todayCheckIn.sleepHours !== null ? 'sleep' : 'sleep (watch)'}</span>
                        </div>
                        <div className="kx-checkin-stat">
                          <strong>{todayCheckIn.energy}<small style={{ fontSize: '0.55em', color: 'var(--ink-3)' }}>/5</small></strong>
                          <span>{ENERGY_LABELS[todayCheckIn.energy - 1].toLowerCase()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="kx-checkin-week" role="img" aria-label="Sleep and energy over the last 7 days">
                      {checkInWeek.map(d => (
                        <div key={d.day} className={`kx-checkin-day${d.day === todayDateKey ? ' is-today' : ''}`}>
                          <span className="kx-checkin-day-bar">{d.sleep !== null && <span style={{ height: `${Math.min(100, (d.sleep / 10) * 100)}%` }} />}</span>
                          <span className="kx-energy-pip" style={{ ['--e' as string]: d.energy ?? 0, opacity: d.energy ? 1 : 0.35 }} />
                          <span className="kx-checkin-day-label">{d.letter}</span>
                        </div>
                      ))}
                    </div>
                    <div className="kx-checkin-legend"><span><i />Sleep</span><span><i className="is-energy" />Energy</span></div>
                    <p className="kx-checkin-insight">
                      {checkInInsight
                        ? checkInInsight.rested > checkInInsight.short
                          ? `Your energy averages ${checkInInsight.rested}/5 after 7 hours or more of sleep, and ${checkInInsight.short}/5 after less.`
                          : `So far, sleep length hasn’t changed your energy much: ${checkInInsight.rested}/5 after 7 h+, ${checkInInsight.short}/5 after less.`
                        : 'Check in each morning — after a week you’ll see how your sleep and energy go together.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="kx-card-sub">Two taps. It stays on your phone.</p>
                    {watchSleepHours !== null ? (
                      <p className="kx-checkin-watch">Your watch recorded <strong>{watchSleepHours} h</strong> of sleep.</p>
                    ) : (
                      <>
                        <p className="kx-checkin-q">How long did you sleep?</p>
                        <div className="kx-checkin-choices" role="radiogroup" aria-label="Hours slept">
                          {SLEEP_CHOICES.map(h => (
                            <button key={h} type="button" role="radio" aria-checked={checkInSleep === h}
                              className={`kx-checkin-choice${checkInSleep === h ? ' is-on' : ''}`}
                              onClick={() => { hapticSelection(); setCheckInSleep(h); }}>
                              {h === SLEEP_CHOICES[0] ? `≤${h}` : h === SLEEP_CHOICES[SLEEP_CHOICES.length - 1] ? `${h}+` : h}
                              <small>hours</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {(watchSleepHours !== null || checkInSleep !== null) && (
                      <>
                        <p className="kx-checkin-q">How’s your energy?</p>
                        <div className="kx-checkin-choices is-energy" role="radiogroup" aria-label="Energy">
                          {ENERGY_LABELS.map((label, i) => (
                            <button key={label} type="button" role="radio" aria-checked={todayCheckIn?.energy === i + 1}
                              className="kx-checkin-choice" onClick={() => submitCheckIn(i + 1, watchSleepHours !== null ? null : checkInSleep)}>
                              <span className="kx-energy-pip" style={{ ['--e' as string]: i + 1 }} />
                              <small>{label}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Gut check-in: one tap a day (+ anything bothering it); after a week, the gut report with food ideas */}
              <div className="hub-support-card kx-checkin kx-gut">
                <div className="kx-card-head">
                  <h3 className="card-header-title">
                    <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><BowlIcon size={16} /></span>
                    {todayGut && !gutDraft ? 'Today’s gut check' : 'Gut check'}
                  </h3>
                  {todayGut && !gutDraft && (
                    <button type="button" className="kx-hs-remove" onClick={() => setGutDraft({ feel: todayGut.feel, symptoms: todayGut.symptoms })}>Change</button>
                  )}
                </div>
                {todayGut && !gutDraft && !gutForYesterday ? (
                  <>
                    <div className="kx-checkin-stats">
                      <div className="kx-checkin-stat">
                        <strong>{todayGut.feel}<small style={{ fontSize: '0.55em', color: 'var(--ink-3)' }}>/5</small></strong>
                        <span>{feelLabel(todayGut.feel).toLowerCase()}</span>
                      </div>
                      <div className="kx-checkin-stat">
                        <strong className="kx-gut-bother">{todayGut.symptoms.length ? todayGut.symptoms.map(symptomLabel).join(', ') : 'Nothing'}</strong>
                        <span>bothering you</span>
                      </div>
                    </div>
                    <div className="kx-checkin-week" role="img" aria-label="How your gut felt over the last 7 days">
                      {gutWeek.map(d => (
                        <div key={d.day} className={`kx-checkin-day${d.day === todayDateKey ? ' is-today' : ''}`}>
                          <span className="kx-energy-pip" style={{ ['--e' as string]: d.feel ?? 0, opacity: d.feel ? 1 : 0.35 }} />
                          <span className="kx-checkin-day-label">{d.letter}</span>
                        </div>
                      ))}
                    </div>
                    <p className="kx-checkin-insight">{reportProgressText(gutStatus)}</p>
                    {gutStatus.ready && (
                      <button type="button" className="primary-btn kx-gut-open" onClick={() => setShowGutReport(true)}>See your gut report</button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="kx-card-sub">
                      {gutForYesterday
                        ? <>For yesterday, all day. <button type="button" className="ob-link kx-gut-yesterday" onClick={() => { setGutDraft(null); setGutForYesterday(false); }}>Back to today</button></>
                        : new Date().getHours() < 17
                          ? `Best in the evening — it’s about your whole day.${gutReminderOn && Capacitor.isNativePlatform() ? ` We’ll remind you at ${formatHour(GUT_REMINDER_HOUR)}.` : ''}`
                          : 'One tap for today. It stays on your phone.'}
                    </p>
                    {!todayGut && !gutDraft && !gutForYesterday && canLogYesterdaysGut && (
                      <button type="button" className="ob-link kx-gut-yesterday" onClick={() => setGutForYesterday(true)}>Missed last night? Add yesterday’s</button>
                    )}
                    <p className="kx-checkin-q">
                      {gutForYesterday ? 'How was your gut yesterday?' : new Date().getHours() < 17 ? 'How’s your gut been today so far?' : 'How was your gut today?'}
                    </p>
                    <div className="kx-checkin-choices is-energy" role="radiogroup" aria-label="How your gut feels today">
                      {GUT_FEELS.map(f => (
                        <button key={f.value} type="button" role="radio" aria-checked={gutDraft?.feel === f.value}
                          className={`kx-checkin-choice${gutDraft?.feel === f.value ? ' is-on' : ''}`}
                          onClick={() => { hapticSelection(); setGutDraft(d => ({ feel: f.value, symptoms: d?.symptoms ?? [] })); }}>
                          <span className="kx-energy-pip" style={{ ['--e' as string]: f.value }} />
                          <small>{f.label}</small>
                        </button>
                      ))}
                    </div>
                    {gutDraft && (
                      <>
                        <p className="kx-checkin-q">Anything bothering it? <span className="kx-gut-optional">Optional</span></p>
                        <div className="kx-chip-wrap">
                          {SYMPTOMS.map(sym => {
                            const on = gutDraft.symptoms.includes(sym.id);
                            return (
                              <button key={sym.id} type="button" className={`kx-chip ${on ? 'kx-chip-on' : ''}`} aria-pressed={on}
                                onClick={() => setGutDraft(d => d && ({ ...d, symptoms: on ? d.symptoms.filter(x => x !== sym.id) : [...d.symptoms, sym.id] }))}>
                                {sym.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="kx-gut-actions">
                          <button type="button" className="primary-btn" onClick={saveGut}>{gutForYesterday ? 'Save for yesterday' : 'Save'}</button>
                          {(todayGut || gutForYesterday) && <button type="button" className="ob-link" onClick={() => { setGutDraft(null); setGutForYesterday(false); }}>Cancel</button>}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Movement breaks: offered once; afterwards the switch lives in Account → Reminders */}
              {Capacitor.isNativePlatform() && !moveEnabled && !movePromptDone && (
                <div className="hub-support-card kx-move-prompt">
                  <h3 className="card-header-title">
                    <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-steps)' }}><StepsIcon size={16} /></span>
                    Sitting a lot?
                  </h3>
                  <p className="card-header-desc">
                    {Capacitor.getPlatform() === 'android'
                      ? 'Get a nudge to stand up when you’ve been on your phone for an hour without moving. It uses your phone’s step counter, and nothing leaves your phone.'
                      : 'Get a reminder to stand up and move every hour during your active hours.'}
                  </p>
                  <div className="kx-setup-actions is-choice">
                    <button type="button" className="primary-btn" onClick={() => setMoveBreaks(true)}>Turn on</button>
                    <button type="button" className="edit-bio-btn" onClick={() => setMoveBreaks(false)}>Not now</button>
                  </div>
                </div>
              )}

              {/* 7-Day Health Trends — real device history, honest empty states when disconnected */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <BiometricTrendCard
                  icon={<StepsIcon />}
                  title="Steps"
                  status={stepsBio.status}
                  behavior={stepsBio.behavior}
                  latestReading={String(stepsBio.reading)}
                  subMetrics={stepsBio.details.subMetrics}
                  trend={stepsTrend}
                  unit=""
                  color="var(--m-steps)"
                  chartType="bar"
                  isTrackable={isLiveHealthData}
                  minPoints={1}
                  expanded={expandedTrendId === 'BIO-1'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-1' ? null : 'BIO-1')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
                {!phoneOnly && (
                <BiometricTrendCard
                  icon={<HeartIcon />}
                  title="Heart rate"
                  status={heartRateBio.status}
                  behavior={heartRateBio.behavior}
                  latestReading={String(heartRateBio.reading)}
                  subMetrics={heartRateBio.details.subMetrics}
                  trend={healthTrends.heartRate}
                  unit=" bpm"
                  color="var(--m-heart)"
                  chartType="line"
                  isTrackable={isLiveHealthData}
                  minPoints={1}
                  expanded={expandedTrendId === 'BIO-2'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-2' ? null : 'BIO-2')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
                )}
                {/* Some phones log sleep on their own (iPhone bedtime, Samsung Health's phone sleep): show it if it's there */}
                {(!phoneOnly || hasSleepData) && (
                <BiometricTrendCard
                  icon={<SleepIcon />}
                  title="Sleep"
                  status={sleepBio.status}
                  behavior={sleepBio.behavior}
                  latestReading={String(sleepBio.reading)}
                  subMetrics={sleepBio.details.subMetrics}
                  trend={healthTrends.sleep}
                  unit=""
                  format={formatMinutesAsHoursMinutes}
                  axisFormat={m => `${Math.round(m / 60)}h`}
                  yTicks={sleepTicks}
                  color="var(--m-sleep)"
                  chartType="bar"
                  isTrackable={isLiveHealthData}
                  minPoints={1}
                  expanded={expandedTrendId === 'BIO-4'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-4' ? null : 'BIO-4')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
                )}
                {!noHrvFromSource && !phoneOnly && (
                  <BiometricTrendCard
                    icon={<StressIcon />}
                    title="Stress"
                    status={stressBio.status}
                    behavior={stressBio.behavior}
                    latestReading={String(stressBio.reading)}
                    subMetrics={stressBio.details.subMetrics}
                    trend={healthTrends.stress}
                    unit=" ms HRV"
                    color="var(--m-stress)"
                    chartType="line"
                    isTrackable={isLiveHealthData || hasStressHistory}
                    buildingMessage="Building your trend — check back in a few days."
                    minPoints={2}
                    trendFootnote="Estimated from your HRV — higher HRV generally means lower stress. This app has no way to directly measure stress hormones."
                    expanded={expandedTrendId === 'BIO-5'}
                    onToggle={() => setExpandedTrendId(prev => prev === 'BIO-5' ? null : 'BIO-5')}
                    rangeDays={trendRangeDays}
                    onRangeChange={setTrendRangeDays}
                  />
                )}
              </div>

              {/* Body and vitals: blood oxygen, blood pressure, weight… — only what the device shares. Phone-only people are
                  asked too (distance, calories and weight need no watch), then see it once there's a reading */}
              {isLiveHealthData && Capacitor.isNativePlatform() && (vitalsTiles.length > 0 || moreHealth === 'needs-access' || (!phoneOnly && deviceMode === 'watch')) && (
                <VitalsCard tiles={vitalsTiles} needsAccess={moreHealth === 'needs-access'} source={healthSource} phoneOnly={phoneOnly}
                  platform={Capacitor.getPlatform() as 'ios' | 'android' | 'web'} onAllow={allowMoreHealth} />
              )}

              </div> {/* End Left Panel */}

              <div className="vitals-right-panel">
              {/* Workouts: recorded by the watch/phone (count for quests) and any added by hand (don't; tap to change) */}
              <div className="ecg-module-card kx-workouts">
                <div className="kx-card-head">
                  <h3 className="ecg-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><DumbbellIcon size={16} /></span>Workouts</h3>
                  {workoutsThisWeek > 0 && <span className="kx-count">{workoutsThisWeek} this week</span>}
                </div>
                <p className="kx-card-sub">
                  {!isLiveHealthData
                    ? 'Connect a device and the workouts your watch or phone records show up here on their own.'
                    : workoutsAccess === 'needs-access'
                      ? `Let Kinetix Fit read the workouts ${healthSource ?? profile.smartDeviceConnected} records — they count towards your quests.`
                      : `From ${healthSource ?? profile.smartDeviceConnected}. Recorded workouts count towards your quests.`}
                </p>
                {(todaysDetected.length > 0 || manualToday.length > 0) ? (
                  <ul className="kx-workout-list">
                    {todaysDetected.map(w => (
                      <li key={w.id} className="kx-workout-row">
                        <span className="kx-workout-icon">{workoutIcon(w.label)}</span>
                        <span><span className="kx-workout-name">{w.label}</span><span className="kx-workout-meta">{workoutMeta(w)}</span></span>
                        <span className="kx-workout-tag">Counts</span>
                      </li>
                    ))}
                    {manualToday.map(w => (
                      <li key={w.id}>
                        <button type="button" className="kx-workout-row is-manual is-button" onClick={() => openWorkoutSheet(w)} aria-label={`${manualLabel(w)} — change or delete`}>
                          <span className="kx-workout-icon">{workoutIcon(w.type)}</span>
                          <span><span className="kx-workout-name">{w.type}</span><span className="kx-workout-meta">{[formatMinutes(w.minutes), w.note].filter(Boolean).join(' · ')}</span></span>
                          <span className="kx-workout-tag">Added by you</span>
                          <ChevronIcon className="kx-workout-chevron" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="kx-empty">
                    <span className="kx-empty-icon"><DumbbellIcon size={20} /></span>
                    <p>{isLiveHealthData && workoutsAccess === 'ok'
                      ? 'No workouts yet today. Start one on your watch or in your fitness app and it appears here.'
                      : 'No workouts today yet.'}</p>
                  </div>
                )}
                {earlierWorkouts.length > 0 && (
                  <>
                    <p className="kx-workouts-earlier">Earlier this week</p>
                    <ul className="kx-workout-list">
                      {earlierWorkouts.slice(0, 3).map(item => item.kind === 'detected' ? (
                        <li key={item.w.id} className="kx-workout-row">
                          <span className="kx-workout-icon">{workoutIcon(item.w.label)}</span>
                          <span><span className="kx-workout-name">{item.w.label}</span><span className="kx-workout-meta">{fmtDate(new Date(item.w.start), { weekday: 'short' })} · {workoutMeta(item.w)}</span></span>
                          <span className="kx-workout-tag">Counted</span>
                        </li>
                      ) : (
                        <li key={item.w.id}>
                          <button type="button" className="kx-workout-row is-manual is-button" onClick={() => openWorkoutSheet(item.w)} aria-label={`${manualLabel(item.w)} — change or delete`}>
                            <span className="kx-workout-icon">{workoutIcon(item.w.type)}</span>
                            <span>
                              <span className="kx-workout-name">{item.w.type}</span>
                              <span className="kx-workout-meta">{fmtDate(new Date(`${item.w.day}T12:00:00`), { weekday: 'short' })} · {formatMinutes(item.w.minutes)}</span>
                            </span>
                            <span className="kx-workout-tag">Added by you</span>
                            <ChevronIcon className="kx-workout-chevron" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="kx-workouts-actions">
                  {isLiveHealthData && workoutsAccess === 'needs-access' && (
                    <button type="button" className="primary-btn" onClick={allowWorkouts}>Show workouts</button>
                  )}
                  <button type="button" className="edit-bio-btn" onClick={() => openWorkoutSheet(null)}>Add a workout</button>
                  {hasAnyWorkout && (
                    <button type="button" className="edit-bio-btn" onClick={() => setShowWorkoutHistory(true)}>See all</button>
                  )}
                </div>
              </div>

                {profile.sex === 'female' && (
                  <CycleCard periods={periods} typicalLength={profile.averageCycleLength} context={cycleNotes} onLog={logPeriod} onRemove={removePeriodDay} />
                )}
                {sexCard && profile.sex === 'male' && isLiveHealthData && !noHrvFromSource && !phoneOnly && (
                  <div className="biometric-item-card">
                    <div className="bio-card-header">
                      <span className="bio-system-label">{sexCard.system}</span>
                      {isLiveHealthData && (
                        <span className={`bio-status-badge status-${sexCard.status.toLowerCase()}`}>
                          {sexCard.status}
                        </span>
                      )}
                    </div>
                    <h4 className="bio-metric-title">{sexCard.metric}</h4>
                    <p className="bio-metric-reading">{sexCard.reading}</p>
                    <span className="bio-behavior-log">{sexCard.behavior}</span>
                  </div>
                )}

              <div className="kx-fab-clearance" aria-hidden="true" />
              </div> {/* End Right Panel */}
            </div>
          )}

          <HydrationSheet
            open={showHydration}
            onClose={() => setShowHydration(false)}
            log={waterLog}
            goalMl={waterGoalMl}
            glassMl={glassMl}
            reminders={hydrationReminders}
            onAddGlass={addGlass}
            onRemoveGlass={removeGlass}
            onGoalChange={changeWaterGoal}
            onGlassChange={changeGlassSize}
            onToggleReminders={setWaterReminders}
            onOpenReminderSettings={() => { setShowHydration(false); openRemindersPage(); }}
          />

          <FoodEntrySheet
            entry={foodSheet?.entry ?? null}
            mode={foodSheet?.mode ?? 'edit'}
            units={foodSheet ? savedFoods[foodSheet.entry.foodKey]?.units ?? [] : []}
            onSave={saveFoodEntry}
            onRemove={removeFoodEntry}
            onLogAgain={foodSheet && foodSheet.mode === 'edit' && foodSheet.day !== todayDateKey ? logEntryAgain : undefined}
            onClose={() => setFoodSheet(null)}
          />

          {scanFx && <ScanProgress kind={scanFx.kind} phase={scanFx.phase} doneLabel={scanFx.label} onDone={endScanFx} />}

          <FoodHistorySheet
            open={showFoodHistory}
            days={foodDays}
            mainTargets={nutrientTargets}
            moreTargets={extraNutrientTargets}
            onOpenEntry={(day, id) => openFoodEntry(id, day)}
            onClose={() => setShowFoodHistory(false)}
          />

          <Sheet open={showGutReport} title="Your gut week" onClose={() => setShowGutReport(false)}>
            {gutReport && (
              <div className="kx-gut-report">
                <div className="kx-gut-head">
                  <h4>{gutReport.headline}</h4>
                  <p>
                    {gutReport.checkIns} check-ins{gutReport.avgFeel !== null ? ` · average ${fmtNumber(gutReport.avgFeel, 1)}/5` : ''}
                    {` · ${gutReport.goodDays} good ${gutReport.goodDays === 1 ? 'day' : 'days'}`}
                  </p>
                </div>

                {gutReport.symptoms.length > 0 && (
                  <section>
                    <h5>What bothered you</h5>
                    <div className="kx-chip-wrap">
                      {gutReport.symptoms.map(sym => <span key={sym.id} className="kx-chip is-static">{sym.label} · {sym.days} {sym.days === 1 ? 'day' : 'days'}</span>)}
                    </div>
                  </section>
                )}

                <section>
                  <h5>What you ate</h5>
                  <div className="kx-gut-stats">
                    <div><strong>{gutReport.fibreAvg !== null ? `${fmtNumber(gutReport.fibreAvg, 0)} g` : '—'}</strong><span>fibre a day{gutReport.fibreAvg !== null ? ` (goal ${gutReport.fibreTarget} g)` : ''}</span></div>
                    <div><strong>{gutReport.plants.length}</strong><span>different plants (aim for {PLANTS_GOAL})</span></div>
                    <div><strong>{gutReport.fermentedDays}</strong><span>{gutReport.fermentedDays === 1 ? 'day' : 'days'} with fermented food</span></div>
                    <div><strong>{gutReport.waterAvgMl !== null ? waterAmount(gutReport.waterAvgMl) : '—'}</strong><span>water a day</span></div>
                  </div>
                  <p className="kx-gut-note">From {gutReport.foodDaysLogged} of 7 days with food logged.</p>
                </section>

                <section>
                  <h5>Foods to try{isVegetarian(profile.diet) ? ' · vegetarian' : ''}</h5>
                  {gutReport.suggestions.length > 0 ? (
                    <ul className="kx-gut-list">
                      {gutReport.suggestions.map(sg => <li key={sg.food.id}><strong>{sg.food.name}</strong><span>{sg.reason}</span></li>)}
                    </ul>
                  ) : (
                    <p className="kx-gut-note">Nothing stands out this week — keep doing what you’re doing.</p>
                  )}
                </section>

                {gutReport.goEasy.length > 0 && (
                  <section>
                    <h5>Maybe go easy on</h5>
                    <ul className="kx-gut-list is-easy">
                      {gutReport.goEasy.map(g => <li key={g.name}><strong>{g.name}</strong><span>{g.reason}</span></li>)}
                    </ul>
                  </section>
                )}

                {gutReport.patterns.length > 0 && (
                  <section>
                    <h5>What went with better days</h5>
                    <ul className="kx-gut-tips">{gutReport.patterns.map(t => <li key={t}>{t}</li>)}</ul>
                    <p className="kx-gut-note">From your last two weeks. Patterns, not proof — they can be coincidence, so try one change at a time.</p>
                  </section>
                )}

                {gutReport.tips.length > 0 && (
                  <section>
                    <h5>Tips</h5>
                    <ul className="kx-gut-tips">{gutReport.tips.map(t => <li key={t}>{t}</li>)}</ul>
                  </section>
                )}

                <p className={`kx-gut-doctor${gutReport.seeDoctor ? ' is-strong' : ''}`}>
                  {gutReport.seeDoctor ? 'Your gut has troubled you on most days this week. ' : ''}
                  See a doctor if changes in your gut last 3 weeks or more, or if you notice blood in your poo, weight loss you can’t explain or severe pain.
                </p>
                <p className="kx-gut-note">General food ideas, not medical advice. Your gut check-ins stay on your phone.</p>
              </div>
            )}
          </Sheet>

          <WorkoutHistorySheet
            open={showWorkoutHistory}
            manual={manualWorkouts}
            detected={detectedWorkouts}
            icon={workoutIcon}
            detectedMeta={w => `${fmtDate(new Date(w.start), { weekday: 'short' })} · ${workoutMeta(w)}`}
            onEdit={w => openWorkoutSheet(w)}
            onAdd={() => openWorkoutSheet(null)}
            onClose={() => setShowWorkoutHistory(false)}
          />
          <WorkoutSheet
            key={workoutSheet.key}
            open={workoutSheet.open}
            editing={workoutSheet.editing}
            onSave={saveWorkout}
            onDelete={deleteWorkout}
            onClose={closeWorkoutSheet}
          />

          {/* ==================== TAB 2: NOURISH (QUANTUM SPECTRAL SCANNERS) ==================== */}
          {activeTab === 'nourish' && (
            <div className="tab-fade-in kx-nourish-grid">

              {/* Daily macro counters */}
              <div className="nourish-summary-card">
                <span className="vitals-label">Today · your targets</span>
                <h3 className="nourish-calories-remaining" style={{ color: caloriesRemaining > 0 ? 'var(--ink)' : 'var(--danger)' }}>
                  {fmtNumber(Math.abs(caloriesRemaining))}
                  <span className="kx-unit">{caloriesRemaining > 0 ? 'kcal left' : 'kcal over'}</span>
                </h3>
                <p className="kx-nourish-eaten">{fmtNumber(dailyConsumables.calories)} of {fmtNumber(nhsTargets.calories)} kcal eaten · {foodLog.length} {foodLog.length === 1 ? 'food' : 'foods'}</p>

                {/* Needed vs eaten, from today's food log */}
                <NutritionMeters
                  targets={showAllNutrients ? [...nutrientTargets.slice(1), ...extraNutrientTargets] : nutrientTargets.slice(1)}
                  totals={todayTotals}
                  entries={foodLog}
                />
                <button type="button" className="ob-link kx-fh-more" onClick={() => setShowAllNutrients(v => !v)} aria-expanded={showAllNutrients}>
                  {showAllNutrients ? 'Show less' : 'Show more'}
                </button>
              </div>

              {/* Today's food: every entry, tap to change the amount or remove it */}
              <div className="scanner-module-card kx-foodlog">
                <div className="kx-card-head">
                  <h3 className="card-header-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--warn)' }}><BowlIcon size={16} /></span>Today’s food</h3>
                  <button type="button" className="kx-foodlog-history" onClick={() => setShowFoodHistory(true)}>History</button>
                </div>
                {foodLog.length === 0 ? (
                  <p className="kx-card-sub">Nothing yet. Check a food below and it’s added here — tap it to change how much you had.</p>
                ) : (
                  <ul className="kx-foodlog-list">
                    {[...foodLog].reverse().map(e => (
                      <li key={e.id}>
                        <button type="button" className="kx-foodlog-row" onClick={() => openFoodEntry(e.id)} aria-label={`${e.name}, ${portionText(e)}. Change or remove`}>
                          <span className="kx-foodlog-name">
                            <strong>{foodTitle(e.name)}</strong>
                            <small>
                              {fmtTime(new Date(e.at))} · {portionText(e)}
                              {e.amountGuess ? <span className="kx-guess"> · a guess</span> : e.estimated ? ' · estimate' : ''}
                              {e.extras?.length ? ` · + ${extrasText(e)}` : ''}
                            </small>
                            {e.meal && <small>{e.meal.name}</small>}
                            {e.note && <small className="kx-foodlog-note">{e.note}</small>}
                          </span>
                          <span className="kx-foodlog-kcal">{fmtNumber(Math.round(entryNutrients(e).kcal))}<small> kcal</small></span>
                          <ChevronIcon className="kx-row-chevron" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Next meal: ranked on the phone for everyone (src/lib/mealIdeas.ts), three at a time; Plus can also ask the AI
                  for nine (api/suggest-meals.js), shown three at a time too. "Not for me" hides a ranked idea for good. */}
              <div className="scanner-module-card kx-ai-meals">
                <h3 className="card-header-title">
                  <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><BowlIcon size={16} /></span>
                  Ideas for your {currentMealSlot()}
                </h3>
                <p className="kx-card-sub">
                  {caloriesRemaining > 0
                    ? `For what’s left today: ${fmtNumber(Math.round(caloriesRemaining))} kcal, ${fmtNumber(Math.max(0, nhsTargets.protein - dailyConsumables.protein))} g protein and ${fmtNumber(Math.max(0, nhsTargets.fiber - dailyConsumables.fiber))} g fibre to go.`
                    : 'You’ve had today’s calories — these are the lighter options.'}
                </p>
                <div className="kx-ideas-switch" role="radiogroup" aria-label="Where the ideas come from">
                  <button type="button" role="radio" aria-checked={ideasSource === 'foods'} className={ideasSource === 'foods' ? 'is-on' : undefined}
                    onClick={() => { hapticSelection(); setIdeasSource('foods'); }}>Ranked for you</button>
                  <button type="button" role="radio" aria-checked={ideasSource === 'ai'} className={ideasSource === 'ai' ? 'is-on' : undefined}
                    onClick={() => { hapticSelection(); setIdeasSource('ai'); }}>AI ideas <span className="kx-plus-pill">Plus</span></button>
                </div>

                {ideasSource === 'foods' && (rankedMeals.length === 0 ? (
                  <div className="kx-empty">
                    <span className="kx-empty-icon"><BowlIcon size={20} /></span>
                    <p>{hiddenMeals.length ? 'No ideas left for this meal — you’ve hidden the rest.' : 'No ideas fit your diet and allergies for this meal.'}</p>
                    {hiddenMeals.length > 0 && (
                      <button type="button" className="ob-link" onClick={() => { setHiddenMeals(unhideAllMeals()); setIdeasPage(0); }}>Show hidden ideas again</button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="kx-ai-list" key={`foods-${ideasPage}`}>
                      {pageOf(rankedMeals, ideasPage).map((r, i) => {
                        const eaten = eatenIdeaNames.includes(r.meal.name);
                        return (
                          <article key={r.meal.id} className="kx-ai-meal" style={{ animationDelay: `${i * 70}ms` }}>
                            <div className="kx-ai-meal-top">
                              <h4>{r.meal.name}</h4>
                              <span className="kx-ai-kcal">{fmtNumber(Math.round(r.n.kcal))}<small> kcal</small></span>
                            </div>
                            <p className="kx-ai-desc">{r.meal.portion}</p>
                            <p className="kx-ai-why">{r.why}</p>
                            <div className="kx-meal-meta">
                              <span>{Math.round(r.n.protein)}g protein</span><span>{Math.round(r.n.carbs)}g carbs</span><span>{Math.round(r.n.fiber)}g fibre</span><span>{r.meal.prepMinutes} min</span>
                            </div>
                            <div className="kx-ai-actions">
                              <button type="button" className={`kx-ai-ate${eaten ? ' is-done' : ''}`} disabled={eaten} onClick={() => logRankedMeal(r)}>
                                {eaten ? 'Logged' : 'I ate this'}
                              </button>
                              <button type="button" className="kx-ai-hide" onClick={() => hideRankedMeal(r)}>Not for me</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="kx-ai-foot">
                      <span>
                        {(() => {
                          const p = ((ideasPage % pageCount(rankedMeals)) + pageCount(rankedMeals)) % pageCount(rankedMeals);
                          return `${p * PAGE_SIZE + 1}–${Math.min(rankedMeals.length, (p + 1) * PAGE_SIZE)} of ${rankedMeals.length} · nutrition from USDA data`;
                        })()}
                      </span>
                      <button type="button" className="ob-link" onClick={() => { hapticSelection(); setIdeasPage(p => p + 1); }}>
                        {(((ideasPage + 1) % pageCount(rankedMeals)) === 0 && pageCount(rankedMeals) > 1) ? 'Back to the best' : 'Show 3 more'}
                      </button>
                    </div>
                  </>
                ))}

                {ideasSource === 'ai' && !isPlus && (
                  <button type="button" className="kx-ai-upsell" onClick={openPlusPage}>
                    <strong>Personal AI meal ideas</strong>
                    <span>Plus asks our AI for nine ideas built from your goal, BMI and everything you’ve eaten and done today — three at a time.</span>
                  </button>
                )}

                {ideasSource === 'ai' && isPlus && isLoadingMealIdeas && (
                  <div className="kx-ai-loading" aria-live="polite">
                    <p className="card-header-desc">Looking at your day…</p>
                    {[0, 1, 2].map(i => <div key={i} className="kx-ai-skeleton" style={{ animationDelay: `${i * 120}ms` }} />)}
                  </div>
                )}

                {ideasSource === 'ai' && isPlus && !isLoadingMealIdeas && mealIdeasError && (
                  <div className="kx-ai-error" role="alert">
                    <p className="card-header-desc">{mealIdeasError}</p>
                    <div className="kx-wg-add-row">
                      <button type="button" className="edit-bio-btn" onClick={requestMealIdeas}>Try again</button>
                      <button type="button" className="edit-bio-btn" onClick={() => setIdeasSource('foods')}>See ranked ideas</button>
                    </div>
                  </div>
                )}

                {ideasSource === 'ai' && isPlus && !isLoadingMealIdeas && !mealIdeasError && !mealIdeas && (
                  <>
                    <p className="card-header-desc">
                      Nine ideas for your {currentMealSlot()}, built from your goal, BMI, what you’ve eaten and how active you’ve been today — with your allergens left out.
                    </p>
                    <button type="button" className="primary-btn" onClick={requestMealIdeas}>Suggest my {currentMealSlot()}</button>
                  </>
                )}

                {ideasSource === 'ai' && isPlus && !isLoadingMealIdeas && !mealIdeasError && mealIdeas && (
                  <>
                    <p className="kx-ai-headline">{mealIdeas.headline}</p>
                    <div className="kx-ai-list" key={`ai-${aiPage}`}>
                      {pageOf(mealIdeas.suggestions, aiPage).map((idea, i) => {
                        const eaten = eatenIdeaNames.includes(idea.name);
                        return (
                          <article key={idea.name} className="kx-ai-meal" style={{ animationDelay: `${i * 90}ms` }}>
                            <div className="kx-ai-meal-top">
                              <h4>{idea.name}</h4>
                              <span className="kx-ai-kcal">{idea.calories}<small> kcal</small></span>
                            </div>
                            <p className="kx-ai-desc">{idea.description}</p>
                            <p className="kx-ai-why">{idea.why}</p>
                            <div className="kx-meal-meta">
                              <span>{idea.protein}g protein</span><span>{idea.carbs}g carbs</span><span>{idea.fibre}g fibre</span><span>{idea.prepMinutes} min</span>
                            </div>
                            <div className="kx-ai-actions">
                              <button type="button" className={`kx-ai-ate${eaten ? ' is-done' : ''}`} disabled={eaten} onClick={() => logMealIdea(idea)}>
                                {eaten ? 'Logged' : 'I ate this'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="kx-ai-foot">
                      <span>
                        {`${(aiPage % pageCount(mealIdeas.suggestions)) * PAGE_SIZE + 1}–${Math.min(mealIdeas.suggestions.length, ((aiPage % pageCount(mealIdeas.suggestions)) + 1) * PAGE_SIZE)} of ${mealIdeas.suggestions.length}`}
                        {' · estimates, not medical advice'}
                        {typeof mealIdeas.ideasLeft === 'number' ? ` · ${mealIdeas.ideasLeft} more sets today` : ''}
                      </span>
                      {aiPage + 1 < pageCount(mealIdeas.suggestions) ? (
                        <button type="button" className="ob-link" onClick={() => { hapticSelection(); setAiPage(p => p + 1); }}>Show 3 more</button>
                      ) : (
                        <button type="button" className="ob-link" onClick={requestMealIdeas} disabled={mealIdeas.ideasLeft === 0}>New ideas</button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Food check: search, one-tap suggestions, barcode/photo, and a readable result */}
              <div className="scanner-module-card kx-food-card">
                <h3 className="card-header-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--accent)' }}><CameraIcon size={16} /></span>Check a food</h3>
                <p className="kx-card-sub">Nutrition and allergens for anything you eat — checked against yours.</p>

                <form className="kx-search" role="search" onSubmit={(e) => { e.preventDefault(); if (!isScanLoading) handleMealScan(); }}>
                  <span className="kx-search-icon" aria-hidden="true"><SearchIcon size={18} /></span>
                  <input
                    type="search"
                    placeholder="Search a food"
                    aria-label="Food to check"
                    value={mealInput}
                    onChange={(e) => setMealInput(e.target.value)}
                    className="kx-search-input"
                    enterKeyHint="search"
                    autoCapitalize="none"
                    autoCorrect="on"
                  />
                  {mealInput.trim() && (
                    <button type="submit" disabled={isScanLoading} className="kx-search-go">
                      {isScanLoading ? 'Checking…' : 'Check'}
                    </button>
                  )}
                </form>

                {typedMatches.length > 0 && (
                  <div className="kx-food-matches" aria-label="Your foods">
                    {typedMatches.map(f => (
                      <button key={f.key} type="button" className="kx-food-match" onClick={() => { setMealInput(''); openSavedFood(f); }}>
                        <span><strong>{foodTitle(f.name)}</strong><small>{portionText({ ...lastPortion(f), eaten: 1, gramsKnown: f.gramsKnown })} last time</small></span>
                        <span className="kx-food-match-add">Add</span>
                      </button>
                    ))}
                  </div>
                )}

                {recent.length > 0 ? (
                  <div className="kx-food-suggest" aria-label="Your recent foods">
                    <span>Again</span>
                    {recent.map(f => (
                      <button key={f.key} type="button" className="kx-chip kx-chip-sm" onClick={() => openSavedFood(f)}>{foodTitle(f.name)}</button>
                    ))}
                  </div>
                ) : (
                  <div className="kx-food-suggest" aria-label="Try one">
                    <span>Try</span>
                    {FOOD_SUGGESTIONS.map(food => (
                      <button key={food} type="button" className="kx-chip kx-chip-sm" disabled={isScanLoading}
                        onClick={() => { setMealInput(food); handleMealScan(food); }}>
                        {food}
                      </button>
                    ))}
                  </div>
                )}

                <div className="kx-food-actions">
                  <button type="button" className="kx-food-action" onClick={() => { setShowCameraModal(true); handleBarcodeScan(); }}>
                    <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--info)' }}><BarcodeIcon size={16} /></span>
                    <span><strong>Scan a barcode</strong><small>Packaged food</small></span>
                  </button>
                  <button type="button" className="kx-food-action" onClick={() => setShowCameraModal(true)}>
                    <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><CameraIcon size={16} /></span>
                    <span><strong>Photo of a meal</strong><small>Home-cooked or eating out</small></span>
                  </button>
                </div>

                {scanResult?.meal ? (
                  <MealResultCard
                    card={scanResult.meal}
                    entries={scanResult.meal.entryIds.map(id => foodLog.find(e => e.id === id)).filter((e): e is LogEntry => !!e)}
                    recommendation={scanResult.dietaryRecommendation}
                    onOpen={id => openFoodEntry(id)}
                    onConfirm={confirmMealFood}
                    onChoose={chooseMealFood}
                    onSkip={skipMealFood}
                    onTypeIt={typeMealFood}
                  />
                ) : scanResult && (() => {
                  // a logged food follows its entry, so changing the amount updates this card too
                  const entry = scanResult.entryId ? foodLog.find(e => e.id === scanResult.entryId) : undefined;
                  const n = entry ? entryNutrients(entry) : scanResult.nutrients;
                  const hazard = scanResult.complianceStatus === 'HAZARD_DETECTED';
                  return (
                    <div className={`kx-food-result ${hazard ? 'is-warning' : 'is-clear'}`} aria-live="polite">
                      <span className="kx-food-status">
                        {hazard ? `Contains ${allergyList(scanResult.allergensFlagged)}` : profile.personalAllergens.length ? 'None of your allergens' : 'Checked'}
                      </span>
                      <div className="kx-food-title">
                        <h4>{scanResult.foodName}</h4>
                        <span className="kx-food-portion">
                          {entry ? portionText(entry) : scanResult.portion}
                          {entry?.amountGuess ? <span className="kx-guess">, a guess — check the amount</span> : scanResult.estimated ? ', estimated' : ''}
                        </span>
                      </div>
                      <p className="kx-food-kcal"><strong>{fmtNumber(Math.round(n.kcal))}</strong> kcal</p>
                      <div className="kx-food-macros">
                        <span><strong>{Math.round(n.carbs)}g</strong>carbs</span>
                        <span><strong>{Math.round(n.protein)}g</strong>protein</span>
                        <span><strong>{Math.round(n.fiber)}g</strong>fibre</span>
                        <span><strong>{Math.round(n.fat)}g</strong>fat</span>
                      </div>
                      {scanResult.source && <p className="kx-food-source">Nutrition from {scanResult.source}</p>}
                      {scanResult.dietNote && <p className="kx-food-diet-note">{scanResult.dietNote}</p>}
                      {!hazard && scanResult.labelAllergens && scanResult.labelAllergens.length > 0 && (
                        <p className="kx-food-label-allergens">Label lists: {scanResult.labelAllergens.map(a => allergenLabel(a)).join(', ')}</p>
                      )}
                      {entry && (
                        <>
                          {entry.note && <p className="kx-food-note-text">“{entry.note}”</p>}
                          <div className="kx-food-extras">
                            <span>Added anything?</span>
                            <ExtrasPicker entry={entry} onChange={(id, dir) => updateFoodDay(todayDateKey, prev => prev.map(e => (e.id === entry.id ? withExtra(e, id, dir) : e)))} />
                          </div>
                          <button type="button" className="secondary-btn kx-food-amount" onClick={() => openFoodEntry(entry.id)}>
                            Change amount or add a note
                          </button>
                        </>
                      )}
                      <dl className="kx-food-minerals">
                        <div><dt>Sodium</dt><dd>{Math.round(n.sodiumMg)}mg</dd></div>
                        <div><dt>Potassium</dt><dd>{Math.round(n.potassiumMg)}mg</dd></div>
                        <div><dt>Iron</dt><dd>{n.ironMg.toFixed(1)}mg</dd></div>
                        <div><dt>Calcium</dt><dd>{Math.round(n.calciumMg)}mg</dd></div>
                      </dl>
                      <div className="kx-food-note">
                        <strong>What this means for you</strong>
                        <p>{scanResult.dietaryRecommendation}</p>
                      </div>
                      <p className="kx-food-logged">
                        {hazard ? 'Not added to today — it has one of your allergens.'
                          : scanResult.fromSaved ? 'Added to today — worked out on your phone, no scan used.' : 'Added to today’s food above.'}
                      </p>
                    </div>
                  );
                })()}
              </div>

            </div>
          )}

          {/* ==================== TAB 3: REWARDS — points, quests, achievements, vouchers, charity ==================== */}
          {activeTab === 'rewards' && (
            <div className="tab-fade-in vitals-dashboard-grid">

              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                {/* Bio Athlete Holographic Status Card */}
                <div className="vitals-hero-card kx-profile-hero">
                  <TrackLanes />
                  <div>
                    <span className="kx-hero-eyebrow">Level {level}</span>
                    <h2 className="kx-hero-greeting">{profile.name || 'Your progress'}</h2>
                    <div className="kx-level-track" role="progressbar" aria-label={`Level ${level} progress`} aria-valuemin={0} aria-valuemax={LEVEL_XP} aria-valuenow={xpIntoLevel}>
                      <span style={{ ['--fill' as string]: xpIntoLevel / LEVEL_XP }} />
                    </div>
                    <p className="kx-hero-status">{fmtNumber(LEVEL_XP - xpIntoLevel)} XP to level {level + 1}</p>
                  </div>
                  <div className="kx-hero-foot">
                    {streak.current === 0 && detectedTotal === 0 ? (
                      <p className="kx-hero-status">Check in each day to build a streak.</p>
                    ) : (
                      <div className="kx-stat-row">
                        <div className="kx-lap"><span className="kx-lap-num">{streak.current}</span><span className="kx-lap-label">day streak</span></div>
                        <div className="kx-lap"><span className="kx-lap-num">{detectedTotal}</span><span className="kx-lap-label">workouts</span></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Smart Point balances Tracker */}
                <div className="rewards-summary-card">
                  <span className="vitals-label">Your points</span>
                  <h3 className="rewards-wallet-balance">{fmtNumber(totalVoucherPoints)}<span className="kx-unit">pts</span></h3>
                  <div className="kx-progress" role="progressbar" aria-label="Points towards a charity donation" aria-valuemin={0} aria-valuemax={CHARITY_DONATION_POINTS} aria-valuenow={Math.min(totalVoucherPoints, CHARITY_DONATION_POINTS)}>
                    <span style={{ ['--fill' as string]: Math.min(1, totalVoucherPoints / CHARITY_DONATION_POINTS) }} />
                  </div>
                  <p className="kx-card-sub" style={{ marginTop: '10px' }}>
                    {!country.donationsLive
                      ? `Charity donations in ${country.name} are coming soon — keep earning, your points are saved.`
                      : totalVoucherPoints >= CHARITY_DONATION_POINTS
                        ? `Enough to give ${fmtMoney(country.donationAmount)} to a charity — see Give to charity below.`
                        : `${fmtNumber(CHARITY_DONATION_POINTS - totalVoucherPoints)} pts until you can give ${fmtMoney(country.donationAmount)} to a charity. Quests below earn points.`}
                  </p>
                </div>

                {/* Today's Gamified Quests list */}
                <div className="quests-card">
                  <div className="quests-header">
                    <h3 className="quests-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--accent)' }}><TargetIcon size={16} /></span>Today's quests</h3>
                    <span className="kx-count">{todayQuests.filter(q => claimedQuestIds.includes(q.id)).length} of {todayQuests.length} done</span>
                  </div>
                  <div className="quests-list-stack">
                    {todayQuests.map(t => {
                      const isVerifying = completingTaskId === t.id;
                      const claimed = claimedQuestIds.includes(t.id);
                      const state = claimed ? 'is-claimed' : t.done ? 'is-ready' : '';
                      return (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => toggleTask(t.id)}
                          disabled={claimed || isVerifying}
                          className={`kx-quest ${state}`}
                          style={{ ['--q' as string]: Math.min(1, t.current / t.goal) }}
                        >
                          <span className="kx-check" aria-hidden="true" />
                          <span className="kx-quest-body">
                            <span className="kx-quest-text">{isVerifying ? 'Checking…' : t.text}</span>
                            <span className="kx-quest-progress"><span /></span>
                            <span className="kx-quest-meta">{claimed ? 'Claimed' : t.done ? 'Done — tap to claim' : t.progressLabel}</span>
                          </span>
                          <strong className="kx-quest-pts">+{t.pointsValue}</strong>
                        </button>
                      );
                    })}
                    {todayQuests.length < 3 && (
                      <p className="kx-quest-note">More quests appear once your phone or watch shares steps and sleep with Kinetix Fit.</p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                {/* Achievements / Badges Gallery — computed live from existing tracked data */}
                <div className="quests-card">
                  <div className="quests-header">
                    <h3 className="quests-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--warn)' }}><TrophyIcon size={16} /></span>Achievements</h3>
                  </div>
                  {/* The check-in streak: today's count, the best, the last 7 days, and what's next */}
                  <div className={`kx-streak${streak.current > 0 ? ' is-on' : ''}`}>
                    <div className="kx-streak-top">
                      <span className="kx-streak-flame" aria-hidden="true"><FlameIcon size={26} /></span>
                      <div className="kx-streak-count">
                        <strong>{streak.current}<small>{streak.current === 1 ? ' day' : ' days'}</small></strong>
                        <span>Check-in streak · best {streak.best} {streak.best === 1 ? 'day' : 'days'}</span>
                      </div>
                    </div>
                    <div className="kx-streak-week" role="img" aria-label={`Checked in on ${streak.week.filter(d => d.done).length} of the last 7 days`}>
                      {streak.week.map(d => (
                        <span key={d.day} className={`kx-streak-day${d.done ? ' is-done' : ''}${d.day === todayDateKey ? ' is-today' : ''}`}>
                          <i />{d.letter}
                        </span>
                      ))}
                    </div>
                    <p className="kx-streak-msg">
                      {streakMessage(streak)}
                      {streak.next && streak.current > 0 && ` Next badge: ${streak.next.days} days.`}
                    </p>
                    {!streak.today && (
                      <button type="button" className="edit-bio-btn kx-streak-cta" onClick={openCheckIn}>Check in now</button>
                    )}
                  </div>
                  <div className="badges-gallery-grid">
                    {[
                      { id: 'first-steps', label: 'First workout', icon: <StepsIcon size={24} />, unlocked: detectedTotal >= 1 },
                      { id: 'dedicated', label: '5 workouts', icon: <DumbbellIcon size={24} />, unlocked: detectedTotal >= 5 },
                      ...STREAK_BADGES.slice(0, 5).map(n => ({ id: `streak-${n}`, label: `${n}-day streak`, icon: <FlameIcon size={24} />, unlocked: streak.best >= n })),
                      { id: 'level-3', label: 'Level 3', icon: <MedalIcon size={24} />, unlocked: level >= 3 },
                      { id: 'level-5', label: 'Level 5', icon: <TrophyIcon size={24} />, unlocked: level >= 5 },
                    ].map(badge => (
                      <div key={badge.id} className={`badge-tile ${badge.unlocked ? 'badge-unlocked' : 'badge-locked'}`}>
                        <span className="badge-icon">{badge.icon}</span>
                        <span className="badge-label">{badge.label}</span>
                        {!badge.unlocked && <LockIcon size={12} className="badge-lock-overlay" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* How points are earned (src/lib/points.ts): small amounts, about 1,000 in a perfect month */}
                <div className="biopoint-validator-card">
                  <h3 className="card-header-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--accent)' }}><TargetIcon size={16} /></span>How you earn points</h3>
                  <ul className="kx-earn-list">
                    <li><span>Daily check-in</span><strong>+{POINTS.checkIn}</strong></li>
                    <li><span>Each of today’s quests</span><strong>+{QUEST_POINTS_RANGE}</strong></li>
                    <li><span>Your first food scan of the day</span><strong>+{POINTS.firstScan}</strong></li>
                    <li><span>Every 7 days in a row of check-ins</span><strong>+{POINTS.streakWeek}</strong></li>
                    <li><span>Each new level</span><strong>+{POINTS.levelUp}</strong></li>
                  </ul>
                  <p className="validator-desc">
                    Doing all of it every day comes to about {fmtNumber(MONTHLY_POINTS_GUIDE)} points a month. Steps only count at a real walking or running pace, read from your connected device.
                  </p>
                </div>

                {/* Kinetix Rewards Vault Card (Gateway selection) */}
                <div className="rewards-redemption-card">
                  <div className="rewards-redemption-header">
                    <div>
                      <h3 className="redemption-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--info)' }}><GiftIcon size={16} /></span>Rewards</h3>
                      <span className="charity-subtitle">
                        {!country.vouchersLive ? 'Swap your points for vouchers and coupons'
                          : isPlus ? `One coffee voucher a month, for ${fmtNumber(VOUCHER_POINTS)} pts` : 'A coffee voucher every month · a Plus benefit'}
                      </span>
                    </div>
                    {/* Website: no RevenueCat SDK, so the redeem button shows and the server decides */}
                    {!country.vouchersLive ? (
                      <span className="kx-soon-pill">Coming soon</span>
                    ) : isPlus || !Capacitor.isNativePlatform() ? (
                      <button onClick={triggerRewardVaultSettlement} disabled={isRedeemingVoucher || totalVoucherPoints < VOUCHER_POINTS || voucherUsedThisMonth} className="redeem-rewards-btn">
                        {isRedeemingVoucher ? 'Redeeming…' : voucherUsedThisMonth ? 'Next one on the 1st' : totalVoucherPoints < VOUCHER_POINTS ? `${fmtNumber(VOUCHER_POINTS)} pts to redeem` : `Redeem · ${fmtNumber(VOUCHER_POINTS)} pts`}
                      </button>
                    ) : (
                      <button onClick={openPlusPage} className="redeem-rewards-btn"><LockIcon size={14} /> Get Plus</button>
                    )}
                  </div>


                  {/* Redeemed vouchers */}
                  {vouchers.length === 0 ? (
                    <div className="kx-empty"><span className="kx-empty-icon"><GiftIcon size={22} /></span><p>
                      {country.vouchersLive
                        ? 'Vouchers are launching soon. Anything you redeem will appear here.'
                        : `Vouchers and coupons for ${country.name} are coming soon. Keep earning — your points are saved for them.`}
                    </p></div>
                  ) : (
                  <div className="ledger-table-container">
                    <table className="ledger-table">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)' }}>
                          <th>Ref</th>
                          <th>Reward</th>
                          <th>Value</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vouchers.map(v => (
                          <tr key={v.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ color: 'var(--ink-3)' }}>{v.id}</td>
                            <td>{v.provider}</td>
                            <td style={{ fontWeight: 700 }}>{v.value}</td>
                            <td>
                              <span className={`ledger-status-pill status-${v.state.toLowerCase()}`}>
                                {v.state}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>

                {/* Give to charity: the person's country's charities; not live yet outside the UK, so shown as coming soon */}
                <div className="charity-matching-card">
                  <div className="charity-card-header">
                    <div>
                      <h3 className="charity-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><HeartIcon size={16} /></span>Give to charity</h3>
                      <span className="charity-subtitle">
                        {country.donationsLive
                          ? `Turn points into a real donation to a charity in ${country.code === 'GB' ? 'the UK' : country.name}.`
                          : `Coming soon in ${country.name}: turn points into a real donation to one of these charities.`}
                      </span>
                    </div>
                    {country.donationsLive
                      ? <span className="donations-count-pill">{charityDonations} given</span>
                      : <span className="kx-soon-pill">Coming soon</span>}
                  </div>

                  <div className="charity-options-grid">
                    {country.charities.map(charity => (
                      <div key={charity.id} className="charity-item-subcard">
                        <div>
                          <span className="charity-item-tag">{charity.desc}</span>
                          <h4 className="charity-item-name">{charity.name}</h4>
                          <p className="charity-item-mission">{charity.mission}</p>
                        </div>
                        <button onClick={() => handleDonateToCharity(charity.id, charity.name)} disabled={isDonating || !country.donationsLive} className="donate-points-btn">
                          {!country.donationsLive ? 'Coming soon' : isDonating ? 'Donating…' : `Donate 1,000 pts · ${fmtMoney(country.donationAmount)}`}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ==================== TAB 4: ACCOUNT — a settings menu; each row opens its own page ==================== */}
          {activeTab === 'account' && accountPage === null && (
            <div className="tab-fade-in kx-account">
              <div className="kx-account-head">
                <span className="kx-avatar" aria-hidden="true">{(profile.name || accountEmail || 'K').trim().charAt(0).toUpperCase()}</span>
                <div className="kx-account-id">
                  <h2 className="kx-account-name">{profile.name || 'Your account'}</h2>
                  {accountEmail && <p className="kx-account-email">{accountEmail}</p>}
                </div>
              </div>

              {accountSections.map((section, i) => (
                <React.Fragment key={section.title}>
                  {/* Appearance sits after Devices & reminders; it's a bottom sheet, not a page */}
                  {i === 2 && (
                    <section className="kx-account-section">
                      <h3 className="kx-section-label">Appearance</h3>
                      <div className="kx-rows kx-rows-menu">
                        <SheetRow label="Theme" value={THEME_LABELS[themePref]}>
                          {close => (
                            <ChoiceCards label="Theme" hideLabel value={themePref}
                              options={[
                                { value: 'system', label: 'System', hint: 'Match your phone' },
                                { value: 'light', label: 'Light' },
                                { value: 'dark', label: 'Dark' }
                              ]}
                              onChange={v => { setThemePref(v); setThemePrefState(v); window.setTimeout(close, 180); }} />
                          )}
                        </SheetRow>
                        {appIconSupported() && (
                          <button type="button" className="kx-row" onClick={() => { setIconShown(null); openAccountPage('icon'); }}>
                            <span className="kx-row-label">App icon</span>
                            <span className="kx-row-value kx-row-truncate">{appIconInfo(appIcon).name}</span>
                            <ChevronIcon className="kx-row-chevron" />
                          </button>
                        )}
                        <button type="button" className="kx-row" onClick={() => openAccountPage('widgets')}>
                          <span className="kx-row-label">Widgets</span>
                          <span className="kx-row-value kx-row-truncate">{isPlus ? 'All unlocked' : '3 with Plus'}</span>
                          <ChevronIcon className="kx-row-chevron" />
                        </button>
                      </div>
                    </section>
                  )}
                  <section className="kx-account-section">
                    <h3 className="kx-section-label">{section.title}</h3>
                    <div className="kx-rows kx-rows-menu">
                      {section.rows.map(row => (
                        <button key={row.page} type="button" className="kx-row" onClick={() => openAccountPage(row.page)}>
                          <span className="kx-row-label">{ACCOUNT_PAGE_TITLES[row.page]}</span>
                          {row.value && <span className="kx-row-value kx-row-truncate">{row.value}</span>}
                          <ChevronIcon className="kx-row-chevron" />
                        </button>
                      ))}
                    </div>
                  </section>
                </React.Fragment>
              ))}

              <section className="kx-account-section">
                <div className="kx-rows kx-rows-menu">
                  <button type="button" onClick={() => setShowLogoutConfirm(true)} className="kx-row kx-row-danger">
                    <span className="kx-row-label">Log out</span>
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'account' && accountPage !== null && (
            <div className="tab-fade-in kx-account" key={accountPage}>
              <div className="kx-page-head">
                <button type="button" className="kx-back-btn" onClick={closeAccountPage} aria-label="Back to Account">
                  <ChevronIcon size={20} className="kx-back-icon" />
                </button>
                <h2 className="kx-page-title">{ACCOUNT_PAGE_TITLES[accountPage]}</h2>
              </div>

              {accountPage === 'details' && (
                <div className="hub-support-card">
                  <ProfileSettingsList profile={profile} onChange={patchDetails} />
                </div>
              )}

              {accountPage === 'allergies' && (
                <div className="scanner-module-card">
                  <ChoiceCards label="What do you eat?" options={DIET_OPTIONS} value={profile.diet ?? 'everything'} onChange={d => patchProfile({ diet: d })} />
                  <p className="card-header-desc">
                    Meal ideas and your gut report only suggest foods that fit, and the food check points out meat, fish or egg.
                  </p>
                  <span className="kx-field-label">Allergies</span>
                  <p className="card-header-desc">
                    Tap any you have, or type one that isn’t listed. The food check flags them and meal ideas leave them out.
                  </p>
                  <AllergyPicker countryAllergens={country.allergens} diet={profile.diet} selected={profile.personalAllergens}
                    onChange={setPersonalAllergens} onMessage={notify} />
                </div>
              )}

              {accountPage === 'devices' && (
                <div className="biopoint-validator-card">
                  <p className="validator-desc">
                    {!profile.smartDeviceConnected
                      ? 'Connect your wearable device to sync your activity, heart rate, and sleep data automatically.'
                      : healthDataState === 'no-data'
                        ? (Capacitor.getPlatform() === 'ios'
                          ? `Connected to ${profile.smartDeviceConnected}, but nothing has arrived yet — check Kinetix Fit is allowed to read your data in the Health app (profile picture → Apps → Kinetix Fit).`
                          : `Connected to ${profile.smartDeviceConnected}, but no app is sharing data with it yet.`)
                        : phoneOnly
                          ? `Syncing steps from your phone via ${profile.smartDeviceConnected}. Heart rate, sleep and stress need a smartwatch or fitness band — switch to “Yes” below if you start wearing one.`
                          : `Syncing activity, heart rate and sleep from ${healthSource ? `${healthSource} via ${profile.smartDeviceConnected}` : profile.smartDeviceConnected}.`}
                  </p>
                  {profile.smartDeviceConnected && (wearableDataSeen ? (
                    <p className="validator-desc">Heart rate is arriving from your watch or band.</p>
                  ) : (
                    <Segmented label="Do you wear a smartwatch or band?" value={profile.wearable}
                      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Just my phone' }]}
                      onChange={v => { if (v) setWearableAnswer(v); }} />
                  ))}
                  {profile.smartDeviceConnected && Capacitor.isNativePlatform() ? (
                    <button onClick={openHealthSettings} className="connect-wearable-btn">
                      {Capacitor.getPlatform() === 'ios' ? 'Open the Health app' : 'Open Health Connect settings'}
                    </button>
                  ) : (
                    <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn">
                      {profile.smartDeviceConnected ? `Manage ${profile.smartDeviceConnected}` : 'Connect a device'}
                    </button>
                  )}
                </div>
              )}

              {accountPage === 'reminders' && (
                <div className="hub-support-card">
                  <label className="demo-toggle-label">
                    <input
                      type="checkbox"
                      checked={hydrationRemindersEnabled}
                      onChange={(e) => setWaterReminders(e.target.checked)}
                      className="demo-toggle-checkbox"
                    />
                    Remind me to drink water during my active hours
                  </label>
                  <div className="kx-rows">
                    <SheetRow label="Active from" value={formatHour(shiftStartHour)}>
                      {close => (
                        <ChoiceCards label="Active from" hideLabel columns={4} options={HOUR_OPTIONS} value={shiftStartHour}
                          onChange={v => { setShiftStartHour(v); localStorage.setItem('kinetix_shift_start', v.toString()); window.setTimeout(close, 180); }} />
                      )}
                    </SheetRow>
                    <SheetRow label="Until" value={formatHour(shiftEndHour)}>
                      {close => (
                        <ChoiceCards label="Until" hideLabel columns={4} options={HOUR_OPTIONS} value={shiftEndHour}
                          onChange={v => { setShiftEndHour(v); localStorage.setItem('kinetix_shift_end', v.toString()); window.setTimeout(close, 180); }} />
                      )}
                    </SheetRow>
                  </div>
                  <Segmented label="Remind me every" value={hydrationIntervalHours}
                    options={[1, 2, 3, 4].map(h => ({ value: h, label: `${h} h` }))}
                    onChange={v => { setHydrationIntervalHours(v); localStorage.setItem('kinetix_hydration_interval', v.toString()); }} />
                  <p style={{ fontSize: '13px', color: 'var(--ink-3)', margin: '10px 0 0 0', lineHeight: '1.6' }}>
                    Nutrition-target alerts are always on (native app only) and fire at most once per target per day.
                  </p>
                </div>
              )}
              {accountPage === 'reminders' && (
                <div className="hub-support-card">
                  <label className="demo-toggle-label">
                    <input type="checkbox" checked={moveEnabled} onChange={e => setMoveBreaks(e.target.checked)} className="demo-toggle-checkbox" />
                    Movement breaks
                  </label>
                  <p className="card-header-desc" style={{ marginTop: 0 }}>
                    {Capacitor.getPlatform() === 'ios'
                      ? 'A reminder to stand up and move during your active hours. iPhone apps can’t tell when you’ve been still, so these come on a schedule.'
                      : 'When you’ve been on your phone for a while and your step counter hasn’t moved, Kinetix Fit nudges you to get up. Uses the same active hours as water reminders.'}
                  </p>
                  <Segmented label={Capacitor.getPlatform() === 'ios' ? 'Remind me every' : 'After sitting still for'} value={moveMinutes}
                    options={MOVE_MINUTES_OPTIONS.map(m => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} h` }))}
                    onChange={changeMoveMinutes} />
                </div>
              )}

              {accountPage === 'reminders' && (
                <div className="hub-support-card">
                  <label className="demo-toggle-label">
                    <input type="checkbox" checked={gutReminderOn} onChange={e => setGutReminder(e.target.checked)} className="demo-toggle-checkbox" />
                    Gut check-in
                  </label>
                  <p className="card-header-desc" style={{ marginTop: 0 }}>
                    A reminder at {formatHour(GUT_REMINDER_HOUR)} on days you haven’t noted how your gut feels.
                  </p>
                </div>
              )}

              {accountPage === 'reminders' && (
                <div className="hub-support-card">
                  <label className="demo-toggle-label">
                    <input type="checkbox" checked={streakReminderOn} onChange={e => setStreakReminder(e.target.checked)} className="demo-toggle-checkbox" />
                    Streak reminder
                  </label>
                  <p className="card-header-desc" style={{ marginTop: 0 }}>
                    A nudge at {`${String(STREAK_REMINDER_TIME.hour).padStart(2, '0')}:${String(STREAK_REMINDER_TIME.minute).padStart(2, '0')}`} on days you haven’t checked in yet, so your streak doesn’t end by accident.
                  </p>
                </div>
              )}

              {accountPage === 'icon' && (
                <div className="hub-support-card kx-icons">
                  <div className="kx-icon-hero">
                    <img className="kx-icon-art is-hero" src={appIconPreview(iconShownId)} alt="" width={88} height={88} />
                    <div className="kx-icon-hero-text">
                      <strong>{iconShownInfo.name}{iconShownInfo.plus && <span className="kx-plus-pill">Plus</span>}</strong>
                      <span>{iconShownInfo.hint}</span>
                    </div>
                  </div>
                  {iconShownId === appIcon ? (
                    <p className="kx-icon-inuse">This is your icon now.</p>
                  ) : !appIconSupported() ? (
                    <p className="kx-hs-note">Change your icon in the Kinetix Fit app for Android or iPhone.</p>
                  ) : canUseIcon(iconShownId, isPlus) ? (
                    <button type="button" className="primary-btn" disabled={changingIcon} onClick={() => pickAppIcon(iconShownId)}>
                      {changingIcon ? 'Changing…' : `Use ${iconShownInfo.name}`}
                    </button>
                  ) : (
                    <button type="button" className="primary-btn" onClick={openPlusPage}><LockIcon size={14} /> Unlock with Plus</button>
                  )}
                  {(['symbol', 'kx'] as const).map(style => (
                    <section key={style} className="kx-icon-group">
                      <h4 className="kx-section-label">{style === 'symbol' ? 'The Kinetix Fit symbol' : 'KX lettering'}</h4>
                      <div className="kx-icon-grid" role="radiogroup" aria-label={style === 'symbol' ? 'Symbol icons' : 'KX icons'}>
                        {APP_ICONS.filter(i => i.style === style).map(i => {
                          const locked = !canUseIcon(i.id, isPlus);
                          return (
                            <button key={i.id} type="button" role="radio" aria-checked={i.id === iconShownId}
                              className={`kx-icon-tile${i.id === iconShownId ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
                              onClick={() => { hapticSelection(); setIconShown(i.id); }}>
                              <span className="kx-icon-frame">
                                <img className="kx-icon-art" src={appIconPreview(i.id)} alt="" width={60} height={60} loading="lazy" />
                                {locked && <span className="kx-icon-lock" aria-label="Plus"><LockIcon size={11} /></span>}
                                {i.id === appIcon && <span className="kx-icon-check" aria-label="In use" />}
                              </span>
                              <span className="kx-icon-name">{i.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  <p className="kx-hs-note">
                    {!isPlus ? 'Classic and Midnight are free. The rest come with Kinetix Fit Plus — tap any of them to see it. ' : ''}
                    {Capacitor.getPlatform() === 'android' ? 'Some launchers take a few seconds to show a new icon, and may move it from your home screen to the apps list.' : ''}
                  </p>
                </div>
              )}

              {accountPage === 'widgets' && (
                <WidgetGallery data={widgetData} prefs={widgetPrefs} isPlus={isPlus} onPrefsChange={changeWidgetPrefs} onUnlock={openPlusPage} notify={notify} />
              )}

              {accountPage === 'subscription' && (
                <div className="hub-billing-card">
                  <span className="vitals-label">Your plan</span>
                  <p className="billing-status-title">{revenueCatStatus ?? (isPlus ? 'Kinetix Fit Plus' : 'Free plan')}</p>

                  <div className="kx-plan-grid">
                    <div className={`kx-plan${isPlus ? '' : ' is-current'}`}>
                      <span className="kx-plan-name">Free</span>
                      <strong className="kx-plan-price">{fmtMoney(0)}</strong>
                      <ul>
                        <li>{FREE_DAILY_SCANS} photo or barcode scans a day</li>
                        <li>Unlimited typed food checks</li>
                        <li>Health tracking, quests and points</li>
                        <li>Give points to charity</li>
                      </ul>
                      {!isPlus && <span className="kx-plan-badge">Your plan</span>}
                    </div>
                    <div className={`kx-plan is-plus${isPlus ? ' is-current' : ''}`}>
                      <span className="kx-plan-name">Plus</span>
                      <strong className="kx-plan-price">
                        {plusPackage
                          ? <>{plusPackage.product.priceString}{plusPackage.packageType === 'MONTHLY' && <small> / month</small>}{plusPackage.packageType === 'ANNUAL' && <small> / year</small>}</>
                          : country.code === 'GB' ? <>£14.99<small> / month</small></> : <small>Price shown in the store</small>}
                      </strong>
                      <ul>
                        {PLUS_BENEFITS.map(b => <li key={b}>{b}</li>)}
                        <li>Everything in Free</li>
                      </ul>
                      {isPlus && <span className="kx-plan-badge">Your plan</span>}
                    </div>
                  </div>

                  {isPlus ? (
                    <button onClick={handleManageSubscription} className="edit-bio-btn">Manage subscription</button>
                  ) : Capacitor.isNativePlatform() ? (
                    <button onClick={handleBuyPlus} disabled={isBuyingPlus} className="primary-btn">
                      {isBuyingPlus ? 'Opening the store…' : plusPackage?.product.introPrice ? 'Start your free trial' : 'Get Kinetix Fit Plus'}
                    </button>
                  ) : (
                    <p className="billing-disclaimer">Get Kinetix Fit Plus in the Kinetix Fit app for Android or iPhone — it then works here too.</p>
                  )}
                  {Capacitor.isNativePlatform() && (
                    <p className="billing-disclaimer">
                      Billed through your {Capacitor.getPlatform() === 'ios' ? 'App Store' : 'Google Play'} account; cancel any time.{' '}
                      {!isPlus && <button type="button" className="ob-link" onClick={handleRestorePurchases}>Restore purchase</button>}
                    </p>
                  )}
                </div>
              )}

              {accountPage === 'promo' && (
                <div className="hub-support-card">
                  <p className="card-header-desc">Have a promo code? Enter it here to unlock your pass.</p>
                  <div className="promo-input-row">
                    <input
                      type="text"
                      placeholder="Promo code"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value)}
                      className="promo-text-input"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !isRedeemingPromo && promoCodeInput.trim()) applyPromoCode(); }}
                    />
                    <button onClick={applyPromoCode} disabled={isRedeemingPromo || !promoCodeInput.trim()} className="promo-submit-btn">
                      {isRedeemingPromo ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                  {promoMessage && (
                    <p className={`promo-response-msg ${promoMessage.tone === 'error' ? 'response-error' : 'response-success'}`}>
                      {promoMessage.text}
                    </p>
                  )}
                </div>
              )}

              {accountPage === 'about' && (
                <>
                  <div className="legal-block-card">
                    <p className="legal-card-text">
                      Kinetix Fit helps you track your fitness, nutrition, and rewards all in one place.
                    </p>
                  </div>
                  <div className="legal-block-card">
                    <h3 className="legal-card-title">Not a medical device</h3>
                    <p className="legal-card-text">
                      Kinetix Fit is a fitness and nutrition tracking app, not a certified medical device. It doesn't replace professional medical advice — always consult a doctor before starting a new fitness or diet plan.
                    </p>
                  </div>
                </>
              )}

              {accountPage === 'privacy' && (
                <>
                  <div className="legal-block-card">
                    <p className="legal-card-text">
                      Your health readings, meal checks and rewards history are handled under the <strong>UK GDPR</strong> and the <strong>Data Protection Act 2018</strong>.
                    </p>
                  </div>
                  <div className="kx-rows kx-rows-menu">
                    <a className="kx-row" href={serverUrl('/privacy-policy')} target="_blank" rel="noopener noreferrer">
                      <span className="kx-row-label">Privacy policy</span>
                      <ChevronIcon className="kx-row-chevron" />
                    </a>
                    <a className="kx-row" href={serverUrl('/terms-of-service')} target="_blank" rel="noopener noreferrer">
                      <span className="kx-row-label">Terms of service</span>
                      <ChevronIcon className="kx-row-chevron" />
                    </a>
                  </div>
                </>
              )}

              {accountPage === 'help' && (
                <div className="hub-support-card">
                  {contactSuccess ? (
                    <div className="support-success-banner">
                      Message sent. We reply within 12 hours.
                    </div>
                  ) : (
                    <form onSubmit={handleSendContact} className="support-form-stack">
                      <label className="support-field-label">Your name
                        <input type="text" required value={contactName} onChange={(e) => setContactName(e.target.value)} className="support-input" />
                      </label>
                      <label className="support-field-label">Email
                        <input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="support-input" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                      </label>
                      <label className="support-field-label">Message
                        <textarea rows={3} required value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} className="support-textarea" />
                      </label>
                      <button type="submit" className="primary-btn">
                        Send message
                      </button>
                    </form>
                  )}

                  <div className="support-emails-box">
                    <span>Support: <a href="mailto:info@kinetixfit.co.uk">info@kinetixfit.co.uk</a></span>
                    <span>Partnerships: <a href="mailto:partnerships@kinetixfit.co.uk">partnerships@kinetixfit.co.uk</a></span>
                  </div>
                </div>
              )}
            </div>
          )}


        </div>

        {/* Scan-food shortcut on Today only — Nourish has its own camera button, and elsewhere it would cover controls */}
        {activeTab === 'vitals' && (
          <button
            onClick={() => {
              handleTabChange('nourish');
              setShowCameraModal(true);
            }}
            className="floating-hud-camera-fab"
            title="Scan food"
            aria-label="Scan food"
          >
            <CameraIcon size={24} />
          </button>
        )}

        {/* --- STICKY BOTTOM NAVIGATION BAR --- */}
        {/* iOS-style tab bar: glass lens, droplet stretch, slide-to-switch (src/components/TabBar.tsx) */}
        <TabBar activeId={activeTab} onChange={handleTabChange} tabs={[
            {
              id: 'vitals',
              label: 'Today',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              )
            },
            {
              id: 'nourish',
              label: 'Nourish',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11h18a9 9 0 0 1-18 0Z" /><path d="M7 21h10" /><path d="M12 7c0-2 1.5-3.5 3.5-4" /><path d="M9 7.5c-.5-1.5-.2-3 .8-4" />
                </svg>
              )
            },
            {
              id: 'rewards',
              label: 'Rewards',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="6" />
                  <path d="M15.5 13.2 17 22l-5-3-5 3 1.5-8.8" />
                </svg>
              )
            },
            {
              id: 'account',
              label: 'Account',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )
            },
          ]} />

      </div>

      {/* --- SPECTACULAR NEON LEVEL UP CELEBRATION MODAL --- */}
      {showLevelUpModal && (
        <div className="portal-overlay-modal" style={{ zIndex: 15000 }}>
          <div className="modal-content-card levelup-celebration-card" style={{ border: '2px solid var(--accent)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <span className="levelup-trophy-icon"><TrophyIcon size={40} /></span>
            <h2 className="modal-title">
              Level up
            </h2>
            <p className="modal-desc">
              You've reached
              <br/>
              <strong style={{ color: 'var(--info)', display: 'block', margin: '10px 0', fontSize: '20px' }}>
                Level {level}
              </strong>
              Here's a bonus for sticking with it.
            </p>
            <button
              onClick={() => {
                setShowLevelUpModal(false);
                awardPoints(POINTS.levelUp, 0);
                notify('success', `Level-up bonus: +${POINTS.levelUp} points added to your rewards.`);
              }}
              className="primary-btn"
              style={{ width: '100%', marginTop: '15px', padding: '12px 20px' }}
            >
              Claim +{POINTS.levelUp} points
            </button>
          </div>
        </div>
      )}

      <HealthConnectSheet problem={healthConnectIssue} busy={isConnectingHealth}
        onRetry={handleConnectHealthSource} onClose={() => setHealthConnectIssue(null)} />

      {/* --- SMART SENSOR SYNC MODAL --- */}
      {showDeviceSyncModal && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card">
            <h3 className="modal-title">Connect a device</h3>
            <p className="modal-desc">
              Kinetix Fit reads your steps, heart rate and sleep from your phone's health app.
            </p>
            <div className="modal-options-stack">
              <button
                onClick={handleConnectHealthSource}
                disabled={isConnectingHealth}
                className="modal-sync-option-btn"
              >
                <span>{Capacitor.getPlatform() === 'ios' ? 'Apple Health' : isSamsungDevice() ? 'Samsung Health · via Health Connect' : 'Health Connect'}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{isConnectingHealth ? 'Connecting…' : 'Connect'}</span>
              </button>
            </div>
            {!Capacitor.isNativePlatform() && (
              <p className="kx-note" style={{ marginTop: '12px' }}>
                Live sync needs the iOS or Android app — the website can't connect to Apple Health or Health Connect.
              </p>
            )}

            {/* Real-time Syncing Educational Diagnostics Panel */}
            <div className="kx-how">
              <span className="vitals-label">How it works</span>
              <p>Your watch, ring or chest strap already sends its data to Apple Health or Health Connect. Kinetix Fit reads it from there, so one connection covers every device you own.</p>
              {Capacitor.getPlatform() === 'android' && isSamsungDevice() && (
                <p>On Samsung phones, Samsung Health also has to be allowed to share with Health Connect — Kinetix Fit shows you how if nothing arrives.</p>
              )}
              {Capacitor.getPlatform() === 'android' && !isSamsungDevice() && (
                <p>Google Fit, Fitbit and most watches share through Health Connect too. No Health Connect on your phone? Tap Connect and we’ll show you where to get it.</p>
              )}
            </div>
            <button onClick={() => setShowDeviceSyncModal(false)} className="modal-close-btn">
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Log out: always confirmed first */}
      {showLogoutConfirm && (
        <div className="portal-overlay-modal" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-content-card kx-confirm" role="alertdialog" aria-modal="true" aria-labelledby="kx-logout-title" aria-describedby="kx-logout-desc" onClick={e => e.stopPropagation()}>
            <h3 id="kx-logout-title" className="modal-title">Log out of Kinetix Fit?</h3>
            <p id="kx-logout-desc" className="modal-desc">You’ll need your email and password to log back in.</p>
            <div className="kx-confirm-actions">
              <button type="button" className="modal-close-btn" onClick={() => setShowLogoutConfirm(false)} autoFocus>Cancel</button>
              <button type="button" className="kx-danger-btn" onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}>Log out</button>
            </div>
          </div>
        </div>
      )}

      {/* Samsung Health doesn't share HRV, so Stress (and Recovery) are hidden — told once, on the first sync */}
      {showNoStressNotice && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card" role="dialog" aria-modal="true" aria-labelledby="kx-nostress-title">
            <span className="kx-title-icon kx-modal-icon" style={{ ['--tint' as string]: 'var(--m-stress)' }}><StressIcon size={20} /></span>
            <h3 id="kx-nostress-title" className="modal-title">Stress isn’t available from Samsung Health</h3>
            <p className="modal-desc">
              Kinetix Fit estimates stress from heart-rate variability (HRV), and Samsung Health doesn’t share HRV with
              other apps — not even through Health Connect. So we’ve hidden the Stress card rather than leave it empty.
            </p>
            <p className="modal-desc">
              Your steps, heart rate and sleep still sync as normal. If another app or watch shares HRV with Health
              Connect later, Stress comes back by itself.
            </p>
            <button type="button" className="primary-btn" onClick={dismissNoStressNotice}>Got it</button>
          </div>
        </div>
      )}

      {/* --- AI SPECTRAL INGESTION SCANNER MODAL --- */}
      {showCameraModal && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card">
            <h3 className="modal-title">Scan food</h3>

            {isCameraScanning ? (
              <div className="camera-viewfinder-scanning" style={{ height: '240px' }}>
                <div className="laser-beam"></div>
                <span className="scanner-status-text" style={{ marginTop: '5px' }}>Looking up product…</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p className="modal-desc">
                  Scan a barcode, take a photo, or type the ingredients.
                </p>
                {/* Photo + barcode scans are limited per day; typed checks aren't (the server enforces this) */}
                <div className="kx-scan-allowance">
                  <span>
                    {scanAllowance
                      ? `${scanAllowance.left} of ${scanAllowance.limit} photo or barcode scans left today`
                      : `${isPlus ? PLUS_DAILY_SCANS : FREE_DAILY_SCANS} photo or barcode scans a day${isPlus ? ' with Plus' : ' on the free plan'}`}
                    {' · typed checks are unlimited'}
                  </span>
                  {!isPlus && (
                    <button type="button" className="ob-link" onClick={openPlusPage}>Get {PLUS_DAILY_SCANS} a day with Plus</button>
                  )}
                </div>

                {/* Optional description: helps the photo scan, and becomes the logged food's note */}
                <label className="kx-scan-note">
                  <span className="kx-field-label">Describe it (optional)</span>
                  <input
                    type="text"
                    className="auth-input"
                    maxLength={200}
                    placeholder="e.g. unsweetened almond milk, 250 ml, with sugar"
                    value={scanNote}
                    onChange={e => setScanNote(e.target.value)}
                    autoCapitalize="sentences"
                    autoComplete="off"
                    enterKeyHint="done"
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                  <small>Say what it is or what’s mixed in — the photo scan uses it, and it’s saved with the food.</small>
                </label>

                {/* Real barcode scan */}
                <button
                  onClick={handleBarcodeScan}
                  className="primary-btn"
                >
                  Scan barcode
                </button>
                {!Capacitor.isNativePlatform() && (
                  <input
                    ref={barcodeFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      handleBarcodeFromPhoto(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                )}
                <button
                  type="button"
                  className="ob-link"
                  style={{ alignSelf: 'center', marginTop: '-6px' }}
                  onClick={() => Capacitor.isNativePlatform() ? handleBarcodeFromPhoto() : barcodeFileInputRef.current?.click()}
                >
                  Read a barcode from a saved photo
                </button>

                {/* Photo: camera or gallery. Apps use the Camera plugin (see handleNativePhoto); the website uses a
                    file input without `capture`, so phone browsers offer both camera and gallery. */}
                {Capacitor.isNativePlatform() ? (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleNativePhoto(false)} className="secondary-btn" style={{ flex: 1 }}>
                      Take a photo
                    </button>
                    <button onClick={() => handleNativePhoto(true)} className="secondary-btn" style={{ flex: 1 }}>
                      Choose from gallery
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={photoFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        handlePhotoFileSelected(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => photoFileInputRef.current?.click()}
                      className="secondary-btn"
                      style={{ width: '100%' }}
                    >
                      Take or upload a photo
                    </button>
                  </>
                )}

                {/* OCR text custom capture box */}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                  <label className="drawer-label" htmlFor="kx-ingredients">Or type the ingredients</label>
                  <textarea
                    rows={2}
                    id="kx-ingredients"
                    placeholder="e.g. wheat, milk, eggs, peanuts"
                    value={mealInput}
                    onChange={(e) => setMealInput(e.target.value)}
                    className="support-textarea"
                  />
                  <button
                    onClick={() => triggerCameraScan(mealInput)}
                    disabled={!mealInput.trim()}
                    className="primary-btn"
                    style={{ width: '100%', marginTop: '10px' }}
                  >
                    Check ingredients
                  </button>
                </div>

                <button onClick={() => setShowCameraModal(false)} className="modal-close-btn">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
