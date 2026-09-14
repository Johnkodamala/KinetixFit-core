import { Browser } from '@capacitor/browser';
import { buildJustGivingDonationUrl, JUSTGIVING_FUNDRAISING_PAGE_SLUG } from '../utils/justgiving';

interface DonateButtonProps {
  /** Shown on the button as a suggestion only — JustGiving's own page does not accept a
   * pre-filled amount through this link, so the admin still enters it there themselves. */
  suggestedAmount: number;
  /** Optional label override; defaults to "Donate £{suggestedAmount}". */
  label?: string;
}

export default function DonateButton({ suggestedAmount, label }: DonateButtonProps) {
  const handleDonate = async () => {
    const url = buildJustGivingDonationUrl({ fundraisingPageShortName: JUSTGIVING_FUNDRAISING_PAGE_SLUG });
    await Browser.open({ url });
  };

  return (
    <button
      onClick={handleDonate}
      disabled={!JUSTGIVING_FUNDRAISING_PAGE_SLUG}
      className="primary-btn"
      style={{ width: '100%', padding: '12px' }}
      title={!JUSTGIVING_FUNDRAISING_PAGE_SLUG ? 'Set JUSTGIVING_FUNDRAISING_PAGE_SLUG in src/utils/justgiving.ts before use' : 'Opens the JustGiving page — enter the amount there'}
    >
      {label || `🎗️ Donate £${suggestedAmount.toFixed(2)}`}
    </button>
  );
}
