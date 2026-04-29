import type {
  AccountGroupRow,
  AccountRow,
  CategoryRow,
  MonthlyWageSettingsRow,
  RecurringRuleRow,
  SettingsRow,
  TransactionRow,
  TransactionSplitRow,
} from '~/lib/db/schema';
import type {
  Account,
  AccountGroup,
  Category,
  MonthlyWageSettings,
  RecurringTransactionRule,
  ThemeColor,
  ThemeMode,
  Transaction,
  TransactionSentiment,
  TransactionSplit,
  UserMode,
  UserSettings,
} from '~/types';

function asAccountType(value: string): Account['type'] {
  switch (value) {
    case 'debit':
    case 'credit':
      return value;
    // Backward compatibility for old persisted values.
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

function asUserMode(value: string | null | undefined): UserMode {
  return value === 'simple' ? 'simple' : 'power';
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

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder ?? 0,
    type: asAccountType(row.type),
    accountGroup: row.accountGroup,
    creditStatementDay: row.creditStatementDay,
    creditDueDay: row.creditDueDay,
    currency: row.currency,
    startingBalance: row.startingBalance,
    includeInTotals: row.includeInTotals,
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
    date: row.date,
    accountId: row.accountId,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    note: row.note,
    recurrencePattern: asRecurrencePattern(row.recurrencePattern),
    recurrenceInterval: Math.max(1, Math.trunc(row.recurrenceInterval ?? 1)),
    recurrenceEndDate: row.recurrenceEndDate,
    recurrenceParentId: row.recurrenceParentId,
    sentiment: asTransactionSentiment(row.sentiment),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
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

export function toRecurringRule(row: RecurringRuleRow): RecurringTransactionRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'income' ? 'income' : row.type === 'transfer' ? 'transfer' : 'expense',
    amount: row.amount,
    currency: row.currency,
    accountId: row.accountId,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    note: row.note,
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
    hapticsEnabled: row.hapticsEnabled ?? true,
    themeMode: asThemeMode(row.themeMode),
    themeColor: asThemeColor(row.themeColor),
    centerAddButtonOpensAiChat: row.centerAddButtonOpensAiChat ?? false,
    aiChatEnabled: row.aiChatEnabled ?? false,
    aiChatDefaultAccountId: row.aiChatDefaultAccountId ?? null,
    aiChatDefaultIncomeCategoryId: row.aiChatDefaultIncomeCategoryId ?? null,
    aiChatDefaultExpenseCategoryId: row.aiChatDefaultExpenseCategoryId ?? null,
    onboardingCompleted: row.onboardingCompleted,
    userMode: asUserMode(row.userMode),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
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
