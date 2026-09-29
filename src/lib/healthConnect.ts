// When Health Connect isn't on the phone. Kinetix Fit reads steps, sleep and heart rate on Android only through Health
// Connect — and so does everything that feeds it: Google Fit, Samsung Health, Fitbit, most watches. It's built into
// Android 14 and newer; on Android 9–13 it's a separate app from the Play Store, which many phones don't have (a tester
// with Google Fit couldn't connect, 28 Sep); before Android 9 it doesn't exist.
//
// The health plugin (@capgo/capacitor-health) answers isAvailable() with HealthConnectClient.getSdkStatus as a reason:
//   SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED → "Health Connect needs an update." — not installed, or too old: get it
//   SDK_UNAVAILABLE → "Health Connect is unavailable on this device." — Android < 9 (or a restricted profile)
// The app then shows HealthConnectSheet: a Play Store button, or why it can't work on this phone.

export type HealthConnectProblem = 'get' | 'unsupported';

/** Health Connect on the Play Store (the Play Store app opens it; otherwise the browser). */
export const HEALTH_CONNECT_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

/** The Android major version from the WebView's user agent ("Android 13; …"), or null. */
export function androidVersion(userAgent: string): number | null {
  const m = /Android (\d+)/.exec(userAgent);
  return m ? Number(m[1]) : null;
}

/** Why Health Connect can't be used here, or null when it can. */
export function healthConnectProblem(result: { available: boolean; reason?: string }, userAgent = ''): HealthConnectProblem | null {
  if (result.available) return null;
  const version = androidVersion(userAgent);
  if (version !== null && version < 9) return 'unsupported';
  if (/unavailable on this device/i.test(result.reason ?? '')) return 'unsupported';
  return 'get';
}
