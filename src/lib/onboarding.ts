// Onboarding progress, kept on the phone:
// - which account finished onboarding here (kept through log out, so logging back in to it opens Today instead of
//   walking through onboarding again — kinetix_logged_in is cleared on log out), and
// - which step an account reached, so if Android closes the app mid-onboarding (e.g. behind the Health Connect
//   screen) it carries on from that step instead of starting again.

export const ONBOARDED_EMAIL_KEY = 'kinetix_onboarded_email';
const PROGRESS_KEY = 'kx_ob_step';
/** Onboarding steps after signing in: 3 Health, 4 Notifications, 5 About you, 6 Your food. */
const FIRST_STEP = 3;
const LAST_STEP = 6;

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked: progress just isn't remembered */ }
};

/** Whether this account already finished onboarding on this phone. */
export function hasOnboarded(email: string | null | undefined): boolean {
  if (!email) return false;
  return read(ONBOARDED_EMAIL_KEY) === normaliseEmail(email);
}

/**
 * Someone who finished onboarding before the marker existed is still logged in (kinetix_logged_in is only set when
 * onboarding finishes): mark their account once, at start-up. (Going by a saved profile instead — "has a country" —
 * wrongly counted people halfway through About you, where the country is filled in, as finished.)
 */
export function markLoggedInAccount() {
  if (read('kinetix_logged_in') !== 'true' || read(ONBOARDED_EMAIL_KEY)) return;
  try {
    const email = JSON.parse(read('kinetix_profile') || 'null')?.email;
    if (typeof email === 'string' && email.trim()) write(ONBOARDED_EMAIL_KEY, normaliseEmail(email));
  } catch { /* no usable profile: nothing to mark */ }
}

export function markOnboarded(email: string) {
  write(ONBOARDED_EMAIL_KEY, normaliseEmail(email));
  write(PROGRESS_KEY, null);
}

/**
 * Whether a synced profile shows the account already finished onboarding, on this phone or another. The marker above
 * only lives on the phone that finished, so a second phone signing in to the same account used to walk through About
 * you and Your food again. Finish is disabled until "what do you eat" is answered, and that answer syncs with the
 * profile, so a name plus a diet means the whole of onboarding was completed somewhere.
 */
export function profileShowsOnboarded(profile: { name?: unknown; diet?: unknown } | null | undefined): boolean {
  return !!profile && typeof profile.name === 'string' && profile.name.trim() !== '' && !!profile.diet;
}

/** The step this account had reached, or null (none saved, another account's, or out of range). */
export function savedOnboardingStep(email: string | null | undefined): number | null {
  if (!email) return null;
  try {
    const saved = JSON.parse(read(PROGRESS_KEY) || 'null');
    if (saved?.email === normaliseEmail(email) && Number.isInteger(saved.step) && saved.step >= FIRST_STEP && saved.step <= LAST_STEP) {
      return saved.step;
    }
  } catch { /* malformed: start from the first step */ }
  return null;
}

export function saveOnboardingStep(email: string, step: number) {
  if (step < FIRST_STEP || step > LAST_STEP) return;
  write(PROGRESS_KEY, JSON.stringify({ email: normaliseEmail(email), step }));
}

export const clearOnboardingStep = () => write(PROGRESS_KEY, null);
