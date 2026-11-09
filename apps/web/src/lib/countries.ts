import type { Locale } from "@/i18n/routing";

/**
 * Every country the site can price things in, by ISO 3166-1 alpha-2 code.
 *
 * This is deliberately separate from the markets in `money.ts`. Those carry a
 * basket of illustrative prices for the marketing page; a country here only
 * needs to say what money it uses, because everything shown against it comes
 * from a published source.
 */
export type CountryCode =
  | "AU"
  | "BR"
  | "CA"
  | "CN"
  | "DE"
  | "DK"
  | "ES"
  | "FR"
  | "GB"
  | "ID"
  | "IN"
  | "IT"
  | "JP"
  | "KR"
  | "MY"
  | "NL"
  | "NO"
  | "NZ"
  | "PH"
  | "PL"
  | "RU"
  | "SE"
  | "SG"
  | "TH"
  | "TR"
  | "UA"
  | "US"
  | "VN"
  | "ZA";

export type Country = {
  code: CountryCode;
  /** ISO 4217. The symbol comes from the reader's locale, not from here. */
  currency: string;
  /** 0 where the currency has no minor unit in everyday use. */
  decimals: 0 | 2;
};

const CURRENCIES: Record<CountryCode, [string, 0 | 2]> = {
  AU: ["AUD", 2],
  BR: ["BRL", 2],
  CA: ["CAD", 2],
  CN: ["CNY", 2],
  DE: ["EUR", 2],
  DK: ["DKK", 2],
  ES: ["EUR", 2],
  FR: ["EUR", 2],
  GB: ["GBP", 2],
  ID: ["IDR", 0],
  IN: ["INR", 0],
  IT: ["EUR", 2],
  JP: ["JPY", 0],
  KR: ["KRW", 0],
  MY: ["MYR", 2],
  NL: ["EUR", 2],
  NO: ["NOK", 2],
  NZ: ["NZD", 2],
  PH: ["PHP", 0],
  PL: ["PLN", 2],
  RU: ["RUB", 2],
  SE: ["SEK", 2],
  SG: ["SGD", 2],
  TH: ["THB", 2],
  TR: ["TRY", 2],
  UA: ["UAH", 2],
  US: ["USD", 2],
  VN: ["VND", 0],
  ZA: ["ZAR", 0],
};

export const COUNTRIES: Record<CountryCode, Country> = Object.fromEntries(
  Object.entries(CURRENCIES).map(([code, [currency, decimals]]) => [
    code,
    { code: code as CountryCode, currency, decimals },
  ]),
) as Record<CountryCode, Country>;

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];

/**
 * The country each locale is written for. Every locale must name one, so that
 * nobody lands on a page comparing somewhere they do not live.
 */
export const COUNTRY_BY_LOCALE: Record<Locale, CountryCode> = {
  da: "DK",
  de: "DE",
  en: "US",
  "en-au": "AU",
  "en-ca": "CA",
  "en-gb": "GB",
  "en-in": "IN",
  "en-my": "MY",
  "en-nz": "NZ",
  "en-ph": "PH",
  "en-sg": "SG",
  "en-za": "ZA",
  es: "ES",
  fil: "PH",
  fr: "FR",
  hi: "IN",
  id: "ID",
  it: "IT",
  ja: "JP",
  ko: "KR",
  ms: "MY",
  nb: "NO",
  nl: "NL",
  pl: "PL",
  pt: "BR",
  ru: "RU",
  sv: "SE",
  th: "TH",
  tr: "TR",
  uk: "UA",
  vi: "VN",
  zh: "CN",
};

export function countryForLocale(locale: string): Country {
  return COUNTRIES[COUNTRY_BY_LOCALE[locale as Locale] ?? "US"];
}

/**
 * The flag emoji for a country code, built from its two letters as regional
 * indicator symbols. Saves keeping a table in step with the country list.
 */
export function flagFor(code: CountryCode) {
  return String.fromCodePoint(
    ...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}

/**
 * Country names come from the platform rather than the message catalogs:
 * `Intl.DisplayNames` already knows them in every locale the site ships, and
 * translating thirty-odd country names into thirty-odd languages by hand
 * would only introduce mistakes it does not make.
 */
export function countryNamer(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return (code: CountryCode) => names.of(code) ?? code;
}
