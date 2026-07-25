import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';

import { I18n } from '~/lib/i18n';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type {
  Account,
  Category,
  RecurringTransactionRule,
  TransactionWithRelations,
} from '~/types';
import { buildXlsx, type XlsxSheet, xlsxDate } from '~/utils/xlsx';

/**
 * Everything the workbook is built from. Passed in explicitly so the sheet
 * layout stays a pure function of the data (and therefore unit-testable),
 * while the DB reads live in `collectExcelExportData`.
 */
export interface ExcelExportData {
  transactions: TransactionWithRelations[];
  accounts: Account[];
  categories: Category[];
  recurringRules: RecurringTransactionRule[];
  /** Sheet titles and column headers, already localized by the caller. */
  labels: ExcelExportLabels;
}

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

/**
 * Category names are stored two levels deep: a transaction points at the leaf,
 * which may itself have a root parent. Split them into the pair the UI shows.
 */
function categoryPair(transaction: TransactionWithRelations): [string, string] {
  if (transaction.categoryParentName) {
    return [transaction.categoryParentName, transaction.categoryName ?? ''];
  }
  return [transaction.categoryName ?? '', ''];
}

function buildTransactionsSheet(data: ExcelExportData): XlsxSheet {
  const { labels } = data;
  const rows = [...data.transactions]
    // Oldest first: an export reads like a ledger, and Excel's own sort can
    // flip it in one click if the user wants newest first.
    .sort((a, b) =>
      a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
    )
    .map((transaction) => {
      const [category, subcategory] = categoryPair(transaction);
      return [
        xlsxDate(transaction.date),
        transaction.type,
        transaction.amount,
        transaction.currency,
        transaction.reportingAmount,
        transaction.reportingCurrency,
        transaction.accountName ?? '',
        transaction.fromAccountName ?? '',
        transaction.toAccountName ?? '',
        category,
        subcategory,
        transaction.note ?? '',
        transaction.sentiment,
        transaction.recurrencePattern === 'none' ? labels.no : labels.yes,
      ];
    });

  return {
    name: labels.sheetTransactions,
    columns: [
      labels.date,
      labels.type,
      labels.amount,
      labels.currency,
      labels.reportingAmount,
      labels.reportingCurrency,
      labels.account,
      labels.fromAccount,
      labels.toAccount,
      labels.category,
      labels.subcategory,
      labels.note,
      labels.sentiment,
      labels.recurring,
    ],
    rows,
  };
}

function buildAccountsSheet(data: ExcelExportData): XlsxSheet {
  const { labels } = data;
  return {
    name: labels.sheetAccounts,
    columns: [
      labels.name,
      labels.group,
      labels.type,
      labels.currency,
      labels.startingBalance,
      labels.includeInTotals,
    ],
    rows: data.accounts.map((account) => [
      account.name,
      account.accountGroup ?? '',
      account.type,
      account.currency,
      account.startingBalance,
      account.includeInTotals ? labels.yes : labels.no,
    ]),
  };
}

function buildCategoriesSheet(data: ExcelExportData): XlsxSheet {
  const { labels } = data;
  const nameById = new Map(data.categories.map((category) => [category.id, category.name]));
  return {
    name: labels.sheetCategories,
    columns: [labels.name, labels.type, labels.parent, labels.icon],
    rows: data.categories.map((category) => [
      category.name,
      category.type,
      category.parentId ? (nameById.get(category.parentId) ?? '') : '',
      category.icon,
    ]),
  };
}

function buildRecurringSheet(data: ExcelExportData): XlsxSheet {
  const { labels } = data;
  const accountNameById = new Map(data.accounts.map((account) => [account.id, account.name]));
  const categoryNameById = new Map(data.categories.map((category) => [category.id, category.name]));
  const nameOf = (map: Map<string, string>, id: string | null) => (id ? (map.get(id) ?? '') : '');

  return {
    name: labels.sheetRecurring,
    columns: [
      labels.name,
      labels.type,
      labels.amount,
      labels.currency,
      labels.account,
      labels.category,
      labels.pattern,
      labels.interval,
      labels.nextRun,
      labels.endDate,
      labels.active,
    ],
    rows: data.recurringRules.map((rule) => [
      rule.name,
      rule.type,
      rule.amount,
      rule.currency,
      nameOf(accountNameById, rule.accountId ?? rule.fromAccountId),
      nameOf(categoryNameById, rule.categoryId),
      rule.recurrencePattern,
      rule.recurrenceInterval,
      xlsxDate(rule.nextRunDate),
      xlsxDate(rule.endDate),
      rule.isActive ? labels.yes : labels.no,
    ]),
  };
}

/** Sheet layout for the workbook. Pure — no DB, no file system. */
export function buildExcelSheets(data: ExcelExportData): XlsxSheet[] {
  const sheets = [
    buildTransactionsSheet(data),
    buildAccountsSheet(data),
    buildCategoriesSheet(data),
  ];
  // Only carry the recurring tab when the user actually has rules — an empty
  // sheet in an otherwise useful workbook just reads as a mistake.
  if (data.recurringRules.length > 0) {
    sheets.push(buildRecurringSheet(data));
  }
  return sheets;
}

/** Localized sheet titles and column headers, resolved once per export. */
export function excelExportLabels(): ExcelExportLabels {
  const t = (key: string) => I18n.t(`data_management.excel.${key}`);
  return {
    sheetTransactions: t('sheet_transactions'),
    sheetAccounts: t('sheet_accounts'),
    sheetCategories: t('sheet_categories'),
    sheetRecurring: t('sheet_recurring'),
    date: t('column_date'),
    type: t('column_type'),
    amount: t('column_amount'),
    currency: t('column_currency'),
    reportingAmount: t('column_reporting_amount'),
    reportingCurrency: t('column_reporting_currency'),
    account: t('column_account'),
    fromAccount: t('column_from_account'),
    toAccount: t('column_to_account'),
    category: t('column_category'),
    subcategory: t('column_subcategory'),
    note: t('column_note'),
    sentiment: t('column_sentiment'),
    recurring: t('column_recurring'),
    name: t('column_name'),
    group: t('column_group'),
    startingBalance: t('column_starting_balance'),
    includeInTotals: t('column_include_in_totals'),
    parent: t('column_parent'),
    icon: t('column_icon'),
    pattern: t('column_pattern'),
    interval: t('column_interval'),
    nextRun: t('column_next_run'),
    endDate: t('column_end_date'),
    active: t('column_active'),
    yes: t('value_yes'),
    no: t('value_no'),
  };
}

export function collectExcelExportData(labels: ExcelExportLabels): ExcelExportData {
  return {
    transactions: transactionsRepository.list(),
    accounts: accountsRepository.list(),
    categories: categoriesRepository.list(),
    recurringRules: recurringRulesRepository.list(),
    labels,
  };
}

export function buildExcelWorkbook(labels: ExcelExportLabels = excelExportLabels()): Uint8Array {
  return buildXlsx(buildExcelSheets(collectExcelExportData(labels)));
}

export function excelExportFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `money2time-${stamp}.xlsx`;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function exportExcel(labels: ExcelExportLabels = excelExportLabels()): Promise<void> {
  const bytes = buildExcelWorkbook(labels);
  const file = new File(Paths.document, excelExportFileName(new Date()));
  file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: XLSX_MIME,
      dialogTitle: 'Export Money2Time Spreadsheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  } else {
    file.delete();
  }
}
