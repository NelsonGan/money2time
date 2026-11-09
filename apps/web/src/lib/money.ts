import { useFormatter, useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/routing";

/**
 * A full-time month, at roughly 41 hours a week. Every "this costs you N
 * hours" figure on the page is derived from a price and this, so the demo
 * numbers stay consistent with the rate card in every market.
 */
export const WORK_HOURS_PER_MONTH = 178;

/** The things the ticker and the conversion cards price up. */
export type PriceKey =
  | "coffee"
  | "lunch"
  | "groceries"
  | "fuel"
  | "tshirt"
  | "beers"
  | "electricity"
  | "pizza"
  | "dogFood"
  | "cinema"
  | "gym"
  | "rent"
  | "flight"
  | "iceCream"
  | "impulse";

/** The markets the site prices in, by ISO 3166-1 alpha-2 country code. */
export type MarketCode =
  | "AU"
  | "BR"
  | "CA"
  | "GB"
  | "IN"
  | "MY"
  | "NZ"
  | "PH"
  | "SG"
  | "US"
  | "ZA";

export type Market = {
  code: MarketCode;
  /** ISO 4217 code. The symbol comes from the locale, so SGD reads "$" in
   *  Singapore and MYR reads "RM" in Malaysia, as people write them. */
  currency: string;
  /** 0 where the market does not price in minor units. */
  decimals: 0 | 2;
  /** Net pay a month, in local currency, for a middling full-time job. */
  takeHome: number;
  /** What each thing costs in that market. These are local price points, not
   *  conversions of the US ones — a coffee is not a coffee at the same rate. */
  prices: Record<PriceKey, number>;
  /** The multi-currency card needs a purchase made in someone else's money,
   *  so each market gets a trip it plausibly takes. `local` is roughly what
   *  it comes to back home. It must never be a currency the locales served by
   *  this market spend at home — the US market backs every language-only
   *  locale, so its choice has to be foreign to all of them. */
  foreign: { currency: string; amount: number; local: number };
};

const US: Market = {
  code: "US",
  currency: "USD",
  decimals: 2,
  takeHome: 4580,
  prices: {
    coffee: 4.5,
    lunch: 18,
    groceries: 62.4,
    fuel: 71.2,
    tshirt: 34,
    beers: 28.5,
    electricity: 162.15,
    pizza: 24,
    dogFood: 45,
    cinema: 16.5,
    gym: 65,
    rent: 1850,
    flight: 318,
    iceCream: 6.2,
    impulse: 349,
  },
  foreign: {
    currency: "AUD",
    amount: 400,
    local: 265,
  },
};

const GB: Market = {
  code: "GB",
  currency: "GBP",
  decimals: 2,
  takeHome: 2650,
  prices: {
    coffee: 3.6,
    lunch: 9.5,
    groceries: 58,
    fuel: 68,
    tshirt: 22,
    beers: 21,
    electricity: 98,
    pizza: 15.5,
    dogFood: 32,
    cinema: 12.5,
    gym: 42,
    rent: 1250,
    flight: 180,
    iceCream: 4.2,
    impulse: 199,
  },
  foreign: {
    currency: "EUR",
    amount: 250,
    local: 215,
  },
};

const AU: Market = {
  code: "AU",
  currency: "AUD",
  decimals: 2,
  takeHome: 5200,
  prices: {
    coffee: 5.5,
    lunch: 20,
    groceries: 95,
    fuel: 85,
    tshirt: 35,
    beers: 34,
    electricity: 165,
    pizza: 26,
    dogFood: 48,
    cinema: 22,
    gym: 72,
    rent: 2200,
    flight: 320,
    iceCream: 7,
    impulse: 389,
  },
  foreign: {
    currency: "THB",
    amount: 9500,
    local: 430,
  },
};

const CA: Market = {
  code: "CA",
  currency: "CAD",
  decimals: 2,
  takeHome: 4300,
  prices: {
    coffee: 5.25,
    lunch: 18.5,
    groceries: 88,
    fuel: 78,
    tshirt: 32,
    beers: 30,
    electricity: 130,
    pizza: 25,
    dogFood: 52,
    cinema: 15.5,
    gym: 60,
    rent: 2050,
    flight: 295,
    iceCream: 6.5,
    impulse: 329,
  },
  foreign: {
    currency: "USD",
    amount: 250,
    local: 345,
  },
};

const IN: Market = {
  code: "IN",
  currency: "INR",
  decimals: 0,
  takeHome: 65000,
  prices: {
    coffee: 150,
    lunch: 400,
    groceries: 3200,
    fuel: 2800,
    tshirt: 999,
    beers: 900,
    electricity: 2400,
    pizza: 650,
    dogFood: 1800,
    cinema: 400,
    gym: 2000,
    rent: 32000,
    flight: 6500,
    iceCream: 150,
    impulse: 4999,
  },
  foreign: {
    currency: "AED",
    amount: 900,
    local: 21000,
  },
};

const MY: Market = {
  code: "MY",
  currency: "MYR",
  decimals: 2,
  takeHome: 4200,
  prices: {
    coffee: 10,
    lunch: 15,
    groceries: 180,
    fuel: 90,
    tshirt: 59,
    beers: 60,
    electricity: 150,
    pizza: 45,
    dogFood: 120,
    cinema: 21,
    gym: 130,
    rent: 1800,
    flight: 320,
    iceCream: 9.5,
    impulse: 319,
  },
  foreign: {
    currency: "THB",
    amount: 9500,
    local: 1250,
  },
};

const NZ: Market = {
  code: "NZ",
  currency: "NZD",
  decimals: 2,
  takeHome: 4700,
  prices: {
    coffee: 5.5,
    lunch: 18,
    groceries: 105,
    fuel: 95,
    tshirt: 35,
    beers: 33,
    electricity: 180,
    pizza: 28,
    dogFood: 50,
    cinema: 20,
    gym: 60,
    rent: 2400,
    flight: 260,
    iceCream: 7.5,
    impulse: 349,
  },
  foreign: {
    currency: "AUD",
    amount: 400,
    local: 440,
  },
};

const PH: Market = {
  code: "PH",
  currency: "PHP",
  decimals: 0,
  takeHome: 35000,
  prices: {
    coffee: 100,
    lunch: 250,
    groceries: 2500,
    fuel: 2200,
    tshirt: 799,
    beers: 700,
    electricity: 3000,
    pizza: 550,
    dogFood: 1200,
    cinema: 400,
    gym: 1500,
    rent: 15000,
    flight: 4500,
    iceCream: 120,
    impulse: 2699,
  },
  foreign: {
    currency: "JPY",
    amount: 45000,
    local: 17000,
  },
};

const SG: Market = {
  code: "SG",
  currency: "SGD",
  decimals: 2,
  takeHome: 5000,
  prices: {
    coffee: 5.6,
    lunch: 7.5,
    groceries: 120,
    fuel: 110,
    tshirt: 39,
    beers: 45,
    electricity: 145,
    pizza: 32,
    dogFood: 85,
    cinema: 15,
    gym: 110,
    rent: 2800,
    flight: 380,
    iceCream: 5,
    impulse: 379,
  },
  foreign: {
    currency: "MYR",
    amount: 1200,
    local: 360,
  },
};

const BR: Market = {
  code: "BR",
  currency: "BRL",
  decimals: 2,
  takeHome: 3800,
  prices: {
    coffee: 9,
    lunch: 35,
    groceries: 220,
    fuel: 300,
    tshirt: 60,
    beers: 90,
    electricity: 180,
    pizza: 70,
    dogFood: 150,
    cinema: 35,
    gym: 120,
    rent: 1800,
    flight: 800,
    iceCream: 15,
    impulse: 285,
  },
  foreign: {
    currency: "USD",
    amount: 250,
    local: 1350,
  },
};

const ZA: Market = {
  code: "ZA",
  currency: "ZAR",
  decimals: 0,
  takeHome: 28000,
  prices: {
    coffee: 38,
    lunch: 120,
    groceries: 1400,
    fuel: 1200,
    tshirt: 350,
    beers: 300,
    electricity: 1500,
    pizza: 220,
    dogFood: 600,
    cinema: 130,
    gym: 700,
    rent: 9500,
    flight: 1800,
    iceCream: 60,
    impulse: 2099,
  },
  foreign: {
    currency: "EUR",
    amount: 250,
    local: 5100,
  },
};

/**
 * Locales that price in something other than US dollars. Anything missing
 * here falls back to the US market, which is what the language-only locales
 * did before markets existed — add an entry as each one gets real local
 * prices rather than converting these.
 */
const MARKET_BY_LOCALE: Partial<Record<Locale, Market>> = {
  "en-au": AU,
  "en-ca": CA,
  "en-gb": GB,
  "en-in": IN,
  "en-my": MY,
  "en-nz": NZ,
  "en-ph": PH,
  "en-sg": SG,
  "en-za": ZA,
  // The language-only locales for those same markets.
  fil: PH,
  hi: IN,
  ms: MY,
  // Portuguese is written for Brazil, so it prices there rather than in the
  // dollars every other language-only locale falls back to.
  pt: BR,
};

/** Every market, for the pages that compare them rather than pick one. */
export const MARKETS: Record<MarketCode, Market> = {
  AU,
  BR,
  CA,
  GB,
  IN,
  MY,
  NZ,
  PH,
  SG,
  US,
  ZA,
};

export function marketFor(locale: string): Market {
  return Object.hasOwn(MARKET_BY_LOCALE, locale)
    ? (MARKET_BY_LOCALE[locale as Locale] as Market)
    : US;
}

/**
 * The mock UIs also show figures that are not prices — a month's spend, a
 * budget, a net worth. They are held as a share of take-home pay so they
 * stay plausible in every market without another table of magic numbers.
 */
const SCENE = {
  monthlyCommitments: 0.5618,
  weekSpend: 0.1062,
  weekGroceries: 0.0398,
  weekEatingOut: 0.02795,
  weekTransport: 0.021,
  reimbursedEmployer: 0.0543,
  reimbursedInsurer: 0.0201,
  transaction: 0.00747,
  budgetSpent: 0.1354,
  budgetTotal: 0.1747,
  netWorth: 10.526,
} as const;

export type SceneKey = keyof typeof SCENE;

/**
 * Rounds a derived figure to a step that suits its size, so it reads like a
 * real number on a real screen rather than a conversion to four decimals.
 */
function tidy(value: number, decimals: 0 | 2) {
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(value, 1))) - 1);
  const step = decimals === 0 ? Math.max(10, magnitude) : Math.max(0.05, magnitude / 10);
  return Math.round((Math.round(value / step) * step) * 100) / 100;
}

/**
 * Minor units appear only when the amount actually has them, so a price reads
 * "$4.50" while a month's total reads "$2,570" rather than "$2,570.00".
 */
export function currencyOptions(
  market: { currency: string; decimals: 0 | 2 },
  value: number,
) {
  return {
    style: "currency" as const,
    currency: market.currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : market.decimals,
    maximumFractionDigits: market.decimals,
  };
}

/** For the places that cannot use hooks, such as the OG image route. */
export function formatAmount(locale: string, value: number) {
  const market = marketFor(locale);
  return new Intl.NumberFormat(locale, currencyOptions(market, value)).format(value);
}

/**
 * Every money figure on the marketing page, priced in the visitor's market
 * and converted to time at that market's take-home rate.
 */
export function useMoney() {
  const locale = useLocale();
  const format = useFormatter();
  const tu = useTranslations("home.units");

  const market = marketFor(locale);
  const perHour = market.takeHome / WORK_HOURS_PER_MONTH;

  /** Formats a figure already expressed in the market's currency. */
  const amount = (value: number) =>
    format.number(value, currencyOptions(market, value));

  /** What a thing costs here. */
  const price = (key: PriceKey) => amount(market.prices[key]);

  /** The foreign-currency purchase, in the money it was actually paid in. */
  const foreignAmount = () =>
    format.number(market.foreign.amount, {
      style: "currency",
      currency: market.foreign.currency,
      maximumFractionDigits: 0,
    });

  /** One of the mock-UI figures, sized to this market's take-home pay. */
  const scene = (key: SceneKey) => tidy(SCENE[key] * market.takeHome, market.decimals);

  /** How long you work for a given amount, in hours. */
  const hoursFor = (value: number) => value / perHour;

  /** Just the number of hours, formatted for the locale. */
  const hoursLabel = (value: number) =>
    format.number(hoursFor(value), { maximumFractionDigits: 1 });

  /**
   * The same figure as a phrase: minutes under the hour, then one decimal,
   * then whole hours once a tenth of an hour stops meaning anything.
   */
  const duration = (value: number) => {
    const hours = hoursFor(value);

    if (hours < 1) {
      return tu("min", { value: format.number(Math.round(hours * 60)) });
    }

    return tu("hours", {
      value: format.number(hours, {
        maximumFractionDigits: hours < 10 ? 1 : 0,
      }),
    });
  };

  return {
    amount,
    duration,
    foreign: market.foreign,
    foreignAmount,
    hoursFor,
    hoursLabel,
    perHour,
    price,
    /** Time cost of one of the priced things. */
    priceDuration: (key: PriceKey) => duration(market.prices[key]),
    scene,
    /** A scene figure, formatted. */
    sceneAmount: (key: SceneKey) => amount(scene(key)),
    takeHome: market.takeHome,
  };
}
