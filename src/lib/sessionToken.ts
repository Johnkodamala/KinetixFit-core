import { supabase, isSupabaseConfigured } from './supabase';

/** `Authorization: Bearer <session token>` for a server call that must know whose account it is (the server checks the
 * token, not anything in the body). Empty when signed out or Supabase isn't set up, so the server answers 401. */
export async function bearerHeader(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
