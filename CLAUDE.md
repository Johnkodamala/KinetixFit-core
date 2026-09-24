# KinetixFit Core - Project Documentation

**Last Updated:** 2026-09-25  
**Project:** KinetixFit Enterprise Biometric Portal  
**Stack:** React 19 + TypeScript + Vite + Capacitor (iOS/Android)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (check: `node --version`)
- npm 9+ (check: `npm --version`)
- Git (repo already cloned to `/Users/sivadurga/KinetixFit-core`)

### Setup & Development
```bash
cd /Users/sivadurga/KinetixFit-core

# Install dependencies (first time only)
npm install

# Start development server (HMR enabled)
npm run dev
# → App opens at http://localhost:5173

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm preview
```

---

## 📁 Project Structure

```
KinetixFit-core/
├── src/                          # React app source code
│   ├── App.tsx                   # Main component (4,637 lines) — dashboard & onboarding
│   ├── main.tsx                  # Vite entry point
│   ├── index.css                 # Global styles
│   ├── components/
│   │   ├── BiometricTrendCard.tsx     # Health metrics visualization
│   │   └── DonateButton.tsx           # Charity donation integration
│   ├── lib/
│   │   └── supabase.ts           # Supabase client initialization
│   └── utils/
│       └── justgiving.ts         # JustGiving charity API integration
├── api/                          # Vercel serverless functions
│   ├── scan-meal.js              # AI photo → food identification (Anthropic API)
│   ├── verify-license.js         # Subscription verification (RevenueCat)
│   ├── redeem-promo.js           # Promo code redemption (Redis + RevenueCat)
│   ├── redeem-voucher.js         # Voucher redemption
│   ├── lookup-barcode.js         # Barcode lookup
│   ├── complete-quest.js         # Quest/challenge completion
│   ├── sync-health-data.js       # Health data synchronization
│   ├── donate-charity.js         # Charity donation backend
│   └── _lib/
│       ├── rewardConfig.js       # Reward tier definitions
│       └── auditLog.js           # Audit logging
├── android/                      # Android native code (Capacitor)
├── ios/                          # iOS native code (Capacitor)
├── public/                       # Static assets
│   ├── donate-complete.html
│   ├── privacy-policy.html
│   ├── terms-of-service.html
│   ├── admin-donate.html
│   └── favicon.* 
├── assets/                       # Images and media
├── .env.example                  # Environment variables template
├── package.json                  # Dependencies & npm scripts
├── capacitor.config.ts           # Capacitor app configuration
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
├── eslint.config.js              # ESLint rules
├── vercel.json                   # Vercel deployment config
└── README.md                     # Project README

```

---

## 🛠 Key Technologies

### Frontend
- **React 19.2.8** — Latest React with improved Server Components support
- **TypeScript ~6.0.2** — Type-safe development
- **Vite 8.2.0** — Lightning-fast build tool & dev server
- **Recharts 3.10.1** — Data visualization (biometric trends)

### Mobile & Native
- **Capacitor 8.5.0** — Cross-platform iOS & Android wrapper
- **@capacitor/barcode-scanner** — QR/barcode scanning
- **@capacitor/local-notifications** — Push notifications
- **@capgo/capacitor-health** — Health data integration (iOS HealthKit, Android Health Connect)

### Backend & API
- **Supabase 2.116.0** — PostgreSQL + Auth (JWT-based)
- **Upstash Redis 1.38.3** — Distributed cache for promo codes
- **RevenueCat** — In-app subscriptions & licensing
- **Anthropic API** — AI food identification from photos
- **USDA FDC API** — Nutrition facts lookup

### Deployment
- **Vercel** — Serverless hosting (Next.js-compatible)
- **GitHub** — Version control & CI/CD

---

## 🔐 Environment Configuration

All secrets are in `.env` (gitignored). Template is `.env.example`:

### Client-Side (Safe for Vite bundling, prefixed with `VITE_`)
```bash
# RevenueCat public SDK keys
VITE_REVENUECAT_IOS_PUBLIC_KEY=<key>
VITE_REVENUECAT_ANDROID_PUBLIC_KEY=<key>

# Supabase public API (anon/public key, NOT service role)
VITE_SUPABASE_URL=<url>
VITE_SUPABASE_ANON_KEY=<key>
```

### Server-Side (Vercel only, never in .env template)
```bash
# Anthropic API (for food identification)
ANTHROPIC_API_KEY=<key>

# USDA nutrition data
USDA_FDC_API_KEY=<key>

# RevenueCat secret (verify licenses, redeem promos)
REVENUECAT_API_KEY=<key>

# Promo codes (JSON, set in Vercel, never committed)
PROMO_CODES_JSON={"CODE-01":"lifetime","CODE-02":"30day"}

# Upstash Redis (auto-injected by Vercel Marketplace)
UPSTASH_REDIS_REST_URL=<url>
UPSTASH_REDIS_REST_TOKEN=<token>
```

**Copy `.env.example` to `.env` for local development:**
```bash
cp .env.example .env
# Then fill in real values (ask team for secrets)
```

---

## 🎯 Key Features & Code Sections

### 1. Dashboard & Onboarding (`src/App.tsx`)
- **Onboarding Flow:** Steps 0-7 (welcome → allergies)
- **DASHBOARD_STEP = 7:** Point where real dashboard becomes visible
- **Styles:** `ONBOARDING_STYLES` constant (Phase 1 design, light & trustworthy)
- **TelemetryStream:** Real-time biometric data display (status: Optimal/Syncing/Calibrating/Critical)
- **UserProfile Interface:** Height, weight, target, allergies, smart devices, cycle tracking

### 2. Health Data Integration
- **Capacitor Health Plugin:** Reads iOS HealthKit & Android Health Connect
- **Biometric Trends:** `BiometricTrendCard.tsx` visualizes daily data points
- **Data Sync:** `api/sync-health-data.js` → Supabase

### 3. Nutrition & Food Scanning
- **Food ID:** `api/scan-meal.js` uses Anthropic Vision API to identify food from photos
- **Nutrition Lookup:** USDA FDC API for macro/micronutrient data
- **Barcode:** `api/lookup-barcode.js` for quick product lookup

### 4. Monetization & Subscriptions
- **RevenueCat Integration:** Manages in-app purchases, subscriptions, trials
- **License Verification:** `api/verify-license.js` checks active subscriptions
- **Promo Codes:** `api/redeem-promo.js` with Redis rate-limiting (Upstash)
- **Tier System:** Defined in `api/_lib/rewardConfig.js` (e.g., "lifetime", "30day")

### 5. Charity Donations
- **JustGiving Integration:** `src/utils/justgiving.ts` (partner charity integration)
- **Donate Button:** `src/components/DonateButton.tsx`
- **Backend:** `api/donate-charity.js` processes donations
- **Completion Page:** `/donate-complete` HTML page after successful donation

### 6. Quests & Gamification
- **Complete Quest:** `api/complete-quest.js` logs quest completion
- **Audit Log:** `api/_lib/auditLog.js` tracks all actions for compliance

---

## 📋 API Endpoints

All API endpoints are Vercel serverless functions in `/api`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/scan-meal` | POST | AI food photo identification + nutrition lookup |
| `/api/verify-license` | POST | Check if user has active subscription |
| `/api/redeem-promo` | POST | Apply promo code (rate-limited via Redis) |
| `/api/redeem-voucher` | POST | Redeem voucher code |
| `/api/lookup-barcode` | POST | Product info from barcode |
| `/api/sync-health-data` | POST | Sync biometric data to Supabase |
| `/api/complete-quest` | POST | Log quest completion |
| `/api/donate-charity` | POST | Process charity donation |

---

## 🏗 Component & Utils Overview

### `src/components/BiometricTrendCard.tsx`
- Displays health metric trends over time
- Uses Recharts for visualization
- Type: `DailyPoint[]` for time-series data
- Props: health metric data, styling

### `src/components/DonateButton.tsx`
- Triggers charity donation flow
- Integrates with JustGiving API
- Redirects to donation completion page

### `src/lib/supabase.ts`
- Initializes Supabase client
- Exports `supabase` instance (singleton)
- Checks if Supabase is configured: `isSupabaseConfigured`
- Used for auth, data storage, real-time subscriptions

### `src/utils/justgiving.ts`
- JustGiving API integration
- Handles charity donation flows

---

## 🎨 Design System & Styling

### Phase 1 Onboarding Styles
- **Color Palette:** Light, trustworthy (MyFitnessPal/Apple Health direction)
- **Primary Blue:** `#2563EB`
- **Background:** `#FAFAFA`
- **Text:** `#1A1D1F`
- **Border:** `#E5E7EB`
- **Font Stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif`

### Existing Dashboard
- Keeps current look until Phase 3 rollout (no breaking changes planned)

---

## 📱 Mobile Deployment

### Capacitor Configuration (`capacitor.config.ts`)
```typescript
{
  appId: 'com.jnglobalventures.kinetixfit',
  appName: 'KinetixFit',
  webDir: 'dist'  // Built React app
}
```

### Build & Deploy to Mobile
```bash
# Build React for web
npm run build

# Sync to native projects
npx cap sync

# iOS
npx cap open ios  # Opens Xcode, build from there

# Android
npx cap open android  # Opens Android Studio, build from there
```

---

## 🔄 Git Workflow

### Current Branch
- **`initial-changes`** — Your working branch (tracking `origin/initial-changes`)
- All commits should go here
- Push regularly: `git push`
- Create PR when feature is complete: GitHub will show PR link after push

### Commit Convention
- Write clear, descriptive commit messages
- Format: `<type>: <description>`
  - `feat: add food scanning feature`
  - `fix: correct health data sync bug`
  - `refactor: simplify onboarding flow`
  - `docs: update API documentation`

### Branches
- **`main`** — Production-ready, stable code (protected)
- **`initial-changes`** — Your feature branch (PR → merge to main)

---

## 🐛 Common Issues & Solutions

### Issue: Supabase not configured
**Solution:** Check `.env` file has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The app checks `isSupabaseConfigured` and may disable certain features.

### Issue: Health permissions denied
**Solution:** On iOS, ensure you've added Health permissions to `info.plist`. On Android, request runtime permissions in app. The onboarding flow handles this at Step 3.

### Issue: Promo codes not working locally
**Solution:** Promo codes require `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN` (Vercel-only). Won't work locally unless Redis is configured.

### Issue: Food identification slow
**Solution:** `api/scan-meal.js` calls Anthropic API (may take 2-5 sec). Network latency is normal.

---

## 📊 Monitoring & Logging

- **Audit Log:** `api/_lib/auditLog.js` logs all reward/subscription events
- **Vercel Logs:** Check Vercel dashboard for serverless function logs
- **Supabase Logs:** Database queries and auth events in Supabase console
- **Client Logs:** Browser DevTools console (check for any Vite/React warnings)

---

## 🤝 Team Collaboration

### Before Starting Work
1. Pull latest changes: `git pull`
2. Ensure `.env` has all required secrets (ask team if missing)
3. Run `npm install` if `package.json` changed
4. Test locally: `npm run dev`

### While Working
- Commit often with clear messages
- Push to `initial-changes` regularly (backup)
- Test on mobile: `npm run build && npx cap sync`

### When Ready to Merge
1. Ensure linting passes: `npm run lint`
2. Ensure TypeScript has no errors: `npm run build`
3. Push all commits: `git push`
4. Create PR on GitHub (link provided after push)
5. Request review from team
6. Merge after approval

---

## 📚 Key Files to Know

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main component—dashboard, onboarding, all core logic |
| `capacitor.config.ts` | Mobile app metadata & build settings |
| `.env.example` | Template for all required environment variables |
| `package.json` | Dependencies & npm scripts |
| `vercel.json` | Vercel routing & rewrite rules |
| `api/verify-license.js` | Subscription gate—blocks features if not licensed |
| `api/scan-meal.js` | AI food identification—most complex serverless function |

---

## 🚨 Critical Notes

1. **Never commit secrets** — `.env` is gitignored for a reason
2. **Server-side APIs** — RevenueCat secret, Anthropic, USDA keys must stay server-side (`api/` folder, not bundled)
3. **Health data privacy** — All health data is encrypted in transit (Supabase TLS, Capacitor plugins)
4. **RevenueCat testing** — Use sandbox credentials when testing subscriptions locally
5. **Mobile compliance** — App uses GDPR-compliant Supabase, NHS/FSA guidelines noted in code

---

## 🎓 Useful Commands

```bash
# Development
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run lint         # Lint code
npm run preview      # Preview production build locally

# Mobile
npx cap sync         # Sync web build to native projects
npx cap open ios     # Open iOS in Xcode
npx cap open android # Open Android in Android Studio

# Git
git status           # Current branch & changes
git pull             # Fetch latest from origin
git push             # Push current branch to origin
git log --oneline    # View commit history
git checkout main    # Switch to main branch
```

---

## 📞 Need Help?

- **TypeScript Errors?** Check `src/` imports and types. Run `npm run build` to see full list.
- **Build Fails?** Delete `node_modules` & `package-lock.json`, then `npm install`.
- **Mobile Issues?** Clear Capacitor cache: `npx cap sync --no-sync` then `npx cap sync`.
- **Team Secrets?** Ask team for `.env` values (never commit or share via chat).

---

**Happy coding! 🚀**
