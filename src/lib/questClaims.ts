// Which quests the server already has as claimed today. quest_claims is written only by api/complete-quest.js
// (service role) and is owner-readable under RLS, so the phone can read its own rows to learn about claims made
// elsewhere — another phone, or before this device's data was wiped by a logout.
import { supabase, isSupabaseConfigured } from './supabase';

/** The day the server files a claim under: api/complete-quest.js uses the UTC date for both its dedup and
 * the quest_claims row, so this must too — the phone's local day can differ for hours either side of midnight. */
export const serverDayKey = (date: Date = new Date()): string => date.toISOString().slice(0, 10);

/** Quest ids the server has recorded as claimed today. [] when signed out, offline, or on any error — a
 * failed lookup must never block sign-in or hide a claim the phone already knows about. */
export async function fetchTodaysClaimedQuestIds(day: string = serverDayKey()): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase.from('quest_claims').select('quest_id').eq('day', day);
    if (error || !data) return [];
    return data.map(row => String(row.quest_id));
  } catch {
    return [];
  }
}

/** Union, keeping what the phone already had first and never listing an id twice. */
export const mergeClaimedQuestIds = (current: string[], remote: string[]): string[] => [...new Set([...current, ...remote])];
