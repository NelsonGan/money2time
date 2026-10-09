import { I18n } from '~/lib/i18n';

/**
 * Shape of the Money2Time spreadsheet: one column order, one set of header
 * labels, one set of sheet names, kept apart from the code that fills them in.
 *
 * Only headers and sheet names are localized. Every *value* written into a
 * typed column (transaction type, sentiment, recurrence pattern, account and
 * category type) is the raw domain enum, so the file reads the same whatever
 * language it was exported in.
 */

export interface ExcelExportLabels {
  sheetTransactions: string;
  sheetAccounts: string;
  sheetCategories: string;
  sheetRecurring: string;
  date: string;
  type: string;
  amount: string;
  currency: string;
  reportingAmount: string;
  reportingCurrency: string;
  account: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  subcategory: string;
  note: string;
  sentiment: string;
  recurring: string;
  name: string;
  group: string;
  startingBalance: string;
  includeInTotals: string;
  parent: string;
  icon: string;
  pattern: string;
  interval: string;
  nextRun: string;
  endDate: string;
  active: string;
  yes: string;
  no: string;
}

/** `ExcelExportLabels` field -> key under `data_management.excel` in the locales. */
const LABEL_I18N_KEYS: Record<keyof ExcelExportLabels, string> = {
  sheetTransactions: 'sheet_transactions',
  sheetAccounts: 'sheet_accounts',
  sheetCategories: 'sheet_categories',
  sheetRecurring: 'sheet_recurring',
  date: 'column_date',
  type: 'column_type',
  amount: 'column_amount',
  currency: 'column_currency',
  reportingAmount: 'column_reporting_amount',
  reportingCurrency: 'column_reporting_currency',
  account: 'column_account',
  fromAccount: 'column_from_account',
  toAccount: 'column_to_account',
  category: 'column_category',
  subcategory: 'column_subcategory',
  note: 'column_note',
  sentiment: 'column_sentiment',
  recurring: 'column_recurring',
  name: 'column_name',
  group: 'column_group',
  startingBalance: 'column_starting_balance',
  includeInTotals: 'column_include_in_totals',
  parent: 'column_parent',
  icon: 'column_icon',
  pattern: 'column_pattern',
  interval: 'column_interval',
  nextRun: 'column_next_run',
  endDate: 'column_end_date',
  active: 'column_active',
  yes: 'value_yes',
  no: 'value_no',
};

const LABEL_FIELDS = Object.keys(LABEL_I18N_KEYS) as (keyof ExcelExportLabels)[];

function labelsFrom(lookup: (i18nKey: string) => string): ExcelExportLabels {
  const labels = {} as ExcelExportLabels;
  for (const field of LABEL_FIELDS) {
    labels[field] = lookup(LABEL_I18N_KEYS[field]);
  }
  return labels;
}

/** Localized labels for the user's current language. */
export function excelExportLabels(): ExcelExportLabels {
  return labelsFrom((key) => I18n.t(`data_management.excel.${key}`));
}

/** Column order of each sheet. The header of column N is `labels[COLUMNS[N]]`. */
export const TRANSACTION_COLUMNS = [
  'date',
  'type',
  'amount',
  'currency',
  'reportingAmount',
  'reportingCurrency',
  'account',
  'fromAccount',
  'toAccount',
  'category',
  'subcategory',
  'note',
  'sentiment',
  'recurring',
] as const;

export const ACCOUNT_COLUMNS = [
  'name',
  'group',
  'type',
  'currency',
  'startingBalance',
  'includeInTotals',
] as const;

export const CATEGORY_COLUMNS = ['name', 'type', 'parent', 'icon'] as const;

// From/to accounts get their own columns alongside `account`, mirroring the
// transactions sheet: a transfer rule stores its two sides there, and folding
// them into one column would drop the destination from the export entirely.
export const RECURRING_COLUMNS = [
  'name',
  'type',
  'amount',
  'currency',
  'account',
  'fromAccount',
  'toAccount',
  'category',
  'pattern',
  'interval',
  'nextRun',
  'endDate',
  'active',
] as const;

export function headerRow(
  labels: ExcelExportLabels,
  columns: readonly (keyof ExcelExportLabels)[],
): string[] {
  return columns.map((column) => labels[column]);
}
