import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accountsTable = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  type: text('type').notNull(),
  accountGroup: text('account_group'),
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
  insightsPrefsJson: text('insights_prefs_json'),
  notificationPrefsJson: text('notification_prefs_json'),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  userMode: text('user_mode').notNull().default('power'),
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
export type SettingsRow = typeof settingsTable.$inferSelect;
export type MonthlyWageSettingsRow = typeof monthlyWageSettingsTable.$inferSelect;
