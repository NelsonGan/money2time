/**
 * The Money₂Time app's JSON backup (format version 3). Each table is the app's
 * SQLite table dumped row for row, so field names stay snake_case and booleans
 * stay 0/1. Every field the dashboard does not read is left out; the rest are
 * optional where older backups or partial rows may lack them.
 */

type Row = {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type AccountType =
  | "cash"
  | "debit"
  | "credit"
  | "savings"
  | "investment"
  | "loan"
  | "goal"
  | (string & {});

export type AccountRow = Row & {
  name: string;
  type: AccountType;
  sort_order?: number | null;
  account_group?: string | null;
  currency?: string | null;
  starting_balance?: number | null;
  include_in_totals?: number | null;
  logo_id?: string | null;
  credit_statement_day?: number | null;
  credit_due_day?: number | null;
  /**
   * Days after each statement the bill is due (app migration 084); null or
   * absent means it is due on `credit_due_day`, which such a card also keeps
   * near its real due day for older readers.
   */
  credit_due_days_after_statement?: number | null;
  goal_target_amount?: number | null;
  goal_target_date?: string | null;
  goal_emoji?: string | null;
  goal_achieved_at?: string | null;
  goal_archived_at?: string | null;
  goal_cover_uri?: string | null;
  loan_original_principal?: number | null;
  loan_interest_rate?: number | null;
  loan_term_months?: number | null;
  loan_start_date?: string | null;
  loan_monthly_payment?: number | null;
  loan_payment_day?: number | null;
  loan_archived_at?: string | null;
  loan_total_repayable?: number | null;
  loan_interest_model?: string | null;
  loan_ledger_anchor_date?: string | null;
  loan_rate_changes_json?: string | null;
};

export type AccountGroupRow = Row & { name: string; sort_order?: number | null };

export type CategoryRow = Row & {
  name: string;
  type: "expense" | "income" | (string & {});
  parent_id?: string | null;
  icon?: string | null;
  sort_order?: number | null;
};

export type TransactionType = "expense" | "income" | "transfer" | (string & {});

export type TransactionRow = Row & {
  type: TransactionType;
  amount: number;
  currency?: string | null;
  date: string;
  account_id?: string | null;
  from_account_id?: string | null;
  to_account_id?: string | null;
  category_id?: string | null;
  note?: string | null;
  sentiment?: string | null;
  reporting_amount?: number | null;
  /** The main currency when the row was saved, and the rate it was converted at then. */
  reporting_currency?: string | null;
  fx_rate?: number | null;
  to_amount?: number | null;
  account_amount?: number | null;
  reimbursable?: number | null;
  reimbursement_of_id?: string | null;
  reimbursement_transaction_id?: string | null;
  details?: string | null;
  reimbursed_at?: string | null;
  counts_as_expense?: number | null;
  /** The instalment plan (a recurring rule) this row is a payment of. */
  instalment_rule_id?: string | null;
};

export type TransactionSplitRow = Row & {
  transaction_id: string;
  person_name?: string | null;
  amount: number;
  is_self?: number | null;
  paid_at?: string | null;
  /** The payback transfer Mark paid wrote, when the money went to another account than the bill's. */
  paid_transaction_id?: string | null;
  /**
   * A part payment: the id of the share's first row it was paid out of (the
   * app's migration 082). Null or absent on every other row, and on every row
   * from an app that predates part payments. A share is every row sharing
   * `part_of_split_id ?? id` (`splitShareKey`).
   */
  part_of_split_id?: string | null;
  /**
   * A bill a friend paid (the app's migration 089): the payer's row carries
   * `is_payer`, and each friend's share of the bill is in `share_amount`
   * while `amount` (what a person owes the user) stays 0. The payer row's
   * `paid_at` is then when the user paid them back. Absent on every row from
   * an app before this. See `lib/backup/split-payer.ts`.
   */
  is_payer?: number | boolean | null;
  share_amount?: number | null;
  /**
   * The Cloud Sync account this person is, once people can be real users.
   * Null or absent today; balances group by it when it is set (`partyKey`).
   */
  member_id?: string | null;
};

export type ExchangeRateRow = Row & {
  base_currency: string;
  quote_currency: string;
  rate: number;
  as_of_date?: string | null;
};

export type RecurringRuleRow = Row & {
  name?: string | null;
  type: TransactionType;
  amount: number;
  currency?: string | null;
  account_id?: string | null;
  from_account_id?: string | null;
  to_account_id?: string | null;
  category_id?: string | null;
  note?: string | null;
  recurrence_pattern?: string | null;
  recurrence_interval?: number | null;
  next_run_date?: string | null;
  end_date?: string | null;
  is_active?: number | null;
  logo_id?: string | null;
  counts_as_expense?: number | null;
  /** Set on an instalment plan only (the app's migration 078). */
  instalment_count?: number | null;
  /**
   * A transfer rule's fee, written beside each run as an expense (the app's
   * migration 088). Absent from older apps: no fee.
   */
  fee_amount?: number | null;
  fee_currency?: string | null;
  fee_side?: string | null;
  fee_category_id?: string | null;
};

export type SettingsRow = Row & {
  currency_code?: string | null;
  currency_symbol?: string | null;
  locale?: string | null;
  week_starts_on?: number | null;
  first_day_of_month?: number | null;
  first_day_overrides_json?: string | null;
  working_hours_per_day?: number | null;
  workday_display_enabled?: number | null;
  reimbursements_count_as_expense?: number | null;
  fx_currencies_json?: string | null;
  /** Tint entries a recurring rule made (the app's migration 086). Absent from older apps: off. */
  highlight_recurring_transactions?: number | null;
};

export type WageSettingRow = Row & {
  month: string;
  hours_worked_per_week?: number | null;
  workdays_per_week?: number | null;
  commute_minutes_per_workday?: number | null;
  base_hourly_rate?: number | null;
  true_hourly_rate?: number | null;
};

export type AlbumRow = Row & {
  name: string;
  cover_photo_uri?: string | null;
  sort_order?: number | null;
  is_active?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  place_name?: string | null;
  place_admin?: string | null;
  country_code?: string | null;
};

export type AlbumTransactionRow = Row & {
  album_id: string;
  transaction_id: string;
};

export type ItemRow = Row & {
  name: string;
  icon_id?: string | null;
  purchase_price?: number | null;
  currency?: string | null;
  purchase_date?: string | null;
  end_date?: string | null;
  sale_price?: number | null;
  note?: string | null;
  sort_order?: number | null;
};

export type MonthlyBudgetRow = Row & {
  /** Period key: `YYYY-MM` for a monthly budget (`YYYY-MM-DD` week start, `YYYY` year otherwise). */
  month: string;
  /** Missing on rows written before periods existed, which are monthly. */
  period?: string | null;
  template_name?: string | null;
  total_amount?: number | null;
  template_emoji?: string | null;
  count_unbudgeted?: number | null;
  /** The budget's currency; missing or null for the main currency. */
  currency?: string | null;
  /** One unit of `currency` in the main currency when the budget was made; null without one. */
  fx_rate?: number | null;
};

export type MonthlyBudgetCategoryRow = Row & {
  budget_id: string;
  category_id: string;
  amount: number;
  sort_order?: number | null;
};

export type UserAsset = { path: string; base64: string };

export type BackupTables = {
  accounts: AccountRow[];
  account_groups: AccountGroupRow[];
  categories: CategoryRow[];
  transactions: TransactionRow[];
  transaction_splits: TransactionSplitRow[];
  exchange_rates: ExchangeRateRow[];
  recurring_rules: RecurringRuleRow[];
  settings: SettingsRow[];
  monthly_wage_settings: WageSettingRow[];
  albums: AlbumRow[];
  album_transactions: AlbumTransactionRow[];
  items: ItemRow[];
  monthly_budgets: MonthlyBudgetRow[];
  monthly_budget_categories: MonthlyBudgetCategoryRow[];
};

/** Tables and top-level keys the dashboard does not read are carried through untouched. */
export type BackupFile = {
  [key: string]: unknown;
  version: number;
  exportedAt?: string | null;
  userAssets?: UserAsset[];
  tables: BackupTables;
};
