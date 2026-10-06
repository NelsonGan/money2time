import { DEFAULT_APP_ICON_ID, isAppIconId } from '~/constants/appIcons';
import type {
  AccountGroupRow,
  AccountRow,
  AlbumRow,
  AutoLogCaptureRow,
  BudgetTemplateCategoryRow,
  BudgetTemplateRow,
  CategoryRow,
  ExchangeRateRow,
  ItemRow,
  MonthlyBudgetCategoryRow,
  MonthlyBudgetRow,
  MonthlyWageSettingsRow,
  ReceiptSplitItemRow,
  ReceiptSplitItemShareRow,
  ReceiptSplitRow,
  RecurringRuleRow,
  SettingsRow,
  TransactionRow,
  TransactionSplitRow,
} from '~/lib/db/schema';
import type {
  Account,
  AccountGroup,
  Album,
  AppIconId,
  BackupTarget,
  BudgetTemplate,
  BudgetTemplateAllocation,
  Category,
  ExchangeRate,
  ExchangeRateSource,
  IconStyle,
  Item,
  LoanRateChange,
  MonthlyBudget,
  MonthlyBudgetLine,
  MonthlyWageSettings,
  PaymentAlertCapture,
  PaymentAlertChannel,
  PaymentAlertReason,
  PaymentAlertResolution,
  PaymentAlertStatus,
  ReceiptSplit,
  ReceiptSplitItem,
  ReceiptSplitItemShare,
  RecurringTransactionRule,
  ThemeColor,
  ThemeMode,
  Transaction,
  TransactionSentiment,
  TransactionSplit,
  TransactionWithRelations,
  UserSettings,
  WeekStartsOn,
} from '~/types';
import { clampFirstDayOfMonth } from '~/utils/financialMonth';

function asAccountType(value: string): Account['type'] {
  switch (value) {
    case 'debit':
    case 'credit':
    case 'goal':
    case 'loan':
      return value;
    // Backward compatibility for old persisted values. Note 'savings' is a
    // legacy import string that folds to debit; the savings-goal type uses
    // the distinct literal 'goal' precisely so those rows never flip.
    case 'cash':
    case 'bank':
    case 'wallet':
    case 'savings':
    case 'other':
      return 'debit';
    default:
      return 'debit';
  }
}

function asCategoryType(value: string): Category['type'] {
  return value === 'income' ? 'income' : 'expense';
}

function asTransactionType(value: string): Transaction['type'] {
  switch (value) {
    case 'income':
    case 'expense':
    case 'transfer':
    case 'balance_adjustment':
      return value;
    default:
      return 'expense';
  }
}

function asTransactionSentiment(value: string | null | undefined): TransactionSentiment {
  switch (value) {
    case 'happy':
    case 'neutral':
    case 'sad':
      return value;
    default:
      return 'neutral';
  }
}

function asRecurrencePattern(value: string): Transaction['recurrencePattern'] {
  switch (value) {
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'yearly':
    case 'none':
      return value;
    default:
      return 'none';
  }
}

function asDisplayMode(value: string): UserSettings['displayMode'] {
  return value === 'time' ? 'time' : 'money';
}

function asThemeMode(value: string | null | undefined): ThemeMode {
  if (value === 'light' || value === 'dark') return value;
  return 'system';
}

function asThemeColor(value: string | null | undefined): ThemeColor {
  switch (value) {
    case 'sage':
    case 'ocean':
    case 'terracotta':
    case 'slate':
    case 'amber':
    case 'indigo':
    case 'emerald':
    case 'rosewood':
      return value;
    case 'berry':
      return 'rosewood';
    default:
      return 'rosewood';
  }
}

function asIconStyle(value: string | null | undefined): IconStyle {
  return value === 'flat' ? 'flat' : 'clay';
}

function asAppIconId(value: string | null | undefined): AppIconId {
  return isAppIconId(value) ? value : DEFAULT_APP_ICON_ID;
}

function asWeekStartsOn(value: number | null | undefined): WeekStartsOn {
  if (value === 0 || value === 6) return value;
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 1;
}

function asFirstDayOfMonth(value: number | null | undefined): number {
  return clampFirstDayOfMonth(value);
}

function asBackupTarget(value: string | null | undefined): BackupTarget {
  switch (value) {
    case 'icloud':
    case 'googleDrive':
    case 'local':
      return value;
    default:
      return 'local';
  }
}

function asWageType(value: string): MonthlyWageSettings['wageType'] {
  switch (value) {
    case 'hourly':
    case 'monthly':
    case 'yearly':
      return value;
    default:
      return 'monthly';
  }
}

/**
 * The rate changes column, read defensively: it is JSON a backup could have
 * carried in from anywhere, so anything that is not a well-formed change is
 * dropped rather than allowed to break the loan's ledger. Null when there are
 * none, which is how the walk reads "one rate throughout".
 */
export function parseLoanRateChanges(json: string | null): LoanRateChange[] | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const changes = parsed.filter(
    (entry): entry is LoanRateChange =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { from?: unknown }).from === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test((entry as { from: string }).from) &&
      typeof (entry as { annualRatePercent?: unknown }).annualRatePercent === 'number' &&
      Number.isFinite((entry as { annualRatePercent: number }).annualRatePercent),
  );
  return changes.length > 0
    ? changes.map((entry) => ({ from: entry.from, annualRatePercent: entry.annualRatePercent }))
    : null;
}

/** The inverse of {@link parseLoanRateChanges}; null when there is nothing to store. */
export function serializeLoanRateChanges(
  changes: readonly LoanRateChange[] | null | undefined,
): string | null {
  if (!changes || changes.length === 0) return null;
  return JSON.stringify(
    changes.map((change) => ({ from: change.from, annualRatePercent: change.annualRatePercent })),
  );
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder ?? 0,
    type: asAccountType(row.type),
    accountGroup: row.accountGroup,
    logoId: row.logoId ?? null,
    creditStatementDay: row.creditStatementDay,
    creditDueDay: row.creditDueDay,
    currency: row.currency,
    startingBalance: row.startingBalance,
    includeInTotals: row.includeInTotals,
    goalTargetAmount: row.goalTargetAmount,
    goalTargetDate: row.goalTargetDate,
    goalEmoji: row.goalEmoji,
    goalCoverUri: row.goalCoverUri,
    goalAchievedAt: row.goalAchievedAt,
    goalArchivedAt: row.goalArchivedAt,
    loanInterestModel:
      row.loanInterestModel === 'reducing' || row.loanInterestModel === 'flat'
        ? row.loanInterestModel
        : null,
    loanOriginalPrincipal: row.loanOriginalPrincipal,
    loanMonthlyPayment: row.loanMonthlyPayment,
    loanPaymentDay: row.loanPaymentDay,
    loanInterestRate: row.loanInterestRate,
    loanTermMonths: row.loanTermMonths,
    loanTotalRepayable: row.loanTotalRepayable,
    loanStartDate: row.loanStartDate,
    loanLedgerAnchorDate: row.loanLedgerAnchorDate ?? null,
    loanRateChanges: parseLoanRateChanges(row.loanRateChangesJson ?? null),
    loanPaidOffAt: row.loanPaidOffAt,
    loanArchivedAt: row.loanArchivedAt,
    loanCountAsExpense: row.loanCountAsExpense ?? null,
    loanPaymentCategoryId: row.loanPaymentCategoryId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    name: row.name,
    coverPhotoUri: row.coverPhotoUri ?? null,
    isActive: row.isActive ?? false,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    placeId: row.placeId ?? null,
    placeName: row.placeName ?? null,
    placeAdmin: row.placeAdmin ?? null,
    countryCode: row.countryCode ?? null,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    iconId: row.iconId ?? null,
    purchasePrice: row.purchasePrice ?? 0,
    currency: row.currency,
    purchaseDate: row.purchaseDate,
    endDate: row.endDate ?? null,
    salePrice: row.salePrice ?? null,
    note: row.note ?? null,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toBudgetTemplateAllocation(
  row: BudgetTemplateCategoryRow,
): BudgetTemplateAllocation {
  return {
    id: row.id,
    categoryId: row.categoryId,
    amount: row.amount ?? 0,
    sortOrder: row.sortOrder ?? 0,
  };
}

export function toBudgetTemplate(
  row: BudgetTemplateRow,
  allocations: BudgetTemplateAllocation[],
): BudgetTemplate {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? null,
    totalAmount: row.totalAmount ?? 0,
    isDefault: row.isDefault ?? false,
    countUnbudgeted: row.countUnbudgeted ?? true,
    sortOrder: row.sortOrder ?? 0,
    allocations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toMonthlyBudgetLine(row: MonthlyBudgetCategoryRow): MonthlyBudgetLine {
  return {
    id: row.id,
    categoryId: row.categoryId,
    amount: row.amount ?? 0,
    sortOrder: row.sortOrder ?? 0,
  };
}

export function toMonthlyBudget(row: MonthlyBudgetRow, lines: MonthlyBudgetLine[]): MonthlyBudget {
  return {
    id: row.id,
    month: row.month,
    templateId: row.templateId ?? null,
    templateName: row.templateName ?? null,
    templateEmoji: row.templateEmoji ?? null,
    totalAmount: row.totalAmount ?? 0,
    countUnbudgeted: row.countUnbudgeted ?? true,
    lines,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toAccountGroup(row: AccountGroupRow): AccountGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder ?? 0,
    type: asCategoryType(row.type),
    parentId: row.parentId,
    icon: row.icon,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: asTransactionType(row.type),
    amount: row.amount,
    currency: row.currency,
    reportingCurrency: row.reportingCurrency ?? null,
    reportingAmount: row.reportingAmount ?? null,
    fxRate: row.fxRate ?? null,
    toAmount: row.toAmount ?? null,
    accountAmount: row.accountAmount ?? null,
    date: row.date,
    accountId: row.accountId,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    note: row.note,
    receiptUri: row.receiptUri ?? null,
    recurrencePattern: asRecurrencePattern(row.recurrencePattern),
    recurrenceInterval: Math.max(1, Math.trunc(row.recurrenceInterval ?? 1)),
    recurrenceEndDate: row.recurrenceEndDate,
    recurrenceParentId: row.recurrenceParentId,
    sentiment: asTransactionSentiment(row.sentiment),
    reimbursable: !!row.reimbursable,
    reimbursedAt: row.reimbursedAt ?? null,
    reimbursementAccountId: row.reimbursementAccountId ?? null,
    reimbursementTransactionId: row.reimbursementTransactionId ?? null,
    reimbursementOfId: row.reimbursementOfId ?? null,
    countsAsExpense: !!row.countsAsExpense,
    dayOrder: row.dayOrder ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/**
 * The transaction columns, in the order {@link toTransactionWithRelationsFromRaw}
 * reads them, for queries that fetch rows as plain value arrays
 * (`executeForRawResultSync`) rather than keyed objects. Reading every
 * transaction that way and building each object once is several times faster
 * than a Drizzle select followed by `toTransaction` and a second pass to add
 * the relation names, which is what loading a long history used to cost.
 * Aliased to `t`, followed by the relation columns the caller joins in.
 */
export const TRANSACTION_RAW_COLUMNS_SQL = `
  t.id, t.type, t.amount, t.currency, t.reporting_currency, t.reporting_amount,
  t.fx_rate, t.to_amount, t.account_amount, t.date, t.account_id,
  t.from_account_id, t.to_account_id, t.category_id, t.note, t.receipt_uri,
  t.recurrence_pattern, t.recurrence_interval, t.recurrence_end_date,
  t.recurrence_parent_id, t.sentiment, t.reimbursable, t.reimbursed_at,
  t.reimbursement_account_id, t.reimbursement_transaction_id, t.reimbursement_of_id,
  t.counts_as_expense, t.day_order, t.created_at, t.updated_at, t.deleted_at`;

type RawValue = string | number | null;

/**
 * Maps one raw row of {@link TRANSACTION_RAW_COLUMNS_SQL} followed by the seven
 * relation columns (account, from-account and to-account names, category
 * name, category icon, category parent id, parent name). Mirrors
 * {@link toTransaction} field for field; the mapper test holds the two together.
 */
export function toTransactionWithRelationsFromRaw(
  values: readonly RawValue[],
): TransactionWithRelations {
  return {
    id: values[0] as string,
    type: asTransactionType(values[1] as string),
    amount: values[2] as number,
    currency: values[3] as string,
    reportingCurrency: (values[4] as string | null) ?? null,
    reportingAmount: (values[5] as number | null) ?? null,
    fxRate: (values[6] as number | null) ?? null,
    toAmount: (values[7] as number | null) ?? null,
    accountAmount: (values[8] as number | null) ?? null,
    date: values[9] as string,
    accountId: values[10] as string | null,
    fromAccountId: values[11] as string | null,
    toAccountId: values[12] as string | null,
    categoryId: values[13] as string | null,
    note: values[14] as string | null,
    receiptUri: (values[15] as string | null) ?? null,
    recurrencePattern: asRecurrencePattern(values[16] as string),
    recurrenceInterval: Math.max(1, Math.trunc((values[17] as number | null) ?? 1)),
    recurrenceEndDate: values[18] as string | null,
    recurrenceParentId: values[19] as string | null,
    sentiment: asTransactionSentiment(values[20] as string | null),
    reimbursable: !!values[21],
    reimbursedAt: (values[22] as string | null) ?? null,
    reimbursementAccountId: (values[23] as string | null) ?? null,
    reimbursementTransactionId: (values[24] as string | null) ?? null,
    reimbursementOfId: (values[25] as string | null) ?? null,
    countsAsExpense: !!values[26],
    dayOrder: (values[27] as number | null) ?? null,
    createdAt: values[28] as string,
    updatedAt: values[29] as string,
    deletedAt: values[30] as string | null,
    accountName: (values[31] as string | null) ?? null,
    fromAccountName: (values[32] as string | null) ?? null,
    toAccountName: (values[33] as string | null) ?? null,
    categoryName: (values[34] as string | null) ?? null,
    categoryParentId: (values[36] as string | null) ?? null,
    categoryParentName: (values[37] as string | null) ?? null,
    categoryIcon: (values[35] as string | null) ?? null,
  };
}

export function toTransactionSplit(row: TransactionSplitRow): TransactionSplit {
  return {
    id: row.id,
    transactionId: row.transactionId,
    personName: row.personName,
    amount: row.amount,
    isSelf: !!row.isSelf,
    paybackAccountId: row.paybackAccountId,
    paidAt: row.paidAt,
    paidTransactionId: row.paidTransactionId,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toReceiptSplitItemShare(row: ReceiptSplitItemShareRow): ReceiptSplitItemShare {
  return {
    id: row.id,
    itemId: row.itemId,
    personName: row.personName,
    isSelf: !!row.isSelf,
    weight: row.weight ?? 1,
  };
}

export function toReceiptSplitItem(
  row: ReceiptSplitItemRow,
  shares: ReceiptSplitItemShare[],
): ReceiptSplitItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity ?? 1,
    lineTotal: row.lineTotal ?? 0,
    sortOrder: row.sortOrder ?? 0,
    shares,
  };
}

export function toReceiptSplit(row: ReceiptSplitRow, items: ReceiptSplitItem[]): ReceiptSplit {
  return {
    id: row.id,
    transactionId: row.transactionId,
    currency: row.currency,
    merchant: row.merchant,
    receiptDate: row.receiptDate,
    source: row.source === 'scan' ? 'scan' : 'manual',
    receiptImageUri: row.receiptImageUri,
    items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toRecurringRule(row: RecurringRuleRow): RecurringTransactionRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'income' ? 'income' : row.type === 'transfer' ? 'transfer' : 'expense',
    amount: row.amount,
    currency: row.currency,
    toAmount: row.toAmount ?? null,
    accountId: row.accountId,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    note: row.note,
    logoId: row.logoId ?? null,
    recurrencePattern:
      row.recurrencePattern === 'daily'
        ? 'daily'
        : row.recurrencePattern === 'weekly'
          ? 'weekly'
          : row.recurrencePattern === 'yearly'
            ? 'yearly'
            : 'monthly',
    recurrenceInterval: Math.max(1, Math.trunc(row.recurrenceInterval ?? 1)),
    nextRunDate: row.nextRunDate,
    endDate: row.endDate,
    isActive: row.isActive,
    countsAsExpense: !!row.countsAsExpense,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toSettings(row: SettingsRow): UserSettings {
  return {
    id: row.id,
    appUserId: row.appUserId,
    locale: row.locale,
    currencyCode: row.currencyCode,
    currencySymbol: row.currencySymbol,
    displayMode: asDisplayMode(row.displayMode),
    workdayDisplayEnabled: row.workdayDisplayEnabled ?? false,
    workingHoursPerDay:
      Number.isFinite(row.workingHoursPerDay) && row.workingHoursPerDay >= 1
        ? Math.min(row.workingHoursPerDay, 24)
        : 8,
    hapticsEnabled: row.hapticsEnabled ?? true,
    themeMode: asThemeMode(row.themeMode),
    themeColor: asThemeColor(row.themeColor),
    iconStyle: asIconStyle(row.iconStyle),
    appIcon: asAppIconId(row.appIcon),
    accountLogoCountry: row.accountLogoCountry ?? null,
    subscriptionLogoCountry: row.subscriptionLogoCountry ?? null,
    profileName: row.profileName ?? null,
    profileAvatarUri: row.profileAvatarUri ?? null,
    onboardingCompleted: row.onboardingCompleted,
    weekStartsOn: asWeekStartsOn(row.weekStartsOn),
    firstDayOfMonth: asFirstDayOfMonth(row.firstDayOfMonth),
    firstDayOverridesJson: row.firstDayOverridesJson ?? null,
    biometricLockEnabled: row.biometricLockEnabled ?? false,
    biometricLockDelaySeconds: row.biometricLockDelaySeconds ?? 900,
    autoBackupEnabled: row.autoBackupEnabled ?? true,
    autoBackupTarget: asBackupTarget(row.autoBackupTarget),
    lastAutoBackupAt: row.lastAutoBackupAt,
    lastAutoBackupError: row.lastAutoBackupError,
    autoFxRefreshEnabled: row.autoFxRefreshEnabled ?? true,
    lastRateFetchAt: row.lastRateFetchAt ?? null,
    lastRateFetchError: row.lastRateFetchError ?? null,
    fxCurrenciesJson: row.fxCurrenciesJson ?? null,
    firstAppOpen: row.firstAppOpen ?? null,
    paymentQrUri: row.paymentQrUri ?? null,
    defaultPaybackAccountId: row.defaultPaybackAccountId ?? null,
    reimbursementsCountAsExpense: row.reimbursementsCountAsExpense ?? true,
    showTransactionAccount: row.showTransactionAccount ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function asExchangeRateSource(value: string | null | undefined): ExchangeRateSource {
  return value === 'manual' ? 'manual' : 'api';
}

export function toExchangeRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: row.rate,
    asOfDate: row.asOfDate,
    source: asExchangeRateSource(row.source),
    updatedAt: row.updatedAt,
  };
}

export function toMonthlyWageSettings(row: MonthlyWageSettingsRow): MonthlyWageSettings {
  return {
    id: row.id,
    month: row.month,
    wageType: asWageType(row.wageType),
    wageAmount: row.wageAmount,
    hoursWorkedPerWeek: row.hoursWorkedPerWeek,
    workdaysPerWeek: row.workdaysPerWeek,
    commuteMinutesPerWorkday: row.commuteMinutesPerWorkday,
    baseHourlyRate: row.baseHourlyRate,
    trueHourlyRate: row.trueHourlyRate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

const ALERT_CHANNELS: readonly PaymentAlertChannel[] = [
  'android_notification',
  'ios_alert',
  'paste',
  'share_text',
  'apple_pay',
];
const ALERT_STATUSES: readonly PaymentAlertStatus[] = [
  'pending',
  'logged',
  'dismissed',
  'ignored',
  'duplicate',
  'failed',
];

/**
 * Read the saved resolution, ignoring missing or unreadable JSON. Older records
 * may not include the resolved currency.
 */
function parseAlertResolution(json: string | null): PaymentAlertResolution | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Partial<PaymentAlertResolution>;
    if (!row.parse || typeof row.parse !== 'object') return null;
    return {
      parse: row.parse,
      ...(typeof row.scanCurrency === 'string' ? { scanCurrency: row.scanCurrency } : {}),
      currency: typeof row.currency === 'string' ? row.currency : (row.parse.currency ?? null),
      accountId: typeof row.accountId === 'string' ? row.accountId : null,
      certainty: row.certainty ?? 'none',
      bindingReason: row.bindingReason ?? 'none',
      identifier: typeof row.identifier === 'string' ? row.identifier : null,
      candidateAccountIds: Array.isArray(row.candidateAccountIds) ? row.candidateAccountIds : [],
      categoryId: typeof row.categoryId === 'string' ? row.categoryId : null,
      categoryOrigin: row.categoryOrigin ?? null,
      draftType: row.draftType ?? null,
      transferFromAccountId:
        typeof row.transferFromAccountId === 'string' ? row.transferFromAccountId : null,
      transferToAccountId:
        typeof row.transferToAccountId === 'string' ? row.transferToAccountId : null,
    };
  } catch {
    return null;
  }
}

export function toPaymentAlertCapture(row: AutoLogCaptureRow): PaymentAlertCapture {
  return {
    id: row.id,
    channel: ALERT_CHANNELS.find((channel) => channel === row.channel) ?? 'paste',
    sourceKey: row.sourceKey,
    sourceLabel: row.sourceLabel ?? null,
    capturedAt: row.capturedAt,
    nativeKey: row.nativeKey ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    status: ALERT_STATUSES.find((status) => status === row.status) ?? 'pending',
    reason: (row.reason as PaymentAlertReason | null) ?? null,
    resolution: parseAlertResolution(row.resolutionJson ?? null),
    parserVersion: row.parserVersion ?? 0,
    transactionId: row.transactionId ?? null,
    duplicateOf: row.duplicateOf ?? null,
    dedupeKey: row.dedupeKey ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  };
}
