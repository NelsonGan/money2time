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
  // Savings-goal fields (type = 'goal'); all null on non-goal accounts.
  goalTargetAmount: real('goal_target_amount'),
  goalTargetDate: text('goal_target_date'),
  goalEmoji: text('goal_emoji'),
  // High-water achievement stamp; persisted so the celebration fires once.
  goalAchievedAt: text('goal_achieved_at'),
  // Null = active goal. Set to hide from the Goals rail and account pickers.
  goalArchivedAt: text('goal_archived_at'),
  // Loan fields (type = 'loan'); all null on non-loan accounts.
  // How interest is worked out: 'flat' (fixed at signing) or 'reducing'
  // (charged monthly on what is still owed). Null on a loan predating the
  // column, which reads as 'flat'.
  loanInterestModel: text('loan_interest_model'),
  loanOriginalPrincipal: real('loan_original_principal'),
  loanMonthlyPayment: real('loan_monthly_payment'),
  loanPaymentDay: integer('loan_payment_day'),
  /** Annual interest rate as a percentage; null when not modelled. */
  loanInterestRate: real('loan_interest_rate'),
  /** Contract length in months; the instalment is derived from it. */
  loanTermMonths: integer('loan_term_months'),
  loanTotalRepayable: real('loan_total_repayable'),
  /** Contract start date (YYYY-MM-DD); fixes the payment day and payoff date. */
  loanStartDate: text('loan_start_date'),
  // Gate for the one-shot payoff celebration, persisted so it survives a
  // restart. Cleared if the loan is drawn down again. Never read as state:
  // whether a loan is settled is derived from its balance.
  loanPaidOffAt: text('loan_paid_off_at'),
  // Null = active loan. Set to hide from the accounts stack and pickers.
  loanArchivedAt: text('loan_archived_at'),
  // Whether repayments into this loan count as spending in the analytics
  // readouts. Null on a loan predating the column (treated as the default,
  // on); always null on non-loan accounts.
  loanCountAsExpense: integer('loan_count_as_expense', { mode: 'boolean' }),
  // The category a counted repayment is filed under, so it lands in the
  // breakdown and depletes a budget line like any other expense.
  loanPaymentCategoryId: text('loan_payment_category_id'),
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
  // Frozen value in the owning account's currency, set when the entered
  // currency differs from the account currency. Null when they match.
  accountAmount: real('account_amount'),
  date: text('date').notNull(),
  accountId: text('account_id'),
  fromAccountId: text('from_account_id'),
  toAccountId: text('to_account_id'),
  categoryId: text('category_id'),
  note: text('note'),
  // Relative path (within the user-assets store) of an optional receipt image,
  // e.g. `receipts/9f3c.jpg`. Null when no receipt is attached.
  receiptUri: text('receipt_uri'),
  recurrencePattern: text('recurrence_pattern').notNull().default('none'),
  recurrenceInterval: integer('recurrence_interval').notNull().default(1),
  recurrenceEndDate: text('recurrence_end_date'),
  recurrenceParentId: text('recurrence_parent_id'),
  sentiment: text('sentiment').notNull().default('neutral'),
  // Reimbursements. `reimbursable` is the tick on the expense; the rest is
  // filled in once the money comes back. `reimbursementTransactionId` points at
  // the income row written for the refund, and `reimbursementOfId` is that
  // row's pointer back to the expense.
  reimbursable: integer('reimbursable', { mode: 'boolean' }).notNull().default(false),
  reimbursedAt: text('reimbursed_at'),
  reimbursementAccountId: text('reimbursement_account_id'),
  reimbursementTransactionId: text('reimbursement_transaction_id'),
  reimbursementOfId: text('reimbursement_of_id'),
  // A transfer the user asked to be counted as spending (a loan repayment).
  // Analytics only: balances and asset history always count the row as the
  // transfer it is. See utils/spending.ts.
  countsAsExpense: integer('counts_as_expense', { mode: 'boolean' }).notNull().default(false),
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
  // Subscription-service logo: a bundled catalog id `<country>/<brand>` or a
  // `custom:` user-asset id. See constants/subscriptionLogos.ts.
  logoId: text('logo_id'),
  recurrencePattern: text('recurrence_pattern').notNull(),
  recurrenceInterval: integer('recurrence_interval').notNull().default(1),
  nextRunDate: text('next_run_date').notNull(),
  endDate: text('end_date'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Stamped onto every transfer this rule generates. Loan auto-repayment only.
  countsAsExpense: integer('counts_as_expense', { mode: 'boolean' }).notNull().default(false),
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
  workdayDisplayEnabled: integer('workday_display_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  workingHoursPerDay: real('working_hours_per_day').notNull().default(8),
  hapticsEnabled: integer('haptics_enabled', { mode: 'boolean' }).notNull().default(true),
  themeMode: text('theme_mode').notNull().default('system'),
  themeColor: text('theme_color').notNull().default('rosewood'),
  // 'clay' | 'flat' — which artwork the app's own chrome draws. See
  // components/ui/ClayIcon.tsx.
  iconStyle: text('icon_style').notNull().default('clay'),
  // Home-screen icon variant id. See constants/appIcons.ts.
  appIcon: text('app_icon').notNull().default('classic'),
  accountLogoCountry: text('account_logo_country'),
  // Country tab the recurring-payment logo picker opens on. Tracked apart from
  // accountLogoCountry so browsing Japanese streaming services doesn't move the
  // bank picker off the user's own country.
  subscriptionLogoCountry: text('subscription_logo_country'),
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
  firstDayOfMonth: integer('first_day_of_month').notNull().default(1),
  // Per-month exceptions to firstDayOfMonth, as a JSON object keyed by
  // `YYYY-MM` (`{"2026-03":15}`). Null when every month follows the default.
  firstDayOverridesJson: text('first_day_overrides_json'),
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
  // ISO timestamp of the user's first app open. Set to `now` on fresh installs;
  // backfilled from the earliest transaction date for upgrading users.
  firstAppOpen: text('first_app_open'),
  // Relative path of the user's own payment QR image within the user-assets
  // store (e.g. `payment-qr/9f3c.png`), attached once and composited onto
  // split-bill payback receipts.
  paymentQrUri: text('payment_qr_uri'),
  // Default account new split-bill payback rows are attributed to (chosen on
  // the Settle Up screen). Null until the user picks one.
  defaultPaybackAccountId: text('default_payback_account_id'),
  // Whether a reimbursable expense still counts as spending. On by default.
  reimbursementsCountAsExpense: integer('reimbursements_count_as_expense', { mode: 'boolean' })
    .notNull()
    .default(true),
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

export const albumsTable = sqliteTable('albums', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  coverPhotoUri: text('cover_photo_uri'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  // Optional manual overrides; when null the range falls back to the first/last
  // transaction date in the album.
  startDate: text('start_date'),
  endDate: text('end_date'),
  // Optional real-world location. "Located" = latitude is non-null.
  latitude: real('latitude'),
  longitude: real('longitude'),
  placeId: text('place_id'),
  placeName: text('place_name'),
  placeAdmin: text('place_admin'),
  countryCode: text('country_code'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const albumTransactionsTable = sqliteTable('album_transactions', {
  id: text('id').primaryKey(),
  albumId: text('album_id').notNull(),
  transactionId: text('transaction_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const itemsTable = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // Item-icon library id or a `custom:` uploaded-image id; null = package fallback.
  iconId: text('icon_id'),
  purchasePrice: real('purchase_price').notNull().default(0),
  currency: text('currency').notNull(),
  purchaseDate: text('purchase_date').notNull(),
  // Null = still owned (active). Set when the item is retired/sold; day-counting stops here.
  endDate: text('end_date'),
  // Optional resale value; net cost = purchasePrice - salePrice.
  salePrice: real('sale_price'),
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const budgetTemplatesTable = sqliteTable('budget_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // Optional emoji shown next to the template name (category-style picker).
  emoji: text('emoji'),
  totalAmount: real('total_amount').notNull().default(0),
  // Exactly one live template has is_default = 1 while any template exists.
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  // Whether spending in categories without a budget line counts toward the
  // month's total (the original behavior).
  countUnbudgeted: integer('count_unbudgeted', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const budgetTemplateCategoriesTable = sqliteTable('budget_template_categories', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  categoryId: text('category_id').notNull(),
  amount: real('amount').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const monthlyBudgetsTable = sqliteTable('monthly_budgets', {
  id: text('id').primaryKey(),
  // 'YYYY-MM' month key. A partial unique index allows one live row per month;
  // soft-deleted rows double as tombstones so auto-create never resurrects a
  // month the user deleted.
  month: text('month').notNull(),
  // Provenance only — the source template may be renamed or deleted later.
  templateId: text('template_id'),
  templateName: text('template_name'),
  templateEmoji: text('template_emoji'),
  // Frozen at creation; never rewritten when the template changes.
  totalAmount: real('total_amount').notNull().default(0),
  countUnbudgeted: integer('count_unbudgeted', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const monthlyBudgetCategoriesTable = sqliteTable('monthly_budget_categories', {
  id: text('id').primaryKey(),
  budgetId: text('budget_id').notNull(),
  categoryId: text('category_id').notNull(),
  amount: real('amount').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const receiptSplitsTable = sqliteTable('receipt_splits', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').notNull(),
  currency: text('currency').notNull(),
  merchant: text('merchant'),
  receiptDate: text('receipt_date'),
  source: text('source').notNull().default('manual'),
  receiptImageUri: text('receipt_image_uri'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const receiptSplitItemsTable = sqliteTable('receipt_split_items', {
  id: text('id').primaryKey(),
  receiptSplitId: text('receipt_split_id').notNull(),
  name: text('name').notNull(),
  quantity: real('quantity').notNull().default(1),
  lineTotal: real('line_total').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const receiptSplitItemSharesTable = sqliteTable('receipt_split_item_shares', {
  id: text('id').primaryKey(),
  receiptSplitId: text('receipt_split_id').notNull(),
  itemId: text('item_id').notNull(),
  personName: text('person_name').notNull(),
  isSelf: integer('is_self', { mode: 'boolean' }).notNull().default(false),
  weight: integer('weight').notNull().default(1),
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
export type AlbumRow = typeof albumsTable.$inferSelect;
export type AlbumTransactionRow = typeof albumTransactionsTable.$inferSelect;
export type ItemRow = typeof itemsTable.$inferSelect;
export type BudgetTemplateRow = typeof budgetTemplatesTable.$inferSelect;
export type BudgetTemplateCategoryRow = typeof budgetTemplateCategoriesTable.$inferSelect;
export type MonthlyBudgetRow = typeof monthlyBudgetsTable.$inferSelect;
export type MonthlyBudgetCategoryRow = typeof monthlyBudgetCategoriesTable.$inferSelect;
export type ReceiptSplitRow = typeof receiptSplitsTable.$inferSelect;
export type ReceiptSplitItemRow = typeof receiptSplitItemsTable.$inferSelect;
export type ReceiptSplitItemShareRow = typeof receiptSplitItemSharesTable.$inferSelect;
