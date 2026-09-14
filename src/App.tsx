import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Purchases, type CustomerInfo } from '@revenuecat/purchases-capacitor';
import { Health } from '@capgo/capacitor-health';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import BiometricTrendCard, { type DailyPoint } from './components/BiometricTrendCard';

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

// Phase 1 design tokens — clean, light, trustworthy (MyFitnessPal/Apple Health direction),
// used by the new onboarding screens. Existing dashboard tabs keep their current look until
// the Phase 3 rollout retrofits them.
const ONBOARDING_STYLES = `
  .ob-container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
    background-color: #FAFAFA;
    color: #1A1D1F;
    width: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .ob-card {
    width: 100%;
    max-width: 420px;
    background-color: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 16px;
    padding: 32px 24px;
    box-sizing: border-box;
  }
  .ob-logo { display: flex; justify-content: center; margin-bottom: 24px; }
  .ob-title { font-size: 24px; font-weight: 700; margin: 0 0 8px 0; text-align: center; color: #1A1D1F; }
  .ob-body { font-size: 16px; color: #6B7280; line-height: 1.6; text-align: center; margin: 0 0 24px 0; }
  .ob-label { font-size: 14px; color: #374151; font-weight: 600; display: block; margin-bottom: 6px; }
  .ob-input {
    width: 100%; background-color: #FFFFFF; border: 1px solid #E5E7EB; color: #1A1D1F;
    padding: 12px 14px; font-size: 16px; border-radius: 8px; outline: none;
    box-sizing: border-box; font-family: inherit; margin-bottom: 16px;
  }
  .ob-input:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
  .ob-btn-primary {
    width: 100%; background-color: #2563EB; color: #FFFFFF; font-weight: 600; font-size: 16px;
    border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-family: inherit;
    transition: background-color 0.15s;
  }
  .ob-btn-primary:hover { background-color: #1D4ED8; }
  .ob-btn-primary:disabled { background-color: #93C5FD; cursor: not-allowed; }
  .ob-btn-secondary {
    width: 100%; background-color: #FFFFFF; color: #374151; font-weight: 600; font-size: 16px;
    border: 1px solid #E5E7EB; padding: 14px; border-radius: 8px; cursor: pointer; font-family: inherit;
  }
  .ob-btn-secondary:hover { background-color: #F3F4F6; }
  .ob-btn-google {
    width: 100%; background-color: #FFFFFF; color: #1A1D1F; font-weight: 600; font-size: 16px;
    border: 1px solid #E5E7EB; padding: 14px; border-radius: 8px; cursor: pointer; font-family: inherit;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .ob-btn-google:hover { background-color: #F3F4F6; }
  .ob-btn-row { display: flex; gap: 12px; margin-top: 8px; }
  .ob-link { color: #2563EB; font-weight: 600; cursor: pointer; background: none; border: none; font-size: 14px; font-family: inherit; padding: 0; }
  .ob-link:hover { text-decoration: underline; }
  .ob-error { color: #DC2626; font-size: 14px; text-align: center; margin: -8px 0 16px 0; }
  .ob-success { color: #059669; font-size: 14px; text-align: center; margin: -8px 0 16px 0; }
  .ob-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; color: #9CA3AF; font-size: 13px; }
  .ob-divider::before, .ob-divider::after { content: ''; flex: 1; height: 1px; background-color: #E5E7EB; }
  .ob-dots { display: flex; justify-content: center; gap: 6px; margin-top: 24px; }
  .ob-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #E5E7EB; }
  .ob-dot.active { background-color: #2563EB; }
  .ob-footnote { font-size: 13px; color: #9CA3AF; text-align: center; line-height: 1.6; margin-top: 20px; }
  .ob-footnote a { color: #6B7280; }
`;

// Shared styles for the two reused/renumbered profile-setup steps (5: profile, 6: allergies),
// which keep their original dark theme pending the Phase 3 design-system rollout.
const ONBOARDING_PROFILE_STYLES = `
  .auth-input {
    width: 100% !important;
    background-color: #030712 !important;
    border: 1px solid #374151 !important;
    color: #ffffff !important;
    padding: 10px !important;
    margin-top: 6px !important;
    font-size: 17px !important;
    font-family: monospace !important;
    border-radius: 4px !important;
    outline: none !important;
    box-sizing: border-box !important;
  }
  .auth-input:focus {
    border-color: #00ff88 !important;
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.25) !important;
  }
  .auth-input-select {
    width: 100% !important;
    background-color: #030712 !important;
    border: 1px solid #374151 !important;
    color: #ffffff !important;
    padding: 8px !important;
    margin-top: 4px !important;
    font-family: monospace !important;
    border-radius: 4px !important;
    outline: none !important;
    box-sizing: border-box !important;
  }
  .auth-input-select option {
    background-color: #0b0f19 !important;
    color: #ffffff !important;
  }
  .primary-btn {
    background-color: #00ff88 !important;
    color: #000000 !important;
    font-weight: bold !important;
    border: none !important;
    padding: 10px !important;
    cursor: pointer !important;
    border-radius: 4px !important;
    font-size: 17px !important;
    font-family: monospace !important;
    transition: all 0.2s !important;
  }
  .primary-btn:hover {
    box-shadow: 0 0 15px rgba(0, 255, 136, 0.4) !important;
    transform: translateY(-1px) !important;
  }
  .secondary-btn {
    background-color: #1f2937 !important;
    color: #ffffff !important;
    border: 1px solid #374151 !important;
    padding: 10px !important;
    cursor: pointer !important;
    border-radius: 4px !important;
    font-size: 16px !important;
    font-family: monospace !important;
  }
`;

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
        fetch('/api/sync-health-data', {
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
          { label: 'Steps', value: '--', color: '#6b7280' },
          { label: 'Max Speed Limit', value: '350 SPM', color: '#ff9500' }
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
          { label: 'Resting Heart Rate', value: '--', color: '#ff3b30' },
          { label: 'HRV', value: '--', color: '#00bfff' },
          { label: 'Recovery', value: '--', color: '#00ff88' }
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
          { label: 'Time Asleep', value: '--', color: '#6b7280' },
          { label: 'Sleep Quality', value: '--', color: '#6b7280' }
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
          { label: 'Stress Level', value: '--', color: '#6b7280' }
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
            { label: 'Cycle Day', value: `Day ${dayOfCycle} of ${profile.averageCycleLength}`, color: '#00bfff' }
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
            { label: 'HRV', value: `${liveHrv} ms`, color: '#00bfff' },
            { label: 'Resting Heart Rate', value: `${liveBpm} BPM`, color: '#ff3b30' },
            { label: 'Sleep Quality', value: liveSleepQualityPercent !== null ? `${liveSleepQualityPercent}%` : '--', color: '#00ff88' }
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
            details: { ...item.details, subMetrics: [{ label: 'Steps', value: '--', color: '#6b7280' }, ...item.details.subMetrics.slice(1)] }
          };
        }
        if (liveSteps === null) {
          return {
            ...item,
            reading: 'Waiting for data…',
            status: 'Calibrating' as const,
            behavior: 'No step data from your device yet today',
            details: { ...item.details, subMetrics: [{ label: 'Steps', value: '--', color: '#6b7280' }, ...item.details.subMetrics.slice(1)] }
          };
        }
        return {
          ...item,
          reading: `${liveSteps} steps today`,
          behavior: 'Synced from your device',
          details: { ...item.details, subMetrics: [{ label: 'Steps Today', value: `${liveSteps}`, color: '#00ff88' }, ...item.details.subMetrics.slice(1)] }
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
                { label: 'Resting Heart Rate', value: '--', color: '#6b7280' },
                { label: 'HRV', value: '--', color: '#6b7280' }
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
              { label: 'Resting Heart Rate', value: `${liveBpm} BPM`, color: '#ff3b30' },
              { label: 'HRV', value: `${liveHrv} ms`, color: '#00bfff' },
              { label: 'Recovery', value: liveBpm > 100 ? 'Caution' : 'Good', color: liveBpm > 100 ? '#ff3b30' : '#00ff88' }
            ]
          }
        };
      }
      if (item.id === 'BIO-4') {
        const emptySleepSubMetrics = [
          { label: 'Time Asleep', value: '--', color: '#6b7280' },
          { label: 'Sleep Quality', value: '--', color: '#6b7280' }
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
              { label: 'Time Asleep', value: liveSleepMinutes !== null ? formatMinutesAsHoursMinutes(liveSleepMinutes) : '--', color: '#00ff88' },
              { label: 'Sleep Quality', value: `${liveSleepQualityPercent}%`, color: '#00bfff' }
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
            details: { ...item.details, subMetrics: [{ label: 'Stress Level', value: '--', color: '#6b7280' }, ...item.details.subMetrics.slice(1)] }
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
              { label: 'Stress Level', value: stressLabel, color: stressLabel === 'High' ? '#ff3b30' : '#00ff88' },
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
      const response = await fetch('/api/complete-quest', {
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

  const getStreakFlameDisplay = (s: number): { emoji: string; tierClass: string } => {
    if (s >= 14) return { emoji: '🔥🔥🔥', tierClass: 'streak-tier-4' };
    if (s >= 7) return { emoji: '🔥🔥🔥', tierClass: 'streak-tier-3' };
    if (s >= 3) return { emoji: '🔥🔥', tierClass: 'streak-tier-2' };
    if (s >= 1) return { emoji: '🔥', tierClass: 'streak-tier-1' };
    return { emoji: '💤', tierClass: 'streak-tier-0' };
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
    { id: 'CHAR-NHS', name: 'NHS Charities Together', mission: 'Supporting frontline health staff, clinical equipment, and patient recovery schemes.', desc: 'Strengthen local health ecosystems.' },
    { id: 'CHAR-BHF', name: 'British Heart Foundation', mission: 'Funding cardiovascular health research, clinical trials, and life-saving tech.', desc: 'Support clinical science research.' },
    { id: 'CHAR-TRUSSELL', name: 'The Trussell Trust', mission: 'Stopping hunger and supporting local food banks to end poverty in the UK.', desc: 'Direct societal food security relief.' }
  ];

  const handleDonateToCharity = async (charityId: string, charityName: string) => {
    const requiredPoints = 1000;

    if (totalVoucherPoints < requiredPoints) {
      alert(`⚠️ INSUFFICIENT BALANCE: Point donation threshold is ${requiredPoints} points. Continue completing active quests to accumulate balance!`);
      return;
    }

    setIsDonating(true);
    try {
      const response = await fetch('/api/donate-charity', {
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
      setMotivationMessage(`🎗️ SOCIAL VALUE LOGGED: Donation pledge to ${charityName} recorded successfully.`);
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
      setMotivationMessage("🚨 FRAUD WARNING: Locomotive device oscillation frequency is physically impossible (>350 SPM). Activity dropped.");
      alert("⚠️ ANTI-CHEAT INTERCEPT: Device oscillation frequency exceeds human locomotion velocity threshold (350 SPM). Payload dropped. Financial transaction blocked.");
      setTimeout(() => setMotivationMessage(null), 7000);
      return;
    }
    const updated = [...biometrics];
    updated[0].reading = `${cadence} SPM`;
    setBiometrics(updated);
    setCaloriesBurned(prev => prev + Math.round(cadence * 0.4));

    const pointsEarned = Math.round(cadence * 0.1);
    setTotalVoucherPoints(prev => {
      const nextPts = prev + pointsEarned;
      localStorage.setItem('kinetix_voucher_points', nextPts.toString());
      return nextPts;
    });

    setMotivationMessage(`🏃 Locomotion verified! Step cadence synced at ${cadence} SPM. Earned +${pointsEarned} Points.`);
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
      const recommendation = `❌ DIETARY EXCLUSION INGESTION TRIGGERED: Your personal food hazard list flagged (${flagged.join(', ')}) in this formulation scan. Ingest target rejected. Recommending organic plant-protein alternative formulation containing 12g fiber to satisfy your ${profile.target} target.`;
      setMotivationMessage(`⚠️ INGESTION WARNING: Personal allergen hazard detected in your scan!`);
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
      recommendation = `📉 METABOLIC CALIBRATION MATRIX APPROVED. High-fiber indices confirmed. Consuming this meal requires +22g of clean, lean protein substrates in your next training block to defend skeletal muscle fibers from caloric deficit exhaustion. Ingest +500ml of hydration to optimize metabolic transport and satisfy your strict daily NHS fiber guidelines.`;
    } else if (profile.target === 'Weight Gain') {
      recommendation = `📈 HYPER-TROPHIC ANABOLIC CALIBRATION APPROVED. Mass accumulation threshold logged. Carbohydrate metrics cleared. Recommending an immediate secondary baseline boost of +35g carbohydrates and +15g amino acid substrates to satisfy continuous metabolic tissue restoration. Ensure continuous hydration syncing.`;
    } else if (profile.target === 'Cardio Endurance') {
      recommendation = `⚡ CARDIOVASCULAR OXIDATION CALIBRATION APPROVED. Glycogen reserves successfully replenished. Estimated metabolic oxidation coefficient verified at optimal efficiency. Ensure a high-density hydration protocol of +750ml containing essential mineral matrices to support cardiovascular pulse load and low autonomic stress during high-workload locomotion.`;
    } else { // Autonomic Recovery
      recommendation = `🌱 AUTONOMIC RESTORATION MATRIX APPROVED. Low glycemic response confirmed. To help schedule active stress thresholds and keep resting cardiovascular heart rate low, supplement this formulation with +12g of essential healthy lipids and drink +450ml of alkaline hydration to speed vagal tone restoration.`;
    }
    setMotivationMessage(`✅ Scan approved! +${macros.fiber}g dietary fiber logged toward your NHS Goal!`);
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
      const response = await fetch('/api/scan-meal', {
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
      const response = await fetch('/api/scan-meal', {
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
      const response = await fetch('/api/lookup-barcode', {
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
      setMotivationMessage('📱 Live biometric sync requires the iOS or Android app. Open KinetixFit on your phone to connect Apple Health or Health Connect.');
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
      setMotivationMessage(`🔋 Connected to ${sourceName}! Live telemetry syncing now — this can take a moment to appear.`);
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
      const response = await fetch('/api/redeem-promo', {
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
      alert(`⚠️ REWARDS LOCK: You have only completed ${tasksCompletedTodayCount}/${requiredTaskCountForRedeem} today's target tasks. Physical effort required.`);
      setMotivationMessage("🔒 SECURITY LOCK: Complete at least 2 active quests today to authorize points redemption!");
      setTimeout(() => setMotivationMessage(null), 6000);
      return;
    }

    if (totalVoucherPoints < 2500) {
      alert("⚠️ INSUFFICIENT BALANCE: You need at least 2,500 points to redeem a voucher. Keep completing quests to earn more!");
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastRedemptionTime < 86400000) {
      alert("🔒 COOL-DOWN LIMIT: You can only redeem 1 reward every 24 hours.");
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
      const response = await fetch('/api/redeem-voucher', {
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
    let timeGreeting = "Good Morning";
    if (hours >= 12 && hours < 17) timeGreeting = "Good Afternoon";
    if (hours >= 17) timeGreeting = "Good Evening";

    return (
      <div style={{ marginBottom: '10px' }}>
        <h2 style={{ fontSize: '22px', color: '#00ff88', margin: '0 0 5px 0', fontWeight: 'bold', fontFamily: 'monospace' }}>
          {timeGreeting}, {profile.name || 'there'}
        </h2>
        <span style={{ fontSize: '15px', color: '#9ca3af', fontFamily: 'monospace' }}>
          {profile.smartDeviceConnected ? `Synced with ${profile.smartDeviceConnected}` : 'Connect a device to see your live stats.'}
        </span>
        <p style={{ fontSize: '14px', color: '#00bfff', fontStyle: 'italic', margin: '10px 0 0 0', lineHeight: '1.5' }}>
          "{getDailyQuote()}"
        </p>
      </div>
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
            <div className="ob-card">
              <div className="ob-logo">
                <svg width="56" height="28" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#2563EB" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h1 className="ob-title">Welcome to KinetixFit</h1>
              <p className="ob-body">Track your fitness, nutrition, and progress — all in one place.</p>
              <button onClick={() => setOnboardingStep(1)} className="ob-btn-primary">
                Get Started
              </button>
              <div className="ob-dots">
                <span className="ob-dot active"></span>
                <span className="ob-dot"></span>
              </div>
            </div>
          </div>
        </div>
        <style>{ONBOARDING_STYLES}</style>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '20px 0 28px 0' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px' }}>❤️</span>
                  <div>
                    <strong style={{ fontSize: '16px', color: '#1A1D1F' }}>Health tracking</strong>
                    <p style={{ fontSize: '14px', color: '#6B7280', margin: '2px 0 0 0' }}>See your real steps, heart rate, and sleep from your device.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px' }}>🍽️</span>
                  <div>
                    <strong style={{ fontSize: '16px', color: '#1A1D1F' }}>Food scanner</strong>
                    <p style={{ fontSize: '14px', color: '#6B7280', margin: '2px 0 0 0' }}>Scan a barcode or photo to check nutrition and allergens.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px' }}>🎁</span>
                  <div>
                    <strong style={{ fontSize: '16px', color: '#1A1D1F' }}>Rewards</strong>
                    <p style={{ fontSize: '14px', color: '#6B7280', margin: '2px 0 0 0' }}>Earn points for healthy habits, redeem for vouchers or donations.</p>
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
        <style>{ONBOARDING_STYLES}</style>
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
                By continuing, you agree to our <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
              </p>
              <button type="button" onClick={() => setOnboardingStep(1)} className="ob-link" style={{ display: 'block', margin: '16px auto 0 auto' }}>Back</button>
            </div>
          </div>
        </div>
        <style>{ONBOARDING_STYLES}</style>
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
              <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '8px' }}>❤️</div>
              <h1 className="ob-title">See your real stats</h1>
              <p className="ob-body">
                We use {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'} to show your real steps, heart rate, and sleep — no guessing, no placeholder numbers. You can disconnect at any time in Profile.
              </p>
              <button onClick={handleConnectHealthSource} disabled={isConnectingHealth} className="ob-btn-primary" style={{ marginBottom: '12px' }}>
                {isConnectingHealth ? 'Connecting…' : `Connect ${Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}`}
              </button>
              <button onClick={() => setOnboardingStep(4)} className="ob-btn-secondary">
                {profile.smartDeviceConnected ? 'Continue' : 'Skip for now'}
              </button>
              {!Capacitor.isNativePlatform() && (
                <p className="ob-footnote">📱 Live sync requires the iOS or Android app — you can skip this on web.</p>
              )}
            </div>
          </div>
        </div>
        <style>{ONBOARDING_STYLES}</style>
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
              <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '8px' }}>🔔</div>
              <h1 className="ob-title">Stay on track</h1>
              <p className="ob-body">
                We'll send helpful reminders — hydration during your work hours, and a nudge if you forget to log a meal. Only if you want them — you can turn these off anytime in Profile.
              </p>
              <button
                onClick={async () => { await ensureNotificationPermission(); setOnboardingStep(5); }}
                className="ob-btn-primary"
                style={{ marginBottom: '12px' }}
              >
                Enable Notifications
              </button>
              <button onClick={() => setOnboardingStep(5)} className="ob-btn-secondary">Skip for now</button>
            </div>
          </div>
        </div>
        <style>{ONBOARDING_STYLES}</style>
      </div>
    );
  }

  // C. ONBOARDING STEP 5: Biographical profile setup
  if (onboardingStep === 5) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '14px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 1 OF 3: PROFILE DEPLOYMENT</span>
              <h2 style={{ fontSize: '20px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px', color: '#fff' }}>Tell Us About You</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Your Display Name
                  <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="auth-input" />
                </label>
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Height (cm)
                  <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="auth-input" />
                </label>
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Weight (kg)
                  <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="auth-input" />
                </label>
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Age
                  <input type="number" value={profile.age} onChange={(e) => saveProfileToStorage({...profile, age: parseInt(e.target.value) || 0})} className="auth-input" />
                </label>
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Biological Sex
                  <select value={profile.sex ?? ''} onChange={(e) => saveProfileToStorage({...profile, sex: e.target.value === '' ? null : e.target.value as UserProfile['sex']})} className="auth-input-select">
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
                {profile.sex === 'female' && (
                  <>
                    <label style={{ fontSize: '16px', color: '#9ca3af' }}>Last Period Start Date
                      <input type="date" value={profile.lastPeriodStartDate ?? ''} onChange={(e) => saveProfileToStorage({...profile, lastPeriodStartDate: e.target.value || null})} className="auth-input" />
                    </label>
                    <label style={{ fontSize: '16px', color: '#9ca3af' }}>Average Cycle Length (days)
                      <input type="number" value={profile.averageCycleLength} onChange={(e) => saveProfileToStorage({...profile, averageCycleLength: parseInt(e.target.value) || 28})} className="auth-input" />
                    </label>
                  </>
                )}
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Activity Level
                  <select value={profile.activityLevel} onChange={(e) => saveProfileToStorage({...profile, activityLevel: e.target.value as UserProfile['activityLevel']})} className="auth-input-select">
                    <option value="sedentary">Sedentary (little to no exercise)</option>
                    <option value="light">Light (exercise 1-3x/week)</option>
                    <option value="moderate">Moderate (exercise 3-5x/week)</option>
                    <option value="active">Active (exercise 6-7x/week)</option>
                    <option value="very_active">Very Active (hard exercise/physical job)</option>
                  </select>
                </label>
                <label style={{ fontSize: '16px', color: '#9ca3af' }}>Primary Fitness Target
                  <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as UserProfile['target']})} className="auth-input-select">
                    <option value="Autonomic Recovery">Autonomic Recovery</option>
                    <option value="Weight Loss">Weight Loss</option>
                    <option value="Weight Gain">Weight Gain</option>
                    <option value="Cardio Endurance">Cardio Endurance</option>
                  </select>
                </label>
                <button onClick={() => setOnboardingStep(6)} className="primary-btn" style={{ marginTop: '10px' }}>
                  Confirm & Continue
                </button>
              </div>
            </div>
            <style>{ONBOARDING_PROFILE_STYLES}</style>
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

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '14px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 2 OF 3: FOOD EXCLUSION CONFIGURATION</span>
              <h2 style={{ fontSize: '20px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px', color: '#fff' }}>Set Personal Allergen Prohibitions</h2>
              <p style={{ fontSize: '16px', color: '#9ca3af', lineHeight: '1.6', marginBottom: '15px', margin: '0 0 15px 0' }}>
                Select any food allergens you're sensitive to. The scanner will flag these when you scan a barcode or photo.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '5px', marginBottom: '15px' }}>
                {the14Allergens.map(allergen => {
                  const active = profile.personalAllergens.includes(allergen);
                  return (
                    <button
                      key={allergen}
                      onClick={() => handleTogglePersonalAllergen(allergen)}
                      style={{
                        backgroundColor: active ? 'rgba(0, 255, 136, 0.08)' : '#030712',
                        border: `1px solid ${active ? '#00ff88' : '#374151'}`,
                        color: active ? '#00ff88' : '#ffffff',
                        padding: '6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '15px',
                        textAlign: 'left',
                        fontFamily: 'monospace'
                      }}
                    >
                      {active ? '✓ ' : '+ '} {allergen.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setOnboardingStep(5)} className="secondary-btn" style={{ flex: 1 }}>
                  Back
                </button>
                <button onClick={handleCompleteOnboarding} className="primary-btn" style={{ flex: 1.5 }}>
                  Confirm Allergens
                </button>
              </div>
            </div>
            <style>{ONBOARDING_PROFILE_STYLES}</style>
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
                  <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#00ff88" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
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
                <div style={{ flex: 1.2 }}>
                  {getPersonalizedWelcome()}
                  {streak > 0 && (
                    <p style={{ fontSize: '14px', color: '#9ca3af', margin: '8px 0 0 0' }}>
                      {getStreakFlameDisplay(streak).emoji} {streak}-day streak
                    </p>
                  )}
                  <p style={{ fontSize: '16px', color: '#9ca3af', lineHeight: '1.6', marginTop: '10px', margin: '10px 0 0 0' }}>
                    Tap a card below to see your real 7-day trend.
                  </p>
                </div>
              </div>

              {/* 7-Day Health Trends — real device history, honest empty states when disconnected */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <BiometricTrendCard
                  icon="🚶"
                  title="Steps"
                  status={stepsBio.status}
                  behavior={stepsBio.behavior}
                  latestReading={String(stepsBio.reading)}
                  subMetrics={stepsBio.details.subMetrics}
                  trend={healthTrends.steps}
                  unit=""
                  color="#2563EB"
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
                  icon="❤️"
                  title="Heart Rate"
                  status={heartRateBio.status}
                  behavior={heartRateBio.behavior}
                  latestReading={String(heartRateBio.reading)}
                  subMetrics={heartRateBio.details.subMetrics}
                  trend={healthTrends.heartRate}
                  unit=" bpm"
                  color="#DC2626"
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
                  icon="😴"
                  title="Sleep"
                  status={sleepBio.status}
                  behavior={sleepBio.behavior}
                  latestReading={String(sleepBio.reading)}
                  subMetrics={sleepBio.details.subMetrics}
                  trend={healthTrends.sleep}
                  unit="%"
                  color="#7C3AED"
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
                  icon="🧘"
                  title="Stress (HRV estimate)"
                  status={stressBio.status}
                  behavior={stressBio.behavior}
                  latestReading={String(stressBio.reading)}
                  subMetrics={stressBio.details.subMetrics}
                  trend={healthTrends.stress}
                  unit=" ms HRV"
                  color="#D97706"
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
                <h3 className="ecg-title" style={{ margin: '0 0 10px 0' }}>Log a Workout</h3>
                <div className="sport-workload-bar">
                  {[
                    { id: 'rest', label: '🧘 Rest & Recovery' },
                    { id: 'run', label: '🏃 Cardio Run' },
                    { id: 'cycle', label: '🚴 Cycle Sprint' },
                    { id: 'swim', label: '🏊 Swim Laps' }
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
                <button onClick={handleLogWorkout} className="primary-btn" style={{ width: '100%', marginTop: '8px', padding: '10px' }}>
                  ✅ Log This Workout
                </button>
              </div>

              </div> {/* End Left Panel */}

              <div className="vitals-right-panel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="section-header" style={{ margin: 0 }}>Connection Status</h3>
                  <span style={{
                    fontSize: '12px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px',
                    color: isLiveHealthData ? '#00ff88' : '#ff9500',
                    backgroundColor: isLiveHealthData ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 149, 0, 0.08)',
                    border: `1px solid ${isLiveHealthData ? '#00ff88' : '#ff9500'}`
                  }}>
                    {isLiveHealthData ? `🟢 LIVE — ${profile.smartDeviceConnected}` : '🔌 NOT CONNECTED'}
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
                    <span className="bio-behavior-log">
                      Behavior: {sexCard.behavior}
                    </span>
                  </div>
                )}
              </div>

              {/* Device connection shortcut — editing your details lives in Profile now, not duplicated here */}
              <div className="profile-actions-row">
                <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn">
                  🔌 Connect a Device
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
                <span className="vitals-label">NHS GUIDELINE DIETARY BALANCE</span>
                <h3 className="nourish-calories-remaining" style={{ color: caloriesRemaining > 0 ? '#00ff88' : '#ff3b30' }}>
                  {caloriesRemaining > 0 ? `${caloriesRemaining} kcal Remaining` : `${Math.abs(caloriesRemaining)} kcal Deficit Over`}
                </h3>

                {/* Macro progress meters */}
                <div className="macro-meters-stack">
                  <div className="macro-progress-bar">
                    <div className="macro-bar-header">
                      <span>Dietary Fiber (NHS Goal: 30g)</span>
                      <strong style={{ color: '#00ff88' }}>{dailyConsumables.fiber}g / 30g</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill green-fill" style={{ width: `${Math.min(100, (dailyConsumables.fiber / 30) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="macro-progress-bar">
                    <div className="macro-bar-header">
                      <span>Protein Index</span>
                      <strong style={{ color: '#00bfff' }}>{dailyConsumables.protein}g / {nhsTargets.protein}g</strong>
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
                  <h3 className="card-header-title">🍽️ Suggested Next Meal</h3>
                  <p className="card-header-desc">
                    Based on what you have left today, filtered against your personal allergens.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {mealSuggestions.map((s, idx) => (
                      <div key={idx} style={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '10px 12px', fontSize: '16px', color: '#ffffff', lineHeight: '1.6' }}>
                        {s.text}
                        <span style={{ display: 'block', fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
                          ~{s.calories} kcal · {s.protein}g protein · {s.fiber}g fiber
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Food Scanner */}
              <div className="scanner-module-card">
                <h3 className="card-header-title">Food Scanner</h3>
                <p className="card-header-desc">
                  Check foods against your personal allergy preferences.
                </p>

                {/* Scanner Input Row with Camera Trigger */}
                <div className="scanner-input-row">
                  <input
                    type="text"
                    placeholder="Enter formulation ingredients (e.g. Tomato Pasta)"
                    value={mealInput}
                    onChange={(e) => setMealInput(e.target.value)}
                    className="scanner-text-input"
                  />
                  <button onClick={() => setShowCameraModal(true)} className="scanner-camera-trigger" title="Simulate Camera OCR Scan">
                    📷
                  </button>
                  <button onClick={() => handleMealScan()} disabled={isScanLoading} className="scanner-submit-btn">
                    {isScanLoading ? 'Scanning…' : 'Scan'}
                  </button>
                </div>

                {/* Scan Outcomes Panel */}
                {scanResult && (
                  <div className={`scan-outcome-panel border-${scanResult.complianceStatus.toLowerCase()}`}>
                    <div className="scan-outcome-header">
                      <span>Formulation Ingestion Scan</span>
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
                        <strong className="panel-sub-label">MACRO METRICS:</strong>
                        <p>• Calories: {scanResult.calories} kcal</p>
                        <p>• Carbs: {scanResult.macros.carbs}g</p>
                        <p>• Protein: {scanResult.macros.protein}g</p>
                        <p style={{ color: '#00ff88', fontWeight: 'bold' }}>• Fiber: +{scanResult.macros.fiber}g logged</p>
                      </div>
                      <div>
                        <strong className="panel-sub-label">MICRO INDICES:</strong>
                        <p>• Sodium: {scanResult.micros.sodium}</p>
                        <p>• Potassium: {scanResult.micros.potassium}</p>
                        <p>• Iron: {scanResult.micros.iron}</p>
                        <p>• Calcium: {scanResult.micros.calcium}</p>
                      </div>
                    </div>

                    <div className="scan-clinical-recommendation">
                      <strong>AI BIOMETRIC HEALTH STRATEGY:</strong>
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
              <div className="vitals-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '25px', alignItems: 'start' }}>

                {/* LEFT PROFILE PANEL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                  {/* Bio Athlete Holographic Status Card */}
                  <div className="vitals-hero-card" style={{ position: 'relative', overflow: 'hidden' }}>
                    <div style={{ flex: 1.2 }}>
                      <span className="vitals-label font-bold" style={{ color: '#00ff88', letterSpacing: '2px', fontSize: '14px', textTransform: 'uppercase' }}>🛡️ ATHLETE PROFILE</span>
                      <h2 style={{ fontSize: '24px', color: '#fff', margin: '12px 0 6px 0', fontWeight: '900', fontFamily: 'monospace', letterSpacing: '1px' }}>
                        {profile.name || 'ANONYMOUS ATHLETE'}
                      </h2>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                        <span className="bio-status-badge status-optimal" style={{ fontSize: '12px', padding: '2px 8px' }}>STREAK: {getStreakFlameDisplay(streak).emoji} {streak}-Day</span>
                        <span className="bio-status-badge status-syncing" style={{ fontSize: '12px', padding: '2px 8px' }}>CONDITION: PEAK ATHLETE</span>
                      </div>
                    </div>
                    <div className="glowing-logo" style={{ opacity: 0.15, transform: 'scale(1.1)' }}>
                      <svg width="60" height="30" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#00ff88" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  {/* Smart Point balances Tracker */}
                  <div className="rewards-summary-card">
                    <span className="vitals-label font-bold" style={{ letterSpacing: '1px', fontSize: '13px' }}>YOUR WALLET • LEVEL {level} ({xp} XP)</span>
                    <h3 className="rewards-wallet-balance" style={{ fontSize: '28px', margin: '4px 0', color: '#00ff88', fontWeight: 'bold' }}>{totalVoucherPoints} Points</h3>
                    <p style={{ fontSize: '15px', color: '#9ca3af', lineHeight: '1.6', margin: '4px 0 12px 0' }}>
                      Complete quests to earn points, then redeem them for coffee vouchers or charity donations.
                    </p>
                  </div>

                  {/* Active Wearable Sensor Integration Panel */}
                  <div className="biopoint-validator-card">
                    <span className="validator-label" style={{ fontSize: '13px', letterSpacing: '1px' }}>🔋 CONNECTED DEVICES</span>
                    <p className="validator-desc" style={{ fontSize: '15px', lineHeight: '1.6' }}>
                      Connect your wearable device to sync your activity, heart rate, and sleep data automatically.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn" style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '15px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        🔌 Configure Smart Sensor Links
                      </button>
                    </div>
                  </div>

                  {/* Configure Biological Benchmarks Form */}
                  <div className="hub-support-card">
                    <span className="vitals-label font-bold" style={{ fontSize: '13px', color: '#00ff88', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>⚙️ PHYSICAL PERFORMANCE PARAMETERS</span>
                    <div className="drawer-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Display Name
                        <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Height (cm)
                        <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Weight (kg)
                        <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Age
                        <input type="number" value={profile.age} onChange={(e) => saveProfileToStorage({...profile, age: parseInt(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Biological Sex
                        <select value={profile.sex ?? ''} onChange={(e) => saveProfileToStorage({...profile, sex: e.target.value === '' ? null : e.target.value as UserProfile['sex']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="">Prefer not to say</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </label>
                      {profile.sex === 'female' && (
                        <>
                          <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Last Period Start Date
                            <input type="date" value={profile.lastPeriodStartDate ?? ''} onChange={(e) => saveProfileToStorage({...profile, lastPeriodStartDate: e.target.value || null})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </label>
                          <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Average Cycle Length (days)
                            <input type="number" value={profile.averageCycleLength} onChange={(e) => saveProfileToStorage({...profile, averageCycleLength: parseInt(e.target.value) || 28})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </label>
                        </>
                      )}
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Activity Level
                        <select value={profile.activityLevel} onChange={(e) => saveProfileToStorage({...profile, activityLevel: e.target.value as UserProfile['activityLevel']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="sedentary">Sedentary</option>
                          <option value="light">Light</option>
                          <option value="moderate">Moderate</option>
                          <option value="active">Active</option>
                          <option value="very_active">Very Active</option>
                        </select>
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Fitness Target
                        <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as UserProfile['target']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="Autonomic Recovery">Autonomic Recovery</option>
                          <option value="Weight Loss">Weight Loss</option>
                          <option value="Weight Gain">Weight Gain</option>
                          <option value="Cardio Endurance">Cardio Endurance</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  {/* Natasha's Law Exclusions selection list */}
                  <div className="scanner-module-card">
                    <span className="vitals-label font-bold" style={{ fontSize: '13px', color: '#00ff88', letterSpacing: '1.5px', display: 'block', marginBottom: '4px' }}>🥗 FOOD ALLERGY PREFERENCES</span>
                    <p className="card-header-desc" style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.6', margin: '4px 0 12px 0' }}>
                      Select food allergies. These dynamically update the 1-Tap formulation scanning engines and suggest custom protein target alternatives.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                      {the14Allergens.map(allergen => {
                        const active = profile.personalAllergens.includes(allergen);
                        return (
                          <button
                            key={allergen}
                            onClick={() => handleTogglePersonalAllergen(allergen)}
                            style={{
                              backgroundColor: active ? 'rgba(0, 255, 136, 0.08)' : '#030712',
                              border: `1px solid ${active ? '#00ff88' : '#374151'}`,
                              color: active ? '#00ff88' : '#ffffff',
                              padding: '6px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '15px',
                              textAlign: 'left',
                              fontFamily: 'monospace'
                            }}
                          >
                            {active ? '✓ ' : '+ '} {allergen.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notification Settings */}
                  <div className="hub-support-card">
                    <span className="vitals-label font-bold" style={{ fontSize: '13px', color: '#00ff88', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>🔔 NOTIFICATION SETTINGS</span>
                    <label className="demo-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#ffffff', cursor: 'pointer', marginBottom: '10px' }}>
                      <input
                        type="checkbox"
                        checked={hydrationRemindersEnabled}
                        onChange={(e) => {
                          setHydrationRemindersEnabled(e.target.checked);
                          localStorage.setItem('kinetix_hydration_enabled', e.target.checked.toString());
                        }}
                        className="demo-toggle-checkbox"
                        style={{ accentColor: '#00ff88', width: '13px', height: '13px' }}
                      />
                      💧 Hydration reminders during my active hours
                    </label>
                    <div className="drawer-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Work Hours Start
                        <select value={shiftStartHour} onChange={(e) => { const v = parseInt(e.target.value); setShiftStartHour(v); localStorage.setItem('kinetix_shift_start', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Work Hours End
                        <select value={shiftEndHour} onChange={(e) => { const v = parseInt(e.target.value); setShiftEndHour(v); localStorage.setItem('kinetix_shift_end', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                      </label>
                      <label className="drawer-label" style={{ fontSize: '14px', color: '#9ca3af' }}>Every
                        <select value={hydrationIntervalHours} onChange={(e) => { const v = parseInt(e.target.value); setHydrationIntervalHours(v); localStorage.setItem('kinetix_hydration_interval', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {[1, 2, 3, 4].map(h => <option key={h} value={h}>{h}h</option>)}
                        </select>
                      </label>
                    </div>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '10px 0 0 0', lineHeight: '1.6' }}>
                      Activity and nutrition-target alerts are always on (native app only) and fire at most once per event per day — no spam. You'll be asked to allow notifications the first time one of these actually needs to fire.
                    </p>
                  </div>

                  {/* Account */}
                  <div className="hub-support-card">
                    <span className="vitals-label font-bold" style={{ fontSize: '13px', color: '#00ff88', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>👤 ACCOUNT</span>
                    {(session?.user?.email || profile.email) && (
                      <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 12px 0' }}>Signed in as <strong style={{ color: '#ffffff' }}>{session?.user?.email || profile.email}</strong></p>
                    )}
                    <button onClick={handleLogout} className="connect-wearable-btn" style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '15px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                      Log Out
                    </button>
                  </div>

                </div>

                {/* RIGHT ACTIVE REWARDS PANEL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                  {/* Today's Gamified Quests list */}
                  <div className="quests-card">
                    <div className="quests-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px', marginBottom: '12px' }}>
                      <h3 className="quests-title" style={{ fontSize: '17px', color: '#00ff88', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🔥 Daily Active Quests</h3>
                      <span style={{ fontSize: '15px', color: '#9ca3af', fontWeight: 'bold' }}>{tasksCompletedTodayCount} Completed</span>
                    </div>
                    <div className="quests-list-stack" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {todayTasks.map(t => {
                        const isVerifying = completingTaskId === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => toggleTask(t.id)}
                            className={`quest-item-pill ${t.completed ? 'quest-item-completed' : ''}`}
                            style={{
                              background: t.completed ? 'rgba(0, 255, 136, 0.03)' : '#030712',
                              border: `1px solid ${t.completed ? '#00ff88' : '#1f2937'}`,
                              padding: '12px',
                              borderRadius: '8px',
                              cursor: t.completed || isVerifying ? 'default' : 'pointer',
                              opacity: isVerifying ? 0.6 : 1,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '15px',
                              transition: 'all 0.25s'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span style={{ color: t.completed ? '#00ff88' : '#6b7280' }}>{t.completed ? '●' : '○'}</span>
                              <span style={{ textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? '#00ff88' : '#ffffff', lineHeight: '1.5' }}>
                                {isVerifying ? 'Verifying…' : t.text}
                              </span>
                            </div>
                            <strong style={{ color: t.completed ? '#00ff88' : '#9ca3af', minWidth: '55px', textAlign: 'right' }}>+{t.pointsValue} pts</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Achievements / Badges Gallery — computed live from existing tracked data */}
                  <div className="quests-card">
                    <div className="quests-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px', marginBottom: '12px' }}>
                      <h3 className="quests-title" style={{ fontSize: '17px', color: '#00ff88', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🏅 Achievements</h3>
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
                    <span className="validator-label" style={{ fontSize: '13px', letterSpacing: '1.5px' }}>⚡ BIOMECHANICAL STEP VELOCIMETER</span>
                    <p className="validator-desc" style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.6', margin: '4px 0 12px 0' }}>
                      Enforce locomotive anti-cheat boundaries. Steps below 350 SPM velocity ceilings accrue point balances. Mechanical phone shakers are intercepted.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => handleSimulateSteps(120)} className="cadence-btn-normal" style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '15px', cursor: 'pointer' }}>
                        🏃 Locomotion (120 SPM)
                      </button>
                      <button onClick={() => handleSimulateSteps(420)} className="cadence-btn-alert" style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '15px', cursor: 'pointer' }}>
                        🚨 Fraud Shake (420 SPM)
                      </button>
                    </div>
                  </div>

                  {/* Kinetix Rewards Vault Card (Gateway selection) */}
                  <div className="rewards-redemption-card">
                    <div className="rewards-redemption-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>
                      <div>
                        <h3 className="redemption-title" style={{ fontSize: '18px', color: '#ffffff', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Kinetix Rewards Vault</h3>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>REDEEM YOUR POINTS</span>
                      </div>
                      <button onClick={triggerRewardVaultSettlement} disabled={isRedeemingVoucher} className="redeem-rewards-btn" style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '16px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        {isRedeemingVoucher ? 'Processing…' : '🎟️ Cash Out Voucher (2,500 Pts)'}
                      </button>
                    </div>

                    {/* Integrated Gateway Selector (disabled until live provider approval is confirmed) */}
                    <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px', marginBottom: '15px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Select Rewards Settlement Gateway:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        <button
                          disabled
                          style={{
                            backgroundColor: '#0b0f19',
                            border: '1px solid #1f2937',
                            color: '#4b5563',
                            fontSize: '14px',
                            padding: '6px 2px',
                            fontFamily: 'monospace',
                            borderRadius: '4px',
                            cursor: 'not-allowed',
                            fontWeight: 'normal',
                            opacity: 0.5
                          }}
                        >
                          KTX Global
                        </button>
                        <button
                          disabled
                          style={{
                            backgroundColor: '#0b0f19',
                            border: '1px solid #1f2937',
                            color: '#4b5563',
                            fontSize: '14px',
                            padding: '6px 2px',
                            fontFamily: 'monospace',
                            borderRadius: '4px',
                            cursor: 'not-allowed',
                            fontWeight: 'normal',
                            opacity: 0.5
                          }}
                        >
                          Direct API
                        </button>
                        <button
                          disabled
                          style={{
                            backgroundColor: '#0b0f19',
                            border: '1px solid #1f2937',
                            color: '#4b5563',
                            fontSize: '14px',
                            padding: '6px 2px',
                            fontFamily: 'monospace',
                            borderRadius: '4px',
                            cursor: 'not-allowed',
                            fontWeight: 'normal',
                            opacity: 0.5
                          }}
                        >
                          Local Claim
                        </button>
                      </div>

                      {/* Honest status message shown regardless of gateway state */}
                      <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', display: 'block', lineHeight: '1.5' }}>
                        Rewards redemption is launching soon — check back shortly.
                      </span>
                    </div>

                    {/* Active vouchers history ledger */}
                    <div className="ledger-table-container">
                      <table className="ledger-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #1f2937' }}>
                            <th style={{ textAlign: 'left', padding: '4px', color: '#6b7280' }}>TXID</th>
                            <th style={{ textAlign: 'left', padding: '4px', color: '#6b7280' }}>REWARD TYPE</th>
                            <th style={{ textAlign: 'left', padding: '4px', color: '#6b7280' }}>VALUE</th>
                            <th style={{ textAlign: 'left', padding: '4px', color: '#6b7280' }}>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vouchers.map(v => (
                            <tr key={v.id} style={{ borderBottom: '1px solid #111827' }}>
                              <td style={{ color: '#00bfff', padding: '6px 4px' }}>{v.id}</td>
                              <td style={{ padding: '6px 4px' }}>{v.provider}</td>
                              <td style={{ color: '#00ff88', fontWeight: 'bold', padding: '6px 4px' }}>{v.value}</td>
                              <td style={{ padding: '6px 4px' }}>
                                <span className={`ledger-status-pill status-${v.state.toLowerCase()}`} style={{ fontSize: '12px', padding: '1px 5px', borderRadius: '3px' }}>
                                  {v.state.toUpperCase()}
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
                    <div className="charity-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px', marginBottom: '12px' }}>
                      <div>
                        <h3 className="charity-title" style={{ fontSize: '17px', color: '#ffffff', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🎗️ UK Social Philanthropy Portal</h3>
                        <span className="charity-subtitle" style={{ fontSize: '12px', color: '#9ca3af' }}>Turn your points into real charity donations.</span>
                      </div>
                      <span className="donations-count-pill" style={{ fontSize: '14px', color: '#00ff88', fontWeight: 'bold' }}>Issued: {charityDonations}</span>
                    </div>

                    <div className="charity-options-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {ukCharities.map(charity => (
                        <div key={charity.id} className="charity-item-subcard" style={{ background: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px' }}>
                          <div>
                            <span className="charity-item-tag" style={{ fontSize: '12px', color: '#00bfff', textTransform: 'uppercase', fontWeight: 'bold' }}>{charity.desc}</span>
                            <h4 className="charity-item-name" style={{ fontSize: '16px', color: '#ffffff', margin: '2px 0' }}>{charity.name}</h4>
                            <p className="charity-item-mission" style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.5', margin: 0 }}>{charity.mission}</p>
                          </div>
                          <button onClick={() => handleDonateToCharity(charity.id, charity.name)} disabled={isDonating} className="donate-points-btn" style={{ marginTop: '10px', width: '100%', padding: '6px', fontSize: '14px' }}>
                            {isDonating ? 'Processing…' : '🎗️ Donate 1,000 Pts (£2.50)'}
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
                <span className="vitals-label font-bold">REVENUE SERVICES TRANSPARENCY</span>
                <p className="billing-status-title">
                  Licensing: <span style={{ color: '#00ff88' }}>{revenueCatStatus}</span>
                </p>
                <p className="billing-disclaimer">
                  KinetixFit endpoints are configured as premium accounts matching <strong style={{ color: '#00ff88' }}>£14.99 per subscriber per month</strong>. All newly initialized corporate endpoints begin with an introductory <strong style={{ color: '#00ff88' }}>7-Day Free Trial</strong> prior to transaction settlement steps.
                </p>
                <button
                  onClick={handleManageSubscription}
                  className="edit-bio-btn"
                  style={{ width: '100%', marginBottom: '12px' }}
                >
                  🔧 Manage Subscription
                </button>

                {/* Allocations columns */}
                <div className="billing-stats-row">
                  <div className="billing-stat-box">
                    <span>SEAT CAPACITY</span>
                    <strong>Unlimited Access</strong>
                    <p>Configured for complete active multi-user sync.</p>
                  </div>
                  <div className="billing-stat-box">
                    <span>HANDSHAKE ENVIRONMENT</span>
                    <strong>Native Sandbox</strong>
                    <p>Encrypted limits protect baseline variables.</p>
                  </div>
                </div>

                {/* Promo Code Input Panel */}
                <div className="promo-input-box">
                  <span className="promo-box-title">🔑 Partner Override Codes</span>
                  <p className="promo-box-desc">Activate lifetime promo passes and priority test allocations.</p>
                  <div className="promo-input-row">
                    <input
                      type="text"
                      placeholder="PROMO-CODE-HERE"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value)}
                      className="promo-text-input"
                    />
                    <button onClick={applyPromoCode} disabled={isRedeemingPromo || !promoCodeInput.trim()} className="promo-submit-btn">
                      {isRedeemingPromo ? 'Activating…' : 'Activate'}
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
                  <h3 className="legal-card-title">🔒 Autonomic Data Shield</h3>
                  <p className="legal-card-text">
                    All continuous biometric streams, ingestion records, and reward logs are encrypted strictly at-rest using secure local schemas. Operated securely under strict compliance with the <strong>UK GDPR</strong> and the <strong>Data Protection Act 2018</strong>.
                  </p>
                </div>
              </div>

              {/* Corporate Help Desk Widget */}
              <div className="hub-support-card">
                <h3 className="support-card-title">✉️ Contact Support</h3>

                {contactSuccess ? (
                  <div className="support-success-banner">
                    🚀 Message received! We'll respond within 12 hours.
                  </div>
                ) : (
                  <form onSubmit={handleSendContact} className="support-form-stack">
                    <label className="support-field-label">Your Name
                      <input type="text" required value={contactName} onChange={(e) => setContactName(e.target.value)} className="support-input" />
                    </label>
                    <label className="support-field-label">Email
                      <input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="support-input" />
                    </label>
                    <label className="support-field-label">Message
                      <textarea rows={3} required value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} className="support-textarea" />
                    </label>
                    <button type="submit" className="primary-btn" style={{ width: '100%', marginTop: '5px' }}>
                      Send Message
                    </button>
                  </form>
                )}

                <div className="support-emails-box">
                  <span>General Support: <a href="mailto:info@kinetixfit.co.uk">info@kinetixfit.co.uk</a></span>
                  <span>Enterprise Deals: <a href="mailto:partnerships@kinetixfit.co.uk">partnerships@kinetixfit.co.uk</a></span>
                </div>
              </div>

            </div>
          )}

          {/* ==================== FOOTER STATEMENT ==================== */}
          <footer className="app-compliance-footer">
            <h4 style={{ color: '#fff', fontSize: '15px', textTransform: 'uppercase', marginBottom: '4px' }}>Not a Medical Device</h4>
            <p style={{ lineHeight: '1.6' }}>
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
          title="Scan Food"
        >
          📷
        </button>

        {/* --- STICKY BOTTOM NAVIGATION BAR --- */}
        <nav className="phone-bottom-nav">
          {[
            {
              id: 'vitals',
              label: 'Today',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.25s' }}>
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              )
            },
            {
              id: 'nourish',
              label: 'Nourish',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.25s' }}>
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              )
            },
            {
              id: 'profile',
              label: 'Profile',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.25s' }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )
            },
            {
              id: 'hub',
              label: 'Hub',
              icon: (
                <svg className="nav-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.25s' }}>
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
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                <span className="nav-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#00ff88' : '#6b7280' }}>
                  {tab.icon}
                </span>
                <span className="nav-label" style={{ fontSize: '14px', fontWeight: active ? 'bold' : 'normal', color: active ? '#ffffff' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {tab.label}
                </span>
                {active && <span style={{ position: 'absolute', bottom: '0', width: '12px', height: '2px', backgroundColor: '#00ff88', borderRadius: '10px' }}></span>}
              </button>
            );
          })}
        </nav>

      </div>

      {/* --- SPECTACULAR NEON LEVEL UP CELEBRATION MODAL --- */}
      {showLevelUpModal && (
        <div className="portal-overlay-modal" style={{ zIndex: 15000 }}>
          <div className="modal-content-card levelup-celebration-card" style={{ border: '2px solid #00ff88', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <span className="levelup-sparkle levelup-sparkle-1">✨</span>
            <span className="levelup-sparkle levelup-sparkle-2">✨</span>
            <span className="levelup-sparkle levelup-sparkle-3">✨</span>
            <span className="levelup-trophy-icon" style={{ fontSize: '42px', display: 'block', marginBottom: '10px' }}>🏆</span>
            <h2 className="modal-title" style={{ color: '#00ff88', fontSize: '24px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Level Up!
            </h2>
            <p className="modal-desc" style={{ color: '#ffffff', fontSize: '17px', marginTop: '10px', lineHeight: '1.6' }}>
              You've reached
              <br/>
              <strong style={{ color: '#00bfff', display: 'block', margin: '10px 0', fontSize: '20px' }}>
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
            <h3 className="modal-title">🔋 Smart Wearable Link</h3>
            <p className="modal-desc">
              Synchronize raw continuous telemetry datasets cleanly with our active clearinghouse pipelines.
            </p>
            <div className="modal-options-stack">
              <button
                onClick={handleConnectHealthSource}
                disabled={isConnectingHealth}
                className="modal-sync-option-btn"
              >
                <span>⚡ {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}</span>
                <span style={{ color: '#00ff88' }}>{isConnectingHealth ? 'Connecting...' : 'Link Sensor'}</span>
              </button>
            </div>
            {!Capacitor.isNativePlatform() && (
              <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '10px' }}>
                📱 Live sync requires the iOS or Android app — desktop/web can't connect Apple Health or Health Connect.
              </p>
            )}

            {/* Real-time Syncing Educational Diagnostics Panel */}
            <div className="sync-diagnostics-card" style={{ marginTop: '15px', backgroundColor: '#030712', border: '1px solid #1f2937', padding: '12px', borderRadius: '8px', fontSize: '14px', color: '#9ca3af', textAlign: 'left', lineHeight: '1.6' }}>
              <span style={{ color: '#00bfff', fontWeight: 'bold', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📡 Telemetry Sync Protocol: How it Works
              </span>
              KinetixFit connects directly to your phone's health app — Apple Health or Health Connect — instead of 50 individual devices.
              <br/><br/>
              Whether you are syncing locomotive steps from a wristband, cardiac HRV streams from an ECG chest strap, or restorative deep sleep stages from a circadian ring, your smartphone aggregates them into a central feed. KinetixFit reads this central feed with a single click, instantly validating points in real-time!
            </div>
            <button onClick={() => setShowDeviceSyncModal(false)} className="modal-close-btn">
              Cancel Sync
            </button>
          </div>
        </div>
      )}

      {/* --- AI SPECTRAL INGESTION SCANNER MODAL --- */}
      {showCameraModal && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card">
            <h3 className="modal-title">📷 AI Spectral Ingestion Scanner</h3>

            {isCameraScanning ? (
              <div className="camera-viewfinder-scanning" style={{ height: '240px' }}>
                <div className="laser-beam"></div>
                <span className="scanner-status-text" style={{ textShadow: '0 0 10px #00ff88', marginTop: '5px' }}>Looking up product…</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p className="modal-desc">
                  Scan a barcode, snap or upload a photo for AI-powered food identification, or pick a quick option below.
                </p>

                {/* Real barcode scan */}
                <button
                  onClick={handleBarcodeScan}
                  className="primary-btn"
                  style={{ width: '100%', padding: '12px' }}
                >
                  🔍 Scan Barcode
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
                  className="primary-btn"
                  style={{ width: '100%', padding: '12px' }}
                >
                  📷 Take / Upload Photo
                </button>

                {/* OCR text custom capture box */}
                <div style={{ borderTop: '1px solid #1f2937', paddingTop: '15px' }}>
                  <label className="drawer-label" style={{ marginBottom: '6px', display: 'block' }}>Custom Formulation Viewfinder Capture</label>
                  <textarea
                    rows={2}
                    placeholder="Type or paste custom formulation ingredients (e.g. wheat, milk, eggs, peanuts) to run simulated AI character recognition scanner..."
                    value={mealInput}
                    onChange={(e) => setMealInput(e.target.value)}
                    className="support-textarea"
                    style={{ fontSize: '16px', background: '#030712', color: '#00ff88', border: '1px solid #00ff88', fontFamily: 'monospace', padding: '10px' }}
                  />
                  <button
                    onClick={() => triggerCameraScan(mealInput)}
                    disabled={!mealInput.trim()}
                    className="primary-btn"
                    style={{ width: '100%', marginTop: '10px', padding: '12px' }}
                  >
                    📷 RUN CUSTOM OCR SCANNER CAPTURE
                  </button>
                </div>

                <button onClick={() => setShowCameraModal(false)} className="modal-close-btn">
                  Close Viewfinder
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          🎨 ADVANCED SYSTEM STYLESHEET (FIXES CONTRAST, ALIGNMENT, AND SCALING)
          ========================================================================= */}
      <style>{`
        /* =========================================================================
            🌌 KINETIXFIT CINEMATIC FLUID HUD DESIGN SYSTEM (V14 ULTIMATE COCKPIT)
           ========================================================================= */

        /* Prevent default scrolling on body to maintain tactical app feel */
        body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #030712 !important;
        }

        /* Core Desktop Workspace Container */
        .workspace-container {
          background-color: #030712 !important;
          background-image:
            linear-gradient(rgba(0, 255, 136, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 136, 0.02) 1px, transparent 1px) !important;
          background-size: 30px 30px !important;
          color: #ffffff !important;
          min-height: 100dvh !important; height: -webkit-fill-available !important;
          font-family: monospace !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }

        /* 🖥️ Responsive Cinematic Layout Frame */
        /* On desktop, this expands into a full-screen high-tech command center. No outer phone shell clipping! */
        .app-viewport-container {
          width: 100vw !important;
          max-width: 1440px !important;
          height: 100dvh !important; height: -webkit-fill-available !important;
          background-color: rgba(3, 7, 18, 0.95) !important;
          backdrop-filter: blur(10px) !important;
          border: none !important;
          border-radius: 0px !important;
          box-shadow: none !important;
          position: relative !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        }

        /* Scrollable body of app - restructured as a gorgeous dashboard grid on desktop */
        .app-scroll-body {
          position: absolute !important;
          top: 0 !important; /* Header scrolls as the first item inside this container, not fixed above it */
          bottom: 95px !important; /* Height of bottom nav + spacing */
          left: 0 !important;
          right: 0 !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          padding: 20px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 25px !important;
          box-sizing: border-box !important;
          -webkit-overflow-scrolling: touch !important; /* iOS momentum scroll */
          touch-action: pan-y !important; /* Force touch gesture scrolling */
        }
        /* Thin beautiful custom scrollbars */
        .app-scroll-body::-webkit-scrollbar {
          width: 4px !important;
        }
        .app-scroll-body::-webkit-scrollbar-thumb {
          background-color: rgba(0, 255, 136, 0.2) !important;
          border-radius: 10px !important;
        }

        /* App Branding header */
        .app-brand-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 15px 30px !important;
          background-color: #0b0f19 !important;
          border-bottom: 2px solid #1f2937 !important;
          z-index: 50 !important;
        }
        .glowing-logo {
          filter: drop-shadow(0 0 8px rgba(0, 255, 136, 0.5)) !important;
        }
        .app-brand-title {
          font-size: 24px !important;
          font-weight: 900 !important;
          color: #ffffff !important;
          margin: 0 !important;
          letter-spacing: 2px !important;
          text-shadow: 0 0 10px rgba(0, 255, 136, 0.3) !important;
        }
        /* Alert Notification banner */
        .alert-ticker {
          background-color: rgba(0, 255, 136, 0.08) !important;
          border-bottom: 1px solid rgba(0, 255, 136, 0.25) !important;
          color: #00ff88 !important;
          padding: 8px 15px !important;
          font-size: 15px !important;
          text-align: center !important;
          font-weight: bold !important;
          z-index: 100 !important;
        }

        /* Tab fade effect */
        .tab-fade-in {
          animation: fadeEffect 0.3s ease !important;
        }
        @keyframes fadeEffect {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Headers of sections */
        .section-header {
          font-size: 17px !important;
          color: #9ca3af !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          margin: 0 !important;
          border-left: 3px solid #00ff88 !important;
          padding-left: 8px !important;
        }

        /* Grid layout for Desktop Tab 1 (Vitals) to look like a Sci-Fi Operations Room */
        .vitals-dashboard-grid {
          display: grid !important;
          grid-template-columns: 1fr 1.5fr !important;
          gap: 25px !important;
          align-items: start !important;
        }

        .vitals-left-panel {
          display: flex !important;
          flex-direction: column !important;
          gap: 25px !important;
        }

        .vitals-right-panel {
          display: flex !important;
          flex-direction: column !important;
          gap: 25px !important;
        }

        .badges-gallery-grid {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          gap: 10px !important;
        }
        .badge-tile {
          position: relative !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          padding: 12px 6px !important;
          border-radius: 10px !important;
          text-align: center !important;
          transition: all 0.3s ease !important;
        }
        .badge-icon { font-size: 26px !important; }
        .badge-label { font-size: 12px !important; text-transform: uppercase; letter-spacing: 0.3px !important; line-height: 1.5 !important; }
        .badge-unlocked {
          background-color: rgba(0, 255, 136, 0.06) !important;
          border: 1px solid #00ff88 !important;
          box-shadow: 0 0 10px rgba(0, 255, 136, 0.25) !important;
        }
        .badge-unlocked .badge-label { color: #00ff88 !important; }
        .badge-locked {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          filter: grayscale(1) !important;
          opacity: 0.45 !important;
        }
        .badge-locked .badge-label { color: #6b7280 !important; }
        .badge-lock-overlay {
          position: absolute !important;
          top: 4px !important;
          right: 6px !important;
          font-size: 14px !important;
        }
        /* Athletic Sport Selector Styling */
        .sport-workload-bar {
          display: grid !important;
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 8px !important;
          margin-bottom: 12px !important;
        }
        .sport-mode-btn {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          color: #9ca3af !important;
          padding: 8px !important;
          font-family: monospace !important;
          font-size: 14px !important;
          font-weight: bold !important;
          cursor: pointer !important;
          border-radius: 6px !important;
          transition: all 0.25s !important;
          text-align: center !important;
        }
        .sport-mode-btn:hover {
          color: #ffffff !important;
          background-color: #0b0f19 !important;
        }
        .active-sport-btn {
          background-color: rgba(0, 255, 136, 0.05) !important;
          color: #ffffff !important;
          box-shadow: 0 0 10px rgba(0, 255, 136, 0.15) !important;
        }

        /* Hero vitals layout */
        .vitals-hero-card {
          background: linear-gradient(135deg, #0b0f19 0%, #030712 100%) !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          gap: 20px !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.02) !important;
        }
        /* Workout logger card (reuses the old ECG card's shell/title styles) */
        .ecg-module-card {
          background: linear-gradient(135deg, #0b0f19 0%, #030712 100%) !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 15px !important;
          position: relative !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
        }
        .ecg-title {
          font-size: 20px !important;
          font-weight: bold !important;
          color: #ffffff !important;
          letter-spacing: 0.5px !important;
        }

        .biometric-item-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 12px !important;
          padding: 15px !important;
          cursor: pointer !important;
          transition: all 0.25s ease !important;
          position: relative !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          min-height: 135px !important;
          box-sizing: border-box !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
        }
        .biometric-item-card:hover {
          border-color: #00ff88 !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 25px rgba(0, 255, 136, 0.15) !important;
        }
        .bio-card-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          margin-bottom: 6px !important;
        }
        .bio-system-label {
          font-size: 12px !important;
          color: #6b7280 !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }
        .bio-status-badge {
          font-size: 12px !important;
          padding: 2px 6px !important;
          border-radius: 10px !important;
          font-weight: bold !important;
          letter-spacing: 0.5px !important;
        }
        .status-optimal { background-color: rgba(0, 255, 136, 0.08) !important; color: #00ff88 !important; }
        .status-syncing { background-color: rgba(0, 191, 255, 0.08) !important; color: #00bfff !important; }
        .status-calibrating { background-color: rgba(255, 149, 0, 0.08) !important; color: #ff9500 !important; }
        .status-critical { background-color: rgba(255, 59, 48, 0.08) !important; color: #ff3b30 !important; }
        .bio-metric-title {
          font-size: 17px !important;
          color: #ffffff !important;
          margin: 0 !important;
          font-weight: normal !important;
          letter-spacing: 0.5px !important;
        }
        .bio-metric-reading {
          font-size: 20px !important;
          font-weight: bold !important;
          color: #00ff88 !important;
          margin: 6px 0 !important;
          font-family: monospace !important;
          text-shadow: 0 0 10px rgba(0, 255, 136, 0.2) !important;
        }
        .bio-behavior-log {
          font-size: 12px !important;
          color: #9ca3af !important;
          display: block !important;
          border-top: 1px solid #111827 !important;
          padding-top: 6px !important;
          margin-top: 6px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .active-glow-indicator {
          font-size: 12px !important;
          color: #00ff88 !important;
          font-weight: bold !important;
          position: absolute !important;
          bottom: 3px !important;
          right: 10px !important;
          letter-spacing: 0.5px !important;
        }

        /* Action Buttons Row */
        .profile-actions-row {
          display: flex !important;
          gap: 12px !important;
          margin-top: 10px !important;
        }
        .connect-wearable-btn {
          flex: 1.2 !important;
          background-color: #00bfff !important;
          color: #000000 !important;
          font-weight: bold !important;
          border: none !important;
          padding: 10px !important;
          border-radius: 20px !important;
          cursor: pointer !important;
          font-size: 16px !important;
          font-family: monospace !important;
          transition: all 0.2s ease !important;
        }
        .connect-wearable-btn:hover {
          box-shadow: 0 0 15px rgba(0, 191, 255, 0.4) !important;
          transform: translateY(-1px) !important;
        }
        .edit-bio-btn {
          flex: 1 !important;
          background-color: #1f2937 !important;
          color: #ffffff !important;
          border: 1px solid #374151 !important;
          padding: 10px !important;
          border-radius: 20px !important;
          cursor: pointer !important;
          font-size: 16px !important;
          font-family: monospace !important;
          transition: all 0.2s ease !important;
        }
        .edit-bio-btn:hover {
          background-color: #374151 !important;
        }

        .drawer-form-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 15px !important;
        }
        .drawer-label {
          font-size: 15px !important;
          color: #9ca3af !important;
        }
        .drawer-input {
          width: 100% !important;
          background-color: #030712 !important;
          border: 1px solid #374151 !important;
          color: #ffffff !important;
          padding: 8px !important;
          margin-top: 4px !important;
          font-family: monospace !important;
          font-size: 16px !important;
          border-radius: 4px !important;
          outline: none !important;
          box-sizing: border-box !important;
        }
        .drawer-select {
          width: 100% !important;
          background-color: #030712 !important;
          border: 1px solid #374151 !important;
          color: #ffffff !important;
          padding: 8px !important;
          margin-top: 4px !important;
          font-family: monospace !important;
          font-size: 16px !important;
          border-radius: 4px !important;
          outline: none !important;
          box-sizing: border-box !important;
        }
        .drawer-select option {
          background-color: #0b0f19 !important;
          color: #ffffff !important;
        }

        /* NOURISH SCREEN STYLES */
        .nourish-summary-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
        }
        .nourish-calories-remaining {
          font-size: 24px !important;
          font-weight: bold !important;
          margin: 6px 0 !important;
        }
        .macro-meters-stack {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
          margin-top: 15px !important;
          border-top: 1px solid #1f2937 !important;
          padding-top: 15px !important;
        }
        .macro-progress-bar {
          display: flex !important;
          flex-direction: column !important;
          gap: 4px !important;
        }
        .macro-bar-header {
          display: flex !important;
          justify-content: space-between !important;
          font-size: 15px !important;
          color: #9ca3af !important;
        }
        .progress-track {
          width: 100% !important;
          height: 8px !important;
          background-color: #030712 !important;
          border-radius: 4px !important;
          overflow: hidden !important;
        }
        .progress-fill {
          height: 100% !important;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .green-fill { background-color: #00ff88 !important; }
        .blue-fill { background-color: #00bfff !important; }

        /* Scanner component card */
        .scanner-module-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
        }
        .card-header-title {
          font-size: 18px !important;
          color: #ffffff !important;
          margin: 0 0 6px 0 !important;
          border-left: 3px solid #00ff88 !important;
          padding-left: 10px !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
        }
        .card-header-desc {
          font-size: 16px !important;
          color: #9ca3af !important;
          line-height: 1.6 !important;
          margin: 0 0 15px 0 !important;
        }
        .scanner-input-row {
          display: flex !important;
          gap: 10px !important;
        }
        .scanner-text-input {
          flex: 1 !important;
          background-color: #030712 !important;
          border: 1px solid #374151 !important;
          color: #ffffff !important;
          padding: 12px !important;
          font-size: 17px !important;
          font-family: monospace !important;
          border-radius: 6px !important;
          outline: none !important;
        }
        .scanner-text-input:focus {
          border-color: #00ff88 !important;
        }
        .scanner-camera-trigger {
          background-color: rgba(0, 255, 136, 0.08) !important;
          border: 1px solid #00ff88 !important;
          color: #00ff88 !important;
          padding: 0 15px !important;
          font-size: 21px !important;
          cursor: pointer !important;
          border-radius: 6px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: all 0.2s ease !important;
        }
        .scanner-camera-trigger:hover {
          box-shadow: 0 0 10px rgba(0, 255, 136, 0.3) !important;
        }
        .scanner-submit-btn {
          background-color: #00ff88 !important;
          color: #000000 !important;
          font-weight: bold !important;
          border: none !important;
          padding: 0 20px !important;
          font-size: 17px !important;
          font-family: monospace !important;
          cursor: pointer !important;
          border-radius: 6px !important;
        }

        /* Scan Outcome Panel */
        .scan-outcome-panel {
          background-color: #030712 !important;
          border-radius: 10px !important;
          padding: 15px !important;
          margin-top: 20px !important;
          border: 1px solid #1f2937 !important;
        }
        .border-cleared { border-color: #00ff88 !important; }
        .border-hazard_detected { border-color: #ff3b30 !important; }
        .scan-outcome-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          border-bottom: 1px solid #1f2937 !important;
          padding-bottom: 10px !important;
          margin-bottom: 12px !important;
          font-size: 17px !important;
        }
        .compliance-badge {
          font-size: 14px !important;
          padding: 3px 10px !important;
          border-radius: 4px !important;
          font-weight: bold !important;
        }
        .badge-cleared { background-color: rgba(0, 255, 136, 0.1) !important; color: #00ff88 !important; }
        .badge-hazard_detected { background-color: rgba(255, 59, 48, 0.1) !important; color: #ff3b30 !important; }
        .estimated-portion-badge {
          display: inline-block !important;
          font-size: 13px !important;
          color: #9ca3af !important;
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          padding: 2px 8px !important;
          border-radius: 10px !important;
          margin-bottom: 12px !important;
        }
        .scan-macros-micros-grid {
          display: grid !important;
          grid-template-columns: 1.1fr 0.9fr !important;
          gap: 12px !important;
          font-size: 15px !important;
          color: #9ca3af !important;
          margin-bottom: 10px !important;
        }
        .panel-sub-label {
          color: #ffffff !important;
          display: block !important;
          font-size: 14px !important;
          margin-bottom: 4px !important;
        }
        .scan-clinical-recommendation {
          border-top: 1px solid #111827 !important;
          padding-top: 8px !important;
          font-size: 14px !important;
          line-height: 1.6 !important;
        }
        .scan-clinical-recommendation strong {
          color: #ffffff !important;
          display: block !important;
          margin-bottom: 3px !important;
        }

        /* REWARDS SCREEN STYLES */
        .rewards-summary-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
        }
        .rewards-wallet-balance {
          font-size: 28px !important;
          font-weight: bold !important;
          color: #00ff88 !important;
          margin: 4px 0 !important;
        }
        .demo-toggle-label {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          font-size: 14px !important;
          color: #ff9500 !important;
          cursor: pointer !important;
        }
        .demo-toggle-checkbox {
          accent-color: #ff9500 !important;
          width: 14px !important;
          height: 14px !important;
        }

        /* Speed Cadence anti-cheat panel */
        .biopoint-validator-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
        }
        .validator-label {
          font-size: 13px !important;
          color: #6b7280 !important;
          letter-spacing: 1px !important;
          display: block !important;
          margin-bottom: 4px !important;
        }
        .validator-desc {
          font-size: 14px !important;
          color: #9ca3af !important;
          line-height: 1.6 !important;
          margin: 0 0 12px 0 !important;
        }
        .cadence-btn-normal {
          flex: 1 !important;
          background-color: rgba(0, 255, 136, 0.08) !important;
          border: 1px solid #00ff88 !important;
          color: #00ff88 !important;
          padding: 8px !important;
          font-size: 15px !important;
          cursor: pointer !important;
          border-radius: 4px !important;
          font-family: monospace !important;
          font-weight: bold !important;
        }
        .cadence-btn-alert {
          flex: 1 !important;
          background-color: rgba(255, 59, 48, 0.08) !important;
          border: 1px solid #ff3b30 !important;
          color: #ff3b30 !important;
          padding: 8px !important;
          font-size: 15px !important;
          cursor: pointer !important;
          border-radius: 4px !important;
          font-family: monospace !important;
          font-weight: bold !important;
        }

        /* Quests list card */
        .quests-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
        }
        .quests-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          border-bottom: 1px solid #1f2937 !important;
          padding-bottom: 8px !important;
          margin-bottom: 12px !important;
        }
        .quests-title {
          font-size: 18px !important;
          color: #00ff88 !important;
          margin: 0 !important;
          text-transform: uppercase !important;
        }
        .quests-list-stack {
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
        }
        .quest-item-pill {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          padding: 12px !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          font-size: 16px !important;
          transition: border-color 0.2s !important;
        }
        .quest-item-completed {
          background-color: rgba(0, 255, 136, 0.03) !important;
          border-color: #00ff88 !important;
        }

        /* Rewards Settlement Vault card */
        .rewards-redemption-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
        }
        .rewards-redemption-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          margin-bottom: 12px !important;
        }
        .redemption-title {
          font-size: 18px !important;
          color: #ffffff !important;
          margin: 0 !important;
          border-left: 3px solid #00ff88 !important;
          padding-left: 10px !important;
          text-transform: uppercase !important;
        }
        .redeem-rewards-btn {
          background-color: #00ff88 !important;
          color: #000000 !important;
          font-weight: bold !important;
          border: none !important;
          padding: 6px 12px !important;
          border-radius: 15px !important;
          cursor: pointer !important;
          font-size: 15px !important;
          font-family: monospace !important;
        }
        .redemption-description {
          font-size: 14px !important;
          color: #9ca3af !important;
          line-height: 1.6 !important;
          margin: 0 0 12px 0 !important;
        }
        .ledger-table-container {
          overflow-x: auto !important;
        }
        .ledger-table {
          width: 100% !important;
          border-collapse: collapse !important;
          font-size: 14px !important;
          text-align: left !important;
        }
        .ledger-table th {
          border-bottom: 1px solid #1f2937 !important;
          color: #6b7280 !important;
          padding: 4px 6px !important;
          font-weight: normal !important;
        }
        .ledger-table td {
          padding: 8px 6px !important;
          border-bottom: 1px solid #111827 !important;
        }
        .ledger-status-pill {
          font-size: 12px !important;
          padding: 1px 4px !important;
          border-radius: 3px !important;
          font-weight: bold !important;
        }
        .ledger-status-pill.status-settled { background-color: rgba(0, 255, 136, 0.08) !important; color: #00ff88 !important; }
        .ledger-status-pill.status-donated { background-color: rgba(0, 191, 255, 0.08) !important; color: #00bfff !important; }

        /* Social Charity Card */
        .charity-matching-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 15px !important;
        }
        .charity-card-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          border-bottom: 1px solid #1f2937 !important;
          padding-bottom: 8px !important;
          margin-bottom: 12px !important;
        }
        .charity-title {
          font-size: 17px !important;
          color: #ffffff !important;
          margin: 0 !important;
          text-transform: uppercase !important;
        }
        .charity-subtitle {
          font-size: 13px !important;
          color: #9ca3af !important;
          display: block !important;
        }
        .donations-count-pill {
          font-size: 14px !important;
          color: #00ff88 !important;
          font-weight: bold !important;
        }
        .charity-options-grid {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        .charity-item-subcard {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 8px !important;
          padding: 12px !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          gap: 10px !important;
        }
        .charity-item-tag {
          font-size: 12px !important;
          color: #00bfff !important;
          text-transform: uppercase !important;
          font-weight: bold !important;
          display: block !important;
        }
        .charity-item-name {
          font-size: 17px !important;
          color: #ffffff !important;
          margin: 2px 0 !important;
        }
        .charity-item-mission {
          font-size: 14px !important;
          color: #9ca3af !important;
          line-height: 1.5 !important;
          margin: 0 !important;
        }
        .donate-points-btn {
          width: 100% !important;
          background-color: rgba(0, 191, 255, 0.08) !important;
          border: 1px solid #00bfff !important;
          color: #00bfff !important;
          font-weight: bold !important;
          padding: 6px !important;
          cursor: pointer !important;
          border-radius: 4px !important;
          font-size: 14px !important;
          font-family: monospace !important;
        }

        /* HUB STYLES */
        .hub-billing-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 15px !important;
        }
        .billing-status-title {
          font-size: 19px !important;
          font-weight: bold !important;
          margin: 4px 0 !important;
        }
        .billing-disclaimer {
          font-size: 14px !important;
          color: #6b7280 !important;
          line-height: 1.6 !important;
          margin: 5px 0 12px 0 !important;
        }
        .billing-stats-row {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 10px !important;
        }
        .billing-stat-box {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 6px !important;
          padding: 10px !important;
        }
        .billing-stat-box span {
          font-size: 12px !important;
          color: #6b7280 !important;
          display: block !important;
        }
        .billing-stat-box strong {
          font-size: 17px !important;
          color: #00ff88 !important;
          display: block !important;
          margin: 2px 0 !important;
        }
        .billing-stat-box p {
          font-size: 12px !important;
          color: #9ca3af !important;
          margin: 0 !important;
          line-height: 1.5 !important;
        }
        .promo-input-box {
          margin-top: 15px !important;
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 8px !important;
          padding: 12px !important;
        }
        .promo-box-title {
          font-size: 14px !important;
          color: #00bfff !important;
          font-weight: bold !important;
          display: block !important;
        }
        .promo-box-desc {
          font-size: 13px !important;
          color: #9ca3af !important;
          margin: 2px 0 8px 0 !important;
        }
        .promo-input-row {
          display: flex !important;
          gap: 8px !important;
        }
        .promo-text-input {
          flex: 1 !important;
          background-color: #030712 !important;
          border: 1px solid #374151 !important;
          color: #ffffff !important;
          padding: 6px !important;
          font-size: 16px !important;
          font-family: monospace !important;
          border-radius: 4px !important;
          outline: none;
        }
        .promo-text-input:focus {
          border-color: #00bfff !important;
        }
        .promo-submit-btn {
          background-color: #00bfff !important;
          color: #000000 !important;
          font-weight: bold !important;
          border: none !important;
          padding: 0 12px !important;
          font-size: 15px !important;
          font-family: monospace !important;
          cursor: pointer !important;
          border-radius: 4px !important;
        }
        .promo-response-msg {
          font-size: 14px !important;
          margin-top: 6px !important;
        }
        .response-error { color: #ff3b30 !important; }
        .response-success { color: #00ff88 !important; }

        /* Legal cards block */
        .hub-legal-stack {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
        }
        .legal-block-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 12px !important;
          padding: 12px !important;
        }
        .legal-card-title {
          font-size: 16px !important;
          color: #ffffff !important;
          margin: 0 0 6px 0 !important;
        }
        .legal-card-text {
          font-size: 14px !important;
          color: #9ca3af !important;
          line-height: 1.6 !important;
          margin: 0 !important;
        }

        /* Support module card */
        .hub-support-card {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 12px !important;
          padding: 15px !important;
        }
        .support-card-title {
          font-size: 17px !important;
          color: #ffffff !important;
          margin: 0 0 10px 0 !important;
        }
        .support-success-banner {
          background-color: rgba(0, 255, 136, 0.08) !important;
          border: 1px solid #00ff88 !important;
          color: #00ff88 !important;
          padding: 12px !important;
          border-radius: 6px !important;
          font-size: 15px !important;
          text-align: center !important;
        }
        .support-form-stack {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        .support-field-label {
          font-size: 14px !important;
          color: #9ca3af !important;
        }
        .support-input {
          width: 100% !important;
          background-color: #030712 !important;
          border: 1px solid #374151 !important;
          color: #ffffff !important;
          padding: 6px !important;
          margin-top: 3px !important;
          font-family: monospace !important;
          font-size: 15px !important;
          border-radius: 4px !important;
          outline: none !important;
          box-sizing: border-box !important;
        }
        .support-textarea {
          width: 100% !important;
          background-color: #030712 !important;
          border: 1px solid #374151 !important;
          color: #ffffff !important;
          padding: 6px !important;
          margin-top: 3px !important;
          font-family: monospace !important;
          font-size: 15px !important;
          border-radius: 4px !important;
          outline: none !important;
          resize: none !important;
          box-sizing: border-box !important;
        }
        .support-emails-box {
          border-top: 1px solid #111827 !important;
          margin-top: 12px !important;
          padding-top: 10px !important;
          font-size: 14px !important;
          color: #9ca3af !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 4px !important;
        }
        .support-emails-box a {
          color: #00ff88 !important;
          text-decoration: none !important;
        }

        /* Sticky Phone Navigation panel - redesigned as floating glass tab bar */
        .phone-bottom-nav {
          position: fixed !important;
          bottom: 15px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 92% !important;
          max-width: 480px !important;
          height: 65px !important;
          background-color: rgba(11, 15, 25, 0.9) !important;
          backdrop-filter: blur(20px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 40px !important;
          display: flex !important;
          justify-content: space-around !important;
          align-items: center !important;
          z-index: 100 !important;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 255, 136, 0.05) !important;
        }
        .nav-item-btn {
          background: none !important;
          border: none !important;
          color: #6b7280 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          cursor: pointer !important;
          font-family: monospace !important;
          font-size: 15px !important;
          font-weight: bold !important;
          gap: 4px !important;
          transition: all 0.25s ease !important;
        }
        .nav-item-active {
          color: #00ff88 !important;
        }
        .nav-icon {
          font-size: 21px !important;
        }
        .nav-item-active .nav-icon {
          filter: drop-shadow(0 0 3px rgba(0, 255, 136, 0.3)) !important;
        }

        /* Floating Tactical Quantum Scanner FAB */
        .floating-hud-camera-fab {
          position: fixed !important;
          bottom: 110px !important;
          right: 40px !important;
          width: 56px !important;
          height: 56px !important;
          border-radius: 50% !important;
          background: radial-gradient(circle, #0b0f19 0%, #030712 100%) !important;
          border: 2px solid #00ff88 !important;
          color: #00ff88 !important;
          font-size: 26px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          box-shadow: 0 0 25px rgba(0, 255, 136, 0.4) !important;
          z-index: 99 !important;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
        }
        .floating-hud-camera-fab:hover {
          transform: scale(1.15) rotate(15deg) !important;
          box-shadow: 0 0 35px rgba(0, 255, 136, 0.7) !important;
          border-color: #ffffff !important;
        }

        /* Overlay modal generic */
        .portal-overlay-modal {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background-color: rgba(3, 7, 18, 0.95) !important;
          backdrop-filter: blur(8px) !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          z-index: 1000 !important;
          padding: 20px !important;
        }
        .modal-content-card {
          width: 100% !important;
          max-width: 420px !important;
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 20px !important;
          padding: 25px !important;
          box-shadow: 0 15px 40px rgba(0, 255, 136, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.02) !important;
        }
        .levelup-celebration-card {
          animation: levelUpEntrance 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }
        .levelup-celebration-card::before {
          content: '' !important;
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          width: 140% !important;
          height: 140% !important;
          transform: translate(-50%, -50%) !important;
          background: radial-gradient(circle, rgba(0, 255, 136, 0.18) 0%, rgba(0, 255, 136, 0) 65%) !important;
          animation: levelUpGlowPulse 2.2s ease-in-out infinite !important;
          pointer-events: none !important;
        }
        @keyframes levelUpEntrance {
          0% { opacity: 0; transform: scale(0.8) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes levelUpGlowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .levelup-trophy-icon {
          animation: levelUpTrophyPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both !important;
        }
        @keyframes levelUpTrophyPop {
          0% { opacity: 0; transform: scale(0.3) rotate(-15deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .levelup-sparkle {
          position: absolute !important;
          font-size: 21px !important;
          opacity: 0 !important;
          animation: levelUpSparkleTwinkle 2.4s ease-in-out infinite !important;
          pointer-events: none !important;
        }
        .levelup-sparkle-1 { top: 12% !important; left: 15% !important; animation-delay: 0s !important; }
        .levelup-sparkle-2 { top: 20% !important; right: 12% !important; animation-delay: 0.7s !important; font-size: 17px !important; }
        .levelup-sparkle-3 { bottom: 18% !important; left: 22% !important; animation-delay: 1.3s !important; font-size: 18px !important; }
        @keyframes levelUpSparkleTwinkle {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .modal-title {
          font-size: 19px !important;
          color: #ffffff !important;
          margin: 0 0 4px 0 !important;
        }
        .modal-desc {
          font-size: 15px !important;
          color: #9ca3af !important;
          line-height: 1.6 !important;
          margin: 0 0 15px 0 !important;
        }
        .modal-options-stack {
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
        }
        .modal-sync-option-btn {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          color: #ffffff !important;
          padding: 10px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 15px !important;
          display: flex !important;
          justify-content: space-between !important;
          font-family: monospace !important;
        }
        .modal-close-btn {
          width: 100% !important;
          background-color: #1f2937 !important;
          color: #ffffff !important;
          border: 1px solid #374151 !important;
          padding: 8px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 15px !important;
          font-family: monospace !important;
          margin-top: 12px !important;
        }

        /* Camera scan window design */
        .camera-viewfinder-scanning {
          height: 180px !important;
          background-color: #030712 !important;
          border-radius: 10px !important;
          border: 1px solid #1f2937 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .laser-beam {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 3px !important;
          background-color: #00ff88 !important;
          box-shadow: 0 0 10px #00ff88 !important;
          animation: laserTravel 1.8s infinite linear !important;
        }
        @keyframes laserTravel {
          0% { top: 0; }
          50% { top: 180px; }
          100% { top: 0; }
        }
        .scanner-timer {
          font-size: 28px !important;
          animation: rotationSpin 2s infinite linear !important;
        }
        @keyframes rotationSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .scanner-status-text {
          font-size: 14px !important;
          color: #00ff88 !important;
          font-weight: bold !important;
          margin-top: 10px !important;
          text-align: center !important;
        }
        .scanner-subtext {
          font-size: 12px !important;
          color: #6b7280 !important;
          margin-top: 4px !important;
        }

        /* Compliance footer */
        .app-compliance-footer {
          border-top: 2px solid #1f2937 !important;
          margin-top: 15px !important;
          padding-top: 15px !important;
          font-size: 13px !important;
          color: #6b7280 !important;
        }

        /* 📱 Symmetrical Mobile Adaptation (Collapses seamlessly on smaller viewports) */
        @media (max-width: 1024px) {
          .vitals-dashboard-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 768px) {
          .floating-hud-camera-fab {
            bottom: 100px !important;
            right: 20px !important;
            width: 50px !important;
            height: 50px !important;
            font-size: 22px !important;
          }
        }
      `}</style>

    </div>
  );
}
