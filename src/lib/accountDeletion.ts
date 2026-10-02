// Deleting an account or its data (api/delete-account.js). Both Google Play and the App Store require this inside the app.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { serverUrl } from './server';
import { bearerHeader } from './sessionToken';
import { applyMoveReminders } from './moveReminders';

/** 'account' = everything and the account itself; 'data' = everything, but the account stays and can sign in again. */
export type DeleteMode = 'account' | 'data';

export type DeleteResult = { ok: true } | { ok: false; message: string };

/** Asks the server to delete. Nothing on the phone is touched here: the caller wipes the phone only after `ok`. */
export async function requestDeletion(mode: DeleteMode): Promise<DeleteResult> {
  try {
    const auth = await bearerHeader();
    if (!auth.Authorization) return { ok: false, message: 'Sign in again to delete your data.' };
    const response = await fetch(serverUrl('/api/delete-account'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ mode, confirm: true }),
    });
    if (response.ok) return { ok: true };
    if (response.status === 401) return { ok: false, message: 'Sign in again to delete your data.' };
    if (response.status === 404 || response.status === 405) return { ok: false, message: "Deleting isn't available yet. Please try again later." };
    const data = await response.json().catch(() => ({})) as { error?: string };
    return { ok: false, message: data.error || 'Something went wrong. Nothing was deleted, so please try again.' };
  } catch {
    return { ok: false, message: 'Could not reach the server. Nothing was deleted, so please try again.' };
  }
}

/** Cancels every reminder the app has scheduled (water, gut check, streak, movement breaks). Never throws. */
export async function clearDeviceReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.length > 0) await LocalNotifications.cancel({ notifications });
  } catch { /* nothing scheduled, or the plugin isn't there */ }
  try {
    await applyMoveReminders({ enabled: false, startHour: 8, endHour: 20, minutes: 60 });
  } catch { /* same */ }
}
