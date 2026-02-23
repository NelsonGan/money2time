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
  { value: 'cash', label: 'Cash', icon: '💵' },
  { value: 'bank', label: 'Bank', icon: '🏦' },
  { value: 'wallet', label: 'Wallet', icon: '👛' },
  { value: 'savings', label: 'Savings', icon: '🪙' },
  { value: 'credit', label: 'Credit', icon: '💳' },
  { value: 'other', label: 'Other', icon: '📦' },
];

export const DEFAULT_ACCOUNT_TEMPLATE: Omit<
  Account,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
> = {
  name: 'Main Account',
  type: 'cash',
  accountGroup: null,
  creditStatementDay: null,
  creditDueDay: null,
  currency: DEFAULT_CURRENCY,
  icon: '💵',
  color: '#22917A',
  startingBalance: 0,
  includeInTotals: true,
};

export const CATEGORY_COLORS = ['#22917A', '#F6B750', '#4F87D9', '#F37D57', '#6E8EEA', '#4BA8A1'];
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
  { name: 'Food', type: 'expense', parentId: null, icon: '🍔', color: '#F37D57', isDefault: true },
  {
    name: 'Transport',
    type: 'expense',
    parentId: null,
    icon: '🚗',
    color: '#4F87D9',
    isDefault: true,
  },
  { name: 'Bills', type: 'expense', parentId: null, icon: '📄', color: '#6E8EEA', isDefault: true },
  {
    name: 'Shopping',
    type: 'expense',
    parentId: null,
    icon: '🛍️',
    color: '#8EA2B8',
    isDefault: true,
  },
];

export const ONBOARDING_MINIMAL_INCOME_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Salary', type: 'income', parentId: null, icon: '💰', color: '#22917A', isDefault: true },
  {
    name: 'Other Income',
    type: 'income',
    parentId: null,
    icon: '💼',
    color: '#4F87D9',
    isDefault: true,
  },
];
