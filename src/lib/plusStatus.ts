// The account's Plus plan as the server reads it from RevenueCat (api/plus-status.js). The phone's RevenueCat SDK can be
// missing (an iPhone build without its key), stale (Android's cached customer info after a promo code) or absent (the
// website), so the server's answer is what the app trusts for "is this person Plus".
import { serverUrl } from './server';
import { bearerHeader } from './sessionToken';

export type PlusStatus = { plus: boolean; lifetime: boolean; expiresAt: string | null; willRenew: boolean };

/** Asks the server. Null when it can't say (signed out, offline, an older server, RevenueCat down): the caller keeps
 * whatever it already knew, and never reads a failed answer as "Free". Never throws. */
export async function fetchPlusStatus(): Promise<PlusStatus | null> {
  try {
    const auth = await bearerHeader();
    if (!auth.Authorization) return null;
    const response = await fetch(serverUrl('/api/plus-status'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: '{}',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<PlusStatus>;
    if (typeof data.plus !== 'boolean') return null;
    return {
      plus: data.plus,
      lifetime: data.lifetime === true,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
      willRenew: data.willRenew === true,
    };
  } catch {
    return null;
  }
}

/** The plan line on Account: "Free plan", "Kinetix Fit Plus · lifetime", "… · renews 1 Nov 2026" or "… · ends 1 Nov 2026". */
export function planLabel(status: PlusStatus, formatDate: (date: Date) => string): string {
  if (!status.plus) return 'Free plan';
  if (status.lifetime || !status.expiresAt) return 'Kinetix Fit Plus · lifetime';
  return `Kinetix Fit Plus · ${status.willRenew ? 'renews' : 'ends'} ${formatDate(new Date(status.expiresAt))}`;
}
