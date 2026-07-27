import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';

import { categoryIconToEmoji } from '~/constants/categoryIcons';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import {
  ACCOUNT_COLUMNS,
  CATEGORY_COLUMNS,
  type ExcelExportLabels,
  excelExportLabels,
  headerRow,
  RECURRING_COLUMNS,
  TRANSACTION_COLUMNS,
} from '~/services/excelWorkbookSchema';
import type {
  Account,
  Category,
  RecurringTransactionRule,
  TransactionWithRelations,
} from '~/types';
import { buildXlsx, type XlsxCell, type XlsxSheet, xlsxDate } from '~/utils/xlsx';

export type { ExcelExportLabels } from '~/services/excelWorkbookSchema';

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
    .map((transaction): XlsxCell[] => {
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
    columns: headerRow(labels, TRANSACTION_COLUMNS),
    rows,
  };
}

function buildAccountsSheet(data: ExcelExportData): XlsxSheet {
  const { labels } = data;
  return {
    name: labels.sheetAccounts,
    columns: headerRow(labels, ACCOUNT_COLUMNS),
    rows: data.accounts.map((account): XlsxCell[] => [
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
    columns: headerRow(labels, CATEGORY_COLUMNS),
    rows: data.categories.map((category): XlsxCell[] => [
      category.name,
      category.type,
      category.parentId ? (nameById.get(category.parentId) ?? '') : '',
      // The Icon column is human-facing, so emit a glyph rather than the stored
      // id or an uploaded image's path. An upload has no glyph to stand in for
      // it, so the cell is left empty; falling back to the raw value would
      // print `custom:category-icons/<uuid>.png` in a spreadsheet.
      categoryIconToEmoji(category.icon),
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
    columns: headerRow(labels, RECURRING_COLUMNS),
    rows: data.recurringRules.map((rule): XlsxCell[] => [
      rule.name,
      rule.type,
      rule.amount,
      rule.currency,
      nameOf(accountNameById, rule.accountId),
      nameOf(accountNameById, rule.fromAccountId),
      nameOf(accountNameById, rule.toAccountId),
      nameOf(categoryNameById, rule.categoryId),
      rule.recurrencePattern,
      rule.recurrenceInterval,
      xlsxDate(rule.nextRunDate),
      xlsxDate(rule.endDate),
      rule.isActive ? labels.yes : labels.no,
    ]),
  };
}

/** Sheet layout for the workbook. Pure: no DB, no file system. */
export function buildExcelSheets(data: ExcelExportData): XlsxSheet[] {
  const sheets = [
    buildTransactionsSheet(data),
    buildAccountsSheet(data),
    buildCategoriesSheet(data),
  ];
  // Only carry the recurring tab when the user actually has rules: an empty
  // sheet in an otherwise useful workbook just reads as a mistake.
  if (data.recurringRules.length > 0) {
    sheets.push(buildRecurringSheet(data));
  }
  return sheets;
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
