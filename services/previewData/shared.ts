// Shared types and static blueprints for the localized preview-data seeder.
// The four locale profiles live in ./profiles/*, the seeding logic in ./seed.ts,
// and the public API is re-exported from ./index.ts.

export type PreviewSeedProfile =
  | 'american'
  | 'chinese'
  | 'taiwanese'
  | 'malaysian_en'
  | 'malaysian_zh';

export interface PreviewSeedSummary {
  profile: PreviewSeedProfile;
  locale: string;
  accounts: number;
  categories: number;
  recurringRules: number;
  transactions: number;
  wageMonths: number;
  albums: number;
  items: number;
  budgets: number;
  splits: number;
  receipts: number;
}

export type RandomFn = () => number;
export type AccountGroupKey = 'everyday' | 'goals' | 'credit' | 'investing';
export type AccountKey = 'checking' | 'savings' | 'travel' | 'card' | 'cash' | 'brokerage';
export type AccountRefs = Record<AccountKey, string>;

export interface CategoryBlueprintItem {
  key: string;
  type: 'expense' | 'income';
  icon: string;
  parentKey?: string;
}

// Icons are hand-drawn custom-icon names (see constants/categoryIcons.ts), not raw
// emoji, so every category renders a real icon rather than an emoji glyph.
export const CATEGORY_BLUEPRINT: CategoryBlueprintItem[] = [
  { key: 'home', type: 'expense', icon: 'house' },
  { key: 'rent', type: 'expense', icon: 'invoice', parentKey: 'home' },
  { key: 'utilities', type: 'expense', icon: 'light-bulb', parentKey: 'home' },
  { key: 'internet', type: 'expense', icon: 'laptop', parentKey: 'home' },
  { key: 'home_supplies', type: 'expense', icon: 'faucet', parentKey: 'home' },
  { key: 'food', type: 'expense', icon: 'meal' },
  { key: 'groceries', type: 'expense', icon: 'grocery-basket', parentKey: 'food' },
  { key: 'dining', type: 'expense', icon: 'meal', parentKey: 'food' },
  { key: 'coffee', type: 'expense', icon: 'coffee', parentKey: 'food' },
  { key: 'transport', type: 'expense', icon: 'car' },
  { key: 'fuel', type: 'expense', icon: 'gas-pump', parentKey: 'transport' },
  { key: 'rideshare', type: 'expense', icon: 'car', parentKey: 'transport' },
  { key: 'parking', type: 'expense', icon: 'keys', parentKey: 'transport' },
  { key: 'lifestyle', type: 'expense', icon: 'shopping-bag' },
  { key: 'shopping', type: 'expense', icon: 'price-tag', parentKey: 'lifestyle' },
  { key: 'entertainment', type: 'expense', icon: 'clapperboard', parentKey: 'lifestyle' },
  { key: 'subscriptions', type: 'expense', icon: 'bill-calendar', parentKey: 'lifestyle' },
  { key: 'health', type: 'expense', icon: 'medicine' },
  { key: 'healthcare', type: 'expense', icon: 'stethoscope', parentKey: 'health' },
  { key: 'fitness', type: 'expense', icon: 'dumbbell', parentKey: 'health' },
  { key: 'travel_root', type: 'expense', icon: 'plane' },
  { key: 'flights', type: 'expense', icon: 'plane', parentKey: 'travel_root' },
  { key: 'hotels', type: 'expense', icon: 'house', parentKey: 'travel_root' },
  { key: 'local_travel', type: 'expense', icon: 'bus', parentKey: 'travel_root' },
  { key: 'family', type: 'expense', icon: 'gift' },
  { key: 'gifts', type: 'expense', icon: 'gift', parentKey: 'family' },
  { key: 'education', type: 'expense', icon: 'graduation-cap', parentKey: 'family' },
  { key: 'salary_root', type: 'income', icon: 'briefcase' },
  { key: 'salary', type: 'income', icon: 'cash', parentKey: 'salary_root' },
  { key: 'bonus', type: 'income', icon: 'coins-checkmark', parentKey: 'salary_root' },
  { key: 'side_root', type: 'income', icon: 'laptop' },
  { key: 'freelance', type: 'income', icon: 'laptop', parentKey: 'side_root' },
  { key: 'consulting', type: 'income', icon: 'work-bag', parentKey: 'side_root' },
  { key: 'invest_root', type: 'income', icon: 'coins' },
  { key: 'dividends', type: 'income', icon: 'piggy-bank', parentKey: 'invest_root' },
  { key: 'interest', type: 'income', icon: 'bank', parentKey: 'invest_root' },
];

export type CategoryKey = (typeof CATEGORY_BLUEPRINT)[number]['key'];
export type CategoryRefs = Record<CategoryKey, string>;
export type CategoryNames = Record<CategoryKey, string>;

export interface PreviewAccountSeed {
  name: string;
  startingBalance: number;
  logoId: string;
}

// Display-only accounts (popular banks / e-wallets / international) shown in the
// accounts list for richer screenshots. Not referenced by seeded transactions.
export interface PreviewExtraAccount {
  name: string;
  type: 'debit' | 'credit';
  startingBalance: number;
  logoId: string;
  groupKey: AccountGroupKey;
}

export interface PreviewIncomeAmounts {
  bonusBase: number;
  bonusGrowth: number;
  bonusSpread: number;
  freelanceBase: number;
  freelanceGrowth: number;
  freelanceSpread: number;
  consultingBase: number;
  consultingStep: number;
  consultingSpread: number;
  dividendsBase: number;
  dividendsGrowth: number;
  dividendsSpread: number;
  interestBase: number;
  interestGrowth: number;
  interestSpread: number;
}

export interface PreviewHousingAmounts {
  rentBase: number;
  rentGrowth: number;
  rentSpread: number;
  utilitiesBase: number;
  utilitiesSpread: number;
  internetBase: number;
  internetSpread: number;
  fitnessBase: number;
  fitnessSpread: number;
  homeSuppliesBase: number;
  homeSuppliesSpread: number;
  healthcareBase: number;
  healthcareSpread: number;
  educationBase: number;
  educationSpread: number;
}

export interface PreviewWeeklyAmounts {
  cashTopUpFourWeek: number;
  cashTopUpFiveWeek: number;
  cashTopUpSpread: number;
  groceryBase: number;
  groceryWeekStep: number;
  grocerySpread: number;
  diningBase: number;
  diningWeekStep: number;
  diningSpread: number;
  coffeeBase: number;
  coffeeSpread: number;
  fuelBase: number;
  fuelSpread: number;
  parkingPrimaryBase: number;
  parkingPrimarySpread: number;
  parkingAlternateBase: number;
  parkingAlternateSpread: number;
}

export interface PreviewLifestyleAmounts {
  shoppingBase: number;
  shoppingTripStep: number;
  shoppingSpread: number;
  entertainmentBase: number;
  entertainmentTripStep: number;
  entertainmentSpread: number;
  rideshareBase: number;
  rideshareSpread: number;
}

export interface PreviewTransferAmounts {
  savingsBase: number;
  savingsGrowth: number;
  savingsSpread: number;
  investmentBase: number;
  investmentGrowth: number;
  investmentSpread: number;
  travelBase: number;
  travelPeak: number;
  travelSpread: number;
  cardPaymentRatio: number;
}

export interface PreviewTravelAmounts {
  months: number[];
  giftMonth: number;
  flightsBase: number;
  flightsSpread: number;
  hotelsBase: number;
  hotelsSpread: number;
  localTransitBase: number;
  localTransitSpread: number;
  diningBase: number;
  diningSpread: number;
  holidayGiftsBase: number;
  holidayGiftsSpread: number;
  familyCelebrationBase: number;
  familyCelebrationSpread: number;
}

export interface PreviewTransactionNotes {
  salary: string;
  bonus: string;
  freelance: string;
  consulting: string;
  dividends: string;
  interest: string;
  rent: string;
  utilities: string;
  internet: string;
  fitness: string;
  homeSupplies: string;
  subscriptions: [string, string, string];
  education: string;
  atmWithdrawal: string;
  parkingPrimary: string;
  parkingAlternate: string;
  savingsTransfer: string;
  investmentTransfer: string;
  travelTopUp: string;
  localTravel: string;
  tripDining: string;
  holidayGifts: string;
  familyCelebration: string;
  cardPayment: string;
}

export interface PreviewExtrasConfig {
  weekendBrunchCount: number;
  weekendBrunchBase: number;
  weekendBrunchSpread: number;
  weekendBrunchMerchants: string[];
  weekendBrunchNote: string;
  bubbleTeaCount: number;
  bubbleTeaBase: number;
  bubbleTeaSpread: number;
  bubbleTeaMerchants: string[];
  hangoutBase: number;
  hangoutSpread: number;
  hangoutMerchants: string[];
  hangoutNote: string;
  deliveryCount: number;
  deliveryBase: number;
  deliverySpread: number;
  deliveryMerchants: string[];
  deliveryNote: string;
  rideshareExtraCount: number;
  rideshareExtraBase: number;
  rideshareExtraSpread: number;
  convenienceCount: number;
  convenienceBase: number;
  convenienceSpread: number;
  convenienceMerchants: string[];
}

export interface PreviewTransactionsConfig {
  merchants: {
    grocery: string[];
    dining: string[];
    coffee: string[];
    fuel: string[];
    shopping: string[];
    entertainment: string[];
    rideshare: string[];
    healthcare: string[];
    hotels: string[];
    flights: string[];
  };
  notes: PreviewTransactionNotes;
  subscriptions: [number, number, number];
  income: PreviewIncomeAmounts;
  housing: PreviewHousingAmounts;
  weekly: PreviewWeeklyAmounts;
  lifestyle: PreviewLifestyleAmounts;
  transfers: PreviewTransferAmounts;
  travel: PreviewTravelAmounts;
  extras?: PreviewExtrasConfig;
}

export interface PreviewRecurringRuleConfig {
  name: string;
  amount: number;
  note: string;
}

// A trip album shown on the Albums map. Each is matched to one of the seeded
// travel months (most recent first) so its card surfaces real flight/hotel/
// dining spend, and its map pin lands on the destination's coordinates.
export interface PreviewAlbumSeed {
  name: string;
  placeName: string;
  placeAdmin: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  // Currency actually spent on this trip. When it differs from the profile's
  // reporting currency, the trip's flight/hotel/dining rows are seeded in this
  // local currency with a frozen FX snapshot so multi-currency is showcased.
  // `fxRate` is local units per 1 unit of the reporting currency (e.g. USD→JPY
  // ≈ 150). Domestic trips set `currencyCode` to the reporting code and
  // `fxRate` to 1.
  currencyCode: string;
  fxRate: number;
}

// A cost-per-day tracker entry. `purchaseMonthsAgo` anchors the buy date
// relative to "now" so the day count always looks lived-in; retired items set
// `retiredMonthsAgo` (+ optional `salePrice`) to demonstrate the sold/owned
// split and net-cost maths.
export interface PreviewItemSeed {
  name: string;
  iconId: string;
  purchaseMonthsAgo: number;
  purchaseDay: number;
  purchasePrice: number;
  retiredMonthsAgo?: number;
  salePrice?: number;
  note?: string;
}

// One job in the seeded career. Salary is flat for the whole tenure and only
// steps up when a new job starts, so the derived hourly-value chart reads as a
// clean staircase of real raises (people change pay when they change jobs, not
// every month). Commute usually drops at the newest job (a move closer to work
// / hybrid switch) so the *true* hourly rate climbs a little faster than gross.
export interface PreviewCareerJob {
  // How many months this job was held. Ignored for the current (newest) job,
  // which is open-ended so the history always reaches "now".
  durationMonths: number;
  monthlySalary: number;
  hoursWorkedPerWeek: number;
  commuteMinutesPerWorkday: number;
}

export interface PreviewBudgetAllocation {
  categoryKey: CategoryKey;
  amount: number;
}

export interface PreviewBudgetConfig {
  templateName: string;
  templateEmoji: string;
  // Round monthly cap; sits a little above the sum of allocations so the
  // "unbudgeted" tail has room and the budget ring is never pinned at 100%.
  totalAmount: number;
  allocations: PreviewBudgetAllocation[];
  // How many trailing months (including the current one) get a frozen copy.
  monthsToSeed: number;
}

// One person on a shared bill. `share` is their portion in the reporting
// currency; `paid` marks whether they've already settled up with you.
export interface PreviewSplitParticipant {
  name: string;
  share: number;
  paid: boolean;
}

// A split-bill expense: the full amount you fronted (your own `selfShare` plus
// everyone's portions), broken into per-person splits so the split-bill summary
// shows who still owes you.
export interface PreviewSplitConfig {
  merchant: string;
  note: string;
  categoryKey: CategoryKey;
  monthsAgo: number;
  day: number;
  account: AccountKey;
  selfShare: number;
  participants: PreviewSplitParticipant[];
}

export interface PreviewProfile {
  seed: number;
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  // Display name shown on the profile/settings header.
  profileName: string;
  accountGroups: Record<AccountGroupKey, string>;
  accounts: Record<AccountKey, PreviewAccountSeed>;
  extraAccounts: PreviewExtraAccount[];
  categories: CategoryNames;
  // Newest-first job history. jobs[0] is the current role.
  career: PreviewCareerJob[];
  budgets: PreviewBudgetConfig;
  // Optional second budget template (kept in the template list, not frozen) so
  // the template picker isn't a single-row screenshot.
  secondBudget?: PreviewBudgetConfig;
  // Shared bills with friends/family, showcasing the split-bill feature.
  splits: PreviewSplitConfig[];
  recurring: {
    salary: PreviewRecurringRuleConfig;
    rent: PreviewRecurringRuleConfig;
    fitness: PreviewRecurringRuleConfig;
    // Famous local subscription services, each seeded as its own recurring expense.
    subscriptions: PreviewRecurringRuleConfig[];
    investment: PreviewRecurringRuleConfig;
  };
  transactions: PreviewTransactionsConfig;
  // Trip albums (newest-first); paired with the most recent travel months.
  albums: PreviewAlbumSeed[];
  // Cost-per-day tracker entries.
  items: PreviewItemSeed[];
}

export const ACCOUNT_GROUP_ORDER: AccountGroupKey[] = ['everyday', 'goals', 'credit', 'investing'];

export const ACCOUNT_META: Record<
  AccountKey,
  {
    type: 'debit' | 'credit';
    icon: string;
    color: string;
    groupKey: AccountGroupKey;
    sortOrder: number;
    creditStatementDay: number | null;
    creditDueDay: number | null;
  }
> = {
  checking: {
    type: 'debit',
    icon: '💳',
    color: '#1F8A6F',
    groupKey: 'everyday',
    sortOrder: 0,
    creditStatementDay: null,
    creditDueDay: null,
  },
  savings: {
    type: 'debit',
    icon: '🏦',
    color: '#3B82F6',
    groupKey: 'goals',
    sortOrder: 1,
    creditStatementDay: null,
    creditDueDay: null,
  },
  travel: {
    type: 'debit',
    icon: '✈️',
    color: '#F59E0B',
    groupKey: 'goals',
    sortOrder: 2,
    creditStatementDay: null,
    creditDueDay: null,
  },
  card: {
    type: 'credit',
    icon: '💳',
    color: '#EF4444',
    groupKey: 'credit',
    sortOrder: 3,
    creditStatementDay: 25,
    creditDueDay: 8,
  },
  cash: {
    type: 'debit',
    icon: '👛',
    color: '#A855F7',
    groupKey: 'everyday',
    sortOrder: 4,
    creditStatementDay: null,
    creditDueDay: null,
  },
  brokerage: {
    type: 'debit',
    icon: '📈',
    color: '#0EA5E9',
    groupKey: 'investing',
    sortOrder: 5,
    creditStatementDay: null,
    creditDueDay: null,
  },
};
