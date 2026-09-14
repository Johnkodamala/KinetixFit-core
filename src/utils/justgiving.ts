// JustGiving donation link — points to the live KinetixFit fundraising page.
//
// CONFIRMED (live-tested against the real page): a JustGiving fundraising page's donation
// entry point is https://www.justgiving.com/page/{pageShortName}/give — NOT
// /fundraising/{shortName}/donate as originally assumed before a real page existed to check
// against. Verified by loading the live KinetixFit page and reading its own "Give Now" link.
//
// IMPORTANT — this is a link-only integration, and query-string prefill does NOT work on
// this flow. Appending ?amount=, ?reference=, or ?exitUrl= to the /give URL has no effect:
// that URL immediately redirects into an iframe at donate.justgiving.com/page/{slug}/donation-amount
// with the entire query string stripped (confirmed by live browser testing — none of those
// params reached the actual donation form). JustGiving's fundraising-page checkout is a
// self-contained multi-step flow with its own suggested amounts (currently £30/£50/£150/£200)
// and its own post-donation page; there is currently no way to pre-fill an amount, pass a
// reconciliation reference, or set a custom return URL through this link. Real reconciliation
// or prefill would require JustGiving's authenticated Donation API/webhooks, which this does
// not implement — donations must be reconciled manually via JustGiving's own reporting for now.
//
// This page also fundraises FOR British Heart Foundation (KinetixFit JN Global Ventures LTD
// is the organizer, not the receiving charity) — worth knowing when writing any copy near this link.

export const JUSTGIVING_FUNDRAISING_PAGE_SLUG = 'kinetixfit-jn-global-ventures-ltd-1';

export interface JustGivingDonationParams {
  /** JustGiving charity ID for a direct charity donation link. UNVERIFIED — not tested against a live link; prefer fundraisingPageShortName for the real KinetixFit page. */
  charityId?: string;
  /** JustGiving fundraising page short name (the part after /page/ in its URL). Use this OR charityId, not both. */
  fundraisingPageShortName?: string;
}

export function buildJustGivingDonationUrl(params: JustGivingDonationParams): string {
  const { charityId, fundraisingPageShortName } = params;

  if (!charityId && !fundraisingPageShortName) {
    throw new Error('buildJustGivingDonationUrl requires either charityId or fundraisingPageShortName.');
  }

  if (fundraisingPageShortName) {
    return `https://www.justgiving.com/page/${encodeURIComponent(fundraisingPageShortName)}/give`;
  }

  // UNVERIFIED — this path has not been checked against a real charity ID or live link.
  return `https://www.justgiving.com/donation/direct/charity/${encodeURIComponent(charityId as string)}`;
}
