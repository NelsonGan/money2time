/**
 * Digits with at most one decimal point and two decimals; a comma reads as a
 * point. When a pasted amount has both (1,234.56 or 1.234,56), the last one is
 * the decimal point and the others group thousands.
 */
export function sanitizeAmountInput(raw: string): string {
  let text = raw;
  if (text.includes('.') && text.includes(',')) {
    const decimalAt = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
    text = `${text.slice(0, decimalAt).replace(/[.,]/g, '')}.${text.slice(decimalAt + 1)}`;
  }
  const normalized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
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

/**
 * The hourly rate the examples use when the user has not set their own: a
 * modest, round hourly pay in their currency. 15 reads right for RM, $, € or £
 * but would price a coffee at ¥4.50 or ₫4.50, so currencies worth much less
 * per unit get their own.
 */
const EXAMPLE_HOURLY_RATES: Record<string, number> = {
  AED: 30,
  BDT: 200,
  BRL: 30,
  CHF: 25,
  CNY: 30,
  DKK: 150,
  HKD: 80,
  IDR: 50000,
  INR: 200,
  JPY: 1500,
  KRW: 15000,
  MOP: 80,
  MXN: 100,
  NOK: 200,
  PHP: 100,
  PKR: 500,
  PLN: 40,
  RUB: 400,
  SEK: 150,
  THB: 100,
  TRY: 200,
  TWD: 250,
  UAH: 150,
  VND: 50000,
  ZAR: 50,
};

export function exampleHourlyRate(currencyCode: string | null | undefined): number {
  return EXAMPLE_HOURLY_RATES[(currencyCode ?? '').toUpperCase()] ?? 15;
}
