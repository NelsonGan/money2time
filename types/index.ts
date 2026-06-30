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
export type ExchangeRateSource = 'api' | 'manual';

export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  /** 1 base = `rate` quote. */
  rate: number;
  /** Date the rate is valid for (YYYY-MM-DD), as reported by the source. */
  asOfDate: string;
  source: ExchangeRateSource;
  updatedAt: string;
}

/**
 * In-memory snapshot of cached exchange rates, all expressed relative to a
 * single canonical `base` currency. Held by AppContext so conversions stay
 * synchronous and usable inside memos.
 */
export interface RateTable {
  base: string;
  /** quoteCurrency -> rate (1 base = rate quote). Always includes base -> 1. */
  rates: Record<string, number>;
  /** Most recent `asOfDate` across the cached rates, or null when empty. */
  asOfDate: string | null;
}

export interface RateRefreshResult {
  ok: boolean;
  asOfDate: string | null;
  error: string | null;
}

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
  /** When true (Pro-only), the app requires biometric/device auth to open. */
  biometricLockEnabled: boolean;
  /**
   * Grace period in seconds before the app re-locks after going to the
   * background. `0` means lock immediately. Only relevant when
   * `biometricLockEnabled` is true.
   */
  biometricLockDelaySeconds: number;
  autoBackupEnabled: boolean;
  autoBackupTarget: BackupTarget;
  lastAutoBackupAt: string | null;
  lastAutoBackupError: string | null;
  /** When true, exchange rates auto-refresh once per day. */
  autoFxRefreshEnabled: boolean;
  /** ISO timestamp of the last successful FX rate refresh, or null. */
  lastRateFetchAt: string | null;
  lastRateFetchError: string | null;
  /** JSON array of currency codes the user has added on the Multi currency page. */
  fxCurrenciesJson: string | null;
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
  /**
   * Currency new quick-entry transactions are recorded in. When null, falls
   * back to the entry account's own currency. Lets the user enter a foreign
   * currency (e.g. spend EUR from an MYR account) and have it persist.
   */
  defaultCurrency: string | null;
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
  defaultCurrency: null,
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

export interface Album {
  id: string;
  name: string;
  coverPhotoUri: string | null;
  isActive: boolean;
  /** Manual start-date override (YYYY-MM-DD); null falls back to first transaction. */
  startDate: string | null;
  /** Manual end-date override (YYYY-MM-DD); null falls back to last transaction. */
  endDate: string | null;
  /** Real-world location; all null when the album has no place set. */
  latitude: number | null;
  longitude: number | null;
  /** GeoNames id of the resolved place, kept so it can be re-resolved later. */
  placeId: string | null;
  /** Display place name, e.g. "Tokyo". */
  placeName: string | null;
  /** admin1 region, e.g. "Tokyo" / "California"; nullable. */
  placeAdmin: string | null;
  /** ISO 3166-1 alpha-2 country code, e.g. "JP". */
  countryCode: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** The location fields of an album, written together as a unit. */
export interface AlbumLocation {
  latitude: number;
  longitude: number;
  placeId: string | null;
  placeName: string;
  placeAdmin: string | null;
  countryCode: string | null;
}

/** An album that has a real-world location (latitude/longitude non-null). */
export type LocatedAlbum = Album & { latitude: number; longitude: number };

export function isLocatedAlbum(album: Album): album is LocatedAlbum {
  return album.latitude != null && album.longitude != null;
}

/** A city row from the offline GeoNames place database. */
export interface City {
  id: string;
  name: string;
  admin: string | null;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  population: number;
}

export interface AlbumStats {
  /** Sum of expense transactions in the album, in the reporting currency. */
  totalSpent: number;
  transactionCount: number;
  /** Effective start date (manual override, else first transaction), or null. */
  startDate: string | null;
  /** Effective end date (manual override, else last transaction), or null. */
  endDate: string | null;
}

export interface AlbumWithStats extends Album, AlbumStats {}

/**
 * A tracked possession whose effective daily cost (price ÷ days owned) shrinks
 * the longer it is kept. Standalone — items never create transactions.
 */
export interface Item {
  id: string;
  name: string;
  /** Item-icon library id or a `custom:` uploaded-image id; null = package fallback. */
  iconId: string | null;
  /** What was paid for it, in `currency`. */
  purchasePrice: number;
  currency: string;
  /** Acquisition date (YYYY-MM-DD). */
  purchaseDate: string;
  /** Retire/sell date (YYYY-MM-DD); null = still owned (active). Day-counting stops here. */
  endDate: string | null;
  /** Optional resale value; net cost = purchasePrice − salePrice. */
  salePrice: number | null;
  note: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ItemStats {
  /** Whether the item is still being counted (no end date). */
  isActive: boolean;
  /** Whole days owned (clamped to ≥ 1). For inactive items this freezes at the end date. */
  daysOwned: number;
  /** purchasePrice − (salePrice ?? 0). What it has cost net of any resale. */
  netCost: number;
  /** netCost ÷ daysOwned, in the item's currency. */
  dailyCost: number;
  /** Work-time per day implied by dailyCost, in hours; null when no wage is set. */
  dailyWorkHours: number | null;
}

export interface ItemWithStats extends Item, ItemStats {}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  /**
   * Frozen reporting-currency snapshot, captured at write time. Null for
   * transfers and legacy rows. `reportingAmount = amount * fxRate`.
   */
  reportingCurrency: string | null;
  reportingAmount: number | null;
  fxRate: number | null;
  /** Credited amount in the to-account's currency for cross-currency transfers. */
  toAmount: number | null;
  /**
   * Frozen value in the owning account's currency, set when `currency` differs
   * from the account currency (e.g. an EUR expense in an MYR account). Null when
   * they match — use `amount` directly for account-currency math.
   */
  accountAmount: number | null;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  /**
   * Relative path (within the user-assets store) of an optional receipt image,
   * e.g. `receipts/9f3c.jpg`. Resolve to a file uri with `getReceiptUri`. Null
   * when no receipt is attached.
   */
  receiptUri: string | null;
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
  /** Credited amount in the to-account's currency for cross-currency transfer rules. */
  toAmount: number | null;
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
  /** The account's native currency (the currency `balance` is denominated in). */
  currency: string;
  /**
   * `balance` converted to the reporting currency at the latest cached rate, or
   * null when no rate is available for this currency.
   */
  convertedBalance: number | null;
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
