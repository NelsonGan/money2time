import { BIG_MAC } from "@/lib/bigmac.generated";
import { ENERGY, KWH_UNIT } from "@/lib/energy.generated";
import { COUNTRIES, type Country, type CountryCode } from "@/lib/countries";

/**
 * A published wage figure, with everything needed to say exactly what it is.
 *
 * There is no cross-country median wage table to draw on. The OECD publishes
 * average gross wages and only for its members, which leaves out most of the
 * markets here, and the ILO's harmonised series is a mean rather than a
 * median. So each figure comes from the country's own statistics office, and
 * carries its own definition — because they differ, and a reader comparing
 * two of them deserves to know how.
 *
 * How far they differ is not academic. Statistics South Africa puts average
 * monthly earnings at about R28,000 through its employer survey and the
 * median at about a fifth of that through its household survey: same country,
 * same year, different populations.
 */
export type WageStat = {
  /** In the market's own currency, as published. */
  amount: number;
  period: "hour" | "week" | "month" | "year";
  /** Medians describe the middle worker; averages are pulled up by the top. */
  measure: "median" | "average";
  /** Which workers the publisher counted. Keys into `costInHours.scopes`. */
  scope:
    | "allEmployees"
    | "allWorkers"
    | "citizens"
    | "employees"
    | "employeesNet"
    | "employedPersons"
    | "formalNonAgri"
    | "formalSector"
    | "fullTimeEmployees"
    | "fullTimeEquivalent"
    | "fullTimeResidents"
    | "regularSalaried"
    | "urbanNonPrivate"
    | "wageAndSalary";
  /** Statistics office and survey. A proper noun, so it is not translated. */
  source: string;
  sourceUrl: string;
  /** The period the figure covers, not the date it was published. */
  year: string;
};

/**
 * The published wage for every country the site compares.
 *
 * Changing this list changes a claim made in all 32 locales: the
 * `metadata.costInHours` description in each `messages/*.json` names how many
 * countries the page compares, spelled out as a word ("ten countries", "zehn
 * Ländern", "十个国家"), so it cannot be patched from here. The table has
 * already grown past that count and those descriptions need revisiting — or
 * rewriting to stop naming a count at all, which is what `en-za` does.
 */
export const WAGES: Record<CountryCode, WageStat> = {
  AU: {
    amount: 1741,
    period: "week",
    measure: "median",
    scope: "fullTimeEmployees",
    source: "Australian Bureau of Statistics, Employee Earnings",
    sourceUrl:
      "https://www.abs.gov.au/statistics/labour/earnings-and-working-conditions/employee-earnings/latest-release",
    year: "August 2025",
  },
  BR: {
    amount: 3560,
    period: "month",
    measure: "average",
    scope: "allWorkers",
    source: "IBGE, PNAD Cont\u00ednua",
    sourceUrl:
      "https://www.ibge.gov.br/estatisticas/sociais/trabalho/9173-pesquisa-nacional-por-amostra-de-domicilios-continua-trimestral.html",
    year: "2025",
  },
  CA: {
    amount: 35.2,
    period: "hour",
    measure: "average",
    scope: "allEmployees",
    source: "Statistics Canada, Labour Force Survey",
    sourceUrl:
      "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410006401",
    year: "2024",
  },
  CN: {
    amount: 124110,
    period: "year",
    measure: "average",
    scope: "urbanNonPrivate",
    source: "National Bureau of Statistics of China",
    sourceUrl:
      "https://www.stats.gov.cn/english/PressRelease/202505/t20250520_1959885.html",
    year: "2024",
  },
  DE: {
    amount: 54840,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  DK: {
    amount: 540516,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  ES: {
    amount: 35121,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  FR: {
    amount: 44304,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  GB: {
    amount: 19.67,
    period: "hour",
    measure: "median",
    scope: "fullTimeEmployees",
    source: "ONS, Annual Survey of Hours and Earnings",
    sourceUrl:
      "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2025",
    year: "April 2025",
  },
  ID: {
    amount: 3300000,
    period: "month",
    measure: "average",
    scope: "employeesNet",
    source: "BPS-Statistics Indonesia",
    sourceUrl:
      "https://www.bps.go.id/",
    year: "2025",
  },
  IN: {
    amount: 20702,
    period: "month",
    measure: "average",
    scope: "regularSalaried",
    source: "Periodic Labour Force Survey, Ministry of Statistics",
    sourceUrl:
      "https://www.mospi.gov.in/",
    year: "2023-24",
  },
  IT: {
    amount: 34733,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  JP: {
    amount: 5185703,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  KR: {
    amount: 53915741,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  MY: {
    amount: 2793,
    period: "month",
    measure: "median",
    scope: "citizens",
    source: "Department of Statistics Malaysia, Salaries & Wages Survey",
    sourceUrl:
      "https://www.dosm.gov.my/portal-main/release-content/salaries-and-wages-survey-report-2024",
    year: "2024",
  },
  NL: {
    amount: 61492,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  NO: {
    amount: 734712,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  NZ: {
    amount: 1380,
    period: "week",
    measure: "median",
    scope: "wageAndSalary",
    source: "Stats NZ, Labour Market Statistics (Income)",
    sourceUrl:
      "https://www.stats.govt.nz/information-releases/labour-market-statistics-income-june-2025-quarter/",
    year: "June 2025",
  },
  PH: {
    amount: 21544,
    period: "month",
    measure: "average",
    scope: "formalSector",
    source: "Philippine Statistics Authority, Occupational Wages Survey",
    sourceUrl:
      "https://psa.gov.ph/statistics/occupational-wages-survey",
    year: "2024",
  },
  PL: {
    amount: 101248,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  RU: {
    amount: 100316,
    period: "month",
    measure: "average",
    scope: "employees",
    source: "Rosstat",
    sourceUrl:
      "https://rosstat.gov.ru/",
    year: "2025",
  },
  SE: {
    amount: 546171,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2025",
  },
  SG: {
    amount: 5775,
    period: "month",
    measure: "median",
    scope: "fullTimeResidents",
    source: "Ministry of Manpower, Labour Force in Singapore",
    sourceUrl:
      "https://data.gov.sg/datasets/d_9cd9c40f22a4e45cac8f8b9d895fd5ce/view",
    year: "2025",
  },
  TH: {
    amount: 15700,
    period: "month",
    measure: "average",
    scope: "employedPersons",
    source: "National Statistical Office of Thailand",
    sourceUrl:
      "https://www.nso.go.th/",
    year: "2025",
  },
  TR: {
    amount: 742961,
    period: "year",
    measure: "average",
    scope: "fullTimeEquivalent",
    source: "OECD, Average annual wages",
    sourceUrl:
      "https://www.oecd.org/en/data/indicators/average-wages.html",
    year: "2024",
  },
  UA: {
    amount: 26913,
    period: "month",
    measure: "average",
    scope: "fullTimeEmployees",
    source: "State Statistics Service of Ukraine",
    sourceUrl:
      "https://stat.gov.ua/en",
    year: "2025",
  },
  US: {
    amount: 1204,
    period: "week",
    measure: "median",
    scope: "fullTimeEmployees",
    source: "U.S. Bureau of Labor Statistics, Usual Weekly Earnings",
    sourceUrl:
      "https://www.bls.gov/news.release/wkyeng.htm",
    year: "2025",
  },
  VN: {
    amount: 8400000,
    period: "month",
    measure: "average",
    scope: "employees",
    source: "National Statistics Office of Viet Nam",
    sourceUrl:
      "https://www.nso.gov.vn/en/",
    year: "2025",
  },
  ZA: {
    amount: 28289,
    period: "month",
    measure: "average",
    scope: "formalNonAgri",
    source: "Statistics South Africa, Quarterly Employment Statistics",
    sourceUrl:
      "https://www.statssa.gov.za/?p=18527",
    year: "February 2025",
  },
};

/**
 * A 40-hour week, which is what the page states and what the figures are
 * turned into an hourly rate with. Where a source already publishes an hourly
 * median the assumption does not apply at all, and where it publishes a
 * weekly one this lands close: Stats NZ's own median hourly is NZ$35 against
 * the NZ$34.50 that dividing its weekly median gives.
 */
export const HOURS_PER_WEEK = 40;
export const WEEKS_PER_MONTH = 52 / 12;
export const HOURS_PER_MONTH = HOURS_PER_WEEK * WEEKS_PER_MONTH;
export const MONTHS_PER_YEAR = 12;

export type ComparableMarket = {
  country: Country;
  wage: WageStat;
  /** The published figure restated per hour and per month, in local currency. */
  hourly: number;
  monthly: number;
  /**
   * The same hourly pay in US dollars, and the Big Mac figures. All absent
   * for Russia, which has had no Big Mac — and so no rate from this source —
   * since McDonald's left in 2022.
   */
  hourlyUsd?: number;
  bigMac?: number;
  minutesPerBigMac?: number;
  bigMacsPerMonth?: number;
  /** A litre of octane-95 petrol, and the work it costs. */
  petrol: number;
  minutesPerLitre: number;
  /** `KWH_UNIT` kilowatt-hours of household electricity, and its work cost. */
  electricity: number;
  minutesPerKwhUnit: number;
};

/**
 * Restates a published figure per hour and per month. Only one of the two is
 * ever the published number; the other is derived through the stated week, so
 * whichever the source gave is the one carried forward unchanged.
 */
function normalise(wage: WageStat) {
  if (wage.period === "hour") {
    return { hourly: wage.amount, monthly: wage.amount * HOURS_PER_MONTH };
  }
  if (wage.period === "week") {
    return {
      hourly: wage.amount / HOURS_PER_WEEK,
      monthly: wage.amount * WEEKS_PER_MONTH,
    };
  }
  if (wage.period === "year") {
    return {
      hourly: wage.amount / (HOURS_PER_MONTH * MONTHS_PER_YEAR),
      monthly: wage.amount / MONTHS_PER_YEAR,
    };
  }
  return { hourly: wage.amount / HOURS_PER_MONTH, monthly: wage.amount };
}

/** Each country's wage joined to its Big Mac and energy prices, in code order. */
export const COMPARABLE_MARKETS: ComparableMarket[] = (
  Object.keys(WAGES) as CountryCode[]
)
  .sort()
  .map((code) => {
    const wage = WAGES[code];
    const { hourly, monthly } = normalise(wage);
    const bigMac = BIG_MAC[code];
    const energy = ENERGY[code];
    const electricity = energy.electricity * KWH_UNIT;

    return {
      country: COUNTRIES[code],
      wage,
      hourly,
      monthly,
      hourlyUsd: bigMac && hourly / bigMac.usdRate,
      bigMac: bigMac?.price,
      minutesPerBigMac: bigMac && (bigMac.price / hourly) * 60,
      bigMacsPerMonth: bigMac && monthly / bigMac.price,
      petrol: energy.petrol,
      minutesPerLitre: (energy.petrol / hourly) * 60,
      electricity,
      minutesPerKwhUnit: (electricity / hourly) * 60,
    };
  });

export const COMPARABLE_CODES = COMPARABLE_MARKETS.map(({ country }) => country.code);

/**
 * Cheapest first, so the table reads as the ranking it actually is. Anywhere
 * without a Big Mac to price sorts to the end rather than to the top.
 */
export const MARKETS_BY_EFFORT = [...COMPARABLE_MARKETS].sort(
  (a, b) =>
    (a.minutesPerBigMac ?? Number.POSITIVE_INFINITY) -
    (b.minutesPerBigMac ?? Number.POSITIVE_INFINITY),
);

export function comparableMarket(code: CountryCode): ComparableMarket | undefined {
  return COMPARABLE_MARKETS.find(({ country }) => country.code === code);
}
