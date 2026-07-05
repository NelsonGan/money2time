import * as SplashScreen from 'expo-splash-screen';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState as RNAppState,
  type AppStateStatus,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DEFAULT_CURRENCY,
  DEFAULT_TRANSACTION_FILTERS,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
  ONBOARDING_POWER_DEFAULT_GROUPS,
  ONBOARDING_POWER_MINIMAL_ACCOUNTS,
} from '~/constants/appDefaults';
import { PRO_LIMITS } from '~/constants/proLimits';
import { computeBackPopulateRange, pickAutoCreateTemplate } from '~/features/budget/lib/budgetMath';
import { computeItemStats } from '~/features/items/utils';
import { getDb, getSQLite, initializeDatabase, SIMPLE_WALLET_NAME } from '~/lib/db/client';
import { normalizeCurrencyColumns } from '~/lib/db/normalizeCurrencies';
import {
  accountGroupsTable,
  accountsTable,
  budgetTemplateCategoriesTable,
  budgetTemplatesTable,
  categoriesTable,
  itemsTable,
  monthlyBudgetCategoriesTable,
  monthlyBudgetsTable,
  monthlyWageSettingsTable,
  recurringRulesTable,
  transactionsTable,
} from '~/lib/db/schema';
import { I18n, setAppLocale } from '~/lib/i18n';
import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { albumsRepository } from '~/lib/repositories/albumsRepository';
import {
  type BudgetAllocationInput,
  budgetTemplatesRepository,
} from '~/lib/repositories/budgetTemplatesRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { itemsRepository } from '~/lib/repositories/itemsRepository';
import { monthlyBudgetsRepository } from '~/lib/repositories/monthlyBudgetsRepository';
import { monthlyWageRepository } from '~/lib/repositories/monthlyWageRepository';
import {
  type CreateRecurringRuleInput,
  recurringRulesRepository,
} from '~/lib/repositories/recurringRulesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { transactionSplitsRepository } from '~/lib/repositories/transactionSplitsRepository';
import {
  type CreateTransactionInput,
  summarizeSplits,
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import {
  AnalyticsEvents,
  flushAnalytics,
  identifyUser,
  setSuperProperties,
  trackEvent,
} from '~/services/analytics';
import {
  registerBackgroundTask,
  runAutoBackupIfDue,
  unregisterBackgroundTask,
} from '~/services/autoBackup';
import { setErrorUser } from '~/services/errorReporting';
import { refreshRatesNow, runRateRefreshIfDue } from '~/services/exchangeRates';
import { setHapticsEnabled } from '~/services/haptics';
import {
  importMoneyManagerBackupFromUri,
  type MMImportSummary,
} from '~/services/mmbakImportService';
import {
  cancelAllNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  fireRecurringTransactionNotification,
  initNotificationHandler,
  syncScheduledNotifications,
} from '~/services/notifications';
import { initReviewPrompt, recordTransactionLogged } from '~/services/reviewPrompt';
import {
  type Account,
  type AccountBalance,
  type AccountGroup,
  type Album,
  type AlbumLocation,
  type AlbumStats,
  type AppState,
  type BreakdownItem,
  type BudgetTemplate,
  type CashflowSummary,
  type Category,
  type DateRange,
  DEFAULT_QUICK_ENTRY_PREFS,
  type ExchangeRate,
  isLocatedAlbum,
  type Item,
  type ItemWithStats,
  type LocatedAlbum,
  type MonthlyBudget,
  type MonthlyWageSettings,
  type NotificationPreferences,
  type QuickEntryPrefs,
  type RateRefreshResult,
  type RateTable,
  type RecurringTransactionRule,
  type TransactionFilters,
  type TransactionSplit,
  type TransactionWithRelations,
  type UserMode,
  type UserSettings,
  type WageConfig,
} from '~/types';
import { aggregateBreakdown } from '~/utils/breakdown';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import {
  buildRateTable,
  convert,
  currencySymbolForCode,
  emptyRateTable,
  isAutoRateSupported,
  resolveRate,
} from '~/utils/currency';
import { getErrorMessage, toError } from '~/utils/errorHandling';
import { FONT } from '~/utils/fonts';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  formatHours,
  monthKeyFromDateIso,
  monthKeyFromDateLocal,
  normalizeMoneyAmount,
  normalizeMonthKey,
} from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { sortTransactions } from '~/utils/transactionSorting';

export interface SplitDraftInput {
  id?: string;
  personName: string | null;
  amount: number;
  isSelf: boolean;
  paybackAccountId: string | null;
  sortOrder?: number;
  /** Set when the user marked this row paid before saving (create-mode flow).
   *  paidTransactionId is null for same-account paybacks; for cross-account
   *  the AppContext create flow allocates a transfer tx id and links it. */
  paid?: { paidAt: string; paidTransactionId: string | null };
}

/** How a transaction was entered. Drives which analytics event fires on
 *  create — voice entries are tracked separately from manual adds. */
export type TransactionSource = 'manual' | 'voice';

export interface CreateTransactionMeta {
  source?: TransactionSource;
}

export interface CreateItemInput {
  name: string;
  iconId?: string | null;
  purchasePrice: number;
  currency: string;
  purchaseDate: string;
  endDate?: string | null;
  salePrice?: number | null;
  note?: string | null;
}

export interface CreateBudgetTemplateInput {
  name: string;
  /** Optional emoji shown next to the template name. */
  emoji?: string | null;
  totalAmount: number;
  /** Whether unbudgeted spend counts toward the month total (default true). */
  countUnbudgeted?: boolean;
  allocations: BudgetAllocationInput[];
  /** Also create budgets for missing past months (first expense month → last month). */
  backPopulate?: boolean;
}

/**
 * Volatile transaction-derived state, split into its own context so the most
 * frequent mutation (transaction CRUD, which updates only `transactions`
 * optimistically) does not re-render components that read settings/accounts/
 * albums/etc. Read it via `useTransactions()`.
 */
export interface TransactionsContextValue {
  transactions: TransactionWithRelations[];
  filteredTransactions: TransactionWithRelations[];
  accountBalances: AccountBalance[];
  transactionFilters: TransactionFilters;
  activeAccountFilter: string | null;
}

interface AppContextValue extends Omit<AppState, 'transactions' | 'activeAccountFilter'> {
  monthlyWages: MonthlyWageSettings[];

  // Multi-currency / FX
  rateTable: RateTable;
  /** Convert `amount` from `currency` to the reporting currency (latest cached rate). */
  convertToReporting: (amount: number, currency: string) => number;
  /** Cached rates for the current reporting (base) currency. */
  listExchangeRates: () => ExchangeRate[];
  /** Force-fetch the latest rates from Frankfurter (the "Update rates" button). */
  refreshExchangeRates: () => Promise<RateRefreshResult>;
  /** Set/override a manual rate (1 reporting = `rate` quoteCurrency). */
  setManualExchangeRate: (quoteCurrency: string, rate: number) => void;
  /** Wipe all data and restart in `code` (destructive main-currency change). */
  resetAndChangeMainCurrency: (code: string) => void;
  /** Currency codes the user has added on the Multi currency page. */
  fxCurrencies: string[];
  /** Add a sub-currency; auto-populates its latest rate from the cache/feed. */
  addFxCurrency: (code: string) => Promise<void>;
  /** Remove a previously added sub-currency. */
  removeFxCurrency: (code: string) => void;
  /** Persist a new display order for the tracked sub-currencies. */
  reorderFxCurrencies: (codes: string[]) => void;
  setActiveAccountFilter: (accountId: string | null) => void;
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  resetTransactionFilters: () => void;
  refreshAll: () => void;
  refreshSettings: () => void;

  createAccount: (input: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => string;
  updateAccount: (
    id: string,
    input: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
  ) => void;
  /** Change an existing account's currency, re-denominating its history in a lump. */
  changeAccountCurrency: (
    accountId: string,
    toCurrency: string,
    otherUpdates?: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
  ) => void;
  deleteAccount: (id: string) => void;
  reorderAccounts: (ids: string[]) => void;
  createAccountGroup: (name: string) => void;
  renameAccountGroup: (id: string, name: string) => void;
  deleteAccountGroup: (id: string) => void;
  reorderAccountGroups: (ids: string[]) => void;
  createRecurringRule: (input: CreateRecurringRuleInput) => void;
  updateRecurringRule: (id: string, updates: Partial<CreateRecurringRuleInput>) => void;
  deleteRecurringRule: (id: string) => void;

  createCategory: (input: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => void;
  updateCategory: (
    id: string,
    updates: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
  ) => void;
  deleteCategory: (id: string, options?: { reassignToCategoryId?: string }) => void;
  reorderCategories: (ids: string[]) => void;

  albums: Album[];
  activeAlbumId: string | null;
  /** Albums that have a real-world location (latitude/longitude set). */
  locatedAlbums: LocatedAlbum[];
  createAlbum: (input: {
    name: string;
    coverPhotoUri?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    transactionIds?: string[];
    location?: AlbumLocation | null;
  }) => string;
  updateAlbum: (
    id: string,
    updates: {
      name?: string;
      coverPhotoUri?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    },
  ) => void;
  /** Sets or clears an album's real-world location. */
  setAlbumLocation: (id: string, location: AlbumLocation | null) => void;
  deleteAlbum: (id: string) => void;
  reorderAlbums: (ids: string[]) => void;
  setActiveAlbum: (albumId: string | null) => void;
  addTransactionsToAlbum: (albumId: string, transactionIds: string[]) => void;
  removeTransactionsFromAlbum: (albumId: string, transactionIds: string[]) => void;
  getAlbumTransactionIds: (albumId: string) => string[];
  getAlbumTransactions: (albumId: string) => TransactionWithRelations[];
  getAlbumStats: (albumId: string) => AlbumStats;

  /** Cost-per-day items, each enriched with derived stats (daily cost, days owned, etc.). */
  items: ItemWithStats[];
  createItem: (input: CreateItemInput) => string;
  updateItem: (id: string, updates: Partial<CreateItemInput>) => void;
  deleteItem: (id: string) => void;
  reorderItems: (ids: string[]) => void;

  /** Reusable budget definitions; exactly one is default while any exist. */
  budgetTemplates: BudgetTemplate[];
  /** Frozen per-month budgets, ascending by month. */
  monthlyBudgets: MonthlyBudget[];
  createBudgetTemplate: (input: CreateBudgetTemplateInput) => string;
  updateBudgetTemplate: (
    id: string,
    input: Omit<CreateBudgetTemplateInput, 'backPopulate'>,
  ) => void;
  deleteBudgetTemplate: (id: string) => void;
  setDefaultBudgetTemplate: (id: string) => void;
  reorderBudgetTemplates: (ids: string[]) => void;
  /** Creates a month's budget from a template; no-ops if the month has one. */
  createMonthlyBudget: (month: string, templateId: string) => void;
  /** Creates a one-off custom budget for the month (no template involved). */
  createCustomMonthlyBudget: (
    month: string,
    input: { totalAmount: number; countUnbudgeted: boolean; lines: BudgetAllocationInput[] },
  ) => void;
  /**
   * Edits one month's frozen budget in place (total, options, lines). A local
   * override for that month only; the source template is untouched.
   */
  updateMonthlyBudget: (
    id: string,
    input: { totalAmount: number; countUnbudgeted: boolean; lines: BudgetAllocationInput[] },
  ) => void;
  deleteMonthlyBudget: (id: string) => void;

  createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => void;
  updateTransaction: (id: string, input: Partial<CreateTransactionInput>) => void;
  deleteTransaction: (id: string) => void;
  updateTransactionsBulk: (
    updates: { id: string; input: Partial<CreateTransactionInput> }[],
  ) => void;
  deleteTransactionsBulk: (ids: string[]) => void;
  createTransactionWithSplits: (input: CreateTransactionInput, splits: SplitDraftInput[]) => void;
  updateTransactionSplits: (transactionId: string, splits: SplitDraftInput[]) => void;
  markSplitPaid: (
    splitId: string,
    options?: { paybackAccountId?: string | null; date?: string; note?: string | null },
  ) => void;
  markSplitUnpaid: (splitId: string) => void;

  updateSettings: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'locale'
        | 'currencyCode'
        | 'currencySymbol'
        | 'displayMode'
        | 'hapticsEnabled'
        | 'themeMode'
        | 'themeColor'
        | 'accountLogoCountry'
        | 'profileName'
        | 'profileAvatarUri'
        | 'onboardingCompleted'
        | 'userMode'
        | 'weekStartsOn'
        | 'biometricLockEnabled'
        | 'biometricLockDelaySeconds'
        | 'autoBackupEnabled'
        | 'autoBackupTarget'
        | 'lastAutoBackupAt'
        | 'lastAutoBackupError'
      >
    >,
  ) => void;
  updateWageConfig: (config: WageConfig) => void;
  updateWageConfigForMonth: (month: string, config: WageConfig) => void;
  deleteWageConfigForMonth: (month: string) => void;
  toggleDisplayMode: () => void;
  canUseTimeDisplayMode: boolean;

  getAccountById: (id: string) => Account | undefined;
  getCategoryById: (id: string) => Category | undefined;
  /** Non-reactive count of currently-loaded (non-deleted) transactions. Lets
   *  consumers gate on activity without subscribing to transaction churn. */
  getTransactionCount: () => number;
  getTransactionsByAccount: (accountId: string) => TransactionWithRelations[];
  queryTransactions: (filters?: Partial<TransactionFilters>) => TransactionWithRelations[];
  getCashflowSummary: (range: DateRange) => CashflowSummary;
  getExpenseBreakdownByCategory: (range: DateRange) => BreakdownItem[];
  getExpenseBreakdownBySubcategory: (range: DateRange) => BreakdownItem[];
  getIncomeBreakdown: (range: DateRange) => BreakdownItem[];
  getTransfersBetweenAccounts: (
    fromAccountId: string,
    toAccountId: string,
    start?: string,
    end?: string,
  ) => TransactionWithRelations[];
  getTrueHourlyRateForDate: (dateIso: string) => number;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;

  resetTransactionsOnly: () => void;
  resetAllData: () => void;
  importMoneyManagerBackup: (uri: string, fileName?: string) => Promise<MMImportSummary>;
  insightsPreferencesJson: string | null;
  updateInsightsPreferencesJson: (value: string | null) => void;
  calendarPreferencesJson: string | null;
  updateCalendarPreferencesJson: (value: string | null) => void;
  notificationPrefs: NotificationPreferences;
  updateNotificationPrefs: (updates: Partial<NotificationPreferences>) => void;
  quickEntryPrefs: QuickEntryPrefs;
  updateQuickEntryPrefs: (updates: Partial<QuickEntryPrefs>) => void;

  isSimpleMode: boolean;
  simpleWalletId: string | null;
  completeOnboarding: (options?: {
    userMode?: UserMode;
    seedSimpleDefaults?: boolean;
    seedPowerDefaults?: boolean;
  }) => { createdAccounts: number; createdCategories: number };
  switchToSimpleMode: (seedDefaults?: boolean) => void;
  switchToPowerMode: () => void;
  deleteSimpleWalletAndTransactions: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const TransactionsContext = createContext<TransactionsContextValue | null>(null);
const EMPTY_ACCOUNT_TRANSACTIONS: TransactionWithRelations[] = [];
const EMPTY_ALBUM_STATS: AlbumStats = {
  totalSpent: 0,
  transactionCount: 0,
  startDate: null,
  endDate: null,
};

// Defer a persist/refresh task off the critical render path (so the optimistic
// UI paint and any in-flight close/navigation animation stay smooth) without
// letting a busy device starve it. `InteractionManager.runAfterInteractions`
// alone is unbounded: on slower Android phones the modal-dismiss + tab-switch +
// calendar re-render keep registering interaction handles, so a quick-add write
// (and the refresh that follows) could be held off for many seconds — the
// "transaction took ~10s to appear / redirect" symptom. We still prefer running
// after interactions, but cap the wait with a timer fallback so the write
// always lands promptly. `run` is guarded to fire exactly once.
const DEFERRED_WRITE_MAX_DELAY_MS = 300;
function runDeferredWrite(task: () => void) {
  let ran = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (ran) return;
    ran = true;
    if (timer) clearTimeout(timer);
    task();
  };
  const handle = InteractionManager.runAfterInteractions(run);
  timer = setTimeout(() => {
    handle.cancel();
    run();
  }, DEFERRED_WRITE_MAX_DELAY_MS);
}

function categorySeedKey(type: Category['type'], name: string) {
  return `${type}:${name.trim().toLowerCase()}`;
}

/** Parse the persisted JSON array of added sub-currency codes (defensive). */
function parseFxCurrencies(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function accountNameSeedKey(name: string) {
  return name.trim().toLowerCase();
}

function ensureSimpleWalletExists(currency: string) {
  const existingWallet = accountsRepository
    .list()
    .find((account) => account.name === SIMPLE_WALLET_NAME);
  if (existingWallet) {
    return { id: existingWallet.id, created: false };
  }

  const id = accountsRepository.create({
    name: SIMPLE_WALLET_NAME,
    type: 'debit',
    startingBalance: 0,
    accountGroup: null,
    creditStatementDay: null,
    creditDueDay: null,
    currency,
    includeInTotals: true,
    sortOrder: 0,
  });

  return { id, created: true };
}

function seedMinimalCategoriesIfMissing() {
  const existingCategories = categoriesRepository.list();
  const existing = new Set(
    existingCategories.map((category) => categorySeedKey(category.type, category.name)),
  );
  const minimal = [
    ...ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
    ...ONBOARDING_MINIMAL_INCOME_CATEGORIES,
  ];
  let createdCategories = 0;
  let remainingSlots = Math.max(
    PRO_LIMITS.FREE_MAX_CATEGORIES -
      existingCategories.filter((category) => !category.parentId).length,
    0,
  );

  minimal.forEach((category) => {
    if (remainingSlots <= 0) return;
    const key = categorySeedKey(category.type, category.name);
    if (existing.has(key)) return;
    categoriesRepository.create(category);
    existing.add(key);
    createdCategories += 1;
    remainingSlots -= 1;
  });

  return createdCategories;
}

function seedPowerAccountsIfMissing(preferredCurrency: string) {
  ONBOARDING_POWER_DEFAULT_GROUPS.forEach((groupName, index) => {
    accountGroupsRepository.create(groupName, index);
  });

  const existingAccounts = accountsRepository.list();
  const existing = new Set(existingAccounts.map((account) => accountNameSeedKey(account.name)));
  let createdAccounts = 0;
  let remainingSlots = Math.max(PRO_LIMITS.FREE_MAX_ACCOUNTS - existingAccounts.length, 0);

  ONBOARDING_POWER_MINIMAL_ACCOUNTS.forEach((account) => {
    if (remainingSlots <= 0) return;
    const key = accountNameSeedKey(account.name);
    if (existing.has(key)) return;
    accountsRepository.create({
      ...account,
      currency: preferredCurrency,
    });
    existing.add(key);
    createdAccounts += 1;
    remainingSlots -= 1;
  });

  return createdAccounts;
}

const fallbackStyles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#F5F7F8',
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D7DEE1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: '#1A2E2A',
  },
  errorMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475B56',
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: '#1F8A6F',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: FONT.semibold,
    fontWeight: '600',
  },
});

/** The wage row that applies right now: the current month's entry, else the
 *  first listed one. Shared by refreshAll and refreshWages so the two paths
 *  can't drift. */
function selectEffectiveCurrentWage(allWages: MonthlyWageSettings[]): MonthlyWageSettings | null {
  const currentMonthKey = monthKeyFromDateLocal(new Date());
  return (
    allWages.find((item) => normalizeMonthKey(item.month) === currentMonthKey) ??
    allWages[0] ??
    null
  );
}

function buildNormalizedRateHistory(history: MonthlyWageSettings[]) {
  const byMonth = new Map<string, { month: string; rate: number; updatedAt: string }>();

  history.forEach((wage) => {
    const normalizedMonth = normalizeMonthKey(wage.month);
    const existing = byMonth.get(normalizedMonth);
    if (!existing || wage.updatedAt > existing.updatedAt) {
      byMonth.set(normalizedMonth, {
        month: normalizedMonth,
        rate: wage.trueHourlyRate,
        updatedAt: wage.updatedAt,
      });
    }
  });

  return Array.from(byMonth.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((entry) => ({ month: entry.month, rate: entry.rate }));
}

function buildEffectiveFilters(
  filters: TransactionFilters,
  activeAccountFilter: string | null,
): TransactionFilters {
  return {
    ...filters,
    accountId: activeAccountFilter ?? filters.accountId,
  };
}

function purgeAllData() {
  const db = getDb();
  db.delete(transactionsTable).run();
  db.delete(categoriesTable).run();
  db.delete(accountsTable).run();
  db.delete(recurringRulesTable).run();
  db.delete(accountGroupsTable).run();
  db.delete(monthlyWageSettingsTable).run();
  db.delete(itemsTable).run();
  // Budgets must go too — a surviving default template would auto-recreate a
  // ghost budget (pointing at deleted categories) on the very next load.
  db.delete(budgetTemplateCategoriesTable).run();
  db.delete(budgetTemplatesTable).run();
  db.delete(monthlyBudgetCategoriesTable).run();
  db.delete(monthlyBudgetsTable).run();
  // Reset settings to defaults but preserve appUserId so the device identity
  // remains stable across in-app data resets. The ID only rotates on
  // uninstall/reinstall (when SQLite itself is wiped).
  settingsRepository.reset();
}

function purgeDataForImport() {
  const db = getDb();
  db.delete(transactionsTable).run();
  db.delete(categoriesTable).run();
  db.delete(accountsTable).run();
  db.delete(recurringRulesTable).run();
  db.delete(accountGroupsTable).run();
  // The import replaces every category id, so budget allocation lines can't
  // survive it — drop budgets rather than leave them pointing at ghosts.
  db.delete(budgetTemplateCategoriesTable).run();
  db.delete(budgetTemplatesTable).run();
  db.delete(monthlyBudgetCategoriesTable).run();
  db.delete(monthlyBudgetsTable).run();
}

function purgeTransactionsOnly() {
  const db = getDb();
  db.delete(transactionsTable).run();
}

function applyTransactionFilters(
  transactions: TransactionWithRelations[],
  filters: TransactionFilters,
  noteSearchTextById?: Map<string, string>,
): TransactionWithRelations[] {
  const searchTerm = filters.search.trim().toLowerCase();
  const dateRange = filters.dateRange;
  const dateRangeStart = dateRange?.start;
  const dateRangeEnd = dateRange?.end;
  const minAmount = filters.minAmount;
  const maxAmount = filters.maxAmount;
  const excludedAccountIdSet = new Set(filters.excludedAccountIds);
  const excludedIncomeCategoryIdSet = new Set(filters.excludedIncomeCategoryIds);
  const excludedExpenseCategoryIdSet = new Set(filters.excludedExpenseCategoryIds);
  const hasDateRange = filters.dateRange !== null;
  const hasAccountFilter = filters.accountId !== null;
  const hasExcludedAccountFilter = excludedAccountIdSet.size > 0;
  const hasIncomeCategoryFilter = filters.incomeCategoryId !== null;
  const hasExpenseCategoryFilter = filters.expenseCategoryId !== null;
  const hasExcludedIncomeCategoryFilter = excludedIncomeCategoryIdSet.size > 0;
  const hasExcludedExpenseCategoryFilter = excludedExpenseCategoryIdSet.size > 0;
  const hasCategoryFilter = filters.categoryId !== null;
  const hasMinAmount = filters.minAmount !== null;
  const hasMaxAmount = filters.maxAmount !== null;
  const hasTypeFilter = filters.type !== 'all';
  const requiresLegacyTransferTypeCheck =
    filters.type === 'transfer' || filters.type === 'balance_adjustment';
  const hasSearchFilter = searchTerm.length > 0;
  const hasAnyFilter =
    hasDateRange ||
    hasAccountFilter ||
    hasExcludedAccountFilter ||
    hasIncomeCategoryFilter ||
    hasExpenseCategoryFilter ||
    hasExcludedIncomeCategoryFilter ||
    hasExcludedExpenseCategoryFilter ||
    hasCategoryFilter ||
    hasMinAmount ||
    hasMaxAmount ||
    hasTypeFilter ||
    hasSearchFilter;

  if (!hasAnyFilter) {
    return filters.sortBy === 'date_desc'
      ? transactions
      : sortTransactions(transactions, filters.sortBy);
  }

  const filtered: TransactionWithRelations[] = [];

  const matchesExcludedCategory = (
    transaction: TransactionWithRelations,
    excludedCategoryIdSet: ReadonlySet<string>,
  ) => {
    if (!transaction.categoryId) return false;
    return (
      excludedCategoryIdSet.has(transaction.categoryId) ||
      (!!transaction.categoryParentId && excludedCategoryIdSet.has(transaction.categoryParentId))
    );
  };

  // Selecting a parent category includes its child sub-categories: a transaction
  // matches when filed directly under the selected category or under one of its
  // children (i.e. its category's parent is the selected category).
  const matchesIncludedCategory = (transaction: TransactionWithRelations, categoryId: string) =>
    transaction.categoryId === categoryId || transaction.categoryParentId === categoryId;

  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index];
    const isLegacyBalanceAdjustmentTransfer =
      hasTypeFilter && requiresLegacyTransferTypeCheck
        ? transaction.type === 'transfer' &&
          !!transaction.accountId &&
          !transaction.fromAccountId &&
          !transaction.toAccountId
        : false;
    const matchesType = !hasTypeFilter
      ? true
      : filters.type === 'balance_adjustment'
        ? transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer
        : filters.type === 'transfer'
          ? transaction.type === 'transfer' && !isLegacyBalanceAdjustmentTransfer
          : transaction.type === filters.type;
    if (!matchesType) continue;

    if (hasDateRange) {
      if (
        (dateRangeStart && transaction.date < dateRangeStart) ||
        (dateRangeEnd && transaction.date > dateRangeEnd)
      ) {
        continue;
      }
    }

    if (hasAccountFilter) {
      const matchesAccount =
        transaction.accountId === filters.accountId ||
        transaction.fromAccountId === filters.accountId ||
        transaction.toAccountId === filters.accountId;
      if (!matchesAccount) continue;
    }

    if (hasExcludedAccountFilter) {
      if (
        (transaction.accountId && excludedAccountIdSet.has(transaction.accountId)) ||
        (transaction.fromAccountId && excludedAccountIdSet.has(transaction.fromAccountId)) ||
        (transaction.toAccountId && excludedAccountIdSet.has(transaction.toAccountId))
      ) {
        continue;
      }
    }

    if (transaction.type === 'income' && hasIncomeCategoryFilter) {
      if (!matchesIncludedCategory(transaction, filters.incomeCategoryId as string)) continue;
    }
    if (transaction.type === 'expense' && hasExpenseCategoryFilter) {
      if (!matchesIncludedCategory(transaction, filters.expenseCategoryId as string)) continue;
    }
    if (
      transaction.type === 'income' &&
      hasExcludedIncomeCategoryFilter &&
      matchesExcludedCategory(transaction, excludedIncomeCategoryIdSet)
    ) {
      continue;
    }
    if (
      transaction.type === 'expense' &&
      hasExcludedExpenseCategoryFilter &&
      matchesExcludedCategory(transaction, excludedExpenseCategoryIdSet)
    ) {
      continue;
    }
    if (
      !hasIncomeCategoryFilter &&
      !hasExpenseCategoryFilter &&
      hasCategoryFilter &&
      (transaction.type === 'income' || transaction.type === 'expense') &&
      !matchesIncludedCategory(transaction, filters.categoryId as string)
    ) {
      continue;
    }
    if (hasMinAmount && minAmount !== null && transaction.amount < minAmount) continue;
    if (hasMaxAmount && maxAmount !== null && transaction.amount > maxAmount) continue;

    if (hasSearchFilter) {
      const note =
        noteSearchTextById?.get(transaction.id) ?? (transaction.note ?? '').toLowerCase();
      if (!note.includes(searchTerm)) continue;
    }

    filtered.push(transaction);
  }

  if (filters.sortBy === 'date_desc') {
    return filtered;
  }
  return sortTransactions(filtered, filters.sortBy);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [currentMonthWage, setCurrentMonthWage] = useState<MonthlyWageSettings | null>(null);
  const [monthlyWages, setMonthlyWages] = useState<MonthlyWageSettings[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringTransactionRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  // Render-synced mirror of `transactions`. Mutation callbacks read it instead
  // of closing over the state value so their identities stay stable across
  // transaction churn — otherwise every write rebuilds the useApp() value and
  // re-renders every consumer, defeating the two-context split.
  const transactionsRef = useRef<TransactionWithRelations[]>(transactions);
  transactionsRef.current = transactions;
  // Balance aggregates read from SQLite. Kept in state (refreshed after each
  // write) instead of queried inside a render-time memo — the synchronous
  // aggregate query was blocking every render triggered by a transactions
  // change, which is felt hardest during bulk create.
  const [rawAccountBalances, setRawAccountBalances] = useState<AccountBalance[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [budgetTemplates, setBudgetTemplates] = useState<BudgetTemplate[]>([]);
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget[]>([]);
  const [transactionFilters, setTransactionFiltersState] = useState<TransactionFilters>(
    DEFAULT_TRANSACTION_FILTERS,
  );
  const [activeAccountFilter, setActiveAccountFilter] = useState<string | null>(null);
  const [insightsPreferencesJson, setInsightsPreferencesJson] = useState<string | null>(null);
  const [calendarPreferencesJson, setCalendarPreferencesJson] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [quickEntryPrefs, setQuickEntryPrefs] =
    useState<QuickEntryPrefs>(DEFAULT_QUICK_ENTRY_PREFS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rateTable, setRateTable] = useState<RateTable>(() => emptyRateTable());

  // Refs let the create/update callbacks read the latest rate table + reporting
  // currency without being recreated (and re-subscribing consumers) on every FX
  // refresh.
  const rateTableRef = useRef<RateTable>(rateTable);
  const reportingCurrencyRef = useRef<string>('USD');
  useEffect(() => {
    rateTableRef.current = rateTable;
  }, [rateTable]);
  useEffect(() => {
    if (settings?.currencyCode) reportingCurrencyRef.current = settings.currencyCode;
  }, [settings?.currencyCode]);

  const reloadRateTable = useCallback((reportingCurrency: string) => {
    const rows = exchangeRatesRepository.listByBase(reportingCurrency);
    setRateTable(buildRateTable(reportingCurrency, rows));
  }, []);

  /**
   * Compute the frozen reporting-currency snapshot for a transaction at write
   * time. Transfers/adjustments carry no snapshot (excluded from cashflow).
   */
  const buildSnapshot = useCallback(
    (
      type: CreateTransactionInput['type'],
      amount: number,
      currency: string,
    ): {
      reportingCurrency: string | null;
      reportingAmount: number | null;
      fxRate: number | null;
    } => {
      if (type === 'transfer' || type === 'balance_adjustment') {
        return { reportingCurrency: null, reportingAmount: null, fxRate: null };
      }
      const reporting = reportingCurrencyRef.current;
      const { value, rateUsed } = convert(amount, currency, reporting, rateTableRef.current);
      return {
        reportingCurrency: reporting,
        reportingAmount: value,
        fxRate: rateUsed ?? (currency === reporting ? 1 : null),
      };
    },
    [],
  );

  const refreshAll = useCallback(() => {
    try {
      initializeDatabase();

      const allWages = monthlyWageRepository.list();
      const effectiveCurrentWage = selectEffectiveCurrentWage(allWages);
      const nextSettings = settingsRepository.get();
      // Apply the persisted locale synchronously before the state batch commits so
      // the first paint of the real UI already renders in the stored language —
      // otherwise it briefly shows the device locale and flashes to the correct
      // one once the post-paint locale effect runs.
      setAppLocale(nextSettings.locale);
      const nextInsightsPreferencesJson = settingsRepository.getInsightsPreferencesJson();
      const nextCalendarPreferencesJson = settingsRepository.getCalendarPrefsJson();
      const nextNotificationPrefsJson = settingsRepository.getNotificationPreferencesJson();
      const nextNotificationPrefs: NotificationPreferences = (() => {
        if (!nextNotificationPrefsJson) return DEFAULT_NOTIFICATION_PREFS;
        try {
          const raw = JSON.parse(nextNotificationPrefsJson);
          // A corrupt prefs blob must not brick the whole launch — fall back to
          // defaults rather than throwing out of refreshAll. Guard non-object
          // results too (e.g. "null"/primitive), not just parse throws.
          if (!raw || typeof raw !== 'object') return DEFAULT_NOTIFICATION_PREFS;
          return { ...DEFAULT_NOTIFICATION_PREFS, ...raw };
        } catch {
          return DEFAULT_NOTIFICATION_PREFS;
        }
      })();
      const nextQuickEntryPrefsJson = settingsRepository.getQuickEntryPrefsJson();
      const nextQuickEntryPrefs: QuickEntryPrefs = (() => {
        if (!nextQuickEntryPrefsJson) return DEFAULT_QUICK_ENTRY_PREFS;
        let parsed: Partial<QuickEntryPrefs> & {
          voiceDefaultAccountId?: string | null;
          voiceUsageDayKey?: string | null;
        };
        try {
          const raw = JSON.parse(nextQuickEntryPrefsJson);
          // A corrupt prefs blob must not brick the whole launch. Guard
          // non-object results (e.g. "null"/primitive) too, since the field
          // access below would throw on them.
          if (!raw || typeof raw !== 'object') return DEFAULT_QUICK_ENTRY_PREFS;
          parsed = raw;
        } catch {
          return DEFAULT_QUICK_ENTRY_PREFS;
        }
        // Migrate the field-rename: voiceDefaultAccountId → defaultAccountId.
        // The default now applies to both voice and text entry.
        if (parsed.voiceDefaultAccountId != null && parsed.defaultAccountId == null) {
          parsed.defaultAccountId = parsed.voiceDefaultAccountId;
        }
        delete parsed.voiceDefaultAccountId;
        // Drop the per-day key — voice limit is now lifetime, not per-day.
        // Existing voiceUsageCount carries over so prior uses count toward
        // the new 15-use cap.
        delete parsed.voiceUsageDayKey;
        return { ...DEFAULT_QUICK_ENTRY_PREFS, ...parsed };
      })();
      accountGroupsRepository.ensureFromActiveAccounts();
      const processedRules = recurringRulesRepository.runDueTransactions();
      const trueHourlyRate = effectiveCurrentWage?.trueHourlyRate ?? 0;

      // Fire notifications for processed recurring rules
      if (processedRules.length > 0 && nextNotificationPrefs.recurringAlert.enabled) {
        for (const rule of processedRules) {
          const amountStr = `${nextSettings.currencySymbol}${rule.amount.toFixed(2)}`;
          const hoursStr =
            trueHourlyRate > 0
              ? formatHours(amountToHoursByRate(rule.amount, trueHourlyRate))
              : undefined;
          void fireRecurringTransactionNotification(rule.name, amountStr, hoursStr);
        }
      }

      const nextAccountGroups = accountGroupsRepository.list();
      const nextRecurringRules = recurringRulesRepository.list();
      const nextAccounts = accountsRepository.list();
      const nextCategories = categoriesRepository.list();
      const nextTransactions = transactionsRepository.list();
      const nextAlbums = albumsRepository.list();
      const nextItems = itemsRepository.list();

      // Month-rollover auto-create: materialize the current month's budget from
      // the default template. Runs on every load — idempotent (one indexed
      // lookup) and tombstone-aware, so a user-deleted month never resurrects.
      const nextBudgetTemplates = budgetTemplatesRepository.list();
      const budgetMonthKey = monthKeyFromDateLocal(new Date());
      const autoCreateTemplate = pickAutoCreateTemplate({
        currentMonthHasEverHadBudget: monthlyBudgetsRepository.hasEverExisted(budgetMonthKey),
        templates: nextBudgetTemplates,
      });
      if (autoCreateTemplate) {
        monthlyBudgetsRepository.createFromTemplate(budgetMonthKey, autoCreateTemplate);
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, { source: 'auto' });
      }
      const nextMonthlyBudgets = monthlyBudgetsRepository.list();

      const nextRawAccountBalances = accountsRepository.getBalances();

      // Compute last 7 days spending for weekly notification body
      const sevenDaysAgoKey = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return dayKeyFromDateLocal(d);
      })();
      const lastWeekSpending = nextTransactions
        .filter((t) => t.type === 'expense' && !t.deletedAt && t.date >= sevenDaysAgoKey)
        .reduce((sum, t) => sum + t.amount, 0);
      const weeklyAmountStr = `${nextSettings.currencySymbol}${lastWeekSpending.toFixed(2)}`;
      const weeklyHoursStr =
        trueHourlyRate > 0
          ? formatHours(amountToHoursByRate(lastWeekSpending, trueHourlyRate))
          : undefined;
      const weeklyBody = weeklyHoursStr
        ? `${weeklyAmountStr} · ${weeklyHoursStr}`
        : weeklyAmountStr;

      // Sync scheduled notifications with current prefs and fresh weekly data
      void syncScheduledNotifications(nextNotificationPrefs, weeklyBody);

      const nextRateTable = buildRateTable(
        nextSettings.currencyCode,
        exchangeRatesRepository.listByBase(nextSettings.currencyCode),
      );

      setCurrentMonthWage(effectiveCurrentWage);
      setMonthlyWages(allWages);
      setSettings(nextSettings);
      setRateTable(nextRateTable);
      setInsightsPreferencesJson(nextInsightsPreferencesJson);
      setCalendarPreferencesJson(nextCalendarPreferencesJson);
      setNotificationPrefs(nextNotificationPrefs);
      setQuickEntryPrefs(nextQuickEntryPrefs);
      setAccountGroups(nextAccountGroups);
      setRecurringRules(nextRecurringRules);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setTransactions(nextTransactions);
      setAlbums(nextAlbums);
      setItems(nextItems);
      setBudgetTemplates(nextBudgetTemplates);
      setMonthlyBudgets(nextMonthlyBudgets);
      setRawAccountBalances(nextRawAccountBalances);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, I18n.t('errors.data_load_failed')));
    }
  }, []);

  const refreshTransactions = useCallback(() => {
    try {
      setTransactions(transactionsRepository.list());
      setRawAccountBalances(accountsRepository.getBalances());
    } catch (error) {
      setLoadError(getErrorMessage(error, I18n.t('errors.data_load_failed')));
    }
  }, []);

  // Off-render balance refetch for write paths that don't go through
  // refreshTransactions (e.g. the single-row reconcile after a create).
  const refreshAccountBalances = useCallback(() => {
    try {
      setRawAccountBalances(accountsRepository.getBalances());
    } catch {
      // Keep the previous balances on a failed read; the next write refreshes.
    }
  }, []);

  // Lightweight settings refetch — used after auto-backup writes when nothing
  // else in the app state has changed. Avoids the full refreshAll() reload
  // which is expensive (re-reads every table + re-runs derived selectors).
  const refreshSettings = useCallback(() => {
    try {
      setSettings(settingsRepository.get());
    } catch (error) {
      setLoadError(getErrorMessage(error, I18n.t('errors.data_load_failed')));
    }
  }, []);

  // Scoped refetchers. Mutations that touch one or two tables refresh just that
  // slice of state instead of funnelling through refreshAll() — which re-reads
  // every table (including the full transactions join), re-runs recurring
  // rules, and replaces every row identity, re-rendering all consumers. Far too
  // heavy for a settings toggle or an account reorder. refreshAll() stays the
  // funnel for restores/resets/imports/mode switches and recurring-rule edits
  // (those rely on its runDueTransactions pass to materialize due entries).
  const refreshAccountsAndGroups = useCallback(
    (options?: { withBalances?: boolean }) => {
      // Account edits can imply a group (accounts carry a group name), so
      // materialize any missing groups before re-reading.
      accountGroupsRepository.ensureFromActiveAccounts();
      setAccounts(accountsRepository.list());
      setAccountGroups(accountGroupsRepository.list());
      if (options?.withBalances !== false) refreshAccountBalances();
    },
    [refreshAccountBalances],
  );

  const refreshCategories = useCallback(() => {
    setCategories(categoriesRepository.list());
  }, []);

  const refreshAlbums = useCallback(() => {
    setAlbums(albumsRepository.list());
  }, []);

  const refreshBudgets = useCallback(() => {
    setBudgetTemplates(budgetTemplatesRepository.list());
    setMonthlyBudgets(monthlyBudgetsRepository.list());
  }, []);

  const refreshWages = useCallback(() => {
    const allWages = monthlyWageRepository.list();
    setMonthlyWages(allWages);
    setCurrentMonthWage(selectEffectiveCurrentWage(allWages));
  }, []);

  // When several mutations land in the same JS turn (e.g. a Save flush that
  // calls markSplitPaid + updateTransaction + updateTransactionSplits), each
  // one would otherwise trigger its own full transactions re-fetch + re-render.
  // Coalesce them into one trailing refresh per burst.
  const refreshTransactionsScheduled = useRef(false);
  const scheduleRefreshTransactions = useCallback(() => {
    if (refreshTransactionsScheduled.current) return;
    refreshTransactionsScheduled.current = true;
    setTimeout(() => {
      refreshTransactionsScheduled.current = false;
      refreshTransactions();
    }, 0);
  }, [refreshTransactions]);

  useEffect(() => {
    setIsLoading(true);
    try {
      refreshAll();
    } finally {
      setIsLoading(false);
    }
  }, [refreshAll]);

  const retryLoad = useCallback(() => {
    setIsLoading(true);
    try {
      refreshAll();
    } finally {
      setIsLoading(false);
    }
  }, [refreshAll]);

  const setTransactionFilters = useCallback((filters: Partial<TransactionFilters>) => {
    setTransactionFiltersState((prev) => ({ ...prev, ...filters }));
  }, []);

  const resetTransactionFilters = useCallback(() => {
    setTransactionFiltersState(DEFAULT_TRANSACTION_FILTERS);
  }, []);

  const effectiveFilters = useMemo(
    () => buildEffectiveFilters(transactionFilters, activeAccountFilter),
    [activeAccountFilter, transactionFilters],
  );
  const hasSearchFilter = effectiveFilters.search.trim().length > 0;
  const noteSearchTextByTransactionId = useMemo(() => {
    if (!hasSearchFilter) return undefined;
    return new Map(
      transactions.map((transaction) => [transaction.id, (transaction.note ?? '').toLowerCase()]),
    );
  }, [hasSearchFilter, transactions]);

  const filteredTransactions = useMemo(
    () => applyTransactionFilters(transactions, effectiveFilters, noteSearchTextByTransactionId),
    [effectiveFilters, noteSearchTextByTransactionId, transactions],
  );

  const runMutation = useCallback(
    <T,>(operation: () => T, options?: { fallbackMessage?: string; refresh?: () => void }): T => {
      try {
        const result = operation();
        (options?.refresh ?? refreshAll)();
        return result;
      } catch (error) {
        throw toError(error, options?.fallbackMessage ?? I18n.t('errors.generic_operation_failed'));
      }
    },
    [refreshAll],
  );

  const createAccount = useCallback(
    (input: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
      const id = runMutation(() => accountsRepository.create(input), {
        refresh: refreshAccountsAndGroups,
      });
      void trackEvent(AnalyticsEvents.ACCOUNT_CREATED, { type: input.type });
      return id;
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const updateAccount = useCallback(
    (id: string, input: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => {
      runMutation(
        () => {
          accountsRepository.update(id, input);
        },
        {
          refresh: () => {
            // A rename changes the denormalized account names on loaded rows;
            // refreshTransactions also re-reads balances, so skip the
            // duplicate aggregate on that path.
            const nameChanged = 'name' in input;
            refreshAccountsAndGroups({ withBalances: !nameChanged });
            if (nameChanged) refreshTransactions();
          },
        },
      );
    },
    [refreshAccountsAndGroups, refreshTransactions, runMutation],
  );

  // Change an existing account's currency, re-denominating its starting balance
  // and prior entries at the latest rate in a lump. `otherUpdates` carries any
  // non-currency field edits made in the same save.
  const changeAccountCurrency = useCallback(
    (
      accountId: string,
      toCurrency: string,
      otherUpdates: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> = {},
    ) => {
      const acct = accounts.find((a) => a.id === accountId);
      if (!acct) return;
      if (acct.currency === toCurrency) {
        updateAccount(accountId, { ...otherUpdates, currency: toCurrency });
        return;
      }
      // Resolve the rate from a freshly-built table (the in-memory one can be
      // stale right after a restore/import) so the lump conversion actually
      // applies an exchange rate rather than silently relabelling.
      const reporting = reportingCurrencyRef.current;
      const freshTable = buildRateTable(reporting, exchangeRatesRepository.listByBase(reporting));
      const rate = resolveRate(acct.currency, toCurrency, freshTable) ?? 1;
      runMutation(
        () => {
          accountsRepository.update(accountId, {
            ...otherUpdates,
            currency: toCurrency,
            startingBalance: normalizeMoneyAmount(acct.startingBalance * rate),
          });
          transactionsRepository.redenominateAccount(accountId, toCurrency, rate);
        },
        {
          refresh: () => {
            // refreshTransactions also re-reads balances — skip the duplicate.
            refreshAccountsAndGroups({ withBalances: false });
            refreshTransactions();
          },
        },
      );
    },
    [accounts, refreshAccountsAndGroups, refreshTransactions, runMutation, updateAccount],
  );

  const deleteAccount = useCallback(
    (id: string) => {
      runMutation(
        () => {
          accountsRepository.softDelete(id);
        },
        {
          refresh: () => {
            // refreshTransactions also re-reads balances — skip the duplicate.
            refreshAccountsAndGroups({ withBalances: false });
            refreshTransactions();
          },
        },
      );
      void trackEvent(AnalyticsEvents.ACCOUNT_DELETED);
    },
    [refreshAccountsAndGroups, refreshTransactions, runMutation],
  );

  const reorderAccounts = useCallback(
    (ids: string[]) => {
      runMutation(
        () => {
          accountsRepository.reorder(ids);
        },
        { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
      );
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const createAccountGroup = useCallback(
    (name: string) => {
      runMutation(
        () => {
          accountGroupsRepository.create(name);
        },
        { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
      );
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const renameAccountGroup = useCallback(
    (id: string, name: string) => {
      runMutation(
        () => {
          accountGroupsRepository.rename(id, name);
        },
        { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
      );
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const deleteAccountGroup = useCallback(
    (id: string) => {
      runMutation(
        () => {
          accountGroupsRepository.softDelete(id);
        },
        { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
      );
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const reorderAccountGroups = useCallback(
    (ids: string[]) => {
      runMutation(
        () => {
          accountGroupsRepository.reorder(ids);
        },
        { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
      );
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const createRecurringRule = useCallback(
    (input: CreateRecurringRuleInput) => {
      runMutation(() => {
        recurringRulesRepository.create(input);
      });
      void trackEvent(AnalyticsEvents.RECURRING_RULE_CREATED, {
        type: input.type,
        pattern: input.recurrencePattern,
      });
    },
    [runMutation],
  );

  const updateRecurringRule = useCallback(
    (id: string, updates: Partial<CreateRecurringRuleInput>) => {
      runMutation(() => {
        recurringRulesRepository.update(id, updates);
      });
      void trackEvent(AnalyticsEvents.RECURRING_RULE_UPDATED);
    },
    [runMutation],
  );

  const deleteRecurringRule = useCallback(
    (id: string) => {
      runMutation(() => {
        recurringRulesRepository.softDelete(id);
      });
      void trackEvent(AnalyticsEvents.RECURRING_RULE_DELETED);
    },
    [runMutation],
  );

  const createCategory = useCallback(
    (input: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
      runMutation(
        () => {
          categoriesRepository.create(input);
        },
        { refresh: refreshCategories },
      );
      void trackEvent(AnalyticsEvents.CATEGORY_CREATED, { type: input.type });
    },
    [refreshCategories, runMutation],
  );

  const updateCategory = useCallback(
    (
      id: string,
      updates: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
    ) => {
      runMutation(
        () => {
          categoriesRepository.update(id, updates);
        },
        {
          // Name/icon/parent edits change the denormalized category fields on
          // loaded transaction rows.
          refresh: () => {
            refreshCategories();
            refreshTransactions();
          },
        },
      );
    },
    [refreshCategories, refreshTransactions, runMutation],
  );

  const deleteCategory = useCallback(
    (id: string, options?: { reassignToCategoryId?: string }) => {
      runMutation(
        () => {
          if (options?.reassignToCategoryId) {
            // Only move transactions tied directly to this category. Children are
            // promoted to top-level (not deleted), so they keep their own.
            transactionsRepository.reassignCategory([id], options.reassignToCategoryId);
          }
          categoriesRepository.softDelete(id);
          // Budgets cascade: drop the category's allocation from every template
          // and every month's frozen budget. The freed amount becomes
          // unallocated (templates) / unbudgeted spend (months).
          budgetTemplatesRepository.removeCategoryFromAllTemplates(id);
          monthlyBudgetsRepository.removeCategoryFromAllBudgets(id);
        },
        {
          refresh: () => {
            refreshCategories();
            refreshTransactions();
            refreshBudgets();
          },
        },
      );
      void trackEvent(AnalyticsEvents.CATEGORY_DELETED, {
        reassigned: Boolean(options?.reassignToCategoryId),
      });
    },
    [refreshBudgets, refreshCategories, refreshTransactions, runMutation],
  );

  const reorderCategories = useCallback(
    (ids: string[]) => {
      runMutation(
        () => {
          categoriesRepository.reorder(ids);
        },
        { refresh: refreshCategories },
      );
    },
    [refreshCategories, runMutation],
  );

  const createAlbum = useCallback(
    (input: {
      name: string;
      coverPhotoUri?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      transactionIds?: string[];
      location?: AlbumLocation | null;
    }) => {
      const id = runMutation(
        () => {
          const albumId = albumsRepository.create({
            name: input.name,
            coverPhotoUri: input.coverPhotoUri ?? null,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            latitude: input.location?.latitude ?? null,
            longitude: input.location?.longitude ?? null,
            placeId: input.location?.placeId ?? null,
            placeName: input.location?.placeName ?? null,
            placeAdmin: input.location?.placeAdmin ?? null,
            countryCode: input.location?.countryCode ?? null,
          });
          if (input.transactionIds && input.transactionIds.length > 0) {
            albumsRepository.addTransactions(albumId, input.transactionIds);
          }
          return albumId;
        },
        { refresh: refreshAlbums },
      );
      void trackEvent(AnalyticsEvents.ALBUM_CREATED, {
        transactionCount: input.transactionIds?.length ?? 0,
      });
      return id;
    },
    [refreshAlbums, runMutation],
  );

  // Detail and location edits only touch the `albums` table, so reload just
  // `albums` instead of a full refreshAll() — the latter re-inits the DB and
  // re-reads every table (incl. all transactions), which made saving an album
  // sluggish (and the edit screen calls both back-to-back, doubling it).
  const updateAlbum = useCallback(
    (
      id: string,
      updates: {
        name?: string;
        coverPhotoUri?: string | null;
        startDate?: string | null;
        endDate?: string | null;
      },
    ) => {
      albumsRepository.update(id, updates);
      setAlbums(albumsRepository.list());
      void trackEvent(AnalyticsEvents.ALBUM_UPDATED);
    },
    [],
  );

  const setAlbumLocation = useCallback((id: string, location: AlbumLocation | null) => {
    albumsRepository.update(id, {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      placeId: location?.placeId ?? null,
      placeName: location?.placeName ?? null,
      placeAdmin: location?.placeAdmin ?? null,
      countryCode: location?.countryCode ?? null,
    });
    setAlbums(albumsRepository.list());
    void trackEvent(AnalyticsEvents.ALBUM_LOCATION_SET, { cleared: location == null });
  }, []);

  const deleteAlbum = useCallback(
    (id: string) => {
      runMutation(
        () => {
          albumsRepository.softDelete(id);
        },
        { refresh: refreshAlbums },
      );
      void trackEvent(AnalyticsEvents.ALBUM_DELETED);
    },
    [refreshAlbums, runMutation],
  );

  const setActiveAlbum = useCallback(
    (albumId: string | null) => {
      runMutation(
        () => {
          albumsRepository.setActive(albumId);
        },
        { refresh: refreshAlbums },
      );
    },
    [refreshAlbums, runMutation],
  );

  // Membership edits only touch the album join table — a full refreshAll() would
  // re-init the DB and reload everything (slow). Reloading just `albums` gives the
  // membership-derived memos a fresh reference and updates the UI immediately.
  const addTransactionsToAlbum = useCallback((albumId: string, transactionIds: string[]) => {
    albumsRepository.addTransactions(albumId, transactionIds);
    setAlbums(albumsRepository.list());
  }, []);

  const removeTransactionsFromAlbum = useCallback((albumId: string, transactionIds: string[]) => {
    albumsRepository.removeTransactions(albumId, transactionIds);
    setAlbums(albumsRepository.list());
  }, []);

  // Reorder only rewrites sortOrder on the albums table, so reload just `albums`.
  const reorderAlbums = useCallback((ids: string[]) => {
    albumsRepository.reorder(ids);
    setAlbums(albumsRepository.list());
  }, []);

  const getAlbumTransactionIds = useCallback(
    (albumId: string) => albumsRepository.getTransactionIds(albumId),
    [],
  );

  const getAlbumTransactions = useCallback((albumId: string): TransactionWithRelations[] => {
    const ids = albumsRepository.getTransactionIds(albumId);
    // Batched load (fixed query count) instead of one getById per id.
    return transactionsRepository
      .listByIds(ids)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, []);

  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const accountByIdMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoryByIdMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const transactionsByAccountId = useMemo(() => {
    const byAccountId = new Map<string, TransactionWithRelations[]>();

    transactions.forEach((transaction) => {
      const accountId = transaction.accountId;
      const fromAccountId = transaction.fromAccountId;
      const toAccountId = transaction.toAccountId;
      if (accountId) {
        const existing = byAccountId.get(accountId);
        if (existing) {
          existing.push(transaction);
        } else {
          byAccountId.set(accountId, [transaction]);
        }
      }
      if (fromAccountId && fromAccountId !== accountId) {
        const existing = byAccountId.get(fromAccountId);
        if (existing) {
          existing.push(transaction);
        } else {
          byAccountId.set(fromAccountId, [transaction]);
        }
      }
      if (toAccountId && toAccountId !== accountId && toAccountId !== fromAccountId) {
        const existing = byAccountId.get(toAccountId);
        if (existing) {
          existing.push(transaction);
        } else {
          byAccountId.set(toAccountId, [transaction]);
        }
      }
    });

    return byAccountId;
  }, [transactions]);
  const categoryRelationInfoById = useMemo(() => {
    const relationInfoById = new Map<
      string,
      { name: string; icon: string; parentName: string | null }
    >();

    categories.forEach((category) => {
      const parent = category.parentId ? categoryByIdMap.get(category.parentId) : null;
      relationInfoById.set(category.id, {
        name: category.name,
        icon: resolveCategoryIcon(category.icon, parent?.icon ?? null),
        parentName: parent?.name ?? null,
      });
    });

    return relationInfoById;
  }, [categories, categoryByIdMap]);

  const resolveRelationNames = useCallback(
    (input: Partial<CreateTransactionInput>) => {
      const findAccount = (id?: string | null) => (id ? (accountNameById.get(id) ?? null) : null);
      const findCategory = (id?: string | null) => {
        if (!id) return { name: null, icon: null, parentName: null };
        const relationInfo = categoryRelationInfoById.get(id);
        if (!relationInfo) return { name: null, icon: null, parentName: null };
        return {
          name: relationInfo.name,
          icon: relationInfo.icon,
          parentName: relationInfo.parentName,
        };
      };
      const catInfo = findCategory(input.categoryId);
      return {
        accountName: findAccount(input.accountId),
        fromAccountName: findAccount(input.fromAccountId),
        toAccountName: findAccount(input.toAccountId),
        categoryName: catInfo.name,
        categoryIcon: catInfo.icon,
        categoryParentName: catInfo.parentName,
      };
    },
    [accountNameById, categoryRelationInfoById],
  );

  const resolveCategoryDefaultNote = useCallback(
    (categoryId?: string | null) => {
      if (!categoryId) return null;
      return categoryRelationInfoById.get(categoryId)?.name.trim() || null;
    },
    [categoryRelationInfoById],
  );

  const createTransaction = useCallback(
    (input: CreateTransactionInput, meta?: CreateTransactionMeta) => {
      const normalizedAmount = normalizeMoneyAmount(input.amount);
      const snapshot = buildSnapshot(input.type, normalizedAmount, input.currency);
      // Freeze the account-currency value when the entry currency differs from
      // the account's own currency (e.g. spending EUR from an MYR account via the
      // quick-add currency picker). Callers that already resolved it — the full
      // editor — pass accountAmount explicitly; we only compute when omitted.
      const computedAccountAmount = (() => {
        if (input.accountAmount !== undefined) return input.accountAmount;
        if (input.type === 'transfer' || input.type === 'balance_adjustment') return null;
        const acctId = input.accountId ?? null;
        const acctCurrency = acctId
          ? (accounts.find((a) => a.id === acctId)?.currency ?? reportingCurrencyRef.current)
          : reportingCurrencyRef.current;
        if (input.currency === acctCurrency) return null;
        return convert(normalizedAmount, input.currency, acctCurrency, rateTableRef.current).value;
      })();
      const normalizedInput = {
        ...input,
        amount: normalizedAmount,
        reportingCurrency: input.reportingCurrency ?? snapshot.reportingCurrency,
        reportingAmount: input.reportingAmount ?? snapshot.reportingAmount,
        fxRate: input.fxRate ?? snapshot.fxRate,
        toAmount: input.toAmount ?? null,
        accountAmount: computedAccountAmount,
        receiptUri: input.receiptUri ?? null,
      };
      const id = newId();
      const now = nowIso();
      const optimistic: TransactionWithRelations = {
        id,
        type: normalizedInput.type,
        amount: normalizedInput.amount,
        currency: normalizedInput.currency,
        reportingCurrency: normalizedInput.reportingCurrency,
        reportingAmount: normalizedInput.reportingAmount,
        fxRate: normalizedInput.fxRate,
        toAmount: normalizedInput.toAmount,
        accountAmount: normalizedInput.accountAmount,
        date: normalizedInput.date,
        accountId: normalizedInput.accountId ?? null,
        fromAccountId: normalizedInput.fromAccountId ?? null,
        toAccountId: normalizedInput.toAccountId ?? null,
        categoryId: normalizedInput.categoryId ?? null,
        note: normalizedInput.note ?? null,
        receiptUri: normalizedInput.receiptUri ?? null,
        sentiment: normalizedInput.sentiment ?? 'neutral',
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames(normalizedInput),
      };
      setTransactions((prev) => sortTransactions([optimistic, ...prev], 'date_desc'));
      runDeferredWrite(() => {
        try {
          transactionsRepository.createWithId(id, normalizedInput);
          // Auto-file into the active album, if one is set.
          const activeAlbumId = albumsRepository.getActiveId();
          if (activeAlbumId) {
            albumsRepository.addTransactions(activeAlbumId, [id]);
            // Refresh albums so index-card stats (a memo keyed on the album
            // reference) recompute for the auto-added transaction.
            setAlbums(albumsRepository.list());
          }
          // Voice entries fire a dedicated event so voice adoption can be
          // measured. Manual transaction creation is no longer tracked.
          if (meta?.source === 'voice') {
            void trackEvent(AnalyticsEvents.VOICE_TRANSACTION_CREATED, {
              type: normalizedInput.type,
              has_category: !!normalizedInput.categoryId,
              has_note: !!(normalizedInput.note && normalizedInput.note.trim()),
              sentiment: normalizedInput.sentiment ?? 'neutral',
            });
          }
          recordTransactionLogged();
          // Reconcile only the inserted row. A full refreshTransactions here
          // would re-read the whole table and replace every row identity,
          // re-rendering all transaction consumers (calendar, insights) with
          // their row-level memoization defeated — the main JS-thread stall
          // felt right after Save in bulk create mode.
          const persisted = transactionsRepository.getById(id);
          setTransactions((prev) =>
            persisted
              ? prev.map((tx) => (tx.id === id ? persisted : tx))
              : prev.filter((tx) => tx.id !== id),
          );
        } catch {
          // Roll back the optimistic row so a failed insert doesn't leave a
          // phantom transaction in the UI.
          setTransactions((prev) => prev.filter((tx) => tx.id !== id));
        }
        refreshAccountBalances();
      });
    },
    [accounts, buildSnapshot, refreshAccountBalances, resolveRelationNames],
  );

  const updateTransactionsBulk = useCallback(
    (updates: { id: string; input: Partial<CreateTransactionInput> }[]) => {
      if (updates.length === 0) return;
      const normalizedUpdates: { id: string; input: Partial<CreateTransactionInput> }[] = [];
      const relationById = new Map<string, ReturnType<typeof resolveRelationNames>>();
      const inputById = new Map<string, Partial<CreateTransactionInput>>();
      const transactionById = new Map(
        transactionsRef.current.map((transaction) => [transaction.id, transaction]),
      );
      updates.forEach(({ id, input }) => {
        let normalizedInput =
          input.amount === undefined
            ? input
            : {
                ...input,
                amount: normalizeMoneyAmount(input.amount),
              };
        if (id.trim().length === 0) return;
        const currentTransaction = transactionById.get(id);
        if ('note' in normalizedInput && normalizedInput.note === null) {
          const categoryId =
            'categoryId' in normalizedInput
              ? normalizedInput.categoryId
              : currentTransaction?.categoryId;
          normalizedInput = {
            ...normalizedInput,
            note: resolveCategoryDefaultNote(categoryId),
          };
        }
        if (Object.keys(normalizedInput).length === 0) return;
        // Re-freeze the reporting snapshot when the amount or currency changes on
        // a non-transfer transaction (skip when the caller supplied its own).
        const affectsSnapshot =
          ('amount' in normalizedInput || 'currency' in normalizedInput) &&
          !('reportingAmount' in normalizedInput);
        const effectiveType = normalizedInput.type ?? currentTransaction?.type ?? 'expense';
        if (affectsSnapshot && effectiveType !== 'transfer') {
          const nextAmount = normalizedInput.amount ?? currentTransaction?.amount ?? 0;
          const nextCurrency =
            normalizedInput.currency ??
            currentTransaction?.currency ??
            reportingCurrencyRef.current;
          const snap = buildSnapshot(effectiveType, nextAmount, nextCurrency);
          normalizedInput = {
            ...normalizedInput,
            reportingCurrency: snap.reportingCurrency,
            reportingAmount: snap.reportingAmount,
            fxRate: snap.fxRate,
          };
          // Re-freeze the account-currency value too, unless the caller (the
          // editor) already supplied it.
          if (!('accountAmount' in normalizedInput) && effectiveType !== 'balance_adjustment') {
            const acctId = normalizedInput.accountId ?? currentTransaction?.accountId ?? null;
            const acctCurrency = acctId
              ? (accounts.find((a) => a.id === acctId)?.currency ?? reportingCurrencyRef.current)
              : reportingCurrencyRef.current;
            normalizedInput = {
              ...normalizedInput,
              accountAmount:
                nextCurrency !== acctCurrency
                  ? convert(nextAmount, nextCurrency, acctCurrency, rateTableRef.current).value
                  : null,
            };
          }
        }
        normalizedUpdates.push({ id, input: normalizedInput });
        const hasRelationChange =
          'accountId' in normalizedInput ||
          'fromAccountId' in normalizedInput ||
          'toAccountId' in normalizedInput ||
          'categoryId' in normalizedInput;
        if (hasRelationChange) {
          relationById.set(id, resolveRelationNames(normalizedInput));
        }
        inputById.set(id, normalizedInput);
      });
      if (normalizedUpdates.length === 0) return;

      const nextUpdatedAt = nowIso();
      setTransactions((prev) =>
        sortTransactions(
          prev.map((tx) => {
            const input = inputById.get(tx.id);
            if (!input) return tx;
            const relations = relationById.get(tx.id);
            const updated = { ...tx, ...input, updatedAt: nextUpdatedAt };
            if ('accountId' in input && relations) updated.accountName = relations.accountName;
            if ('fromAccountId' in input && relations) {
              updated.fromAccountName = relations.fromAccountName;
            }
            if ('toAccountId' in input && relations)
              updated.toAccountName = relations.toAccountName;
            if ('categoryId' in input && relations) {
              updated.categoryName = relations.categoryName;
              updated.categoryIcon = relations.categoryIcon;
              updated.categoryParentName = relations.categoryParentName;
            }
            return updated;
          }),
          'date_desc',
        ),
      );
      runDeferredWrite(() => {
        try {
          transactionsRepository.updateMany(normalizedUpdates);
        } catch {
          // rollback on failure
        }
        scheduleRefreshTransactions();
      });
    },
    [
      accounts,
      buildSnapshot,
      scheduleRefreshTransactions,
      resolveCategoryDefaultNote,
      resolveRelationNames,
    ],
  );

  const deleteTransactionsBulk = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const seenIds = new Set<string>();
      const uniqueIds: string[] = [];
      ids.forEach((id) => {
        if (id.trim().length === 0) return;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        uniqueIds.push(id);
      });
      if (uniqueIds.length === 0) return;

      const idSet = new Set(uniqueIds);
      // Determine which deletions affect splits:
      //   - Deleting a parent expense → cascade-delete its splits.
      //   - Deleting a transfer tx referenced by a paid split → restore the
      //     parent's amount (since the parent was reduced when the split was
      //     marked paid) and mark the split unpaid.
      const parentTxIdsWithSplits = new Set<string>();
      const restoreByParentId = new Map<string, number>(); // parentId → cumulative restore amount
      const reverseSplitMap = new Map<string, string>(); // transferTxId → splitId
      transactionsRef.current.forEach((tx) => {
        if (idSet.has(tx.id) && tx.splits && tx.splits.length > 0) {
          parentTxIdsWithSplits.add(tx.id);
        }
        tx.splits?.forEach((s) => {
          if (s.paidTransactionId && idSet.has(s.paidTransactionId)) {
            reverseSplitMap.set(s.paidTransactionId, s.id);
            restoreByParentId.set(tx.id, (restoreByParentId.get(tx.id) ?? 0) + s.amount);
          }
        });
      });

      setTransactions((prev) =>
        prev
          .filter((tx) => !idSet.has(tx.id))
          .map((tx) => {
            if (!tx.splits || tx.splits.length === 0) return tx;
            const restore = restoreByParentId.get(tx.id) ?? 0;
            const updatedSplits = tx.splits.map((s) => {
              if (s.paidTransactionId && idSet.has(s.paidTransactionId)) {
                return { ...s, paidAt: null, paidTransactionId: null };
              }
              return s;
            });
            return {
              ...tx,
              amount: restore > 0 ? normalizeMoneyAmount(tx.amount + restore) : tx.amount,
              splits: updatedSplits,
              splitsSummary: summarizeSplits(updatedSplits),
            };
          }),
      );
      runDeferredWrite(() => {
        try {
          transactionsRepository.softDeleteMany(uniqueIds);
          if (parentTxIdsWithSplits.size > 0) {
            transactionSplitsRepository.softDeleteByTransactionIds(
              Array.from(parentTxIdsWithSplits),
            );
          }
          // Restore parent amounts in one update per parent (re-read from DB so
          // multiple restored splits per parent accumulate correctly).
          restoreByParentId.forEach((restore, parentId) => {
            const currentParent = transactionsRepository.getById(parentId);
            if (!currentParent) return;
            transactionsRepository.update(parentId, {
              amount: normalizeMoneyAmount(currentParent.amount + restore),
            });
          });
          reverseSplitMap.forEach((splitId) => {
            transactionSplitsRepository.markUnpaid(splitId);
          });
          void trackEvent(
            uniqueIds.length === 1
              ? AnalyticsEvents.TRANSACTION_DELETED
              : AnalyticsEvents.TRANSACTIONS_BULK_DELETED,
            { count: uniqueIds.length },
          );
        } catch {
          // rollback on failure
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions],
  );

  const updateTransaction = useCallback(
    (id: string, input: Partial<CreateTransactionInput>) => {
      updateTransactionsBulk([{ id, input }]);
    },
    [updateTransactionsBulk],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      deleteTransactionsBulk([id]);
    },
    [deleteTransactionsBulk],
  );

  const createTransactionWithSplits = useCallback(
    (input: CreateTransactionInput, splits: SplitDraftInput[]) => {
      const parentSnapshot = buildSnapshot(
        input.type,
        normalizeMoneyAmount(input.amount),
        input.currency,
      );
      const normalizedInput = {
        ...input,
        amount: normalizeMoneyAmount(input.amount),
        reportingCurrency: input.reportingCurrency ?? parentSnapshot.reportingCurrency,
        reportingAmount: input.reportingAmount ?? parentSnapshot.reportingAmount,
        fxRate: input.fxRate ?? parentSnapshot.fxRate,
        accountAmount: input.accountAmount ?? null,
      };
      const txId = newId();
      const now = nowIso();

      // Pre-marked-paid splits (create-mode Mark Paid) need a transfer tx if
      // the payback account differs from the parent's account. We allocate
      // those ids upfront so the split can link to them via paidTransactionId.
      type Transfer = { id: string; amount: number; toAccountId: string };
      const transfersToCreate: Transfer[] = [];
      const optimisticSplits: TransactionSplit[] = splits.map((draft, index) => {
        const splitAmount = normalizeMoneyAmount(draft.amount);
        let paidTransactionId: string | null = draft.paid?.paidTransactionId ?? null;
        if (
          draft.paid &&
          !paidTransactionId &&
          normalizedInput.accountId &&
          draft.paybackAccountId &&
          draft.paybackAccountId !== normalizedInput.accountId
        ) {
          paidTransactionId = newId();
          transfersToCreate.push({
            id: paidTransactionId,
            amount: splitAmount,
            toAccountId: draft.paybackAccountId,
          });
        }
        return {
          id: draft.id ?? newId(),
          transactionId: txId,
          personName: draft.personName,
          amount: splitAmount,
          isSelf: draft.isSelf,
          paybackAccountId: draft.paybackAccountId,
          paidAt: draft.paid?.paidAt ?? null,
          paidTransactionId,
          sortOrder: draft.sortOrder ?? index,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
      });

      const optimisticTransfers: TransactionWithRelations[] = transfersToCreate.map((t) => ({
        id: t.id,
        type: 'transfer',
        amount: t.amount,
        currency: normalizedInput.currency,
        reportingCurrency: null,
        reportingAmount: null,
        fxRate: null,
        toAmount: null,
        accountAmount: null,
        date: normalizedInput.date,
        accountId: null,
        fromAccountId: normalizedInput.accountId ?? null,
        toAccountId: t.toAccountId,
        categoryId: null,
        note: null,
        receiptUri: null,
        sentiment: 'neutral',
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames({
          fromAccountId: normalizedInput.accountId,
          toAccountId: t.toAccountId,
        }),
      }));

      const optimisticParent: TransactionWithRelations = {
        id: txId,
        type: normalizedInput.type,
        amount: normalizedInput.amount,
        currency: normalizedInput.currency,
        reportingCurrency: normalizedInput.reportingCurrency,
        reportingAmount: normalizedInput.reportingAmount,
        fxRate: normalizedInput.fxRate,
        toAmount: null,
        accountAmount: normalizedInput.accountAmount ?? null,
        date: normalizedInput.date,
        accountId: normalizedInput.accountId ?? null,
        fromAccountId: normalizedInput.fromAccountId ?? null,
        toAccountId: normalizedInput.toAccountId ?? null,
        categoryId: normalizedInput.categoryId ?? null,
        note: normalizedInput.note ?? null,
        receiptUri: normalizedInput.receiptUri ?? null,
        sentiment: normalizedInput.sentiment ?? 'neutral',
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames(normalizedInput),
        splits: optimisticSplits,
        splitsSummary: summarizeSplits(optimisticSplits),
      };
      setTransactions((prev) =>
        sortTransactions([optimisticParent, ...optimisticTransfers, ...prev], 'date_desc'),
      );
      runDeferredWrite(() => {
        try {
          transactionsRepository.createWithId(txId, normalizedInput);
          // Auto-file the primary transaction into the active album, if any.
          const activeAlbumId = albumsRepository.getActiveId();
          if (activeAlbumId) {
            albumsRepository.addTransactions(activeAlbumId, [txId]);
            setAlbums(albumsRepository.list());
          }
          for (const t of transfersToCreate) {
            transactionsRepository.createWithId(t.id, {
              type: 'transfer',
              amount: t.amount,
              currency: normalizedInput.currency,
              date: normalizedInput.date,
              fromAccountId: normalizedInput.accountId ?? null,
              toAccountId: t.toAccountId,
              accountId: null,
              categoryId: null,
              note: null,
              sentiment: 'neutral',
            });
          }
          // Persist each split with the same id used in the optimistic state so
          // references stay stable across the refresh below.
          optimisticSplits.forEach((s) => {
            transactionSplitsRepository.createWithId(s.id, {
              transactionId: txId,
              personName: s.personName,
              amount: s.amount,
              isSelf: s.isSelf,
              paybackAccountId: s.paybackAccountId,
              sortOrder: s.sortOrder,
              paidAt: s.paidAt,
              paidTransactionId: s.paidTransactionId,
            });
          });
          recordTransactionLogged();
        } catch {
          // optimistic rollback handled by refresh
        }
        scheduleRefreshTransactions();
      });
    },
    [buildSnapshot, scheduleRefreshTransactions, resolveRelationNames],
  );

  const updateTransactionSplits = useCallback(
    (transactionId: string, splits: SplitDraftInput[]) => {
      const now = nowIso();
      const optimisticSplits: TransactionSplit[] = splits.map((draft, index) => {
        const existing = draft.id;
        return {
          id: existing ?? newId(),
          transactionId,
          personName: draft.personName,
          amount: normalizeMoneyAmount(draft.amount),
          isSelf: draft.isSelf,
          paybackAccountId: draft.paybackAccountId,
          paidAt: null,
          paidTransactionId: null,
          sortOrder: draft.sortOrder ?? index,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
      });
      // Preserve existing paid state on rows that are kept by id.
      setTransactions((prev) =>
        prev.map((tx) => {
          if (tx.id !== transactionId) return tx;
          const existingById = new Map((tx.splits ?? []).map((s) => [s.id, s]));
          const merged = optimisticSplits.map((next) => {
            const prior = existingById.get(next.id);
            if (prior) {
              return {
                ...next,
                paidAt: prior.paidAt,
                paidTransactionId: prior.paidTransactionId,
                createdAt: prior.createdAt,
              };
            }
            return next;
          });
          return { ...tx, splits: merged, splitsSummary: summarizeSplits(merged) };
        }),
      );
      runDeferredWrite(() => {
        try {
          const existingPersisted = transactionSplitsRepository.listByTransactionId(transactionId);
          const nextIds = new Set(optimisticSplits.map((s) => s.id));
          // Soft-delete removed splits.
          existingPersisted
            .filter((s) => !nextIds.has(s.id))
            .forEach((s) => transactionSplitsRepository.softDelete(s.id));
          // Upsert the rest.
          const existingMap = new Map(existingPersisted.map((s) => [s.id, s]));
          optimisticSplits.forEach((next) => {
            const prior = existingMap.get(next.id);
            if (prior) {
              transactionSplitsRepository.update(next.id, {
                personName: next.personName,
                amount: next.amount,
                paybackAccountId: next.paybackAccountId,
                sortOrder: next.sortOrder,
              });
            } else {
              transactionSplitsRepository.createWithId(next.id, {
                transactionId,
                personName: next.personName,
                amount: next.amount,
                isSelf: next.isSelf,
                paybackAccountId: next.paybackAccountId,
                sortOrder: next.sortOrder,
              });
            }
          });
        } catch {
          // ignore; refresh below restores truth
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions],
  );

  const markSplitPaid = useCallback(
    (
      splitId: string,
      options?: { paybackAccountId?: string | null; date?: string; note?: string | null },
    ) => {
      const transferTxId = newId();
      const paidAtIso = nowIso();
      const date = options?.date ?? dayKeyFromDateLocal(new Date());
      const note = options?.note?.trim() || null;
      const optionPaybackAccountId = options?.paybackAccountId;

      // Optimistic state update. Reads parent from `prev` so it sees splits
      // inserted by an earlier setter in the same batch (e.g. when Save calls
      // updateTransactionSplits then markSplitPaid for a brand-new paid row).
      setTransactions((prev) => {
        const parent = prev.find((tx) => tx.splits?.some((s) => s.id === splitId));
        const split = parent?.splits?.find((s) => s.id === splitId);
        if (!parent || !split || split.isSelf) return prev;
        if (split.paidAt) return prev;
        const paybackAccountId =
          optionPaybackAccountId !== undefined
            ? optionPaybackAccountId
            : (split.paybackAccountId ?? parent.accountId ?? null);
        if (!parent.accountId || !paybackAccountId) return prev;

        const sameAccount = paybackAccountId === parent.accountId;
        const splitAmount = split.amount;
        const usedTransferTxId = sameAccount ? null : transferTxId;

        // For cross-account paybacks we model the friend's repayment as a
        // transfer from the original-paying account to the destination
        // account, and reduce the parent expense so its account balance
        // reflects only the user's net outlay.
        const optimisticTransfer: TransactionWithRelations | null = sameAccount
          ? null
          : {
              id: transferTxId,
              type: 'transfer',
              amount: splitAmount,
              currency: parent.currency,
              reportingCurrency: null,
              reportingAmount: null,
              fxRate: null,
              toAmount: null,
              accountAmount: null,
              date,
              accountId: null,
              fromAccountId: parent.accountId,
              toAccountId: paybackAccountId,
              categoryId: null,
              note,
              receiptUri: null,
              sentiment: 'neutral',
              recurrencePattern: 'none',
              recurrenceInterval: 1,
              recurrenceEndDate: null,
              recurrenceParentId: null,
              createdAt: paidAtIso,
              updatedAt: paidAtIso,
              deletedAt: null,
              ...resolveRelationNames({
                fromAccountId: parent.accountId,
                toAccountId: paybackAccountId,
              }),
            };

        const next = prev.map((tx) => {
          if (tx.id !== parent.id) return tx;
          const reducedAmount = normalizeMoneyAmount(tx.amount - splitAmount);
          const updatedSplits = (tx.splits ?? []).map((s) =>
            s.id === splitId
              ? {
                  ...s,
                  paidAt: paidAtIso,
                  paidTransactionId: usedTransferTxId,
                  paybackAccountId,
                }
              : s,
          );
          return {
            ...tx,
            amount: reducedAmount,
            updatedAt: paidAtIso,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        });
        return optimisticTransfer
          ? sortTransactions([optimisticTransfer, ...next], 'date_desc')
          : next;
      });

      // Always queue the persistence step. Earlier we tried to populate
      // `collected` inside the updater and short-circuit if the updater bailed,
      // but React 19 batches setState calls in event handlers so the updater
      // runs *after* the synchronous code — `collected` would always be null
      // and the write would never happen. Instead, the IM reads the split from
      // DB. By the time this runs, updateTransactionSplits' own IM has already
      // written any brand-new rows, so this works for both existing and newly
      // inserted paid splits.
      runDeferredWrite(() => {
        try {
          const split = transactionSplitsRepository.findById(splitId);
          if (!split || split.isSelf || split.paidAt) return;
          const parent = transactionsRepository.getById(split.transactionId);
          if (!parent || !parent.accountId) return;
          const paybackAccountId =
            optionPaybackAccountId !== undefined
              ? optionPaybackAccountId
              : (split.paybackAccountId ?? parent.accountId ?? null);
          if (!paybackAccountId) return;
          const sameAccount = paybackAccountId === parent.accountId;
          const usedTransferTxId = sameAccount ? null : transferTxId;
          transactionsRepository.update(parent.id, {
            amount: normalizeMoneyAmount(parent.amount - split.amount),
          });
          if (!sameAccount && usedTransferTxId) {
            transactionsRepository.createWithId(usedTransferTxId, {
              type: 'transfer',
              amount: split.amount,
              currency: parent.currency,
              date,
              fromAccountId: parent.accountId,
              toAccountId: paybackAccountId,
              accountId: null,
              categoryId: null,
              note,
              sentiment: 'neutral',
            });
          }
          transactionSplitsRepository.update(splitId, {
            paybackAccountId,
            paidAt: paidAtIso,
            paidTransactionId: usedTransferTxId,
          });
          void trackEvent(AnalyticsEvents.SPLIT_MARKED_PAID, {
            payback_account_changed: !sameAccount,
            same_account: sameAccount,
          });
        } catch {
          // ignore; refresh below restores truth
        }
        scheduleRefreshTransactions();
      });
    },
    [resolveRelationNames, scheduleRefreshTransactions],
  );

  const markSplitUnpaid = useCallback(
    (splitId: string) => {
      const now = nowIso();

      // Optimistic state update.
      setTransactions((prev) => {
        const parent = prev.find((tx) => tx.splits?.some((s) => s.id === splitId));
        const split = parent?.splits?.find((s) => s.id === splitId);
        if (!parent || !split || !split.paidAt) return prev;
        const transferTxId = split.paidTransactionId;
        const splitAmount = split.amount;
        const filtered = transferTxId ? prev.filter((tx) => tx.id !== transferTxId) : prev;
        return filtered.map((tx) => {
          if (tx.id !== parent.id) return tx;
          const restoredAmount = normalizeMoneyAmount(tx.amount + splitAmount);
          const updatedSplits = (tx.splits ?? []).map((s) =>
            s.id === splitId ? { ...s, paidAt: null, paidTransactionId: null } : s,
          );
          return {
            ...tx,
            amount: restoredAmount,
            updatedAt: now,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        });
      });

      // Always queue persistence; read from DB to avoid the React 19 batching
      // race where setTransactions updaters run after this synchronous code.
      runDeferredWrite(() => {
        try {
          const split = transactionSplitsRepository.findById(splitId);
          if (!split || !split.paidAt) return;
          const parent = transactionsRepository.getById(split.transactionId);
          if (parent) {
            transactionsRepository.update(parent.id, {
              amount: normalizeMoneyAmount(parent.amount + split.amount),
            });
          }
          if (split.paidTransactionId) {
            transactionsRepository.softDelete(split.paidTransactionId);
          }
          transactionSplitsRepository.markUnpaid(splitId);
          void trackEvent(AnalyticsEvents.SPLIT_MARKED_UNPAID, {});
        } catch {
          // ignore
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions],
  );

  const canUseTimeDisplayMode = useMemo(
    () =>
      (currentMonthWage?.trueHourlyRate ?? 0) > 0 ||
      monthlyWages.some((wage) => wage.trueHourlyRate > 0),
    [currentMonthWage?.trueHourlyRate, monthlyWages],
  );

  const updateSettings = useCallback(
    (
      updates: Partial<
        Pick<
          UserSettings,
          | 'locale'
          | 'currencyCode'
          | 'currencySymbol'
          | 'displayMode'
          | 'hapticsEnabled'
          | 'themeMode'
          | 'themeColor'
          | 'accountLogoCountry'
          | 'profileName'
          | 'profileAvatarUri'
          | 'onboardingCompleted'
          | 'userMode'
          | 'weekStartsOn'
          | 'biometricLockEnabled'
          | 'biometricLockDelaySeconds'
          | 'autoBackupEnabled'
          | 'autoBackupTarget'
          | 'lastAutoBackupAt'
          | 'lastAutoBackupError'
        >
      >,
    ) => {
      const nextUpdates = { ...updates };
      if (nextUpdates.displayMode === 'time' && !canUseTimeDisplayMode) {
        nextUpdates.displayMode = 'money';
      }
      runMutation(
        () => {
          settingsRepository.updateSettings(nextUpdates);
        },
        {
          refresh: () => {
            const next = settingsRepository.get();
            // Apply a locale change synchronously before the state commit so
            // the re-render already paints in the new language (matches the
            // sync apply refreshAll used to do).
            setAppLocale(next.locale);
            setSettings(next);
            // A reporting-currency change re-bases the FX rate table.
            if (nextUpdates.currencyCode) reloadRateTable(next.currencyCode);
          },
        },
      );
      const changedKeys = Object.keys(nextUpdates).filter(
        (key) => key !== 'onboardingCompleted' && key !== 'userMode',
      );
      if (changedKeys.length > 0) {
        void trackEvent(AnalyticsEvents.SETTINGS_UPDATED, {
          changed_fields: changedKeys.join(','),
        });
      }
    },
    [canUseTimeDisplayMode, reloadRateTable, runMutation],
  );

  // ---- Multi-currency / FX ----

  const convertToReporting = useCallback((amount: number, currency: string): number => {
    return convert(amount, currency, reportingCurrencyRef.current, rateTableRef.current).value;
  }, []);

  const listExchangeRates = useCallback((): ExchangeRate[] => {
    return exchangeRatesRepository.listByBase(reportingCurrencyRef.current);
  }, []);

  const refreshExchangeRates = useCallback(async (): Promise<RateRefreshResult> => {
    const result = await refreshRatesNow();
    reloadRateTable(reportingCurrencyRef.current);
    setSettings(settingsRepository.get());
    return result;
  }, [reloadRateTable]);

  const setManualExchangeRate = useCallback(
    (quoteCurrency: string, rate: number) => {
      if (!Number.isFinite(rate) || rate <= 0) return;
      const base = reportingCurrencyRef.current;
      exchangeRatesRepository.setManualRate(
        base,
        quoteCurrency,
        rate,
        dayKeyFromDateLocal(new Date()),
      );
      reloadRateTable(base);
    },
    [reloadRateTable],
  );

  const persistFxCurrencies = useCallback((codes: string[]) => {
    settingsRepository.updateSettings({ fxCurrenciesJson: JSON.stringify(codes) });
    setSettings(settingsRepository.get());
  }, []);

  const addFxCurrency = useCallback(
    async (code: string) => {
      const base = reportingCurrencyRef.current;
      if (!code || code === base) return;
      const current = parseFxCurrencies(settingsRepository.get().fxCurrenciesJson);
      if (!current.includes(code)) persistFxCurrencies([...current, code]);
      // Auto-populate the latest rate on first add. The daily cache usually
      // already holds it; otherwise force a fetch when both legs are auto-rated.
      const hasRate = exchangeRatesRepository.getRate(base, code) != null;
      if (!hasRate && isAutoRateSupported(code) && isAutoRateSupported(base)) {
        await refreshRatesNow();
        setSettings(settingsRepository.get());
      }
      reloadRateTable(base);
    },
    [persistFxCurrencies, reloadRateTable],
  );

  const removeFxCurrency = useCallback(
    (code: string) => {
      const current = parseFxCurrencies(settingsRepository.get().fxCurrenciesJson);
      persistFxCurrencies(current.filter((c) => c !== code));
    },
    [persistFxCurrencies],
  );

  // Persist a user-chosen order for the tracked sub-currencies. The list shown
  // on the Multi currency page can include account currencies not yet in the
  // stored set, so we absorb the full ordered list (deduped, minus the
  // reporting currency) — harmless, since removal still filters by code.
  const reorderFxCurrencies = useCallback(
    (codes: string[]) => {
      const base = reportingCurrencyRef.current;
      const seen = new Set<string>();
      const next: string[] = [];
      for (const code of codes) {
        if (!code || code === base || seen.has(code)) continue;
        seen.add(code);
        next.push(code);
      }
      persistFxCurrencies(next);
    },
    [persistFxCurrencies],
  );

  const fxCurrencies = useMemo(
    () => parseFxCurrencies(settings?.fxCurrenciesJson ?? null),
    [settings?.fxCurrenciesJson],
  );

  // Changing the main currency wipes all data and starts fresh in the new
  // currency (historical entries can't be re-based reliably). Gated behind a
  // typed confirmation in the UI.
  const resetAndChangeMainCurrency = useCallback(
    (code: string) => {
      runMutation(() => {
        purgeAllData();
        settingsRepository.updateSettings({
          currencyCode: code,
          currencySymbol: currencySymbolForCode(code),
          onboardingCompleted: true,
        });
        exchangeRatesRepository.clearAll();
        // Re-seed the default categories and accounts in the new currency so the
        // user lands in a usable (not empty) app rather than re-onboarding.
        seedMinimalCategoriesIfMissing();
        seedPowerAccountsIfMissing(code);
      });
      reportingCurrencyRef.current = code;
      void runRateRefreshIfDue({ force: true }).then((result) => {
        if (result.ok) reloadRateTable(code);
      });
      void trackEvent(AnalyticsEvents.SETTINGS_UPDATED, { changed_fields: 'currencyCode_reset' });
    },
    [reloadRateTable, runMutation],
  );

  // Refresh FX rates once on load (and when the reporting currency changes),
  // subject to the daily staleness guard inside the service.
  const fxReportingCurrency = settings?.currencyCode;
  useEffect(() => {
    if (!fxReportingCurrency) return;
    let cancelled = false;
    void runRateRefreshIfDue().then((result) => {
      if (cancelled || !result.ok || !result.asOfDate) return;
      reloadRateTable(fxReportingCurrency);
    });
    return () => {
      cancelled = true;
    };
  }, [fxReportingCurrency, reloadRateTable]);

  useEffect(() => {
    if (!settings?.locale) return;
    setAppLocale(settings.locale);
  }, [settings?.locale]);

  useEffect(() => {
    setHapticsEnabled(settings?.hapticsEnabled ?? true);
  }, [settings?.hapticsEnabled]);

  useEffect(() => {
    if (!settings?.appUserId) return;
    void identifyUser(settings.appUserId);
    setErrorUser(settings.appUserId);
  }, [settings?.appUserId]);

  // Auto-backup: register/unregister background task when the toggle changes.
  const autoBackupEnabled = settings?.autoBackupEnabled ?? true;
  useEffect(() => {
    if (autoBackupEnabled) {
      void registerBackgroundTask();
    } else {
      void unregisterBackgroundTask();
    }
  }, [autoBackupEnabled]);

  // Auto-backup: foreground trigger. The background task is best-effort on iOS;
  // this is the reliable path that fires on every cold start and every return
  // to foreground when the last backup is stale (>24h). Only the `settings`
  // row changes after a backup (lastAutoBackupAt / lastAutoBackupError) so we
  // use the lightweight refreshSettings instead of a full refreshAll.
  useEffect(() => {
    if (!autoBackupEnabled) return;
    void runAutoBackupIfDue().then((result) => {
      if (!result.skipped) refreshSettings();
    });
    const sub = RNAppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      void runAutoBackupIfDue().then((result) => {
        if (!result.skipped) refreshSettings();
      });
    });
    return () => {
      sub.remove();
    };
  }, [autoBackupEnabled, refreshSettings]);

  // Recurring rules are materialized inside refreshAll()'s runDueTransactions
  // pass. Before scoped mutation refreshes, every mutation reached that pass
  // incidentally; now the only routine trigger is the cold-start load — not
  // enough for an app that stays resident across midnight. Re-run the full
  // reload on the first foreground of each new day so due recurring entries
  // (and the weekly notification body) materialize without a cold start.
  const lastFullRefreshDayRef = useRef(dayKeyFromDateLocal(new Date()));
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      const today = dayKeyFromDateLocal(new Date());
      if (today === lastFullRefreshDayRef.current) return;
      lastFullRefreshDayRef.current = today;
      refreshAll();
    });
    return () => {
      sub.remove();
    };
  }, [refreshAll]);

  const superPropUserMode = settings?.userMode ?? 'power';
  const superPropCurrencyCode = settings?.currencyCode;
  const superPropLocale = settings?.locale;
  const superPropThemeMode = settings?.themeMode;
  const superPropThemeColor = settings?.themeColor;
  const superPropDisplayMode = settings?.displayMode;

  useEffect(() => {
    if (!superPropCurrencyCode) return;
    void setSuperProperties({
      user_mode: superPropUserMode,
      currency_code: superPropCurrencyCode,
      locale: superPropLocale,
      theme_mode: superPropThemeMode,
      theme_color: superPropThemeColor,
      display_mode: superPropDisplayMode,
    });
  }, [
    superPropUserMode,
    superPropCurrencyCode,
    superPropLocale,
    superPropThemeMode,
    superPropThemeColor,
    superPropDisplayMode,
  ]);

  const updateWageConfig = useCallback(
    (config: WageConfig) => {
      runMutation(
        () => {
          monthlyWageRepository.saveForCurrentMonth(config);
        },
        { refresh: refreshWages },
      );
    },
    [refreshWages, runMutation],
  );

  const updateWageConfigForMonth = useCallback(
    (month: string, config: WageConfig) => {
      runMutation(
        () => {
          monthlyWageRepository.saveForMonth(month, config);
        },
        { refresh: refreshWages },
      );
      void trackEvent(AnalyticsEvents.WAGE_CONFIG_UPDATED, { wage_type: config.wageType });
    },
    [refreshWages, runMutation],
  );

  const deleteWageConfigForMonth = useCallback(
    (month: string) => {
      runMutation(
        () => {
          monthlyWageRepository.softDeleteByMonth(month);
        },
        { refresh: refreshWages },
      );
    },
    [refreshWages, runMutation],
  );

  const toggleDisplayMode = useCallback(() => {
    const current = settingsRepository.get();
    if (current.displayMode === 'money' && !canUseTimeDisplayMode) {
      return;
    }
    const nextMode = current.displayMode === 'money' ? 'time' : 'money';
    runMutation(
      () => {
        settingsRepository.updateSettings({ displayMode: nextMode });
      },
      { refresh: refreshSettings },
    );
    void trackEvent(AnalyticsEvents.DISPLAY_MODE_TOGGLED, { mode: nextMode });
  }, [canUseTimeDisplayMode, refreshSettings, runMutation]);

  const updateInsightsPreferencesJson = useCallback((value: string | null) => {
    const normalized = value && value.trim().length > 0 ? value : null;
    setInsightsPreferencesJson((previous) => {
      if (previous === normalized) return previous;
      settingsRepository.updateInsightsPreferencesJson(normalized);
      return normalized;
    });
  }, []);

  const updateCalendarPreferencesJson = useCallback((value: string | null) => {
    const normalized = value && value.trim().length > 0 ? value : null;
    setCalendarPreferencesJson((previous) => {
      if (previous === normalized) return previous;
      settingsRepository.updateCalendarPrefsJson(normalized);
      return normalized;
    });
  }, []);

  const updateNotificationPrefs = useCallback((updates: Partial<NotificationPreferences>) => {
    setNotificationPrefs((previous) => {
      const merged = {
        dailyCheckin: { ...previous.dailyCheckin, ...updates.dailyCheckin },
        recurringAlert: { ...previous.recurringAlert, ...updates.recurringAlert },
        weeklySummary: { ...previous.weeklySummary, ...updates.weeklySummary },
      };
      settingsRepository.updateNotificationPreferencesJson(JSON.stringify(merged));
      void syncScheduledNotifications(merged);
      return merged;
    });
  }, []);

  const updateQuickEntryPrefs = useCallback((updates: Partial<QuickEntryPrefs>) => {
    setQuickEntryPrefs((previous) => {
      const merged: QuickEntryPrefs = {
        quickEntryEnabled:
          updates.quickEntryEnabled !== undefined
            ? updates.quickEntryEnabled
            : previous.quickEntryEnabled,
        categoryMap: updates.categoryMap !== undefined ? updates.categoryMap : previous.categoryMap,
        defaultExpenseCategoryId:
          updates.defaultExpenseCategoryId !== undefined
            ? updates.defaultExpenseCategoryId
            : previous.defaultExpenseCategoryId,
        defaultIncomeCategoryId:
          updates.defaultIncomeCategoryId !== undefined
            ? updates.defaultIncomeCategoryId
            : previous.defaultIncomeCategoryId,
        voiceInputEnabled:
          updates.voiceInputEnabled !== undefined
            ? updates.voiceInputEnabled
            : previous.voiceInputEnabled,
        voicePromptDismissed:
          updates.voicePromptDismissed !== undefined
            ? updates.voicePromptDismissed
            : previous.voicePromptDismissed,
        defaultAccountId:
          updates.defaultAccountId !== undefined
            ? updates.defaultAccountId
            : previous.defaultAccountId,
        defaultCurrency:
          updates.defaultCurrency !== undefined
            ? updates.defaultCurrency
            : previous.defaultCurrency,
        voiceSkipConfirmation:
          updates.voiceSkipConfirmation !== undefined
            ? updates.voiceSkipConfirmation
            : previous.voiceSkipConfirmation,
        voiceUsageCount:
          updates.voiceUsageCount !== undefined
            ? updates.voiceUsageCount
            : previous.voiceUsageCount,
        bulkCreateEnabled:
          updates.bulkCreateEnabled !== undefined
            ? updates.bulkCreateEnabled
            : previous.bulkCreateEnabled,
      };
      settingsRepository.updateQuickEntryPrefsJson(JSON.stringify(merged));
      return merged;
    });
  }, []);

  // Initialize notification handler and sync on mount
  useEffect(() => {
    initNotificationHandler();
    void initReviewPrompt();
  }, []);

  useEffect(() => {
    if (settings?.displayMode !== 'time') return;
    if (canUseTimeDisplayMode) return;
    settingsRepository.updateSettings({ displayMode: 'money' });
    refreshAll();
  }, [canUseTimeDisplayMode, refreshAll, settings?.displayMode]);

  const getAccountById = useCallback((id: string) => accountByIdMap.get(id), [accountByIdMap]);
  const getCategoryById = useCallback((id: string) => categoryByIdMap.get(id), [categoryByIdMap]);

  // Mirror the transaction count into a ref so callers can read it on demand
  // (e.g. gating a one-off prompt) without re-rendering on every transaction.
  const transactionCountRef = useRef(transactions.length);
  transactionCountRef.current = transactions.length;
  const getTransactionCount = useCallback(() => transactionCountRef.current, []);

  // Identity-stable: reads the render-synced map via a ref so transaction
  // churn doesn't rebuild the useApp() value. Consumers that memoize on the
  // result must key their memos on `useTransactions().transactions` (the
  // function identity no longer signals data changes).
  const transactionsByAccountIdRef = useRef(transactionsByAccountId);
  transactionsByAccountIdRef.current = transactionsByAccountId;
  const getTransactionsByAccount = useCallback(
    (accountId: string) =>
      transactionsByAccountIdRef.current.get(accountId) ?? EMPTY_ACCOUNT_TRANSACTIONS,
    [],
  );

  // Reads the repository fresh on every call, so it never returns stale data;
  // like getTransactionsByAccount, its identity does not track transaction
  // churn — memoizing callers must key on `useTransactions().transactions`.
  const queryTransactions = useCallback((filters: Partial<TransactionFilters> = {}) => {
    return transactionsRepository.list(filters);
  }, []);

  const orderedRateHistory = useMemo(
    () => buildNormalizedRateHistory(monthlyWages),
    [monthlyWages],
  );

  const getHourlyRateForMonth = useMemo(() => {
    const fallbackRate = currentMonthWage?.trueHourlyRate ?? 0;
    if (orderedRateHistory.length === 0) {
      return (_month: string) => fallbackRate;
    }

    const monthKeys = orderedRateHistory.map((entry) => entry.month);
    const rates = orderedRateHistory.map((entry) => entry.rate);
    const cachedRatesByMonth = new Map<string, number>();

    return (targetMonth: string) => {
      const cachedRate = cachedRatesByMonth.get(targetMonth);
      if (cachedRate !== undefined) {
        return cachedRate;
      }

      let left = 0;
      let right = monthKeys.length - 1;
      let resolvedIndex = -1;
      while (left <= right) {
        const middle = (left + right) >> 1;
        const middleMonth = monthKeys[middle] ?? '';
        if (middleMonth <= targetMonth) {
          resolvedIndex = middle;
          left = middle + 1;
        } else {
          right = middle - 1;
        }
      }

      const resolvedRate =
        resolvedIndex >= 0 ? (rates[resolvedIndex] ?? fallbackRate) : (rates[0] ?? fallbackRate);
      cachedRatesByMonth.set(targetMonth, resolvedRate);
      return resolvedRate;
    };
  }, [currentMonthWage?.trueHourlyRate, orderedRateHistory]);

  const getTrueHourlyRateForDate = useCallback(
    (dateIso: string) => {
      const targetMonth = normalizeMonthKey(monthKeyFromDateIso(dateIso));
      return getHourlyRateForMonth(targetMonth);
    },
    [getHourlyRateForMonth],
  );

  const isTimeDisplayMode = settings?.displayMode === 'time';
  const valueForDisplay = useCallback(
    (amount: number, dateIso: string) => {
      if (!isTimeDisplayMode) {
        return amount;
      }
      const targetMonth = normalizeMonthKey(monthKeyFromDateIso(dateIso));
      const rate = getHourlyRateForMonth(targetMonth);
      return amountToHoursByRate(amount, rate);
    },
    [getHourlyRateForMonth, isTimeDisplayMode],
  );

  const displayValueByTransactionId = useMemo(() => {
    if (!isTimeDisplayMode) return null;
    const next = new Map<string, number>();
    const hourlyRateByMonth = new Map<string, number>();
    transactions.forEach((transaction) => {
      const monthKey = normalizeMonthKey(monthKeyFromDateIso(transaction.date));
      let rate = hourlyRateByMonth.get(monthKey);
      if (rate === undefined) {
        rate = getHourlyRateForMonth(monthKey);
        hourlyRateByMonth.set(monthKey, rate);
      }
      next.set(
        transaction.id,
        amountToHoursByRate(transaction.reportingAmount ?? transaction.amount, rate),
      );
    });
    return next;
  }, [getHourlyRateForMonth, isTimeDisplayMode, transactions]);

  // The per-transaction map is read via a render-synced ref so this callback's
  // identity doesn't change on every write in time mode (which would rebuild
  // the useApp() value). It still changes when the display mode or the wage
  // history changes — the signals consumers' memos actually need.
  const displayValueByTransactionIdRef = useRef(displayValueByTransactionId);
  displayValueByTransactionIdRef.current = displayValueByTransactionId;
  const getDisplayValueForTransaction = useCallback(
    (transaction: TransactionWithRelations) => {
      if (!isTimeDisplayMode) return transaction.amount;
      return (
        displayValueByTransactionIdRef.current?.get(transaction.id) ??
        valueForDisplay(transaction.reportingAmount ?? transaction.amount, transaction.date)
      );
    },
    [isTimeDisplayMode, valueForDisplay],
  );

  const isSimpleMode = settings?.userMode === 'simple';

  const simpleWalletId = useMemo(() => {
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      if (!account) continue;
      if (account.name === SIMPLE_WALLET_NAME && !account.deletedAt) {
        return account.id;
      }
    }
    return null;
  }, [accounts]);

  const getCashflowSummary = useCallback(
    (range: DateRange): CashflowSummary => {
      const txns = transactionsRepository.listForSummary({
        dateRange: range,
        accountId: isSimpleMode && simpleWalletId ? simpleWalletId : null,
      });

      let income = 0;
      let expense = 0;
      txns.forEach((transaction) => {
        const value = valueForDisplay(
          transaction.reportingAmount ?? transaction.amount,
          transaction.date,
        );
        if (transaction.type === 'income') {
          income += value;
        } else if (transaction.type === 'expense') {
          expense += value;
        }
      });

      return { income, expense };
    },
    [valueForDisplay, isSimpleMode, simpleWalletId],
  );

  const buildBreakdown = useCallback(
    (range: DateRange, type: 'income' | 'expense', groupByRoot: boolean): BreakdownItem[] => {
      const txns = transactionsRepository.listForSummary({
        type,
        dateRange: range,
        accountId: isSimpleMode && simpleWalletId ? simpleWalletId : null,
      });

      return aggregateBreakdown(txns, {
        resolveCategory: (id) => categoryByIdMap.get(id),
        valueOf: valueForDisplay,
        groupByRoot,
      });
    },
    // Transactions are read fresh from the DB inside, so results are never
    // stale; the identity deliberately does NOT track transaction churn (that
    // dep rebuilt the whole useApp() value on every write). Memoizing callers
    // must key on `useTransactions().transactions`.
    [categoryByIdMap, valueForDisplay, isSimpleMode, simpleWalletId],
  );

  const getExpenseBreakdownByCategory = useCallback(
    (range: DateRange) => buildBreakdown(range, 'expense', true),
    [buildBreakdown],
  );
  const getExpenseBreakdownBySubcategory = useCallback(
    (range: DateRange) => buildBreakdown(range, 'expense', false),
    [buildBreakdown],
  );
  const getIncomeBreakdown = useCallback(
    (range: DateRange) => buildBreakdown(range, 'income', false),
    [buildBreakdown],
  );

  // Stats for every album, computed in one batched pass instead of per card.
  // Previously each `AlbumCard` (and map pin) called `getAlbumStats`, which ran
  // two synchronous SQLite queries (a stat-rows join + `getById`) during render —
  // so mounting the 12-album index fired ~24 blocking queries in a burst that
  // froze the JS thread on tab activation. Here a single `getAllStatRows` query
  // feeds an in-memory group-by; override dates come from the already-loaded
  // `albums` array (no `getById`). Keyed on `transactions` so totals stay live
  // after edits, and on `valueForDisplay` for the money/time-mode conversion.
  const albumStatsById = useMemo(() => {
    const map = new Map<string, AlbumStats>();
    if (albums.length === 0) return map;

    const rowsByAlbum = new Map<
      string,
      { type: string; date: string; amount: number; reportingAmount: number | null }[]
    >();
    albumsRepository.getAllStatRows().forEach((row) => {
      const list = rowsByAlbum.get(row.albumId);
      if (list) {
        list.push(row);
      } else {
        rowsByAlbum.set(row.albumId, [row]);
      }
    });

    albums.forEach((album) => {
      const rows = rowsByAlbum.get(album.id) ?? [];
      let totalSpent = 0;
      let startDate: string | null = null;
      let endDate: string | null = null;
      rows.forEach((row) => {
        if (row.type === 'expense') {
          totalSpent += valueForDisplay(row.reportingAmount ?? row.amount, row.date);
        }
        if (startDate === null || row.date < startDate) startDate = row.date;
        if (endDate === null || row.date > endDate) endDate = row.date;
      });
      // Manual overrides win over the computed first/last transaction dates.
      map.set(album.id, {
        totalSpent,
        transactionCount: rows.length,
        startDate: album.startDate ?? startDate,
        endDate: album.endDate ?? endDate,
      });
    });

    return map;
  }, [albums, transactions, valueForDisplay]);

  const getAlbumStats = useCallback(
    (albumId: string): AlbumStats => albumStatsById.get(albumId) ?? EMPTY_ALBUM_STATS,
    [albumStatsById],
  );

  const locatedAlbums = useMemo<LocatedAlbum[]>(() => albums.filter(isLocatedAlbum), [albums]);

  // Enrich each item with derived cost-per-day stats. Active items use today's
  // hourly rate for the work-time equivalent; inactive items freeze at their
  // end date (and use that month's rate). The item's amount is converted to the
  // reporting currency before applying the rate so foreign-currency items report
  // correct work-time.
  const reportingCurrencyCode = settings?.currencyCode ?? DEFAULT_CURRENCY;
  const itemsWithStats = useMemo<ItemWithStats[]>(() => {
    const todayKey = dayKeyFromDateLocal(new Date());
    return items.map((item) => {
      const rateDateKey = item.endDate ?? todayKey;
      const hourlyRate = getTrueHourlyRateForDate(rateDateKey);
      const fxRateToReporting =
        convert(1, item.currency, reportingCurrencyCode, rateTable).rateUsed ?? 1;
      return { ...item, ...computeItemStats(item, todayKey, hourlyRate, fxRateToReporting) };
    });
  }, [getTrueHourlyRateForDate, items, rateTable, reportingCurrencyCode]);

  const createItem = useCallback((input: CreateItemInput) => {
    const id = itemsRepository.create(input);
    setItems(itemsRepository.list());
    return id;
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<CreateItemInput>) => {
    itemsRepository.update(id, updates);
    setItems(itemsRepository.list());
  }, []);

  const deleteItem = useCallback((id: string) => {
    itemsRepository.softDelete(id);
    setItems(itemsRepository.list());
  }, []);

  const reorderItems = useCallback((ids: string[]) => {
    itemsRepository.reorder(ids);
    setItems(itemsRepository.list());
  }, []);

  const createBudgetTemplate = useCallback(
    (input: CreateBudgetTemplateInput) => {
      const result = runMutation(
        () => {
          const id = budgetTemplatesRepository.create({
            name: input.name,
            emoji: input.emoji ?? null,
            totalAmount: input.totalAmount,
            countUnbudgeted: input.countUnbudgeted ?? true,
            allocations: input.allocations,
          });
          const templates = budgetTemplatesRepository.list();
          const template = templates.find((candidate) => candidate.id === id);

          let backfilledMonths = 0;
          if (template && input.backPopulate) {
            const range = computeBackPopulateRange({
              transactions: transactionsRef.current,
              existingLiveMonths: monthlyBudgetsRepository.existingLiveMonths(),
            });
            if (range) {
              backfilledMonths = monthlyBudgetsRepository.createManyFromTemplate(
                range.months,
                template,
              ).length;
            }
          }

          // Saving a template (especially the first) materializes the current
          // month's budget right away — rollover isn't deferred to the next launch.
          const currentMonth = monthKeyFromDateLocal(new Date());
          const autoTemplate = pickAutoCreateTemplate({
            currentMonthHasEverHadBudget: monthlyBudgetsRepository.hasEverExisted(currentMonth),
            templates,
          });
          if (autoTemplate) {
            monthlyBudgetsRepository.createFromTemplate(currentMonth, autoTemplate);
          }

          return { id, backfilledMonths, autoCreated: autoTemplate != null };
        },
        { refresh: refreshBudgets },
      );

      if (result.backfilledMonths > 0) {
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, {
          source: 'backfill',
          months: result.backfilledMonths,
        });
      }
      if (result.autoCreated) {
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, { source: 'auto' });
      }
      void trackEvent(AnalyticsEvents.BUDGET_TEMPLATE_CREATED, {
        categories: input.allocations.length,
        backPopulate: Boolean(input.backPopulate),
      });
      return result.id;
    },
    [refreshBudgets, runMutation],
  );

  const updateBudgetTemplate = useCallback(
    (id: string, input: Omit<CreateBudgetTemplateInput, 'backPopulate'>) => {
      runMutation(
        () => {
          budgetTemplatesRepository.update(id, {
            name: input.name,
            emoji: input.emoji ?? null,
            totalAmount: input.totalAmount,
            countUnbudgeted: input.countUnbudgeted ?? true,
            allocations: input.allocations,
          });
        },
        { refresh: refreshBudgets },
      );
      void trackEvent(AnalyticsEvents.BUDGET_TEMPLATE_UPDATED, {
        categories: input.allocations.length,
      });
    },
    [refreshBudgets, runMutation],
  );

  const deleteBudgetTemplate = useCallback(
    (id: string) => {
      runMutation(
        () => {
          budgetTemplatesRepository.softDelete(id);
        },
        { refresh: refreshBudgets },
      );
      void trackEvent(AnalyticsEvents.BUDGET_TEMPLATE_DELETED);
    },
    [refreshBudgets, runMutation],
  );

  const setDefaultBudgetTemplate = useCallback(
    (id: string) => {
      runMutation(
        () => {
          budgetTemplatesRepository.setDefault(id);
        },
        { refresh: refreshBudgets },
      );
      void trackEvent(AnalyticsEvents.BUDGET_DEFAULT_CHANGED);
    },
    [refreshBudgets, runMutation],
  );

  const reorderBudgetTemplates = useCallback(
    (ids: string[]) => {
      runMutation(
        () => {
          budgetTemplatesRepository.reorder(ids);
        },
        { refresh: refreshBudgets },
      );
    },
    [refreshBudgets, runMutation],
  );

  const createMonthlyBudget = useCallback(
    (month: string, templateId: string) => {
      const created = runMutation(
        () => {
          const template = budgetTemplatesRepository
            .list()
            .find((candidate) => candidate.id === templateId);
          if (!template) return false;
          monthlyBudgetsRepository.createFromTemplate(month, template);
          return true;
        },
        { refresh: refreshBudgets },
      );
      if (created) {
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, { source: 'manual' });
      }
    },
    [refreshBudgets, runMutation],
  );

  const createCustomMonthlyBudget = useCallback(
    (
      month: string,
      input: { totalAmount: number; countUnbudgeted: boolean; lines: BudgetAllocationInput[] },
    ) => {
      const id = runMutation(() => monthlyBudgetsRepository.createCustom(month, input), {
        refresh: refreshBudgets,
      });
      if (id) {
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, { source: 'custom' });
      }
    },
    [refreshBudgets, runMutation],
  );

  const updateMonthlyBudget = useCallback(
    (
      id: string,
      input: { totalAmount: number; countUnbudgeted: boolean; lines: BudgetAllocationInput[] },
    ) => {
      runMutation(
        () => {
          monthlyBudgetsRepository.update(id, input);
        },
        { refresh: refreshBudgets },
      );
      void trackEvent(AnalyticsEvents.BUDGET_MONTH_UPDATED, { categories: input.lines.length });
    },
    [refreshBudgets, runMutation],
  );

  const deleteMonthlyBudget = useCallback(
    (id: string) => {
      runMutation(
        () => {
          monthlyBudgetsRepository.softDelete(id);
        },
        { refresh: refreshBudgets },
      );
      void trackEvent(AnalyticsEvents.BUDGET_MONTH_DELETED);
    },
    [refreshBudgets, runMutation],
  );

  const getTransfersBetweenAccounts = useCallback(
    (fromAccountId: string, toAccountId: string, start?: string, end?: string) => {
      return transactionsRepository.getTransfersBetweenAccounts(
        fromAccountId,
        toAccountId,
        start,
        end,
      );
    },
    [],
  );

  const resetAllData = useCallback(() => {
    runMutation(() => {
      purgeAllData();
    });
    void cancelAllNotifications();
    void trackEvent(AnalyticsEvents.DATA_RESET, { scope: 'all' });
    void flushAnalytics();
  }, [runMutation]);

  const resetTransactionsOnly = useCallback(() => {
    runMutation(() => {
      purgeTransactionsOnly();
      resetTransactionFilters();
    });
    void trackEvent(AnalyticsEvents.DATA_RESET, { scope: 'transactions_only' });
  }, [resetTransactionFilters, runMutation]);

  const importMoneyManagerBackup = useCallback(
    async (uri: string, fileName?: string) => {
      const normalizedName = fileName?.trim().toLowerCase();
      if (normalizedName && !normalizedName.endsWith('.mmbak')) {
        throw new Error(I18n.t('errors.only_mmbak_supported'));
      }

      try {
        // Preserve app-level settings and hourly wage settings on manual imports.
        purgeDataForImport();

        const symbol = settings?.currencySymbol ?? '$';
        const summary = await importMoneyManagerBackupFromUri(uri, symbol);
        // Money Manager rows are written with the currency symbol — normalize to
        // ISO codes so multi-currency treats them correctly.
        normalizeCurrencyColumns(getSQLite());
        refreshAll();
        void trackEvent(AnalyticsEvents.DATA_IMPORTED, {
          accounts: summary.accounts,
          categories: summary.categories,
          transactions: summary.transactions,
        });
        return summary;
      } catch (error) {
        throw toError(error, I18n.t('errors.import_failed_generic'));
      }
    },
    [refreshAll, settings?.currencySymbol],
  );

  const completeOnboarding = useCallback(
    (options?: {
      userMode?: UserMode;
      seedSimpleDefaults?: boolean;
      seedPowerDefaults?: boolean;
    }) => {
      try {
        const currentSettings = settingsRepository.get();
        // Seed new accounts/wallets with the reporting currency CODE so they
        // participate correctly in multi-currency conversion.
        const preferredCurrency = currentSettings.currencyCode ?? DEFAULT_CURRENCY;
        let createdCategories = 0;
        let createdAccounts = 0;
        let shouldRefreshAccounts = false;
        let shouldRefreshCategories = false;

        // Always make sure the user finishes onboarding with at least the
        // minimal category set. `seedMinimalCategoriesIfMissing` is
        // idempotent (it no-ops for any category that already exists by
        // name), so this is safe to call on every path — including the
        // "Skip setup" exit, the power-mode-no-seed path, and a returning
        // user who somehow lands back in this flow.
        createdCategories = seedMinimalCategoriesIfMissing();
        if (createdCategories > 0) shouldRefreshCategories = true;

        if (options?.userMode === 'simple') {
          ensureSimpleWalletExists(preferredCurrency);
          shouldRefreshAccounts = true;
        }

        if (options?.userMode === 'power' && options.seedPowerDefaults) {
          const powerPreferredCurrency =
            accountsRepository.list()[0]?.currency ?? preferredCurrency;
          createdAccounts = seedPowerAccountsIfMissing(powerPreferredCurrency);
          shouldRefreshAccounts = true;
        }

        settingsRepository.updateSettings({
          onboardingCompleted: true,
          ...(options?.userMode ? { userMode: options.userMode } : null),
        });

        if (shouldRefreshAccounts) {
          setAccounts(accountsRepository.list());
          setAccountGroups(accountGroupsRepository.list());
        }
        if (shouldRefreshCategories) {
          setCategories(categoriesRepository.list());
        }
        setSettings(settingsRepository.get());
        setLoadError(null);

        if (options?.userMode) {
          void trackEvent(AnalyticsEvents.MODE_SWITCHED, { mode: options.userMode });
        }

        return { createdAccounts, createdCategories };
      } catch (error) {
        throw toError(error, I18n.t('errors.generic_operation_failed'));
      }
    },
    [],
  );

  const switchToSimpleMode = useCallback(
    (seedDefaults = false) => {
      runMutation(() => {
        const currentSettings = settingsRepository.get();
        ensureSimpleWalletExists(currentSettings.currencyCode ?? DEFAULT_CURRENCY);
        if (seedDefaults) {
          seedMinimalCategoriesIfMissing();
        }
        settingsRepository.updateSettings({ userMode: 'simple' });
      });
      void trackEvent(AnalyticsEvents.MODE_SWITCHED, { mode: 'simple' });
    },
    [runMutation],
  );

  const switchToPowerMode = useCallback(() => {
    runMutation(() => {
      settingsRepository.updateSettings({ userMode: 'power' });
    });
    void trackEvent(AnalyticsEvents.MODE_SWITCHED, { mode: 'power' });
  }, [runMutation]);

  const deleteSimpleWalletAndTransactions = useCallback(() => {
    const walletId =
      accountsRepository.list().find((a) => a.name === SIMPLE_WALLET_NAME)?.id ?? null;
    if (!walletId) return;
    runMutation(() => {
      transactionsRepository.softDeleteByAccountId(walletId);
      accountsRepository.softDelete(walletId);
    });
  }, [runMutation]);

  const hasSettings = settings !== null;
  // Reporting-currency conversion over the raw balance rows. Pure map — the
  // SQLite aggregate behind rawAccountBalances runs after writes, not here.
  const accountBalances = useMemo(() => {
    if (isLoading || !hasSettings) {
      return [];
    }
    const reporting = settings?.currencyCode ?? rateTable.base;
    return rawAccountBalances.map((b) => {
      const { value, rateUsed } = convert(b.balance, b.currency, reporting, rateTable);
      return { ...b, convertedBalance: rateUsed === null ? null : value };
    });
  }, [rawAccountBalances, hasSettings, isLoading, rateTable, settings?.currencyCode]);

  const value = useMemo<AppContextValue | null>(
    () =>
      settings
        ? {
            isLoading,
            settings,
            currentMonthWage,
            monthlyWages,
            accountGroups,
            recurringRules,
            accounts,
            categories,
            rateTable,
            convertToReporting,
            listExchangeRates,
            refreshExchangeRates,
            setManualExchangeRate,
            resetAndChangeMainCurrency,
            fxCurrencies,
            addFxCurrency,
            removeFxCurrency,
            reorderFxCurrencies,
            setActiveAccountFilter,
            setTransactionFilters,
            resetTransactionFilters,
            refreshAll,
            refreshSettings,
            createAccount,
            updateAccount,
            changeAccountCurrency,
            deleteAccount,
            reorderAccounts,
            createAccountGroup,
            renameAccountGroup,
            deleteAccountGroup,
            reorderAccountGroups,
            createRecurringRule,
            updateRecurringRule,
            deleteRecurringRule,
            createCategory,
            updateCategory,
            deleteCategory,
            reorderCategories,
            albums,
            activeAlbumId: albums.find((a) => a.isActive)?.id ?? null,
            locatedAlbums,
            createAlbum,
            updateAlbum,
            setAlbumLocation,
            deleteAlbum,
            reorderAlbums,
            setActiveAlbum,
            addTransactionsToAlbum,
            removeTransactionsFromAlbum,
            getAlbumTransactionIds,
            getAlbumTransactions,
            getAlbumStats,
            items: itemsWithStats,
            createItem,
            updateItem,
            deleteItem,
            reorderItems,
            budgetTemplates,
            monthlyBudgets,
            createBudgetTemplate,
            updateBudgetTemplate,
            deleteBudgetTemplate,
            setDefaultBudgetTemplate,
            reorderBudgetTemplates,
            createMonthlyBudget,
            createCustomMonthlyBudget,
            updateMonthlyBudget,
            deleteMonthlyBudget,
            createTransaction,
            updateTransaction,
            deleteTransaction,
            updateTransactionsBulk,
            deleteTransactionsBulk,
            createTransactionWithSplits,
            updateTransactionSplits,
            markSplitPaid,
            markSplitUnpaid,
            updateSettings,
            updateWageConfig,
            updateWageConfigForMonth,
            deleteWageConfigForMonth,
            toggleDisplayMode,
            canUseTimeDisplayMode,
            getAccountById,
            getCategoryById,
            getTransactionCount,
            getTransactionsByAccount,
            queryTransactions,
            getCashflowSummary,
            getExpenseBreakdownByCategory,
            getExpenseBreakdownBySubcategory,
            getIncomeBreakdown,
            getTransfersBetweenAccounts,
            getTrueHourlyRateForDate,
            getDisplayValueForTransaction,
            resetTransactionsOnly,
            resetAllData,
            importMoneyManagerBackup,
            insightsPreferencesJson,
            updateInsightsPreferencesJson,
            calendarPreferencesJson,
            updateCalendarPreferencesJson,
            notificationPrefs,
            updateNotificationPrefs,
            quickEntryPrefs,
            updateQuickEntryPrefs,
            isSimpleMode,
            simpleWalletId,
            completeOnboarding,
            switchToSimpleMode,
            switchToPowerMode,
            deleteSimpleWalletAndTransactions,
          }
        : null,
    [
      isLoading,
      settings,
      currentMonthWage,
      monthlyWages,
      accountGroups,
      recurringRules,
      accounts,
      categories,
      rateTable,
      convertToReporting,
      listExchangeRates,
      refreshExchangeRates,
      setManualExchangeRate,
      resetAndChangeMainCurrency,
      fxCurrencies,
      addFxCurrency,
      removeFxCurrency,
      reorderFxCurrencies,
      setActiveAccountFilter,
      setTransactionFilters,
      resetTransactionFilters,
      refreshAll,
      refreshSettings,
      createAccount,
      updateAccount,
      changeAccountCurrency,
      deleteAccount,
      reorderAccounts,
      createAccountGroup,
      renameAccountGroup,
      deleteAccountGroup,
      reorderAccountGroups,
      createRecurringRule,
      updateRecurringRule,
      deleteRecurringRule,
      createCategory,
      updateCategory,
      deleteCategory,
      reorderCategories,
      albums,
      locatedAlbums,
      createAlbum,
      updateAlbum,
      setAlbumLocation,
      deleteAlbum,
      reorderAlbums,
      setActiveAlbum,
      addTransactionsToAlbum,
      removeTransactionsFromAlbum,
      getAlbumTransactionIds,
      getAlbumTransactions,
      getAlbumStats,
      itemsWithStats,
      createItem,
      updateItem,
      deleteItem,
      reorderItems,
      budgetTemplates,
      monthlyBudgets,
      createBudgetTemplate,
      updateBudgetTemplate,
      deleteBudgetTemplate,
      setDefaultBudgetTemplate,
      reorderBudgetTemplates,
      createMonthlyBudget,
      createCustomMonthlyBudget,
      updateMonthlyBudget,
      deleteMonthlyBudget,
      createTransaction,
      updateTransaction,
      deleteTransaction,
      updateTransactionsBulk,
      deleteTransactionsBulk,
      createTransactionWithSplits,
      updateTransactionSplits,
      markSplitPaid,
      markSplitUnpaid,
      updateSettings,
      updateWageConfig,
      updateWageConfigForMonth,
      deleteWageConfigForMonth,
      toggleDisplayMode,
      canUseTimeDisplayMode,
      getAccountById,
      getCategoryById,
      getTransactionCount,
      getTransactionsByAccount,
      queryTransactions,
      getCashflowSummary,
      getExpenseBreakdownByCategory,
      getExpenseBreakdownBySubcategory,
      getIncomeBreakdown,
      getTransfersBetweenAccounts,
      getTrueHourlyRateForDate,
      getDisplayValueForTransaction,
      resetTransactionsOnly,
      resetAllData,
      importMoneyManagerBackup,
      insightsPreferencesJson,
      updateInsightsPreferencesJson,
      calendarPreferencesJson,
      updateCalendarPreferencesJson,
      notificationPrefs,
      updateNotificationPrefs,
      quickEntryPrefs,
      updateQuickEntryPrefs,
      isSimpleMode,
      simpleWalletId,
      completeOnboarding,
      switchToSimpleMode,
      switchToPowerMode,
      deleteSimpleWalletAndTransactions,
    ],
  );

  // Volatile transaction-derived state lives in its own context so the most
  // frequent mutation (transaction CRUD) only re-renders transaction consumers.
  const transactionsValue = useMemo<TransactionsContextValue>(
    () => ({
      transactions,
      filteredTransactions,
      accountBalances,
      transactionFilters,
      activeAccountFilter,
    }),
    [transactions, filteredTransactions, accountBalances, transactionFilters, activeAccountFilter],
  );

  if (!settings) {
    if (isLoading) {
      return null;
    }

    return (
      <View
        style={fallbackStyles.errorRoot}
        onLayout={() => {
          // The native splash is normally lifted on AppContent's first content
          // layout, but AppContent never mounts while settings is null. Hide it
          // here so this error + Retry is actually visible instead of being
          // trapped behind the splash.
          void SplashScreen.hideAsync();
        }}
      >
        <View style={fallbackStyles.errorCard}>
          <Text style={fallbackStyles.errorTitle}>{I18n.t('errors.data_load_failed_title')}</Text>
          <Text style={fallbackStyles.errorMessage}>
            {loadError ?? I18n.t('errors.data_load_failed')}
          </Text>
          <Pressable onPress={retryLoad} style={fallbackStyles.retryButton}>
            <Text style={fallbackStyles.retryLabel}>{I18n.t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!value) {
    return null;
  }

  return (
    <AppContext.Provider value={value}>
      <TransactionsContext.Provider value={transactionsValue}>
        {children}
      </TransactionsContext.Provider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

/**
 * Subscribe to volatile transaction-derived state (transactions,
 * filteredTransactions, accountBalances, filters). Components that do NOT need
 * this data should use `useApp()` instead so they don't re-render on every
 * transaction mutation.
 */
export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used within AppProvider');
  }
  return context;
}
