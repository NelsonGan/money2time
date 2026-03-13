import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_TRANSACTION_FILTERS,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
} from '~/constants/appDefaults';
import { getDb, initializeDatabase, SIMPLE_WALLET_NAME } from '~/lib/db/client';
import {
  accountGroupsTable,
  accountsTable,
  categoriesTable,
  monthlyWageSettingsTable,
  recurringRulesTable,
  settingsTable,
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
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import {
  AnalyticsEvents,
  identifyUser,
  resetAnalytics,
  setSuperProperties,
  setUserProperties,
  trackEvent,
} from '~/services/analytics';
import {
  importMoneyManagerBackupFromUri,
  type MMImportSummary,
} from '~/services/mmbakImportService';
import {
  fetchRevenueCatPaywallState,
  getInitialRevenueCatPaywallState,
  purchaseRevenueCatTip as purchaseRevenueCatTipRequest,
  restoreRevenueCatPurchases as restoreRevenueCatPurchasesRequest,
  type RevenueCatActionResult,
  type RevenueCatPaywallState,
  type RevenueCatTipOption,
  setRevenueCatAppUserId,
} from '~/services/revenueCat';
import {
  type Account,
  type AccountBalance,
  type AccountGroup,
  type AppState,
  type BreakdownItem,
  type CashflowSummary,
  type Category,
  type DateRange,
  type MonthlyWageSettings,
  type RecurringTransactionRule,
  type TransactionFilters,
  type TransactionWithRelations,
  type UserSettings,
  type WageConfig,
} from '~/types';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { getErrorMessage, toError } from '~/utils/errorHandling';
import {
  amountToHoursByRate,
  monthKeyFromDateIso,
  monthKeyFromDateLocal,
  normalizeMonthKey,
} from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { sortTransactions } from '~/utils/transactionSorting';

interface AppContextValue extends AppState {
  filteredTransactions: TransactionWithRelations[];
  monthlyWages: MonthlyWageSettings[];
  accountBalances: AccountBalance[];
  transactionFilters: TransactionFilters;
  setActiveAccountFilter: (accountId: string | null) => void;
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  resetTransactionFilters: () => void;
  refreshAll: () => void;

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

  createTransaction: (input: CreateTransactionInput) => void;
  updateTransaction: (id: string, input: Partial<CreateTransactionInput>) => void;
  deleteTransaction: (id: string) => void;
  updateTransactionsBulk: (
    updates: { id: string; input: Partial<CreateTransactionInput> }[],
  ) => void;
  deleteTransactionsBulk: (ids: string[]) => void;

  updateSettings: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'locale'
        | 'currencyCode'
        | 'currencySymbol'
        | 'hourRounding'
        | 'displayMode'
        | 'themeMode'
        | 'themeColor'
        | 'onboardingCompleted'
        | 'userMode'
      >
    >,
  ) => void;
  adRemovalState: RevenueCatPaywallState;
  refreshAdRemovalState: () => Promise<void>;
  purchaseAdRemovalTip: (option: RevenueCatTipOption) => Promise<RevenueCatActionResult>;
  restoreAdRemovalPurchases: () => Promise<RevenueCatActionResult>;
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

  isSimpleMode: boolean;
  simpleWalletId: string | null;
  switchToSimpleMode: (seedDefaults?: boolean) => void;
  switchToPowerMode: () => void;
  deleteSimpleWalletAndTransactions: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const EMPTY_ACCOUNT_TRANSACTIONS: TransactionWithRelations[] = [];

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
  db.delete(settingsTable).run();
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
  const hasDateRange = filters.dateRange !== null;
  const hasAccountFilter = filters.accountId !== null;
  const hasIncomeCategoryFilter = filters.incomeCategoryId !== null;
  const hasExpenseCategoryFilter = filters.expenseCategoryId !== null;
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
    hasIncomeCategoryFilter ||
    hasExpenseCategoryFilter ||
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
  const noteCache = noteSearchTextById;

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

    if (transaction.type === 'income' && hasIncomeCategoryFilter) {
      if (transaction.categoryId !== filters.incomeCategoryId) continue;
    }
    if (transaction.type === 'expense' && hasExpenseCategoryFilter) {
      if (transaction.categoryId !== filters.expenseCategoryId) continue;
    }
    if (
      !hasIncomeCategoryFilter &&
      !hasExpenseCategoryFilter &&
      hasCategoryFilter &&
      (transaction.type === 'income' || transaction.type === 'expense') &&
      transaction.categoryId !== filters.categoryId
    ) {
      continue;
    }
    if (hasMinAmount && minAmount !== null && transaction.amount < minAmount) continue;
    if (hasMaxAmount && maxAmount !== null && transaction.amount > maxAmount) continue;

    if (hasSearchFilter) {
      const note = noteCache?.get(transaction.id) ?? (transaction.note ?? '').toLowerCase();
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
  const [adRemovalState, setAdRemovalState] = useState<RevenueCatPaywallState>(
    getInitialRevenueCatPaywallState,
  );
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
      const nextInsightsPreferencesJson = settingsRepository.getInsightsPreferencesJson();
      accountGroupsRepository.ensureFromActiveAccounts();
      recurringRulesRepository.runDueTransactions();
      const nextAccountGroups = accountGroupsRepository.list();
      const nextRecurringRules = recurringRulesRepository.list();
      const nextAccounts = accountsRepository.list();
      const nextCategories = categoriesRepository.list();
      const nextTransactions = transactionsRepository.list();

      setCurrentMonthWage(effectiveCurrentWage);
      setMonthlyWages(allWages);
      setSettings(nextSettings);
      setInsightsPreferencesJson(nextInsightsPreferencesJson);
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

  const refreshAdRemovalState = useCallback(async () => {
    const initialState = getInitialRevenueCatPaywallState();

    setAdRemovalState((previous) => ({
      ...previous,
      canMakePurchases: initialState.canMakePurchases,
      catalogStatus: initialState.catalogStatus,
      entitlementIdentifier: initialState.entitlementIdentifier,
      isConfigured: initialState.isConfigured,
      isLoading: initialState.isLoading,
      isTestStore: initialState.isTestStore,
      offeringIdentifier: initialState.offeringIdentifier,
      reason: initialState.reason,
    }));

    try {
      const nextState = await fetchRevenueCatPaywallState();
      setAdRemovalState(nextState);
    } catch {
      setAdRemovalState((previous) => ({ ...previous, isLoading: false }));
    }
  }, []);

  const purchaseAdRemovalTip = useCallback(
    async (option: RevenueCatTipOption) => {
      void trackEvent(AnalyticsEvents.PURCHASE_INITIATED, {
        product_id: option.productIdentifier,
        price: option.amount,
      });
      const result = await purchaseRevenueCatTipRequest(option.productIdentifier);

      if (result.customerState) {
        setAdRemovalState((previous) => ({
          ...previous,
          ...result.customerState,
          isLoading: false,
        }));
      }

      if (result.status === 'success') {
        void trackEvent(AnalyticsEvents.PURCHASE_COMPLETED, {
          product_id: option.productIdentifier,
          price: option.amount,
        });
        void setUserProperties({ has_ad_free: true });
      } else if (result.status === 'cancelled') {
        void trackEvent(AnalyticsEvents.PURCHASE_CANCELLED, {
          product_id: option.productIdentifier,
        });
      } else if (result.status === 'error') {
        void trackEvent(AnalyticsEvents.PURCHASE_FAILED, {
          product_id: option.productIdentifier,
        });
      }

      if (result.status === 'success' || result.status === 'not_found') {
        void refreshAdRemovalState();
      }

      return result;
    },
    [refreshAdRemovalState],
  );

  const restoreAdRemovalPurchases = useCallback(async () => {
    const result = await restoreRevenueCatPurchasesRequest();

    if (result.customerState) {
      setAdRemovalState((previous) => ({
        ...previous,
        ...result.customerState,
        isLoading: false,
      }));
    }

    if (result.status === 'success') {
      void trackEvent(AnalyticsEvents.PURCHASE_RESTORED, {
        has_entitlement: result.customerState?.hasAdFreeEntitlement ?? false,
      });
      void refreshAdRemovalState();
    }

    return result;
  }, [refreshAdRemovalState]);

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
    (input: CreateTransactionInput) => {
      const id = newId();
      const now = nowIso();
      const optimistic: TransactionWithRelations = {
        id,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        date: input.date,
        accountId: input.accountId ?? null,
        fromAccountId: input.fromAccountId ?? null,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames(input),
      };
      setTransactions((prev) => [optimistic, ...prev]);
      void trackEvent(AnalyticsEvents.TRANSACTION_CREATED, {
        type: input.type,
        has_category: !!input.categoryId,
        has_note: !!(input.note && input.note.trim()),
      });
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.createWithId(id, input);
        } catch {
          // rollback on failure
        }
        refreshTransactions();
      });
    },
    [refreshTransactions, resolveRelationNames],
  );

  const updateTransactionsBulk = useCallback(
    (updates: { id: string; input: Partial<CreateTransactionInput> }[]) => {
      if (updates.length === 0) return;
      const normalizedUpdates: { id: string; input: Partial<CreateTransactionInput> }[] = [];
      const relationById = new Map<string, ReturnType<typeof resolveRelationNames>>();
      const inputById = new Map<string, Partial<CreateTransactionInput>>();
      updates.forEach(({ id, input }) => {
        if (id.trim().length === 0) return;
        if (Object.keys(input).length === 0) return;
        normalizedUpdates.push({ id, input });
        const hasRelationChange =
          'accountId' in input ||
          'fromAccountId' in input ||
          'toAccountId' in input ||
          'categoryId' in input;
        if (hasRelationChange) {
          relationById.set(id, resolveRelationNames(input));
        }
        inputById.set(id, input);
      });
      if (normalizedUpdates.length === 0) return;

      void trackEvent(AnalyticsEvents.TRANSACTION_UPDATED, { count: normalizedUpdates.length });

      const nextUpdatedAt = nowIso();
      setTransactions((prev) =>
        prev.map((tx) => {
          const input = inputById.get(tx.id);
          if (!input) return tx;
          const relations = relationById.get(tx.id);
          const updated = { ...tx, ...input, updatedAt: nextUpdatedAt };
          if ('accountId' in input && relations) updated.accountName = relations.accountName;
          if ('fromAccountId' in input && relations) {
            updated.fromAccountName = relations.fromAccountName;
          }
          if ('toAccountId' in input && relations) updated.toAccountName = relations.toAccountName;
          if ('categoryId' in input && relations) {
            updated.categoryName = relations.categoryName;
            updated.categoryIcon = relations.categoryIcon;
            updated.categoryParentName = relations.categoryParentName;
          }
          return updated;
        }),
      );
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.updateMany(normalizedUpdates);
        } catch {
          // rollback on failure
        }
        refreshTransactions();
      });
    },
    [refreshTransactions, resolveRelationNames],
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

      void trackEvent(
        uniqueIds.length === 1
          ? AnalyticsEvents.TRANSACTION_DELETED
          : AnalyticsEvents.TRANSACTIONS_BULK_DELETED,
        { count: uniqueIds.length },
      );

      const idSet = new Set(uniqueIds);
      setTransactions((prev) => prev.filter((tx) => !idSet.has(tx.id)));
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.softDeleteMany(uniqueIds);
        } catch {
          // rollback on failure
        }
        refreshTransactions();
      });
    },
    [refreshTransactions],
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
          | 'hourRounding'
          | 'displayMode'
          | 'themeMode'
          | 'themeColor'
          | 'onboardingCompleted'
          | 'userMode'
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
    setRevenueCatAppUserId(settings?.appUserId ?? null);
  }, [settings?.appUserId]);

  useEffect(() => {
    if (!settings?.appUserId) return;
    void identifyUser(settings.appUserId);
  }, [settings?.appUserId]);

  useEffect(() => {
    if (!settings) return;
    void setSuperProperties({
      user_mode: settings.userMode ?? 'power',
      currency_code: settings.currencyCode,
      locale: settings.locale,
      theme_mode: settings.themeMode,
      theme_color: settings.themeColor,
      display_mode: settings.displayMode,
    });
  }, [
    settings?.userMode,
    settings?.currencyCode,
    settings?.locale,
    settings?.themeMode,
    settings?.themeColor,
    settings?.displayMode,
  ]);

  useEffect(() => {
    if (!settings?.appUserId) return;
    void refreshAdRemovalState();
  }, [refreshAdRemovalState, settings?.appUserId]);

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
  const hourRounding = settings?.hourRounding ?? 0.25;
  const valueForDisplay = useCallback(
    (amount: number, dateIso: string) => {
      if (!isTimeDisplayMode) {
        return amount;
      }
      const targetMonth = normalizeMonthKey(monthKeyFromDateIso(dateIso));
      const rate = getHourlyRateForMonth(targetMonth);
      return amountToHoursByRate(amount, rate, hourRounding);
    },
    [getHourlyRateForMonth, hourRounding, isTimeDisplayMode],
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
      next.set(transaction.id, amountToHoursByRate(transaction.amount, rate, hourRounding));
    });
    return next;
  }, [getHourlyRateForMonth, hourRounding, isTimeDisplayMode, transactions]);

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
    void trackEvent(AnalyticsEvents.DATA_RESET, { scope: 'all' });
    void resetAnalytics();
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

  const switchToSimpleMode = useCallback(
    (seedDefaults = false) => {
      runMutation(() => {
        // Create Simple Wallet if missing
        let walletId =
          accountsRepository.list().find((a) => a.name === SIMPLE_WALLET_NAME)?.id ?? null;
        if (!walletId) {
          const currentSettings = settingsRepository.get();
          accountsRepository.create({
            name: SIMPLE_WALLET_NAME,
            type: 'debit',
            icon: '👛',
            color: '#22917A',
            startingBalance: 0,
            accountGroup: null,
            creditStatementDay: null,
            creditDueDay: null,
            currency: currentSettings.currencySymbol,
            includeInTotals: true,
            sortOrder: 0,
          });
        }
        if (seedDefaults) {
          const existingCategories = categoriesRepository.list();
          const existing = new Set(
            existingCategories.map((item) => `${item.type}:${item.name.trim().toLowerCase()}`),
          );
          const minimal = [
            ...ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
            ...ONBOARDING_MINIMAL_INCOME_CATEGORIES,
          ];
          minimal.forEach((item) => {
            const key = `${item.type}:${item.name.trim().toLowerCase()}`;
            if (existing.has(key)) return;
            categoriesRepository.create(item);
            existing.add(key);
          });
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
            updateSettings,
            adRemovalState,
            refreshAdRemovalState,
            purchaseAdRemovalTip,
            restoreAdRemovalPurchases,
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
            isSimpleMode,
            simpleWalletId,
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
      updateSettings,
      adRemovalState,
      refreshAdRemovalState,
      purchaseAdRemovalTip,
      restoreAdRemovalPurchases,
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
      isSimpleMode,
      simpleWalletId,
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
