import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRecoveryLink, linkErrorText } from './auth';
import { fetchWithTimeout } from './fetchWithTimeout';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase URL/anon key not set — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env. Sign-up/login will not work until configured.');
}

// Read before the client starts: it signs in from a link in the address and then clears it. A password-reset link
// (type=recovery) must show "Choose a new password", not open the app; a failed link says why (src/lib/auth.ts).
const inBrowser = typeof window !== 'undefined';
export const openedFromRecoveryLink = inBrowser && isRecoveryLink(window.location.hash, window.location.search);
export const openedLinkError = inBrowser ? linkErrorText(window.location.hash, window.location.search) : null;

// Placeholder values let the client construct without throwing when unset; every real call site
// checks isSupabaseConfigured first and shows an honest message instead of silently failing.
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  // no request may hang for minutes (see fetchWithTimeout.ts)
  { global: { fetch: fetchWithTimeout() } },
);
