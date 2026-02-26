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
  type: 'all',
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
  icon: '🏦',
  color: '#22917A',
  startingBalance: 0,
  includeInTotals: true,
};

export const CATEGORY_ICON_PLACEHOLDER = '🏷️';
export const DEFAULT_CATEGORY_EMOJIS = [
  '🍔',
  '🛒',
  '🚗',
  '🏠',
  '📱',
  '💊',
  '🎮',
  '🎬',
  '📚',
  '🎓',
  '🏋️',
  '🧳',
  '✈️',
  '🐶',
  '👶',
  '👕',
  '💡',
  '🍺',
  '☕',
  '🍕',
  '💼',
  '💰',
  '🎁',
  '📈',
  '🏦',
  '🧾',
  '🔁',
  '🛍️',
  '🧼',
  '🏥',
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
];

type OnboardingCategorySeed = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const ONBOARDING_MINIMAL_EXPENSE_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Food', type: 'expense', parentId: null, icon: '🍔', isDefault: true },
  {
    name: 'Transport',
    type: 'expense',
    parentId: null,
    icon: '🚗',
    isDefault: true,
  },
  { name: 'Bills', type: 'expense', parentId: null, icon: '📄', isDefault: true },
  {
    name: 'Shopping',
    type: 'expense',
    parentId: null,
    icon: '🛍️',
    isDefault: true,
  },
];

export const ONBOARDING_MINIMAL_INCOME_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Salary', type: 'income', parentId: null, icon: '💰', isDefault: true },
  {
    name: 'Other Income',
    type: 'income',
    parentId: null,
    icon: '💼',
    isDefault: true,
  },
];
