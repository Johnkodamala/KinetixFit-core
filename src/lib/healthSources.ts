// Health Connect stores the package name of the app that wrote each record (sample.sourceId); HealthKit stores
// the writer's bundle ID. These are the common writers, so the app can say "Samsung Health" instead of
// "Health Connect". (iPhone / Apple Watch data is "com.apple.health.<id>" — unlisted, so it shows as Apple Health.)
const KNOWN_SOURCES: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.garmin.connect.mobile': 'Garmin Connect', // iOS
  'com.ouraring.oura': 'Oura',
  'com.whoop.android': 'WHOOP',
  'com.withings.wiscale2': 'Withings',
  'fi.polar.polarflow': 'Polar Flow',
  'com.huawei.health': 'Huawei Health',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.strava': 'Strava'
};

/** The most common known writer among the samples, or null if none is recognised. */
export function primarySourceLabel(samples: { sourceId?: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const s of samples) {
    const label = s.sourceId ? KNOWN_SOURCES[s.sourceId] : undefined;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [label, n] of counts) if (n > bestCount) { best = label; bestCount = n; }
  return best;
}

/** Samsung phones ship Samsung Health, which only shares with Health Connect once the user allows it. */
export function isSamsungDevice(): boolean {
  return /\bSM-[A-Z0-9]+|samsung/i.test(navigator.userAgent);
}
