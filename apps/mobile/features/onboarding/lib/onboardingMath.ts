/** Digits with at most one decimal point and two decimals; commas read as a point. */
export function sanitizeAmountInput(raw: string): string {
  const normalized = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const [integer, ...rest] = normalized.split('.');
  if (rest.length === 0) return integer;
  return `${integer}.${rest.join('').slice(0, 2)}`;
}

/**
 * A price that looks like one: halves under 10, whole units under 100, fives
 * under 1,000, then two significant digits. Never zero.
 */
export function roundSampleAmount(amount: number): number {
  if (amount < 10) return Math.max(0.5, Math.round(amount * 2) / 2);
  if (amount < 100) return Math.round(amount);
  if (amount < 1000) return Math.round(amount / 5) * 5;
  const step = 10 ** (Math.floor(Math.log10(amount)) - 1);
  return Math.round(amount / step) * step;
}

/**
 * The try-it samples are priced from the user's own hourly value, so they look
 * right in any currency: a coffee is about a quarter of an hour's pay.
 */
export function sampleAmountForHours(hours: number, hourlyRate: number): number {
  return roundSampleAmount(hours * hourlyRate);
}
