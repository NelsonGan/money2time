import { DEFAULT_APP_ICON_ID, isAppIconId } from '~/constants/appIcons';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import type {
  AccountGroupRow,
  AccountRow,
  AlbumExpenseRow,
  AlbumMemberRow,
  AlbumRow,
  AlbumSettlementRow,
  AutoLogCaptureRow,
  BudgetTemplateCategoryRow,
  BudgetTemplateRow,
  CategoryRow,
  ExchangeRateRow,
  ItemRow,
  LedgerRow,
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
  AlbumExpense,
  AlbumMember,
  AlbumPerson,
  AlbumSettlement,
  AlbumShare,
  AppIconId,
  BackupTarget,
  BudgetPeriod,
  BudgetTemplate,
  BudgetTemplateAllocation,
  Category,
  ExchangeRate,
  ExchangeRateSource,
  IconStyle,
  Item,
  Ledger,
  LoanRateChange,
  MonthlyWageSettings,
  PaymentAlertCapture,
  PaymentAlertChannel,
  PaymentAlertReason,
  PaymentAlertResolution,
  PaymentAlertStatus,
  PeriodBudget,
  PeriodBudgetLine,
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
import { isAnchorDay } from '~/utils/recurringRules';

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
    cardDesign: row.cardDesign ?? null,
    creditStatementDay: row.creditStatementDay,
    creditDueDay: row.creditDueDay,
    creditDueDaysAfterStatement: row.creditDueDaysAfterStatement ?? null,
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
    archivedAt: row.archivedAt ?? null,
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
    splitWith: parseAlbumPeople(row.splitWithJson),
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** `albums.split_with_json`: the people of an album that is not shared. */
export function parseAlbumPeople(json: string | null | undefined): AlbumPerson[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const people: AlbumPerson[] = [];
    for (const item of parsed) {
      const entry = item as { id?: unknown; name?: unknown } | null;
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (typeof entry?.id === 'string' && entry.id && name) people.push({ id: entry.id, name });
    }
    return people;
  } catch {
    return [];
  }
}

export function toAlbumMember(row: AlbumMemberRow): AlbumMember {
  return {
    id: row.id,
    groupId: row.ledgerId,
    name: row.name,
    userId: row.userId ?? null,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** `album_expenses.shares_json`: each member's share of the bill. */
export function parseAlbumShares(json: string | null | undefined): AlbumShare[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const shares: AlbumShare[] = [];
    for (const item of parsed) {
      const entry = item as { memberId?: unknown; amount?: unknown } | null;
      const amount = Number(entry?.amount);
      if (typeof entry?.memberId === 'string' && entry.memberId && Number.isFinite(amount)) {
        shares.push({ memberId: entry.memberId, amount: Math.max(0, amount) });
      }
    }
    return shares;
  } catch {
    return [];
  }
}

export function toAlbumExpense(row: AlbumExpenseRow): AlbumExpense {
  return {
    id: row.id,
    groupId: row.ledgerId,
    date: row.date,
    note: row.note ?? null,
    amount: row.amount,
    currency: row.currency,
    categoryName: row.categoryName ?? null,
    categoryIcon: row.categoryIcon ?? null,
    paidBy: row.paidBy,
    shares: parseAlbumShares(row.sharesJson),
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toAlbumSettlement(row: AlbumSettlementRow): AlbumSettlement {
  return {
    id: row.id,
    groupId: row.ledgerId,
    expenseId: row.expenseId ?? null,
    fromMember: row.fromMember,
    toMember: row.toMember,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    createdBy: row.createdBy ?? null,
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
    period: toBudgetPeriod(row.period),
    currency: row.currency ?? null,
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

/** A stored period; anything unknown (a row from a future app) reads as monthly. */
function toBudgetPeriod(value: string | null | undefined): BudgetPeriod {
  return value === 'week' || value === 'year' ? value : 'month';
}

export function toPeriodBudgetLine(row: MonthlyBudgetCategoryRow): PeriodBudgetLine {
  return {
    id: row.id,
    categoryId: row.categoryId,
    amount: row.amount ?? 0,
    sortOrder: row.sortOrder ?? 0,
  };
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function toPeriodBudget(row: MonthlyBudgetRow, lines: PeriodBudgetLine[]): PeriodBudget {
  return {
    id: row.id,
    period: toBudgetPeriod(row.period),
    periodKey: row.month,
    templateId: row.templateId ?? null,
    templateName: row.templateName ?? null,
    templateEmoji: row.templateEmoji ?? null,
    totalAmount: row.totalAmount ?? 0,
    countUnbudgeted: row.countUnbudgeted ?? true,
    currency: row.currency ?? null,
    fxRate: positiveOrNull(row.fxRate),
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
    details: row.details ?? null,
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
    feeOfId: row.feeOfId ?? null,
    dayOrder: row.dayOrder ?? null,
    instalmentRuleId: row.instalmentRuleId ?? null,
    instalmentNumber: row.instalmentNumber ?? null,
    createdBy: row.createdBy ?? null,
    memberId: row.memberId ?? null,
    albumGroupId: row.albumGroupId ?? null,
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
 * Aliased to `t`, followed by the eight relation values. The launch load
 * reads them in two parts and puts each row back in this order
 * ({@link createTransactionAssembler}).
 */
export const TRANSACTION_RAW_COLUMNS_SQL = `
  t.id, t.type, t.amount, t.currency, t.reporting_currency, t.reporting_amount,
  t.fx_rate, t.to_amount, t.account_amount, t.date, t.account_id,
  t.from_account_id, t.to_account_id, t.category_id, t.note, t.receipt_uri,
  t.recurrence_pattern, t.recurrence_interval, t.recurrence_end_date,
  t.recurrence_parent_id, t.sentiment, t.reimbursable, t.reimbursed_at,
  t.reimbursement_account_id, t.reimbursement_transaction_id, t.reimbursement_of_id,
  t.counts_as_expense, t.day_order, t.created_at, t.updated_at, t.deleted_at, t.details,
  t.instalment_rule_id, t.instalment_number, t.created_by, t.member_id, t.fee_of_id,
  t.album_group_id`;

type RawValue = string | number | null;

/**
 * Maps one raw row of {@link TRANSACTION_RAW_COLUMNS_SQL} followed by the eight
 * relation columns (account, from-account and to-account names, category
 * name, category icon, category parent id, parent name, and the instalment
 * plan's number of payments). Mirrors
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
    details: (values[31] as string | null) ?? null,
    instalmentRuleId: (values[32] as string | null) ?? null,
    instalmentNumber: (values[33] as number | null) ?? null,
    createdBy: (values[34] as string | null) ?? null,
    memberId: (values[35] as string | null) ?? null,
    feeOfId: (values[36] as string | null) ?? null,
    albumGroupId: (values[37] as string | null) ?? null,
    accountName: (values[38] as string | null) ?? null,
    fromAccountName: (values[39] as string | null) ?? null,
    toAccountName: (values[40] as string | null) ?? null,
    categoryName: (values[41] as string | null) ?? null,
    categoryParentId: (values[43] as string | null) ?? null,
    categoryParentName: (values[44] as string | null) ?? null,
    categoryIcon: (values[42] as string | null) ?? null,
    instalmentCount: (values[45] as number | null) ?? null,
  };
}

const TRANSACTION_RAW_COLUMNS = TRANSACTION_RAW_COLUMNS_SQL.split(',').map((column) =>
  column.trim().replace(/^t\./, ''),
);

/**
 * The columns that hold their default on nearly every row, and that default as
 * SQLite stores it: each belongs to a feature most entries never use (a
 * receipt photo, a mood, a reimbursement, an instalment plan, a shared
 * ledger). Reading a value into JavaScript costs about the same whether it is
 * a string or NULL, so the launch load reads the other fifteen columns for
 * every row and these only for the rows where one of them is set
 * ({@link TRANSACTION_SPARSE_FILTER_SQL}); on 20,000 rows that halved the
 * query. A column added to the table belongs here when most rows leave it at
 * its default; the mapper test fails until it is in one list or the other.
 */
const TRANSACTION_SPARSE_DEFAULTS: Readonly<Record<string, RawValue>> = {
  to_amount: null,
  account_amount: null,
  receipt_uri: null,
  recurrence_pattern: 'none',
  recurrence_interval: 1,
  recurrence_end_date: null,
  recurrence_parent_id: null,
  sentiment: 'neutral',
  reimbursable: 0,
  reimbursed_at: null,
  reimbursement_account_id: null,
  reimbursement_transaction_id: null,
  reimbursement_of_id: null,
  counts_as_expense: 0,
  day_order: null,
  // The loads that use this only read live rows.
  deleted_at: null,
  details: null,
  instalment_rule_id: null,
  instalment_number: null,
  created_by: null,
  member_id: null,
  fee_of_id: null,
  album_group_id: null,
};

const SPARSE_COLUMNS = TRANSACTION_RAW_COLUMNS.filter(
  (column) => column in TRANSACTION_SPARSE_DEFAULTS,
);
const COMMON_COLUMNS = TRANSACTION_RAW_COLUMNS.filter(
  (column) => !(column in TRANSACTION_SPARSE_DEFAULTS),
);
const rawPosition = (column: string) => {
  const position = TRANSACTION_RAW_COLUMNS.indexOf(column);
  if (position < 0) throw new Error(`Unknown transaction column ${column}`);
  return position;
};
const COMMON_POSITIONS = COMMON_COLUMNS.map(rawPosition);
const SPARSE_POSITIONS = SPARSE_COLUMNS.map(rawPosition);
const sqlLiteral = (value: RawValue) =>
  value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value}'`;

/** The columns every row is read with, aliased to `t`; `t.id` comes first. */
export const TRANSACTION_COMMON_COLUMNS_SQL = COMMON_COLUMNS.map((column) => `t.${column}`).join(
  ', ',
);
/** `t.id`, then the sparse columns, for the rows {@link TRANSACTION_SPARSE_FILTER_SQL} keeps. */
export const TRANSACTION_SPARSE_COLUMNS_SQL = ['id', ...SPARSE_COLUMNS]
  .map((column) => `t.${column}`)
  .join(', ');
/** True for a row with any sparse column off its default. `IS NOT` so NULL counts as a value. */
export const TRANSACTION_SPARSE_FILTER_SQL = SPARSE_COLUMNS.map(
  (column) => `t.${column} IS NOT ${sqlLiteral(TRANSACTION_SPARSE_DEFAULTS[column] as RawValue)}`,
).join(' OR ');

/**
 * The few small tables a transaction's relation names come from, read once
 * per load rather than joined onto every row.
 */
export interface TransactionRelationLookups {
  /** Live accounts' names by id. */
  accountNames: ReadonlyMap<string, string>;
  /** Every category by id (deleted ones too, as a row keeps its category's name). */
  categories: ReadonlyMap<
    string,
    { name: string | null; icon: string | null; parentId: string | null; parentName: string | null }
  >;
  /** Live instalment plans' number of payments by rule id. */
  instalmentCounts: ReadonlyMap<string, number>;
}

type TransactionRelations = Required<
  Pick<
    TransactionWithRelations,
    | 'accountName'
    | 'fromAccountName'
    | 'toAccountName'
    | 'categoryName'
    | 'categoryIcon'
    | 'categoryParentId'
    | 'categoryParentName'
    | 'instalmentCount'
  >
>;

/** The relation names of one transaction, null where the other row is gone. */
export function transactionRelations(
  transaction: Pick<
    Transaction,
    'accountId' | 'fromAccountId' | 'toAccountId' | 'categoryId' | 'instalmentRuleId'
  >,
  lookups: TransactionRelationLookups,
): TransactionRelations {
  const { accountNames, categories, instalmentCounts } = lookups;
  const nameOf = (accountId: string | null | undefined) =>
    accountId ? (accountNames.get(accountId) ?? null) : null;
  const category = transaction.categoryId ? categories.get(transaction.categoryId) : undefined;
  return {
    accountName: nameOf(transaction.accountId),
    fromAccountName: nameOf(transaction.fromAccountId),
    toAccountName: nameOf(transaction.toAccountId),
    categoryName: category?.name ?? null,
    categoryIcon: category?.icon ?? null,
    categoryParentId: category?.parentId ?? null,
    categoryParentName: category?.parentName ?? null,
    instalmentCount: transaction.instalmentRuleId
      ? (instalmentCounts.get(transaction.instalmentRuleId) ?? null)
      : null,
  };
}

const ACCOUNT_ID_POSITION = rawPosition('account_id');
const FROM_ACCOUNT_ID_POSITION = rawPosition('from_account_id');
const TO_ACCOUNT_ID_POSITION = rawPosition('to_account_id');
const CATEGORY_ID_POSITION = rawPosition('category_id');
const INSTALMENT_RULE_ID_POSITION = rawPosition('instalment_rule_id');
const RELATIONS_POSITION = TRANSACTION_RAW_COLUMNS.length;

/**
 * Builds transactions from rows read in two parts: the common columns of every
 * row ({@link TRANSACTION_COMMON_COLUMNS_SQL}) and, for the rows that have
 * them, the sparse ones (`sparseById`, {@link TRANSACTION_SPARSE_COLUMNS_SQL}).
 *
 * A row with sparse values is laid out as the full raw row it stands for and
 * handed to {@link toTransactionWithRelationsFromRaw}. A row without them,
 * which is most rows, is built directly with the defaults written in: filling
 * that 45-value row first cost four times the mapping itself. The mapper test
 * holds the two paths to the same result, field for field.
 */
export function createTransactionAssembler(
  lookups: TransactionRelationLookups,
  sparseById: ReadonlyMap<string, readonly RawValue[]>,
): (common: readonly RawValue[]) => TransactionWithRelations {
  // Reused for every sparse row: the mapper copies what it needs out of it.
  const raw: RawValue[] = new Array<RawValue>(RELATIONS_POSITION + 8).fill(null);
  const { accountNames, categories, instalmentCounts } = lookups;
  const nameOf = (accountId: RawValue | undefined) =>
    typeof accountId === 'string' && accountId ? (accountNames.get(accountId) ?? null) : null;
  const categoryOf = (categoryId: RawValue | undefined) =>
    typeof categoryId === 'string' && categoryId ? categories.get(categoryId) : undefined;

  const fromSparse = (common: readonly RawValue[], sparse: readonly RawValue[]) => {
    for (let index = 0; index < COMMON_POSITIONS.length; index += 1) {
      raw[COMMON_POSITIONS[index] as number] = common[index] ?? null;
    }
    for (let index = 0; index < SPARSE_POSITIONS.length; index += 1) {
      raw[SPARSE_POSITIONS[index] as number] = sparse[index + 1] ?? null;
    }
    const category = categoryOf(raw[CATEGORY_ID_POSITION]);
    const ruleId = raw[INSTALMENT_RULE_ID_POSITION];
    raw[RELATIONS_POSITION] = nameOf(raw[ACCOUNT_ID_POSITION]);
    raw[RELATIONS_POSITION + 1] = nameOf(raw[FROM_ACCOUNT_ID_POSITION]);
    raw[RELATIONS_POSITION + 2] = nameOf(raw[TO_ACCOUNT_ID_POSITION]);
    raw[RELATIONS_POSITION + 3] = category?.name ?? null;
    raw[RELATIONS_POSITION + 4] = category?.icon ?? null;
    raw[RELATIONS_POSITION + 5] = category?.parentId ?? null;
    raw[RELATIONS_POSITION + 6] = category?.parentName ?? null;
    raw[RELATIONS_POSITION + 7] =
      typeof ruleId === 'string' && ruleId ? (instalmentCounts.get(ruleId) ?? null) : null;
    return toTransactionWithRelationsFromRaw(raw);
  };

  return (common) => {
    const sparse = sparseById.get(common[0] as string);
    if (sparse) return fromSparse(common, sparse);
    // In the order of TRANSACTION_COMMON_COLUMNS_SQL: id, type, amount,
    // currency, reporting_currency, reporting_amount, fx_rate, date,
    // account_id, from_account_id, to_account_id, category_id, note,
    // created_at, updated_at.
    const category = categoryOf(common[11]);
    return {
      id: common[0] as string,
      type: asTransactionType(common[1] as string),
      amount: common[2] as number,
      currency: common[3] as string,
      reportingCurrency: (common[4] as string | null) ?? null,
      reportingAmount: (common[5] as number | null) ?? null,
      fxRate: (common[6] as number | null) ?? null,
      toAmount: null,
      accountAmount: null,
      date: common[7] as string,
      accountId: common[8] as string | null,
      fromAccountId: common[9] as string | null,
      toAccountId: common[10] as string | null,
      categoryId: common[11] as string | null,
      note: common[12] as string | null,
      receiptUri: null,
      recurrencePattern: 'none',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      reimbursable: false,
      reimbursedAt: null,
      reimbursementAccountId: null,
      reimbursementTransactionId: null,
      reimbursementOfId: null,
      countsAsExpense: false,
      dayOrder: null,
      createdAt: common[13] as string,
      updatedAt: common[14] as string,
      deletedAt: null,
      details: null,
      instalmentRuleId: null,
      instalmentNumber: null,
      createdBy: null,
      memberId: null,
      feeOfId: null,
      albumGroupId: null,
      accountName: nameOf(common[8]),
      fromAccountName: nameOf(common[9]),
      toAccountName: nameOf(common[10]),
      categoryName: category?.name ?? null,
      categoryParentId: category?.parentId ?? null,
      categoryParentName: category?.parentName ?? null,
      categoryIcon: category?.icon ?? null,
      instalmentCount: null,
    };
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
    partOfSplitId: row.partOfSplitId ?? null,
    isPayer: !!row.isPayer,
    shareAmount: row.shareAmount ?? null,
    memberId: row.memberId ?? null,
    albumMemberId: row.albumMemberId ?? null,
    settlementId: row.settlementId ?? null,
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

function recurringFeeOf(
  row: RecurringRuleRow,
): Pick<RecurringTransactionRule, 'feeAmount' | 'feeCurrency' | 'feeSide' | 'feeCategoryId'> {
  const amount = row.feeAmount;
  if (row.type !== 'transfer' || amount == null || !(amount > 0) || !row.feeCurrency) {
    return { feeAmount: null, feeCurrency: null, feeSide: null, feeCategoryId: null };
  }
  return {
    feeAmount: amount,
    feeCurrency: row.feeCurrency,
    feeSide: row.feeSide === 'to' ? 'to' : 'from',
    feeCategoryId: row.feeCategoryId ?? null,
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
    anchorDay: isAnchorDay(row.anchorDay) ? row.anchorDay : null,
    endDate: row.endDate,
    isActive: row.isActive,
    countsAsExpense: !!row.countsAsExpense,
    // A count below 1 (never written by the app) reads as an ordinary rule.
    instalmentCount:
      row.instalmentCount != null && row.instalmentCount >= 1
        ? Math.trunc(row.instalmentCount)
        : null,
    instalmentTotal: row.instalmentTotal ?? null,
    instalmentStartDate: row.instalmentStartDate ?? null,
    memberId: row.memberId ?? null,
    // Only a transfer rule carries a fee; a fee of 0 or less is none.
    ...recurringFeeOf(row),
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
    showAccountPickerBalances: row.showAccountPickerBalances ?? true,
    hideAccountBalances: row.hideAccountBalances ?? false,
    highlightRecurringTransactions: row.highlightRecurringTransactions ?? false,
    navTabsJson: row.navTabsJson ?? null,
    activeLedgerId: row.activeLedgerId || DEFAULT_LEDGER_ID,
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

export function toLedger(row: LedgerRow): Ledger {
  return {
    id: row.id,
    name: row.name ?? null,
    emoji: row.emoji ?? null,
    currencyCode: row.currencyCode ?? null,
    currencySymbol: row.currencySymbol ?? null,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  };
}
