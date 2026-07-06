import type {
  AccountGroupRow,
  AccountRow,
  AlbumRow,
  BudgetTemplateCategoryRow,
  BudgetTemplateRow,
  CategoryRow,
  ExchangeRateRow,
  ItemRow,
  MonthlyBudgetCategoryRow,
  MonthlyBudgetRow,
  MonthlyWageSettingsRow,
  RecurringRuleRow,
  SettingsRow,
  TransactionRow,
  TransactionSplitRow,
} from '~/lib/db/schema';
import type {
  Account,
  AccountGroup,
  Album,
  BackupTarget,
  BudgetTemplate,
  BudgetTemplateAllocation,
  Category,
  ExchangeRate,
  ExchangeRateSource,
  Item,
  MonthlyBudget,
  MonthlyBudgetLine,
  MonthlyWageSettings,
  RecurringTransactionRule,
  ThemeColor,
  ThemeMode,
  Transaction,
  TransactionSentiment,
  TransactionSplit,
  UserMode,
  UserSettings,
  WeekStartsOn,
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

function asWeekStartsOn(value: number | null | undefined): WeekStartsOn {
  if (value === 0 || value === 6) return value;
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 1;
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
    toAmount: row.toAmount ?? null,
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
    accountLogoCountry: row.accountLogoCountry ?? null,
    profileName: row.profileName ?? null,
    profileAvatarUri: row.profileAvatarUri ?? null,
    onboardingCompleted: row.onboardingCompleted,
    userMode: asUserMode(row.userMode),
    weekStartsOn: asWeekStartsOn(row.weekStartsOn),
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
