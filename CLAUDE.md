# KinetixFit Core

One React 19 + TypeScript + Vite codebase ships three products: the **website** (Vercel, live at
https://www.kinetixfit.co.uk, which also hosts the `api/` serverless functions), and the **Android**
and **iOS** apps (Capacitor 8 wraps the same `dist/` build in a WebView; native features — health
data, barcode scanner, notifications, RevenueCat billing — come from Capacitor plugins).

**Priority order: Android → iOS → website.** Android came first; iOS is the current focus (2026-09-26) and
builds + runs on the simulator. All three share `src/` and `api/`, so every change must keep all three working — never
fix one platform by breaking another. Work that unblocks several platforms (shared API, auth) is
done once, in shared code.

- App ID: `com.jnglobalventures.kinetixfit` · App name: **Kinetix Fit** (with a space in everything users see; code and docs say KinetixFit)
- Location: `/Users/sivadurga/Claude Space/KinetixFit-core` (moved here from `~/KinetixFit-core` on 2026-09-25)
- Git: `origin` = github.com/Johnkodamala/KinetixFit-core, working branch `initial-changes` → PR into `main`

## Current status (2026-10-03, ~02:45) — READ THIS FIRST in a new conversation

**Where we are.** The Android app is a few steps from Play internal testing; the user is working through the Play Console in parallel. A store-readiness plan
(`~/.claude/plans/go-ahead-with-step-sequential-truffle.md`) was agreed and **steps 1-4 are done, merged (PR #7) and deployed (3 Oct); step 5 (answer sheet) is next**.
The user works one reviewable step per "go": tests pin old behaviour first, then the change, then a report of files / behaviour changes / limits, then wait. Plain-text
questions, not the AskUserQuestion widget. Only commit / push when asked; the user merges PRs on GitHub (`gh pr merge` is blocked); production deploys and secrets are the user's.

**Git:** PR #7 (`chore/v1.8`: store-readiness steps 1-4, E2, E9, E8-light, the pre-submission pass) was **merged into `main` and deployed on 3 Oct** (checked live: `/api/plus-status` and `/api/delete-account` answer 401 instead of 404, the policy/terms/delete pages are 200, the ICO number is gone, the site says £2.50). Work after that is on branch **`fix/sync-safety`** (PR raised 3 Oct, the user merges): multi-device sync safety, see the next block. Branch from `main` for anything new; `chore/v1.8` is finished.

**3 Oct additions (commit `18fdfec`, pre-submission pass).**
- **`tsc --noEmit -p .` checks nothing here (solution-style tsconfig); use `npx tsc -b` (what `npm run build` runs).** The typo-prompt commit `ed703f1` had a type error (`savedFoods` is a `Record`, not an array) that only `18fdfec` fixes — never build from `ed703f1` alone.
- `src/components/ErrorBoundary.tsx` wraps `<App />` in `main.tsx` (a failed screen shows "Something went wrong" + Reload instead of a blank page; console only, nothing sent).
- Edge-to-edge on Android 15/16 checked on the S21 FE (Android 16, WebView 154): fine, Capacitor's SystemBars handles insets, no code needed. The Play pre-launch report (16 KB page size, accessibility, crashes) is still the user's to read after the first internal-testing upload.
- "Stays on your phone" claims removed everywhere (check-in, gut, vitals, gut reminder, website cycle bullet and FAQ): gut checks, periods, vitals, check-ins all sync to Supabase (the policy says so). Hard-coded GB "£14.99 / month" fallback removed ("Price shown in the store").
- **Second-phone sign-in goes straight to Today.** The onboarded marker is per phone, so a second phone used to repeat all of onboarding. `profileShowsOnboarded()` (`src/lib/onboarding.ts`): a pulled profile with a name + diet (Finish needs a diet) counts as onboarded; `syncThenContinue` marks it and reloads onto Today. Health and reminder permissions are then asked on Today. Accounts that finished before diet existed still onboard once on a new phone. **Not tested on the iPhone by Claude (can't drive its screen) — the user should log out/in on it.**
- `smart_device_connected` no longer comes down from the server (`profileFromRemote`, `src/lib/profileSync.ts`): it is per phone; `ownHealthSource()` also drops a stored value from the other platform at start-up. Before this, an iPhone could say "Connected to Health Connect".
- **Plus not showing on the iPhone (3 Oct): cause = `/api/plus-status` returns 404 in production (server not deployed) and the iOS app has no RevenueCat key.** The S21 FE gets Plus from its Android RevenueCat key (promo `KXFIT-TEST-30`, granted to the account's email). Fix = deploy the server (push → PR → Vercel preview → the user merges); the iPhone build from 3 Oct already calls `plus-status`. A paid Apple account + `VITE_REVENUECAT_IOS_PUBLIC_KEY` is still needed for iOS purchases.
- Get help email now ends with app version / platform / model (`src/lib/support.ts`); the "Did you mean" buttons are on one row.
- Ideas deferred until after the first release: an offline banner, an in-app "Rate us" prompt (needs a plugin), privacy-safe usage counts (typo-prompt acceptance etc. — needs a policy change), R8 minification (`minifyEnabled false` today; needs full device testing + keep rules).

**3 Oct night: multi-device sync safety (branch `fix/sync-safety`).** Found while the user used one account on an iPhone and the S21 FE and worried about losing data on logout.
- **The app pulls from the account only at login** (`syncAllOnLogin`, reached from `syncThenContinue`). Opening / foreground / reconnect only *push* (`flushOutbox`). So a second phone doesn't see the first one's new entries until it logs out and in. **Next: pull on app open** (merge rules already exist: `pullKeyed` / `pullSingleton`).
- **`supabase.auth.signOut()` is global by default** (ends the account's session on every phone). Logout and "Back to log in" now use `signOutThisPhone()` (`src/lib/auth.ts`, scope `local`); the password-change sign-out stays global on purpose.
- **Logout guard.** `handleLogout` flushes, then asks `unsyncedDomains()` (`src/lib/sync.ts`); anything left shows "Some changes haven't saved yet" (Stay signed in / Try again / Log out anyway, stacked buttons, `kx-confirm-actions--stack`). `unsyncedDomains()` counts dirty domains that hold something **and** keyed domains never fully backfilled; `flushOutbox()` now also retries those (`pushAllKeyed`, then marks them backfilled). A flush also runs at launch when a session exists. The normal confirm text says logs / progress / points are safe in the account and reminder settings reset.
- **A phone can be "logged in" with no account session** (the iPhone, from an older build: ~6 days of food / water / check-ins / vitals / profile never uploaded, Plus never checked). `needsAccountSignIn()` shows a "Save your data to your account" sheet (and an Account row "Sign in to save your data"); `handleResync` signs in as the profile's email (refuses a different account), runs `syncKeepingThisPhone()` (this phone's profile + preferences **replace** the account's; logs and check-ins are merged, this phone's records first), then reloads and shows a message left in `sessionStorage` `kx_flash`. Logging out in that state opens this sheet instead of the dead-end dialog. **Never log such a phone out first: it wipes the only copy.**
- **Bug fixed: the iPhone widget's drink times carry a fraction** (`1790528200246.793`) and `water_logs.at` is a `bigint`, so the server refused the whole water log (43 of 65 entries) and logout stayed blocked. `withDrinks` now floors times and `waterSync.toRemote` sends `at: Math.floor(...)` (ids keep the stored string, so drinks stay the same everywhere).
- **Checked on the iPhone after the fix:** session present, outbox empty, all 8 keyed domains marked backfilled. Not checked: the account's tables directly; the S21 FE pulling the iPhone's data (it needs a log out / in until pull-on-open exists).
- **How the iPhone's data was inspected (reuse this):** `xcrun devicectl device copy from --device <udid> --domain-type appDataContainer --domain-identifier com.jnglobalventures.kinetixfit --source Library/WebKit/WebsiteData/Default/<hash>/<hash>/LocalStorage/localstorage.sqlite3[-wal|-shm] --destination <dir>`; `ItemTable` values are UTF-16LE blobs (`decode('utf-16-le')`); keys of interest: `kx_sync_outbox`, `kx_sync_dirtykeys_*`, `kx_sync_backfilled_*`, `sb-*-auth-token` (the session). A backup of the iPhone's data from before the fix is in `~/KinetixFit-backups/iphone-localstorage-2026-10-03/` (personal health data: delete when no longer needed). A simulator can be seeded by replacing its `localstorage.sqlite3` after one launch (the first seeded launch showed a blank screen once, the next was fine).
- **Still open from this:** pull on app open; sync reminder settings (hydration / move / gut / streak toggles and hours are in `ACCOUNT_DATA_KEYS` but not in `PREF_KEYS`, so they reset on logout; likewise `kinetix_stress_history`, `kx_streak_best`, `kx_meals_hidden`); the iOS simulator asked for notification permission on the very first screen (sign-up) — check whether the app asks before login; confirm Plus shows on the iPhone now that `plus-status` is live and the phone has a session.

**Builds:** `android/app/build.gradle` = versionCode **10** / "**1.9**". `KinetixFit-builds/Kinetix-Fit-1.9.aab` is the signed release bundle (1.8.aab is superseded). Signing: the
upload keystore + passwords live in `~/KinetixFit-keys/` (`kinetixfit-upload.jks`, `keystore.properties`), **outside the repo and backed up by the user**; `build.gradle` reads that file
if it exists (no file = unsigned release). Upload-key SHA256 `DD:7A:A9:C8:C6:EE:39:41:EF:7D:CA:31:45:E6:42:9B:F2:1A:75:11:54:17:65:FF:40:D8:FE:68:B8:DE:14:AD`. Build:
`npm run build && npx cap sync android && cd android && ./gradlew bundleRelease` (JDK 21 from `~/.zshrc`; if Gradle says "Cannot lock execution history", `./gradlew --stop` and delete
`android/.gradle/8.14.3/executionHistory`; the disk got full once — keep ≥10 GB free). S21 FE and iPhone 13 mini both have the 3 Oct ~02:30 debug build (1.9 code + `fix/sync-safety`); A55 still 1.6; the iPhone's free profile lasts 7 days, so rebuild before ~10 Oct.
The user will get a **paid Apple Developer account soon** (needed for TestFlight / App Store, RevenueCat's iOS app + `VITE_REVENUECAT_IOS_PUBLIC_KEY`, Apple offer codes).

**Store-readiness plan, status**
1. **Plus from the server — done.** `api/plus-status.js` + `src/lib/plusStatus.ts`; the app asks on open/resume/after a promo; `redeem-promo` uses the session's email; `verify-license.js` deleted. Fixes "Plus doesn't show
   after a promo" on iOS (no RevenueCat SDK key there) and Android's stale cache.
2. **Account deletion — done** (details in the bullet further down: `api/delete-account.js`, "Delete account or data" in Account → Your data & privacy, `/delete-account` page). Two modes: delete data + keep
   account, or delete account + data. Short-lived anti-abuse counters are kept ≤35 days on purpose.
3. **Privacy policy / terms / iOS `PrivacyInfo.xcprivacy` — done** (details below). The user must read the policy before deploying.
4. **Store-policy app fixes — done** (age 16+, no exact alarms, no backups, Help opens email, no promo box on iOS, AI-ideas consent; details below).
5. **Next: `docs/store-submission.md`** — a section-by-section answer sheet for Play Console → App content (privacy policy URL `https://www.kinetixfit.co.uk/privacy-policy`, account-deletion URL
   `https://www.kinetixfit.co.uk/delete-account`, app access = a reviewer test account with Plus via a promo code, ads = none, content rating (IARC), target audience 16+, health apps declaration,
   the 15 Health Connect permissions with a justification each, data-safety form, financial features none, news app no, government app no), store listing drafts + screenshot list, the testing
   track (the user has an **organisation** Play account, so the 12-tester / 14-day closed-test rule for new personal accounts does not apply), and the Apple equivalents (App Privacy label, review notes,
   demo account, offer codes) for later. Ask the user which Play Console sections they have already filled in.

**Open items that are the user's** (Claude can't do these): Play Console health declaration + data-safety form + listing + the subscription product (and RevenueCat attaching it to the
`default` offering, which is empty); **Supabase custom SMTP** (Resend walkthrough was given: verified subdomain DNS + API key + Supabase SMTP settings — postponed, the user has a dependency);
read the new policy (`PROMO_CODES_JSON` and the RevenueCat secret key are set in Vercel — done 2 Oct); confirm Supabase's backup retention (the policy says "overwritten within 30 days", an assumption); a paid Apple account;
the S21 FE device checks (check-in +5/+10 reaching `points_ledger`, first food check +2, a quest claim, logout → sign-in restore, voucher/donation refusal below 1,000 points, **water/gut/streak
reminders still firing after the exact-alarm removal**, a delete-account run on a throwaway account in both modes, a promo redeem showing Plus without a restart). Promo codes in future:
Play Console → Monetize → Promo codes (store-generated; needs the subscription product), Apple → subscription → Offer codes; our server `PROMO_CODES_JSON` codes are for Android/web/testers only.

**Known loose ends / bugs found on 2 Oct (not fixed yet)**
- ~~CycleCard copy~~ and the other "stays on your phone" lines: fixed (`b9045a6`, `18fdfec`).
- `api/suggest-meals.js` and `api/scan-meal.js` still trust `appUserId` from the request body (not the verified session); `redeem-promo` still accepts a body-only account when no session is sent
  (builds ≤1.8). Tighten once old builds are gone.
- ~~Plus price fallback~~ fixed in `18fdfec` ("Price shown in the store"); E1 will rework the Plus price display anyway.
- The 4 React Compiler lint diagnostics in `App.tsx` (known, deferred). 1,264 tests pass.
- Vitals / HealthKit: AI meal ideas send steps, sleep and workouts (possibly Apple Health-derived) to Anthropic — disclosed in the policy and asked once (`kx_ai_ideas_consent`); Apple 5.1.3 may still
  raise it in review. Be ready to explain or to send fewer fields.

## Enhancement backlog (agreed with the user, 2 Oct 2026) — not started; pick one per conversation

Each item is a feature the user wants. Nothing here is built. Honour the working style above (one step per "go", tests first). Most of these touch health data: **update the privacy policy,
the Play data-safety / Health Connect declaration and the Apple privacy label in the same change**, and keep the "wellness, not medical advice" framing.

**E1. Plus intro offer £9.99 (instead of £14.99).** The user wants the apps to show an introductory price of **£9.99**, with marketing copy along the lines of **"Start your winter arc right away — just £9.99"**.
- Prices come from the store: configure an **introductory offer** on the subscription in Play Console (base plan → offers) and App Store Connect (introductory offer / promotional offer), then RevenueCat
  exposes it as `plusPackage.product.introPrice`; the Plus page already switches its button to "Start your free trial" when `introPrice` exists (`src/App.tsx` ~5499 — **change that wording**, it says "free trial").
- Replace the hard-coded GB fallback "£14.99 / month" (~5485) so the app never shows a price the store doesn't charge. Show both prices honestly: the intro price **and what it renews at / when**
  (store rules, UK consumer law). **Decide with the user:** is £9.99 for the first month or the first N months, and does it renew at £14.99/month?
- The website deliberately shows no price (a decision from 30 Sep); the Terms now say "the price … is shown in the app". Keep them consistent. Possibly a limited-time "winter" campaign: the copy is seasonal, so make it
  config, not code, and set an end date.

**E2. DONE in `b9045a6` (not deployed) — Coffee voucher worth £2.50, not £5.** Remaining for the user: confirm Tremendous supports a £2.50 denomination; check production `config:rewards` is still nil (it overrides the default). Original brief: Today the voucher is £5 (`voucherValueGBP: 5.00` in `api/_lib/rewardConfig.js`, sent to Tremendous as the order denomination in `api/redeem-voucher.js`; the website mirrors it
as `voucherValueGBP: 5` in `src/site/config.ts`, and tests assert the two agree: `src/site/rewards.test.ts`, `rewards.dom.test.ts` expects `'£5'`, `page.test.ts`). Change both to **2.5**, update the app and site copy
("£5 coffee"), the FAQ / rewards story numbers, and the error message in `redeem-voucher.js`. The points cost stays 1,000 (the same as a £2.50 charity donation — worth saying in the copy). A `config:rewards` value in
production Redis overrides the default (`GET config:rewards`; last checked 1 Oct: nil). Vouchers don't count against the £3 monthly donation cap; one voucher per month stays. Check Tremendous supports a £2.50 denomination.

**E3. Ask before logging a scanned food.** Today a photo / barcode / typed scan **logs the food immediately** (`showLoggedFood` → `logFood`, `finalizeScanResult` in `src/App.tsx` ~2727-2760) — but a scan doesn't mean the
person ate it. Change it: show the result card with **"Add to today" / "Not now"** (and the amount editor), and log only on confirm. Multi-food photos (several items under one meal) and the existing "unsure food → ask first"
flow should share one confirmation. **Decide:** when the once-a-day scan bonus (+2 points, `scan-meal.js`) and the "food checks" quest count (on the scan, or on Add — Add is harder to game), and what happens to
the day's free scan quota (a scan still costs one). Update the tests that pin the old contract (`api/__tests__/scan-meal.test.js` snapshots are what older apps rely on — the server contract can stay; this is mostly app-side).

**E4. Women's health inputs + AI insights + more accurate cycle prediction.** Collect how she's feeling (irritation, stomach pain / cramps, bloating, mood, fatigue, flow, headaches…), then give **food suggestions,
insights, and clear "see a doctor" guidance**, and **predict cycles more accurately**.
- Exists: `src/lib/cycle.ts` (average of the last 6 logged cycles ± a window, confidence, "late" notes, ovulation 14 days before the next period; sleep/training/eating/HRV shown as context only), `CycleCard.tsx`,
  `periodsSync.ts`, the gut check + "what went with better days" report. Predictions use only logged period dates today.
- Add: a short daily symptom check-in; deterministic **red-flag rules** for "consult a doctor" (severe pain, very heavy bleeding, bleeding between periods, missed periods > N cycles, pain + fever, etc. — rules,
  not an AI guess); food suggestions tied to symptoms and cycle phase (iron, magnesium, fibre, hydration — evidence-checked wording); better prediction from symptoms + resting HR / HRV / temperature when
  the phone provides them, irregular-cycle handling, widening confidence honestly.
- **AI + privacy:** the policy currently says period data is **not** sent to Anthropic. If AI sees any of it, change the policy first, get explicit consent in the app (like `kx_ai_ideas_consent`), send the least
  possible (coarse summaries, no name/email), and update the data-safety / Apple label. Period data is special-category data and is sensitive in the US (reproductive-health laws): keep it out of logs and analytics.
- **Medical-device line:** predictions and guidance must stay "wellness / not contraception / not diagnosis" (`cycle.ts` already says it isn't a way to prevent pregnancy). Get a clinician to review the red-flag copy.

**E5. Pregnancy support (there is none today).** No pregnancy option exists anywhere (only a "pregnancy-test note" when a period is late, `cycle.ts`; `nutrition.ts` notes targets are for adults and pregnancy changes them).
Add: a pregnancy mode (due date / weeks / trimester), pause cycle predictions, adjusted targets per **NHS guidance** (folic acid / folate, vitamin D, iron, calcium, no extra calories until the last trimester,
foods to avoid — alcohol, high-mercury fish, unpasteurised products, liver/pâté, raw eggs per UK rules), flags on scanned foods, safe-exercise guidance, "see your midwife / doctor" triggers, and postpartum / breastfeeding and
trying-to-conceive modes later. Clinical review needed; country-specific guidance (UK first).

**E6. Weekly AI insights** — gut health, hydration, sleep, nutrients, exercise (a weekly report; Plus candidates). Data exists on the account (`gut_checks`, `water_logs`, `vitals_history` for sleep/HR, `food_log_entries`
for nutrients vs targets, `workouts`). Compute the numbers deterministically first (on the phone or server), then have the AI write the narrative and suggestions from **aggregates only**; cache per user per week in Redis,
rate-limit, and consent once (as for meal ideas). Deliver as a Today/Account card + an optional weekly notification. Guardrails: wellness framing, "talk to a doctor" triggers for concerning patterns. Build on the
existing gut report's association logic (`src/lib/gut*`). Update the policy's Anthropic section when it ships.

**E7. Better food data: CoFID for the UK, IFCT for India, and a real nutrition backend.** USDA numbers differ a lot for Indian foods, so results feel off. Use **CoFID** (UK Composition of Foods Integrated Dataset,
McCance & Widdowson; UK Open Government Licence — check) for GB and **IFCT** (Indian Food Composition Tables 2017, ICMR-NIN — check usage terms) for India; keep USDA as a fallback and for other countries; tag every food with
its **source + confidence** and show it. Today: a ~135-food USDA table bundled in the app (`scripts/food-table/gen.py` generates it) and `api/_lib/nutrition.js` doing USDA FDC + Open Food Facts lookups and matching.
Plan the **backend architecture** properly: a nutrition service backed by Postgres (Supabase) tables — `food_items` (per-100 g nutrients, source, country), `food_aliases` (Hindi/regional/UK names: roti/chapati/phulka, curd/dahi,
aubergine/brinjal…), household **portion sizes** (katori, 1 roti, a slice, a cup), versioned imports, golden-value tests per food, search with `pg_trgm`, caching, an admin/import tool, and per-country DB selection with a fallback
chain. Mixed dishes: decompose with the AI then price each ingredient from the local table. This also fixes the "USDA isn't Indian" complaint from the 29 Sep food-scan work and supports E8. Other backend items to fold in
when this is done: server-computed streaks (points plan step 4), a SQL `points_balance` view (the ledger sum stops at 1,000 rows), verified-session auth on every endpoint, per-country reward config in the database, observability.

**E8. PARTLY DONE in `ed703f1` (light version, phone-side only, not device-tested) — Typos in food search.** Built: `src/lib/foodSuggest.ts` (+ test, 20 golden typos) compares the typed name with the food table and saved foods by edit distance (≤1 edit up to 8 letters, ≤2 beyond, none under 4; wrong first letter only for 1 edit in 6+ letters; silent when spelt right or when two foods tie) and `handleMealScan` in `src/App.tsx` shows "Did you mean X? [Yes] [No, search \"typed\"]" before any server call; the amount is kept. **Not done:** typos of foods outside the ~135-food table get no suggestion (needs E7's database + `pg_trgm`); typos inside multi-food meals; the server (`matchScore` whole-word rule in `api/_lib/nutrition.js` still matches a misspelling to a branded name if the server is reached, e.g. from old builds or the photo flow); no App-level UI test. Original brief: A typo can fail the lookup or, worse, match the wrong thing. Known: "chiken breast" / "bananna" fail safely ("Could not find nutrition data"), but **"avacado" matched a branded product
containing the same misspelling and logged 46 kcal/100 g (real avocado ≈ 160)** — a 3.5× undercount that was then saved to the saved-foods list. Cause: `matchScore()`'s whole-word rule in `api/_lib/nutrition.js`
matches a misspelled query to words in a branded product *name*. Fix: fuzzy-match the query against our canonical food names + aliases first (edit distance / trigram), ask **"Did you mean avocado?"** before logging, don't let
a typo'd generic query match branded names, and keep the plausibility check; add a golden test list of common typos (English + Indian food names). Do this with, or just before, E7.

**E9. DONE in `b9045a6` (not deployed; run `npm run build:web` before deploying) — Remove the ICO registration reference from the website (keep the company details).** Decided with the user (2 Oct): **do not remove** the company name, company number or registered office — UK law
(the Companies (Trading Disclosures) Regulations 2008, as far as we know) requires them on a company's website, and the privacy policy must identify the controller. **Remove only the ICO registration
reference `ZC236047`.** Where it is: `site/index.html:1478` (Trust list: "A UK company, registered with the ICO (ZC236047)" — reword to "A UK company" without the number) and `:1659` (footer: "ICO registration
ZC236047."), and `public/privacy-policy.html` (the controller paragraph: "registered with the UK Information Commissioner's Office (ICO), registration reference ZC236047"). Keep: company number 17268312 and the Sheffield
registered office (`site/index.html:1659`, `site/404.html:64`, both legal pages), and the policy's right to complain to the ICO (that names the regulator, not our number). Update any site test that asserts the ICO
string, bump the policy's "Last updated" date, and rebuild (`npm run build:web`). Small; can be done any time and deployed with the next website change.

**E10. Third-party continuous glucose monitors (CGMs).** The user's intent (2 Oct): let people who already **wear a third-party CGM** (Dexcom, FreeStyle Libre / Abbott, Medtronic and similar sensors worn on the
body) bring those readings into Kinetix Fit, so the app can use them to calculate how foods, meals, sleep and exercise affect glucose — **no hardware of our own**. The cleanest route is **Apple Health** (`bloodGlucose`)
and **Android Health Connect** (`READ_BLOOD_GLUCOSE` — currently *removed* in the manifest with `tools:node="remove"`, so it must be re-added and declared in Play), where the CGM's own app writes readings; direct vendor
APIs (Dexcom Developer API needs OAuth + approval; Libre has no public consumer API) come later, per vendor. Value: post-meal glucose response per food, spikes vs meals/sleep/exercise, insights in the weekly report (E6),
food suggestions tuned to the person's own response. Needs: a time-series store (readings every 1–5 min — don't put them in `vitals_history` as-is), sync, charts, **careful medical-device wording** (wellness only, no dosing or
diagnosis advice, "talk to your clinician"; vendors' own apps stay the source for alerts), a privacy policy + Play Health Connect declaration + Apple label update (glucose is health data), and the Android manifest change.
Plan after E7 (needs per-food nutrient quality) and E6.

**Suggested order** (the user decides): Step 5 of the store plan and the Play Console work first → E2 and E1 (small, commercial) → E3 (scan confirmation) → E8 + E7 (food accuracy) → E4 / E5 (women's health, with
clinical review and the privacy changes) → E6 (weekly insights) → E10 (CGM). E9 (just the ICO reference) is small and can ride along with any website deploy.

## Earlier status (2026-10-01, ~02:45) — superseded by the two sections above, kept for history

### 1 Oct ~02:45 — points work + entitlement fix are LIVE; 1.8 on the S21 FE and iPhone; Plus not showing after a promo (fix proposed, waiting on "go")
- **PR #5 (server-authoritative points, coffee = 1,000) and PR #6 (entitlement fix) are merged and deployed.** Server before app: done.
- **RevenueCat entitlement identifier is `kinetixfit_pro`** (display name "KinetixFit Pro"; 3 products attached; created 23 Aug). The code used
  the display name in `src/lib/plus.ts` and `api/_lib/plus.js`, so promo grants and the server Plus check could never match — fixed in PR #6
  (+ `api/__tests__/redeem-promo.test.js`, 5 tests; 1,214 tests pass). The `default` offering has **no packages** (`packages: []`, checked via the
  public key) — real purchases need the Play subscription product attached to it (still open).
- **`REVENUECAT_API_KEY` in Vercel was invalid** (RevenueCat code 7225 "Invalid API Key") — replaced by the user on 1 Oct; promo grants work now.
  Secrets are write-only in Vercel (dashboard, CLI, `env pull`): nobody can read `PROMO_CODES_JSON` / `REVENUECAT_API_KEY` back, and `vercel env ls`'s
  "age" column does not change when a value is edited — probe the live endpoint instead: a fake code → `400 Invalid promo code` = config parses;
  `500 Promo code configuration is invalid` = the JSON is malformed (curly quotes, a `KEY=` prefix, a trailing comma); `502 … Invalid API Key` = bad RevenueCat key.
- **Promo codes** (`api/redeem-promo.js`): hand-written in the `PROMO_CODES_JSON` env var (`{"CODE": "30day" | "lifetime"}`), **not auto-generated**;
  each code works **once in total** (Redis `promo_used:<CODE>`, written only after RevenueCat accepts the grant; `keys promo_used:*` in the Upstash
  CLI — empty until one is redeemed). Nothing limits one *person* to one code. `KXFIT-TEST-30` was redeemed on the S21 FE (Plus until 1 Nov 2026).
  A batch of 10 fresh `KX-XXXX-XXXX` 30day codes was generated for the user to paste into `PROMO_CODES_JSON` (replaces the old value — keep a private copy);
  **the user has to set it + redeploy** (Claude can't touch secrets). Redeem is unauthenticated (trusts `appUserId`) — add session verification if wanted.
  Play Console promo codes (store-generated, compliant with Apple 3.1.1 / Google) are the long-term route, once the subscription product exists.
- **2 Oct — Step 1 of the store-readiness plan is coded, tested, NOT committed or deployed** (plan: `~/.claude/plans/go-ahead-with-step-sequential-truffle.md`;
  steps 2 account deletion, 3 privacy policy + iOS privacy manifest, 4 store-policy app fixes, 5 store answer sheet follow, one per "go"). New
  `api/plus-status.js` (verified session → `plusStatus()` in `api/_lib/plus.js`, 502 `PLAN_UNKNOWN` when RevenueCat is down); the app asks on
  open/resume and after a promo (`src/lib/plusStatus.ts`; `plusFromServer` is now `boolean | null`, null = unknown); `redeem-promo` uses the session's
  email and refuses a body naming someone else (no session = old behaviour, for builds ≤1.8); `api/verify-license.js` deleted; logout calls
  `Purchases.logOut()`. 1,242 tests pass. **Deploy the server before any app build.** RevenueCat has **no iOS app yet** (needs the paid Apple account).
- **2 Oct — Step 2 (account deletion) coded + committed, NOT deployed:** Account → Your data & privacy → **Delete account or data** (sheet: *delete my data,
  keep my account* / *delete my account and all my data*, then a confirm dialog that says a store subscription is not cancelled). `api/delete-account.js`
  (verified session only; `{mode:'account'|'data', confirm:true}`): Redis personal keys by email (`api/_lib/accountData.js`), RevenueCat subscriber DELETE
  (account mode), then Postgres (13 tables by `user_id` in data mode; `auth.admin.deleteUser` cascade in account mode, last and only if nothing failed → retry-safe).
  **Deliberately kept:** the short-lived anti-abuse counters (`scans:`, `voucher_count:`, `redemption_total:`, `donation_count:`, `earn_event_count:`,
  `quest_award:`, `meal_scan_points_awarded:` — numbers only, ≤35 days) so delete + re-signup can't give a second voucher / fresh scans; `promo_used:<CODE>` stays
  but the email is blanked. The phone is wiped only after the server says OK (`endSession` in App.tsx, shared with logout; also cancels reminders, clears widgets,
  forgets `kinetix_onboarded_email`, `signOut({scope:'local'})`). `public/delete-account.html` at `/delete-account` is the web URL for Play's data-safety form.
  Tested: 1,261 tests, browser check of the sheet/confirm/no-session path (mocked server). **Not tested:** the success path on a real phone with a throwaway
  account (needs the server deployed) — check Supabase rows, `keys *<email>*` in Upstash, RevenueCat, then sign-in again after "keep my account".
  The page's "backups overwritten within 30 days" line is an assumption — confirm against Supabase's plan.
- **2 Oct — Step 3 (privacy policy, terms, iOS privacy manifest) done, NOT deployed.** `public/privacy-policy.html` rewritten (last updated 2 Oct): adds Supabase,
  period + gut-check + water/workout/check-in + vitals-history data, country/time zone (no GPS), exactly what Anthropic receives (meal photos; for AI meal ideas goal/sex/age/
  height/weight/diet/allergies/targets/today's food/steps/workouts/sleep — never name, email, period or gut data), ML Kit diagnostics, retention table (incl. the ≤35-day
  anti-abuse counters kept after deletion), in-app deletion + `/delete-account`, rights incl. EEA and US-state wording, "no sale / no advertising / no ad trackers"; Oura
  removed (no code uses it). Terms: no fixed £14.99 (price is shown in the app), trial + 24-hour cancel wording, promo-code clause, voucher/donation wording (the old £3
  cap line is gone), deletion ≠ cancelling a subscription. iOS: `PrivacyInfo.xcprivacy` for the app (collected: name, email, user id, health, fitness, purchase history,
  other user content — linked, no tracking) and the widget extension (App Group UserDefaults, reason 1C8F.1), both added to `project.pbxproj` and checked in a simulator build;
  `NSHealthUpdateUsageDescription` removed (the app only reads; the plugin gets an empty write list). Android Health Connect privacy URL now uses `www`.
  **The user must read the policy before it deploys** (a legal text). Still to confirm: the "backups overwritten within 30 days" line (Supabase plan), and whether sending
  Apple Health–derived steps/sleep/workouts to Anthropic for AI meal ideas is acceptable under Apple's HealthKit rules (5.1.3) — consider asking before the first send.
- **2 Oct — Step 4 (store-policy app fixes) done + committed, NOT deployed; version is now 1.9 / versionCode 10** (`KinetixFit-builds/Kinetix-Fit-1.9.aab`, signed with the
  upload key; 1.8.aab is superseded). Age picker minimum 16 (matches the Terms). **No `SCHEDULE_EXACT_ALARM`** (removed from the manifest; `scheduleNotifications` passes
  `isExactNotification: false` — without that flag the notifications plugin opens Android's "Alarms & reminders" screen when the permission is missing — so reminders may
  arrive a few minutes late; **check on the S21 FE that water/gut/streak reminders still fire**). `allowBackup="false"`. Account → Get help now opens the person's own
  email app with the message ready (it used to say "Message sent" and send nothing; the email field is gone). Promo codes hidden on iOS (`promoCodesAllowed`; Apple wants its own
  offer codes). AI meal ideas ask once per account before the first send (`kx_ai_ideas_consent`, in `ACCOUNT_DATA_KEYS`). 1,264 tests. Not checked on a device: reminders after
  the exact-alarm change, the mailto handoff on a phone, the consent dialog (Plus-only screen). Noted, not changed: `api/suggest-meals.js` still trusts the body's `appUserId`.
- **(Fixed in code 2 Oct, see above) Open bug — Plus doesn't show right after a promo:** the grant lands in RevenueCat, but the app only reads it through the RevenueCat SDK. The
  **iPhone has no `VITE_REVENUECAT_IOS_PUBLIC_KEY`**, so `Purchases` isn't configured and `refreshRevenueCatStatus()` returns early; the Android SDK's
  cached customer info showed "Free plan" until an app restart. Proposed fix (user hasn't said "go"): new authenticated `api/plus-status` (session → `isPlusUser`
  fresh + expiry), called after a promo, after sign-in and on resume, feeding `plusFromServer`. Also: `api/verify-license.js` has **no auth** and returns any
  user's full RevenueCat subscriber record (unused by the app) — remove it or require a session.
- **Builds:** `android/app/build.gradle` is `versionCode 9` / `"1.8"` on the **local branch `chore/v1.8`, uncommitted**. `KinetixFit-builds/Kinetix-Fit-1.8.apk`
  (debug, 1 Oct 02:02) is on the **S21 FE** (data kept; Plus via the test code; points 12, server restore of points/XP/claims confirmed after a restart).
  **iPhone 13 mini** got a fresh build at ~02:30 (profile valid until ~8 Oct); iOS marketing version is still 1.0. A55 still 1.6.
- **Still to do on the S21 FE:** morning check-in (+5/+10 XP → `points_ledger`), first food check of the day (+2), a quest claim, logout → sign-in, voucher/donation
  refusal below 1,000 points (the account has 12). Then release signing (no keystore yet) → `bundleRelease` AAB → Play internal testing.

### Next steps to publish to Google Play (in order — the user's plan, 1 Oct)

Everything below was **merged (PR #5) and deployed on 1 Oct**; step 1 is done.
1. ~~**Push `initial-changes`, open a PR into `main`, merge it.**~~ Vercel deploys the server from `main` — wait for the preview to be
   green first. **Server before app**: the new endpoints (`claim-checkins`, the ledger-backed `redeem-voucher` / `donate-charity`,
   quest table) must be live before any app build that calls them ships, or a phone's local points can be absorbed by the
   higher server total (see Deploy order below). No Supabase migration is needed (the 13 tables from `0001` are already live).
2. **Bump the version and build the release.** `android/app/build.gradle` is still `versionCode 8` / `"1.7"` → `9` / `"1.8"`.
   **Release signing is not set up** (no keystore in the repo — `*.jks`/`*.keystore` are gitignored on purpose): create an
   upload keystore + `signingConfigs` (back the key up — losing it means no more updates under this app ID), then
   `npm run build && npx cap sync android && cd android && ./gradlew bundleRelease` (Play needs the AAB). Use the `JAVA_HOME` from `~/.zshrc` (the system JDK 11 fails Gradle).
3. **Test against the deployed server, then upload.** On a phone (S21 FE `RZCT815G2ND`, `adb`; `uiautomator dump` for tap
   coordinates; WebView is debuggable over `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` for reading
   localStorage/network), with a real account: a morning check-in (+5 pts/+10 XP should reach `points_ledger`), the first food
   check of the day (+2), a quest claim, logout → sign-in (points/XP/claims must come back), and — with Plus and ≥1,000 points —
   a voucher/donation refusal below the balance. Then upload to the Play Console (internal testing first).
   **User actions still open:** Play Console Health Connect data-use declaration + data-safety form + privacy-policy URL;
   Supabase SMTP; RevenueCat/Play products for real purchases (see Android checklist below).
Checked already: production Redis has no `config:rewards` key, so the coffee voucher really is 1,000 points live.
Not needed for launch: step 4 of the points plan (server-computed streak display) and a SQL `points_balance` view (the ledger sum
fails closed at 1,000 rows per account, ~4 months of heavy use — add the view before then).

**1 Oct: points are server-authoritative ("phase 9"): steps 1–3 of 4 done and committed, not pushed or deployed; step 4 (streaks) is optional.**
The S21 FE test of the live sync (30 Sep, see "Backend database sync") passed: login, offline queue + flush, logout wipe,
re-login restore, quest claims. It found bugs, all fixed in the working tree: (1) a 409 on a quest claim left it stuck on
"tap to claim" → now shown as claimed; (2) claims made elsewhere weren't restored → `src/lib/questClaims.ts` reads today's
`quest_claims` (UTC day, as the server files them) after sign-in; (3) logout left points/XP/claims in memory → the app
reloads after logout; (4) the dashboard stayed empty after sign-in until a restart (App-level state is read from storage
once) → a sign-in that lands on Today reloads once (`syncThenContinue`). **Why points matter:** `api/redeem-voucher.js`
used to trust a client-sent `pointBalance`. Plan, one step each: **(1, done)** vouchers + donations require a verified session
and read the balance from `points_ledger` (`api/_lib/pointsLedger.js`; older builds get 401 `AUTH_REQUIRED`); **(2, done)** the
server writes every earn to the ledger: quest claims (+ level-ups), the once-a-day scan bonus (`scan-meal.js`), check-ins +
the 7-day streak bonus (`api/claim-checkins.js`, sent by `src/lib/checkinClaims.ts` after a check-in and on every app resume);
**(3, done)** after sign-in and on every app resume the phone reads its `points_ledger` totals (`src/lib/ledgerBalance.ts`) and keeps the higher of its own and the server's points/XP (never lowers; level follows XP) — verified on the S21 FE: after a logout wipe + sign-in it shows the server's 7 pts / 25 XP; **(4, todo)** streaks computed on the server. Ledger sum reads stop at 1,000 rows (PostgREST page) and
then fail closed — a SQL sum/view would lift that. **Coffee voucher is now 1,000 points** (was 1,500; same as a charity
donation): server default, `VOUCHER_POINTS`, website config/story/FAQ all updated — production Redis has no
`config:rewards` key (checked 1 Oct: `GET` → nil), so the code defaults apply (voucher 1,000, donation 1,000, scan bonus 2). **Before deploying steps 1–2:** the server then
refuses redemption without a token (builds ≤1.7), and only quest points are in the ledger for accounts that earned scan/check-in
points before (step 3 and a backfill decision). **1 Oct, pre-Play-Store:** quest claims are now paid from the server's own table (`api/_lib/quests.js`, parity-tested against
`src/lib/quests.ts`; unknown ids → 400, request points/XP/verification type ignored) and the voucher goes to the verified session's
email, never the request body (`verifiedUser` in `supabaseAuth.js`).
**Deploy order:** server (steps 1–2) first, then app builds, or points a phone earned locally but the server never recorded (e.g. a check-in whose `claim-checkins` call 404'd) are absorbed by the higher server total. Tests: 1,209 pass; lint = the same 4 React Compiler diagnostics.

## Earlier status (2026-09-30, ~04:00)

**Backend database sync is now LIVE in production (2026-09-30).** PR #4 ("Sync all account data to
Supabase, server-authoritative quest claims") merged into `main`. The production Supabase project
(ref `qlsdmczmnmsjhqptnkym`) has the full 13-table schema applied and `SUPABASE_SERVICE_ROLE_KEY` is set
in Vercel. The backfill-flag bug (`pushAllKeyed`/`syncAllOnLogin` in `src/lib/sync.ts` marking a domain
backfilled even when its one-time push failed) was found and fixed before merging — see "Backend database
sync" under Roadmap below for the full architecture, schema, known limitations, and device-verification
history (this used to live in a separate `plan.md`, now folded in here and deleted since the work is
done). **Not yet done: validating the live production behavior** — the whole thing was verified against a
**test** Supabase project only; nothing has confirmed yet that a real device signs in, syncs, and wipes
correctly against the **production** project now that it's live. That's the immediate next step.
Two decisions were reviewed and **deliberately deferred**, not forgotten:
- **The 4 React Compiler lint diagnostics in `App.tsx`** all trace to one root cause: `todayDateKey`
  (`const todayDateKey = localDayKey();`, line 1647) is recomputed fresh every render rather than
  memoized, so the compiler can't prove it's a stable `useMemo` dependency (flagged at the `foodLog`
  memo, line 1729, and the gut-report memo, line 2001) — and separately, `rewardCheckIns` (declared line
  1563) is called from `submitCheckIn` (line 1112) earlier in the file, a forward-reference the compiler
  also flags. A real fix means memoizing `todayDateKey` and/or reordering `rewardCheckIns`, touching
  ~25 call sites of `todayDateKey` across the file — deferred as lint-only, non-runtime-affecting
  (`tsc -b`, both builds, and all tests are unaffected).
- **Widening phase 9** (server-authoritative points/streaks) beyond the current "durable dedup + session
  verification" scope, to authoritative running totals + server-computed streaks — deferred as a separate,
  broader feature that would touch the Rewards UI widely, not a fix for anything currently broken.

**Production** = PR #3 merged (`984c4c8`, 2026-09-29 ~19:03): the website redesign, the food-scan fix (steps 0-6) and
the 27–30 Sep app batch are now live — see the bullet below for what that included. PR #2 = `bf46d08` (2026-09-26,
the app pass + the non-fatal `scan-meal` points fix). PR #1 = `d066406`. Restore point: tag `pre-redesign` = `a900b56`
(or Vercel → Deployments → Instant Rollback). Production Redis fixed 2026-09-27 (see Environment variables);
`curl -X POST https://www.kinetixfit.co.uk/api/sync-health-data -H 'Content-Type: application/json' -d '{"appUserId":"test@example.invalid","steps":1}'`
returns `{"success":true}`.

**30 Sep ~04:00: v1.7 regression report investigated, not yet reproduced — barcode and photo scanning both work on the
S21 FE against the now-merged production server.** The user reported "missing capture button" in barcode scanning and
failed photo scans in v1.7 (they connected the S21 FE, `adb`-driven). Live-tested end to end (screenshots + logcat,
`uiautomator dump` for exact tap coordinates — screenshot pixel positions do **not** map 1:1 to `adb shell input tap`
coordinates without checking real bounds first): the Today camera FAB opens the "Scan food" modal correctly; **"Scan
barcode" launches the native `OSBARCScannerActivity` scanner** — it has no manual shutter button, but that's the
continuous-auto-detect design of `@capacitor/barcode-scanner` and `handleBarcodeScan()` is unchanged since v1.6, so
it isn't a new regression; **"Take a photo" opens the real system camera with a visible shutter button** and works.
No crash, no error in `Capacitor/Console` logs either time. Camera permission is granted. Did not take/submit a real
photo or scan a real barcode (would spend the day's photo/barcode quota and, for photos, a real Claude API call —
holding off without the user's OK). **Still open: get the user's exact reproduction steps** (which device — S21 FE /
A55 / iPhone — and what exactly was missing/failed) before changing any scanning code; two broad guesses were already
ruled out live rather than acted on blind.
**Also found while probing (not part of the original ask, user asked to explore it):** the **"Check a food" typed
search has a real accuracy bug** — correctly spelled foods match well (banana 105 kcal/118 g, avocado 322 kcal/201 g,
chicken breast 165 kcal/100 g, roti 202 kcal/68 g, watermelon piece 30 kcal/100 g all check out against USDA), and an
unrecognised typo fails safely ("chiken breast", "bananna" → "Could not find nutrition data for…"), **but "avacado"
(typo) matched a branded product whose name contains the same typo** ("EVOLUTION FRESH, ORGANIC AVOCADO GREENS,
AVACADO, AVACADO") and returned 46 kcal/100 g — a 3.5× undercount of real avocado (~160 kcal/100 g) — with no warning,
and it got saved to the phone's saved-foods list, so it would keep returning the wrong number on reuse. Root cause:
`matchScore()`'s whole-word rule in `api/_lib/nutrition.js` matches a misspelled query against whole words in a
branded product's *name*, and this product happens to contain the same misspelling. Not yet fixed — **waiting on the
user's decision** whether to fold this into the current scanning-regression work or track it separately.

**30 Sep ~01:00: the whole batch (~313 paths / 405 files) is committed on `initial-changes` and was merged into `main`
via PR #3 (see above).** Before that, nothing had been pushed since PR #2 (`b73a8e6`). Lint 0,
**`npm test` 1,068 tests pass** (`src/lib` + `src/site` + `api/__tests__`); `tsc -b`, `npm run build`, `cap sync` (Android + iOS) and
`assembleDebug` pass (29 Sep, with the whole food-scan fix and the amount fix; the iOS simulator build is from before the
28 Sep late-evening batch). **The food-scan fix: steps 0-6 shipped to production with PR #3. The real-photo preview
test (step 7's last item — real Claude API credits) was never run before merging; production is now getting real
photos from real users instead**, so the 30 Sep regression report above is the first real-world signal since the merge.
**Now live (since the PR #3 merge):** the food-scan fix (photo scans that failed whenever Claude thought, one food per photo,
watermelon slice → candy, curd → soybean curd), the food lookup accuracy fix (banana no longer logs as 152 g carbs), vegetarian
meal ideas + barcode status, AI meal ideas returning 9 (paged 3 at a time) and never repeating, the smaller rewards
(quest claims capped at 10 points / 40 XP, first scan 2 points), **the 1,500-point voucher** (the live server now accepts
it at 1,500, not 2,500), UK days → the phone's own day,
country checks, **AI meal ideas by country (Indian only in India, never beef) and typed allergies**, the privacy
policy listing the new health data, and more. **A `config:rewards` value in production Redis overrides `mealScanPointsAward` and
`voucherPointsCost`** — worth checking (the app deducts whatever the server says it took).
**APK 1.7** (versionCode 8, 29 Sep 03:55) is in `Claude Space/KinetixFit-builds/Kinetix-Fit-1.7.apk`: 1.6 + the
food-scan fix's app side (several foods per photo, typed meals, ml by density, the saved-food guard) + the amount fix
(29 Sep, below). It now talks to the merged production server (the new food-scan/photo/barcode behaviour applies) —
this is the build the 30 Sep regression report and investigation above are both about. **APK 1.6** (versionCode 7, 28 Sep 21:56) is the previous one (1.5 from 21:39 said "Calories burned"
for Samsung's workout calories; 1.4 lacks the late-evening list) — debug builds signed with this Mac's debug key like
1.2, so each installs over older ones and keeps data.

### What's in the uncommitted batch (details in the Roadmap sections named in brackets)
- **29–30 Sep — website redesign, all 4 steps done** (the user: the hero phone's Hydration / Steps /
  Quests cards weren't the app's and weren't attractive; nothing moves when the site opens; features under-sold —
  nutrients from the body/BMI, AI meal ideas from what's left of the day, periods, barcodes, workouts without a watch ("no
  watch, no problem"), premium widgets). Agreed plan, one step per "go": **(1) opening animation + an app-accurate live
  phone in the hero (done)**, **(2) feature sections (done)**, **(3) a widgets showcase (done, 29 Sep ~21:20)**, **(4) scroll
  animations elsewhere + a shorter day timeline + checks (done, 30 Sep ~00:30)**. **Step 4:** "Your day" is four moments
  that nothing else shows — 07:10 check-in, 08:40 synced health, 15:30 **"A nudge to move"** (the app's own movement
  break notification, "Time to stretch your legs", with its badge; 45 min – 2 h, Android waits for stillness, water
  reminders' Add a glass) and 20:00 gut check (lunch → Features 03, the water widget → Widgets and 21:30 points → Rewards
  were dropped); its lane **fills in clay as you read down it and each time lights up once reached** (`src/site/day.ts`,
  scroll-linked both ways). "Also in Kinetix Fit" = Allergies and diet, **Made for where you live** (nine countries),
  Levels and achievements (3 columns). More motion: the Plans' app icons pop in one by one, the Trust promises rise with
  their ticks/locks drawing, the FAQ questions arrive in turn, the early access panel draws its track and a runner
  laps it once. **How it works now says "Four steps. Start where you are."** (the user: remove the text that says a gym
  is required; tested: no "gym" anywhere). 37 unused card rules removed (~4.5 KB). Checked: 1,068 tests, lint, tsc, both
  builds, **47/47 browser checks in Chromium and WebKit**, Lighthouse mobile 92/95/95 (the first, cold run lowest, as
  before), desktop 98, the rest 100. **Open decision (asked 29 Sep, unanswered):** chapter 02 shows Maya the Plus upsell
  (so she looks Free) while her widgets home screen uses Quick log (Plus) — keep, or swap in Water quick add (free).
  **Step 3: a new `#widgets` section,
  "Glance. Tap. Done.", between Features and "Your day"**: a phone home screen (the hero's phone frame) plays Maya's
  15:30 — her Daily rings close, + on the Water glass (1.25 → 1.5 L), 500 ml on Quick log (2 L, "Goal reached", the
  water ring closes; `TIMELINES.widgets` in features.ts); a **Light / Dark switch** (two radios; `src/site/widgets.ts`
  sets `data-wtheme`, cross-fading with a view transition where there is one; without JS, CSS reads the radio via
  `:has`); and **all 14 widgets on one wall, each marked Free or Plus** (desktop 5 columns, tablet 4, phones two rows
  that scroll sideways). The widgets are drawn from the iPhone widgets' own code (WidgetViews.swift: colours, sizes,
  wording, the glass/bottle/wave art ported to SVG), not the app's simpler Account → Widgets previews. The old stack of
  three plain widgets beside "Also in Kinetix Fit" is gone (the list is one full-width grid now: 2 columns from 560px,
  3 from 1,040px). **Also fixed (a latent Safari bug):** the site's script now waits for the stylesheet if it's still
  loading — Safari ran the script first and kept the footer's text black (the axe flake noted in step 2). Checked:
  1,060 tests (27 new in `widgets.test.ts`: every widget name/tier/description vs `WIDGETS`, every number vs the app's
  code, words and colours vs WidgetViews.swift / WidgetStore.swift; 3 new in `init.test.ts`), lint, tsc, both builds (no
  site code in the app build), **45/45 browser checks in Chromium and WebKit** (new: the home screen's story, the
  switch by mouse and keyboard, the phone wall as a keyboard stop, axe in the dark look), Lighthouse mobile 92–95
  (step 2: 94–96; ~10 KB more compressed page + CSS costs a point of Speed Index), desktop 98, the rest 100. (Step 4
  then took the water widget out of the day and widgets / meal ideas / periods out of "Also in Kinetix Fit".) Step 1: the app's launch intro at page size (`src/site/intro.ts`, once a visit, shared
  `kx_intro_seen` flag with the web app), the hero phone rebuilt from the app's own CSS as a looping "screen recording"
  (`src/site/demo.ts`: Today → water added → Rewards quest claimed → Nourish nutrients → Today), two floating home-screen
  widgets beside it, a feature ticker under the hero, new hero copy. **Step 2 (29 Sep ~15:45): a new `#features` section,
  "Built around you.", right after Why** — five chapters, each copy + a stage where the app's real card plays
  (`src/site/features.ts`): 01 Nutrition (Maya's plan from her BMI → Nourish's 11 nutrients needed vs eaten), 02 Meal
  ideas (her ranked dinner ideas from `rankMeals`, Show 3 more, the AI ideas tab for Plus), 03 Food logging (the app's scan
  animation → houmous caught for sesame; a photo of salmon, sweet potato and broccoli as 3 foods; "2 roti and dal" typed),
  04 Cycle (her card walking through the month, `cycleToday`), 05 "No watch? No problem." (steps from the phone, Add a
  workout → yoga 45 min, with the app's note that added workouts never earn points). The old "One app for the whole day"
  timeline is now `#day` (eyebrow "Your day"), untouched then (step 4 shortened it and its "Also in Kinetix Fit"
  grid). The hero's "2 roti · 136 g" became the app's "2 rotis · 136 g".
  Checked: 1,026 tests (50 new in `features.test.ts`: every number and app string in the chapters against the app's own
  code/sources), lint, tsc, both builds (no site code in the app build), 42/42 browser checks in Chromium and WebKit
  (axe 0), Lighthouse mobile 94/96/96, desktop 98 (100 with the intro skipped: the intro holds the first screen). Seen in
  the app while copying it (not changed; app work, the user decides): Nourish's ideas line reads "… and 0 g fibre to go"
  once fibre is met; meal result titles are `text-transform: capitalize` ("Salmon With Sweet Potato And Broccoli", "2 Roti
  And Dal"); the Hydration card wraps "1.25" and "L" at 390px (found in step 1). [Website]
- **29 Sep (morning) — the website's own design** (the user: a premium UK fitness-tech landing page that markets the
  vision, features, journey and rewards, "not a replica of the app"). **The marketing site is at `/` and the web app
  moved to `/app/`** — only on the website: `npm run build` (the apps) is unchanged (its JS/CSS/index.html were checked
  byte-identical before/after). Built from `site/` + `src/site/` (plain HTML + small TypeScript, no React on the site):
  hero "Small wins. Real rewards." (Archivo's width axis: condensed → wide), Why, a day with Kinetix Fit (features as a
  07:10 → 21:30 timeline with the app's cards), widgets + also, "Slow progress is still progress", **Rewards** (a
  floodlit section where a coffee cup fills as an example run of small wins scrolls past: 5 → … → 1,000 charity →
  1,500 coffee, numbers checked against the app's rules), How it works, Plans (Free / Plus, the real app icons, no
  price), Trust, FAQ, early access form, footer (company, ICO, legal, share links). Details: Roadmap → Website.
  New endpoint **`api/early-access.js`** (the form; Upstash Redis) and a short **privacy policy** addition for it.
  Checked: 113 site unit/DOM tests + 11 endpoint tests, 35 end-to-end checks (`scripts/site-check/`) on the Vercel-like
  build in Chromium and WebKit (routing, forwarder, nav, menu, form with mocked answers, the rewards story, reduced
  motion, 23 screen sizes, axe WCAG 2.2 AA: 0 issues), Lighthouse 99/100/100/100 on mobile and 100 × 4 on desktop.
  Not yet: a real iPhone/Android browser, the endpoint against real Redis (needs a deploy). [Website]
- **29 Sep (early morning) — amounts that didn't stick** (the user: "I kept 5 grams for pickle and updated it but it is
  showing 100 g"). Two causes, both reproduced: (1) typing **"pickle 5g"** — an amount after the name — looked up "pickle
  5g", logged 100 g and saved a food called "pickle 5g"; `parseTypedPortion` now reads amounts after the name when they
  have a unit ("rice (150 g)", "milk - 200 ml", "bread 2 slices"; "chicken 65" / "omega 3" stay names). (2) the edit
  sheet's amount box (`FoodEntrySheet`) silently dropped a typed amount outside 5 g – 5 kg and saved the old one (a typed
  "2" g stayed 100 g); on a phone the tap can undo its "select all", so a typed 5 could join the old 100 and be dropped
  the same way. Now the box empties when tapped (the amount shows as its placeholder; left empty, nothing changes), every
  typed number counts (kept within 1 g – 5 kg / 0.5 – 50 units, shown before saving), and the minimum is 1 g. [Food logging]
- **29 Sep (night) — the food-scan fix, steps 0-6 of 7 + step 7's local checks** (the user: high protein on foods with little, a milk + muesli
  bowl logged as one food with no amounts, a watermelon slice failing, "is it because USDA isn't Indian?", Claude's
  cost). The approved plan is `~/.claude/plans/it-s-not-working-as-tidy-music.md`; the user approves **one step at a
  time** and wants each step's files, behaviour changes and limitations reported. Causes found: the photo call read
  `content[0].text` while Sonnet 5 thinks by default (a thinking block first → "Meal scan failed"); one food per photo ×
  the whole bowl's weight; the USDA matcher needing every word ("watermelon slice" → a branded candy, 207 kcal) and
  matching word starts ("chai" → "Chain"); branded results never checked; the server never used the app's food table.
  Done: **(1)** tests pinning the old contract (`api/__tests__/`); **(2)** SDK call, structured output, thinking off,
  effort low, every text block read, cut-off 502 / refused 422 not counted; **(3)** the table on the server too,
  normalised names, whole-word matching, no sweets for foods, branded ml drinks per 100 ml, densities; **(4)** several
  foods per photo in the one call, each looked up on its own (`items[]`, old fields kept); **(5)** the app logs each food
  as its own entry under one meal, asks before logging unsure foods, labels guessed amounts, ml by density; **(6)** typed
  meals split on the phone ("muesli with milk and banana", "2 roti and dal"), each food its own entry under one meal;
  **(7, local)** tests, lint, tsc, build, `cap sync`, `assembleDebug` and 31 browser checks with every server answer
  mocked. **Left — only with the user's explicit OK, because it spends real Claude API credits** (they're on free
  credits; never call the real Claude or USDA API without it): a commit + push → the Vercel preview with real photos and
  the real Claude API (not yet run anywhere: no key on this Mac), reporting the exact `scan-meal usage` tokens; then
  APK 1.7 (versionCode 8) on the A55, then these docs again. [Food logging]
- **28 Sep (late evening) — the user's third list** (APK 1.5, then 1.6 after checking it on the A55):
  - **Heart rate sat on "Waiting"**: the live read only looked at the last 10 minutes (watches sync in batches), and on
    Android the plugin's `readSamples({ limit: 1, ascending: false })` returns the newest sample of the *oldest* record in
    the window (it reads oldest first and cuts at `limit` before sorting) — HRV had the same bug. Now the newest reading of
    the last day with its time ("72 bpm · at 14:05"), today's range + average, resting heart rate when the source gives it
    (`readLatestHeartRate` / `readLatest` in App.tsx, `src/lib/vitals.ts`). [Today → Body and vitals]
  - **More health data**: a **Body and vitals** card (`VitalsCard`: resting heart rate, blood oxygen, breathing rate,
    blood pressure, VO₂ max, weight + BMI, body fat — only what exists, with typical ranges) and **distance + calories**
    in the Steps card ("Workout calories" when the records only cover workouts — Samsung Health's total-calories records
    are exactly its workouts; `caloriesToday`). Today's steps bar now follows the live count. 9 new Health Connect read types (`MORE_HEALTH_TYPES`), asked once for older connections
    (`kx_more_health_asked`, "Allow in Health Connect" on the card). **Play Console's health declaration must list them.**
  - **Allergies**: vegetarians aren't offered fish / shellfish (no-egg: eggs) unless already picked; **type your own**
    ("kiwi", "strawberries"; "shellfish"/"gluten"/"soy" become label allergens) — `src/lib/allergens.ts`,
    `AllergyPicker` on onboarding and Account. Food checks, meal ideas, the gut report and AI ideas all use them.
    [Food logging → Allergens]
  - **Gut check timing**: it's about the whole day, so the card says "Best in the evening" (+ the 20:00 reminder); in the
    morning, "Missed last night? Add yesterday's" logs yesterday. [Gut health and diet]
  - **Meal ideas by country**: each country gets only its own dishes — **India Indian only, never beef**; the UAE
    Middle Eastern, Mediterranean, Indian, never pork; Singapore its own + Asian + Indian; the West its everyday list.
    ~35 new Indian meals, 11 UAE, 11 Singapore (117 in all); 42 new USDA foods (135) from `scripts/food-table/gen.py`
    (now in the repo). AI ideas follow the same rules (server prompt + filter, and the phone filters too). [Meal ideas]
- **28 Sep (night) — sign-up emails** (a tester's confirmation email only came after several tries) [Sign-up and
  account emails]: sign-up with an email that already has an account now says so (Supabase sends nothing then, yet the
  app said "check your email"); **Send the confirmation email again** on Log in (60 s apart), also offered when logging
  in unconfirmed; Supabase errors in plain words (`src/lib/auth.ts`); the confirmation link lands on
  `/email-confirmed` (new `public/email-confirmed.html`); **Forgot password** now works — the reset link opens the web
  app's "Choose a new password" form (it used to just log them in on the website). The root cause of slow / missing
  emails is Supabase's built-in email sender — needs the user's dashboard (below).
- **28 Sep (night) — no Health Connect on the phone** (a tester with Google Fit couldn't connect): Connect now opens
  `HealthConnectSheet` — "Get Health Connect" (Play Store) + "I've installed it", with a Google Fit note; or, on Android
  < 9, why it can't work (`src/lib/healthConnect.ts`). It used to flash a two-second error.
- **28 Sep (evening) — coffee voucher 1,500 points** (was 2,500; user's decision): `VOUCHER_POINTS` in
  `src/lib/points.ts` = `voucherPointsCost` in `api/_lib/rewardConfig.js` (a test compares them). Still one a month (Plus).
- **28 Sep (evening) — the user's second list of changes:**
  - **Water glass widget** (was "Liquid glass (test)", which the user called "straight up just glass"): a clear
    tumbler that fills with today's water (`WidgetArt.waterGlass` on Android, `WaterGlassArt` Canvas on iOS, an SVG in
    the app's preview) on the frosted card, amount + "of 2 L · 3 glasses to go" + next reminder, the glossy water +.
    Class/kind `GlassWidget` kept so placed widgets survive. [Today, quests, reminders, widgets]
  - **KX icons:** KX Luxe and KX Neon replaced by **KX Monogram** (K and X interlocked, gold on emerald) and **KX Pulse**
    (coral KX over a heartbeat line, white); KX Track and KX Chrome kept. `AppIconPlugin.java` now switches Classic back
    on if no icon alias is enabled (an update that removes the one in use would otherwise leave no launcher entry).
    [KinetixFit Plus → App icons]
  - **"Kinetix Fit"** (with a space) in every user-visible string — app name (`capacitor.config.ts`, Android
    `app_name`, iOS `CFBundleDisplayName`), widgets, notifications, legal pages, server messages — and in the logo's
    wordmark: `assets/icon*.png`, the iOS `AppIcon-1024.png`, Android launcher layers at every density (regenerated from
    the edited source; the unused Capacitor `splash.png` drawables still say KinetixFit). Code identifiers, the RevenueCat
    entitlement (identifier `kinetixfit_pro`, display name "KinetixFit Pro"), bundle/target names and these docs keep "KinetixFit".
  - **Notifications redesigned** (`src/lib/notifications.ts`, badges from `scripts/app-icons/notify.mjs`): a coloured
    badge per kind (Android large icon; iOS attachment `public/notify/*.png`), a header line ("Hydration · 2 L goal"),
    longer text when expanded, actions (**Add a glass**, **Remind me in 30 min**, **Check in**), a 19:30 **streak
    reminder** on days without a check-in (Account → Reminders), new movement-break copy + badge. No emoji.
  - **Period tracking rebuilt** (`src/lib/cycle.ts`, `CycleCard`): predictions from the person's own logged periods
    (average of the last 6 cycles, a ± window, confidence, "3 days late", NHS irregular-cycle note, ovulation 14 days
    before the next period). Sleep, training, eating and HRV are shown as **context** for the current cycle, never as a
    forecast. [Period tracking]
  - **Gut report** gets "What went with better days" — sleep, activity, water, fibre, late meals, HRV compared on
    good vs rough days (associations, ≥ 3 days each side). [Gut health and diet]
  - **Meal ideas:** a free on-device ranked list (55 meals with USDA nutrition, `src/lib/mealIdeas.ts`) — top 3, "Show 3
    more", "Not for me", "I ate this" — and AI ideas (Plus) now 9 per request shown 3 at a time. [AI meal ideas]
  - **iOS widgets caught up:** Streak, Check-in, Quick log, My stats (App Intents for the pips and buttons, locked card
    without Plus) + `WidgetBridge` `takeCheckIns` / `takeWorkouts` / `installed` / `pin` on iOS.
  - Fixes found rendering every size: Quick log labels cut off on short widgets (label only there, short labels when
    narrow, icon only for workouts on four-button 2x1s); the 2x2 Streak's status squeezing "STREAK"; My stats 2x1 shows
    two numbers; 4x2 My stats centred; Water glass 2x1 slim glass.
- **28 Sep (morning) — the user's first list:** workouts with add / edit / remove, "Show more" types and any number of
  minutes (`src/lib/workouts.ts`, `WorkoutSheet`); Account → Connected devices button aligned; **app icons**
  (Classic + Midnight free, the rest Plus); **Plus widgets** Check-in, Quick log, My stats (colour, haptic, metrics,
  buttons set in Account → Widgets; everyone can preview them) + a free **Streak** widget; **rewards made slower**:
  about 1,000 points in a perfect month (`src/lib/points.ts` has the sums; `points.test.ts` checks the perfect month),
  daily check-in 5 points, streak bonus 10 every 7 days, streak badges in Achievements.
- Earlier on 28 Sep: onboarding/back-button fixes, gut check + report, vegetarian mode, the first unit tests, the AI
  meal ideas schema fix. 27 Sep: food logging + USDA table, water in ml + widgets, Plus, 9 countries. [Roadmap]

### What's been checked, and what hasn't
- **Unit tests** (`npm test`, 1,068) — run them before every commit. `api/__tests__/scan-meal.test.js` runs the real
  handler with Redis / quota / rewards mocked and Anthropic + USDA answered from `api/__tests__/fixtures/usda/` (built
  from the USDA CSVs; branded entries marked `_note`): its single-food snapshots are the contract older apps rely on.
- **Food-scan fix (29 Sep):** old vs new USDA matching over ~495 food names on the USDA CSVs — 349 matched vs 346 before,
  the only loss a wrong match ("chole" → mayonnaise "no cholesterol"). Playwright on the dev server with
  `/api/scan-meal` mocked — 20 checks (multi-food entries, the unsure food waiting, "a guess", allergens per food,
  "It's mango", editing one food, the meal as 1 of 3 food checks, the one-food card unchanged, an older server's answer)
  + screenshots at 360/411 light and dark. A dev server from 28 Sep 05:12 was still listening on port 5199 (left alone).
  **Step 7 (29 Sep ~03:40), on `npx vite --port 5198`:** those checks again + a 422 non-food photo (the message, nothing
  logged) + typed meals — "2 roti and dal" (no server call), "muesli with milk and banana" (one, for muesli), "tea with
  milk" (looked up whole, the one-food card), "rice, dal and chutney" (chutney not found → "Not added"), an allergen per
  food, a typed meal as 1 of 3 food checks: **31 checks pass**, 14 `/api/scan-meal` requests all answered by the script,
  anything else off localhost aborted (nothing tried). Script: `step7-check.mjs` in session b38f7593's scratchpad.
- **Amount fix (29 Sep ~03:50)**, same setup (`pickle-after.mjs`): "pickle" logged at 100 g, then in the sheet 5 g →
  5 g, 2 g → 2 g (was dropped), 9999 → 5,000 g shown (closing without Save changes nothing), a tapped but empty box →
  unchanged; "pickle 5g" → 5 g of the saved pickle with no server call; "rice 150g" → 150 g. The 31 step-7 checks still
  pass. Not checked on a real keyboard yet (the "select all" loss is a phone thing).
- **Widgets, every size, light + dark:** Android on the `kx_pixel` emulator with seeded widget data (see below), iOS
  with the simulator gallery (`renderGallery({ ml: 1250, plus: true })`), the app's previews with Playwright.
- **Icons:** contact sheet with iOS rounded + Android circle masks (`OUT_DIR=… node scripts/app-icons/render.mjs`).
- **28 Sep late-evening list, checked:** unit tests (vitals, allergens, meal ideas per country), Playwright at 360/411
  light + dark (Your food, Account → Diet & allergies, the gut card morning/evening/yesterday, India's meal ideas).
  **On the A55 (1.6, 21:57, over CDP):** heart rate "93 bpm · at 09:31 pm" (Synced), Body and vitals with blood oxygen
  95% and VO₂ max 44.7, Steps with distance 6.4 km and "Workout calories 525 kcal"; the user allowed the new types
  from the card themselves. The A55's **Galaxy Watch 7** (Samsung Health) has heart rate, SpO2 (nights), VO2 max,
  distance and workout calories in Health Connect — no resting HR, HRV, breathing rate, BP, weight or body fat yet.
- **Not yet on a device:** the new notifications (badges, actions, streak reminder), switching app icons, the Plus
  widgets' buttons (Android broadcasts / iOS 17 App Intents) and haptics on a real home screen, the period card and
  gut patterns with real data, the Android back button in onboarding, a Health Connect / Apple Health connect.
- **Not yet anywhere:** every server change against production (needs the merge), AI meal ideas with the live API
  (Plus account), a real photo / barcode scan end to end — including the new photo pipeline with the real Claude API
  (the request shape follows the docs; tests use a stand-in client), iOS lock-screen widgets.

### Waiting on the user
- **Website (before the merge deploys it):** (a) social accounts — none exist yet (`instagram.com/kinetixfit` belongs to
  someone else, so no handle was guessed): the footer's "Follow us" column says **"Coming soon"** (the user's choice, 30
  Sep; written in the page, 5 footer columns from 1,040px) until real ones go into `SOCIAL_PROFILES` in
  `src/site/config.ts`, which replaces it with links; (b) read the privacy policy's new "Early access list" paragraphs (section 2, 3's
  table and 5; "Last updated" is now 29 September 2026); (c) the Vercel project must build with `vercel.json`'s
  `buildCommand` (`npm run build:web`) and `outputDirectory` (`dist-web`) — check nothing in the dashboard overrides
  them; (d) someone has to read the early access list (Upstash console: `ZRANGE early_access 0 -1`) and send the launch
  email; (e) no testimonials were written (none exist; fake reviews are illegal in the UK) — add real ones later if wanted;
  (f) the site names no charities (commercial-participator rules: name them once agreements exist) and shows no Plus price;
  (g) Maya Free or Plus on the widgets home screen (see the redesign bullet); (h) a look on a real phone — 30 Sep ~00:45
  no Android phone was connected, and the iPhone refused automation: **Web Inspector is off** (Settings → Apps → Safari
  → Advanced → Web Inspector + Remote Automation on); with them on, `safaridriver -p 4447` + a WebDriver session with
  `{"platformName":"iOS","browserName":"Safari","safari:deviceUDID":"00008110-001151D80291801E"}` drives Safari on it,
  loading the Mac's serve.mjs at http://192.168.1.3:5190 (same Wi-Fi) or the live site.
- **Food-scan fix:** an explicit OK for the real-photo preview test, the only step left that spends real Claude API
  credits (a commit + push → Vercel preview; ~5 photos: muesli + milk + banana, watermelon slice, curd, porridge, a
  blurry one; APK 1.6's request shape; the exact `scan-meal usage` tokens reported). Then APK 1.7 on the A55.
  Open decision: USDA's only "tea with milk" (what chai maps to) is sweetened (51 kcal, 8.7 g sugars per 100 g) —
  right for most chai, ~30 kcal high for unsweetened milky tea; an unsweetened entry of our own would fix it.
0. **Fix sign-up email delivery in Supabase** (dashboard, project `qlsdmczmnmsjhqptnkym`) — see Roadmap → Sign-up and
   account emails. Until then confirmation emails are slow / limited (and may not reach addresses outside the team).
1. **Try the new build on the S21 FE** (installed 28 Sep 18:24, data kept): Water glass widget, the new icons
   (Account → App icon), notifications, period card (female profile), meal ideas paging. Say which icons/widgets to keep.
2. **Commit + PR + merge** (Claude commits / opens the PR when asked; the user merges — `gh pr merge` is blocked).
   After merging: re-scan the badam milk bottle, a less common food, AI meal ideas with a Plus (promo) account, then APK 1.3.
3. Still open: the smartwatch question on Today; Account → Reminders hours; Country (the S21 FE resolved to India);
   pick the water widget styles to keep.
4. Plus can't be bought yet: Play Console subscription + RevenueCat entitlement **`kinetixfit_pro`** (display name KinetixFit Pro; exists, 3 products) + a package in the `default` offering (empty on 1 Oct).
5. Before any non-UK country goes live: charity agreements, Tremendous funding per currency, privacy policy + terms per
   market, store availability; double-check Singapore's fibre figure and the onboarding facts. [Countries]
6. Play Console Health Connect declaration: add **exercise** (READ_EXERCISE) and, since 28 Sep late evening, **distance,
   active + total calories burned, oxygen saturation, respiratory rate, blood pressure, VO2 max, weight and body fat**
   (shown on Today, phone-only); the data-safety form + privacy policy should cover the gut check, periods, the food log
   and those (public/privacy-policy.html lists them; live after the merge).

### On the phones, the emulator and the simulator
**Before any `am start`, install or tap, check `adb shell dumpsys activity activities | grep topResumedActivity`** (and
`dumpsys power | grep mWakefulness` — `Dozing` = screen off) — the user uses the phone during sessions; if they're in
another app, ask first. The S21 FE has a secure lock screen: Claude can't unlock it, and Health Connect only answers
apps on screen. `adb` waits forever for a missing device — wrap with `perl -e 'alarm 30; exec @ARGV' adb …`.
Old data from before the 27 Sep reset is in `Claude Space/KinetixFit-backups/2026-09-27/` (`s21fe-app-data.tar`,
`iphone-app-data/`).
- **S21 FE** (`RZCT815G2ND`): **APK 1.7 — current** (29 Sep 04:27, data kept; the health permissions new in 1.5 weren't
  granted yet then — the Body and vitals card asks). When the Mac can't see it at all (not in `adb devices` nor the USB
  device list, as on 29 Sep ~03:55–04:11), it's the cable or socket — a replug fixed it. The user's new test account, app icon **Midnight**. Widgets on its home screen: Water bottle, Today, Quick scan, Water level, Water quick add, Water ring,
  Water this week, Daily rings (+ possibly the old Liquid glass, now Water glass). Drops off USB now and then.
- **A55** (`RZCY41ZL3HE`): **APK 1.6 — current** (28 Sep 21:56, data kept, all 15 health permissions allowed); it has
  a Galaxy Watch 7 (see "checked" above) — the phone for checking health cards.
  USB debugging was off when it was plugged in on 28 Sep (MTP only, no adb) — if `adb devices` doesn't list it, ask
  the user to turn it on (Developer options; Auto Blocker off) and replug.
- **iPhone 13 mini** (UDID `00008110-001151D80291801E`): **the 29 Sep ~03:57 build — current** (everything above, incl.
  the food-scan fix's app side and the amount fix; data kept). Free Personal Team `BMJ28C6NNY`: the profile lasts 7 days (until ~5 Oct), then rebuild + reinstall:
  `cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'id=<udid>'
  -allowProvisioningUpdates -derivedDataPath build build`, then `xcrun devicectl device install app --device <udid>
  build/Build/Products/Debug-iphoneos/App.app` (`kAMDRemoteConnectError` = off the cable or locked).
- **iPhone 17 simulator**: the 28 Sep ~18:40 build (current). Shut down after use — it and the emulator don't fit
  in 8 GB together.
- **Android emulator `kx_pixel`** works headless when the simulator is shut down: `emulator -avd kx_pixel -no-window
  -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot-save -memory 2048` (boots in ~30 s), then
  `adb -s emulator-5554 install -r …`; stop with `adb -s emulator-5554 emu kill`. It has the 28 Sep build with **seeded
  widget data** (`kx_widgets.xml` pushed via `run-as … sh -c 'cat … > shared_prefs/kx_widgets.xml'`, app force-stopped).
- Android widget gallery (debug builds): `adb shell am broadcast -a com.jnglobalventures.kinetixfit.RENDER_WIDGETS -n
  com.jnglobalventures.kinetixfit/.WidgetGalleryReceiver --es theme dark [--ei ml 1250] [--ez plus true]` → `adb pull
  /sdcard/Android/data/com.jnglobalventures.kinetixfit/files/widgets-dark[-1250][-plus].png`. Rows follow
  `SizedWidget.all()`, each (94+212+16+16) dp tall. `--ez haptic true [--ez goal true]` plays the widget haptic instead.
- iOS widget gallery (debug builds): `node scripts/ios-sim/wi.mjs "Capacitor.Plugins.WidgetBridge.renderGallery({ ml:
  1250, plus: true }).then(r => window.__g = r.path)"`, then `node scripts/ios-sim/wi.mjs "window.__g"`.
- Debug the WebView over CDP: `adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>`, then a small Node CDP
  script. Visual checks without a phone: `npx vite --port 5199` + Playwright from a scratch folder (Frontend conventions).
- **iOS:** in sync with Android (`scripts/ios-sim/`: `sim.sh build|launch|shot|proxy`, `wi.mjs`, `ui.py`, `tap-el.sh`;
  if ui.py can't connect, start the idb companion). Not yet: `VITE_REVENUECAT_IOS_PUBLIC_KEY`, TestFlight (paid team).

**Next up (user to choose):** (0) done — PR #4 merged 2026-09-30, backend sync live in production, next step is
validating it there (see "Backend database sync" above); (1) Play
Console + RevenueCat products for Plus, then Play internal testing (release signing); (2) ~~syncing the food log, gut
checks, periods, water and profile to the account~~ done, see "Backend database sync" above; (3) rewards in more
countries; (4) iOS paid team (TestFlight); (5) the website: redesign done (4 steps, 29–30 Sep) — check it on a real phone,
then the waiting-on-user items above before the merge deploys it.

- Only commit, push or merge when the user asks. Claude can open PRs, but `gh pr merge` is blocked in auto mode;
  the user merges PRs themselves on GitHub. Auto mode also blocks Claude from production deploys, POSTs that write
  to production, and pulling secret env values — hand those commands to the user (typed with `!`, no space after it;
  pasted text can carry a non-breaking space the shell rejects).
- The user prefers plain-text questions over the AskUserQuestion widget, and likes changes checked on the real
  phones (see "Driving the app on the phone" under Frontend conventions) — and the iOS simulator. For widgets, check
  every size in light + dark with the galleries before handing over.

## Android toolchain

Everything required is listed in `requirements.txt` (a comment-only checklist — the project has no
Python deps) and installed by `./scripts/setup-android.sh`. Installed on this Mac as of 2026-09-25:

| Tool | Version | Where |
|---|---|---|
| Node / npm | 26.0.0 / 11.12.1 | Homebrew |
| JDK | 21 (openjdk@21) | `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` |
| Android SDK | platform 36, build-tools 36.0.0, platform-tools, emulator | `~/Library/Android/sdk` |
| Android Studio | latest cask | `/Applications/Android Studio.app` |
| Gradle / AGP | 8.14.3 / 8.13.0 | via `android/gradlew` wrapper |

No emulator system image is installed yet (~2 GB download; 15 GB free on 2026-09-25).

**Test phones** (USB debugging on, Android 16, font scale 100%):
- Samsung Galaxy S21 FE (SM-G990E), adb serial `RZCT815G2ND` — web view 360×732 CSS px
- Samsung Galaxy A55 (SM-A556E), adb serial `RZCY41ZL3HE` — web view 411×842 CSS px (842.7 real height)
With both plugged in, pass `-s <serial>` to adb.
It sometimes drops off USB for a moment — if `adb install` says "device not found", run `adb wait-for-device`
and retry.

`JAVA_HOME`, `ANDROID_HOME` and PATH are exported in `~/.zshrc`. The system default `java` is JDK 11
— **Gradle fails with JDK 11**, so if a build errors on Java version, the shell hasn't picked up
`JAVA_HOME` (open a new terminal or `source ~/.zshrc`). `android/local.properties` (gitignored) holds
`sdk.dir`; the setup script recreates it.

## Commands

```bash
npm install                      # JS deps
npm run dev                      # web dev server, http://localhost:5173 (the app; the website is at /site/)
npm run build                    # tsc -b && vite build → dist/ (the app alone — what cap sync copies into the apps)
npm run build:web                # tsc -b && vite build --mode web → dist-web/ (the website: site at /, app at /app/)
npm run lint
npm test                         # tests (Vitest: src/lib/*.test.ts + api/__tests__/*.test.js) — run before every commit

# Android — always build web first, then sync, or the app ships stale JS
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
cd android && ./gradlew installDebug         # install on connected device / running emulator
npx cap run android                          # build + deploy to a picked device
npx cap open android                         # open in Android Studio
adb devices -l                               # check device connection (test phone: RZCT815G2ND)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk   # reinstall without cap run
adb shell am start -n com.jnglobalventures.kinetixfit/.MainActivity # launch it
adb logcat | grep -i -E "capacitor|chromium" # WebView console + plugin logs
```

A clean `assembleDebug` takes ~6-7 min the first time (Gradle downloads deps); later builds are fast.
Verified working on 2026-09-25. Debug WebView is inspectable at `chrome://inspect` in desktop Chrome.
The launch intro plays once per session: swipe the app away from recents to see it again (on the web, open
a new tab). In zsh, don't store `adb -s SERIAL` in a variable — it won't word-split; use a shell function.

## How the apps reach the server (shared by all three)

- Every server call and server-hosted link goes through `serverUrl(path)` (`src/lib/server.ts`). On
  the website it returns the relative path; in the native apps it prefixes `VITE_SERVER_URL`
  (default `https://www.kinetixfit.co.uk`). Never write a bare `fetch('/api/...')` or `href="/..."`
  for a Vercel route — it silently breaks both apps, because their WebView origin is
  `https://localhost` (Android) / `capacitor://localhost` (iOS).
- Always use the **www** host: the apex domain 308-redirects and CORS preflights don't follow redirects.
- Every `api/*.js` handler starts with `if (handleCors(req, res)) return;` (`api/_lib/cors.js`),
  which answers preflight `OPTIONS` and allows only the two native origins. New endpoints need it too.
- `api/` changes only reach the apps once deployed to Vercel (the CORS change is live since `d066406`).

## Roadmap / open work

### Backend database sync — Supabase Postgres as source of truth (merged 2026-09-30, PR #4)

Before this, all user data (food logs, water, workouts, gut checks, periods, check-ins, vitals history,
points/XP/streaks, profile, preferences) lived in `localStorage` only, per device — switching phones lost
everything, logout didn't clear local data (a second account signing into the same device saw the first
account's data), and there was no durable history for future AI features. Now Supabase Postgres is the
durable source of truth for all of it; localStorage is a cache/offline layer on top.

**Decisions locked in with the user, still in force for any future work here:**
1. Last-write-wins only for singleton data (profile, preferences). Append-only/editable logs use stable
   IDs + idempotent server-side upserts — records are never silently overwritten or dropped by a stale write.
2. Sync on app open/resume + flush queued writes on reconnect. No Supabase Realtime.
3. Points/streaks/quest claims are **server-authoritative** (server is the only writer of truth) — see
   "narrower than planned" below.
4. Full logout data wipe (`clearAllDomainData()`) — no account's local data may persist or leak into
   another account's session.
5. Server retains complete history indefinitely — no retention pruning server-side (local caches can keep
   their existing caps for on-device performance).
6. `@capacitor/network` for connectivity detection.

**Schema** (`supabase/migrations/0001_source_of_truth.sql`, applied to production 2026-09-30): 13 tables,
all `user_id uuid references auth.users(id) on delete cascade`, RLS `for all using (auth.uid() = user_id)
with check (auth.uid() = user_id)`, `updated_at` auto-maintained by trigger, no server-side retention
pruning. `profiles` + `preferences` (singleton, LWW); `saved_foods`, `food_log_entries`, `water_logs`,
`workouts` (manual + detected merged, `source` column), `periods` (soft-delete via `deleted_at`);
`gut_checks`, `morning_checkins` (pk `(user_id, day)`, edit-in-place); `vitals_history` (event-level, pk
a unique reading id, **not** `(user_id, day, metric, source)` — that would collapse same-day readings like
hourly heart-rate samples); `points_ledger`, `streaks`, `quest_claims` (server-authoritative).

**Sync engine** (`src/lib/sync.ts`, one generic module, not per-domain hand-written sync — every domain
reduces to two shapes):
- **Singleton, LWW** (`profiles`, `preferences`): upsert whole row, remote wins unless local `updated_at`
  is newer (`pushSingleton`/`pullSingleton`).
- **Keyed rows, idempotent merge** (everything else): stable client-generated IDs or natural
  `(user_id, day)` keys, upsert-by-key — a record present locally but not remotely is always pushed, never
  dropped (`pushKeyed`/`pullKeyed`, plus `pushAllKeyed` for the one-time first-login backfill).
- `writeJson` (`src/lib/storage.ts`, extracted out of the per-module read/write helpers each domain file
  used to keep privately) enqueues changed data into an outbox (`kx_sync_outbox` in localStorage) so every
  write is durable offline immediately. Flush loop triggers on `@capacitor/network`
  connectivity-restored, app foreground/resume, and reconnect (`flushOutbox`).
- **Deletes are tombstones, never hard deletes**, on both client and server: `deleted_at` instead of
  removing the row/localStorage entry, so an offline device's stale "still exists" push can't resurrect
  something deleted elsewhere. `saved_foods` is the one deletable-in-principle domain with **no**
  tombstone — no delete UI exists for saved foods today, so none was invented.
- Every domain wired: `profileSync.ts`, `preferencesSync.ts`, `gutSync.ts`, `checkinsSync.ts`,
  `periodsSync.ts`, `waterSync.ts`, `savedFoodsSync.ts`, `foodLogSync.ts`, `workoutsSync.ts`,
  `vitalsHistorySync.ts` (also persists a rolling 30-day history of wearable data — steps, sleep,
  daily heart-rate average, detected workouts — that used to only be read live, never stored).

**Login** (`onSessionChange` in `App.tsx`, routed through one guarded `syncThenContinue` effect event —
see "two competing paths" bug below): pull remote data for every registered domain before continuing.
First-run backfill: if remote has no rows for a domain, push local straight up (`pushAllKeyed` /
`syncAllOnLogin`) — only marked backfilled on success, so a failed push (table not migrated yet, network
blip) retries next login (the fix that shipped 2026-09-30, see `sync.test.ts`).

**Logout** (`handleLogout` in `App.tsx`): best-effort final outbox flush, then `clearAllDomainData()` wipes
every domain's localStorage keys + the sync engine's own bookkeeping (outbox, mtimes, backfill flags).

**Server-authoritative quest claims** (narrower than the original plan — see "not yet done" below):
`api/_lib/supabaseAuth.js` (verifies the caller's real session token) + `api/_lib/supabaseAdmin.js`
(service-role writes) wired into `api/complete-quest.js`. Writes a durable `quest_claims` row
(DB-unique-constraint-enforced dedup on `(user_id, day, quest_id)`) + `points_ledger` row. Older app builds
without a token still work on the pre-existing Redis-only path.

**Not yet done / deliberately deferred:**
- Phase 9 (points) is dedup + verification only — the endpoint still returns a point/xp *delta*, not an
  authoritative running total, and streaks still increment client-side. Widening this touches the Rewards
  UI broadly.
- Detected workouts don't sync bidirectionally into the UI — a remote-only detected workout lands in a
  read-only local history cache, never the live `detectedWorkouts` state or Rewards counting, to avoid
  changing how points/badges are earned.
- 4 React Compiler lint diagnostics in `App.tsx` (see "Current status" above).

**Device verification (against a separate test Supabase project, `KinetixFit Test` ref
`ocaxkjpkklixjtkhkttt` — never production, until the 2026-09-30 merge):** full login → sync →
offline-write → reconnect → logout-wipe → re-login cycles verified on the real S21 FE, the iOS 17
simulator, and the user's real iPhone 13 mini. Two real bugs found and fixed on the S21 FE: (1) the logout
wipe list was missing several keys added later in the same session (`kx_vitals_history`,
`kx_detected_workouts_history`, the `*_deleted` tombstone-history keys) — fixed, pinned in `sync.test.ts`;
(2) login had two competing paths racing (`handleAuthSubmit`'s direct path vs `onSessionChange`'s
listener-driven sync pull) that could push a placeholder profile over a freshly-pulled real one — fixed by
routing everything through one guarded `syncThenContinue` reached only via the listener. No new bugs found
on iOS. A backup/restore mishap on the S21 FE (a stale `run-as tar` snapshot taken while the app was still
running) briefly showed a placeholder profile under an old cached account on that phone — no data was
lost (production had no tables yet at the time) and that phone isn't the user's real tracked device.
Real-iPhone testing backed up the user's actual 24-key localStorage via a live JS eval before touching
anything, restored it verbatim afterward, and confirmed the real account (`sivadurgaksd@gmail.com`,
"Siva Durga", 4-day streak, "Synced with Apple Health") was never exposed to the test Supabase project
with an active session — a different Supabase project means a different localStorage session-token key.

**Harmless leftovers from that testing, safe to ignore/delete whenever:** the test Supabase project has a
few leftover test users with synced test data; `Claude Space/KinetixFit-backups/2026-09-30-s21fe-pre-synctest/`
holds the stale S21 FE backup tars (not reliable — don't restore them). `.env.test.local` (gitignored)
still holds the test project's keys, reusable for any future test-project work.

**Next: validate this against production now that it's live** — sign in on a real device (or the web app)
against the **production** Supabase project, confirm data lands in the new tables, confirm offline →
reconnect flush, confirm logout wipes cleanly, confirm re-login restores. None of the testing above ever
touched production.

### Android (current focus)
- [x] Toolchain installed, debug APK builds (2026-09-25)
- [x] API calls + privacy/terms links point at the live server from the app; CORS added in `api/`
- [x] Health Connect: plugin supplies the permissions-rationale activity and `health_connect_privacy_policy_url`
      is set in `res/values/strings.xml`. The plugin declares 47 read/write health permissions; the app
      manifest strips all but the 15 it reads (`tools:node="remove"`; READ_EXERCISE kept since 27 Sep for workouts, and
      since 28 Sep distance, active + total calories, oxygen saturation, respiratory rate, blood pressure, VO2 max,
      weight, body fat) — Play rejects unused health permissions. The Play health declaration must list them all.
      If `requestAuthorization` in `App.tsx` gains a data type, delete that type's remove-line.
- [x] Deploy the `api/` CORS change to Vercel (2026-09-25)
- [x] Run on a real device — test phone above; launch + intro verified 2026-09-25
- [ ] Test every feature on the device: sign-up/login, Health Connect, notifications, barcode/photo scan, API calls
- [x] Health Connect reads work in the app (2026-09-26): sleep uses `readSamples` + `sleepDayEntries()` (HC rejects
      aggregated sleep), metrics load with `Promise.allSettled`, reads pause in the background (HC throws "must be in
      foreground") and re-run on `appStateChange`, health effects run after a restart (`onboardingStep` starts at
      `DASHBOARD_STEP` when `kinetix_logged_in`). Connected-but-empty shows a setup card (`healthDataState ===
      'no-data'`) with **Open Health Connect** (`Health.openHealthConnectSettings()`) and **Check again**.
- [~] Samsung Health → Health Connect on the S21 FE: Samsung Health now has write permission but hasn't written
      yet (see Current status). Facts (Samsung docs): only new/updated data after it's allowed, no backfill; syncs
      on opening / pulling down its home screen (or Settings → Sync with Samsung account → Sync now); shares steps,
      heart rate, sleep — **not HRV** (Stress card says so: `noHrvFromSource`). Check from adb:
      `dumpsys package com.sec.android.app.shealth | grep permission.health.WRITE_` and
      `dumpsys healthconnect | grep -A1 "Samsung Health"` ("Contributed Data").
- [ ] Direct Samsung Health (Samsung Health Data SDK) is **not an option for release**: public distribution needs
      Samsung partner approval, and Samsung isn't accepting partner applications (checked 2026-09-26).
- [x] Stress for Samsung users — **no bypass** (2026-09-26): Samsung's stress score is proprietary and only in its
      Data SDK (above); it never writes HRV to Health Connect; Health Connect heart rate is averaged bpm, not
      beat-to-beat intervals, so HRV can't be computed from it; reading a Galaxy Watch directly (Samsung Health
      Sensor SDK) needs our own Wear OS app *and* partner approval. So Stress/Recovery are hidden for Samsung Health
      users with a one-time explanation. Quests are now data-driven (2026-09-27), so Samsung users never get an HRV quest.
- [x] Trend day keys were UTC while Health Connect buckets start at local midnight (today's bar empty outside
      UTC) — fixed 2026-09-26 with `localDayKey()`. The `api/` functions still key days in UTC (server-side daily
      limits for quests, donations, food points) — harmless for now, but they reset at 1am in the UK in summer.
- [~] Food intake: per-entry log with amounts, edit/remove, saved foods, 90-day history and per-nutrient targets
      (2026-09-27, see Food logging). Still phone-only — no sync across devices.
- [x] `VITE_REVENUECAT_ANDROID_PUBLIC_KEY` in `.env` (2026-09-27). Real purchases still need Play Console products +
      RevenueCat entitlement/offering, and a Play-installed build (internal testing) — a sideloaded APK can't buy
- [~] Grey status/nav bar strips: fixed in code (edge to edge + `kx_app_bg` fallback) — confirm on both phones
- [ ] Measure scroll smoothness on the S21 FE (glass layer + tab bar): scripted scroll over CDP, read frame timing
- [ ] Two console errors on start, apparently from Capacitor's own injected startup code, not ours: "Error
      injecting safe area CSS … reading 'style'" and "reading 'triggerEvent'". App runs normally; investigate
- [ ] Emulator (optional): needs a system image download (see toolchain)
- [ ] Release signing: upload keystore + `signingConfigs`. Keystores (`*.jks`, `*.keystore`) are gitignored
      on purpose — losing the upload key means no more updates under this app ID. Play needs an AAB: `./gradlew bundleRelease`
- [ ] Bump `versionCode` / `versionName` in `android/app/build.gradle` (now 4 / "1.3", uncommitted) for every upload / shared APK.
      Shared debug builds in `Claude Space/KinetixFit-builds/`: **1.2** (27 Sep ~22:00 code) and **1.3**
      (`Kinetix-Fit-1.3.apk`, 28 Sep 18:48) — both built before the `api/` changes were merged
- [ ] Play Console: Health Connect data-use declaration, data-safety form, privacy policy URL
- [ ] Google sign-in doesn't work in the apps (`handleGoogleSignIn` — needs a deep-link return URL), so the button is
      hidden there (2026-09-26); email/password works. On iOS, adding it back also needs Sign in with Apple (guideline 4.8).
- [x] Frontend redesign — one design system across onboarding + dashboard, light/dark, animations (see Design system)
- [x] Launch intro + plain launch splash (2026-09-25) — see Design system
- [x] Font scale (100%) and viewport sizes checked on both phones; onboarding no longer overflows on the A55
- [ ] Check on device: About-you flow, tab bar slide + haptic ticks, glass look, keyboard over inputs, safe areas
- [ ] Check the responsive pass on both phones: turn each one sideways (compact tab bar, two columns, welcome
      screen side by side, landscape notch padding) and try the phone's largest font size
- [ ] Main JS chunk ~890 kB (Vite warning) — code-splitting `App.tsx` would speed WebView startup

### iOS (current focus from 2026-09-26)
Same app, logic and files as Android. **Xcode 27 + CLT 27 installed 2026-09-26; the app builds (no warnings in
our code) and was tested end to end on the iOS 26.4 simulator (iPhone 17):** launch colour → intro → welcome;
sign-up (no Google button); Today / Nourish / Rewards / Account / Your details / Devices; Apple Health sheet →
Turn On All → Allow → "no data yet" iOS setup card → **Open Health** (opens the Health app) → 6,842 steps and a
68 bpm reading added in Health → **Check again** → "Synced with Apple Health", Steps and Heart rate cards
**Synced**, steps chart bar on **today**; keyboard on Nourish search / promo / help message (field centred above
the keyboard, tab bar hidden, no page jump); dark mode following the system live (no plugin needed on iOS).
Not yet: a real iPhone, sleep data, barcode/camera (the simulator has no camera), subscriptions.

**Driving the simulator — `scripts/ios-sim/`** (see the comment at the top of each file):
- `sim.sh build` (npm build → cap sync ios → xcodebuild → install) · `sim.sh launch` · `sim.sh shot x.png` ·
  `sim.sh proxy` (restart the web-inspector proxy — needed after every relaunch). `SIM_NAME` picks the device.
- `node wi.mjs "<js>"` runs JavaScript in the app's WebView (set localStorage, `location.hash = '#account/promo'`,
  read the DOM). WebKit's inspector is Target-multiplexed; wi.mjs handles it.
- `ui.py list | tap "<label>" | tapxy X Y | type "text"` — real taps via idb. WebView content isn't in idb's
  element list: `tap-el.sh "<css selector>"` taps a page element for real (use it to open the keyboard). System
  sheets (Apple Health, notifications) run in another process: screenshot, then `tapxy`.
- Adding Health data: open the Health app (the setup card's Open Health, or `xcrun simctl launch <udid>
  com.apple.Health`), finish its welcome screens once, then e.g. Steps → + (top right, ~(364, 84)) → type → Done.
- `simctl privacy` can't grant HealthKit. The first launch after installing takes ~5 s (WebKit spin-up).
- Disk (2026-09-26): 27 GB free; `ios/App/build` ~700 MB (gitignored, rebuilt on demand); the simulator ~2 GB;
  idb-companion 96 MB; Playwright WebKit ~80 MB. Tool versions: requirements.txt → iOS toolchain.

- [x] HealthKit entitlement file **wired into the build** (`CODE_SIGN_ENTITLEMENTS = App/App.entitlements`, Debug +
      Release — it existed but wasn't referenced, so HealthKit would have refused every request). Health + Camera
      usage strings in `Info.plist`; the app requests **read only** (steps, heart rate, resting HR, HRV, sleep).
- [x] Shares the server URL / CORS work above (`capacitor://localhost` is allowed)
- [x] `cap sync ios` — Package.swift now has all 8 plugins (Haptics, App and Keyboard were missing). `/` paths.
- [x] **Deployment target iOS 16.4** (was 15.0): the CSS needs `color-mix()` (Safari 16.2) and container units
      (16.0) — on iOS 15 many fills and the hero type would break. Covers iPhone 8 and newer.
- [x] Launch screen = plain `#16181F` (was Capacitor's white placeholder), like Android; placeholder Splash
      imageset removed. App icon = the KinetixFit logo on white, opaque 1024 px (`AppIcon-1024.png`, rendered from
      `assets/icon-only.png`, same look as the Android launcher icon) — it was Capacitor's placeholder "X".
- [x] Info.plist: `UIRequiredDeviceCapabilities` arm64 (was armv7), `ITSAppUsesNonExemptEncryption` false.
- [x] Keyboard: `@capacitor/keyboard` — `capacitor.config.ts` `ios.scrollEnabled: false` (no whole-app bounce, no
      page shove on focus) + `Keyboard.resize: 'native'` (iOS WebView shrinks above the keyboard). `src/lib/keyboard.ts`
      hides the tab bar/FAB while typing (`.kx-keyboard-open`) and scrolls the focused field into view (both
      platforms; Android keeps adjustResize). Text fields are ≥16px (iOS zooms into smaller ones).
- [x] Haptics: iOS `selectionChanged` is silent without an open selection session — `tick()` now opens one.
- [x] Apple Health setup card on Today (iOS twin of the Health Connect card): HealthKit never reveals whether
      reading was allowed (the plugin reports every type "authorised" once the sheet has been shown), so an empty
      result shows how to turn KinetixFit on in Health (profile picture → Apps → KinetixFit → Turn On All), with
      **Open Health** (`x-apple-health://` — Capacitor hands non-app URLs to the system). Account → Devices opens
      the Health app on iOS.
- [x] Google sign-in hidden in both apps (it only ever showed an error there; on iOS it would also require Sign in
      with Apple — guideline 4.8). Still on the website.
- [x] Date row (Last period started) right-aligned in WebKit (`input[type=date]` is a flex box there).
- [x] Disk space freed, Xcode 27 installed + selected, iOS 26.4 simulator runtime present (2026-09-26).
- [x] Builds for the simulator; runs; screens above checked.
- [x] **Notification prompt fix (both platforms):** reminders were on by default and the dashboard asked for
      notification permission on open — even after "Skip for now". Now Skip turns water reminders off and sets
      `kx_notifications_skipped`, and `ensureNotificationPermission()` never prompts while that's set; turning the
      Reminders switch on asks at that moment (and flips back off with a Settings hint if refused).
- [x] Tapped through the Apple Health sheet, added sample steps + heart rate, checked Today + the iOS setup card +
      Open Health; keyboard on three screens; dark mode (2026-09-26, simulator).
- [x] **Fixes found by the simulator run (both platforms):** trend-card pills showed internal words and never left
      "Calibrating" once data arrived (Steps/Sleep now `Optimal`, and the pill says **Synced / Waiting / High /
      Syncing** via `STATUS_LABELS` in BiometricTrendCard); the **Heart rate card required HRV too**, so Samsung
      Health users and iPhones without an Apple Watch waited forever — now heart rate alone is enough (HRV shown
      when present); steps shown with a thousands separator; a one-day line chart draws its point as a dot;
      keyboard reveal re-centres after the WebView resize and snaps if iOS's own focus scroll cancelled it.
- [x] Real iPhone (27 Sep): the free Personal Team signs HealthKit + the App Group fine (the old note that
      HealthKit needs a paid team was wrong). Paid team still needed for TestFlight / App Store / subscriptions.
- [ ] `VITE_REVENUECAT_IOS_PUBLIC_KEY` in `.env` (subscriptions run in demo mode until then)
- [ ] App Store review risks to settle before submitting: promo codes that unlock Premium outside in-app purchase
      (guideline 3.1.1), charity donations via an external link (3.2.2 — fine if the charity page opens in Safari),
      privacy "nutrition labels" in App Store Connect (health data, email, purchases).
- HealthKit HRV is SDNN (Apple Watch), Health Connect's is RMSSD — the Stress/Recovery thresholds treat them alike.
- [ ] (keep) `ios/App/CapApp-SPM/Package.swift` must use `/` paths — it was once committed with Windows `\`
      paths (breaks Xcode). Running `cap sync` on Windows reintroduces them; check the diff before committing.

### KinetixFit Plus (added 2026-09-27, uncommitted until pushed)
- Plans: **Free** = 2 photo/barcode scans a day (the phone's own midnight); **Plus** = 10 a day + vouchers (coffee etc.). Typed food
  checks and charity donations stay free. Limits live in `src/lib/plus.ts` (display) and `api/_lib/scanQuota.js`
  (enforced; counts only successful scans, fails open if Redis is down). Plus is checked server-side against
  RevenueCat in `api/_lib/plus.js` (5-min Redis cache; strict/fresh for voucher payouts). Entitlement identifier
  is **`kinetixfit_pro`** — the identifier, not the display name "KinetixFit Pro" (1 Oct: the code wrongly used the display name, so neither promo grants nor the server Plus check could ever match; fixed); customers see "KinetixFit Plus".
- Buying: Account → Your plan sells `offerings.current.availablePackages[0]` via RevenueCat; until Play Console /
  App Store products + a RevenueCat offering exist, the button says Plus isn't on sale yet. Restore purchase is there.
- `lookup-barcode` now requires `appUserId` (older app builds that don't send it get "Sign in to scan a barcode").
- Vouchers: **1,000 points** (user decision 2026-10-01; was 1,500 from 2026-09-28, 2,500 before) and **one coffee voucher per person per calendar
  month** (user decision 2026-09-27) —
  `reserveVoucherSlot` in `api/_lib/rewardConfig.js` (atomic INCR, released if the Tremendous order fails).
  Vouchers no longer count against `monthlyRedemptionCapGBP` (£3, now donations only).
- Photos: Camera plugin `getPhoto` (not `takePhoto` — only getPhoto survives Android killing the app behind the
  camera; restored via `appRestoredResult`). Barcode from a saved photo: WebView `BarcodeDetector` on Android,
  `html5-qrcode` fallback (iOS/web).

- **App icons** (28 Sep; `src/lib/appIcons.ts`, Account → App icon): Classic + Midnight free; Aurora, Gold, Ember,
  KX Track, KX Monogram, KX Pulse, KX Chrome are Plus (anyone sees them; a Plus icon reverts to Classic once the plan is
  known and isn't Plus — `shouldRevertIcon`). Android: one launcher `activity-alias` per icon (`.Icon<CamelCase>`,
  Classic enabled in the manifest), `AppIconPlugin.java` applies a choice when the person leaves the app
  (`handleOnStop`) and re-enables Classic if no alias is on. iOS: alternate icon sets `AppIcon-<Name>` +
  `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`, `App/AppIconPlugin.swift` (`setAlternateIconName`). Art:
  `scripts/app-icons/render.mjs` (Playwright; writes iOS 1024 RGB PNGs, Android adaptive WebP layers + XML, the
  picker previews `src/assets/app-icons/*.webp`; `OUT_DIR=…` for drafts + a contact sheet). Removing an icon later:
  keep its alias out of IDS/manifest and rely on the Classic fallback.
- **Plus widgets** (28 Sep): Check-in (tap an energy pip → checked in; points + streak when the app next opens),
  Quick log (1–4 buttons: drinks or workouts), My stats (2–4 numbers); colour + haptic (Android) set in Account →
  Widgets (`src/lib/widgets.ts` WidgetPrefs → `flattenPrefs` → the widget store). Without Plus they show a locked card
  that opens `kinetixfit://plus`. The free **Streak** widget shows the check-in streak and the last 7 days.

### Today, quests, reminders, widgets (2026-09-27, uncommitted until pushed)
- **Quests** (`src/lib/quests.ts`): only what the user's data can show — steps/sleep/HRV/recorded workouts when the
  device shares them, food checks in the app. Nothing self-reported (water, check-in, hand-added workouts) — points
  become real donations/vouchers. The workout quest is offered once workouts are readable and the person has a watch or
  has had a recorded workout in the last 30 days. No stress for Samsung. Real progress bars; a quest
  can be claimed only once met. Claimed IDs persist per day (`kinetix_quests_claimed`); "Check 3 foods" counts today's
  food-log entries (`kx_food_days`, see Food logging).
- **Hydration** (`src/components/HydrationHero.tsx` card + `HydrationSheet` page, data in `src/lib/water.ts`, styles in
  `src/styles/today.css`): water in **ml**. `kinetix_water_log` = local day → drinks, each `[time, ml]` (a bare number is
  an older 250 ml glass; 35 days kept). Glass size `kinetix_glass_ml` (50/100/150/200/250/300/500, Hydration page →
  Settings) is what + adds; goal `kinetix_water_goal_ml` (1.5/2/2.5/3 L — an old `kinetix_water_goal` in glasses converts,
  8 → 2 L). Page: amount + progress bar + − (undo last) / **Add 250 ml**, next reminder line, This week bars, Today's
  drinks folded (times + remove), Settings (glass size, goal, reminders). Self-reported → never quests/points. Drinks
  added on a widget wait in the widget store (`waterPending`, `[[t, ml]]`, times 1 ms apart because a drink is removed by
  its time) until the app calls `takeWidgetGlasses()` on open/resume. "Remind me in 30 min" survives only as the
  notification action.
- **Heart rate + Body and vitals** (28 Sep, `src/lib/vitals.ts`, `VitalsCard`): heart rate is the newest reading of the
  last day with its time (`readLatestHeartRate`: hourly averages find the newest hour, then only that hour is read —
  Android's plugin reads records oldest first and applies `limit` before sorting, so `limit: 1, ascending: false` gave
  the newest sample of the oldest record), today's range + average (`queryAggregated` day, `['average','min','max']`),
  resting heart rate from `restingHeartRate` when a source writes it (Samsung Health doesn't). Every 5 min + on resume:
  the newest resting HR, SpO2, breathing rate, blood pressure, VO2 max, weight, body fat (`readLatest`: 1 → 7 → 30
  days on Android, a newest-first query on iOS), distance and calories today (Android: Health Connect's total calories
  from one app — `sumOneSource`; iOS: active energy). Tiles show only readings that exist, with typical ranges
  (NHS / NEWS2) as information. `checkAuthorization` (Android) / `kx_more_health_asked` (iOS) decide whether the card
  asks for the new types once ("Allow in Health Connect"). None of it leaves the phone (the server still only gets
  steps, today's heart rate, HRV and sleep for quests).
- **Check-in** (`src/lib/checkins.ts`, `kinetix_checkins`, 60 days). **Workouts** (`src/lib/workouts.ts`): detected ones
  from `Health.queryWorkouts` (30 days, sessions under 5 min dropped, ids remembered in `kinetix_detected_workouts` so the
  Rewards total keeps growing); hand-added ones stay in `profile.workoutsLogged` as "Run · 30 min (dd/mm/yyyy)".
  `kx_workouts_asked` marks connections that already asked for the workouts permission (`HEALTH_READ_TYPES` in App.tsx).
- **Movement breaks** (`src/lib/moveReminders.ts`; Android `MoveReminderPlugin` + `MoveReminderReceiver`, prefs `kx_move`,
  inexact 15-min alarm re-armed on boot/update, own channel `kx-move`, notification id 9300; iOS ids 9300–9339). Keys
  `kinetix_move_enabled`, `kinetix_move_minutes`, `kinetix_move_prompt`. Same active hours as water reminders.
- **Notifications, redesigned 28 Sep** (`styled()` in `src/lib/notifications.ts`): each kind has a badge
  (`kx_notif_<kind>` large icon on Android, `public/notify/<kind>.png` attachment on iOS — `scripts/app-icons/notify.mjs`),
  a header (`summaryText`, e.g. "Hydration · 2 L goal"), a longer `largeBody` when expanded, a thread id, and actions:
  `KX_HYDRATION` (Add a glass → logs one and opens Hydration; Remind me in 30 min) and `KX_STREAK` (Check in). Streak
  reminder: 19:30 on days without a check-in, ids 9500–9506, channel `kx-streak`, `kx_streak_reminder` (Account →
  Reminders). `scheduleNotifications()` retries without attachments if iOS refuses one. No emoji (tested).
- **Notifications** (`src/lib/notifications.ts`): Android channels (Water reminders / Activity / Nutrition goals; the
  native movement break uses its own `kx-move` "Movement breaks" channel),
  white status-bar icons `ic_stat_water` / `ic_stat_kinetixfit`, rotating reminder copy, a "Remind me in 30 min"
  action. Turning reminders off now cancels them (it used to leave them firing). In-app banner (`.alert-ticker`)
  is a frosted-glass pill with a countdown bar; tap or swipe up to dismiss.
- **Home-screen widgets, Android + iOS — 14, the same on both** (the 10 water/daily styles below, plus Streak and the
  Plus widgets Check-in, Quick log, My stats — `StreakWidget` / `CheckInWidget` / `QuickLogWidget` / `StatsWidget` on
  Android; `StreakView` / `CheckInView` / `QuickLogView` / `StatsView` + `CheckInIntent` / `QuickLogIntent` on iOS, where
  a bundle takes at most 10 widgets so the rest sit in `MoreWidgets`) (redesigned 27 Sep after several rounds of user
  feedback; the user is to pick which water styles to keep): **Water bottle** (`HydrationWidget`), **Water level**
  (the card is the glass, water rises; text changes colour at the waterline), **Water ring**, **Water quick add**
  (+ glass of your size / + 500 ml bottle; 1 L if the glass is 500), **Water this week** (bars in tracks + goal days),
  **Daily rings** (steps / water / food), **Steps**, **KinetixFit today** (three equal columns: steps, kcal left, quests,
  each number + label + bar), **Quick scan** (Snap food / Scan barcode), **Water glass** (28 Sep, was Liquid glass
  (test)). Look: solid cards
  (white → pale aqua / deep ink, crisp edge, water glow), header chip + small-caps label, Archivo numbers, glossy
  gradient buttons (one gradient + hairline — a separate highlight shape once stuck out and looked like a shadow),
  gradient rings with an end cap. Research behind it: GO Club (Liquid Glass look), WaterMinder / Waterllama, Apple
  Activity rings / Gentler Streak, Google's widget quality tiers (fill the grid, system corner radius, light + dark,
  48dp targets, previews, distinct names). Water is shown in ml / L everywhere. Taps use `kinetixfit://` (`scan/photo`,
  `scan/barcode`, `today`, `hydration`; MainActivity intent-filter / iOS URL scheme), handled in App.tsx via
  `CapacitorApp.getLaunchUrl()` + `appUrlOpen` (ignored until signed in). Data: `src/lib/widgets.ts` →
  `WidgetBridgePlugin` (Android SharedPreferences `kx_widgets`; iOS App Group `group.com.jnglobalventures.kinetixfit`),
  incl. `waterMl`, `waterGoalMl`, `glassMl`, `waterWeek` (ml), `kcalEaten`, `kcalTarget`; older keys (`waterGlasses`,
  `waterGoal` = goal in glasses of the current size) are still sent.
  - **Android** (`android/app/src/main/java/.../kinetixfit/`): every provider extends `SizedWidget` (`build(context,
    sizeDp)` + `fallback()`; `SizedWidget.all()`; `WidgetStore.refreshAll()` redraws all). `WidgetStore.updateSized()`
    hands the launcher a `RemoteViews(Map<SizeF, RemoteViews>)` built from `OPTION_APPWIDGET_SIZES` (Android 12+), so
    resizing swaps layout + redraws art; each widget has short (h < 120dp) / square / wide layouts
    (`res/layout/widget_*`). Root `@android:id/background` + `clipToOutline`, radius `kx_widget_radius` =
    `system_app_widget_background_radius` on v31. Colours `values(-night)/widget_glass_colors.xml` (card) + `kx_lg_*`
    (glass test). Art is drawn as bitmaps in `WidgetArt.java` (launchers ignore custom widget fonts): `amount` (big
    number + small unit), `display`, `bottle`, `waterLevel`, `gradientRing`, `rings`, `trackBars`, `glowBar`,
    `liquidGlass` / `glassButton` / `glassGroove`, `fitSp` (one number size for a row). Shared water data:
    `WaterWidgets.java`. + buttons: `HydrationWidget.addGlass()` / `addGlasses(ml)` → `ADD_GLASS` broadcast →
    `WidgetStore.addPendingDrinks`. **Haptics:** `HydrationWidget.haptic()` — `EFFECT_CLICK`, `EFFECT_DOUBLE_CLICK` when a
    tap crosses the goal, with `USAGE_PHYSICAL_EMULATION`: a widget tap runs in the background and Android drops
    `USAGE_TOUCH` vibrations from background apps ("Ignoring incoming vibration as process … is background"); it checks
    `Settings.System.HAPTIC_FEEDBACK_ENABLED` itself. Quick scan + Water quick add have `maxResizeHeight` 130dp.
    **Water glass** (`GlassWidget`, kind name kept): a clear tumbler filling with water (`WidgetArt.waterGlass` — as tall
    as its box allows, tumbler to highball; a dark outline over light wallpapers) on a frosted card. Android can't
    blur/refract what's behind a widget and apps can't read the wallpaper image on
    Android 13+, so `GlassWidget` tints its drawn glass with `WallpaperManager.getWallpaperColors()` (no permission) and
    uses dark text when `HINT_SUPPORTS_DARK_TEXT`. Refresh every 30 min + whenever the app changes the numbers (the shell
    can't send `APPWIDGET_UPDATE`). One UI 2x2 = 176×212dp, 4x2 = 376×212dp, 2x1 = 176×94dp on the S21 FE.
    Debug gallery: `android/app/src/debug/.../WidgetGalleryReceiver.java` (see Current status).
  - **iOS** (`ios/App/KinetixFitWidgets/`, extension target `KinetixFitWidgets`, bundle id
    `…kinetixfit.KinetixFitWidgets`, embedded via "Embed Foundation Extensions"): `WidgetViews.swift` (every look; views
    take `family` as a parameter), `KinetixFitWidgets.swift` (bundle, `KXProvider` timeline — every 15 min for 6 h + each
    reminder + midnight — and configs; small + medium, lock-screen variants for Water bottle / ring / Steps),
    `WidgetStore.swift` (port of WidgetStore.java: ml, week, next reminder, pending drinks). Buttons: `AddGlassIntent`
    / `AddBottleIntent` (AppIntents, iOS 17+; iOS 16 has no buttons). Water level uses `.contentMarginsDisabled()` and
    draws its text twice (dark, and white masked by the wave). iOS widgets can't play haptics. Water glass: the tumbler
    is `WaterGlassArt` (a SwiftUI Canvas port of the Android art) on `LiquidGlassBackground`.
    `App/WidgetBridgePlugin.swift` writes the App Group and calls `reloadAllTimelines()`; `MainViewController.swift`
    registers it. Debug gallery: `WidgetViews.swift` + `WidgetStore.swift` are also compiled into the app;
    `App/WidgetGallery.swift` renders with `ImageRenderer` (fonts registered from the appex) via the debug-only
    `WidgetBridge.renderGallery`. iOS 16.4 fallback: `widgetCard()` pads + draws the background itself. A real iPhone /
    App Store build needs the App Group on the paid team.

### Food logging (27 Sep; the food-scan fix 29 Sep — uncommitted until pushed)
- **Log** (`src/lib/foodLog.ts`): `kx_food_days` = local day → entries (90 days; older `kx_food_log` /
  `kinetix_today_intake` migrate in once — running totals become one "Earlier today" entry). An entry = food name +
  `qty` × `unit` (`unitGrams`; `g` = grams / ml for drinks) × `eaten` (1, ¾, ½, ¼) + its own copy of `per100g` +
  `missing` nutrients + `note` + `extras` (+ `meal` for a meal photo's foods, `amountGuess` for an amount the photo
  couldn't show). Totals everywhere (`dailyConsumables`, quests, widgets, AI ideas) are derived from the entries; food
  checks count a meal photo once (`mealCount`). Edit / remove / log again: `src/components/FoodEntrySheet.tsx` (+
  `ExtrasPicker`). Its amount box empties when tapped (the amount as its placeholder — a phone's tap can undo "select
  all", and a typed 5 used to join the old 100); every typed number counts, kept within 1 g – 5 kg (0.5 – 50 units).
- **Saved foods** (`kx_foods`, 200 most recent): per-100 g values + known units (e.g. slice = 36 g) + `density` when
  known, keyed `bc:<barcode>`, `name:<food>` or `usda:<fdcId>`. Re-scanning a barcode, typing a food logged before, the
  "Again" chips and every edit never call the server or spend a scan.
- **Typed checks, in order:** saved foods → the **USDA table** → the server. `parseTypedPortion` reads amounts on the
  phone ("2 slices of bread", "150g rice", "2 eggs", "200 ml milk", "1.5 l water", and after the name with a unit:
  "pickle 5g", "bread 2 slices"), so only the food's name is looked up; `savedFoodPortion` applies them to a saved food
  (ml by density, below).
- **Typed meals** (29 Sep; `splitTypedMeal` in foodLog.ts — on the phone, no AI): "muesli with milk and banana", "2 roti
  and dal", "rice, dal + a glass of milk" are split on , + & "and" "with" — only when **at least two** of the foods are
  known on the phone (saved, or the table) and **at most one** isn't (it goes to the server: never more lookups than the
  whole phrase took). The longest known run stays one food ("tofu and vegetables"), so a known phrase is never split;
  tea / coffee / chai keep their add-ons ("tea with milk and sugar" is one drink, looked up whole as before; "50 ml milk"
  with its own amount is a food); an unknown add-on (salt, mayo) keeps the text whole. `logTypedMeal` (App.tsx) looks
  each food up with its own amount (saved → table → server, `foodForName`) and logs it under one `meal` (`logMealFood`,
  allergens per food) on the `MealResultCard`; a food that can't be looked up shows as "Not added". Dish names stay
  whole ("mac and cheese", "sweet and sour chicken"), and so do "muesli with milk" / "butter chicken and naan" until the
  unknown food has been logged once.
- **USDA table** (`src/lib/foodTable.ts`, 135 foods): per-100 g values + USDA portion weights (banana 118 g, roti 68 g,
  idli 38 g, a cup of rice 158 g) generated by `scripts/food-table/gen.py` from USDA FoodData Central's SR Legacy (2018)
  and FNDDS 2021-23 CSV downloads (fdcId per food; how to run it is in the script's header; the CSVs go in the gitignored
  `scripts/food-table/usda/`). 28 Sep added 42 for the meal ideas: Indian (chana saag, fish curry, vegetable curry,
  vada, chaas, pulao, bhindi, baingan, puri, toor dal, moong, sprouts, besan, mutton, keema, surmai, dalia, sarson,
  karela, lauki, lobia…), UAE (hummus, falafel, pitta, tabbouleh, lentil soup, kebabs, ful, hammour) and Singapore
  (congee, rice noodles, dumplings, chow mein, pak choi, sea bass). The generator refuses a food without kcal, protein,
  carbs, fat or fibre (the app shows those as known — USDA gives no fibre for makhana, so it isn't in). Includes Indian foods (roti, naan, paratha, dal, idli, dosa, masala dosa, upma, sambar,
  biryani, samosa, chicken curry, palak paneer, paneer — USDA's standard recipes; USDA's paneer shows 22 g carbs).
  Regenerate with the script rather than hand-editing. `findTableFood` ignores filler words ("a medium banana").
  The script also writes **`api/_lib/foodTable.js`** (the same foods + each one's USDA description, for the server;
  `api/__tests__/foodTable.test.js` checks the two agree) and gives the 8 drinks `drink: true` + `mlToG` and poured
  foods (oil, ghee, honey, sambar, lentil soup, curry sauce) `mlToG` alone, from USDA's own volume portions (milk
  1 cup = 244 g → 1.031; olive oil 0.913; honey 1.433). The unchanged script reproduced `foodTable.ts` byte for byte
  before those fields were added (the CSVs were in an old session's scratchpad; download them again if gone).
- **Accuracy guard:** `isPlausible(per100g)` (≤ 905 kcal, protein + carbs + fat ≤ 101 g, kcal within 40% of 4/4/9)
  refuses impossible server results with a message; saved foods failing it — or, not from a barcode, plainly another
  food than the table's one of the same name (`farFromTable`: the old server's candy "watermelon slice", soybean-curd
  "curd") — are dropped on load; logged entries failing it get the table's numbers when the name matches (entries are
  otherwise never rewritten). The result card says where numbers came from ("Nutrition from USDA SR Legacy: Banana",
  "USDA: <matched food>" from the server, "an AI estimate", or "Open Food Facts").
- **Server, typed checks (`api/scan-meal.js` → `api/_lib/nutrition.js`)** — why it was rebuilt: typing "banana" logged
  152 g carbs / 47 g protein (a *Branded* "BANANA" spread treated as per 32 g serving; the search API gives every food
  per 100 g), and on 29 Sep "watermelon slice" was a candy (207 kcal) because every typed word had to be in USDA's name,
  "curd" was soybean curd cheese (12.5 g protein), "chai" matched "Chain", "milk" was buttermilk. Now:
  `normalizeFoodName` (`api/_lib/foodNormalize.js`: drops amounts and piece / serving / size words; veg → vegetable;
  whole names curd / dahi → yogurt, chai / masala chai / milk tea → tea with milk; "curd rice" stays a dish) → **the
  app's table** (`findTableFood`, the phone's own rules — a test checks every name finds the same food) → USDA
  Foundation / SR Legacy / FNDDS → branded only when nothing generic matches the words, never sweets (candy, gummies,
  confectionery… by name or category) unless asked for. `matchScore()`: whole words only — plural, -ed / -ing, or two
  typed words joined in USDA's name ("broad beans" → "Broadbeans") — then the old ranking (a whole part of the name,
  plain over processed forms, whole food over parts, cooked for rice / meat / pulses, no capital-letter brands, "with …"
  penalised). Checked over ~495 names: nothing valid lost. Branded foods are per 100 of their serving unit (USDA: ml
  for drinks) → per 100 g by density. USDA fetch timeout 5 s. Returns `per100g` (`null` = not in the database),
  `matchedFood`, `satFat` + `sugars`, and for liquids `drink` / `density` / `densityAssumed` (older apps ignore them).
- **Server, photos** — `api/_lib/identifyClaude.js` asks Claude **once** (`SCAN_MODEL`, default `claude-sonnet-5`;
  thinking off, effort low — none for Haiku 4.5 —, 1,200 tokens, SDK timeout 20 s + 1 retry; it used to read
  `content[0].text` while Sonnet 5 thinks by default, so a thinking block first failed good scans). The contract is
  model-independent, in `api/_lib/identify.js` (a Gemini provider would reuse it): `MEAL_SCHEMA` (kind meal / not_food
  / unclear; each food: name, form raw / cooked / dry / drink / prepared, amount in g or ml, count + piece, confidence,
  amountConfidence, ≤ 2 alternatives, `typicalPer100g`, packaged), the prompt (every separately seen food; a dish cooked
  as one stays one — biryani, upma; portions from the plate / bowl / spoon / glass, rounded; low confidence rather than
  false precision; the optional **note**), `validateMeal` (≤ 8 foods; amounts clamped and rounded to 5 / 10 / 25 g,
  coarser when unsure; no usable amount → `null`, never a made-up one) and `applyNoteAmounts` (the person's amounts,
  exact, one food each). Each food then goes through `lookupNutrition(name, { typical, form, unit })`: the model's
  typical numbers are only a **guard** (`agrees()`: a database food over 60 kcal and 50% — or 4 g and 60% of protein —
  away isn't what was seen, so the next one is tried; the numbers used always come from the table / USDA); a food seen
  cooked / raw / dry is searched in that form first (porridge isn't dry oats); branded ones must agree; nothing that
  fits → the model's numbers as a labelled **AI estimate** (`fromTypical`). Response: `items[]` (each food's amount +
  unit, grams, density, `per100` per its own unit, matchedFood, source, confidence, amountConfidence, amountSource,
  alternatives, needsReview) + `mealName`, **plus the old top-level fields** — one food exactly as before (the apple
  snapshot), several as the whole meal by weight (`api/_lib/mealTotals.js`: totals from each food's unrounded numbers,
  rounded once; per100g × weight = the totals). No food / unclear / no amount and a declined photo → 422, cut off → 502 —
  none counted against the day's scans. Every call logs `scan-meal usage` (model, tokens, ms). `maxDuration` 30 s.
- **Meal photos in the app** (`finalizeMealPhoto` in App.tsx, servers that send `items`; older ones get the old flow):
  one food → the usual card (`foodFromScanItem` gives exactly the entry the old fields did); several → each its own
  entry with `meal: { id, name }` (Today's food shows the meal's name under each), listed by
  `src/components/MealResultCard.tsx` (tap → the usual FoodEntrySheet). Foods with `needsReview` are never logged on a
  guess: "Yes, add it", "It's <alternative>" (the photo's amount, that food's numbers via saved → table → server), "Skip";
  no amount / no numbers → "Type it". Allergens and diet notes per food. The note and its add-ons go with the first food
  (`extrasFromNoteExcept`: no milk splash when milk is its own food). A low `amountConfidence` shows as "a guess" until
  the amount is changed in the sheet.
- **Liquids:** ml become grams only by a density, never 1:1 — the table's `mlToG`, an FNDDS volume portion,
  `KNOWN_DENSITIES` (`api/_lib/density.js`, mirrored in `foodLog.ts`; a test checks they agree), else 1 g/ml marked as
  assumed. Drinks are kept per 100 ml with amounts in ml, like barcode drinks: table drinks show ml ("1 glass · 237 ml",
  same kcal as 244 g), "200 ml milk" = 126 kcal (not 122), grams typed for a drink become its ml. Oil / ghee / honey stay
  by weight ("15 ml olive oil" = 13.7 g). Barcode drinks are unchanged.
- **Known limits of the food-scan fix:** chai maps to USDA's only "tea with milk", which is sweetened (~30 kcal high for
  an unsweetened mug); a photo food without a piece count logs as "1 portion · 200 ml" (the sheet's + then steps half a
  portion); a typed drink that isn't in the table is logged by weight (300 ml lassi → 309 g); an unknown density is
  1 g/ml; up to 3 USDA searches for a food outside the table, uncached; a typed meal's food without an amount gets its
  usual portion (a glass of milk, 1 tbsp butter / ghee / honey, 100 g for a food from the server); "chips" is the
  table's crisps ("egg and chips").
- **Barcodes (`api/lookup-barcode.js`)**: Open Food Facts servings in g or ml (a bare "100" isn't trusted), pack size
  (`packageGrams`), `liquid`; default = a serving → else a pack up to 1 kg / 1 L → else 100 g; `per100g` with `null` for
  missing values; `servingLabel`. The app shows ml for drinks and offers "bottle".
- **Allergens:** only the person's own (Account → Diet & allergies) warn — "None" means none; a barcode's label allergens
  show as "Label lists: …" for information. Since 28 Sep (`src/lib/allergens.ts`, `AllergyPicker`): vegetarians aren't
  offered fish / crustaceans / molluscs (no-egg: eggs) unless already picked; anything else can be typed ("kiwi"; names
  of label allergens map to them: "shellfish" → crustaceans + molluscs, "gluten" → wheat, "soy" → soya), stored as typed
  in `personalAllergens` (max 20 typed). Checks are by whole words, singular or plural (`allergiesIn`): label allergens
  also by the foods they're in ("paneer" → milk, "roti" → wheat, not "coconut milk" / "peanut butter"; "gluten-free",
  "eggless" clear them), typed ones by their own words ("kiwi" finds "kiwifruit"); barcodes also by the pack's allergens
  and ingredients up to "may contain" (`flagAllergies`). Meal ideas, the gut report's foods and AI ideas leave them out.
- **Notes + add-ons:** "Describe it (optional)" in the scan window (sent with photos, saved as the note);
  `EXTRAS` (sugar tsp, salt pinch, honey, butter, ghee, oil, milk splash, cheese slice, mayo tbsp) as chips on the result
  card and in the sheet, added to the entry × eaten; a note like "with 2 tsp sugar" pre-adds them (`extrasFromNote`;
  ignores "almond milk", "sugar-free", "no/less sugar").
- **Needed vs eaten** (`src/components/NutritionMeters.tsx`, targets `src/lib/nutrition.ts` with sources in its header):
  protein / fibre = goals, calories / carbs / fat = aim-for targets (±10%), saturated fat / sugars / salt / potassium /
  iron / calcium per the country's guidance (sugars have a target only in GB/IE). Nutrients a source doesn't give show
  "from N of M foods" or "Not listed", never 0.
- **Food history** (`src/components/FoodHistorySheet.tsx`, Today's food → History): 14-day calorie bars vs target, 7-day
  averages + days on target, any day's meters + foods (change / remove on that day, **Log again today**).
- **Scan animation** (`src/components/ScanProgress.tsx`, `.kx-scanfx` in app.css): while a typed / photo / barcode lookup
  runs — frosted overlay, rings, spinning arc, scan beam, sparkles, a new line every 1.5 s with a selection haptic; on
  the result: green tick + "Got it · <food>" + success haptic/chime, then it fades and scrolls to the result. Saved /
  table foods are instant (no overlay); errors drop it. State `scanFx` in App.tsx.

### Meal ideas: ranked list (free) + AI ideas (Plus) (27–28 Sep, uncommitted until pushed)
- **Ranked list, on the phone** (`src/lib/mealIdeas.ts`, 28 Sep): 117 meals built from USDA table foods (nutrition from
  `foodTable.ts`), ranked by `rankMeals()`: calories against what's left for this meal slot (`slotBudget`), the goal
  (protein / fibre / carbs weights), today's gaps, the gut report (foods to favour / go easy on, fermented), diet +
  allergens incl. typed ones (hard filters), dishes eaten recently (lower) and quick prep; `diversify` keeps each page
  of 3 from repeating a main ingredient, and while it can, a staple (bread or rice).
- **By country (user, 28 Sep: "for Indians show only Indian foods", "no beef for Indians")**: each meal has
  `cuisines`; `CUISINES_BY_COUNTRY` is a hard filter — IN `indian` only; AE `mideast`, `med`, `indian`; SG `sg`,
  `asian`, `indian`; GB/IE/AU/NZ/US/CA the Western list (`uk`, `american`, `med`, `asian`; a few curries and the falafel
  wrap are cross-listed `uk`). The first cuisine gets +1.5, the second +0.5. `COUNTRY_AVOID`: IN beef / veal / steak,
  AE pork / ham / bacon… (whole words, also applied to AI ideas on the phone, `avoidedThere`). Poha uses raw white rice
  (USDA has no flattened rice); labneh is Greek yogurt. Tests check every country × slot has ≥ 9 (snacks 6) and a
  vegetarian-no-egg person without milk or wheat still gets ≥ 3. "Show 3 more" pages through (`PAGE_SIZE`), "Not for me" hides a meal
  (`kx_meals_hidden`), "I ate this" logs it with its USDA nutrition. No server, no cost, works offline.
- **AI ideas (Plus):** 9 per request (`IDEAS = 9`), shown 3 at a time; the app sends the names already shown
  (`exclude`, last 27) and the server drops repeats. Falls back to the ranked list on any error.
- `api/suggest-meals.js`: official `@anthropic-ai/sdk`, `claude-opus-5` at effort `low`, structured JSON output
  (`output_config.format` json_schema; the count is in the prompt + description and capped server-side — no
  `minItems`/`maxItems`: structured outputs don't support array length constraints and `messages.create` sends the schema
  as-is; `containsMeatOrFish` / `containsEgg` filter by `profile.diet`), server-side refusal fallback (`fallbacks: "default"`,
  beta `server-side-fallback-2026-07-01`). Plus checked strictly; 6 generations a day (phone's time zone); the country shapes ingredients + guidance, and
  `COUNTRY_FOOD` adds a rule for IN (Indian only, never beef), AE (Middle Eastern first, never pork) and SG, with
  avoided meats filtered by name too; identical inputs cached 30 min (free re-open). Allergens (label + up to 20 typed,
  34 in all, 40 chars) excluded in the prompt **and** filtered server-side from `containsAllergens` and, for typed
  ones, by name (`mentions`).
  `maxDuration: 60`. Not yet tested against the live API (no local key) — test on the Vercel preview/production.
- App: Nourish "Ideas for your next meal" card — "Ranked for you" / "AI ideas (Plus)" switch; AI inputs: goal, BMI
  band, profile, targets, today's totals + food names (`dailyConsumables.foods`), steps, sleep, today's workouts.
  Gut and cycle data are never sent.
- Bigger recipe catalogues later, if wanted: Spoonacular (`findByNutrients`, free tier ~150 points/day) or Edamam (paid)
  — both add images/recipes; TheMealDB is free but has no nutrition. Open Food Facts stays for barcodes.

### Period tracking (28 Sep, uncommitted until pushed)
- `src/lib/cycle.ts` + `src/components/CycleCard.tsx` (Today, for a female profile): `kx_periods` = the days periods
  started (the profile's old "last period started" moves in once). Cycle length = average of the last 6 cycles (the
  entered length until there are two periods); next period = last start + that, shown as a window (± spread, ≥ 2 days);
  confidence rough / fair / good; ovulation 14 days before the next period (not mid-cycle), fertile window the 5 days
  before; phases period / follicular / fertile / ovulation / luteal / due / late; irregular per the NHS (outside 21–35
  days or varying > 8). "My period started today" + a sheet to add past starts / remove one (a start within 10 days of
  another = the same period). Days are local (`noon()` parsing — no UTC shift).
- **Honest scope:** sleep, training, eating and HRV can't predict dates; `cycleContext()` only notes what's known to
  delay a period (average sleep < 6.5 h, ≥ 7 h training a week, eating < 70% of target, HRV down 20%) as context.
  "Not a way to prevent pregnancy" on the card. Phone-only (never sent to the server or the AI).

### Countries (27 Sep, uncommitted until pushed)
- One table: `src/lib/countries.ts` (app) + `api/_lib/countries.js` (server reward rules — keep charity ids and the
  live flags in step; a Node check compared them on 27 Sep). `profile.country` (null → a UK region means GB, else the
  phone's region via `navigator.languages`, else GB). Onboarding asks the country first (phone's region preselected),
  then "Which part of the UK?" (optional) for the UK only; Account → Your details has Country (+ Region for the UK).
- Per country: locale for numbers/dates (`fmtNumber`/`fmtDate`/`fmtMoney`; en-IN groups lakhs), currency, US units
  (height in in with a "5 ft 6 in" caption, weight in lb — stored cm/kg), km/miles for the 10,000-steps moment,
  onboarding fact, BMI cut-off (India and Singapore 22.9, others 24.9) + named source, weight-loss pace copy, fibre
  target (UK 30 g, US 14 g/1,000 kcal, CA 25/38, AU+NZ 25/30, IE 25, SG 20/26, IN+AE WHO 25), the allergens that
  country's labelling law lists (UK/IE 14, US 9, CA priority list, AU/NZ PEAL, IN/SG/AE Codex), allergen names
  ("Soy", "Tree nuts", "Shellfish"…), charities + donation amount. Sources are in the header comment of countries.ts.
- Server: daily limits (scans, AI meal ideas) use the phone's time zone (`timeZone` in the request; UK time for older
  builds); donate-charity / redeem-voucher refuse countries that aren't live and charities from another country;
  requests with no `country` are older UK-only builds. AI meal ideas get the country (local supermarkets + guidance).
- Food follows the country too (28 Sep): meal ideas only show that country's dishes (India Indian only, never beef; the
  UAE never pork) — `CUISINES_BY_COUNTRY` / `COUNTRY_AVOID` in `src/lib/mealIdeas.ts`, `COUNTRY_FOOD` in
  `api/suggest-meals.js` (keep them in step); the gut report's foods have `only` / `notIn` countries.
- Stored formats stay en-GB on purpose: workouts "Label (dd/mm/yyyy)" are parsed back by regex.
- Needs the user (not code): charity agreements before any country goes live, Tremendous catalogue/funding per
  currency, privacy policy + terms per market (US state health-data laws such as Washington's My Health My Data Act,
  CCPA; EU GDPR + EU representative for Ireland; India DPDP Act; Australia Privacy Act; Canada PIPEDA), Play Console
  / App Store country availability. **Worth a human check:** Singapore's 20/26 g fibre figure and each onboarding fact.

### Onboarding and navigation (27–28 Sep, uncommitted until pushed)
- **Sign-in first**: no welcome screens; steps 0-2 all render the sign-in screen (compact brand panel `.ob-hero-compact`).
  Log in is preselected after logging out or when the phone has a saved profile.
- **Who skips onboarding** (`src/lib/onboarding.ts`): `kinetix_onboarded_email` is set when onboarding finishes and kept
  through log out, so the same account logging back in opens Today. `markLoggedInAccount()` (run once at start-up) marks
  accounts that finished before the marker existed — only if still logged in (`kinetix_logged_in`). **Never infer
  "finished" from the profile**: About you fills in the country on its first page, and that rule skipped people's pages.
- **Only the sign-in screen acts on the Supabase session** (`onSessionChange` in App.tsx: `!isLoggedIn && onboardingStep
  <= 2`). supabase-js fires SIGNED_IN / TOKEN_REFRESHED when the app returns to the foreground; acting on those
  mid-onboarding jumped people ahead.
- **Resuming**: the step reached (3–6) is saved per account in `kx_ob_step` and restored after sign-in or a restart;
  cleared on finishing and on log out. About you restarts at its first page (answers are already saved in the profile).
- **Back**: `src/lib/backButton.ts` — a stack of claims; `useBackHandler(active, onBack)`. `Sheet` (Pickers.tsx) claims
  it while open; App.tsx claims it for the portal pop-ups (scan, device sync, log out, no-stress notice; the level-up
  celebration swallows it) and each onboarding step (sign-in "forgot" → log in; steps ≤ 3 leave the app; 4 → 3;
  About you handles its own pages; 6 → About you's Plan page via `openAboutYou(true)` / `initialStage`). Unclaimed, the
  listener falls back to the WebView history (tabs, account pages), then `exitApp()`. **New sheets/pop-ups: use `Sheet`
  or call `useBackHandler`.**
- **Health step**: once connected it says so and shows Continue; connecting from it moves on to step 4 by itself.

### Gut health and diet (28 Sep, uncommitted until pushed)
- **Diet** (`src/lib/diet.ts`, `profile.diet`: `'everything' | 'vegetarian' | 'vegetarian-no-egg'`, null = not asked =
  everything). "Vegetarian" alone is ambiguous (eggs: fine in the UK, usually not in India), hence two options. Asked on
  onboarding step 6 "Your food" (required — Finish is disabled until chosen) and in Account → Diet & allergies.
  `checkFood(name)` finds meat/fish/egg by whole words (strong meat words always count; burger/sausage/mince/keema…
  unless the name says veg/soya/paneer…; "eggless"/"vegan" clear egg; "eggplant" is fine). `checkProduct()` for barcodes
  also uses the ingredients (ignoring "may contain…" traces), Open Food Facts' `vegetarian` (from
  `ingredients_analysis_tags`, new in `api/lookup-barcode.js`) and label allergens (eggs). Stored on the saved food as
  `diet`. Applied: the food result card's `dietNote` (information only, still logged), the free meal-ideas list
  (`diet` tag per idea), AI meal ideas (`profile.diet` → prompt rule + `containsMeatOrFish` / `containsEgg` in the schema,
  filtered server-side), the gut report's suggestions (`tagFits`).
- **Gut check** (`src/lib/gut.ts`, `kx_gut_checks` = day → `{ feel 1–5, symptoms[], at }`, 90 days): Today card
  `.kx-gut` (same controls as the morning check-in, in green); Change/Cancel; a 7-day strip. **Report** unlocks when the
  first check-in is ≥ 7 days old and ≥ 4 of the last 7 days have one (`gutReportStatus`, `reportProgressText`).
  `buildGutReport()` (pure; App passes the food log, water per day, fibre target, diet, allergens): average feeling,
  good/rough days (rough = 1–2, or 3 with a symptom), symptoms by days, fibre a day (≥ 3 logged days), different plants
  (word → plant table; "30 a week" = American Gut Project), fermented days, water; **foods to try** = `GUT_FOODS` (≈30,
  tagged fibre/fermented/gentle/settling/constipation/heartburn/nausea/gassy, diet + allergens) scored against what stood
  out (a symptom on ≥ 2 days, fibre < 70% of target, ≤ 1 fermented day, < 15 plants), minus foods already eaten on ≥ 3
  days and possible triggers; **maybe go easy on** = `possibleTriggers()` (eaten ≥ 2 days; rough that day = 1, the next
  day = ½; ≥ 75% and ≥ usual + 25%; never when ≥ 75% of days were rough) + foods eaten that week known to cause the noted
  symptom (gassy / heartburn / loose word lists); tips; see-a-doctor note (strong when ≥ 5 rough days, a symptom on ≥ 5
  days or pain on ≥ 3). Wording follows the NHS pages (sources in gut.ts's header). **Never send gut data to the server**
  (health data; see Future enhancements → health conditions).
- **When** (user asked 28 Sep: morning or before sleep?): the evening — it asks about the whole day. Before 17:00 the
  card says "Best in the evening — it's about your whole day. We'll remind you at 20:00." and asks "How's your gut been
  today so far?"; later, "How was your gut today?". Until noon, if yesterday has no check, "Missed last night? Add
  yesterday's" saves one for yesterday (`gutForYesterday`).
- **Foods by country**: `GUT_FOODS` items can be `only` / `notIn` countries (idli, dosa, millet not suggested in the
  West; kefir not in India, sauerkraut not in India or the UAE); `buildGutReport({ country })`.
- **Reminder**: `gutReminderNotifications()` (notifications.ts, ids 9400–9406, channel `kx-checkin`, 20:00, next 7 days,
  skipping answered days; extra `{ open: 'gut' }` → Today scrolled to the card). Rescheduled when check-ins change.
  `kx_gut_reminder` on/off (Account → Reminders); off when "Skip for now" on the reminders step.
- **Patterns** (28 Sep, `gutPatterns()`): over the last 14 days, sleep, active minutes, water, fibre, a late meal (after
  21:00 the evening before) and HRV vs its median, compared on good and rough days — shown as "What went with better
  days" only with ≥ 3 days on each side and a clear gap. Associations, never predictions (self-reported, a fortnight).
- Not yet: the report on a real week of the user's data, the reminder on a phone, the gut data in the privacy policy /
  Play data-safety form.

### Sign-up and account emails (Supabase Auth, 28 Sep)
- Project settings (public `GET /auth/v1/settings`): email sign-up on, **email confirmation required**
  (`mailer_autoconfirm: false`), Google provider off. The emails come from Supabase's **built-in sender** unless custom
  SMTP is set up — it only delivers to members of the Supabase team, a few emails an hour, often late or in spam. That is
  why a tester's confirmation email only came after several tries. **The fix is in the dashboard (the user's login):**
  1. Authentication → Emails → SMTP Settings → custom SMTP. E.g. Resend (free 3,000 emails/month, 100/day): verify
     `kinetixfit.co.uk` with its DNS records, create an API key, then host `smtp.resend.com`, port 465, user `resend`,
     password = the API key, sender `noreply@kinetixfit.co.uk`, name "Kinetix Fit".
  2. Authentication → Rate Limits → raise "emails per hour" (custom SMTP starts at 30).
  3. Authentication → URL Configuration: Site URL `https://www.kinetixfit.co.uk`; Redirect URLs add
     `https://www.kinetixfit.co.uk/**` — **after** the merge deploys `/email-confirmed` (else confirmers land on a 404;
     until the URL is allowed, Supabase just uses the Site URL).
  4. Optional: Emails → Templates — brand "Confirm your signup" / "Reset password" (Kinetix Fit, no emoji).
  Stopgap if needed: Authentication → Providers → Email → turn off "Confirm email" (the app then signs people straight
  in — no email at all; weaker, anyone can use any address).
- App (`src/lib/auth.ts`, `handleAuthSubmit` / `resendConfirmation` in App.tsx): `emailRedirectTo` =
  `https://www.kinetixfit.co.uk/email-confirmed`; an email that already has an account is detected (`identities: []`)
  and said; "Send the confirmation email again" (`supabase.auth.resend`, 60 s apart) after sign-up and on
  `email_not_confirmed`; errors mapped to plain words (rate limit, wrong password, not authorised, network). Reset:
  `redirectTo` the web app; `openedFromRecoveryLink` (read in `src/lib/supabase.ts` before the client clears the link)
  opens authMode `'reset'` ("Choose a new password" → `updateUser` → sign out → log in); an expired link says so
  (`openedLinkError`). Checked in Playwright with Supabase mocked (new / existing sign-up, unconfirmed log-in, 429,
  reset link, expired link, the landing page). Not yet with real emails after an SMTP change.

### Website
- Live at www.kinetixfit.co.uk (apex redirects to www; also kinetix-fit-core.vercel.app). Deploys through
  Vercel's **GitHub integration** (team `kinetixfit`, project `kinetix-fit-core`): a push to any branch builds a
  **Preview**, a merge to `main` deploys **Production**. Preview URLs sit behind Vercel Authentication (401 without a
  team login), so the phone app can't point `VITE_SERVER_URL` at a preview without a protection bypass.
- Previews probably share production's Upstash Redis and API keys (not verified — needs Vercel dashboard
  access). Don't redeem promo codes, vouchers or donations on a preview.
- **Two builds (29 Sep):** `npm run build` → `dist/` = the app alone (what `cap sync` copies into Android/iOS — unchanged).
  `npm run build:web` (Vercel's `buildCommand`, `vite build --mode web`) → **`dist-web/`** (Vercel's `outputDirectory`):
  the marketing site at `/` (`site/index.html`), the web app at `/app/` (`index.html`), the branded `404.html`
  (`site/404.html`) and `site/public/` (robots.txt, sitemap.xml, og-image.png — website-only, so not in `public/`,
  which the apps also get). Vercel serves a real `index.html` before any rewrite, hence the move in `webLayout()`
  (vite.config.ts); its own folder so a website build can never reach the apps through `cap sync`.
- **Dev:** `npm run dev` keeps the app at `/` (so `?ob=N` works); the site is at **`/site/`**; `/app/` and
  vercel.json's page rewrites (`/privacy-policy`…) work as in production (`productionRoutesInDev()`).
  Production-like check: `npm run build:web`, then serve `dist-web/` (a Vercel-like static server was used: filesystem
  first, then rewrites, then 404.html).
- **The forwarder** (first script in `site/index.html`, tested in `src/site/forward.test.ts`): Supabase sign-in /
  password-reset / failed-link returns (`#access_token`, `type=recovery`, `?code=`, `error_code`) and old web-app
  bookmarks (`#vitals`, `#nourish`, `#account/…`, `#profile`, `#hub`) go on to `/app/` with the rest of the address kept,
  so `PASSWORD_RESET_URL` (`/`) and Google's `redirectTo` (origin) keep working unchanged — older app builds too.
  `#rewards` stays on the site (it's the Rewards section). `email-confirmed.html`'s "Log in here" → `/app/`.
- **Site code** (`src/site/`): `config.ts` (links, `REWARDS` — must equal points.ts + rewardConfig.js, tested;
  `SOCIAL_PROFILES`), `init.ts` (first screen at once, the rest at the first idle moment), `nav.ts` (frosted header,
  dark over `[data-header-dark]`, phone menu = modal with focus trap, scrollspy, "Log in" → "Open the app" when
  `kinetix_logged_in`), `reveal.ts` (reveals, the hero entrance, `[data-sprint]` width animation after the font loads),
  `rewards.ts` (the cup story: the beat past 55% of the screen sets the total), `parallax.ts` (hero only, scroll × speed
  → `--py` → the CSS `translate` property), `faq.ts` (native `<details>`, animated), `earlyAccess.ts` (form),
  `social.ts`, `format.ts`, `motion.ts`, `day.ts` ("Your day"'s lane: `--p` + `.is-passed`, scroll-linked, listening
  only while the day is near the screen), `widgets.ts` (the widgets' Light / Dark switch and the phone wall's keyboard
  stop), `site.css` (tokens from the app's palette; mobile-first; reduced motion and
  reduced transparency handled). **Rules learned:** a `[data-sprint]` line must never re-wrap when it widens (parts
  are `white-space: nowrap`, stacked on phones, sized in `cqi` from measured widths) — re-wrapping grew the page while
  scrolling; the full nav needs ≥ 1,120px (at 1,040 its links wrapped); `svg { max-width: 100% }` caps the hero lanes
  unless overridden. The phone and UI mockups are HTML/CSS copies of the app's real cards (numbers: the food table's
  roti and dal, the app's quest values).
- **Early access** — `api/early-access.js`: `early_access` sorted set (email → first join, ms) + `early_access:<email>`
  hash (email, platform, source, createdAt, updatedAt); same answer for new and repeat emails; honeypot `company`;
  8 sign-ups per hashed IP per hour; 400/429/500 with plain messages. Tests: `api/__tests__/early-access.test.js`.
- **Opening animation (29 Sep)** — `src/site/intro.ts` + site.css → Opening animation: the app's LaunchIntro at page
  size (five lanes draw, the mark laps, a runner sprints the middle lane, the wordmark widens, the lanes sprint off right).
  A gate script in the head sets `<html data-intro="run">` before the first paint: not when `sessionStorage.kx_intro_seen`
  is set (shared with the web app, so site → app shows it once), not with a `#hash`, not with reduced motion, not without
  module support. The overlay is the body's first element with `hidden` (no CSS → nothing shows); the run is pure CSS,
  intro.ts times the exit from the paint timing (`RUN_MS` 1600 after the first paint, `EXIT_MS` 760), any
  pointerdown / keydown / wheel / touchmove skips it, and a CSS failsafe hides it at 5 s if the script never runs. The
  hero's entrance (`initHero`) and then the demo start as the lanes leave.
- **The hero phone = the app (29 Sep)** — `.ap-*` in site.css copy the app's CSS (index.css tokens, app.css, glass.css,
  today.css) at the app's own px: `--u` = one app px at the phone's size (`calc(var(--pw) * 0.94 / 390)`), so values
  read as the app's (`calc(16 * var(--u))`). Screens: Today (hero, Hydration bottle, check-in, Steps + Heart rate trend
  cards), Rewards (level hero, points, quests in the app's order — claimed first), Nourish (targets + meters, Today's
  food). Numbers are the app's for "Maya" (female, 29, 165 cm, 62 kg, moderate, Cardio Endurance: 2,085 kcal / 87 g
  protein / 30 g fibre; quests from `questsForToday`; lunch from the food table) — `demo.test.ts` checks the quests
  against `src/lib/quests.ts`. `src/site/demo.ts` is a timeline of states (`BEATS`, `LOOP_MS` 19.8 s) written onto
  `.hero__stage` as data attributes (`data-scene`, `data-glass`, `data-claim`, `data-toast`…); words swap from
  `data-a` / `data-b`, the points count up; a touch dot shows each tap (positions in app px in site.css). It plays only on
  screen and in a visible tab (`.is-paused` otherwise); reduced motion shows Today with the glass added. The two
  floating widgets (Daily rings, Streak) use the app's widget-preview look; the water ring follows the demo. Phone-width
  parallax is off (the hero would clip the phone's foot). The ticker under the hero lists 14 features (doubled for a
  seamless loop, the copy `aria-hidden`; still with reduced motion).
- **The feature chapters (29 Sep, redesign step 2)** — `#features` ("Built around you.", after Why): five `.feat`
  articles (copy + `figure.feat__stage[data-feature]`, `role="img"` with a full description, the app inside
  `aria-hidden`), stage on alternate sides from 1,040px, stacked below it. Each stage is **one of the app's cards playing**:
  `.apx-*` in site.css are copies of the app's CSS (glass.css, app.css, today.css, pickers.css, widgets.css) at app px
  (`--u`, like the hero's `.ap-*`, which the chapters reuse for meters, food rows and the Steps card). Maya is the hero's
  example member, with one more fact: she's allergic to sesame. Her day: porridge + banana (08:20), dal + 2 rotis (12:31)
  = the hero's 1,023 kcal. **Every number and app string is tested against the app's code** (`features.test.ts`): the plan
  (mirrors `nhsTargets` — the test checks App.tsx still has those constants), `suggestGoal`'s BMI sentence, the 10 meters
  via `mainTargets`/`moreTargets`/`statusText`, dinner ideas = `pageOf(rankMeals(…), 0/1)` (23 ideas with her sesame
  allergy), the houmous result (`flagAllergies`, USDA hummus at 30 g), the photo = the idea "Salmon with sweet potato and
  broccoli" as 3 foods, `splitTypedMeal('2 roti and dal')`, the cycle days via `cycleToday` on 6 regular cycles (last start
  5 Oct, so 13 Oct = day 9 = the still step), the workout choices from `src/lib/workouts.ts`, and wording found in App.tsx
  / CycleCard / MealResultCard / WorkoutSheet / ScanProgress sources (`?raw` imports). The periods list uses Android's
  date format ("Mon, 7 Sept 2026"; iPhone Safari writes "Sep").
  **`src/site/features.ts`**: `TIMELINES` (steps per stage: body start→plan→fill→more · meals start→in→foot→page2→ai→back
  · scan rest→bc-scan…bc-result→ph-…→type→ty-result · cycle d2→d9→d12→d15→d21→d27 · watch rest→sheet→yoga→min45→down→
  added; `still` = what's shown when nothing plays, and the HTML is written in it). `paintStep` writes `data-step`, toggles
  `.is-now` on `[data-when]` (words stacked in one grid cell, `.apx-swap` / `.apx-stack`) and `.is-on` on `[data-on]`,
  counts `[data-count-to]` up from `data-count-zero` steps; `touchAt` puts the dot over `[data-touch-target]`; `scrollFor`
  **measures** (offsetTop, a frame after the step) how far a card scrolls inside its `[data-viewport]` so the step's
  `[data-scroll-when]` element is in view — works at any size. A stage readies (paints its first step, instantly) only as
  it nears the screen, plays at 30% visible, pauses off screen / in a hidden tab, loops with a fade; reduced motion or no
  IntersectionObserver → the still step. **Rules learned:** (1) never build font sizes on container units or container
  queries — in Safari a `--cw` custom property made of `100cqi` feeding `--u` left the *footer's* text colour unresolved
  (black) for ~0.5 s after load (axe flagged it 1 run in ~20; Playwright's request interception made it happen almost
  always — a handy amplifier). `--cw` now comes from the viewport (`min(358px, 100vw − 2 gutters − 36px)`), float
  positions use %; container queries only move floats and set stage heights. (2) Stages have fixed heights
  (`--stage-h`), so `content-visibility: auto` skips their rendering off screen with no layout change (brought mobile
  Lighthouse back from 90–95 to 94–96). (3) The workout sheet is `visibility: hidden` when closed (its backdrop blur is
  costly). (4) Chapters' measured scrolls need the step's layout settled: with reduced motion even a card opening is a
  1 ms transition, hence the frame's delay.
- **The widgets showcase (29 Sep, redesign step 3)** — `#widgets` ("Glance. Tap. Done.", between Features and "Your
  day"; not in the nav, which has no room below 1,120px): copy + the Light / Dark switch beside a home screen, then "All
  14 widgets". **The widgets are the iPhone widgets' own design** (ios/App/KinetixFitWidgets/WidgetViews.swift +
  WidgetStore.swift; the Android layouts match), not the app's Account → Widgets previews (simpler): `.kw` in site.css
  at the widgets' points — `--k` is one point at the drawn size (small 158 × 158, medium 338 × 158, radius 22, padding 16;
  the phone's `--k` = its `--u`; the wall's from the viewport, capped at 1.15px), set on `.wshow` / `.hs` /
  `.wwall__grid` and inherited (never set on `.kw` itself). Palette = the Swift `kx(light, dark)` colours as `--kw-*`
  tokens on `.wshow`, dark under `.wshow:is([data-wtheme='dark'], html:not(.js) .wshow:has(#wtheme-dark:checked))`
  (`:is` is forgiving, so a browser without `:has` keeps the attribute branch). Art ported to static SVG by a scratch
  generator: WaterGlassArt (the water group moves by `--w`, its surface scales `0.7918 + 0.2082 × --w`), BottleArt,
  the Water level waves (the white copy of its text is clipped by an objectBoundingBox wave, `#kw-level-clip`),
  GradientRing (with its white end cap), Rings, TrackBars; SF Symbols → `kw-*` symbols in the sprite (filled drop,
  flame, walking figure, camera, barcode viewfinder…) + ring gradients `kw-g-*`. **The home screen** (`.phone--home`,
  status bar 15:30, a Search pill, no dock — no other apps' icons): Kinetix Fit today (M), Water glass (S) + Daily rings
  (S), Quick log (M, Plus), Streak (M). Maya at 15:30 = the hero's day: the app last opened at 12:48 ("Updated 12:48"),
  1.25 L, 6,842 of 12,000 steps (her steps quest), 1,023 of 2,085 kcal, quests 2/3, streak 12 (best 12), next reminder
  17:00 (the app's default 9–17 every 2 h). `TIMELINES.widgets` (features.ts, same player as the chapters): start (rings
  wait: `--rg: 0`) → rings (they sweep in; the Today bars grow) → tap + → glass (1.5 L) → tap 500 ml → goal (2 L,
  "Goal reached", "Logged 500 ml of water · 15:30", the water ring closes with a flash) → fade; still = goal. Words
  that change are whole units in `.apx-swap` (number + unit, drop + amount), so a shorter amount never leaves a gap.
  **The wall** (`ul[data-wwall]`, app order = `WIDGETS`): Check-in (done state: Maya checked in, energy 4/5), Quick log
  (S), My stats, Streak, Kinetix Fit today, Daily rings, Steps, Water bottle, Water level, Water ring, Water quick add,
  Water this week (her week 1.75 → 1.25 L, goal met 4/7; today's "1.2" is Swift's `%.1f`, half to even), Quick scan,
  Water glass — sizes chosen so the grid packs with no holes (6 medium + 8 small = 4 rows of 5 / 5 rows of 4); each
  item: the widget (`aria-hidden`), its name, a Free / Plus tag, the app's description (visually hidden). Phones (<
  720px): two rows that scroll sideways (column flow, full-bleed, `scroll-snap-type: x proximity`), names stacked over
  their tags; widgets.ts makes it a keyboard stop (`tabindex="0"`, labelled by the heading) only while it scrolls.
  **Rules learned:** (1) Safari runs the page's module script before a stylesheet linked after it has arrived (the build
  puts the CSS link last); what the script measured then stuck unstyled — the footer's text stayed black (the step-2
  axe flake; 5/5 with the CSS delayed ≥ 150 ms). `initSite` now waits for any `link[rel=stylesheet]` without a
  `.sheet` (load or error), and starts at once when none is pending (the usual case). (2) `content-visibility: auto` on
  the items of a sideways scroller made Safari's arrow-key scrolling bounce near the start; it's only on the home
  screen's `.phone__screen` (fixed size, not in a scroller). (3) An absolutely positioned child (the visually hidden
  description) escapes a scroll container unless something between them is positioned: `.wwall__item` is
  `position: relative`, else the page grew 1,549px wide on phones. (4) `.js .phone` hides every phone until the hero's
  entrance, so the home screen overrides it (`.js .phone.phone--home`). (5) A CSS import is empty in vitest even with
  `?raw`: widgets.test.ts reads site.css from disk (a dynamic `node:fs` import, since Node's types aren't in the site's
  TypeScript setup). (6) The glow round the phone reaches past a 280–320px screen: `.wshow` is `overflow-x: clip`.
- **Step 4 (30 Sep): the rest of the page** — "Your day" (`#day`, `ol[data-day]`) keeps only what no other section shows:
  07:10 check-in, 08:40 synced health, 15:30 "A nudge to move" (`.ui-note`: the app's movement break notification word for
  word — `IOS_LINES` = Android's `MoveReminderReceiver` LINES — with the `move` badge from scripts/app-icons/notify.mjs),
  20:00 gut check. Its lane: `.day::after` (solid clay) over the dashed `::before`, `transform: scaleY(var(--p))`; the
  reading line is 55% down the screen (`READING_LINE`); `.day` has `isolation: isolate` so both lanes sit under the
  items' dots (`z-index: -1`). Without JS it stays dashed; with reduced motion it's full. "Also in Kinetix Fit": Allergies
  and diet, Made for where you live, Levels and achievements. Motion (site.css → Motion): `.plan__icon-row img` pop in
  after their plan (`--i` × 70 ms), `.trust__col li` rise and their icons draw (`stroke-dasharray: 64`, inherited into
  `<use>`), the FAQ's `<details>` are `.reveal` (staggered), `.cta-panel__lanes` is a `.reveal` that draws its lanes
  (`lane-draw`) and runs `.cta-panel__runner` once (`lane-run`; hidden with reduced motion). How it works: "Four steps.
  Start where you are." (page.test.ts: no "gym" on any page). Removed with the old cards: `.ui-search`, `.ui-foods`,
  `.ui-macros`, `.ui-widget*`, `.ui-tumbler`, `.ui-card--dark`, `.ui-streak*` and friends (37 rules).
- **Checking the site:** `npm test` (src/site: page structure, links, copy vs the app's numbers, forwarder, nav, form,
  rewards story, motion, the feature chapters, the widgets), then **`scripts/site-check/`**: `npm run build:web`, `node
  scripts/site-check/serve.mjs` (dist-web/ routed like Vercel, compressed, /api answers 501) and `PW_DIR=<scratch with
  playwright + axe-core> node scripts/site-check/e2e.mjs [base] [outDir — must exist]` — 47 checks (pages open as a
  returning visitor — `kx_intro_seen` set — unless a check asks for `intro: true`; the 29 Sep additions: the intro plays
  once / skips on a key or tap / never with reduced motion or a #hash, the demo's story, the demo resting off screen, the
  feature chapters' stories in order with every tap landing on its button, their still steps with reduced motion; step 3:
  the widgets' home screen in the same story check, the Light / Dark switch by mouse and arrow key with all 14 turning
  dark, the phone wall scrolling sideways as a keyboard stop (keys at a person's pace — WebKit folds faster presses
  into one), axe on the section in its dark look)
  (routing + forwarder, nav, menu, CTAs, FAQ, the form with mocked answers, the rewards story, reduced motion, layout
  stability, 23 sizes from 280 to 2560 incl. landscape, 130% text, touch targets, axe WCAG 2.2 AA); `ENGINE=webkit` runs
  it in Safari's engine (47/47 in both on 30 Sep ~00:20 — step 4 added "Your day"'s lane filling and emptying with the
  scroll, the early access track drawing, and the rest of the motion finished under reduced motion; in WebKit, Tab only visits text fields, so links/radios/buttons
  are reached with Option+Tab, and Enter on a radio doesn't submit). **Known WebKit flake (from step 1):** right after a
  very large resize (2560 → 667×375) the interlude's nowrap "is still progress." line is at its old size for a frame or
  two (measured: stale at 0 ms, settled by 60 ms); since step 3 the overflow check re-measures once, 400 ms later, before
  it reports a size, so only overflow that stays fails it. serve.mjs brotli-compresses every
  response at max quality on each request (~160 ms for the HTML, ~125 ms for the CSS), so local first paints run ~0.3 s
  later than Vercel's cached ones. Lighthouse 29 Sep ~15:40: mobile 94/96/96 · 100 · 100 · 100, desktop 98 × 100 × 100 ×
  100 (100 with the intro skipped via a #hash: the intro holds the first screen, which costs Speed Index); ~21:10
  (step 3): mobile 92/95/95 (Speed Index 4.6–4.7 s vs 4.5–4.6: the page is 30 KB and the CSS 26 KB brotli now, ~10 KB
  more on the first load), desktop 98/98, the rest 100; ~00:20 (step 4): the same — mobile 92/95/95, desktop
  98/98 (page 30.0 KB + CSS 25.9 KB brotli, a little lighter than step 3). Lighthouse's
  *observed* first paint on mobile swings between ~1.3 s and ~2.35 s run to run, before and after step 2; score on the
  simulated metrics. The app's own screenshot rules (360/411 etc.) still apply to `/app/`.

### Future enhancements (on hold — agreed with the user, not started)
- **See the "Enhancement backlog" near the top of this file (E1–E10, agreed 2 Oct 2026)** — it supersedes and extends the notes here: women's health (E4), pregnancy (E5), weekly AI insights (E6),
  CoFID/IFCT food data (E7), typos (E8), CGM (E10). The health-conditions item below overlaps E5/E10: do them together and reuse these constraints (special-category data, NHS wording, "check with your GP").
- **Health conditions for food suggestions** (on hold 2026-09-26). Optional "Health conditions" row in
  Account → Profile that tunes meal ideas and food checks. Constraints agreed in discussion:
  - Health conditions are UK GDPR special-category data: explicit consent step, privacy-policy update, Play
    data-safety declaration; keep them on the device only (never send to `api/`).
  - Stay general wellness, not a medical device (MHRA): follow NHS guidance wording ("lower in salt",
    "gluten-free"), never "good for your thyroid"; always "check with your GP or dietitian".
  - Proposed mapping: coeliac → gluten-free filter; lactose intolerance → milk filter; type 2 diabetes /
    prediabetes / PCOS → lower sugar, higher fibre; high blood pressure → lower salt (<6 g/day); high
    cholesterol → lower saturated fat; gout → flag high-purine foods; pregnancy → flag foods to avoid;
    underactive thyroid → a levothyroxine timing note only (NHS has no "eat this" guidance); kidney disease →
    no filtering, "follow your renal dietitian".
  - Needs salt / sugar / saturated-fat values on every meal idea (they only have kcal, protein, fibre today).

## Structure

```
src/App.tsx                 # ~5,700 lines — onboarding (sign-in, then steps 3-6), dashboard (DASHBOARD_STEP = 7), almost all logic + JSX
src/main.tsx                # the app's entry; RevenueCat setup; applyTheme()/followSystemTheme(); imports index.css + src/styles/*.css
                            #   (the website's entry is src/site/main.ts)
index.html                  # pre-paint inline scripts: launch intro (data-intro) and theme (data-theme)
src/index.css               # design tokens (colour/type/motion/glass), light + [data-theme='dark'], keyframes, reduced-motion
src/styles/app.css          # dashboard: shell, cards, controls, hero, tab bar + lens, modals, Account menu
src/styles/responsive.css   # loaded LAST: every screen size — narrow, short, landscape phones, tablets (see Screen sizes)
src/styles/glass.css        # liquid-glass layer, loaded after the others: ambient glow, glass cards/nav/sheets, title chips, activity
                            #   tiles, Check a food, onboarding glass, alignment fixes
src/styles/onboarding.css   # onboarding screens (.ob-*)
src/styles/onboarding-profile.css  # .primary-btn / .secondary-btn / .auth-input (shared with dashboard)
src/styles/intro.css        # launch intro
src/styles/today.css        # Today: hydration card + page, check-in, workouts, movement-break prompt
src/styles/pickers.css      # ruler, segmented, choice cards, bottom sheet, settings rows
src/styles/about-you.css    # onboarding About-you flow
src/lib/feedback.ts         # haptics (selection/tap/tick/success) + synthesised sounds; Android ticks via NativeFeedback
src/lib/theme.ts            # System/Light/Dark: getThemePref/setThemePref/applyTheme/followSystemTheme (+ SystemTheme plugin)
src/lib/dates.ts            # localDayKey() / localDayKeyDaysAgo() — calendar days in local time (never toISOString)
src/lib/bmi.ts              # bmiOf(), suggestGoal() — the country's adult BMI bands → onboarding goal suggestion
src/lib/keyboard.ts         # native keyboard: .kx-keyboard-open on <html>, focused field scrolled into view
src/lib/healthSources.ts    # Health Connect writer package → name ("Samsung Health"); isSamsungDevice()
src/lib/regions.ts          # UK regions (after the country), a fact each, motivational lines
src/lib/countries.ts        # the 9 countries: locale, currency, units, BMI/fibre/allergen guidance, charities; fmtNumber/fmtDate/fmtMoney
src/lib/supabase.ts         # Supabase client; exports isSupabaseConfigured
src/lib/storage.ts          # readJson/writeJson — shared local read/write, writeJson enqueues into the sync outbox
src/lib/sync.ts             # generic sync engine: singleton (LWW) + keyed (idempotent) domains, outbox, backfill, logout wipe
src/lib/*Sync.ts            # profileSync, preferencesSync, gutSync, checkinsSync, periodsSync, waterSync, savedFoodsSync,
                            #   foodLogSync, workoutsSync, vitalsHistorySync — one per domain, registers with sync.ts
src/lib/server.ts           # serverUrl() — relative on web, absolute Vercel URL in native apps
src/lib/plus.ts             # KinetixFit Plus: entitlement id, free/Plus scan limits, benefit list (display only)
src/lib/quests.ts           # questsForToday() — data-driven quests (steps/sleep/HRV/food/workout), progress + claim rules
src/lib/notifications.ts    # local notifications: styled() badges/headers/actions, channels, hydration + gut + streak reminders
src/lib/widgets.ts          # updateWidgets() → WidgetBridge; takeWidgetGlasses/CheckIns/Workouts; WIDGETS catalogue; Plus widget prefs
src/lib/appIcons.ts         # alternate app icons (ids, free vs Plus, previews) → AppIcon plugin (Android aliases / iOS alternate icons)
src/lib/points.ts           # the points economy (~1,000 a perfect month): awards, XP/levels, the once-a-day ledger
src/lib/streak.ts           # check-in streak, best streak, badges (3/7/14/30/60/100 days)
src/lib/cycle.ts            # period tracking: logged starts (kx_periods), cycle stats, today's phase + next window, context
src/lib/mealIdeas.ts        # the free ranked meal ideas: 117 meals (USDA nutrition), per-country cuisines + avoided meats, rankMeals(),
                            #   pages of 3, "Not for me"
src/lib/auth.ts             # sign-up / log-in messages, already-registered + reset-link detection, confirmation/reset URLs
src/lib/healthConnect.ts    # no Health Connect on the phone: get it (Play Store) vs unsupported (Android < 9)
src/lib/water.ts            # drinks in ml per day ([time, ml]), glass size, ml goal, week totals (self-reported: never quests/points)
src/lib/checkins.ts         # morning check-in (sleep hours + energy), sleep-vs-energy insight
src/lib/workouts.ts         # detected workouts (Health) + hand-added ones (kx_workouts: add / edit / remove, 24 types, 1–600 min)
src/lib/moveReminders.ts    # movement breaks: Android MoveReminder plugin (detects), iOS scheduled reminders
src/lib/foodLog.ts          # food log: entries (amount × unit × eaten, note, add-ons, meal, amountGuess), saved foods (per 100 g,
                            #   units, density), 90-day history (kx_food_days), typed-amount parser (g / kg / ml / l), scan result →
                            #   food (foodFromScan, foodFromScanItem for a meal photo's foods), savedFoodPortion, densities
                            #   (KNOWN_DENSITIES = api/_lib/density.js, densityOf), EXTRAS + note parsing (extrasFromNoteExcept),
                            #   findTableFood, isPlausible + farFromTable (saved foods from wrong lookups), mealCount,
                            #   splitTypedMeal (a typed meal's foods)
src/lib/foodTable.ts        # generated by scripts/food-table/gen.py: 135 foods from USDA SR Legacy / FNDDS (per 100 g + portion weights,
                            #   drink / mlToG for liquids) — don't hand-edit
src/lib/nutrition.ts        # needed vs eaten: plan targets + per-country guidance (sat fat, sugars, sodium, K, Fe, Ca), status
src/lib/onboarding.ts       # who skips onboarding (kinetix_onboarded_email, markLoggedInAccount) + the step reached (kx_ob_step)
src/lib/backButton.ts       # Android back: a stack of claims (useBackHandler) for sheets, pop-ups and onboarding steps
src/lib/diet.ts             # everything / vegetarian / vegetarian, no eggs: meat/fish/egg word checks, notes, idea tags
src/lib/allergens.ts        # allergies: label allergens offered by diet, typed ones ("kiwi"), allergiesIn / flagAllergies word checks
src/lib/vitals.ts           # health numbers: latest reading (Android reads oldest first), heart-rate day, body and vitals tiles
src/lib/gut.ts              # gut check-ins (kx_gut_checks), when the weekly report is ready, buildGutReport, GUT_FOODS, gutPatterns
src/lib/*.test.ts           # Vitest unit tests (npm test); src/test/setup.ts = in-memory localStorage; vitest.config.ts
src/components/             # TabBar (iOS-style tab bar), BiometricTrendCard (Recharts trend card), Icons (SVG set),
                            # TrackLanes (hero art), LaunchIntro (opening sequence, next to <App/> in main.tsx),
                            # AboutYouFlow (onboarding step 5), Pickers (form controls), ProfileFields, DonateButton,
                            # HydrationHero (+ HydrationSheet: Today's water card and the Hydration page),
                            # FoodEntrySheet (+ ExtrasPicker: amount / eaten / add-ons / note for one food),
                            # MealResultCard (a meal photo's or typed meal's foods, each its own entry; foods to confirm first),
                            # FoodHistorySheet (14-day bars, averages, any day's foods), NutritionMeters (needed vs eaten),
                            # ScanProgress (animation + haptics while a food lookup runs), CycleCard (period tracking),
                            # WorkoutSheet (add / edit a workout), WidgetGallery (Account → Widgets previews + Plus settings),
                            # HealthConnectSheet (get Health Connect / why not), VitalsCard (Today → Body and vitals),
                            # AllergyPicker (label chips + typed allergies, onboarding and Account)
src/utils/justgiving.ts     # JustGiving donate link
api/                        # Vercel serverless functions (NOT bundled into the apps — reached via serverUrl())
  _lib/cors.js              #   handleCors() — native-app origins + preflight; call first in every handler
  scan-meal.js              #   text → nutrition; photo (+ optional note) → every food seen (one Claude call) → each food's
                            #   nutrition → items[] + the old one-food / whole-meal fields; quota, daily points (Redis, non-fatal)
  _lib/identify.js          #   the photo answer's contract, any model: MEAL_SCHEMA, prompt, validateMeal, rounding, note amounts
  _lib/identifyClaude.js    #   asks Claude with it (SCAN_MODEL, thinking off, effort low); cut off / declined → IdentifyError
  _lib/nutrition.js         #   lookupNutrition: food table → USDA generic → branded (no sweets); matchScore, agrees, fromTypical
  _lib/foodNormalize.js     #   "2 slices of watermelon" → "watermelon"; curd → yogurt, chai → tea with milk
  _lib/density.js           #   grams per ml: table → USDA volume portion → KNOWN_DENSITIES → 1 (assumed)
  _lib/mealTotals.js        #   a meal's totals (unrounded) and per 100 g by weight; ml → g by density
  _lib/foodTable.js         #   generated with src/lib/foodTable.ts (+ USDA descriptions) — don't hand-edit
  __tests__/                #   Vitest (npm test): scan-meal end to end (Redis etc. mocked, fixtures/usda/ = USDA search answers
                            #   built from the CSVs), identify, nutrition, density, mealTotals, foodTable. "_" → Vercel skips it
  lookup-barcode.js         #   Open Food Facts: per100g, g/ml serving, pack size, liquid, allergens; default portion
  plus-status.js            #   the signed-in account's Plus plan (+ expiry) from RevenueCat; src/lib/plusStatus.ts calls it
  delete-account.js         #   erases the signed-in person's data (mode account|data); helpers in _lib/accountData.js
  redeem-promo.js           #   promo codes, redemption tracked in Upstash Redis
  redeem-voucher.js, sync-health-data.js, complete-quest.js, donate-charity.js
  early-access.js           #   the website's early access list (Upstash Redis; honeypot, rate limit per hashed IP)
  suggest-meals.js          #   AI meal ideas (Plus): Anthropic SDK, claude-opus-5, structured JSON, 6/day
  _lib/plus.js              #   isPlusUser() via RevenueCat (+5-min Redis cache), ENTITLEMENT_ID, entitlementIsActive()
  _lib/scanQuota.js         #   free 2 / Plus 10 photo+barcode scans a day (phone's time zone)
  _lib/countries.js         #   country reward rules (live flags, charity ids), safeTimeZone(), dayKey()
  _lib/rewardConfig.js      #   reward economics, donation £ cap, one-voucher-a-month slot
  _lib/auditLog.js
  _lib/supabaseAuth.js      #   verifies the caller's real Supabase session token (server-authoritative quest claims)
  _lib/supabaseAdmin.js     #   service-role Supabase client (SUPABASE_SERVICE_ROLE_KEY) for writes that bypass RLS
supabase/migrations/0001_source_of_truth.sql  # the 13-table schema + RLS (see Roadmap → Backend database sync); applied
                            #   to production 2026-09-30 — future schema changes are new numbered migration files here
android/                    # Capacitor Android project (Gradle). android/app/src/main/assets/public is generated by `cap sync` — don't edit
android/app/src/main/java/com/jnglobalventures/kinetixfit/
                            # MainActivity (registers the local plugins), SystemThemePlugin (night mode → "System"
                            # theme), NativeFeedbackPlugin (performHapticFeedback ticks), WidgetBridgePlugin (app → widgets),
                            # WidgetStore (widget data + next reminder + widget-added drinks, updateSized/refreshAll),
                            # WidgetArt (bitmaps: amounts, bottle, water level, rings, bars, frosted card, water glass), SizedWidget (base),
                            # WaterWidgets (shared water data), HydrationWidget (Water bottle + add-drink receiver + haptic),
                            # WaterLevelWidget, WaterRingWidget, WaterQuickWidget, WaterWeekWidget, RingsWidget,
                            # StepsWidget, TodayWidget, ScanWidget, GlassWidget (Water glass), StreakWidget,
                            # CheckInWidget + QuickLogWidget + StatsWidget (Plus; PlusWidgets locked card, WidgetThemes),
                            # MoveReminderPlugin + MoveReminderReceiver (movement breaks), AppIconPlugin (launcher aliases)
android/app/src/debug/java/.../WidgetGalleryReceiver.java  # debug only: renders every widget to a PNG / plays the haptic
android/app/src/main/res/   # layout/widget_*.xml (+ _short / _wide), xml/widget_*_info.xml, values(-night)/widget_glass_colors.xml,
                            # values(-v31)/widget_dimens.xml, drawable/widget_* + btn_* + ic_widget_* + ic_stat_* (notification icons),
                            # font/kx_*.ttf (Archivo Expanded + Hanken Grotesk, drawn into widget bitmaps)
ios/                        # Capacitor iOS project; App/WidgetBridgePlugin.swift + AppIconPlugin.swift + MainViewController.swift,
                            # App/WidgetGallery.swift (debug widget gallery), KinetixFitWidgets/ (WidgetKit extension:
                            # KinetixFitWidgets.swift bundle + timeline, WidgetViews.swift looks + intents, WidgetStore.swift)
site/index.html, site/404.html  # the website's pages (marketing home at /, branded 404); site/favicon.svg; site/public/ =
                            #   robots.txt, sitemap.xml, og-image.png (website-only: copied into dist-web by `build:web`)
src/site/                   # the website's TypeScript + site.css (see Roadmap → Website): demo.ts (hero phone), features.ts
                            #   (the five feature chapters + the widgets' home screen), widgets.ts (Light / Dark switch),
                            #   day.ts ("Your day"'s lane, scroll-linked),
                            #   intro.ts, rewards.ts…; *.test.ts next to them (jsdom)
public/                     # privacy-policy, terms-of-service, donate pages, favicons (Play listing needs the privacy policy URL),
                            # notify/*.png (iOS notification badges), email-confirmed.html (sign-up link lands here)
assets/                     # icon.png, icon-only.png, splash.png — the logo (symbol + "Kinetix Fit" wordmark, spaced 28 Sep):
                            # source for the Classic icon (iOS AppIcon-1024 on white; Android launcher layers = Lanczos resizes)
capacitor.config.ts         # appId, appName, webDir: 'dist', backgroundColor (launch colour)
android/app/src/main/res/values/colors.xml, styles.xml  # launch splash (plain kx_launch_bg), DayNight app theme
requirements.txt            # full toolchain + dependency checklist
scripts/setup-android.sh    # installs requirements.txt and builds a debug APK
scripts/ios-sim/            # build/launch/screenshot the iOS simulator app, run JS in its WebView, real taps (idb)
scripts/app-icons/          # render.mjs (alternate app icons, all platforms) + notify.mjs (notification badges); Playwright via PW_DIR
scripts/site-check/         # the website's end-to-end checks: serve.mjs (dist-web/ like Vercel) + e2e.mjs (47 checks); PW_DIR
scripts/food-table/gen.py   # USDA CSVs → src/lib/foodTable.ts + api/_lib/foodTable.js (SPEC lists each food; DRINKS / POURED get
                            #   densities; CSVs in the gitignored scripts/food-table/usda/)
```

Capacitor plugins wired into Android (from `npx cap sync`): barcode-scanner 3.1.2, browser 8.0.4,
local-notifications 8.3.1, @capgo/capacitor-health 8.10.6, @revenuecat/purchases-capacitor 13.4.1,
@capacitor/haptics 8.0.2 (adds the VIBRATE permission), @capacitor/app 8.1.1 (Android back button + appStateChange),
@capacitor/keyboard 8.0.5 (iOS resize + keyboard events; see iOS section), @capacitor/camera 8.2.4 (food photos:
use the deprecated `getPhoto`, not `takePhoto` — only getPhoto survives Android killing the app behind the camera).
npm-only (no native part): `@anthropic-ai/sdk` (server: `api/suggest-meals.js`, `api/_lib/identifyClaude.js`), `html5-qrcode` (barcode from a photo).
Four **local** plugins live in the Android project itself (`SystemTheme`, `NativeFeedback`, `WidgetBridge`, `MoveReminder` — see Structure); they are
registered with `registerPlugin(...)` in `MainActivity.onCreate` *before* `super.onCreate`, and called from JS with
`registerPlugin('Name')` from `@capacitor/core`. A new local plugin needs both halves.
After adding/removing an npm plugin, re-run `npx cap sync android`.

Native-only code paths are guarded with `Capacitor.isNativePlatform()` / `Capacitor.getPlatform()`
in `App.tsx` — health data, notifications, RevenueCat and scanning all no-op in the browser, so
test those on a device or emulator, not with `npm run dev`.

## Environment variables

`.env` is gitignored; `.env.example` is the template with comments on where each key comes from.
The local `.env` on this Mac (created 2026-09-25) has `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (the
Supabase publishable key) and, since 2026-09-27, `VITE_REVENUECAT_ANDROID_PUBLIC_KEY`; the iOS RevenueCat key is still missing.
Keep app keys in `.env`, not `.env.local` — `vercel link` / `vercel env pull` (re)write `.env.local`. Without Supabase keys a build loads but
sign-up shows "not configured".

- **Bundled into the app (`VITE_` prefix, public by design):** `VITE_REVENUECAT_ANDROID_PUBLIC_KEY`,
  `VITE_REVENUECAT_IOS_PUBLIC_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key only, never service-role), `VITE_SERVER_URL` (optional).
  These are baked in at `npm run build` time — rebuild + `cap sync` after changing them.
- **Server-only (set in Vercel, never `VITE_`-prefixed):** `ANTHROPIC_API_KEY` (photo scans + AI meal ideas), `USDA_FDC_API_KEY`,
  `REVENUECAT_API_KEY`, `PROMO_CODES_JSON`, `UPSTASH_REDIS_REST_URL/TOKEN` (injected by Vercel Marketplace). Optional
  `SCAN_MODEL` = the photo scan's model (default `claude-sonnet-5`; `claude-haiku-4-5` also works — it gets no `effort`).
  `TREMENDOUS_API_KEY` (`api/redeem-voucher.js`) is set in Vercel too. Production Redis fixed 2026-09-27 — see Current status.
- **Vercel CLI:** this folder is linked (`.vercel/`, gitignored) to team `kinetixfit`, project `kinetix-fit-core`;
  log in as `johnkodamala` (the `sivadurga726-3709` account can't see it). `npx vercel env ls --scope kinetixfit`
  lists names. `VITE_REVENUECAT_ANDROID_PUBLIC_KEY` exists in Vercel — copy it into local `.env` for app builds.
  Auto mode blocks Claude from production deploys and from pulling secret values — the user runs those.

## Frontend conventions

- Tabs: `vitals` (shown as "Today"), `nourish`, `rewards`, `account`; order lives in `TAB_IDS`; the tab bar is
  `src/components/TabBar.tsx`. The active tab is mirrored in the URL hash (`#nourish`, `#account/details`);
  `LEGACY_TABS` maps old hashes. Signing in / finishing onboarding / logging out always go to Today (`openTodayFresh()`).
- Messages: `notify(tone, text)` — see Design system. Keep them short, plain, no ALL CAPS.
- Onboarding steps 0-4 render only when logged out (0-2 all show the sign-in screen — there are no welcome screens);
  steps 5-6 render whenever `onboardingStep` is 5/6 (6 = "Your food": diet + allergies). Android back: see Onboarding and
  navigation — any new sheet or pop-up must claim the back button (`Sheet` does it; otherwise `useBackHandler`). In `npm run dev` only, `?ob=N` opens step N (e.g.
  http://localhost:5173/?ob=5); production builds ignore it.
- The test phones' web views are **360** (S21 FE) and **411** (A55) CSS px wide — test layouts at those widths.
- Playwright is **not** a project dependency: install it in a scratch folder (`npm i playwright` there; the Chromium
  build is already in `~/Library/Caches/ms-playwright`) and run scripts from that folder against `npm run dev`.
- Driving the app on the phone: with the debug build running, `adb forward tcp:9333
  localabstract:webview_devtools_remote_<pid>` then Playwright `chromium.connectOverCDP('http://localhost:9333')`.
  CDP screenshots of the phone sometimes show squashed/condensed text — a capture artefact; confirm with
  `adb exec-out screencap -p` before treating it as a bug. The S21 FE has a secure lock screen: check
  `dumpsys window | grep isKeyguardShowing` first — while it's locked (or another app is on top) Health Connect
  refuses reads and the WebView won't answer CDP. Don't send taps/swipes while the user is using the phone.
- Logged-in state for local testing: set `localStorage.kinetix_logged_in = 'true'` (+ `kinetix_profile` JSON),
  optionally `kx_theme` ('light'/'dark'), and reload (add `?ob=7` in dev). This only fakes the UI state — it
  isn't a Supabase login. For screenshots, also set `sessionStorage.kx_intro_seen = '1'` to skip the launch intro,
  and block `/api/*` so nothing writes to production (Playwright: the route registered *last* wins, so register a
  specific mock after the catch-all block).
- The app scrolls inside `.app-scroll-body`, not the window, so Playwright `fullPage` screenshots stop at
  the first screen — scroll that element and take several shots instead.
- **Dates:** a calendar day is `localDayKey(date)` from `src/lib/dates.ts` — never `toISOString().slice(0, 10)`
  (that's the UTC day, wrong for part of every day outside UTC). "Yesterday" is `localDayKeyDaysAgo(1)`, not
  `now - 86400000` (DST).
- `Autonomic Recovery` is a stored `profile.target` value; show it to users as "Recovery", don't rename the value.

## Rules

- Never commit secrets, `.env`, keystores, or `google-services.json` with real credentials.
- Server secrets stay in `api/`; anything under `src/` ships inside the APK and is readable by anyone.
- Don't hand-edit generated Capacitor files (`android/app/src/main/assets/public`, `capacitor.build.gradle`,
  `capacitor.settings.gradle`) — they're overwritten by `cap sync`.
- Health data is sensitive: Play requires a Health Connect declaration and a privacy policy that covers it.
- Commit style: `<type>: <description>` (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Work on
  `initial-changes`, run `npm run lint`, `npm test` and `npm run build` before pushing, PR into `main`.
- New logic goes in `src/lib` with a `*.test.ts` next to it (pure functions, localStorage only) — keep App.tsx for wiring.

## Design system ("track day")

Redesigned 2026-09-25. A light and a dark theme, shared by the web, Android and iOS builds. The user picks
System / Light / Dark in Account → Appearance → Theme (`src/lib/theme.ts`, saved as `localStorage.kx_theme`;
absent = System). The choice resolves to `<html data-theme="light|dark">` — set before first paint by the
inline script in `index.html`, kept live by `applyTheme()` / `followSystemTheme()` in `main.tsx` — and the dark
tokens in `index.css` live under `:root[data-theme='dark']` only. **Never add `@media (prefers-color-scheme)`
rules** — they would ignore the user's choice; key dark overrides off `[data-theme='dark']`. `applyTheme()`
also sets the Android bar icons (`SystemBars.setStyle`); the launch intro calls it when it finishes.
On Android, "System" asks `SystemThemePlugin` (native night mode + a `change` event) because the WebView's
media query is unreliable there; its last answer is cached as `localStorage.kx_system_dark` for the pre-paint script.

**Liquid glass** (`src/styles/glass.css`, loaded last in `main.tsx`; tokens `--glass-*`, `--ambient-*`, `--hero-glow`,
`--btn-sheen` in `index.css` for both themes): a fixed ambient glow behind the app (`.workspace-container::before`),
translucent cards with a sheen + inner top highlight + hairline, a tinted-glass hero, glossy accent buttons.
`backdrop-filter` only on the tab bar, sheets and pop-ups — **not on cards** (the ambient is already soft; blurring
every card makes scrolling janky on mid-range phones). Solid fallback under `prefers-reduced-transparency`.
**A new card class must be added to the card list in glass.css** (and its reduced-transparency list), or it stays
an opaque white box. `--surface-2` is translucent now (fills that sit on glass).

- **Tokens live in `src/index.css`** — colours (`--bg`, `--surface`, `--ink`…`--ink-4`, `--accent`,
  semantic `--good/--warn/--danger/--info`), one fixed colour per health metric (`--m-steps`, `--m-heart`,
  `--m-sleep`, `--m-stress`, plus `--m-cycle`), fixed launch colours (`--launch-bg/-ink/-lane`), radii, shadows, motion (`--ease-out`, `--ease-spring`, `--dur*`).
  **Never hard-code a hex colour** in `App.tsx` or components — use `var(--token)`; dark mode depends on it.
- **Stylesheets:** `src/styles/app.css` (dashboard), `onboarding.css`, `onboarding-profile.css`
  (`.primary-btn`, `.secondary-btn`, `.auth-input`), `intro.css`, `today.css` (Today's newer cards), `pickers.css`, `about-you.css`, `glass.css`
  (restyles surfaces defined in the others), and `responsive.css` **last** (size adaptations). Imported once in `src/main.tsx`. No `!important`:
  inline styles intentionally win, so only use inline styles for genuinely per-element/dynamic values.
- **Type:** Archivo (wide cut, `font-stretch: 125%`, 800) for display — greetings, big numbers, titles only;
  Hanken Grotesk for everything else. Both are bundled via `@fontsource-variable/*` (work offline in the APK).
- **Signature:** the dark "track" hero panel (`.vitals-hero-card` / `.ob-hero-panel` + `<TrackLanes />`) — tinted
  glass with a warm `--hero-glow` — with lane lines that draw in, and streak/workout counts as `.kx-lap` lap
  counters. Used on Today (greeting + today's targets + the one Connect button), Rewards (level progress) and
  the welcome screen.
- **Motion:** tab content rises in with a stagger; the tab-bar lens (`TabBar.tsx`, `--lens-pos`) slides with a
  droplet stretch (Web Animations on `.nav-lens-drop`) and follows a finger sliding along the bar (lifted, ticks per
  tab, selects on release — `touch-action: none` on the bar); modals slide up as sheets on phones; progress bars
  fill like lanes. All disabled under reduced motion.
- **Launch intro:** five lanes draw in, the infinity mark runs one lap, the wordmark widens (Archivo's width
  axis 62%→125%), then the lanes sprint off right to reveal the app.
  `src/components/LaunchIntro.tsx` + `src/styles/intro.css`, ~2.2s, once per session
  (`sessionStorage.kx_intro_seen`), tap/key to skip. `index.html` sets `<html data-intro="run">` before first
  paint (launch colour, app animations paused underneath). `--launch-bg` must stay in sync with
  `android/app/src/main/res/values/colors.xml` (`kx_launch_bg`) and `capacitor.config.ts` `backgroundColor`;
  the Android splash shows only that colour (no icon) so it hands straight to the intro.
- **Empty states and honesty:** never ship sample data or a status the app hasn't read (the old fake voucher
  row and hard-coded trial status were removed). With no device connected, metrics say "Not connected".
- **Form controls:** never a `<select>` or `type="number"` input. Use `src/components/Pickers.tsx`:
  `MeasureField` (big typeable number + ruler; keeps its own text so fields can be emptied and decimals
  typed), `Segmented` (2–4 short options), `ChoiceCards` (option cards, 1/2/4 columns), `Sheet` + `SheetRow`
  (settings row → bottom sheet). The "About you" fields live once in `ProfileFields.tsx` (onboarding form and
  Account → Your details); update profiles with `patchProfile(changes)` (functional, safe for rapid updates).
  Text inputs set `inputMode`, `autoComplete`, `autoCapitalize`, `enterKeyHint` for phone keyboards.
- **Messages:** use `notify(tone, text)` (`success`/`error`/`warn`/`info`) — never `alert()`, never emoji
  prefixes, never your own `setTimeout` to clear it (the pill clears itself after 2.5–6s; a tap dismisses it).
- **Edge to edge:** `index.html` has `viewport-fit=cover`, so on Android (WebView ≥140) the app draws behind
  the status and navigation bars; every screen pads with `env(safe-area-inset-*)`, and a frosted strip
  (`body::after`) keeps the status icons readable. The page itself never scrolls (`html, body, #root` are
  `overflow: hidden`) — screens scroll inside `.ob-container` / `.app-scroll-body`. Older WebViews fall back
  to padded bars coloured `kx_app_bg` (`res/values*/colors.xml`, light + night). The launch intro switches
  the bar icons to light (`SystemBars.setStyle`) while it plays.
- **Onboarding "About you" (step 5)** is `src/components/AboutYouFlow.tsx` + `src/styles/about-you.css`:
  You (name + region) → moment (region fact from `src/lib/regions.ts` + a motivational line) → Body
  (rulers) → moment (resting kcal count-up, 10,000-step distance ≈ height × 0.415, heartbeats ≈ age × 70 bpm)
  → Goal (BMI-suggested goal preselected, `suggestGoal()` in `src/lib/bmi.ts`) → Plan ("building your plan" beat,
  then targets + week 1/4/12 copy per goal from `planFor()`). Targets: `nhsTargets` in App.tsx (Mifflin–St Jeor ×
  activity, −600 kcal for weight loss floored at 1,200/1,500, protein per kg with the BMI-30 cap, fibre 30 g).
  Facts must be true and checkable; motivational lines are unattributed on purpose. Plan copy may only
  promise things the app actually does.
- **Haptics + sounds:** `src/lib/feedback.ts` — `selection()` for tab/page/option changes (the subtlest tick; no
  sound, nothing on the web), `tick(major)` for ruler steps (rate-limited), `tap()` for choices, `success()` for the
  plan reveal (chime). On **Android** the light ones go through `NativeFeedbackPlugin` (`performHapticFeedback`
  SEGMENT_TICK / CLOCK_TICK, follows the phone's touch-feedback setting) — **don't use `@capacitor/haptics`
  `selectionChanged`/`impact` for light touches on Android**, they're 50–100 ms buzzes. iOS uses Haptics
  (UISelectionFeedbackGenerator). Re-tapping the current tab gives no tick. Sounds are synthesised with Web Audio
  (no files) and can be muted (`localStorage.kx_sounds`, toggle on the Body screen).
- **Onboarding on phones (<600px)** fills the screen (no floating card): titles at the top, actions pushed
  to the bottom (`.ob-btn-primary`, `.ob-btn-row` or `.ob-actions` as direct children of `.ob-card`). The
  centred card remains for wider screens.
- Account tab: a menu built from `accountSections` in `App.tsx`; each row opens a page from `AccountPage` /
  `ACCOUNT_PAGE_TITLES` at `#account/<page>` (`openAccountPage`/`closeAccountPage`; `pushState` so Back returns
  to the menu). New settings get a row + page there, never a loose card; Log out stays the last row. Row
  styles: `.kx-rows-menu` (app.css), `.kx-row-static`, `.kx-row-danger` (pickers.css).
- `.ob-sticky-cta` must keep `bottom: 0` (the container padding already clears the nav bar) and a fade shorter
  than its `margin-top`, or it covers the last content on the screen.
- Rulers must keep `touch-action: pan-x pan-y` — `pan-x` alone blocks vertical page scrolling on phones.
- **iOS simulator taps:** if `ui.py list` shows only the Application row and taps do nothing, the idb companion isn't
  running (see the iOS line in Current status). `tap-el.sh` coordinates can be off by the scroll it just did — when a tap
  misses, read the point off a screenshot (px ÷ 3 = pt on the iPhone 17) and use `tapxy`.
- The scan-food button (FAB) shows only on **Today** (Nourish has its own barcode/photo tiles); Today ends with a
  `.kx-fab-clearance` spacer so the last card can scroll clear of it.
- **Card patterns** (glass.css): every card title starts with a tinted icon chip —
  `<h3 className="card-header-title"><span className="kx-title-icon" style={{'--tint': 'var(--m-heart)'}}>…</span>Title</h3>`;
  `.kx-card-head` (title + count pill), `.kx-card-sub` (one-line subtitle); option tiles `.kx-activity` /
  `.is-on` (accent glass lens — also used by chips and choice cards when selected); `.kx-progress` (bar with
  `--fill` 0–1); `.kx-empty` (icon + sentence empty state); `.kx-search` (glass search field, button inside);
  settings switches are the styled `.demo-toggle-checkbox` (iOS switch, right of the row).
- **Alignment:** everything in a card shares the card's content edge — no extra left insets on titles, rows or
  labels; grid columns are `minmax(0, 1fr)` (a plain `1fr` can't shrink below its widest content); card headers
  with a button/pill wrap on narrow screens.
- **Icons:** `src/components/Icons.tsx` (stroke SVGs, `currentColor`, Lucide shapes where noted) — no emoji anywhere
  in the UI or notification text. Includes metric icons, Flame, Dumbbell, Medal, Trophy, Lock, Recovery, Bike, Waves,
  Bowl, Target, Gift, Search, Barcode.
- **Copy:** plain, sentence case, UK spelling (fibre). Describe what the user controls, not the system
  ("Connect a device", not "Configure smart sensor links").
- **Screen sizes** (`src/styles/responsive.css`): the other stylesheets are written for a 360–430px portrait
  phone; every size adaptation lives in responsive.css, in five sections (every width · narrow <360 · short
  portrait ≤700px tall · two columns ≥700px or landscape ≥640px · landscape phones ≤540px tall). The app isn't
  orientation-locked, so landscape phones are real. Rules: side padding is `max(gutter, env(safe-area-inset-left/right))`
  (landscape notch); grids use `minmax(0, 1fr)`; hero type uses `cqi` with a `vw` line before it; every `dvh`
  has a `vh` line before it (older WebViews); Nourish's grid is `.kx-nourish-grid` (Check a food on the right).
- **Checking UI changes:** screenshot at **360 and 411** wide in light and dark (Playwright headless), plus
  320×568, 844×390 (landscape), 768×1024 (tablet) and 1280. For layout work check the full matrix: 280×653 (Fold
  cover), 320×568, 344×882, 360×640/732, 375×667/812, 390×844, 393×852, 411×842, 412×915, 430×932, 440×956,
  667×375, 844×390, 932×430, 600×960, 768×1024, 820×1180, 1024×768 — load each screen once and
  `setViewportSize` through the list (reloading per size is ~10× slower). Also run the audit with every font size
  ×1.3 (Android font scale). Navigate to `about:blank` between screens: `goto` to a URL that differs only by hash
  doesn't reload, so an open modal carries into the next screen. For layout changes also run a DOM audit:
  horizontal overflow of `.app-scroll-body`, card left/right edges per page, children sticking out of their
  parent, clipped text — it caught the 5px Rewards overflow that screenshots missed. Then check on the S21 FE.
