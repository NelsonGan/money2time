import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accountsTable = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  type: text('type').notNull(),
  accountGroup: text('account_group'),
  logoId: text('logo_id'),
  creditStatementDay: integer('credit_statement_day'),
  creditDueDay: integer('credit_due_day'),
  currency: text('currency').notNull(),
  startingBalance: real('starting_balance').notNull().default(0),
  includeInTotals: integer('include_in_totals', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const accountGroupsTable = sqliteTable('account_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const categoriesTable = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  type: text('type').notNull(),
  parentId: text('parent_id'),
  icon: text('icon').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const transactionsTable = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  // Frozen reporting-currency snapshot taken at write time so historical
  // aggregates never drift when FX rates move. Null for transfers / legacy rows.
  reportingCurrency: text('reporting_currency'),
  reportingAmount: real('reporting_amount'),
  fxRate: real('fx_rate'),
  // Credited amount (in the to-account's currency) for cross-currency transfers.
  toAmount: real('to_amount'),
  date: text('date').notNull(),
  accountId: text('account_id'),
  fromAccountId: text('from_account_id'),
  toAccountId: text('to_account_id'),
  categoryId: text('category_id'),
  note: text('note'),
  recurrencePattern: text('recurrence_pattern').notNull().default('none'),
  recurrenceInterval: integer('recurrence_interval').notNull().default(1),
  recurrenceEndDate: text('recurrence_end_date'),
  recurrenceParentId: text('recurrence_parent_id'),
  sentiment: text('sentiment').notNull().default('neutral'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const recurringRulesTable = sqliteTable('recurring_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  // Credited amount (in the to-account's currency) for cross-currency transfer rules.
  toAmount: real('to_amount'),
  accountId: text('account_id'),
  fromAccountId: text('from_account_id'),
  toAccountId: text('to_account_id'),
  categoryId: text('category_id'),
  note: text('note'),
  recurrencePattern: text('recurrence_pattern').notNull(),
  recurrenceInterval: integer('recurrence_interval').notNull().default(1),
  nextRunDate: text('next_run_date').notNull(),
  endDate: text('end_date'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const settingsTable = sqliteTable('settings', {
  id: text('id').primaryKey(),
  appUserId: text('app_user_id').notNull(),
  locale: text('locale').notNull().default('en'),
  currencyCode: text('currency_code').notNull().default('USD'),
  currencySymbol: text('currency_symbol').notNull().default('$'),
  displayMode: text('display_mode').notNull().default('money'),
  hapticsEnabled: integer('haptics_enabled', { mode: 'boolean' }).notNull().default(true),
  themeMode: text('theme_mode').notNull().default('system'),
  themeColor: text('theme_color').notNull().default('rosewood'),
  accountLogoCountry: text('account_logo_country'),
  profileName: text('profile_name'),
  profileAvatarUri: text('profile_avatar_uri'),
  insightsPrefsJson: text('insights_prefs_json'),
  notificationPrefsJson: text('notification_prefs_json'),
  quickEntryPrefsJson: text('quick_entry_prefs_json'),
  calendarPrefsJson: text('calendar_prefs_json'),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  userMode: text('user_mode').notNull().default('power'),
  weekStartsOn: integer('week_starts_on').notNull().default(1),
  biometricLockEnabled: integer('biometric_lock_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  biometricLockDelaySeconds: integer('biometric_lock_delay_seconds').notNull().default(900),
  autoBackupEnabled: integer('auto_backup_enabled', { mode: 'boolean' }).notNull().default(true),
  autoBackupTarget: text('auto_backup_target').notNull().default('local'),
  lastAutoBackupAt: text('last_auto_backup_at'),
  lastAutoBackupError: text('last_auto_backup_error'),
  autoFxRefreshEnabled: integer('auto_fx_refresh_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  lastRateFetchAt: text('last_rate_fetch_at'),
  lastRateFetchError: text('last_rate_fetch_error'),
  fxCurrenciesJson: text('fx_currencies_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const exchangeRatesTable = sqliteTable('exchange_rates', {
  id: text('id').primaryKey(),
  baseCurrency: text('base_currency').notNull(),
  quoteCurrency: text('quote_currency').notNull(),
  rate: real('rate').notNull(),
  asOfDate: text('as_of_date').notNull(),
  source: text('source').notNull().default('api'),
  updatedAt: text('updated_at').notNull(),
});

export const transactionSplitsTable = sqliteTable('transaction_splits', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').notNull(),
  personName: text('person_name'),
  amount: real('amount').notNull(),
  isSelf: integer('is_self', { mode: 'boolean' }).notNull().default(false),
  paybackAccountId: text('payback_account_id'),
  paidAt: text('paid_at'),
  paidTransactionId: text('paid_transaction_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const monthlyWageSettingsTable = sqliteTable('monthly_wage_settings', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  wageType: text('wage_type').notNull(),
  wageAmount: real('wage_amount').notNull(),
  hoursWorkedPerWeek: real('hours_worked_per_week').notNull(),
  workdaysPerWeek: integer('workdays_per_week').notNull(),
  commuteMinutesPerWorkday: integer('commute_minutes_per_workday').notNull(),
  baseHourlyRate: real('base_hourly_rate').notNull(),
  trueHourlyRate: real('true_hourly_rate').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export type AccountRow = typeof accountsTable.$inferSelect;
export type AccountGroupRow = typeof accountGroupsTable.$inferSelect;
export type CategoryRow = typeof categoriesTable.$inferSelect;
export type TransactionRow = typeof transactionsTable.$inferSelect;
export type RecurringRuleRow = typeof recurringRulesTable.$inferSelect;
export type TransactionSplitRow = typeof transactionSplitsTable.$inferSelect;
export type SettingsRow = typeof settingsTable.$inferSelect;
export type MonthlyWageSettingsRow = typeof monthlyWageSettingsTable.$inferSelect;
export type ExchangeRateRow = typeof exchangeRatesTable.$inferSelect;
