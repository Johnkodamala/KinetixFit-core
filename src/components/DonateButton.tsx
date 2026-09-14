import { Browser } from '@capacitor/browser';
import { buildJustGivingDonationUrl, JUSTGIVING_CHARITY_ID } from '../utils/justgiving';

interface DonateButtonProps {
  /** Suggested donation amount in GBP shown on the button and pre-filled at JustGiving. */
  suggestedAmount: number;
  /** Optional reference for reconciling this donation against internal records. */
  donationId?: string;
  /** Optional label override; defaults to "Donate £{suggestedAmount}". */
  label?: string;
}

export default function DonateButton({ suggestedAmount, donationId, label }: DonateButtonProps) {
  const handleDonate = async () => {
    const url = buildJustGivingDonationUrl({
      charityId: JUSTGIVING_CHARITY_ID,
      amount: suggestedAmount,
      donationId,
      exitUrl: 'https://kinetixfit.co.uk/donate/complete'
    });

    await Browser.open({ url });
  };

  return (
    <button
      onClick={handleDonate}
      disabled={!JUSTGIVING_CHARITY_ID}
      className="primary-btn"
      style={{ width: '100%', padding: '12px' }}
      title={!JUSTGIVING_CHARITY_ID ? 'Set JUSTGIVING_CHARITY_ID in src/utils/justgiving.ts before use' : undefined}
    >
      {label || `🎗️ Donate £${suggestedAmount.toFixed(2)}`}
    </button>
  );
}
