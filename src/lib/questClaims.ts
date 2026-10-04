// Which quests the server already has as claimed today. quest_claims is written only by api/complete-quest.js
// (service role) and is owner-readable under RLS, so the phone can read its own rows to learn about claims made
// elsewhere — another phone, or before this device's data was wiped by a logout.
import { supabase, isSupabaseConfigured } from './supabase';
import { localDayKey } from './dates';

/** The day a claim is filed under: the phone's own date. The phone sends its time zone with every claim and
 * api/complete-quest.js files it under that date (requestDay in api/_lib/countries.js). It used to be the UTC date, which
 * in India (UTC+5:30) is the previous day until 05:30: last evening's claims then marked the new day's quests as
 * claimed, and a quest done at 01:00 answered "already claimed" with no points. */
export const claimDayKey = (date: Date = new Date()): string => localDayKey(date);

/** Quest ids the server has recorded as claimed today. [] when signed out, offline, or on any error — a
 * failed lookup must never block sign-in or hide a claim the phone already knows about. */
export async function fetchTodaysClaimedQuestIds(day: string = claimDayKey()): Promise<string[]> {
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
