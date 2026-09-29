// Sign-up, log-in and the account emails (Supabase Auth): what to tell people when something goes wrong, and the quiet
// cases Supabase doesn't report as errors.
//
// - Signing up with an email that already has an account "succeeds" and sends nothing (on purpose, so nobody can find
//   out which emails have accounts). The user it returns has no identities: alreadyRegistered().
// - Logging in before confirming fails with `email_not_confirmed`: offer to send the link again (supabase.auth.resend).
//   Supabase allows one email per address every 60 s, hence RESEND_WAIT_S.
// - The confirmation link lands on the website's /email-confirmed page (public/email-confirmed.html: "go back to the
//   app and log in"); the reset link on the web app, which shows "Choose a new password" (type=recovery in the link).
//   Both addresses must be in Supabase → Authentication → URL Configuration → Redirect URLs, or Supabase sends people
//   to the Site URL instead.
// - Whether the email arrives at all depends on the project's email settings (Supabase's built-in sender only
//   delivers to the project's team, a few an hour): see CLAUDE.md → Sign-up emails.

export const SITE_URL = 'https://www.kinetixfit.co.uk';
export const EMAIL_CONFIRMED_URL = `${SITE_URL}/email-confirmed`;
export const PASSWORD_RESET_URL = `${SITE_URL}/`;
export const RESEND_WAIT_S = 60;

/** Sign-up "succeeded" for an email that already has an account: no identities, and no email was sent. */
export function alreadyRegistered(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/** The page was opened from a password-reset link (type=recovery), before the auth library reads and clears it. */
export function isRecoveryLink(hash: string, search = ''): boolean {
  return /(^|[#&?])type=recovery(&|$)/.test(hash) || /(^|[?&])type=recovery(&|$)/.test(search);
}

/** A link that failed (expired, or already used): what to say, else null. Supabase puts error_code in the hash. */
export function linkErrorText(hash: string, search = ''): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const code = params.get('error_code') ?? query.get('error_code');
  if (!code && !params.get('error') && !query.get('error')) return null;
  if (code === 'otp_expired') return 'That link has expired or was already used. Log in, or ask for a new one.';
  return 'That link didn’t work. Log in, or ask for a new one.';
}

export interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/** What to show for a Supabase auth error, and whether sending the confirmation email again would help. */
export function authErrorText(error: AuthErrorLike): { text: string; resend?: boolean } {
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return { text: 'Confirm your email first: tap the link we sent when you signed up. Can’t find it? Check your spam folder, or send it again.', resend: true };
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return { text: 'That email and password don’t match. Check them, or reset your password.' };
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429 || msg.includes('rate limit') || msg.includes('only request this after')) {
    return { text: 'Too many emails have been sent just now. Wait a few minutes, then try again.' };
  }
  if (code === 'email_address_not_authorized' || msg.includes('not authorized')) {
    return { text: 'We couldn’t send an email to this address just now. Please try again later.' };
  }
  if (code === 'email_address_invalid' || (code === 'validation_failed' && msg.includes('email')) || msg.includes('invalid format')) {
    return { text: 'That email address doesn’t look right.' };
  }
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) {
    return { text: 'That email already has an account. Log in instead.' };
  }
  if (code === 'same_password') return { text: 'That’s your current password. Choose a new one.' };
  if (code === 'session_not_found' || msg.includes('session missing')) {
    return { text: 'That reset link has expired. Go back to log in and use “Forgot password?” again.' };
  }
  if (code === 'weak_password') return { text: error.message || 'Choose a stronger password.' };
  if (code === 'signup_disabled') return { text: 'Sign-ups are paused right now. Please try again later.' };
  if (msg.includes('error sending')) return { text: 'We couldn’t send the email just now. Please try again in a few minutes.' };
  if (error.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network')) {
    return { text: 'Couldn’t reach the server. Check your connection and try again.' };
  }
  return { text: error.message || 'Something went wrong. Please try again.' };
}
