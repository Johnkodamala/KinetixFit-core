# KinetixFit Core

One React 19 + TypeScript + Vite codebase ships three products: the **website** (Vercel, live at
https://www.kinetixfit.co.uk, which also hosts the `api/` serverless functions), and the **Android**
and **iOS** apps (Capacitor 8 wraps the same `dist/` build in a WebView; native features — health
data, barcode scanner, notifications, RevenueCat billing — come from Capacitor plugins).

**Priority order: Android → iOS → website.** Android came first; iOS is the current focus (2026-09-26) and
builds + runs on the simulator. All three share `src/` and `api/`, so every change must keep all three working — never
fix one platform by breaking another. Work that unblocks several platforms (shared API, auth) is
done once, in shared code.

- App ID: `com.jnglobalventures.kinetixfit` · App name: `KinetixFit`
- Location: `/Users/sivadurga/Claude Space/KinetixFit-core` (moved here from `~/KinetixFit-core` on 2026-09-25)
- Git: `origin` = github.com/Johnkodamala/KinetixFit-core, working branch `initial-changes` → PR into `main`

## Current status (2026-09-26, end of session) — read this first in a new conversation

**Production** is still PR #1 (`initial-changes` → `main`, merge `d066406`): Android toolchain, server URL + CORS,
Health Connect permission trim, "track day" redesign. Restore point: tag `pre-redesign` = `a900b56` (roll back by
reverting the merge, or Vercel → Deployments → Instant Rollback).

**Blockers (user action needed)**
1. ~~Production Redis is broken~~ **Fixed 2026-09-27.** Cause: the hand-added `UPSTASH_REDIS_REST_URL/TOKEN`
   (Sep 12) were stale (WRONGPASS); the Upstash integration (`upstash-kv-camel-door`, db `aware-sculpin-175753`)
   injects its own creds under `UPSTASH_REDIS_REST_KV_REST_API_URL/TOKEN`, which `Redis.fromEnv()` never reads.
   The user copied the integration's URL + token into the two **Production** vars and redeployed; the re-test
   `curl -X POST https://www.kinetixfit.co.uk/api/sync-health-data -H 'Content-Type: application/json' -d '{"appUserId":"test@example.invalid","steps":1}'`
   now returns `{"success":true}`. Preview/Development Redis vars still hold the old creds (deliberately — don't
   point previews at the production database). The integration token is "sensitive" in Vercel (can't be viewed);
   get it from Upstash console → database → REST API. Optional hardening: read the `KV_REST_API_*` names in code.
2. **`api/scan-meal.js` fix is local only** (points award made non-fatal, so food checks work even if Redis is down).
   It reaches the apps only when `main` is deployed — ask before pushing.
3. **Samsung Health hasn't written anything to Health Connect yet** on the S21 FE (`dumpsys healthconnect` →
   Samsung Health "Contributed Data: false"), even though it has all write permissions. Samsung Health only shares
   data created *after* it's allowed (no backfill) and syncs when its home screen opens / is pulled down. Needs the
   user to walk a bit, pull down in Samsung Health, then open KinetixFit.

**Uncommitted work** on `initial-changes` — ~53 files (Android + iOS). Lint 0, `tsc -b`, `npm run build`,
`cap sync`, `assembleDebug` and the iOS simulator build all pass. **Ask the user before committing/pushing** (a
push to `main` deploys). What's in it, oldest first:
- *Navigation:* tabs Today · Nourish · Rewards · Account (`TAB_IDS`); Account = settings menu whose rows open pages
  at `#account/<page>`; iOS-style tab bar (`TabBar.tsx`: glass lens, droplet stretch, slide to switch); sign in /
  finish onboarding / log out always open Today (`openTodayFresh()`); `@capacitor/app` for the Android back button.
- *Look:* liquid glass (`glass.css`), light/dark/System theme, title chips, activity tiles, Check a food redesign,
  iOS switch on Reminders, glass onboarding, launch intro, edge to edge, alignment pass.
- *Android native:* local plugins `SystemThemePlugin` (WebView media query says light in night mode) and
  `NativeFeedbackPlugin` (system haptic ticks), registered in `MainActivity`.
- *Health bugs fixed:* effects ran only once after restart; HC sleep aggregation / `Promise.all` blanking cards;
  background reads (HC refuses) now pause and re-run on resume; "connected but empty" setup card; source names from
  `sample.sourceId`; server sync posts only real, changed readings; plus assorted form/ruler/CTA/copy fixes.
- *Responsive pass:* `src/styles/responsive.css` (loaded last) — see "Screen sizes" under Frontend conventions.
  Audited on 20 viewports (280–1024 px, portrait + landscape) at 100% and 130% font size.
- *Five fixes:* (1) Log out asks first (confirm pop-up). (2) Onboarding numbers audited — weight-loss deficit −600
  kcal (NHS), floor 1,200 women / 1,500 men, protein from the BMI-25 weight when BMI ≥ 30, "NHS guidelines" →
  "your targets", quest no longer claims "150g". (3) Goal suggested from BMI (`src/lib/bmi.ts`). (4) Steps chart
  missing today — UTC day keys replaced by `localDayKey()` (`src/lib/dates.ts`). (5) Stress + HRV Recovery cards
  hidden for Samsung Health users, with a one-time explanation (no bypass exists — see Roadmap).
- *iOS work:* see "iOS" under Roadmap — entitlement wired in, iOS 16.4, launch screen + icon, Keyboard plugin,
  Apple Health setup card, Google button hidden in the apps, notification prompt fix, and fixes found on the
  simulator (plain-word status pills, heart rate no longer needs HRV, single-point chart dot, keyboard reveal).

**On the phones** (secure lock screen on the S21 FE — Claude can't unlock it, and Health Connect only answers apps
on screen, so on-device checks need the user holding it; don't send taps while they use it):
- **S21 FE** (`RZCT815G2ND`): latest build, **22:29** — everything above. Installs and starts; not looked at since.
- **A55** (`RZCY41ZL3HE`): the 17:09 build — the five fixes, but not the iOS-found fixes or the Keyboard plugin.
- Seen working on a phone so far: Samsung setup card, Health Connect reads (empty), SystemTheme plugin, sticky CTA.
  Not yet seen/felt on a device: tab bar slide, haptics, glass look, Check a food, responsive/landscape layouts,
  largest font size, About-you flow + goal suggestion, logout confirm, Samsung stress notice (needs Samsung data).
- If a phone doesn't show in `adb devices` and macOS lists no Samsung device on USB, it's the cable/port or the
  phone's USB mode (set to Transferring files), not the adb prompt.

**iOS:** builds and was **tested end to end on the iPhone 17 simulator** — Apple Health permission → Allow → steps
+ heart rate from the Health app on Today (today's bar), keyboard on three screens, dark mode, launch intro. Driven
with `scripts/ios-sim/`. Not yet: a real iPhone (paid Apple Developer team needed for HealthKit), sleep data, camera
/ barcode, subscriptions (`VITE_REVENUECAT_IOS_PUBLIC_KEY` missing).

**Next up (user to choose):** (1) user fixes Redis in Vercel, Claude re-tests the endpoint; (2) check on the phones
with them unlocked — Samsung Health data arriving, tab bar + haptics, landscape + largest font, scroll smoothness
(frame rate over CDP); (3) commit + push to `initial-changes`, open a PR (deploys the `scan-meal` fix when merged);
(4) iOS on a real iPhone once there's a paid developer team; (5) product gaps from the competitor review: a saved
food diary (intake is in memory only and resets on restart), a daily Readiness score, manual entry for sleep /
weight / water; (6) the website needs its own design — the phone layout doesn't suit it (decide marketing site vs
web app first).

- Only commit, push or merge when the user asks. Claude can open PRs, but `gh pr merge` is blocked in auto mode;
  the user merges PRs themselves on GitHub.
- The user prefers plain-text questions over the AskUserQuestion widget, and likes changes checked on the real
  phones (see "Driving the app on the phone" under Frontend conventions) — and now the iOS simulator.

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
npm run dev                      # web dev server, http://localhost:5173 (fastest UI iteration)
npm run build                    # tsc -b && vite build → dist/
npm run lint

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

### Android (current focus)
- [x] Toolchain installed, debug APK builds (2026-09-25)
- [x] API calls + privacy/terms links point at the live server from the app; CORS added in `api/`
- [x] Health Connect: plugin supplies the permissions-rationale activity and `health_connect_privacy_policy_url`
      is set in `res/values/strings.xml`. The plugin declares 47 read/write health permissions; the app
      manifest strips all but the 5 it reads (`tools:node="remove"`) — Play rejects unused health permissions.
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
      users with a one-time explanation. The Recover-better quest "Keep your stress load low today" still can't be
      verified for them — consider swapping it for a sleep/heart-rate quest when the source has no HRV.
- [x] Trend day keys were UTC while Health Connect buckets start at local midnight (today's bar empty outside
      UTC) — fixed 2026-09-26 with `localDayKey()`. The `api/` functions still key days in UTC (server-side daily
      limits for quests, donations, food points) — harmless for now, but they reset at 1am in the UK in summer.
- [ ] Food intake (`dailyConsumables`) lives in memory only — it resets when the app restarts, and a checked food is
      added automatically with no portion, undo or history. A saved food diary is the top product gap.
- [x] `VITE_REVENUECAT_ANDROID_PUBLIC_KEY` in `.env` (2026-09-27). Real purchases still need Play Console products +
      RevenueCat entitlement/offering, and a Play-installed build (internal testing) — a sideloaded APK can't buy
- [~] Grey status/nav bar strips: fixed in code (edge to edge + `kx_app_bg` fallback) — confirm on both phones
- [ ] Measure scroll smoothness on the S21 FE (glass layer + tab bar): scripted scroll over CDP, read frame timing
- [ ] Two console errors on start, apparently from Capacitor's own injected startup code, not ours: "Error
      injecting safe area CSS … reading 'style'" and "reading 'triggerEvent'". App runs normally; investigate
- [ ] Emulator (optional): needs a system image download (see toolchain)
- [ ] Release signing: upload keystore + `signingConfigs`. Keystores (`*.jks`, `*.keystore`) are gitignored
      on purpose — losing the upload key means no more updates under this app ID. Play needs an AAB: `./gradlew bundleRelease`
- [ ] Bump `versionCode` / `versionName` in `android/app/build.gradle` (currently 1 / "1.0") for every Play upload
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
- [ ] Real iPhone: HealthKit needs a **paid Apple Developer Program** team (free personal teams can't use the
      HealthKit capability). Set the team in Signing & Capabilities.
- [ ] `VITE_REVENUECAT_IOS_PUBLIC_KEY` in `.env` (subscriptions run in demo mode until then)
- [ ] App Store review risks to settle before submitting: promo codes that unlock Premium outside in-app purchase
      (guideline 3.1.1), charity donations via an external link (3.2.2 — fine if the charity page opens in Safari),
      privacy "nutrition labels" in App Store Connect (health data, email, purchases).
- HealthKit HRV is SDNN (Apple Watch), Health Connect's is RMSSD — the Stress/Recovery thresholds treat them alike.
- [ ] (keep) `ios/App/CapApp-SPM/Package.swift` must use `/` paths — it was once committed with Windows `\`
      paths (breaks Xcode). Running `cap sync` on Windows reintroduces them; check the diff before committing.

### Website
- Live at www.kinetixfit.co.uk (apex redirects to www; also kinetix-fit-core.vercel.app). Deploys through
  Vercel's **GitHub integration** (team `kinetixfit`, project `kinetix-fit-core`; no Vercel CLI or `.vercel`
  link on this Mac): a push to any branch builds a **Preview**, a merge to `main` deploys **Production**.
  Preview URLs sit behind Vercel Authentication (401 without a team login), so the phone app can't point
  `VITE_SERVER_URL` at a preview without a protection bypass.
- Previews probably share production's Upstash Redis and API keys (not verified — needs Vercel dashboard
  access). Don't redeem promo codes, vouchers or donations on a preview.
- Same `src/`, so Android work generally ships to the web too — check `npm run dev` still works after native changes.
- `vercel.json` rewrites `/privacy-policy`, `/terms-of-service`, `/donate/complete` to the HTML files in `public/`.
- [ ] **The website needs its own design** (user, 2026-09-26): everything so far is designed for phones, and on a
      desktop it's the phone layout in two columns. Decide first: marketing site that sends people to the stores,
      a real desktop web app, or both (marketing home + app behind login). Keep shared `src/` logic; split layout.

### Future enhancements (on hold — agreed with the user, not started)
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
src/App.tsx                 # ~3,300 lines — onboarding (steps 0-6), dashboard (DASHBOARD_STEP = 7), almost all logic + JSX
src/main.tsx                # entry; RevenueCat setup; applyTheme()/followSystemTheme(); imports index.css + src/styles/*.css
index.html                  # pre-paint inline scripts: launch intro (data-intro) and theme (data-theme)
src/index.css               # design tokens (colour/type/motion/glass), light + [data-theme='dark'], keyframes, reduced-motion
src/styles/app.css          # dashboard: shell, cards, controls, hero, tab bar + lens, modals, Account menu
src/styles/responsive.css   # loaded LAST: every screen size — narrow, short, landscape phones, tablets (see Screen sizes)
src/styles/glass.css        # liquid-glass layer, loaded after the others: ambient glow, glass cards/nav/sheets, title chips, activity
                            #   tiles, Check a food, onboarding glass, alignment fixes
src/styles/onboarding.css   # onboarding screens (.ob-*)
src/styles/onboarding-profile.css  # .primary-btn / .secondary-btn / .auth-input (shared with dashboard)
src/styles/intro.css        # launch intro
src/styles/pickers.css      # ruler, segmented, choice cards, bottom sheet, settings rows
src/styles/about-you.css    # onboarding About-you flow
src/lib/feedback.ts         # haptics (selection/tap/tick/success) + synthesised sounds; Android ticks via NativeFeedback
src/lib/theme.ts            # System/Light/Dark: getThemePref/setThemePref/applyTheme/followSystemTheme (+ SystemTheme plugin)
src/lib/dates.ts            # localDayKey() / localDayKeyDaysAgo() — calendar days in local time (never toISOString)
src/lib/bmi.ts              # bmiOf(), suggestGoal() — NHS adult BMI bands → onboarding goal suggestion
src/lib/keyboard.ts         # native keyboard: .kx-keyboard-open on <html>, focused field scrolled into view
src/lib/healthSources.ts    # Health Connect writer package → name ("Samsung Health"); isSamsungDevice()
src/lib/regions.ts          # onboarding regions, a fact each, motivational lines
src/lib/supabase.ts         # Supabase client; exports isSupabaseConfigured
src/lib/server.ts           # serverUrl() — relative on web, absolute Vercel URL in native apps
src/components/             # TabBar (iOS-style tab bar), BiometricTrendCard (Recharts trend card), Icons (SVG set),
                            # TrackLanes (hero art), LaunchIntro (opening sequence, next to <App/> in main.tsx),
                            # AboutYouFlow (onboarding step 5), Pickers (form controls), ProfileFields, DonateButton
src/utils/justgiving.ts     # JustGiving donate link
api/                        # Vercel serverless functions (NOT bundled into the apps — reached via serverUrl())
  _lib/cors.js              #   handleCors() — native-app origins + preflight; call first in every handler
  scan-meal.js              #   photo/text → food ID (Anthropic API) → USDA FDC nutrition; daily points (Redis, non-fatal)
  verify-license.js         #   RevenueCat subscription check
  redeem-promo.js           #   promo codes, redemption tracked in Upstash Redis
  redeem-voucher.js, lookup-barcode.js, sync-health-data.js, complete-quest.js, donate-charity.js
  _lib/rewardConfig.js, _lib/auditLog.js
android/                    # Capacitor Android project (Gradle). android/app/src/main/assets/public is generated by `cap sync` — don't edit
android/app/src/main/java/com/jnglobalventures/kinetixfit/
                            # MainActivity (registers the local plugins), SystemThemePlugin (night mode → "System"
                            # theme), NativeFeedbackPlugin (performHapticFeedback ticks)
ios/                        # Capacitor iOS project
public/                     # privacy-policy, terms-of-service, donate pages, favicons (Play listing needs the privacy policy URL)
assets/                     # icon.png, icon-only.png, splash.png — source art for app icons/splash
capacitor.config.ts         # appId, appName, webDir: 'dist', backgroundColor (launch colour)
android/app/src/main/res/values/colors.xml, styles.xml  # launch splash (plain kx_launch_bg), DayNight app theme
requirements.txt            # full toolchain + dependency checklist
scripts/setup-android.sh    # installs requirements.txt and builds a debug APK
scripts/ios-sim/            # build/launch/screenshot the iOS simulator app, run JS in its WebView, real taps (idb)
```

Capacitor plugins wired into Android (from `npx cap sync`): barcode-scanner 3.1.2, browser 8.0.4,
local-notifications 8.3.1, @capgo/capacitor-health 8.10.6, @revenuecat/purchases-capacitor 13.4.1,
@capacitor/haptics 8.0.2 (adds the VIBRATE permission), @capacitor/app 8.1.1 (Android back button + appStateChange),
@capacitor/keyboard 8.0.5 (iOS resize + keyboard events; see iOS section).
Two **local** plugins live in the Android project itself (`SystemTheme`, `NativeFeedback` — see Structure); they are
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
- **Server-only (set in Vercel, never `VITE_`-prefixed):** `ANTHROPIC_API_KEY`, `USDA_FDC_API_KEY`,
  `REVENUECAT_API_KEY`, `PROMO_CODES_JSON`, `UPSTASH_REDIS_REST_URL/TOKEN` (injected by Vercel Marketplace).
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
- Onboarding steps 0-4 render only when logged out; steps 5-6 render whenever `onboardingStep` is 5/6. In
  `npm run dev` only, `?ob=N` opens step N (e.g. http://localhost:5173/?ob=5); production builds ignore it.
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
  `initial-changes`, run `npm run lint` and `npm run build` before pushing, PR into `main`.

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
  (`.primary-btn`, `.secondary-btn`, `.auth-input`), `intro.css`, `pickers.css`, `about-you.css`, `glass.css`
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
