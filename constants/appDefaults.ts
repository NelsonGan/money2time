import type { Account, AccountType, Category, TransactionFilters, WageConfig } from '~/types';

export const DEFAULT_WAGE_CONFIG: WageConfig = {
  wageType: 'monthly',
  wageAmount: 0,
  hoursWorkedPerWeek: 40,
  workdaysPerWeek: 5,
  commuteMinutesPerWorkday: 0,
};

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  search: '',
  dateRange: null,
  accountId: null,
  excludedAccountIds: [],
  type: 'all',
  incomeCategoryId: null,
  expenseCategoryId: null,
  excludedIncomeCategoryIds: [],
  excludedExpenseCategoryIds: [],
  categoryId: null,
  minAmount: null,
  maxAmount: null,
  sortBy: 'date_desc',
};

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_CURRENCY_SYMBOL = '$';

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string; icon: string }[] = [
  { value: 'debit', label: 'Debit', icon: '🏦' },
  { value: 'credit', label: 'Credit', icon: '💳' },
  { value: 'loan', label: 'Loan', icon: '🧾' },
];

export const DEFAULT_ACCOUNT_TEMPLATE: Omit<
  Account,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
> = {
  name: 'Main Account',
  type: 'debit',
  accountGroup: null,
  creditStatementDay: null,
  creditDueDay: null,
  currency: DEFAULT_CURRENCY,
  startingBalance: 0,
  includeInTotals: true,
};

/**
 * Curated common-first order of bundled icon ids, used as the default pick for
 * a new category and as the random fallback when importing data that carries no
 * icon. Ids only: the emoji glyphs these replaced now live in
 * LEGACY_EMOJI_TO_ICON (lib/db/normalizeIcons.ts) purely for reading old data.
 */
export const DEFAULT_CATEGORY_ICONS = [
  'meal',
  'grocery-basket',
  'car',
  'house',
  'laptop',
  'medicine',
  'game-controller',
  'clapperboard',
  'graduation-cap',
  'dumbbell',
  'camper-van',
  'plane',
  'dog',
  'balloon',
  't-shirt',
  'light-bulb',
  'alcohol',
  'coffee',
  'briefcase',
  'cash',
  'gift',
  'coins',
  'bank',
  'invoice',
  'bill-calendar',
  'shopping-bag',
  'faucet',
  'stethoscope',
  'price-tag',
  'target',
];

export const MAJOR_CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'MOP', symbol: 'MOP$', name: 'Macanese Pataca' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
];

/**
 * Every currency we carry name/symbol metadata for. Extends {@link
 * MAJOR_CURRENCIES} with the remaining currencies the Frankfurter (ECB) feed
 * supports, so the full picker and auto-rate set line up. Used by the currency
 * pickers and by `currencySymbolForCode` / `currencyNameForCode`.
 */
export const ALL_CURRENCIES: { code: string; symbol: string; name: string }[] = [
  ...MAJOR_CURRENCIES,
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'ILS', symbol: '₪', name: 'Israeli New Shekel' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
];

type OnboardingCategorySeed = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
type OnboardingAccountSeed = Omit<
  Account,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'currency'
>;

export const ONBOARDING_MINIMAL_EXPENSE_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Food', type: 'expense', parentId: null, icon: 'meal', isDefault: true },
  { name: 'Groceries', type: 'expense', parentId: null, icon: 'grocery-basket', isDefault: true },
  { name: 'Transport', type: 'expense', parentId: null, icon: 'car', isDefault: true },
  { name: 'Housing', type: 'expense', parentId: null, icon: 'house', isDefault: true },
  { name: 'Bills', type: 'expense', parentId: null, icon: 'light-bulb', isDefault: true },
  { name: 'Healthcare', type: 'expense', parentId: null, icon: 'medicine', isDefault: true },
  { name: 'Shopping', type: 'expense', parentId: null, icon: 'shopping-bag', isDefault: true },
  { name: 'Other', type: 'expense', parentId: null, icon: 'invoice', isDefault: true },
];

export const ONBOARDING_MINIMAL_INCOME_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Salary', type: 'income', parentId: null, icon: 'cash', isDefault: true },
  { name: 'Other', type: 'income', parentId: null, icon: 'invoice', isDefault: true },
];

export const ONBOARDING_POWER_DEFAULT_GROUPS = ['Cash', 'Bank Accounts', 'Credit Cards'] as const;

export const ONBOARDING_POWER_MINIMAL_ACCOUNTS: OnboardingAccountSeed[] = [
  {
    name: 'Cash Wallet',
    type: 'debit',
    accountGroup: 'Cash',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Digital Wallet',
    type: 'debit',
    accountGroup: 'Cash',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Checking Account',
    type: 'debit',
    accountGroup: 'Bank Accounts',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Savings Account',
    type: 'debit',
    accountGroup: 'Bank Accounts',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Credit Card',
    type: 'credit',
    accountGroup: 'Credit Cards',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
];
