// Numbers the way the page writes them (UK English): 1,500 and £2.50, with whole pounds shown without pence.

const points = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function formatPoints(value: number): string {
  return points.format(Math.round(value));
}

export function formatGBP(value: number): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value);
}
