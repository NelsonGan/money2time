// Pure core for iOS auto-log (the Shortcuts "Transaction" automation).
// No React Native imports — covered by __tests__/features/autoLog.test.ts.
//
// The App Intent stays deliberately dumb: it queues the trigger's Amount
// string verbatim into the App Group and lets this module parse it at drain
// time, so the only genuinely fiddly logic here stays under Jest rather than
// living in untestable Swift.

import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { Account, Category } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { detectCurrency, parseNumber } from '~/utils/moneyText';

import { findFallbackCategory, pickDefaultAccountId } from './entryDefaults';

/**
 * How long the intent may still merge a re-run of `perform()` onto a
 * provisional row. MUST match `UPSERT_WINDOW_SECONDS` in
 * plugins/withMoney2TimeAutoLog.js.
 */
export const AUTOLOG_UPSERT_WINDOW_SECONDS = 120;

/** One queued tap-to-pay, as written by the App Intent into the App Group. */
export interface AutoLogPendingEntry {
  id: string;
  /** ISO timestamp of the tap, stamped by the intent. */
  createdAt: string;
  /** The trigger's Amount variable, verbatim (e.g. `$12.34`, `€12,34`). */
  amountRaw: string;
  /** The trigger's Merchant variable. */
  merchant: string | null;
  /** The trigger's Card or Pass variable. Diagnostic only — the account comes from `accountId`. */
  cardName: string | null;
  /** Account chosen in the automation's setup, when the user tied this card to one. */
  accountId: string | null;
  /** Category, either preset at setup time or answered at the prompt. */
  categoryId: string | null;
  /** True until the category prompt resolves. See the plugin's upsert comment. */
  provisional: boolean;
}

/**
 * Read the pending queue the Swift intent wrote. Everything here crosses the
 * native boundary, so a malformed or half-written blob must degrade to "no
 * entries" rather than throw on a foreground.
 */
export function parseAutoLogPendingJson(raw: string | null | undefined): AutoLogPendingEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: AutoLogPendingEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    // id and amountRaw carry the whole entry: without them we can neither
    // dedupe the drain nor post a row, so drop rather than guess.
    if (typeof row.id !== 'string' || !row.id) continue;
    if (typeof row.amountRaw !== 'string') continue;
    entries.push({
      id: row.id,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      amountRaw: row.amountRaw,
      merchant: typeof row.merchant === 'string' ? row.merchant : null,
      cardName: typeof row.cardName === 'string' ? row.cardName : null,
      accountId: typeof row.accountId === 'string' ? row.accountId : null,
      categoryId: typeof row.categoryId === 'string' ? row.categoryId : null,
      provisional: row.provisional === true,
    });
  }
  return entries;
}

/**
 * One screenshot queued by the "Log Screenshot" App Intent, as enriched by the
 * native module: the image bytes live as a file in the App Group container and
 * `path` is its absolute path there.
 */
export interface AutoLogPendingScan {
  id: string;
  /** ISO timestamp of when the shortcut ran, stamped by the intent. */
  createdAt: string;
  /** Absolute path of the queued image inside the App Group container. */
  path: string;
}

/**
 * Read the pending screenshot queue the native module returned. Crosses the
 * native boundary, so a malformed blob degrades to "no entries" — same
 * contract as {@link parseAutoLogPendingJson}.
 */
export function parseAutoLogPendingScansJson(raw: string | null | undefined): AutoLogPendingScan[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: AutoLogPendingScan[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    // id and path carry the whole entry: without them we can neither dedupe
    // the drain nor read the image, so drop rather than guess.
    if (typeof row.id !== 'string' || !row.id) continue;
    if (typeof row.path !== 'string' || !row.path) continue;
    entries.push({
      id: row.id,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      path: row.path,
    });
  }
  return entries;
}

/**
 * Folder (under the app's document directory) that Android's share target
 * copies shared images into. Must match SHARED_SCANS_DIR in
 * plugins/withMoney2TimeShareScan.js.
 */
export const SHARED_SCANS_DIR = 'shared-scans';

const SHARED_SCAN_FILE = /^(\d{10,})-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|heic)$/i;

/**
 * Read the Android share queue from a listing of its folder. The share activity
 * names each image `<epochMillis>-<uuid>.<ext>` and writes it as `<name>.part`
 * first, renaming only once the copy is complete, so anything that does not
 * match the final shape (a copy still in flight, a stray file) is skipped
 * rather than scanned half-written. The file name doubles as the entry id,
 * which is what `clearAutoLogPendingScans` deletes by. Oldest share first, so
 * a batch scans in the order it was shared.
 */
export function parseSharedScanFileNames(
  names: readonly string[],
  dirPath: string,
): AutoLogPendingScan[] {
  const base = dirPath.replace(/^file:\/\//, '').replace(/\/+$/, '');
  return names
    .map((name) => ({ name, match: SHARED_SCAN_FILE.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ name, match }) => ({ name, millis: Number(match[1]) }))
    .sort((a, b) => a.millis - b.millis || a.name.localeCompare(b.name))
    .map(({ name, millis }) => ({
      id: name,
      createdAt: new Date(millis).toISOString(),
      path: `${base}/${name}`,
    }));
}

/**
 * The queued entries it is safe to post right now.
 *
 * A provisional row means the category prompt is still outstanding. Posting it
 * immediately would race the user's answer — they would pick a category for a
 * row we had already drained and cleared, and the pick would vanish. But never
 * posting it would strand every ignored prompt, which breaks the promise that a
 * tap is logged either way. So a provisional row becomes fair game once it is
 * older than the window in which the intent could still patch it.
 */
export function selectDrainableAutoLogEntries(
  entries: AutoLogPendingEntry[],
  now: Date = new Date(),
): AutoLogPendingEntry[] {
  return entries.filter((entry) => {
    if (!entry.provisional) return true;
    const created = new Date(entry.createdAt).getTime();
    // An unreadable stamp would strand the row forever; prefer posting it.
    if (Number.isNaN(created)) return true;
    return now.getTime() - created > AUTOLOG_UPSERT_WINDOW_SECONDS * 1000;
  });
}

export interface ParsedAutoLogAmount {
  amount: number;
  /**
   * ISO code only when the raw string identifies one beyond doubt; null
   * otherwise, which tells the caller to fall back to the account's currency.
   */
  currency: string | null;
}

/**
 * Parse the trigger's Amount text. Returns null when there is no usable number,
 * which tells the drain to drop the entry rather than post a bogus row.
 */
export function parseAutoLogAmount(raw: string): ParsedAutoLogAmount | null {
  const value = parseNumber(raw);
  if (value === null) return null;

  // A refund arrives negative; we still log magnitude as an expense.
  const amount = Math.abs(value);
  if (amount <= 0) return null;

  return { amount, currency: detectCurrency(raw) };
}

/**
 * The tap's own instant, as the full UTC ISO string the editor also stores, so
 * the row sorts by time within its day and a bank alert for the same purchase
 * can be matched to it (features/autoLog/lib/dedupe.ts). A stamp that does not
 * parse falls back to its day.
 */
function tapDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? dayKeyFromIsoLocal(createdAt) : parsed.toISOString();
}

export interface AutoLogResolveContext {
  accounts: Account[];
  categories: Category[];
  /** `quickEntryPrefs.defaultAccountId`. */
  defaultAccountId: string | null;
  /** `quickEntryPrefs.defaultExpenseCategoryId`. */
  defaultExpenseCategoryId: string | null;
  reportingCurrency: string;
  /**
   * `quickEntryPrefs.autoLogAutoCategorize`. When true (the default), a tap
   * with no category preset in the automation is categorized from its merchant
   * name via {@link matchMerchantCategoryId} before the default fallback — so
   * the automation never has to prompt for a category on pay.
   */
  autoCategorizeByMerchant?: boolean;
  /**
   * Resolve a merchant string to one of `expenseCategories`, or null when
   * nothing matches. Injected (rather than importing the keyword matcher here)
   * so this stays a pure core with no i18n/RN imports — the app wires it to
   * `matchCategoryByKeywords` with the user's quick-entry category map.
   */
  matchMerchantCategoryId?: (merchant: string, expenseCategories: Category[]) => string | null;
}

/**
 * Turn a queued tap into a transaction input. Returns null when the amount is
 * unusable.
 *
 * Account precedence: the automation's explicit pick, then the user's saved
 * default, then their first account.
 *
 * Category precedence: a category preset in the automation or answered at the
 * prompt, then a keyword match on the merchant name (when auto-categorization
 * is on), then the user's default, then {@link findFallbackCategory} — the same
 * fallback every other entry flow uses.
 */
export function resolveAutoLogEntry(
  entry: AutoLogPendingEntry,
  ctx: AutoLogResolveContext,
): CreateTransactionInput | null {
  const parsed = parseAutoLogAmount(entry.amountRaw);
  if (!parsed) return null;

  const explicitAccountId =
    entry.accountId && ctx.accounts.some((account) => account.id === entry.accountId)
      ? entry.accountId
      : null;
  const accountId = explicitAccountId ?? pickDefaultAccountId(ctx.accounts, ctx.defaultAccountId);

  const account = accountId ? ctx.accounts.find((item) => item.id === accountId) : undefined;
  const currency = parsed.currency ?? account?.currency ?? ctx.reportingCurrency;

  const note = entry.merchant?.trim() || null;

  const expenseCategories = ctx.categories.filter((category) => category.type === 'expense');
  const pickCategoryId = (id: string | null) =>
    id && expenseCategories.some((category) => category.id === id) ? id : null;
  // Only guess from the merchant when nothing was preset/answered: a category
  // the user or automation chose always wins over a keyword match.
  const merchantCategoryId =
    ctx.autoCategorizeByMerchant && note && ctx.matchMerchantCategoryId
      ? ctx.matchMerchantCategoryId(note, expenseCategories)
      : null;
  const categoryId =
    pickCategoryId(entry.categoryId) ??
    pickCategoryId(merchantCategoryId) ??
    pickCategoryId(ctx.defaultExpenseCategoryId) ??
    findFallbackCategory(ctx.categories, 'expense')?.id ??
    null;

  return {
    type: 'expense',
    amount: parsed.amount,
    currency,
    date: tapDate(entry.createdAt),
    accountId,
    categoryId,
    note,
    sentiment: 'neutral',
  };
}
