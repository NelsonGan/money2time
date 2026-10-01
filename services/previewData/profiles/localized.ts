import type {
  AccountGroupKey,
  AccountKey,
  CategoryNames,
  PreviewBudgetConfig,
  PreviewExtrasConfig,
  PreviewProfile,
  PreviewRecurringRuleConfig,
  PreviewTransactionNotes,
  PreviewTransactionsConfig,
} from '../shared';
import { malaysianEnProfile } from './malaysianEn';

// A store-screenshot profile for one country, written as local strings plus a
// handful of anchors. Every other amount is derived from the Malaysian profile,
// which is the hand-tuned reference: spending follows the local price level and
// income follows the local salary, so the month still balances the way the
// Malaysian one does without every country re-tuning ~150 numbers by hand.
export interface LocalizedProfileSpec {
  seed: number;
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  // Local units per ringgit of everyday spending (a coffee, a grocery run).
  priceScale: number;
  // Fraction digits amounts are rounded to: 0 for JPY, KRW, IDR and VND.
  decimals: number;
  // Current monthly salary. Earlier jobs and all other income scale from it.
  monthlySalary: number;
  monthlyRent: number;
  profileName: string;
  accountGroups: Record<AccountGroupKey, string>;
  accounts: Record<AccountKey, { name: string; logoId: string }>;
  extraAccounts: {
    name: string;
    type: 'debit' | 'credit';
    logoId: string;
    groupKey: AccountGroupKey;
  }[];
  categories: CategoryNames;
  budgetName: string;
  split: { merchant: string; note: string; people: [string, string, string] };
  recurring: {
    salary: { name: string; note: string };
    rent: { name: string; note: string };
    fitness: PreviewRecurringRuleConfig;
    subscriptions: PreviewRecurringRuleConfig[];
    investment: { name: string; note: string };
  };
  merchants: PreviewTransactionsConfig['merchants'] & {
    delivery: string[];
    convenience: string[];
  };
  notes: PreviewTransactionNotes;
}

const BASE = malaysianEnProfile;
const BASE_SALARY = BASE.career[0].monthlySalary;
const BASE_RENT = BASE.transactions.housing.rentBase;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Two significant figures, for anchors a person would quote (a salary, a
// budget line): 33 353 reads as 33 000, 1 742 as 1 700.
function niceRound(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

function scaleFields<T extends object>(
  source: T,
  scale: number,
  decimals: number,
  keep: readonly string[] = [],
): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] =
      typeof value === 'number' && !keep.includes(key) ? roundTo(value * scale, decimals) : value;
  }
  return out as T;
}

export function buildLocalizedProfile(spec: LocalizedProfileSpec): PreviewProfile {
  const price = spec.priceScale;
  const income = spec.monthlySalary / BASE_SALARY;
  const rentScale = spec.monthlyRent / BASE_RENT;
  const d = spec.decimals;
  const base = BASE.transactions;

  const accountKeys = Object.keys(spec.accounts) as AccountKey[];
  const accounts = Object.fromEntries(
    accountKeys.map((key) => [
      key,
      {
        ...spec.accounts[key],
        startingBalance: roundTo(BASE.accounts[key].startingBalance * income, 0),
      },
    ]),
  ) as PreviewProfile['accounts'];

  const extraAccounts = spec.extraAccounts.map((account, index) => ({
    ...account,
    startingBalance: roundTo(
      BASE.extraAccounts[index % BASE.extraAccounts.length].startingBalance * income,
      0,
    ),
  }));

  const career = BASE.career.map((job) => ({
    ...job,
    monthlySalary: niceRound((job.monthlySalary / BASE_SALARY) * spec.monthlySalary),
  }));
  career[0].monthlySalary = spec.monthlySalary;

  // Budget lines sized from what the seeded month actually spends at a price
  // scale of 1 (home ~2 390 of which rent is 1 850, food ~2 030, transport
  // ~710, lifestyle ~350, health ~340), so the ring reads about 90% used with
  // food a little over, rather than every line in the red.
  const allocations = [
    { categoryKey: 'home' as const, amount: niceRound(spec.monthlyRent + 650 * price) },
    { categoryKey: 'food' as const, amount: niceRound(1900 * price) },
    { categoryKey: 'transport' as const, amount: niceRound(800 * price) },
    { categoryKey: 'lifestyle' as const, amount: niceRound(600 * price) },
    { categoryKey: 'health' as const, amount: niceRound(400 * price) },
  ];
  const allocated = allocations.reduce((sum, line) => sum + line.amount, 0);
  const budgets: PreviewBudgetConfig = {
    templateName: spec.budgetName,
    templateEmoji: BASE.budgets.templateEmoji,
    totalAmount: niceRound(allocated * 1.06),
    allocations,
    monthsToSeed: BASE.budgets.monthsToSeed,
  };

  const baseSplit = BASE.splits[0];
  const splits = [
    {
      ...baseSplit,
      merchant: spec.split.merchant,
      note: spec.split.note,
      selfShare: roundTo(baseSplit.selfShare * price, d),
      participants: baseSplit.participants.map((person, index) => ({
        ...person,
        name: spec.split.people[index],
        share: roundTo(person.share * price, d),
      })),
    },
  ];

  const extras: PreviewExtrasConfig = {
    ...scaleFields(base.extras!, price, d, [
      'weekendBrunchCount',
      'bubbleTeaCount',
      'deliveryCount',
      'rideshareExtraCount',
      'convenienceCount',
    ]),
    weekendBrunchMerchants: spec.merchants.dining.slice(0, 3),
    weekendBrunchNote: '',
    bubbleTeaMerchants: spec.merchants.coffee,
    hangoutMerchants: spec.merchants.dining.slice(-3),
    hangoutNote: '',
    deliveryMerchants: spec.merchants.delivery,
    deliveryNote: '',
    convenienceMerchants: spec.merchants.convenience,
  };

  const merchants: PreviewTransactionsConfig['merchants'] = {
    grocery: spec.merchants.grocery,
    dining: spec.merchants.dining,
    coffee: spec.merchants.coffee,
    fuel: spec.merchants.fuel,
    shopping: spec.merchants.shopping,
    entertainment: spec.merchants.entertainment,
    rideshare: spec.merchants.rideshare,
    healthcare: spec.merchants.healthcare,
    hotels: spec.merchants.hotels,
    flights: spec.merchants.flights,
  };

  return {
    seed: spec.seed,
    locale: spec.locale,
    currencyCode: spec.currencyCode,
    currencySymbol: spec.currencySymbol,
    amountDecimals: spec.decimals,
    profileName: spec.profileName,
    accountGroups: spec.accountGroups,
    accounts,
    extraAccounts,
    categories: spec.categories,
    career,
    budgets,
    splits,
    recurring: {
      salary: { ...spec.recurring.salary, amount: spec.monthlySalary },
      rent: { ...spec.recurring.rent, amount: spec.monthlyRent },
      fitness: spec.recurring.fitness,
      subscriptions: spec.recurring.subscriptions,
      investment: {
        ...spec.recurring.investment,
        amount: niceRound(BASE.recurring.investment.amount * income),
      },
    },
    transactions: {
      merchants,
      notes: spec.notes,
      subscriptions: base.subscriptions.map((amount) => roundTo(amount * price, d)) as [
        number,
        number,
        number,
      ],
      income: scaleFields(base.income, income, d),
      housing: {
        ...scaleFields(base.housing, price, d),
        rentBase: spec.monthlyRent,
        rentGrowth: roundTo(base.housing.rentGrowth * rentScale, d),
        rentSpread: roundTo(base.housing.rentSpread * rentScale, d),
        fitnessBase: spec.recurring.fitness.amount,
      },
      weekly: scaleFields(base.weekly, price, d),
      lifestyle: scaleFields(base.lifestyle, price, d),
      transfers: scaleFields(base.transfers, income, d, ['cardPaymentRatio']),
      travel: scaleFields(base.travel, price, d, ['months', 'giftMonth']),
      extras,
    },
    albums: [],
    items: [],
  };
}
