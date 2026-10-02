// The website's links and the reward numbers it quotes, in one place. The numbers must match the app
// (src/lib/points.ts) and the server (api/_lib/rewardConfig.js); rewards.test.ts checks that all three agree, and
// page.test.ts that the page's own copy says the same.

export const SITE_URL = 'https://www.kinetixfit.co.uk/';
/** The web app (the same app as on the phones), moved here when the website got its own home page. */
export const APP_PATH = '/app/';
export const CONTACT_EMAIL = 'info@kinetixfit.co.uk';
export const EARLY_ACCESS_ENDPOINT = '/api/early-access';
/** Set by the app when someone logs in on this browser (App.tsx): the site then offers "Open the app". */
export const LOGGED_IN_KEY = 'kinetix_logged_in';

export const REWARDS = {
  /** a coffee voucher (Plus, one a month): VOUCHER_POINTS / voucherPointsCost */
  voucherPoints: 1000,
  voucherValueGBP: 2.5,
  /** a charity donation (free): donationPointsCost / donationValueGBP */
  donationPoints: 1000,
  donationValueGBP: 2.5,
  checkIn: 5,
  firstScan: 2,
  streakWeek: 10,
  levelUp: 10,
  /** everyday quests are worth 5–8 points each, at most 3 a day (src/lib/quests.ts) */
  questMin: 5,
  questMax: 8,
  /** about what a month of doing every daily goal earns (MONTHLY_POINTS_GUIDE) */
  perfectMonth: 1000,
} as const;

export type SocialNetwork = 'instagram' | 'tiktok' | 'x' | 'linkedin' | 'facebook' | 'youtube' | 'threads';

export interface SocialProfile {
  network: SocialNetwork;
  /** the full https:// address of Kinetix Fit's own account */
  url: string;
}

/**
 * Where to follow Kinetix Fit. Empty on purpose until the accounts exist: `instagram.com/kinetixfit` belongs to someone
 * else, so no handle is guessed. Add `{ network: 'instagram', url: 'https://www.instagram.com/…' }` and the footer's
 * "Follow us" column appears with it.
 */
export const SOCIAL_PROFILES: SocialProfile[] = [];

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  youtube: 'YouTube',
  threads: 'Threads',
};
