import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase URL/anon key not set — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env. Sign-up/login will not work until configured.');
}

// Placeholder values let the client construct without throwing when unset; every real call site
// checks isSupabaseConfigured first and shows an honest message instead of silently failing.
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
