// Generic sync engine: Supabase Postgres is the source of truth for account data, localStorage is the
// cache/offline layer. Every domain reduces to one of two shapes:
//  - singleton (LWW): profiles, preferences — one row per user, remote wins unless the local copy was
//    edited more recently than the remote row's updated_at.
//  - keyed (idempotent upsert): everything else — stable client-generated ids (or (user_id, day) keys),
//    a record present locally but missing remotely is always pushed, never dropped; deletes are
//    tombstones (deleted_at), never hard deletes, so an offline device can't resurrect a deleted record.
//
// Domain modules (foodLog.ts, water.ts, …) keep their own load*/save* functions as the source of local
// read/write — this file only adds a push/pull layer on top, driven by domain registration below.
import { supabase, isSupabaseConfigured } from './supabase';
import { readJson, writeJson } from './storage';

const OUTBOX_KEY = 'kx_sync_outbox';
const mtimeKey = (domain: string) => `kx_sync_mtime_${domain}`;

// ---------------------------------------------------------------------------------------------------
// Local bookkeeping: which domains have unpushed local edits, and when each domain was last edited
// locally (compared against the remote row's updated_at for LWW).
// ---------------------------------------------------------------------------------------------------

function outboxSet(): Set<string> {
  return new Set(readJson<string[]>(OUTBOX_KEY) ?? []);
}
function saveOutboxSet(set: Set<string>) {
  writeJson(OUTBOX_KEY, [...set]);
}

export function localMtime(domain: string): number {
  const raw = localStorage.getItem(mtimeKey(domain));
  return raw ? Number(raw) || 0 : 0;
}
function setLocalMtime(domain: string, t: number) {
  try { localStorage.setItem(mtimeKey(domain), String(t)); } catch { /* storage full or blocked */ }
}

/** Call right after a domain's local data changes. Marks it for the next flush and stamps "now" so a
 * later pull knows this device's copy is newer than whatever the server had before the next push. */
export function noteLocalChange(domain: string) {
  const set = outboxSet();
  set.add(domain);
  saveOutboxSet(set);
  setLocalMtime(domain, Date.now());
}

function clearDirty(domain: string) {
  const set = outboxSet();
  set.delete(domain);
  saveOutboxSet(set);
}

export function isDirty(domain: string): boolean {
  return outboxSet().has(domain);
}

const dirtyKeysStorageKey = (domain: string) => `kx_sync_dirtykeys_${domain}`;
function dirtyKeysSet(domain: string): Set<string> {
  return new Set(readJson<string[]>(dirtyKeysStorageKey(domain)) ?? []);
}
function saveDirtyKeysSet(domain: string, keys: Set<string>) {
  writeJson(dirtyKeysStorageKey(domain), [...keys]);
}

/** Call right after one record of a keyed domain changes locally (an entry added, edited, or
 * tombstoned). Marks the domain for the next flush and remembers exactly which record is unpushed. */
export function noteKeyedChange(domain: string, key: string) {
  const set = outboxSet();
  set.add(domain);
  saveOutboxSet(set);
  const keys = dirtyKeysSet(domain);
  keys.add(key);
  saveDirtyKeysSet(domain, keys);
}

const backfilledStorageKey = (domain: string) => `kx_sync_backfilled_${domain}`;
function isBackfilled(domain: string): boolean {
  return localStorage.getItem(backfilledStorageKey(domain)) === '1';
}
function setBackfilled(domain: string) {
  try { localStorage.setItem(backfilledStorageKey(domain), '1'); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------------------------------------------
// Singleton domains (profiles, preferences)
// ---------------------------------------------------------------------------------------------------

export interface SingletonDomain<T> {
  name: string;
  table: string;
  /** Reads the current local value (never null — a domain always has *some* local shape, even if empty). */
  load: () => T;
  /** Writes a value pulled from the server back into local storage. */
  save: (value: T) => void;
  /** True when the local value has nothing worth pushing yet (e.g. a fresh install before onboarding). */
  isEmpty: (value: T) => boolean;
  /** Local value -> the row to upsert (must include user_id). */
  toRemote: (value: T, userId: string) => Record<string, unknown>;
  /** A row from the server -> the local shape `save` expects. */
  fromRemote: (row: Record<string, unknown>) => T;
}

const singletonDomains = new Map<string, SingletonDomain<unknown>>();

export function registerSingleton<T>(domain: SingletonDomain<T>) {
  singletonDomains.set(domain.name, domain as SingletonDomain<unknown>);
}

/** Looks up a registered singleton domain by name — used by tests. */
export function registeredSingleton(name: string): SingletonDomain<unknown> | undefined {
  return singletonDomains.get(name);
}

async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export type PullResult = 'no-session' | 'empty' | 'applied' | 'local-newer';

/** Told which domain a pull really changed here (see syncAllOnLogin). */
export type ChangeReporter = (domainName: string) => void;

export async function pullSingleton<T>(domain: SingletonDomain<T>, onChanged?: ChangeReporter): Promise<PullResult> {
  const uid = await currentUserId();
  if (!uid) return 'no-session';
  const { data, error } = await supabase.from(domain.table).select('*').eq('user_id', uid).maybeSingle();
  if (error || !data) return 'empty';
  const remoteUpdated = data.updated_at ? new Date(data.updated_at as string).getTime() : 0;
  if (localMtime(domain.name) > remoteUpdated) return 'local-newer';
  // Compared right here, in the same breath as the write (nothing else can run in between), so whatever the app wrote
  // itself while this pull was waiting on the network can never look like something the account sent.
  const before = onChanged ? fingerprint(domain.load()) : '';
  domain.save(domain.fromRemote(data));
  if (onChanged && fingerprint(domain.load()) !== before) onChanged(domain.name);
  setLocalMtime(domain.name, remoteUpdated);
  return 'applied';
}

export async function pushSingleton<T>(domain: SingletonDomain<T>): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const value = domain.load();
  if (domain.isEmpty(value)) return false;
  const row = domain.toRemote(value, uid);
  const { data, error } = await supabase.from(domain.table).upsert(row).select('updated_at').maybeSingle();
  if (error) return false;
  const t = data?.updated_at ? new Date(data.updated_at as string).getTime() : Date.now();
  setLocalMtime(domain.name, t);
  clearDirty(domain.name);
  return true;
}

/** Runs once after a session is confirmed: pull every registered domain, backfilling (pushing local
 * straight up) when the server has nothing yet, and pushing when the local copy turns out to be the
 * newer one (unflushed edits from before this login, or a stale remote row). Never drops local data.
 * `onChanged` hears the name of each domain whose data the account actually changed here. */
export async function syncAllOnLogin(onChanged?: ChangeReporter): Promise<void> {
  for (const domain of singletonDomains.values()) {
    const result = await pullSingleton(domain, onChanged);
    if (result === 'empty' || result === 'local-newer') {
      await pushSingleton(domain);
    }
  }
  await syncKeyedOnLogin(onChanged);
}

async function syncKeyedOnLogin(onChanged?: ChangeReporter): Promise<void> {
  for (const domain of keyedDomains.values()) {
    if (!isBackfilled(domain.name)) {
      // First sync for this domain: push everything local first (existing local-only data is never
      // lost), then pull down anything the server already had that this device doesn't. Only mark it
      // backfilled if every local record actually made it up — otherwise a failed push (e.g. the table
      // doesn't exist yet, or a transient network error) would permanently strand this user's local data.
      const ok = await pushAllKeyed(domain);
      await pullKeyed(domain, onChanged);
      if (ok) setBackfilled(domain.name);
    } else {
      await pullKeyed(domain, onChanged);
      await pushKeyed(domain);
    }
  }
}

/**
 * For a phone that held data the account never received (it was logged in with no account session): this phone's
 * profile and settings go up and replace the account's copy, instead of the usual newest-wins, which would have let a
 * newer profile from another phone overwrite the one this phone's data was built on. Logs, check-ins and the rest are
 * merged as usual: this phone's records go up first, then the account's come down.
 */
export async function syncKeepingThisPhone(): Promise<void> {
  for (const domain of singletonDomains.values()) await pushSingleton(domain);
  await syncKeyedOnLogin();
}

/**
 * Pulling from the account when the app opens, and when it comes back to the screen. Until now the account was only
 * read at login, so a second phone didn't see the first one's new entries until it logged out and in.
 * `syncAllOnLogin` is safe to repeat (newest-wins for profile and settings, record by record for logs, this phone's
 * unsent edits always win), so these just run it and say whether the account changed anything here.
 */

/**
 * What a person would see of some data, as a string to compare: keys in a fixed order, and a key holding null counts as
 * missing (an account row has `null` where this phone never stored the field at all, and that is not a change).
 */
export function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== null && x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v);
}

/**
 * Syncs with the account and reports whether the account changed anything held here (so the screen is out of date).
 * Each pull judges that itself, at the moment it writes. Comparing the whole phone before and after the sync does not
 * work: the sync takes seconds on a phone connection, and whatever this phone writes meanwhile (a Health reading, a
 * drink from a widget) would look like news from the account.
 */
export async function syncWithAccount(): Promise<{ changed: boolean }> {
  let changed = false;
  await syncAllOnLogin(() => { changed = true; });
  return { changed };
}

let lastPullAt = 0;

/** Pulls unless it already did within `minGapMs`. Null = skipped; otherwise whether anything changed. */
export async function pullIfDue(minGapMs = 60_000, now = Date.now()): Promise<{ changed: boolean } | null> {
  if (now - lastPullAt < minGapMs) return null;
  lastPullAt = now;
  try { return await syncWithAccount(); } catch { return { changed: false }; }
}

const accountChangeListeners = new Set<() => void>();

/** Called when a pull that finished after the app had already drawn brought something new. Returns the unsubscribe. */
export function onAccountDataChanged(listener: () => void): () => void {
  accountChangeListeners.add(listener);
  return () => { accountChangeListeners.delete(listener); };
}

/**
 * Before the app draws (while the opening animation plays): pull the account's data, so every screen starts from it.
 * Waits at most `timeoutMs` — a slow or missing connection must never hold the app up — and if the pull then finishes
 * with news, tells the app (onAccountDataChanged) so it can offer a refresh. Never throws.
 */
export async function pullOnLaunch(timeoutMs = 1800): Promise<void> {
  if (!isSupabaseConfigured) return;
  const pull = pullIfDue(0).then(r => r ?? { changed: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  const first = await Promise.race([pull, timedOut]);
  clearTimeout(timer);
  if (first === 'timeout') {
    void pull.then(r => { if (r.changed) accountChangeListeners.forEach(l => l()); });
  }
}

/**
 * Domains that still hold edits the server hasn't received. Logging out wipes this phone's copy, so anything listed
 * here would be lost with it: the caller checks this after flushOutbox() and asks before wiping. A domain with nothing
 * in it doesn't count (a blank row is never pushed, so it would otherwise look unsynced for ever).
 */
export function unsyncedDomains(): string[] {
  const names = new Set([...outboxSet()].filter(name => {
    const singleton = singletonDomains.get(name);
    if (singleton) return !singleton.isEmpty(singleton.load());
    return keyedDomains.has(name);
  }));
  // a domain whose first full upload never finished may hold records the account doesn't have, dirty-marked or not
  for (const domain of keyedDomains.values()) {
    if (!isBackfilled(domain.name) && Object.keys(domain.load() as object).length > 0) names.add(domain.name);
  }
  return [...names];
}

/** Pushes every domain with unflushed local edits. Call on reconnect / app foreground. */
export async function flushOutbox(): Promise<void> {
  if (!isSupabaseConfigured) return;
  for (const name of outboxSet()) {
    const singleton = singletonDomains.get(name);
    if (singleton) { await pushSingleton(singleton); continue; }
    const keyed = keyedDomains.get(name);
    if (keyed) await pushKeyed(keyed);
  }
  // A first upload that only half worked (some records refused) left the domain not backfilled, and the records that
  // failed were never marked dirty, so nothing else would retry them: send everything again, until it all goes up.
  for (const domain of keyedDomains.values()) {
    if (!isBackfilled(domain.name) && Object.keys(domain.load() as object).length > 0) {
      if (await pushAllKeyed(domain)) setBackfilled(domain.name);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Keyed domains (everything else): stable per-record keys (a client-generated id, or a natural
// (user_id, day) key). A record present locally but missing remotely is always pushed, never dropped.
// Deletes are represented by the domain itself keeping a tombstoned record (never removing the key
// outright) so an offline device's stale "still exists" push can't resurrect something deleted
// elsewhere — this file only pushes/pulls whatever the domain's load()/save() hand it.
// ---------------------------------------------------------------------------------------------------

export interface KeyedDomain<T> {
  name: string;
  table: string;
  /** Every local record, keyed by id or day. */
  load: () => Record<string, T>;
  /** Writes the full local record set back (used after a pull merges in remote-only records). */
  save: (records: Record<string, T>) => void;
  /** One local record -> the row to upsert (must include user_id). */
  toRemote: (key: string, value: T, userId: string) => Record<string, unknown>;
  /** A row from the server -> its key and the local shape `save` expects. */
  fromRemote: (row: Record<string, unknown>) => { key: string; value: T };
  /** True for a domain nothing on screen reads (the vitals history): records still come down, but their arrival is
   * never announced as "Updated from your account", because there is nothing to refresh. */
  quiet?: boolean;
}

const keyedDomains = new Map<string, KeyedDomain<unknown>>();

export function registerKeyed<T>(domain: KeyedDomain<T>) {
  keyedDomains.set(domain.name, domain as KeyedDomain<unknown>);
}

/** Looks up a registered keyed domain by name — used by tests to exercise a domain's own
 * toRemote/fromRemote mapping without duplicating it. */
export function registeredKeyed(name: string): KeyedDomain<unknown> | undefined {
  return keyedDomains.get(name);
}

/** Pushes only the records noted dirty since the last successful push — cheap, safe to call often. */
export async function pushKeyed<T>(domain: KeyedDomain<T>): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const records = domain.load() as Record<string, T>;
  const keys = dirtyKeysSet(domain.name);
  for (const key of [...keys]) {
    const value = records[key];
    if (value === undefined) continue; // removed without a tombstone: nothing to push
    const row = domain.toRemote(key, value, uid);
    const { error } = await supabase.from(domain.table).upsert(row);
    if (!error) keys.delete(key);
  }
  saveDirtyKeysSet(domain.name, keys);
  if (keys.size === 0) clearDirty(domain.name);
}

/** Pushes every local record regardless of dirty state — only for the one-time backfill on first sync,
 * so a phone-only user's existing data is never lost even though it predates this file's bookkeeping.
 * Returns false if any upsert failed, so the caller knows not to mark this domain backfilled yet. */
async function pushAllKeyed<T>(domain: KeyedDomain<T>): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const records = domain.load() as Record<string, T>;
  let ok = true;
  for (const [key, value] of Object.entries(records)) {
    const { error } = await supabase.from(domain.table).upsert(domain.toRemote(key, value, uid));
    if (error) ok = false;
  }
  return ok;
}

/** Pulls every remote row and merges remote-only or remote-newer records into local storage. A record
 * whose key is still pending push (edited locally, not yet flushed) is left alone — local wins.
 * `onChanged` is told when the merge really changed what this phone holds (never for a `quiet` domain). */
export async function pullKeyed<T>(domain: KeyedDomain<T>, onChanged?: ChangeReporter): Promise<'no-session' | 'empty' | 'applied'> {
  const uid = await currentUserId();
  if (!uid) return 'no-session';
  const { data, error } = await supabase.from(domain.table).select('*').eq('user_id', uid);
  if (error || !data || data.length === 0) return 'empty';
  const local = domain.load() as Record<string, T>;
  // What this phone holds right now, before the account's records go in (a domain may hand out its own live object).
  // Compared again right after the write, in the same breath, so what the app wrote itself while this pull was waiting
  // on the network is part of "before", never of the change. Skipped when nobody is listening or the domain is quiet.
  const watching = onChanged !== undefined && !domain.quiet;
  const before = watching ? fingerprint(local) : '';
  const dirty = dirtyKeysSet(domain.name);
  let wrote = false;
  for (const row of data) {
    const { key, value } = domain.fromRemote(row);
    if (dirty.has(key)) continue;
    local[key] = value;
    wrote = true;
  }
  if (wrote) {
    domain.save(local);
    if (watching && fingerprint(domain.load()) !== before) onChanged?.(domain.name);
  }
  return 'applied';
}

// ---------------------------------------------------------------------------------------------------
// Logout: wipe every domain's local data so a second account signing into the same device never sees
// the first account's data. Ships as its own step, independent of how many domains are synced so far —
// this closes the leak for every domain, not just the ones already wired above.
// ---------------------------------------------------------------------------------------------------

/** Every account-scoped localStorage key across every domain, whether or not it syncs yet. Intentionally
 * excludes device/session-level keys that must survive logout: kinetix_onboarded_email (so the same
 * account skips onboarding on the next login), kinetix_logged_in / kx_ob_step (cleared by the caller
 * already), kx_intro_seen (sessionStorage), kx_system_dark (native theme reading, not user data). */
const ACCOUNT_DATA_KEYS = [
  'kinetix_profile',
  'kinetix_checkins',
  'kinetix_detected_workouts',
  'kx_workouts',
  'kx_workouts_asked',
  'kx_food_days',
  'kx_food_log',
  'kx_foods',
  'kinetix_today_intake',
  'kx_gut_checks',
  'kx_gut_reminder',
  'kx_periods',
  'kinetix_water_log',
  'kinetix_water_goal',
  'kinetix_water_goal_ml',
  'kinetix_glass_ml',
  'kinetix_hydration_enabled',
  'kinetix_hydration_interval',
  'kinetix_hydration_snooze',
  'kinetix_charity_donations',
  'kinetix_last_voucher_month',
  'kinetix_voucher_points',
  'kinetix_level',
  'kinetix_xp',
  'kinetix_quests_claimed',
  'kx_points_given',
  'kx_streak_best',
  'kx_streak_reminder',
  'kinetix_move_enabled',
  'kinetix_move_minutes',
  'kinetix_move_prompt',
  'kinetix_nutrition_alerts_fired',
  'kinetix_stress_history',
  'kinetix_shift_start',
  'kinetix_shift_end',
  'kx_meals_hidden',
  'kx_widget_prefs',
  'kx_plus_known',
  'kx_ai_ideas_consent',
  'kx_notif_water',
  'kx_more_health_asked',
  'kx_no_stress_notice_seen',
  'kx_notifications_skipped',
  'kx_theme',
  'kx_sounds',
  'kx_vitals_history',
  'kx_detected_workouts_history',
  'kx_food_log_deleted',
  'kx_workouts_deleted',
  'kx_periods_deleted',
  'kx_water_deleted',
];

/** Every domain this sync engine knows about (registered singletons plus every keyed domain that will
 * be wired in later phases) — used only to clear their sync bookkeeping, so a fresh phase's mtime key
 * is covered by this list from day one rather than needing another edit here later. */
const ALL_DOMAIN_NAMES = [
  'profiles', 'preferences', 'saved_foods', 'food_log_entries', 'water_logs', 'workouts',
  'gut_checks', 'morning_checkins', 'periods', 'vitals_history',
];

export function clearAllDomainData() {
  for (const key of ACCOUNT_DATA_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
  }
  for (const name of ALL_DOMAIN_NAMES) {
    try { localStorage.removeItem(mtimeKey(name)); } catch { /* storage blocked */ }
    try { localStorage.removeItem(dirtyKeysStorageKey(name)); } catch { /* storage blocked */ }
    try { localStorage.removeItem(backfilledStorageKey(name)); } catch { /* storage blocked */ }
  }
  try { localStorage.removeItem(OUTBOX_KEY); } catch { /* storage blocked */ }
}
