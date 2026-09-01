import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Purchases, type CustomerInfo } from '@revenuecat/purchases-capacitor';
import { Health } from '@capgo/capacitor-health';
import { LocalNotifications } from '@capacitor/local-notifications';

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
  waveType: 'sinusoidal' | 'ecg' | 'mitochondrial' | 'delta' | 'erratic_spikes' | 'slow_sinusoidal';
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

const SLEEP_QUALITY_PERCENT = 84;

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
  workoutsLogged: ['Morning Walk (30m)'],
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

  const [onboardingStep, setOnboardingStep] = useState<number>(0); // 0: Landing/Marketing, 1: Login, 2: Profile, 3: Allergens, 4: Device, 5: Portal
  const [emailInput, setEmailInput] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);

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

  // --- 3. SELECTED METRIC FOR DETAILED TRIPLE-TIER DRILLDOWN ---
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>('BIO-2'); // Defaults to Heart Health (BIO-2)

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
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [showDeviceSyncModal, setShowDeviceSyncModal] = useState<boolean>(false);
  const [isConnectingHealth, setIsConnectingHealth] = useState<boolean>(false);
  const [liveSteps, setLiveSteps] = useState<number | null>(null);
  const [liveSleepQualityPercent, setLiveSleepQualityPercent] = useState<number | null>(null);
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
  const [motivationMessage, setMotivationMessage] = useState<string | null>('KinetixFit Active Telemetry Pipeline Initialized.');

  const [lastRedemptionTime, setLastLastRedemptionTime] = useState<number>(0);
  const [requiredTaskCountForRedeem] = useState<number>(2); // Multi-step validation defense
  const [tasksCompletedTodayCount, setTasksCompletedTodayCount] = useState<number>(0);

  // --- 🛠️ Pitch Presentation Bypass Mode ---
  const [visaDemoMode, setVisaDemoMode] = useState<boolean>(false);

  // --- 6. REAL-TIME LIVE PULSE WAVE OSCILLATION MODULE ---
  const [liveBpm, setLiveBpm] = useState<number>(72);
  const [liveHrv, setLiveHrv] = useState<number>(68);
  const [pulseHistory, setPulseHistory] = useState<number[]>([72, 74, 71, 70, 75, 78, 73, 71, 72, 75, 79, 73, 70, 72, 74, 71]);

  // When no real device is connected, keep the dashboard visually alive with clearly-labeled
  // demo data (see the "DEMO DATA" badge on the telemetry panel) rather than freezing it.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < 5) return;
    if (isLiveHealthData) return;

    const interval = setInterval(() => {
      setLiveBpm(prev => {
        const delta = (Math.random() - 0.5) * 6;
        const next = Math.max(58, Math.min(108, Math.round(prev + delta)));
        setPulseHistory(h => [...h.slice(1), next]);
        return next;
      });
      setLiveHrv(prev => {
        const delta = (Math.random() - 0.5) * 8;
        return Math.max(48, Math.min(115, Math.round(prev + delta)));
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoggedIn, onboardingStep, isLiveHealthData]);

  // Real periodic reads from HealthKit/Health Connect once a device is actually connected.
  useEffect(() => {
    if (!isLoggedIn || onboardingStep < 5 || !isLiveHealthData) return;

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
          setPulseHistory(h => [...h.slice(1), syncedBpm as number]);
        }
        if (hrvResult.samples.length > 0) {
          syncedHrv = Math.round(hrvResult.samples[0].value);
          setLiveHrv(syncedHrv);
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
    if (!isLoggedIn || onboardingStep < 5 || !hydrationRemindersEnabled) return;
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
    if (!isLoggedIn || onboardingStep < 5 || !isLiveHealthData || liveSteps === null) return;
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

  // --- 7. ADVANCED 6-CORE TELEMETRY ARRAY ---
  const [biometrics, setBiometrics] = useState<TelemetryStream[]>([
    {
      id: 'BIO-1',
      metric: 'Activity and Movement',
      system: 'Kinetic Step Velocity Layer',
      reading: '110 SPM',
      status: 'Optimal',
      behavior: 'Verified Biomechanical Load',
      waveType: 'sinusoidal',
      details: {
        title: 'Locomotive Cadence & Step Vectors',
        description: 'Analyzes locomotive movement frequencies to filter out synthetic hardware shakers and mechanical oscillators.',
        subMetrics: [
          { label: 'Active Step Cadence', value: '110 SPM', color: '#00ff88' },
          { label: 'Human Velocity Ceiling', value: 'Max 350 SPM', color: '#ff9500' },
          { label: 'Biomechanical Symmetry', value: '98.4% Optimal', color: '#00bfff' }
        ]
      }
    },
    {
      id: 'BIO-2',
      metric: 'Heart Health',
      system: 'Precision Cardiovascular Array',
      reading: '72 BPM / 68 ms HRV',
      status: 'Optimal',
      behavior: 'High Vagal Tone Detected',
      waveType: 'ecg',
      details: {
        title: 'Cardiovascular Autonomic Stability',
        description: 'Measures high-frequency heart rate fluctuations and vagal tone pathways to evaluate nervous system recharge rates.',
        subMetrics: [
          { label: 'Live Resting Heart Rate', value: '72 BPM', color: '#ff3b30' },
          { label: 'Autonomic HRV Variance', value: '68 ms', color: '#00bfff' },
          { label: 'Vagal Stability Index', value: 'Optimal Floor', color: '#00ff88' }
        ]
      }
    },
    {
      id: 'BIO-3',
      metric: 'Metabolic Health',
      system: 'Metabolic Velocity Index',
      reading: '1.2 Metabolic Coeff',
      status: 'Syncing',
      behavior: 'Substrate Oxidation Balanced',
      waveType: 'mitochondrial',
      details: {
        title: 'Mitochondrial Energy Balance',
        description: 'Evaluates dynamic carbohydrate and lipid oxidation ratios calculated in real-time from active respiratory rates.',
        subMetrics: [
          { label: 'Metabolic Coefficient', value: '1.2 Index', color: '#ff9500' },
          { label: 'Mitochondrial Efficiency', value: '89.4% Verified', color: '#00ff88' },
          { label: 'Substrate Oxidation Floor', value: 'Glucose Balanced', color: '#00bfff' }
        ]
      }
    },
    {
      id: 'BIO-4',
      metric: 'Sleep and Rest',
      system: 'Contextual Sleep Telemetry',
      reading: `${SLEEP_QUALITY_PERCENT}% Quality`,
      status: 'Optimal',
      behavior: 'Deep/REM Stages Synchronized',
      waveType: 'delta',
      details: {
        title: 'Circadian Sleep Architecture',
        description: 'Decomposes sleep cycles, synchronizing deep sleep and rapid eye movement (REM) phases with stress recovery ceilings.',
        subMetrics: [
          { label: 'Overall Sleep Quality', value: `${SLEEP_QUALITY_PERCENT}%`, color: '#00ff88' },
          { label: 'Deep Regeneration Phase', value: '2h 15m', color: '#00bfff' },
          { label: 'REM Restorative Sleep', value: '1h 52m', color: '#a855f7' }
        ]
      }
    },
    {
      id: 'BIO-5',
      metric: 'Stress',
      system: 'Autonomic Load Tracker',
      reading: 'Low Autonomic Stress',
      status: 'Optimal',
      behavior: 'Neurological Exhaustion Ceilings Safe',
      waveType: 'erratic_spikes',
      details: {
        title: 'Neurological Exhaustion Thresholds',
        description: 'Monitors peripheral continuous autonomic sensory signals to compute mental fatigue indexes and autonomic boundaries.',
        subMetrics: [
          { label: 'Neurological Load', value: 'Low Autonomic', color: '#00ff88' },
          { label: 'Stress Recovery Rate', value: '1.8x Baseline', color: '#00bfff' },
          { label: 'Mental Fatigue Ceiling', value: 'Safe Boundary', color: '#ff9500' }
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
          waveType: 'slow_sinusoidal',
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
        waveType: 'slow_sinusoidal',
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
      const recoveryLabel = liveHrv > 60 && liveBpm < 80 ? 'High Recovery' : liveHrv > 45 ? 'Moderate Recovery' : 'Low Recovery — Prioritize Rest';
      return {
        id: 'BIO-6',
        metric: 'Recovery & Hormonal Balance',
        system: 'Autonomic Recovery Index',
        reading: recoveryLabel,
        status: liveHrv > 45 ? 'Optimal' : 'Critical',
        behavior: 'Derived from HRV, resting heart rate & sleep quality',
        waveType: 'slow_sinusoidal',
        details: {
          title: 'Recovery & Stress Load',
          description: 'This app has no way to directly measure hormone levels — this card is a recovery/stress-load estimate built from your existing HRV, heart rate and sleep data instead.',
          subMetrics: [
            { label: 'HRV', value: `${liveHrv} ms`, color: '#00bfff' },
            { label: 'Resting Heart Rate', value: `${liveBpm} BPM`, color: '#ff3b30' },
            { label: 'Sleep Quality', value: `${SLEEP_QUALITY_PERCENT}%`, color: '#00ff88' }
          ]
        }
      };
    }

    return null;
  }, [profile.sex, profile.lastPeriodStartDate, profile.averageCycleLength, liveHrv, liveBpm]);

  // Heart-rate/HRV display is derived live from the ticker values rather than synced via an
  // effect, so BIO-2 never lags a render behind liveBpm/liveHrv.
  const allBiometrics = useMemo(() => {
    const withLiveData = biometrics.map(item => {
      if (item.id === 'BIO-1' && isLiveHealthData && liveSteps !== null) {
        return {
          ...item,
          reading: `${liveSteps} steps today`,
          details: { ...item.details, subMetrics: [{ label: 'Steps Today (Live)', value: `${liveSteps}`, color: '#00ff88' }, ...item.details.subMetrics.slice(1)] }
        };
      }
      if (item.id === 'BIO-2') {
        return {
          ...item,
          reading: `${liveBpm} BPM / ${liveHrv} ms HRV`,
          status: liveBpm > 100 ? 'Critical' as const : 'Optimal' as const,
          behavior: liveBpm > 100 ? 'Elevated Cardiac Response' : 'High Vagal Tone Detected',
          details: {
            ...item.details,
            subMetrics: [
              { label: 'Live Resting Heart Rate', value: `${liveBpm} BPM`, color: '#ff3b30' },
              { label: 'Autonomic HRV Variance', value: `${liveHrv} ms`, color: '#00bfff' },
              { label: 'Vagal Stability Index', value: liveBpm > 100 ? 'Caution Threshold' : 'Optimal Floor', color: liveBpm > 100 ? '#ff3b30' : '#00ff88' }
            ]
          }
        };
      }
      if (item.id === 'BIO-4' && isLiveHealthData && liveSleepQualityPercent !== null) {
        return {
          ...item,
          reading: `${liveSleepQualityPercent}% Quality`,
          details: { ...item.details, subMetrics: [{ label: 'Overall Sleep Quality (Live)', value: `${liveSleepQualityPercent}%`, color: '#00ff88' }, ...item.details.subMetrics.slice(1)] }
        };
      }
      return item;
    });
    return sexCard ? [...withLiveData, sexCard] : withLiveData;
  }, [biometrics, liveBpm, liveHrv, liveSteps, liveSleepQualityPercent, isLiveHealthData, sexCard]);

  // --- 8. GAMIFICATION ENGINE (With Custom Points & Quotas) ---
  const [xp, setXp] = useState<number>(() => parseInt(localStorage.getItem('kinetix_xp') || '420'));
  const [level] = useState<number>(() => parseInt(localStorage.getItem('kinetix_level') || '3'));
  const [totalVoucherPoints, setTotalVoucherPoints] = useState<number>(() => parseInt(localStorage.getItem('kinetix_voucher_points') || '1250'));
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
    calories: 1450,
    carbs: 180,
    protein: 65,
    fiber: 18
  });
  const [caloriesBurned, setCaloriesBurned] = useState<number>(450);

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
    if (!isLoggedIn || onboardingStep < 5) return;
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
    const requiredPoints = visaDemoMode ? 0 : 1000;

    if (!visaDemoMode && totalVoucherPoints < requiredPoints) {
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

      const pointsDeducted = visaDemoMode ? 0 : 1000;
      const newPts = totalVoucherPoints - pointsDeducted;
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
    if (!isLoggedIn || onboardingStep < 5 || !profile.email) return;
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
    if (!isLoggedIn || onboardingStep < 5) return;
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

  // OTP Login Simulation
  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      alert("Please enter a valid B2B or corporate email address.");
      return;
    }
    setIsOtpSent(true);
    setMotivationMessage(`📩 Security token successfully transmitted to ${emailInput}.`);
    setTimeout(() => setMotivationMessage(null), 5000);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpInput === '7721' || otpInput === '1234') {
      saveProfileToStorage({
        ...profile,
        email: emailInput,
        name: emailInput.split('@')[0].toUpperCase()
      });
      setOnboardingStep(2); // Onboarding Step 2: Physical Parameters
    } else {
      alert("Invalid verification code. Please use '1234' for developer sandbox entry.");
    }
  };

  const handleCompleteOnboarding = () => {
    setIsLogged(true);
    localStorage.setItem('kinetix_logged_in', 'true');
    setOnboardingStep(5); // Launch main platform portal
    setMotivationMessage('🏆 Access Handshake Operational. Welcome to KinetixFit!');
    setTimeout(() => setMotivationMessage(null), 7000);
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
    estimatedPortionGrams: number
  ) => {
    const lowerFoodName = foodName.toLowerCase();
    const personalChecks = profile.personalAllergens.length > 0 ? profile.personalAllergens : the14Allergens;
    const flagged = personalChecks.filter(allergen => lowerFoodName.includes(allergen));

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
    if (!visaDemoMode) {
      if (tasksCompletedTodayCount < requiredTaskCountForRedeem) {
        alert(`⚠️ REWARDS LOCK: You have only completed ${tasksCompletedTodayCount}/${requiredTaskCountForRedeem} today's target tasks. Physical effort required.`);
        setMotivationMessage("🔒 SECURITY LOCK: Complete at least 2 active quests today to authorize points redemption!");
        setTimeout(() => setMotivationMessage(null), 6000);
        return;
      }

      if (totalVoucherPoints < 2500) {
        alert("⚠️ INSUFFICIENT BALANCE: The wholesale rewards voucher tier floor is 2,500 points. Keep crushin' your goals to cash out!");
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastRedemptionTime < 86400000) {
        alert("🔒 COOL-DOWN LIMIT: You are limited to 1 reward settlement per 24 hours to protect corporate reserves.");
        return;
      }
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
      voucherTitle = 'Local Claim: Corporate Coffee Voucher';
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

      const pointDeduction = visaDemoMode ? 0 : 2500;
      const newPts = totalVoucherPoints - pointDeduction;
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
        <h2 style={{ fontSize: '18px', color: '#00ff88', margin: '0 0 5px 0', fontWeight: 'bold', fontFamily: 'monospace' }}>
          ⚡ {timeGreeting}, {profile.name || 'GUEST_REST_MODE'}
        </h2>
        <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace' }}>
          Biometric Feed Status: {profile.smartDeviceConnected ? `Synced with ${profile.smartDeviceConnected}` : 'Awaiting sensor handshake.'}
        </span>
      </div>
    );
  };

  // --- TRIPLE-TIER DRILLDOWN SELECTION ---
  const selectedMetric = allBiometrics.find(b => b.id === selectedMetricId) || allBiometrics[1];

  // --- RENDERING ROUTER ---

  // A. MARKETING FRONT HOME LANDING PAGE
  if (!isLoggedIn && onboardingStep === 0) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">
          <div className="app-scroll-body relative" style={{ padding: '0px', gap: '0px' }}>
            {/* Cinematic Hero Backdrop */}
            <div className="landing-cinematic-hero">
              <div className="matrix-particles"></div>

              <div className="landing-top-bar">
                <div className="glowing-logo">
                  <svg width="45" height="25" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#00ff88" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="landing-tag">BIOMETRIC SIGNAL MATRIX</div>
              </div>

              <div className="landing-main-text">
                <h1 className="cinematic-title">KINETIXFIT</h1>
                <p className="cinematic-subtitle">THE BIOMETRIC CLEARINGHOUSE FOR HIGH-PERFORMANCE LIVES</p>
                <div className="hud-line"></div>
              </div>

              <div className="landing-cta-box">
                <p className="hero-disclaimer">Platform Subscription: £14.99 / Month • Includes 7-Day Free Trial</p>
                <button onClick={() => setOnboardingStep(1)} className="landing-launch-btn">
                  INITIALIZE PLATFORM KEY →
                </button>
              </div>
            </div>

            {/* Core Tech Showcase Grid */}
            <div className="landing-tech-grid">
              <h3 className="grid-section-title">🧬 Telemetry Architecture</h3>
              <p className="grid-section-desc">Continuous tactical tracking of biological parameters to schedule active stress thresholds cleanly.</p>

              <div className="tech-cards-grid">
                <div className="tech-mini-card">
                  <div className="tech-card-header">
                    <span>SECTOR 01</span>
                    <span className="glow-bullet green"></span>
                  </div>
                  <h4>6-Core Biometrics Array</h4>
                  <p>Heart Health, Metabolic oxidation metrics, sleep tracking, and biological rhythm synchronizations in real-time.</p>
                </div>
                <div className="tech-mini-card">
                  <div className="tech-card-header">
                    <span>SECTOR 02</span>
                    <span className="glow-bullet cyan"></span>
                  </div>
                  <h4>1-Tap Chemical Ingest Scanner</h4>
                  <p>Optical scanning technology analyzing allergen formulation hazards, dietary exclusions, and NHS fiber limits.</p>
                </div>
                <div className="tech-mini-card">
                  <div className="tech-card-header">
                    <span>SECTOR 03</span>
                    <span className="glow-bullet amber"></span>
                  </div>
                  <h4>Anti-Cheat Velocity Sensor</h4>
                  <p>4-Stage hardware verification filtering out mechanical device oscillations exceeding 350 Steps Per Minute.</p>
                </div>
                <div className="tech-mini-card">
                  <div className="tech-card-header">
                    <span>SECTOR 04</span>
                    <span className="glow-bullet purple"></span>
                  </div>
                  <h4>Kinetix Rewards Vault</h4>
                  <p>Secured gamification coordinates converting verified efforts to lifestyle vouchers or matching UK CSR donations.</p>
                </div>
              </div>
            </div>

            {/* Compliance Footer */}
            <div className="landing-footer-block">
              <p>OPERATIONAL INTEGRITY HANDSHAKE COMPLIANT</p>
              <p style={{ opacity: 0.5, fontSize: '8px', marginTop: '4px' }}>In complete alignment with UK GDPR & Data Protection Act 2018 guidelines.</p>
              <p style={{ marginTop: '10px' }}>
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#00ff88', textDecoration: 'none', letterSpacing: '1px' }}>PRIVACY POLICY</a>
                <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>
                <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" style={{ color: '#00ff88', textDecoration: 'none', letterSpacing: '1px' }}>TERMS OF SERVICE</a>
              </p>
            </div>
          </div>
        </div>
        <style>{`
          .landing-cinematic-hero {
            height: 480px;
            background: radial-gradient(circle at center, #0f172a 0%, #030712 100%);
            border-bottom: 1px solid #1f2937;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 25px 20px;
            box-sizing: border-box;
            overflow: hidden;
          }
          .matrix-particles {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: radial-gradient(#00ff88 1px, transparent 1px);
            background-size: 16px 16px;
            opacity: 0.05;
            pointer-events: none;
            animation: matrixFade 10s infinite alternate;
          }
          @keyframes matrixFade {
            0% { opacity: 0.03; }
            100% { opacity: 0.08; }
          }
          .landing-top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .landing-tag {
            font-size: 8px;
            color: #6b7280;
            letter-spacing: 2px;
            font-weight: bold;
            border-left: 2px solid #00ff88;
            padding-left: 6px;
          }
          .landing-main-text {
            text-align: center;
            margin-top: 40px;
          }
          .cinematic-title {
            font-size: 42px;
            font-weight: 900;
            letter-spacing: 12px;
            color: #ffffff;
            margin: 0;
            text-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
          }
          .cinematic-subtitle {
            font-size: 8.5px;
            color: #00ff88;
            letter-spacing: 2.5px;
            margin-top: 10px;
            line-height: 1.4;
          }
          .hud-line {
            width: 140px;
            height: 1px;
            background: linear-gradient(90deg, transparent, #00ff88, transparent);
            margin: 20px auto 0 auto;
          }
          .landing-cta-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            text-align: center;
          }
          .hero-disclaimer {
            font-size: 8.5px;
            color: #9ca3af;
            letter-spacing: 1px;
            margin: 0;
          }
          .landing-launch-btn {
            background-color: transparent !important;
            border: 1px solid #00ff88 !important;
            color: #00ff88 !important;
            font-weight: bold !important;
            padding: 12px 25px !important;
            border-radius: 4px !important;
            font-size: 11px !important;
            font-family: monospace !important;
            letter-spacing: 1.5px !important;
            cursor: pointer !important;
            transition: all 0.3s ease !important;
            box-shadow: 0 0 15px rgba(0, 255, 136, 0.1) !important;
          }
          .landing-launch-btn:hover {
            background-color: #00ff88 !important;
            color: #000000 !important;
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.4) !important;
          }
          .landing-tech-grid {
            background-color: #030712;
            padding: 25px 20px;
            box-sizing: border-box;
          }
          .grid-section-title {
            font-size: 13px;
            color: #ffffff;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin: 0 0 6px 0;
            border-left: 3px solid #00ff88;
            padding-left: 8px;
          }
          .grid-section-desc {
            font-size: 10px;
            color: #9ca3af;
            line-height: 1.4;
            margin: 0 0 20px 0;
          }
          .tech-cards-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .tech-mini-card {
            background-color: #0b0f19;
            border: 1px solid #1f2937;
            border-radius: 8px;
            padding: 12px;
            box-sizing: border-box;
          }
          .tech-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
            font-size: 7.5px;
            color: #6b7280;
            letter-spacing: 1px;
            font-weight: bold;
          }
          .glow-bullet {
            width: 4px;
            height: 4px;
            border-radius: 50%;
          }
          .glow-bullet.green { background-color: #00ff88; box-shadow: 0 0 8px #00ff88; }
          .glow-bullet.cyan { background-color: #00bfff; box-shadow: 0 0 8px #00bfff; }
          .glow-bullet.amber { background-color: #ff9500; box-shadow: 0 0 8px #ff9500; }
          .glow-bullet.purple { background-color: #a855f7; box-shadow: 0 0 8px #a855f7; }
          .tech-mini-card h4 {
            font-size: 10px;
            color: #ffffff;
            margin: 0 0 4px 0;
            font-weight: bold;
          }
          .tech-mini-card p {
            font-size: 8.5px;
            color: #9ca3af;
            line-height: 1.3;
            margin: 0;
          }
          .landing-footer-block {
            background-color: #070a13;
            border-top: 1px solid #111827;
            padding: 20px;
            text-align: center;
            font-size: 8px;
            color: #6b7280;
            letter-spacing: 2px;
            font-weight: bold;
          }
        `}</style>
      </div>
    );
  }

  // B. PRE-LOGIN: Secure OTP B2B Email Gateway
  if (!isLoggedIn && onboardingStep === 1) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '120px',
                  height: '60px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0, 255, 136, 0.15)',
                  padding: '5px',
                  boxShadow: '0 4px 20px rgba(0, 255, 136, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                }}>
                  <svg width="70" height="35" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 4px 10px rgba(0, 255, 136, 0.15))' }}>
                    <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#00ff88" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '9px', color: '#6b7280', letterSpacing: '2px', fontWeight: 'bold' }}>B2B HEALTH TELEMETRY CLEARINGHOUSE</span>
              </div>

              {!isOtpSent ? (
                <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <p style={{ fontSize: '10.5px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.4', margin: 0 }}>
                    Secure corporate login gateway. Enter your company email to request a 4-digit verification token.
                  </p>
                  <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Business Email Address
                    <input
                      type="email"
                      required
                      placeholder="name@company.co.uk"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="auth-input"
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => setOnboardingStep(0)} className="secondary-btn">
                      Back
                    </button>
                    <button type="submit" className="primary-btn" style={{ flex: 2 }}>
                      Request Token
                    </button>
                  </div>
                  <p style={{ fontSize: '9px', color: '#6b7280', textAlign: 'center', lineHeight: '1.4', margin: '4px 0 0 0' }}>
                    By requesting access, you agree to our{' '}
                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#00ff88' }}>Privacy Policy</a>
                    {' '}and{' '}
                    <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" style={{ color: '#00ff88' }}>Terms of Service</a>.
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <p style={{ fontSize: '10.5px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.4', margin: 0 }}>
                    Verification token sent to <strong style={{ color: '#00ff88' }}>{emailInput}</strong>. Enter code <strong style={{ color: '#00ff88' }}>1234</strong> to verify sandbox workspace.
                  </p>
                  <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>4-Digit Security Token
                    <input
                      type="text"
                      maxLength={4}
                      required
                      placeholder="e.g. 1234"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      className="auth-otp-input"
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => setIsOtpSent(false)} className="secondary-btn">
                      Back
                    </button>
                    <button type="submit" className="primary-btn" style={{ flex: 2 }}>
                      Verify Token
                    </button>
                  </div>
                </form>
              )}
            </div>

            <style>{`
              .auth-input {
                width: 100% !important;
                background-color: #030712 !important;
                border: 1px solid #374151 !important;
                color: #ffffff !important;
                padding: 10px !important;
                margin-top: 6px !important;
                font-size: 11.5px !important;
                font-family: monospace !important;
                border-radius: 4px !important;
                outline: none !important;
                box-sizing: border-box !important;
              }
              .auth-input:focus {
                border-color: #00ff88 !important;
                box-shadow: 0 0 10px rgba(0, 255, 136, 0.25) !important;
              }
              .auth-otp-input {
                width: 100% !important;
                background-color: #030712 !important;
                border: 1px solid #374151 !important;
                color: #ffffff !important;
                padding: 10px !important;
                margin-top: 6px !important;
                font-size: 14px !important;
                letter-spacing: 5px !important;
                text-align: center !important;
                font-weight: bold !important;
                font-family: monospace !important;
                border-radius: 4px !important;
                outline: none !important;
                box-sizing: border-box !important;
              }
              .auth-otp-input:focus {
                border-color: #00ff88 !important;
                box-shadow: 0 0 10px rgba(0, 255, 136, 0.25) !important;
              }
              .primary-btn {
                background-color: #00ff88 !important;
                color: #000000 !important;
                font-weight: bold !important;
                border: none !important;
                padding: 10px !important;
                cursor: pointer !important;
                border-radius: 4px !important;
                font-size: 11.5px !important;
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
                font-size: 11px !important;
                font-family: monospace !important;
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  // C. ONBOARDING STEP 2: Biographical profile setup
  if (onboardingStep === 2) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '9px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 1 OF 3: PROFILE DEPLOYMENT</span>
              <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px', color: '#fff' }}>Setup Physical Telemetry Benchmarks</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Your Display Name
                  <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="auth-input" />
                </label>
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Height (cm)
                  <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="auth-input" />
                </label>
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Weight (kg)
                  <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="auth-input" />
                </label>
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Age
                  <input type="number" value={profile.age} onChange={(e) => saveProfileToStorage({...profile, age: parseInt(e.target.value) || 0})} className="auth-input" />
                </label>
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Biological Sex
                  <select value={profile.sex ?? ''} onChange={(e) => saveProfileToStorage({...profile, sex: e.target.value === '' ? null : e.target.value as UserProfile['sex']})} className="auth-input-select">
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
                {profile.sex === 'female' && (
                  <>
                    <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Last Period Start Date
                      <input type="date" value={profile.lastPeriodStartDate ?? ''} onChange={(e) => saveProfileToStorage({...profile, lastPeriodStartDate: e.target.value || null})} className="auth-input" />
                    </label>
                    <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Average Cycle Length (days)
                      <input type="number" value={profile.averageCycleLength} onChange={(e) => saveProfileToStorage({...profile, averageCycleLength: parseInt(e.target.value) || 28})} className="auth-input" />
                    </label>
                  </>
                )}
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Activity Level
                  <select value={profile.activityLevel} onChange={(e) => saveProfileToStorage({...profile, activityLevel: e.target.value as UserProfile['activityLevel']})} className="auth-input-select">
                    <option value="sedentary">Sedentary (little to no exercise)</option>
                    <option value="light">Light (exercise 1-3x/week)</option>
                    <option value="moderate">Moderate (exercise 3-5x/week)</option>
                    <option value="active">Active (exercise 6-7x/week)</option>
                    <option value="very_active">Very Active (hard exercise/physical job)</option>
                  </select>
                </label>
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Primary Fitness Target
                  <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as UserProfile['target']})} className="auth-input-select">
                    <option value="Autonomic Recovery">Autonomic Recovery</option>
                    <option value="Weight Loss">Weight Loss</option>
                    <option value="Weight Gain">Weight Gain</option>
                    <option value="Cardio Endurance">Cardio Endurance</option>
                  </select>
                </label>
                <button onClick={() => setOnboardingStep(3)} className="primary-btn" style={{ marginTop: '10px' }}>
                  Confirm & Continue
                </button>
              </div>
            </div>
            <style>{`
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
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  // D. ONBOARDING STEP 3: Personal Allergy Manager Setup
  if (onboardingStep === 3) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '9px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 2 OF 3: FOOD EXCLUSION CONFIGURATION</span>
              <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px', color: '#fff' }}>Set Personal Allergen Prohibitions</h2>
              <p style={{ fontSize: '10.5px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '15px', margin: '0 0 15px 0' }}>
                Select any food allergen classifications you are sensitive to. The AI Scanner will dynamically scan and flag these chemical hazards.
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
                        fontSize: '10px',
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
                <button onClick={() => setOnboardingStep(2)} className="secondary-btn" style={{ flex: 1 }}>
                  Back
                </button>
                <button onClick={() => setOnboardingStep(4)} className="primary-btn" style={{ flex: 1.5 }}>
                  Confirm Allergens
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // E. ONBOARDING STEP 4: Smart Device Sync Gateway
  if (onboardingStep === 4) {
    return (
      <div className="workspace-container">
        <div className="app-viewport-container">

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '9px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 3 OF 3: TELEMETRY INTEGRATION</span>
              <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px', color: '#fff' }}>Connect Biometric Sensor</h2>
              <p style={{ fontSize: '10.5px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '15px', margin: '0 0 15px 0' }}>
                Synchronize your continuous physical sensors (pulse fluctuations, sleep recovery waves, stress baselines) with our secure clearinghouse.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                <button
                  onClick={handleConnectHealthSource}
                  disabled={isConnectingHealth}
                  style={{
                    backgroundColor: '#030712',
                    border: '1px solid #1f2937',
                    color: '#ffffff',
                    padding: '10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '10.5px',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: 'monospace'
                  }}
                >
                  <span>⚡ {Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect'}</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
                    {isConnectingHealth ? 'Connecting...' : 'Link Sensor'}
                  </span>
                </button>
                {!Capacitor.isNativePlatform() && (
                  <p style={{ fontSize: '9px', color: '#9ca3af', margin: 0 }}>
                    📱 Live sync requires the iOS or Android app — you can skip this on web.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setOnboardingStep(3)} className="secondary-btn" style={{ flex: 1 }}>
                  Back
                </button>
                <button onClick={handleCompleteOnboarding} className="primary-btn" style={{ flex: 1.5 }}>
                  Launch Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                <span className="app-brand-subtitle">BIOMETRIC SIGNAL MATRIX</span>
              </div>
            </div>
            <div className="app-auth-pill">
              <span className="green-pulse-dot"></span>
              SECURE SYNC
            </div>
          </header>

          {/* ==================== TAB 1: TODAY (VITALS & SCI-FI DRILLDOWN) ==================== */}
          {activeTab === 'vitals' && (
            <div className="tab-fade-in vitals-dashboard-grid">
              <div className="vitals-left-panel">

              {/* Athletic Level & XP Progress Cockpit */}
              <div className="athlete-level-gauge-card">
                <div className="level-gauge-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="athlete-avatar-badge">LVL {level}</div>
                    <div>
                      <h4 className="athlete-title">{profile.name ? `Welcome back, ${profile.name}` : 'Welcome back'}</h4>
                      <span className="athlete-subtext">Biometric Status: <strong style={{ color: '#00ff88' }}>Peak Athlete Floor</strong></span>
                    </div>
                  </div>
                  <div className={`streak-badge ${getStreakFlameDisplay(streak).tierClass}`}>
                    {getStreakFlameDisplay(streak).emoji} {streak}-DAY STREAK
                  </div>
                </div>

                {/* Dynamic XP Progress Bar */}
                <div className="xp-progress-bar-container">
                  <div className="xp-bar-header">
                    <span>Performance Experience Progress</span>
                    <strong>{xp} / {level * 500} XP</strong>
                  </div>
                  <div className="xp-bar-track">
                    <div className="xp-bar-fill" style={{ width: `${Math.min(100, (xp / (level * 500)) * 100)}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Oura & Apple Health Goal Rings */}
              <div className="vitals-hero-card">
                <div style={{ flex: 1.2 }}>
                  {getPersonalizedWelcome()}
                  <p style={{ fontSize: '10.5px', color: '#9ca3af', lineHeight: '1.4', marginTop: '10px', margin: '10px 0 0 0' }}>
                    Continuous biometric telemetry active. Security velocity limits calibrated. Click any of the 6-Core Metrics below to analyze deep autonomic fluctuations.
                  </p>
                </div>

                {/* 3 Active Ring Vectors */}
                <div className="progress-rings-box">
                  <div className="ring-indicator">
                    <svg width="45" height="45" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#111827" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00ff88" strokeWidth="3.5" strokeDasharray="65, 100" strokeLinecap="round" />
                    </svg>
                    <div className="ring-text">65%</div>
                    <span>Steps</span>
                  </div>
                  <div className="ring-indicator">
                    <svg width="45" height="45" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#111827" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00bfff" strokeWidth="3.5" strokeDasharray="84, 100" strokeLinecap="round" />
                    </svg>
                    <div className="ring-text">84%</div>
                    <span>Sleep</span>
                  </div>
                </div>
              </div>

              {/* Dynamic ECG/Pulse fluctuation Interactive Plot (Drilldown) */}
              <div className="ecg-module-card">
                <div className="ecg-card-header">
                  <div>
                    <span className="ecg-label">AUTONOMIC REALTIME OSCILLOSCOPE</span>
                    <h3 className="ecg-title">
                      📈 {selectedMetric.metric}: <span style={{ color: selectedMetricId === 'BIO-2' ? '#ff3b30' : '#00ff88' }}>{selectedMetric.reading}</span>
                    </h3>
                  </div>
                  <div className="live-broadcast-pill">
                    <span className="live-pulse-dot"></span>
                    LIVE SIGNAL
                  </div>
                </div>

                {/* Athletic Multi-Sport Workload Control Deck */}
                <div className="sport-workload-bar">
                  {[
                    { id: 'rest', label: '🧘 Rest Recovery', wave: 'slow_sinusoidal', bpm: 62, hrv: 85, color: '#00ff88' },
                    { id: 'run', label: '🏃 Cardio Run', wave: 'ecg', bpm: 145, hrv: 45, color: '#ff3b30' },
                    { id: 'cycle', label: '🚴 Cycle Sprint', wave: 'mitochondrial', bpm: 155, hrv: 35, color: '#00bfff' },
                    { id: 'swim', label: '🏊 Swim Laps', wave: 'delta', bpm: 130, hrv: 55, color: '#a855f7' }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setActiveSportMode(mode.id as 'rest' | 'run' | 'cycle' | 'swim');
                        setLiveBpm(mode.bpm);
                        setLiveHrv(mode.hrv);
                        setMotivationMessage(`⚡ WORKLOAD DIVERTER: Synced metrics to ${mode.label}!`);
                        setTimeout(() => setMotivationMessage(null), 4000);

                        // Dynamically alter selected metric details
                        setBiometrics(prev => prev.map(item => {
                          if (item.id === 'BIO-2') {
                            return {
                              ...item,
                              reading: `${mode.bpm} BPM / ${mode.hrv} ms HRV`,
                              status: mode.bpm > 100 ? 'Critical' : 'Optimal',
                              waveType: mode.wave as TelemetryStream['waveType'],
                              behavior: mode.bpm > 130 ? 'Peak Athletic VO2 Threshold' : 'High Vagal Tone Detected'
                            };
                          }
                          return item;
                        }));
                      }}
                      className={`sport-mode-btn ${activeSportMode === mode.id ? 'active-sport-btn' : ''}`}
                      style={{ borderColor: activeSportMode === mode.id ? mode.color : '#1f2937' }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '8.5px', color: '#6b7280', margin: '6px 0 0 0' }}>
                  The buttons above preview each mode's telemetry pattern for demo purposes — they don't log a workout.
                </p>
                <button onClick={handleLogWorkout} className="primary-btn" style={{ width: '100%', marginTop: '8px', padding: '10px' }}>
                  ✅ Log This Workout
                </button>

                {/* Tactical Holographic Wave Oscilloscope */}
                <div className="ecg-oscilloscope-viewport">
                  {/* Glowing background grid lines */}
                  <div className="hud-grid-background"></div>

                  <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <path
                      d={`M 0,32.5 ${pulseHistory.map((v, idx) => {
                        const x = (idx / (pulseHistory.length - 1)) * 380;
                        let y = 32.5;

                        // RENDER DYNAMIC HOLLYWOOD-STYLE MATHEMATICAL WAVE SCHEMAS
                        if (selectedMetric.waveType === 'ecg') {
                          // Traditional Cardio ECG Signature with R-peaks
                          if (idx % 4 === 0) y = 10;
                          else if (idx % 4 === 1) y = 55;
                          else y = 32.5 - (v - 72) * 1.2;
                        } else if (selectedMetric.waveType === 'sinusoidal') {
                          // Smooth High-Frequency Movement wave
                          y = 32.5 + Math.sin(idx * 1.5) * 20;
                        } else if (selectedMetric.waveType === 'delta') {
                          // Very slow deep delta sleep waves
                          y = 32.5 + Math.sin(idx * 0.4) * 25;
                        } else if (selectedMetric.waveType === 'mitochondrial') {
                          // Rapid high-energy metabolic curves
                          y = 32.5 + Math.cos(idx * 2.2) * 15 + Math.sin(idx * 1.1) * 8;
                        } else if (selectedMetric.waveType === 'erratic_spikes') {
                          // High-stress jagged stress peaks
                          y = 32.5 + (Math.sin(idx * 3.5) * 12) + ((idx % 2 === 0 ? 1 : -1) * 18);
                        } else if (selectedMetric.waveType === 'slow_sinusoidal') {
                          // Long structural biological rhythm waves
                          y = 32.5 + Math.sin(idx * 0.2) * 22;
                        }

                        return `L ${x},${y}`;
                      }).join(' ')}`}
                      fill="none"
                      stroke={selectedMetricId === 'BIO-2' ? '#ff3b30' : '#00ff88'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ecg-path"
                    />
                  </svg>
                </div>

                {/* Submetrics Drilldown Details Panel */}
                <div className="drilldown-submetrics-panel">
                  <h4 className="drilldown-analysis-title">⚕️ {selectedMetric.details.title}</h4>
                  <p className="drilldown-analysis-desc">{selectedMetric.details.description}</p>

                  <div className="drilldown-submetrics-grid">
                    {selectedMetric.details.subMetrics.map((sm, idx) => (
                      <div key={idx} className="drilldown-submetric-capsule">
                        <span className="capsule-label">{sm.label}</span>
                        <strong className="capsule-value" style={{ color: sm.color }}>{sm.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              </div> {/* End Left Panel */}

              <div className="vitals-right-panel">
                {/* Advanced 6-Core Interactive Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="section-header" style={{ margin: 0 }}>6-Core Health Telemetry Sync</h3>
                  <span style={{
                    fontSize: '8px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px',
                    color: isLiveHealthData ? '#00ff88' : '#ff9500',
                    backgroundColor: isLiveHealthData ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 149, 0, 0.08)',
                    border: `1px solid ${isLiveHealthData ? '#00ff88' : '#ff9500'}`
                  }}>
                    {isLiveHealthData ? `🟢 LIVE — ${profile.smartDeviceConnected}` : '⚠️ DEMO DATA'}
                  </span>
                </div>
                <div className="core-biometrics-grid">
                  {allBiometrics.map(bio => {
                    const active = selectedMetricId === bio.id;
                    return (
                      <div
                        key={bio.id}
                        onClick={() => setSelectedMetricId(bio.id)}
                        className={`biometric-item-card ${active ? 'active-bio-card' : ''}`}
                      >
                        <div className="bio-card-header">
                          <span className="bio-system-label">{bio.system}</span>
                          <span className={`bio-status-badge status-${bio.status.toLowerCase()}`}>
                            {bio.status}
                          </span>
                        </div>
                        <h4 className="bio-metric-title">{bio.metric}</h4>
                        <p className="bio-metric-reading">{bio.reading}</p>
                        <span className="bio-behavior-log">
                          Behavior: {bio.behavior}
                        </span>
                        {active && <div className="active-glow-indicator">ANALYSIS LOCKED</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Option to Sync device & Customize Profile */}
              <div className="profile-actions-row">
                <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn">
                  🔌 Sync Wearable Sensor
                </button>
                <button onClick={() => setIsEditingProfile(!isEditingProfile)} className="edit-bio-btn">
                  ✏️ Adjust Bio Parameters
                </button>
              </div>

              {/* Edit Bio parameters section */}
              {isEditingProfile && (
                <div className="edit-profile-drawer">
                  <h3 className="drawer-title">Update Biometric Benchmarks</h3>
                  <div className="drawer-form-grid">
                    <label className="drawer-label">Display Name
                      <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="drawer-input" />
                    </label>
                    <label className="drawer-label">Height (cm)
                      <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="drawer-input" />
                    </label>
                    <label className="drawer-label">Weight (kg)
                      <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="drawer-input" />
                    </label>
                    <label className="drawer-label">Primary Fitness Target
                      <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as UserProfile['target']})} className="drawer-select">
                        <option value="Autonomic Recovery">Autonomic Recovery</option>
                        <option value="Weight Loss">Weight Loss</option>
                        <option value="Weight Gain">Weight Gain</option>
                        <option value="Cardio Endurance">Cardio Endurance</option>
                      </select>
                    </label>
                  </div>
                  <button onClick={() => setIsEditingProfile(false)} className="primary-btn" style={{ width: '100%', marginTop: '15px' }}>
                    Save Biometric Changes
                  </button>
                </div>
              )}

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
                      <div key={idx} style={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '10px 12px', fontSize: '10.5px', color: '#ffffff', lineHeight: '1.4' }}>
                        {s.text}
                        <span style={{ display: 'block', fontSize: '8.5px', color: '#9ca3af', marginTop: '4px' }}>
                          ~{s.calories} kcal · {s.protein}g protein · {s.fiber}g fiber
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1-Tap Natasha's Law Scanner */}
              <div className="scanner-module-card">
                <h3 className="card-header-title">1-Tap Allergen Scanner</h3>
                <p className="card-header-desc">
                  Check formulations and menus against your personal allergen exclusions under UK food safety rules.
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
                      <span className="vitals-label font-bold" style={{ color: '#00ff88', letterSpacing: '2px', fontSize: '9px', textTransform: 'uppercase' }}>🛡️ B2B ATHLETE BIOMETRIC IDENTITY</span>
                      <h2 style={{ fontSize: '20px', color: '#fff', margin: '12px 0 6px 0', fontWeight: '900', fontFamily: 'monospace', letterSpacing: '1px' }}>
                        {profile.name || 'ANONYMOUS ATHLETE'}
                      </h2>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                        <span className="bio-status-badge status-optimal" style={{ fontSize: '8px', padding: '2px 8px' }}>STREAK: {getStreakFlameDisplay(streak).emoji} {streak}-Day</span>
                        <span className="bio-status-badge status-syncing" style={{ fontSize: '8px', padding: '2px 8px' }}>CONDITION: PEAK ATHLETE</span>
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
                    <span className="vitals-label font-bold" style={{ letterSpacing: '1px', fontSize: '8.5px' }}>SECURE COCKPIT WALLET • LEVEL {level} ({xp} XP)</span>
                    <h3 className="rewards-wallet-balance" style={{ fontSize: '24px', margin: '4px 0', color: '#00ff88', fontWeight: 'bold' }}>{totalVoucherPoints} Points</h3>
                    <p style={{ fontSize: '10px', color: '#9ca3af', lineHeight: '1.4', margin: '4px 0 12px 0' }}>
                      Verified efforts accumulate point balances programmatically. Settle points instantly for premium coffee cards, direct API gift cards, or local B2B pilot claims.
                    </p>

                    {/* 🛡️ Secure Presentation Override Toggle */}
                    <div style={{ borderTop: '1px dashed #1f2937', paddingTop: '12px' }}>
                      <label className="demo-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9.5px', color: '#ff9500', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={visaDemoMode}
                          onChange={(e) => {
                            setVisaDemoMode(e.target.checked);
                            setMotivationMessage(e.target.checked ? '🚀 Pitch Mode Active! Point limits and quest requirements bypassed.' : '🔒 Standard verification gates restored.');
                            setTimeout(() => setMotivationMessage(null), 5000);
                          }}
                          className="demo-toggle-checkbox"
                          style={{ accentColor: '#ff9500', width: '13px', height: '13px' }}
                        />
                        ⚡ Enable Demo Pitch Mode (Bypass verification checks)
                      </label>
                    </div>
                  </div>

                  {/* Active Wearable Sensor Integration Panel */}
                  <div className="biopoint-validator-card">
                    <span className="validator-label" style={{ fontSize: '8.5px', letterSpacing: '1px' }}>🔋 ACTIVE TELEMETRY SENSOR LINKS</span>
                    <p className="validator-desc" style={{ fontSize: '10px', lineHeight: '1.4' }}>
                      Synchronize your wearable physical devices. Single-tap authorization feeds raw continuous telemetry streams straight to the KinetixFit clearinghouse.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button onClick={() => setShowDeviceSyncModal(true)} className="connect-wearable-btn" style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '10px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        🔌 Configure Smart Sensor Links
                      </button>
                    </div>
                  </div>

                  {/* Configure Biological Benchmarks Form */}
                  <div className="hub-support-card">
                    <span className="vitals-label font-bold" style={{ fontSize: '8.5px', color: '#00ff88', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>⚙️ PHYSICAL PERFORMANCE PARAMETERS</span>
                    <div className="drawer-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Display Name
                        <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Height (cm)
                        <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Weight (kg)
                        <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Age
                        <input type="number" value={profile.age} onChange={(e) => saveProfileToStorage({...profile, age: parseInt(e.target.value) || 0})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Biological Sex
                        <select value={profile.sex ?? ''} onChange={(e) => saveProfileToStorage({...profile, sex: e.target.value === '' ? null : e.target.value as UserProfile['sex']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="">Prefer not to say</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </label>
                      {profile.sex === 'female' && (
                        <>
                          <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Last Period Start Date
                            <input type="date" value={profile.lastPeriodStartDate ?? ''} onChange={(e) => saveProfileToStorage({...profile, lastPeriodStartDate: e.target.value || null})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </label>
                          <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Average Cycle Length (days)
                            <input type="number" value={profile.averageCycleLength} onChange={(e) => saveProfileToStorage({...profile, averageCycleLength: parseInt(e.target.value) || 28})} className="drawer-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </label>
                        </>
                      )}
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Activity Level
                        <select value={profile.activityLevel} onChange={(e) => saveProfileToStorage({...profile, activityLevel: e.target.value as UserProfile['activityLevel']})} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          <option value="sedentary">Sedentary</option>
                          <option value="light">Light</option>
                          <option value="moderate">Moderate</option>
                          <option value="active">Active</option>
                          <option value="very_active">Very Active</option>
                        </select>
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Fitness Target
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
                    <span className="vitals-label font-bold" style={{ fontSize: '8.5px', color: '#00ff88', letterSpacing: '1.5px', display: 'block', marginBottom: '4px' }}>🥗 NATASHA'S LAW FOOD EXCLUSIONS</span>
                    <p className="card-header-desc" style={{ fontSize: '9.5px', color: '#9ca3af', lineHeight: '1.4', margin: '4px 0 12px 0' }}>
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
                              fontSize: '10px',
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
                    <span className="vitals-label font-bold" style={{ fontSize: '8.5px', color: '#00ff88', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>🔔 NOTIFICATION SETTINGS</span>
                    <label className="demo-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9.5px', color: '#ffffff', cursor: 'pointer', marginBottom: '10px' }}>
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
                      💧 Hydration reminders during my shift
                    </label>
                    <div className="drawer-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Shift Start
                        <select value={shiftStartHour} onChange={(e) => { const v = parseInt(e.target.value); setShiftStartHour(v); localStorage.setItem('kinetix_shift_start', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Shift End
                        <select value={shiftEndHour} onChange={(e) => { const v = parseInt(e.target.value); setShiftEndHour(v); localStorage.setItem('kinetix_shift_end', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                        </select>
                      </label>
                      <label className="drawer-label" style={{ fontSize: '9px', color: '#9ca3af' }}>Every
                        <select value={hydrationIntervalHours} onChange={(e) => { const v = parseInt(e.target.value); setHydrationIntervalHours(v); localStorage.setItem('kinetix_hydration_interval', v.toString()); }} className="drawer-select" style={{ width: '100%', boxSizing: 'border-box' }}>
                          {[1, 2, 3, 4].map(h => <option key={h} value={h}>{h}h</option>)}
                        </select>
                      </label>
                    </div>
                    <p style={{ fontSize: '8.5px', color: '#6b7280', margin: '10px 0 0 0', lineHeight: '1.4' }}>
                      Activity and nutrition-target alerts are always on (native app only) and fire at most once per event per day — no spam. You'll be asked to allow notifications the first time one of these actually needs to fire.
                    </p>
                  </div>

                </div>

                {/* RIGHT ACTIVE REWARDS PANEL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                  {/* Today's Gamified Quests list */}
                  <div className="quests-card">
                    <div className="quests-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px', marginBottom: '12px' }}>
                      <h3 className="quests-title" style={{ fontSize: '12px', color: '#00ff88', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🔥 Daily Active Quests</h3>
                      <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'bold' }}>{tasksCompletedTodayCount} Completed</span>
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
                              fontSize: '10px',
                              transition: 'all 0.25s'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span style={{ color: t.completed ? '#00ff88' : '#6b7280' }}>{t.completed ? '●' : '○'}</span>
                              <span style={{ textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? '#00ff88' : '#ffffff', lineHeight: '1.3' }}>
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
                      <h3 className="quests-title" style={{ fontSize: '12px', color: '#00ff88', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🏅 Achievements</h3>
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
                    <span className="validator-label" style={{ fontSize: '8.5px', letterSpacing: '1.5px' }}>⚡ BIOMECHANICAL STEP VELOCIMETER</span>
                    <p className="validator-desc" style={{ fontSize: '9.5px', color: '#9ca3af', lineHeight: '1.4', margin: '4px 0 12px 0' }}>
                      Enforce locomotive anti-cheat boundaries. Steps below 350 SPM velocity ceilings accrue point balances. Mechanical phone shakers are intercepted.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => handleSimulateSteps(120)} className="cadence-btn-normal" style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}>
                        🏃 Locomotion (120 SPM)
                      </button>
                      <button onClick={() => handleSimulateSteps(420)} className="cadence-btn-alert" style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}>
                        🚨 Fraud Shake (420 SPM)
                      </button>
                    </div>
                  </div>

                  {/* Kinetix Rewards Vault Card (Gateway selection) */}
                  <div className="rewards-redemption-card">
                    <div className="rewards-redemption-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>
                      <div>
                        <h3 className="redemption-title" style={{ fontSize: '12.5px', color: '#ffffff', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Kinetix Rewards Vault</h3>
                        <span style={{ fontSize: '8px', color: '#6b7280' }}>ACTIVE CLEARINGHOUSE ROUTER</span>
                      </div>
                      <button onClick={triggerRewardVaultSettlement} disabled={isRedeemingVoucher} className="redeem-rewards-btn" style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        {isRedeemingVoucher ? 'Processing…' : `🎟️ Cash Out Voucher ${visaDemoMode ? '(0 Pts)' : '(2,500 Pts)'}`}
                      </button>
                    </div>

                    {/* Integrated Gateway Selector (disabled until live provider approval is confirmed) */}
                    <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px', marginBottom: '15px' }}>
                      <span style={{ fontSize: '8px', color: '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Select Rewards Settlement Gateway:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        <button
                          disabled
                          style={{
                            backgroundColor: '#0b0f19',
                            border: '1px solid #1f2937',
                            color: '#4b5563',
                            fontSize: '9px',
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
                            fontSize: '9px',
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
                            fontSize: '9px',
                            padding: '6px 2px',
                            fontFamily: 'monospace',
                            borderRadius: '4px',
                            cursor: 'not-allowed',
                            fontWeight: 'normal',
                            opacity: 0.5
                          }}
                        >
                          Local B2B
                        </button>
                      </div>

                      {/* Honest status message shown regardless of gateway state */}
                      <span style={{ fontSize: '8px', color: '#9ca3af', marginTop: '8px', display: 'block', lineHeight: '1.3' }}>
                        Rewards redemption is launching soon — check back shortly.
                      </span>
                    </div>

                    {/* Active vouchers history ledger */}
                    <div className="ledger-table-container">
                      <table className="ledger-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
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
                                <span className={`ledger-status-pill status-${v.state.toLowerCase()}`} style={{ fontSize: '7.5px', padding: '1px 5px', borderRadius: '3px' }}>
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
                        <h3 className="charity-title" style={{ fontSize: '11.5px', color: '#ffffff', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🎗️ UK Social Philanthropy Portal</h3>
                        <span className="charity-subtitle" style={{ fontSize: '8px', color: '#9ca3af' }}>Converts completed achievements directly into CSR donations.</span>
                      </div>
                      <span className="donations-count-pill" style={{ fontSize: '9.5px', color: '#00ff88', fontWeight: 'bold' }}>Issued: {charityDonations}</span>
                    </div>

                    <div className="charity-options-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {ukCharities.map(charity => (
                        <div key={charity.id} className="charity-item-subcard" style={{ background: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px' }}>
                          <div>
                            <span className="charity-item-tag" style={{ fontSize: '7.5px', color: '#00bfff', textTransform: 'uppercase', fontWeight: 'bold' }}>{charity.desc}</span>
                            <h4 className="charity-item-name" style={{ fontSize: '11px', color: '#ffffff', margin: '2px 0' }}>{charity.name}</h4>
                            <p className="charity-item-mission" style={{ fontSize: '9px', color: '#9ca3af', lineHeight: '1.3', margin: 0 }}>{charity.mission}</p>
                          </div>
                          <button onClick={() => handleDonateToCharity(charity.id, charity.name)} disabled={isDonating} className="donate-points-btn" style={{ marginTop: '10px', width: '100%', padding: '6px', fontSize: '9.5px' }}>
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
                  <h3 className="legal-card-title">🏢 About KinetixFit Systems</h3>
                  <p className="legal-card-text">
                    KinetixFit is a bespoke, category-of-one biometric health clearinghouse built specifically to streamline continuous tracking, formulation ingredient checking, and high-performance lifestyle monitoring.
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
                <h3 className="support-card-title">✉️ Corporate Support Desk</h3>

                {contactSuccess ? (
                  <div className="support-success-banner">
                    🚀 Message received! Our engineering desk will respond within 12 hours.
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
            <h4 style={{ color: '#fff', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>⚕️ UK Clinical Compliance Framework</h4>
            <p style={{ lineHeight: '1.4' }}>
              KinetixFit acts as an autonomic biometric analysis clearinghouse. It is not a certified medical device and does not substitute professional medical diagnosis, clinical testing, or general practitioner (GP) advice. Always consult a certified specialist prior to starting high-workload fitness structures or dietary deficits.
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
          title="Launch Ingestion Scan"
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
                <span className="nav-label" style={{ fontSize: '9px', fontWeight: active ? 'bold' : 'normal', color: active ? '#ffffff' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <h2 className="modal-title" style={{ color: '#00ff88', fontSize: '20px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              ATHLETIC LEVEL UP!
            </h2>
            <p className="modal-desc" style={{ color: '#ffffff', fontSize: '11.5px', marginTop: '10px', lineHeight: '1.5' }}>
              Congratulations! Your verified physical and biometric efforts have promoted your telemetry status to:
              <br/>
              <strong style={{ color: '#00bfff', display: 'block', margin: '10px 0', fontSize: '15px' }}>
                LEVEL {level + 1} PEAK CONDITIONING ATHLETE
              </strong>
              Your B2B clearinghouse pass quotas and points limits have been upgraded successfully.
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
              <p style={{ fontSize: '9px', color: '#9ca3af', marginTop: '10px' }}>
                📱 Live sync requires the iOS or Android app — desktop/web can't connect Apple Health or Health Connect.
              </p>
            )}

            {/* Real-time Syncing Educational Diagnostics Panel */}
            <div className="sync-diagnostics-card" style={{ marginTop: '15px', backgroundColor: '#030712', border: '1px solid #1f2937', padding: '12px', borderRadius: '8px', fontSize: '9.5px', color: '#9ca3af', textAlign: 'left', lineHeight: '1.4' }}>
              <span style={{ color: '#00bfff', fontWeight: 'bold', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📡 Telemetry Sync Protocol: How it Works
              </span>
              KinetixFit operates on a **Single-Tap Aggregated Handshake**. Instead of connecting directly to 50 individual devices, our app links with your phone's native health data aggregation layer.
              <br/><br/>
              Whether you are syncing locomotive steps from a wristband, cardiac HRV streams from an ECG chest strap, or restorative deep sleep stages from a circadian ring, your smartphone aggregates them into a central feed. KinetixFit reads this central feed with a single click, instantly validating points in real-time!
            </div>
            <button onClick={() => setShowDeviceSyncModal(false)} className="modal-close-btn">
              Cancel Sync
            </button>
          </div>
        </div>
      )}

      {/* --- SIMULATED OPTICAL CHARACTER CAMERA OCR VIEWPORT MODAL --- */}
      {showCameraModal && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card">
            <h3 className="modal-title">📷 AI Spectral Ingestion Scanner</h3>

            {isCameraScanning ? (
              <div className="camera-viewfinder-scanning" style={{ height: '240px' }}>
                <div className="laser-beam"></div>
                <div className="ocr-matrix-output" style={{ padding: '15px', color: '#00ff88', fontSize: '9px', fontFamily: 'monospace', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div>⏳ [SYS_START]: INGESTION PIPELINE ACTIVE</div>
                  <div>📡 [OCR_SNAP]: EXTRACTING INGREDIENT TEXT STRINGS</div>
                  <div>🧬 [VECTOR]: COMPILING ALLERGEN VECTORS (UK FSA STANDARD)</div>
                  <div>🛡️ [NATASHA]: CROSS-REFERENCING CUSTOM BIO PROFILE...</div>
                </div>
                <span className="scanner-timer" style={{ fontSize: '28px', marginTop: '10px' }}>⚡</span>
                <span className="scanner-status-text" style={{ textShadow: '0 0 10px #00ff88', marginTop: '5px' }}>INTERROGATING INGREDIENTS DICTIONARY...</span>
                <span className="scanner-subtext">UK Food Information Regulations Compliant</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p className="modal-desc">
                  Snap or upload a photo for AI-powered food identification and portion estimation, or pick a quick option below.
                </p>

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

                {/* Preloaded database list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                  {[
                    { name: 'Premium Deli Smoked Salmon Salad Box', ing: 'Atlantic Salmon (Fish), Mixed Leaves, Olive Oil, Soya Dressing, Sea Salt' },
                    { name: 'Organic Peanut Protein Bar', ing: 'Roasted Peanuts, Peanut Butter, Oats, Milk Chocolate, Honey, Wheat Flour' },
                    { name: 'Sweet Potato Bhaji Wrap', ing: 'Sweet Potato, Spices, Wheat Tortilla, Mustard Seed, Celery, Sesame Oil' },
                    { name: 'High-Street Sausage Roll Formulation', ing: 'Wheat Flour, Pork Sausage, Butter (Milk), Eggs, Spices, Soya Protein' }
                  ].map(p => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setMealInput(p.ing);
                        triggerCameraScan(p.ing);
                      }}
                      className="camera-mock-choice-btn hover-green"
                      style={{ padding: '10px', fontSize: '11px', textTransform: 'none' }}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontWeight: 'bold', color: '#fff', display: 'block', marginBottom: '2px' }}>🛒 {p.name}</span>
                        <span style={{ color: '#6b7280', fontSize: '9px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                          Ingredients: {p.ing}
                        </span>
                      </div>
                      <span style={{ color: '#00ff88', fontSize: '9px', fontWeight: 'bold', border: '1px solid #00ff88', padding: '2px 6px', borderRadius: '4px' }}>SCAN</span>
                    </button>
                  ))}
                </div>

                {/* OCR text custom capture box */}
                <div style={{ borderTop: '1px solid #1f2937', paddingTop: '15px' }}>
                  <label className="drawer-label" style={{ marginBottom: '6px', display: 'block' }}>Custom Formulation Viewfinder Capture</label>
                  <textarea
                    rows={2}
                    placeholder="Type or paste custom formulation ingredients (e.g. wheat, milk, eggs, peanuts) to run simulated AI character recognition scanner..."
                    value={mealInput}
                    onChange={(e) => setMealInput(e.target.value)}
                    className="support-textarea"
                    style={{ fontSize: '11px', background: '#030712', color: '#00ff88', border: '1px solid #00ff88', fontFamily: 'monospace', padding: '10px' }}
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
          font-size: 20px !important;
          font-weight: 900 !important;
          color: #ffffff !important;
          margin: 0 !important;
          letter-spacing: 2px !important;
          text-shadow: 0 0 10px rgba(0, 255, 136, 0.3) !important;
        }
        .app-brand-subtitle {
          font-size: 9px !important;
          color: #6b7280 !important;
          letter-spacing: 2px !important;
          display: block !important;
          text-transform: uppercase !important;
        }
        .app-auth-pill {
          background-color: rgba(0, 255, 136, 0.08) !important;
          border: 1px solid rgba(0, 255, 136, 0.3) !important;
          color: #00ff88 !important;
          font-size: 10px !important;
          font-weight: bold !important;
          padding: 6px 14px !important;
          border-radius: 20px !important;
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          letter-spacing: 1px !important;
          box-shadow: 0 0 15px rgba(0, 255, 136, 0.1) !important;
        }

        /* Alert Notification banner */
        .alert-ticker {
          background-color: rgba(0, 255, 136, 0.08) !important;
          border-bottom: 1px solid rgba(0, 255, 136, 0.25) !important;
          color: #00ff88 !important;
          padding: 8px 15px !important;
          font-size: 10px !important;
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
          font-size: 12px !important;
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

        /* Athletic Progress Cockpit Styling */
        .athlete-level-gauge-card {
          background: linear-gradient(135deg, #0b0f19 0%, #030712 100%) !important;
          border: 1px solid #1f2937 !important;
          border-radius: 16px !important;
          padding: 20px !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
        }
        .level-gauge-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          margin-bottom: 15px !important;
        }
        .athlete-avatar-badge {
          background: radial-gradient(circle, #00ff88 0%, #00bfff 100%) !important;
          color: #030712 !important;
          font-weight: 900 !important;
          font-size: 13px !important;
          width: 52px !important;
          height: 52px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 0 15px rgba(0, 255, 136, 0.4) !important;
        }
        .athlete-title {
          font-size: 13.5px !important;
          color: #ffffff !important;
          margin: 0 0 2px 0 !important;
        }
        .athlete-subtext {
          font-size: 9.5px !important;
          color: #9ca3af !important;
        }
        .streak-badge {
          background-color: rgba(255, 149, 0, 0.08) !important;
          border: 1px solid #ff9500 !important;
          color: #ff9500 !important;
          font-size: 9.5px !important;
          font-weight: bold !important;
          padding: 5px 12px !important;
          border-radius: 12px !important;
          letter-spacing: 0.5px !important;
          transition: box-shadow 0.5s ease, border-color 0.5s ease !important;
        }
        .streak-tier-0 { opacity: 0.6 !important; }
        .streak-tier-2 { box-shadow: 0 0 8px rgba(255, 149, 0, 0.35) !important; }
        .streak-tier-3 { box-shadow: 0 0 12px rgba(255, 149, 0, 0.5) !important; border-color: #ffb347 !important; }
        .streak-tier-4 { box-shadow: 0 0 18px rgba(255, 149, 0, 0.7) !important; border-color: #ffcc80 !important; animation: streakGlowPulse 1.8s ease-in-out infinite !important; }
        @keyframes streakGlowPulse {
          0%, 100% { box-shadow: 0 0 12px rgba(255, 149, 0, 0.5); }
          50% { box-shadow: 0 0 22px rgba(255, 149, 0, 0.85); }
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
        .badge-icon { font-size: 22px !important; }
        .badge-label { font-size: 8px !important; text-transform: uppercase; letter-spacing: 0.3px !important; line-height: 1.3 !important; }
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
          font-size: 9px !important;
        }
        .xp-progress-bar-container {
          display: flex !important;
          flex-direction: column !important;
          gap: 6px !important;
        }
        .xp-bar-header {
          display: flex !important;
          justify-content: space-between !important;
          font-size: 9px !important;
          color: #6b7280 !important;
          text-transform: uppercase !important;
        }
        .xp-bar-track {
          width: 100% !important;
          height: 8px !important;
          background-color: #030712 !important;
          border-radius: 4px !important;
          overflow: hidden !important;
          border: 1px solid #1f2937 !important;
        }
        .xp-bar-fill {
          height: 100% !important;
          background: linear-gradient(90deg, #00ff88 0%, #00bfff 100%) !important;
          border-radius: 4px !important;
          box-shadow: 0 0 8px rgba(0, 255, 136, 0.5) !important;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;
          animation: xpBarBreathe 2.4s ease-in-out infinite !important;
        }
        @keyframes xpBarBreathe {
          0%, 100% { box-shadow: 0 0 8px rgba(0, 255, 136, 0.5); }
          50% { box-shadow: 0 0 14px rgba(0, 191, 255, 0.6); }
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
          font-size: 9px !important;
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
        .progress-rings-box {
          display: flex !important;
          gap: 15px !important;
          align-items: center !important;
        }
        .ring-indicator {
          text-align: center !important;
          position: relative !important;
        }
        .ring-text {
          position: absolute !important;
          top: 38% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          font-size: 9px !important;
          font-weight: bold !important;
          color: #ffffff !important;
        }
        .ring-indicator span {
          display: block !important;
          font-size: 8.5px !important;
          color: #9ca3af !important;
          margin-top: 6px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }

        /* ECG Oscilloscope card */
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
        .ecg-card-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: flex-start !important;
        }
        .ecg-label {
          font-size: 9px !important;
          color: #6b7280 !important;
          letter-spacing: 2px !important;
          display: block !important;
          text-transform: uppercase !important;
        }
        .ecg-title {
          font-size: 15px !important;
          font-weight: bold !important;
          color: #ffffff !important;
          margin: 4px 0 0 0 !important;
          letter-spacing: 0.5px !important;
        }
        .live-broadcast-pill {
          background-color: rgba(255, 59, 48, 0.08) !important;
          border: 1px solid rgba(255, 59, 48, 0.3) !important;
          color: #ff3b30 !important;
          font-size: 8.5px !important;
          font-weight: bold !important;
          padding: 4px 10px !important;
          border-radius: 12px !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          letter-spacing: 1px !important;
          box-shadow: 0 0 10px rgba(255, 59, 48, 0.1) !important;
        }
        .ecg-oscilloscope-viewport {
          width: 100% !important;
          height: 100px !important;
          background-color: #02040a !important;
          border-radius: 10px !important;
          border: 1px solid #1f2937 !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .hud-grid-background {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background-image:
            linear-gradient(rgba(0, 255, 136, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 136, 0.05) 1px, transparent 1px) !important;
          background-size: 15px 15px !important;
          pointer-events: none !important;
        }
        .ecg-path {
          filter: drop-shadow(0 0 6px rgba(0, 255, 136, 0.6)) !important;
        }

        /* Submetrics details panels */
        .drilldown-submetrics-panel {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 10px !important;
          padding: 15px !important;
        }
        .drilldown-analysis-title {
          font-size: 11.5px !important;
          font-weight: bold !important;
          color: #00ff88 !important;
          margin: 0 0 6px 0 !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
        }
        .drilldown-analysis-desc {
          font-size: 10px !important;
          color: #9ca3af !important;
          line-height: 1.5 !important;
          margin: 0 0 12px 0 !important;
        }
        .drilldown-submetrics-grid {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          gap: 10px !important;
        }
        .drilldown-submetric-capsule {
          background-color: #0b0f19 !important;
          border: 1px solid #111827 !important;
          border-radius: 6px !important;
          padding: 10px !important;
          text-align: center !important;
        }
        .capsule-label {
          font-size: 8.5px !important;
          color: #6b7280 !important;
          text-transform: uppercase !important;
          display: block !important;
          margin-bottom: 3px !important;
        }
        .capsule-value {
          font-size: 11px !important;
          font-family: monospace !important;
          display: block !important;
        }

        /* 6-Core Grid metrics layout */
        .core-biometrics-grid {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          gap: 15px !important;
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
        .active-bio-card {
          border-color: #00ff88 !important;
          background: linear-gradient(135deg, #0b0f19 0%, rgba(0, 255, 136, 0.03) 100%) !important;
          box-shadow: 0 0 20px rgba(0, 255, 136, 0.1) !important;
        }
        .bio-card-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          margin-bottom: 6px !important;
        }
        .bio-system-label {
          font-size: 8px !important;
          color: #6b7280 !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }
        .bio-status-badge {
          font-size: 7.5px !important;
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
          font-size: 12px !important;
          color: #ffffff !important;
          margin: 0 !important;
          font-weight: normal !important;
          letter-spacing: 0.5px !important;
        }
        .bio-metric-reading {
          font-size: 15px !important;
          font-weight: bold !important;
          color: #00ff88 !important;
          margin: 6px 0 !important;
          font-family: monospace !important;
          text-shadow: 0 0 10px rgba(0, 255, 136, 0.2) !important;
        }
        .bio-behavior-log {
          font-size: 8px !important;
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
          font-size: 7.5px !important;
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
          font-size: 10.5px !important;
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
          font-size: 10.5px !important;
          font-family: monospace !important;
          transition: all 0.2s ease !important;
        }
        .edit-bio-btn:hover {
          background-color: #374151 !important;
        }

        /* Edit Profile Drawer drawer-card */
        .edit-profile-drawer {
          background-color: #0b0f19 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 12px !important;
          padding: 20px !important;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.01) !important;
        }
        .drawer-title {
          font-size: 12px !important;
          color: #00ff88 !important;
          text-transform: uppercase !important;
          margin: 0 0 15px 0 !important;
          letter-spacing: 1px !important;
        }
        .drawer-form-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 15px !important;
        }
        .drawer-label {
          font-size: 10px !important;
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
          font-size: 11px !important;
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
          font-size: 11px !important;
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
          font-size: 20px !important;
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
          font-size: 10px !important;
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
          font-size: 13px !important;
          color: #ffffff !important;
          margin: 0 0 6px 0 !important;
          border-left: 3px solid #00ff88 !important;
          padding-left: 10px !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
        }
        .card-header-desc {
          font-size: 10.5px !important;
          color: #9ca3af !important;
          line-height: 1.5 !important;
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
          font-size: 12px !important;
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
          font-size: 16px !important;
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
          font-size: 12px !important;
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
          font-size: 12px !important;
        }
        .compliance-badge {
          font-size: 9px !important;
          padding: 3px 10px !important;
          border-radius: 4px !important;
          font-weight: bold !important;
        }
        .badge-cleared { background-color: rgba(0, 255, 136, 0.1) !important; color: #00ff88 !important; }
        .badge-hazard_detected { background-color: rgba(255, 59, 48, 0.1) !important; color: #ff3b30 !important; }
        .estimated-portion-badge {
          display: inline-block !important;
          font-size: 8.5px !important;
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
          font-size: 10px !important;
          color: #9ca3af !important;
          margin-bottom: 10px !important;
        }
        .panel-sub-label {
          color: #ffffff !important;
          display: block !important;
          font-size: 9px !important;
          margin-bottom: 4px !important;
        }
        .scan-clinical-recommendation {
          border-top: 1px solid #111827 !important;
          padding-top: 8px !important;
          font-size: 9.5px !important;
          line-height: 1.4 !important;
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
          font-size: 24px !important;
          font-weight: bold !important;
          color: #00ff88 !important;
          margin: 4px 0 !important;
        }
        .demo-toggle-label {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          font-size: 9.5px !important;
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
          font-size: 8.5px !important;
          color: #6b7280 !important;
          letter-spacing: 1px !important;
          display: block !important;
          margin-bottom: 4px !important;
        }
        .validator-desc {
          font-size: 9.5px !important;
          color: #9ca3af !important;
          line-height: 1.4 !important;
          margin: 0 0 12px 0 !important;
        }
        .cadence-btn-normal {
          flex: 1 !important;
          background-color: rgba(0, 255, 136, 0.08) !important;
          border: 1px solid #00ff88 !important;
          color: #00ff88 !important;
          padding: 8px !important;
          font-size: 10px !important;
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
          font-size: 10px !important;
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
          font-size: 12.5px !important;
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
          font-size: 10.5px !important;
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
          font-size: 13px !important;
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
          font-size: 10px !important;
          font-family: monospace !important;
        }
        .redemption-description {
          font-size: 9.5px !important;
          color: #9ca3af !important;
          line-height: 1.4 !important;
          margin: 0 0 12px 0 !important;
        }
        .ledger-table-container {
          overflow-x: auto !important;
        }
        .ledger-table {
          width: 100% !important;
          border-collapse: collapse !important;
          font-size: 9.5px !important;
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
          font-size: 7.5px !important;
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
          font-size: 11.5px !important;
          color: #ffffff !important;
          margin: 0 !important;
          text-transform: uppercase !important;
        }
        .charity-subtitle {
          font-size: 8.5px !important;
          color: #9ca3af !important;
          display: block !important;
        }
        .donations-count-pill {
          font-size: 9px !important;
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
          font-size: 7.5px !important;
          color: #00bfff !important;
          text-transform: uppercase !important;
          font-weight: bold !important;
          display: block !important;
        }
        .charity-item-name {
          font-size: 11.5px !important;
          color: #ffffff !important;
          margin: 2px 0 !important;
        }
        .charity-item-mission {
          font-size: 9px !important;
          color: #9ca3af !important;
          line-height: 1.3 !important;
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
          font-size: 9.5px !important;
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
          font-size: 13.5px !important;
          font-weight: bold !important;
          margin: 4px 0 !important;
        }
        .billing-disclaimer {
          font-size: 9px !important;
          color: #6b7280 !important;
          line-height: 1.4 !important;
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
          font-size: 7.5px !important;
          color: #6b7280 !important;
          display: block !important;
        }
        .billing-stat-box strong {
          font-size: 11.5px !important;
          color: #00ff88 !important;
          display: block !important;
          margin: 2px 0 !important;
        }
        .billing-stat-box p {
          font-size: 8px !important;
          color: #9ca3af !important;
          margin: 0 !important;
          line-height: 1.3 !important;
        }
        .promo-input-box {
          margin-top: 15px !important;
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 8px !important;
          padding: 12px !important;
        }
        .promo-box-title {
          font-size: 9.5px !important;
          color: #00bfff !important;
          font-weight: bold !important;
          display: block !important;
        }
        .promo-box-desc {
          font-size: 8.5px !important;
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
          font-size: 10.5px !important;
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
          font-size: 10px !important;
          font-family: monospace !important;
          cursor: pointer !important;
          border-radius: 4px !important;
        }
        .promo-response-msg {
          font-size: 9px !important;
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
          font-size: 11px !important;
          color: #ffffff !important;
          margin: 0 0 6px 0 !important;
        }
        .legal-card-text {
          font-size: 9.5px !important;
          color: #9ca3af !important;
          line-height: 1.4 !important;
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
          font-size: 11.5px !important;
          color: #ffffff !important;
          margin: 0 0 10px 0 !important;
        }
        .support-success-banner {
          background-color: rgba(0, 255, 136, 0.08) !important;
          border: 1px solid #00ff88 !important;
          color: #00ff88 !important;
          padding: 12px !important;
          border-radius: 6px !important;
          font-size: 10px !important;
          text-align: center !important;
        }
        .support-form-stack {
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }
        .support-field-label {
          font-size: 9px !important;
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
          font-size: 10px !important;
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
          font-size: 10px !important;
          border-radius: 4px !important;
          outline: none !important;
          resize: none !important;
          box-sizing: border-box !important;
        }
        .support-emails-box {
          border-top: 1px solid #111827 !important;
          margin-top: 12px !important;
          padding-top: 10px !important;
          font-size: 9px !important;
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
          font-size: 10px !important;
          font-weight: bold !important;
          gap: 4px !important;
          transition: all 0.25s ease !important;
        }
        .nav-item-active {
          color: #00ff88 !important;
        }
        .nav-icon {
          font-size: 16px !important;
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
          font-size: 22px !important;
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
          font-size: 16px !important;
          opacity: 0 !important;
          animation: levelUpSparkleTwinkle 2.4s ease-in-out infinite !important;
          pointer-events: none !important;
        }
        .levelup-sparkle-1 { top: 12% !important; left: 15% !important; animation-delay: 0s !important; }
        .levelup-sparkle-2 { top: 20% !important; right: 12% !important; animation-delay: 0.7s !important; font-size: 12px !important; }
        .levelup-sparkle-3 { bottom: 18% !important; left: 22% !important; animation-delay: 1.3s !important; font-size: 13px !important; }
        @keyframes levelUpSparkleTwinkle {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .modal-title {
          font-size: 14px !important;
          color: #ffffff !important;
          margin: 0 0 4px 0 !important;
        }
        .modal-desc {
          font-size: 10px !important;
          color: #9ca3af !important;
          line-height: 1.4 !important;
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
          font-size: 10px !important;
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
          font-size: 10px !important;
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
          font-size: 24px !important;
          animation: rotationSpin 2s infinite linear !important;
        }
        @keyframes rotationSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .scanner-status-text {
          font-size: 9.5px !important;
          color: #00ff88 !important;
          font-weight: bold !important;
          margin-top: 10px !important;
          text-align: center !important;
        }
        .scanner-subtext {
          font-size: 8px !important;
          color: #6b7280 !important;
          margin-top: 4px !important;
        }

        /* Camera click choices */
        .camera-mock-choice-btn {
          background-color: #030712 !important;
          border: 1px solid #1f2937 !important;
          color: #ffffff !important;
          padding: 10px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 10px !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          font-family: monospace !important;
          transition: all 0.2s !important;
        }
        .camera-mock-choice-btn.hover-green:hover { border-color: #00ff88 !important; }
        .camera-mock-choice-btn.hover-red:hover { border-color: #ff3b30 !important; }

        /* Compliance footer */
        .app-compliance-footer {
          border-top: 2px solid #1f2937 !important;
          margin-top: 15px !important;
          padding-top: 15px !important;
          font-size: 8.5px !important;
          color: #6b7280 !important;
        }

        /* Generic classes */
        .green-pulse-dot {
          width: 6px !important;
          height: 6px !important;
          background-color: #00ff88 !important;
          border-radius: 50% !important;
          animation: syncPulse 1.5s infinite !important;
        }
        @keyframes syncPulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        .live-pulse-dot {
          width: 4px !important;
          height: 4px !important;
          background-color: #ff3b30 !important;
          border-radius: 50% !important;
          animation: syncPulse 1.2s infinite !important;
        }

        /* 📱 Symmetrical Mobile Adaptation (Collapses seamlessly on smaller viewports) */
        @media (max-width: 1024px) {
          .vitals-dashboard-grid {
            grid-template-columns: 1fr !important;
          }
          .core-biometrics-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }

        @media (max-width: 768px) {
          .core-biometrics-grid {
            grid-template-columns: 1fr !important;
          }
          .floating-hud-camera-fab {
            bottom: 100px !important;
            right: 20px !important;
            width: 50px !important;
            height: 50px !important;
            font-size: 18px !important;
          }
        }
      `}</style>

    </div>
  );
}
