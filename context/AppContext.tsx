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
  DEFAULT_CURRENCY_SYMBOL,
  DEFAULT_TRANSACTION_FILTERS,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
  ONBOARDING_POWER_DEFAULT_GROUPS,
  ONBOARDING_POWER_MINIMAL_ACCOUNTS,
} from '~/constants/appDefaults';
import { PRO_LIMITS } from '~/constants/proLimits';
import { getDb, initializeDatabase, SIMPLE_WALLET_NAME } from '~/lib/db/client';
import {
  accountGroupsTable,
  accountsTable,
  categoriesTable,
  monthlyWageSettingsTable,
  recurringRulesTable,
  transactionsTable,
} from '~/lib/db/schema';
import { I18n, setAppLocale } from '~/lib/i18n';
import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { monthlyWageRepository } from '~/lib/repositories/monthlyWageRepository';
import {
  type CreateRecurringRuleInput,
  recurringRulesRepository,
} from '~/lib/repositories/recurringRulesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import {
  type CreateTransactionInput,
  summarizeSplits,
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import { transactionSplitsRepository } from '~/lib/repositories/transactionSplitsRepository';
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
import {
  type Account,
  type AccountBalance,
  type AccountGroup,
  type AppState,
  type BreakdownItem,
  type CashflowSummary,
  type Category,
  type DateRange,
  DEFAULT_QUICK_ENTRY_PREFS,
  type MonthlyWageSettings,
  type NotificationPreferences,
  type QuickEntryPrefs,
  type RecurringTransactionRule,
  type TransactionFilters,
  type TransactionSplit,
  type TransactionWithRelations,
  type UserMode,
  type UserSettings,
  type WageConfig,
} from '~/types';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
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

interface AppContextValue extends AppState {
  filteredTransactions: TransactionWithRelations[];
  monthlyWages: MonthlyWageSettings[];
  accountBalances: AccountBalance[];
  transactionFilters: TransactionFilters;
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
  deleteCategory: (id: string) => void;
  reorderCategories: (ids: string[]) => void;

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
        | 'onboardingCompleted'
        | 'userMode'
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
const EMPTY_ACCOUNT_TRANSACTIONS: TransactionWithRelations[] = [];

function categorySeedKey(type: Category['type'], name: string) {
  return `${type}:${name.trim().toLowerCase()}`;
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

  const refreshAll = useCallback(() => {
    try {
      initializeDatabase();

      const allWages = monthlyWageRepository.list();
      const currentMonthKey = monthKeyFromDateLocal(new Date());
      const effectiveCurrentWage =
        allWages.find((item) => normalizeMonthKey(item.month) === currentMonthKey) ??
        allWages[0] ??
        null;
      const nextSettings = settingsRepository.get();
      // Apply the persisted locale synchronously before the state batch commits so
      // the first paint of the real UI already renders in the stored language —
      // otherwise it briefly shows the device locale and flashes to the correct
      // one once the post-paint locale effect runs.
      setAppLocale(nextSettings.locale);
      const nextInsightsPreferencesJson = settingsRepository.getInsightsPreferencesJson();
      const nextCalendarPreferencesJson = settingsRepository.getCalendarPrefsJson();
      const nextNotificationPrefsJson = settingsRepository.getNotificationPreferencesJson();
      const nextNotificationPrefs: NotificationPreferences = nextNotificationPrefsJson
        ? { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(nextNotificationPrefsJson) }
        : DEFAULT_NOTIFICATION_PREFS;
      const nextQuickEntryPrefsJson = settingsRepository.getQuickEntryPrefsJson();
      const nextQuickEntryPrefs: QuickEntryPrefs = (() => {
        if (!nextQuickEntryPrefsJson) return DEFAULT_QUICK_ENTRY_PREFS;
        const parsed = JSON.parse(nextQuickEntryPrefsJson) as Partial<QuickEntryPrefs> & {
          voiceDefaultAccountId?: string | null;
          voiceUsageDayKey?: string | null;
        };
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

      setCurrentMonthWage(effectiveCurrentWage);
      setMonthlyWages(allWages);
      setSettings(nextSettings);
      setInsightsPreferencesJson(nextInsightsPreferencesJson);
      setCalendarPreferencesJson(nextCalendarPreferencesJson);
      setNotificationPrefs(nextNotificationPrefs);
      setQuickEntryPrefs(nextQuickEntryPrefs);
      setAccountGroups(nextAccountGroups);
      setRecurringRules(nextRecurringRules);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setTransactions(nextTransactions);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, I18n.t('errors.data_load_failed')));
    }
  }, []);

  const refreshTransactions = useCallback(() => {
    try {
      setTransactions(transactionsRepository.list());
    } catch (error) {
      setLoadError(getErrorMessage(error, I18n.t('errors.data_load_failed')));
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
    <T,>(
      operation: () => T,
      fallbackMessage: string = I18n.t('errors.generic_operation_failed'),
    ): T => {
      try {
        const result = operation();
        refreshAll();
        return result;
      } catch (error) {
        throw toError(error, fallbackMessage);
      }
    },
    [refreshAll],
  );

  const createAccount = useCallback(
    (input: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
      const id = runMutation(() => accountsRepository.create(input));
      void trackEvent(AnalyticsEvents.ACCOUNT_CREATED, { type: input.type });
      return id;
    },
    [runMutation],
  );

  const updateAccount = useCallback(
    (id: string, input: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => {
      runMutation(() => {
        accountsRepository.update(id, input);
      });
    },
    [runMutation],
  );

  const deleteAccount = useCallback(
    (id: string) => {
      runMutation(() => {
        accountsRepository.softDelete(id);
      });
      void trackEvent(AnalyticsEvents.ACCOUNT_DELETED);
    },
    [runMutation],
  );

  const reorderAccounts = useCallback(
    (ids: string[]) => {
      runMutation(() => {
        accountsRepository.reorder(ids);
      });
    },
    [runMutation],
  );

  const createAccountGroup = useCallback(
    (name: string) => {
      runMutation(() => {
        accountGroupsRepository.create(name);
      });
    },
    [runMutation],
  );

  const renameAccountGroup = useCallback(
    (id: string, name: string) => {
      runMutation(() => {
        accountGroupsRepository.rename(id, name);
      });
    },
    [runMutation],
  );

  const deleteAccountGroup = useCallback(
    (id: string) => {
      runMutation(() => {
        accountGroupsRepository.softDelete(id);
      });
    },
    [runMutation],
  );

  const reorderAccountGroups = useCallback(
    (ids: string[]) => {
      runMutation(() => {
        accountGroupsRepository.reorder(ids);
      });
    },
    [runMutation],
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
      runMutation(() => {
        categoriesRepository.create(input);
      });
      void trackEvent(AnalyticsEvents.CATEGORY_CREATED, { type: input.type });
    },
    [runMutation],
  );

  const updateCategory = useCallback(
    (
      id: string,
      updates: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
    ) => {
      runMutation(() => {
        categoriesRepository.update(id, updates);
      });
    },
    [runMutation],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      runMutation(() => {
        categoriesRepository.softDelete(id);
      });
      void trackEvent(AnalyticsEvents.CATEGORY_DELETED);
    },
    [runMutation],
  );

  const reorderCategories = useCallback(
    (ids: string[]) => {
      runMutation(() => {
        categoriesRepository.reorder(ids);
      });
    },
    [runMutation],
  );

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

  const createTransaction = useCallback(
    (input: CreateTransactionInput, meta?: CreateTransactionMeta) => {
      const normalizedInput = {
        ...input,
        amount: normalizeMoneyAmount(input.amount),
      };
      const id = newId();
      const now = nowIso();
      const optimistic: TransactionWithRelations = {
        id,
        type: normalizedInput.type,
        amount: normalizedInput.amount,
        currency: normalizedInput.currency,
        date: normalizedInput.date,
        accountId: normalizedInput.accountId ?? null,
        fromAccountId: normalizedInput.fromAccountId ?? null,
        toAccountId: normalizedInput.toAccountId ?? null,
        categoryId: normalizedInput.categoryId ?? null,
        note: normalizedInput.note ?? null,
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
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.createWithId(id, normalizedInput);
          // Voice entries fire a dedicated event so voice adoption can be
          // measured separately from manual transaction creation.
          const createdEvent =
            meta?.source === 'voice'
              ? AnalyticsEvents.VOICE_TRANSACTION_CREATED
              : AnalyticsEvents.TRANSACTION_CREATED;
          void trackEvent(createdEvent, {
            type: normalizedInput.type,
            has_category: !!normalizedInput.categoryId,
            has_note: !!(normalizedInput.note && normalizedInput.note.trim()),
            sentiment: normalizedInput.sentiment ?? 'neutral',
          });
        } catch {
          // rollback on failure
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions, resolveRelationNames],
  );

  const updateTransactionsBulk = useCallback(
    (updates: { id: string; input: Partial<CreateTransactionInput> }[]) => {
      if (updates.length === 0) return;
      const normalizedUpdates: { id: string; input: Partial<CreateTransactionInput> }[] = [];
      const relationById = new Map<string, ReturnType<typeof resolveRelationNames>>();
      const inputById = new Map<string, Partial<CreateTransactionInput>>();
      updates.forEach(({ id, input }) => {
        const normalizedInput =
          input.amount === undefined
            ? input
            : {
                ...input,
                amount: normalizeMoneyAmount(input.amount),
              };
        if (id.trim().length === 0) return;
        if (Object.keys(normalizedInput).length === 0) return;
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
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.updateMany(normalizedUpdates);
          void trackEvent(AnalyticsEvents.TRANSACTION_UPDATED, { count: normalizedUpdates.length });
        } catch {
          // rollback on failure
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions, resolveRelationNames],
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
      transactions.forEach((tx) => {
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
      InteractionManager.runAfterInteractions(() => {
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
    [scheduleRefreshTransactions, transactions],
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
      const normalizedInput = { ...input, amount: normalizeMoneyAmount(input.amount) };
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
        date: normalizedInput.date,
        accountId: null,
        fromAccountId: normalizedInput.accountId ?? null,
        toAccountId: t.toAccountId,
        categoryId: null,
        note: null,
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
        date: normalizedInput.date,
        accountId: normalizedInput.accountId ?? null,
        fromAccountId: normalizedInput.fromAccountId ?? null,
        toAccountId: normalizedInput.toAccountId ?? null,
        categoryId: normalizedInput.categoryId ?? null,
        note: normalizedInput.note ?? null,
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
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.createWithId(txId, normalizedInput);
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
          void trackEvent(AnalyticsEvents.TRANSACTION_CREATED, {
            type: normalizedInput.type,
            has_category: !!normalizedInput.categoryId,
            has_note: !!(normalizedInput.note && normalizedInput.note.trim()),
            sentiment: normalizedInput.sentiment ?? 'neutral',
            split_count: optimisticSplits.filter((s) => !s.isSelf).length,
            split_total: normalizedInput.amount,
          });
        } catch {
          // optimistic rollback handled by refresh
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions, resolveRelationNames],
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
      InteractionManager.runAfterInteractions(() => {
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
          void trackEvent(AnalyticsEvents.TRANSACTION_UPDATED, {
            split_count: optimisticSplits.filter((s) => !s.isSelf).length,
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
              date,
              accountId: null,
              fromAccountId: parent.accountId,
              toAccountId: paybackAccountId,
              categoryId: null,
              note,
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
      InteractionManager.runAfterInteractions(() => {
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
      InteractionManager.runAfterInteractions(() => {
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
          | 'onboardingCompleted'
          | 'userMode'
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
      runMutation(() => {
        settingsRepository.updateSettings(nextUpdates);
      });
      const changedKeys = Object.keys(nextUpdates).filter(
        (key) => key !== 'onboardingCompleted' && key !== 'userMode',
      );
      if (changedKeys.length > 0) {
        void trackEvent(AnalyticsEvents.SETTINGS_UPDATED, {
          changed_fields: changedKeys.join(','),
        });
      }
    },
    [canUseTimeDisplayMode, runMutation],
  );

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
      runMutation(() => {
        monthlyWageRepository.saveForCurrentMonth(config);
      });
    },
    [runMutation],
  );

  const updateWageConfigForMonth = useCallback(
    (month: string, config: WageConfig) => {
      runMutation(() => {
        monthlyWageRepository.saveForMonth(month, config);
      });
      void trackEvent(AnalyticsEvents.WAGE_CONFIG_UPDATED, { wage_type: config.wageType });
    },
    [runMutation],
  );

  const deleteWageConfigForMonth = useCallback(
    (month: string) => {
      runMutation(() => {
        monthlyWageRepository.softDeleteByMonth(month);
      });
    },
    [runMutation],
  );

  const toggleDisplayMode = useCallback(() => {
    const current = settingsRepository.get();
    if (current.displayMode === 'money' && !canUseTimeDisplayMode) {
      return;
    }
    const nextMode = current.displayMode === 'money' ? 'time' : 'money';
    runMutation(() => {
      settingsRepository.updateSettings({ displayMode: nextMode });
    });
    void trackEvent(AnalyticsEvents.DISPLAY_MODE_TOGGLED, { mode: nextMode });
  }, [canUseTimeDisplayMode, runMutation]);

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
        voiceSkipConfirmation:
          updates.voiceSkipConfirmation !== undefined
            ? updates.voiceSkipConfirmation
            : previous.voiceSkipConfirmation,
        voiceUsageCount:
          updates.voiceUsageCount !== undefined
            ? updates.voiceUsageCount
            : previous.voiceUsageCount,
      };
      settingsRepository.updateQuickEntryPrefsJson(JSON.stringify(merged));
      return merged;
    });
  }, []);

  // Initialize notification handler and sync on mount
  useEffect(() => {
    initNotificationHandler();
  }, []);

  useEffect(() => {
    if (settings?.displayMode !== 'time') return;
    if (canUseTimeDisplayMode) return;
    settingsRepository.updateSettings({ displayMode: 'money' });
    refreshAll();
  }, [canUseTimeDisplayMode, refreshAll, settings?.displayMode]);

  const getAccountById = useCallback((id: string) => accountByIdMap.get(id), [accountByIdMap]);
  const getCategoryById = useCallback((id: string) => categoryByIdMap.get(id), [categoryByIdMap]);

  const getTransactionsByAccount = useCallback(
    (accountId: string) => transactionsByAccountId.get(accountId) ?? EMPTY_ACCOUNT_TRANSACTIONS,
    [transactionsByAccountId],
  );

  const queryTransactions = useCallback(
    (filters: Partial<TransactionFilters> = {}) => {
      return transactionsRepository.list(filters);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions],
  );

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
      next.set(transaction.id, amountToHoursByRate(transaction.amount, rate));
    });
    return next;
  }, [getHourlyRateForMonth, isTimeDisplayMode, transactions]);

  const getDisplayValueForTransaction = useCallback(
    (transaction: TransactionWithRelations) => {
      if (!isTimeDisplayMode) return transaction.amount;
      return (
        displayValueByTransactionId?.get(transaction.id) ??
        valueForDisplay(transaction.amount, transaction.date)
      );
    },
    [displayValueByTransactionId, isTimeDisplayMode, valueForDisplay],
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
      const txns = transactionsRepository.list({
        dateRange: range,
        accountId: isSimpleMode && simpleWalletId ? simpleWalletId : null,
      });

      let income = 0;
      let expense = 0;
      txns.forEach((transaction) => {
        const value = valueForDisplay(transaction.amount, transaction.date);
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
      const txns = transactionsRepository.list({
        type,
        dateRange: range,
        accountId: isSimpleMode && simpleWalletId ? simpleWalletId : null,
      });

      const totals = new Map<string, { amount: number; parentLabel?: string; label: string }>();

      txns.forEach((transaction) => {
        if (!transaction.categoryId) return;
        const cat = categoryByIdMap.get(transaction.categoryId);
        if (!cat) return;
        const root = cat.parentId ? categoryByIdMap.get(cat.parentId) : cat;
        const id = groupByRoot ? (root?.id ?? cat.id) : cat.id;
        const current = totals.get(id);
        const inc = valueForDisplay(transaction.amount, transaction.date);
        if (!current) {
          totals.set(id, {
            amount: inc,
            label: groupByRoot ? (root?.name ?? cat.name) : cat.name,
            parentLabel: groupByRoot ? undefined : root?.name,
          });
        } else {
          current.amount += inc;
        }
      });

      return Array.from(totals.entries())
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.amount - a.amount);
    },
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
        const preferredCurrency = currentSettings.currencySymbol ?? DEFAULT_CURRENCY_SYMBOL;
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
        ensureSimpleWalletExists(currentSettings.currencySymbol ?? DEFAULT_CURRENCY_SYMBOL);
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
  const accountBalances = useMemo(() => {
    if (isLoading || !hasSettings) {
      return [];
    }
    if (accounts.length === 0 && transactions.length === 0) {
      return [];
    }
    return accountsRepository.getBalances();
  }, [accounts, hasSettings, isLoading, transactions]);

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
            transactions,
            filteredTransactions,
            activeAccountFilter,
            accountBalances,
            transactionFilters,
            setActiveAccountFilter,
            setTransactionFilters,
            resetTransactionFilters,
            refreshAll,
            refreshSettings,
            createAccount,
            updateAccount,
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
      transactions,
      filteredTransactions,
      activeAccountFilter,
      accountBalances,
      transactionFilters,
      setActiveAccountFilter,
      setTransactionFilters,
      resetTransactionFilters,
      refreshAll,
      refreshSettings,
      createAccount,
      updateAccount,
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

  if (!settings) {
    if (isLoading) {
      return null;
    }

    return (
      <View style={fallbackStyles.errorRoot}>
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

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
