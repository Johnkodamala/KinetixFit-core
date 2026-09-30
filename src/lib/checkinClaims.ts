// Tells the server which days have a check-in, so it can give each day's points once and record them in points_ledger
// (api/claim-checkins.js). The server ignores a day it has already paid, so this can be sent again whenever: after a
// check-in, and again each time the app comes back to the screen, which also covers one made while offline.
import { serverUrl } from './server';
import { bearerHeader } from './sessionToken';
import { localDayKeyDaysAgo } from './dates';

/** The check-in days worth sending: today and yesterday, the ones the server will still accept. */
export const claimableCheckInDays = (checkIns: Record<string, unknown>, today?: Date): string[] => {
  const oldest = localDayKeyDaysAgo(1, today);
  return Object.keys(checkIns).filter(day => day >= oldest).sort();
};

/** Sends the days. Never throws and never blocks the app: a failure (offline, signed out, an older server) just means
 * the days are sent again next time. Returns whether the server took them. */
export async function claimCheckIns(days: string[]): Promise<boolean> {
  if (days.length === 0) return true;
  try {
    const auth = await bearerHeader();
    if (!auth.Authorization) return false;
    const response = await fetch(serverUrl('/api/claim-checkins'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ days: days.slice(-7) }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
