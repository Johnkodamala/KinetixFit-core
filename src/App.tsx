import React, { useState, useEffect } from 'react';

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
}

interface MealScanResult {
  foodName: string;
  calories: number;
  macros: { carbs: number; protein: number; fat: number; fiber: number };
  micros: { sodium: string; potassium: string; iron: string; calcium: string };
  allergensFlagged: string[];
  complianceStatus: 'CLEARED' | 'HAZARD_DETECTED';
  dietaryRecommendation: string;
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

  // --- 2. ACTIVE NAVIGATION TAB ---
  // "vitals" (Today), "nourish" (Ingest Scanner), "rewards" (Quests & Kinetix Rewards), "hub" (Corporate Hub & Pass Allocations)
  const [activeTab, setActiveTab] = useState<string>('vitals');

  // --- 3. SELECTED METRIC FOR DETAILED TRIPLE-TIER DRILLDOWN ---
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>('BIO-2'); // Defaults to Heart Health (BIO-2)

  // --- 4. USER PROFILE DATA STATE (With LocalStorage Persistence) ---
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('kinetix_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved profile data.", e);
      }
    }
    return {
      name: '',
      email: '',
      height: 180,
      weight: 75.0,
      target: 'Autonomic Recovery',
      personalAllergens: [],
      workoutsLogged: ['Morning Walk (30m)'],
      smartDeviceConnected: null
    };
  });

  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [showDeviceSyncModal, setShowDeviceSyncModal] = useState<boolean>(false);
  const [syncingDeviceType, setSyncingDeviceType] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isLoggedIn || onboardingStep < 5) return;
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
  }, [isLoggedIn, onboardingStep]);

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
      reading: '84% Quality',
      status: 'Optimal',
      behavior: 'Deep/REM Stages Synchronized',
      waveType: 'delta',
      details: {
        title: 'Circadian Sleep Architecture',
        description: 'Decomposes sleep cycles, synchronizing deep sleep and rapid eye movement (REM) phases with stress recovery ceilings.',
        subMetrics: [
          { label: 'Overall Sleep Quality', value: '84%', color: '#00ff88' },
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
    {
      id: 'BIO-6',
      metric: 'Women\'s Health',
      system: 'Dynamic Biological Rhythm Sync',
      reading: 'Phase 2 Follicular',
      status: 'Calibrating',
      behavior: 'Basal Trend Optimization Active',
      waveType: 'slow_sinusoidal',
      details: {
        title: 'Biological Rhythm Alignment',
        description: 'Integrates natural biological cycle tracking to schedule active stress thresholds and resting basals cleanly.',
        subMetrics: [
          { label: 'Rhythm Sync Cycle', value: 'Phase 2 Follicular', color: '#ec4899' },
          { label: 'Basal Temp Baseline', value: '36.6 °C', color: '#00bfff' },
          { label: 'Hormonal Energy Floor', value: 'High Performance', color: '#00ff88' }
        ]
      }
    },
  ]);

  // Sync heart biometrics with live ticker values
  useEffect(() => {
    setBiometrics(prev => prev.map(item => {
      if (item.id === 'BIO-2') {
        return {
          ...item,
          reading: `${liveBpm} BPM / ${liveHrv} ms HRV`,
          status: liveBpm > 100 ? 'Critical' : 'Optimal',
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
      return item;
    }));
  }, [liveBpm, liveHrv]);

  // --- 8. GAMIFICATION ENGINE (With Custom Points & Quotas) ---
  const [xp, setXp] = useState<number>(() => parseInt(localStorage.getItem('kinetix_xp') || '420'));
  const [level] = useState<number>(() => parseInt(localStorage.getItem('kinetix_level') || '3'));
  const [totalVoucherPoints, setTotalVoucherPoints] = useState<number>(() => parseInt(localStorage.getItem('kinetix_voucher_points') || '1250'));

  const [todayTasks, setTodayTasks] = useState<Task[]>([
    { id: 'TOD-1', text: 'Maintain a step cadence below 350 SPM velocity ceiling', completed: false, xpValue: 150, pointsValue: 200 },
    { id: 'TOD-2', text: 'Complete your customized macro/micro targets (Check Scanner)', completed: false, xpValue: 100, pointsValue: 150 },
    { id: 'TOD-3', text: 'Engage Autonomic Restoration cycle (HRV breathing)', completed: false, xpValue: 120, pointsValue: 180 }
  ]);

  const toggleTask = (id: string) => {
    setTodayTasks(prev => prev.map(t => {
      if (t.id === id) {
        const nextCompleted = !t.completed;
        let xpDiff = t.xpValue * (nextCompleted ? 1 : -1);
        let ptDiff = t.pointsValue * (nextCompleted ? 1 : -1);

        const newXp = Math.max(0, xp + xpDiff);
        const newPts = Math.max(0, totalVoucherPoints + ptDiff);

        setXp(newXp);
        setTotalVoucherPoints(newPts);
        localStorage.setItem('kinetix_xp', newXp.toString());
        localStorage.setItem('kinetix_voucher_points', newPts.toString());

        if (nextCompleted) {
          setTasksCompletedTodayCount(prev => prev + 1);
          setMotivationMessage(`🔥 Quest Completed: "${t.text}" (+${t.pointsValue} Points!)`);
          setTimeout(() => setMotivationMessage(null), 5000);
        } else {
          setTasksCompletedTodayCount(prev => Math.max(0, prev - 1));
        }

        return { ...t, completed: nextCompleted };
      }
      return t;
    }));
  };

  useEffect(() => {
    let specificTasks: Task[] = [];
    if (profile.target === 'Weight Loss') {
      specificTasks = [
        { id: 'TOD-1', text: 'Enforce 400 kcal caloric deficit target', completed: false, xpValue: 150, pointsValue: 220 },
        { id: 'TOD-2', text: 'Log high-fiber formulation target (>10g fiber in single meal)', completed: false, xpValue: 100, pointsValue: 150 },
        { id: 'TOD-3', text: 'Log 45-min Zone 3 aerobic cardio workload', completed: false, xpValue: 120, pointsValue: 180 }
      ];
    } else if (profile.target === 'Weight Gain') {
      specificTasks = [
        { id: 'TOD-1', text: 'Achieve 150g protein intake floor', completed: false, xpValue: 150, pointsValue: 220 },
        { id: 'TOD-2', text: 'Log surplus carbohydrate tracking metrics', completed: false, xpValue: 100, pointsValue: 150 },
        { id: 'TOD-3', text: 'Complete localized skeletal muscular resistance loading', completed: false, xpValue: 120, pointsValue: 180 }
      ];
    } else if (profile.target === 'Cardio Endurance') {
      specificTasks = [
        { id: 'TOD-1', text: 'Complete step intervals below 350 SPM velocity ceiling', completed: false, xpValue: 150, pointsValue: 220 },
        { id: 'TOD-2', text: 'Log real-time cardiac output peak threshold metrics', completed: false, xpValue: 100, pointsValue: 150 },
        { id: 'TOD-3', text: 'Satisfy 2.5L cellular hydration target', completed: false, xpValue: 120, pointsValue: 180 }
      ];
    } else {
      specificTasks = [
        { id: 'TOD-1', text: 'Engage 15-minute high vagal tone breathing series', completed: false, xpValue: 150, pointsValue: 220 },
        { id: 'TOD-2', text: 'Verify deep sleep stages in the telemetry console', completed: false, xpValue: 100, pointsValue: 150 },
        { id: 'TOD-3', text: 'Ensure low autonomic neurological stress load', completed: false, xpValue: 120, pointsValue: 180 }
      ];
    }
    setTodayTasks(specificTasks);
  }, [profile.target]);

  // --- 9. LIVE Energy Balance & NHS Dietary Metrics ---
  const [dailyConsumables, setDailyConsumables] = useState({
    calories: 1450,
    carbs: 180,
    protein: 65,
    fiber: 18
  });
  const [caloriesBurned, setCaloriesBurned] = useState<number>(450);

  const nhsTargets = {
    calories: profile.target === 'Weight Loss' ? 1800 : profile.target === 'Weight Gain' ? 2800 : 2200,
    carbs: profile.target === 'Weight Loss' ? 200 : profile.target === 'Weight Gain' ? 350 : 260,
    protein: Math.round(profile.weight * 1.2),
    fiber: 30
  };

  const caloriesRemaining = nhsTargets.calories - dailyConsumables.calories + caloriesBurned;

  // --- 10. OPTICAL INGESTION SCANNER & DIETARY MATRICES ---
  const [mealInput, setMealInput] = useState<string>('');
  const [scanResult, setScanResult] = useState<MealScanResult | null>(null);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);

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

  const ukCharities = [
    { id: 'CHAR-NHS', name: 'NHS Charities Together', mission: 'Supporting frontline health staff, clinical equipment, and patient recovery schemes.', desc: 'Strengthen local health ecosystems.' },
    { id: 'CHAR-BHF', name: 'British Heart Foundation', mission: 'Funding cardiovascular health research, clinical trials, and life-saving tech.', desc: 'Support clinical science research.' },
    { id: 'CHAR-TRUSSELL', name: 'The Trussell Trust', mission: 'Stopping hunger and supporting local food banks to end poverty in the UK.', desc: 'Direct societal food security relief.' }
  ];

  const handleDonateToCharity = (charityName: string) => {
    const requiredPoints = visaDemoMode ? 0 : 1000;

    if (!visaDemoMode && totalVoucherPoints < requiredPoints) {
      alert(`⚠️ INSUFFICIENT BALANCE: Point donation threshold is ${requiredPoints} points. Continue completing active quests to accumulate balance!`);
      return;
    }

    const newTx: VoucherLog = {
      id: `TX-DON-${Math.floor(1000 + Math.random() * 9000)}`,
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
    setMotivationMessage(`🎗️ SOCIAL VALUE LOGGED: Programmatic matching donation matched successfully.`);
    setTimeout(() => setMotivationMessage(null), 7000);
    alert(`🎗️ Kinetix Social Value Handshake Complete! Your donation to ${charityName} has been recorded.`);
  };

  // --- SUBSCRIPTIONS & ADMIN MANAGED PROMOS ---
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [promoMessage, setPromoMessage] = useState<string>('');
  const [revenueCatStatus, setRevenueCatStatus] = useState<string>('7-Day Free Trial Active');

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

  const handleMealScan = (inputStr?: string) => {
    const activeInput = inputStr || mealInput;
    const userInput = activeInput.toLowerCase().trim();
    if (!userInput) return;

    const personalChecks = profile.personalAllergens.length > 0 ? profile.personalAllergens : the14Allergens;
    const flagged = personalChecks.filter(allergen => userInput.includes(allergen));
    const isHazard = flagged.length > 0;

    let calories = 380;
    let carbs = 45;
    let protein = 18;
    let fat = 11;
    let fiber = 8;
    let recommendation = '';

    // Generic, highly-premium, white-labeled formulation references:
    if (userInput.includes('tomato pasta') || userInput.includes('organic tomato pasta')) {
      calories = 380;
      carbs = 65;
      protein = 12;
      fat = 8;
      fiber = 2;
    } else if (userInput.includes('sweet potato') || userInput.includes('sweet potato bhaji')) {
      calories = 420;
      carbs = 58;
      protein = 8;
      fat = 12;
      fiber = 9;
    } else if (userInput.includes('nut bar') || userInput.includes('protein nut bar')) {
      calories = 290;
      carbs = 22;
      protein = 11;
      fat = 16;
      fiber = 3;
    } else if (userInput.includes('chicken') || userInput.includes('salmon')) {
      calories = 480;
      protein = 42;
      carbs = 8;
      fat = 14;
      fiber = 4;
    } else if (userInput.includes('pasta') || userInput.includes('bread') || userInput.includes('oats')) {
      calories = 540;
      carbs = 82;
      protein = 14;
      fat = 7;
      fiber = 11;
    }

    // Advanced dynamic bio-telemetry diet recommendations based on selected profiles & biometrics:
    if (isHazard || userInput.includes('nut bar')) {
      const hazardAllergens = userInput.includes('nut') ? ['peanuts', 'nuts'] : flagged;
      recommendation = `❌ DIETARY EXCLUSION INGESTION TRIGGERED: Your personal food hazard list flagged (${hazardAllergens.join(', ')}) in this formulation scan. Ingest target rejected. Recommending organic plant-protein alternative formulation containing 12g fiber to satisfy your ${profile.target} target.`;
      setMotivationMessage(`⚠️ INGESTION WARNING: Personal allergen hazard detected in your scan!`);
      setTimeout(() => setMotivationMessage(null), 6000);

      setScanResult({
        foodName: activeInput,
        calories: userInput.includes('nut') ? 290 : calories,
        macros: { carbs: userInput.includes('nut') ? 22 : carbs, protein: userInput.includes('nut') ? 11 : protein, fat: userInput.includes('nut') ? 16 : fat, fiber: userInput.includes('nut') ? 3 : fiber },
        micros: { sodium: '110mg', potassium: '380mg', iron: '2.8mg', calcium: '55mg' },
        allergensFlagged: hazardAllergens,
        complianceStatus: 'HAZARD_DETECTED',
        dietaryRecommendation: recommendation
      });
    } else {
      setDailyConsumables(prev => ({
        calories: prev.calories + calories,
        carbs: prev.carbs + carbs,
        protein: prev.protein + protein,
        fiber: prev.fiber + fiber
      }));

      // Highly customized, advanced medical-grade nutritional compliance suggestions
      if (profile.target === 'Weight Loss') {
        recommendation = `📉 METABOLIC CALIBRATION MATRIX APPROVED. High-fiber indices confirmed. Consuming this meal requires +22g of clean, lean protein substrates in your next training block to defend skeletal muscle fibers from caloric deficit exhaustion. Ingest +500ml of hydration to optimize metabolic transport and satisfy your strict daily NHS fiber guidelines.`;
      } else if (profile.target === 'Weight Gain') {
        recommendation = `📈 HYPER-TROPHIC ANABOLIC CALIBRATION APPROVED. Mass accumulation threshold logged. Carbohydrate metrics cleared. Recommending an immediate secondary baseline boost of +35g carbohydrates and +15g amino acid substrates to satisfy continuous metabolic tissue restoration. Ensure continuous hydration syncing.`;
      } else if (profile.target === 'Cardio Endurance') {
        recommendation = `⚡ CARDIOVASCULAR OXIDATION CALIBRATION APPROVED. Glycogen reserves successfully replenished. Estimated metabolic oxidation coefficient verified at optimal efficiency. Ensure a high-density hydration protocol of +750ml containing essential mineral matrices to support cardiovascular pulse load and low autonomic stress during high-workload locomotion.`;
      } else { // Autonomic Recovery
        recommendation = `🌱 AUTONOMIC RESTORATION MATRIX APPROVED. Low glycemic response confirmed. To help schedule active stress thresholds and keep resting cardiovascular heart rate low, supplement this formulation with +12g of essential healthy lipids and drink +450ml of alkaline hydration to speed vagal tone restoration.`;
      }
      setMotivationMessage(`✅ Scan approved! +${fiber}g dietary fiber logged toward your NHS Goal!`);
      setTimeout(() => setMotivationMessage(null), 5000);

      setScanResult({
        foodName: activeInput,
        calories,
        macros: { carbs, protein, fat, fiber },
        micros: { sodium: '110mg', potassium: '380mg', iron: '2.8mg', calcium: '55mg' },
        allergensFlagged: [],
        complianceStatus: 'CLEARED',
        dietaryRecommendation: recommendation
      });
    }
  };

  const triggerCameraScan = (item: string) => {
    setIsCameraScanning(true);
    setTimeout(() => {
      setIsCameraScanning(false);
      setShowCameraModal(false);
      setMealInput(item);
      handleMealScan(item);
    }, 1800);
  };

  const handleInitiateDeviceConnection = (device: string) => {
    setSyncingDeviceType(device);
    setTimeout(() => {
      saveProfileToStorage({ ...profile, smartDeviceConnected: device });
      setSyncingDeviceType(null);
      setShowDeviceSyncModal(false);
      setMotivationMessage(`🔋 Live telemetry feed established with your ${device}! Continuous streams now updating.`);
      setTimeout(() => setMotivationMessage(null), 5000);
    }, 2000);
  };

  const applyPromoCode = () => {
    const code = promoCodeInput.trim().toUpperCase();

    if (code === 'KINETIX-CORP-LIFETIME' || code === 'KINETIX-PROMO-100') {
      setRevenueCatStatus('Active (Lifetime Corporate License Verified)');
      setPromoMessage('💚 Premium Lifetime Corporate License Activated successfully!');
    } else if (code === 'KINETIX-VIP-B2B') {
      setRevenueCatStatus('Active (VIP Enterprise Pass - 30 Days)');
      setPromoMessage('💎 VIP Enterprise Pass Activated successfully!');
    } else {
      setPromoMessage('❌ Invalid Promo or Coupon Code. Please verify with KinetixFit Systems Administrator.');
    }
  };

  const triggerRewardVaultSettlement = () => {
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

    const newTx: VoucherLog = {
      id: `TX-UK-${Math.floor(1000 + Math.random() * 9000)}`,
      provider: 'Premium High-Street Beverage Token',
      value: '£5.00',
      sku: 'KTX-NERO-UK',
      state: 'Settled',
      timestamp: 'Just Now'
    };

    const pointDeduction = visaDemoMode ? 0 : 2500;
    const newPts = totalVoucherPoints - pointDeduction;
    setVouchers([newTx, ...vouchers]);
    setTotalVoucherPoints(newPts);
    localStorage.setItem('kinetix_voucher_points', newPts.toString());
    setLastLastRedemptionTime(Date.now());
    setMotivationMessage("☕ £5.00 Premium High-Street Beverage Voucher settled successfully!");
    setTimeout(() => setMotivationMessage(null), 6000);
    alert("☕ Kinetix Rewards Vault: £5.00 Premium Voucher settled, signed, and deposited cleanly into your wallet.");
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
  const selectedMetric = biometrics.find(b => b.id === selectedMetricId) || biometrics[1];

  // --- RENDERING ROUTER ---

  // A. MARKETING FRONT HOME LANDING PAGE
  if (!isLoggedIn && onboardingStep === 0) {
    return (
      <div className="workspace-container">
        <div className="mobile-phone-frame">
          {/* Status bar notch */}
          <div className="phone-notch-header">
            <span>12:00</span>
            <div className="phone-notch"></div>
            <span>LTE 🔋</span>
          </div>

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
        <div className="mobile-phone-frame">
          <div className="phone-notch-header">
            <span>12:00</span>
            <div className="phone-notch"></div>
            <span>LTE 🔋</span>
          </div>

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
        <div className="mobile-phone-frame">
          <div className="phone-notch-header">
            <span>12:00</span>
            <div className="phone-notch"></div>
            <span>LTE 🔋</span>
          </div>

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
                <label style={{ fontSize: '10.5px', color: '#9ca3af' }}>Primary Fitness Target
                  <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as any})} className="auth-input-select">
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
        <div className="mobile-phone-frame">
          <div className="phone-notch-header">
            <span>12:00</span>
            <div className="phone-notch"></div>
            <span>LTE 🔋</span>
          </div>

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
        <div className="mobile-phone-frame">
          <div className="phone-notch-header">
            <span>12:00</span>
            <div className="phone-notch"></div>
            <span>LTE 🔋</span>
          </div>

          <div style={{ backgroundColor: '#030712', color: '#ffffff', flex: 1, fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ width: '100%', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '9px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 3 OF 3: TELEMETRY INTEGRATION</span>
              <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px', color: '#fff' }}>Connect Biometric Sensor</h2>
              <p style={{ fontSize: '10.5px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '15px', margin: '0 0 15px 0' }}>
                Synchronize your continuous physical sensors (pulse fluctuations, sleep recovery waves, stress baselines) with our secure clearinghouse.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                {['Continuous Wrist Sensor', 'Biometric Ring Stream', 'Heart Strap Sync', 'Rest Sleep Sensor'].map(device => (
                  <button
                    key={device}
                    onClick={() => handleInitiateDeviceConnection(device)}
                    disabled={syncingDeviceType !== null}
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
                    <span>⚡ {device}</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
                      {syncingDeviceType === device ? 'Syncing...' : 'Link Sensor'}
                    </span>
                  </button>
                ))}
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
      <div className="mobile-phone-frame">
        {/* Status bar notch */}
        <div className="phone-notch-header">
          <span>12:00</span>
          <div className="phone-notch"></div>
          <span>LTE 🔋</span>
        </div>

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
                <h3 className="section-header">6-Core Health Telemetry Sync</h3>
                <div className="core-biometrics-grid">
                  {biometrics.map(bio => {
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
                      <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as any})} className="drawer-select">
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
                  <button onClick={() => handleMealScan()} className="scanner-submit-btn">
                    Scan
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

          {/* ==================== TAB 3: QUESTS & REWARDS (WHITE-LABEL LEDGERS) ==================== */}
          {activeTab === 'rewards' && (
            <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Gamification point balances */}
              <div className="rewards-summary-card">
                <span className="vitals-label">SECURE POINTS LEDGER • LEVEL {level} ({xp} XP)</span>
                <h3 className="rewards-wallet-balance">{totalVoucherPoints} Points</h3>
                <p style={{ fontSize: '10.5px', color: '#9ca3af', lineHeight: '1.4', margin: '5px 0 12px 0' }}>
                  Exchange your verified biomechanical efforts for premium vouchers or donate points to sponsor registered UK Charities funded under our CSR match partnerships.
                </p>

                {/* 🛡️ Secure Presentation Override Toggle */}
                <div style={{ borderTop: '1px dashed #1f2937', paddingTop: '10px' }}>
                  <label className="demo-toggle-label">
                    <input
                      type="checkbox"
                      checked={visaDemoMode}
                      onChange={(e) => {
                        setVisaDemoMode(e.target.checked);
                        setMotivationMessage(e.target.checked ? '🚀 Pitch Mode Active! Point limits and quest requirements bypassed.' : '🔒 Standard verification gates restored.');
                        setTimeout(() => setMotivationMessage(null), 5000);
                      }}
                      className="demo-toggle-checkbox"
                    />
                    ⚡ Enable Demo Pitch Mode (Bypass verification limits)
                  </label>
                </div>
              </div>

              {/* Physical locomotion validator accelerometer anti-cheat */}
              <div className="biopoint-validator-card">
                <span className="validator-label">⚡ BIOMECHANICAL HARDWARE DETECTOR</span>
                <p className="validator-desc">
                  Accumulate points from daily movement verification to instantly redeem high-street beverage cards, media vouchers, or apparel rewards cleanly settled directly into your secure wallet.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleSimulateSteps(120)} className="cadence-btn-normal">
                    🏃 Active Run (120 SPM)
                  </button>
                  <button onClick={() => handleSimulateSteps(420)} className="cadence-btn-alert">
                    🚨 Fraud Shake (420 SPM)
                  </button>
                </div>
              </div>

              {/* Today's Quests list */}
              <div className="quests-card">
                <div className="quests-header">
                  <h3 className="quests-title">🔥 Daily Active Quests</h3>
                  <span style={{ fontSize: '10px', color: '#9ca3af' }}>{tasksCompletedTodayCount} Completed</span>
                </div>
                <div className="quests-list-stack">
                  {todayTasks.map(t => (
                    <div
                      key={t.id}
                      onClick={() => toggleTask(t.id)}
                      className={`quest-item-pill ${t.completed ? 'quest-item-completed' : ''}`}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span>{t.completed ? '🟢' : '⚫'}</span>
                        <span style={{ textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? '#00ff88' : '#ffffff' }}>{t.text}</span>
                      </div>
                      <strong style={{ color: t.completed ? '#00ff88' : '#9ca3af' }}>+{t.pointsValue} pts</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Branded Reward Settlements Vault (No Tango Leak) */}
              <div className="rewards-redemption-card">
                <div className="rewards-redemption-header">
                  <h3 className="redemption-title">Kinetix Rewards Vault</h3>
                  <button onClick={triggerRewardVaultSettlement} className="redeem-rewards-btn">
                    🎟️ Claim £5.00 Voucher {visaDemoMode ? '(0 Pts)' : '(2,500 Pts)'}
                  </button>
                </div>
                <p className="redemption-description">
                  Premium voucher settlement. Accrued quest coordinates convert instantly to active retail merchant allocations. Redemptions require at least 2 active quests completed.
                </p>

                {/* Ledger logs */}
                <div className="ledger-table-container">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>TXID</th>
                        <th>REWARD TYPE</th>
                        <th>VALUE</th>
                        <th>SECURE SKU</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vouchers.map(v => (
                        <tr key={v.id}>
                          <td style={{ color: '#00bfff' }}>{v.id}</td>
                          <td>{v.provider}</td>
                          <td style={{ color: '#00ff88', fontWeight: 'bold' }}>{v.value}</td>
                          <td style={{ color: '#6b7280' }}>{v.sku}</td>
                          <td>
                            <span className={`ledger-status-pill status-${v.state.toLowerCase()}`}>
                              {v.state.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CSR matching matching donations */}
              <div className="charity-matching-card">
                <div className="charity-card-header">
                  <div>
                    <h3 className="charity-title">🎗️ UK Social Philanthropy Portal</h3>
                    <span className="charity-subtitle">Converts completed achievements directly into Match CSR donations.</span>
                  </div>
                  <span className="donations-count-pill">Issued: {charityDonations}</span>
                </div>

                <div className="charity-options-grid">
                  {ukCharities.map(charity => (
                    <div key={charity.id} className="charity-item-subcard">
                      <div>
                        <span className="charity-item-tag">{charity.desc}</span>
                        <h4 className="charity-item-name">{charity.name}</h4>
                        <p className="charity-item-mission">{charity.mission}</p>
                      </div>
                      <button onClick={() => handleDonateToCharity(charity.name)} className="donate-points-btn">
                        🎗️ Donate 1,000 Pts (£2.50)
                      </button>
                    </div>
                  ))}
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
                    <button onClick={applyPromoCode} className="promo-submit-btn">Activate</button>
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
            setActiveTab('nourish');
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
            { id: 'vitals', label: 'Today', icon: '📊' },
            { id: 'nourish', label: 'Nourish', icon: '🥗' },
            { id: 'rewards', label: 'Rewards', icon: '🏆' },
            { id: 'hub', label: 'Hub', icon: '🏢' },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                }}
                className={`nav-item-btn ${active ? 'nav-item-active' : ''}`}
              >
                <span className="nav-icon">{tab.icon}</span>
                <span className="nav-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>

      </div>

      {/* --- SMART SENSOR SYNC MODAL --- */}
      {showDeviceSyncModal && (
        <div className="portal-overlay-modal">
          <div className="modal-content-card">
            <h3 className="modal-title">🔋 Smart Wearable Link</h3>
            <p className="modal-desc">
              Synchronize raw continuous telemetry datasets cleanly with our active clearinghouse pipelines.
            </p>
            <div className="modal-options-stack">
              {['Cardiovascular Sensor Sync', 'Circadian Ring Sensor Sync', 'Skeletal Locomotion Sync', 'Autonomic Band Sync'].map(dev => (
                <button
                  key={dev}
                  onClick={() => handleInitiateDeviceConnection(dev)}
                  disabled={syncingDeviceType !== null}
                  className="modal-sync-option-btn"
                >
                  <span>⚡ {dev}</span>
                  <span style={{ color: '#00ff88' }}>{syncingDeviceType === dev ? 'Connecting...' : 'Link Sensor'}</span>
                </button>
              ))}
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
              <div className="camera-viewfinder-scanning">
                <div className="laser-beam"></div>
                <span className="scanner-timer">⌛</span>
                <span className="scanner-status-text">INTERROGATING INGREDIENTS DICTIONARY...</span>
                <span className="scanner-subtext">Verifying allergens against UK FSA/NHS guidelines</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p className="modal-desc">
                  Select a product formulation below to simulate an instant high-speed camera barcode snap and molecular allergen interrogation.
                </p>

                <div className="modal-options-stack">
                  <button onClick={() => triggerCameraScan('Organic Tomato Pasta')} className="camera-mock-choice-btn hover-green">
                    <span>🛒 Scan: Organic Tomato Pasta</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>CLEARED</span>
                  </button>

                  <button onClick={() => triggerCameraScan('Protein Nut Bar')} className="camera-mock-choice-btn hover-red">
                    <span>🛒 Scan: Protein Nut Bar</span>
                    <span style={{ color: '#ff3b30', fontWeight: 'bold' }}>HAZARD FLAGGED</span>
                  </button>

                  <button onClick={() => triggerCameraScan('Sweet Potato Bhaji Formulation')} className="camera-mock-choice-btn hover-green">
                    <span>🛒 Scan: Sweet Potato Bhaji</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>CLEARED</span>
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
          min-height: 100vh !important;
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
        .mobile-phone-frame {
          width: 100vw !important;
          max-width: 1440px !important;
          height: 100vh !important;
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

        /* Status bar notch - hidden on full-screen desktop dashboard */
        .phone-notch-header {
          display: none !important;
        }
        .phone-notch {
          width: 110px !important;
          height: 18px !important;
          background-color: #1f2937 !important;
          border-radius: 0 0 12px 12px !important;
        }

        /* Scrollable body of app - restructured as a gorgeous dashboard grid on desktop */
        .app-scroll-body {
          flex: 1 !important;
          overflow-y: auto !important;
          padding: 25px 30px 100px 30px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 25px !important;
          box-sizing: border-box !important;
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
          bottom: 25px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 90% !important;
          max-width: 500px !important;
          height: 65px !important;
          background-color: rgba(11, 15, 25, 0.85) !important;
          backdrop-filter: blur(15px) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
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
          .app-scroll-body {
            padding: 15px 15px 100px 15px !important;
          }
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
