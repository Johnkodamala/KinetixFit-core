import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { Purchases, type CustomerInfo } from '@revenuecat/purchases-capacitor';
import { Health, type HealthSample } from '@capgo/capacitor-health';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { serverUrl } from './lib/server';
import { localDayKey, localDayKeyDaysAgo } from './lib/dates';
import { bmiOf } from './lib/bmi';
import { primarySourceLabel, isSamsungDevice } from './lib/healthSources';
import { getThemePref, setThemePref, type ThemePref } from './lib/theme';
import { selection as hapticSelection } from './lib/feedback';
import type { Session } from '@supabase/supabase-js';
import BiometricTrendCard, { type DailyPoint } from './components/BiometricTrendCard';
import { ProfileSettingsList } from './components/ProfileFields';
import AboutYouFlow from './components/AboutYouFlow';
import TabBar from './components/TabBar';
import { ChoiceCards, Segmented, SheetRow } from './components/Pickers';
import { StepsIcon, HeartIcon, SleepIcon, StressIcon, CameraIcon, RewardIcon, BellIcon, MessageIcon, ChevronIcon, FlameIcon, DumbbellIcon, MedalIcon, TrophyIcon, LockIcon, RecoveryIcon, BikeIcon, WavesIcon, BowlIcon, TargetIcon, GiftIcon, SearchIcon, BarcodeIcon } from './components/Icons';
import TrackLanes from './components/TrackLanes';

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
  sex: 'male' | 'female' | null;
  age: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  lastPeriodStartDate: string | null;
  averageCycleLength: number;
  /** onboarding region id (src/lib/regions.ts); null until chosen */
  region: string | null;
}

// In-app message pill (see notify()). The tone picks its icon and colour.
type MessageTone = 'success' | 'error' | 'warn' | 'info';
interface AppMessage { tone: MessageTone; text: string; }

// Onboarding step index at which the real dashboard becomes visible. Steps: 0-1 Welcome,
// 2 Sign up/Log in, 3 Health permission, 4 Notifications permission, 5 Profile, 6 Allergies.
const DASHBOARD_STEP = 7;

// Reminder hours, shown as 24-hour times
const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour(h) }));

// Bottom-nav order; the sliding indicator's position is this index.
const TAB_IDS = ['vitals', 'nourish', 'rewards', 'account'];

// Account is a settings menu; each row opens one of these pages at #account/<page>, so the browser
// and Android back button return to the menu.
type AccountPage = 'details' | 'allergies' | 'devices' | 'reminders' | 'subscription' | 'promo' | 'about' | 'privacy' | 'help';
const ACCOUNT_PAGE_TITLES: Record<AccountPage, string> = {
  details: 'Your details', allergies: 'Food allergies', devices: 'Connected devices', reminders: 'Reminders',
  subscription: 'Plan & billing', promo: 'Promo code', about: 'About KinetixFit', privacy: 'Your data & privacy', help: 'Get help'
};
const WORKOUT_MODES: { id: 'rest' | 'run' | 'cycle' | 'swim'; label: string; icon: React.ReactNode }[] = [
  { id: 'rest', label: 'Recovery', icon: <RecoveryIcon size={22} /> },
  { id: 'run', label: 'Run', icon: <StepsIcon size={22} /> },
  { id: 'cycle', label: 'Cycle', icon: <BikeIcon size={22} /> },
  { id: 'swim', label: 'Swim', icon: <WavesIcon size={22} /> }
];

// Points one charity donation costs (matches the "Donate 1,000 pts · £2.50" buttons)
const CHARITY_DONATION_POINTS = 1000;

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
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
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

// Standard-length cycle phase breakdown, scaled to the user's own average cycle length.
function computeCyclePhase(lastPeriodStartDate: string, averageCycleLength: number): { phase: string; dayOfCycle: number } {
  const start = new Date(lastPeriodStartDate);
  const daysSince = Math.floor((Date.now() - start.getTime()) / 86400000);
  const dayOfCycle = ((daysSince % averageCycleLength) + averageCycleLength) % averageCycleLength + 1;
  const ovulationDay = Math.round(averageCycleLength / 2);

  let phase: string;
  if (dayOfCycle <= 5) phase = 'Menstrual Phase';
  else if (dayOfCycle < ovulationDay - 1) phase = 'Follicular Phase';
  else if (dayOfCycle <= ovulationDay + 1) phase = 'Ovulation Window';
  else phase = 'Luteal Phase';

  return { phase, dayOfCycle };
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
  sex: null,
  age: 30,
  activityLevel: 'moderate',
  lastPeriodStartDate: null,
  averageCycleLength: 28,
  region: null
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

function getTasksForTarget(target: UserProfile['target']): Task[] {
  if (target === 'Weight Loss') {
    return [
      { id: 'TOD-1', text: 'Hit your calorie deficit goal today', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'nutrition' },
      { id: 'TOD-2', text: 'Fuel up with 10g+ fibre in one meal', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'nutrition' },
      { id: 'TOD-3', text: 'Log a 45-min cardio session', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'activity' }
    ];
  }
  if (target === 'Weight Gain') {
    return [
      { id: 'TOD-1', text: 'Hit your protein target today', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'nutrition' },
      { id: 'TOD-2', text: 'Log your carb intake for the day', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'nutrition' },
      { id: 'TOD-3', text: 'Get a strength session in', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'activity' }
    ];
  }
  if (target === 'Cardio Endurance') {
    return [
      { id: 'TOD-1', text: 'Nail your step intervals today', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'activity' },
      { id: 'TOD-2', text: 'Push your heart rate into peak zone', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'activity' },
      { id: 'TOD-3', text: 'Hit 2.5L of water today', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'unverifiable_by_design' }
    ];
  }
  return [
    { id: 'TOD-1', text: 'Complete a 15-minute breathing session', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'recovery' },
    { id: 'TOD-2', text: 'Check your sleep quality score', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'recovery' },
    { id: 'TOD-3', text: 'Keep your stress load low today', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'recovery' }
  ];
}

interface MealScanResult {
  foodName: string;
  calories: number;
  macros: { carbs: number; protein: number; fat: number; fiber: number };
  micros: { sodium: string; potassium: string; iron: string; calcium: string };
  allergensFlagged: string[];
  complianceStatus: 'CLEARED' | 'HAZARD_DETECTED';
  dietaryRecommendation: string;
  estimated?: boolean;
  estimatedPortionGrams?: number;
}

interface VoucherLog {
  id: string;
  provider: string;
  value: string;
  sku: string;
  state: 'Authorized' | 'Settled' | 'Donated';
  timestamp: string;
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
  xpValue: number;
  pointsValue: number;
  // How this quest can be checked against real data server-side (see api/complete-quest.js).
  // 'unverifiable_by_design' means no data source exists for it and never will (e.g. hydration) —
  // distinct from an 'activity'/'recovery'/'nutrition' quest simply not having synced data *yet*.
  verificationType: 'activity' | 'recovery' | 'nutrition' | 'unverifiable_by_design';
}

export default function App() {
  // --- 1. PERSISTENT CORE STATES & AUTHENTICATION FLOW ---
  const [isLoggedIn, setIsLogged] = useState<boolean>(() => {
    const saved = localStorage.getItem('kinetix_logged_in');
    return saved === 'true';
  });

  // 0: Welcome 1, 1: Welcome 2, 2: Sign up/Log in, 3: Health permission, 4: Notifications permission,
  // 5: Profile setup, 6: Allergies, 7 (DASHBOARD_STEP): main app
  const [onboardingStep, setOnboardingStep] = useState<number>(() => {
    const devStep = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('ob') : null;
    if (devStep !== null) return Number(devStep);
    // Someone who finished onboarding (kinetix_logged_in) starts on the dashboard. Starting them at 0 left the
    // step at 3 after the session restore, so every effect gated on DASHBOARD_STEP (health reads, reminders,
    // quest sync) silently never ran after an app restart, even though the dashboard was on screen.
    return localStorage.getItem('kinetix_logged_in') === 'true' ? DASHBOARD_STEP : 0;
  });
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'forgot'>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
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
    window.location.hash = tabId;
  };

  const openAccountPage = (page: AccountPage) => {
    hapticSelection();
    setAccountPage(page);
    accountPageFromMenu.current = true;
    window.history.pushState(null, '', `#account/${page}`);
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

  // Android back button: close an account page first, then walk back through tabs, then leave the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
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
        return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to parse saved profile data.", e);
      }
    }
    return DEFAULT_PROFILE;
  });

  const [rewardGateway] = useState<'primary' | 'direct' | 'local'>('local'); // Gateway selector disabled until live provider approval; defaults to local
  const [showLevelUpModal, setShowLevelUpModal] = useState<boolean>(false);
  const [activeSportMode, setActiveSportMode] = useState<'rest' | 'run' | 'cycle' | 'swim'>('rest');
  const [showDeviceSyncModal, setShowDeviceSyncModal] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [isConnectingHealth, setIsConnectingHealth] = useState<boolean>(false);
  const [liveSteps, setLiveSteps] = useState<number | null>(null);
  const [liveSleepQualityPercent, setLiveSleepQualityPercent] = useState<number | null>(null);
  const [liveSleepMinutes, setLiveSleepMinutes] = useState<number | null>(null);
  const isLiveHealthData = Capacitor.isNativePlatform() && profile.smartDeviceConnected !== null;

  // --- LOCAL PUSH NOTIFICATIONS (hydration, activity, nutrition) ---
  const [hydrationRemindersEnabled, setHydrationRemindersEnabled] = useState<boolean>(() => localStorage.getItem('kinetix_hydration_enabled') !== 'false');
  const [hydrationIntervalHours, setHydrationIntervalHours] = useState<number>(() => parseInt(localStorage.getItem('kinetix_hydration_interval') || '2'));
  const [shiftStartHour, setShiftStartHour] = useState<number>(() => parseInt(localStorage.getItem('kinetix_shift_start') || '9'));
  const [shiftEndHour, setShiftEndHour] = useState<number>(() => parseInt(localStorage.getItem('kinetix_shift_end') || '17'));
  const [lastWorkoutLoggedDate, setLastWorkoutLoggedDate] = useState<string | null>(() => localStorage.getItem('kinetix_last_workout_date'));

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
    setProfile(updatedProfile);
    localStorage.setItem('kinetix_profile', JSON.stringify(updatedProfile));
  };
  // Merge a few fields into the latest profile — safe for rapid updates (ruler scrolling, typing)
  const patchProfile = (changes: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...changes };
      localStorage.setItem('kinetix_profile', JSON.stringify(next));
      return next;
    });
  };

  // --- 5. DYNAMIC MOTIVATION POPUPS & REVENUE DEFENSE CONTROLS ---
  // One message at a time in the pill at the top of the app. It clears itself after a few seconds
  // (a little longer for long text), a tap dismisses it early, and a newer message restarts the timer.
  const [motivationMessage, setMotivationMessage] = useState<AppMessage | null>(null);
  const notify = (tone: MessageTone, text: string) => setMotivationMessage({ tone, text });
  useEffect(() => {
    if (!motivationMessage) return;
    const ms = Math.min(6000, Math.max(2500, motivationMessage.text.length * 40));
    const t = window.setTimeout(() => setMotivationMessage(null), ms);
    return () => window.clearTimeout(t);
  }, [motivationMessage]);

  const [lastRedemptionTime, setLastLastRedemptionTime] = useState<number>(0);
  const [requiredTaskCountForRedeem] = useState<number>(2); // Multi-step validation defense
  const [tasksCompletedTodayCount, setTasksCompletedTodayCount] = useState<number>(0);

  // --- 6. LIVE HEART RATE / HRV STATE ---
  // null until a real device reading arrives — no demo/simulated data is ever substituted here,
  // so a disconnected user always sees an honest "connect a device" state, never a fake number.
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [liveHrv, setLiveHrv] = useState<number | null>(null);
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
  const [foregroundTick, setForegroundTick] = useState(0);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      appActiveRef.current = isActive;
      if (isActive) setForegroundTick(t => t + 1);
    });
    return () => { listener.then(l => l.remove()); };
  }, []);

  // What the last health read found. 'no-data' means every read worked but came back empty — usually because
  // Samsung Health (or the user's tracker app) hasn't been allowed to share with Health Connect yet.
  const [healthDataState, setHealthDataState] = useState<'unknown' | 'has-data' | 'no-data'>('unknown');
  // The app that actually wrote the data ("Samsung Health"), once a read tells us.
  const [healthSource, setHealthSource] = useState<string | null>(null);

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
        const source = primarySourceLabel(rawSamples);
        if (source) setHealthSource(source);

        setHealthTrends(prev => ({
          ...prev,
          ...(stepsResult.status === 'fulfilled' && {
            steps: buildDailyPoints(toDayEntries(stepsResult.value.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS)
          }),
          ...(hrResult.status === 'fulfilled' && {
            heartRate: buildDailyPoints(toDayEntries(hrResult.value.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS)
          }),
          ...(sleepResult.status === 'fulfilled' && {
            sleep: buildDailyPoints(sleepDayEntries(sleepResult.value.samples).map(e => ({ ...e, value: Math.min(100, Math.round((e.value / (8 * 60)) * 100)) })), TRENDS_LOOKBACK_DAYS)
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
  const showNoStressNotice = noHrvFromSource && !noStressNoticeSeen;
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
        const recentWindowStart = new Date(now.getTime() - 10 * 60000).toISOString();
        const dayWindowStart = new Date(now.getTime() - 24 * 60 * 60000).toISOString();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const nowIso = now.toISOString();

        // allSettled so one metric failing doesn't stop the others updating (see the trend fetch).
        const [hrResult, hrvResult, stepsResult, sleepResult] = await Promise.allSettled([
          Health.readSamples({ dataType: 'heartRate', startDate: recentWindowStart, endDate: nowIso, limit: 1, ascending: false }),
          Health.readSamples({ dataType: 'heartRateVariability', startDate: dayWindowStart, endDate: nowIso, limit: 1, ascending: false }),
          Health.queryAggregated({ dataType: 'steps', startDate: startOfToday, endDate: nowIso, bucket: 'day', aggregation: 'sum' }),
          Health.readSamples({ dataType: 'sleep', startDate: dayWindowStart, endDate: nowIso, limit: 50 })
        ]);
        const hrSamples = settledSamples(hrResult, 'heartRate');
        const hrvSamples = settledSamples(hrvResult, 'heartRateVariability');
        if (hrvResult.status === 'fulfilled') setHrvChecked(true);
        const stepsSamples = settledSamples(stepsResult, 'steps');
        const sleepSamples = settledSamples(sleepResult, 'sleep');
        if (hrSamples.length || hrvSamples.length || stepsSamples.some(x => x.value > 0) || sleepSamples.length) setHealthDataState('has-data');

        let syncedBpm: number | null = null;
        let syncedHrv: number | null = null;
        let syncedSteps: number | null = null;
        let syncedSleepQuality: number | null = null;

        if (hrSamples.length > 0) {
          syncedBpm = Math.round(hrSamples[0].value);
          setLiveBpm(syncedBpm);
        }
        if (hrvSamples.length > 0) {
          syncedHrv = Math.round(hrvSamples[0].value);
          setLiveHrv(syncedHrv);
          const trimmedHistory = recordStressSnapshot(syncedHrv);
          setHealthTrends(prev => ({ ...prev, stress: buildDailyPoints(trimmedHistory, TRENDS_LOOKBACK_DAYS) }));
        }
        if (stepsSamples.length > 0) {
          syncedSteps = Math.round(stepsSamples[0].value);
          setLiveSteps(syncedSteps);
        }
        if (sleepSamples.length > 0) {
          const totalMinutes = totalSleepMinutes(sleepSamples);
          syncedSleepQuality = Math.min(100, Math.round((totalMinutes / (8 * 60)) * 100));
          setLiveSleepQualityPercent(syncedSleepQuality);
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

  // Hydration reminders: repeating daily local notifications at fixed times across the
  // configured shift window. Rescheduled (old ones cancelled first) whenever settings change.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !hydrationRemindersEnabled) return;
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      const hydrationNotificationIds = Array.from({ length: 24 }, (_, i) => ({ id: 9000 + i }));
      await LocalNotifications.cancel({ notifications: hydrationNotificationIds }).catch(() => {});

      const granted = await ensureNotificationPermission();
      if (!granted) return;

      const times: number[] = [];
      for (let h = shiftStartHour; h <= shiftEndHour; h += Math.max(1, hydrationIntervalHours)) times.push(h);
      if (times.length === 0) return;

      await LocalNotifications.schedule({
        notifications: times.map((hour, idx) => ({
          id: 9000 + idx,
          title: 'Time for some water',
          body: 'Time for a water break — staying hydrated keeps your energy and focus up.',
          schedule: { on: { hour, minute: 0 }, repeats: true }
        }))
      }).catch(err => console.warn('Hydration reminder scheduling failed:', err));
    })();
  }, [isLoggedIn, onboardingStep, hydrationRemindersEnabled, hydrationIntervalHours, shiftStartHour, shiftEndHour]);

  // Activity alert: if the connected device shows meaningful step activity today but nothing's
  // been logged in-app yet, nudge once (max once per day).
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData || liveSteps === null) return;
    if (!Capacitor.isNativePlatform()) return;

    const todayKey = localDayKey();
    if (lastWorkoutLoggedDate === todayKey) return;
    if (localStorage.getItem('kinetix_activity_alert_date') === todayKey) return;
    if (liveSteps < 3000) return;

    (async () => {
      const granted = await ensureNotificationPermission();
      if (!granted) return;
      await LocalNotifications.schedule({
        notifications: [{
          id: 9100,
          title: 'Log your activity',
          body: `Your connected device shows ${liveSteps} steps today — log your workout to earn XP!`,
          schedule: { at: new Date(Date.now() + 1000) }
        }]
      }).catch(err => console.warn('Activity alert scheduling failed:', err));
      localStorage.setItem('kinetix_activity_alert_date', todayKey);
    })();
  }, [isLoggedIn, onboardingStep, isLiveHealthData, liveSteps, lastWorkoutLoggedDate]);

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
    if (profile.sex === 'female') {
      if (!profile.lastPeriodStartDate) {
        return {
          id: 'BIO-6',
          metric: 'Your cycle',
          system: 'Cycle',
          reading: 'Not set up',
          status: 'Calibrating',
          behavior: 'Add your last period start date in Account → Your details',
          details: {
            title: 'Your cycle',
            description: 'Add your last period start date and average cycle length in Account → Your details to activate real cycle phase tracking.',
            subMetrics: []
          }
        };
      }
      const { phase, dayOfCycle } = computeCyclePhase(profile.lastPeriodStartDate, profile.averageCycleLength);
      return {
        id: 'BIO-6',
        metric: 'Your cycle',
        system: 'Cycle',
        reading: phase,
        status: 'Optimal',
        behavior: `Day ${dayOfCycle} of ${profile.averageCycleLength}-day cycle`,
        details: {
          title: 'Your cycle',
          description: 'Calculated from your logged last period start date and average cycle length — not a fixed value.',
          subMetrics: [
            { label: 'Current Phase', value: phase, color: 'var(--m-cycle)' },
            { label: 'Cycle Day', value: `Day ${dayOfCycle} of ${profile.averageCycleLength}`, color: 'var(--info)' }
          ]
        }
      };
    }

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
      const recoveryLabel = liveHrv > 60 && liveBpm < 80 ? 'High' : liveHrv > 45 ? 'Moderate' : 'Low — take it easy today';
      return {
        id: 'BIO-6',
        metric: 'Recovery',
        system: 'Recovery estimate',
        reading: recoveryLabel,
        status: liveHrv > 45 ? 'Optimal' : 'Critical',
        behavior: 'Derived from HRV, resting heart rate & sleep quality',
        details: {
          title: 'Recovery & Stress Load',
          description: 'This app has no way to directly measure hormone levels — this card is a recovery/stress-load estimate built from your existing HRV, heart rate and sleep data instead.',
          subMetrics: [
            { label: 'HRV', value: `${liveHrv} ms`, color: 'var(--info)' },
            { label: 'Resting Heart Rate', value: `${liveBpm} BPM`, color: 'var(--danger)' },
            { label: 'Sleep Quality', value: liveSleepQualityPercent !== null ? `${liveSleepQualityPercent}%` : '--', color: 'var(--accent)' }
          ]
        }
      };
    }

    return null;
  }, [profile.sex, profile.lastPeriodStartDate, profile.averageCycleLength, liveHrv, liveBpm, liveSleepQualityPercent, isLiveHealthData]);

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
          reading: `${liveSteps.toLocaleString('en-GB')} steps today`,
          status: 'Optimal' as const, // a real reading — the pill used to stay on "Calibrating"
          behavior: 'Synced from your device',
          details: { ...item.details, subMetrics: [{ label: 'Steps Today', value: liveSteps.toLocaleString('en-GB'), color: 'var(--accent)' }, ...item.details.subMetrics.slice(1)] }
        };
      }
      if (item.id === 'BIO-2') {
        // Heart rate needs only a heart-rate reading: HRV is extra. Samsung Health never shares HRV and an
        // iPhone without an Apple Watch has none, so requiring both left this card waiting forever.
        if (liveBpm === null) {
          return {
            ...item,
            reading: isLiveHealthData ? 'Waiting for reading…' : 'Not connected',
            status: 'Calibrating' as const,
            behavior: isLiveHealthData ? 'No recent heart rate data from your device yet' : 'Connect a device to see your real heart rate',
            details: {
              ...item.details,
              subMetrics: [
                { label: 'Resting Heart Rate', value: '--', color: 'var(--ink-3)' },
                { label: 'HRV', value: '--', color: 'var(--ink-3)' }
              ]
            }
          };
        }
        return {
          ...item,
          reading: liveHrv !== null ? `${liveBpm} BPM / ${liveHrv} ms HRV` : `${liveBpm} BPM`,
          status: liveBpm > 100 ? 'Critical' as const : 'Optimal' as const,
          behavior: liveBpm > 100 ? 'Elevated heart rate' : (isLiveHealthData ? 'Synced from your device' : 'Demo data — connect a device for real readings'),
          details: {
            ...item.details,
            subMetrics: [
              { label: 'Resting Heart Rate', value: `${liveBpm} BPM`, color: 'var(--danger)' },
              { label: 'HRV', value: liveHrv !== null ? `${liveHrv} ms` : '--', color: liveHrv !== null ? 'var(--info)' : 'var(--ink-3)' },
              { label: 'Recovery', value: liveBpm > 100 ? 'Caution' : 'Good', color: liveBpm > 100 ? 'var(--danger)' : 'var(--accent)' }
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
        if (liveSleepQualityPercent === null) {
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
          reading: liveSleepMinutes !== null ? formatMinutesAsHoursMinutes(liveSleepMinutes) : `${liveSleepQualityPercent}% Quality`,
          status: 'Optimal' as const,
          behavior: 'Synced from your device',
          details: {
            ...item.details,
            subMetrics: [
              { label: 'Time Asleep', value: liveSleepMinutes !== null ? formatMinutesAsHoursMinutes(liveSleepMinutes) : '--', color: 'var(--accent)' },
              { label: 'Sleep Quality', value: `${liveSleepQualityPercent}%`, color: 'var(--info)' }
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
  }, [biometrics, liveBpm, liveHrv, liveSteps, liveSleepQualityPercent, liveSleepMinutes, isLiveHealthData, sexCard]);

  // --- 8. GAMIFICATION ENGINE (With Custom Points & Quotas) ---
  const [xp, setXp] = useState<number>(() => parseInt(localStorage.getItem('kinetix_xp') || '0'));
  const [level, setLevel] = useState<number>(() => parseInt(localStorage.getItem('kinetix_level') || '1'));
  // Level n runs from (n-1)*500 to n*500 XP (the level-up check uses level * 500).
  const xpIntoLevel = Math.min(500, Math.max(0, xp - (level - 1) * 500));
  const [totalVoucherPoints, setTotalVoucherPoints] = useState<number>(() => parseInt(localStorage.getItem('kinetix_voucher_points') || '0'));
  const [streak, setStreak] = useState<number>(() => parseInt(localStorage.getItem('kinetix_streak') || '0'));

  const [todayTasks, setTodayTasks] = useState<Task[]>(() => getTasksForTarget(profile.target));
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // Quest completion is now server-verified (see api/complete-quest.js) and, once awarded, is a
  // one-way action for the day — the server's dedup lock means a client-side "un-complete" would
  // just desync from a server that still considers it claimed. No optimistic local completion.
  const toggleTask = async (id: string) => {
    const task = todayTasks.find(t => t.id === id);
    if (!task || task.completed || completingTaskId) return;

    setCompletingTaskId(id);
    try {
      const response = await fetch(serverUrl('/api/complete-quest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      if (!response.ok) {
        notify('error', `${data.error || 'Could not complete this quest. Please try again.'}`);
        return;
      }

      const newXp = Math.max(0, xp + data.xpAwarded);
      const newPts = Math.max(0, totalVoucherPoints + data.pointsAwarded);

      // Dynamic Athlete Level Up Check (Level Up occurs at multiples of 500 XP)
      const targetXpThreshold = level * 500;
      if (newXp >= targetXpThreshold) {
        localStorage.setItem('kinetix_level', (level + 1).toString());
        setLevel(level + 1);
        setTimeout(() => setShowLevelUpModal(true), 350);
      }

      setXp(newXp);
      setTotalVoucherPoints(newPts);
      localStorage.setItem('kinetix_xp', newXp.toString());
      localStorage.setItem('kinetix_voucher_points', newPts.toString());

      const nextTasks = todayTasks.map(t => t.id === id ? { ...t, completed: true } : t);
      setTodayTasks(nextTasks);
      setTasksCompletedTodayCount(prev => prev + 1);

      notify('success', data.verified
        ? `Quest verified from your device data: "${task.text}" · +${data.pointsAwarded} points`
        : `Quest logged: "${task.text}" · +${data.pointsAwarded} points — ${data.verificationNote}`);

      // Daily streak tracking: increments once per calendar day when all quests are completed
      if (nextTasks.length > 0 && nextTasks.every(t => t.completed)) {
        const todayKey = localDayKey();
        const lastCompletedKey = localStorage.getItem('kinetix_streak_last_date');
        if (lastCompletedKey !== todayKey) {
          const yesterdayKey = localDayKeyDaysAgo(1);
          const nextStreak = lastCompletedKey === yesterdayKey ? streak + 1 : 1;
          setStreak(nextStreak);
          localStorage.setItem('kinetix_streak', nextStreak.toString());
          localStorage.setItem('kinetix_streak_last_date', todayKey);
        }
      }
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
  const [tasksTargetSnapshot, setTasksTargetSnapshot] = useState(profile.target);
  const [tasksDateSnapshot, setTasksDateSnapshot] = useState(todayDateKey);
  if (profile.target !== tasksTargetSnapshot || todayDateKey !== tasksDateSnapshot) {
    setTasksTargetSnapshot(profile.target);
    setTasksDateSnapshot(todayDateKey);
    setTodayTasks(getTasksForTarget(profile.target));
  }

  // --- 9. LIVE Energy Balance & NHS Dietary Metrics ---
  const [dailyConsumables, setDailyConsumables] = useState({
    calories: 0,
    carbs: 0,
    protein: 0,
    fiber: 0
  });
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
    const fiber = 30; // NHS: 30g a day for adults — the same figure Nourish, Today and the plan show
    return { calories, carbs, protein, fiber };
  }, [profile]);

  const caloriesRemaining = nhsTargets.calories - dailyConsumables.calories + caloriesBurned;

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

      const toFire: { alertKey: string; title: string; body: string }[] = [];
      for (const m of metrics) {
        if (m.target <= 0) continue;
        const pct = (m.current / m.target) * 100;
        const remaining = Math.max(0, Math.round(m.target - m.current));
        if (pct >= 100 && !firedToday.includes(`${m.key}-100`)) {
          toFire.push({ alertKey: `${m.key}-100`, title: `${m.label.charAt(0).toUpperCase()}${m.label.slice(1)} goal reached`, body: `You've reached your daily ${m.label} target.` });
        } else if (pct >= 90 && !firedToday.includes(`${m.key}-90`)) {
          toFire.push({ alertKey: `${m.key}-90`, title: 'Almost there', body: `${remaining}${m.unit} of ${m.label} left to hit today's target.` });
        }
      }

      if (toFire.length === 0) return;
      const granted = await ensureNotificationPermission();
      if (!granted) return;

      await LocalNotifications.schedule({
        notifications: toFire.map((f, idx) => ({
          id: 9200 + idx,
          title: f.title,
          body: f.body,
          schedule: { at: new Date(Date.now() + 1000) }
        }))
      }).catch(err => console.warn('Nutrition alert scheduling failed:', err));

      localStorage.setItem('kinetix_nutrition_alerts_fired', JSON.stringify({ date: todayKey, keys: [...firedToday, ...toFire.map(f => f.alertKey)] }));
    })();
  }, [isLoggedIn, onboardingStep, dailyConsumables.calories, dailyConsumables.protein, dailyConsumables.fiber, nhsTargets.calories, nhsTargets.protein, nhsTargets.fiber]);

  // Diet suggestions: generic (non-branded) meal ideas that fit what's actually left today,
  // filtered against real allergens. Recomputed live as intake changes.
  const mealSuggestions = useMemo(() => {
    const remainingCalories = Math.max(0, nhsTargets.calories - dailyConsumables.calories);
    const remainingProtein = Math.max(0, nhsTargets.protein - dailyConsumables.protein);
    const remainingFiber = Math.max(0, nhsTargets.fiber - dailyConsumables.fiber);

    const candidates: { text: string; calories: number; protein: number; fiber: number; allergens: string[] }[] = [
      { text: 'Grilled chicken breast with rice and steamed broccoli', calories: 450, protein: 40, fiber: 4, allergens: [] },
      { text: 'Baked salmon with new potatoes and green beans', calories: 480, protein: 35, fiber: 5, allergens: ['fish'] },
      { text: 'Lentil and vegetable curry with brown rice', calories: 420, protein: 18, fiber: 12, allergens: [] },
      { text: 'Greek yogurt with mixed berries and a handful of oats', calories: 250, protein: 18, fiber: 6, allergens: ['milk'] },
      { text: 'Tofu and vegetable stir-fry with noodles', calories: 400, protein: 22, fiber: 6, allergens: ['soya', 'wheat'] },
      { text: 'Turkey chilli with kidney beans over rice', calories: 460, protein: 38, fiber: 10, allergens: [] },
      { text: 'Omelette with spinach and wholemeal toast', calories: 320, protein: 22, fiber: 5, allergens: ['eggs', 'wheat'] },
      { text: 'Hummus, carrot sticks and wholemeal pitta', calories: 280, protein: 10, fiber: 8, allergens: ['sesame', 'wheat'] },
      { text: 'Cottage cheese with pineapple and a rye cracker', calories: 220, protein: 20, fiber: 3, allergens: ['milk'] },
      { text: 'Mixed bean and quinoa salad with olive oil dressing', calories: 380, protein: 16, fiber: 11, allergens: [] }
    ];

    const safeCandidates = candidates.filter(c =>
      !c.allergens.some(a => profile.personalAllergens.includes(a)) &&
      c.calories <= remainingCalories + 150
    );

    return safeCandidates
      .map(c => ({ ...c, fitScore: Math.abs(c.protein - remainingProtein) + Math.abs(c.fiber - remainingFiber) + Math.abs(c.calories - remainingCalories) * 0.05 }))
      .sort((a, b) => a.fitScore - b.fitScore)
      .slice(0, 3);
  }, [nhsTargets, dailyConsumables, profile.personalAllergens]);

  // --- 10. OPTICAL INGESTION SCANNER & DIETARY MATRICES ---
  const [mealInput, setMealInput] = useState<string>('');
  const [scanResult, setScanResult] = useState<MealScanResult | null>(null);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);
  const [isScanLoading, setIsScanLoading] = useState<boolean>(false);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  const the14Allergens = [
    'peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'molluscs',
    'soya', 'wheat', 'celery', 'mustard', 'sesame', 'sulphur dioxide', 'lupin'
  ];

  // --- 11. REWARDS LEDGERS (100% Branded & White-Labeled) ---
  const [vouchers, setVouchers] = useState<VoucherLog[]>([]);

  // --- CSR CHARITY DONATIONS REGISTRY ---
  const [charityDonations, setCharityDonations] = useState<number>(() => parseInt(localStorage.getItem('kinetix_charity_donations') || '0'));
  const [isDonating, setIsDonating] = useState<boolean>(false);
  const [isRedeemingVoucher, setIsRedeemingVoucher] = useState<boolean>(false);

  const ukCharities = [
    { id: 'CHAR-NHS', name: 'NHS Charities Together', mission: 'Supporting frontline health staff, clinical equipment, and patient recovery schemes.', desc: 'Health care' },
    { id: 'CHAR-BHF', name: 'British Heart Foundation', mission: 'Funding cardiovascular health research, clinical trials, and life-saving tech.', desc: 'Heart research' },
    { id: 'CHAR-TRUSSELL', name: 'The Trussell Trust', mission: 'Stopping hunger and supporting local food banks to end poverty in the UK.', desc: 'Food banks' }
  ];

  const handleDonateToCharity = async (charityId: string, charityName: string) => {
    const requiredPoints = 1000;

    if (totalVoucherPoints < requiredPoints) {
      notify('info', `You need ${requiredPoints} points to donate. Complete quests to earn them.`);
      return;
    }

    setIsDonating(true);
    try {
      const response = await fetch(serverUrl('/api/donate-charity'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charityId, charityName, pointsValue: requiredPoints, appUserId: profile.email })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || 'Donation could not be logged. Please try again.'}`);
        return;
      }

      const newTx: VoucherLog = {
        id: `TX-DON-${new Date().getTime()}`,
        provider: charityName,
        value: '£2.50 Donation',
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
      const entitlement = info.entitlements.active['KinetixFit Pro'];
      if (entitlement) {
        const expiry = entitlement.expirationDate ? new Date(entitlement.expirationDate) : null;
        setRevenueCatStatus(`Active${expiry ? ` (renews ${expiry.toLocaleDateString('en-GB')})` : ' (Lifetime)'}`);
      } else {
        setRevenueCatStatus('No active subscription');
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

  const handleManageSubscription = async () => {
    if (!Capacitor.isNativePlatform()) {
      notify('info', 'Subscriptions are managed through your App Store or Google Play account. Open KinetixFit on your mobile device to manage your subscription.');
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

  // Restore/track the real Supabase session. If a session already exists (e.g. the app was
  // closed mid-onboarding after signing up), skip straight past Welcome/Auth rather than asking
  // an already-authenticated person to sign in again.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const advancePastAuthIfNeeded = (newSession: Session | null) => {
      setSession(newSession);
      if (newSession) {
        setOnboardingStep(prev => (prev < 3 ? 3 : prev));
      }
    };
    supabase.auth.getSession().then(({ data }) => advancePastAuthIfNeeded(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      advancePastAuthIfNeeded(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);

    if (!isSupabaseConfigured) {
      setAuthError('Sign-up/login is not configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (authMode === 'forgot') {
      setIsSubmittingAuth(true);
      const { error } = await supabase.auth.resetPasswordForEmail(emailInput, {
        redirectTo: 'https://kinetixfit.co.uk/'
      });
      setIsSubmittingAuth(false);
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthMessage('Password reset email sent — check your inbox.');
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
        ? await supabase.auth.signUp({ email: emailInput, password: passwordInput })
        : await supabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    setIsSubmittingAuth(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    if (authMode === 'signup' && !data.session) {
      setAuthMessage('Check your email to confirm your account, then log in.');
      setAuthMode('login');
      return;
    }

    saveProfileToStorage({
      ...profile,
      email: emailInput,
      name: profile.name || emailInput.split('@')[0]
    });
    setOnboardingStep(3);
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

  const handleCompleteOnboarding = () => {
    setIsLogged(true);
    localStorage.setItem('kinetix_logged_in', 'true');
    setOnboardingStep(DASHBOARD_STEP);
    openTodayFresh();
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('kinetix_logged_in');
    setIsLogged(false);
    setOnboardingStep(0);
    openTodayFresh(); // so the next sign-in doesn't reopen Account, where Log out lives
    setEmailInput('');
    setPasswordInput('');
    setAuthMode('signup');
    setAuthError(null);
    setAuthMessage(null);
  };

  const handleLogWorkout = () => {
    const label = { rest: 'Rest & Recovery', run: 'Cardio Run', cycle: 'Cycle Sprint', swim: 'Swim Laps' }[activeSportMode];
    const timestamp = new Date();
    const entry = `${label} (${timestamp.toLocaleDateString('en-GB')})`;
    saveProfileToStorage({ ...profile, workoutsLogged: [...profile.workoutsLogged, entry] });

    const todayKey = localDayKey(timestamp);
    setLastWorkoutLoggedDate(todayKey);
    localStorage.setItem('kinetix_last_workout_date', todayKey);

    notify('success', `Logged: ${entry}`);
  };

  const handleTogglePersonalAllergen = (allergen: string) => {
    const updated = profile.personalAllergens.includes(allergen)
      ? profile.personalAllergens.filter(a => a !== allergen)
      : [...profile.personalAllergens, allergen];
    saveProfileToStorage({ ...profile, personalAllergens: updated });
  };


  // Applies existing personalization (allergen flagging + target-based recommendation) to a
  // real nutrition result from /api/scan-meal, regardless of whether it came from photo or text.
  const finalizeScanResult = (
    foodName: string,
    calories: number,
    macros: { carbs: number; protein: number; fat: number; fiber: number },
    micros: { sodium: string; potassium: string; iron: string; calcium: string },
    estimated: boolean,
    estimatedPortionGrams: number,
    realAllergens?: string[]
  ) => {
    const personalChecks = profile.personalAllergens.length > 0 ? profile.personalAllergens : the14Allergens;
    // Barcode lookups carry real structured allergen data — cross-reference that directly rather
    // than the weaker substring-match-on-food-name heuristic used when no such data exists (photo/text scans).
    const flagged = realAllergens
      ? personalChecks.filter(allergen => realAllergens.includes(allergen))
      : personalChecks.filter(allergen => foodName.toLowerCase().includes(allergen));

    if (flagged.length > 0) {
      const recommendation = `Contains ${flagged.join(', ')}, which you've marked as an allergen. Try something else — the meal ideas on this page leave your allergens out.`;
      notify('warn', 'This contains one of your allergens.');

      setScanResult({
        foodName, calories, macros, micros,
        allergensFlagged: flagged,
        complianceStatus: 'HAZARD_DETECTED',
        dietaryRecommendation: recommendation,
        estimated, estimatedPortionGrams
      });
      return;
    }

    setDailyConsumables(prev => ({
      calories: prev.calories + calories,
      carbs: prev.carbs + macros.carbs,
      protein: prev.protein + macros.protein,
      fiber: prev.fiber + macros.fiber
    }));

    let recommendation: string;
    if (profile.target === 'Weight Loss') {
      recommendation = `A good fit for weight loss. Add some lean protein later today and drink a glass of water to help you stay full.`;
    } else if (profile.target === 'Weight Gain') {
      recommendation = `Logged towards your weight-gain goal. A carb-rich snack with some protein later will help you reach today's calories.`;
    } else if (profile.target === 'Cardio Endurance') {
      recommendation = `Good fuel for cardio. Drink plenty of water before and after your next session.`;
    } else { // Autonomic Recovery
      recommendation = `A steady, balanced choice for a recovery day. Add some healthy fats and keep sipping water through the day.`;
    }
    notify('success', `Logged · +${macros.fiber}g fibre towards today's ${nhsTargets.fiber}g`);

    setScanResult({
      foodName, calories, macros, micros,
      allergensFlagged: [],
      complianceStatus: 'CLEARED',
      dietaryRecommendation: recommendation,
      estimated, estimatedPortionGrams
    });
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

    setIsScanLoading(true);
    try {
      const response = await fetch(serverUrl('/api/scan-meal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodText: userInput, appUserId: profile.email })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || 'Could not scan that item. Please try again.'}`);
        return;
      }

      finalizeScanResult(data.foodName, data.calories, data.macros, data.micros, data.estimated, data.estimatedPortionGrams);
      applyPointsAwarded(data.pointsAwarded);
    } catch {
      notify('error', 'Scan failed — check your connection and try again.');
    } finally {
      setIsScanLoading(false);
    }
  };

  const handleMealScanFromPhoto = async (base64Image: string, mimeType: string) => {
    setIsCameraScanning(true);
    try {
      const response = await fetch(serverUrl('/api/scan-meal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, mimeType, appUserId: profile.email })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || 'Could not identify that photo. Please try again or enter it manually.'}`);
        return;
      }

      setShowCameraModal(false);
      setMealInput(data.foodName);
      finalizeScanResult(data.foodName, data.calories, data.macros, data.micros, data.estimated, data.estimatedPortionGrams);
      applyPointsAwarded(data.pointsAwarded);
    } catch {
      notify('error', 'Photo scan failed — check your connection and try again.');
    } finally {
      setIsCameraScanning(false);
    }
  };

  const handleBarcodeScan = async () => {
    try {
      // Lazy-loaded: this plugin bundles html5-qrcode for its web fallback, which is too heavy
      // to include in the main bundle for a feature most page loads never touch.
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
      const { ScanResult: barcode } = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.ALL });
      if (!barcode) return;

      setIsCameraScanning(true);
      const response = await fetch(serverUrl('/api/lookup-barcode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || 'Product not found — try manual entry.'}`);
        return;
      }

      setShowCameraModal(false);
      setMealInput(data.foodName);
      finalizeScanResult(data.foodName, data.calories, data.macros, data.micros, data.estimated, data.estimatedPortionGrams, data.allergens);
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
      notify('info', 'Live health sync needs the iOS or Android app. Open KinetixFit on your phone to connect.');
      return;
    }

    setIsConnectingHealth(true);
    try {
      const { available } = await Health.isAvailable();
      if (!available) {
        notify('error', "Health data isn't available on this device. Make sure Health Connect is installed (Android) or you're on a supported iOS version.");
        return;
      }

      const status = await Health.requestAuthorization({
        read: ['heartRate', 'heartRateVariability', 'restingHeartRate', 'sleep', 'steps']
      });

      if (status.readAuthorized.length === 0) {
        notify('info', "Health data access wasn't granted. You can enable it later from your device's Health settings.");
        return;
      }

      const sourceName = Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect';
      saveProfileToStorage({ ...profile, smartDeviceConnected: sourceName });
      setShowDeviceSyncModal(false);
      notify('success', `Connected to ${sourceName}. Your data can take a moment to appear.`);
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
        : '30 days of Premium are now active.' });
      await refreshRevenueCatStatus();
    } catch {
      setPromoMessage({ tone: 'error', text: 'Could not reach the server to check your code. Try again.' });
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  const triggerRewardVaultSettlement = async () => {
    if (tasksCompletedTodayCount < requiredTaskCountForRedeem) {
      notify('info', `Finish ${requiredTaskCountForRedeem} of today's quests to unlock redeeming — you've done ${tasksCompletedTodayCount} so far.`);
      return;
    }

    if (totalVoucherPoints < 2500) {
      notify('info', 'You need 2,500 points to redeem a voucher. Complete quests to earn more.');
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastRedemptionTime < 86400000) {
      notify('info', 'You can redeem one reward every 24 hours.');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: profile.email,
          userName: profile.name,
          pointBalance: totalVoucherPoints,
          simulatedCadence: 0,
          todayQuestsCompleted: tasksCompletedTodayCount
        })
      });
      const data = await response.json();

      if (!response.ok) {
        notify('error', `${data.error || data.details || 'Redemption failed. Please try again.'}`);
        return;
      }

      const newTx: VoucherLog = {
        id: `${prefix}${Math.floor(1000 + Math.random() * 9000)}`,
        provider: voucherTitle,
        value: `£${(data.valueGBP ?? 5).toFixed(2)}`,
        sku,
        state: 'Settled',
        timestamp: 'Just Now'
      };

      const newPts = totalVoucherPoints - 2500;
      setVouchers([newTx, ...vouchers]);
      setTotalVoucherPoints(newPts);
      localStorage.setItem('kinetix_voucher_points', newPts.toString());
      setLastLastRedemptionTime(Date.now());
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

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

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
            <span><strong>{nhsTargets.calories.toLocaleString('en-GB')}</strong> kcal</span>
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
  // --- NEW ONBOARDING: Welcome (1 of 2) ---
  if (!isLoggedIn && onboardingStep === 0) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="ob-container">
            <div className="ob-card ob-card-hero">
              <div className="ob-hero-panel">
                <TrackLanes />
                <div className="ob-logo">
                  <svg width="44" height="22" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="ob-wordmark">KINETIXFIT</span>
                </div>
                <h1 className="ob-hero-title">Welcome to<br /><em>KinetixFit</em></h1>
              </div>
              <p className="ob-body">Track your fitness, nutrition, and progress — all in one place.</p>
              <button onClick={() => setOnboardingStep(1)} className="ob-btn-primary">
                Get started
              </button>
              <div className="ob-dots">
                <span className="ob-dot active"></span>
                <span className="ob-dot"></span>
              </div>
            </div>
          </div>
        </div>
              </div>
    );
  }

  // --- NEW ONBOARDING: Welcome (2 of 2) ---
  if (!isLoggedIn && onboardingStep === 1) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="ob-container">
            <div className="ob-card">
              <h1 className="ob-title">What you can do</h1>
              <div className="ob-features">
                <div className="ob-feature" style={{ ['--metric' as string]: 'var(--m-heart)' }}>
                  <span className="ob-feature-icon"><HeartIcon /></span>
                  <div>
                    <strong>Health tracking</strong>
                    <p>See your real steps, heart rate, and sleep from your device.</p>
                  </div>
                </div>
                <div className="ob-feature" style={{ ['--metric' as string]: 'var(--m-steps)' }}>
                  <span className="ob-feature-icon"><CameraIcon /></span>
                  <div>
                    <strong>Food scanner</strong>
                    <p>Scan a barcode or photo to check nutrition and allergens.</p>
                  </div>
                </div>
                <div className="ob-feature" style={{ ['--metric' as string]: 'var(--m-stress)' }}>
                  <span className="ob-feature-icon"><RewardIcon /></span>
                  <div>
                    <strong>Rewards</strong>
                    <p>Earn points for healthy habits, redeem for vouchers or donations.</p>
                  </div>
                </div>
              </div>
              <div className="ob-btn-row">
                <button onClick={() => setOnboardingStep(0)} className="ob-btn-secondary">Back</button>
                <button onClick={() => setOnboardingStep(2)} className="ob-btn-primary">Continue</button>
              </div>
              <div className="ob-dots">
                <span className="ob-dot"></span>
                <span className="ob-dot active"></span>
              </div>
            </div>
          </div>
        </div>
              </div>
    );
  }

  // --- NEW ONBOARDING: Sign up / Log in / Forgot password (real Supabase Auth) ---
  if (!isLoggedIn && onboardingStep === 2) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="ob-container">
            <div className="ob-card">
              <h1 className="ob-title">
                {authMode === 'forgot' ? 'Reset your password' : authMode === 'login' ? 'Log in' : 'Create your account'}
              </h1>
              {!isSupabaseConfigured && (
                <p className="ob-error">Sign-up isn't configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
              )}
              <form onSubmit={handleAuthSubmit}>
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
                {authMode !== 'forgot' && (
                  <>
                    <label className="ob-label">Password</label>
                    <div className="ob-password">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="At least 6 characters"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="ob-input"
                        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
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
                <button type="submit" disabled={isSubmittingAuth} className="ob-btn-primary">
                  {isSubmittingAuth ? 'Please wait…' : authMode === 'forgot' ? 'Send reset email' : authMode === 'login' ? 'Log in' : 'Sign up'}
                </button>
              </form>

              {/* Google sign-in only works on the website (native needs a deep-link return that isn't built yet), and
                  on iOS offering it would also require Sign in with Apple (App Store guideline 4.8) — so apps don't show it */}
              {authMode !== 'forgot' && !Capacitor.isNativePlatform() && (
                <>
                  <div className="ob-divider">or</div>
                  <button onClick={handleGoogleSignIn} className="ob-btn-google">
                    <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
                    Continue with Google
                  </button>
                </>
              )}

              <p className="ob-footnote">
                {authMode === 'forgot' ? (
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
              <button type="button" onClick={() => setOnboardingStep(1)} className="ob-link" style={{ display: 'block', margin: '16px auto 0 auto' }}>Back</button>
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
              <ul className="ob-perm-list" aria-label="What KinetixFit reads">
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-steps)' }}><StepsIcon size={16} /></span><span><strong>Steps</strong>Your daily activity and streak</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><HeartIcon size={16} /></span><span><strong>Heart rate</strong>Recovery and stress estimates</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-sleep)' }}><SleepIcon size={16} /></span><span><strong>Sleep</strong>Nightly sleep and your trend</span></li>
              </ul>
              <p className="ob-footnote ob-perm-note">Read only — KinetixFit doesn't add or change anything in {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}.</p>
              <button onClick={handleConnectHealthSource} disabled={isConnectingHealth} className="ob-btn-primary" style={{ marginBottom: '10px' }}>
                {isConnectingHealth ? 'Connecting…' : `Connect ${Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}`}
              </button>
              <button onClick={() => setOnboardingStep(4)} className="ob-btn-secondary">
                {profile.smartDeviceConnected ? 'Continue' : 'Skip for now'}
              </button>
              {!Capacitor.isNativePlatform() && (
                <p className="ob-footnote">Live sync needs the iOS or Android app — you can skip this on the website.</p>
              )}
            </div>
          </div>
        </div>
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
              <ul className="ob-perm-list" aria-label="Reminders KinetixFit sends">
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--info)' }}><WavesIcon size={16} /></span><span><strong>Water breaks</strong>During the hours you choose</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><DumbbellIcon size={16} /></span><span><strong>Activity nudge</strong>When your steps suggest a workout to log</span></li>
                <li><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><TargetIcon size={16} /></span><span><strong>Target alerts</strong>When you're close to your protein, fibre or calories</span></li>
              </ul>
              <button
                onClick={async () => { localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY); await ensureNotificationPermission(); setOnboardingStep(5); }}
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
                  setOnboardingStep(5);
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
              <h1 className="ob-title">Any food allergies?</h1>
              <p className="ob-body" style={{ marginBottom: '18px' }}>
                Tap any you're allergic to. We'll flag them when you check a food.
              </p>

              <div className="kx-chip-wrap" style={{ marginBottom: '24px' }}>
                {the14Allergens.map(allergen => {
                  const active = profile.personalAllergens.includes(allergen);
                  return (
                    <button
                      key={allergen}
                      type="button"
                      onClick={() => handleTogglePersonalAllergen(allergen)}
                      className={`kx-chip ${active ? 'kx-chip-on' : ''}`}
                      aria-pressed={active}
                    >
                      {allergen.charAt(0).toUpperCase() + allergen.slice(1)}
                    </button>
                  );
                })}
              </div>
              <div className="ob-actions" style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setOnboardingStep(5)} className="secondary-btn" style={{ flex: 1 }}>
                  Back
                </button>
                <button onClick={handleCompleteOnboarding} className="primary-btn" style={{ flex: 1.6 }}>
                  {profile.personalAllergens.length ? 'Finish' : 'None — finish'}
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
  const heartRateBio = allBiometrics.find(b => b.id === 'BIO-2')!;
  const sleepBio = allBiometrics.find(b => b.id === 'BIO-4')!;
  const stressBio = allBiometrics.find(b => b.id === 'BIO-5')!;

  // Workouts are stored as "Label (dd/mm/yyyy)"; count the ones from the last 7 days for the Log a workout card.
  const weekAgoMs = new Date().getTime() - 7 * 86400000;
  const workoutsThisWeek = profile.workoutsLogged.filter(entry => {
    const m = entry.match(/\((\d{2})\/(\d{2})\/(\d{4})\)$/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() > weekAgoMs : false;
  }).length;

  // Account menu: grouped rows, each opening its own page; the value is a short summary of what's inside.
  const accountEmail = session?.user?.email || profile.email;
  const accountSections: { title: string; rows: { page: AccountPage; value?: string }[] }[] = [
    { title: 'Profile', rows: [
      { page: 'details' },
      { page: 'allergies', value: profile.personalAllergens.length ? `${profile.personalAllergens.length} selected` : 'None' }
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
          <div key={motivationMessage.text} className={`alert-ticker tone-${motivationMessage.tone}`} role="status" aria-live="polite" onClick={() => setMotivationMessage(null)}>
            <span className="alert-ticker-icon"><MessageIcon tone={motivationMessage.tone} size={14} /></span>
            <span>{motivationMessage.text}</span>
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
                <h1 className="app-brand-title">KINETIXFIT</h1>
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
                {streak > 0 && (
                  <div className="kx-hero-foot">
                    <div className="kx-lap" aria-label={`${streak}-day streak`}>
                      <span className="kx-lap-num">{streak}</span>
                      <span className="kx-lap-label">day streak</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Connected, but Health Connect is empty — almost always a tracker app that isn't allowed to share yet */}
              {isLiveHealthData && healthDataState === 'no-data' && Capacitor.getPlatform() === 'android' && (
                <div className="hub-support-card kx-setup-card">
                  <span className="vitals-label">One more step</span>
                  <h3 className="card-header-title">
                    {isSamsungDevice() ? 'Let Samsung Health share your data' : 'Let your tracker app share its data'}
                  </h3>
                  <p className="card-header-desc">
                    {isSamsungDevice()
                      ? 'KinetixFit is connected to Health Connect, but nothing from Samsung Health has arrived yet. Samsung Health only shares activity recorded after you allow it — older days stay in Samsung Health.'
                      : 'KinetixFit is connected to Health Connect, but no app is sharing steps, heart rate or sleep with it yet.'}
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
                  <h3 className="card-header-title">Let KinetixFit read Apple Health</h3>
                  <p className="card-header-desc">
                    Nothing has arrived from Apple Health yet. Apple doesn’t tell apps whether reading was allowed, so if you
                    skipped any categories when asked, they stay off until you turn them on.
                  </p>
                  <ol className="kx-steps">
                    <li>Tap <strong>Open Health</strong>, then your <strong>profile picture</strong> at the top right.</li>
                    <li>Under Privacy, tap <strong>Apps</strong>, then <strong>KinetixFit</strong>, and choose <strong>Turn On All</strong>.</li>
                    <li>Come back here. Your iPhone counts steps on its own; heart rate and sleep need an Apple Watch or another tracker.</li>
                  </ol>
                  <div className="kx-setup-actions">
                    <button type="button" className="primary-btn" onClick={openAppleHealth}>Open Health</button>
                    <button type="button" className="edit-bio-btn" onClick={() => setForegroundTick(t => t + 1)}>Check again</button>
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
                  trend={healthTrends.steps}
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
                <BiometricTrendCard
                  icon={<SleepIcon />}
                  title="Sleep"
                  status={sleepBio.status}
                  behavior={sleepBio.behavior}
                  latestReading={String(sleepBio.reading)}
                  subMetrics={sleepBio.details.subMetrics}
                  trend={healthTrends.sleep}
                  unit="%"
                  color="var(--m-sleep)"
                  chartType="bar"
                  isTrackable={isLiveHealthData}
                  minPoints={1}
                  expanded={expandedTrendId === 'BIO-4'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-4' ? null : 'BIO-4')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
                {!noHrvFromSource && (
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

              </div> {/* End Left Panel */}

              <div className="vitals-right-panel">
              {/* Workout logging — a real log entry, independent of live heart rate/HRV data */}
              <div className="ecg-module-card kx-workout-card">
                <div className="kx-card-head">
                  <h3 className="ecg-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><DumbbellIcon size={16} /></span>Log a workout</h3>
                  {workoutsThisWeek > 0 && <span className="kx-count">{workoutsThisWeek} this week</span>}
                </div>
                <p className="kx-card-sub">Counts towards your streak and today's quests.</p>
                <div className="kx-activity-grid" role="radiogroup" aria-label="Activity">
                  {WORKOUT_MODES.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      role="radio"
                      aria-checked={activeSportMode === mode.id}
                      onClick={() => { if (activeSportMode !== mode.id) hapticSelection(); setActiveSportMode(mode.id); }}
                      className={`kx-activity ${activeSportMode === mode.id ? 'is-on' : ''}`}
                    >
                      <span className="kx-activity-icon">{mode.icon}</span>
                      <span className="kx-activity-label">{mode.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={handleLogWorkout} className="primary-btn">
                  Log {WORKOUT_MODES.find(m => m.id === activeSportMode)!.label.toLowerCase()}
                </button>
              </div>

                {sexCard && (profile.sex === 'female' || isLiveHealthData) && !(noHrvFromSource && sexCard.id === 'BIO-6') && (
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

          {/* ==================== TAB 2: NOURISH (QUANTUM SPECTRAL SCANNERS) ==================== */}
          {activeTab === 'nourish' && (
            <div className="tab-fade-in kx-nourish-grid">

              {/* Daily macro counters */}
              <div className="nourish-summary-card">
                <span className="vitals-label">Today · your targets</span>
                <h3 className="nourish-calories-remaining" style={{ color: caloriesRemaining > 0 ? 'var(--ink)' : 'var(--danger)' }}>
                  {Math.abs(caloriesRemaining).toLocaleString('en-GB')}
                  <span className="kx-unit">{caloriesRemaining > 0 ? 'kcal left' : 'kcal over'}</span>
                </h3>

                {/* Macro progress meters */}
                <div className="macro-meters-stack">
                  <div className="macro-progress-bar">
                    <div className="macro-bar-header">
                      <span>Fibre</span>
                      <strong>{dailyConsumables.fiber}g <span className="kx-of">/ {nhsTargets.fiber}g</span></strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill green-fill" style={{ width: `${Math.min(100, (dailyConsumables.fiber / 30) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="macro-progress-bar">
                    <div className="macro-bar-header">
                      <span>Protein</span>
                      <strong>{dailyConsumables.protein}g <span className="kx-of">/ {nhsTargets.protein}g</span></strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill blue-fill" style={{ width: `${Math.min(100, (dailyConsumables.protein / nhsTargets.protein) * 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Suggested Next Meal — generic food ideas fitted to what's actually left today */}
              {mealSuggestions.length > 0 && (
                <div className="scanner-module-card">
                  <h3 className="card-header-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--good)' }}><BowlIcon size={16} /></span>Ideas for your next meal</h3>
                  <p className="card-header-desc">
                    Picked to fit what you have left today, with your allergens left out.
                  </p>
                  <div className="kx-meal-list">
                    {mealSuggestions.map((s, idx) => (
                      <div key={idx} className="kx-meal">
                        <span className="kx-meal-name">{s.text}</span>
                        <span className="kx-meal-meta">
                          <span>{s.calories} kcal</span><span>{s.protein}g protein</span><span>{s.fiber}g fibre</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

                <div className="kx-food-suggest" aria-label="Try one">
                  <span>Try</span>
                  {FOOD_SUGGESTIONS.map(food => (
                    <button key={food} type="button" className="kx-chip kx-chip-sm" disabled={isScanLoading}
                      onClick={() => { setMealInput(food); handleMealScan(food); }}>
                      {food}
                    </button>
                  ))}
                </div>

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

                {scanResult && (
                  <div className={`kx-food-result ${scanResult.complianceStatus === 'HAZARD_DETECTED' ? 'is-warning' : 'is-clear'}`} aria-live="polite">
                    <span className="kx-food-status">
                      {scanResult.complianceStatus === 'HAZARD_DETECTED'
                        ? `Contains ${scanResult.allergensFlagged.join(', ')}`
                        : profile.personalAllergens.length ? 'None of your allergens' : 'Checked'}
                    </span>
                    <div className="kx-food-title">
                      <h4>{scanResult.foodName}</h4>
                      {scanResult.estimated && <span className="kx-food-portion">~{scanResult.estimatedPortionGrams} g, estimated</span>}
                    </div>
                    <p className="kx-food-kcal"><strong>{scanResult.calories.toLocaleString('en-GB')}</strong> kcal</p>
                    <div className="kx-food-macros">
                      <span><strong>{scanResult.macros.carbs}g</strong>carbs</span>
                      <span><strong>{scanResult.macros.protein}g</strong>protein</span>
                      <span><strong>{scanResult.macros.fiber}g</strong>fibre</span>
                      <span><strong>{scanResult.macros.fat}g</strong>fat</span>
                    </div>
                    <dl className="kx-food-minerals">
                      <div><dt>Sodium</dt><dd>{scanResult.micros.sodium}</dd></div>
                      <div><dt>Potassium</dt><dd>{scanResult.micros.potassium}</dd></div>
                      <div><dt>Iron</dt><dd>{scanResult.micros.iron}</dd></div>
                      <div><dt>Calcium</dt><dd>{scanResult.micros.calcium}</dd></div>
                    </dl>
                    <div className="kx-food-note">
                      <strong>What this means for you</strong>
                      <p>{scanResult.dietaryRecommendation}</p>
                    </div>
                    <p className="kx-food-logged">
                      {scanResult.complianceStatus === 'HAZARD_DETECTED' ? 'Not added to today — it has one of your allergens.' : "Added to today's totals above."}
                    </p>
                  </div>
                )}
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
                    <div className="kx-level-track" role="progressbar" aria-label={`Level ${level} progress`} aria-valuemin={0} aria-valuemax={500} aria-valuenow={xpIntoLevel}>
                      <span style={{ ['--fill' as string]: xpIntoLevel / 500 }} />
                    </div>
                    <p className="kx-hero-status">{(500 - xpIntoLevel).toLocaleString('en-GB')} XP to level {level + 1}</p>
                  </div>
                  <div className="kx-hero-foot">
                    {streak === 0 && profile.workoutsLogged.length === 0 ? (
                      <p className="kx-hero-status">Log a workout or finish a quest to start your streak.</p>
                    ) : (
                      <div className="kx-stat-row">
                        <div className="kx-lap"><span className="kx-lap-num">{streak}</span><span className="kx-lap-label">day streak</span></div>
                        <div className="kx-lap"><span className="kx-lap-num">{profile.workoutsLogged.length}</span><span className="kx-lap-label">workouts</span></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Smart Point balances Tracker */}
                <div className="rewards-summary-card">
                  <span className="vitals-label">Your points</span>
                  <h3 className="rewards-wallet-balance">{totalVoucherPoints.toLocaleString('en-GB')}<span className="kx-unit">pts</span></h3>
                  <div className="kx-progress" role="progressbar" aria-label="Points towards a charity donation" aria-valuemin={0} aria-valuemax={CHARITY_DONATION_POINTS} aria-valuenow={Math.min(totalVoucherPoints, CHARITY_DONATION_POINTS)}>
                    <span style={{ ['--fill' as string]: Math.min(1, totalVoucherPoints / CHARITY_DONATION_POINTS) }} />
                  </div>
                  <p className="kx-card-sub" style={{ marginTop: '10px' }}>
                    {totalVoucherPoints >= CHARITY_DONATION_POINTS
                      ? 'Enough to give £2.50 to a UK charity — see Give to charity below.'
                      : `${(CHARITY_DONATION_POINTS - totalVoucherPoints).toLocaleString('en-GB')} pts until you can give £2.50 to a UK charity. Quests below earn points.`}
                  </p>
                </div>

                {/* Today's Gamified Quests list */}
                <div className="quests-card">
                  <div className="quests-header">
                    <h3 className="quests-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--accent)' }}><TargetIcon size={16} /></span>Today's quests</h3>
                    <span className="kx-count">{tasksCompletedTodayCount} of {todayTasks.length} done</span>
                  </div>
                  <div className="quests-list-stack">
                    {todayTasks.map(t => {
                      const isVerifying = completingTaskId === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleTask(t.id)}
                          className={`quest-item-pill ${t.completed ? 'quest-item-completed' : ''}`}
                          style={{ cursor: t.completed || isVerifying ? 'default' : 'pointer', opacity: isVerifying ? 0.6 : 1 }}
                        >
                          <div className="kx-quest-main">
                            <span className="kx-check" aria-hidden="true" />
                            <span className="kx-quest-text">{isVerifying ? 'Checking…' : t.text}</span>
                          </div>
                          <strong className="kx-quest-pts">+{t.pointsValue}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                {/* Achievements / Badges Gallery — computed live from existing tracked data */}
                <div className="quests-card">
                  <div className="quests-header">
                    <h3 className="quests-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--warn)' }}><TrophyIcon size={16} /></span>Achievements</h3>
                  </div>
                  <div className="badges-gallery-grid">
                    {[
                      { id: 'first-steps', label: 'First workout', icon: <StepsIcon size={24} />, unlocked: profile.workoutsLogged.length >= 1 },
                      { id: 'dedicated', label: '5 workouts', icon: <DumbbellIcon size={24} />, unlocked: profile.workoutsLogged.length >= 5 },
                      { id: 'streak-3', label: '3-day streak', icon: <FlameIcon size={24} />, unlocked: streak >= 3 },
                      { id: 'streak-7', label: '7-day streak', icon: <FlameIcon size={24} />, unlocked: streak >= 7 },
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

                {/* Accrued Point Validator Accelerometer controls */}
                <div className="biopoint-validator-card">
                  <h3 className="card-header-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-steps)' }}><StepsIcon size={16} /></span>How step points work</h3>
                  <p className="validator-desc">
                    Steps only earn points at a real walking or running pace (under 350 steps a minute), read from your connected device. Shaking the phone doesn't count.
                  </p>
                </div>

                {/* Kinetix Rewards Vault Card (Gateway selection) */}
                <div className="rewards-redemption-card">
                  <div className="rewards-redemption-header">
                    <div>
                      <h3 className="redemption-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--info)' }}><GiftIcon size={16} /></span>Rewards</h3>
                      <span className="charity-subtitle">Swap points for vouchers</span>
                    </div>
                    <button onClick={triggerRewardVaultSettlement} disabled={isRedeemingVoucher || totalVoucherPoints < 2500} className="redeem-rewards-btn">
                      {isRedeemingVoucher ? 'Redeeming…' : totalVoucherPoints < 2500 ? '2,500 pts to redeem' : 'Redeem · 2,500 pts'}
                    </button>
                  </div>


                  {/* Redeemed vouchers */}
                  {vouchers.length === 0 ? (
                    <div className="kx-empty"><span className="kx-empty-icon"><GiftIcon size={22} /></span><p>Vouchers are launching soon. Anything you redeem will appear here.</p></div>
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

                {/* UK Social Philanthropy match portal */}
                <div className="charity-matching-card">
                  <div className="charity-card-header">
                    <div>
                      <h3 className="charity-title"><span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><HeartIcon size={16} /></span>Give to charity</h3>
                      <span className="charity-subtitle">Turn points into a real donation to a UK charity.</span>
                    </div>
                    <span className="donations-count-pill">{charityDonations} given</span>
                  </div>

                  <div className="charity-options-grid">
                    {ukCharities.map(charity => (
                      <div key={charity.id} className="charity-item-subcard">
                        <div>
                          <span className="charity-item-tag">{charity.desc}</span>
                          <h4 className="charity-item-name">{charity.name}</h4>
                          <p className="charity-item-mission">{charity.mission}</p>
                        </div>
                        <button onClick={() => handleDonateToCharity(charity.id, charity.name)} disabled={isDonating} className="donate-points-btn">
                          {isDonating ? 'Donating…' : 'Donate 1,000 pts · £2.50'}
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
                  <ProfileSettingsList profile={profile} onChange={patchProfile} />
                </div>
              )}

              {accountPage === 'allergies' && (
                <div className="scanner-module-card">
                  <p className="card-header-desc">
                    Tap any you have. The food check flags them and meal ideas leave them out.
                  </p>
                  <div className="kx-chip-wrap">
                    {the14Allergens.map(allergen => {
                      const active = profile.personalAllergens.includes(allergen);
                      return (
                        <button
                          key={allergen}
                          type="button"
                          onClick={() => handleTogglePersonalAllergen(allergen)}
                          className={`kx-chip ${active ? 'kx-chip-on' : ''}`}
                          aria-pressed={active}
                        >
                          {allergen.charAt(0).toUpperCase() + allergen.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {accountPage === 'devices' && (
                <div className="biopoint-validator-card">
                  <p className="validator-desc">
                    {!profile.smartDeviceConnected
                      ? 'Connect your wearable device to sync your activity, heart rate, and sleep data automatically.'
                      : healthDataState === 'no-data'
                        ? (Capacitor.getPlatform() === 'ios'
                          ? `Connected to ${profile.smartDeviceConnected}, but nothing has arrived yet — check KinetixFit is allowed to read your data in the Health app (profile picture → Apps → KinetixFit).`
                          : `Connected to ${profile.smartDeviceConnected}, but no app is sharing data with it yet.`)
                        : `Syncing activity, heart rate and sleep from ${healthSource ? `${healthSource} via ${profile.smartDeviceConnected}` : profile.smartDeviceConnected}.`}
                  </p>
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
                      onChange={async (e) => {
                        const on = e.target.checked;
                        setHydrationRemindersEnabled(on);
                        localStorage.setItem('kinetix_hydration_enabled', on.toString());
                        if (!on || !Capacitor.isNativePlatform()) return;
                        // turning reminders on is an explicit yes — ask now if we haven't been allowed yet
                        localStorage.removeItem(NOTIFICATIONS_SKIPPED_KEY);
                        if (!(await ensureNotificationPermission())) {
                          setHydrationRemindersEnabled(false);
                          localStorage.setItem('kinetix_hydration_enabled', 'false');
                          notify('warn', Capacitor.getPlatform() === 'ios'
                            ? 'Notifications are off for KinetixFit. Turn them on in Settings → Notifications → KinetixFit.'
                            : 'Notifications are off for KinetixFit. Turn them on in your phone’s Settings → Notifications.');
                        }
                      }}
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
                    Activity and nutrition-target alerts are always on (native app only) and fire at most once per event per day — no spam. You'll be asked to allow notifications the first time one of these actually needs to fire.
                  </p>
                </div>
              )}

              {accountPage === 'subscription' && (
                <div className="hub-billing-card">
                  <span className="vitals-label">Your plan</span>
                  <p className="billing-status-title">{revenueCatStatus ?? 'KinetixFit Premium'}</p>
                  {/* Price and trial are in the boxes below; the web can only point people to the apps */}
                  {!Capacitor.isNativePlatform() && (
                    <p className="billing-disclaimer">Start your free trial in the KinetixFit app for Android or iPhone.</p>
                  )}
                  <button
                    onClick={handleManageSubscription}
                    className="edit-bio-btn"
                  >
                    Manage subscription
                  </button>

                  {/* Allocations columns */}
                  <div className="billing-stats-row">
                    <div className="billing-stat-box">
                      <span>Price</span>
                      <strong>£14.99 / month</strong>
                      <p>Billed through your app store account.</p>
                    </div>
                    <div className="billing-stat-box">
                      <span>Free trial</span>
                      <strong>7 days</strong>
                      <p>Manage or cancel from the button above.</p>
                    </div>
                  </div>
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
                      KinetixFit helps you track your fitness, nutrition, and rewards all in one place.
                    </p>
                  </div>
                  <div className="legal-block-card">
                    <h3 className="legal-card-title">Not a medical device</h3>
                    <p className="legal-card-text">
                      KinetixFit is a fitness and nutrition tracking app, not a certified medical device. It doesn't replace professional medical advice — always consult a doctor before starting a new fitness or diet plan.
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
                setTotalVoucherPoints(prev => {
                  const next = prev + 500; // level-up bonus
                  localStorage.setItem('kinetix_voucher_points', next.toString());
                  return next;
                });
                notify('success', 'Level-up bonus: +500 points added to your rewards.');
              }}
              className="primary-btn"
              style={{ width: '100%', marginTop: '15px', padding: '12px 20px' }}
            >
              Claim +500 points
            </button>
          </div>
        </div>
      )}

      {/* --- SMART SENSOR SYNC MODAL --- */}
      {showDeviceSyncModal && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card">
            <h3 className="modal-title">Connect a device</h3>
            <p className="modal-desc">
              KinetixFit reads your steps, heart rate and sleep from your phone's health app.
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
              <p>Your watch, ring or chest strap already sends its data to Apple Health or Health Connect. KinetixFit reads it from there, so one connection covers every device you own.</p>
              {Capacitor.getPlatform() === 'android' && isSamsungDevice() && (
                <p>On Samsung phones, Samsung Health also has to be allowed to share with Health Connect — KinetixFit shows you how if nothing arrives.</p>
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
            <h3 id="kx-logout-title" className="modal-title">Log out of KinetixFit?</h3>
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
              KinetixFit estimates stress from heart-rate variability (HRV), and Samsung Health doesn’t share HRV with
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

                {/* Real barcode scan */}
                <button
                  onClick={handleBarcodeScan}
                  className="primary-btn"
                >
                  Scan barcode
                </button>

                {/* Real photo capture */}
                <input
                  ref={photoFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
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
                    className="secondary-btn"
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
