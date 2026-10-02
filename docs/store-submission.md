# Kinetix Fit — store submission answer sheet

Written 3 Oct 2026 from the code, the live privacy policy (updated 2 Oct) and the merged Android manifest. Every answer below is something the app does today; where an answer depends on a decision or a fact only the owner knows, it is marked **DECIDE** or **CHECK**.

Play Console wording changes now and then, so the labels below are the ones as of this writing — match by meaning, not by exact text.

**Order of work:** §0 first-day checklist → §2 App content (all the declarations) → §3 subscription → §4 store listing → §5 internal testing → upload. Apple (§7) can wait for the paid developer account.

---

## 0. What only you can do (Claude can't)

| # | Task | Where | Needs |
|---|---|---|---|
| 1 | Make the **reviewer account** (§2.2) and a lifetime promo code for it | Supabase dashboard + Vercel `PROMO_CODES_JSON` | Redeploy after changing the env var |
| 2 | Fill in **App content** (§2) | Play Console → Policy and programs → App content | This sheet |
| 3 | **Health Connect declaration** + short screen recording (§2.9) | Play Console → App content → Health apps / Sensitive permissions | A phone with the app |
| 4 | Create the **Plus subscription** + base plan (§3) and attach it to RevenueCat's `default` offering | Play Console → Monetise; RevenueCat | A signed upload to Play first (products need an app with billing) |
| 5 | **Store listing** text and graphics (§4) | Play Console → Grow → Store presence | Screenshots, feature graphic |
| 6 | Upload the signed AAB to **Internal testing** and read the **pre-launch report** | Play Console → Test and release | `Kinetix-Fit-1.9.aab` or newer |
| 7 | Confirm **Tremendous** supports a £2.50 denomination and that `config:rewards` in production Redis is still empty | Tremendous dashboard; Upstash | (the voucher is £2.50 as of PR #7) |

### Decisions to make before submitting

- **DECIDE — countries.** Rewards are UK-only. The app also onboards India (`country IN`). Choose the distribution list: UK only at first, or UK + India.
- **DECIDE — price.** Plus price and any intro offer (E1: £9.99 intro is planned, terms not settled). The app shows the store's own price, so nothing in the app needs changing.
- **DECIDE — "shared" on the Data safety form** (§2.6): the recommended answer is *not shared* (processors only), with the reasoning below.
- **CHECK — charity donations.** The policy says "JustGiving (once live)". Don't mention donations in the listing until they are live.

---

## 1. Identifiers

| Field | Value |
|---|---|
| App name | **Kinetix Fit** (Play title ≤ 30 characters) |
| Package / bundle ID | `com.jnglobalventures.kinetixfit` |
| Developer | JN Global Ventures LTD (England & Wales, company no. 17268312, Sheffield) |
| Category | Health & Fitness |
| Support email | info@kinetixfit.co.uk |
| Website | https://www.kinetixfit.co.uk |
| Privacy policy | https://www.kinetixfit.co.uk/privacy-policy |
| Terms | https://www.kinetixfit.co.uk/terms-of-service |
| Account deletion URL | https://www.kinetixfit.co.uk/delete-account |
| Version (current signed build) | 1.9, versionCode 10 (`android/app/build.gradle`); target SDK 36, min SDK 26 |
| Upload key SHA-256 | `DD:7A:A9:C8:C6:EE:39:41:EF:7D:CA:31:45:E6:42:9B:F2:1A:75:11:54:17:65:FF:40:D8:FE:68:B8:DE:14:AD` (keystore in `~/KinetixFit-keys/`, backed up by the owner) |

---

## 2. Play Console → App content

### 2.1 Privacy policy
URL above. It is live, in English, covers Android and iPhone, names the controller, lists every processor, retention, deletion and rights. **Don't change the URL once submitted.**

### 2.2 App access
Answer: **All or some functionality is restricted** (sign-in needed).

Instructions for reviewers (paste):

> Kinetix Fit needs an account. Sign in with:
> Email: `<REVIEWER EMAIL>`  Password: `<REVIEWER PASSWORD>`
> The account is already set up, so you land on the Today screen. Kinetix Fit Plus is switched on for it, so the Plus features (10 scans a day, AI meal ideas, coffee voucher section, extra widgets and app icons) are unlocked. If you want to see the free experience, use Account → Log out and create a new account with any email address.
> Health data is optional: the app works without connecting Health Connect. To see the health screens, tap "Connect a device" on Today and allow the permissions.
> Photo and barcode scans use the camera; typed food checks need no permission.
> No ads, no location access, no purchases are needed to review.

**How to make the account (you):**
1. Supabase → Authentication → Users → **Add user** → *Create new user*, tick **Auto Confirm User** (sign-up emails only reach the project team until custom SMTP is set up — see CLAUDE.md → Sign-up emails — so a normal sign-up for a stranger's inbox will not work).
2. Add a lifetime code to Vercel `PROMO_CODES_JSON`, e.g. `"REVIEW-PLUS-<random>":"lifetime"`, then redeploy. Sign in on a phone with the account, finish onboarding, then Account → Promo code → redeem. Check Account → Plan & billing says *Kinetix Fit Plus · lifetime*.
3. Log a few foods, some water and a check-in so the screens aren't empty. Keep the account's password out of the repo.

### 2.3 Ads
**No, the app contains no ads.** (The policy and the manifest agree: no ad SDK, no advertising ID.)

### 2.4 Content rating (IARC questionnaire)
Category: **All other app types** (utility / health and fitness). Answers:

| Question | Answer |
|---|---|
| Violence, blood, fear | None |
| Sexual content or nudity | None (the cycle tracker shows dates and predictions only) |
| Profanity or crude humour | None |
| Controlled substances (drugs, alcohol, tobacco) | No references promoted. *Food database entries can include alcoholic drinks as nutrition entries; if the form asks about alcohol references, answer that they appear only as food/drink nutrition data.* |
| Gambling or simulated gambling | None. *Points and vouchers are earned by activity, never bought, staked or random.* |
| User interaction / user-generated content shared with others | No (nothing is shared between users) |
| Shares the user's location | No |
| Digital purchases | **Yes** (Plus subscription) |
| Unrestricted web access | No |

Expected result: low rating (PEGI 3 / Everyone). The audience is still set to 16+ (next section) because of health data.

### 2.5 Target audience and content
- Target age groups: **16–17** and **18 and over**. Do **not** select anything under 16 (policy §1: not for under-16s).
- Appeals to children: **No**. Not a Families app.
- Store listing must not use cartoon characters or children-oriented imagery (it doesn't).

### 2.6 Data safety form
**Does the app collect or share any required user data types?** Yes.
**Is all collected data encrypted in transit?** Yes (HTTPS everywhere).
**Can users request data deletion?** Yes — in the app (Account → Your data & privacy → Delete account or data) and at the deletion URL.

**Why "shared" = No.** Google's definition excludes transfers to service providers that process data on the developer's behalf. Supabase, Vercel, Upstash, RevenueCat and Anthropic act on our instructions (policy §4); Tremendous receives the email only when the person redeems a voucher; Open Food Facts / USDA receive a food name or barcode only. If you prefer to be conservative, declare *Health info* and *Photos* as shared with a service provider for *App functionality* — the form allows it and nothing in the app has to change.

| Data type | Examples in the app | Collected | Shared | Optional? | Ephemeral? | Purposes |
|---|---|---|---|---|---|---|
| **Personal info → Name** | profile name | Yes | No | Required | No | App functionality, Account management |
| **Personal info → Email address** | sign-in; RevenueCat identity; voucher delivery | Yes | No | Required | No | App functionality, Account management |
| **Personal info → User IDs** | account ID | Yes | No | Required | No | App functionality, Account management |
| **Personal info → Other info** | age, sex, diet, country | Yes | No | Required for targets | No | App functionality, Personalisation |
| **Health and fitness → Health info** | heart rate, HRV, resting HR, blood oxygen, breathing rate, blood pressure, sleep, weight, body fat, gut checks, period dates and predictions, allergies | Yes | No | Optional (health reads need the person's permission; gut and period are opt-in) | No | App functionality, Personalisation |
| **Health and fitness → Fitness info** | steps, distance, workouts, calories burned, VO2 max, water, food and nutrition logs | Yes | No | Optional | No | App functionality, Personalisation, Fraud prevention (quests verified from steps/sleep/workouts) |
| **Photos and videos → Photos** | meal photos sent to identify food (not stored after the answer) | Yes | No | Optional | **Yes** | App functionality |
| **Financial info → Purchase history** | whether Plus is active (via Google Play + RevenueCat); no card details | Yes | No | Optional | No | App functionality |
| **App activity → App interactions** | points, XP, streaks, quests, voucher and donation records | Yes | No | Required | No | App functionality, Fraud prevention, security and compliance |
| **App info and performance → Diagnostics** | Google ML Kit (barcode scanner) diagnostics | **CHECK** | No | — | — | Analytics / App functionality — verify against Google's ML Kit data disclosure (https://developers.google.com/ml-kit/android-data-disclosure) and declare what it says; the policy §2 already states this |

**Not collected:** location (approximate or precise), contacts, messages, audio, files, calendar, web browsing, device or other IDs, advertising ID, crash logs of our own (no crash-reporting SDK).

**Security practices:** encrypted in transit — Yes; users can request deletion — Yes; follows Families policy — No; independent security review — No.

Cross-check before submitting: every row above must agree with the policy sections 2 and 4. A mismatch is the most common reason for a data-safety rejection.

### 2.7 Government app / News app / COVID-19 / Financial features
- Government app: **No**.
- News app: **No**.
- COVID-19 contact tracing or status app: **No**.
- Financial features: **None.** (No banking, loans, crypto, trading or payments handled by us. Subscriptions go through Google Play Billing; coffee vouchers are delivered by Tremendous.)

### 2.8 Health apps declaration
Select the categories that apply (wording in the form may differ):
- Activity and fitness (steps, workouts, quests)
- Nutrition and weight management (food logging, targets)
- Sleep
- Women's health / cycle tracking (opt-in period tracker)
- Body measurements and vitals (heart rate, blood pressure, blood oxygen, weight)

Do **not** select clinical categories (diagnosis, disease management, medical device, treatment). Support the answer with the app's own wording: it is a wellness app, predictions are estimates, nothing is diagnosis, the cycle card says it isn't contraception, and red-flag text says to see a doctor. The gut report and ranges are "information, never a diagnosis" (`src/lib/vitals.ts`).

### 2.9 Health Connect permissions declaration
Intro to paste:

> Kinetix Fit reads (never writes) health data from Health Connect so the person can see it in one place, get personalised daily targets, and have their daily activity verified for the app's rewards. Every permission is requested in context after an in-app explanation (onboarding step "Health", or Today → Connect a device), only for the data types listed below, and the person can change or withdraw access in Health Connect at any time. Data is stored in the person's own account and is never sold or used for advertising (Privacy Policy §4). The privacy rationale screen opens the live policy.

The merged release manifest requests exactly these **15** permissions (all `READ_*`; every other Health Connect permission the plugin declares is removed in `AndroidManifest.xml`):

| Permission | Why (what the person sees) |
|---|---|
| `READ_STEPS` | Steps on Today, the steps quest, widgets, rewards verification |
| `READ_DISTANCE` | Distance walked/run today on the activity card |
| `READ_ACTIVE_CALORIES_BURNED` | Calories burned today on the activity card (when the device shares active calories) |
| `READ_TOTAL_CALORIES_BURNED` | Calories burned today (devices such as Samsung Health write total calories) |
| `READ_EXERCISE` | Workouts recorded by the phone or watch, shown on Today and counted for quests |
| `READ_HEART_RATE` | Latest heart rate and today's range on Today |
| `READ_RESTING_HEART_RATE` | Resting heart rate in Body and vitals, recovery context |
| `READ_HEART_RATE_VARIABILITY` | HRV for the recovery/stress card and trend |
| `READ_SLEEP` | Last night's sleep on Today, the sleep quest, and the morning check-in insight |
| `READ_OXYGEN_SATURATION` | Blood oxygen in Body and vitals (informational ranges only) |
| `READ_RESPIRATORY_RATE` | Breathing rate in Body and vitals |
| `READ_BLOOD_PRESSURE` | Blood pressure in Body and vitals (informational ranges only) |
| `READ_VO2_MAX` | VO2 max in Body and vitals |
| `READ_WEIGHT` | Weight trend in Body and vitals |
| `READ_BODY_FAT` | Body fat in Body and vitals |

Play usually also asks for a **short screen recording**. Script (≈60 s): open the app → onboarding "Health" step shows the list and the "Read only" note → tap Connect Health Connect → system permission sheet → Today shows steps, sleep, heart rate → Body and vitals card → Account → Connected devices (can disconnect) → Account → Your data & privacy (policy, delete).

Other permissions the manifest declares, for the "permissions" section or reviewer questions:

| Permission | Why |
|---|---|
| `CAMERA` | Barcode and meal-photo scanning (only when the person taps scan) |
| `POST_NOTIFICATIONS` | Local reminders the person turns on (water, movement, gut check, streak); asked in context |
| `ACTIVITY_RECOGNITION` | Optional movement-break reminders that notice when the phone hasn't moved |
| `RECEIVE_BOOT_COMPLETED` | Re-arms the movement-break check after a reboot |
| `com.android.vending.BILLING` | Plus subscription |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`, `WAKE_LOCK` | Normal permissions |

No exact-alarm, location, SMS, contacts, microphone or ad-ID permissions. `allowBackup` is off.

### 2.10 Account deletion (Data safety → Data deletion)
- In-app path: **Account → Your data & privacy → Delete account or data** (two modes: delete data and keep the account, or delete the account and all data).
- Web resource: https://www.kinetixfit.co.uk/delete-account
- What is deleted: account, profile, logs, health readings, gut checks, period data, points and rewards history, and the RevenueCat record.
- What is kept: numeric daily/monthly usage counters up to 35 days, so limits like one voucher a month can't be reset by re-creating an account; records the law requires; Tremendous' own voucher record. State this if the form asks.

### 2.11 Advertising ID
**No** — the app does not use the advertising ID (not in the merged manifest).

### 2.12 App signing
Play App Signing: **on** (recommended). The upload key is the keystore in `~/KinetixFit-keys/`; keep two backups. Losing it means a reset request to Google.

---

## 3. Subscription (Play Console → Monetise) and RevenueCat

**Product:** one subscription, e.g. product ID `kinetixfit_plus_monthly`, base plan `monthly` (auto-renewing, 1 month). **DECIDE** price (GBP) and whether to add the E1 intro offer (£9.99 for a defined period, then the renewal price) — offers are configured in the base plan, no app change needed.

**Connect to RevenueCat:**
1. RevenueCat → Project → Apps → Google Play app (package above) with its service-account credentials.
2. Products → import the Play subscription.
3. Entitlement **`kinetixfit_pro`** (this exact identifier — `src/lib/plus.ts` and `api/_lib/plus.js` use it) → attach the product.
4. Offerings → **`default`** (currently empty) → add a package (monthly) with that product. The app sells *the current offering's first package*.
5. Put RevenueCat's **Android public SDK key** in the build as `VITE_REVENUECAT_ANDROID_PUBLIC_KEY` (it is already how the 1.9 AAB was built; the iOS key is separate and still missing).

**What the app already does for store policy:** shows the store's own price string, a restore-purchase link and a manage-subscription link on Account → Plan & billing, links to the Privacy Policy and Terms on the sign-up screen and in Account → Help & legal, and no price is hard-coded. Cancelling is in Google Play → Subscriptions.

**Test purchases:** Play Console → Setup → License testing → add the tester Gmail accounts; they can buy without being charged once the internal test is live. RevenueCat shows the purchase under the account email.

---

## 4. Store listing (draft)

### Text
**Title** (≤ 30): `Kinetix Fit: Fitness & Rewards` (30 characters)

**Short description** (≤ 80): `Small wins, real rewards: track steps, sleep, food and water in one UK app.` (75 characters)

**Full description** (≤ 4,000; this draft is about 2,000) — draft:

> Kinetix Fit turns steady, everyday progress into something you can see and enjoy. Walk, sleep well, eat a little better, drink some water — and watch your points, streaks and rewards grow. You don't need a perfect week. You need a next step.
>
> **One app for the whole day**
> • Today: your steps, sleep, heart rate and workouts in one place (from Health Connect, with your permission)
> • Check a food: type it, scan a barcode or take a photo to see calories, protein, fibre and your allergens flagged against yours
> • Water: log a glass in one tap, from the app or a home-screen widget
> • Morning check-in: tell us how you slept and how energetic you feel, and see how the two go together
> • Gut check and cycle tracking, if you want them: simple daily notes and a private cycle view with honest estimates
> • Reminders you control: water, movement breaks, gut check and streak nudges
>
> **Built around you**
> Personal targets from your height, weight, goal and diet; food ideas that fit your day; your allergens and diet shape what you see.
>
> **Your progress, paid back**
> Earn points for things your phone can confirm — steps, sleep, workouts, daily check-ins and food checks. Collect streaks and complete daily quests. At 1,000 points Plus members can claim a coffee voucher (one a month; UK only for now).
>
> **Kinetix Fit Plus**
> Free to start. Plus adds more scans a day, AI meal ideas from your goal and today's food and activity, the coffee voucher, extra home-screen widgets and more app icons.
>
> **Private by design**
> No ads. No selling your data. Health and cycle data is used only to run the features you see. Delete your data or account any time in the app.
>
> Kinetix Fit is a wellness app. It gives estimates and general information, not medical advice, diagnosis or treatment — speak to a doctor about any health concern. Predictions are not a way to prevent pregnancy.
>
> Kinetix Fit needs an account. Some features need a connected health app and a camera; everything optional is optional.

(Avoid claims the store checks: no "clinically proven", no weight-loss promises, no medical terms. If donations to charity go live, add a line then.)

**Categorisation:** App → Health & Fitness. Tags: Fitness, Health & wellness tracking, Diet & nutrition, Sleep (pick from Play's list). Contact email, website and phone (optional) as in §1.

### Graphics (Play requirements)
| Asset | Spec | Status |
|---|---|---|
| App icon | 512 × 512 PNG, ≤ 1 MB (source `assets/icon-only.png` is 1024²; downscale) | derive |
| Feature graphic | 1024 × 500 PNG/JPG | **to make** — clay `#E5532D` on `#16181F`, the infinity mark and the line "Small wins. Real rewards." |
| Phone screenshots | 2–8, min 320 px, max 3840 px, **long side ≤ 2× the short side** | **to capture** |
| 7" / 10" tablet screenshots | optional | skip for now |

**Screenshot note:** the S21 FE screen is 1080 × 2340 (ratio 2.17:1) and Play rejects ratios above 2:1. Crop or pad captures to **1080 × 2160** (or use a 9:19 emulator).

**Screenshot list (use a demo account with a few days of data and Plus on, so no real personal data appears):**
1. Today — greeting, targets, hydration, morning check-in (dark theme)
2. Check a food — search with "Did you mean…?" and a result with allergens
3. Photo/barcode scan result
4. Nourish — daily targets with meters
5. Rewards — points, streak, coffee voucher progress
6. Body and vitals / health card (with Health Connect connected)
7. Plan & billing / Plus page (shows Plus benefits)
8. Widgets or app-icon gallery

---

## 5. Testing and release

- The Play account is an **organisation** account (per the owner), so the "12 testers for 14 days" closed-test rule that applies to new *personal* accounts should not apply. **CHECK** in Play Console → Dashboard → "Set up your app / Test and release" — it will say if a closed-test requirement applies to you.
- Suggested path: **Internal testing** (up to 100 testers, available within minutes, no review for internal) → fix what the **pre-launch report** finds → **Production** with a staged rollout (e.g. 20% → 100%).
- Internal testers: add the Gmail addresses (yours, the S21 FE's account, any friends) under Testing → Internal testing → Testers; they join via the opt-in link.
- Before production: complete all of §2, the store listing, a content rating, and the data-safety form, or the "Send for review" button stays disabled.
- Each upload needs a higher **versionCode** (currently 10). Keep the version name 1.9 until you have a reason to change it.

### Technical checklist before uploading the AAB
- `npm run build && npx cap sync android && cd android && ./gradlew bundleRelease` (JDK 21; ≥ 10 GB disk free).
- Signed with the upload key (the build prints a signed AAB when `~/KinetixFit-keys/keystore.properties` exists).
- Merged manifest has the 15 health reads and no exact-alarm permission (check `android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`).
- Production server is deployed (it is: PR #7 on 3 Oct; PRs #8 and #9 changed the app only). `PROMO_CODES_JSON` and `REVENUECAT_API_KEY` are set in Vercel.
- Read the **pre-launch report** after the first internal upload: crashes, accessibility, 16 KB page-size compatibility for native libraries (the barcode scanner and health plugins may ship `.so` files), and edge-to-edge on Android 15/16 (already checked on the S21 FE).
- **Not yet done:** R8 minification is off (`minifyEnabled false`); fine for a first release.

---

## 6. Things that must match everywhere (check once more before each submission)

| Claim | Where it is stated | Must agree with |
|---|---|---|
| Not for under 16 | Policy §1/§9, target audience, Apple age rating | the age picker, which starts at 16 (`src/components/ProfileFields.tsx`); there is no separate "I am 16" tick box, the sign-up screen links the Terms, which state 16+ |
| Health data is read-only | policy §2, Health Connect text, iOS usage strings | the manifest (no `WRITE_*` permissions) |
| Period data not sent to Anthropic | policy §2/§4 | `api/suggest-meals.js` payload (no cycle data) |
| Photos not stored | policy §2/§5, Data safety "ephemeral" | `api/scan-meal.js` (photo goes to the AI and is dropped) |
| No ads, no tracking | policy, ads answer, App Privacy label | no ad SDK in `package.json` / manifest |
| Data synced to the account | in-app copy ("saved to your account when you sign in") | policy §2/§4; Data safety "collected" |
| Delete account in-app | policy §7, deletion URL, store form | Account → Your data & privacy |
| Reminders are local | policy §2 | no push token anywhere |
| Rewards: £2.50 coffee voucher for 1,000 points, Plus only, one a month, UK only | website, listing, app | `api/_lib/rewardConfig.js` and `src/site/config.ts` |

---

## 7. Apple App Store / TestFlight (for when the paid developer account exists)

Needs: paid Apple Developer Program account → App Store Connect app record (`com.jnglobalventures.kinetixfit`), the RevenueCat **iOS** app + `VITE_REVENUECAT_IOS_PUBLIC_KEY`, the subscription in App Store Connect, then a signed archive via Xcode (the free-profile debug builds can't go to TestFlight).

### App Privacy ("nutrition label") — matches `ios/App/App/PrivacyInfo.xcprivacy`
- **Data used to track you: none.**
- **Data linked to you** (all used for *App Functionality*; none for advertising or third-party advertising):
  - Contact info: name, email address
  - Health & fitness: health, fitness
  - User content: photos (meal photos), other user content (food and gut logs)
  - Purchases: purchase history (subscription status)
  - Identifiers: user ID
  - Usage data: product interaction (points, quests, streaks)
- No data collected for analytics or advertising; no location.

### Age rating
Answer the questionnaire honestly: *health or wellness topics* — yes; medical/treatment advice — no (wellness estimates only, with "see a doctor" guidance); no violence, sexual content, gambling, user-generated sharing, or unrestricted web access. The app's own gate is 16+, so don't pick a lower rating than the questionnaire gives; pick **16+** audience in the listing if offered.

### Review information
- **Demo account:** same approach as Play (§2.2). Because the Promo code box is hidden on iOS, grant Plus to the demo email in **RevenueCat → Customers → (email) → Grant promotional entitlement `kinetixfit_pro` (lifetime)** — the app reads it through `/api/plus-status`.
- **Notes to the reviewer (paste):**
  > Kinetix Fit is a wellness app for tracking activity, sleep, food and water and earning small rewards. It needs an account (credentials below). HealthKit is used read-only for steps, heart rate, HRV, sleep, workouts, distance, calories, blood oxygen, breathing rate, blood pressure, VO2 max, weight and body fat, shown on the Today screen and used to verify daily activity; it is never written to or used for advertising. The camera is used to scan food barcodes and meal photos. Meal photos are sent to an AI service (Anthropic) to identify the food and are not stored; AI meal ideas (a Plus feature) send the person's goal, diet and today's activity, with their explicit consent asked first in the app (no name or email). Account deletion is in Account → Your data & privacy. Subscriptions use StoreKit via RevenueCat; Restore Purchases and Manage Subscription are on Account → Plan & billing; the Terms and Privacy Policy are linked on the sign-up screen and in Account → Help & legal. Demo account: `<email>` / `<password>`.
- **Guideline points the app already meets:** 5.1.1(v) in-app account deletion; 3.1.2 subscription terms and links, restore purchases; 5.1.3 and 5.1.2(i) health data and third-party AI disclosure with consent (`kx_ai_ideas_consent`); privacy manifests present; `ITSAppUsesNonExemptEncryption = false` (HTTPS only).
- **Usage strings** in `Info.plist` (already written): camera, photo library, HealthKit read. No HealthKit *write* string because the app never writes.
- **Offer codes / promo:** use App Store Connect → subscription → Offer codes for testers and influencers (the in-app promo box is Android/web only).

### Screenshots (Apple)
At least one set at 6.9" (1320 × 2868) or 6.5" (1284 × 2778); same eight screens as §4. The iPhone 17 Pro Max simulator gives 1320 × 2868 (`scripts/ios-sim/sim.sh`, `SIM_NAME="iPhone 17 Pro Max"`).

---

## 8. Open items found while writing this

1. **Diagnostics from ML Kit** (§2.6): decide the declaration after reading Google's disclosure — the one row I can't answer from the repo.
2. **Play countries and price** are decisions, not facts.
3. **Reviewer account** and its lifetime promo code don't exist yet.
4. **Feature graphic** and **screenshots** still need to be made; the screenshots must be 2:1 or less.
5. The listing mentions Plus benefits exactly as `src/lib/plus.ts` lists them; if that list changes, update the description.
6. The policy says `JustGiving (once live)` — keep donations out of the listing until live.
