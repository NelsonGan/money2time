import { getDb, getSQLite } from '~/lib/db/client';
import {
  accountGroupsTable,
  accountsTable,
  albumsTable,
  albumTransactionsTable,
  categoriesTable,
  itemsTable,
  monthlyWageSettingsTable,
  recurringRulesTable,
  transactionsTable,
} from '~/lib/db/schema';
import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { albumsRepository } from '~/lib/repositories/albumsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { itemsRepository } from '~/lib/repositories/itemsRepository';
import { monthlyWageRepository } from '~/lib/repositories/monthlyWageRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type { TransactionSentiment, WageConfig } from '~/types';

export type PreviewSeedProfile = 'american' | 'chinese' | 'malaysian_en' | 'malaysian_zh';

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
}

type RandomFn = () => number;
type AccountGroupKey = 'everyday' | 'goals' | 'credit' | 'investing';
type AccountKey = 'checking' | 'savings' | 'travel' | 'card' | 'cash' | 'brokerage';
type AccountRefs = Record<AccountKey, string>;

interface CategoryBlueprintItem {
  key: string;
  type: 'expense' | 'income';
  icon: string;
  parentKey?: string;
}

// Icons are hand-drawn custom-icon names (see constants/categoryIcons.ts), not raw
// emoji, so every category renders a real icon rather than an emoji glyph.
const CATEGORY_BLUEPRINT: CategoryBlueprintItem[] = [
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

type CategoryKey = (typeof CATEGORY_BLUEPRINT)[number]['key'];
type CategoryRefs = Record<CategoryKey, string>;
type CategoryNames = Record<CategoryKey, string>;

interface PreviewAccountSeed {
  name: string;
  startingBalance: number;
  logoId: string;
}

// Display-only accounts (popular banks / e-wallets / international) shown in the
// accounts list for richer screenshots. Not referenced by seeded transactions.
interface PreviewExtraAccount {
  name: string;
  type: 'debit' | 'credit';
  startingBalance: number;
  logoId: string;
  groupKey: AccountGroupKey;
}

interface PreviewIncomeAmounts {
  salaryBase: number;
  salaryGrowth: number;
  salaryCycleBump: number;
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

interface PreviewHousingAmounts {
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

interface PreviewWeeklyAmounts {
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

interface PreviewLifestyleAmounts {
  shoppingBase: number;
  shoppingTripStep: number;
  shoppingSpread: number;
  entertainmentBase: number;
  entertainmentTripStep: number;
  entertainmentSpread: number;
  rideshareBase: number;
  rideshareSpread: number;
}

interface PreviewTransferAmounts {
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

interface PreviewTravelAmounts {
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

interface PreviewTransactionNotes {
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

interface PreviewExtrasConfig {
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

interface PreviewTransactionsConfig {
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

interface PreviewRecurringRuleConfig {
  name: string;
  amount: number;
  note: string;
}

// A trip album shown on the Albums map. Each is matched to one of the seeded
// travel months (most recent first) so its card surfaces real flight/hotel/
// dining spend, and its map pin lands on the destination's coordinates.
interface PreviewAlbumSeed {
  name: string;
  placeName: string;
  placeAdmin: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
}

// A cost-per-day tracker entry. `purchaseMonthsAgo` anchors the buy date
// relative to "now" so the day count always looks lived-in; retired items set
// `retiredMonthsAgo` (+ optional `salePrice`) to demonstrate the sold/owned
// split and net-cost maths.
interface PreviewItemSeed {
  name: string;
  iconId: string;
  purchaseMonthsAgo: number;
  purchaseDay: number;
  purchasePrice: number;
  retiredMonthsAgo?: number;
  salePrice?: number;
  note?: string;
}

interface PreviewProfile {
  seed: number;
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  accountGroups: Record<AccountGroupKey, string>;
  accounts: Record<AccountKey, PreviewAccountSeed>;
  extraAccounts: PreviewExtraAccount[];
  categories: CategoryNames;
  wageHistory: {
    baseAmount: number;
    monthlyGrowth: number;
    yearlyStep: number;
    hoursBase: number;
    commuteBase: number;
    commuteStep: number;
  };
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

const ACCOUNT_GROUP_ORDER: AccountGroupKey[] = ['everyday', 'goals', 'credit', 'investing'];

const ACCOUNT_META: Record<
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

const AMERICAN_CATEGORIES: CategoryNames = {
  home: 'Home',
  rent: 'Rent',
  utilities: 'Utilities',
  internet: 'Internet',
  home_supplies: 'Home Supplies',
  food: 'Food',
  groceries: 'Groceries',
  dining: 'Dining Out',
  coffee: 'Coffee',
  transport: 'Transport',
  fuel: 'Fuel',
  rideshare: 'Ride Share',
  parking: 'Parking',
  lifestyle: 'Lifestyle',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  subscriptions: 'Subscriptions',
  health: 'Health',
  healthcare: 'Healthcare',
  fitness: 'Fitness',
  travel_root: 'Travel',
  flights: 'Flights',
  hotels: 'Hotels',
  local_travel: 'Local Transit',
  family: 'Family',
  gifts: 'Gifts',
  education: 'Learning',
  salary_root: 'Salary',
  salary: 'Paycheck',
  bonus: 'Bonus',
  side_root: 'Side Work',
  freelance: 'Freelance',
  consulting: 'Consulting',
  invest_root: 'Investments',
  dividends: 'Dividends',
  interest: 'Interest',
};

const CHINESE_CATEGORIES: CategoryNames = {
  home: '居住',
  rent: '房租',
  utilities: '水电燃气',
  internet: '网络通信',
  home_supplies: '日用品',
  food: '饮食',
  groceries: '买菜',
  dining: '外食',
  coffee: '咖啡奶茶',
  transport: '交通',
  fuel: '加油',
  rideshare: '打车',
  parking: '停车',
  lifestyle: '生活',
  shopping: '购物',
  entertainment: '娱乐',
  subscriptions: '订阅',
  health: '健康',
  healthcare: '医疗',
  fitness: '健身',
  travel_root: '旅行',
  flights: '机票',
  hotels: '酒店',
  local_travel: '本地交通',
  family: '家庭',
  gifts: '礼物',
  education: '学习',
  salary_root: '工资',
  salary: '工资到账',
  bonus: '奖金',
  side_root: '副业',
  freelance: '自由职业',
  consulting: '咨询',
  invest_root: '投资',
  dividends: '分红',
  interest: '利息',
};

const MALAYSIAN_EN_CATEGORIES: CategoryNames = {
  home: 'Rumah',
  rent: 'Sewa',
  utilities: 'Letrik & Air',
  internet: 'Unifi',
  home_supplies: 'Barang Rumah',
  food: 'Makan',
  groceries: 'Pasar & Grocer',
  dining: 'Makan Outside',
  coffee: 'Kopi & Teh',
  transport: 'Jalan-Jalan',
  fuel: 'Minyak',
  rideshare: 'Grab',
  parking: 'Tol & Parking',
  lifestyle: 'Lifestyle',
  shopping: 'Shopping',
  entertainment: 'Hiburan',
  subscriptions: 'Subscriptions',
  health: 'Kesihatan',
  healthcare: 'Klinik & Farmasi',
  fitness: 'Gym',
  travel_root: 'Cuti-Cuti',
  flights: 'Tiket Kapal Terbang',
  hotels: 'Hotel',
  local_travel: 'Local Transit',
  family: 'Family',
  gifts: 'Duit Raya & Angpow',
  education: 'Kursus',
  salary_root: 'Gaji',
  salary: 'Gaji Masuk',
  bonus: 'Bonus',
  side_root: 'Side Hustle',
  freelance: 'Freelance',
  consulting: 'Consulting',
  invest_root: 'Pelaburan',
  dividends: 'Dividen',
  interest: 'FD Interest',
};

const MALAYSIAN_ZH_CATEGORIES: CategoryNames = {
  home: '屋企',
  rent: '屋租',
  utilities: '水电费',
  internet: 'Unifi 上网',
  home_supplies: '家用',
  food: '吃喝',
  groceries: '巴刹买菜',
  dining: '出外食',
  coffee: 'Kopi 茶水',
  transport: '出门',
  fuel: '入油',
  rideshare: 'Grab 召车',
  parking: '过路费 / 泊车',
  lifestyle: '生活',
  shopping: '购物',
  entertainment: '娱乐',
  subscriptions: '订阅',
  health: '健康',
  healthcare: '诊所药房',
  fitness: '健身',
  travel_root: 'Cuti 旅游',
  flights: '机票',
  hotels: '酒店',
  local_travel: '当地交通',
  family: '家人',
  gifts: '青包礼物',
  education: '上课',
  salary_root: '薪水',
  salary: 'Gaji 入账',
  bonus: '花红',
  side_root: '副业',
  freelance: '自由接案',
  consulting: '顾问',
  invest_root: '投资',
  dividends: '股息',
  interest: '定期利息',
};

const PREVIEW_PROFILES: Record<PreviewSeedProfile, PreviewProfile> = {
  american: {
    seed: 20260308,
    locale: 'en',
    currencyCode: 'USD',
    currencySymbol: '$',
    accountGroups: {
      everyday: 'Everyday',
      goals: 'Goals',
      credit: 'Credit',
      investing: 'Investing',
    },
    accounts: {
      checking: { name: 'Daily Checking', startingBalance: 2650, logoId: 'united-states/chase' },
      savings: {
        name: 'High Yield Savings',
        startingBalance: 7400,
        logoId: 'united-states/marcus-by-goldman-sachs',
      },
      travel: { name: 'Travel Fund', startingBalance: 900, logoId: 'united-states/capital-one' },
      card: { name: 'Discover it', startingBalance: 185, logoId: 'united-states/discover' },
      cash: { name: 'Cash Wallet', startingBalance: 120, logoId: 'united-states/cash-app' },
      brokerage: { name: 'Brokerage', startingBalance: 5200, logoId: 'united-states/fidelity' },
    },
    extraAccounts: [
      {
        name: 'Venmo',
        type: 'debit',
        startingBalance: 240,
        logoId: 'united-states/venmo',
        groupKey: 'everyday',
      },
      {
        name: 'PayPal',
        type: 'debit',
        startingBalance: 310,
        logoId: 'global/paypal',
        groupKey: 'everyday',
      },
      {
        name: 'Wise',
        type: 'debit',
        startingBalance: 1450,
        logoId: 'global/wise',
        groupKey: 'everyday',
      },
      {
        name: 'Robinhood',
        type: 'debit',
        startingBalance: 3800,
        logoId: 'united-states/robinhood',
        groupKey: 'investing',
      },
      {
        name: 'Coinbase',
        type: 'debit',
        startingBalance: 2100,
        logoId: 'global/coinbase',
        groupKey: 'investing',
      },
      {
        name: 'Chase Sapphire Preferred',
        type: 'credit',
        startingBalance: 1240,
        logoId: 'united-states/chase',
        groupKey: 'credit',
      },
      {
        name: 'Amex Gold Card',
        type: 'credit',
        startingBalance: 860,
        logoId: 'global/american-express',
        groupKey: 'credit',
      },
      {
        name: 'Capital One Venture',
        type: 'credit',
        startingBalance: 540,
        logoId: 'united-states/capital-one',
        groupKey: 'credit',
      },
      {
        name: 'Apple Card',
        type: 'credit',
        startingBalance: 320,
        logoId: 'global/apple-pay',
        groupKey: 'credit',
      },
    ],
    categories: AMERICAN_CATEGORIES,
    wageHistory: {
      baseAmount: 3950,
      monthlyGrowth: 14,
      yearlyStep: 110,
      hoursBase: 39,
      commuteBase: 35,
      commuteStep: 7,
    },
    recurring: {
      salary: { name: 'Monthly Paycheck', amount: 4485, note: 'Payroll' },
      rent: { name: 'Apartment Rent', amount: 1495, note: 'Riverside Apartments' },
      fitness: { name: 'Gym Membership', amount: 42, note: 'Crunch Fitness' },
      subscriptions: [
        { name: 'Netflix', amount: 22.99, note: 'Netflix Premium' },
        { name: 'Spotify', amount: 11.99, note: 'Spotify Premium' },
        { name: 'Disney+', amount: 13.99, note: 'Disney+' },
        { name: 'Amazon Prime', amount: 14.99, note: 'Amazon Prime' },
        { name: 'ChatGPT Plus', amount: 20, note: 'ChatGPT Plus' },
      ],
      investment: { name: 'Brokerage Auto-Invest', amount: 225, note: 'Auto-invest' },
    },
    transactions: {
      merchants: {
        grocery: ["Trader Joe's", 'Whole Foods', 'Safeway', 'Costco', 'Kroger'],
        dining: ['Chipotle', 'Shake Shack', 'Olive Garden', 'Panera Bread', 'Chick-fil-A'],
        coffee: ['Starbucks', "Dunkin'", 'Blue Bottle', "Peet's Coffee"],
        fuel: ['Shell', 'Chevron', 'Costco Gas', 'ExxonMobil'],
        shopping: ['Target', 'Amazon', 'Best Buy', 'IKEA', 'Walmart'],
        entertainment: ['AMC Theatres', 'Regal Cinemas', "Dave & Buster's", 'Ticketmaster'],
        rideshare: ['Uber', 'Lyft'],
        healthcare: ['CVS Pharmacy', 'Walgreens', 'One Medical'],
        hotels: ['Marriott', 'Hilton', 'Airbnb'],
        flights: ['Delta', 'United Airlines', 'Southwest'],
      },
      notes: {
        salary: 'Payroll',
        bonus: 'Performance bonus',
        freelance: 'Client retainer',
        consulting: 'Advisory session',
        dividends: 'Quarterly dividends',
        interest: 'Savings interest',
        rent: 'Riverside Apartments',
        utilities: 'PG&E bill',
        internet: 'Xfinity',
        fitness: 'Crunch Fitness',
        homeSupplies: 'Target run',
        subscriptions: ['Netflix', 'Spotify', 'iCloud+'],
        education: 'Coursera',
        atmWithdrawal: 'ATM withdrawal',
        parkingPrimary: 'Downtown parking',
        parkingAlternate: 'Station parking',
        savingsTransfer: 'Savings transfer',
        investmentTransfer: 'Auto-invest',
        travelTopUp: 'Travel top-up',
        localTravel: 'Airport rail',
        tripDining: 'Trip dinner',
        holidayGifts: 'Holiday gifts',
        familyCelebration: 'Family celebration',
        cardPayment: 'Card payment',
      },
      subscriptions: [22.99, 11.99, 2.99],
      income: {
        salaryBase: 4425,
        salaryGrowth: 18,
        salaryCycleBump: 12,
        bonusBase: 950,
        bonusGrowth: 18,
        bonusSpread: 140,
        freelanceBase: 320,
        freelanceGrowth: 8,
        freelanceSpread: 90,
        consultingBase: 210,
        consultingStep: 35,
        consultingSpread: 60,
        dividendsBase: 42,
        dividendsGrowth: 1.5,
        dividendsSpread: 12,
        interestBase: 12,
        interestGrowth: 0.4,
        interestSpread: 3.5,
      },
      housing: {
        rentBase: 1495,
        rentGrowth: 1.5,
        rentSpread: 15,
        utilitiesBase: 108,
        utilitiesSpread: 16,
        internetBase: 69,
        internetSpread: 5,
        fitnessBase: 42,
        fitnessSpread: 2,
        homeSuppliesBase: 34,
        homeSuppliesSpread: 14,
        healthcareBase: 82,
        healthcareSpread: 24,
        educationBase: 86,
        educationSpread: 20,
      },
      weekly: {
        cashTopUpFourWeek: 90,
        cashTopUpFiveWeek: 110,
        cashTopUpSpread: 10,
        groceryBase: 96,
        groceryWeekStep: 4,
        grocerySpread: 18,
        diningBase: 34,
        diningWeekStep: 2.5,
        diningSpread: 12,
        coffeeBase: 6.5,
        coffeeSpread: 1.8,
        fuelBase: 42,
        fuelSpread: 8,
        parkingPrimaryBase: 18,
        parkingPrimarySpread: 6,
        parkingAlternateBase: 8.5,
        parkingAlternateSpread: 3,
      },
      lifestyle: {
        shoppingBase: 56,
        shoppingTripStep: 22,
        shoppingSpread: 24,
        entertainmentBase: 32,
        entertainmentTripStep: 18,
        entertainmentSpread: 14,
        rideshareBase: 18,
        rideshareSpread: 6,
      },
      transfers: {
        savingsBase: 360,
        savingsGrowth: 10,
        savingsSpread: 30,
        investmentBase: 215,
        investmentGrowth: 6,
        investmentSpread: 22,
        travelBase: 110,
        travelPeak: 240,
        travelSpread: 30,
        cardPaymentRatio: 0.96,
      },
      travel: {
        months: [2, 8],
        giftMonth: 11,
        flightsBase: 315,
        flightsSpread: 65,
        hotelsBase: 465,
        hotelsSpread: 95,
        localTransitBase: 58,
        localTransitSpread: 16,
        diningBase: 74,
        diningSpread: 18,
        holidayGiftsBase: 240,
        holidayGiftsSpread: 70,
        familyCelebrationBase: 165,
        familyCelebrationSpread: 45,
      },
    },
    albums: [
      {
        name: 'Tokyo Getaway',
        placeName: 'Tokyo',
        placeAdmin: 'Japan',
        countryCode: 'JP',
        latitude: 35.6762,
        longitude: 139.6503,
      },
      {
        name: 'Iceland Road Trip',
        placeName: 'Reykjavík',
        placeAdmin: 'Iceland',
        countryCode: 'IS',
        latitude: 64.1466,
        longitude: -21.9426,
      },
      {
        name: 'NYC Long Weekend',
        placeName: 'New York City',
        placeAdmin: 'New York',
        countryCode: 'US',
        latitude: 40.7128,
        longitude: -74.006,
      },
      {
        name: 'Cancún Escape',
        placeName: 'Cancún',
        placeAdmin: 'Mexico',
        countryCode: 'MX',
        latitude: 21.1619,
        longitude: -86.8515,
      },
    ],
    items: [
      {
        name: 'iPhone 15 Pro',
        iconId: 'smartphone',
        purchaseMonthsAgo: 13,
        purchaseDay: 22,
        purchasePrice: 999,
        note: 'Natural Titanium, 256GB',
      },
      {
        name: 'MacBook Air M3',
        iconId: 'laptop',
        purchaseMonthsAgo: 20,
        purchaseDay: 9,
        purchasePrice: 1299,
        note: 'Daily driver for side projects',
      },
      {
        name: 'Sony WH-1000XM5',
        iconId: 'headphones',
        purchaseMonthsAgo: 8,
        purchaseDay: 4,
        purchasePrice: 399,
      },
      {
        name: 'Apple Watch Series 9',
        iconId: 'smartwatch',
        purchaseMonthsAgo: 11,
        purchaseDay: 17,
        purchasePrice: 429,
      },
      {
        name: 'Sony A7 IV',
        iconId: 'dslr-camera',
        purchaseMonthsAgo: 26,
        purchaseDay: 12,
        purchasePrice: 2498,
        note: 'Travel + vlog camera',
      },
      {
        name: 'Specialized Turbo Vado',
        iconId: 'e-bike',
        purchaseMonthsAgo: 18,
        purchaseDay: 28,
        purchasePrice: 2800,
        note: 'Bike-to-work commuter',
      },
      {
        name: 'PlayStation 5',
        iconId: 'playstation',
        purchaseMonthsAgo: 30,
        purchaseDay: 6,
        purchasePrice: 499,
      },
      {
        name: 'iPhone 13 (sold)',
        iconId: 'smartphone',
        purchaseMonthsAgo: 38,
        purchaseDay: 15,
        purchasePrice: 799,
        retiredMonthsAgo: 13,
        salePrice: 360,
        note: 'Traded in for the 15 Pro',
      },
    ],
  },
  chinese: {
    seed: 20260318,
    locale: 'zh',
    currencyCode: 'CNY',
    currencySymbol: '¥',
    accountGroups: {
      everyday: '日常',
      goals: '目标',
      credit: '信用',
      investing: '投资',
    },
    accounts: {
      checking: { name: '工资卡', startingBalance: 18600, logoId: 'china/china-merchants-bank' },
      savings: { name: '活期储蓄', startingBalance: 64800, logoId: 'china/icbc' },
      travel: { name: '旅行基金', startingBalance: 5200, logoId: 'china/bank-of-china' },
      card: { name: '建行信用卡', startingBalance: 680, logoId: 'china/china-construction-bank' },
      cash: { name: '现金', startingBalance: 280, logoId: 'china/unionpay' },
      brokerage: { name: '基金账户', startingBalance: 22800, logoId: 'china/ping-an-bank' },
    },
    extraAccounts: [
      {
        name: '支付宝',
        type: 'debit',
        startingBalance: 1860,
        logoId: 'china/alipay',
        groupKey: 'everyday',
      },
      {
        name: '微信钱包',
        type: 'debit',
        startingBalance: 1240,
        logoId: 'china/wechat-pay',
        groupKey: 'everyday',
      },
      {
        name: 'Wise',
        type: 'debit',
        startingBalance: 5200,
        logoId: 'global/wise',
        groupKey: 'everyday',
      },
      {
        name: '币安',
        type: 'debit',
        startingBalance: 9800,
        logoId: 'global/binance',
        groupKey: 'investing',
      },
      {
        name: '招商银行信用卡',
        type: 'credit',
        startingBalance: 2400,
        logoId: 'china/china-merchants-bank',
        groupKey: 'credit',
      },
      {
        name: '蚂蚁花呗',
        type: 'credit',
        startingBalance: 860,
        logoId: 'china/alipay',
        groupKey: 'credit',
      },
      {
        name: '京东白条',
        type: 'credit',
        startingBalance: 430,
        logoId: 'china/jdcom',
        groupKey: 'credit',
      },
      {
        name: '交通银行信用卡',
        type: 'credit',
        startingBalance: 1500,
        logoId: 'china/bank-of-communications',
        groupKey: 'credit',
      },
    ],
    categories: CHINESE_CATEGORIES,
    wageHistory: {
      baseAmount: 15200,
      monthlyGrowth: 42,
      yearlyStep: 320,
      hoursBase: 44.5,
      commuteBase: 43,
      commuteStep: 6,
    },
    recurring: {
      salary: { name: '每月工资', amount: 16800, note: '工资入账' },
      rent: { name: '房租', amount: 4900, note: '青年公寓' },
      fitness: { name: '健身月卡', amount: 199, note: '乐刻运动' },
      subscriptions: [
        { name: '腾讯视频VIP', amount: 30, note: '腾讯视频会员' },
        { name: '爱奇艺黄金会员', amount: 25, note: '爱奇艺会员' },
        { name: '网易云音乐黑胶VIP', amount: 18, note: '网易云音乐' },
        { name: '哔哩哔哩大会员', amount: 25, note: 'B站大会员' },
        { name: '百度网盘超级会员', amount: 30, note: '百度网盘' },
      ],
      investment: { name: '基金定投', amount: 1200, note: '自动定投' },
    },
    transactions: {
      merchants: {
        grocery: ['盒马鲜生', '永辉超市', '叮咚买菜', '社区生鲜'],
        dining: ['兰州拉面', '小馆子', '粤式茶餐厅', '川味小馆'],
        coffee: ['瑞幸咖啡', 'Manner Coffee', '幸运咖', '库迪咖啡'],
        fuel: ['中石化', '中石油', '壳牌'],
        shopping: ['万象城', '宜家', '数码城', '生活广场'],
        entertainment: ['万达影城', 'Livehouse', 'KTV', '周末演出'],
        rideshare: ['滴滴出行', '高德打车', '曹操出行'],
        healthcare: ['社区医院', '口腔诊所', '连锁药房'],
        hotels: ['亚朵酒店', '全季酒店', '桔子酒店'],
        flights: ['南方航空', '中国国航', '东方航空'],
      },
      notes: {
        salary: '工资入账',
        bonus: '季度奖金',
        freelance: '副业项目',
        consulting: '顾问项目',
        dividends: '基金分红',
        interest: '活期利息',
        rent: '青年公寓',
        utilities: '水电燃气',
        internet: '家庭宽带',
        fitness: '乐刻运动',
        homeSupplies: '日用品补货',
        subscriptions: ['腾讯视频VIP', '网易云音乐', '百度网盘会员'],
        education: '线上课程',
        atmWithdrawal: '取现',
        parkingPrimary: '商场停车',
        parkingAlternate: '路边停车',
        savingsTransfer: '转入储蓄',
        investmentTransfer: '自动定投',
        travelTopUp: '旅行备用金',
        localTravel: '机场快线',
        tripDining: '旅行聚餐',
        holidayGifts: '节日礼物',
        familyCelebration: '家庭聚餐',
        cardPayment: '信用卡还款',
      },
      subscriptions: [25, 15, 12],
      income: {
        salaryBase: 16600,
        salaryGrowth: 48,
        salaryCycleBump: 20,
        bonusBase: 3600,
        bonusGrowth: 80,
        bonusSpread: 500,
        freelanceBase: 1350,
        freelanceGrowth: 35,
        freelanceSpread: 260,
        consultingBase: 820,
        consultingStep: 120,
        consultingSpread: 180,
        dividendsBase: 110,
        dividendsGrowth: 6,
        dividendsSpread: 35,
        interestBase: 38,
        interestGrowth: 1,
        interestSpread: 10,
      },
      housing: {
        rentBase: 4900,
        rentGrowth: 12,
        rentSpread: 80,
        utilitiesBase: 230,
        utilitiesSpread: 45,
        internetBase: 89,
        internetSpread: 8,
        fitnessBase: 199,
        fitnessSpread: 10,
        homeSuppliesBase: 110,
        homeSuppliesSpread: 40,
        healthcareBase: 160,
        healthcareSpread: 55,
        educationBase: 220,
        educationSpread: 60,
      },
      weekly: {
        cashTopUpFourWeek: 220,
        cashTopUpFiveWeek: 280,
        cashTopUpSpread: 30,
        groceryBase: 175,
        groceryWeekStep: 8,
        grocerySpread: 40,
        diningBase: 72,
        diningWeekStep: 5,
        diningSpread: 25,
        coffeeBase: 16,
        coffeeSpread: 5,
        fuelBase: 180,
        fuelSpread: 35,
        parkingPrimaryBase: 24,
        parkingPrimarySpread: 8,
        parkingAlternateBase: 15,
        parkingAlternateSpread: 5,
      },
      lifestyle: {
        shoppingBase: 190,
        shoppingTripStep: 70,
        shoppingSpread: 80,
        entertainmentBase: 88,
        entertainmentTripStep: 42,
        entertainmentSpread: 30,
        rideshareBase: 32,
        rideshareSpread: 10,
      },
      transfers: {
        savingsBase: 3200,
        savingsGrowth: 65,
        savingsSpread: 180,
        investmentBase: 1450,
        investmentGrowth: 40,
        investmentSpread: 120,
        travelBase: 260,
        travelPeak: 880,
        travelSpread: 100,
        cardPaymentRatio: 0.97,
      },
      travel: {
        months: [0, 9],
        giftMonth: 0,
        flightsBase: 980,
        flightsSpread: 220,
        hotelsBase: 880,
        hotelsSpread: 160,
        localTransitBase: 42,
        localTransitSpread: 12,
        diningBase: 148,
        diningSpread: 35,
        holidayGiftsBase: 860,
        holidayGiftsSpread: 200,
        familyCelebrationBase: 520,
        familyCelebrationSpread: 120,
      },
    },
    albums: [
      {
        name: '东京之旅',
        placeName: '东京',
        placeAdmin: '日本',
        countryCode: 'JP',
        latitude: 35.6762,
        longitude: 139.6503,
      },
      {
        name: '普吉岛度假',
        placeName: '普吉岛',
        placeAdmin: '泰国',
        countryCode: 'TH',
        latitude: 7.8804,
        longitude: 98.3923,
      },
      {
        name: '云南大理',
        placeName: '大理',
        placeAdmin: '云南',
        countryCode: 'CN',
        latitude: 25.6065,
        longitude: 100.2676,
      },
      {
        name: '香港购物游',
        placeName: '香港',
        placeAdmin: '香港特别行政区',
        countryCode: 'HK',
        latitude: 22.3193,
        longitude: 114.1694,
      },
    ],
    items: [
      {
        name: 'iPhone 15 Pro',
        iconId: 'smartphone',
        purchaseMonthsAgo: 12,
        purchaseDay: 20,
        purchasePrice: 8999,
        note: '原色钛金属 256G',
      },
      {
        name: '华为 MateBook X Pro',
        iconId: 'laptop',
        purchaseMonthsAgo: 19,
        purchaseDay: 8,
        purchasePrice: 9999,
      },
      {
        name: '索尼 WH-1000XM5',
        iconId: 'headphones',
        purchaseMonthsAgo: 7,
        purchaseDay: 14,
        purchasePrice: 2899,
      },
      {
        name: 'Apple Watch S9',
        iconId: 'smartwatch',
        purchaseMonthsAgo: 10,
        purchaseDay: 3,
        purchasePrice: 3199,
      },
      {
        name: '大疆 Pocket 3',
        iconId: 'action-camera',
        purchaseMonthsAgo: 9,
        purchaseDay: 26,
        purchasePrice: 3499,
        note: '旅行 vlog 神器',
      },
      {
        name: '石头扫地机器人',
        iconId: 'robot-vacuum',
        purchaseMonthsAgo: 22,
        purchaseDay: 11,
        purchasePrice: 3299,
      },
      {
        name: '任天堂 Switch OLED',
        iconId: 'handheld-game-console',
        purchaseMonthsAgo: 28,
        purchaseDay: 5,
        purchasePrice: 2099,
      },
      {
        name: '大疆 Mini 3（已出）',
        iconId: 'drone',
        purchaseMonthsAgo: 34,
        purchaseDay: 18,
        purchasePrice: 4788,
        retiredMonthsAgo: 11,
        salePrice: 2600,
        note: '升级 Mini 4 后转卖',
      },
    ],
  },
  malaysian_en: {
    seed: 20260411,
    locale: 'en',
    currencyCode: 'MYR',
    currencySymbol: 'RM',
    accountGroups: {
      everyday: 'Everyday',
      goals: 'Goals',
      credit: 'Credit',
      investing: 'Investing',
    },
    accounts: {
      checking: { name: 'Maybank2u', startingBalance: 4850, logoId: 'malaysia/maybank' },
      savings: { name: 'CIMB Savings', startingBalance: 28600, logoId: 'malaysia/cimb' },
      travel: { name: 'Cuti Tabung', startingBalance: 2400, logoId: 'malaysia/hsbc-malaysia' },
      card: { name: 'Maybank 2 Card', startingBalance: 320, logoId: 'malaysia/maybank' },
      cash: { name: 'Wallet Cash', startingBalance: 180, logoId: 'malaysia/touch-n-go-ewallet' },
      brokerage: { name: 'StashAway', startingBalance: 16800, logoId: 'malaysia/stashaway' },
    },
    extraAccounts: [
      {
        name: 'GrabPay',
        type: 'debit',
        startingBalance: 220,
        logoId: 'malaysia/grabpay',
        groupKey: 'everyday',
      },
      {
        name: 'Boost',
        type: 'debit',
        startingBalance: 140,
        logoId: 'malaysia/boost-bank',
        groupKey: 'everyday',
      },
      {
        name: 'Wise',
        type: 'debit',
        startingBalance: 1900,
        logoId: 'global/wise',
        groupKey: 'everyday',
      },
      {
        name: 'Rakuten Trade',
        type: 'debit',
        startingBalance: 7400,
        logoId: 'malaysia/rakuten-trade',
        groupKey: 'investing',
      },
      {
        name: 'CIMB Cash Rebate',
        type: 'credit',
        startingBalance: 640,
        logoId: 'malaysia/cimb',
        groupKey: 'credit',
      },
      {
        name: 'UOB One Card',
        type: 'credit',
        startingBalance: 920,
        logoId: 'malaysia/uob-malaysia',
        groupKey: 'credit',
      },
      {
        name: 'Hong Leong Wise Card',
        type: 'credit',
        startingBalance: 410,
        logoId: 'malaysia/hong-leong-bank',
        groupKey: 'credit',
      },
      {
        name: 'AEON Visa Card',
        type: 'credit',
        startingBalance: 280,
        logoId: 'malaysia/aeon-bank',
        groupKey: 'credit',
      },
    ],
    categories: MALAYSIAN_EN_CATEGORIES,
    wageHistory: {
      baseAmount: 5800,
      monthlyGrowth: 22,
      yearlyStep: 180,
      hoursBase: 45,
      commuteBase: 50,
      commuteStep: 8,
    },
    recurring: {
      salary: { name: 'Gaji Masuk', amount: 6800, note: 'Gaji bulan ni' },
      rent: { name: 'Sewa Rumah', amount: 1850, note: 'Sewa kondo' },
      fitness: { name: 'Gym Bulanan', amount: 158, note: 'Anytime Fitness' },
      subscriptions: [
        { name: 'Astro Family Pack', amount: 89.9, note: 'Astro pakej family' },
        { name: 'Netflix', amount: 54.9, note: 'Netflix Premium' },
        { name: 'Spotify Family', amount: 23.9, note: 'Spotify Family' },
        { name: 'Disney+ Hotstar', amount: 19.9, note: 'Disney+ Hotstar' },
        { name: 'iCloud+', amount: 11.9, note: 'iCloud 200GB' },
      ],
      investment: { name: 'StashAway Auto-Debit', amount: 600, note: 'StashAway top-up bulanan' },
    },
    transactions: {
      merchants: {
        grocery: [
          "Lotus's Damansara",
          'Mydin USJ',
          'Jaya Grocer',
          'Village Grocer',
          '99 Speedmart',
          'AEON Big',
          'Cold Storage',
        ],
        dining: [
          'Mamak Pelita',
          "Devi's Corner mamak",
          'Nasi Kandar Pelita',
          'Restoran Yut Kee',
          'Old Town White Coffee',
          'The Chicken Rice Shop',
          'Bak Kut Teh Klang',
          'Char Kway Teow PJ',
          'Pavilion Food Republic',
          'Sushi King',
        ],
        coffee: [
          'ZUS Coffee drive-thru',
          'Starbucks KLCC',
          'Coffee Bean Pavilion',
          'Gigi Coffee',
          'Old Town kopitiam',
        ],
        fuel: ['Petronas pump', 'Shell Select', 'Petron RON95', 'BHPetrol'],
        shopping: [
          'Pavilion KL',
          'Mid Valley Megamall',
          '1 Utama',
          'Sunway Pyramid',
          'IKEA Damansara',
          'Uniqlo Mid Valley',
          'Mr DIY',
        ],
        entertainment: [
          'GSC Mid Valley',
          'TGV 1 Utama',
          'Sunway Lagoon',
          'Genting SkyWorlds',
          'Karaoke Manhattan',
          'Aquaria KLCC',
        ],
        rideshare: ['Grab Car', 'Grab Bike', 'AirAsia Ride', 'inDrive'],
        healthcare: [
          'Klinik Mediviron',
          'Watsons Pharmacy',
          'Guardian Pharmacy',
          'Caring Pharmacy',
          'KPJ checkup',
        ],
        hotels: ['Hilton KL', 'Berjaya Times Square', 'Sunway Resort', 'Genting First World'],
        flights: ['AirAsia', 'Malaysia Airlines', 'Batik Air', 'Firefly'],
      },
      notes: {
        salary: 'Gaji masuk dah',
        bonus: 'Year-end bonus',
        freelance: 'Side project',
        consulting: 'Advisory retainer',
        dividends: 'StashAway dividend',
        interest: 'FD interest',
        rent: 'Sewa kondo bulan ni',
        utilities: 'Letrik + air',
        internet: 'Unifi 500Mbps',
        fitness: 'Gym bulanan',
        homeSupplies: 'Tesco run, restock barang',
        subscriptions: ['Astro pakej family', 'Spotify Family', 'iCloud 200GB'],
        education: 'Udemy course, kepala panas',
        atmWithdrawal: 'ATM Maybank tarik tunai',
        parkingPrimary: 'Mall parking',
        parkingAlternate: 'TnG tol',
        savingsTransfer: 'Pindah masuk CIMB',
        investmentTransfer: 'StashAway top-up bulanan',
        travelTopUp: 'Tabung cuti-cuti',
        localTravel: 'KLIA Ekspres ke airport',
        tripDining: 'Trip makan-makan',
        holidayGifts: 'Duit raya bagi sedara',
        familyCelebration: 'CNY reunion makan',
        cardPayment: 'Bayar credit card',
      },
      subscriptions: [69.9, 19.9, 12],
      income: {
        salaryBase: 6700,
        salaryGrowth: 25,
        salaryCycleBump: 18,
        bonusBase: 1850,
        bonusGrowth: 28,
        bonusSpread: 240,
        freelanceBase: 620,
        freelanceGrowth: 14,
        freelanceSpread: 160,
        consultingBase: 380,
        consultingStep: 70,
        consultingSpread: 110,
        dividendsBase: 78,
        dividendsGrowth: 3,
        dividendsSpread: 22,
        interestBase: 26,
        interestGrowth: 0.8,
        interestSpread: 7,
      },
      housing: {
        rentBase: 1850,
        rentGrowth: 2,
        rentSpread: 25,
        utilitiesBase: 168,
        utilitiesSpread: 32,
        internetBase: 139,
        internetSpread: 8,
        fitnessBase: 158,
        fitnessSpread: 6,
        homeSuppliesBase: 78,
        homeSuppliesSpread: 28,
        healthcareBase: 145,
        healthcareSpread: 50,
        educationBase: 180,
        educationSpread: 60,
      },
      weekly: {
        cashTopUpFourWeek: 360,
        cashTopUpFiveWeek: 440,
        cashTopUpSpread: 40,
        groceryBase: 165,
        groceryWeekStep: 8,
        grocerySpread: 32,
        diningBase: 95,
        diningWeekStep: 6,
        diningSpread: 28,
        coffeeBase: 13.5,
        coffeeSpread: 4,
        fuelBase: 110,
        fuelSpread: 22,
        parkingPrimaryBase: 14,
        parkingPrimarySpread: 5,
        parkingAlternateBase: 6.5,
        parkingAlternateSpread: 2.5,
      },
      lifestyle: {
        shoppingBase: 145,
        shoppingTripStep: 55,
        shoppingSpread: 60,
        entertainmentBase: 78,
        entertainmentTripStep: 36,
        entertainmentSpread: 28,
        rideshareBase: 32,
        rideshareSpread: 12,
      },
      transfers: {
        savingsBase: 850,
        savingsGrowth: 22,
        savingsSpread: 80,
        investmentBase: 600,
        investmentGrowth: 18,
        investmentSpread: 60,
        travelBase: 220,
        travelPeak: 620,
        travelSpread: 70,
        cardPaymentRatio: 0.96,
      },
      travel: {
        months: [3, 11],
        giftMonth: 1,
        flightsBase: 720,
        flightsSpread: 180,
        hotelsBase: 980,
        hotelsSpread: 220,
        localTransitBase: 96,
        localTransitSpread: 28,
        diningBase: 165,
        diningSpread: 45,
        holidayGiftsBase: 680,
        holidayGiftsSpread: 180,
        familyCelebrationBase: 420,
        familyCelebrationSpread: 110,
      },
      extras: {
        weekendBrunchCount: 3,
        weekendBrunchBase: 48,
        weekendBrunchSpread: 18,
        weekendBrunchMerchants: [
          'PappaRich brunch',
          'Old Town kopitiam',
          'Yut Kee weekend',
          "Devi's Corner roti",
          'Antipodean Bangsar',
        ],
        weekendBrunchNote: 'Sunday brunch session',
        bubbleTeaCount: 5,
        bubbleTeaBase: 14.5,
        bubbleTeaSpread: 4,
        bubbleTeaMerchants: ['Tealive', 'Chagee', 'Gong Cha', 'Sharetea', 'Coco Fresh'],
        hangoutBase: 95,
        hangoutSpread: 35,
        hangoutMerchants: [
          'Bangsar yumcha',
          'TREC KL lepak',
          'PJ Mamak supper',
          'Jalan Alor street food',
          'Cheras kopitiam lim teh',
        ],
        hangoutNote: 'Yumcha lepak session',
        deliveryCount: 4,
        deliveryBase: 32,
        deliverySpread: 12,
        deliveryMerchants: [
          'GrabFood tapau',
          'foodpanda',
          'ShopeeFood promo',
          'McDelivery midnight',
        ],
        deliveryNote: 'Tapau supper, malas masak',
        rideshareExtraCount: 3,
        rideshareExtraBase: 22,
        rideshareExtraSpread: 9,
        convenienceCount: 6,
        convenienceBase: 18,
        convenienceSpread: 7,
        convenienceMerchants: [
          '7-Eleven',
          'Family Mart',
          'KK Super Mart',
          'MyNews',
          'Speedmart 99',
        ],
      },
    },
    albums: [
      {
        name: 'Bali Trip',
        placeName: 'Bali',
        placeAdmin: 'Indonesia',
        countryCode: 'ID',
        latitude: -8.4095,
        longitude: 115.1889,
      },
      {
        name: 'Tokyo Holiday',
        placeName: 'Tokyo',
        placeAdmin: 'Japan',
        countryCode: 'JP',
        latitude: 35.6762,
        longitude: 139.6503,
      },
      {
        name: 'Bangkok Weekend',
        placeName: 'Bangkok',
        placeAdmin: 'Thailand',
        countryCode: 'TH',
        latitude: 13.7563,
        longitude: 100.5018,
      },
      {
        name: 'Langkawi Getaway',
        placeName: 'Langkawi',
        placeAdmin: 'Kedah',
        countryCode: 'MY',
        latitude: 6.35,
        longitude: 99.8,
      },
    ],
    items: [
      {
        name: 'iPhone 15 Pro',
        iconId: 'smartphone',
        purchaseMonthsAgo: 12,
        purchaseDay: 21,
        purchasePrice: 5499,
        note: 'Natural Titanium 256GB',
      },
      {
        name: 'ASUS Zenbook 14',
        iconId: 'laptop',
        purchaseMonthsAgo: 18,
        purchaseDay: 7,
        purchasePrice: 4999,
      },
      {
        name: 'Sony WH-1000XM5',
        iconId: 'headphones',
        purchaseMonthsAgo: 8,
        purchaseDay: 15,
        purchasePrice: 1799,
      },
      {
        name: 'Apple Watch S9',
        iconId: 'smartwatch',
        purchaseMonthsAgo: 10,
        purchaseDay: 2,
        purchasePrice: 1899,
      },
      {
        name: 'DJI Osmo Pocket 3',
        iconId: 'action-camera',
        purchaseMonthsAgo: 9,
        purchaseDay: 24,
        purchasePrice: 2199,
        note: 'Travel vlogging',
      },
      {
        name: 'Dyson V12 Detect',
        iconId: 'cordless-vacuum',
        purchaseMonthsAgo: 21,
        purchaseDay: 12,
        purchasePrice: 2799,
      },
      {
        name: 'Nintendo Switch OLED',
        iconId: 'handheld-game-console',
        purchaseMonthsAgo: 27,
        purchaseDay: 5,
        purchasePrice: 1299,
      },
      {
        name: 'iPhone 12 (sold)',
        iconId: 'smartphone',
        purchaseMonthsAgo: 36,
        purchaseDay: 16,
        purchasePrice: 3199,
        retiredMonthsAgo: 12,
        salePrice: 900,
        note: 'Sold to upgrade',
      },
    ],
  },
  malaysian_zh: {
    seed: 20260424,
    locale: 'zh',
    currencyCode: 'MYR',
    currencySymbol: 'RM',
    accountGroups: {
      everyday: '日常',
      goals: '目标',
      credit: '信用',
      investing: '投资',
    },
    accounts: {
      checking: { name: '马银行', startingBalance: 4850, logoId: 'malaysia/maybank' },
      savings: { name: '联昌定期', startingBalance: 28600, logoId: 'malaysia/cimb' },
      travel: { name: 'Cuti 基金', startingBalance: 2400, logoId: 'malaysia/hsbc-malaysia' },
      card: { name: '马银行信用卡', startingBalance: 320, logoId: 'malaysia/maybank' },
      cash: { name: '钱包现金', startingBalance: 180, logoId: 'malaysia/touch-n-go-ewallet' },
      brokerage: { name: 'StashAway', startingBalance: 16800, logoId: 'malaysia/stashaway' },
    },
    extraAccounts: [
      {
        name: 'GrabPay',
        type: 'debit',
        startingBalance: 220,
        logoId: 'malaysia/grabpay',
        groupKey: 'everyday',
      },
      {
        name: 'Boost',
        type: 'debit',
        startingBalance: 140,
        logoId: 'malaysia/boost-bank',
        groupKey: 'everyday',
      },
      {
        name: 'Wise',
        type: 'debit',
        startingBalance: 1900,
        logoId: 'global/wise',
        groupKey: 'everyday',
      },
      {
        name: 'Rakuten Trade',
        type: 'debit',
        startingBalance: 7400,
        logoId: 'malaysia/rakuten-trade',
        groupKey: 'investing',
      },
      {
        name: '联昌现金回扣卡',
        type: 'credit',
        startingBalance: 640,
        logoId: 'malaysia/cimb',
        groupKey: 'credit',
      },
      {
        name: 'UOB One 卡',
        type: 'credit',
        startingBalance: 920,
        logoId: 'malaysia/uob-malaysia',
        groupKey: 'credit',
      },
      {
        name: '丰隆 Wise 卡',
        type: 'credit',
        startingBalance: 410,
        logoId: 'malaysia/hong-leong-bank',
        groupKey: 'credit',
      },
      {
        name: 'AEON 信用卡',
        type: 'credit',
        startingBalance: 280,
        logoId: 'malaysia/aeon-bank',
        groupKey: 'credit',
      },
    ],
    categories: MALAYSIAN_ZH_CATEGORIES,
    wageHistory: {
      baseAmount: 5800,
      monthlyGrowth: 22,
      yearlyStep: 180,
      hoursBase: 45,
      commuteBase: 50,
      commuteStep: 8,
    },
    recurring: {
      salary: { name: 'Gaji 入账', amount: 6800, note: '这个月 gaji' },
      rent: { name: '屋租', amount: 1850, note: '公寓屋租' },
      fitness: { name: '健身月费', amount: 158, note: 'Anytime Fitness' },
      subscriptions: [
        { name: 'Astro 家庭配套', amount: 89.9, note: 'Astro 家庭配套' },
        { name: 'Netflix', amount: 54.9, note: 'Netflix 高级版' },
        { name: 'Spotify 家庭版', amount: 23.9, note: 'Spotify Family' },
        { name: 'Disney+ Hotstar', amount: 19.9, note: 'Disney+ Hotstar' },
        { name: 'iCloud+', amount: 11.9, note: 'iCloud 200GB' },
      ],
      investment: { name: 'StashAway 月供', amount: 600, note: 'StashAway 每月供款' },
    },
    transactions: {
      merchants: {
        grocery: [
          '永旺 AEON',
          "Lotus's 莲花",
          '巨人 Giant',
          'Mydin 美丹',
          'Jaya Grocer',
          '99 速达',
          '巴刹买菜',
        ],
        dining: [
          '茨厂街云吞面',
          '巴生肉骨茶',
          '海南鸡饭档',
          '槟城炒粿条',
          '嘛嘛档 Mamak',
          'Devi 印度煎饼',
          '旧街场白咖啡',
          '茶餐室经济饭',
          '寿司王',
          'PJ 大牌档',
        ],
        coffee: ['ZUS 咖啡', '星巴克 KLCC', 'Coffee Bean', '茶餐室 lim kopi', '老街场早茶'],
        fuel: ['Petronas 国油', 'Shell 壳牌', 'Petron 95', 'BHPetrol'],
        shopping: [
          'Pavilion 柏威年',
          'Mid Valley 谷中城',
          '1 Utama 万达广场',
          'Sunway Pyramid 双威',
          'IKEA 宜家',
          '屈臣氏 Watsons',
          'Uniqlo',
          'Mr DIY',
        ],
        entertainment: [
          'GSC 金狮戏院',
          'TGV 戏院',
          '云顶 Genting',
          'Sunway Lagoon 水上乐园',
          'Aquaria 水族馆',
          'KTV 包厢',
        ],
        rideshare: ['Grab 召车', 'Grab Bike 摩多', 'AirAsia Ride', '德士'],
        healthcare: ['私人诊所', '屈臣氏药房', 'Guardian 药房', 'Caring 康宁药剂', 'KPJ 检查'],
        hotels: ['希尔顿 KL', '云顶第一酒店', 'Sunway 度假村', 'Berjaya 时代广场'],
        flights: ['亚航 AirAsia', '马航 MAS', '萤火虫 Firefly', 'Batik Air'],
      },
      notes: {
        salary: 'Gaji 入账啦',
        bonus: '年终花红',
        freelance: '副业进账',
        consulting: '顾问 fee',
        dividends: 'StashAway 派息',
        interest: '定期利息',
        rent: '公寓屋租',
        utilities: 'TNB + 水费',
        internet: 'Unifi 500Mbps',
        fitness: 'Anytime Fitness 月费',
        homeSupplies: '巴刹补货 + 日用品',
        subscriptions: ['Astro 家庭配套', 'Spotify 家庭', 'iCloud 200GB'],
        education: 'Udemy 课程',
        atmWithdrawal: '马银行 ATM 提款',
        parkingPrimary: '商场泊车',
        parkingAlternate: 'TnG 过路费',
        savingsTransfer: '过账去 CIMB 储蓄',
        investmentTransfer: 'StashAway 月供款',
        travelTopUp: 'Cuti-cuti 基金',
        localTravel: 'KLIA Ekspres 快铁',
        tripDining: '旅行 yumcha',
        holidayGifts: 'Hari Raya duit raya',
        familyCelebration: '新年团圆饭',
        cardPayment: '还信用卡',
      },
      subscriptions: [69.9, 19.9, 12],
      income: {
        salaryBase: 6700,
        salaryGrowth: 25,
        salaryCycleBump: 18,
        bonusBase: 1850,
        bonusGrowth: 28,
        bonusSpread: 240,
        freelanceBase: 620,
        freelanceGrowth: 14,
        freelanceSpread: 160,
        consultingBase: 380,
        consultingStep: 70,
        consultingSpread: 110,
        dividendsBase: 78,
        dividendsGrowth: 3,
        dividendsSpread: 22,
        interestBase: 26,
        interestGrowth: 0.8,
        interestSpread: 7,
      },
      housing: {
        rentBase: 1850,
        rentGrowth: 2,
        rentSpread: 25,
        utilitiesBase: 168,
        utilitiesSpread: 32,
        internetBase: 139,
        internetSpread: 8,
        fitnessBase: 158,
        fitnessSpread: 6,
        homeSuppliesBase: 78,
        homeSuppliesSpread: 28,
        healthcareBase: 145,
        healthcareSpread: 50,
        educationBase: 180,
        educationSpread: 60,
      },
      weekly: {
        cashTopUpFourWeek: 360,
        cashTopUpFiveWeek: 440,
        cashTopUpSpread: 40,
        groceryBase: 165,
        groceryWeekStep: 8,
        grocerySpread: 32,
        diningBase: 95,
        diningWeekStep: 6,
        diningSpread: 28,
        coffeeBase: 13.5,
        coffeeSpread: 4,
        fuelBase: 110,
        fuelSpread: 22,
        parkingPrimaryBase: 14,
        parkingPrimarySpread: 5,
        parkingAlternateBase: 6.5,
        parkingAlternateSpread: 2.5,
      },
      lifestyle: {
        shoppingBase: 145,
        shoppingTripStep: 55,
        shoppingSpread: 60,
        entertainmentBase: 78,
        entertainmentTripStep: 36,
        entertainmentSpread: 28,
        rideshareBase: 32,
        rideshareSpread: 12,
      },
      transfers: {
        savingsBase: 850,
        savingsGrowth: 22,
        savingsSpread: 80,
        investmentBase: 600,
        investmentGrowth: 18,
        investmentSpread: 60,
        travelBase: 220,
        travelPeak: 620,
        travelSpread: 70,
        cardPaymentRatio: 0.96,
      },
      travel: {
        months: [3, 11],
        giftMonth: 1,
        flightsBase: 720,
        flightsSpread: 180,
        hotelsBase: 980,
        hotelsSpread: 220,
        localTransitBase: 96,
        localTransitSpread: 28,
        diningBase: 165,
        diningSpread: 45,
        holidayGiftsBase: 680,
        holidayGiftsSpread: 180,
        familyCelebrationBase: 420,
        familyCelebrationSpread: 110,
      },
      extras: {
        weekendBrunchCount: 3,
        weekendBrunchBase: 48,
        weekendBrunchSpread: 18,
        weekendBrunchMerchants: [
          'PappaRich 早茶',
          '旧街场早餐',
          '点心餐室',
          'Devi 印度煎饼',
          '茶餐室 brunch',
        ],
        weekendBrunchNote: '周末 yumcha',
        bubbleTeaCount: 5,
        bubbleTeaBase: 14.5,
        bubbleTeaSpread: 4,
        bubbleTeaMerchants: ['Tealive', '霸王茶姬 Chagee', '贡茶', 'Sharetea', 'Coco 都可'],
        hangoutBase: 95,
        hangoutSpread: 35,
        hangoutMerchants: [
          '孟沙 Bangsar bar',
          'TREC KL lepak',
          'PJ 嘛嘛档宵夜',
          '茨厂街夜市',
          'Cheras 茶餐室',
        ],
        hangoutNote: 'Yumcha lepak 时间',
        deliveryCount: 4,
        deliveryBase: 32,
        deliverySpread: 12,
        deliveryMerchants: ['GrabFood 打包', 'foodpanda', 'ShopeeFood 优惠', 'McDelivery 宵夜'],
        deliveryNote: 'Tapau 宵夜，懒得煮',
        rideshareExtraCount: 3,
        rideshareExtraBase: 22,
        rideshareExtraSpread: 9,
        convenienceCount: 6,
        convenienceBase: 18,
        convenienceSpread: 7,
        convenienceMerchants: ['7-Eleven', 'Family Mart', 'KK 超市', 'MyNews', '99 速达'],
      },
    },
    albums: [
      {
        name: '巴厘岛之旅',
        placeName: '巴厘岛',
        placeAdmin: '印尼',
        countryCode: 'ID',
        latitude: -8.4095,
        longitude: 115.1889,
      },
      {
        name: '东京假期',
        placeName: '东京',
        placeAdmin: '日本',
        countryCode: 'JP',
        latitude: 35.6762,
        longitude: 139.6503,
      },
      {
        name: '曼谷周末游',
        placeName: '曼谷',
        placeAdmin: '泰国',
        countryCode: 'TH',
        latitude: 13.7563,
        longitude: 100.5018,
      },
      {
        name: '浮罗交怡',
        placeName: '浮罗交怡',
        placeAdmin: '吉打',
        countryCode: 'MY',
        latitude: 6.35,
        longitude: 99.8,
      },
    ],
    items: [
      {
        name: 'iPhone 15 Pro',
        iconId: 'smartphone',
        purchaseMonthsAgo: 12,
        purchaseDay: 21,
        purchasePrice: 5499,
        note: '原色钛金属 256G',
      },
      {
        name: '华硕 Zenbook 14',
        iconId: 'laptop',
        purchaseMonthsAgo: 18,
        purchaseDay: 7,
        purchasePrice: 4999,
      },
      {
        name: '索尼 WH-1000XM5',
        iconId: 'headphones',
        purchaseMonthsAgo: 8,
        purchaseDay: 15,
        purchasePrice: 1799,
      },
      {
        name: 'Apple Watch S9',
        iconId: 'smartwatch',
        purchaseMonthsAgo: 10,
        purchaseDay: 2,
        purchasePrice: 1899,
      },
      {
        name: '大疆 Osmo Pocket 3',
        iconId: 'action-camera',
        purchaseMonthsAgo: 9,
        purchaseDay: 24,
        purchasePrice: 2199,
        note: '旅行 vlog',
      },
      {
        name: '戴森 V12 吸尘器',
        iconId: 'cordless-vacuum',
        purchaseMonthsAgo: 21,
        purchaseDay: 12,
        purchasePrice: 2799,
      },
      {
        name: '任天堂 Switch OLED',
        iconId: 'handheld-game-console',
        purchaseMonthsAgo: 27,
        purchaseDay: 5,
        purchasePrice: 1299,
      },
      {
        name: 'iPhone 12（已出）',
        iconId: 'smartphone',
        purchaseMonthsAgo: 36,
        purchaseDay: 16,
        purchasePrice: 3199,
        retiredMonthsAgo: 12,
        salePrice: 900,
        note: '升级后转卖',
      },
    ],
  },
};

const PREVIEW_START_YEAR = 2025;
const PREVIEW_START_MONTH_INDEX = 0;
const WAGE_HISTORY_MONTHS = 48;

function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function jitter(base: number, spread: number, random: RandomFn) {
  return roundAmount(base + (random() - 0.5) * spread * 2);
}

function clampDay(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

function monthStart(date: Date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 12));
}

function compareMonthStarts(left: Date, right: Date) {
  return left.getTime() - right.getTime();
}

function getPreviewMonths() {
  const startMonth = new Date(Date.UTC(PREVIEW_START_YEAR, PREVIEW_START_MONTH_INDEX, 1, 12));
  const minimumEndMonth = new Date(Date.UTC(PREVIEW_START_YEAR, 11, 1, 12));
  const currentMonth = monthStart(new Date());
  const endMonth =
    compareMonthStarts(currentMonth, minimumEndMonth) > 0 ? currentMonth : minimumEndMonth;
  const months: Date[] = [];

  for (
    let cursor = startMonth;
    compareMonthStarts(cursor, endMonth) <= 0;
    cursor = monthStart(cursor, 1)
  ) {
    months.push(cursor);
  }

  return months;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function monthIso(date: Date, day: number, hour = 12) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month, clampDay(year, month, day), hour)).toISOString();
}

function pick<T>(items: readonly T[], random: RandomFn): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function purgePreviewData() {
  const db = getDb();
  db.delete(albumTransactionsTable).run();
  db.delete(albumsTable).run();
  db.delete(itemsTable).run();
  db.delete(transactionsTable).run();
  db.delete(recurringRulesTable).run();
  db.delete(categoriesTable).run();
  db.delete(accountsTable).run();
  db.delete(accountGroupsTable).run();
  db.delete(monthlyWageSettingsTable).run();
}

function getPreviewProfile(profile: PreviewSeedProfile) {
  return PREVIEW_PROFILES[profile];
}

function createAccounts(profile: PreviewProfile): AccountRefs {
  ACCOUNT_GROUP_ORDER.forEach((groupKey, index) => {
    accountGroupsRepository.create(profile.accountGroups[groupKey], index);
  });

  const refs = {
    checking: createAccount(profile, 'checking'),
    savings: createAccount(profile, 'savings'),
    travel: createAccount(profile, 'travel'),
    card: createAccount(profile, 'card'),
    cash: createAccount(profile, 'cash'),
    brokerage: createAccount(profile, 'brokerage'),
  };

  const baseSortOrder = Object.keys(ACCOUNT_META).length;
  profile.extraAccounts.forEach((extra, index) => {
    accountsRepository.create({
      name: extra.name,
      type: extra.type,
      currency: profile.currencySymbol,
      startingBalance: extra.startingBalance,
      includeInTotals: true,
      accountGroup: profile.accountGroups[extra.groupKey],
      creditStatementDay: null,
      creditDueDay: null,
      sortOrder: baseSortOrder + index,
      logoId: extra.logoId,
    });
  });

  return refs;
}

function createAccount(profile: PreviewProfile, key: AccountKey) {
  const account = profile.accounts[key];
  const meta = ACCOUNT_META[key];
  return accountsRepository.create({
    name: account.name,
    type: meta.type,
    currency: profile.currencySymbol,
    startingBalance: account.startingBalance,
    includeInTotals: true,
    accountGroup: profile.accountGroups[meta.groupKey],
    creditStatementDay: meta.creditStatementDay,
    creditDueDay: meta.creditDueDay,
    sortOrder: meta.sortOrder,
    logoId: account.logoId,
  });
}

function createCategories(profile: PreviewProfile): CategoryRefs {
  const ids = {} as CategoryRefs;

  CATEGORY_BLUEPRINT.forEach((item) => {
    ids[item.key as CategoryKey] = categoriesRepository.create({
      name: profile.categories[item.key as CategoryKey],
      type: item.type,
      icon: item.icon,
      parentId: item.parentKey ? (ids[item.parentKey as CategoryKey] ?? null) : null,
      isDefault: false,
    });
  });

  return ids;
}

// One-time commute reduction (a move closer to work / hybrid switch) lands at
// ~60% through the history so the back portion of the hourly-value chart shows
// an intentional step-up rather than month-to-month noise.
const COMMUTE_DROP_INDEX = Math.floor(WAGE_HISTORY_MONTHS * 0.6);

function seedWageHistory(profile: PreviewProfile) {
  const currentMonth = monthStart(new Date());
  const wageHistory = profile.wageHistory;

  for (let index = 0; index < WAGE_HISTORY_MONTHS; index += 1) {
    const monthDate = monthStart(currentMonth, index - (WAGE_HISTORY_MONTHS - 1));
    const yearsElapsed = Math.floor(index / 12);

    // Salary climbs as a clean upward curve: a steady monthly merit creep plus a
    // larger raise on each completed year. Monotonic by design, so the derived
    // hourly value reads as real income growth instead of scattered data points.
    const wageAmount = roundAmount(
      wageHistory.baseAmount +
        index * wageHistory.monthlyGrowth +
        yearsElapsed * wageHistory.yearlyStep,
    );

    // Hours stay flat and commute changes only once, so the true hourly rate
    // tracks pay rather than bookkeeping jitter.
    const commuteMinutesPerWorkday =
      index >= COMMUTE_DROP_INDEX
        ? Math.max(0, wageHistory.commuteBase - wageHistory.commuteStep)
        : wageHistory.commuteBase;

    const config: WageConfig = {
      wageType: 'monthly',
      wageAmount,
      hoursWorkedPerWeek: wageHistory.hoursBase,
      workdaysPerWeek: 5,
      commuteMinutesPerWorkday,
    };

    monthlyWageRepository.saveForMonth(monthKey(monthDate), config);
  }
}

function seedRecurringRules(
  profile: PreviewProfile,
  accounts: AccountRefs,
  categories: CategoryRefs,
) {
  const nextMonth = monthStart(new Date(), 1);
  const recurring = profile.recurring;

  recurringRulesRepository.create({
    name: recurring.salary.name,
    type: 'income',
    amount: recurring.salary.amount,
    currency: profile.currencySymbol,
    accountId: accounts.checking,
    categoryId: categories.salary,
    note: recurring.salary.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 1, 10),
  });

  recurringRulesRepository.create({
    name: recurring.rent.name,
    type: 'expense',
    amount: recurring.rent.amount,
    currency: profile.currencySymbol,
    accountId: accounts.checking,
    categoryId: categories.rent,
    note: recurring.rent.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 2, 9),
  });

  recurringRulesRepository.create({
    name: recurring.fitness.name,
    type: 'expense',
    amount: recurring.fitness.amount,
    currency: profile.currencySymbol,
    accountId: accounts.checking,
    categoryId: categories.fitness,
    note: recurring.fitness.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 12, 9),
  });

  recurring.subscriptions.forEach((subscription, index) => {
    recurringRulesRepository.create({
      name: subscription.name,
      type: 'expense',
      amount: subscription.amount,
      currency: profile.currencySymbol,
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: subscription.note,
      recurrencePattern: 'monthly',
      nextRunDate: monthIso(nextMonth, 5 + index * 2, 9),
    });
  });

  recurringRulesRepository.create({
    name: recurring.investment.name,
    type: 'transfer',
    amount: recurring.investment.amount,
    currency: profile.currencySymbol,
    fromAccountId: accounts.checking,
    toAccountId: accounts.brokerage,
    note: recurring.investment.note,
    recurrencePattern: 'monthly',
    nextRunDate: monthIso(nextMonth, 18, 9),
  });

  // salary + rent + fitness + investment + one rule per subscription service
  return 4 + recurring.subscriptions.length;
}

function randomSentiment(type: string, random: RandomFn): TransactionSentiment {
  const r = random();
  if (type === 'income') {
    if (r < 0.55) return 'happy';
    if (r < 0.85) return 'neutral';
    return 'sad';
  }
  if (type === 'expense') {
    if (r < 0.25) return 'happy';
    if (r < 0.6) return 'neutral';
    return 'sad';
  }
  return 'neutral';
}

interface PreviewTrip {
  date: Date;
  transactionIds: string[];
}

function seedTransactions(
  profile: PreviewProfile,
  accounts: AccountRefs,
  categories: CategoryRefs,
): { count: number; trips: PreviewTrip[] } {
  const random = createSeededRandom(profile.seed);
  const previewMonths = getPreviewMonths();
  const {
    merchants,
    notes,
    subscriptions,
    income,
    housing,
    weekly,
    lifestyle,
    transfers,
    travel,
    extras,
  } = profile.transactions;
  const subscriptionTotal = subscriptions.reduce((sum, amount) => sum + amount, 0);

  let transactionCount = 0;
  // Trip spend grouped by travel month, so albums can be linked to the actual
  // flight/hotel/dining transactions afterwards.
  const trips: PreviewTrip[] = [];

  const add = (
    input: Parameters<typeof transactionsRepository.create>[0],
    multiplier = 1,
  ): string => {
    let lastId = '';
    for (let index = 0; index < multiplier; index += 1) {
      lastId = transactionsRepository.create({
        ...input,
        sentiment: input.sentiment ?? randomSentiment(input.type, random),
      });
      transactionCount += 1;
    }
    return lastId;
  };

  for (let index = 0; index < previewMonths.length; index += 1) {
    const monthDate = previewMonths[index];
    if (!monthDate) continue;

    const monthNumber = monthDate.getUTCMonth();
    const salaryAmount = roundAmount(
      income.salaryBase + index * income.salaryGrowth + (index % 4) * income.salaryCycleBump,
    );
    const freelanceAmount = jitter(
      income.freelanceBase + index * income.freelanceGrowth,
      income.freelanceSpread,
      random,
    );
    const consultingAmount = jitter(
      income.consultingBase + (index % 3) * income.consultingStep,
      income.consultingSpread,
      random,
    );

    add({
      type: 'income',
      amount: salaryAmount,
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 1, 10),
      accountId: accounts.checking,
      categoryId: categories.salary,
      note: notes.salary,
    });

    if (index % 6 === 2 || index % 6 === 5) {
      add({
        type: 'income',
        amount: jitter(income.bonusBase + index * income.bonusGrowth, income.bonusSpread, random),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 15, 10),
        accountId: accounts.checking,
        categoryId: categories.bonus,
        note: notes.bonus,
      });
    }

    add({
      type: 'income',
      amount: freelanceAmount,
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 11 + (index % 4), 10),
      accountId: accounts.checking,
      categoryId: categories.freelance,
      note: notes.freelance,
    });

    if (index % 2 === 0) {
      add({
        type: 'income',
        amount: consultingAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 22 - (index % 3), 10),
        accountId: accounts.checking,
        categoryId: categories.consulting,
        note: notes.consulting,
      });
    }

    if (index % 3 === 1) {
      add({
        type: 'income',
        amount: jitter(
          income.dividendsBase + index * income.dividendsGrowth,
          income.dividendsSpread,
          random,
        ),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 20, 10),
        accountId: accounts.brokerage,
        categoryId: categories.dividends,
        note: notes.dividends,
      });
    }

    add({
      type: 'income',
      amount: jitter(
        income.interestBase + index * income.interestGrowth,
        income.interestSpread,
        random,
      ),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 27, 10),
      accountId: accounts.savings,
      categoryId: categories.interest,
      note: notes.interest,
    });

    add({
      type: 'expense',
      amount: jitter(housing.rentBase + index * housing.rentGrowth, housing.rentSpread, random),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 2, 9),
      accountId: accounts.checking,
      categoryId: categories.rent,
      note: notes.rent,
    });

    add({
      type: 'expense',
      amount: jitter(housing.utilitiesBase, housing.utilitiesSpread, random),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 5, 9),
      accountId: accounts.checking,
      categoryId: categories.utilities,
      note: notes.utilities,
    });

    add({
      type: 'expense',
      amount: jitter(housing.internetBase, housing.internetSpread, random),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 7, 9),
      accountId: accounts.checking,
      categoryId: categories.internet,
      note: notes.internet,
    });

    add({
      type: 'expense',
      amount: jitter(housing.fitnessBase, housing.fitnessSpread, random),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 12, 9),
      accountId: accounts.checking,
      categoryId: categories.fitness,
      note: notes.fitness,
    });

    add({
      type: 'expense',
      amount: jitter(housing.homeSuppliesBase, housing.homeSuppliesSpread, random),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 23, 9),
      accountId: accounts.checking,
      categoryId: categories.home_supplies,
      note: notes.homeSupplies,
    });

    add({
      type: 'expense',
      amount: subscriptions[0],
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 9, 9),
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: notes.subscriptions[0],
    });

    add({
      type: 'expense',
      amount: subscriptions[1],
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 11, 9),
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: notes.subscriptions[1],
    });

    add({
      type: 'expense',
      amount: subscriptions[2],
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 13, 9),
      accountId: accounts.card,
      categoryId: categories.subscriptions,
      note: notes.subscriptions[2],
    });

    let creditSpend = subscriptionTotal;

    if (index % 3 === 0) {
      add({
        type: 'expense',
        amount: jitter(housing.healthcareBase, housing.healthcareSpread, random),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 18, 10),
        accountId: accounts.checking,
        categoryId: categories.healthcare,
        note: pick(merchants.healthcare, random),
      });
    }

    if (index % 4 === 1) {
      const educationAmount = jitter(housing.educationBase, housing.educationSpread, random);
      add({
        type: 'expense',
        amount: educationAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 21, 10),
        accountId: accounts.card,
        categoryId: categories.education,
        note: notes.education,
      });
      creditSpend += educationAmount;
    }

    const weekCount = index % 2 === 0 ? 4 : 5;
    const cashTopUpAmount = jitter(
      weekCount === 5 ? weekly.cashTopUpFiveWeek : weekly.cashTopUpFourWeek,
      weekly.cashTopUpSpread,
      random,
    );

    add({
      type: 'transfer',
      amount: cashTopUpAmount,
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 2, 7),
      fromAccountId: accounts.checking,
      toAccountId: accounts.cash,
      note: notes.atmWithdrawal,
    });

    for (let week = 0; week < weekCount; week += 1) {
      const groceryAmount = jitter(
        weekly.groceryBase + week * weekly.groceryWeekStep,
        weekly.grocerySpread,
        random,
      );
      const diningAmount = jitter(
        weekly.diningBase + week * weekly.diningWeekStep,
        weekly.diningSpread,
        random,
      );
      const coffeeAmount = jitter(weekly.coffeeBase, weekly.coffeeSpread, random);
      const fuelAmount = jitter(weekly.fuelBase, weekly.fuelSpread, random);

      add({
        type: 'expense',
        amount: groceryAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 4 + week * 6, 11),
        accountId: accounts.card,
        categoryId: categories.groceries,
        note: pick(merchants.grocery, random),
      });
      creditSpend += groceryAmount;

      add({
        type: 'expense',
        amount: diningAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 6 + week * 6, 19),
        accountId: accounts.card,
        categoryId: categories.dining,
        note: pick(merchants.dining, random),
      });
      creditSpend += diningAmount;

      add({
        type: 'expense',
        amount: coffeeAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 2 + week * 6, 8),
        accountId: accounts.cash,
        categoryId: categories.coffee,
        note: pick(merchants.coffee, random),
      });

      if (week < 3 || index % 3 === 0) {
        add({
          type: 'expense',
          amount: fuelAmount,
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 7 + week * 6, 18),
          accountId: accounts.card,
          categoryId: categories.fuel,
          note: pick(merchants.fuel, random),
        });
        creditSpend += fuelAmount;
      }

      if (week % 2 === 0) {
        add({
          type: 'expense',
          amount: jitter(weekly.parkingPrimaryBase, weekly.parkingPrimarySpread, random),
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 8 + week * 6, 18),
          accountId: accounts.cash,
          categoryId: categories.parking,
          note: notes.parkingPrimary,
        });
      } else {
        add({
          type: 'expense',
          amount: jitter(weekly.parkingAlternateBase, weekly.parkingAlternateSpread, random),
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 8 + week * 6, 18),
          accountId: accounts.cash,
          categoryId: categories.parking,
          note: notes.parkingAlternate,
        });
      }
    }

    const shoppingTrips = 1 + (index % 3);
    for (let trip = 0; trip < shoppingTrips; trip += 1) {
      const shoppingAmount = jitter(
        lifestyle.shoppingBase + trip * lifestyle.shoppingTripStep,
        lifestyle.shoppingSpread,
        random,
      );
      add({
        type: 'expense',
        amount: shoppingAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 10 + trip * 5, 16),
        accountId: accounts.card,
        categoryId: categories.shopping,
        note: pick(merchants.shopping, random),
      });
      creditSpend += shoppingAmount;
    }

    const entertainmentTrips = 1 + (index % 4 === 0 ? 1 : 0);
    for (let trip = 0; trip < entertainmentTrips; trip += 1) {
      const entertainmentAmount = jitter(
        lifestyle.entertainmentBase + trip * lifestyle.entertainmentTripStep,
        lifestyle.entertainmentSpread,
        random,
      );
      add({
        type: 'expense',
        amount: entertainmentAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 17 + trip * 6, 20),
        accountId: accounts.card,
        categoryId: categories.entertainment,
        note: pick(merchants.entertainment, random),
      });
      creditSpend += entertainmentAmount;
    }

    if (index % 2 === 1) {
      const rideshareAmount = jitter(lifestyle.rideshareBase, lifestyle.rideshareSpread, random);
      add({
        type: 'expense',
        amount: rideshareAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 19, 21),
        accountId: accounts.card,
        categoryId: categories.rideshare,
        note: pick(merchants.rideshare, random),
      });
      creditSpend += rideshareAmount;
    }

    add({
      type: 'transfer',
      amount: jitter(
        transfers.savingsBase + index * transfers.savingsGrowth,
        transfers.savingsSpread,
        random,
      ),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 3, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.savings,
      note: notes.savingsTransfer,
    });

    add({
      type: 'transfer',
      amount: jitter(
        transfers.investmentBase + index * transfers.investmentGrowth,
        transfers.investmentSpread,
        random,
      ),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 18, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.brokerage,
      note: notes.investmentTransfer,
    });

    add({
      type: 'transfer',
      amount: jitter(
        travel.months.includes(monthNumber) ? transfers.travelPeak : transfers.travelBase,
        transfers.travelSpread,
        random,
      ),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 20, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.travel,
      note: notes.travelTopUp,
    });

    if (travel.months.includes(monthNumber)) {
      const flightsId = add({
        type: 'expense',
        amount: jitter(travel.flightsBase, travel.flightsSpread, random),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 8, 11),
        accountId: accounts.travel,
        categoryId: categories.flights,
        note: pick(merchants.flights, random),
      });

      const hotelsId = add({
        type: 'expense',
        amount: jitter(travel.hotelsBase, travel.hotelsSpread, random),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 10, 11),
        accountId: accounts.travel,
        categoryId: categories.hotels,
        note: pick(merchants.hotels, random),
      });

      const localTransitId = add({
        type: 'expense',
        amount: jitter(travel.localTransitBase, travel.localTransitSpread, random),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 11, 11),
        accountId: accounts.travel,
        categoryId: categories.local_travel,
        note: notes.localTravel,
      });

      const tripDiningAmount = jitter(travel.diningBase, travel.diningSpread, random);
      const tripDiningId = add({
        type: 'expense',
        amount: tripDiningAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 12, 19),
        accountId: accounts.card,
        categoryId: categories.dining,
        note: notes.tripDining,
      });
      creditSpend += tripDiningAmount;

      trips.push({
        date: monthDate,
        transactionIds: [flightsId, hotelsId, localTransitId, tripDiningId],
      });
    }

    if (monthNumber === travel.giftMonth) {
      const holidayGiftAmount = jitter(travel.holidayGiftsBase, travel.holidayGiftsSpread, random);
      add({
        type: 'expense',
        amount: holidayGiftAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 16, 15),
        accountId: accounts.card,
        categoryId: categories.gifts,
        note: notes.holidayGifts,
      });
      creditSpend += holidayGiftAmount;

      add({
        type: 'expense',
        amount: jitter(travel.familyCelebrationBase, travel.familyCelebrationSpread, random),
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 22, 18),
        accountId: accounts.checking,
        categoryId: categories.gifts,
        note: notes.familyCelebration,
      });
    }

    if (extras) {
      for (let n = 0; n < extras.weekendBrunchCount; n += 1) {
        const brunchAmount = jitter(extras.weekendBrunchBase, extras.weekendBrunchSpread, random);
        add({
          type: 'expense',
          amount: brunchAmount,
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 6 + n * 7, 11),
          accountId: accounts.card,
          categoryId: categories.dining,
          note:
            pick(extras.weekendBrunchMerchants, random) +
            (extras.weekendBrunchNote ? ` · ${extras.weekendBrunchNote}` : ''),
        });
        creditSpend += brunchAmount;
      }

      for (let n = 0; n < extras.bubbleTeaCount; n += 1) {
        add({
          type: 'expense',
          amount: jitter(extras.bubbleTeaBase, extras.bubbleTeaSpread, random),
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 3 + n * 5, 15),
          accountId: accounts.cash,
          categoryId: categories.coffee,
          note: pick(extras.bubbleTeaMerchants, random),
        });
      }

      const hangoutAmount = jitter(extras.hangoutBase, extras.hangoutSpread, random);
      add({
        type: 'expense',
        amount: hangoutAmount,
        currency: profile.currencySymbol,
        date: monthIso(monthDate, 14 + (index % 4), 22),
        accountId: accounts.card,
        categoryId: categories.entertainment,
        note:
          pick(extras.hangoutMerchants, random) +
          (extras.hangoutNote ? ` · ${extras.hangoutNote}` : ''),
      });
      creditSpend += hangoutAmount;

      for (let n = 0; n < extras.deliveryCount; n += 1) {
        const deliveryAmount = jitter(extras.deliveryBase, extras.deliverySpread, random);
        add({
          type: 'expense',
          amount: deliveryAmount,
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 5 + n * 6, 22),
          accountId: accounts.card,
          categoryId: categories.dining,
          note:
            pick(extras.deliveryMerchants, random) +
            (extras.deliveryNote ? ` · ${extras.deliveryNote}` : ''),
        });
        creditSpend += deliveryAmount;
      }

      for (let n = 0; n < extras.rideshareExtraCount; n += 1) {
        const rideAmount = jitter(extras.rideshareExtraBase, extras.rideshareExtraSpread, random);
        add({
          type: 'expense',
          amount: rideAmount,
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 9 + n * 7, 22),
          accountId: accounts.card,
          categoryId: categories.rideshare,
          note: pick(merchants.rideshare, random),
        });
        creditSpend += rideAmount;
      }

      for (let n = 0; n < extras.convenienceCount; n += 1) {
        add({
          type: 'expense',
          amount: jitter(extras.convenienceBase, extras.convenienceSpread, random),
          currency: profile.currencySymbol,
          date: monthIso(monthDate, 2 + n * 5, 21),
          accountId: accounts.cash,
          categoryId: categories.home_supplies,
          note: pick(extras.convenienceMerchants, random),
        });
      }
    }

    add({
      type: 'transfer',
      amount: roundAmount(creditSpend * transfers.cardPaymentRatio),
      currency: profile.currencySymbol,
      date: monthIso(monthDate, 26, 10),
      fromAccountId: accounts.checking,
      toAccountId: accounts.card,
      note: notes.cardPayment,
    });
  }

  return { count: transactionCount, trips };
}

function seedAlbums(profile: PreviewProfile, trips: PreviewTrip[]) {
  if (profile.albums.length === 0 || trips.length === 0) return 0;

  // Pair albums (defined newest-first) with the most recent trips, newest first,
  // so each album card surfaces real flight/hotel/dining spend and its pin lands
  // on the destination.
  const recentTrips = trips.slice(-profile.albums.length).reverse();
  let created = 0;

  profile.albums.forEach((seed, index) => {
    const trip = recentTrips[index];
    if (!trip) return;

    const albumId = albumsRepository.create({
      name: seed.name,
      startDate: monthIso(trip.date, 7, 9),
      endDate: monthIso(trip.date, 13, 21),
      latitude: seed.latitude,
      longitude: seed.longitude,
      placeName: seed.placeName,
      placeAdmin: seed.placeAdmin,
      countryCode: seed.countryCode,
      sortOrder: index,
    });
    albumsRepository.addTransactions(albumId, trip.transactionIds);
    created += 1;
  });

  return created;
}

function seedItems(profile: PreviewProfile) {
  const currentMonth = monthStart(new Date());

  profile.items.forEach((seed, index) => {
    const purchaseMonth = monthStart(currentMonth, -seed.purchaseMonthsAgo);
    const endDate =
      seed.retiredMonthsAgo != null
        ? monthIso(monthStart(currentMonth, -seed.retiredMonthsAgo), seed.purchaseDay, 12)
        : null;

    itemsRepository.create({
      name: seed.name,
      iconId: seed.iconId,
      purchasePrice: seed.purchasePrice,
      currency: profile.currencySymbol,
      purchaseDate: monthIso(purchaseMonth, seed.purchaseDay, 12),
      endDate,
      salePrice: seed.salePrice ?? null,
      note: seed.note ?? null,
      sortOrder: index,
    });
  });

  return profile.items.length;
}

export function seedPreviewData(profileName: PreviewSeedProfile): PreviewSeedSummary {
  const profile = getPreviewProfile(profileName);
  const sqlite = getSQLite();

  sqlite.execSync('BEGIN');
  try {
    purgePreviewData();
    settingsRepository.updateSettings({
      onboardingCompleted: true,
      userMode: 'power',
      locale: profile.locale,
      currencyCode: profile.currencyCode,
      currencySymbol: profile.currencySymbol,
    });
    settingsRepository.updateInsightsPreferencesJson(null);

    const accounts = createAccounts(profile);
    const categories = createCategories(profile);
    seedWageHistory(profile);
    const { count: transactions, trips } = seedTransactions(profile, accounts, categories);
    const recurringRules = seedRecurringRules(profile, accounts, categories);
    const albums = seedAlbums(profile, trips);
    const items = seedItems(profile);

    sqlite.execSync('COMMIT');

    return {
      profile: profileName,
      locale: profile.locale,
      accounts: Object.keys(accounts).length + profile.extraAccounts.length,
      categories: Object.keys(categories).length,
      recurringRules,
      transactions,
      wageMonths: WAGE_HISTORY_MONTHS,
      albums,
      items,
    };
  } catch (error) {
    sqlite.execSync('ROLLBACK');
    throw error;
  }
}
