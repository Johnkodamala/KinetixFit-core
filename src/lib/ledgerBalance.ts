// The points and XP the server has recorded for this account (points_ledger, owner-readable under RLS), and how the phone
// folds them into its own totals. The phone keeps whichever is higher: a new phone (or one just signed in after a logout)
// takes the server's number, while points the server never saw (earned on this phone before it recorded them) are kept, and
// an award both know about is not counted twice. Nothing the phone holds is ever lowered by this.
import { supabase, isSupabaseConfigured } from './supabase';
import { levelForXp } from './points';

export interface Balance { points: number; xp: number }
export interface LocalBalance extends Balance { level: number }

// PostgREST returns at most this many rows a request. A ledger that long can't be summed from one page, so the balance reads
// as unknown (the phone keeps its own) rather than quietly coming out low. A SQL sum would lift it.
const PAGE_LIMIT = 1000;

/** The account's ledger totals, or null when signed out, offline, unreadable, or too long to sum from one page. */
export async function fetchServerBalance(): Promise<Balance | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from('points_ledger').select('points, xp');
    if (error || !data || data.length >= PAGE_LIMIT) return null;
    return {
      points: data.reduce((sum, row) => sum + (Number(row.points) || 0), 0),
      xp: data.reduce((sum, row) => sum + (Number(row.xp) || 0), 0),
    };
  } catch {
    return null;
  }
}

/** What the phone should hold once it has heard from the server: never less than it had, and a level that matches the XP. */
export function reconcileBalance(local: LocalBalance, server: Balance | null): LocalBalance {
  if (!server) return local;
  const xp = Math.max(local.xp, server.xp);
  return { points: Math.max(local.points, server.points), xp, level: Math.max(local.level, levelForXp(xp)) };
}

// The phone's own copy (the keys App.tsx keeps; sync.ts wipes them on logout).
const POINTS_KEY = 'kinetix_voucher_points';
const XP_KEY = 'kinetix_xp';
const LEVEL_KEY = 'kinetix_level';
const readInt = (key: string, fallback: number) => {
  const n = parseInt(localStorage.getItem(key) || '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const readLocalBalance = (): LocalBalance => ({ points: readInt(POINTS_KEY, 0), xp: readInt(XP_KEY, 0), level: readInt(LEVEL_KEY, 1) });

export function writeLocalBalance(balance: LocalBalance) {
  try {
    localStorage.setItem(POINTS_KEY, String(balance.points));
    localStorage.setItem(XP_KEY, String(balance.xp));
    localStorage.setItem(LEVEL_KEY, String(balance.level));
  } catch { /* storage full or blocked: the totals come back from the server next time */ }
}
