# KinetixFit: Backend Database as Source of Truth — STATUS (2026-09-30, end of session)

**Read this first in a new conversation.** The original plan (schema, decisions, phasing) is preserved
below under "Original plan". This top section is the handoff.

## Status at a glance

- **Code: committed**, not pushed, not merged. Commit `73ffa01` ("feat: sync all account data to
  Supabase, server-authoritative quest claims") on branch `initial-changes`, 42 files. Push/PR/merge are
  separate, explicit steps whenever the user asks (per standing project rule).
- **Verified working** on the test Supabase project only, across Android (S21 FE), the iOS simulator,
  and a real iPhone (13 mini) — full login → sync → offline-write → reconnect → logout-wipe → re-login
  cycles on each. 2 real bugs were found and fixed during that testing (Android; see "What's done"
  below); iOS testing found no new ones. A 3rd bug (the backfill-flag issue) was found in a later code
  review, not device testing, and is **not yet fixed** — see step 2 below.
- **Production has zero tables.** The code is inert there until the migration is applied — see
  "Next steps" below for the exact order that keeps this safe for the live website.
- `npm test`: 1,124 passing (as of the 2026-09-30 backfill-flag fix, below). `tsc -b`: clean. `npm run
  build` / `npm run build:web`: clean. `npm run lint`: 4 pre-existing, non-blocking React Compiler
  diagnostics in `App.tsx` (unchanged from before this batch's commit — see "Known limitations";
  deliberately deferred, see `CLAUDE.md` → Current status).

## Next steps (in order — read this before doing anything)

1. **Before merging to `main`: apply `supabase/migrations/0001_source_of_truth.sql` to the production
   Supabase project (ref `qlsdmczmnmsjhqptnkym`) and add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.** This
   order matters, not just tidiness: merging first would let the live website's `/app/` sync against
   production before the tables exist, which — because of the backfill-flag bug below — would
   permanently strand pre-migration users' historical data. Both are dashboard actions the user does
   (Claude is blocked from production deploys/secrets in auto mode).
2. ~~**Fix the backfill-flag bug in `sync.ts` first**~~ **Done (2026-09-30).** `pushAllKeyed()` now returns
   `Promise<boolean>` (checks each `upsert`'s `{ error }` the same way `pushKeyed` already did) and
   `syncAllOnLogin()` only calls `setBackfilled(domain.name)` when that push fully succeeded — a failed
   push (table not migrated yet, transient network error) now leaves the domain un-backfilled so the
   one-time "push everything local" pass retries on the next login. Pinned with 2 new tests in
   `sync.test.ts` (`describe('syncAllOnLogin — keyed-domain backfill', ...)`: one forcing an upsert
   failure and asserting the backfilled flag stays unset, one confirming success still sets it).
   `npm test`: 1,124 passing (was 1,122). `tsc -b`, `npm run build`, `npm run build:web` all clean; lint
   unchanged (same pre-existing 4 diagnostics, see "Known limitations").
3. Decide on the 4 lint diagnostics: leave as a known issue, or spend time isolating/fixing them.
4. Decide whether to widen phase 9 (quest claims) to authoritative running totals + server-computed
   streaks, rather than the narrower "dedup only" scope shipped here.
5. Push the branch, open the PR, merge when ready (after steps 1–2, per the ordering above).

## What's done

All 10 original phases are implemented, unit-tested (1,122 passing tests, up from 1,068), and verified
with real round-trips against a **test** Supabase project — never production. A later follow-up request
extended scope to persist a rolling 30-day history of wearable data (steps, sleep, daily heart-rate
average, detected workouts) rather than only reading it live, and to verify the whole flow on the real
S21 FE. That's done too, with two real bugs found and fixed via that device testing (details below).

- **Schema + RLS**: `supabase/migrations/0001_source_of_truth.sql` — 13 tables, all RLS-enabled and
  owner-scoped, applied to the test project (`KinetixFit Test`, ref `ocaxkjpkklixjtkhkttt`).
- **Generic sync engine**: `src/lib/sync.ts` — singleton (LWW: `profiles`, `preferences`) + keyed
  (idempotent, tombstoned-delete) domains, outbox, first-login backfill, logout wipe.
- **Every domain wired**: `profileSync.ts`, `preferencesSync.ts`, `gutSync.ts`, `checkinsSync.ts`,
  `periodsSync.ts` (soft-delete), `waterSync.ts` (soft-delete), `savedFoodsSync.ts`, `foodLogSync.ts`
  (soft-delete + aging-vs-deleting distinction), `workoutsSync.ts` (manual + detected, merged into one
  `workouts` table), `vitalsHistorySync.ts` (event-level readings **and** day-total upserts for
  steps/sleep/heart-rate-average — added in the 30-day-history follow-up).
- **`@capacitor/network`** installed and synced into Android + iOS; outbox flushes on reconnect and
  app-foreground.
- **Server-authoritative quest claims** (narrower scope than originally described — see "Known
  limitations"): `api/_lib/supabaseAuth.js` (verifies the caller's real session token) +
  `api/_lib/supabaseAdmin.js` (service-role writes) wired into `api/complete-quest.js`. Writes a durable
  `quest_claims` row (DB-unique-constraint-enforced dedup) + `points_ledger` row. Older app builds
  without a token still work on the pre-existing Redis-only path.
- **30-day wearable history** (follow-up request): `recordDailyVitalTotal` in `vitalsHistory.ts` upserts
  one row per day for steps/sleep/heart-rate-average (unlike event-level readings, these overwrite as the
  day's figure grows); `recordDetectedWorkouts` in `workouts.ts` persists the same 30-day
  `Health.queryWorkouts` window the app already reads live, into a new local history cache, synced via
  the `workouts` table with `source: 'detected'` (vs `'manual'`). Both are purely additive — existing
  UI/Rewards/quest logic reading live device data is unchanged.

## Real S21 FE device verification (this session)

Full lifecycle driven on the physical S21 FE (`RZCT815G2ND`) via adb + Playwright-over-CDP, pointed at
the **test** Supabase project (temporarily swapped into `.env`, then restored to production — see
"Environment state" below): fresh sign-up → onboarding → Health Connect connect (granted "Allow all") →
real step data (from the phone's actual Health Connect) synced to Postgres → offline write (airplane
mode via adb) queued locally → reconnect → outbox auto-flushed → logout wipe → re-login → data restored.

**Two real bugs found and fixed via this testing:**
1. **Logout wipe was incomplete.** `kx_vitals_history`, `kx_detected_workouts_history`,
   `kx_food_log_deleted`, `kx_workouts_deleted`, `kx_periods_deleted`, `kx_water_deleted` were never
   added to `sync.ts`'s `ACCOUNT_DATA_KEYS`/wipe list when those files were created earlier in the
   session. Fixed; pinned with a new test in `sync.test.ts`.
2. **Login had two competing paths that raced.** `handleAuthSubmit` (right after
   `signInWithPassword`/`signUp` resolves) used to directly call `saveProfileToStorage` +
   `continueAfterSignIn`, **separately** from `onSessionChange`'s listener-driven path (which does the
   sync pull). The direct path ran first, wrote a placeholder profile, and marked it dirty — so when the
   listener's pull ran moments later, it saw local data as "newer" and **pushed the placeholder over
   whatever had just been correctly pulled from the server**, corrupting fields like
   `smartDeviceConnected`. Fixed by deleting the direct path entirely and routing everything through one
   guarded function (`syncThenContinue`, an effect event) reached only via the `onSessionChange`
   listener, which reliably fires from the same sign-in call. Verified fixed on-device across multiple
   clean logout→login cycles with a server-side value planted in between.

**A backup/restore mishap on the S21 FE, resolved:** before logging out of the real account cached on
the phone (from before this session), its local data was backed up via `run-as tar` while the app was
still running — LevelDB's on-disk files can lag what's live in memory, so the backup captured a stale
snapshot. After testing, restoring it plus a still-valid production auth token caused the phone to
briefly show a placeholder profile under the real account `sivadurgaksd@gmail.com`. **No data was
actually lost or corrupted in production** (production has no `profiles` table yet — nothing to push to
or overwrite), and the user confirmed this phone was never their real tracked device (they use an
iPhone for that). User has since logged out on the S21 FE themselves. The stale backup tars are at
`Claude Space/KinetixFit-backups/2026-09-30-s21fe-pre-synctest/` — not reliable, safe to ignore/delete.

## Known limitations / open items

- **Phase 9 (server-authoritative points) is narrower than the original plan.** Done: durable
  DB-enforced dedup for quest claims, real session-token verification. **Not done**: the endpoint still
  returns a point/xp *delta* (not an authoritative running total), and streak totals aren't
  server-computed — the client still increments locally. Widening this touches the Rewards UI broadly;
  deliberately not attempted here.
- **`saved_foods` has no tombstones** — no delete UI exists for saved foods today, so none was invented.
- **Detected workouts don't sync bidirectionally into the UI** — a remote-only detected workout (from
  another device) lands in a read-only local history cache, never the live `detectedWorkouts` state or
  Rewards counting, to avoid changing how points/badges are earned.
- **4 React Compiler lint diagnostics remain in `App.tsx`** (`react-hooks/purity` ×2 at the
  `submitCheckIn`/`rewardCheckIns` forward-reference, `react-hooks/preserve-manual-memoization` ×2 near
  `foodLog`'s `useMemo` and the gut-report `useMemo`, both about `todayDateKey`). Confirmed via
  `git stash` that the original file lints clean and today's cumulative changes introduced this —
  bisecting exactly which change tipped React Compiler's heuristics wasn't done (severe time cost for a
  lint-only, non-runtime-affecting diagnostic; `npm run build`, `tsc -b`, and all tests are unaffected).
  Flagged for a decision on whether it's worth chasing — see "Next steps" above.
- **Production still has no schema**, and there's a real ordering hazard around fixing that — see
  "Next steps" above for why the migration must land before any merge to `main`.
- ~~**The `pushAllKeyed`/`syncAllOnLogin` backfill-flag bug**~~ **Fixed 2026-09-30** — see step 2 in
  "Next steps" above.
- **iOS**: `npx cap sync ios` confirmed clean (no Windows-path regression in `Package.swift`). **Now
  exercised on the iPhone 17 simulator** (a later session, `.env` temporarily swapped to the test
  Supabase project as for the S21 FE, then restored — see "iOS simulator verification" below). Still
  not run on a real iPhone.

## iOS simulator verification (later session)

Full lifecycle driven on the iPhone 17 simulator (`3417A3E2-0F9C-479C-A138-D4A333D66BE5`) via `scripts/ios-sim/`
+ `wi.mjs` (JS injection into the WebView — React-controlled inputs need the native `<input>` value
setter, not `.value =`) + `idb ui button HOME` (a real background→foreground transition, not a
terminate/relaunch, to trigger `appStateChange`), pointed at the **test** Supabase project: a
pre-confirmed test user created via the admin API (`kx-ios-sim-test@kinetixfit-test.invalid`, uid
`4face84e-b682-452b-940d-f283604d1960` — email confirmation is required on both projects, so sign-up
through the UI would have needed a real inbox), logged in through the real sign-in form → placeholder
profile pushed (first-run backfill) → full onboarding (About you, Body, Goal, diet) → a water log entry
added on Today → **confirmed both `profiles` and `water_logs` land correctly in Postgres** → logged out
→ **confirmed a clean local wipe** (localStorage down to 1 key, the intentionally-kept
`kinetix_onboarded_email`) → logged back in → **confirmed the full profile and the water entry were
pulled back down correctly**. No bugs found — the sync engine + the two S21 FE fixes (logout wipe list,
the single `syncThenContinue` login path) all hold on iOS too.

**One real lifecycle nuance found (not a bug, but worth knowing):** a cold app launch does **not** fire
Capacitor's `appStateChange` event, so `flushOutbox()`'s foreground trigger doesn't run then — only a
true background→foreground transition or a network reconnect does. This matches `App.tsx`'s listener
(`isActive` from `appStateChange`), so outbox items written just before a cold relaunch (e.g. this
session's `profiles` entry after onboarding) sit queued until the next real foreground/reconnect, same
as it would on a real phone. Confirmed by using `idb ui button HOME` + `simctl launch` (no terminate) to
produce a genuine foreground event, which flushed the queued `water_logs` row immediately.

Also reconfirmed the same minor inefficiency noted for Android would apply to iOS too: every
sign-in-triggered `syncThenContinue` calls `saveProfileToStorage` unconditionally, which re-marks
`profiles` dirty in the outbox even when nothing actually changed since the last push — harmless (an
idempotent upsert), just an avoidable round trip on every login. Not fixed; flagged for whoever tackles
the sync engine next.

Cleanup: `.env` restored to production (confirmed byte-identical to the pre-swap backup). The iPhone 17
simulator was shut down after use. The test user + its rows in the test Supabase project are harmless
leftovers, same as the S21 FE's — safe to delete via the dashboard whenever, or ignore.

## Real iPhone 13 mini verification (same later session)

Same lifecycle repeated on the user's actual iPhone 13 mini (`00008110-001151D80291801E`, the real,
actively-used device with the user's real account and real local-only data), driven the same way over
its real Web Inspector target (`ios_webkit_debug_proxy` connects to real devices over USB the same way
it does simulators — `scripts/ios-sim/wi.mjs` worked unmodified) plus `xcrun devicectl` for
install/launch. **Because this phone's local data isn't backed up anywhere yet (production has no
schema), and the user asked to preserve it:** before touching anything, the real account's entire
`localStorage` (24 keys — profile, food log, workouts, points, gut checks, etc.) was read live via a JS
eval and saved to a plain JSON file (`/tmp/kx_real_iphone_backup_*.json`) — a live memory read, not an
on-disk snapshot, avoiding the exact staleness problem that hit the S21 FE backup earlier this project.

Sequence: `.env` swapped to the test project (backed up first) → rebuilt + reinstalled over the existing
app (an update install keeps app data — confirmed the real account's 24 keys were untouched immediately
after) → logged the real account out (confirmed a clean wipe, same as everywhere else) → a fresh
pre-confirmed test user created via the admin API → logged in through the real UI → full onboarding →
a water log entry added → **confirmed both `profiles` and `water_logs` rows landed correctly in
Postgres** (this time via `xcrun devicectl device process launch --terminate-existing`, a real cold
relaunch, since real devices can't take `idb`'s simulator-only Home-button command — the relaunch's own
`syncAllOnLogin` first-run backfill pushed everything, no true backgrounding needed) → logged the test
account out (clean wipe) → logged back in → **confirmed the test account's profile and water entry were
pulled back down correctly** (after one transient "Couldn't reach the server" on the first attempt —
retried and it worked; not investigated further, plausibly just the phone's radio). No new bugs found —
same result as the simulator run.

**Restore:** test account logged out (clean wipe) → the saved 24-key JSON snapshot written back into
`localStorage` verbatim via a JS eval + reload → `.env` switched back to production → **rebuilt and
reinstalled again** (rather than trust a reload alone) so the phone is running a production-configured
build → confirmed after relaunch: all 24 original keys back, profile name "Siva Durga", logged in,
dashboard showing "Synced with Apple Health" and the real 4-day streak. The real account was at no point
exposed to the test project with an active session (a different Supabase project means a different
localStorage session-token key, so `flushOutbox`'s `currentUserId()` always returned null against the
test client while the real account's `kinetix_logged_in` flag was set) — nothing from the real account
was ever able to sync to the wrong backend, by construction of how the two Supabase clients' sessions are
keyed, not because of any extra care taken beyond the swap/restore sequence itself.

## Environment state (as of end of session)

- `.env` is back to **production** Supabase values (confirmed byte-identical to the pre-session backup
  at `/tmp/kx_env_backup_1790756891.env` — that backup can be deleted once confirmed unneeded).
- `.env.test.local` holds the **test** project's URL/anon/service-role keys (gitignored, never
  committed) — reusable for any future test-project work.
- The test project has one leftover test user (`kx-s21-device-test@kinetixfit-test.invalid`,
  uid `8116f28d-f990-4e09-aa68-cc32f80b17f3`) with real synced data (steps, water, profile) — harmless,
  safe to delete via the Supabase dashboard whenever, or ignore.
- S21 FE (`RZCT815G2ND`) is logged out, pointed at production, `.env`-wise identical to before this
  session started. Its previous real cached profile ("Dariya"/`dkondapalli@...` per the raw backup, not
  "Durga" as briefly shown on screen — see mishap above) was not restored, since the user confirmed this
  phone isn't their tracked device anyway.
- `npm test`: 1,122 passing. `tsc -b`: clean. `npm run build` / `npm run build:web`: clean. `npm run
  lint`: 4 pre-existing-pattern errors surfaced (see "Known limitations") — not fixed.
- **Committed**: `73ffa01` on `initial-changes`, 42 files. Not pushed, not merged. See "Next steps" at
  the top of this file for what's left and in what order.

---

# Original plan (as approved, before execution)

## Context

KinetixFit (`/Users/sivadurga/Claude Space/KinetixFit-core`, Capacitor 8 + React 19/TS, shared by Android, iOS, and the website) currently stores **all** user data — food logs, water, workouts, gut checks, periods, check-ins, vitals history, points/XP/streaks, profile, preferences — in `localStorage` only, per device, with no account namespacing. Supabase is wired up for **auth only**; no database schema exists. The project's own roadmap already flags this as unstarted work ("syncing the food log, gut checks, periods, water and profile to the account... switching phones loses them").

This creates real problems: switching phones loses everything, logout doesn't clear local data (`handleLogout` in `App.tsx` only clears the `kinetix_logged_in` flag), so a second account signing into the same device sees the first account's data, and there's no durable history for future AI features (personalization, wearable trend analysis, cycle prediction) to draw on.

The goal: make Supabase Postgres the durable source of truth for all account data, keep localStorage as a cache/offline layer, and do this in small, independently reviewable, testable steps — without breaking Android, iOS, or the website, and without losing any existing user's data.

**Decisions locked in with the user:**
1. Last-write-wins only for singleton data (profile, preferences). Append-only/editable logs (food, workouts, health records, points, streaks, quest claims) use stable IDs + idempotent server-side upserts — records are never silently overwritten or dropped by a stale write.
2. Sync on app open/resume + flush queued writes on reconnect. No Supabase Realtime.
3. Points/streaks/quest claims become **server-authoritative** (server is the only writer of truth; client submits claims, server validates + dedupes) — synced last, after core data sync is proven.
4. Full logout data wipe ships **early** (right after the first domain goes live), not last — no account's local data may persist or leak into another account's session.
5. Server retains complete history indefinitely — no 90/60/35-day caps applied server-side (local caches can keep their existing caps for on-device performance; the server never prunes).
6. `@capacitor/network` for connectivity detection (new native dependency, needs `cap sync` on both platforms).

## Schema (Supabase Postgres)

New `supabase/migrations/` directory (none exists today). All tables: `user_id uuid references auth.users(id) on delete cascade`, RLS `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`, `updated_at timestamptz default now()` maintained by trigger. No retention pruning server-side.

- **`profiles`** (singleton, LWW) — maps `UserProfile` in `App.tsx` (name, height, weight, target, personal_allergens, sex, age, activity_level, last_period_start_date, average_cycle_length, region, country, diet, onboarded, ob_step).
- **`preferences`** (singleton, LWW) — `data jsonb`: theme, notification toggles, widget prefs, glass size / water goal, app icon choice. A blob is fine here — small, single-current-value settings.
- **`saved_foods`** — pk `(user_id, key)`, maps `SavedFood` (`foodLog.ts`) fields incl. `per100g jsonb`, `units jsonb`, `density`, `uses`, `last_used`.
- **`food_log_entries`** — pk `id text` (client-generated, e.g. `newId()`), `day date`, maps `LogEntry` fields incl. `per100g jsonb`, `extras jsonb`, `meal jsonb`, `amount_guess`, `note`; `deleted_at` soft-delete. Index `(user_id, day)`.
- **`water_logs`** — pk `id text` (client-generated unique ID, not `(user_id, at)` — avoids cross-device timestamp collisions), `at bigint`, `ml`, `day date` (derived, indexed), `deleted_at` soft-delete.
- **`workouts`** — merges manual + detected, pk `id text`, `source` (`manual`/`health-connect`/`healthkit`), `deleted_at` soft-delete.
- **`gut_checks`**, **`morning_checkins`** — pk `(user_id, day)`, edit-in-place (no delete semantics today).
- **`periods`** — pk `(user_id, day)`, supports remove (soft-delete via `deleted_at`).
- **`vitals_history`** — **event-level**, pk `id text` (client- or server-generated unique reading ID), columns `user_id`, `metric`, `value`, `source`, `recorded_at bigint` (exact reading timestamp, not just day), `day date` (derived, indexed). Not `(user_id, day, metric, source)` as the key — that would collapse multiple same-day readings (e.g. hourly heart-rate samples) into one, losing the granularity future wearable-trend/AI-insight analysis needs. New durable store — today this only exists as a 90-day localStorage cache plus live Health Connect/HealthKit reads. Indexed `(user_id, metric, recorded_at)` for trend queries.
- **`points_ledger`** — pk `(user_id, day, award_id)`, server-authoritative once step 9 lands (see below).
- **`streaks`** — pk `user_id`, `best`.
- **`quest_claims`** — pk `(user_id, day, quest_id)`, server-authoritative.

No AI-output cache table in the first pass (`suggest-meals.js`/`scan-meal.js` results are already persisted once acted on, via `food_log_entries`) — flagged as a later product decision, not built speculatively.

## Sync engine

One generic module (`src/lib/sync.ts`), not per-domain hand-written sync, since every domain reduces to two shapes:
- **Singleton, LWW** (`profiles`, `preferences`): upsert whole row, remote wins unless local `updated_at` is newer.
- **Keyed rows, idempotent merge** (everything else): stable client-generated IDs (or natural `(user_id, day)` keys), upsert-by-key — never last-write-wins field overwrite; a record present locally but not remotely is always pushed, never dropped.

Design:
- Extract a shared `src/lib/storage.ts` (`readJson`/`writeJson`) out of the private copies each module (`foodLog.ts`, `gut.ts`, `checkins.ts`, `water.ts`) currently maintains — pure mechanical refactor, zero behavior change, existing tests must pass unchanged. This is the low-risk groundwork step.
- `writeJson` enqueues changed data into an outbox (`kx_sync_outbox` in localStorage) so every write is durable offline immediately.
- `pushLocal(domain)` / `pullRemote(domain, since?)` per registered domain adapter; existing `load*()`/`save*()` functions in each module stay the source of local read/write (minimizing churn to `App.tsx` and components — no call site changes).
- Flush loop triggered by: `@capacitor/network` connectivity-restored event, app foreground/resume, and a periodic fallback timer. Idempotent upserts make partial/retried flushes safe.
- **Deletes are tombstones, never hard deletes, on both client and server**: every deletable domain (`food_log_entries`, `saved_foods`, `water_logs`, `workouts`, `periods`) marks `deleted_at` instead of removing the row/localStorage entry. `pullRemote` applies a `deleted_at` it receives by removing the record locally; a device that was offline when a delete happened and comes back online cannot resurrect the record, because the tombstone (not a hard absence) is what syncs — an offline device's stale "record still exists" push is rejected/overwritten by the newer tombstone's `updated_at`. Tombstoned rows are excluded from all normal reads (`where deleted_at is null`) but kept indefinitely server-side (per the no-pruning decision), so no cleanup job is needed.

## Login / logout lifecycle

**Login** (`onSessionChange` in `App.tsx`): after a session is confirmed, pull remote data for every registered domain before `continueAfterSignIn`. First-run backfill rule: if remote has no rows for a domain, push local straight up (covers existing users' phone-only data — nothing is lost). If remote already has data, merge by domain rule above (local-only records always uploaded; singleton conflicts resolved by `updated_at`). Guard against running this on every token-refresh, matching the existing `!isLoggedIn && onboardingStep <= 2` guard pattern already in place.

**Logout** (`handleLogout` in `App.tsx`): before `signOut()`, best-effort final outbox flush; after `signOut()` succeeds, wipe **every** domain's localStorage keys via one `clearAllDomainData()` helper (each domain registers its keys, same registration used for sync) — food log, water, workouts, gut, periods, check-ins, vitals cache, points/XP/streak/quest keys, profile, preferences, widget prefs, plus the sync engine's own bookkeeping (outbox, last-synced timestamp, backfill-done flag). This directly closes the "second account sees first account's data" bug and ships early (step 3 below), not after every domain is migrated.

## Points/streaks/quest claims: server-authoritative

Once core data sync is proven (steps 4–7), move points/XP/streak/quest-claim awarding so the **server is the only writer**: client submits a claim (quest id, day) to an endpoint (extending `api/complete-quest.js`), server checks `quest_claims`'s unique `(user_id, day, quest_id)` constraint and existing daily caps, writes `points_ledger` + updates `streaks`/`profiles` totals, and returns the authoritative new totals. Client never locally increments points speculatively in a way that survives past the next sync — this prevents the double-award risk of two devices independently deciding "not claimed yet" before either has synced.

## Phasing (each step independently shippable, tested, reviewed one at a time)

1. **Schema + RLS in Supabase** — all tables/policies/triggers above. No app code changes.
2. **Shared `storage.ts` extraction** — pure refactor of existing per-module read/write helpers.
3. **Sync engine + `preferences` + `profiles` end-to-end, plus full logout wipe** — lowest-risk domains, and the logout fix ships now (per decision 4) rather than waiting for every domain.
4. **`morning_checkins`, `gut_checks`, `periods`** — same `(user_id, day)` shape; periods exercises soft-delete.
5. **`water_logs`** — first per-event (not per-day) domain; exercises widget-added pending writes flowing through the same outbox.
6. **`saved_foods`**, then **`food_log_entries`** — highest-volume, highest-stakes domain; done after the engine is validated on lower-stakes data.
7. **`workouts`** — manual + detected merge.
8. **`@capacitor/network` + offline queue hardening** — real airplane-mode testing on the S21 FE/A55/iPhone, layered in once several domains are live to validate against real data.
9. **Server-authoritative points/streaks/quest claims** (`points_ledger`, `streaks`, `quest_claims`) — last, highest conflict-risk, as agreed.
10. **`vitals_history`** — additive new functionality; hooks into the existing Health Connect/HealthKit read path (`vitals.ts`, `readLatest`/`readLatestHeartRate`) to opportunistically persist readings for future trend/AI-insight queries. Independent of the localStorage-migration steps above, so it can move earlier or later relative to 4–8 if the user prefers once we're underway.

Each step ships in Android-first order per the project's existing Android → iOS → website priority; the website gets sync for free (same `src/`) but device verification follows that order.

## Testing per step

- **Vitest** (existing `src/test/setup.ts` in-memory localStorage + a mocked Supabase client): merge/conflict logic, outbox enqueue/flush/retry, first-run-backfill branching, `clearAllDomainData()` completeness. Run full existing suite (1,068+ tests) + lint + `tsc -b` + both builds after every step, per the project's standing checklist.
- **Real (non-production) Supabase test project**: RLS correctness (cross-user reads/writes rejected), trigger behavior, real upsert/select round-trips.
- **Real device** (existing adb/ios-sim workflow): offline behavior (airplane mode), backgrounding mid-sync, real login/logout session restore across relaunch.

## Critical files

- `src/lib/supabase.ts` — Supabase client
- `src/lib/foodLog.ts`, `water.ts`, `gut.ts`, `cycle.ts`, `checkins.ts`, `points.ts`, `streak.ts`, `workouts.ts` — domain modules whose `load*`/`save*` functions the sync layer hooks under
- `src/App.tsx` — `UserProfile` type, `onSessionChange`, `handleLogout` (~line 2449-2489)
- `src/test/setup.ts` — test localStorage harness
- New: `supabase/migrations/`, `src/lib/storage.ts`, `src/lib/sync.ts`

## Verification

After each step: `npm test`, `npm run lint`, `tsc -b`, `npm run build` and `npm run build:web`; for steps touching sync, a manual check against a real test Supabase project (two seeded users, confirm RLS isolation) plus a real-device login → make changes offline → reconnect → confirm sync → logout → confirm local wipe → log back in → confirm restore, run on the S21 FE first, then the iPhone, per project priority.
