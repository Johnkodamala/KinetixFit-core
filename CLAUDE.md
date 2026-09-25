# KinetixFit Core

One React 19 + TypeScript + Vite codebase ships three products: the **website** (Vercel, live at
https://www.kinetixfit.co.uk, which also hosts the `api/` serverless functions), and the **Android**
and **iOS** apps (Capacitor 8 wraps the same `dist/` build in a WebView; native features — health
data, barcode scanner, notifications, RevenueCat billing — come from Capacitor plugins).

**Priority order: Android → iOS → website.** Android is the current focus and should be finished
first, but all three share `src/` and `api/`, so every change must keep all three working — never
fix one platform by breaking another. Work that unblocks several platforms (shared API, auth) is
done once, in shared code.

- App ID: `com.jnglobalventures.kinetixfit` · App name: `KinetixFit`
- Location: `/Users/sivadurga/Claude Space/KinetixFit-core` (moved here from `~/KinetixFit-core` on 2026-09-25)
- Git: `origin` = github.com/Johnkodamala/KinetixFit-core, working branch `initial-changes` → PR into `main`

## Current status (2026-09-25)

- Merged `initial-changes` → `main` and deployed to production: Android toolchain + `requirements.txt`,
  server URL + CORS work, Health Connect permission trim, and the full frontend redesign.
  Lint (0 errors), `npm run build`, `cap sync` and `assembleDebug` all pass.
- Restore point: tag `pre-redesign` = `a900b56`, the last production deploy before the redesign.
  Roll back by reverting the merge commit (Vercel redeploys `main`) or Vercel → Deployments → Instant Rollback.
- Only commit, push or merge to `main` when the user asks — a push to `main` deploys to production.
- Not yet done: running the app on a real Android device or emulator.

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
adb devices                                  # check device connection
adb logcat | grep -i -E "capacitor|chromium" # WebView console + plugin logs
```

A clean `assembleDebug` takes ~6-7 min the first time (Gradle downloads deps); later builds are fast.
Verified working on 2026-09-25. Debug WebView is inspectable at `chrome://inspect` in desktop Chrome.

## How the apps reach the server (shared by all three)

- Every server call and server-hosted link goes through `serverUrl(path)` (`src/lib/server.ts`). On
  the website it returns the relative path; in the native apps it prefixes `VITE_SERVER_URL`
  (default `https://www.kinetixfit.co.uk`). Never write a bare `fetch('/api/...')` or `href="/..."`
  for a Vercel route — it silently breaks both apps, because their WebView origin is
  `https://localhost` (Android) / `capacitor://localhost` (iOS).
- Always use the **www** host: the apex domain 308-redirects and CORS preflights don't follow redirects.
- Every `api/*.js` handler starts with `if (handleCors(req, res)) return;` (`api/_lib/cors.js`),
  which answers preflight `OPTIONS` and allows only the two native origins. New endpoints need it too.
- `api/` changes only reach the apps once deployed to Vercel. Before 2026-09-25's CORS change is
  deployed, the live API answers preflights with 405 and **all native API calls fail**.

## Roadmap / open work

### Android (current focus)
- [x] Toolchain installed, debug APK builds (2026-09-25)
- [x] API calls + privacy/terms links point at the live server from the app; CORS added in `api/`
- [x] Health Connect: plugin supplies the permissions-rationale activity and `health_connect_privacy_policy_url`
      is set in `res/values/strings.xml`. The plugin declares 47 read/write health permissions; the app
      manifest strips all but the 5 it reads (`tools:node="remove"`) — Play rejects unused health permissions.
      If `requestAuthorization` in `App.tsx` gains a data type, delete that type's remove-line.
- [ ] Deploy the `api/` CORS change to Vercel, then test every API feature on a device/emulator
- [ ] Create an emulator (Android Studio → Device Manager; needs a system image download) or use a USB device
- [ ] Release signing: upload keystore + `signingConfigs`. Keystores (`*.jks`, `*.keystore`) are gitignored
      on purpose — losing the upload key means no more updates under this app ID. Play needs an AAB: `./gradlew bundleRelease`
- [ ] Bump `versionCode` / `versionName` in `android/app/build.gradle` (currently 1 / "1.0") for every Play upload
- [ ] Play Console: Health Connect data-use declaration, data-safety form, privacy policy URL
- [ ] Google sign-in is disabled on native (`handleGoogleSignIn` — needs a deep-link return URL); email/password works
- [x] Frontend redesign — one design system across onboarding + dashboard, light/dark, animations (see Design system)
- [ ] Run on a device/emulator and check the redesign there (safe areas, keyboard over inputs, WebView font rendering)
- [ ] Main JS chunk ~890 kB (Vite warning) — code-splitting `App.tsx` would speed WebView startup

### iOS (next)
- [x] HealthKit entitlement (`ios/App/App/App.entitlements`), Health + Camera usage strings in `Info.plist`
- [x] Shares the server URL / CORS work above (`capacitor://localhost` is allowed)
- [ ] Install full Xcode from the App Store (only Command Line Tools are installed), then
      `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` and `sudo xcodebuild -license accept`
- [ ] `npx cap sync ios && npx cap open ios`; set the signing team (Apple Developer account needed for HealthKit on device)
- [ ] `ios/App/CapApp-SPM/Package.swift` must use `/` paths — it was once committed with Windows `\`
      paths (breaks Xcode). Running `cap sync` on Windows reintroduces them; check the diff before committing.

### Website
- Live on Vercel at www.kinetixfit.co.uk (apex redirects to www); how it deploys (Git integration vs CLI) is not yet documented. Same `src/`, so
  Android work generally ships to the web too — check `npm run dev` still works after native changes.
- `vercel.json` rewrites `/privacy-policy`, `/terms-of-service`, `/donate/complete` to the HTML files in `public/`.

## Structure

```
src/App.tsx                 # ~3,100 lines — onboarding (steps 0-6), dashboard (DASHBOARD_STEP = 7), almost all logic + JSX
src/main.tsx                # entry; RevenueCat setup; imports index.css + src/styles/*.css
src/index.css               # design tokens (colour/type/motion), light + dark, keyframes, reduced-motion
src/styles/app.css          # dashboard: shell, cards, controls, hero, tab bar, modals
src/styles/onboarding.css   # onboarding screens (.ob-*)
src/styles/onboarding-profile.css  # .primary-btn / .secondary-btn / .auth-input (shared with dashboard)
src/components/             # BiometricTrendCard (Recharts trend card), Icons (SVG set), TrackLanes (hero art), DonateButton
src/lib/supabase.ts         # Supabase client; exports isSupabaseConfigured
src/lib/server.ts           # serverUrl() — relative on web, absolute Vercel URL in native apps
src/utils/justgiving.ts     # JustGiving donate link
api/                        # Vercel serverless functions (NOT bundled into the apps — reached via serverUrl())
  _lib/cors.js              #   handleCors() — native-app origins + preflight; call first in every handler
  scan-meal.js              #   photo → food ID (Anthropic API) → USDA FDC nutrition
  verify-license.js         #   RevenueCat subscription check
  redeem-promo.js           #   promo codes, redemption tracked in Upstash Redis
  redeem-voucher.js, lookup-barcode.js, sync-health-data.js, complete-quest.js, donate-charity.js
  _lib/rewardConfig.js, _lib/auditLog.js
android/                    # Capacitor Android project (Gradle). android/app/src/main/assets/public is generated by `cap sync` — don't edit
ios/                        # Capacitor iOS project
public/                     # privacy-policy, terms-of-service, donate pages, favicons (Play listing needs the privacy policy URL)
assets/                     # icon.png, icon-only.png, splash.png — source art for app icons/splash
capacitor.config.ts         # appId, appName, webDir: 'dist'
requirements.txt            # full toolchain + dependency checklist
scripts/setup-android.sh    # installs requirements.txt and builds a debug APK
```

Capacitor plugins wired into Android (from `npx cap sync`): barcode-scanner 3.1.2, browser 8.0.4,
local-notifications 8.3.1, @capgo/capacitor-health 8.10.6, @revenuecat/purchases-capacitor 13.4.1.
After adding/removing a plugin, re-run `npx cap sync android`.

Native-only code paths are guarded with `Capacitor.isNativePlatform()` / `Capacitor.getPlatform()`
in `App.tsx` — health data, notifications, RevenueCat and scanning all no-op in the browser, so
test those on a device or emulator, not with `npm run dev`.

## Environment variables

`.env` is gitignored; `.env.example` is the template with comments on where each key comes from.

- **Bundled into the app (`VITE_` prefix, public by design):** `VITE_REVENUECAT_ANDROID_PUBLIC_KEY`,
  `VITE_REVENUECAT_IOS_PUBLIC_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key only, never service-role), `VITE_SERVER_URL` (optional).
  These are baked in at `npm run build` time — rebuild + `cap sync` after changing them.
- **Server-only (set in Vercel, never `VITE_`-prefixed):** `ANTHROPIC_API_KEY`, `USDA_FDC_API_KEY`,
  `REVENUECAT_API_KEY`, `PROMO_CODES_JSON`, `UPSTASH_REDIS_REST_URL/TOKEN` (injected by Vercel Marketplace).

## Frontend conventions

- Tabs: `vitals` (shown as "Today"), `nourish`, `profile`, `hub`; order lives in `TAB_IDS` and drives the
  sliding nav pill. The active tab is mirrored in the URL hash (`#nourish`).
- Toasts: `setMotivationMessage(text)` + a `setTimeout` to clear it. The toast stays until cleared — keep
  messages short, plain, no ALL CAPS.
- Onboarding steps 0-4 render only when logged out; steps 5-6 render whenever `onboardingStep` is 5/6. To
  screenshot steps 3-6 without Supabase keys, temporarily seed `onboardingStep` from a URL param and revert.
- Logged-in state for local testing: set `localStorage.kinetix_logged_in = 'true'` (+ `kinetix_profile` JSON)
  and reload. Without `.env` Supabase keys, the sign-up screen shows a "not configured" message — expected.
- `Autonomic Recovery` is a stored `profile.target` value; show it to users as "Recovery", don't rename the value.
- One pre-existing lint warning (`react-hooks/exhaustive-deps` on a `useMemo` in `App.tsx`) — not an error.

## Rules

- Never commit secrets, `.env`, keystores, or `google-services.json` with real credentials.
- Server secrets stay in `api/`; anything under `src/` ships inside the APK and is readable by anyone.
- Don't hand-edit generated Capacitor files (`android/app/src/main/assets/public`, `capacitor.build.gradle`,
  `capacitor.settings.gradle`) — they're overwritten by `cap sync`.
- Health data is sensitive: Play requires a Health Connect declaration and a privacy policy that covers it.
- Commit style: `<type>: <description>` (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Work on
  `initial-changes`, run `npm run lint` and `npm run build` before pushing, PR into `main`.

## Design system ("track day")

Redesigned 2026-09-25. One light theme plus an automatic dark theme (`prefers-color-scheme`), shared
by the web, Android and iOS builds.

- **Tokens live in `src/index.css`** — colours (`--bg`, `--surface`, `--ink`…`--ink-4`, `--accent`,
  semantic `--good/--warn/--danger/--info`), one fixed colour per health metric (`--m-steps`, `--m-heart`,
  `--m-sleep`, `--m-stress`), radii, shadows, motion (`--ease-out`, `--ease-spring`, `--dur*`).
  **Never hard-code a hex colour** in `App.tsx` or components — use `var(--token)`; dark mode depends on it.
- **Stylesheets:** `src/styles/app.css` (dashboard), `onboarding.css`, `onboarding-profile.css`
  (`.primary-btn`, `.secondary-btn`, `.auth-input`). Imported once in `src/main.tsx`. No `!important`:
  inline styles intentionally win, so only use inline styles for genuinely per-element/dynamic values.
- **Type:** Archivo (wide cut, `font-stretch: 125%`, 800) for display — greetings, big numbers, titles only;
  Hanken Grotesk for everything else. Both are bundled via `@fontsource-variable/*` (work offline in the APK).
- **Signature:** the dark "track" hero panel (`.vitals-hero-card` + `<TrackLanes />`) with lane lines that
  draw in, and streak/workout counts as `.kx-lap` lap counters. Used on Today, Profile and the welcome screen.
- **Motion:** tab content rises in with a stagger, the bottom-nav pill slides (`--tab-index` on the nav),
  modals slide up as sheets on phones, progress bars fill like lanes. All disabled under reduced motion.
- **Icons:** `src/components/Icons.tsx` (stroke SVGs, `currentColor`) — no emoji in UI chrome.
- **Copy:** plain, sentence case, UK spelling (fibre). Describe what the user controls, not the system
  ("Connect a device", not "Configure smart sensor links").
- **Checking UI changes:** screenshot at 390×844 in light and dark (Playwright headless works well), and
  check a wide viewport — the Today/Profile grids go two-column at ≥1024px for the website.
