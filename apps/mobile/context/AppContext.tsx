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
  Alert,
  AppState as RNAppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DEFAULT_CURRENCY,
  DEFAULT_TRANSACTION_FILTERS,
  ONBOARDING_DEFAULT_GROUPS,
  ONBOARDING_MINIMAL_ACCOUNTS,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
} from '~/constants/appDefaults';
import { PRO_LIMITS } from '~/constants/proLimits';
import { billFromRows, type GroupBillRow } from '~/features/albums/lib/albumGroup';
import {
  cleanPersonName,
  memberByName,
  type PeopleEditError,
  personNameKey,
  selfMember,
} from '~/features/albums/lib/albumPeople';
import { notifyAlbumGroups } from '~/features/albums/services/albumGroupStore';
import {
  type GroupEnv,
  projectGroup,
  publishAlbumBills,
} from '~/features/albums/services/albumGroupSync';
import { parsePaymentAlertPrefs, serializePaymentAlertPrefs } from '~/features/autoLog/lib/prefs';
import { persistAutoLogTransaction } from '~/features/autoLog/persistTransaction';
import { budgetRateToFreeze, storedBudgetCurrency } from '~/features/budget/lib/budgetCurrency';
import { computeBackPopulateRange, pickAutoCreateTemplate } from '~/features/budget/lib/budgetMath';
import {
  BUDGET_PERIODS,
  type BudgetPeriodClock,
  budgetPeriodKeyForDate,
  budgetWeekOverlaps,
  isBudgetPeriodKey,
} from '~/features/budget/lib/budgetPeriods';
import { deletePersonalLedgerRows } from '~/features/cloudSync/services/ledgerChannels';
import {
  listAlbumShares,
  openLedgerSharedAndActive,
  sharedAlbumFor,
} from '~/features/cloudSync/services/sharedLedgerStore';
import {
  buildInstalmentPlans,
  frequencyOfSchedule,
  instalmentPaymentCandidates,
  instalmentPaymentsKey,
  type InstalmentProgress,
  isInstalmentPlan,
} from '~/features/instalments/lib/instalmentPlan';
import { computeItemStats } from '~/features/items/utils';
import {
  buildRefundNote,
  countsTowardSpending,
  NO_REIMBURSEMENT,
} from '~/features/reimbursements/lib/reimbursementMath';
import { withEntryStamp } from '~/features/sharedLedgers/lib/entryStamp';
import { invalidateLedgerPeople } from '~/features/sharedLedgers/lib/ledgerPeople';
import { countAccountsTowardFreeLimit } from '~/features/transactions/lib/accountEntryGate';
import {
  findFallbackCategory,
  pickDefaultAccountId,
  pickPaybackAccountId,
} from '~/features/transactions/lib/entryDefaults';
import {
  type AccountCurrencyLookup,
  buildPaybackRows,
  indexPaybacks,
  type PaybackLink,
  reusePaybackRows,
  samePaybackIndex,
} from '~/features/transactions/lib/paybackGroups';
import {
  buildPaybackTransferNote,
  countUnpaidSplitBills,
  personSettlementRows,
} from '~/features/transactions/lib/settleUp';
import {
  rescaleSplitAdjustedAmounts,
  type SplitSnapshotRates,
} from '~/features/transactions/lib/splitAmountSnapshot';
import { billPayer, isPayBackPart, owedToPayer } from '~/features/transactions/lib/splitPayer';
import {
  applyShareHandover,
  applyUnpaidMerge,
  consolidateOwedRows,
  cutPartPayment,
  frozenAccountRate,
  type PaybackTransferAmounts,
  paybackTransferAmounts,
  planShareHandover,
  planSplitPayment,
  planUnpaidMerge,
  splitShareKey,
} from '~/features/transactions/lib/splitPayments';
import {
  buildTransferFeeIndex,
  canChargeTransferFee,
  EMPTY_TRANSFER_FEE_INDEX,
  indexTransferFees,
  isTransferFee,
  planTransferFeeWrite,
  sameTransferFeeIndex,
  transferFeeAccountAmount,
  transferFeeCreatedAt,
  transferFeeDayOrder,
  type TransferFeeDraft,
  type TransferFeeIndex,
  transferFeeSideOf,
  type TransferForFee,
} from '~/features/transactions/lib/transferFee';
import { normalizeLiveEarningsSchedule } from '~/features/widgets/lib/liveEarningsSchedule';
import { getDb, getSQLite, initializeDatabase } from '~/lib/db/client';
import {
  copyLedgerRows,
  LEDGER_COPY_PARTS,
  type LedgerCopyPart,
  ledgerPartsCopySpecs,
  withCopyNeeds,
} from '~/lib/db/ledgerCopy';
import {
  DEFAULT_LEDGER_ID,
  getActiveLedgerId,
  inActiveLedger,
  setActiveLedgerId,
  withLedgerScope,
} from '~/lib/db/ledgerScope';
import { normalizeCurrencyColumns } from '~/lib/db/normalizeCurrencies';
import { normalizeIconColumns } from '~/lib/db/normalizeIcons';
import {
  accountGroupsTable,
  accountsTable,
  albumsTable,
  autoLogCapturesTable,
  budgetTemplatesTable,
  categoriesTable,
  itemsTable,
  monthlyBudgetsTable,
  monthlyWageSettingsTable,
  recurringRulesTable,
  transactionsTable,
} from '~/lib/db/schema';
import { I18n, setAppLocale } from '~/lib/i18n';
import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { albumGroupsRepository } from '~/lib/repositories/albumGroupsRepository';
import { albumsRepository } from '~/lib/repositories/albumsRepository';
import {
  type BudgetAllocationInput,
  budgetTemplatesRepository,
} from '~/lib/repositories/budgetTemplatesRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { itemsRepository } from '~/lib/repositories/itemsRepository';
import { type LedgerInput, ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { monthlyWageRepository } from '~/lib/repositories/monthlyWageRepository';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { periodBudgetsRepository } from '~/lib/repositories/periodBudgetsRepository';
import {
  type ReceiptSplitDraftInput,
  receiptSplitsRepository,
} from '~/lib/repositories/receiptSplitsRepository';
import {
  type ConvertToInstalmentPlanInput,
  type CreatedInstalmentPlan,
  type CreateInstalmentPlanInput,
  type CreateRecurringRuleInput,
  recurringRulesRepository,
} from '~/lib/repositories/recurringRulesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { transactionSplitsRepository } from '~/lib/repositories/transactionSplitsRepository';
import {
  assertInOpenLedger,
  type CreateTransactionInput,
  EntryLedgerGoneError,
  summarizeSplits,
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import {
  AnalyticsEvents,
  flushAnalytics,
  identifyUser,
  recordLoggedTransaction,
  setInstallDate,
  setSuperProperties,
  trackEvent,
} from '~/services/analytics';
import { supportsAppIconSwitching, syncAppIcon } from '~/services/appIcon';
import {
  registerBackgroundTask,
  runAutoBackupIfDue,
  unregisterBackgroundTask,
} from '~/services/autoBackup';
import { reportError } from '~/services/errorReporting';
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
  normalizeNotificationPrefs,
  syncScheduledNotifications,
} from '~/services/notifications';
import { resetAutomationCaptureData } from '~/services/resetAutomationCaptureData';
import { initReviewPrompt, recordTransactionLogged } from '~/services/reviewPrompt';
import { runUserAssetGc, runUserAssetGcBackfillOnce } from '~/services/userAssetGc';
import { deleteAlbumCover, deleteGoalCover, isCustomLogoId } from '~/services/userAssets';
import {
  type Account,
  type AccountBalance,
  type AccountGroup,
  ADD_BUTTON_ACTIONS,
  type Album,
  type AlbumLocation,
  type AlbumPerson,
  type AlbumStats,
  type AppState,
  type BudgetPeriod,
  type BudgetTemplate,
  type Category,
  DEFAULT_QUICK_ENTRY_PREFS,
  type ExchangeRate,
  isLocatedAlbum,
  type Item,
  type ItemWithStats,
  type Ledger,
  type LocatedAlbum,
  type MonthCycleInput,
  type MonthlyWageSettings,
  type NotificationPreferences,
  type PaymentAlertChannel,
  type PaymentAlertPrefs,
  type PeriodBudget,
  type QuickEntryPrefs,
  type RateRefreshResult,
  type RateTable,
  type ReceiptSplit,
  type RecurringTransactionRule,
  type TransactionFilters,
  type TransactionSplit,
  type TransactionWithRelations,
  type UserSettings,
  type WageConfig,
  type WeekStartsOn,
} from '~/types';
import { isAccountArchived } from '~/utils/accountArchive';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import {
  buildRateTable,
  convert,
  currencySymbolForCode,
  emptyRateTable,
  isAutoRateSupported,
  resolveRate,
  storedWageConfig,
  wageInCurrency,
  wageRate,
} from '~/utils/currency';
import { getErrorMessage, toError } from '~/utils/errorHandling';
import {
  financialMonthKeyForDate,
  financialMonthKeyForIso,
  monthCycleDefaultDay,
  monthCycleOf,
} from '~/utils/financialMonth';
import { createFirstTransactionSignal } from '~/utils/firstTransactionSignal';
import { FONT } from '~/utils/fonts';
import {
  amountToHoursByRate,
  dateForNewTransaction,
  dateKeepingTimeOfDay,
  dayKeyFromDateLocal,
  formatHours,
  normalizeMoneyAmount,
  normalizeMonthKey,
} from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { runAfterInteractions, runAfterInteractionsCapped } from '~/utils/interactions';
import { syncLocalDaysWithTimeZone } from '~/utils/localDate';
import { perfMark } from '~/utils/perfTrace';
import { recurrenceFrequencyOf } from '~/utils/recurringRules';
import { countsAsExpenseRow } from '~/utils/spending';
import {
  reconcileTransactionRow,
  reconcileTransactionRows,
  reuseUnchangedTransactions,
  transactionSearchText,
} from '~/utils/transactions';
import { insertTransactionsByDateDesc, sortTransactions } from '~/utils/transactionSorting';

/** A row of the split editor, as `saveAlbumBill` takes it: a person and their share of the whole bill. */
export interface AlbumBillRowInput {
  personName: string | null;
  amount: number;
  isSelf: boolean;
  isPayer?: boolean;
  albumMemberId?: string | null;
}

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
  /** A part payment: the share's first row it was paid out of. */
  partOfSplitId?: string | null;
  /** This friend paid the bill, so the user owes them (see splitPayer.ts). */
  isPayer?: boolean;
  /** A friend's share of a bill another friend paid; `amount` is then 0. */
  shareAmount?: number | null;
  /** The Cloud Sync account this person is, once people can be real users. */
  memberId?: string | null;
  /** The member of a shared album's group this share is with. */
  albumMemberId?: string | null;
  /** The group settlement a paid row came from or was sent as. */
  settlementId?: string | null;
}

/** How a transaction was entered. Drives which analytics event fires on
 *  create — voice entries are tracked separately from manual adds, and a
 *  statement import's rows are not entries the user logged one by one. */
export type TransactionSource =
  | 'manual'
  | 'voice'
  | 'receipt'
  | 'autolog'
  | 'notification_review'
  | 'statement_import'
  /** Added in a linked browser's Web Dashboard while this phone was connected. */
  | 'web_dashboard';

export interface CreateTransactionMeta {
  source?: TransactionSource;
  /** For `autolog`: how the payment reached the app. Absent means the Apple Pay automation. */
  channel?: PaymentAlertChannel;
  /**
   * Notification review is confirmed explicitly (`confirm`) or by AI auto-review
   * (`ai`); Apple Pay remains automatic.
   */
  decision?: 'auto' | 'confirm' | 'ai';
  /** Apple Pay allowance checked at the durable automatic write. */
  autoLogIsPro?: boolean;
  /** Capture bookkeeping committed atomically with an auto-logged expense. */
  onAutoLogPersisted?: (transactionId: string) => void;
  /** Capture link committed atomically with a manually reviewed notification. */
  onNotificationReviewPersisted?: (transactionId: string) => void;
  /** A transfer's fee, written as its own expense row beside it (`transferFee.ts`). */
  transferFee?: TransferFeeDraft | null;
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

/** A week's, month's or year's budget as its editor saves it. */
export interface PeriodBudgetInput {
  totalAmount: number;
  countUnbudgeted: boolean;
  lines: BudgetAllocationInput[];
  /**
   * The budget's currency; null (or the main currency) = the ledger's main
   * currency. Left out of an update (a Web Dashboard edit), it keeps its own.
   */
  currency?: string | null;
}

export interface CreateBudgetTemplateInput {
  name: string;
  /** Optional emoji shown next to the template name. */
  emoji?: string | null;
  /** How often budgets made from it repeat. */
  period: BudgetPeriod;
  /**
   * The currency its amounts are in; null (or the main currency) = the
   * ledger's main currency. Left out of an update, the template keeps its own.
   */
  currency?: string | null;
  totalAmount: number;
  /** Whether unbudgeted spend counts toward the period total (default true). */
  countUnbudgeted?: boolean;
  allocations: BudgetAllocationInput[];
  /** Also create budgets for missing past periods (first expense period → last one). */
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

export interface InstalmentPlanUpdate {
  name?: string;
  /** Each upcoming payment (the bank's figure); the last one balances. */
  amount?: number;
  note?: string | null;
  accountId?: string;
  categoryId?: string;
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
  /**
   * Change an existing account's currency, re-denominating its history in a
   * lump. Returns the account's balance in the new currency afterwards (null
   * when the account is gone), so a balance edit made in the same save can be
   * recorded against the exact converted figure.
   */
  changeAccountCurrency: (
    accountId: string,
    toCurrency: string,
    otherUpdates?: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
  ) => number | null;
  deleteAccount: (id: string) => void;
  reorderAccounts: (ids: string[]) => void;
  /**
   * Archive or un-archive a savings goal (type 'goal'). Archiving also
   * deactivates active auto-save transfer rules paying into the goal so it
   * cannot keep accumulating invisibly.
   */
  setGoalArchived: (accountId: string, archived: boolean) => void;
  /** Goal account whose achievement celebration is waiting to be shown, or null. */
  pendingGoalCelebration: Account | null;
  clearGoalCelebration: () => void;
  /**
   * Archive or un-archive a loan (type 'loan'). Archiving also deactivates
   * active auto-repayment transfer rules paying into the loan so a settled
   * loan cannot keep drawing money invisibly.
   */
  setLoanArchived: (accountId: string, archived: boolean) => void;
  /**
   * Archive or un-archive an everyday (debit or credit) account. It leaves the
   * accounts stack and the account pickers and keeps every transaction.
   * Archiving also pauses the recurring rules that post to or from it, so a
   * hidden account cannot keep filling up. Loans use `setLoanArchived` and
   * goals `setGoalArchived`.
   */
  setAccountArchived: (accountId: string, archived: boolean) => void;
  /** Loan account whose payoff celebration is waiting to be shown, or null. */
  pendingLoanCelebration: Account | null;
  clearLoanCelebration: () => void;
  createAccountGroup: (name: string) => void;
  renameAccountGroup: (id: string, name: string) => void;
  deleteAccountGroup: (id: string) => void;
  reorderAccountGroups: (ids: string[]) => void;
  createRecurringRule: (input: CreateRecurringRuleInput) => void;
  updateRecurringRule: (id: string, updates: Partial<CreateRecurringRuleInput>) => void;
  deleteRecurringRule: (id: string) => void;
  /** Every instalment plan with its progress: active ones first, by next payment. */
  instalmentPlans: InstalmentProgress[];
  /** Saves a plan and makes its first payment when that is already due. */
  createInstalmentPlan: (input: CreateInstalmentPlanInput) => CreatedInstalmentPlan | null;
  /**
   * Turns an expense already saved into a plan of its amount, after saving
   * the editor's `edits` to it: the expense becomes payment 1.
   */
  convertTransactionToInstalmentPlan: (
    id: string,
    edits: Partial<CreateTransactionInput>,
    plan: Omit<ConvertToInstalmentPlanInput, 'transactionId'>,
    onConverted?: () => void,
  ) => void;
  /** Renames a plan or moves its upcoming payments to another account or category. */
  updateInstalmentPlan: (id: string, updates: InstalmentPlanUpdate) => void;
  /** Ends a plan; the payments already made stay unless `removePayments`. */
  deleteInstalmentPlan: (id: string, removePayments: boolean) => void;
  /** Makes the next payment today. Returns its id, or null when nothing is left. */
  payNextInstalment: (id: string) => string | null;
  /** Pays everything left in one payment today and ends the plan. */
  payOffInstalmentPlan: (id: string) => string | null;

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
  /** Sets the people an album that is not shared is split with. */
  setAlbumPeople: (albumId: string, people: AlbumPerson[]) => void;
  /**
   * Shared albums (README: Album members and shared albums). Brings the
   * user's entries in step with every shared album's group; true when
   * anything was written (the caller then reloads).
   */
  syncAlbumGroups: () => boolean;
  /** An album just shared from this phone: its split bills become the group's. */
  publishAlbumGroup: (groupId: string) => void;
  /** Adds someone to a shared album's group by name, or says why not. */
  addAlbumMember: (groupId: string, name: string) => PeopleEditError | null;
  renameAlbumMember: (groupId: string, memberId: string, name: string) => PeopleEditError | null;
  /** Removes a member nobody's bill names; false when a bill still does, or they have joined. */
  removeAlbumMember: (groupId: string, memberId: string) => boolean;
  /**
   * Says who the user is in a group they joined: one of its placeholders
   * (`memberId`), or someone new (`null`, named `name`).
   */
  claimAlbumMember: (groupId: string, memberId: string | null, name: string) => void;
  /**
   * Saves a split bill of a shared album: the group's bill is written, and
   * the user's own entry follows from it. `rows` are the split editor's, for
   * the whole bill. Null when the album is not shared on this phone (the
   * caller saves it as any split bill); `mine` false when the user has no
   * part in the bill, which is then not in their ledger.
   */
  saveAlbumBill: (
    groupId: string,
    input: CreateTransactionInput,
    rows: AlbumBillRowInput[],
    existingId?: string,
  ) => { id: string; mine: boolean } | null;
  /** A group's bill that is no longer split: it leaves the group and stays the user's own entry. */
  detachAlbumBill: (transactionId: string) => void;
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

  /** Reusable budget definitions; exactly one per period is default while that period has any. */
  budgetTemplates: BudgetTemplate[];
  /** Frozen week, month and year budgets, ascending by period then key. */
  periodBudgets: PeriodBudget[];
  createBudgetTemplate: (input: CreateBudgetTemplateInput) => string;
  updateBudgetTemplate: (
    id: string,
    input: Omit<CreateBudgetTemplateInput, 'backPopulate'>,
  ) => void;
  deleteBudgetTemplate: (id: string) => void;
  setDefaultBudgetTemplate: (id: string) => void;
  /** Keys of `period` that have or ever had a budget (deletion tombstones
   *  included) — the back-populate preview must skip exactly what the fill
   *  will skip. */
  getBudgetKeysEverExisted: (period: BudgetPeriod) => string[];
  /** Creates a budget for period `key` from a template of that period; no-ops
   *  if the period has one. */
  createPeriodBudget: (key: string, templateId: string) => void;
  /** Creates a one-off custom budget for one period (no template involved). */
  createCustomPeriodBudget: (period: BudgetPeriod, key: string, input: PeriodBudgetInput) => void;
  /**
   * Edits one period's frozen budget in place (total, options, lines, and
   * currency when given). A local override for that period only; the source
   * template is untouched.
   */
  updatePeriodBudget: (id: string, input: PeriodBudgetInput) => void;
  deletePeriodBudget: (id: string) => void;

  /** Returns the id of the newly created (optimistically inserted) transaction. */
  createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => string;
  updateTransaction: (id: string, input: Partial<CreateTransactionInput>) => void;
  /**
   * Adds, changes or removes a transfer's fee (null or 0 removes it). Pass the
   * transfer as it stands after the save. See `features/transactions/lib/transferFee.ts`.
   */
  saveTransferFee: (
    transfer: TransferForFee & { createdAt: string; dayOrder: number | null },
    draft: TransferFeeDraft | null,
  ) => void;
  deleteTransaction: (id: string) => void;
  updateTransactionsBulk: (
    updates: { id: string; input: Partial<CreateTransactionInput> }[],
  ) => void;
  deleteTransactionsBulk: (ids: string[]) => void;
  /** Returns the id of the newly created (optimistically inserted) transaction.
   *  Pass `receiptSplit` to persist the itemized receipt detail behind the
   *  bridge split rows in the same write. */
  createTransactionWithSplits: (
    input: CreateTransactionInput,
    splits: SplitDraftInput[],
    receiptSplit?: ReceiptSplitDraftInput,
    meta?: { source?: 'web_dashboard' },
  ) => string;
  /**
   * `markingPaidIds`: rows the same save marks paid right after, which must not
   * be merged into another owed row first (see `consolidateOwedRows`).
   */
  updateTransactionSplits: (
    transactionId: string,
    splits: SplitDraftInput[],
    options?: { markingPaidIds?: readonly string[] },
  ) => void;
  /** Rewrites a transaction's bridge splits AND its itemized receipt detail
   *  (replace-on-save), optionally patching the parent transaction too. */
  updateTransactionReceiptSplit: (
    transactionId: string,
    parentInput: Partial<CreateTransactionInput>,
    splits: SplitDraftInput[],
    receiptSplit: ReceiptSplitDraftInput,
  ) => void;
  /** Non-reactive read of a transaction's itemized receipt detail, if any. */
  getReceiptSplitForTransaction: (transactionId: string) => ReceiptSplit | null;
  markSplitPaid: (
    splitId: string,
    options?: { paybackAccountId?: string | null; date?: string; note?: string | null },
  ) => void;
  /**
   * A friend paid back `amount` of the unpaid row `splitId`. Less than it owes
   * records a part payment; all of it is Mark paid.
   */
  recordSplitPayment: (
    splitId: string,
    amount: number,
    options?: { paybackAccountId?: string | null; date?: string },
  ) => void;
  markSplitUnpaid: (splitId: string) => void;
  updateSplitPaybackAccount: (splitId: string, paybackAccountId: string | null) => void;
  deleteSplit: (splitId: string) => void;
  /**
   * The user paid a friend back for a bill that friend paid (`payerSplitId` is
   * the payer's row). The expense moves onto `accountId`, the account it was
   * paid from; null records the payment without one.
   */
  payBackPayer: (
    payerSplitId: string,
    options?: { accountId?: string | null; via?: 'bill' | 'settle_up' },
  ) => void;
  /** Undoes {@link payBackPayer}: the user owes the share again. */
  undoPayBackPayer: (payerSplitId: string) => void;
  /**
   * The user paid `amount` of what they owe the friend who paid a bill. Less
   * than what is owed is a part payment: an expense of its own on
   * `accountId`, cut out of the bill, with the rest still owed. Everything
   * that is left is {@link payBackPayer}.
   */
  recordPayBack: (
    payerSplitId: string,
    amount: number,
    options?: { accountId?: string | null },
  ) => void;
  /** Undoes one part payment: its expense goes and the part is owed again. */
  undoPayBackPart: (partSplitId: string) => void;
  /**
   * Settles everything open with one person, both ways, through `accountId`:
   * their unpaid shares are marked paid into it and the bills they paid are
   * paid back from it, so the account moves by the net.
   */
  settleUpWithPerson: (personKey: string, accountId: string | null) => void;

  /** Reimbursements: an expense someone else pays back. */
  markTransactionReimbursed: (
    id: string,
    options?: { accountId?: string | null; date?: string },
  ) => void;
  unmarkTransactionReimbursed: (id: string) => void;

  updateSettings: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'locale'
        | 'currencyCode'
        | 'currencySymbol'
        | 'displayMode'
        | 'workdayDisplayEnabled'
        | 'workingHoursPerDay'
        | 'hapticsEnabled'
        | 'themeMode'
        | 'themeColor'
        | 'iconStyle'
        | 'appIcon'
        | 'accountLogoCountry'
        | 'subscriptionLogoCountry'
        | 'profileName'
        | 'profileAvatarUri'
        | 'onboardingCompleted'
        | 'weekStartsOn'
        | 'firstDayOfMonth'
        | 'firstDayOverridesJson'
        | 'biometricLockEnabled'
        | 'biometricLockDelaySeconds'
        | 'autoBackupEnabled'
        | 'autoBackupTarget'
        | 'lastAutoBackupAt'
        | 'lastAutoBackupError'
        | 'paymentQrUri'
        | 'defaultPaybackAccountId'
        | 'reimbursementsCountAsExpense'
        | 'showTransactionAccount'
        | 'showAccountPickerBalances'
        | 'highlightRecurringTransactions'
        | 'navTabsJson'
      >
    >,
  ) => void;
  updateWageConfig: (config: WageConfig) => void;
  updateWageConfigForMonth: (month: string, config: WageConfig) => void;
  deleteWageConfigForMonth: (month: string) => void;
  toggleDisplayMode: () => void;
  /** Flip the assets-page eye (settings.hideAccountBalances), from the stored value. */
  toggleHideAccountBalances: () => void;
  canUseTimeDisplayMode: boolean;

  getAccountById: (id: string) => Account | undefined;
  getCategoryById: (id: string) => Category | undefined;
  /** Non-reactive count of currently-loaded (non-deleted) transactions. Lets
   *  consumers gate on activity without subscribing to transaction churn. */
  getTransactionCount: () => number;
  /** Non-reactive count of transactions carrying a receipt image. Lets the
   *  editor gate receipt uploads on the free-plan limit without subscribing
   *  to transaction churn. */
  getReceiptCount: () => number;
  /** Non-reactive count of transactions that are still unsettled split bills.
   *  Lets the editor gate free-plan split-bill creation without subscribing to
   *  transaction churn. */
  getUnpaidSplitBillCount: () => number;
  getTransactionsByAccount: (accountId: string) => TransactionWithRelations[];
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
  paymentAlertPrefs: PaymentAlertPrefs;
  updatePaymentAlertPrefs: (
    next: PaymentAlertPrefs | ((previous: PaymentAlertPrefs) => PaymentAlertPrefs),
  ) => void;
  quickEntryPrefs: QuickEntryPrefs;
  updateQuickEntryPrefs: (updates: Partial<QuickEntryPrefs>) => void;

  completeOnboarding: (options?: { seedDefaultAccounts?: boolean }) => {
    createdAccounts: number;
    createdCategories: number;
  };

  /** Every live ledger, default first. See lib/db/ledgerScope.ts. */
  ledgers: Ledger[];
  /** The ledger open now. */
  activeLedger: Ledger;
  /** Open another ledger: every screen reloads with its data. Pro is checked by the caller. */
  switchLedger: (ledgerId: string) => void;
  /** Create a ledger, fill it from the open one or with starters, and open it. */
  createLedger: (input: CreateLedgerInput) => string;
  updateLedger: (ledgerId: string, input: Partial<LedgerInput>) => void;
  /** Delete a ledger with everything in it; deleting the open one opens the default ledger first. */
  deleteLedger: (ledgerId: string) => void;
  /** Live transactions per ledger id; read on demand, e.g. when the switcher opens. */
  getLedgerEntryCounts: () => Record<string, number>;
}

interface CreateLedgerInput extends LedgerInput {
  /** The ledger copied from (any ledger on the phone); the open one when absent. */
  copyFromLedgerId?: string;
  /**
   * Copy the whole ledger, history included (lib/db/ledgerCopy.ts). The new
   * ledger must then be in the source's currency; `copyParts` and
   * `copyMonthCycle` are ignored (it copies the cycle too).
   */
  copyEverything?: boolean;
  /**
   * What else the new ledger starts with, without history
   * (`ledgerPartsCopySpecs`). Without accounts or categories it gets the
   * starter set of each.
   */
  copyParts: readonly LedgerCopyPart[];
  /** Copy the source's month cycle (start day and custom months); else day 1. */
  copyMonthCycle: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);
const TransactionsContext = createContext<TransactionsContextValue | null>(null);
const EMPTY_PAYBACK_INDEX: ReadonlyMap<string, PaybackLink> = new Map();
const PaybackIndexContext = createContext<ReadonlyMap<string, PaybackLink>>(EMPTY_PAYBACK_INDEX);

/**
 * Every payback transfer (a split's Mark paid or part payment into another
 * account) by id, with its bill. From all transactions, since a payback's bill
 * can be in another month; its identity holds while the paybacks stay the same.
 */
export function usePaybackIndex(): ReadonlyMap<string, PaybackLink> {
  return useContext(PaybackIndexContext);
}
const TransferFeeIndexContext = createContext<TransferFeeIndex>(EMPTY_TRANSFER_FEE_INDEX);

/**
 * Every transfer's fee (the expense row written for it), by transfer and by
 * fee. Its identity holds while the fees stay the same.
 */
export function useTransferFeeIndex(): TransferFeeIndex {
  return useContext(TransferFeeIndexContext);
}
const EMPTY_PAYBACK_ROWS: TransactionWithRelations[] = [];
const PaybackRowsContext = createContext<TransactionWithRelations[]>(EMPTY_PAYBACK_ROWS);

/**
 * A row for every payback that wrote no transfer (into the bill's own account,
 * or on a bill with no account), newest first (`buildPaybackRows`), for the
 * activity lists to merge in. Display only: never stored, edited or selected.
 * Its identity holds while those paybacks stay the same.
 */
export function usePaybackRows(): TransactionWithRelations[] {
  return useContext(PaybackRowsContext);
}
const EMPTY_ACCOUNT_TRANSACTIONS: TransactionWithRelations[] = [];
const EMPTY_ALBUM_STATS: AlbumStats = {
  totalSpent: 0,
  transactionCount: 0,
  startDate: null,
  endDate: null,
};

function computeAlbumStats(
  {
    albums,
    transactions,
    valueForDisplay,
    reimbursementsCountAsExpense,
  }: {
    albums: Album[];
    transactions: TransactionWithRelations[];
    valueForDisplay: (amount: number, dateIso: string) => number;
    reimbursementsCountAsExpense: boolean;
  },
  transactionIdsByAlbum: Map<string, string[]>,
): Map<string, AlbumStats> {
  const map = new Map<string, AlbumStats>();
  if (albums.length === 0) return map;
  const transactionById = new Map(transactions.map((tx) => [tx.id, tx]));

  albums.forEach((album) => {
    let totalSpent = 0;
    let transactionCount = 0;
    let startDate: string | null = null;
    let endDate: string | null = null;
    for (const id of transactionIdsByAlbum.get(album.id) ?? []) {
      // A deleted transaction is gone from the loaded list, which is exactly
      // the join on live rows the stats used to be read with.
      const row = transactionById.get(id);
      if (!row) continue;
      transactionCount += 1;
      // Only the spend is filtered. The transaction count and the trip's
      // first/last dates describe the album itself, so a reimbursable
      // expense must not shorten the trip or make the card under-count.
      if (countsAsExpenseRow(row) && countsTowardSpending(row, reimbursementsCountAsExpense)) {
        totalSpent += valueForDisplay(row.reportingAmount ?? row.amount, row.date);
      }
      if (startDate === null || row.date < startDate) startDate = row.date;
      if (endDate === null || row.date > endDate) endDate = row.date;
    }
    // Manual overrides win over the computed first/last transaction dates.
    map.set(album.id, {
      totalSpent,
      transactionCount,
      startDate: album.startDate ?? startDate,
      endDate: album.endDate ?? endDate,
    });
  });

  return map;
}

// Defer a persist/refresh task off the critical render path (so the optimistic
// UI paint and any in-flight close/navigation animation stay smooth) without
// letting a busy device starve it — on slower Android phones the modal-dismiss
// + tab-switch + calendar re-render keep registering interaction handles, so a
// quick-add write (and the refresh that follows) could be held off for many
// seconds — the "transaction took ~10s to appear / redirect" symptom. The cap
// guarantees the write always lands promptly.
const DEFERRED_WRITE_MAX_DELAY_MS = 300;
// How long after a failed reminder scheduling the one retry runs.
const REMINDER_RETRY_DELAY_MS = 3000;
// Above this many written rows a reload costs no more than re-reading them by id.
const RECONCILE_ROW_LIMIT = 500;
function runDeferredWrite(task: () => void) {
  runAfterInteractionsCapped(task, DEFERRED_WRITE_MAX_DELAY_MS);
}

/**
 * The transfer a friend's payback makes when it lands in another account than
 * the one that paid the bill: from the bill's account to the payback account,
 * dated `date`, owned by whoever the bill is (optimistic copy of the row the
 * deferred write creates).
 */
function optimisticPaybackTransfer(input: {
  id: string;
  amount: number;
  currency: string;
  toAmount: number | null;
  parent: TransactionWithRelations;
  toAccountId: string;
  date: string;
  note: string | null;
  at: string;
  names: Partial<TransactionWithRelations>;
}): TransactionWithRelations {
  const { parent } = input;
  return {
    id: input.id,
    instalmentRuleId: null,
    instalmentNumber: null,
    dayOrder: null,
    type: 'transfer',
    amount: input.amount,
    currency: input.currency,
    reportingCurrency: null,
    reportingAmount: null,
    fxRate: null,
    toAmount: input.toAmount,
    accountAmount: null,
    date: input.date,
    accountId: null,
    fromAccountId: parent.accountId,
    toAccountId: input.toAccountId,
    categoryId: null,
    note: input.note,
    details: null,
    receiptUri: null,
    sentiment: 'neutral',
    ...NO_REIMBURSEMENT,
    countsAsExpense: false,
    feeOfId: null,
    // The repayment belongs to whoever the split expense does.
    ...withEntryStamp({ memberId: parent.memberId }, getActiveLedgerId()),
    albumGroupId: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    createdAt: input.at,
    updatedAt: input.at,
    deletedAt: null,
    ...input.names,
  };
}

/** The transfer a cross-account payback writes (see optimisticPaybackTransfer). */
function createPaybackTransferInDb(
  id: string,
  input: {
    amount: number;
    currency: string;
    toAmount?: number | null;
    date: string;
    fromAccountId: string | null;
    toAccountId: string;
    note: string | null;
    memberId: string | null;
    createdBy?: string | null;
  },
): void {
  transactionsRepository.createWithId(id, {
    type: 'transfer',
    amount: input.amount,
    currency: input.currency,
    toAmount: input.toAmount ?? null,
    date: input.date,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    accountId: null,
    categoryId: null,
    note: input.note,
    sentiment: 'neutral',
    ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : null),
    memberId: input.memberId,
  });
}

/** An account's currency by id, read from the accounts already in memory. */
type AccountCurrencyOf = AccountCurrencyLookup;

/**
 * The payback transfer's amounts for a share of `share` paid into
 * `toAccountId`, in each account's own currency (`paybackTransferAmounts`).
 * `parent` is the bill before the payback lowers it.
 */
function paybackAmountsFor(
  parent: Pick<TransactionWithRelations, 'accountId' | 'currency' | 'amount' | 'accountAmount'>,
  share: number,
  toAccountId: string,
  rateTable: RateTable,
  currencyOf: AccountCurrencyOf,
): PaybackTransferAmounts {
  const fromCurrency = (parent.accountId ? currencyOf(parent.accountId) : null) || parent.currency;
  const toCurrency = currencyOf(toAccountId) || fromCurrency;
  return paybackTransferAmounts({
    share,
    billCurrency: parent.currency,
    billAmount: parent.amount,
    billAccountAmount: parent.accountAmount ?? null,
    fromCurrency,
    toCurrency,
    rateTable,
  });
}

/**
 * Rates to rebuild a bill's frozen snapshots when undoing a payback on a bill
 * whose amount had reached 0 (see `rescaleSplitAdjustedAmounts`). Reporting:
 * the bill's frozen `fxRate`, else today's. Account: the rate the undone
 * payback's transfer left the account at (`undone`, so the account gets back
 * exactly what the deleted transfer took), else the frozen `fxRate` when the
 * account is in the reporting currency, else today's.
 */
function splitRestoreRates(
  tx: Pick<
    TransactionWithRelations,
    'currency' | 'fxRate' | 'reportingCurrency' | 'accountId' | 'accountAmount'
  >,
  rateTable: RateTable,
  currencyOf: AccountCurrencyOf,
  undone?: {
    share: number;
    transfer: Pick<TransactionWithRelations, 'amount' | 'fromAccountId'> | null | undefined;
  },
): SplitSnapshotRates {
  let accountRate: number | null = null;
  if (tx.accountAmount != null && tx.accountId) {
    const accountCurrency = currencyOf(tx.accountId);
    const transfer = undone?.transfer;
    if (transfer && transfer.fromAccountId === tx.accountId && undone.share > 0) {
      accountRate = transfer.amount / undone.share;
    } else if (accountCurrency) {
      accountRate =
        frozenAccountRate(tx, accountCurrency) ??
        convert(1, tx.currency, accountCurrency, rateTable).rateUsed;
    }
  }
  const reportingRate =
    tx.fxRate ??
    (tx.reportingCurrency
      ? convert(1, tx.currency, tx.reportingCurrency, rateTable).rateUsed
      : null);
  return { reportingRate, accountRate };
}

/**
 * A friend's payback of `amount` on the bill `parent`: the expense drops by it
 * (Mark paid and part payments alike), and a payback into another account
 * than the bill's (`transferTxId` set) writes its transfer.
 */
function writePaybackInDb(
  parent: TransactionWithRelations,
  input: {
    amount: number;
    toAccountId: string | null;
    transferTxId: string | null;
    date: string;
    note: string | null;
    rateTable: RateTable;
    currencyOf: AccountCurrencyOf;
  },
): void {
  transactionsRepository.update(
    parent.id,
    rescaleSplitAdjustedAmounts(parent, parent.amount - input.amount),
  );
  if (!input.transferTxId || !input.toAccountId) return;
  const transfer = paybackAmountsFor(
    parent,
    input.amount,
    input.toAccountId,
    input.rateTable,
    input.currencyOf,
  );
  createPaybackTransferInDb(input.transferTxId, {
    amount: transfer.amount,
    currency: transfer.currency,
    toAmount: transfer.toAmount,
    date: input.date,
    fromAccountId: parent.accountId,
    toAccountId: input.toAccountId,
    note: input.note,
    memberId: parent.memberId,
  });
}

/**
 * Optimistic splits after the rows `reopenedIds` turned unpaid: each is folded
 * into an unpaid row of the same share, so a share paid in parts keeps one
 * amount owed (`planUnpaidMerge`).
 */
function foldReopenedSplits(
  splits: TransactionSplit[],
  reopenedIds: readonly string[],
  at: string,
): TransactionSplit[] {
  let next = splits;
  for (const id of reopenedIds) {
    const merge = planUnpaidMerge(next, id);
    if (merge) next = applyUnpaidMerge(next, merge, at);
  }
  return next;
}

/**
 * Soft-deletes a split row; when it was a share's first row, its part payments
 * get a new first row (`planShareHandover`) so they stay one share.
 */
function softDeleteSplitInDb(split: TransactionSplit): void {
  const handover = planShareHandover(
    transactionSplitsRepository.listByTransactionId(split.transactionId),
    split.id,
  );
  transactionSplitsRepository.softDelete(split.id);
  if (!handover) return;
  transactionSplitsRepository.update(handover.newRootId, { partOfSplitId: null });
  for (const id of handover.repointIds) {
    transactionSplitsRepository.update(id, { partOfSplitId: handover.newRootId });
  }
}

/** Optimistic splits without the rows `removedIds`, handing over their shares. */
function removeSplitsKeepingShares(
  splits: TransactionSplit[],
  removedIds: readonly string[],
): TransactionSplit[] {
  let next = splits;
  for (const id of removedIds) {
    const handover = planShareHandover(next, id);
    next = next.filter((split) => split.id !== id);
    if (handover) next = applyShareHandover(next, handover);
  }
  return next;
}

/** The database side of `consolidateOwedRows`, for one bill's splits. */
function foldOwedRowsInDb(transactionId: string, keepSeparateIds: readonly string[] = []): void {
  const { merges } = consolidateOwedRows(
    transactionSplitsRepository.listByTransactionId(transactionId),
    nowIso(),
    keepSeparateIds,
  );
  for (const merge of merges) {
    transactionSplitsRepository.update(merge.keepId, { amount: merge.amount });
    transactionSplitsRepository.softDelete(merge.dropId);
  }
}

/** The database side of {@link foldReopenedSplits}, for one reopened row. */
function foldReopenedSplitInDb(splitId: string): void {
  const split = transactionSplitsRepository.findById(splitId);
  if (!split || split.paidAt) return;
  const merge = planUnpaidMerge(
    transactionSplitsRepository.listByTransactionId(split.transactionId),
    splitId,
  );
  if (!merge) return;
  transactionSplitsRepository.update(merge.keepId, { amount: merge.amount });
  transactionSplitsRepository.softDelete(merge.dropId);
}

/**
 * Resolves once every write deferred before the call has run: deferred
 * writes run in the order they were queued, so this one lands after them.
 * For callers that read the database right after a save (the Web Dashboard
 * builds its export from it).
 */
export function afterDeferredWrites(): Promise<void> {
  return new Promise((resolve) => runDeferredWrite(() => setTimeout(resolve, 0)));
}

// How long the foreground auto-backup waits after launch or a return to the
// foreground before checking whether a backup is due.
const AUTO_BACKUP_SETTLE_DELAY_MS = 3000;

/**
 * Reclaims an uploaded image after a row stops pointing at it.
 *
 * Uploaded logos and icons are shared: the same file can be assigned to several
 * accounts, categories, goals or budget templates from the picker, and a
 * month's frozen budget deliberately points at the same file as the template it
 * was copied from. So a delete or replace must never unlink the file directly.
 * Instead run the reference-aware sweep, which reclaims it only once no live
 * row references it. Skips entirely when the old value was not an upload, so
 * ordinary icon edits cost nothing.
 */
function sweepIfCustomAssetDropped(previous?: string | null, next?: string | null) {
  if (isCustomLogoId(previous) && previous !== next) {
    runDeferredWrite(() => runUserAssetGc());
  }
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

function seedDefaultAccountsIfMissing(preferredCurrency: string) {
  ONBOARDING_DEFAULT_GROUPS.forEach((groupName, index) => {
    accountGroupsRepository.create(groupName, index);
  });

  const existingAccounts = accountsRepository.list();
  const existing = new Set(existingAccounts.map((account) => accountNameSeedKey(account.name)));
  let createdAccounts = 0;
  let remainingSlots = Math.max(
    PRO_LIMITS.FREE_MAX_ACCOUNTS - countAccountsTowardFreeLimit(existingAccounts),
    0,
  );

  ONBOARDING_MINIMAL_ACCOUNTS.forEach((account) => {
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

/**
 * Make a ledger and fill it from `sourceId`: a full copy, or the chosen parts
 * without history (lib/db/ledgerCopy.ts). Where the result has no everyday
 * accounts or no categories (left out, or the source has none), it gets the
 * starter set. Run inside the caller's transaction; returns the new id.
 */
function createLedgerRows(
  sourceId: string,
  input: LedgerInput,
  choice: { everything: boolean; parts: ReadonlySet<LedgerCopyPart>; monthCycle: boolean },
): string {
  const sqlite = getSQLite();
  // Read the source with its scope open: its cycle, currency and what its loans owe.
  const source = withLedgerScope(sourceId, () => {
    const settings = settingsRepository.get();
    return {
      cycle: choice.monthCycle
        ? {
            firstDayOfMonth: settings.firstDayOfMonth,
            firstDayOverridesJson: settings.firstDayOverridesJson,
          }
        : { firstDayOfMonth: 1, firstDayOverridesJson: null },
      currency: ledgersRepository.activeReportingCurrency().code,
      loanBalances: new Map(
        !choice.everything && choice.parts.has('loans')
          ? accountsRepository.getBalances().map((row) => [row.accountId, row.balance])
          : [],
      ),
    };
  });
  // The month cycle is the ledger's own from the start (migration 076).
  const ledgerId = ledgersRepository.create(input, source.cycle);
  const now = nowIso();
  if (choice.everything) {
    copyLedgerRows(sqlite, sourceId, ledgerId, newId, now);
    return ledgerId;
  }
  copyLedgerRows(
    sqlite,
    sourceId,
    ledgerId,
    newId,
    now,
    ledgerPartsCopySpecs({
      parts: choice.parts,
      currency: { from: source.currency, to: input.currencyCode },
      loanBalances: source.loanBalances,
      nowIso: now,
      today: dayKeyFromDateLocal(new Date()),
    }),
  );
  withLedgerScope(ledgerId, () => {
    if (categoriesRepository.list().length === 0) seedMinimalCategoriesIfMissing();
    const everyday = accountsRepository
      .list()
      .some((account) => account.type === 'debit' || account.type === 'credit');
    if (!everyday) seedDefaultAccountsIfMissing(input.currencyCode);
  });
  return ledgerId;
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

/** Analytics: whether a budget is in the main currency or another one. */
function budgetCurrencyMode(
  currency: string | null | undefined,
  mainCurrency: string,
): 'main' | 'other' {
  return storedBudgetCurrency(currency, mainCurrency) ? 'other' : 'main';
}

/**
 * Creates the running week's, month's and year's budget (or only `only`'s)
 * from each period's default template when that period has never had one, so
 * a deleted budget stays deleted. A week budget made under another first day
 * of the week counts while it shares a day with this week. A budget in another
 * currency freezes that currency's rate from `rateTable`. Must run inside a
 * mutation. Returns how many budgets were made.
 */
function autoCreateCurrentBudgets(
  templates: BudgetTemplate[],
  clock: BudgetPeriodClock,
  rateTable: RateTable,
  only?: BudgetPeriod,
): number {
  let created = 0;
  const now = new Date();
  for (const period of only ? [only] : BUDGET_PERIODS) {
    const key = budgetPeriodKeyForDate(period, now, clock);
    // A week budget made under another first day of the week may share some
    // of these days: making another would count them twice.
    const hasEverHadBudget =
      period === 'week'
        ? budgetWeekOverlaps(key, periodBudgetsRepository.everExistedKeys('week'))
        : periodBudgetsRepository.hasEverExisted(period, key);
    const template = pickAutoCreateTemplate({
      period,
      currentPeriodHasEverHadBudget: hasEverHadBudget,
      templates,
    });
    if (!template) continue;
    if (
      periodBudgetsRepository.createFromTemplate(
        key,
        template,
        budgetRateToFreeze(template.currency, rateTable),
      )
    ) {
      created += 1;
      void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, { source: 'auto', period });
    }
  }
  return created;
}

/** The wage row that applies right now: the current month's entry, else the
 *  first listed one. Shared by refreshAll and refreshWages so the two paths
 *  can't drift. */
function selectEffectiveCurrentWage(
  allWages: MonthlyWageSettings[],
  monthCycle: MonthCycleInput = 1,
): MonthlyWageSettings | null {
  const currentMonthKey = financialMonthKeyForDate(new Date(), monthCycle);
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

/** An expense or income: a logged entry, as opposed to money moving between accounts. */
function isLoggedEntryType(type: TransactionWithRelations['type']): boolean {
  return type === 'expense' || type === 'income';
}

/** Report a bill split with other people; a split kept only for oneself is not one. */
function trackSplitBillCreated(splits: readonly { isSelf: boolean; isPayer?: boolean }[]): void {
  const people = splits.filter((split) => !split.isSelf).length;
  if (people === 0) return;
  void trackEvent(AnalyticsEvents.SPLIT_BILL_CREATED, {
    people,
    paid_by: splits.some((split) => split.isPayer && !split.isSelf) ? 'friend' : 'me',
  });
}

/** Erases the user's own data. Shared ledgers stay (see `deletePersonalLedgerRows`). */
function purgeAllData() {
  // Budgets go too: a surviving default template would recreate a ghost
  // budget (pointing at deleted categories) on the very next load.
  deletePersonalLedgerRows();
  getDb().delete(monthlyWageSettingsTable).run();
  // Payment alerts point at transactions, accounts and categories that are gone.
  getDb().delete(autoLogCapturesTable).run();
  getSQLite().execSync('DELETE FROM merchant_categories');
  // Reset settings to defaults but preserve appUserId so the device identity
  // remains stable across in-app data resets. The ID only rotates on
  // uninstall/reinstall (when SQLite itself is wiped).
  settingsRepository.reset();
}

/** Replaces the open ledger's data only; the other ledgers keep theirs. */
function purgeDataForImport() {
  const db = getDb();
  const sqlite = getSQLite();
  const ledgerId = getActiveLedgerId();
  // The import replaces every category id, so budget allocation lines can't
  // survive it — drop budgets rather than leave them pointing at ghosts. The
  // lines go first, while their parents still say which ledger they are in.
  sqlite.runSync(
    'DELETE FROM budget_template_categories WHERE template_id IN (SELECT id FROM budget_templates WHERE ledger_id = ?)',
    [ledgerId],
  );
  sqlite.runSync(
    'DELETE FROM monthly_budget_categories WHERE budget_id IN (SELECT id FROM monthly_budgets WHERE ledger_id = ?)',
    [ledgerId],
  );
  db.delete(transactionsTable).where(inActiveLedger(transactionsTable)).run();
  db.delete(categoriesTable).where(inActiveLedger(categoriesTable)).run();
  db.delete(accountsTable).where(inActiveLedger(accountsTable)).run();
  db.delete(recurringRulesTable).where(inActiveLedger(recurringRulesTable)).run();
  db.delete(accountGroupsTable).where(inActiveLedger(accountGroupsTable)).run();
  db.delete(budgetTemplatesTable).where(inActiveLedger(budgetTemplatesTable)).run();
  db.delete(monthlyBudgetsTable).where(inActiveLedger(monthlyBudgetsTable)).run();
  // Same for payment alerts: their transaction, account and category ids are
  // all replaced by the import.
  db.delete(autoLogCapturesTable).where(inActiveLedger(autoLogCapturesTable)).run();
  // Unused legacy merchant memory, cleared like every other import.
  sqlite.execSync('DELETE FROM merchant_categories');
}

/** Everything in the open ledger, for starting it over in a new currency. */
function purgeOpenLedgerData() {
  purgeDataForImport();
  const db = getDb();
  getSQLite().runSync(
    'DELETE FROM album_transactions WHERE album_id IN (SELECT id FROM albums WHERE ledger_id = ?)',
    [getActiveLedgerId()],
  );
  db.delete(albumsTable).where(inActiveLedger(albumsTable)).run();
  db.delete(itemsTable).where(inActiveLedger(itemsTable)).run();
}

/** Clears the open ledger's transactions only. */
function purgeTransactionsOnly() {
  const db = getDb();
  db.delete(transactionsTable).where(inActiveLedger(transactionsTable)).run();
  // Capture links cannot survive deletion of the entire ledger.
  db.delete(autoLogCapturesTable).where(inActiveLedger(autoLogCapturesTable)).run();
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
      const text = noteSearchTextById?.get(transaction.id) ?? transactionSearchText(transaction);
      if (!text.includes(searchTerm)) continue;
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
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  // Kept in sync each render so identity-stable callbacks (refreshWages) can read
  // the current month cycle without taking `settings` as a dep.
  const monthCycleRef = useRef<MonthCycleInput>(1);
  monthCycleRef.current = settings ? monthCycleOf(settings) : 1;
  // Same trick for the week start, which decides the day the weekly review
  // reminder fires on.
  const weekStartsOnRef = useRef<WeekStartsOn>(1);
  weekStartsOnRef.current = settings?.weekStartsOn ?? 1;
  const [storedCurrentWage, setCurrentMonthWage] = useState<MonthlyWageSettings | null>(null);
  const [storedWages, setMonthlyWages] = useState<MonthlyWageSettings[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  // Every rule, plans included. Plans are handed out on their own
  // (`instalmentPlans`), so `recurringRules` (the Recurring screen, goals,
  // loans, exports, the web dashboard) only ever sees ordinary rules.
  const [allRecurringRules, setRecurringRules] = useState<RecurringTransactionRule[]>([]);
  const recurringRules = useMemo(
    () => allRecurringRules.filter((rule) => !isInstalmentPlan(rule)),
    [allRecurringRules],
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  // Plans read the transactions, but they belong on the useApp() value, which
  // must not change on every transaction write (that would re-render every
  // consumer and undo the two-context split). So the result is kept, same
  // reference, until the rules or the payment rows themselves change.
  const instalmentPlansCacheRef = useRef<{
    rules: RecurringTransactionRule[];
    paymentsKey: string;
    plans: InstalmentProgress[];
  } | null>(null);
  const instalmentPlans = useMemo(() => {
    const payments = instalmentPaymentCandidates(allRecurringRules, transactions);
    const paymentsKey = instalmentPaymentsKey(payments);
    const cached = instalmentPlansCacheRef.current;
    if (cached && cached.rules === allRecurringRules && cached.paymentsKey === paymentsKey) {
      return cached.plans;
    }
    const plans = buildInstalmentPlans(allRecurringRules, payments);
    instalmentPlansCacheRef.current = { rules: allRecurringRules, paymentsKey, plans };
    return plans;
  }, [allRecurringRules, transactions]);
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
  const [periodBudgets, setPeriodBudgets] = useState<PeriodBudget[]>([]);
  // The latest list, for callbacks that only look a budget up.
  const periodBudgetsRef = useRef(periodBudgets);
  periodBudgetsRef.current = periodBudgets;
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
  const quickEntryPrefsRef = useRef(quickEntryPrefs);
  const [paymentAlertPrefs, setPaymentAlertPrefs] = useState<PaymentAlertPrefs>(() =>
    parsePaymentAlertPrefs(null),
  );
  const paymentAlertPrefsRef = useRef(paymentAlertPrefs);
  const updatePaymentAlertPrefs = useCallback(
    (next: PaymentAlertPrefs | ((previous: PaymentAlertPrefs) => PaymentAlertPrefs)) => {
      const resolved = typeof next === 'function' ? next(paymentAlertPrefsRef.current) : next;
      try {
        settingsRepository.updateAutoLogPrefsJson(serializePaymentAlertPrefs(resolved));
        paymentAlertPrefsRef.current = resolved;
        setPaymentAlertPrefs(resolved);
      } catch (error) {
        reportError(error, { scope: 'payment_alerts_prefs' });
        throw error;
      }
    },
    [],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rateTable, setRateTable] = useState<RateTable>(() => emptyRateTable());

  // Refs let the create/update callbacks read the latest rate table + reporting
  // currency without being recreated (and re-subscribing consumers) on every FX
  // refresh.
  const rateTableRef = useRef<RateTable>(rateTable);
  const reportingCurrencyRef = useRef<string>('USD');
  // The open ledger's accounts and settings for callbacks that run inside
  // setState updaters and deferred writes (split paybacks), read from memory
  // rather than SQLite and never from a stale closure.
  const accountsRef = useRef<Account[]>(accounts);
  accountsRef.current = accounts;
  const settingsRef = useRef<UserSettings | null>(settings);
  settingsRef.current = settings;
  const accountCurrencyOf = useCallback<AccountCurrencyOf>(
    (accountId) => accountsRef.current.find((account) => account.id === accountId)?.currency,
    [],
  );
  // Where a friend's payback lands when nothing else says: the share's own
  // account (or the bill's), unless the user has archived it since, then
  // where money is paid to now (`pickPaybackAccountId`).
  const livePaybackAccountId = useCallback((accountId: string | null): string | null => {
    if (!accountId) return null;
    const account = accountsRef.current.find((item) => item.id === accountId);
    if (!account || !isAccountArchived(account)) return accountId;
    return pickPaybackAccountId(accountsRef.current, settingsRef.current?.defaultPaybackAccountId);
  }, []);
  // Where a payback lands: the account the caller picked, else the share's
  // own (or the bill's) while it is live (`livePaybackAccountId`). A bill paid
  // from no account moves no money, so its payback names no account either.
  const resolvePaybackAccountId = useCallback(
    (
      parent: Pick<TransactionWithRelations, 'accountId'>,
      split: Pick<TransactionSplit, 'paybackAccountId'>,
      picked: string | null | undefined,
    ): string | null => {
      if (!parent.accountId) return null;
      return picked !== undefined
        ? picked
        : livePaybackAccountId(split.paybackAccountId ?? parent.accountId);
    },
    [livePaybackAccountId],
  );
  // The payback a Mark paid undo reverses: its share and transfer, read
  // before the undo removes them, so a bill at 0 is restored at the rate that
  // transfer used (`splitRestoreRates`).
  const undonePaybackOf = useCallback((splitId: string) => {
    const parent = transactionsRef.current.find((tx) => tx.splits?.some((s) => s.id === splitId));
    const split = parent?.splits?.find((s) => s.id === splitId);
    if (!split) return undefined;
    const transfer = split.paidTransactionId
      ? transactionsRef.current.find((tx) => tx.id === split.paidTransactionId)
      : null;
    return { share: split.amount, transfer };
  }, []);
  useEffect(() => {
    rateTableRef.current = rateTable;
  }, [rateTable]);
  useEffect(() => {
    if (settings?.currencyCode) reportingCurrencyRef.current = settings.currencyCode;
  }, [settings?.currencyCode]);

  // One wage serves every ledger, kept in the default ledger's currency. A
  // ledger in another currency reads and saves it in its own.
  const wageCurrency = ledgers.find((ledger) => ledger.id === DEFAULT_LEDGER_ID)?.currencyCode;
  const wageToLedgerRate = useMemo(
    () => wageRate(wageCurrency, settings?.currencyCode, rateTable),
    [rateTable, settings?.currencyCode, wageCurrency],
  );
  const wageRateRef = useRef(wageToLedgerRate);
  wageRateRef.current = wageToLedgerRate;
  const currentMonthWage = useMemo(
    () => storedCurrentWage && wageInCurrency(storedCurrentWage, wageToLedgerRate),
    [storedCurrentWage, wageToLedgerRate],
  );
  const monthlyWages = useMemo(
    () =>
      wageToLedgerRate === 1
        ? storedWages
        : storedWages.map((wage) => wageInCurrency(wage, wageToLedgerRate)),
    [storedWages, wageToLedgerRate],
  );

  const reloadRateTable = useCallback((reportingCurrency: string) => {
    const rows = exchangeRatesRepository.listByBase(reportingCurrency);
    const nextRateTable = buildRateTable(reportingCurrency, rows);
    setRateTable(nextRateTable);
    // New rates can freeze the rate of a budget made while none was known.
    try {
      const frozen = periodBudgetsRepository.freezeMissingRates((currency) =>
        budgetRateToFreeze(currency, nextRateTable),
      );
      if (frozen > 0) setPeriodBudgets(periodBudgetsRepository.list());
    } catch (error) {
      reportError(error, { scope: 'budget_rate_freeze' });
    }
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
      // A transfer the user asked to be counted as spending still needs the
      // frozen reporting figure, because that is the number every expense
      // total reads. Without it a foreign-currency loan repayment would be
      // counted at face value in the reporting currency.
      countsAsExpense = false,
    ): {
      reportingCurrency: string | null;
      reportingAmount: number | null;
      fxRate: number | null;
    } => {
      if ((type === 'transfer' && !countsAsExpense) || type === 'balance_adjustment') {
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

  // What the reminders were last scheduled from. Three places schedule them
  // (a load, a prefs change, and the effect that follows the week and month
  // start), and the effect runs right after either of the others with the very
  // same values; it skips those, so a launch schedules once rather than twice.
  const scheduledRemindersRef = useRef<{
    prefs: NotificationPreferences;
    weekStartsOn: WeekStartsOn;
    firstDayOfMonth: number;
  } | null>(null);
  const scheduleReminders = useCallback(
    (
      prefs: NotificationPreferences,
      options: { weekStartsOn: WeekStartsOn; firstDayOfMonth: number },
    ) => {
      const scheduled = { prefs, ...options };
      scheduledRemindersRef.current = scheduled;
      const attempt = (retriesLeft: number) => {
        // expo-notifications' scheduling call can reject with a transient OS
        // error (iOS's notification daemon connection dropping), which surfaced
        // as an unhandled rejection on every cold start (Sentry MONEY2TIME-R).
        syncScheduledNotifications(prefs, options).catch((error) => {
          reportError(error, { scope: 'notifications' });
          // It can fail between cancelling a reminder and scheduling it again,
          // so try once more, unless something newer has been scheduled since.
          // (The second scheduling a launch used to do covered this by chance.)
          if (retriesLeft <= 0 || scheduledRemindersRef.current !== scheduled) return;
          setTimeout(() => {
            if (scheduledRemindersRef.current === scheduled) attempt(retriesLeft - 1);
          }, REMINDER_RETRY_DELAY_MS);
        });
      };
      attempt(1);
    },
    [],
  );

  const refreshAll = useCallback(() => {
    try {
      const databaseInit = initializeDatabase();
      perfMark('db_init');
      if (databaseInit.isDowngrade) {
        // The DB was written by a newer build. Not fatal (we run forward-only
        // and leave the schema alone), but it means this install is running
        // older code against a newer schema, which is worth knowing about.
        reportError(new Error('Database was written by a newer app version'), {
          scope: 'db_downgrade',
        });
      }
      // initializeDatabase has opened the stored ledger; everything below
      // reads that ledger's rows.
      invalidateLedgerPeople();
      const nextLedgers = ledgersRepository.list();
      const nextSettings = settingsRepository.get();
      if (databaseInit.isNewInstall) {
        // The install's first launch; PostHog's automatic lifecycle events are off.
        // Queued until the new appUserId is identified, like any early event.
        void trackEvent(AnalyticsEvents.FIRST_APP_OPEN, {
          locale: nextSettings.locale,
          currency_code: nextSettings.currencyCode,
        });
      }
      const allWages = monthlyWageRepository.list();
      const effectiveCurrentWage = selectEffectiveCurrentWage(allWages, monthCycleOf(nextSettings));
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
          // A corrupt prefs blob must not brick the whole launch — fall back to
          // defaults rather than throwing out of refreshAll. The normalizer
          // validates every field and carries a pre-review-reminder blob's
          // `weeklySummary` settings across.
          return normalizeNotificationPrefs(JSON.parse(nextNotificationPrefsJson));
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
          quickEntryEnabled?: boolean;
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
        // The quick-entry on/off switch is gone — the + button actions cover it.
        delete parsed.quickEntryEnabled;
        const merged = { ...DEFAULT_QUICK_ENTRY_PREFS, ...parsed };
        // Coerce stale add-button actions (e.g. the old 'manual' value) to a
        // current one so no removed i18n key is ever looked up.
        if (!ADD_BUTTON_ACTIONS.includes(merged.addPrimaryAction)) {
          merged.addPrimaryAction = 'quick';
        }
        if (
          merged.addSecondaryAction !== 'none' &&
          !ADD_BUTTON_ACTIONS.includes(merged.addSecondaryAction)
        ) {
          merged.addSecondaryAction = 'none';
        }
        if (!ADD_BUTTON_ACTIONS.includes(merged.backTapAction)) {
          merged.backTapAction = 'quick';
        }
        return merged;
      })();
      accountGroupsRepository.ensureFromActiveAccounts();
      // Before the run, so rules saved before anchor days run on their own day.
      try {
        recurringRulesRepository.repairLegacySchedules();
      } catch (error) {
        // The rules still run, on the day their next run date shows.
        reportError(error, { scope: 'recurring_repair' });
      }
      const processedRules = recurringRulesRepository.runDueTransactions(nowIso(), 10, {
        feeNote: I18n.t('transactions.editor.transfer_fee.row_note'),
      });
      perfMark('recurring_run');
      const trueHourlyRate = effectiveCurrentWage?.trueHourlyRate ?? 0;

      // Fire notifications for processed recurring rules
      if (processedRules.length > 0 && nextNotificationPrefs.recurringAlert.enabled) {
        for (const rule of processedRules) {
          const amountStr = `${nextSettings.currencySymbol}${rule.amount.toFixed(2)}`;
          const hoursStr =
            trueHourlyRate > 0
              ? formatHours(amountToHoursByRate(rule.amount, trueHourlyRate), nextSettings)
              : undefined;
          fireRecurringTransactionNotification(rule.name, amountStr, hoursStr).catch((error) => {
            reportError(error, { scope: 'notifications' });
          });
        }
      }

      const nextAccountGroups = accountGroupsRepository.list();
      const nextRecurringRules = recurringRulesRepository.list();
      const nextAccounts = accountsRepository.list();
      const nextCategories = categoriesRepository.list();
      perfMark('tx_list_start');
      const nextTransactions = transactionsRepository.list();
      perfMark('tx_list');
      const nextAlbums = albumsRepository.list();
      const nextItems = itemsRepository.list();

      // Period-rollover auto-create: materialize the current week's, month's
      // and year's budget from each period's default template. Runs on every
      // load — idempotent (one indexed lookup per period) and tombstone-aware,
      // so a user-deleted period never resurrects.
      const nextRateTable = buildRateTable(
        nextSettings.currencyCode,
        exchangeRatesRepository.listByBase(nextSettings.currencyCode),
      );
      const nextBudgetTemplates = budgetTemplatesRepository.list();
      autoCreateCurrentBudgets(
        nextBudgetTemplates,
        { weekStartsOn: nextSettings.weekStartsOn, monthCycle: monthCycleOf(nextSettings) },
        nextRateTable,
      );
      // A budget an older app version made without its template's currency
      // gets it back, and one made in another currency before any rate was
      // known gets a rate as soon as there is one.
      // Best effort: a failed repair must never stop the app from loading.
      try {
        const rateFor = (currency: string) => budgetRateToFreeze(currency, nextRateTable);
        periodBudgetsRepository.repairDroppedCurrencies(rateFor);
        periodBudgetsRepository.freezeMissingRates(rateFor);
      } catch (error) {
        reportError(error, { scope: 'budget_currency_repair' });
      }
      const nextPeriodBudgets = periodBudgetsRepository.list();

      const nextRawAccountBalances = accountsRepository.getBalances(nextAccounts);
      perfMark('balances');

      // The review reminders deliberately carry no spend figure. A repeating
      // trigger is scheduled once and fires weeks later, so any total baked in
      // here describes the period that had closed when the app was last opened,
      // not the one the notification recaps. On the firing day that is always a
      // full period stale, and "you spent X last week" pointing at the week
      // before last is worse than an invitation with no number in it.
      scheduleReminders(nextNotificationPrefs, {
        weekStartsOn: nextSettings.weekStartsOn,
        firstDayOfMonth: nextSettings.firstDayOfMonth,
      });

      setCurrentMonthWage(effectiveCurrentWage);
      setMonthlyWages(allWages);
      setLedgers(nextLedgers);
      setSettings(nextSettings);
      setRateTable(nextRateTable);
      setInsightsPreferencesJson(nextInsightsPreferencesJson);
      setCalendarPreferencesJson(nextCalendarPreferencesJson);
      setNotificationPrefs(nextNotificationPrefs);
      const nextPaymentAlertPrefs = parsePaymentAlertPrefs(
        settingsRepository.getAutoLogPrefsJson(),
      );
      paymentAlertPrefsRef.current = nextPaymentAlertPrefs;
      setPaymentAlertPrefs(nextPaymentAlertPrefs);
      quickEntryPrefsRef.current = nextQuickEntryPrefs;
      setQuickEntryPrefs(nextQuickEntryPrefs);
      setAccountGroups(nextAccountGroups);
      setRecurringRules(nextRecurringRules);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setTransactions((prev) => reuseUnchangedTransactions(prev, nextTransactions));
      setAlbums(nextAlbums);
      setItems(nextItems);
      setBudgetTemplates(nextBudgetTemplates);
      setPeriodBudgets(nextPeriodBudgets);
      setRawAccountBalances(nextRawAccountBalances);
      setLoadError(null);
    } catch (error) {
      // This is the app's hard-failure path: settings stays null, so the user
      // gets the retry card instead of the app. It swallows migration throws and
      // repository read failures alike, so without an explicit report these are
      // completely invisible in error tracking — the users worst affected are exactly
      // the ones we hear nothing from.
      reportError(error, { scope: 'app_load' });
      setLoadError(getErrorMessage(error, I18n.t('errors.data_load_failed')));
    }
  }, [scheduleReminders]);

  const refreshTransactions = useCallback(() => {
    try {
      const next = transactionsRepository.list();
      setTransactions((prev) => reuseUnchangedTransactions(prev, next));
      setRawAccountBalances(accountsRepository.getBalances());
    } catch (error) {
      reportError(error, { scope: 'refresh_transactions' });
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
  // funnel for restores/resets/imports and recurring-rule edits
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

  // Rule *edits* ride the full refreshAll, which also runs anything they made
  // due. This slice is for the writes that only ever remove rules, where there
  // is nothing to run and a full reload would be wasted work.
  const refreshRecurringRules = useCallback(() => {
    setRecurringRules(recurringRulesRepository.list());
  }, []);

  const refreshAlbums = useCallback(() => {
    setAlbums(albumsRepository.list());
  }, []);

  const refreshBudgets = useCallback(() => {
    setBudgetTemplates(budgetTemplatesRepository.list());
    setPeriodBudgets(periodBudgetsRepository.list());
  }, []);

  const refreshWages = useCallback(() => {
    const allWages = monthlyWageRepository.list();
    setMonthlyWages(allWages);
    setCurrentMonthWage(selectEffectiveCurrentWage(allWages, monthCycleRef.current));
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

  // After a write that knows exactly which rows it changed: re-read those rows
  // and the balances, instead of every transaction in the ledger. On a long
  // history the full reload was most of what froze the screen after an edit.
  // Anything this cannot follow row by row still reloads.
  //
  // Trailing and one per burst, like the reload above. Writes queued in the
  // same JS turn run one after another before any timer, so by the time this
  // reads, each of them has landed. Reading straight after its own write
  // instead saw rows a later write was still about to change or remove:
  // saving a transfer with its fee taken off (an edit that moves the fee, then
  // the fee's delete) put the deleted fee back in the list, and nothing
  // reloads after a plain delete to take it out again.
  const reconcileIdsRef = useRef<Set<string> | null>(null);
  const reconcileStoredTransactions = useCallback(
    (ids: string[]) => {
      // A reload on its way reads these rows too.
      if (refreshTransactionsScheduled.current) return;
      const queued = reconcileIdsRef.current;
      if (queued) {
        ids.forEach((id) => queued.add(id));
        return;
      }
      const pending = new Set(ids);
      reconcileIdsRef.current = pending;
      setTimeout(() => {
        reconcileIdsRef.current = null;
        if (refreshTransactionsScheduled.current) return;
        if (pending.size > RECONCILE_ROW_LIMIT) {
          scheduleRefreshTransactions();
          return;
        }
        try {
          const touched = [...pending];
          const stored = transactionsRepository.listByIds(touched);
          setTransactions((prev) => reconcileTransactionRows(prev, touched, stored));
          setRawAccountBalances(accountsRepository.getBalances());
        } catch {
          scheduleRefreshTransactions();
        }
      }, 0);
    },
    [scheduleRefreshTransactions],
  );

  useEffect(() => {
    perfMark('data_load_start');
    setIsLoading(true);
    try {
      refreshAll();
    } finally {
      setIsLoading(false);
      perfMark('data_load_end');
    }
  }, [refreshAll]);

  // Heal a load that failed while the app was not on screen.
  //
  // iOS launches this app in the background for the auto-backup task, and a
  // background launch can land in a window where the database is simply not
  // readable: every statement fails with SQLITE_IOERR ("disk I/O error") for
  // as long as the condition lasts, which is why the retries inside
  // `applyPragmas` and `readUserVersion` never helped — they give it ~630ms,
  // and the three of them failed together in the same second on every report
  // (Sentry MONEY2TIME-2G, MONEY2TIME-2H, MONEY2TIME-2S, all iOS, all with
  // the app in the background).
  //
  // That left `settings` null and the retry card rendered. The JS context
  // survives into the foreground, so the user's next tap on the app icon
  // resumed straight onto "couldn't load your data" — with a database that
  // had been readable again for hours and a Retry button that would have
  // worked on the first press. Retrying on `active` makes that self-healing.
  //
  // Deliberately keyed on `loadError`: a load that failed while the app was
  // already on screen keeps its retry card (the user is right there, and an
  // automatic retry loop behind a visible error is worse than a button), and
  // once a load succeeds this unsubscribes entirely.
  useEffect(() => {
    if (!loadError) return;
    const sub = RNAppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      setIsLoading(true);
      try {
        refreshAll();
      } finally {
        setIsLoading(false);
      }
    });
    return () => {
      sub.remove();
    };
  }, [loadError, refreshAll]);

  // One-time historical cleanup of orphaned user-asset files left by older app
  // versions that didn't delete images on delete/reset/import. Those otherwise
  // ride along in every backup forever (the backup walks the asset folder
  // wholesale), which is the main driver of ever-growing backup sizes. Going
  // forward the per-event cleanup below keeps things tidy, so this no-ops after
  // its first successful run — no routine every-launch sweep. Deferred off the
  // startup critical path; runs after the load effect so the DB is initialized.
  useEffect(() => {
    runDeferredWrite(() => {
      void runUserAssetGcBackfillOnce();
    });
  }, []);

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
      transactions.map((transaction) => [transaction.id, transactionSearchText(transaction)]),
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
      void trackEvent(AnalyticsEvents.ACCOUNT_CREATED, {
        type: input.type,
        // How a new credit card's bill falls due, to see who counts it in days.
        ...(input.type === 'credit'
          ? {
              creditDueRule:
                input.creditDueDaysAfterStatement != null ? 'days_after_statement' : 'day_of_month',
            }
          : {}),
      });
      return id;
    },
    [refreshAccountsAndGroups, runMutation],
  );

  const updateAccount = useCallback(
    (id: string, input: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => {
      const before =
        'logoId' in input ||
        'goalEmoji' in input ||
        'goalCoverUri' in input ||
        'cardDesign' in input
          ? accountsRepository.getById(id)
          : null;
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
      if (before) {
        // Compare against the key's presence, not `input.x ?? before.x`: a
        // deliberate clear writes null, and `null ?? previous` reads back as
        // "unchanged", which would skip the sweep for the one edit that most
        // needs it.
        if ('logoId' in input) sweepIfCustomAssetDropped(before.logoId, input.logoId);
        if ('goalEmoji' in input) sweepIfCustomAssetDropped(before.goalEmoji, input.goalEmoji);
        if ('cardDesign' in input) sweepIfCustomAssetDropped(before.cardDesign, input.cardDesign);
        // A goal's cover photo is owned outright by that one goal — it never
        // comes from a shared picker library the way logos and icons do — so a
        // replace or clear can unlink it directly instead of paying for the
        // reference-counted sweep.
        if ('goalCoverUri' in input && before.goalCoverUri !== input.goalCoverUri) {
          deleteGoalCover(before.goalCoverUri);
        }
      }
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
    ): number | null => {
      const acct = accounts.find((a) => a.id === accountId);
      if (!acct) return null;
      const balanceNow = () =>
        accountsRepository.getBalances().find((b) => b.accountId === accountId)?.balance ?? null;
      if (acct.currency === toCurrency) {
        updateAccount(accountId, { ...otherUpdates, currency: toCurrency });
        return balanceNow();
      }
      // Resolve the rate from a freshly-built table (the in-memory one can be
      // stale right after a restore/import) so the lump conversion actually
      // applies an exchange rate rather than silently relabelling.
      const reporting = reportingCurrencyRef.current;
      const freshTable = buildRateTable(reporting, exchangeRatesRepository.listByBase(reporting));
      const rate = resolveRate(acct.currency, toCurrency, freshTable) ?? 1;
      // A savings goal's target must move with the balance it is measured
      // against, or the progress ratio distorts and a false achievement can
      // stamp. An explicit goalTargetAmount in otherUpdates (the goal editor
      // converts in the input field) wins over the lump conversion.
      const goalTargetUpdate =
        acct.type === 'goal' &&
        otherUpdates.goalTargetAmount == null &&
        acct.goalTargetAmount != null
          ? { goalTargetAmount: normalizeMoneyAmount(acct.goalTargetAmount * rate) }
          : {};
      // Same for a loan's money fields: the principal anchors the progress bar
      // and the repayment drives the payoff projection, so both have to move
      // with the balance. An explicit value in otherUpdates (the account
      // editor converts its inputs in place) wins over the lump conversion.
      const loanAmountUpdates =
        acct.type === 'loan'
          ? {
              ...(otherUpdates.loanOriginalPrincipal == null && acct.loanOriginalPrincipal != null
                ? {
                    loanOriginalPrincipal: normalizeMoneyAmount(acct.loanOriginalPrincipal * rate),
                  }
                : {}),
              ...(otherUpdates.loanMonthlyPayment == null && acct.loanMonthlyPayment != null
                ? { loanMonthlyPayment: normalizeMoneyAmount(acct.loanMonthlyPayment * rate) }
                : {}),
            }
          : {};
      runMutation(
        () => {
          accountsRepository.update(accountId, {
            ...otherUpdates,
            ...goalTargetUpdate,
            ...loanAmountUpdates,
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
      // This path writes through the repository rather than `updateAccount`, so
      // it has to repeat that function's cover-photo cleanup: a save that
      // changes the currency *and* swaps the photo would otherwise leave the old
      // file on disk, where it rides along in every backup until some unrelated
      // event happens to trigger a sweep.
      if ('goalCoverUri' in otherUpdates && acct.goalCoverUri !== otherUpdates.goalCoverUri) {
        deleteGoalCover(acct.goalCoverUri);
      }
      if ('cardDesign' in otherUpdates) {
        sweepIfCustomAssetDropped(acct.cardDesign, otherUpdates.cardDesign);
      }
      // Read once the write has committed and refreshed, so a failure here
      // cannot report a saved change as failed.
      return balanceNow();
    },
    [accounts, refreshAccountsAndGroups, refreshTransactions, runMutation, updateAccount],
  );

  const deleteAccount = useCallback(
    (id: string) => {
      // Custom account logos are shared — the same file can be assigned to
      // several accounts via the picker — so it can't be deleted outright. Run
      // the reference-aware GC, which reclaims it only if no live account still
      // uses it. Skip entirely for built-in logos (nothing to reclaim).
      const account = accountsRepository.getById(id);
      // A savings goal's icon lives in the same uploaded-icon library, so a
      // goal account can hold a custom ref in goal_emoji as well as logo_id.
      const hadCustomLogo =
        isCustomLogoId(account?.logoId) ||
        isCustomLogoId(account?.goalEmoji) ||
        isCustomLogoId(account?.cardDesign);
      // A goal's cover photo is not shared, but it is reclaimed through the same
      // sweep rather than unlinked here: the soft-delete has already run by the
      // time this fires, so the row no longer counts as a live reference.
      const hadGoalCover = account?.goalCoverUri != null;
      runMutation(
        () => {
          accountsRepository.softDelete(id);
        },
        {
          refresh: () => {
            // refreshTransactions also re-reads balances — skip the duplicate.
            refreshAccountsAndGroups({ withBalances: false });
            refreshTransactions();
            // Deleting an account takes its recurring rules with it (a loan's
            // auto-repayment, a subscription paid from the card being closed),
            // so those have to be re-read too. Without this they lived on in
            // memory as rows nothing could remove: Settings -> Recurring went
            // on listing a deleted loan's repayment and counting it in the
            // monthly commitment until something forced a full reload.
            refreshRecurringRules();
          },
        },
      );
      if (hadCustomLogo || hadGoalCover) runDeferredWrite(() => runUserAssetGc());
      void trackEvent(AnalyticsEvents.ACCOUNT_DELETED);
    },
    [refreshAccountsAndGroups, refreshRecurringRules, refreshTransactions, runMutation],
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

  const setGoalArchived = useCallback(
    (accountId: string, archived: boolean) => {
      // Archiving must also stop auto-saves: rules keep firing regardless of
      // visibility, so a hidden goal would keep pulling money in. Rule writes
      // ride the default refreshAll (the recurring-rule pattern).
      runMutation(() => {
        accountsRepository.update(accountId, { goalArchivedAt: archived ? nowIso() : null });
        if (archived) recurringRulesRepository.deactivateTransfersInto(accountId);
      });
      void trackEvent(archived ? AnalyticsEvents.GOAL_ARCHIVED : AnalyticsEvents.GOAL_UNARCHIVED);
    },
    [runMutation],
  );

  const setLoanArchived = useCallback(
    (accountId: string, archived: boolean) => {
      // Archiving must also stop auto-repayments: rules keep firing regardless
      // of visibility, so a hidden loan would keep pulling money out. Rule
      // writes ride the default refreshAll (the recurring-rule pattern).
      runMutation(() => {
        // Unarchiving clears the generic stamp too, so a loan that carries one
        // (say, from a restored or synced row) cannot stay hidden for good.
        accountsRepository.update(
          accountId,
          archived ? { loanArchivedAt: nowIso() } : { loanArchivedAt: null, archivedAt: null },
        );
        if (archived) recurringRulesRepository.deactivateTransfersInto(accountId);
      });
      void trackEvent(archived ? AnalyticsEvents.LOAN_ARCHIVED : AnalyticsEvents.LOAN_UNARCHIVED);
    },
    [runMutation],
  );

  const setAccountArchived = useCallback(
    (accountId: string, archived: boolean) => {
      // Rules keep firing regardless of visibility, so archiving pauses the
      // ones touching the account; un-archiving leaves them paused for the
      // user to turn back on, as with goals and loans. Rule writes ride the
      // default refreshAll (the recurring-rule pattern).
      runMutation(() => {
        accountsRepository.update(accountId, { archivedAt: archived ? nowIso() : null });
        if (archived) recurringRulesRepository.deactivateRulesForAccount(accountId);
      });
      void trackEvent(
        archived ? AnalyticsEvents.ACCOUNT_ARCHIVED : AnalyticsEvents.ACCOUNT_UNARCHIVED,
      );
    },
    [runMutation],
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
        // Report the same cadence as the list/editor infer from the saved schedule.
        // The original picker choice is not persisted (quarterly x2 is semi-annual).
        pattern: recurrenceFrequencyOf(input.recurrencePattern, input.recurrenceInterval ?? 1)
          .frequency,
        // A transfer rule that also writes a fee on every run.
        has_fee: input.type === 'transfer' && (input.feeAmount ?? 0) > 0,
      });
    },
    [runMutation],
  );

  const updateRecurringRule = useCallback(
    (id: string, updates: Partial<CreateRecurringRuleInput>) => {
      runMutation(() => {
        recurringRulesRepository.update(id, updates);
      });
      // Only the recurring editor saves the fee; other edits (a goal's
      // auto-save, a loan's repayment, the Web Dashboard) leave it alone.
      void trackEvent(
        AnalyticsEvents.RECURRING_RULE_UPDATED,
        'feeAmount' in updates
          ? { has_fee: updates.type === 'transfer' && (updates.feeAmount ?? 0) > 0 }
          : undefined,
      );
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
      const before = 'icon' in updates ? categoriesRepository.getById(id) : null;
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
      // `before` is only read when the key is present, so pass the new value
      // straight through rather than coalescing a deliberate clear away.
      if (before) sweepIfCustomAssetDropped(before.icon, updates.icon);
    },
    [refreshCategories, refreshTransactions, runMutation],
  );

  const deleteCategory = useCallback(
    (id: string, options?: { reassignToCategoryId?: string }) => {
      // Children are promoted rather than deleted, so only this row's icon can
      // lose its last reference here.
      const hadCustomIcon = isCustomLogoId(categoriesRepository.getById(id)?.icon);
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
          periodBudgetsRepository.removeCategoryFromAllBudgets(id);
        },
        {
          refresh: () => {
            refreshCategories();
            refreshTransactions();
            refreshBudgets();
          },
        },
      );
      if (hadCustomIcon) runDeferredWrite(() => runUserAssetGc());
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
      // An album's cover is uniquely owned (each pick writes a fresh file), so
      // it can be deleted outright — no other album references it.
      const cover = albumsRepository.getById(id)?.coverPhotoUri;
      runMutation(
        () => {
          albumsRepository.softDelete(id);
        },
        { refresh: refreshAlbums },
      );
      if (cover) deleteAlbumCover(cover);
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

  const setAlbumPeople = useCallback((albumId: string, people: AlbumPerson[]) => {
    albumsRepository.update(albumId, {
      splitWithJson: people.length ? JSON.stringify(people) : null,
    });
    setAlbums(albumsRepository.list());
    void trackEvent(AnalyticsEvents.ALBUM_PEOPLE_SET, { count: people.length });
  }, []);

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
      { name: string; icon: string; parentId: string | null; parentName: string | null }
    >();

    categories.forEach((category) => {
      const parent = category.parentId ? categoryByIdMap.get(category.parentId) : null;
      relationInfoById.set(category.id, {
        name: category.name,
        icon: resolveCategoryIcon(category.icon, parent?.icon ?? null),
        parentId: category.parentId ?? null,
        parentName: parent?.name ?? null,
      });
    });

    return relationInfoById;
  }, [categories, categoryByIdMap]);

  const resolveRelationNames = useCallback(
    (input: Partial<CreateTransactionInput>) => {
      const findAccount = (id?: string | null) => (id ? (accountNameById.get(id) ?? null) : null);
      const findCategory = (id?: string | null) => {
        if (!id) return { name: null, icon: null, parentId: null, parentName: null };
        const relationInfo = categoryRelationInfoById.get(id);
        if (!relationInfo) return { name: null, icon: null, parentId: null, parentName: null };
        return {
          name: relationInfo.name,
          icon: relationInfo.icon,
          parentId: relationInfo.parentId,
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
        categoryParentId: catInfo.parentId,
        categoryParentName: catInfo.parentName,
        // Joined from a plan on load; a row made here is never a plan's
        // payment. Present so the stored row reconciles with this one.
        instalmentCount: null,
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

  // Scan history before optimistic inserts, but claim activation only after a
  // save succeeds. A failed save must leave the next successful entry eligible.
  const firstEntrySignalRef = useRef<ReturnType<typeof createFirstTransactionSignal> | null>(null);
  const prepareFirstEntry = useCallback((type: CreateTransactionInput['type']): (() => boolean) => {
    firstEntrySignalRef.current ??= createFirstTransactionSignal();
    return firstEntrySignalRef.current.prepare(type, transactionsRef.current);
  }, []);

  /** Whether a transfer moves money between accounts of different currencies. */
  const transferIsCrossCurrency = useCallback(
    (transfer: { fromAccountId?: string | null; toAccountId?: string | null }) =>
      !!transfer.fromAccountId &&
      !!transfer.toAccountId &&
      accountCurrencyOf(transfer.fromAccountId) !== accountCurrencyOf(transfer.toAccountId),
    [accountCurrencyOf],
  );

  /**
   * Writes a transfer fee's new expense row (`planTransferFeeWrite`'s create)
   * right under its transfer: a millisecond older (`createdAt`), or a step
   * below a dragged transfer (`dayOrder`). Shown at once; the write waits for
   * the transfer's own, and is dropped if the transfer never landed.
   */
  const insertTransferFeeRow = useCallback(
    (input: CreateTransactionInput, createdAt: string, dayOrder: number | null) => {
      const transferId = input.feeOfId;
      if (!transferId) return;
      const amount = normalizeMoneyAmount(input.amount);
      const snapshot = buildSnapshot('expense', amount, input.currency, false);
      const id = newId();
      const now = nowIso();
      const normalizedInput = withEntryStamp(
        {
          ...input,
          amount,
          reportingCurrency: snapshot.reportingCurrency,
          reportingAmount: snapshot.reportingAmount,
          fxRate: snapshot.fxRate,
          toAmount: null,
          // Always in the paying account's own currency.
          accountAmount: null,
          receiptUri: null,
        },
        getActiveLedgerId(),
      );
      const optimistic: TransactionWithRelations = {
        id,
        instalmentRuleId: null,
        instalmentNumber: null,
        type: 'expense',
        amount,
        currency: normalizedInput.currency,
        reportingCurrency: normalizedInput.reportingCurrency ?? null,
        reportingAmount: normalizedInput.reportingAmount ?? null,
        fxRate: normalizedInput.fxRate ?? null,
        toAmount: null,
        accountAmount: null,
        date: normalizedInput.date,
        accountId: normalizedInput.accountId ?? null,
        fromAccountId: null,
        toAccountId: null,
        categoryId: normalizedInput.categoryId ?? null,
        note: normalizedInput.note ?? null,
        details: null,
        receiptUri: null,
        sentiment: 'neutral',
        reimbursable: false,
        reimbursedAt: null,
        reimbursementAccountId: null,
        reimbursementTransactionId: null,
        reimbursementOfId: null,
        countsAsExpense: false,
        feeOfId: transferId,
        dayOrder,
        createdBy: normalizedInput.createdBy,
        memberId: normalizedInput.memberId,
        albumGroupId: null,
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames(normalizedInput),
      };
      setTransactions((prev) => insertTransactionsByDateDesc(prev, [optimistic]));
      runDeferredWrite(() => {
        try {
          // The transfer's write ran first; without it the fee has no transfer.
          if (!transactionsRepository.getById(transferId)) {
            setTransactions((prev) => prev.filter((tx) => tx.id !== id));
            return;
          }
          transactionsRepository.createWithId(id, normalizedInput, now, createdAt);
          if (dayOrder != null) transactionsRepository.update(id, { dayOrder });
          // A fee follows its transfer into the active album, as a trip's
          // costs should.
          const activeAlbumId = albumsRepository.getActiveId();
          if (
            activeAlbumId &&
            albumsRepository.getTransactionIds(activeAlbumId).includes(transferId)
          ) {
            albumsRepository.addTransactions(activeAlbumId, [id]);
            setAlbums(albumsRepository.list());
          }
          const persisted = transactionsRepository.getById(id);
          setTransactions((prev) => reconcileTransactionRow(prev, id, persisted));
        } catch (error) {
          setTransactions((prev) => prev.filter((tx) => tx.id !== id));
          reportError(error, { scope: 'transfer_fee_create' });
        }
        refreshAccountBalances();
      });
    },
    [buildSnapshot, refreshAccountBalances, resolveRelationNames],
  );

  const createTransaction = useCallback(
    (input: CreateTransactionInput, meta?: CreateTransactionMeta) => {
      const claimFirstEntry = prepareFirstEntry(input.type);
      // Local review validates currency precision before this synchronous save.
      const normalizedAmount =
        meta?.source === 'notification_review' ? input.amount : normalizeMoneyAmount(input.amount);
      const snapshot = buildSnapshot(
        input.type,
        normalizedAmount,
        input.currency,
        input.countsAsExpense ?? false,
      );
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
      const id = newId();
      const now = nowIso();
      // Stamped here, not only at the insert, so the optimistic row already
      // shows who added it in a shared ledger.
      const normalizedInput = withEntryStamp(
        {
          ...input,
          amount: normalizedAmount,
          date: dateForNewTransaction(input.date, new Date(now)),
          reportingCurrency: input.reportingCurrency ?? snapshot.reportingCurrency,
          reportingAmount: input.reportingAmount ?? snapshot.reportingAmount,
          fxRate: input.fxRate ?? snapshot.fxRate,
          toAmount: input.toAmount ?? null,
          accountAmount: computedAccountAmount,
          receiptUri: input.receiptUri ?? null,
        },
        getActiveLedgerId(),
      );
      const optimistic: TransactionWithRelations = {
        id,
        instalmentRuleId: null,
        instalmentNumber: null,
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
        details: normalizedInput.details ?? null,
        receiptUri: normalizedInput.receiptUri ?? null,
        sentiment: normalizedInput.sentiment ?? 'neutral',
        reimbursable: normalizedInput.reimbursable ?? false,
        reimbursedAt: normalizedInput.reimbursedAt ?? null,
        reimbursementAccountId: normalizedInput.reimbursementAccountId ?? null,
        reimbursementTransactionId: normalizedInput.reimbursementTransactionId ?? null,
        reimbursementOfId: normalizedInput.reimbursementOfId ?? null,
        countsAsExpense: normalizedInput.countsAsExpense ?? false,
        feeOfId: normalizedInput.feeOfId ?? null,
        dayOrder: null,
        createdBy: normalizedInput.createdBy,
        memberId: normalizedInput.memberId,
        albumGroupId: null,
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames(normalizedInput),
      };
      if (meta?.source === 'autolog') {
        const nextPrefs = persistAutoLogTransaction(
          {
            isPro: meta.autoLogIsPro ?? false,
            accounts,
            prefs: quickEntryPrefsRef.current,
            inSharedLedger: openLedgerSharedAndActive(),
          },
          {
            transaction: (write) => getSQLite().withTransactionSync(write),
            create: () => transactionsRepository.createWithId(id, normalizedInput, now),
            record: () => meta.onAutoLogPersisted?.(id),
            savePrefs: (next) => settingsRepository.updateQuickEntryPrefsJson(JSON.stringify(next)),
          },
        );
        quickEntryPrefsRef.current = nextPrefs;
        setQuickEntryPrefs(nextPrefs);
      }
      if (meta?.source === 'notification_review') {
        // Explicit review is a manual save: no scanner or auto-log allowance.
        getSQLite().withTransactionSync(() => {
          transactionsRepository.createWithId(id, normalizedInput, now);
          meta.onNotificationReviewPersisted?.(id);
        });
      }
      setTransactions((prev) => insertTransactionsByDateDesc(prev, [optimistic]));
      const feeWrite =
        meta?.transferFee && normalizedInput.type === 'transfer'
          ? planTransferFeeWrite({
              transfer: {
                id,
                date: normalizedInput.date,
                fromAccountId: normalizedInput.fromAccountId ?? null,
                toAccountId: normalizedInput.toAccountId ?? null,
                memberId: normalizedInput.memberId,
              },
              draft: meta.transferFee,
              existing: null,
              currencyOf: (accountId) =>
                accountCurrencyOf(accountId) ?? reportingCurrencyRef.current,
              note: I18n.t('transactions.editor.transfer_fee.row_note'),
            })
          : null;
      runDeferredWrite(() => {
        try {
          if (meta?.source !== 'autolog' && meta?.source !== 'notification_review') {
            // The ledger this was drafted in may be gone since (see the error).
            assertInOpenLedger(normalizedInput);
            transactionsRepository.createWithId(id, normalizedInput, now);
          }
          // Auto-file into the active album, if one is set.
          const activeAlbumId = albumsRepository.getActiveId();
          if (activeAlbumId) {
            albumsRepository.addTransactions(activeAlbumId, [id]);
            // Reload albums so the album stats re-read the member lists, which
            // now include the auto-added transaction.
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
          // `has_category` here measures whether the user answered the intent's
          // category prompt or let it fall through to their default.
          if (meta?.source === 'autolog' || meta?.source === 'notification_review') {
            void trackEvent(AnalyticsEvents.AUTOLOG_TRANSACTION_CREATED, {
              has_category: !!normalizedInput.categoryId,
              has_note: !!(normalizedInput.note && normalizedInput.note.trim()),
              channel: meta.channel ?? 'apple_pay',
              decision: meta.decision ?? 'auto',
            });
          }
          if (claimFirstEntry()) {
            void trackEvent(AnalyticsEvents.FIRST_TRANSACTION_CREATED, {
              type: normalizedInput.type,
              source: meta?.source ?? 'manual',
            });
          }
          if (isLoggedEntryType(normalizedInput.type) && meta?.source !== 'statement_import') {
            void recordLoggedTransaction({
              type: normalizedInput.type,
              source: meta?.source ?? 'manual',
            });
          }
          recordTransactionLogged();
          // Reconcile only the inserted row. A full refreshTransactions here
          // would re-read the whole table and replace every row identity,
          // re-rendering all transaction consumers (calendar, insights) with
          // their row-level memoization defeated — the main JS-thread stall
          // felt right after Save in bulk create mode.
          const persisted = transactionsRepository.getById(id);
          setTransactions((prev) => reconcileTransactionRow(prev, id, persisted));
        } catch (error) {
          if (meta?.source === 'autolog' || meta?.source === 'notification_review') {
            // The expense is already committed; a failed album or UI refresh
            // must not erase it or make the native drain retry the payment.
            reportError(error, { scope: 'autolog_after_save' });
          } else {
            setTransactions((prev) => prev.filter((tx) => tx.id !== id));
            if (error instanceof EntryLedgerGoneError) {
              Alert.alert(I18n.t('ledgers.entry_ledger_gone'));
            }
          }
        }
        refreshAccountBalances();
      });
      if (feeWrite?.kind === 'create') {
        insertTransferFeeRow(feeWrite.input, transferFeeCreatedAt(now), null);
        void trackEvent(AnalyticsEvents.TRANSFER_FEE_ADDED, {
          side: meta?.transferFee?.side ?? 'from',
          cross_currency: transferIsCrossCurrency(normalizedInput),
        });
      }
      return id;
    },
    [
      accountCurrencyOf,
      accounts,
      buildSnapshot,
      insertTransferFeeRow,
      prepareFirstEntry,
      refreshAccountBalances,
      resolveRelationNames,
      transferIsCrossCurrency,
    ],
  );

  const updateTransactionsBulk = useCallback(
    (
      requested: { id: string; input: Partial<CreateTransactionInput> }[],
      options?: {
        /**
         * Runs once the deferred write has landed (or found nothing to write),
         * told whether it was stored: work that must build on the saved rows.
         */
        afterWrite?: (stored: boolean) => void;
      },
    ) => {
      const afterWrite = options?.afterWrite;
      if (requested.length === 0) {
        if (afterWrite) runDeferredWrite(() => afterWrite(true));
        return;
      }
      const transactionById = new Map(
        transactionsRef.current.map((transaction) => [transaction.id, transaction]),
      );
      // A transfer's fee keeps its day, its place under the transfer and the
      // side that paid it: a new date (the editor, bulk edit, the Web
      // Dashboard), a drag or a new account on the fee's side moves the fee
      // with it, unless the same call moves the fee itself.
      const feeByTransferId = indexTransferFees(transactionsRef.current);
      const updates = [...requested];
      if (feeByTransferId.size > 0) {
        const requestedIds = new Set(requested.map((update) => update.id));
        requested.forEach(({ id, input }) => {
          const fee = feeByTransferId.get(id);
          if (!fee || requestedIds.has(fee.id)) return;
          const follow: Partial<CreateTransactionInput> = {};
          if (typeof input.date === 'string') follow.date = input.date;
          if ('dayOrder' in input) follow.dayOrder = transferFeeDayOrder(input.dayOrder ?? null);
          if (input.type !== undefined && input.type !== 'transfer') {
            // Re-typed as an expense or income, the row has no fee any more:
            // the fee stays, as the plain expense it always was.
            follow.feeOfId = null;
          } else {
            const transfer = transactionById.get(id);
            const sideKey =
              transfer && transferFeeSideOf(transfer, fee) === 'to'
                ? 'toAccountId'
                : 'fromAccountId';
            const nextAccountId = input[sideKey];
            const nextAccount = nextAccountId
              ? accounts.find((account) => account.id === nextAccountId)
              : null;
            // A loan cannot pay one; the fee then stays where it was.
            if (
              transfer &&
              nextAccountId &&
              nextAccountId !== fee.accountId &&
              canChargeTransferFee(nextAccount)
            ) {
              follow.accountId = nextAccountId;
              // The fee's charge is in its current account's currency, which
              // differs from the currency it was entered in once that account
              // changed currency (`transferFeeAccountAmount`).
              const feeCurrency =
                (fee.accountId ? accountCurrencyOf(fee.accountId) : null) ?? fee.currency;
              if (nextAccount && nextAccount.currency === fee.currency) {
                // Back in the currency it was entered in: its own amount, exact.
                if (fee.accountAmount != null) follow.accountAmount = null;
              } else if (nextAccount && nextAccount.currency !== feeCurrency) {
                // The same charge in the new account's currency, not the same
                // number in another currency.
                follow.currency = nextAccount.currency;
                follow.amount = convert(
                  transferFeeAccountAmount(fee),
                  feeCurrency,
                  nextAccount.currency,
                  rateTableRef.current,
                ).value;
              }
            }
          }
          if (Object.keys(follow).length > 0) updates.push({ id: fee.id, input: follow });
        });
      }
      const normalizedUpdates: { id: string; input: Partial<CreateTransactionInput> }[] = [];
      const relationById = new Map<string, ReturnType<typeof resolveRelationNames>>();
      const inputById = new Map<string, Partial<CreateTransactionInput>>();
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
        // Date pickers (the editor, bulk edit) hand over a bare day. The row
        // keeps its own time on it, so an edit never moves it within its day.
        if (typeof normalizedInput.date === 'string' && currentTransaction) {
          const date = dateKeepingTimeOfDay(normalizedInput.date, currentTransaction.date);
          if (date !== normalizedInput.date) normalizedInput = { ...normalizedInput, date };
        }
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
        // A counted repayment stops being one the moment the row is edited into
        // something else: a different type, or a transfer pointed at a different
        // account. Left standing, the stale stamp would keep the row in expense
        // totals with nothing on screen to explain why. An explicit
        // `countsAsExpense` in the input is the caller's decision and wins.
        if (
          currentTransaction?.countsAsExpense &&
          !('countsAsExpense' in normalizedInput) &&
          (('type' in normalizedInput && normalizedInput.type !== 'transfer') ||
            ('toAccountId' in normalizedInput &&
              normalizedInput.toAccountId !== currentTransaction.toAccountId))
        ) {
          normalizedInput = { ...normalizedInput, countsAsExpense: false };
        }
        // A caller that says nothing about the count but carries
        // `categoryId: null` (a transfer save from a surface with no category
        // slot) must not strip a counted repayment of the category that files
        // it in the breakdown. The transaction editor now decides both fields
        // together for a transfer, so it never trips this; a row that just
        // stopped being counted falls through, since the clear above set the
        // flag false.
        if (
          currentTransaction?.countsAsExpense &&
          currentTransaction.categoryId &&
          normalizedInput.countsAsExpense !== false &&
          'categoryId' in normalizedInput &&
          normalizedInput.categoryId == null
        ) {
          normalizedInput = { ...normalizedInput, categoryId: currentTransaction.categoryId };
        }
        // Re-freeze the reporting snapshot when the amount or currency changes on
        // a non-transfer transaction (skip when the caller supplied its own).
        // A counted transfer needs one too: the reporting figure is the number
        // every expense total reads.
        const affectsSnapshot =
          ('amount' in normalizedInput || 'currency' in normalizedInput) &&
          !('reportingAmount' in normalizedInput);
        const effectiveType = normalizedInput.type ?? currentTransaction?.type ?? 'expense';
        const effectiveCountsAsExpense =
          'countsAsExpense' in normalizedInput
            ? !!normalizedInput.countsAsExpense
            : !!currentTransaction?.countsAsExpense;
        const isCountedTransferRow = effectiveType === 'transfer' && effectiveCountsAsExpense;
        if (affectsSnapshot && (effectiveType !== 'transfer' || isCountedTransferRow)) {
          const nextAmount = normalizedInput.amount ?? currentTransaction?.amount ?? 0;
          const nextCurrency =
            normalizedInput.currency ??
            currentTransaction?.currency ??
            reportingCurrencyRef.current;
          const snap = buildSnapshot(
            effectiveType,
            nextAmount,
            nextCurrency,
            effectiveCountsAsExpense,
          );
          normalizedInput = {
            ...normalizedInput,
            reportingCurrency: snap.reportingCurrency,
            reportingAmount: snap.reportingAmount,
            fxRate: snap.fxRate,
          };
          // Re-freeze the account-currency value too, unless the caller (the
          // editor) already supplied it.
          // A transfer's amount is intrinsically the from-account's currency, so
          // it never carries a frozen account-currency value — counted or not.
          if (
            !('accountAmount' in normalizedInput) &&
            effectiveType !== 'balance_adjustment' &&
            effectiveType !== 'transfer'
          ) {
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
      if (normalizedUpdates.length === 0) {
        if (afterWrite) runDeferredWrite(() => afterWrite(true));
        return;
      }

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
              updated.categoryParentId = relations.categoryParentId;
              updated.categoryParentName = relations.categoryParentName;
            }
            return updated;
          }),
          'date_desc',
        ),
      );
      runDeferredWrite(() => {
        // The rows this write changed. `reload` is set when it changed rows
        // this list cannot name, and the whole ledger is read again instead.
        const writtenIds = normalizedUpdates.map(({ id }) => id);
        let reload = false;
        let stored = false;
        try {
          transactionsRepository.updateMany(normalizedUpdates, nextUpdatedAt);
          stored = true;
          // Shared ledgers: an entry given to someone else takes its refund
          // and its split paybacks with it (those were stamped from it).
          normalizedUpdates.forEach(({ id, input }) => {
            if (input.memberId !== undefined) {
              transactionsRepository.reassignLinked(id, input.memberId);
              reload = true;
            }
          });
          // An expense and the income row written for its refund are a pair, so
          // an edit that breaks one has to settle the other. Clearing the flag
          // (which is also how the editor handles a re-type to transfer/income)
          // removes the refund and reopens the expense; changing the amount
          // moves the refund with it, or the two stop cancelling and the period
          // shows income that never arrived.
          // Few rows have a refund, so one query finds the ones that do
          // rather than three per row (a bulk edit made hundreds). Asked of
          // the database, after the write: a refund linked earlier in the
          // same turn is stored by now and not yet in the loaded list.
          const refunded = new Set(
            transactionsRepository.idsWithRefund(normalizedUpdates.map(({ id }) => id)),
          );
          normalizedUpdates.forEach(({ id, input }) => {
            if (!refunded.has(id)) return;
            const current = transactionsRepository.getById(id);
            const refundId = current?.reimbursementTransactionId;
            if (!refundId) return;
            if (input.reimbursable === false) {
              transactionsRepository.softDelete(refundId);
              transactionsRepository.update(id, {
                reimbursedAt: null,
                reimbursementAccountId: null,
                reimbursementTransactionId: null,
              });
              reload = true;
              return;
            }
            if (input.amount === undefined && input.currency === undefined) return;
            transactionsRepository.update(refundId, {
              amount: current.amount,
              currency: current.currency,
              reportingCurrency: current.reportingCurrency,
              reportingAmount: current.reportingAmount,
              fxRate: current.fxRate,
            });
            writtenIds.push(refundId);
          });
        } catch {
          // rollback on failure
          reload = true;
        }
        if (reload) scheduleRefreshTransactions();
        else reconcileStoredTransactions(writtenIds);
        afterWrite?.(stored);
      });
    },
    [
      accountCurrencyOf,
      accounts,
      buildSnapshot,
      reconcileStoredTransactions,
      scheduleRefreshTransactions,
      resolveCategoryDefaultNote,
      resolveRelationNames,
    ],
  );

  // -------------------------------------------------------------------------
  // Shared albums (README: Album members and shared albums). A shared album's
  // group holds whole bills and the payments between its members; the user's
  // own entries for them are written from the group and never the other way
  // (features/albums/services/albumGroupSync.ts). So everything here writes
  // the group's rows and then lets the entries follow.

  const categoriesRef = useRef<Category[]>(categories);
  categoriesRef.current = categories;

  /** What the open ledger gives a group's entries, or null when the album is not shared here. */
  const groupEnvFor = useCallback(
    (groupId: string): GroupEnv | null => {
      const userId = sharedAlbumFor(groupId)?.userId;
      if (!userId) return null;
      return {
        userId,
        meLabel: I18n.t('transactions.editor.split.me_label'),
        rateTable: rateTableRef.current,
        reportingCurrency: reportingCurrencyRef.current,
        currencyOf: (accountId) => accountCurrencyOf(accountId) ?? null,
        defaultAccountId: pickDefaultAccountId(accountsRef.current),
        defaultPaybackAccountId: pickPaybackAccountId(
          accountsRef.current,
          settingsRef.current?.defaultPaybackAccountId,
        ),
        // Another phone's category by name, then by icon, else the user's "Other".
        categoryIdFor: (name, icon) => {
          const expense = categoriesRef.current.filter((category) => category.type === 'expense');
          const key = name?.trim().toLowerCase();
          const match =
            (key ? expense.find((category) => category.name.trim().toLowerCase() === key) : null) ??
            (icon ? expense.find((category) => category.icon === icon) : null) ??
            findFallbackCategory(categoriesRef.current, 'expense');
          return match?.id ?? null;
        },
      };
    },
    [accountCurrencyOf],
  );

  /** After the group's rows and the entries changed: the screens look again. */
  const afterGroupWrite = useCallback(() => {
    notifyAlbumGroups();
    setAlbums(albumsRepository.list());
    scheduleRefreshTransactions();
  }, [scheduleRefreshTransactions]);

  const syncAlbumGroups = useCallback((): boolean => {
    let changed = false;
    for (const share of listAlbumShares()) {
      const env = groupEnvFor(share.ledgerId);
      if (!env) continue;
      try {
        changed = projectGroup(share.ledgerId, env) || changed;
      } catch (error) {
        reportError(error, { scope: 'album_group_project' });
      }
    }
    notifyAlbumGroups();
    return changed;
  }, [groupEnvFor]);

  const publishAlbumGroup = useCallback(
    (groupId: string) => {
      const env = groupEnvFor(groupId);
      if (!env) return;
      publishAlbumBills(groupId, env);
      projectGroup(groupId, env);
      afterGroupWrite();
    },
    [afterGroupWrite, groupEnvFor],
  );

  const addAlbumMember = useCallback(
    (groupId: string, name: string): PeopleEditError | null => {
      const cleaned = cleanPersonName(name);
      if (!cleaned) return 'blank';
      const members = albumGroupsRepository.listMembers(groupId);
      const key = personNameKey(cleaned);
      if (members.some((member) => personNameKey(member.name) === key)) return 'taken';
      albumGroupsRepository.createMember(groupId, { name: cleaned });
      afterGroupWrite();
      return null;
    },
    [afterGroupWrite],
  );

  const renameAlbumMember = useCallback(
    (groupId: string, memberId: string, name: string): PeopleEditError | null => {
      const cleaned = cleanPersonName(name);
      if (!cleaned) return 'blank';
      const key = personNameKey(cleaned);
      const members = albumGroupsRepository.listMembers(groupId);
      if (members.some((member) => member.id !== memberId && personNameKey(member.name) === key)) {
        return 'taken';
      }
      albumGroupsRepository.updateMember(memberId, { name: cleaned });
      // The shares that name them follow.
      const env = groupEnvFor(groupId);
      if (env) projectGroup(groupId, env);
      afterGroupWrite();
      return null;
    },
    [afterGroupWrite, groupEnvFor],
  );

  const removeAlbumMember = useCallback(
    (groupId: string, memberId: string): boolean => {
      const member = albumGroupsRepository.listMembers(groupId).find((m) => m.id === memberId);
      if (!member || member.userId) return false;
      const named = albumGroupsRepository
        .listExpenses(groupId)
        .some(
          (expense) =>
            !expense.deletedAt &&
            (expense.paidBy === memberId ||
              expense.shares.some((share) => share.memberId === memberId)),
        );
      if (named) return false;
      albumGroupsRepository.softDeleteMember(memberId);
      afterGroupWrite();
      return true;
    },
    [afterGroupWrite],
  );

  const claimAlbumMember = useCallback(
    (groupId: string, memberId: string | null, name: string) => {
      const env = groupEnvFor(groupId);
      if (!env) return;
      const members = albumGroupsRepository.listMembers(groupId);
      if (!selfMember(members, env.userId)) {
        const placeholder = memberId
          ? members.find((member) => member.id === memberId && !member.userId)
          : null;
        if (placeholder) {
          albumGroupsRepository.updateMember(placeholder.id, { userId: env.userId });
        } else {
          // A name of their own; one already taken gets a number.
          const base = cleanPersonName(name) || env.meLabel;
          const taken = new Set(members.map((member) => personNameKey(member.name)));
          let unique = base;
          for (let n = 2; taken.has(personNameKey(unique)); n += 1) unique = `${base} ${n}`;
          albumGroupsRepository.createMember(groupId, { name: unique, userId: env.userId });
        }
      }
      projectGroup(groupId, env);
      afterGroupWrite();
    },
    [afterGroupWrite, groupEnvFor],
  );

  const saveAlbumBill = useCallback(
    (
      groupId: string,
      input: CreateTransactionInput,
      rows: AlbumBillRowInput[],
      existingId?: string,
    ): { id: string; mine: boolean } | null => {
      const env = groupEnvFor(groupId);
      if (!env) return null;
      let members = albumGroupsRepository.listMembers(groupId);
      const self = selfMember(members, env.userId);
      if (!self) return null;
      const billRows: GroupBillRow[] = [];
      for (const row of rows) {
        const amount = Number(row.amount) || 0;
        if (row.isSelf) {
          billRows.push({ memberId: self.id, amount });
          continue;
        }
        // Who the row is: the member it names, else the one of that name,
        // else someone new by that name.
        let member =
          (row.albumMemberId
            ? members.find((m) => m.id === row.albumMemberId && m.id !== self.id)
            : null) ?? memberByName(members, row.personName, self.id);
        if (!member) {
          const base = cleanPersonName(row.personName ?? '') || I18n.t('albums.people.unnamed');
          const taken = new Set(members.map((m) => personNameKey(m.name)));
          let unique = base;
          for (let n = 2; taken.has(personNameKey(unique)); n += 1) unique = `${base} ${n}`;
          member = albumGroupsRepository.createMember(groupId, { name: unique });
          members = [...members, member];
        }
        billRows.push({ memberId: member.id, amount, isPayer: !!row.isPayer });
      }
      const built = billFromRows(billRows, self.id);
      if (!built) return null;
      const id = existingId ?? newId();
      const category = input.categoryId
        ? categoriesRef.current.find((item) => item.id === input.categoryId)
        : null;
      const selfShare = built.shares.find((share) => share.memberId === self.id)?.amount ?? 0;
      const mine = built.paidBy === self.id || selfShare > 0;
      try {
        albumGroupsRepository.upsertExpense({
          id,
          groupId,
          date: dateForNewTransaction(input.date, new Date()),
          note: input.note?.trim() || null,
          amount: built.amount,
          currency: input.currency,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          paidBy: built.paidBy,
          shares: built.shares,
          createdBy: env.userId,
        });
        const entry = {
          accountId: input.accountId ?? null,
          categoryId: input.categoryId ?? null,
          details: input.details ?? null,
          receiptUri: input.receiptUri ?? null,
          sentiment: input.sentiment ?? 'neutral',
        };
        if (existingId) {
          // The fields that are the user's own, on the entry they already have.
          transactionsRepository.update(existingId, {
            categoryId: entry.categoryId,
            details: entry.details,
            receiptUri: entry.receiptUri,
            sentiment: entry.sentiment,
            ...(built.paidBy === self.id && entry.accountId
              ? { accountId: entry.accountId }
              : null),
          });
        }
        projectGroup(groupId, env, { expenseId: id, hints: { entry } });
        void trackEvent(AnalyticsEvents.ALBUM_BILL_SAVED, {
          edit: !!existingId,
          paid_by: built.paidBy === self.id ? 'me' : 'friend',
          people: built.shares.length,
        });
      } catch (error) {
        reportError(error, { scope: 'album_group_save' });
      }
      afterGroupWrite();
      return { id, mine };
    },
    [afterGroupWrite, groupEnvFor],
  );

  const detachAlbumBill = useCallback(
    (transactionId: string) => {
      const tx = transactionsRef.current.find((item) => item.id === transactionId);
      if (!tx?.albumGroupId) return;
      transactionsRepository.update(transactionId, { albumGroupId: null });
      albumGroupsRepository.softDeleteExpense(transactionId);
      afterGroupWrite();
    },
    [afterGroupWrite],
  );

  /** The group's bill a share belongs to, when its album is shared on this phone. */
  const groupBillOf = useCallback((splitId: string) => {
    const tx = transactionsRef.current.find(
      (item) => item.albumGroupId && item.splits?.some((split) => split.id === splitId),
    );
    if (!tx?.albumGroupId || !sharedAlbumFor(tx.albumGroupId)) return null;
    const split = tx.splits?.find((item) => item.id === splitId);
    return split ? { tx, split, groupId: tx.albumGroupId } : null;
  }, []);

  /**
   * A payment on a group's bill: a settlement in the group, from the member
   * who owes to the one who paid, and the user's entry follows from it.
   * `accountId` is the account it moved through here; left out, the share's
   * own.
   */
  const recordGroupPayment = useCallback(
    (
      bill: { tx: TransactionWithRelations; split: TransactionSplit; groupId: string },
      amount: number,
      accountId: string | null | undefined,
    ) => {
      const env = groupEnvFor(bill.groupId);
      if (!env || !(amount > 0)) return;
      const settlementId = newId();
      const payer = billPayer(bill.tx.splits);
      runDeferredWrite(() => {
        try {
          const self = selfMember(albumGroupsRepository.listMembers(bill.groupId), env.userId);
          const other = payer ? payer.albumMemberId : bill.split.albumMemberId;
          if (!self || !other) return;
          albumGroupsRepository.createSettlement({
            id: settlementId,
            groupId: bill.groupId,
            expenseId: bill.tx.id,
            // The user pays the member who paid; anyone else pays the user.
            fromMember: payer ? self.id : other,
            toMember: payer ? other : self.id,
            amount,
            currency: bill.tx.currency,
            date: dayKeyFromDateLocal(new Date()),
            createdBy: env.userId,
          });
          projectGroup(bill.groupId, env, {
            expenseId: bill.tx.id,
            hints:
              accountId === undefined ? {} : { accounts: new Map([[settlementId, accountId]]) },
          });
          void trackEvent(AnalyticsEvents.ALBUM_PAYMENT_RECORDED, {
            direction: payer ? 'paid' : 'received',
          });
        } catch (error) {
          reportError(error, { scope: 'album_group_payment' });
        }
        afterGroupWrite();
      });
    },
    [afterGroupWrite, groupEnvFor],
  );

  /** Undoes a payment on a group's bill: its settlement goes, for everyone. */
  const undoGroupPayment = useCallback(
    (bill: { tx: TransactionWithRelations; groupId: string }, settlementId: string | null) => {
      const env = groupEnvFor(bill.groupId);
      if (!env || !settlementId) return;
      runDeferredWrite(() => {
        try {
          albumGroupsRepository.softDeleteSettlement(settlementId);
          projectGroup(bill.groupId, env, { expenseId: bill.tx.id });
          void trackEvent(AnalyticsEvents.ALBUM_PAYMENT_UNDONE);
        } catch (error) {
          reportError(error, { scope: 'album_group_payment' });
        }
        afterGroupWrite();
      });
    },
    [afterGroupWrite, groupEnvFor],
  );

  /**
   * Deleting a group's bill deletes it for everyone, and deleting the entry
   * one of its payments made (the expense of a part the user paid, the
   * transfer of a payback) undoes that payment. Returns the ids it took: the
   * entries themselves then go as the group's rows say.
   */
  const deleteGroupEntries = useCallback(
    (ids: readonly string[]): Set<string> => {
      const taken = new Set<string>();
      const touched = new Map<string, Set<string>>();
      const touch = (groupId: string, expenseId: string) => {
        const set = touched.get(groupId) ?? new Set<string>();
        set.add(expenseId);
        touched.set(groupId, set);
      };
      for (const id of ids) {
        const tx = transactionsRef.current.find((item) => item.id === id);
        if (tx?.albumGroupId && sharedAlbumFor(tx.albumGroupId)) {
          albumGroupsRepository.softDeleteExpense(id);
          touch(tx.albumGroupId, id);
          taken.add(id);
          continue;
        }
        const bill = transactionsRef.current.find(
          (item) =>
            item.albumGroupId &&
            sharedAlbumFor(item.albumGroupId) &&
            item.splits?.some((split) => split.paidTransactionId === id && split.settlementId),
        );
        const split = bill?.splits?.find((item) => item.paidTransactionId === id);
        if (bill?.albumGroupId && split?.settlementId) {
          albumGroupsRepository.softDeleteSettlement(split.settlementId);
          touch(bill.albumGroupId, bill.id);
          taken.add(id);
        }
      }
      if (!taken.size) return taken;
      for (const [groupId, expenseIds] of touched) {
        const env = groupEnvFor(groupId);
        if (!env) continue;
        try {
          for (const expenseId of expenseIds) projectGroup(groupId, env, { expenseId });
        } catch (error) {
          reportError(error, { scope: 'album_group_delete' });
        }
      }
      afterGroupWrite();
      return taken;
    },
    [afterGroupWrite, groupEnvFor],
  );

  const deleteTransactionsBulk = useCallback(
    // `track: false` for a row removed as part of another edit (a transfer's
    // fee taken off in the editor), which is not a deletion the user asked for.
    (ids: string[], options?: { track?: boolean }) => {
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

      // A shared album's bills and their payments go through the group.
      const groupTaken = deleteGroupEntries(uniqueIds);
      if (groupTaken.size) {
        for (let index = uniqueIds.length - 1; index >= 0; index -= 1) {
          if (groupTaken.has(uniqueIds[index])) uniqueIds.splice(index, 1);
        }
        if (uniqueIds.length === 0) return;
      }

      // A reimbursed expense and the income row written for its refund are two
      // halves of one thing, so deleting the expense takes the refund with it.
      // Deleting the refund on its own instead reopens the expense: the money
      // never arrived, so it goes back to being pending.
      // Rows the user actually asked to delete, counted before the cascade
      // below appends to `uniqueIds`. The analytics event describes the user's
      // action, so a single delete must not report as a bulk one just because
      // it took a linked refund row with it.
      const requestedDeleteCount = uniqueIds.length;
      const reimbursementIdSet = new Set(uniqueIds);
      // A transfer's fee goes with it: the fee was charged on that transfer.
      // Deleting only the fee leaves the transfer as it was.
      transactionsRef.current.forEach((tx) => {
        if (
          isTransferFee(tx) &&
          reimbursementIdSet.has(tx.feeOfId as string) &&
          !reimbursementIdSet.has(tx.id)
        ) {
          uniqueIds.push(tx.id);
        }
      });
      const reopenExpenseIds: string[] = [];
      transactionsRef.current.forEach((tx) => {
        if (reimbursementIdSet.has(tx.id) && tx.reimbursementTransactionId) {
          if (!reimbursementIdSet.has(tx.reimbursementTransactionId)) {
            uniqueIds.push(tx.reimbursementTransactionId);
          }
        }
        if (tx.reimbursementOfId && reimbursementIdSet.has(tx.id)) {
          if (!reimbursementIdSet.has(tx.reimbursementOfId)) {
            reopenExpenseIds.push(tx.reimbursementOfId);
          }
        }
      });

      const idSet = new Set(uniqueIds);
      // Determine which deletions affect splits:
      //   - Deleting a parent expense → cascade-delete its splits.
      //   - Deleting a transfer tx referenced by a paid split → restore the
      //     parent's amount (since the parent was reduced when the split was
      //     marked paid) and mark the split unpaid.
      const parentTxIdsWithSplits = new Set<string>();
      const restoreByParentId = new Map<string, number>(); // parentId → cumulative restore amount
      const reverseSplitMap = new Map<string, string>(); // transferTxId → splitId
      const droppedPayBackParts = new Map<string, string>(); // part split id → bill id
      const payBackRestoreByParentId = new Map<string, number>(); // bill id → back on the Me row
      // parentId → one undone payback, for the rate a bill at 0 is restored at
      const undoneByParentId = new Map<string, ReturnType<typeof undonePaybackOf>>();
      transactionsRef.current.forEach((tx) => {
        if (idSet.has(tx.id) && tx.splits && tx.splits.length > 0) {
          parentTxIdsWithSplits.add(tx.id);
        }
        // A part the user paid a friend back is an expense of its own, cut out
        // of the bill that friend paid. Deleting it puts the part back on what
        // is still owed; once the rest is paid too the bill is settled, so the
        // part just goes with its expense.
        const stillOwesPayer = !!billPayer(tx.splits) && !billPayer(tx.splits)?.paidAt;
        tx.splits?.forEach((s) => {
          if (s.paidTransactionId && idSet.has(s.paidTransactionId) && isPayBackPart(s)) {
            droppedPayBackParts.set(s.id, tx.id);
            if (stillOwesPayer && !idSet.has(tx.id)) {
              const part = s.shareAmount ?? 0;
              restoreByParentId.set(tx.id, (restoreByParentId.get(tx.id) ?? 0) + part);
              payBackRestoreByParentId.set(
                tx.id,
                (payBackRestoreByParentId.get(tx.id) ?? 0) + part,
              );
            }
            return;
          }
          if (s.paidTransactionId && idSet.has(s.paidTransactionId)) {
            reverseSplitMap.set(s.paidTransactionId, s.id);
            restoreByParentId.set(tx.id, (restoreByParentId.get(tx.id) ?? 0) + s.amount);
            if (!undoneByParentId.has(tx.id)) {
              const transferId = s.paidTransactionId;
              undoneByParentId.set(tx.id, {
                share: s.amount,
                transfer: transactionsRef.current.find((other) => other.id === transferId),
              });
            }
          }
        });
      });

      const reopenExpenseIdSet = new Set(reopenExpenseIds);
      setTransactions((prev) =>
        prev
          .filter((tx) => !idSet.has(tx.id))
          .map((tx) => {
            // An expense can need both treatments in one bulk delete (its
            // refund row and a paid split's transfer both going), so reopening
            // is merged in rather than returned early.
            const reopened = reopenExpenseIdSet.has(tx.id)
              ? {
                  reimbursedAt: null,
                  reimbursementAccountId: null,
                  reimbursementTransactionId: null,
                }
              : null;
            if (!tx.splits || tx.splits.length === 0) {
              return reopened ? { ...tx, ...reopened } : tx;
            }
            const restore = restoreByParentId.get(tx.id) ?? 0;
            const backOnSelf = payBackRestoreByParentId.get(tx.id) ?? 0;
            const reopenedSplitIds: string[] = [];
            const updatedSplits = foldReopenedSplits(
              tx.splits
                .filter((s) => !droppedPayBackParts.has(s.id))
                .map((s) =>
                  s.isSelf && backOnSelf > 0
                    ? { ...s, amount: normalizeMoneyAmount(s.amount + backOnSelf) }
                    : s,
                )
                .map((s) => {
                  if (s.paidTransactionId && idSet.has(s.paidTransactionId)) {
                    reopenedSplitIds.push(s.id);
                    return { ...s, paidAt: null, paidTransactionId: null };
                  }
                  return s;
                }),
              reopenedSplitIds,
              nowIso(),
            );
            return {
              ...tx,
              ...reopened,
              ...(restore > 0
                ? rescaleSplitAdjustedAmounts(tx, tx.amount + restore, () =>
                    splitRestoreRates(
                      tx,
                      rateTableRef.current,
                      accountCurrencyOf,
                      undoneByParentId.get(tx.id),
                    ),
                  )
                : null),
              splits: updatedSplits,
              splitsSummary: summarizeSplits(updatedSplits),
            };
          }),
      );
      // A deleted transaction's receipt image is no longer referenced by any
      // live row, so its file should be reclaimed — otherwise it lingers on disk
      // and rides along in every backup forever.
      const deletedHadReceipt = transactionsRef.current.some(
        (tx) => idSet.has(tx.id) && !!tx.receiptUri,
      );
      // With no split or refund to put back, the rows taken out above are the
      // whole change, so only the balances need reading again.
      const removedRowsOnly =
        parentTxIdsWithSplits.size === 0 &&
        restoreByParentId.size === 0 &&
        droppedPayBackParts.size === 0 &&
        reopenExpenseIds.length === 0;
      runDeferredWrite(() => {
        let reload = !removedRowsOnly;
        try {
          transactionsRepository.softDeleteMany(uniqueIds);
          if (parentTxIdsWithSplits.size > 0) {
            transactionSplitsRepository.softDeleteByTransactionIds(
              Array.from(parentTxIdsWithSplits),
            );
          }
          // Cascade any itemized receipt-split detail (no-op when none exists).
          receiptSplitsRepository.softDeleteByTransactionIds(uniqueIds);
          // Keep internal duplicate records consistent when a transaction is deleted.
          try {
            paymentAlertCapturesRepository.markTransactionsDeleted(uniqueIds);
          } catch (error) {
            reportError(error, { scope: 'payment_alerts_delete' });
          }
          // Restore parent amounts in one update per parent (re-read from DB so
          // multiple restored splits per parent accumulate correctly).
          // One transaction, as markSplitUnpaid: restoring the expense,
          // reopening the shares and folding part payments back belong together.
          getSQLite().withTransactionSync(() => {
            restoreByParentId.forEach((restore, parentId) => {
              const currentParent = transactionsRepository.getById(parentId);
              if (!currentParent) return;
              transactionsRepository.update(
                parentId,
                rescaleSplitAdjustedAmounts(currentParent, currentParent.amount + restore, () =>
                  splitRestoreRates(
                    currentParent,
                    rateTableRef.current,
                    accountCurrencyOf,
                    undoneByParentId.get(parentId),
                  ),
                ),
              );
            });
            reverseSplitMap.forEach((splitId) => {
              transactionSplitsRepository.markUnpaid(splitId);
            });
            // The parts the user paid a friend go with their expense, and what
            // they covered is owed again on the bill's Me row.
            droppedPayBackParts.forEach((_billId, partId) => {
              transactionSplitsRepository.softDelete(partId);
            });
            payBackRestoreByParentId.forEach((amount, billId) => {
              const self = transactionSplitsRepository
                .listByTransactionId(billId)
                .find((row) => row.isSelf);
              if (self) {
                transactionSplitsRepository.update(self.id, {
                  amount: normalizeMoneyAmount(self.amount + amount),
                });
              }
            });
            // A part payment whose transfer went folds back into what is owed.
            reverseSplitMap.forEach((splitId) => foldReopenedSplitInDb(splitId));
          });
          reopenExpenseIds.forEach((expenseId) => {
            transactionsRepository.update(expenseId, {
              reimbursedAt: null,
              reimbursementAccountId: null,
              reimbursementTransactionId: null,
            });
          });
          // Reclaim the now-orphaned receipt file(s) once the rows are gone.
          if (deletedHadReceipt) runUserAssetGc();
          if (options?.track !== false) {
            void trackEvent(
              requestedDeleteCount === 1
                ? AnalyticsEvents.TRANSACTION_DELETED
                : AnalyticsEvents.TRANSACTIONS_BULK_DELETED,
              { count: requestedDeleteCount },
            );
          }
        } catch {
          // rollback on failure
          reload = true;
        }
        if (reload) scheduleRefreshTransactions();
        else refreshAccountBalances();
      });
    },
    [accountCurrencyOf, deleteGroupEntries, refreshAccountBalances, scheduleRefreshTransactions],
  );

  const updateTransaction = useCallback(
    (id: string, input: Partial<CreateTransactionInput>) => {
      updateTransactionsBulk([{ id, input }]);
    },
    [updateTransactionsBulk],
  );

  const saveTransferFee = useCallback(
    (
      transfer: TransferForFee & { createdAt: string; dayOrder: number | null },
      draft: TransferFeeDraft | null,
    ) => {
      const existing =
        transactionsRef.current.find((tx) => isTransferFee(tx) && tx.feeOfId === transfer.id) ??
        null;
      const write = planTransferFeeWrite({
        transfer,
        draft,
        existing,
        currencyOf: (accountId) => accountCurrencyOf(accountId) ?? reportingCurrencyRef.current,
        note: I18n.t('transactions.editor.transfer_fee.row_note'),
      });
      if (write.kind === 'create') {
        insertTransferFeeRow(
          write.input,
          transferFeeCreatedAt(transfer.createdAt),
          transferFeeDayOrder(transfer.dayOrder),
        );
        void trackEvent(AnalyticsEvents.TRANSFER_FEE_ADDED, {
          side: draft?.side ?? 'from',
          cross_currency: transferIsCrossCurrency(transfer),
        });
      } else if (write.kind === 'update') {
        updateTransactionsBulk([{ id: write.feeId, input: write.input }]);
      } else if (write.kind === 'delete') {
        deleteTransactionsBulk([write.feeId], { track: false });
      }
    },
    [
      accountCurrencyOf,
      deleteTransactionsBulk,
      insertTransferFeeRow,
      transferIsCrossCurrency,
      updateTransactionsBulk,
    ],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      deleteTransactionsBulk([id]);
    },
    [deleteTransactionsBulk],
  );

  const createInstalmentPlan = useCallback(
    (input: CreateInstalmentPlanInput) => {
      const created = runMutation(() => recurringRulesRepository.createInstalmentPlan(input));
      if (created) {
        void trackEvent(AnalyticsEvents.INSTALMENT_PLAN_CREATED, {
          payments: Math.trunc(input.count),
          frequency: frequencyOfSchedule(input.recurrencePattern, input.recurrenceInterval),
          first_payment_due: created.firstPaymentId !== null,
          custom_amount: input.regularAmount != null,
          source: 'add_form',
        });
      }
      return created;
    },
    [runMutation],
  );

  const convertTransactionToInstalmentPlan = useCallback(
    (
      id: string,
      edits: Partial<CreateTransactionInput>,
      plan: Omit<ConvertToInstalmentPlanInput, 'transactionId'>,
      onConverted?: () => void,
    ) => {
      // The editor's other changes (note, category, date, receipt) save first,
      // like any edit, and the plan is made from the row once they are stored:
      // its total and first date are what the user left in the form.
      updateTransactionsBulk([{ id, input: edits }], {
        afterWrite: (stored) => {
          try {
            const ruleId = stored
              ? runMutation(() =>
                  recurringRulesRepository.convertTransactionToInstalmentPlan({
                    ...plan,
                    transactionId: id,
                  }),
                )
              : null;
            // A failed save, or a row that changed under the editor (another
            // phone's sync): no plan was made.
            if (!ruleId) throw new Error('Expense could not be turned into an instalment plan');
            void trackEvent(AnalyticsEvents.INSTALMENT_PLAN_CREATED, {
              payments: Math.trunc(plan.count),
              frequency: frequencyOfSchedule(plan.recurrencePattern, plan.recurrenceInterval),
              // The expense itself is payment 1, made already.
              first_payment_due: true,
              custom_amount: plan.regularAmount != null,
              source: 'saved_expense',
            });
            onConverted?.();
          } catch (error) {
            Alert.alert(I18n.t('instalments.convert_failed'));
            reportError(error, { scope: 'instalment_convert' });
          }
        },
      });
    },
    [runMutation, updateTransactionsBulk],
  );

  const updateInstalmentPlan = useCallback(
    (id: string, updates: InstalmentPlanUpdate) => {
      runMutation(() => {
        recurringRulesRepository.update(id, {
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.note !== undefined ? { note: updates.note } : {}),
          ...(updates.accountId ? { accountId: updates.accountId } : {}),
          ...(updates.categoryId ? { categoryId: updates.categoryId } : {}),
          // The regular payment from now on; the last one keeps the plan
          // balanced (`buildInstalmentProgress`).
          ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
        });
      });
      void trackEvent(AnalyticsEvents.INSTALMENT_PLAN_UPDATED, {
        amount_changed: updates.amount !== undefined,
      });
    },
    [runMutation],
  );

  const deleteInstalmentPlan = useCallback(
    (id: string, removePayments: boolean) => {
      const paymentIds = runMutation(() => recurringRulesRepository.deleteInstalmentPlan(id));
      // The payments made are ordinary rows: remove them the normal way.
      if (removePayments && paymentIds.length > 0) deleteTransactionsBulk(paymentIds);
      void trackEvent(AnalyticsEvents.INSTALMENT_PLAN_DELETED, {
        payments_removed: removePayments,
      });
    },
    [deleteTransactionsBulk, runMutation],
  );

  const payNextInstalment = useCallback(
    (id: string) => {
      const paymentId = runMutation(() => recurringRulesRepository.payNextInstalment(id));
      if (paymentId) void trackEvent(AnalyticsEvents.INSTALMENT_PAYMENT_PAID_EARLY);
      return paymentId;
    },
    [runMutation],
  );

  const payOffInstalmentPlan = useCallback(
    (id: string) => {
      const paymentId = runMutation(() => recurringRulesRepository.payOffInstalmentPlan(id));
      if (paymentId) void trackEvent(AnalyticsEvents.INSTALMENT_PLAN_PAID_OFF);
      return paymentId;
    },
    [runMutation],
  );

  /**
   * Records that a reimbursement came back, into `accountId`.
   *
   * This writes a real income row for the refund rather than only stamping the
   * expense, so the receiving account's balance is right. The refund carries
   * `reimbursementOfId`, which is what makes `countsTowardSpending` drop it
   * alongside its expense when reimbursements are set not to count.
   */
  const markTransactionReimbursed = useCallback(
    (id: string, options?: { accountId?: string | null; date?: string }) => {
      const expense = transactionsRef.current.find((tx) => tx.id === id);
      if (!expense || !expense.reimbursable || expense.reimbursedAt) return;

      const accountId =
        options?.accountId ?? expense.reimbursementAccountId ?? expense.accountId ?? null;
      if (!accountId) return;

      const refundId = newId();
      const now = nowIso();
      const date = options?.date ?? dayKeyFromDateLocal(new Date());
      const amount = normalizeMoneyAmount(expense.amount);
      const currency = expense.currency;
      // The refund is the same money coming back, so it is valued at the rate
      // the expense froze rather than today's. Re-snapshotting would leave the
      // pair not cancelling in the reporting currency: a EUR 100 expense frozen
      // at 1.05 against a refund taken at 1.15 invents ten reporting units of
      // income the user never received.
      const snapshot =
        expense.reportingCurrency !== null && expense.fxRate !== null
          ? {
              reportingCurrency: expense.reportingCurrency,
              reportingAmount: expense.reportingAmount ?? amount * expense.fxRate,
              fxRate: expense.fxRate,
            }
          : buildSnapshot('income', amount, currency);
      const accountCurrency =
        accounts.find((account) => account.id === accountId)?.currency ??
        reportingCurrencyRef.current;
      const accountAmount =
        currency === accountCurrency
          ? null
          : convert(amount, currency, accountCurrency, rateTableRef.current).value;
      const note = buildRefundNote(I18n.t('reimbursements.refund_note_prefix'), expense.note);

      // The money comes back to whoever the expense belongs to.
      const refundInput = withEntryStamp<CreateTransactionInput>(
        {
          type: 'income',
          amount,
          currency,
          reportingCurrency: snapshot.reportingCurrency,
          reportingAmount: snapshot.reportingAmount,
          fxRate: snapshot.fxRate,
          accountAmount,
          date,
          accountId,
          categoryId: null,
          fromAccountId: null,
          toAccountId: null,
          note,
          sentiment: 'neutral',
          reimbursementOfId: id,
          memberId: expense.memberId,
        },
        getActiveLedgerId(),
      );

      const optimisticRefund: TransactionWithRelations = {
        id: refundId,
        instalmentRuleId: null,
        instalmentNumber: null,
        dayOrder: null,
        type: 'income',
        amount,
        currency,
        reportingCurrency: snapshot.reportingCurrency,
        reportingAmount: snapshot.reportingAmount,
        fxRate: snapshot.fxRate,
        toAmount: null,
        accountAmount,
        date,
        accountId,
        fromAccountId: null,
        toAccountId: null,
        categoryId: null,
        note,
        details: null,
        receiptUri: null,
        sentiment: 'neutral',
        ...NO_REIMBURSEMENT,
        reimbursementOfId: id,
        countsAsExpense: false,
        feeOfId: null,
        createdBy: refundInput.createdBy,
        memberId: refundInput.memberId,
        albumGroupId: null,
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...resolveRelationNames(refundInput),
      };

      setTransactions((prev) =>
        insertTransactionsByDateDesc(
          prev.map((tx) =>
            tx.id === id
              ? {
                  ...tx,
                  reimbursedAt: now,
                  reimbursementAccountId: accountId,
                  reimbursementTransactionId: refundId,
                  updatedAt: now,
                }
              : tx,
          ),
          [optimisticRefund],
        ),
      );

      runDeferredWrite(() => {
        try {
          transactionsRepository.createWithId(refundId, refundInput);
          transactionsRepository.update(id, {
            reimbursedAt: now,
            reimbursementAccountId: accountId,
            reimbursementTransactionId: refundId,
          });
          void trackEvent(AnalyticsEvents.REIMBURSEMENT_MARKED_PAID, {
            same_account: accountId === expense.accountId,
          });
        } catch {
          scheduleRefreshTransactions();
        }
        refreshAccountBalances();
      });
    },
    [
      accounts,
      buildSnapshot,
      refreshAccountBalances,
      resolveRelationNames,
      scheduleRefreshTransactions,
    ],
  );

  /** Undoes a mark-as-reimbursed: the refund row goes, the expense goes pending. */
  const unmarkTransactionReimbursed = useCallback(
    (id: string) => {
      const expense = transactionsRef.current.find((tx) => tx.id === id);
      if (!expense || !expense.reimbursedAt) return;
      const refundId = expense.reimbursementTransactionId;
      const now = nowIso();

      setTransactions((prev) =>
        prev
          .filter((tx) => !refundId || tx.id !== refundId)
          .map((tx) =>
            tx.id === id
              ? {
                  ...tx,
                  reimbursedAt: null,
                  reimbursementAccountId: null,
                  reimbursementTransactionId: null,
                  updatedAt: now,
                }
              : tx,
          ),
      );

      runDeferredWrite(() => {
        try {
          if (refundId) transactionsRepository.softDelete(refundId);
          transactionsRepository.update(id, {
            reimbursedAt: null,
            reimbursementAccountId: null,
            reimbursementTransactionId: null,
          });
          void trackEvent(AnalyticsEvents.REIMBURSEMENT_REOPENED);
        } catch {
          scheduleRefreshTransactions();
        }
        refreshAccountBalances();
      });
    },
    [refreshAccountBalances, scheduleRefreshTransactions],
  );

  const createTransactionWithSplits = useCallback(
    (
      input: CreateTransactionInput,
      splits: SplitDraftInput[],
      receiptSplit?: ReceiptSplitDraftInput,
      meta?: { source?: 'web_dashboard' },
    ): string => {
      const claimFirstEntry = prepareFirstEntry(input.type);
      const source = meta?.source ?? (receiptSplit ? 'receipt_split' : 'split');
      const parentSnapshot = buildSnapshot(
        input.type,
        normalizeMoneyAmount(input.amount),
        input.currency,
      );
      const txId = newId();
      const now = nowIso();
      const normalizedInput = withEntryStamp(
        {
          ...input,
          amount: normalizeMoneyAmount(input.amount),
          date: dateForNewTransaction(input.date, new Date(now)),
          reportingCurrency: input.reportingCurrency ?? parentSnapshot.reportingCurrency,
          reportingAmount: input.reportingAmount ?? parentSnapshot.reportingAmount,
          fxRate: input.fxRate ?? parentSnapshot.fxRate,
          accountAmount: input.accountAmount ?? null,
        },
        getActiveLedgerId(),
      );

      // Pre-marked-paid splits (create-mode Mark Paid) need a transfer tx if
      // the payback account differs from the parent's account. We allocate
      // those ids upfront so the split can link to them via paidTransactionId.
      type Transfer = { id: string; amount: number; toAccountId: string; note: string | null };
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
            note: buildPaybackTransferNote(draft.personName, normalizedInput.note),
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
          partOfSplitId: draft.partOfSplitId ?? null,
          isPayer: !!draft.isPayer,
          shareAmount: draft.shareAmount == null ? null : normalizeMoneyAmount(draft.shareAmount),
          memberId: draft.memberId ?? null,
          albumMemberId: draft.albumMemberId ?? null,
          settlementId: draft.settlementId ?? null,
          sortOrder: draft.sortOrder ?? index,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
      });

      const optimisticParent: TransactionWithRelations = {
        id: txId,
        instalmentRuleId: null,
        instalmentNumber: null,
        dayOrder: null,
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
        details: normalizedInput.details ?? null,
        receiptUri: normalizedInput.receiptUri ?? null,
        sentiment: normalizedInput.sentiment ?? 'neutral',
        ...NO_REIMBURSEMENT,
        reimbursable: normalizedInput.reimbursable ?? false,
        countsAsExpense: false,
        feeOfId: null,
        createdBy: normalizedInput.createdBy,
        memberId: normalizedInput.memberId,
        albumGroupId: null,
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
      const transferAmounts = transfersToCreate.map((t) =>
        paybackAmountsFor(
          optimisticParent,
          t.amount,
          t.toAccountId,
          rateTableRef.current,
          accountCurrencyOf,
        ),
      );
      const optimisticTransfers = transfersToCreate.map((t, index) =>
        optimisticPaybackTransfer({
          id: t.id,
          ...transferAmounts[index],
          parent: optimisticParent,
          toAccountId: t.toAccountId,
          date: normalizedInput.date,
          note: t.note,
          at: now,
          names: resolveRelationNames({
            fromAccountId: normalizedInput.accountId,
            toAccountId: t.toAccountId,
          }),
        }),
      );
      setTransactions((prev) =>
        insertTransactionsByDateDesc(prev, [optimisticParent, ...optimisticTransfers]),
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
          transfersToCreate.forEach((t, index) => {
            createPaybackTransferInDb(t.id, {
              ...transferAmounts[index],
              date: normalizedInput.date,
              fromAccountId: normalizedInput.accountId ?? null,
              toAccountId: t.toAccountId,
              note: t.note,
              createdBy: normalizedInput.createdBy,
              memberId: normalizedInput.memberId ?? null,
            });
          });
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
              partOfSplitId: s.partOfSplitId,
              isPayer: s.isPayer,
              shareAmount: s.shareAmount,
              memberId: s.memberId,
            });
          });
          if (receiptSplit) {
            receiptSplitsRepository.createForTransaction(txId, receiptSplit);
          } else {
            trackSplitBillCreated(splits);
          }
          if (claimFirstEntry()) {
            void trackEvent(AnalyticsEvents.FIRST_TRANSACTION_CREATED, {
              type: normalizedInput.type,
              source,
            });
          }
          if (isLoggedEntryType(normalizedInput.type)) {
            void recordLoggedTransaction({
              type: normalizedInput.type,
              source,
            });
          }
          recordTransactionLogged();
        } catch {
          // optimistic rollback handled by refresh
        }
        scheduleRefreshTransactions();
      });
      return txId;
    },
    [
      accountCurrencyOf,
      buildSnapshot,
      prepareFirstEntry,
      scheduleRefreshTransactions,
      resolveRelationNames,
    ],
  );

  const updateTransactionSplits = useCallback(
    (
      transactionId: string,
      splits: SplitDraftInput[],
      options?: { markingPaidIds?: readonly string[] },
    ) => {
      const now = nowIso();
      const markingPaidIds = options?.markingPaidIds ?? [];
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
          partOfSplitId: draft.partOfSplitId ?? null,
          isPayer: !!draft.isPayer,
          shareAmount: draft.shareAmount == null ? null : normalizeMoneyAmount(draft.shareAmount),
          memberId: draft.memberId ?? null,
          albumMemberId: draft.albumMemberId ?? null,
          settlementId: draft.settlementId ?? null,
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
                partOfSplitId: prior.partOfSplitId,
                createdAt: prior.createdAt,
              };
            }
            return next;
          });
          // A share's paid part payments carry the name its first row has now.
          const nameByShare = new Map(
            merged.filter((s) => !s.partOfSplitId).map((s) => [s.id, s.personName]),
          );
          const named = merged.map((s) =>
            s.partOfSplitId && s.paidAt && nameByShare.has(s.partOfSplitId)
              ? { ...s, personName: nameByShare.get(s.partOfSplitId) ?? null }
              : s,
          );
          // A dropped first row hands its share to its oldest part payment.
          const removedIds = (tx.splits ?? [])
            .filter((s) => !optimisticSplits.some((next) => next.id === s.id))
            .map((s) => s.id);
          const kept = removedIds.length
            ? removeSplitsKeepingShares(
                [...named, ...(tx.splits ?? []).filter((s) => removedIds.includes(s.id))],
                removedIds,
              )
            : named;
          // A share an older app left owing on two rows is one row again.
          const consolidated = consolidateOwedRows(kept, now, markingPaidIds).splits;
          return { ...tx, splits: consolidated, splitsSummary: summarizeSplits(consolidated) };
        }),
      );
      runDeferredWrite(() => {
        try {
          const existingPersisted = transactionSplitsRepository.listByTransactionId(transactionId);
          const wasSplitBill = existingPersisted.some((s) => !s.isSelf);
          const nextIds = new Set(optimisticSplits.map((s) => s.id));
          // Soft-delete removed splits.
          existingPersisted
            .filter((s) => !nextIds.has(s.id))
            .forEach((s) => softDeleteSplitInDb(s));
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
                isPayer: next.isPayer,
                shareAmount: next.shareAmount,
                memberId: next.memberId,
              });
            } else {
              transactionSplitsRepository.createWithId(next.id, {
                transactionId,
                personName: next.personName,
                amount: next.amount,
                isSelf: next.isSelf,
                paybackAccountId: next.paybackAccountId,
                sortOrder: next.sortOrder,
                partOfSplitId: next.partOfSplitId,
                isPayer: next.isPayer,
                shareAmount: next.shareAmount,
                memberId: next.memberId,
              });
            }
          });
          // A renamed share renames its part payments too (after the loop,
          // so a part's own row in the list cannot put the old name back).
          optimisticSplits.forEach((next) => {
            const prior = existingMap.get(next.id);
            if (prior && !prior.partOfSplitId && !next.isSelf) {
              transactionSplitsRepository.renameShareParts(next.id, next.personName);
            }
          });
          foldOwedRowsInDb(transactionId, markingPaidIds);
          if (!wasSplitBill) trackSplitBillCreated(optimisticSplits);
        } catch {
          // ignore; refresh below restores truth
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions],
  );

  const updateTransactionReceiptSplit = useCallback(
    (
      transactionId: string,
      parentInput: Partial<CreateTransactionInput>,
      splits: SplitDraftInput[],
      receiptSplit: ReceiptSplitDraftInput,
    ) => {
      if (Object.keys(parentInput).length > 0) {
        updateTransaction(transactionId, parentInput);
      }
      updateTransactionSplits(transactionId, splits);
      runDeferredWrite(() => {
        try {
          receiptSplitsRepository.replaceForTransaction(transactionId, receiptSplit);
        } catch {
          // itemized detail is best-effort; the bridge splits above are the
          // source of truth for balances/settle-up
        }
      });
    },
    [updateTransaction, updateTransactionSplits],
  );

  const getReceiptSplitForTransaction = useCallback(
    (transactionId: string): ReceiptSplit | null => {
      try {
        return receiptSplitsRepository.getByTransactionId(transactionId);
      } catch {
        return null;
      }
    },
    [],
  );

  const markSplitPaid = useCallback(
    (
      splitId: string,
      options?: { paybackAccountId?: string | null; date?: string; note?: string | null },
    ) => {
      // A shared album's bill: the payment is the group's, and the entry follows.
      const groupBill = groupBillOf(splitId);
      if (groupBill) {
        if (groupBill.split.isSelf || groupBill.split.paidAt) return;
        recordGroupPayment(groupBill, groupBill.split.amount, options?.paybackAccountId);
        return;
      }
      const transferTxId = newId();
      const paidAtIso = nowIso();
      const date = options?.date ?? dayKeyFromDateLocal(new Date());
      const explicitNote = options?.note?.trim() || null;
      const optionPaybackAccountId = options?.paybackAccountId;

      // Optimistic state update. Reads parent from `prev` so it sees splits
      // inserted by an earlier setter in the same batch (e.g. when Save calls
      // updateTransactionSplits then markSplitPaid for a brand-new paid row).
      setTransactions((prev) => {
        const parent = prev.find((tx) => tx.splits?.some((s) => s.id === splitId));
        const split = parent?.splits?.find((s) => s.id === splitId);
        if (!parent || !split || split.isSelf) return prev;
        if (split.paidAt) return prev;
        const paybackAccountId = resolvePaybackAccountId(parent, split, optionPaybackAccountId);
        // No transfer when the money stays in the bill's account, or when the
        // bill has no account to move it out of (the expense still drops).
        const transferToAccountId =
          parent.accountId && paybackAccountId && paybackAccountId !== parent.accountId
            ? paybackAccountId
            : null;
        const sameAccount = transferToAccountId === null;
        const splitAmount = split.amount;
        const usedTransferTxId = sameAccount ? null : transferTxId;
        const note = explicitNote ?? buildPaybackTransferNote(split.personName, parent.note);

        // For cross-account paybacks we model the friend's repayment as a
        // transfer from the original-paying account to the destination
        // account, and reduce the parent expense so its account balance
        // reflects only the user's net outlay.
        const optimisticTransfer: TransactionWithRelations | null = transferToAccountId
          ? optimisticPaybackTransfer({
              id: transferTxId,
              ...paybackAmountsFor(
                parent,
                splitAmount,
                transferToAccountId,
                rateTableRef.current,
                accountCurrencyOf,
              ),
              parent,
              toAccountId: transferToAccountId,
              date,
              note,
              at: paidAtIso,
              names: resolveRelationNames({
                fromAccountId: parent.accountId,
                toAccountId: transferToAccountId,
              }),
            })
          : null;

        const next = prev.map((tx) => {
          if (tx.id !== parent.id) return tx;
          const reduced = rescaleSplitAdjustedAmounts(tx, tx.amount - splitAmount);
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
            ...reduced,
            updatedAt: paidAtIso,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        });
        return optimisticTransfer ? insertTransactionsByDateDesc(next, [optimisticTransfer]) : next;
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
          if (!parent) return;
          const paybackAccountId = resolvePaybackAccountId(parent, split, optionPaybackAccountId);
          const sameAccount =
            !parent.accountId || !paybackAccountId || paybackAccountId === parent.accountId;
          const usedTransferTxId = sameAccount ? null : transferTxId;
          writePaybackInDb(parent, {
            amount: split.amount,
            toAccountId: paybackAccountId,
            transferTxId: usedTransferTxId,
            date,
            note: explicitNote ?? buildPaybackTransferNote(split.personName, parent.note),
            rateTable: rateTableRef.current,
            currencyOf: accountCurrencyOf,
          });
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
    [
      accountCurrencyOf,
      groupBillOf,
      recordGroupPayment,
      resolvePaybackAccountId,
      resolveRelationNames,
      scheduleRefreshTransactions,
    ],
  );

  // A friend pays back part of their share. The paid part becomes its own paid
  // row (see features/transactions/lib/splitPayments.ts): the expense drops by
  // the payment, a cross-account payback gets its own transfer, and the share's
  // unpaid row keeps what is still owed. Paying everything that is left is
  // Mark paid.
  const recordSplitPayment = useCallback(
    (
      splitId: string,
      amount: number,
      options?: { paybackAccountId?: string | null; date?: string },
    ) => {
      const current = transactionsRef.current
        .find((tx) => tx.splits?.some((s) => s.id === splitId))
        ?.splits?.find((s) => s.id === splitId);
      if (!current || current.isSelf || current.paidAt) return;
      const plan = planSplitPayment(current.amount, amount);
      if (!plan) return;
      if (plan.kind === 'full') {
        markSplitPaid(splitId, options);
        return;
      }
      const groupBill = groupBillOf(splitId);
      if (groupBill) {
        recordGroupPayment(groupBill, plan.amount, options?.paybackAccountId);
        return;
      }

      const partId = newId();
      const transferTxId = newId();
      const paidAtIso = nowIso();
      const date = options?.date ?? dayKeyFromDateLocal(new Date());
      const optionPaybackAccountId = options?.paybackAccountId;

      setTransactions((prev) => {
        const parent = prev.find((tx) => tx.splits?.some((s) => s.id === splitId));
        const split = parent?.splits?.find((s) => s.id === splitId);
        if (!parent || !split || split.isSelf || split.paidAt) return prev;
        const rowPlan = planSplitPayment(split.amount, plan.amount);
        if (rowPlan?.kind !== 'partial') return prev;
        const paybackAccountId = resolvePaybackAccountId(parent, split, optionPaybackAccountId);
        // As Mark paid: no transfer within one account or from a bill with
        // no account.
        const transferToAccountId =
          parent.accountId && paybackAccountId && paybackAccountId !== parent.accountId
            ? paybackAccountId
            : null;
        const sameAccount = transferToAccountId === null;

        const part: TransactionSplit = {
          ...split,
          id: partId,
          amount: rowPlan.amount,
          paybackAccountId,
          paidAt: paidAtIso,
          paidTransactionId: sameAccount ? null : transferTxId,
          partOfSplitId: splitShareKey(split),
          createdAt: paidAtIso,
          updatedAt: paidAtIso,
        };
        const optimisticTransfer = transferToAccountId
          ? optimisticPaybackTransfer({
              id: transferTxId,
              ...paybackAmountsFor(
                parent,
                rowPlan.amount,
                transferToAccountId,
                rateTableRef.current,
                accountCurrencyOf,
              ),
              parent,
              toAccountId: transferToAccountId,
              date,
              note: buildPaybackTransferNote(split.personName, parent.note),
              at: paidAtIso,
              names: resolveRelationNames({
                fromAccountId: parent.accountId,
                toAccountId: transferToAccountId,
              }),
            })
          : null;

        const next = prev.map((tx) => {
          if (tx.id !== parent.id) return tx;
          const updatedSplits = cutPartPayment(tx.splits ?? [], splitId, part).map((s) =>
            s.id === splitId ? { ...s, paybackAccountId } : s,
          );
          return {
            ...tx,
            ...rescaleSplitAdjustedAmounts(tx, tx.amount - rowPlan.amount),
            updatedAt: paidAtIso,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        });
        return optimisticTransfer ? insertTransactionsByDateDesc(next, [optimisticTransfer]) : next;
      });

      // Re-read from the database, as markSplitPaid does; a row that changed
      // meanwhile (paid elsewhere, or now owing less than this payment) is left
      // for the refresh to show as it is.
      runDeferredWrite(() => {
        try {
          const split = transactionSplitsRepository.findById(splitId);
          if (!split || split.isSelf || split.paidAt) return;
          const rowPlan = planSplitPayment(split.amount, plan.amount);
          if (rowPlan?.kind !== 'partial') return;
          const parent = transactionsRepository.getById(split.transactionId);
          if (!parent) return;
          const paybackAccountId = resolvePaybackAccountId(parent, split, optionPaybackAccountId);
          const sameAccount =
            !parent.accountId || !paybackAccountId || paybackAccountId === parent.accountId;
          getSQLite().withTransactionSync(() => {
            writePaybackInDb(parent, {
              amount: rowPlan.amount,
              toAccountId: paybackAccountId,
              transferTxId: sameAccount ? null : transferTxId,
              date,
              note: buildPaybackTransferNote(split.personName, parent.note),
              rateTable: rateTableRef.current,
              currencyOf: accountCurrencyOf,
            });
            transactionSplitsRepository.update(splitId, {
              amount: rowPlan.remaining,
              paybackAccountId,
            });
            transactionSplitsRepository.createWithId(partId, {
              transactionId: split.transactionId,
              personName: split.personName,
              amount: rowPlan.amount,
              isSelf: false,
              paybackAccountId,
              sortOrder: split.sortOrder,
              paidAt: paidAtIso,
              paidTransactionId: sameAccount ? null : transferTxId,
              partOfSplitId: splitShareKey(split),
            });
          });
          void trackEvent(AnalyticsEvents.SPLIT_PART_PAID, { same_account: sameAccount });
        } catch {
          // ignore; refresh below restores truth
        }
        scheduleRefreshTransactions();
      });
    },
    [
      accountCurrencyOf,
      groupBillOf,
      markSplitPaid,
      recordGroupPayment,
      resolvePaybackAccountId,
      resolveRelationNames,
      scheduleRefreshTransactions,
    ],
  );

  const markSplitUnpaid = useCallback(
    (splitId: string) => {
      const groupBill = groupBillOf(splitId);
      if (groupBill) {
        undoGroupPayment(groupBill, groupBill.split.settlementId);
        return;
      }
      const now = nowIso();
      const undone = undonePaybackOf(splitId);

      // Optimistic state update.
      setTransactions((prev) => {
        const parent = prev.find((tx) => tx.splits?.some((s) => s.id === splitId));
        const split = parent?.splits?.find((s) => s.id === splitId);
        if (!parent || !split || !split.paidAt) return prev;
        const transferTxId = split.paidTransactionId;
        const splitAmount = split.amount;
        // The payback's transfer goes, and the fee charged on it with it.
        const filtered = transferTxId
          ? prev.filter((tx) => tx.id !== transferTxId && tx.feeOfId !== transferTxId)
          : prev;
        return filtered.map((tx) => {
          if (tx.id !== parent.id) return tx;
          const restored = rescaleSplitAdjustedAmounts(tx, tx.amount + splitAmount, () =>
            splitRestoreRates(tx, rateTableRef.current, accountCurrencyOf, undone),
          );
          const updatedSplits = foldReopenedSplits(
            (tx.splits ?? []).map((s) =>
              s.id === splitId ? { ...s, paidAt: null, paidTransactionId: null } : s,
            ),
            [splitId],
            now,
          );
          return {
            ...tx,
            ...restored,
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
          // One transaction: undoing a part payment also folds it back into
          // what is owed, and a half-done undo would leave the share owing on
          // two rows.
          getSQLite().withTransactionSync(() => {
            const parent = transactionsRepository.getById(split.transactionId);
            if (parent) {
              transactionsRepository.update(
                parent.id,
                rescaleSplitAdjustedAmounts(parent, parent.amount + split.amount, () =>
                  splitRestoreRates(parent, rateTableRef.current, accountCurrencyOf, undone),
                ),
              );
            }
            if (split.paidTransactionId) {
              transactionsRepository.softDelete(split.paidTransactionId);
            }
            transactionSplitsRepository.markUnpaid(splitId);
            foldReopenedSplitInDb(splitId);
          });
          void trackEvent(AnalyticsEvents.SPLIT_MARKED_UNPAID, {});
        } catch {
          // ignore
        }
        scheduleRefreshTransactions();
      });
    },
    [
      accountCurrencyOf,
      groupBillOf,
      scheduleRefreshTransactions,
      undoGroupPayment,
      undonePaybackOf,
    ],
  );

  // Re-point an unpaid split's payback account (no amount/transfer change). Only
  // used for still-owed splits, so there is no linked transfer to move.
  const updateSplitPaybackAccount = useCallback(
    (splitId: string, paybackAccountId: string | null) => {
      const now = nowIso();
      setTransactions((prev) =>
        prev.map((tx) => {
          if (!tx.splits?.some((s) => s.id === splitId)) return tx;
          const updatedSplits = tx.splits.map((s) =>
            s.id === splitId ? { ...s, paybackAccountId, updatedAt: now } : s,
          );
          return { ...tx, splits: updatedSplits };
        }),
      );
      runDeferredWrite(() => {
        try {
          transactionSplitsRepository.update(splitId, { paybackAccountId });
        } catch {
          // ignore
        }
        scheduleRefreshTransactions();
      });
    },
    [scheduleRefreshTransactions],
  );

  // Remove a single split request. If it had already been marked paid, reverse
  // that first (restore the parent's amount and drop the linked transfer) so the
  // books stay consistent, then soft-delete the split.
  const deleteSplit = useCallback(
    (splitId: string) => {
      const now = nowIso();
      const undone = undonePaybackOf(splitId);
      setTransactions((prev) => {
        const parent = prev.find((tx) => tx.splits?.some((s) => s.id === splitId));
        const split = parent?.splits?.find((s) => s.id === splitId);
        if (!parent || !split) return prev;
        const transferTxId = split.paidAt ? split.paidTransactionId : null;
        const restoreAmount = split.paidAt ? split.amount : 0;
        // The payback's transfer goes, and the fee charged on it with it.
        const filtered = transferTxId
          ? prev.filter((tx) => tx.id !== transferTxId && tx.feeOfId !== transferTxId)
          : prev;
        return filtered.map((tx) => {
          if (tx.id !== parent.id) return tx;
          const updatedSplits = removeSplitsKeepingShares(tx.splits ?? [], [splitId]);
          return {
            ...tx,
            ...rescaleSplitAdjustedAmounts(tx, tx.amount + restoreAmount, () =>
              splitRestoreRates(tx, rateTableRef.current, accountCurrencyOf, undone),
            ),
            updatedAt: now,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        });
      });
      runDeferredWrite(() => {
        try {
          const split = transactionSplitsRepository.findById(splitId);
          if (!split) return;
          getSQLite().withTransactionSync(() => {
            if (split.paidAt) {
              const parent = transactionsRepository.getById(split.transactionId);
              if (parent) {
                transactionsRepository.update(
                  parent.id,
                  rescaleSplitAdjustedAmounts(parent, parent.amount + split.amount, () =>
                    splitRestoreRates(parent, rateTableRef.current, accountCurrencyOf, undone),
                  ),
                );
              }
              if (split.paidTransactionId) {
                transactionsRepository.softDelete(split.paidTransactionId);
              }
            }
            softDeleteSplitInDb(split);
          });
        } catch {
          // ignore
        }
        scheduleRefreshTransactions();
      });
    },
    [accountCurrencyOf, scheduleRefreshTransactions, undonePaybackOf],
  );

  // The user pays a friend back for a bill that friend paid. Until now the
  // expense (the user's share) sat on no account, because the money had not
  // left the user; paying puts it on the account it was paid from, at the
  // bill's own date and amount, so spending does not move. The payer's row
  // records when, and from which account (features/transactions/lib/splitPayer.ts).
  const payBackPayer = useCallback(
    (payerSplitId: string, options?: { accountId?: string | null; via?: 'bill' | 'settle_up' }) => {
      const groupBill = groupBillOf(payerSplitId);
      if (groupBill) {
        const owed = owedToPayer(groupBill.tx.splits, groupBill.tx.amount);
        if (owed && owed.owed > 0) {
          recordGroupPayment(groupBill, owed.owed, options?.accountId ?? null);
        }
        return;
      }
      const paidAtIso = nowIso();
      const accountId = options?.accountId ?? null;
      const via = options?.via ?? 'bill';
      const accountAmountFor = (bill: { amount: number; currency: string }): number | null => {
        const accountCurrency = accountId ? accountCurrencyOf(accountId) : undefined;
        return accountCurrency && accountCurrency !== bill.currency
          ? convert(bill.amount, bill.currency, accountCurrency, rateTableRef.current).value
          : null;
      };
      setTransactions((prev) =>
        prev.map((tx) => {
          const payer = billPayer(tx.splits);
          if (!payer || payer.id !== payerSplitId || payer.paidAt) return tx;
          const updatedSplits = (tx.splits ?? []).map((s) =>
            s.id === payerSplitId
              ? { ...s, paidAt: paidAtIso, paybackAccountId: accountId, updatedAt: paidAtIso }
              : s,
          );
          return {
            ...tx,
            accountId,
            accountName: resolveRelationNames({ accountId }).accountName,
            accountAmount: accountAmountFor(tx),
            updatedAt: paidAtIso,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        }),
      );
      runDeferredWrite(() => {
        try {
          const split = transactionSplitsRepository.findById(payerSplitId);
          if (!split || !split.isPayer || split.isSelf || split.paidAt) return;
          const parent = transactionsRepository.getById(split.transactionId);
          if (!parent) return;
          getSQLite().withTransactionSync(() => {
            transactionsRepository.update(parent.id, {
              accountId,
              accountAmount: accountAmountFor(parent),
            });
            transactionSplitsRepository.update(payerSplitId, {
              paidAt: paidAtIso,
              paybackAccountId: accountId,
            });
          });
          void trackEvent(AnalyticsEvents.SPLIT_DEBT_PAID, {
            with_account: !!accountId,
            via,
            part: false,
          });
        } catch {
          // ignore; refresh below restores truth
        }
        scheduleRefreshTransactions();
      });
    },
    [
      accountCurrencyOf,
      groupBillOf,
      recordGroupPayment,
      resolveRelationNames,
      scheduleRefreshTransactions,
    ],
  );

  // Undo: the user owes the share again, and the expense leaves the account.
  const undoPayBackPayer = useCallback(
    (payerSplitId: string) => {
      const groupBill = groupBillOf(payerSplitId);
      if (groupBill) {
        undoGroupPayment(groupBill, groupBill.split.settlementId);
        return;
      }
      const now = nowIso();
      setTransactions((prev) =>
        prev.map((tx) => {
          const payer = billPayer(tx.splits);
          if (!payer || payer.id !== payerSplitId || !payer.paidAt) return tx;
          const updatedSplits = (tx.splits ?? []).map((s) =>
            s.id === payerSplitId
              ? { ...s, paidAt: null, paybackAccountId: null, updatedAt: now }
              : s,
          );
          return {
            ...tx,
            accountId: null,
            accountName: null,
            accountAmount: null,
            updatedAt: now,
            splits: updatedSplits,
            splitsSummary: summarizeSplits(updatedSplits),
          };
        }),
      );
      runDeferredWrite(() => {
        try {
          const split = transactionSplitsRepository.findById(payerSplitId);
          if (!split || !split.isPayer || !split.paidAt) return;
          getSQLite().withTransactionSync(() => {
            transactionsRepository.update(split.transactionId, {
              accountId: null,
              accountAmount: null,
            });
            transactionSplitsRepository.update(payerSplitId, {
              paidAt: null,
              paybackAccountId: null,
            });
          });
          void trackEvent(AnalyticsEvents.SPLIT_DEBT_REOPENED, { part: false });
        } catch {
          // ignore
        }
        scheduleRefreshTransactions();
      });
    },
    [groupBillOf, scheduleRefreshTransactions, undoGroupPayment],
  );

  // The user pays a friend back part of what they owe on a bill that friend
  // paid. The money has left an account, so the part becomes an expense of its
  // own on it (same day, category and title as the bill), cut out of the bill:
  // the bill and its Me row drop by the part and stay on no account, as what
  // is still owed. Spending does not change. A paid row under the payer's
  // records the part and points at its expense (lib/splitPayer.ts).
  const recordPayBack = useCallback(
    (payerSplitId: string, amount: number, options?: { accountId?: string | null }) => {
      const bill = transactionsRef.current.find((tx) => billPayer(tx.splits)?.id === payerSplitId);
      const owed = bill ? owedToPayer(bill.splits, bill.amount) : null;
      if (!bill || !owed || !(owed.owed > 0)) return;
      const plan = planSplitPayment(owed.owed, amount);
      if (!plan) return;
      const accountId = options?.accountId ?? null;
      if (plan.kind === 'full') {
        payBackPayer(payerSplitId, { accountId });
        return;
      }
      const groupBill = groupBillOf(payerSplitId);
      if (groupBill) {
        recordGroupPayment(groupBill, plan.amount, accountId);
        return;
      }

      const partId = newId();
      const paymentTxId = newId();
      const paidAtIso = nowIso();
      const accountAmountFor = (currency: string, part: number): number | null => {
        const accountCurrency = accountId ? accountCurrencyOf(accountId) : undefined;
        return accountCurrency && accountCurrency !== currency
          ? convert(part, currency, accountCurrency, rateTableRef.current).value
          : null;
      };
      // The part's share of the bill's frozen reporting amount, so the two
      // still add up to what the user's share was frozen at.
      const reportingPart = (
        before: { reportingAmount: number | null },
        after: { reportingAmount: number | null },
      ): number | null =>
        before.reportingAmount == null || after.reportingAmount == null
          ? null
          : normalizeMoneyAmount(before.reportingAmount - after.reportingAmount);

      setTransactions((prev) => {
        const parent = prev.find((tx) => billPayer(tx.splits)?.id === payerSplitId);
        const payer = parent ? billPayer(parent.splits) : null;
        const self = parent?.splits?.find((s) => s.isSelf);
        if (!parent || !payer || payer.paidAt || !self) return prev;
        const rowPlan = planSplitPayment(self.amount, plan.amount);
        if (rowPlan?.kind !== 'partial') return prev;
        const reduced = rescaleSplitAdjustedAmounts(parent, parent.amount - rowPlan.amount);
        const payment: TransactionWithRelations = {
          ...parent,
          id: paymentTxId,
          amount: rowPlan.amount,
          reportingAmount: reportingPart(parent, reduced),
          accountId,
          accountName: resolveRelationNames({ accountId }).accountName,
          accountAmount: accountAmountFor(parent.currency, rowPlan.amount),
          details: null,
          receiptUri: null,
          dayOrder: null,
          createdAt: paidAtIso,
          updatedAt: paidAtIso,
          splits: undefined,
          splitsSummary: undefined,
        };
        const part: TransactionSplit = {
          ...payer,
          id: partId,
          amount: 0,
          isPayer: false,
          shareAmount: rowPlan.amount,
          paybackAccountId: accountId,
          paidAt: paidAtIso,
          paidTransactionId: paymentTxId,
          partOfSplitId: payer.id,
          createdAt: paidAtIso,
          updatedAt: paidAtIso,
        };
        const updatedSplits = [
          ...(parent.splits ?? []).map((s) =>
            s.isSelf ? { ...s, amount: rowPlan.remaining, updatedAt: paidAtIso } : s,
          ),
          part,
        ];
        const next = prev.map((tx) =>
          tx.id === parent.id
            ? {
                ...tx,
                ...reduced,
                updatedAt: paidAtIso,
                splits: updatedSplits,
                splitsSummary: summarizeSplits(updatedSplits),
              }
            : tx,
        );
        return insertTransactionsByDateDesc(next, [payment]);
      });

      runDeferredWrite(() => {
        try {
          const payer = transactionSplitsRepository.findById(payerSplitId);
          if (!payer || !payer.isPayer || payer.isSelf || payer.paidAt) return;
          const parent = transactionsRepository.getById(payer.transactionId);
          const self = transactionSplitsRepository
            .listByTransactionId(payer.transactionId)
            .find((row) => row.isSelf);
          if (!parent || !self) return;
          const rowPlan = planSplitPayment(self.amount, plan.amount);
          if (rowPlan?.kind !== 'partial') return;
          const reduced = rescaleSplitAdjustedAmounts(parent, parent.amount - rowPlan.amount);
          getSQLite().withTransactionSync(() => {
            transactionsRepository.createWithId(paymentTxId, {
              type: 'expense',
              amount: rowPlan.amount,
              currency: parent.currency,
              reportingCurrency: parent.reportingCurrency,
              reportingAmount: reportingPart(parent, reduced),
              fxRate: parent.fxRate,
              accountAmount: accountAmountFor(parent.currency, rowPlan.amount),
              date: parent.date,
              accountId,
              fromAccountId: null,
              toAccountId: null,
              categoryId: parent.categoryId,
              note: parent.note,
              sentiment: parent.sentiment,
              createdBy: parent.createdBy,
              memberId: parent.memberId,
            });
            transactionsRepository.update(parent.id, reduced);
            transactionSplitsRepository.update(self.id, { amount: rowPlan.remaining });
            transactionSplitsRepository.createWithId(partId, {
              transactionId: parent.id,
              personName: payer.personName,
              amount: 0,
              isSelf: false,
              paybackAccountId: accountId,
              sortOrder: payer.sortOrder,
              paidAt: paidAtIso,
              paidTransactionId: paymentTxId,
              partOfSplitId: payer.id,
              shareAmount: rowPlan.amount,
              memberId: payer.memberId,
            });
            // The part stays in the albums the bill is in.
            albumsRepository.getAllTransactionIdsByAlbum().forEach((ids, albumId) => {
              if (ids.includes(parent.id)) albumsRepository.addTransactions(albumId, [paymentTxId]);
            });
          });
          setAlbums(albumsRepository.list());
          void trackEvent(AnalyticsEvents.SPLIT_DEBT_PAID, {
            with_account: !!accountId,
            via: 'bill',
            part: true,
          });
        } catch {
          // ignore; refresh below restores truth
        }
        scheduleRefreshTransactions();
      });
    },
    [
      accountCurrencyOf,
      groupBillOf,
      payBackPayer,
      recordGroupPayment,
      resolveRelationNames,
      scheduleRefreshTransactions,
    ],
  );

  // Undoing a part payment is deleting its expense, which puts the part back
  // on what is owed (see deleteTransactionsBulk).
  const undoPayBackPart = useCallback(
    (partSplitId: string) => {
      const part = transactionsRef.current
        .flatMap((tx) => tx.splits ?? [])
        .find((split) => split.id === partSplitId);
      if (!part || !isPayBackPart(part) || !part.paidTransactionId) return;
      const groupBill = groupBillOf(partSplitId);
      if (groupBill) {
        undoGroupPayment(groupBill, part.settlementId);
        return;
      }
      deleteTransactionsBulk([part.paidTransactionId], { track: false });
      void trackEvent(AnalyticsEvents.SPLIT_DEBT_REOPENED, { part: true });
    },
    [deleteTransactionsBulk, groupBillOf, undoGroupPayment],
  );

  const settleUpWithPerson = useCallback(
    (personKey: string, accountId: string | null) => {
      const rows = personSettlementRows(transactionsRef.current, personKey);
      if (rows.receive.length === 0 && rows.pay.length === 0) return;
      rows.receive.forEach((splitId) => markSplitPaid(splitId, { paybackAccountId: accountId }));
      rows.pay.forEach((splitId) => payBackPayer(splitId, { accountId, via: 'settle_up' }));
      void trackEvent(AnalyticsEvents.SETTLE_UP_COMPLETED, {
        received: rows.receive.length,
        paid: rows.pay.length,
      });
    },
    [markSplitPaid, payBackPayer],
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
          | 'workdayDisplayEnabled'
          | 'workingHoursPerDay'
          | 'hapticsEnabled'
          | 'themeMode'
          | 'themeColor'
          | 'iconStyle'
          | 'appIcon'
          | 'accountLogoCountry'
          | 'subscriptionLogoCountry'
          | 'profileName'
          | 'profileAvatarUri'
          | 'onboardingCompleted'
          | 'weekStartsOn'
          | 'firstDayOfMonth'
          | 'firstDayOverridesJson'
          | 'biometricLockEnabled'
          | 'biometricLockDelaySeconds'
          | 'autoBackupEnabled'
          | 'autoBackupTarget'
          | 'lastAutoBackupAt'
          | 'lastAutoBackupError'
          | 'paymentQrUri'
          | 'defaultPaybackAccountId'
          | 'reimbursementsCountAsExpense'
          | 'showTransactionAccount'
          | 'showAccountPickerBalances'
          | 'highlightRecurringTransactions'
          | 'navTabsJson'
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
            // A shared ledger's rows show this phone's own name and photo
            // from Settings, signed in or not.
            if ('profileName' in nextUpdates || 'profileAvatarUri' in nextUpdates) {
              invalidateLedgerPeople();
            }
            // A reporting-currency change re-bases the FX rate table.
            if (nextUpdates.currencyCode) reloadRateTable(next.currencyCode);
          },
        },
      );
    },
    [canUseTimeDisplayMode, reloadRateTable, runMutation],
  );

  // Multi-currency / FX

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
      const historyUserId = settings?.appUserId;
      // With other ledgers this starts over the open ledger only: the others
      // keep their data, the app keeps its settings, and the rate table keeps
      // the rates the other ledgers' currencies use.
      const otherLedgersKept = ledgersRepository.list().length > 1;
      runMutation(() => {
        if (otherLedgersKept) {
          purgeOpenLedgerData();
          settingsRepository.clearOpenLedgerPrefs();
          settingsRepository.updateSettings({
            currencyCode: code,
            currencySymbol: currencySymbolForCode(code),
          });
        } else {
          purgeAllData();
          settingsRepository.updateSettings({
            currencyCode: code,
            currencySymbol: currencySymbolForCode(code),
            onboardingCompleted: true,
          });
          exchangeRatesRepository.clearAll();
        }
        // Re-seed the default categories and accounts in the new currency so the
        // user lands in a usable (not empty) app rather than re-onboarding.
        seedMinimalCategoriesIfMissing();
        seedDefaultAccountsIfMissing(code);
      });
      reportingCurrencyRef.current = code;
      resetAutomationCaptureData(historyUserId);
      void runRateRefreshIfDue({ force: true }).then((result) => {
        if (result.ok) reloadRateTable(code);
      });
      // A currency change wipes every row just like a reset does; unlike one it
      // re-seeds and skips onboarding, which is what the scope tells apart.
      void trackEvent(AnalyticsEvents.DATA_RESET, { scope: 'currency_change' });
    },
    [reloadRateTable, runMutation, settings?.appUserId],
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

  // Put the launcher back on the icon the user picked. The OS remembers this by
  // itself, so on almost every launch the call below sees a match and does
  // nothing. It earns its keep in three cases where the two can diverge: a
  // restore onto a fresh install, which brings the choice back in the DB but not
  // on the home screen; Android, where the current icon is read off the
  // activity the app happened to be launched through — a notification or deep
  // link into MainActivity reports the default whichever alias is enabled; and a
  // device still sitting on a RETIRED alternate, which this is the only thing
  // that moves back off it (see RETIRED_ALTERNATE_NAMES).
  //
  // The redundant-call guard lives inside the service rather than here on
  // purpose: it compares the name the OS reports against the one being asked
  // for, where a guard here would compare *mapped ids* and a retired name maps
  // to the default — reading as "already correct" for the one device that most
  // needs the repair. `syncAppIcon` rather than `applyAppIcon` because the two
  // differ over exactly that case; its header says why.
  const chosenAppIcon = settings?.appIcon;
  useEffect(() => {
    if (!chosenAppIcon || !supportsAppIconSwitching) return;
    void syncAppIcon(chosenAppIcon).catch((error: unknown) => {
      reportError(error, { scope: 'app_icon_sync' });
    });
  }, [chosenAppIcon]);

  useEffect(() => {
    if (!settings?.appUserId) return;
    void identifyUser(settings.appUserId);
  }, [settings?.appUserId]);

  // Every analytics event carries `days_since_install` measured from this.
  const firstAppOpen = settings?.firstAppOpen ?? null;
  useEffect(() => {
    void setInstallDate(firstAppOpen);
  }, [firstAppOpen]);

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
  // `settings` is null until the very first load succeeds. Gating on it keeps
  // this off the one path where it is guaranteed to fail: an iOS background
  // launch that cannot read the database at all (see the foreground retry
  // above). `runAutoBackupIfDue` reads settings before it does anything else,
  // so without this guard every such launch fired a second, redundant report
  // for the load failure that `refreshAll` had already reported moments
  // earlier (Sentry MONEY2TIME-2H, always alongside MONEY2TIME-2S/-2G).
  //
  // A due backup serializes the whole database (about 16 MB of JSON for five
  // years of entries), which on the first launch of each day used to run while
  // the first screen was still rendering: it held the splash up and then
  // stalled the first seconds of use. So each trigger waits until the app has
  // settled, then for any running interaction to finish.
  const settingsLoaded = Boolean(settings);
  useEffect(() => {
    if (!autoBackupEnabled || !settingsLoaded) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let interaction: { cancel: () => void } | null = null;
    const runBackup = () => {
      perfMark('auto_backup_start');
      void runAutoBackupIfDue()
        .then((result) => {
          perfMark(result.skipped ? 'auto_backup_skipped' : 'auto_backup_done');
          if (!result.skipped) refreshSettings();
        })
        .catch((error: unknown) => {
          // runAutoBackupIfDue reads settings before it does anything else; a
          // transient disk I/O error there rejects the promise, and neither
          // caller below awaits it, so an uncaught rejection here becomes a
          // global unhandled-rejection report instead of a scoped one.
          reportError(error, { scope: 'auto_backup' });
        });
    };
    const triggerAutoBackup = () => {
      if (settleTimer) clearTimeout(settleTimer);
      interaction?.cancel();
      settleTimer = setTimeout(() => {
        settleTimer = null;
        interaction = runAfterInteractions(() => {
          interaction = null;
          runBackup();
        });
      }, AUTO_BACKUP_SETTLE_DELAY_MS);
    };
    triggerAutoBackup();
    const sub = RNAppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      triggerAutoBackup();
    });
    return () => {
      sub.remove();
      if (settleTimer) clearTimeout(settleTimer);
      interaction?.cancel();
    };
  }, [autoBackupEnabled, settingsLoaded, refreshSettings]);

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
      // The phone may have changed time zone while the app was away.
      syncLocalDaysWithTimeZone();
      const today = dayKeyFromDateLocal(new Date());
      if (today === lastFullRefreshDayRef.current) return;
      lastFullRefreshDayRef.current = today;
      refreshAll();
    });
    return () => {
      sub.remove();
    };
  }, [refreshAll]);

  const superPropCurrencyCode = settings?.currencyCode;
  const superPropLocale = settings?.locale;
  const superPropThemeMode = settings?.themeMode;
  const superPropThemeColor = settings?.themeColor;
  const superPropDisplayMode = settings?.displayMode;

  useEffect(() => {
    if (!superPropCurrencyCode) return;
    void setSuperProperties({
      currency_code: superPropCurrencyCode,
      locale: superPropLocale,
      theme_mode: superPropThemeMode,
      theme_color: superPropThemeColor,
      display_mode: superPropDisplayMode,
    });
  }, [
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
          monthlyWageRepository.saveForCurrentMonth(storedWageConfig(config, wageRateRef.current));
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
          monthlyWageRepository.saveForMonth(month, storedWageConfig(config, wageRateRef.current));
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

  // Reads the stored value, not the rendered one, so two quick taps on the eye
  // flip it twice instead of writing the same value twice.
  const toggleHideAccountBalances = useCallback(() => {
    const next = !settingsRepository.get().hideAccountBalances;
    runMutation(
      () => {
        settingsRepository.updateSettings({ hideAccountBalances: next });
      },
      { refresh: refreshSettings },
    );
  }, [refreshSettings, runMutation]);

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
      try {
        settingsRepository.updateInsightsPreferencesJson(normalized);
      } catch (error) {
        // A disk-full/disk-I/O write failure here would otherwise throw out of
        // a setState updater, tripping AppErrorBoundary instead of just
        // failing to persist this one preference (Sentry MONEY2TIME-2Z).
        reportError(error, { scope: 'insights_preferences' });
        return previous;
      }
      return normalized;
    });
  }, []);

  const updateCalendarPreferencesJson = useCallback((value: string | null) => {
    const normalized = value && value.trim().length > 0 ? value : null;
    setCalendarPreferencesJson((previous) => {
      if (previous === normalized) return previous;
      try {
        settingsRepository.updateCalendarPrefsJson(normalized);
      } catch (error) {
        reportError(error, { scope: 'calendar_preferences' });
        return previous;
      }
      return normalized;
    });
  }, []);

  const updateNotificationPrefs = useCallback(
    (updates: Partial<NotificationPreferences>) => {
      setNotificationPrefs((previous) => {
        const merged: NotificationPreferences = {
          dailyCheckin: { ...previous.dailyCheckin, ...updates.dailyCheckin },
          recurringAlert: { ...previous.recurringAlert, ...updates.recurringAlert },
          weeklyReview: { ...previous.weeklyReview, ...updates.weeklyReview },
          monthlyReview: { ...previous.monthlyReview, ...updates.monthlyReview },
          // Normalized on write as well as on read, so a caller cannot store a
          // day list that is out of order, duplicated, or not a weekday at all.
          liveEarningsStart: normalizeLiveEarningsSchedule({
            ...previous.liveEarningsStart,
            ...updates.liveEarningsStart,
          }),
        };
        try {
          settingsRepository.updateNotificationPreferencesJson(JSON.stringify(merged));
        } catch (error) {
          reportError(error, { scope: 'notifications' });
          return previous;
        }
        // No fresh bodies here — a prefs toggle only moves the schedule, and the
        // next load recomputes the figures anyway.
        scheduleReminders(merged, {
          weekStartsOn: weekStartsOnRef.current,
          firstDayOfMonth: monthCycleDefaultDay(monthCycleRef.current),
        });
        return merged;
      });
    },
    [scheduleReminders],
  );

  const updateQuickEntryPrefs = useCallback((updates: Partial<QuickEntryPrefs>) => {
    const previous = quickEntryPrefsRef.current;
    const merged: QuickEntryPrefs = {
      categoryMap: updates.categoryMap !== undefined ? updates.categoryMap : previous.categoryMap,
      defaultExpenseCategoryId:
        updates.defaultExpenseCategoryId !== undefined
          ? updates.defaultExpenseCategoryId
          : previous.defaultExpenseCategoryId,
      defaultIncomeCategoryId:
        updates.defaultIncomeCategoryId !== undefined
          ? updates.defaultIncomeCategoryId
          : previous.defaultIncomeCategoryId,
      defaultAccountId:
        updates.defaultAccountId !== undefined
          ? updates.defaultAccountId
          : previous.defaultAccountId,
      defaultCurrency:
        updates.defaultCurrency !== undefined ? updates.defaultCurrency : previous.defaultCurrency,
      voiceSkipConfirmation:
        updates.voiceSkipConfirmation !== undefined
          ? updates.voiceSkipConfirmation
          : previous.voiceSkipConfirmation,
      voiceUsageCount:
        updates.voiceUsageCount !== undefined ? updates.voiceUsageCount : previous.voiceUsageCount,
      autoLogUsageCount:
        updates.autoLogUsageCount !== undefined
          ? updates.autoLogUsageCount
          : previous.autoLogUsageCount,
      bulkCreateEnabled:
        updates.bulkCreateEnabled !== undefined
          ? updates.bulkCreateEnabled
          : previous.bulkCreateEnabled,
      backTapAction:
        updates.backTapAction !== undefined ? updates.backTapAction : previous.backTapAction,
      autoLogIncludeSubcategories:
        updates.autoLogIncludeSubcategories !== undefined
          ? updates.autoLogIncludeSubcategories
          : previous.autoLogIncludeSubcategories,
      saveScannedReceipts:
        updates.saveScannedReceipts !== undefined
          ? updates.saveScannedReceipts
          : previous.saveScannedReceipts,
      autoLogSaveScreenshot:
        updates.autoLogSaveScreenshot !== undefined
          ? updates.autoLogSaveScreenshot
          : previous.autoLogSaveScreenshot,
      autoLogAutoCategorize:
        updates.autoLogAutoCategorize !== undefined
          ? updates.autoLogAutoCategorize
          : previous.autoLogAutoCategorize,
      addUseActionSheet:
        updates.addUseActionSheet !== undefined
          ? updates.addUseActionSheet
          : previous.addUseActionSheet,
      addPrimaryAction:
        updates.addPrimaryAction !== undefined
          ? updates.addPrimaryAction
          : previous.addPrimaryAction,
      addSecondaryAction:
        updates.addSecondaryAction !== undefined
          ? updates.addSecondaryAction
          : previous.addSecondaryAction,
    };
    try {
      settingsRepository.updateQuickEntryPrefsJson(JSON.stringify(merged));
    } catch (error) {
      reportError(error, { scope: 'quick_entry_preferences' });
      return;
    }
    quickEntryPrefsRef.current = merged;
    setQuickEntryPrefs(merged);
  }, []);

  // Initialize notification handler and sync on mount
  useEffect(() => {
    initNotificationHandler();
    void initReviewPrompt();
  }, []);

  // The review reminders fire on the first day of the user's week and financial
  // month, so changing either in Display settings has to move the schedule.
  // `refreshAll` only reschedules on load, and these settings change in between.
  // It also runs when a load finishes and after a prefs change, both of which
  // have just scheduled from these same values: nothing to do then.
  const reviewWeekStartsOn = settings?.weekStartsOn;
  const reviewFirstDayOfMonth = settings?.firstDayOfMonth;
  useEffect(() => {
    if (isLoading || reviewWeekStartsOn === undefined || reviewFirstDayOfMonth === undefined) {
      return;
    }
    const scheduled = scheduledRemindersRef.current;
    if (
      scheduled &&
      scheduled.prefs === notificationPrefs &&
      scheduled.weekStartsOn === reviewWeekStartsOn &&
      scheduled.firstDayOfMonth === reviewFirstDayOfMonth
    ) {
      return;
    }
    scheduleReminders(notificationPrefs, {
      weekStartsOn: reviewWeekStartsOn,
      firstDayOfMonth: reviewFirstDayOfMonth,
    });
  }, [isLoading, notificationPrefs, reviewFirstDayOfMonth, reviewWeekStartsOn, scheduleReminders]);

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

  // Non-reactive count of transactions that carry a receipt image, read on
  // demand so the editor can gate receipt uploads on the free-plan limit
  // without subscribing to transaction churn.
  const getReceiptCount = useCallback(
    () => transactionsRef.current.reduce((total, tx) => (tx.receiptUri ? total + 1 : total), 0),
    [],
  );

  // Non-reactive count of transactions that are still unsettled split bills
  // (at least one unpaid, non-self split). Read on demand so the editor can gate
  // free-plan split-bill creation without subscribing to transaction churn.
  const getUnpaidSplitBillCount = useCallback(
    () => countUnpaidSplitBills(transactionsRef.current),
    [],
  );

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

  const orderedRateHistory = useMemo(
    () => buildNormalizedRateHistory(monthlyWages),
    [monthlyWages],
  );

  // A transaction's wage month follows the configurable month cycle, so a custom
  // month start values time-mode amounts against the right cycle's wage.
  // Defaults to 1 = plain calendar months.
  const monthCycle: MonthCycleInput = settings ? monthCycleOf(settings) : 1;

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
      const targetMonth = financialMonthKeyForIso(dateIso, monthCycle);
      return getHourlyRateForMonth(targetMonth);
    },
    [getHourlyRateForMonth, monthCycle],
  );

  const isTimeDisplayMode = settings?.displayMode === 'time';
  const valueForDisplay = useCallback(
    (amount: number, dateIso: string) => {
      if (!isTimeDisplayMode) {
        return amount;
      }
      const targetMonth = financialMonthKeyForIso(dateIso, monthCycle);
      const rate = getHourlyRateForMonth(targetMonth);
      return amountToHoursByRate(amount, rate);
    },
    [getHourlyRateForMonth, isTimeDisplayMode, monthCycle],
  );

  const displayValueByTransactionId = useMemo(() => {
    if (!isTimeDisplayMode) return null;
    const next = new Map<string, number>();
    const hourlyRateByMonth = new Map<string, number>();
    transactions.forEach((transaction) => {
      const monthKey = financialMonthKeyForIso(transaction.date, monthCycle);
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
  }, [getHourlyRateForMonth, isTimeDisplayMode, transactions, monthCycle]);

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

  // Whether a reimbursable expense (and the refund row paired with it) still
  // counts as spending. Only the analytics below read it; account balances and
  // statement periods always count every row.
  const reimbursementsCountAsExpense = settings?.reimbursementsCountAsExpense ?? true;

  // Stats for every album: each album's member ids (one query, re-read only
  // when `albums` reloads, which every membership change does) summed against
  // the loaded transactions. That keeps them in step with what is on screen,
  // optimistic rows included, without touching the database on a save.
  //
  // Built lazily, on the first `getAlbumStats` call after an input changed, and
  // `getAlbumStats` keeps one identity. As a memo keyed on `transactions` it
  // re-ran the stats query on every write whether or not an album was showing,
  // and its new identity changed the whole `useApp()` value, which re-rendered
  // every consumer in the app on each transaction save. Callers key their
  // memos on `useTransactions().transactions` instead.
  const albumStatsInputs = {
    albums,
    transactions,
    valueForDisplay,
    reimbursementsCountAsExpense,
  };
  const albumStatsInputsRef = useRef(albumStatsInputs);
  albumStatsInputsRef.current = albumStatsInputs;
  const albumMembershipRef = useRef<{
    albums: Album[];
    transactionIdsByAlbum: Map<string, string[]>;
  } | null>(null);
  const albumStatsCacheRef = useRef<{
    inputs: typeof albumStatsInputs;
    byId: Map<string, AlbumStats>;
  } | null>(null);

  const getAlbumStats = useCallback((albumId: string): AlbumStats => {
    const inputs = albumStatsInputsRef.current;
    let cache = albumStatsCacheRef.current;
    if (
      !cache ||
      cache.inputs.albums !== inputs.albums ||
      cache.inputs.transactions !== inputs.transactions ||
      cache.inputs.valueForDisplay !== inputs.valueForDisplay ||
      cache.inputs.reimbursementsCountAsExpense !== inputs.reimbursementsCountAsExpense
    ) {
      let membership = albumMembershipRef.current;
      if (!membership || membership.albums !== inputs.albums) {
        membership = {
          albums: inputs.albums,
          transactionIdsByAlbum:
            inputs.albums.length > 0
              ? albumsRepository.getAllTransactionIdsByAlbum()
              : new Map<string, string[]>(),
        };
        albumMembershipRef.current = membership;
      }
      cache = { inputs, byId: computeAlbumStats(inputs, membership.transactionIdsByAlbum) };
      albumStatsCacheRef.current = cache;
    }
    return cache.byId.get(albumId) ?? EMPTY_ALBUM_STATS;
  }, []);

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
    void trackEvent(AnalyticsEvents.ITEM_CREATED);
    return id;
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<CreateItemInput>) => {
    itemsRepository.update(id, updates);
    setItems(itemsRepository.list());
  }, []);

  const deleteItem = useCallback((id: string) => {
    // Custom item icons are shared through the icon picker, so — like account
    // logos — reclaim via the reference-aware GC only when the deleted item
    // carried a custom icon.
    const hadCustomIcon = isCustomLogoId(itemsRepository.list().find((i) => i.id === id)?.iconId);
    itemsRepository.softDelete(id);
    setItems(itemsRepository.list());
    if (hadCustomIcon) runDeferredWrite(() => runUserAssetGc());
  }, []);

  const reorderItems = useCallback((ids: string[]) => {
    itemsRepository.reorder(ids);
    setItems(itemsRepository.list());
  }, []);

  const createBudgetTemplate = useCallback(
    (input: CreateBudgetTemplateInput) => {
      const clock = { weekStartsOn: weekStartsOnRef.current, monthCycle: monthCycleRef.current };
      const result = runMutation(
        () => {
          const id = budgetTemplatesRepository.create({
            name: input.name,
            emoji: input.emoji ?? null,
            period: input.period,
            currency: storedBudgetCurrency(input.currency, reportingCurrencyRef.current),
            totalAmount: input.totalAmount,
            countUnbudgeted: input.countUnbudgeted ?? true,
            allocations: input.allocations,
          });
          const templates = budgetTemplatesRepository.list();
          const template = templates.find((candidate) => candidate.id === id);

          let backfilled = 0;
          if (template && input.backPopulate) {
            const range = computeBackPopulateRange({
              period: template.period,
              transactions: transactionsRef.current,
              existingKeys: periodBudgetsRepository.everExistedKeys(template.period),
              clock,
            });
            if (range) {
              backfilled = periodBudgetsRepository.createManyFromTemplate(
                range.keys,
                template,
                budgetRateToFreeze(template.currency, rateTableRef.current),
              ).length;
            }
          }

          // Saving a template (especially the first of its period) materializes
          // the current period's budget right away — rollover isn't deferred to
          // the next launch.
          autoCreateCurrentBudgets(templates, clock, rateTableRef.current, input.period);

          return { id, backfilled };
        },
        { refresh: refreshBudgets },
      );

      if (result.backfilled > 0) {
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, {
          source: 'backfill',
          period: input.period,
          months: result.backfilled,
        });
      }
      void trackEvent(AnalyticsEvents.BUDGET_TEMPLATE_CREATED, {
        categories: input.allocations.length,
        backPopulate: Boolean(input.backPopulate),
        period: input.period,
        // A Web Dashboard template names no currency.
        ...(input.currency !== undefined
          ? { currency: budgetCurrencyMode(input.currency, reportingCurrencyRef.current) }
          : {}),
      });
      return result.id;
    },
    [refreshBudgets, runMutation],
  );

  const updateBudgetTemplate = useCallback(
    (id: string, input: Omit<CreateBudgetTemplateInput, 'backPopulate'>) => {
      const before = budgetTemplatesRepository.list().find((template) => template.id === id);
      runMutation(
        () => {
          budgetTemplatesRepository.update(id, {
            name: input.name,
            emoji: input.emoji ?? null,
            period: input.period,
            ...(input.currency !== undefined
              ? { currency: storedBudgetCurrency(input.currency, reportingCurrencyRef.current) }
              : {}),
            totalAmount: input.totalAmount,
            countUnbudgeted: input.countUnbudgeted ?? true,
            allocations: input.allocations,
          });
          // A template moved to a period with no budget yet starts it now.
          if (before && before.period !== input.period) {
            autoCreateCurrentBudgets(
              budgetTemplatesRepository.list(),
              { weekStartsOn: weekStartsOnRef.current, monthCycle: monthCycleRef.current },
              rateTableRef.current,
              input.period,
            );
          }
        },
        { refresh: refreshBudgets },
      );
      sweepIfCustomAssetDropped(before?.emoji, input.emoji ?? null);
      void trackEvent(AnalyticsEvents.BUDGET_TEMPLATE_UPDATED, {
        categories: input.allocations.length,
        period: input.period,
        ...(input.currency !== undefined
          ? { currency: budgetCurrencyMode(input.currency, reportingCurrencyRef.current) }
          : {}),
      });
    },
    [refreshBudgets, runMutation],
  );

  const deleteBudgetTemplate = useCallback(
    (id: string) => {
      const hadCustomIcon = isCustomLogoId(
        budgetTemplatesRepository.list().find((template) => template.id === id)?.emoji,
      );
      runMutation(
        () => {
          budgetTemplatesRepository.softDelete(id);
        },
        { refresh: refreshBudgets },
      );
      if (hadCustomIcon) runDeferredWrite(() => runUserAssetGc());
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

  const getBudgetKeysEverExisted = useCallback(
    (period: BudgetPeriod) => periodBudgetsRepository.everExistedKeys(period),
    [],
  );

  const createPeriodBudget = useCallback(
    (key: string, templateId: string) => {
      const created = runMutation(
        () => {
          const template = budgetTemplatesRepository
            .list()
            .find((candidate) => candidate.id === templateId);
          if (!template || !isBudgetPeriodKey(template.period, key)) return null;
          // null = the period already had a live budget (double-tap, or the
          // auto-create raced us) — nothing was written, so don't report one.
          return periodBudgetsRepository.createFromTemplate(
            key,
            template,
            budgetRateToFreeze(template.currency, rateTableRef.current),
          ) != null
            ? template.period
            : null;
        },
        { refresh: refreshBudgets },
      );
      if (created) {
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, {
          source: 'manual',
          period: created,
        });
      }
    },
    [refreshBudgets, runMutation],
  );

  const createCustomPeriodBudget = useCallback(
    (period: BudgetPeriod, key: string, input: PeriodBudgetInput) => {
      if (!isBudgetPeriodKey(period, key)) return;
      const currency = storedBudgetCurrency(input.currency, reportingCurrencyRef.current);
      const id = runMutation(
        () =>
          periodBudgetsRepository.createCustom(period, key, {
            totalAmount: input.totalAmount,
            countUnbudgeted: input.countUnbudgeted,
            lines: input.lines,
            currency,
            fxRate: budgetRateToFreeze(currency, rateTableRef.current),
          }),
        { refresh: refreshBudgets },
      );
      if (id) {
        // A custom budget has no template whose event carried its currency.
        void trackEvent(AnalyticsEvents.BUDGET_MONTH_CREATED, {
          source: 'custom',
          period,
          ...(input.currency !== undefined
            ? { currency: budgetCurrencyMode(input.currency, reportingCurrencyRef.current) }
            : {}),
        });
      }
    },
    [refreshBudgets, runMutation],
  );

  const updatePeriodBudget = useCallback(
    (id: string, input: PeriodBudgetInput) => {
      const period = periodBudgetsRef.current.find((budget) => budget.id === id)?.period;
      const currency =
        input.currency !== undefined
          ? storedBudgetCurrency(input.currency, reportingCurrencyRef.current)
          : undefined;
      runMutation(
        () => {
          periodBudgetsRepository.update(id, {
            totalAmount: input.totalAmount,
            countUnbudgeted: input.countUnbudgeted,
            lines: input.lines,
            ...(currency !== undefined
              ? { currency, fxRate: budgetRateToFreeze(currency, rateTableRef.current) }
              : {}),
          });
        },
        { refresh: refreshBudgets },
      );
      void trackEvent(AnalyticsEvents.BUDGET_MONTH_UPDATED, {
        categories: input.lines.length,
        ...(period ? { period } : {}),
        ...(currency !== undefined
          ? { currency: budgetCurrencyMode(currency, reportingCurrencyRef.current) }
          : {}),
      });
    },
    [refreshBudgets, runMutation],
  );

  const deletePeriodBudget = useCallback(
    (id: string) => {
      // A period's frozen icon usually shares its file with the template it was
      // copied from, so this only reclaims once every referencing row is gone.
      const budget = periodBudgetsRef.current.find((candidate) => candidate.id === id);
      const hadCustomIcon = isCustomLogoId(budget?.templateEmoji);
      runMutation(
        () => {
          periodBudgetsRepository.softDelete(id);
        },
        { refresh: refreshBudgets },
      );
      if (hadCustomIcon) runDeferredWrite(() => runUserAssetGc());
      void trackEvent(
        AnalyticsEvents.BUDGET_MONTH_DELETED,
        budget ? { period: budget.period } : undefined,
      );
    },
    [refreshBudgets, runMutation],
  );

  // Ledgers

  const activeLedgerId = settings?.activeLedgerId ?? DEFAULT_LEDGER_ID;
  // A shared album's bills that came while its album's ledger was not the
  // open one are caught up when that ledger opens (and at launch).
  useEffect(() => {
    if (isLoading) return;
    if (syncAlbumGroups()) {
      setAlbums(albumsRepository.list());
      scheduleRefreshTransactions();
    }
  }, [activeLedgerId, isLoading, scheduleRefreshTransactions, syncAlbumGroups]);
  const activeLedger = useMemo<Ledger>(
    () =>
      ledgers.find((ledger) => ledger.id === activeLedgerId) ??
      ledgers.find((ledger) => ledger.id === DEFAULT_LEDGER_ID) ?? {
        id: DEFAULT_LEDGER_ID,
        name: null,
        emoji: null,
        currencyCode: null,
        currencySymbol: null,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
    [activeLedgerId, ledgers],
  );

  const refreshLedgers = useCallback(() => {
    setLedgers(ledgersRepository.list());
  }, []);

  const switchLedger = useCallback(
    (ledgerId: string) => {
      // Queued behind the writes already deferred (they run in order), so a
      // save still in flight lands in, and refreshes, the ledger it was made
      // in. Waiting for interactions also lets the switcher sheet close first.
      runDeferredWrite(() => {
        if (ledgerId === getActiveLedgerId()) return;
        if (!ledgersRepository.getById(ledgerId)) return;
        settingsRepository.updateActiveLedgerId(ledgerId);
        setActiveLedgerId(ledgerId);
        // Filters name the old ledger's accounts and categories.
        setTransactionFiltersState(DEFAULT_TRANSACTION_FILTERS);
        setActiveAccountFilter(null);
        // Drop the old ledger's rows rather than diff against them: no id is
        // shared between ledgers, so nothing could be reused.
        setTransactions([]);
        refreshAll();
        void trackEvent(AnalyticsEvents.LEDGER_SWITCHED, {
          to_default: ledgerId === DEFAULT_LEDGER_ID,
        });
      });
    },
    [refreshAll],
  );

  const createLedger = useCallback(
    (input: CreateLedgerInput) => {
      const {
        copyParts,
        copyMonthCycle,
        copyEverything = false,
        copyFromLedgerId,
        ...ledgerInput
      } = input;
      const sourceId = copyFromLedgerId ?? getActiveLedgerId();
      const parts = withCopyNeeds(copyEverything ? LEDGER_COPY_PARTS : copyParts);
      let ledgerId = '';
      try {
        getSQLite().withTransactionSync(() => {
          ledgerId = createLedgerRows(sourceId, ledgerInput, {
            everything: copyEverything,
            parts,
            monthCycle: copyEverything || copyMonthCycle,
          });
        });
      } catch (error) {
        // The transaction rolled back, so no half-made ledger is left behind.
        reportError(error, { scope: 'ledger_create' });
        throw toError(error, I18n.t('errors.generic_operation_failed'));
      }
      void trackEvent(AnalyticsEvents.LEDGER_CREATED, {
        ...Object.fromEntries(LEDGER_COPY_PARTS.map((part) => [`copied_${part}`, parts.has(part)])),
        copied_month_cycle: copyEverything || copyMonthCycle,
        copied_everything: copyEverything,
        copied_from_open: sourceId === getActiveLedgerId(),
        ledger_count: ledgersRepository.list().length,
      });
      switchLedger(ledgerId);
      return ledgerId;
    },
    [switchLedger],
  );

  const updateLedger = useCallback(
    (ledgerId: string, input: Partial<LedgerInput>) => {
      runMutation(() => ledgersRepository.update(ledgerId, input), { refresh: refreshLedgers });
    },
    [refreshLedgers, runMutation],
  );

  const deleteLedger = useCallback(
    (ledgerId: string) => {
      if (ledgerId === DEFAULT_LEDGER_ID) return;
      const remove = () => {
        runMutation(() => ledgersRepository.softDelete(ledgerId), { refresh: refreshLedgers });
        // Its receipts, covers and logos are orphans now, unless another ledger
        // still uses them (copied accounts share their logos).
        runDeferredWrite(() => runUserAssetGc());
        void trackEvent(AnalyticsEvents.LEDGER_DELETED);
      };
      if (ledgerId !== getActiveLedgerId()) {
        remove();
        return;
      }
      // The open ledger is never deleted under the user: open the default one
      // first. The switch is a deferred write, and deferred writes run in
      // order, so the delete queued after it runs once the switch has.
      switchLedger(DEFAULT_LEDGER_ID);
      runDeferredWrite(() => {
        if (ledgerId === getActiveLedgerId()) return;
        remove();
      });
    },
    [refreshLedgers, runMutation, switchLedger],
  );

  const getLedgerEntryCounts = useCallback(() => ledgersRepository.entryCounts(), []);

  const resetAllData = useCallback(() => {
    const historyUserId = settings?.appUserId;
    runMutation(() => {
      purgeAllData();
    });
    // Purging rows orphans every asset file on disk; reclaim them so they don't
    // linger in future backups.
    runDeferredWrite(() => {
      runUserAssetGc();
    });
    resetAutomationCaptureData(historyUserId);
    void cancelAllNotifications();
    void trackEvent(AnalyticsEvents.DATA_RESET, { scope: 'all' });
    void flushAnalytics();
  }, [runMutation, settings?.appUserId]);

  const resetTransactionsOnly = useCallback(() => {
    const historyUserId = settings?.appUserId;
    runMutation(() => {
      purgeTransactionsOnly();
      resetTransactionFilters();
    });
    resetAutomationCaptureData(historyUserId);
    // Deleting every transaction orphans their receipt images; reclaim them.
    runDeferredWrite(() => {
      runUserAssetGc();
    });
    void trackEvent(AnalyticsEvents.DATA_RESET, { scope: 'transactions_only' });
  }, [resetTransactionFilters, runMutation, settings?.appUserId]);

  const importMoneyManagerBackup = useCallback(
    async (uri: string, fileName?: string) => {
      const normalizedName = fileName?.trim().toLowerCase();
      if (normalizedName && !normalizedName.endsWith('.mmbak')) {
        throw new Error(I18n.t('errors.only_mmbak_supported'));
      }

      try {
        // Preserve app-level settings and hourly wage settings on manual imports.
        purgeDataForImport();
        resetAutomationCaptureData(settings?.appUserId);

        const symbol = settings?.currencySymbol ?? '$';
        const summary = await importMoneyManagerBackupFromUri(uri, symbol);
        // Money Manager rows are written with the currency symbol — normalize to
        // ISO codes so multi-currency treats them correctly, in the currency of
        // the ledger they were imported into.
        normalizeCurrencyColumns(getSQLite(), {
          mainCode: ledgersRepository.activeReportingCurrency().code,
        });
        // The importer writes icons via suggestCategoryIcon, but a re-import of
        // an older export can still carry bare glyphs; fold them in too.
        normalizeIconColumns(getSQLite());
        refreshAll();
        // The pre-import purge orphaned any prior receipt/cover files; reclaim them.
        runDeferredWrite(() => {
          runUserAssetGc();
        });
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
    [refreshAll, settings?.currencySymbol, settings?.appUserId],
  );

  const completeOnboarding = useCallback((options?: { seedDefaultAccounts?: boolean }) => {
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
      // "Skip setup" exit, the no-account-seed path, and a returning
      // user who somehow lands back in this flow.
      createdCategories = seedMinimalCategoriesIfMissing();
      if (createdCategories > 0) shouldRefreshCategories = true;

      if (options?.seedDefaultAccounts) {
        const accountCurrency = accountsRepository.list()[0]?.currency ?? preferredCurrency;
        createdAccounts = seedDefaultAccountsIfMissing(accountCurrency);
        shouldRefreshAccounts = true;
      }

      settingsRepository.updateSettings({
        onboardingCompleted: true,
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

      return { createdAccounts, createdCategories };
    } catch (error) {
      throw toError(error, I18n.t('errors.generic_operation_failed'));
    }
  }, []);

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

  // Savings-goal achievement detection. Lives here (not on any button) so
  // organic transfers, income, recurring auto-saves, and target edits all
  // count. goalAchievedAt is a persisted high-water stamp, so each goal
  // celebrates exactly once, including across restarts.
  const [pendingGoalCelebration, setPendingGoalCelebration] = useState<Account | null>(null);
  const clearGoalCelebration = useCallback(() => setPendingGoalCelebration(null), []);
  const stampedGoalIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading) return;
    for (const account of accounts) {
      if (account.type !== 'goal' || account.goalArchivedAt) continue;
      if (account.goalAchievedAt) {
        // The stamp made it to the store, so the ref entry (which only bridges
        // the write -> refresh window) can go. This also re-arms detection
        // after the editor clears the stamp by raising the target.
        stampedGoalIdsRef.current.delete(account.id);
        continue;
      }
      const target = account.goalTargetAmount;
      if (!target || target <= 0) continue;
      if (stampedGoalIdsRef.current.has(account.id)) continue;
      const balance = rawAccountBalances.find((b) => b.accountId === account.id)?.balance;
      if (balance == null || balance < target) continue;
      stampedGoalIdsRef.current.add(account.id);
      try {
        runMutation(
          () => {
            accountsRepository.update(account.id, { goalAchievedAt: nowIso() });
          },
          { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
        );
      } catch {
        // A failed stamp must not crash rendering; the next balance change retries.
        stampedGoalIdsRef.current.delete(account.id);
        continue;
      }
      setPendingGoalCelebration(account);
      void trackEvent(AnalyticsEvents.GOAL_ACHIEVED);
    }
  }, [accounts, isLoading, rawAccountBalances, refreshAccountsAndGroups, runMutation]);

  // Loan payoff detection, the liability mirror of the goal stamp above. Lives
  // here so a manual repayment, an auto-repayment rule, or a balance
  // correction all count. loanPaidOffAt is persisted, so one payoff celebrates
  // exactly once (including across restarts) and no more; drawing the loan down
  // again clears it, so settling it a second time celebrates again.
  const [pendingLoanCelebration, setPendingLoanCelebration] = useState<Account | null>(null);
  const clearLoanCelebration = useCallback(() => setPendingLoanCelebration(null), []);
  const stampedLoanIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading) return;
    for (const account of accounts) {
      if (account.type !== 'loan' || account.loanArchivedAt) continue;
      const balance = rawAccountBalances.find((b) => b.accountId === account.id)?.balance;
      if (balance == null) continue;
      // Sub-cent residue counts as settled, matching what the card displays.
      const isSettled = normalizeMoneyAmount(balance) <= 0;

      if (!isSettled) {
        // Owing money again (a drawdown, or a corrected balance). Drop the
        // stamp so paying it off a second time celebrates a second time.
        stampedLoanIdsRef.current.delete(account.id);
        if (account.loanPaidOffAt) {
          try {
            runMutation(
              () => {
                accountsRepository.update(account.id, { loanPaidOffAt: null });
              },
              { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
            );
          } catch {
            // Clearing is best-effort; a failure must not crash rendering, and
            // the next balance change retries.
          }
        }
        continue;
      }

      if (account.loanPaidOffAt) {
        // The stamp made it to the store, so the ref entry (which only bridges
        // the write -> refresh window) can go.
        stampedLoanIdsRef.current.delete(account.id);
        continue;
      }
      if (stampedLoanIdsRef.current.has(account.id)) continue;
      stampedLoanIdsRef.current.add(account.id);
      try {
        runMutation(
          () => {
            accountsRepository.update(account.id, { loanPaidOffAt: nowIso() });
          },
          { refresh: () => refreshAccountsAndGroups({ withBalances: false }) },
        );
      } catch {
        // A failed stamp must not crash rendering; the next balance change retries.
        stampedLoanIdsRef.current.delete(account.id);
        continue;
      }
      setPendingLoanCelebration(account);
      void trackEvent(AnalyticsEvents.LOAN_PAID_OFF);
    }
  }, [accounts, isLoading, rawAccountBalances, refreshAccountsAndGroups, runMutation]);

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
            setGoalArchived,
            pendingGoalCelebration,
            clearGoalCelebration,
            setLoanArchived,
            setAccountArchived,
            pendingLoanCelebration,
            clearLoanCelebration,
            createAccountGroup,
            renameAccountGroup,
            deleteAccountGroup,
            reorderAccountGroups,
            createRecurringRule,
            updateRecurringRule,
            deleteRecurringRule,
            instalmentPlans,
            createInstalmentPlan,
            convertTransactionToInstalmentPlan,
            updateInstalmentPlan,
            deleteInstalmentPlan,
            payNextInstalment,
            payOffInstalmentPlan,
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
            setAlbumPeople,
            syncAlbumGroups,
            publishAlbumGroup,
            addAlbumMember,
            renameAlbumMember,
            removeAlbumMember,
            claimAlbumMember,
            saveAlbumBill,
            detachAlbumBill,
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
            periodBudgets,
            createBudgetTemplate,
            updateBudgetTemplate,
            deleteBudgetTemplate,
            setDefaultBudgetTemplate,
            getBudgetKeysEverExisted,
            createPeriodBudget,
            createCustomPeriodBudget,
            updatePeriodBudget,
            deletePeriodBudget,
            createTransaction,
            updateTransaction,
            saveTransferFee,
            deleteTransaction,
            updateTransactionsBulk,
            deleteTransactionsBulk,
            createTransactionWithSplits,
            updateTransactionSplits,
            updateTransactionReceiptSplit,
            getReceiptSplitForTransaction,
            markSplitPaid,
            recordSplitPayment,
            markSplitUnpaid,
            updateSplitPaybackAccount,
            deleteSplit,
            payBackPayer,
            undoPayBackPayer,
            recordPayBack,
            undoPayBackPart,
            settleUpWithPerson,
            markTransactionReimbursed,
            unmarkTransactionReimbursed,
            updateSettings,
            updateWageConfig,
            updateWageConfigForMonth,
            deleteWageConfigForMonth,
            toggleDisplayMode,
            toggleHideAccountBalances,
            canUseTimeDisplayMode,
            getAccountById,
            getCategoryById,
            getTransactionCount,
            getReceiptCount,
            getUnpaidSplitBillCount,
            getTransactionsByAccount,
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
            paymentAlertPrefs,
            updatePaymentAlertPrefs,
            quickEntryPrefs,
            updateQuickEntryPrefs,
            completeOnboarding,
            ledgers,
            activeLedger,
            switchLedger,
            createLedger,
            updateLedger,
            deleteLedger,
            getLedgerEntryCounts,
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
      setGoalArchived,
      pendingGoalCelebration,
      clearGoalCelebration,
      setLoanArchived,
      setAccountArchived,
      pendingLoanCelebration,
      clearLoanCelebration,
      createAccountGroup,
      renameAccountGroup,
      deleteAccountGroup,
      reorderAccountGroups,
      createRecurringRule,
      updateRecurringRule,
      deleteRecurringRule,
      instalmentPlans,
      createInstalmentPlan,
      convertTransactionToInstalmentPlan,
      updateInstalmentPlan,
      deleteInstalmentPlan,
      payNextInstalment,
      payOffInstalmentPlan,
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
      setAlbumPeople,
      syncAlbumGroups,
      publishAlbumGroup,
      addAlbumMember,
      renameAlbumMember,
      removeAlbumMember,
      claimAlbumMember,
      saveAlbumBill,
      detachAlbumBill,
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
      periodBudgets,
      createBudgetTemplate,
      updateBudgetTemplate,
      deleteBudgetTemplate,
      setDefaultBudgetTemplate,
      getBudgetKeysEverExisted,
      createPeriodBudget,
      createCustomPeriodBudget,
      updatePeriodBudget,
      deletePeriodBudget,
      createTransaction,
      updateTransaction,
      saveTransferFee,
      deleteTransaction,
      updateTransactionsBulk,
      deleteTransactionsBulk,
      createTransactionWithSplits,
      updateTransactionSplits,
      updateTransactionReceiptSplit,
      getReceiptSplitForTransaction,
      markSplitPaid,
      recordSplitPayment,
      markSplitUnpaid,
      updateSplitPaybackAccount,
      deleteSplit,
      payBackPayer,
      undoPayBackPayer,
      recordPayBack,
      undoPayBackPart,
      settleUpWithPerson,
      markTransactionReimbursed,
      unmarkTransactionReimbursed,
      updateSettings,
      updateWageConfig,
      updateWageConfigForMonth,
      deleteWageConfigForMonth,
      toggleDisplayMode,
      toggleHideAccountBalances,
      canUseTimeDisplayMode,
      getAccountById,
      getCategoryById,
      getTransactionCount,
      getReceiptCount,
      getUnpaidSplitBillCount,
      getTransactionsByAccount,
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
      paymentAlertPrefs,
      updatePaymentAlertPrefs,
      quickEntryPrefs,
      updateQuickEntryPrefs,
      completeOnboarding,
      ledgers,
      activeLedger,
      switchLedger,
      createLedger,
      updateLedger,
      deleteLedger,
      getLedgerEntryCounts,
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

  // Every payback transfer by id, for the activity list's tint and folding.
  // Built once here (not per list) and kept in its own context, whose value
  // only changes when the paybacks do, so lists do not redraw on every write.
  const paybackIndexRef = useRef<ReadonlyMap<string, PaybackLink>>(EMPTY_PAYBACK_INDEX);
  const paybackIndex = useMemo(() => {
    const next = indexPaybacks(transactions);
    if (samePaybackIndex(paybackIndexRef.current, next)) return paybackIndexRef.current;
    paybackIndexRef.current = next;
    return next;
  }, [transactions]);
  // Each transfer's fee, for the editor and the lists; the same object back
  // while the fees do not change.
  const transferFeeIndexRef = useRef<TransferFeeIndex>(EMPTY_TRANSFER_FEE_INDEX);
  const transferFeeIndex = useMemo(() => {
    const next = buildTransferFeeIndex(transactions);
    if (sameTransferFeeIndex(transferFeeIndexRef.current, next)) {
      return transferFeeIndexRef.current;
    }
    transferFeeIndexRef.current = next;
    return next;
  }, [transactions]);
  // Paybacks with no transfer get a row of their own in the activity lists,
  // built from their split; the same array back while they do not change.
  const paybackRowsRef = useRef<TransactionWithRelations[]>(EMPTY_PAYBACK_ROWS);
  const paybackRows = useMemo(() => {
    const currencyById = new Map(accounts.map((account) => [account.id, account.currency]));
    const next = reusePaybackRows(
      paybackRowsRef.current,
      buildPaybackRows(transactions, (accountId) => currencyById.get(accountId), rateTable),
    ) as TransactionWithRelations[];
    paybackRowsRef.current = next.length === 0 ? EMPTY_PAYBACK_ROWS : next;
    return paybackRowsRef.current;
  }, [accounts, rateTable, transactions]);

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
        <PaybackIndexContext.Provider value={paybackIndex}>
          <TransferFeeIndexContext.Provider value={transferFeeIndex}>
            <PaybackRowsContext.Provider value={paybackRows}>
              {children}
            </PaybackRowsContext.Provider>
          </TransferFeeIndexContext.Provider>
        </PaybackIndexContext.Provider>
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
 * Gives the tree below it the transaction state as it was when `visible` was
 * last true. The shell wraps each of its always-mounted tabs in this, so a
 * write (a save, the balance refresh after it) re-renders the tab on screen
 * and not every tab behind it: a hidden tab keeps an unchanged context value
 * and React skips it, then catches up in a single render when it is shown.
 */
export function TransactionsWhileVisible({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  const live = useContext(TransactionsContext);
  const [held, setHeld] = useState(live);
  if (visible && held !== live) {
    // Render-phase state adjustment: React re-runs this render with the fresh
    // value before committing, without an extra commit.
    setHeld(live);
  }
  return (
    <TransactionsContext.Provider value={visible ? live : held}>
      {children}
    </TransactionsContext.Provider>
  );
}

/**
 * Subscribe to volatile transaction-derived state (transactions,
 * filteredTransactions, accountBalances, filters). Components that do NOT need
 * this data should use `useApp()` instead so they don't re-render on every
 * transaction mutation. Inside a hidden tab this is the state from when the tab
 * was last visible (see `TransactionsWhileVisible`).
 */
export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used within AppProvider');
  }
  return context;
}
