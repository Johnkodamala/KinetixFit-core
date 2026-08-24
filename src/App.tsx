import React, { useState, useEffect } from 'react';

// ============================================================================
// KINETIXFIT ENTERPRISE CUSTOMER PORTAL - ULTRA-PREMIUM CORE ENGINE V5 (MOBILE-FIRST TABS)
// Legally Operated by JN Global Ventures Ltd (Company No: 17368212)
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
}

interface UserProfile {
  name: string;
  email: string;
  height: number; // in cm
  weight: number; // in kg
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

  const [onboardingStep, setOnboardingStep] = useState<number>(0); // 0: Login, 1: Profile Setup, 2: Allergen Selection, 3: Device Sync, 4: Active Portal
  const [emailInput, setEmailInput] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);

  // --- 2. ACTIVE NAVIGATION TAB ---
  // "vitals" (Today), "nourish" (Natasha's Law Scanner), "rewards" (Quests & Tango Card), "hub" (Corporate Hub & Pass Allocations)
  const [activeTab, setActiveTab] = useState<string>('vitals');

  // --- 3. USER PROFILE DATA STATE (With LocalStorage Persistence) ---
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

  // --- 4. DYNAMIC MOTIVATION POPUPS & REVENUE DEFENSE CONTROLS ---
  const [motivationMessage, setMotivationMessage] = useState<string | null>('KinetixFit Multi-Device Synced Core Running Perfectly.');

  const [lastRedemptionTime, setLastLastRedemptionTime] = useState<number>(0);
  const [requiredTaskCountForRedeem] = useState<number>(2); // Multi-step validation defense
  const [tasksCompletedTodayCount, setTasksCompletedTodayCount] = useState<number>(0);

  // --- 🛠️ VISA PRESENTATION MODE (DEMO MODE SWITCH) ---
  // Overrides all point requirements, daily quests, and limits, setting voucher costs to 0 Points!
  const [visaDemoMode, setVisaDemoMode] = useState<boolean>(false);

  // --- 5. REAL-TIME LIVE PULSE WAVE OSCILLATION MODULE ---
  const [liveBpm, setLiveBpm] = useState<number>(72);
  const [liveHrv, setLiveHrv] = useState<number>(68);
  const [pulseHistory, setPulseHistory] = useState<number[]>([72, 74, 71, 70, 75, 78, 73, 71, 72, 75, 79, 73, 70, 72, 74, 71]);

  useEffect(() => {
    if (!isLoggedIn || onboardingStep < 4) return;
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

  // --- 6. ADVANCED 6-CORE TELEMETRY ARRAY ---
  const [biometrics, setBiometrics] = useState<TelemetryStream[]>([
    { id: 'BIO-1', metric: 'Activity and Movement', system: 'Kinetic Step Velocity Layer', reading: '110 SPM', status: 'Optimal', behavior: 'Verified Biomechanical Load' },
    { id: 'BIO-2', metric: 'Heart Health', system: 'Precision Cardiovascular Array', reading: '72 BPM / 68 ms HRV', status: 'Optimal', behavior: 'High Vagal Tone Detected' },
    { id: 'BIO-3', metric: 'Metabolic Health', system: 'Metabolic Velocity Index', reading: '1.2 Metabolic Coeff', status: 'Syncing', behavior: 'Substrate Oxidation Balanced' },
    { id: 'BIO-4', metric: 'Sleep and Rest', system: 'Contextual Sleep Telemetry', reading: '84% Quality', status: 'Optimal', behavior: 'Deep/REM Stages Synchronized' },
    { id: 'BIO-5', metric: 'Stress', system: 'Autonomic Load Tracker', reading: 'Low Autonomic Stress', status: 'Optimal', behavior: 'Neurological Exhaustion Ceilings Safe' },
    { id: 'BIO-6', metric: 'Women\'s Health', system: 'Dynamic Biological Rhythm Sync', reading: 'Phase 2 Follicular', status: 'Calibrating', behavior: 'Basal Trend Optimization Active' },
  ]);

  // Synchronize heart biometrics with the live ticker values
  useEffect(() => {
    setBiometrics(prev => prev.map(item => {
      if (item.id === 'BIO-2') {
        return {
          ...item,
          reading: `${liveBpm} BPM / ${liveHrv} ms HRV`,
          status: liveBpm > 100 ? 'Critical' : 'Optimal',
          behavior: liveBpm > 100 ? 'Elevated Cardiac Response' : 'High Vagal Tone Detected'
        };
      }
      return item;
    }));
  }, [liveBpm, liveHrv]);

  // --- 7. GAMIFICATION ENGINE (With Custom Points & Quotas) ---
  const [xp, setXp] = useState<number>(() => parseInt(localStorage.getItem('kinetix_xp') || '420'));
  const [level] = useState<number>(() => parseInt(localStorage.getItem('kinetix_level') || '3'));
  const [totalVoucherPoints, setTotalVoucherPoints] = useState<number>(() => parseInt(localStorage.getItem('kinetix_voucher_points') || '1250'));

  // Yesterday's completed tasks (locked archives for validation)
  const [yesterdayTasks] = useState<Task[]>([
    { id: 'YES-1', text: 'Achieve 30 minutes of continuous Zone 2 locomotion', completed: true, xpValue: 100, pointsValue: 150 },
    { id: 'YES-2', text: 'Ingest 30g of dietary fiber (UK NHS Guideline)', completed: true, xpValue: 120, pointsValue: 180 },
    { id: 'YES-3', text: 'Complete a 1-Tap Natasha\'s Law label scan', completed: false, xpValue: 80, pointsValue: 120 }
  ]);

  // Today's dynamic, motivating daily tasks based on target goal
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
          setMotivationMessage(`🔥 Awesome! Completed "${t.text}" and earned +${t.pointsValue} Points!`);
          setTimeout(() => setMotivationMessage(null), 5000);
        } else {
          setTasksCompletedTodayCount(prev => Math.max(0, prev - 1));
        }

        return { ...t, completed: nextCompleted };
      }
      return t;
    }));
  };

  // Adjust today's tasks dynamically when profile target shifts
  useEffect(() => {
    let specificTasks: Task[] = [];
    if (profile.target === 'Weight Loss') {
      specificTasks = [
        { id: 'TOD-1', text: 'Enforce 400 kcal caloric deficit target', completed: false, xpValue: 150, pointsValue: 220 },
        { id: 'TOD-2', text: 'Log high-fiber lunch target (>10g fiber in single meal)', completed: false, xpValue: 100, pointsValue: 150 },
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
    } else { // Autonomic Recovery
      specificTasks = [
        { id: 'TOD-1', text: 'Engage 15-minute high vagal tone breathing series', completed: false, xpValue: 150, pointsValue: 220 },
        { id: 'TOD-2', text: 'Verify deep sleep stages in the telemetry console', completed: false, xpValue: 100, pointsValue: 150 },
        { id: 'TOD-3', text: 'Ensure low autonomic neurological stress load', completed: false, xpValue: 120, pointsValue: 180 }
      ];
    }
    setTodayTasks(specificTasks);
  }, [profile.target]);

  // --- 8. LIVE Energy Balance & NHS Dietary Metrics ---
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

  // --- 9. 1-TAP NATASHA'S LAW AI SCREENNER & MACRO MATRIX ---
  const [mealInput, setMealInput] = useState<string>('');
  const [scanResult, setScanResult] = useState<MealScanResult | null>(null);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);

  const the14Allergens = [
    'peanuts', 'nuts', 'milk', 'eggs', 'fish', 'crustaceans', 'molluscs',
    'soya', 'wheat', 'celery', 'mustard', 'sesame', 'sulphur dioxide', 'lupin'
  ];

  // --- 10. TANGO CARD REWARDS & FINANCIAL CONTROLS ---
  const [vouchers, setVouchers] = useState<VoucherLog[]>([
    { id: 'TX-UK-9921', provider: 'Costa Coffee Clearing', value: '£15.00', sku: 'TANGO-COSTA-UK', state: 'Settled', timestamp: 'Today, 08:30' }
  ]);

  // --- 🎗️ UK COMMUNITY NATURE & CHARITY DONATIONS REGISTRY ---
  const [charityDonations, setCharityDonations] = useState<number>(() => parseInt(localStorage.getItem('kinetix_charity_donations') || '0'));

  const ukCharities = [
    { id: 'CHAR-NHS', name: 'NHS Charities Together', mission: 'Supporting frontline NHS staff, clinical equipment, and patient recovery schemes.', desc: 'Strengthen local health ecosystems.' },
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
    setMotivationMessage(`🎗️ SOCIAL IMPACT LOGGED: 1,000 points converted to a £2.50 donation for ${charityName}! Funded programmatically via your employer's CSR scheme.`);
    setTimeout(() => setMotivationMessage(null), 7000);
    alert(`🎗️ KinetixFit Social Value Handshake Complete! Your donation to ${charityName} has been recorded and corporate matching funds cleared.`);
  };

  // --- 11. REVENUECAT SUBSCRIPTIONS & ADMIN MANAGED PROMOS ---
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [promoMessage, setPromoMessage] = useState<string>('');
  const [revenueCatStatus, setRevenueCatStatus] = useState<string>('7-Day Free Trial Active');



  // --- 12. CONTACT FORM STATE ---
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
    setMotivationMessage(`📩 Security token sent to ${emailInput}. Please verify!`);
    setTimeout(() => setMotivationMessage(null), 5000);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpInput === '7721' || otpInput === '1234') { // Pre-approved mock OTPs
      saveProfileToStorage({
        ...profile,
        email: emailInput,
        name: emailInput.split('@')[0].toUpperCase()
      });
      setOnboardingStep(1); // Advance to Profile Setup onboarding step
    } else {
      alert("Invalid verification code. Please try using '1234' for developer sandbox entry.");
    }
  };

  // Complete onboarding wizard
  const handleCompleteOnboarding = () => {
    setIsLogged(true);
    localStorage.setItem('kinetix_logged_in', 'true');
    setOnboardingStep(4); // Advance to live workspace portal
    setMotivationMessage('🏆 Access Handshake Operational. Welcome to KinetixFit!');
    setTimeout(() => setMotivationMessage(null), 7000);
  };

  // Personal allergen manager
  const handleTogglePersonalAllergen = (allergen: string) => {
    const updated = profile.personalAllergens.includes(allergen)
      ? profile.personalAllergens.filter(a => a !== allergen)
      : [...profile.personalAllergens, allergen];
    saveProfileToStorage({ ...profile, personalAllergens: updated });
  };

  // Accelerometer verification framework
  const handleSimulateSteps = (cadence: number) => {
    if (cadence > 350) {
      setMotivationMessage("🚨 FRAUD WARNING: Locomotive device oscillation frequency is physically impossible (>350 SPM). Activity dropped. Financial ledger frozen.");
      alert("⚠️ ANTI-CHEAT INTERCEPT: Device oscillation frequency exceeds human locomotion velocity threshold (350 SPM). Payload dropped. Financial transaction blocked. Admin cheat logs updated.");
      setTimeout(() => setMotivationMessage(null), 7000);
      return;
    }
    const updated = [...biometrics];
    updated[0].reading = `${cadence} SPM`;
    setBiometrics(updated);
    setCaloriesBurned(prev => prev + Math.round(cadence * 0.4));
    
    // Low financial-risk reward payout rate
    const pointsEarned = Math.round(cadence * 0.1);
    setTotalVoucherPoints(prev => {
      const nextPts = prev + pointsEarned;
      localStorage.setItem('kinetix_voucher_points', nextPts.toString());
      return nextPts;
    });

    setMotivationMessage(`🏃 Locomotion verified! Standard biomechanical step cadence synced at ${cadence} SPM. Earned +${pointsEarned} Points.`);
    setTimeout(() => setMotivationMessage(null), 5000);
  };

  // 1-Tap Ingestion Scan with dynamic personal allergen checks (With Tesco, Greggs, Sainsbury's lookup dictionary)
  const handleMealScan = (inputStr?: string) => {
    const activeInput = inputStr || mealInput;
    const userInput = activeInput.toLowerCase().trim();
    if (!userInput) return;

    // Filter allergens based on user's exact personal allergen list AND UK's 14 major allergens
    const personalChecks = profile.personalAllergens.length > 0 ? profile.personalAllergens : the14Allergens;
    const flagged = personalChecks.filter(allergen => userInput.includes(allergen));
    const isHazard = flagged.length > 0;

    let calories = 380;
    let carbs = 45;
    let protein = 18;
    let fat = 11;
    let fiber = 8;
    let recommendation = '';

    // Specialized UK Supermarket Database checks:
    if (userInput.includes('tesco tomato pasta')) {
      calories = 380;
      carbs = 65;
      protein = 12;
      fat = 8;
      fiber = 2; // Under daily fiber push
    } else if (userInput.includes('greggs sweet potato bhaji')) {
      calories = 420;
      carbs = 58;
      protein = 8;
      fat = 12;
      fiber = 9; // Rich high-fiber push towards strict 30g NHS target
    } else if (userInput.includes('sainsbury nut bar') || userInput.includes('sainsburys nut bar')) {
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

    if (isHazard || userInput.includes('sainsbury nut bar') || userInput.includes('sainsburys nut bar')) {
      const hazardAllergens = userInput.includes('nut') ? ['peanuts', 'nuts'] : flagged;
      recommendation = `❌ DIETARY EXCLUSION TRIGGERED: Your personal food hazard list flagged (${hazardAllergens.join(', ')}) in this meal. Target meal rejected. Recommending organic, clean plant-protein alternative (Quinoa, chia, and raw greens) containing 12g fiber to satisfy your ${profile.target} target.`;
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

      if (profile.target === 'Weight Loss') {
        recommendation = `📉 WEIGHT LOSS CALIBRATION: Macros approved. Lean portions optimized, shifting carbohydrate indices down and increasing clean protein substrates. Your daily fiber count is boosted by ${fiber}g towards the 30g NHS limit.`;
      } else if (profile.target === 'Weight Gain') {
        recommendation = `📈 MASS OPTIMIZATION: High carbohydrate load cleared. Recommended metabolic substrate oxidation booster with rice beds and healthy lipids. Highly bioavailable micronutrient array.`;
      } else {
        recommendation = `🌱 AUTONOMIC RESTORATION: Ingestion parameters cleared. High nutrient-density profiles approved with adequate omega-3 lipid support to optimize neurological autonomic recovery.`;
      }
      setMotivationMessage(`✅ Scan file approved! +${fiber}g dietary fiber logged toward your NHS Goal!`);
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

  // Simulated Camera Capture Trigger
  const triggerCameraScan = (item: string) => {
    setIsCameraScanning(true);
    setTimeout(() => {
      setIsCameraScanning(false);
      setShowCameraModal(false);
      setMealInput(item);
      handleMealScan(item);
    }, 1800);
  };

  // Smart Device handshake
  const handleInitiateDeviceConnection = (device: string) => {
    setSyncingDeviceType(device);
    setTimeout(() => {
      saveProfileToStorage({ ...profile, smartDeviceConnected: device });
      setSyncingDeviceType(null);
      setShowDeviceSyncModal(false);
      setMotivationMessage(`🔋 Live sync verified with your ${device}! Core biometrics now updating.`);
      setTimeout(() => setMotivationMessage(null), 5000);
    }, 2000);
  };

  // Revenue Cat verification code logic
  const applyPromoCode = () => {
    const code = promoCodeInput.trim().toUpperCase();
    
    if (code === 'KINETIX-CORP-LIFETIME' || code === 'KINETIX-PROMO-100') {
      setRevenueCatStatus('Active (Lifetime Corporate License Verified)');
      setPromoMessage('💚 Premium Lifetime Corporate License Activated successfully!');
    } else if (code === 'KINETIX-VIP-B2B') {
      setRevenueCatStatus('Active (VIP Enterprise Pass - 30 Days)');
      setPromoMessage('💎 VIP Enterprise Pass Activated successfully!');
    } else {
      setPromoMessage('❌ Invalid Promo or Coupon Code. Please verify with JN Global Ventures admin.');
    }
  };

  // Tango Card rewards - strictly bounded to protect corporate balance assets
  const triggerTangoReward = () => {
    // Demo bypass validation
    if (!visaDemoMode) {
      // 1. Task Completion Validation Gate (Must finish at least 2 target tasks first)
      if (tasksCompletedTodayCount < requiredTaskCountForRedeem) {
        alert(`⚠️ FINANCIAL SECURITY LOCK: You have only completed ${tasksCompletedTodayCount}/${requiredTaskCountForRedeem} today's target tasks. B2B rewards require real athletic effort to satisfy corporate tax write-off mandates.`);
        setMotivationMessage("🔒 B2B SECURITY: Complete at least 2 active quests today to authorize point redemption!");
        setTimeout(() => setMotivationMessage(null), 6000);
        return;
      }

      // 2. High redemption floor validation
      if (totalVoucherPoints < 2500) {
        alert("⚠️ INSUFFICIENT BALANCE: The wholesale rewards voucher tier floor is 2,500 points. Keep crushin' your goals to cash out!");
        return;
      }

      // 3. Cool-down validation
      const currentTime = Date.now();
      if (currentTime - lastRedemptionTime < 86400000) { // 24 hours cool-down gate
        alert("🔒 COOL-DOWN SECURITY LIMIT: In line with UK FSA guidelines, you are limited to 1 wholesale reward settlement per 24 hours to protect corporate capital assets.");
        return;
      }
    }

    const newTx: VoucherLog = {
      id: `TX-UK-${Math.floor(1000 + Math.random() * 9000)}`,
      provider: 'Caffè Nero Reward Clearing',
      value: '£5.00',
      sku: 'TANGO-NERO-UK',
      state: 'Settled',
      timestamp: 'Just Now'
    };

    const pointDeduction = visaDemoMode ? 0 : 2500;
    const newPts = totalVoucherPoints - pointDeduction;
    setVouchers([newTx, ...vouchers]);
    setTotalVoucherPoints(newPts);
    localStorage.setItem('kinetix_voucher_points', newPts.toString());
    setLastLastRedemptionTime(Date.now());
    setMotivationMessage("☕ £5.00 Caffè Nero Reward Voucher settled successfully! Sincere efforts pay off!");
    setTimeout(() => setMotivationMessage(null), 6000);
    alert("☕ Tango Card Wholesale API called successfully! Your £5.00 Caffè Nero Reward Voucher has been programmatically settled and logged.");
  };

  // Send Contact Message simulation
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

  // Welcome message based on time of day
  const getPersonalizedWelcome = () => {
    const hours = new Date().getHours();
    let timeGreeting = "Good Morning";
    if (hours >= 12 && hours < 17) timeGreeting = "Good Afternoon";
    if (hours >= 17) timeGreeting = "Good Evening";

    return (
      <div style={{ marginBottom: '10px' }}>
        <h2 style={{ fontSize: '20px', color: '#00ff88', margin: '0 0 5px 0', fontWeight: 'bold', fontFamily: 'monospace' }}>
          👋 {timeGreeting}, {profile.name || 'Alex Mercer'}!
        </h2>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          Biometric clearing status: {profile.smartDeviceConnected ? `Synced with ${profile.smartDeviceConnected}` : 'Awaiting sensor handshake.'}
        </span>
      </div>
    );
  };

  // --- RENDERING ROUTER ---

  // A. PRE-LOGIN: Secure OTP B2B Email Gateway
  if (!isLoggedIn && onboardingStep === 0) {
    return (
      <div style={{ backgroundColor: '#030712', color: '#ffffff', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '30px', boxShadow: '0 10px 30px rgba(0, 255, 136, 0.05)' }}>
          {/* Centered Glassmorphic Logo container */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '25px' }}>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '180px',
              height: '90px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0, 255, 136, 0.15)',
              padding: '10px',
              boxShadow: '0 8px 32px 0 rgba(0, 255, 136, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
            }}>
              <svg width="100" height="50" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 4px 12px rgba(0, 255, 136, 0.2))' }}>
                <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#00ff88" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          
          <div style={{ textAlign: 'center', marginBottom: '25px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280', letterSpacing: '2px', fontWeight: 'bold' }}>B2B HEALTH TELEMETRY CLEARINGHOUSE</span>
          </div>

          {!isOtpSent ? (
            <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.4' }}>
                Secure corporate login gateway. Enter your company email to request a 4-digit verification token.
              </p>
              <label style={{ fontSize: '11px', color: '#9ca3af' }}>Business Email Address
                <input 
                  type="email" 
                  required 
                  placeholder="name@company.co.uk" 
                  value={emailInput} 
                  onChange={(e) => setEmailInput(e.target.value)} 
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '10px', marginTop: '6px', fontSize: '12px', fontFamily: 'monospace', borderRadius: '4px' }}
                />
              </label>
              <button type="submit" style={{ backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', marginTop: '10px' }}>
                Request Verification Token
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.4' }}>
                Verification token sent to <strong style={{ color: '#00ff88' }}>{emailInput}</strong>. Please enter code <strong style={{ color: '#00ff88' }}>1234</strong> to verify sandbox workspace.
              </p>
              <label style={{ fontSize: '11px', color: '#9ca3af' }}>4-Digit Security Token
                <input 
                  type="text" 
                  maxLength={4} 
                  required 
                  placeholder="e.g. 1234" 
                  value={otpInput} 
                  onChange={(e) => setOtpInput(e.target.value)} 
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '10px', marginTop: '6px', fontSize: '14px', letterSpacing: '5px', textAlign: 'center', fontWeight: 'bold', fontFamily: 'monospace', borderRadius: '4px' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setIsOtpSent(false)} style={{ flex: 1, backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                  Back
                </button>
                <button type="submit" style={{ flex: 2, backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                  Verify Token
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // B. ONBOARDING STEP 1: Biographical profile setup
  if (onboardingStep === 1) {
    return (
      <div style={{ backgroundColor: '#030712', color: '#ffffff', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '30px' }}>
          <span style={{ fontSize: '10px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 1 OF 3: PROFILE DEPLOYMENT</span>
          <h2 style={{ fontSize: '18px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>Setup Physical Telemetry Benchmarks</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Your Display Name
              <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace', borderRadius: '4px' }} />
            </label>
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Height (cm)
              <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace', borderRadius: '4px' }} />
            </label>
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Weight (kg)
              <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace', borderRadius: '4px' }} />
            </label>
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Primary Fitness Target
              <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as any})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace', borderRadius: '4px' }}>
                <option value="Autonomic Recovery">Autonomic Recovery</option>
                <option value="Weight Loss">Weight Loss</option>
                <option value="Weight Gain">Weight Gain</option>
                <option value="Cardio Endurance">Cardio Endurance</option>
              </select>
            </label>
            <button onClick={() => setOnboardingStep(2)} style={{ backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', marginTop: '10px', fontFamily: 'monospace' }}>
              Confirm & Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // C. ONBOARDING STEP 2: Personal Allergy Manager Setup
  if (onboardingStep === 2) {
    return (
      <div style={{ backgroundColor: '#030712', color: '#ffffff', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '450px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '30px' }}>
          <span style={{ fontSize: '10px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 2 OF 3: UK NATASHA'S LAW CONFIGURATION</span>
          <h2 style={{ fontSize: '18px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>Set Personal Allergen Prohibitions</h2>
          <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '15px' }}>
            Select any of the UK's 14 major food allergens you are sensitive to. The 1-Tap AI Scanner will dynamically block and highlight these hazards.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxHeight: '200px', overflowY: 'auto', paddingRight: '10px', marginBottom: '20px' }}>
            {the14Allergens.map(allergen => {
              const active = profile.personalAllergens.includes(allergen);
              return (
                <button
                  key={allergen}
                  onClick={() => handleTogglePersonalAllergen(allergen)}
                  style={{
                    backgroundColor: active ? 'rgba(0, 255, 136, 0.1)' : '#030712',
                    border: `1px solid ${active ? '#00ff88' : '#374151'}`,
                    color: active ? '#00ff88' : '#fff',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
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
            <button onClick={() => setOnboardingStep(1)} style={{ flex: 1, backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
              Back
            </button>
            <button onClick={() => setOnboardingStep(3)} style={{ flex: 2, backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
              Confirm Allergens
            </button>
          </div>
        </div>
      </div>
    );
  }

  // D. ONBOARDING STEP 3: Smart Device Sync Gateway
  if (onboardingStep === 3) {
    return (
      <div style={{ backgroundColor: '#030712', color: '#ffffff', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '30px' }}>
          <span style={{ fontSize: '10px', color: '#00ff88', display: 'block', marginBottom: '5px' }}>STEP 3 OF 3: SMART DEVICE INTEGRATION</span>
          <h2 style={{ fontSize: '18px', margin: '0 0 15px 0', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>Connect Your Smart Device</h2>
          <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '20px' }}>
            Synchronize your continuous telemetry feeds (pulse fluctuation, steps, and HRV metrics) directly with our clearinghouse.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {['Apple Health', 'Oura Cloud Sync', 'Garmin Connect', 'Fitbit Network'].map(device => (
              <button
                key={device}
                onClick={() => handleInitiateDeviceConnection(device)}
                disabled={syncingDeviceType !== null}
                style={{
                  backgroundColor: '#030712',
                  border: '1px solid #1f2937',
                  color: '#fff',
                  padding: '12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: 'monospace'
                }}
              >
                <span>⚡ {device}</span>
                <span style={{ color: '#00ff88' }}>
                  {syncingDeviceType === device ? 'Syncing...' : 'Sync Sensor →'}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setOnboardingStep(2)} style={{ flex: 1, backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
              Back
            </button>
            <button onClick={handleCompleteOnboarding} style={{ flex: 1.5, backgroundColor: profile.smartDeviceConnected ? '#00ff88' : 'rgba(0, 255, 136, 0.4)', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
              Skip & Launch Portal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // E. MAIN PLATFORM PORTAL SCREEN WITH TOP/BOTTOM NAVIGATION SYSTEM
  return (
    <div style={{ backgroundColor: '#030712', color: '#ffffff', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', paddingBottom: '85px' }}>
      
      {/* --- NOTIFICATION & ANNOUNCEMENT TICKER --- */}
      {motivationMessage && (
        <div style={{ backgroundColor: 'rgba(0, 255, 136, 0.1)', borderBottom: '1px solid #00ff88', color: '#00ff88', padding: '10px 20px', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', zIndex: 10 }}>
          {motivationMessage}
        </div>
      )}

      {/* --- ULTRA-PREMIUM CORPORATE HEADER WITH FROSTED CONTAINER LOGO --- */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', padding: '15px 4%', backgroundColor: 'rgba(11, 15, 25, 0.8)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Centered Frosted Glassmorphic Logo Container */}
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
            boxShadow: '0 4px 20px rgba(0, 255, 136, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.05)'
          }}>
            <svg width="80" height="40" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 4px 10px rgba(0, 255, 136, 0.15))' }}>
              <path d="M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z" stroke="#00ff88" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="hidden-xs" style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '9px', color: '#6b7280', letterSpacing: '2px', fontWeight: 'bold' }}>JN GLOBAL VENTURES LTD</span>
            <span style={{ fontSize: '10px', color: '#00ff88', letterSpacing: '0.5px', fontWeight: 'bold' }}>● DOCK HANDSHAKE OPERATIONAL</span>
          </div>
        </div>

        {/* --- PREMIUM DESKTOP HEADER NAVIGATION TABS (INSTAGRAM / APPLE HEALTH STYLE) --- */}
        <div style={{ display: 'flex', gap: '15px' }}>
          {[
            { id: 'vitals', label: '📊 Today', icon: '⚡' },
            { id: 'nourish', label: '🥗 Ingest Scanner', icon: '📷' },
            { id: 'rewards', label: '🏆 Quests & Perks', icon: '💎' },
            { id: 'hub', label: '🏢 Corporate Hub', icon: '🔑' },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  backgroundColor: active ? 'rgba(0, 255, 136, 0.08)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(0, 255, 136, 0.25)' : 'transparent'}`,
                  color: active ? '#00ff88' : '#9ca3af',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* --- MAIN PAGE VIEW PORT (LOADS ACTIVE NAVIGATION TAB SECTION) --- */}
      <main style={{ padding: '25px 4%', flex: 1 }}>

        {/* ==================== TAB 1: TODAY (Vitals & Telemetry) ==================== */}
        {activeTab === 'vitals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Top Welcome Card with Circular Progress Ring Vectors (Oura & Apple Health Style) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '25px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div>
                {getPersonalizedWelcome()}
                <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5', marginTop: '15px' }}>
                  Your live continuous 6-Core biometric stream is synced to your enterprise profile. Secure mechanical anti-cheat velocity barriers are fully initialized across active routes.
                </p>
                <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                  <button 
                    onClick={() => setShowDeviceSyncModal(true)} 
                    style={{ backgroundColor: '#00bfff', color: '#000', fontWeight: 'bold', border: 'none', padding: '8px 16px', borderRadius: '25px', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace' }}
                  >
                    {profile.smartDeviceConnected ? `🔁 Reconnect (${profile.smartDeviceConnected})` : '🔌 Sync Smart Wearable'}
                  </button>
                  <button 
                    onClick={() => setIsEditingProfile(!isEditingProfile)} 
                    style={{ backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '8px 16px', borderRadius: '25px', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace' }}
                  >
                    ✏️ Edit Bio Parameters
                  </button>
                </div>
              </div>

              {/* 3 Active Vector Rings for Goals (Oura / Apple Health style visualization) */}
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderLeft: '1px solid #1f2937', paddingLeft: '20px' }}>
                {/* Ring 1: Activity */}
                <div style={{ textAlign: 'center', position: 'relative' }}>
                  <svg width="65" height="65" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#111827" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00ff88" strokeWidth="3" strokeDasharray="65, 100" strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '9px', fontWeight: 'bold' }}>65%</div>
                  <span style={{ fontSize: '9px', color: '#9ca3af', display: 'block', marginTop: '6px' }}>Steps</span>
                </div>
                {/* Ring 2: Recovery */}
                <div style={{ textAlign: 'center', position: 'relative' }}>
                  <svg width="65" height="65" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#111827" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00bfff" strokeWidth="3" strokeDasharray="84, 100" strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '9px', fontWeight: 'bold' }}>84%</div>
                  <span style={{ fontSize: '9px', color: '#9ca3af', display: 'block', marginTop: '6px' }}>Sleep</span>
                </div>
                {/* Ring 3: Nutrition */}
                <div style={{ textAlign: 'center', position: 'relative' }}>
                  <svg width="65" height="65" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#111827" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#ff9500" strokeWidth="3" strokeDasharray="60, 100" strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '9px', fontWeight: 'bold' }}>18g</div>
                  <span style={{ fontSize: '9px', color: '#9ca3af', display: 'block', marginTop: '6px' }}>Fiber</span>
                </div>
              </div>
            </div>

            {/* Profile Editing form modal inside layout */}
            {isEditingProfile && (
              <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '25px' }}>
                <h3 style={{ fontSize: '14px', color: '#00ff88', textTransform: 'uppercase', marginBottom: '15px' }}>Update Physical Benchmarks</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <label style={{ fontSize: '11px', color: '#9ca3af' }}>Your Display Name
                    <input type="text" value={profile.name} onChange={(e) => saveProfileToStorage({...profile, name: e.target.value})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace' }} />
                  </label>
                  <label style={{ fontSize: '11px', color: '#9ca3af' }}>Height (cm)
                    <input type="number" value={profile.height} onChange={(e) => saveProfileToStorage({...profile, height: parseInt(e.target.value) || 0})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace' }} />
                  </label>
                  <label style={{ fontSize: '11px', color: '#9ca3af' }}>Weight (kg)
                    <input type="number" step="0.1" value={profile.weight} onChange={(e) => saveProfileToStorage({...profile, weight: parseFloat(e.target.value) || 0})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace' }} />
                  </label>
                  <label style={{ fontSize: '11px', color: '#9ca3af' }}>Primary Fitness Target
                    <select value={profile.target} onChange={(e) => saveProfileToStorage({...profile, target: e.target.value as any})} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace' }}>
                      <option value="Autonomic Recovery">Autonomic Recovery</option>
                      <option value="Weight Loss">Weight Loss</option>
                      <option value="Weight Gain">Weight Gain</option>
                      <option value="Cardio Endurance">Cardio Endurance</option>
                    </select>
                  </label>
                </div>
                <button onClick={() => setIsEditingProfile(false)} style={{ backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold', border: 'none', padding: '8px 20px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', marginTop: '15px', fontFamily: 'monospace' }}>Save Changes</button>
              </div>
            )}

            {/* Continuous Pulse ECG Ticker Tectonic Layout */}
            <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>REALTIME LIVE CARDIOVASCULAR OSCILLATION MONITOR</span>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#fff', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    📈 Autonomic Stability Matrix: <span style={{ color: '#00ff88' }}>{liveBpm} BPM</span> / <span style={{ color: '#00bfff' }}>{liveHrv} ms HRV</span>
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', backgroundColor: '#00ff88', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ fontSize: '10px', color: '#00ff88', fontWeight: 'bold' }}>LIVE BROADCASTING</span>
                </div>
              </div>

              {/* Glowing SVG ECG Pulse Wave line animation */}
              <div style={{ width: '100%', height: '100px', backgroundColor: '#030712', borderRadius: '8px', overflow: 'hidden', border: '1px solid #1f2937', position: 'relative' }}>
                <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <path
                    d={`M 0,50 ${pulseHistory.map((v, idx) => {
                      const x = (idx / (pulseHistory.length - 1)) * 1200;
                      // Generate high spikes (R-peaks) to simulate a real heartbeat wave
                      let y = 50;
                      if (idx % 4 === 0) y = 15;
                      else if (idx % 4 === 1) y = 85;
                      else y = 50 - (v - 72) * 1.5;
                      return `L ${x},${y}`;
                    }).join(' ')}`}
                    fill="none"
                    stroke="#00ff88"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,136,0.5))' }}
                  />
                </svg>
              </div>
            </div>

            {/* Oura/HealthKit 6-Core Grid View Layout */}
            <div>
              <h3 style={{ fontSize: '15px', color: '#fff', textTransform: 'uppercase', marginBottom: '15px', borderLeft: '3px solid #00ff88', paddingLeft: '10px' }}>
                Advanced 6-Core Wearable Telemetry Matrix
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {biometrics.map(bio => (
                  <div key={bio.id} style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '18px', transition: 'transform 0.2s', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 'bold' }}>{bio.system}</span>
                      <span style={{ fontSize: '9px', backgroundColor: bio.status === 'Optimal' ? 'rgba(0,255,136,0.1)' : 'rgba(255,149,0,0.1)', color: bio.status === 'Optimal' ? '#00ff88' : '#ff9500', padding: '2px 8px', borderRadius: '20px', fontWeight: 'bold' }}>
                        {bio.status}
                      </span>
                    </div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#9ca3af', fontWeight: 'normal' }}>{bio.metric}</h4>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#00ff88', fontFamily: 'monospace' }}>{bio.reading}</p>
                    <span style={{ fontSize: '10px', color: '#9ca3af', display: 'block', borderTop: '1px solid #111827', paddingTop: '6px', marginTop: '6px' }}>
                      Behavior: {bio.behavior}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ==================== TAB 2: NOURISH (Natasha's Law Food Scanner) ==================== */}
        {activeTab === 'nourish' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Top energy-balancing summary panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '25px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div>
                <h3 style={{ fontSize: '14px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '10px' }}>Calorie Discrepancy Balance</h3>
                <strong style={{ fontSize: '24px', color: caloriesRemaining > 0 ? '#00ff88' : '#ff3b30', display: 'block', margin: '5px 0' }}>
                  {caloriesRemaining > 0 ? `${caloriesRemaining} kcal Remaining` : `${Math.abs(caloriesRemaining)} kcal Over Limit`}
                </strong>
                <span style={{ fontSize: '10px', color: '#6b7280' }}>
                  Calculated against NHS guideline recommendations for your {profile.target} target [nhsTargets].
                </span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px', fontSize: '11px', borderTop: '1px solid #1f2937', paddingTop: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#9ca3af' }}>Daily Ingest Target:</span>
                    <strong>{nhsTargets.calories} kcal</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#00bfff' }}>Logged Ingestion:</span>
                    <strong style={{ color: '#00bfff' }}>{dailyConsumables.calories} kcal</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ff9500' }}>Active Burned:</span>
                    <strong style={{ color: '#ff9500' }}>-{caloriesBurned} kcal</strong>
                  </div>
                </div>
              </div>

              {/* Macro Goal Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center', borderLeft: '1px solid #1f2937', paddingLeft: '25px' }}>
                <h3 style={{ fontSize: '12px', color: '#fff', textTransform: 'uppercase', marginBottom: '5px' }}>NHS Daily Ingest Targets Tracker</h3>
                
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '11px' }}>
                    <span>Dietary Fiber Intake (NHS Target: 30g)</span>
                    <strong style={{ color: dailyConsumables.fiber >= nhsTargets.fiber ? '#00ff88' : '#ff9500' }}>{dailyConsumables.fiber}g / {nhsTargets.fiber}g</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#030712', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (dailyConsumables.fiber / nhsTargets.fiber) * 100)}%`, height: '100%', backgroundColor: dailyConsumables.fiber >= nhsTargets.fiber ? '#00ff88' : '#ff9500' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '11px' }}>
                    <span>Calibrated Protein (1.2g/kg Body weight)</span>
                    <strong style={{ color: '#00bfff' }}>{dailyConsumables.protein}g / {nhsTargets.protein}g</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#030712', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (dailyConsumables.protein / nhsTargets.protein) * 100)}%`, height: '100%', backgroundColor: '#00bfff' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '11px' }}>
                    <span>Carbohydrates Ingestion Indices Ceiling</span>
                    <strong style={{ color: dailyConsumables.carbs > nhsTargets.carbs ? '#ff3b30' : '#ffffff' }}>{dailyConsumables.carbs}g / {nhsTargets.carbs}g</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#030712', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (dailyConsumables.carbs / nhsTargets.carbs) * 100)}%`, height: '100%', backgroundColor: dailyConsumables.carbs > nhsTargets.carbs ? '#ff3b30' : '#00ff88' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Natasha's Law Food Scanner Card */}
            <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <h2 style={{ fontSize: '16px', borderLeft: '3px solid #00ff88', paddingLeft: '10px', textTransform: 'uppercase', marginBottom: '15px' }}>
                1-Tap Natasha's Law Allergen Scanner
              </h2>
              <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '20px' }}>
                Verify formulation ingredients or restaurant menus against your allergen exclusions. Click the Camera (📷) button right next to the text field to activate your live smart-device scanner simulation.
              </p>

              {/* Main Inputs: Text and Camera button */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="Enter ingredients or product name (e.g. Tesco Tomato Pasta)"
                  value={mealInput}
                  onChange={(e) => setMealInput(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: '#030712',
                    border: '1px solid #374151',
                    color: '#fff',
                    padding: '12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    borderRadius: '8px'
                  }}
                />
                
                {/* 📷 Glowing Camera Scan Button */}
                <button
                  onClick={() => setShowCameraModal(true)}
                  style={{
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    border: '1px solid #00ff88',
                    color: '#00ff88',
                    padding: '0 15px',
                    fontSize: '18px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    boxShadow: '0 0 15px rgba(0, 255, 136, 0.15)'
                  }}
                  title="Simulate AI Camera Scan"
                >
                  📷
                </button>

                <button
                  onClick={() => handleMealScan()}
                  style={{
                    backgroundColor: '#00ff88',
                    color: '#000',
                    border: 'none',
                    fontWeight: 'bold',
                    padding: '0 20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontFamily: 'monospace'
                  }}
                >
                  Verify Formulation
                </button>
              </div>

              {/* Scanning results block */}
              {scanResult && (
                <div style={{ backgroundColor: '#030712', border: `1px solid ${scanResult.complianceStatus === 'CLEARED' ? '#00ff88' : '#ff3b30'}`, borderRadius: '8px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>
                      📋 Scan Profile: <span style={{ color: '#00ff88' }}>{scanResult.foodName}</span>
                    </h3>
                    <span style={{
                      fontSize: '11px',
                      backgroundColor: scanResult.complianceStatus === 'CLEARED' ? 'rgba(0,255,136,0.1)' : 'rgba(255,59,48,0.1)',
                      color: scanResult.complianceStatus === 'CLEARED' ? '#00ff88' : '#ff3b30',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontWeight: 'bold'
                    }}>
                      {scanResult.complianceStatus}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '11px', marginBottom: '15px' }}>
                    <div>
                      <strong style={{ color: '#9ca3af', display: 'block', marginBottom: '5px' }}>MACRO NUTRIENTS PROFILE:</strong>
                      <p style={{ margin: '3px 0' }}>• Energy: {scanResult.calories} kcal</p>
                      <p style={{ margin: '3px 0' }}>• Carbs: {scanResult.macros.carbs}g</p>
                      <p style={{ margin: '3px 0' }}>• Protein: {scanResult.macros.protein}g</p>
                      <p style={{ margin: '3px 0' }}>• Fiber: <span style={{ color: '#00ff88', fontWeight: 'bold' }}>+{scanResult.macros.fiber}g</span> logged to NHS limit [23]</p>
                    </div>
                    <div>
                      <strong style={{ color: '#9ca3af', display: 'block', marginBottom: '5px' }}>MICRO NUTRIENTS ESTIMATION:</strong>
                      <p style={{ margin: '3px 0' }}>• Sodium: {scanResult.micros.sodium}</p>
                      <p style={{ margin: '3px 0' }}>• Potassium: {scanResult.micros.potassium}</p>
                      <p style={{ margin: '3px 0' }}>• Iron: {scanResult.micros.iron}</p>
                      <p style={{ margin: '3px 0' }}>• Calcium: {scanResult.micros.calcium}</p>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #111827', paddingTop: '12px' }}>
                    <strong style={{ color: '#9ca3af', display: 'block', marginBottom: '5px', fontSize: '11px' }}>AI CLINICAL DIETARY RECOMMENDATION:</strong>
                    <p style={{ margin: 0, fontSize: '11px', color: scanResult.complianceStatus === 'CLEARED' ? '#9ca3af' : '#ff3b30', lineHeight: '1.4' }}>
                      {scanResult.dietaryRecommendation}
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==================== TAB 3: QUESTS & REWARDS (Gamification & Tango Card Vouchers) ==================== */}
        {activeTab === 'rewards' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Top summary ledger card */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div>
                <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Verified Reward Ledgers • Level {level} ({xp} XP)</span>
                <h3 style={{ fontSize: '20px', color: '#fff', margin: '5px 0 10px 0', fontWeight: 'bold' }}>
                  Wallet Balance: <span style={{ color: '#00ff88' }}>{totalVoucherPoints} Points</span>
                </h3>
                <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block', lineHeight: '1.4' }}>
                  Your completed daily quests are processed using secure device velocity checks. Accrued balance points settle programmatically via the Tango Card API [TX-UK-9921].
                </span>
                
                {/* 🛡️ Secure Visa Presentations Toggle Override */}
                <div style={{ borderTop: '1px dashed #1f2937', marginTop: '15px', paddingTop: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '11px', color: '#ff9500' }}>
                    <input
                      type="checkbox"
                      checked={visaDemoMode}
                      onChange={(e) => setVisaDemoMode(e.target.checked)}
                      style={{ accentColor: '#ff9500', width: '16px', height: '16px' }}
                    />
                    ⚡ Trigger Pitch Demo Override Mode (Bypasses active quests & sets rewards to FREE!)
                  </label>
                </div>
              </div>

              {/* Dynamic Action step simulation (Anti-Cheat cadet controls) */}
              <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  ⚡ Biomechanical Accelerometer Testing Core
                </span>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 15px 0', lineHeight: '1.4' }}>
                  To protect B2B merchant voucher reserves from exploitation, physical step frequencies are monitored. Standard human cadences earn points, while robotic oscillations over 350 SPM trigger secure payload drops.
                </p>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleSimulateSteps(120)}
                    style={{ flex: 1, backgroundColor: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', color: '#00ff88', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }}
                  >
                    🏃 Active Locomotion (120 SPM)
                  </button>
                  <button
                    onClick={() => handleSimulateSteps(420)}
                    style={{ flex: 1, backgroundColor: 'rgba(255, 59, 48, 0.1)', border: '1px solid #ff3b30', color: '#ff3b30', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }}
                  >
                    🚨 Oscillate Cheat Hack (420 SPM)
                  </button>
                </div>
              </div>
            </div>

            {/* Quests and Accomplishments */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '25px' }}>
              
              {/* Yesterday's recap */}
              <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '20px' }}>
                <h3 style={{ fontSize: '13px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                  ⏳ Yesterday's verified review
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {yesterdayTasks.map(t => (
                    <div key={t.id} style={{ fontSize: '11px', display: 'flex', gap: '8px', opacity: t.completed ? 0.7 : 0.35 }}>
                      <span style={{ color: t.completed ? '#00ff88' : '#ff3b30', fontWeight: 'bold' }}>{t.completed ? '✓' : '✗'}</span>
                      <span>{t.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's Active Quests */}
              <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                  <h3 style={{ fontSize: '13px', color: '#00ff88', textTransform: 'uppercase' }}>
                    🔥 Today's Active Quests
                  </h3>
                  <span style={{ fontSize: '10px', color: '#9ca3af' }}>{tasksCompletedTodayCount} Completed today</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {todayTasks.map(t => (
                    <div
                      key={t.id}
                      onClick={() => toggleTask(t.id)}
                      style={{
                        backgroundColor: t.completed ? 'rgba(0, 255, 136, 0.05)' : '#030712',
                        border: `1px solid ${t.completed ? '#00ff88' : '#1f2937'}`,
                        padding: '12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ color: t.completed ? '#00ff88' : '#6b7280', fontSize: '14px' }}>{t.completed ? '🟢' : '⚫'}</span>
                        <span style={{ textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? '#00ff88' : '#fff' }}>{t.text}</span>
                      </div>
                      <span style={{ color: t.completed ? '#00ff88' : '#9ca3af', fontWeight: 'bold' }}>+{t.pointsValue} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tango Card Voucher Redemptions */}
            <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontSize: '15px', borderLeft: '3px solid #00ff88', paddingLeft: '10px', textTransform: 'uppercase' }}>
                  Tango Card Automated Wholesale Voucher Settlement
                </h2>
                <button
                  onClick={triggerTangoReward}
                  style={{
                    backgroundColor: '#00ff88',
                    color: '#000',
                    fontWeight: 'bold',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '25px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}
                >
                  🎟️ Redeem £5.00 Coffee Voucher {visaDemoMode ? '(0 pts)' : '(2,500 pts)'}
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '20px' }}>
                Wholesale retail vouchers are issued programmatically. To satisfy corporate tax-exemption audit guidelines under B2B wellness policies, redemptions are subject to the completion of at least two of today's target quests.
              </p>

              {/* Settlement table log */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1f2937', color: '#9ca3af' }}>
                      <th style={{ padding: '10px' }}>TRANSACTION ID</th>
                      <th style={{ padding: '10px' }}>VOUCHER PROVIDER</th>
                      <th style={{ padding: '10px' }}>FACE VALUE</th>
                      <th style={{ padding: '10px' }}>API SKU</th>
                      <th style={{ padding: '10px' }}>SETTLEMENT STATUS</th>
                      <th style={{ padding: '10px' }}>TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map(v => (
                      <tr key={v.id} style={{ borderBottom: '1px solid #111827', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '12px', fontFamily: 'monospace', color: '#00bfff' }}>{v.id}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{v.provider}</td>
                        <td style={{ padding: '12px', color: '#00ff88', fontWeight: 'bold' }}>{v.value}</td>
                        <td style={{ padding: '12px', color: '#9ca3af' }}>{v.sku}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            backgroundColor: v.state === 'Settled' ? 'rgba(0,255,136,0.1)' : v.state === 'Donated' ? 'rgba(0,191,255,0.1)' : 'rgba(255,149,0,0.1)',
                            color: v.state === 'Settled' ? '#00ff88' : v.state === 'Donated' ? '#00bfff' : '#ff9500',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            fontSize: '9px'
                          }}>
                            {v.state.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: '#6b7280' }}>{v.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Social Value UK Charity Donations Section */}
            <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #1f2937', paddingBottom: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', textTransform: 'uppercase' }}>
                    🎗️ UK Community Social Value Philanthropy Console
                  </h3>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                    Convert 1,000 points directly to a £2.50 corporate-funded charity donation.
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#00ff88', fontWeight: 'bold' }}>📍 Total Donations Issued: {charityDonations}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {ukCharities.map(charity => (
                  <div key={charity.id} style={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: '#00bfff', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>{charity.desc}</span>
                      <h4 style={{ fontSize: '14px', margin: '5px 0', color: '#fff' }}>{charity.name}</h4>
                      <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4', margin: '8px 0' }}>{charity.mission}</p>
                    </div>
                    <button
                      onClick={() => handleDonateToCharity(charity.name)}
                      style={{
                        backgroundColor: 'rgba(0, 191, 255, 0.1)',
                        border: '1px solid #00bfff',
                        color: '#00bfff',
                        fontWeight: 'bold',
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        marginTop: '10px',
                        transition: 'all 0.2s'
                      }}
                    >
                      🎗️ Donate 1,000 pts (£2.50)
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ==================== TAB 4: CORPORATE HUB (Settings, Compliance, passes, Legal, GDPR, Contact Us) ==================== */}
        {activeTab === 'hub' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Top RevenueCat & Passes Allocations panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '25px', backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '16px', padding: '25px' }}>
              <div>
                <h3 style={{ fontSize: '14px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '10px' }}>RevenueCat Transaction Settlement Tier</h3>
                <p style={{ fontSize: '18px', margin: 0, fontWeight: 'bold', color: '#00ff88' }}>
                  Status: {revenueCatStatus} <span style={{ fontSize: '11px', color: '#fff', fontWeight: 'normal' }}>(B2B Verification Sandbox Mode)</span>
                </p>
                <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: '10px' }}>
                  Enterprise pricing is structured as a premium seat license at <strong style={{ color: '#00ff88' }}>£14.99 per active user per month</strong>. An introductory <strong style={{ color: '#00ff88' }}>7-Day Free Trial</strong> is active to allow seamless onboarding testing before transactional card authorizations clear.
                </span>

                {/* Sub-block showing active subscription specs */}
                <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                  <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '15px 20px', borderRadius: '6px', flex: 1 }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>B2B LICENSE ALLOCATION</span>
                    <strong style={{ fontSize: '14px', color: '#00ff88' }}>Unlimited Corporate Seats</strong>
                    <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: '4px' }}>Enterprise tier is configured for unlimited user telemetry tracking.</span>
                  </div>
                  <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '15px 20px', borderRadius: '6px', flex: 1 }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>TRIAL SECURITY PROTOCOLS</span>
                    <strong style={{ fontSize: '14px', color: '#00bfff' }}>Capacitor Native Sandbox</strong>
                    <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: '4px' }}>Strict security boundaries prevent unauthorized ledger accruals.</span>
                  </div>
                </div>
              </div>

              {/* Promo Code Input panel */}
              <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  🔑 Admin Promotions Activation Core
                </span>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 12px 0' }}>
                  Insert authorization coupons or licensing overrides to unlock lifetime passes or promoter benefits.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="PROMO-CODE-HERE"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value)}
                    style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', fontSize: '11px', fontFamily: 'monospace' }}
                  />
                  <button onClick={applyPromoCode} style={{ backgroundColor: '#00bfff', color: '#000', fontWeight: 'bold', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace' }}>Activate</button>
                </div>
                {promoMessage && <p style={{ fontSize: '11px', marginTop: '8px', color: promoMessage.includes('❌') ? '#ff3b30' : '#00ff88' }}>{promoMessage}</p>}
              </div>
            </div>

            {/* Structured Corporate legal pages and privacy policy */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '25px', alignItems: 'start' }}>
              
              {/* About Us & Privacy Policy Legal Sheets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                
                {/* About Us Card */}
                <section style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff', textTransform: 'uppercase', marginBottom: '10px' }}>🏢 About KinetixFit Enterprise</h3>
                  <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5', margin: '0 0 10px 0' }}>
                    KinetixFit is a category-of-one B2B automated health telemetry clearinghouse, designed specifically to help high-growth corporate teams and enterprise clients foster physical health, nutritional safety, and workforce collaboration.
                  </p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5', margin: 0 }}>
                    By integrating live continuous biometrics, FSA food-safety guidelines under Natasha's Law, and automated rewards settlements, we turn employee wellbeing from a static corporate checkbox into a live, competitive workforce asset.
                  </p>
                </section>

                {/* Privacy Policy Card */}
                <section style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ fontSize: '14px', color: '#fff', textTransform: 'uppercase', marginBottom: '10px' }}>🔒 Privacy Policy & Data Protections</h3>
                  <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5', margin: '0 0 10px 0' }}>
                    At KinetixFit, we operate under a strict <strong>Data Privacy Shield</strong>. Telemetry calculations are handled asynchronously and cached strictly in local device storage schemas to preserve user autonomy. No continuous tracking or location surveillance logs are transmitted or sold.
                  </p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5', margin: 0 }}>
                    Legally operated under the strict corporate registration of <strong>JN Global Ventures Ltd (Company Registration Number: 17368212)</strong>. All processing systems are fully compliant with the <strong>UK GDPR</strong> and the <strong>Data Protection Act 2018</strong>.
                  </p>
                </section>
              </div>

              {/* Interactive Contact Us widget */}
              <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', color: '#fff', textTransform: 'uppercase', marginBottom: '15px' }}>✉️ Contact Customer Care</h3>
                
                {contactSuccess ? (
                  <div style={{ backgroundColor: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', color: '#00ff88', padding: '15px', borderRadius: '6px', fontSize: '11px', textAlign: 'center' }}>
                    🚀 Message submitted successfully! Our help desk will respond within 12 hours.
                  </div>
                ) : (
                  <form onSubmit={handleSendContact} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ fontSize: '10px', color: '#9ca3af' }}>Your Full Name
                      <input type="text" required value={contactName} onChange={(e) => setContactName(e.target.value)} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace' }} />
                    </label>
                    <label style={{ fontSize: '10px', color: '#9ca3af' }}>Corporate Email
                      <input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace' }} />
                    </label>
                    <label style={{ fontSize: '10px', color: '#9ca3af' }}>Message / Inquiry
                      <textarea rows={4} required value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', color: '#fff', padding: '8px', marginTop: '4px', fontFamily: 'monospace', resize: 'none' }} />
                    </label>
                    
                    <button type="submit" style={{ backgroundColor: '#00ff88', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', marginTop: '10px' }}>
                      Send Message
                    </button>
                  </form>
                )}

                <div style={{ borderTop: '1px solid #111827', marginTop: '15px', paddingTop: '15px', fontSize: '11px' }}>
                  <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Direct Support:</span>
                  <a href="mailto:info@kinetixfit.co.uk" style={{ color: '#00ff88', textDecoration: 'none', display: 'block', marginBottom: '8px' }}>info@kinetixfit.co.uk</a>
                  <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Enterprise Partnerships:</span>
                  <a href="mailto:partnerships@kinetixfit.co.uk" style={{ color: '#00bfff', textDecoration: 'none', display: 'block' }}>partnerships@kinetixfit.co.uk</a>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* --- NATIVE STICKY BOTTOM TAB NAVIGATION BAR (APPLE HEALTH / OURA / INSTAGRAM STYLE) --- */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(11, 15, 25, 0.95)',
        backdropFilter: 'blur(15px)',
        borderTop: '1px solid #1f2937',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 0',
        zIndex: 99,
        boxShadow: '0 -8px 25px rgba(0, 0, 0, 0.5)'
      }}>
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
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                color: active ? '#00ff88' : '#6b7280',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 'bold',
                gap: '4px',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: '18px', filter: active ? 'drop-shadow(0 0 5px rgba(0, 255, 136, 0.4))' : 'none' }}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* --- FLOATING ACCELEROMETER HANDSHAKE DEVICE SYNC MODAL --- */}
      {showDeviceSyncModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.9)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100
        }}>
          <div style={{
            width: '90%',
            maxWidth: '400px',
            backgroundColor: '#0b0f19',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '30px',
            boxShadow: '0 10px 40px rgba(0, 255, 136, 0.05)'
          }}>
            <h3 style={{ fontSize: '16px', color: '#fff', textTransform: 'uppercase', borderBottom: '1px solid #1f2937', paddingBottom: '10px', margin: '0 0 15px 0' }}>
              🔌 Connect Smart Device Handshake
            </h3>
            <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4', marginBottom: '20px' }}>
              Establish a secure credentials connection to pull live continuous sleep, recovery, or workout metrics.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '25px' }}>
              {['Apple HealthKit', 'Oura Cloud Sync', 'Garmin Connect', 'Fitbit Network'].map(device => (
                <button
                  key={device}
                  onClick={() => handleInitiateDeviceConnection(device)}
                  disabled={syncingDeviceType !== null}
                  style={{
                    backgroundColor: '#030712',
                    border: '1px solid #1f2937',
                    color: '#fff',
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: 'monospace'
                  }}
                >
                  <span>⚡ {device}</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
                    {syncingDeviceType === device ? 'Syncing...' : 'Connect →'}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowDeviceSyncModal(false)}
              style={{
                width: '100%',
                backgroundColor: '#1f2937',
                color: '#fff',
                border: '1px solid #374151',
                padding: '10px',
                cursor: 'pointer',
                borderRadius: '8px',
                fontSize: '11px',
                fontFamily: 'monospace'
              }}
            >
              Cancel Handshake
            </button>
          </div>
        </div>
      )}

      {/* --- FLOATING HIGH-TECH SIMULATED AI CAMERA SCAN VIEWPORT MODAL --- */}
      {showCameraModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.95)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100
        }}>
          <div style={{
            width: '90%',
            maxWidth: '450px',
            backgroundColor: '#0b0f19',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '25px',
            boxShadow: '0 10px 40px rgba(0, 255, 136, 0.1)'
          }}>
            <h3 style={{ fontSize: '15px', color: '#fff', textTransform: 'uppercase', borderBottom: '1px solid #1f2937', paddingBottom: '10px', margin: '0 0 15px 0', fontFamily: 'monospace' }}>
              📷 Simulated AI Camera Ingestion Scan
            </h3>
            
            {isCameraScanning ? (
              <div style={{ height: '220px', backgroundColor: '#030712', borderRadius: '12px', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                {/* Simulated Neon-green sweeping scanning laser line */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  backgroundColor: '#00ff88',
                  boxShadow: '0 0 15px #00ff88',
                  animation: 'scanLineMove 1.8s infinite linear'
                }} />
                
                <span style={{ fontSize: '32px', animation: 'spin 2s infinite linear' }}>⌛</span>
                <span style={{ fontSize: '11px', color: '#00ff88', marginTop: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>
                  PROCESSING FORMULATION IMAGERY...
                </span>
                <span style={{ fontSize: '9px', color: '#6b7280', marginTop: '5px' }}>
                  Querying FSA/NHS allergen database pathways
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4' }}>
                  Choose a high-end UK food item from our mock database to simulate an optical character recognition (OCR) label snap.
                </p>

                {/* Simulated Supermarket Item Click Presets */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={() => triggerCameraScan('Tesco Tomato Pasta')}
                    style={{
                      backgroundColor: '#030712',
                      border: '1px solid #1f2937',
                      color: '#fff',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'monospace',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#00ff88'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#1f2937'}
                  >
                    <span>🛒 Snap Label: Tesco Tomato Pasta</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>CLEARED [23]</span>
                  </button>

                  <button
                    onClick={() => triggerCameraScan("Sainsbury's Nut Bar")}
                    style={{
                      backgroundColor: '#030712',
                      border: '1px solid #1f2937',
                      color: '#fff',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'monospace',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#ff3b30'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#1f2937'}
                  >
                    <span>🛒 Snap Label: Sainsbury's Nut Bar</span>
                    <span style={{ color: '#ff3b30', fontWeight: 'bold' }}>HAZARD FLAGGED</span>
                  </button>

                  <button
                    onClick={() => triggerCameraScan('Greggs Sweet Potato Bhaji')}
                    style={{
                      backgroundColor: '#030712',
                      border: '1px solid #1f2937',
                      color: '#fff',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'monospace',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#00ff88'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#1f2937'}
                  >
                    <span>🛒 Snap Menu: Greggs Sweet Potato Bhaji</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>CLEARED [23]</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowCameraModal(false)}
                  style={{
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    padding: '10px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    marginTop: '10px'
                  }}
                >
                  Close Viewfinder
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation declarations inside a temporary style tag to ensure execution in raw HTML */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        @keyframes scanLineMove {
          0% { top: 0; }
          50% { top: 220px; }
          100% { top: 0; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .hidden-xs { display: none !important; }
        }
      `}</style>
      
    </div>
  );
}
