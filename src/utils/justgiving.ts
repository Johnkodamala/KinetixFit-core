// JustGiving Simple Donation Integration (SDI) — link-based, no API key required.
//
// UNVERIFIED: JustGiving's SDI link format is generated through an interactive tool on their own
// developer site rather than published as a stable, documented URL/query-parameter spec. The
// pattern below reflects their standard donation URL structure, but has not been confirmed
// against a live generated link. Before relying on this in production: use JustGiving's own
// "Generate your link" tool (developer.justgiving.com) for the real charity/fundraising page and
// compare the result against what this function produces — fix any parameter mismatch found.

// TODO: fill in once a charity/cause has been chosen.
export const JUSTGIVING_CHARITY_ID = '';

export interface JustGivingDonationParams {
  /** JustGiving charity ID. Use this OR fundraisingPageShortName, not both. */
  charityId?: string;
  /** JustGiving fundraising page short name (the part after /fundraising/ in its URL). */
  fundraisingPageShortName?: string;
  /** Suggested/preset donation amount in GBP. */
  amount: number;
  /** Optional reference for reconciling this donation against internal records. */
  donationId?: string;
  /** URL JustGiving redirects back to once the donation flow completes. */
  exitUrl: string;
}

export function buildJustGivingDonationUrl(params: JustGivingDonationParams): string {
  const { charityId, fundraisingPageShortName, amount, donationId, exitUrl } = params;

  if (!charityId && !fundraisingPageShortName) {
    throw new Error('buildJustGivingDonationUrl requires either charityId or fundraisingPageShortName.');
  }

  const base = fundraisingPageShortName
    ? `https://www.justgiving.com/fundraising/${encodeURIComponent(fundraisingPageShortName)}/donate`
    : `https://www.justgiving.com/donation/direct/charity/${encodeURIComponent(charityId as string)}`;

  const query = new URLSearchParams();
  query.set('amount', amount.toFixed(2));
  if (donationId) query.set('reference', donationId);
  query.set('exitUrl', exitUrl);

  return `${base}?${query.toString()}`;
}
