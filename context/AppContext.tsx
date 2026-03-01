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
  importMoneyManagerBackupFromUri,
  type MMImportSummary,
} from '~/services/mmbakImportService';
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
import { amountToHoursByRate, monthKeyFromDateIso, normalizeMonthKey } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';

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
  createAccountGroup: (name: string) => void;
  renameAccountGroup: (id: string, name: string) => void;
  deleteAccountGroup: (id: string) => void;
  createRecurringRule: (input: CreateRecurringRuleInput) => void;
  updateRecurringRule: (id: string, updates: Partial<CreateRecurringRuleInput>) => void;
  deleteRecurringRule: (id: string) => void;

  createCategory: (input: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => void;
  updateCategory: (
    id: string,
    updates: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
  ) => void;
  deleteCategory: (id: string) => void;

  createTransaction: (input: CreateTransactionInput) => void;
  updateTransaction: (id: string, input: Partial<CreateTransactionInput>) => void;
  deleteTransaction: (id: string) => void;

  updateSettings: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'locale'
        | 'currencySymbol'
        | 'hourRounding'
        | 'displayMode'
        | 'themeMode'
        | 'onboardingCompleted'
        | 'userMode'
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

  reorderAccounts: (orderedIds: string[]) => void;
  reorderAccountGroups: (orderedIds: string[]) => void;
  reorderCategories: (orderedIds: string[]) => void;

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
): TransactionWithRelations[] {
  const searchTerm = filters.search.trim().toLowerCase();

  const filtered = transactions.filter((transaction) => {
    const isLegacyBalanceAdjustmentTransfer =
      transaction.type === 'transfer' &&
      !!transaction.accountId &&
      !transaction.fromAccountId &&
      !transaction.toAccountId;
    const matchesType =
      filters.type === 'all'
        ? true
        : filters.type === 'balance_adjustment'
          ? transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer
          : filters.type === 'transfer'
            ? transaction.type === 'transfer' && !isLegacyBalanceAdjustmentTransfer
            : transaction.type === filters.type;
    if (!matchesType) return false;

    if (filters.dateRange) {
      if (transaction.date < filters.dateRange.start) return false;
      if (transaction.date > filters.dateRange.end) return false;
    }

    if (filters.accountId) {
      const matchesAccount =
        transaction.accountId === filters.accountId ||
        transaction.fromAccountId === filters.accountId ||
        transaction.toAccountId === filters.accountId;
      if (!matchesAccount) return false;
    }

    if (transaction.type === 'income' && filters.incomeCategoryId) {
      if (transaction.categoryId !== filters.incomeCategoryId) return false;
    }
    if (transaction.type === 'expense' && filters.expenseCategoryId) {
      if (transaction.categoryId !== filters.expenseCategoryId) return false;
    }
    if (
      !filters.incomeCategoryId &&
      !filters.expenseCategoryId &&
      filters.categoryId &&
      (transaction.type === 'income' || transaction.type === 'expense') &&
      transaction.categoryId !== filters.categoryId
    ) {
      return false;
    }
    if (filters.minAmount !== null && transaction.amount < filters.minAmount) return false;
    if (filters.maxAmount !== null && transaction.amount > filters.maxAmount) return false;

    if (searchTerm.length > 0) {
      const note = (transaction.note ?? '').toLowerCase();
      if (!note.includes(searchTerm)) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  switch (filters.sortBy) {
    case 'date_asc':
      sorted.sort((a, b) => a.date.localeCompare(b.date));
      break;
    case 'amount_desc':
      sorted.sort((a, b) => b.amount - a.amount);
      break;
    case 'amount_asc':
      sorted.sort((a, b) => a.amount - b.amount);
      break;
    case 'date_desc':
    default:
      sorted.sort((a, b) => {
        const dayDelta = b.date.slice(0, 10).localeCompare(a.date.slice(0, 10));
        if (dayDelta !== 0) return dayDelta;
        return b.createdAt.localeCompare(a.createdAt);
      });
      break;
  }

  return sorted;
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    try {
      initializeDatabase();

      const ensuredCurrentWage = monthlyWageRepository.ensureCurrentMonthRecord();
      const allWages = monthlyWageRepository.list();
      const nextSettings = settingsRepository.get();
      const nextInsightsPreferencesJson = settingsRepository.getInsightsPreferencesJson();
      accountGroupsRepository.ensureFromActiveAccounts();
      recurringRulesRepository.runDueTransactions();
      const nextAccountGroups = accountGroupsRepository.list();
      const nextRecurringRules = recurringRulesRepository.list();
      const nextAccounts = accountsRepository.list();
      const nextCategories = categoriesRepository.list();
      const nextTransactions = transactionsRepository.list();

      setCurrentMonthWage(ensuredCurrentWage);
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

  const reorderAccounts = useCallback((orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    setAccounts((prev) =>
      [...prev].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)),
    );
  }, []);

  const reorderAccountGroups = useCallback((orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    setAccountGroups((prev) =>
      [...prev].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)),
    );
  }, []);

  const reorderCategories = useCallback((orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    setCategories((prev) =>
      [...prev].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)),
    );
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

  const filteredTransactions = useMemo(
    () => applyTransactionFilters(transactions, effectiveFilters),
    [effectiveFilters, transactions],
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
      return runMutation(() => accountsRepository.create(input));
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

  const createRecurringRule = useCallback(
    (input: CreateRecurringRuleInput) => {
      runMutation(() => {
        recurringRulesRepository.create(input);
      });
    },
    [runMutation],
  );

  const updateRecurringRule = useCallback(
    (id: string, updates: Partial<CreateRecurringRuleInput>) => {
      runMutation(() => {
        recurringRulesRepository.update(id, updates);
      });
    },
    [runMutation],
  );

  const deleteRecurringRule = useCallback(
    (id: string) => {
      runMutation(() => {
        recurringRulesRepository.softDelete(id);
      });
    },
    [runMutation],
  );

  const createCategory = useCallback(
    (input: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
      runMutation(() => {
        categoriesRepository.create(input);
      });
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
    },
    [runMutation],
  );

  const resolveRelationNames = useCallback(
    (input: Partial<CreateTransactionInput>) => {
      const findAccount = (id?: string | null) =>
        id ? (accounts.find((a) => a.id === id)?.name ?? null) : null;
      const findCategory = (id?: string | null) => {
        if (!id) return { name: null, icon: null, parentName: null };
        const cat = categories.find((c) => c.id === id);
        if (!cat) return { name: null, icon: null, parentName: null };
        const parent = cat.parentId ? categories.find((c) => c.id === cat.parentId) : null;
        return {
          name: cat.name,
          icon: resolveCategoryIcon(cat.icon, parent?.icon ?? null),
          parentName: parent?.name ?? null,
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
    [accounts, categories],
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

  const updateTransaction = useCallback(
    (id: string, input: Partial<CreateTransactionInput>) => {
      const relations = resolveRelationNames(input);
      setTransactions((prev) =>
        prev.map((tx) => {
          if (tx.id !== id) return tx;
          const updated = { ...tx, ...input, updatedAt: nowIso() };
          if ('accountId' in input) updated.accountName = relations.accountName;
          if ('fromAccountId' in input) updated.fromAccountName = relations.fromAccountName;
          if ('toAccountId' in input) updated.toAccountName = relations.toAccountName;
          if ('categoryId' in input) {
            updated.categoryName = relations.categoryName;
            updated.categoryIcon = relations.categoryIcon;
            updated.categoryParentName = relations.categoryParentName;
          }
          return updated;
        }),
      );
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.update(id, input);
        } catch {
          // rollback on failure
        }
        refreshTransactions();
      });
    },
    [refreshTransactions, resolveRelationNames],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
      InteractionManager.runAfterInteractions(() => {
        try {
          transactionsRepository.softDelete(id);
        } catch {
          // rollback on failure
        }
        refreshTransactions();
      });
    },
    [refreshTransactions],
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
          | 'currencySymbol'
          | 'hourRounding'
          | 'displayMode'
          | 'themeMode'
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
    },
    [canUseTimeDisplayMode, runMutation],
  );

  useEffect(() => {
    if (!settings?.locale) return;
    setAppLocale(settings.locale);
  }, [settings?.locale]);

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
    runMutation(() => {
      settingsRepository.updateSettings({
        displayMode: current.displayMode === 'money' ? 'time' : 'money',
      });
    });
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

  const getAccountById = useCallback((id: string) => accounts.find((a) => a.id === id), [accounts]);
  const getCategoryById = useCallback(
    (id: string) => categories.find((c) => c.id === id),
    [categories],
  );

  const getTransactionsByAccount = useCallback(
    (accountId: string) => {
      const filtered = transactions.filter(
        (transaction) =>
          transaction.accountId === accountId ||
          transaction.fromAccountId === accountId ||
          transaction.toAccountId === accountId,
      );
      return [...filtered].sort((a, b) => {
        const dayDelta = b.date.slice(0, 10).localeCompare(a.date.slice(0, 10));
        if (dayDelta !== 0) return dayDelta;
        return b.createdAt.localeCompare(a.createdAt);
      });
    },
    [transactions],
  );

  const queryTransactions = useCallback((filters: Partial<TransactionFilters> = {}) => {
    return transactionsRepository.list(filters);
  }, []);

  const orderedRateHistory = useMemo(
    () => buildNormalizedRateHistory(monthlyWages),
    [monthlyWages],
  );

  const getTrueHourlyRateForDate = useCallback(
    (dateIso: string) => {
      if (orderedRateHistory.length === 0) {
        return currentMonthWage?.trueHourlyRate ?? 0;
      }

      const targetMonth = normalizeMonthKey(monthKeyFromDateIso(dateIso));
      let selectedRate = orderedRateHistory[0]?.rate ?? 0;

      for (let index = 0; index < orderedRateHistory.length; index += 1) {
        const entry = orderedRateHistory[index];
        if (!entry) continue;
        if (entry.month > targetMonth) break;
        selectedRate = entry.rate;
      }

      return selectedRate;
    },
    [currentMonthWage?.trueHourlyRate, orderedRateHistory],
  );

  const isTimeDisplayMode = settings?.displayMode === 'time';
  const hourRounding = settings?.hourRounding ?? 0.25;
  const valueForDisplay = useCallback(
    (amount: number, dateIso: string) => {
      if (!isTimeDisplayMode) {
        return amount;
      }
      const rate = getTrueHourlyRateForDate(dateIso);
      return amountToHoursByRate(amount, rate, hourRounding);
    },
    [getTrueHourlyRateForDate, hourRounding, isTimeDisplayMode],
  );

  const displayValueByTransactionId = useMemo(() => {
    if (!isTimeDisplayMode) return null;
    const next = new Map<string, number>();
    transactions.forEach((transaction) => {
      next.set(transaction.id, valueForDisplay(transaction.amount, transaction.date));
    });
    return next;
  }, [isTimeDisplayMode, transactions, valueForDisplay]);

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

  const simpleWalletId = useMemo(
    () => accounts.find((a) => a.name === SIMPLE_WALLET_NAME && !a.deletedAt)?.id ?? null,
    [accounts],
  );

  const getCashflowSummary = useCallback(
    (range: DateRange): CashflowSummary => {
      const txns = transactionsRepository.list({
        dateRange: range,
        accountId: isSimpleMode && simpleWalletId ? simpleWalletId : null,
      });

      const income = txns
        .filter((transaction) => transaction.type === 'income')
        .reduce(
          (sum, transaction) => sum + valueForDisplay(transaction.amount, transaction.date),
          0,
        );
      const expense = txns
        .filter((transaction) => transaction.type === 'expense')
        .reduce(
          (sum, transaction) => sum + valueForDisplay(transaction.amount, transaction.date),
          0,
        );

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

      const categoryMap = new Map(categories.map((category) => [category.id, category]));
      const totals = new Map<string, { amount: number; parentLabel?: string; label: string }>();

      txns.forEach((transaction) => {
        if (!transaction.categoryId) return;
        const cat = categoryMap.get(transaction.categoryId);
        if (!cat) return;
        const root = cat.parentId ? categoryMap.get(cat.parentId) : cat;
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
          totals.set(id, { ...current, amount: current.amount + inc });
        }
      });

      return Array.from(totals.entries())
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.amount - a.amount);
    },
    [categories, valueForDisplay, isSimpleMode, simpleWalletId],
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
  }, [runMutation]);

  const resetTransactionsOnly = useCallback(() => {
    runMutation(() => {
      purgeTransactionsOnly();
      resetTransactionFilters();
    });
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
    },
    [runMutation],
  );

  const switchToPowerMode = useCallback(() => {
    runMutation(() => {
      settingsRepository.updateSettings({ userMode: 'power' });
    });
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
            createAccountGroup,
            renameAccountGroup,
            deleteAccountGroup,
            reorderAccounts,
            reorderAccountGroups,
            reorderCategories,
            createRecurringRule,
            updateRecurringRule,
            deleteRecurringRule,
            createCategory,
            updateCategory,
            deleteCategory,
            createTransaction,
            updateTransaction,
            deleteTransaction,
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
      createAccountGroup,
      renameAccountGroup,
      deleteAccountGroup,
      reorderAccounts,
      reorderAccountGroups,
      reorderCategories,
      createRecurringRule,
      updateRecurringRule,
      deleteRecurringRule,
      createCategory,
      updateCategory,
      deleteCategory,
      createTransaction,
      updateTransaction,
      deleteTransaction,
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
