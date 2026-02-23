export type DisplayMode = 'money' | 'time';
export type ThemeMode = 'system' | 'light' | 'dark';
export type WageType = 'hourly' | 'monthly' | 'yearly';

export type AccountType = 'debit' | 'credit';
export type TransactionType = 'expense' | 'income' | 'transfer';
export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type CategoryType = 'expense' | 'income';

export interface WageConfig {
  wageType: WageType;
  wageAmount: number;
  hoursWorkedPerWeek: number;
  workdaysPerWeek: number;
  commuteMinutesPerWorkday: number;
}

export interface MonthlyWageSettings {
  id: string;
  month: string; // YYYY-MM
  wageType: WageType;
  wageAmount: number;
  hoursWorkedPerWeek: number;
  workdaysPerWeek: number;
  commuteMinutesPerWorkday: number;
  baseHourlyRate: number;
  trueHourlyRate: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UserSettings {
  id: string;
  locale: string;
  currencySymbol: string;
  hourRounding: number;
  displayMode: DisplayMode;
  themeMode: ThemeMode;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Account {
  id: string;
  name: string;
  sortOrder?: number;
  type: AccountType;
  accountGroup: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  currency: string;
  icon: string;
  color: string;
  startingBalance: number;
  includeInTotals: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AccountGroup {
  id: string;
  name: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  sortOrder?: number;
  type: CategoryType;
  parentId: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  recurrencePattern: RecurrencePattern;
  recurrenceInterval: number;
  recurrenceEndDate: string | null;
  recurrenceParentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionWithRelations extends Transaction {
  accountName?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  categoryName?: string | null;
  categoryParentName?: string | null;
  categoryIcon?: string | null;
}

export interface RecurringTransactionRule {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  currency: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  recurrencePattern: Exclude<RecurrencePattern, 'none'>;
  recurrenceInterval: number;
  nextRunDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface TransactionFilters {
  search: string;
  dateRange: DateRange | null;
  accountId: string | null;
  type: TransactionType | 'all';
  categoryId: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  sortBy: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
}

export interface BreakdownItem {
  id: string;
  label: string;
  parentLabel?: string;
  amount: number;
}

export interface CashflowSummary {
  income: number;
  expense: number;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
}

export interface AppState {
  isLoading: boolean;
  settings: UserSettings;
  currentMonthWage: MonthlyWageSettings | null;
  accountGroups: AccountGroup[];
  recurringRules: RecurringTransactionRule[];
  accounts: Account[];
  categories: Category[];
  transactions: TransactionWithRelations[];
  activeAccountFilter: string | null;
}
