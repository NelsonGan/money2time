import {
  findFallbackCategory,
  pickDefaultAccountId,
} from '~/features/transactions/lib/entryDefaults';
import { matchCategoryByKeywords } from '~/features/transactions/utils/categoryKeywords';
import type { Account, Category, TransactionSentiment } from '~/types';
import { enabledEntryCurrencies, resolvePinnedCurrency } from '~/utils/currency';
import { dayKeyFromDateLocal } from '~/utils/formatters';

/** A single transaction as parsed by the vision model (Worker response shape). */
export interface ScannedTransaction {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  /**
   * YYYY-MM-DD. The Worker validates this before responding: the receipt's own
   * date when it falls within the last 30 days, otherwise today — so the app
   * uses it as-is. Null only from older workers (fall back to today).
   */
  date: string | null;
  category: string; // a name from the list we sent
  note: string;
  sentiment: TransactionSentiment;
  /**
   * Screenshot mode only: the account name the model matched the payment
   * source on screen against (from the list we sent), or "" when none was a
   * clear match. Absent from quick/itemized responses and older workers.
   */
  account?: string;
}

export interface ReceiptScanQuota {
  used: number;
  limit: number;
  isPro: boolean;
}

export type ReceiptScanMode = 'quick' | 'itemized' | 'screenshot';

export type ScanConfidence = 'high' | 'low';

/** One parsed line item on an itemized scan (Worker response shape). */
export interface ScannedReceiptItem {
  name: string;
  quantity: number;
  lineTotal: number;
  confidence: ScanConfidence;
}

/**
 * Itemized breakdown of a single receipt (Worker `receiptDetail`, schema v2) —
 * just the line items; the app splits them and applies tax itself. Present
 * only on itemized-mode scans of a single-receipt image; older workers never
 * send it.
 */
export interface ScannedReceiptDetail {
  merchant: string | null;
  /** Worker-validated like `ScannedTransaction.date`; null only from older workers. */
  date: string | null;
  /** ISO code detected from the receipt itself; null when the model is unsure. */
  currency: string | null;
  items: ScannedReceiptItem[];
  itemsConfidence: ScanConfidence;
}

export interface ReceiptScanResponse {
  transactions: ScannedTransaction[];
  receiptDetail?: ScannedReceiptDetail | null;
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
  /**
   * 'itemized' also extracts line items for Split by Item; 'screenshot' parses
   * arbitrary payment screenshots and detects the account. Default 'quick'.
   */
  mode?: ReceiptScanMode;
  /**
   * The user's account names — screenshot mode matches the payment source shown
   * on screen against these. Other modes never send them.
   */
  accounts?: string[];
}

/** Error codes surfaced to the client so the UI can branch (paywall vs retry). */
export type ReceiptScanErrorCode =
  | 'limit_reached' // scan quota exhausted (free: lifetime, Pro: monthly) → paywall or alert
  | 'capacity' // provider saturated → retry later
  | 'too_large' // receipt image exceeds the Worker's payload cap
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
  /**
   * Quick Entry default currency; when set, scanned txns are recorded in it.
   * Validated against the currently enabled entry currencies (reporting +
   * `fxCurrencies` + account currencies) exactly like the quick-add sheet and
   * the Quick Entry settings screen do — a stale code (quick add persists the
   * last-used entry currency, which can outlive its sub-currency) is ignored.
   */
  defaultCurrency?: string | null;
  /** The user's sub-currencies (settings `fxCurrenciesJson`). */
  fxCurrencies?: string[];
  defaultExpenseCategoryId?: string | null;
  defaultIncomeCategoryId?: string | null;
  categoryMap?: Partial<Record<string, string>>;
  defaultAccountId?: string | null;
  simpleWalletId?: string | null;
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

/**
 * The account a scanned transaction posts to. A screenshot scan may carry the
 * account name the model matched the on-screen payment source against — an
 * exact (case-insensitive) name match wins; anything else (no detection, a
 * stale/renamed name) falls back to the default. Simple mode always posts to
 * the simple wallet, detection or not.
 */
function resolveAccountId(ctx: ResolveContext, detectedAccount?: string): string | null {
  if (ctx.simpleWalletId) return ctx.simpleWalletId;
  const wanted = detectedAccount?.trim().toLowerCase();
  if (wanted) {
    const match = ctx.accounts.find((a) => a.name.trim().toLowerCase() === wanted);
    if (match) return match.id;
  }
  return pickDefaultAccountId(ctx.accounts, ctx.defaultAccountId);
}

/** The Quick Entry default currency, or null when unset or no longer enabled. */
function resolveDefaultCurrency(ctx: ResolveContext): string | null {
  return resolvePinnedCurrency(
    ctx.defaultCurrency,
    enabledEntryCurrencies(ctx.reportingCurrency, ctx.fxCurrencies ?? [], ctx.accounts),
  );
}

/**
 * The Split-by-Item launch seed resolved from an itemized scan: the parsed
 * line items plus editor defaults (category/account/currency) resolved the
 * same way as the quick path. Shape-compatible with
 * `ReceiptSplitLaunchSeed` (features/transactions/lib/receiptSplitBridge).
 */
export interface ResolvedReceiptDetail {
  items: Array<{
    name: string;
    quantity: number;
    lineTotal: number;
    lowConfidence?: boolean;
  }>;
  merchant: string | null;
  currency: string | null;
  date: string | null;
  receiptUri: string | null;
  categoryId: string | null;
  accountId: string | null;
  lowConfidence?: boolean;
}

/**
 * Maps a Worker `receiptDetail` onto a Split-by-Item launch seed — the line
 * items plus editor defaults (category/account/currency). Pure — unit tested.
 */
export function resolveScannedReceiptDetail(
  detail: ScannedReceiptDetail,
  scanned: ScannedTransaction | null,
  ctx: ResolveContext,
  receiptRelPath: string | null,
): ResolvedReceiptDetail {
  const items = detail.items
    .filter((item) => item.name.trim().length > 0 && Number.isFinite(item.lineTotal))
    .map((item) => ({
      name: item.name.trim(),
      quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      lineTotal: item.lineTotal,
      lowConfidence: item.confidence === 'low' ? true : undefined,
    }));

  return {
    items,
    merchant: detail.merchant ?? scanned?.note?.trim() ?? null,
    // Unlike the quick path, an itemized split keeps the receipt's own
    // currency when the model detected one (the FX snapshot freezes at save).
    currency: detail.currency ?? resolveDefaultCurrency(ctx) ?? ctx.reportingCurrency,
    // Worker-validated receipt date (within the last 30 days, else today); an
    // older worker may send null, which lets the editor fall back to today.
    date: detail.date ?? scanned?.date ?? null,
    receiptUri: receiptRelPath,
    categoryId: scanned ? resolveCategoryId(scanned, ctx) : null,
    accountId: resolveAccountId(ctx),
    lowConfidence: detail.itemsConfidence === 'low' ? true : undefined,
  };
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
    currency: resolveDefaultCurrency(ctx) ?? ctx.reportingCurrency,
    // The Worker already validated the date (receipt date when within the last
    // 30 days, else today); today only when an older worker sent none.
    date: scanned.date ?? dayKeyFromDateLocal(new Date()),
    note,
    sentiment: scanned.sentiment ?? 'neutral',
    categoryId: resolveCategoryId(scanned, ctx),
    accountId: resolveAccountId(ctx, scanned.account),
  };
}
