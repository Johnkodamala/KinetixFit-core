// KinetixFit Plus. Keep in step with api/_lib/plus.js and api/_lib/scanQuota.js — the server enforces
// these; the app only shows them.

/** Entitlement identifier in the RevenueCat dashboard (customers see "KinetixFit Plus"). */
export const PLUS_ENTITLEMENT = 'kinetixfit_pro';

/** Photo + barcode scans per day (the person's own midnight). Typed food checks are unlimited. */
export const FREE_DAILY_SCANS = 2;
export const PLUS_DAILY_SCANS = 10;

export const PLUS_BENEFITS = [
  `${PLUS_DAILY_SCANS} photo or barcode food scans a day (free: ${FREE_DAILY_SCANS})`,
  'Coffee vouchers for your reward points (up to one a month)',
  'AI meal ideas from your goal, BMI and today’s food and exercise',
  'Plus widgets: check in, log in one tap, your own stats',
  'Seven more app icons',
];

/**
 * The scans-left figure the server last reported, if it still describes this person's plan. It lives in memory only (a reply to
 * a scan), so after becoming Plus it still read "0 of 2 left", the free plan's count, under a Plus badge. When it belongs to the
 * other plan it is ignored and the plan's own limit shows until the next scan reports the real count.
 */
export function usableScanAllowance(allowance: { left: number; limit: number } | null, isPlus: boolean): { left: number; limit: number } | null {
  return allowance && allowance.limit === (isPlus ? PLUS_DAILY_SCANS : FREE_DAILY_SCANS) ? allowance : null;
}
