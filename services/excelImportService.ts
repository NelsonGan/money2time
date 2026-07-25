import { File } from 'expo-file-system/next';

import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import {
  ACCOUNT_COLUMNS,
  CATEGORY_COLUMNS,
  ENGLISH_EXCEL_LABELS,
  type ExcelExportLabels,
  excelExportLabels,
  type ExcelSheetKind,
  RECURRING_COLUMNS,
  SHEET_LABEL_FIELDS,
  TRANSACTION_COLUMNS,
} from '~/services/excelWorkbookSchema';
import type {
  AccountType,
  CategoryType,
  RecurrencePattern,
  TransactionSentiment,
  TransactionType,
} from '~/types';
import { suggestCategoryEmoji } from '~/utils/categoryEmojiMatcher';
import {
  dayKeyFromExcelSerial,
  readXlsx,
  type XlsxReadCell,
  type XlsxWorkbook,
} from '~/utils/xlsxReader';

export interface ExcelImportSummary {
  accounts: number;
  categories: number;
  transactions: number;
  recurringRules: number;
  /** Rows that carried no usable date or amount and were left out. */
  skipped: number;
}

export interface ParsedExcelAccount {
  name: string;
  group: string | null;
  type: AccountType;
  currency: string;
  startingBalance: number;
  includeInTotals: boolean;
}

export interface ParsedExcelCategory {
  name: string;
  type: CategoryType;
  parent: string | null;
  icon: string;
}

export interface ParsedExcelTransaction {
  date: string;
  type: TransactionType;
  amount: number;
  currency: string;
  reportingAmount: number | null;
  reportingCurrency: string | null;
  account: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  subcategory: string;
  note: string;
  sentiment: TransactionSentiment;
}

export interface ParsedExcelRecurringRule {
  name: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  account: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  pattern: Exclude<RecurrencePattern, 'none'>;
  interval: number;
  nextRun: string;
  endDate: string | null;
  isActive: boolean;
}

export interface ParsedExcelData {
  accounts: ParsedExcelAccount[];
  categories: ParsedExcelCategory[];
  transactions: ParsedExcelTransaction[];
  recurringRules: ParsedExcelRecurringRule[];
  skipped: number;
}

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

function toText(cell: XlsxReadCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell).trim();
}

// "1.234,56" and friends: a dot-grouped, comma-decimal number. Detected
// explicitly so stripping group separators can't silently mangle it.
const EUROPEAN_NUMBER = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/;

export function toNumber(cell: XlsxReadCell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;

  const trimmed = cell.trim();
  if (!trimmed) return null;

  const normalized = EUROPEAN_NUMBER.test(trimmed)
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/[\s ]/g, '').replace(/,/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Accepts what the exporter writes (a real date cell, which the reader has
 * already turned into a day key) plus bare ISO text and raw Excel serials.
 *
 * Slash-separated dates are deliberately rejected unless they are
 * year-first: `03/05/2024` is March 5th to some readers and May 3rd to others,
 * and silently guessing wrong would corrupt every affected row.
 */
export function toDayKey(cell: XlsxReadCell): string | null {
  if (typeof cell === 'number') return dayKeyFromExcelSerial(cell);

  const text = toText(cell);
  if (!text) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (slashMatch) {
    const pad = (value: string) => value.padStart(2, '0');
    return `${slashMatch[1]}-${pad(slashMatch[2])}-${pad(slashMatch[3])}`;
  }

  // A numeric string is an Excel serial that lost its date formatting.
  const serial = toNumber(text);
  if (serial !== null && serial > 0 && Number.isInteger(serial)) {
    return dayKeyFromExcelSerial(serial);
  }

  return null;
}

const TRANSACTION_TYPES: TransactionType[] = [
  'expense',
  'income',
  'transfer',
  'balance_adjustment',
];
const SENTIMENTS: TransactionSentiment[] = ['happy', 'neutral', 'sad'];
const PATTERNS: Exclude<RecurrencePattern, 'none'>[] = ['daily', 'weekly', 'monthly', 'yearly'];

function toEnum<T extends string>(cell: XlsxReadCell, allowed: T[], fallback: T): T {
  const value = toText(cell).toLowerCase().replace(/[\s-]/g, '_');
  return allowed.find((option) => option === value) ?? fallback;
}

/**
 * Truthy flags. Matches the exporter's own localized Yes, plus the words and
 * values a hand-edited sheet is likely to carry.
 */
function toBoolean(cell: XlsxReadCell, labels: ExcelExportLabels[], fallback: boolean): boolean {
  if (typeof cell === 'boolean') return cell;
  const value = toText(cell).toLowerCase();
  if (!value) return fallback;
  if (labels.some((set) => set.yes.toLowerCase() === value)) return true;
  if (labels.some((set) => set.no.toLowerCase() === value)) return false;
  if (['yes', 'y', 'true', '1', 'on'].includes(value)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(value)) return false;
  return fallback;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Sheet + column resolution
// ---------------------------------------------------------------------------

/**
 * Maps a sheet's columns onto schema fields.
 *
 * Headers are matched against the user's current language and against English,
 * which covers a workbook exported on another device. When too few headers
 * match (a third language, or a hand-built sheet with its own wording) it falls
 * back to the exporter's fixed column order, and reports whether the first row
 * still looks like a header so the caller can skip it.
 */
export function resolveColumns<T extends string>(
  headerCells: XlsxReadCell[],
  columns: readonly T[],
  labelSets: ExcelExportLabels[],
): { indexByField: Partial<Record<T, number>>; matchedHeader: boolean } {
  const fieldByHeader = new Map<string, T>();
  for (const labels of labelSets) {
    for (const column of columns) {
      const header = normalizeHeader(labels[column as keyof ExcelExportLabels]);
      if (header && !fieldByHeader.has(header)) fieldByHeader.set(header, column);
    }
  }

  const indexByField: Partial<Record<T, number>> = {};
  let matches = 0;
  headerCells.forEach((cell, index) => {
    const field = fieldByHeader.get(normalizeHeader(toText(cell)));
    if (field && indexByField[field] === undefined) {
      indexByField[field] = index;
      matches += 1;
    }
  });

  if (matches >= 2) return { indexByField, matchedHeader: true };

  const positional: Partial<Record<T, number>> = {};
  columns.forEach((column, index) => {
    positional[column] = index;
  });
  return { indexByField: positional, matchedHeader: false };
}

function sheetRowsFor(
  workbook: XlsxWorkbook,
  kind: ExcelSheetKind,
  order: readonly ExcelSheetKind[],
  labelSets: ExcelExportLabels[],
): XlsxReadCell[][] | null {
  const wanted = labelSets.map((labels) => normalizeHeader(labels[SHEET_LABEL_FIELDS[kind]]));
  const byName = workbook.sheets.find((sheet) => wanted.includes(normalizeHeader(sheet.name)));
  if (byName) return byName.rows;

  // No name match (a third language, or renamed tabs): fall back to the
  // exporter's sheet order.
  const positional = workbook.sheets[order.indexOf(kind)];
  return positional ? positional.rows : null;
}

/**
 * When the header row could not be identified by name, decide whether row 0 is
 * still a header by checking the column that must hold a number.
 */
function shouldSkipFirstRow(rows: XlsxReadCell[][], numericIndex: number | undefined): boolean {
  if (numericIndex === undefined) return false;
  const first = rows[0];
  if (!first) return false;
  return toNumber(first[numericIndex]) === null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const SHEET_ORDER: readonly ExcelSheetKind[] = [
  'transactions',
  'accounts',
  'categories',
  'recurring',
];

/** Reads a workbook into plain rows. Pure: no DB access, no file system. */
export function parseExcelWorkbook(
  workbook: XlsxWorkbook,
  options: { labels: ExcelExportLabels; fallbackCurrency: string },
): ParsedExcelData {
  const labelSets = [options.labels, ENGLISH_EXCEL_LABELS];
  const fallbackCurrency = options.fallbackCurrency.trim() || 'USD';

  const accounts: ParsedExcelAccount[] = [];
  const categories: ParsedExcelCategory[] = [];
  const transactions: ParsedExcelTransaction[] = [];
  const recurringRules: ParsedExcelRecurringRule[] = [];
  let skipped = 0;

  const accountRows = sheetRowsFor(workbook, 'accounts', SHEET_ORDER, labelSets);
  if (accountRows) {
    const { indexByField, matchedHeader } = resolveColumns(
      accountRows[0] ?? [],
      ACCOUNT_COLUMNS,
      labelSets,
    );
    const at = (row: XlsxReadCell[], field: (typeof ACCOUNT_COLUMNS)[number]) => {
      const index = indexByField[field];
      return index === undefined ? null : (row[index] ?? null);
    };
    const start =
      matchedHeader || shouldSkipFirstRow(accountRows, indexByField.startingBalance) ? 1 : 0;

    for (let i = start; i < accountRows.length; i += 1) {
      const row = accountRows[i];
      const name = toText(at(row, 'name'));
      if (!name) continue;
      accounts.push({
        name,
        group: toText(at(row, 'group')) || null,
        type: toEnum<AccountType>(at(row, 'type'), ['debit', 'credit'], 'debit'),
        currency: toText(at(row, 'currency')).toUpperCase() || fallbackCurrency,
        startingBalance: toNumber(at(row, 'startingBalance')) ?? 0,
        includeInTotals: toBoolean(at(row, 'includeInTotals'), labelSets, true),
      });
    }
  }

  const categoryRows = sheetRowsFor(workbook, 'categories', SHEET_ORDER, labelSets);
  if (categoryRows) {
    const { indexByField, matchedHeader } = resolveColumns(
      categoryRows[0] ?? [],
      CATEGORY_COLUMNS,
      labelSets,
    );
    const at = (row: XlsxReadCell[], field: (typeof CATEGORY_COLUMNS)[number]) => {
      const index = indexByField[field];
      return index === undefined ? null : (row[index] ?? null);
    };
    // The categories sheet has no numeric column, so fall back to matching the
    // known type values instead.
    const typeIndex = indexByField.type;
    const firstType = typeIndex === undefined ? '' : toText(categoryRows[0]?.[typeIndex]);
    const start =
      matchedHeader || (firstType !== 'expense' && firstType !== 'income' && !!firstType) ? 1 : 0;

    for (let i = start; i < categoryRows.length; i += 1) {
      const row = categoryRows[i];
      const name = toText(at(row, 'name'));
      if (!name) continue;
      categories.push({
        name,
        type: toEnum<CategoryType>(at(row, 'type'), ['expense', 'income'], 'expense'),
        parent: toText(at(row, 'parent')) || null,
        icon: toText(at(row, 'icon')),
      });
    }
  }

  const transactionRows = sheetRowsFor(workbook, 'transactions', SHEET_ORDER, labelSets);
  if (transactionRows) {
    const { indexByField, matchedHeader } = resolveColumns(
      transactionRows[0] ?? [],
      TRANSACTION_COLUMNS,
      labelSets,
    );
    const at = (row: XlsxReadCell[], field: (typeof TRANSACTION_COLUMNS)[number]) => {
      const index = indexByField[field];
      return index === undefined ? null : (row[index] ?? null);
    };
    const start = matchedHeader || shouldSkipFirstRow(transactionRows, indexByField.amount) ? 1 : 0;

    for (let i = start; i < transactionRows.length; i += 1) {
      const row = transactionRows[i];
      if (row.every((cell) => cell === null)) continue;

      const date = toDayKey(at(row, 'date'));
      const amount = toNumber(at(row, 'amount'));
      if (!date || amount === null) {
        skipped += 1;
        continue;
      }

      transactions.push({
        date,
        type: toEnum<TransactionType>(at(row, 'type'), TRANSACTION_TYPES, 'expense'),
        // The exporter writes magnitudes and lets Type carry the direction, so a
        // stray sign from a hand-edited sheet would double-count as a negative.
        amount: Math.abs(amount),
        currency: toText(at(row, 'currency')).toUpperCase() || fallbackCurrency,
        reportingAmount: toNumber(at(row, 'reportingAmount')),
        reportingCurrency: toText(at(row, 'reportingCurrency')).toUpperCase() || null,
        account: toText(at(row, 'account')),
        fromAccount: toText(at(row, 'fromAccount')),
        toAccount: toText(at(row, 'toAccount')),
        category: toText(at(row, 'category')),
        subcategory: toText(at(row, 'subcategory')),
        note: toText(at(row, 'note')),
        sentiment: toEnum<TransactionSentiment>(at(row, 'sentiment'), SENTIMENTS, 'neutral'),
      });
    }
  }

  // The recurring sheet is optional: the exporter omits it when there are no
  // rules, and then sheet index 3 does not exist.
  const hasRecurringSheet =
    workbook.sheets.length > SHEET_ORDER.indexOf('recurring') ||
    workbook.sheets.some((sheet) =>
      labelSets.some(
        (labels) => normalizeHeader(labels.sheetRecurring) === normalizeHeader(sheet.name),
      ),
    );
  const recurringRows = hasRecurringSheet
    ? sheetRowsFor(workbook, 'recurring', SHEET_ORDER, labelSets)
    : null;
  if (recurringRows) {
    const { indexByField, matchedHeader } = resolveColumns(
      recurringRows[0] ?? [],
      RECURRING_COLUMNS,
      labelSets,
    );
    const at = (row: XlsxReadCell[], field: (typeof RECURRING_COLUMNS)[number]) => {
      const index = indexByField[field];
      return index === undefined ? null : (row[index] ?? null);
    };
    const start = matchedHeader || shouldSkipFirstRow(recurringRows, indexByField.amount) ? 1 : 0;

    for (let i = start; i < recurringRows.length; i += 1) {
      const row = recurringRows[i];
      const name = toText(at(row, 'name'));
      const amount = toNumber(at(row, 'amount'));
      const nextRun = toDayKey(at(row, 'nextRun'));
      if (!name || amount === null || !nextRun) continue;

      recurringRules.push({
        name,
        type: toEnum<'expense' | 'income' | 'transfer'>(
          at(row, 'type'),
          ['expense', 'income', 'transfer'],
          'expense',
        ),
        amount: Math.abs(amount),
        currency: toText(at(row, 'currency')).toUpperCase() || fallbackCurrency,
        account: toText(at(row, 'account')),
        fromAccount: toText(at(row, 'fromAccount')),
        toAccount: toText(at(row, 'toAccount')),
        category: toText(at(row, 'category')),
        pattern: toEnum(at(row, 'pattern'), PATTERNS, 'monthly'),
        interval: Math.max(1, Math.trunc(toNumber(at(row, 'interval')) ?? 1)),
        nextRun,
        endDate: toDayKey(at(row, 'endDate')),
        isActive: toBoolean(at(row, 'active'), labelSets, true),
      });
    }
  }

  return { accounts, categories, transactions, recurringRules, skipped };
}

// ---------------------------------------------------------------------------
// Applying to the database
// ---------------------------------------------------------------------------

const nameKey = (value: string) => value.trim().toLowerCase();

/**
 * Writes parsed rows into the (already purged) database.
 *
 * The spreadsheet carries names, not ids, so everything is resolved by name.
 * Accounts and categories referenced by a transaction but missing from their
 * own sheet are created on the fly, which is what makes a hand-built
 * transactions-only sheet importable.
 */
export function applyExcelImport(
  data: ParsedExcelData,
  fallbackCurrency: string,
): ExcelImportSummary {
  const summary: ExcelImportSummary = {
    accounts: 0,
    categories: 0,
    transactions: 0,
    recurringRules: 0,
    skipped: data.skipped,
  };

  const accountIdByName = new Map<string, string>();
  const accountCurrencyById = new Map<string, string>();

  const createAccount = (account: ParsedExcelAccount): string => {
    if (account.group) accountGroupsRepository.create(account.group);
    const id = accountsRepository.create({
      name: account.name,
      type: account.type,
      accountGroup: account.group,
      currency: account.currency,
      startingBalance: account.startingBalance,
      includeInTotals: account.includeInTotals,
    });
    accountIdByName.set(nameKey(account.name), id);
    accountCurrencyById.set(id, account.currency);
    summary.accounts += 1;
    return id;
  };

  for (const account of data.accounts) {
    if (accountIdByName.has(nameKey(account.name))) continue;
    createAccount(account);
  }

  const resolveAccount = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = accountIdByName.get(nameKey(trimmed));
    if (existing) return existing;
    return createAccount({
      name: trimmed,
      group: null,
      type: 'debit',
      currency: fallbackCurrency,
      startingBalance: 0,
      includeInTotals: true,
    });
  };

  // Category keys are scoped by type, since an "Other" expense and an "Other"
  // income category are genuinely different rows.
  const categoryIdByKey = new Map<string, string>();
  const rootKey = (type: CategoryType, name: string) => `${type}|${nameKey(name)}`;
  const childKey = (type: CategoryType, parent: string, name: string) =>
    `${type}|${nameKey(parent)}|${nameKey(name)}`;

  const createCategory = (
    name: string,
    type: CategoryType,
    parentId: string | null,
    icon: string,
  ): string => {
    const id = categoriesRepository.create({
      name,
      type,
      parentId,
      // Root categories carry the emoji; children inherit their parent's.
      icon: parentId ? icon : icon || (suggestCategoryEmoji(name) ?? ''),
      isDefault: false,
    });
    summary.categories += 1;
    return id;
  };

  const resolveRootCategory = (type: CategoryType, name: string, icon = ''): string => {
    const key = rootKey(type, name);
    const existing = categoryIdByKey.get(key);
    if (existing) return existing;
    const id = createCategory(name, type, null, icon);
    categoryIdByKey.set(key, id);
    return id;
  };

  // Roots first so a child can always find its parent, whatever the row order.
  for (const category of data.categories.filter((row) => !row.parent)) {
    resolveRootCategory(category.type, category.name, category.icon);
  }
  for (const category of data.categories.filter((row) => !!row.parent)) {
    const key = childKey(category.type, category.parent!, category.name);
    if (categoryIdByKey.has(key)) continue;
    const parentId = resolveRootCategory(category.type, category.parent!);
    categoryIdByKey.set(key, createCategory(category.name, category.type, parentId, category.icon));
  }

  const resolveCategory = (
    type: CategoryType,
    category: string,
    subcategory: string,
  ): string | null => {
    const root = category.trim();
    const leaf = subcategory.trim();
    if (!root && !leaf) return null;
    if (!root) return resolveRootCategory(type, leaf);
    const parentId = resolveRootCategory(type, root);
    if (!leaf) return parentId;

    const key = childKey(type, root, leaf);
    const existing = categoryIdByKey.get(key);
    if (existing) return existing;
    const id = createCategory(leaf, type, parentId, '');
    categoryIdByKey.set(key, id);
    return id;
  };

  for (const transaction of data.transactions) {
    const isTransfer = transaction.type === 'transfer';
    const accountId = isTransfer ? null : resolveAccount(transaction.account);
    const fromAccountId = isTransfer ? resolveAccount(transaction.fromAccount) : null;
    const toAccountId = isTransfer ? resolveAccount(transaction.toAccount) : null;

    const categoryType: CategoryType | null =
      transaction.type === 'expense' ? 'expense' : transaction.type === 'income' ? 'income' : null;
    const categoryId = categoryType
      ? resolveCategory(categoryType, transaction.category, transaction.subcategory)
      : null;

    // Recompute the rate from the pair the sheet carries rather than trusting a
    // separate column, so an edited amount stays self-consistent.
    const reportingAmount = transaction.reportingAmount;
    const fxRate =
      reportingAmount !== null && transaction.amount !== 0
        ? reportingAmount / transaction.amount
        : null;

    transactionsRepository.create({
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      reportingCurrency: reportingAmount === null ? null : transaction.reportingCurrency,
      reportingAmount,
      fxRate,
      date: transaction.date,
      accountId,
      fromAccountId,
      toAccountId,
      categoryId,
      note: transaction.note || null,
      sentiment: transaction.sentiment,
    });
    summary.transactions += 1;
  }

  for (const rule of data.recurringRules) {
    const isTransfer = rule.type === 'transfer';
    const accountId = isTransfer ? null : resolveAccount(rule.account);
    const fromAccountId = isTransfer ? resolveAccount(rule.fromAccount) : null;
    const toAccountId = isTransfer ? resolveAccount(rule.toAccount) : null;
    const categoryType: CategoryType | null =
      rule.type === 'expense' ? 'expense' : rule.type === 'income' ? 'income' : null;
    const categoryId = categoryType ? resolveCategory(categoryType, rule.category, '') : null;

    // The repository silently drops a rule that fails these same checks, so
    // test them here rather than reporting rules that were never written.
    const isComplete = isTransfer
      ? !!fromAccountId && !!toAccountId && fromAccountId !== toAccountId
      : !!accountId && !!categoryId;
    if (!isComplete) {
      summary.skipped += 1;
      continue;
    }

    recurringRulesRepository.create({
      name: rule.name,
      type: rule.type,
      amount: rule.amount,
      currency: rule.currency,
      accountId,
      fromAccountId,
      toAccountId,
      categoryId,
      recurrencePattern: rule.pattern,
      recurrenceInterval: rule.interval,
      nextRunDate: rule.nextRun,
      endDate: rule.endDate,
      isActive: rule.isActive,
    });
    summary.recurringRules += 1;
  }

  return summary;
}

/** Reads an `.xlsx` from disk and writes its contents into the database. */
export async function importExcelFromUri(
  uri: string,
  fallbackCurrency: string,
): Promise<ExcelImportSummary> {
  const bytes = await new File(uri).bytes();
  const workbook = readXlsx(bytes);
  const parsed = parseExcelWorkbook(workbook, {
    labels: excelExportLabels(),
    fallbackCurrency,
  });
  return applyExcelImport(parsed, fallbackCurrency);
}
