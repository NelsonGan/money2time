export type DisplayMode = 'money' | 'time';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeColor =
  | 'sage'
  | 'ocean'
  | 'terracotta'
  | 'slate'
  | 'amber'
  | 'indigo'
  | 'emerald'
  | 'rosewood';
export type WageType = 'hourly' | 'monthly' | 'yearly';
export type UserMode = 'power' | 'simple';
export type BackupTarget = 'local' | 'icloud' | 'googleDrive';

export interface NotificationPreferences {
  dailyCheckin: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  recurringAlert: {
    enabled: boolean;
  };
  weeklySummary: {
    enabled: boolean;
    dayOfWeek: number; // 1=Mon..7=Sun
    hour: number;
    minute: number;
    displayMode: DisplayMode;
  };
}

export interface ProcessedRecurringRule {
  name: string;
  type: string;
  amount: number;
  currency: string;
}

export type AccountType = 'debit' | 'credit';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'balance_adjustment';
export type RecurringTransactionType = Exclude<TransactionType, 'balance_adjustment'>;
export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type CategoryType = 'expense' | 'income';
export type TransactionSentiment = 'happy' | 'neutral' | 'sad';

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

/**
 * Day index used by `Date.getDay()` — 0 = Sunday, 1 = Monday, …, 6 = Saturday.
 * We only expose Sunday or Monday in the UI today; other values are reserved.
 */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface UserSettings {
  id: string;
  appUserId: string;
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  displayMode: DisplayMode;
  hapticsEnabled: boolean;
  themeMode: ThemeMode;
  themeColor: ThemeColor;
  /** Persisted country filter for the account-logo picker (country slug), or null. */
  accountLogoCountry: string | null;
  /** User-chosen display name, or null when unset. */
  profileName: string | null;
  /** Relative path of the user's avatar within the user-assets store, or null. */
  profileAvatarUri: string | null;
  onboardingCompleted: boolean;
  userMode: UserMode;
  weekStartsOn: WeekStartsOn;
  autoBackupEnabled: boolean;
  autoBackupTarget: BackupTarget;
  lastAutoBackupAt: string | null;
  lastAutoBackupError: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface QuickEntryPrefs {
  /**
   * Master switch for the quick-entry feature. When false the + button opens
   * the full transaction form directly (and voice dictation is disabled),
   * bypassing the quick-add sheet. Enabled by default.
   */
  quickEntryEnabled: boolean;
  /** Override which user category to use for each keyword bucket. */
  categoryMap: Partial<Record<string, string>>;
  /** Fallback category id used when no keyword/history match. */
  defaultExpenseCategoryId: string | null;
  defaultIncomeCategoryId: string | null;
  /**
   * Account to use as the default for new quick-entry transactions (both
   * voice and text). Falls back to the user's last-used / first account
   * when null.
   */
  defaultAccountId: string | null;
  /** When true, holding the + button on iOS opens the voice dictation flow. */
  voiceInputEnabled: boolean;
  /**
   * True once the user has been prompted (and either enabled or dismissed)
   * the voice-input suggestion that appears when tapping the + button on a
   * device that supports speech recognition. Prevents re-prompting.
   */
  voicePromptDismissed: boolean;
  /** When true, voice entries are saved immediately without a confirmation sheet. */
  voiceSkipConfirmation: boolean;
  /** Total lifetime number of voice sessions the user has started. Free-tier limit. */
  voiceUsageCount: number;
}

export const DEFAULT_QUICK_ENTRY_PREFS: QuickEntryPrefs = {
  quickEntryEnabled: true,
  categoryMap: {},
  defaultExpenseCategoryId: null,
  defaultIncomeCategoryId: null,
  defaultAccountId: null,
  voiceInputEnabled: false,
  voicePromptDismissed: false,
  voiceSkipConfirmation: false,
  voiceUsageCount: 0,
};

export interface Account {
  id: string;
  name: string;
  sortOrder?: number;
  type: AccountType;
  accountGroup: string | null;
  /** Bundled bank/institution logo id (`<countrySlug>/<brandSlug>`), or null. */
  logoId?: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  currency: string;
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
  sentiment: TransactionSentiment;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionWithRelations extends Transaction {
  accountName?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  categoryName?: string | null;
  categoryParentId?: string | null;
  categoryParentName?: string | null;
  categoryIcon?: string | null;
  splits?: TransactionSplit[];
  splitsSummary?: TransactionSplitsSummary;
}

export interface TransactionSplit {
  id: string;
  transactionId: string;
  personName: string | null;
  amount: number;
  isSelf: boolean;
  paybackAccountId: string | null;
  paidAt: string | null;
  paidTransactionId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionSplitsSummary {
  count: number;
  paidCount: number;
  unpaidAmount: number;
  totalOwed: number;
}

export interface RecurringTransactionRule {
  id: string;
  name: string;
  type: RecurringTransactionType;
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
  excludedAccountIds: string[];
  type: TransactionType | 'all';
  incomeCategoryId: string | null;
  expenseCategoryId: string | null;
  excludedIncomeCategoryIds: string[];
  excludedExpenseCategoryIds: string[];
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
