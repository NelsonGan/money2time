/**
 * Digits with at most one decimal point and two decimals; a comma reads as a
 * point. When a pasted amount has both (1,234.56 or 1.234,56), the last one is
 * the decimal point and the others group thousands.
 */
export function sanitizeAmountInput(raw: string): string {
  let text = raw;
  const decimalAt = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  if (decimalAt > 0) {
    const mark = text[decimalAt];
    const head = text.slice(0, decimalAt);
    const tail = text.slice(decimalAt + 1);
    // Only a whole pasted number: digits after the last mark, and only the
    // other mark before it. A second mark typed after "12.5" is not one, and
    // is dropped below as before rather than moving the decimal point.
    if (/^\d+$/.test(tail) && !head.includes(mark) && /[.,]/.test(head)) {
      text = `${head.replace(/[.,]/g, '')}.${tail}`;
    }
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
 * but would price a coffee at ¥4.50 or ₫4.50, so every app currency worth well
 * under a tenth of a dollar per unit (roughly) gets its own. Rough on purpose:
 * it only has to look like a price there, and nothing is saved.
 */
const EXAMPLE_HOURLY_RATES: Record<string, number> = {
  AED: 30,
  AFN: 500,
  ALL: 500,
  AMD: 2000,
  AOA: 5000,
  ARS: 10000,
  BDT: 200,
  BIF: 20000,
  BRL: 30,
  BTN: 200,
  BWP: 50,
  CDF: 20000,
  CHF: 25,
  CLP: 5000,
  CNY: 30,
  COP: 20000,
  CRC: 3000,
  CVE: 500,
  CZK: 200,
  DJF: 1000,
  DKK: 150,
  DOP: 300,
  DZD: 500,
  EGP: 200,
  ERN: 50,
  ETB: 500,
  GHS: 50,
  GMD: 300,
  GNF: 50000,
  GYD: 1000,
  HKD: 80,
  HNL: 100,
  HTG: 500,
  HUF: 3000,
  IDR: 50000,
  INR: 200,
  IQD: 10000,
  IRR: 200000,
  ISK: 2000,
  JMD: 1000,
  JPY: 1500,
  KES: 500,
  KGS: 300,
  KHR: 20000,
  KMF: 2000,
  KPW: 5000,
  KRW: 15000,
  KZT: 2000,
  LAK: 100000,
  LBP: 500000,
  LKR: 1000,
  LRD: 1000,
  LSL: 50,
  MDL: 100,
  MGA: 20000,
  MKD: 300,
  MMK: 10000,
  MNT: 20000,
  MOP: 80,
  MRU: 200,
  MUR: 200,
  MVR: 50,
  MWK: 10000,
  MXN: 100,
  MZN: 300,
  NAD: 50,
  NGN: 5000,
  NIO: 100,
  NOK: 200,
  NPR: 300,
  PHP: 100,
  PKR: 500,
  PLN: 40,
  PYG: 30000,
  RSD: 1000,
  RUB: 400,
  RWF: 5000,
  SCR: 50,
  SDG: 3000,
  SEK: 150,
  SLE: 100,
  SOS: 3000,
  SRD: 150,
  SSP: 5000,
  STN: 100,
  SYP: 50000,
  SZL: 50,
  THB: 100,
  TJS: 50,
  TRY: 200,
  TWD: 250,
  TZS: 10000,
  UAH: 150,
  UGX: 20000,
  UYU: 300,
  UZS: 50000,
  VES: 300,
  VND: 50000,
  VUV: 1000,
  XAF: 3000,
  XOF: 3000,
  XPF: 1000,
  YER: 1000,
  ZAR: 50,
  ZMW: 100,
};

export function exampleHourlyRate(currencyCode: string | null | undefined): number {
  return EXAMPLE_HOURLY_RATES[(currencyCode ?? '').toUpperCase()] ?? 15;
}
