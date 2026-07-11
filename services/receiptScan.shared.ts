import { matchCategoryByKeywords } from '~/features/transactions/utils/categoryKeywords';
import type { Account, Category, TransactionSentiment } from '~/types';
import { dayKeyFromDateLocal } from '~/utils/formatters';

/** A single transaction as parsed by the vision model (Worker response shape). */
export interface ScannedTransaction {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  date: string | null; // YYYY-MM-DD or null
  category: string; // a name from the list we sent
  note: string;
  sentiment: TransactionSentiment;
}

export interface ReceiptScanQuota {
  used: number;
  limit: number;
  isPro: boolean;
}

export interface ReceiptScanResponse {
  transactions: ScannedTransaction[];
  quota: ReceiptScanQuota;
}

export interface ScanReceiptArgs {
  /** Relative receipt path from saveReceiptImage, e.g. `receipts/9f3c.jpg`. */
  receiptRelPath: string;
  appUserId: string;
  /** User's reporting currency (settings.currencyCode). */
  currency: string;
  /** The user's expense category names, so the model assigns to real categories. */
  categories: string[];
}

/** Error codes surfaced to the client so the UI can branch (paywall vs retry). */
export type ReceiptScanErrorCode =
  | 'limit_reached' // free monthly quota exhausted → paywall
  | 'capacity' // global cap / provider saturated → retry later
  | 'not_available' // platform without native support
  | 'network' // request failed / timed out
  | 'server'; // 4xx/5xx from the Worker

export class ReceiptScanError extends Error {
  code: ReceiptScanErrorCode;
  isPro?: boolean;
  limit?: number;
  constructor(
    code: ReceiptScanErrorCode,
    message: string,
    extra?: { isPro?: boolean; limit?: number },
  ) {
    super(message);
    this.name = 'ReceiptScanError';
    this.code = code;
    this.isPro = extra?.isPro;
    this.limit = extra?.limit;
  }
}

/**
 * A resolved, editor-ready draft. Field-compatible with `CreateTransactionInput`
 * (minus the FX snapshot, which `AppContext.createTransaction` computes), so a
 * caller can spread it straight into a create call after attaching `receiptUri`.
 */
export interface ScanDraft {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  note: string | null;
  sentiment: TransactionSentiment;
  categoryId: string | null;
  accountId: string | null;
}

export interface ResolveContext {
  categories: Category[];
  accounts: Account[];
  reportingCurrency: string; // settings.currencyCode — fallback when no default currency
  /** Quick Entry default currency; when set, scanned txns are recorded in it. */
  defaultCurrency?: string | null;
  defaultExpenseCategoryId?: string | null;
  defaultIncomeCategoryId?: string | null;
  categoryMap?: Partial<Record<string, string>>;
  defaultAccountId?: string | null;
  simpleWalletId?: string | null;
}

function findFallbackCategory(categories: Category[], type: 'expense' | 'income'): Category | null {
  const sameType = categories.filter((c) => c.type === type);
  const other = sameType.find((c) => /^other/i.test(c.name));
  return other ?? sameType[0] ?? null;
}

function resolveCategoryId(scanned: ScannedTransaction, ctx: ResolveContext): string | null {
  const sameType = ctx.categories.filter((c) => c.type === scanned.type);

  // 1. Exact (case-insensitive) name match — the model picks from the names we sent.
  const wanted = scanned.category?.trim().toLowerCase();
  if (wanted) {
    const exact = sameType.find((c) => c.name.trim().toLowerCase() === wanted);
    if (exact) return exact.id;
  }

  // 2. Keyword match on the note/merchant text.
  const keywordText = `${scanned.note ?? ''} ${scanned.category ?? ''}`.trim();
  const keyword = matchCategoryByKeywords(keywordText, ctx.categories, ctx.categoryMap ?? {});
  if (keyword) {
    const match = ctx.categories.find(
      (c) => c.id === keyword.categoryId && c.type === scanned.type,
    );
    if (match) return match.id;
  }

  // 3. User's default for this type.
  const preferredDefault =
    scanned.type === 'income' ? ctx.defaultIncomeCategoryId : ctx.defaultExpenseCategoryId;
  if (preferredDefault && sameType.some((c) => c.id === preferredDefault)) return preferredDefault;

  // 4. "Other" / first same-type category.
  return findFallbackCategory(ctx.categories, scanned.type)?.id ?? null;
}

function resolveAccountId(ctx: ResolveContext): string | null {
  if (ctx.simpleWalletId) return ctx.simpleWalletId;
  if (ctx.defaultAccountId && ctx.accounts.some((a) => a.id === ctx.defaultAccountId)) {
    return ctx.defaultAccountId;
  }
  const sorted = [...ctx.accounts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return sorted[0]?.id ?? null;
}

/**
 * Maps a model-parsed transaction onto the user's real categories, accounts,
 * and currency, producing an editor-ready draft. Pure — unit tested.
 */
export function resolveScannedToDraft(scanned: ScannedTransaction, ctx: ResolveContext): ScanDraft {
  const note = scanned.note?.trim() ? scanned.note.trim() : null;

  return {
    type: scanned.type === 'income' ? 'income' : 'expense',
    amount: scanned.amount,
    // Recorded in the Quick Entry default currency when set, else the reporting
    // currency — never a currency detected on the receipt.
    currency: ctx.defaultCurrency || ctx.reportingCurrency,
    // The receipt date is ignored — scanned transactions always post today.
    date: dayKeyFromDateLocal(new Date()),
    note,
    sentiment: scanned.sentiment ?? 'neutral',
    categoryId: resolveCategoryId(scanned, ctx),
    accountId: resolveAccountId(ctx),
  };
}
