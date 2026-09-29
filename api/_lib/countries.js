// Server-side country rules, mirroring src/lib/countries.ts: which countries have live rewards and which charities
// belong to each. Only the UK has donations and vouchers today; every other supported country shows them as
// "coming soon", and the server refuses them so an old or modified app can't bypass that. Requests that send no
// country come from app builds that predate countries, which were UK-only.

export const COUNTRY_REWARDS = {
  GB: { name: 'United Kingdom', donationsLive: true, vouchersLive: true, charities: ['CHAR-NHS', 'CHAR-BHF', 'CHAR-TRUSSELL'] },
  US: { name: 'United States', donationsLive: false, vouchersLive: false, charities: ['US-AHA', 'US-FEEDING', 'US-STJUDE'] },
  CA: { name: 'Canada', donationsLive: false, vouchersLive: false, charities: ['CA-HEARTSTROKE', 'CA-FOODBANKS', 'CA-CANCER'] },
  AU: { name: 'Australia', donationsLive: false, vouchersLive: false, charities: ['AU-HEART', 'AU-FOODBANK', 'AU-CANCER'] },
  NZ: { name: 'New Zealand', donationsLive: false, vouchersLive: false, charities: ['NZ-HEART', 'NZ-CANCER', 'NZ-KIWIHARVEST'] },
  IE: { name: 'Ireland', donationsLive: false, vouchersLive: false, charities: ['IE-HEART', 'IE-CANCER', 'IE-FOODCLOUD'] },
  IN: { name: 'India', donationsLive: false, vouchersLive: false, charities: ['IN-AKSHAYAPATRA', 'IN-CRY', 'IN-HELPAGE'] },
  SG: { name: 'Singapore', donationsLive: false, vouchersLive: false, charities: ['SG-COMCHEST', 'SG-FOODHEART', 'SG-HEART'] },
  AE: { name: 'United Arab Emirates', donationsLive: false, vouchersLive: false, charities: ['AE-REDCRESCENT', 'AE-FOODBANK', 'AE-ALJALILA'] },
};

/** The request's country code, or null for one we don't support. No country at all means an older, UK-only build. */
export function requestCountry(code) {
  if (code === undefined || code === null || code === '') return 'GB';
  return typeof code === 'string' && COUNTRY_REWARDS[code] ? code : null;
}

/** The phone's IANA time zone if it's a real one, else UK time (what older builds assumed). */
export function safeTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return 'Europe/London';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/London';
  }
}

/** YYYY-MM-DD in the person's own time zone, so daily limits reset at their midnight. */
export function dayKey(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: safeTimeZone(timeZone) }).format(date);
}
