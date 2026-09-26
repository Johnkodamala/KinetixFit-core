// Calendar-day keys ("2026-09-26") in the phone's own time zone.
// Never use toISOString().slice(0, 10) for a day: that's the UTC date, which outside UTC (BST, IST…)
// is a different day for part of every day. Health Connect / HealthKit day buckets start at local
// midnight, so a UTC key put each day's steps on the day before and left today's bar empty.
export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local day key `days` calendar days before `date` (DST-safe, unlike subtracting 86,400,000 ms) */
export function localDayKeyDaysAgo(days: number, date: Date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return localDayKey(d);
}
