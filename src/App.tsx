import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Purchases, type CustomerInfo } from '@revenuecat/purchases-capacitor';
import { Health } from '@capgo/capacitor-health';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { serverUrl } from './lib/server';
import type { Session } from '@supabase/supabase-js';
import BiometricTrendCard, { type DailyPoint } from './components/BiometricTrendCard';
import { StepsIcon, HeartIcon, SleepIcon, StressIcon, CameraIcon, RewardIcon, BellIcon } from './components/Icons';
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

interface UserProfile {
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
}

// Onboarding step index at which the real dashboard becomes visible. Steps: 0-1 Welcome,
// 2 Sign up/Log in, 3 Health permission, 4 Notifications permission, 5 Profile, 6 Allergies.
const DASHBOARD_STEP = 7;

// Bottom-nav order; the sliding indicator's position is this index.
const TAB_IDS = ['vitals', 'nourish', 'profile', 'hub'];



// How many days of history the 7/30-day trend graphs fetch/keep. Health Connect and HealthKit
// both hold far more than this; 30 is just the widest range the UI currently offers.
const TRENDS_LOOKBACK_DAYS = 30;
const STRESS_HISTORY_STORAGE_KEY = 'kinetix_stress_history';

// Turns aggregated device-history samples into { day, value } entries keyed by calendar day,
// ready for buildDailyPoints. Rounding/unit conversion (e.g. sleep minutes -> quality %) happens
// at the call site since it differs per metric.
function toDayEntries(samples: { startDate: string; value: number }[]): { day: string; value: number }[] {
  return samples.map(s => ({ day: new Date(s.startDate).toISOString().slice(0, 10), value: s.value }));
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
    const key = d.toISOString().slice(0, 10);
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
  const today = new Date().toISOString().slice(0, 10);
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
  averageCycleLength: 28
};

const ACTIVITY_MULTIPLIERS: Record<UserProfile['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

const GOAL_CALORIE_ADJUSTMENT: Record<UserProfile['target'], number> = {
  'Weight Loss': -500,
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

// Mifflin-St Jeor equation. Falls back to the midpoint of the male/female offset when sex is unset.
function calculateBmr(p: UserProfile): number {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  if (p.sex === 'male') return base + 5;
  if (p.sex === 'female') return base - 161;
  return base - 78;
}

const DAILY_QUOTES = [
  "Every step counts — you're doing better than you think.",
  "Progress isn't always visible, but it's always real.",
  "Today's a good day to be a little stronger than yesterday.",
  "You don't have to be perfect, just consistent.",
  "Small wins add up to big changes.",
  "Rest is part of the plan, not a break from it.",
  "You showed up — that's the hard part done.",
  "Your only competition is who you were yesterday.",
  "One good choice at a time. That's all it takes.",
  "Strength grows in the moments you almost gave up.",
  "You're allowed to go at your own pace.",
  "Consistency beats intensity, every time.",
  "Take care of your body — it's the only one you get.",
  "A little progress each day adds up to big results.",
  "You're closer than you were this morning.",
  "Some days are about pushing hard. Today can be about showing up.",
  "Every healthy choice is a vote for the person you're becoming.",
  "You don't need to feel motivated to take one small step.",
  "Recovery is where the real progress happens.",
  "Be proud of showing up, not just the results.",
  "The best workout is the one you actually do.",
  "Your body hears everything your mind says — be kind to it.",
  "Discipline is just remembering what you actually want.",
  "You're allowed to start small. Starting is what matters.",
  "Good habits compound quietly, then all at once.",
  "There's no finish line — just today's next good decision.",
  "You've survived 100% of your hardest days so far.",
  "Energy comes from moving, even when you don't feel like it.",
  "Celebrate the small stuff — it's not actually small.",
  "You're building something today that future-you will thank you for.",
  "Not every day has to be your best — just your honest one.",
  "Sleep, food, movement — small care adds up to a lot.",
  "You're not behind. You're exactly where you need to start from.",
  "Momentum starts with one step you almost skipped.",
  "Your effort counts even on the days it doesn't show.",
  "Be the reason today was a little better than yesterday.",
  "Growth is quiet most days — trust the process.",
  "You get to decide what today looks like. Make it count.",
  "It's okay to go slow — you're still moving forward.",
  "The version of you a year from now is built today."
];

function getDailyQuote(): string {
  // Deterministic on the calendar date — no storage needed, same quote all day for everyone,
  // changes automatically at midnight without any caching logic to get stale.
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function getTasksForTarget(target: UserProfile['target']): Task[] {
  if (target === 'Weight Loss') {
    return [
      { id: 'TOD-1', text: 'Hit your calorie deficit goal today 🔥', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'nutrition' },
      { id: 'TOD-2', text: 'Fuel up with 10g+ fiber in one meal 🌾', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'nutrition' },
      { id: 'TOD-3', text: 'Log a 45-min cardio session 🏃‍♂️', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'activity' }
    ];
  }
  if (target === 'Weight Gain') {
    return [
      { id: 'TOD-1', text: 'Smash your 150g protein target 💪', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'nutrition' },
      { id: 'TOD-2', text: 'Log your carb intake for the day 🍚', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'nutrition' },
      { id: 'TOD-3', text: 'Get a strength session in 🏋️', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'activity' }
    ];
  }
  if (target === 'Cardio Endurance') {
    return [
      { id: 'TOD-1', text: 'Nail your step intervals today 🏃', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'activity' },
      { id: 'TOD-2', text: 'Push your heart rate into peak zone 📈', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'activity' },
      { id: 'TOD-3', text: 'Hit 2.5L of water today 💧', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'unverifiable_by_design' }
    ];
  }
  return [
    { id: 'TOD-1', text: 'Complete a 15-minute breathing session 🌬️', completed: false, xpValue: 150, pointsValue: 220, verificationType: 'recovery' },
    { id: 'TOD-2', text: 'Check your sleep quality score 😴', completed: false, xpValue: 100, pointsValue: 150, verificationType: 'recovery' },
    { id: 'TOD-3', text: 'Keep your stress load low today 🧘‍♂️', completed: false, xpValue: 120, pointsValue: 180, verificationType: 'recovery' }
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
  const [onboardingStep, setOnboardingStep] = useState<number>(0);
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'forgot'>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);

  // --- 2. ACTIVE NAVIGATION TAB (Sync with URL Hash to support Browser Back Button) ---
  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    return ['vitals', 'nourish', 'profile', 'hub'].includes(hash) ? hash : 'vitals';
  });

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
      const hash = window.location.hash.replace('#', '');
      if (['vitals', 'nourish', 'profile', 'hub'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Set URL hash when tab is switched via clicking bottoms navigation icons
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };

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
  const ensureNotificationPermission = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
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

  // --- 5. DYNAMIC MOTIVATION POPUPS & REVENUE DEFENSE CONTROLS ---
  const [motivationMessage, setMotivationMessage] = useState<string | null>('Welcome back!');

  const [lastRedemptionTime, setLastLastRedemptionTime] = useState<number>(0);
  const [requiredTaskCountForRedeem] = useState<number>(2); // Multi-step validation defense
  const [tasksCompletedTodayCount, setTasksCompletedTodayCount] = useState<number>(0);

  // --- 6. LIVE HEART RATE / HRV STATE ---
  // null until a real device reading arrives — no demo/simulated data is ever substituted here,
  // so a disconnected user always sees an honest "connect a device" state, never a fake number.
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [liveHrv, setLiveHrv] = useState<number | null>(null);

  // --- 7-DAY/30-DAY HEALTH TRENDS (real device history, plus a locally-persisted HRV/stress log) ---
  // Stress has no queryable device history (it's an estimate derived from HRV, not a stored
  // health metric), so its initial value is read from our own local, honest record here —
  // built up one real day at a time from here on, rather than a backdated trend that never happened.
  const [healthTrends, setHealthTrends] = useState<{ steps: DailyPoint[]; heartRate: DailyPoint[]; sleep: DailyPoint[]; stress: DailyPoint[] }>(() => ({
    steps: [], heartRate: [], sleep: [], stress: buildDailyPoints(loadStressHistory(), TRENDS_LOOKBACK_DAYS)
  }));
  const [trendRangeDays, setTrendRangeDays] = useState<7 | 30>(7);
  const [expandedTrendId, setExpandedTrendId] = useState<string | null>(null);

  // Real steps/heart-rate/sleep history from HealthKit/Health Connect once a device is connected.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData) return;

    const fetchHealthTrends = async () => {
      try {
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - (TRENDS_LOOKBACK_DAYS - 1));
        startDate.setHours(0, 0, 0, 0);

        const [stepsResult, hrResult, sleepResult] = await Promise.all([
          Health.queryAggregated({ dataType: 'steps', startDate: startDate.toISOString(), endDate: now.toISOString(), bucket: 'day', aggregation: 'sum' }),
          Health.queryAggregated({ dataType: 'heartRate', startDate: startDate.toISOString(), endDate: now.toISOString(), bucket: 'day', aggregation: 'average' }),
          Health.queryAggregated({ dataType: 'sleep', startDate: startDate.toISOString(), endDate: now.toISOString(), bucket: 'day', aggregation: 'sum' })
        ]);

        setHealthTrends(prev => ({
          ...prev,
          steps: buildDailyPoints(toDayEntries(stepsResult.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS),
          heartRate: buildDailyPoints(toDayEntries(hrResult.samples).map(e => ({ ...e, value: Math.round(e.value) })), TRENDS_LOOKBACK_DAYS),
          sleep: buildDailyPoints(toDayEntries(sleepResult.samples).map(e => ({ ...e, value: Math.min(100, Math.round((e.value / (8 * 60)) * 100)) })), TRENDS_LOOKBACK_DAYS)
        }));
      } catch (err) {
        console.warn('Health trend fetch failed:', err);
      }
    };

    fetchHealthTrends();
    const interval = setInterval(fetchHealthTrends, 30 * 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn, onboardingStep, isLiveHealthData]);

  // Real periodic reads from HealthKit/Health Connect once a device is actually connected.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP || !isLiveHealthData) return;

    const readLiveHealthData = async () => {
      try {
        const now = new Date();
        const recentWindowStart = new Date(now.getTime() - 10 * 60000).toISOString();
        const dayWindowStart = new Date(now.getTime() - 24 * 60 * 60000).toISOString();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const nowIso = now.toISOString();

        const [hrResult, hrvResult, stepsResult, sleepResult] = await Promise.all([
          Health.readSamples({ dataType: 'heartRate', startDate: recentWindowStart, endDate: nowIso, limit: 1, ascending: false }),
          Health.readSamples({ dataType: 'heartRateVariability', startDate: dayWindowStart, endDate: nowIso, limit: 1, ascending: false }),
          Health.queryAggregated({ dataType: 'steps', startDate: startOfToday, endDate: nowIso, bucket: 'day', aggregation: 'sum' }),
          Health.readSamples({ dataType: 'sleep', startDate: dayWindowStart, endDate: nowIso, limit: 50 })
        ]);

        let syncedBpm: number | null = null;
        let syncedHrv: number | null = null;
        let syncedSteps: number | null = null;
        let syncedSleepQuality: number | null = null;

        if (hrResult.samples.length > 0) {
          syncedBpm = Math.round(hrResult.samples[0].value);
          setLiveBpm(syncedBpm);
        }
        if (hrvResult.samples.length > 0) {
          syncedHrv = Math.round(hrvResult.samples[0].value);
          setLiveHrv(syncedHrv);
          const trimmedHistory = recordStressSnapshot(syncedHrv);
          setHealthTrends(prev => ({ ...prev, stress: buildDailyPoints(trimmedHistory, TRENDS_LOOKBACK_DAYS) }));
        }
        if (stepsResult.samples.length > 0) {
          syncedSteps = Math.round(stepsResult.samples[0].value);
          setLiveSteps(syncedSteps);
        }
        if (sleepResult.samples.length > 0) {
          const totalMinutes = sleepResult.samples.reduce((sum, s) => {
            return sum + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
          }, 0);
          syncedSleepQuality = Math.min(100, Math.round((totalMinutes / (8 * 60)) * 100));
          setLiveSleepQualityPercent(syncedSleepQuality);
          setLiveSleepMinutes(Math.round(totalMinutes));
        }

        // Push this reading to the server so quest completion can be verified against it —
        // previously this data never left the device at all.
        fetch(serverUrl('/api/sync-health-data'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appUserId: profile.email,
            steps: syncedSteps,
            liveBpm: syncedBpm,
            liveHrv: syncedHrv,
            sleepQualityPercent: syncedSleepQuality
          })
        }).catch(err => console.warn('Health data sync failed:', err));
      } catch (err) {
        console.warn('Health data read failed:', err);
      }
    };

    readLiveHealthData();
    const interval = setInterval(readLiveHealthData, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn, onboardingStep, isLiveHealthData, profile.email]);

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
          title: '💧 Hydration Check-In',
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

    const todayKey = new Date().toISOString().slice(0, 10);
    if (lastWorkoutLoggedDate === todayKey) return;
    if (localStorage.getItem('kinetix_activity_alert_date') === todayKey) return;
    if (liveSteps < 3000) return;

    (async () => {
      const granted = await ensureNotificationPermission();
      if (!granted) return;
      await LocalNotifications.schedule({
        notifications: [{
          id: 9100,
          title: '🏃 Log Your Activity',
          body: `Your connected device shows ${liveSteps} steps today — log your workout to earn XP!`,
          schedule: { at: new Date(Date.now() + 1000) }
        }]
      }).catch(err => console.warn('Activity alert scheduling failed:', err));
      localStorage.setItem('kinetix_activity_alert_date', todayKey);
    })();
  }, [isLoggedIn, onboardingStep, isLiveHealthData, liveSteps, lastWorkoutLoggedDate]);

  // --- 7. CORE HEALTH TELEMETRY ARRAY ---
  const [biometrics, setBiometrics] = useState<TelemetryStream[]>([
    {
      id: 'BIO-1',
      metric: 'Activity and Movement',
      system: 'Steps',
      reading: 'Not connected',
      status: 'Calibrating',
      behavior: 'Connect a device in Profile to see your real steps',
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
      reading: 'Waiting for reading…',
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
      behavior: 'Connect a device in Profile to see your real sleep',
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
      reading: 'Waiting for data…',
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
          metric: 'Women\'s Health',
          system: 'Cycle Tracking',
          reading: 'Awaiting Cycle Data',
          status: 'Calibrating',
          behavior: 'Set your last period start date in Profile to activate',
          details: {
            title: 'Biological Rhythm Alignment',
            description: 'Add your last period start date and average cycle length in your Profile to activate real cycle phase tracking.',
            subMetrics: []
          }
        };
      }
      const { phase, dayOfCycle } = computeCyclePhase(profile.lastPeriodStartDate, profile.averageCycleLength);
      return {
        id: 'BIO-6',
        metric: 'Women\'s Health',
        system: 'Dynamic Biological Rhythm Sync',
        reading: phase,
        status: 'Optimal',
        behavior: `Day ${dayOfCycle} of ${profile.averageCycleLength}-day cycle`,
        details: {
          title: 'Biological Rhythm Alignment',
          description: 'Calculated from your logged last period start date and average cycle length — not a fixed value.',
          subMetrics: [
            { label: 'Current Phase', value: phase, color: '#ec4899' },
            { label: 'Cycle Day', value: `Day ${dayOfCycle} of ${profile.averageCycleLength}`, color: 'var(--info)' }
          ]
        }
      };
    }

    if (profile.sex === 'male') {
      if (liveHrv === null || liveBpm === null) {
        return {
          id: 'BIO-6',
          metric: 'Recovery & Hormonal Balance',
          system: 'Recovery Estimate',
          reading: 'Waiting for data',
          status: 'Calibrating',
          behavior: isLiveHealthData ? 'No recent heart rate data from your device yet' : 'Connect a device to see your recovery estimate',
          details: {
            title: 'Recovery & Stress Load',
            description: 'This app has no way to directly measure hormone levels — this card is a recovery/stress-load estimate built from your HRV, heart rate and sleep data instead.',
            subMetrics: []
          }
        };
      }
      const recoveryLabel = liveHrv > 60 && liveBpm < 80 ? 'High Recovery' : liveHrv > 45 ? 'Moderate Recovery' : 'Low Recovery — Prioritize Rest';
      return {
        id: 'BIO-6',
        metric: 'Recovery & Hormonal Balance',
        system: 'Recovery Estimate',
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
            behavior: 'Connect a device in Profile to see your real steps',
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
          reading: `${liveSteps} steps today`,
          behavior: 'Synced from your device',
          details: { ...item.details, subMetrics: [{ label: 'Steps Today', value: `${liveSteps}`, color: 'var(--accent)' }, ...item.details.subMetrics.slice(1)] }
        };
      }
      if (item.id === 'BIO-2') {
        if (liveBpm === null || liveHrv === null) {
          return {
            ...item,
            reading: 'Waiting for reading…',
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
          reading: `${liveBpm} BPM / ${liveHrv} ms HRV`,
          status: liveBpm > 100 ? 'Critical' as const : 'Optimal' as const,
          behavior: liveBpm > 100 ? 'Elevated heart rate' : (isLiveHealthData ? 'Synced from your device' : 'Demo data — connect a device for real readings'),
          details: {
            ...item.details,
            subMetrics: [
              { label: 'Resting Heart Rate', value: `${liveBpm} BPM`, color: 'var(--danger)' },
              { label: 'HRV', value: `${liveHrv} ms`, color: 'var(--info)' },
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
            behavior: 'Connect a device in Profile to see your real sleep',
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
            reading: 'Waiting for data…',
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
  const [level] = useState<number>(() => parseInt(localStorage.getItem('kinetix_level') || '1'));
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
        setMotivationMessage(`⚠️ ${data.error || 'Could not complete this quest. Please try again.'}`);
        setTimeout(() => setMotivationMessage(null), 6000);
        return;
      }

      const newXp = Math.max(0, xp + data.xpAwarded);
      const newPts = Math.max(0, totalVoucherPoints + data.pointsAwarded);

      // Dynamic Athlete Level Up Check (Level Up occurs at multiples of 500 XP)
      const targetXpThreshold = level * 500;
      if (newXp >= targetXpThreshold) {
        localStorage.setItem('kinetix_level', (level + 1).toString());
        setTimeout(() => setShowLevelUpModal(true), 350);
      }

      setXp(newXp);
      setTotalVoucherPoints(newPts);
      localStorage.setItem('kinetix_xp', newXp.toString());
      localStorage.setItem('kinetix_voucher_points', newPts.toString());

      const nextTasks = todayTasks.map(t => t.id === id ? { ...t, completed: true } : t);
      setTodayTasks(nextTasks);
      setTasksCompletedTodayCount(prev => prev + 1);

      setMotivationMessage(data.verified
        ? `✅ Quest verified via synced device data: "${task.text}" (+${data.pointsAwarded} Points!)`
        : `🔥 Quest logged: "${task.text}" (+${data.pointsAwarded} Points!) — ${data.verificationNote}`);
      setTimeout(() => setMotivationMessage(null), 6000);

      // Daily streak tracking: increments once per calendar day when all quests are completed
      if (nextTasks.length > 0 && nextTasks.every(t => t.completed)) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const lastCompletedKey = localStorage.getItem('kinetix_streak_last_date');
        if (lastCompletedKey !== todayKey) {
          const yesterdayKey = new Date(new Date().getTime() - 86400000).toISOString().slice(0, 10);
          const nextStreak = lastCompletedKey === yesterdayKey ? streak + 1 : 1;
          setStreak(nextStreak);
          localStorage.setItem('kinetix_streak', nextStreak.toString());
          localStorage.setItem('kinetix_streak_last_date', todayKey);
        }
      }
    } catch {
      setMotivationMessage('⚠️ Could not reach the server to verify this quest. Please try again.');
      setTimeout(() => setMotivationMessage(null), 6000);
    } finally {
      setCompletingTaskId(null);
    }
  };

  // Regenerate today's quest set whenever the user's fitness target changes, OR a new calendar
  // day begins — quests previously never reset daily at all, only on a target change, meaning a
  // completed quest stayed "completed" forever. Adjusted directly during render (React's
  // documented pattern for this) rather than in an effect, since an effect here would cause an
  // extra, avoidable render pass.
  const todayDateKey = new Date().toISOString().slice(0, 10);
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
  const [caloriesBurned, setCaloriesBurned] = useState<number>(0);

  const nhsTargets = useMemo(() => {
    const bmr = calculateBmr(profile);
    const tdee = bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel];
    const calories = Math.round(tdee + GOAL_CALORIE_ADJUSTMENT[profile.target]);
    const protein = Math.round(profile.weight * GOAL_PROTEIN_PER_KG[profile.target]);
    const fat = Math.round((calories * 0.27) / 9);
    const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
    const fiber = Math.round((calories / 1000) * 14);
    return { calories, carbs, protein, fiber };
  }, [profile.weight, profile.height, profile.age, profile.sex, profile.activityLevel, profile.target]);

  const caloriesRemaining = nhsTargets.calories - dailyConsumables.calories + caloriesBurned;

  // Calorie/macro progress alerts: fires once per threshold (90%/100%) per metric per day.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < DASHBOARD_STEP) return;
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      const todayKey = new Date().toISOString().slice(0, 10);
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
        { key: 'fiber', label: 'fiber', current: dailyConsumables.fiber, target: nhsTargets.fiber, unit: 'g' }
      ];

      const toFire: { alertKey: string; title: string; body: string }[] = [];
      for (const m of metrics) {
        if (m.target <= 0) continue;
        const pct = (m.current / m.target) * 100;
        const remaining = Math.max(0, Math.round(m.target - m.current));
        if (pct >= 100 && !firedToday.includes(`${m.key}-100`)) {
          toFire.push({ alertKey: `${m.key}-100`, title: `🎯 ${m.label} goal hit!`, body: `You've reached your daily ${m.label} target.` });
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
  const [vouchers, setVouchers] = useState<VoucherLog[]>([
    { id: 'TX-UK-9921', provider: 'Premium High-Street Beverage Token', value: '£15.00', sku: 'KTX-COSTA-UK', state: 'Settled', timestamp: 'Today, 08:30' }
  ]);

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
      alert(`You need ${requiredPoints} points to donate. Complete more quests to earn them.`);
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
        setMotivationMessage(`⚠️ ${data.error || 'Donation could not be logged. Please try again.'}`);
        setTimeout(() => setMotivationMessage(null), 7000);
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
      setMotivationMessage(`💛 Donation to ${charityName} recorded. Thank you!`);
      setTimeout(() => setMotivationMessage(null), 7000);
    } catch {
      setMotivationMessage('⚠️ Could not reach the donation server. Please try again.');
      setTimeout(() => setMotivationMessage(null), 7000);
    } finally {
      setIsDonating(false);
    }
  };

  // --- SUBSCRIPTIONS & ADMIN MANAGED PROMOS ---
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [promoMessage, setPromoMessage] = useState<string>('');
  const [isRedeemingPromo, setIsRedeemingPromo] = useState<boolean>(false);
  const [revenueCatStatus, setRevenueCatStatus] = useState<string>('7-Day Free Trial Active');
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
        setRevenueCatStatus('No Active Subscription');
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
      setMotivationMessage('📱 Subscriptions are managed through your App Store or Google Play account. Open KinetixFit on your mobile device to manage your subscription.');
      setTimeout(() => setMotivationMessage(null), 7000);
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
      setMotivationMessage('⚠️ Could not open subscription management. Please try again from your device settings.');
      setTimeout(() => setMotivationMessage(null), 6000);
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

  const handleCompleteOnboarding = () => {
    setIsLogged(true);
    localStorage.setItem('kinetix_logged_in', 'true');
    setOnboardingStep(DASHBOARD_STEP);
    setMotivationMessage('🏆 Welcome to KinetixFit!');
    setTimeout(() => setMotivationMessage(null), 7000);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('kinetix_logged_in');
    setIsLogged(false);
    setOnboardingStep(0);
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

    const todayKey = timestamp.toISOString().slice(0, 10);
    setLastWorkoutLoggedDate(todayKey);
    localStorage.setItem('kinetix_last_workout_date', todayKey);

    setMotivationMessage(`✅ Logged: ${entry}`);
    setTimeout(() => setMotivationMessage(null), 5000);
  };

  const handleTogglePersonalAllergen = (allergen: string) => {
    const updated = profile.personalAllergens.includes(allergen)
      ? profile.personalAllergens.filter(a => a !== allergen)
      : [...profile.personalAllergens, allergen];
    saveProfileToStorage({ ...profile, personalAllergens: updated });
  };

  const handleSimulateSteps = (cadence: number) => {
    if (cadence > 350) {
      setMotivationMessage("⚠️ That's faster than anyone can step (over 350 a minute), so no points were added.");
      setTimeout(() => setMotivationMessage(null), 7000);
      return;
    }
    const updated = [...biometrics];
    updated[0].reading = `${cadence} steps/min`;
    setBiometrics(updated);
    setCaloriesBurned(prev => prev + Math.round(cadence * 0.4));

    const pointsEarned = Math.round(cadence * 0.1);
    setTotalVoucherPoints(prev => {
      const nextPts = prev + pointsEarned;
      localStorage.setItem('kinetix_voucher_points', nextPts.toString());
      return nextPts;
    });

    setMotivationMessage(`🏃 Steps counted at ${cadence} a minute · +${pointsEarned} points`);
    setTimeout(() => setMotivationMessage(null), 5000);
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
      setMotivationMessage('⚠️ Heads up: this contains one of your allergens.');
      setTimeout(() => setMotivationMessage(null), 6000);

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
    setMotivationMessage(`✅ Logged · +${macros.fiber}g fibre towards today's 30g`);
    setTimeout(() => setMotivationMessage(null), 5000);

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
    setMotivationMessage(`🍽️ +${amount} points for today's first scan!`);
    setTimeout(() => setMotivationMessage(null), 5000);
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
        setMotivationMessage(`⚠️ ${data.error || 'Could not scan that item. Please try again.'}`);
        setTimeout(() => setMotivationMessage(null), 6000);
        return;
      }

      finalizeScanResult(data.foodName, data.calories, data.macros, data.micros, data.estimated, data.estimatedPortionGrams);
      applyPointsAwarded(data.pointsAwarded);
    } catch {
      setMotivationMessage('⚠️ Scan failed — check your connection and try again.');
      setTimeout(() => setMotivationMessage(null), 6000);
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
        setMotivationMessage(`⚠️ ${data.error || 'Could not identify that photo. Please try again or enter it manually.'}`);
        setTimeout(() => setMotivationMessage(null), 6000);
        return;
      }

      setShowCameraModal(false);
      setMealInput(data.foodName);
      finalizeScanResult(data.foodName, data.calories, data.macros, data.micros, data.estimated, data.estimatedPortionGrams);
      applyPointsAwarded(data.pointsAwarded);
    } catch {
      setMotivationMessage('⚠️ Photo scan failed — check your connection and try again.');
      setTimeout(() => setMotivationMessage(null), 6000);
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
        setMotivationMessage(`⚠️ ${data.error || 'Product not found — try manual entry.'}`);
        setTimeout(() => setMotivationMessage(null), 6000);
        return;
      }

      setShowCameraModal(false);
      setMealInput(data.foodName);
      finalizeScanResult(data.foodName, data.calories, data.macros, data.micros, data.estimated, data.estimatedPortionGrams, data.allergens);
    } catch (err) {
      // The plugin rejects the promise on user-cancelled scans too — only surface real failures.
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (!message.includes('cancel')) {
        setMotivationMessage('⚠️ Barcode scan failed. Please try again or enter manually.');
        setTimeout(() => setMotivationMessage(null), 6000);
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
      setMotivationMessage('⚠️ Could not process that photo. Please try again.');
      setTimeout(() => setMotivationMessage(null), 6000);
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
      setMotivationMessage('📱 Live health sync needs the iOS or Android app. Open KinetixFit on your phone to connect.');
      setTimeout(() => setMotivationMessage(null), 7000);
      return;
    }

    setIsConnectingHealth(true);
    try {
      const { available } = await Health.isAvailable();
      if (!available) {
        setMotivationMessage("⚠️ Health data isn't available on this device. Make sure Health Connect is installed (Android) or you're on a supported iOS version.");
        setTimeout(() => setMotivationMessage(null), 7000);
        return;
      }

      const status = await Health.requestAuthorization({
        read: ['heartRate', 'heartRateVariability', 'restingHeartRate', 'sleep', 'steps']
      });

      if (status.readAuthorized.length === 0) {
        setMotivationMessage("🔒 Health data access wasn't granted. You can enable it later from your device's Health settings.");
        setTimeout(() => setMotivationMessage(null), 7000);
        return;
      }

      const sourceName = Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect';
      saveProfileToStorage({ ...profile, smartDeviceConnected: sourceName });
      setShowDeviceSyncModal(false);
      setMotivationMessage(`✅ Connected to ${sourceName}. Your data can take a moment to appear.`);
      setTimeout(() => setMotivationMessage(null), 6000);
    } catch (err) {
      console.warn('Health connection failed:', err);
      setMotivationMessage('⚠️ Could not connect to health data. Please try again.');
      setTimeout(() => setMotivationMessage(null), 6000);
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
        setPromoMessage(`❌ ${data.error || 'Invalid Promo or Coupon Code.'}`);
        return;
      }

      setPromoMessage(data.tier === 'lifetime'
        ? '💚 Lifetime access activated successfully!'
        : '💎 30-day promotional access activated successfully!');
      await refreshRevenueCatStatus();
    } catch {
      setPromoMessage('❌ Could not reach the licensing server. Please try again.');
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  const triggerRewardVaultSettlement = async () => {
    if (tasksCompletedTodayCount < requiredTaskCountForRedeem) {
      alert(`Finish at least ${requiredTaskCountForRedeem} of today's quests to redeem — you've done ${tasksCompletedTodayCount} so far.`);
      setMotivationMessage("🔒 Finish 2 of today's quests to unlock redeeming.");
      setTimeout(() => setMotivationMessage(null), 6000);
      return;
    }

    if (totalVoucherPoints < 2500) {
      alert("You need 2,500 points to redeem a voucher. Keep completing quests to earn more.");
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastRedemptionTime < 86400000) {
      alert("You can redeem one reward every 24 hours.");
      return;
    }

    // Handle Active Payout Gateway
    let prefix: string;
    let voucherTitle: string;
    let sku: string;

    if (rewardGateway === 'primary') {
      alert("Rewards are temporarily unavailable, please check back soon.");
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
        setMotivationMessage(`⚠️ ${data.error || data.details || 'Redemption failed. Please try again.'}`);
        setTimeout(() => setMotivationMessage(null), 7000);
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
      setMotivationMessage(`☕ ${data.message || 'Voucher settled!'}`);
      setTimeout(() => setMotivationMessage(null), 6000);
    } catch {
      setMotivationMessage('⚠️ Could not reach the redemption server. Please try again.');
      setTimeout(() => setMotivationMessage(null), 6000);
    } finally {
      setIsRedeemingVoucher(false);
    }
  };

  const handleSendContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMsg) {
      alert("Please fill out all contact fields.");
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
            {timeGreeting},<br /><em>{profile.name || 'there'}</em>
          </h2>
          <p className="kx-hero-status">
            {profile.smartDeviceConnected ? `Synced with ${profile.smartDeviceConnected}` : 'Connect a device to see your live stats.'}
          </p>
        </div>
        <p className="kx-hero-quote">{getDailyQuote()}</p>
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
                />
                {authMode !== 'forgot' && (
                  <>
                    <label className="ob-label">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="At least 6 characters"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="ob-input"
                    />
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

              {authMode !== 'forgot' && (
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
                We use {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'} to show your real steps, heart rate, and sleep — no guessing, no placeholder numbers. You can disconnect at any time in Profile.
              </p>
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
                We'll send helpful reminders — hydration during your work hours, and a nudge if you forget to log a meal. Only if you want them — you can turn these off anytime in Profile.
              </p>
              <button
                onClick={async () => { await ensureNotificationPermission(); setOnboardingStep(5); }}
                className="ob-btn-primary"
                style={{ marginBottom: '10px' }}
              >
                Turn on reminders
              </button>
              <button onClick={() => setOnboardingStep(5)} className="ob-btn-secondary">Skip for now</button>
            </div>
          </div>
        </div>
              </div>
    );
  }

  // C. ONBOARDING STEP 5: Biographical profile setup
  if (onboardingStep === 5) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div className="ob-container">
            <div className="ob-card">
              <span className="ob-step">Step 1 of 2</span>
              <h1 className="ob-title">About you</h1>
              <p className="ob-body" style={{ marginBottom: '18px' }}>We use this to set your calorie and protein targets.</p>
              <div className="ob-form">
                <label className="ob-label">Your name
                  <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="auth-input" />
                </label>
                <label className="ob-label">Height (cm)
                  <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="auth-input" />
                </label>
                <label className="ob-label">Weight (kg)
                  <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="auth-input" />
                </label>
                <label className="ob-label">Age
                  <input type="number" value={profile.age} onChange={(e) => saveProfileToStorage({...profile, age: parseInt(e.target.value) || 0})} className="auth-input" />
                </label>
                <label className="ob-label">Sex
                  <select value={profile.sex ?? ''} onChange={(e) => saveProfileToStorage({...profile, sex: e.target.value === '' ? null : e.target.value as UserProfile['sex']})} className="auth-input-select">
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
                {profile.sex === 'female' && (
                  <>
                    <label className="ob-label">Last period started
                      <input type="date" value={profile.lastPeriodStartDate ?? ''} onChange={(e) => saveProfileToStorage({...profile, lastPeriodStartDate: e.target.value || null})} className="auth-input" />
                    </label>
                    <label className="ob-label">Cycle length (days)
                      <input type="number" value={profile.averageCycleLength} onChange={(e) => saveProfileToStorage({...profile, averageCycleLength: parseInt(e.target.value) || 28})} className="auth-input" />
                    </label>
                  </>
                )}
                <label className="ob-label">Activity level
                  <select value={profile.activityLevel} onChange={(e) => saveProfileToStorage({...profile, activityLevel: e.target.value as UserProfile['activityLevel']})} className="auth-input-select">
                    <option value="sedentary">Sedentary (little to no exercise)</option>
                    <option value="light">Light (exercise 1-3x/week)</option>
                    <option value="moderate">Moderate (exercise 3-5x/week)</option>
                    <option value="active">Active (exercise 6-7x/week)</option>
                    <option value="very_active">Very active (hard exercise or physical job)</option>
                  </select>
                </label>
                <label className="ob-label">Main goal
                  <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as UserProfile['target']})} className="auth-input-select">
                    <option value="Autonomic Recovery">Recovery</option>
                    <option value="Weight Loss">Weight Loss</option>
                    <option value="Weight Gain">Weight Gain</option>
                    <option value="Cardio Endurance">Cardio Endurance</option>
                  </select>
                </label>
                <button onClick={() => setOnboardingStep(6)} className="primary-btn" style={{ marginTop: '6px' }}>
                  Continue
                </button>
              </div>
            </div>
                      </div>
        </div>
      </div>
    );
  }

  // D. ONBOARDING STEP 6: Personal Allergy Manager Setup
  if (onboardingStep === 6) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div className="ob-container">
            <div className="ob-card">
              <span className="ob-step">Step 2 of 2</span>
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
              <div style={{ display: 'flex', gap: '10px' }}>
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
  const hasStressHistory = healthTrends.stress.some(d => d.value !== null);

  // F. MAIN HOLLYWOOD HUD PLATFORM PORTAL SCREEN WITH GLASS SCI-FI OVERLAYS
  return (
    <div className="workspace-container">
      <div className="app-viewport-container">
        {/* --- DYNAMIC GLOWING ANNOUNCEMENT TICKER --- */}
        {motivationMessage && (
          <div className="alert-ticker">
            {motivationMessage}
          </div>
        )}

        {/* --- APP PORTAL BODY SCROLL AREA --- */}
        <div className="app-scroll-body">

          {/* Header Dashboard Branding */}
          <header className="app-brand-header">
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

          {/* ==================== TAB 1: TODAY ==================== */}
          {activeTab === 'vitals' && (
            <div className="tab-fade-in vitals-dashboard-grid">
              <div className="vitals-left-panel">

              {/* Welcome banner */}
              <div className="vitals-hero-card">
                <TrackLanes />
                {getPersonalizedWelcome()}
                <div className="kx-hero-foot">
                  <p className="kx-hero-hint">Tap a card below to see your 7-day trend.</p>
                  {streak > 0 && (
                    <div className="kx-lap" aria-label={`${streak}-day streak`}>
                      <span className="kx-lap-num">{streak}</span>
                      <span className="kx-lap-label">day streak</span>
                    </div>
                  )}
                </div>
              </div>

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
                  disconnectedMessage="Connect a device in Profile to see your 7-day steps trend."
                  minPoints={1}
                  expanded={expandedTrendId === 'BIO-1'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-1' ? null : 'BIO-1')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
                <BiometricTrendCard
                  icon={<HeartIcon />}
                  title="Heart Rate"
                  status={heartRateBio.status}
                  behavior={heartRateBio.behavior}
                  latestReading={String(heartRateBio.reading)}
                  subMetrics={heartRateBio.details.subMetrics}
                  trend={healthTrends.heartRate}
                  unit=" bpm"
                  color="var(--m-heart)"
                  chartType="line"
                  isTrackable={isLiveHealthData}
                  disconnectedMessage="Connect a device to see your 7-day heart rate trend."
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
                  disconnectedMessage="Connect a device in Profile to see your 7-day sleep trend."
                  minPoints={1}
                  expanded={expandedTrendId === 'BIO-4'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-4' ? null : 'BIO-4')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
                <BiometricTrendCard
                  icon={<StressIcon />}
                  title="Stress (HRV estimate)"
                  status={stressBio.status}
                  behavior={stressBio.behavior}
                  latestReading={String(stressBio.reading)}
                  subMetrics={stressBio.details.subMetrics}
                  trend={healthTrends.stress}
                  unit=" ms HRV"
                  color="var(--m-stress)"
                  chartType="line"
                  isTrackable={isLiveHealthData || hasStressHistory}
                  disconnectedMessage="Connect a device to start tracking your stress trend."
                  buildingMessage="Building your trend — check back in a few days."
                  minPoints={2}
                  trendFootnote="Estimated from your HRV — higher HRV generally means lower stress. This app has no way to directly measure stress hormones."
                  expanded={expandedTrendId === 'BIO-5'}
                  onToggle={() => setExpandedTrendId(prev => prev === 'BIO-5' ? null : 'BIO-5')}
                  rangeDays={trendRangeDays}
                  onRangeChange={setTrendRangeDays}
                />
              </div>

              {/* Workout logging — a real log entry, independent of live heart rate/HRV data */}
              <div className="ecg-module-card">
                <h3 className="ecg-title">Log a workout</h3>
                <div className="sport-workload-bar">
                  {[
                    { id: 'rest', label: 'Rest & recovery' },
                    { id: 'run', label: 'Run' },
                    { id: 'cycle', label: 'Cycle' },
                    { id: 'swim', label: 'Swim' }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setActiveSportMode(mode.id as 'rest' | 'run' | 'cycle' | 'swim')}
                      className={`sport-mode-btn ${activeSportMode === mode.id ? 'active-sport-btn' : ''}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <button onClick={handleLogWorkout} className="primary-btn">
                  Log workout
                </button>
              </div>

              </div> {/* End Left Panel */}

              <div className="vitals-right-panel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="kx-row-between">
                  <h3 className="section-header">Device</h3>
                  <span className={`kx-live-pill ${isLiveHealthData ? 'kx-live-on' : ''}`}>
                    <span className="kx-live-dot" />
                    {isLiveHealthData ? `Live · ${profile.smartDeviceConnected}` : 'Not connected'}
                  </span>
                </div>
                {sexCard && (
                  <div className="biometric-item-card">
                    <div className="bio-card-header">
                      <span className="bio-system-label">{sexCard.system}</span>
                      <span className={`bio-status-badge status-${sexCard.status.toLowerCase()}`}>
                        {sexCard.status}
                      </span>
                    </div>
                    <h4 className="bio-metric-title">{sexCard.metric}</h4>
                    <p className="bio-metric-reading">{sexCard.reading}</p>
                    <span className="bio-behavior-log">{sexCard.behavior}</span>
                  </div>
                )}
              </div>

              {/* Device connection shortcut — editing your details lives in Profile now, not duplicated here */}
              <div className="profile-actions-row">
                <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn">
                  {isLiveHealthData ? 'Manage device' : 'Connect a device'}
                </button>
              </div>

              </div> {/* End Right Panel */}
            </div>
          )}

          {/* ==================== TAB 2: NOURISH (QUANTUM SPECTRAL SCANNERS) ==================== */}
          {activeTab === 'nourish' && (
            <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Daily macro counters */}
              <div className="nourish-summary-card">
                <span className="vitals-label">Today · NHS guidelines</span>
                <h3 className="nourish-calories-remaining" style={{ color: caloriesRemaining > 0 ? 'var(--ink)' : 'var(--danger)' }}>
                  {Math.abs(caloriesRemaining).toLocaleString('en-GB')}
                  <span className="kx-unit">{caloriesRemaining > 0 ? 'kcal left' : 'kcal over'}</span>
                </h3>

                {/* Macro progress meters */}
                <div className="macro-meters-stack">
                  <div className="macro-progress-bar">
                    <div className="macro-bar-header">
                      <span>Fibre</span>
                      <strong>{dailyConsumables.fiber}g <span className="kx-of">/ 30g</span></strong>
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
                  <h3 className="card-header-title">Ideas for your next meal</h3>
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

              {/* Food Scanner */}
              <div className="scanner-module-card">
                <h3 className="card-header-title">Check a food</h3>
                <p className="card-header-desc">
                  Type a food or scan it to see its nutrition and whether it contains your allergens.
                </p>

                {/* Scanner Input Row with Camera Trigger */}
                <div className="scanner-input-row">
                  <input
                    type="text"
                    placeholder="e.g. tomato pasta"
                    value={mealInput}
                    onChange={(e) => setMealInput(e.target.value)}
                    className="scanner-text-input"
                  />
                  <button onClick={() => setShowCameraModal(true)} className="scanner-camera-trigger" title="Scan with camera" aria-label="Scan with camera">
                    <CameraIcon />
                  </button>
                  <button onClick={() => handleMealScan()} disabled={isScanLoading} className="scanner-submit-btn">
                    {isScanLoading ? 'Checking…' : 'Check'}
                  </button>
                </div>

                {/* Scan Outcomes Panel */}
                {scanResult && (
                  <div className={`scan-outcome-panel border-${scanResult.complianceStatus.toLowerCase()}`}>
                    <div className="scan-outcome-header">
                      <span>Result</span>
                      <span className={`compliance-badge badge-${scanResult.complianceStatus.toLowerCase()}`}>
                        {scanResult.complianceStatus}
                      </span>
                    </div>
                    {scanResult.estimated && (
                      <span className="estimated-portion-badge">
                        ~{scanResult.estimatedPortionGrams}g (estimated)
                      </span>
                    )}

                    <div className="scan-macros-micros-grid">
                      <div>
                        <strong className="panel-sub-label">Macros</strong>
                        <p>• Calories: {scanResult.calories} kcal</p>
                        <p>• Carbs: {scanResult.macros.carbs}g</p>
                        <p>• Protein: {scanResult.macros.protein}g</p>
                        <p style={{ color: 'var(--good)', fontWeight: 650 }}>• Fibre: +{scanResult.macros.fiber}g logged</p>
                      </div>
                      <div>
                        <strong className="panel-sub-label">Minerals</strong>
                        <p>• Sodium: {scanResult.micros.sodium}</p>
                        <p>• Potassium: {scanResult.micros.potassium}</p>
                        <p>• Iron: {scanResult.micros.iron}</p>
                        <p>• Calcium: {scanResult.micros.calcium}</p>
                      </div>
                    </div>

                    <div className="scan-clinical-recommendation">
                      <strong>What this means for you</strong>
                      <p>{scanResult.dietaryRecommendation}</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ==================== TAB 3: USER DASHBOARD, QUESTS & B2B REWARDS ==================== */}
          {activeTab === 'profile' && (
            <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

              {/* Symmetrical Dual-Grid Dashboard for Profile Overview on Desktop */}
              <div className="vitals-dashboard-grid">

                {/* LEFT PROFILE PANEL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                  {/* Bio Athlete Holographic Status Card */}
                  <div className="vitals-hero-card kx-profile-hero">
                    <TrackLanes />
                    <div>
                      <span className="kx-hero-eyebrow">Level {level} · {xp} XP</span>
                      <h2 className="kx-hero-greeting">{profile.name || 'Your profile'}</h2>
                      <p className="kx-hero-status">Goal: {profile.target === 'Autonomic Recovery' ? 'Recovery' : profile.target}</p>
                    </div>
                    <div className="kx-hero-foot">
                      <div className="kx-stat-row">
                        <div className="kx-lap"><span className="kx-lap-num">{streak}</span><span className="kx-lap-label">day streak</span></div>
                        <div className="kx-lap"><span className="kx-lap-num">{profile.workoutsLogged.length}</span><span className="kx-lap-label">workouts</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Smart Point balances Tracker */}
                  <div className="rewards-summary-card">
                    <span className="vitals-label">Your points</span>
                    <h3 className="rewards-wallet-balance">{totalVoucherPoints.toLocaleString('en-GB')}<span className="kx-unit">pts</span></h3>
                    <p style={{ fontSize: '15px', color: 'var(--ink-2)', lineHeight: '1.6', margin: '4px 0 12px 0' }}>
                      Complete quests to earn points, then redeem them for coffee vouchers or charity donations.
                    </p>
                  </div>

                  {/* Active Wearable Sensor Integration Panel */}
                  <div className="biopoint-validator-card">
                    <span className="vitals-label">Connected devices</span>
                    <p className="validator-desc">
                      Connect your wearable device to sync your activity, heart rate, and sleep data automatically.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn">
                        {profile.smartDeviceConnected ? `Manage ${profile.smartDeviceConnected}` : 'Connect a device'}
                      </button>
                    </div>
                  </div>

                  {/* Configure Biological Benchmarks Form */}
                  <div className="hub-support-card">
                    <h3 className="card-header-title">Your details</h3>
                    <div className="drawer-form-grid">
                      <label className="drawer-label">Name
                        <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label">Height (cm)
                        <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label">Weight (kg)
                        <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label">Age
                        <input type="number" value={profile.age} onChange={(e) => saveProfileToStorage({...profile, age: parseInt(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label">Sex
                        <select value={profile.sex ?? ''} onChange={(e) => saveProfileToStorage({...profile, sex: e.target.value === '' ? null : e.target.value as UserProfile['sex']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="">Prefer not to say</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </label>
                      {profile.sex === 'female' && (
                        <>
                          <label className="drawer-label">Last period started
                            <input type="date" value={profile.lastPeriodStartDate ?? ''} onChange={(e) => saveProfileToStorage({...profile, lastPeriodStartDate: e.target.value || null})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </label>
                          <label className="drawer-label">Cycle length (days)
                            <input type="number" value={profile.averageCycleLength} onChange={(e) => saveProfileToStorage({...profile, averageCycleLength: parseInt(e.target.value) || 28})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </label>
                        </>
                      )}
                      <label className="drawer-label">Activity level
                        <select value={profile.activityLevel} onChange={(e) => saveProfileToStorage({...profile, activityLevel: e.target.value as UserProfile['activityLevel']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="sedentary">Sedentary</option>
                          <option value="light">Light</option>
                          <option value="moderate">Moderate</option>
                          <option value="active">Active</option>
                          <option value="very_active">Very active</option>
                        </select>
                      </label>
                      <label className="drawer-label">Goal
                        <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as UserProfile['target']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="Autonomic Recovery">Recovery</option>
                          <option value="Weight Loss">Weight Loss</option>
                          <option value="Weight Gain">Weight Gain</option>
                          <option value="Cardio Endurance">Cardio Endurance</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  {/* Natasha's Law Exclusions selection list */}
                  <div className="scanner-module-card">
                    <h3 className="card-header-title">Food allergies</h3>
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

                  {/* Notification Settings */}
                  <div className="hub-support-card">
                    <h3 className="card-header-title">Reminders</h3>
                    <label className="demo-toggle-label">
                      <input
                        type="checkbox"
                        checked={hydrationRemindersEnabled}
                        onChange={(e) => {
                          setHydrationRemindersEnabled(e.target.checked);
                          localStorage.setItem('kinetix_hydration_enabled', e.target.checked.toString());
                        }}
                        className="demo-toggle-checkbox"
                      />
                      Remind me to drink water during my active hours
                    </label>
                    <div className="drawer-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                      <label className="drawer-label">Active from
                        <select value={shiftStartHour} onChange={(e) => { const v = parseInt(e.target.value); setShiftStartHour(v); localStorage.setItem('kinetix_shift_start', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                      </label>
                      <label className="drawer-label">Until
                        <select value={shiftEndHour} onChange={(e) => { const v = parseInt(e.target.value); setShiftEndHour(v); localStorage.setItem('kinetix_shift_end', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                      </label>
                      <label className="drawer-label">Every
                        <select value={hydrationIntervalHours} onChange={(e) => { const v = parseInt(e.target.value); setHydrationIntervalHours(v); localStorage.setItem('kinetix_hydration_interval', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {[1, 2, 3, 4].map(h => <option key={h} value={h}>{h}h</option>)}
                        </select>
                      </label>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--ink-3)', margin: '10px 0 0 0', lineHeight: '1.6' }}>
                      Activity and nutrition-target alerts are always on (native app only) and fire at most once per event per day — no spam. You'll be asked to allow notifications the first time one of these actually needs to fire.
                    </p>
                  </div>

                  {/* Account */}
                  <div className="hub-support-card">
                    <h3 className="card-header-title">Account</h3>
                    {(session?.user?.email || profile.email) && (
                      <p style={{ fontSize: '14px', color: 'var(--ink-2)', margin: '0 0 12px 0' }}>Signed in as <strong style={{ color: 'var(--ink)' }}>{session?.user?.email || profile.email}</strong></p>
                    )}
                    <button onClick={handleLogout} className="edit-bio-btn" style={{ width: '100%' }}>
                      Log out
                    </button>
                  </div>

                </div>

                {/* RIGHT ACTIVE REWARDS PANEL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                  {/* Today's Gamified Quests list */}
                  <div className="quests-card">
                    <div className="quests-header">
                      <h3 className="quests-title">Today's quests</h3>
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

                  {/* Achievements / Badges Gallery — computed live from existing tracked data */}
                  <div className="quests-card">
                    <div className="quests-header">
                      <h3 className="quests-title">Achievements</h3>
                    </div>
                    <div className="badges-gallery-grid">
                      {[
                        { id: 'first-steps', label: 'First Steps', icon: '👣', unlocked: profile.workoutsLogged.length >= 1 },
                        { id: 'dedicated', label: 'Dedicated Athlete', icon: '💪', unlocked: profile.workoutsLogged.length >= 5 },
                        { id: 'streak-3', label: '3-Day Streak', icon: '🔥', unlocked: streak >= 3 },
                        { id: 'streak-7', label: '7-Day Streak', icon: '🔥🔥', unlocked: streak >= 7 },
                        { id: 'level-3', label: 'Level 3 Reached', icon: '🥈', unlocked: level >= 3 },
                        { id: 'level-5', label: 'Level 5 Reached', icon: '🏆', unlocked: level >= 5 },
                      ].map(badge => (
                        <div key={badge.id} className={`badge-tile ${badge.unlocked ? 'badge-unlocked' : 'badge-locked'}`}>
                          <span className="badge-icon">{badge.icon}</span>
                          <span className="badge-label">{badge.label}</span>
                          {!badge.unlocked && <span className="badge-lock-overlay">🔒</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Accrued Point Validator Accelerometer controls */}
                  <div className="biopoint-validator-card">
                    <h3 className="card-header-title">How step points work</h3>
                    <p className="validator-desc">
                      Steps only earn points at a real walking or running pace (under 350 steps a minute). Shaking the phone doesn't count. Try both:
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => handleSimulateSteps(120)} className="cadence-btn-normal">
                        Walk · 120/min
                      </button>
                      <button onClick={() => handleSimulateSteps(420)} className="cadence-btn-alert">
                        Shake · 420/min
                      </button>
                    </div>
                  </div>

                  {/* Kinetix Rewards Vault Card (Gateway selection) */}
                  <div className="rewards-redemption-card">
                    <div className="rewards-redemption-header">
                      <div>
                        <h3 className="redemption-title">Rewards</h3>
                        <span className="charity-subtitle">Swap points for vouchers</span>
                      </div>
                      <button onClick={triggerRewardVaultSettlement} disabled={isRedeemingVoucher} className="redeem-rewards-btn">
                        {isRedeemingVoucher ? 'Redeeming…' : 'Redeem · 2,500 pts'}
                      </button>
                    </div>

                    <p className="kx-note">Voucher redemption is launching soon — check back shortly.</p>

                    {/* Active vouchers history ledger */}
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
                  </div>

                  {/* UK Social Philanthropy match portal */}
                  <div className="charity-matching-card">
                    <div className="charity-card-header">
                      <div>
                        <h3 className="charity-title">Give to charity</h3>
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

            </div>
          )}

          {/* ==================== TAB 4: HUB (CORPORATE PASSES & COMPLIANCE) ==================== */}
          {activeTab === 'hub' && (
            <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Subscription Status & Trial details */}
              <div className="hub-billing-card">
                <span className="vitals-label">Subscription</span>
                <p className="billing-status-title">{revenueCatStatus}</p>
                <p className="billing-disclaimer">
                  KinetixFit Premium is <strong>£14.99 a month</strong> and starts with a <strong>7-day free trial</strong>.
                </p>
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

                {/* Promo Code Input Panel */}
                <div className="promo-input-box">
                  <span className="promo-box-title">Have a promo code?</span>
                  <p className="promo-box-desc">Enter it here to unlock your pass.</p>
                  <div className="promo-input-row">
                    <input
                      type="text"
                      placeholder="Promo code"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value)}
                      className="promo-text-input"
                    />
                    <button onClick={applyPromoCode} disabled={isRedeemingPromo || !promoCodeInput.trim()} className="promo-submit-btn">
                      {isRedeemingPromo ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                  {promoMessage && (
                    <p className={`promo-response-msg ${promoMessage.includes('❌') ? 'response-error' : 'response-success'}`}>
                      {promoMessage}
                    </p>
                  )}
                </div>
              </div>

              {/* About Kinetix and Data GDPR Shields */}
              <div className="hub-legal-stack">
                <div className="legal-block-card">
                  <h3 className="legal-card-title">About KinetixFit</h3>
                  <p className="legal-card-text">
                    KinetixFit helps you track your fitness, nutrition, and rewards all in one place.
                  </p>
                </div>

                <div className="legal-block-card">
                  <h3 className="legal-card-title">Your data</h3>
                  <p className="legal-card-text">
                    Your health readings, meal checks and rewards history are handled under the <strong>UK GDPR</strong> and the <strong>Data Protection Act 2018</strong>.
                  </p>
                </div>
              </div>

              {/* Corporate Help Desk Widget */}
              <div className="hub-support-card">
                <h3 className="support-card-title">Contact support</h3>

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
                      <input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="support-input" />
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

            </div>
          )}

          {/* ==================== FOOTER STATEMENT ==================== */}
          <footer className="app-compliance-footer">
            <h4 className="kx-footer-title">Not a medical device</h4>
            <p>
              KinetixFit is a fitness and nutrition tracking app, not a certified medical device. It doesn't replace professional medical advice — always consult a doctor before starting a new fitness or diet plan.
            </p>
          </footer>

        </div>

        {/* --- FLOATING HOLLYWOOD QUICK ACCESS CAMERA BUTTON (FAB) --- */}
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

        {/* --- STICKY BOTTOM NAVIGATION BAR --- */}
        <nav className="phone-bottom-nav" aria-label="Main" style={{ ['--tab-index' as string]: Math.max(0, TAB_IDS.indexOf(activeTab)) }}>
          {[
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
              id: 'profile',
              label: 'Profile',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )
            },
            {
              id: 'hub',
              label: 'Hub',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              )
            },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  handleTabChange(tab.id);
                }}
                className={`nav-item-btn ${active ? 'nav-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-icon">{tab.icon}</span>
                <span className="nav-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>

      </div>

      {/* --- SPECTACULAR NEON LEVEL UP CELEBRATION MODAL --- */}
      {showLevelUpModal && (
        <div className="portal-overlay-modal" style={{ zIndex: 15000 }}>
          <div className="modal-content-card levelup-celebration-card" style={{ border: '2px solid var(--accent)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <span className="levelup-sparkle levelup-sparkle-1">✨</span>
            <span className="levelup-sparkle levelup-sparkle-2">✨</span>
            <span className="levelup-sparkle levelup-sparkle-3">✨</span>
            <span className="levelup-trophy-icon" style={{ fontSize: '42px', display: 'block', marginBottom: '10px' }}>🏆</span>
            <h2 className="modal-title">
              Level Up!
            </h2>
            <p className="modal-desc">
              You've reached
              <br/>
              <strong style={{ color: 'var(--info)', display: 'block', margin: '10px 0', fontSize: '20px' }}>
                Level {level + 1}
              </strong>
              Here's a bonus for sticking with it.
            </p>
            <button
              onClick={() => {
                setShowLevelUpModal(false);
                setTotalVoucherPoints(prev => prev + 500); // 500 point bonus!
                setMotivationMessage("🎁 Level up bonus! +500 points credited to your rewards wallet.");
                setTimeout(() => setMotivationMessage(null), 5000);
              }}
              className="primary-btn"
              style={{ width: '100%', marginTop: '15px', padding: '12px 20px' }}
            >
              Claim Level-Up Bonus (+500 pts)
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
                <span>{Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}</span>
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
            </div>
            <button onClick={() => setShowDeviceSyncModal(false)} className="modal-close-btn">
              Not now
            </button>
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
