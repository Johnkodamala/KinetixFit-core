// Service-role Supabase client: bypasses RLS entirely, so only server code — never the app — writes
// through it. Used for the server-authoritative tables (quest_claims, points_ledger, streaks) once a
// request's identity has already been verified independently (see supabaseAuth.js's verifiedUserId).
// SUPABASE_SERVICE_ROLE_KEY is a secret: set only in Vercel, never in a client-visible env var.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

export function supabaseAdmin() {
  if (!isSupabaseAdminConfigured) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}
