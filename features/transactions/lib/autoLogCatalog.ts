// Builds the catalog the iOS auto-log App Intent reads out of the App Group.
// No React Native imports — covered by __tests__/features/autoLogCatalog.test.ts.
//
// This is deliberately a separate App Group key from the widget snapshot: that
// snapshot's Swift `Decodable`s are hand-mirrored with no codegen keeping them
// in sync, so bolting accounts/categories onto it would ripple through ~1450
// lines of generated Swift for no gain.

import { PRO_LIMITS } from '~/constants/proLimits';
import type { Account, AddButtonAction, Category } from '~/types';

import { pickDefaultAccountId } from './entryDefaults';

export const AUTOLOG_CATALOG_SCHEMA_VERSION = 1;

export interface AutoLogCatalogAccount {
  id: string;
  name: string;
  currency: string;
}

export interface AutoLogCatalogCategory {
  id: string;
  name: string;
  /**
   * No longer displayed — the picker shows the bare name, since only some
   * categories have an emoji and the mix read as ragged. Still emitted because
   * the Swift `CatalogCategory` decodable declares it non-optional: a JS-only
   * `eas update` that stopped writing it would fail to decode the catalog on
   * every already-shipped binary, taking the whole automation down with it.
   * Safe to drop once no build that requires it is in the wild.
   */
  emoji: string;
  /** False for a subcategory. Drives the picker filter on the Swift side. */
  isRoot: boolean;
}

export interface AutoLogCatalog {
  schemaVersion: number;
  generatedAt: string;
  reportingCurrency: string;
  isSimpleMode: boolean;
  isPro: boolean;
  /** Auto-logs left before the free cap bites; null when unlimited. */
  remaining: number | null;
  defaultAccountId: string | null;
  defaultExpenseCategoryId: string | null;
  /** Entry flow the Back Tap intent should deep-link into. */
  backTapAction: AddButtonAction;
  /**
   * Title for the notification the intent posts when it queues a tap. Localized
   * here because the intent fires while the app is backgrounded and has no
   * access to i18n — the body is just merchant + amount, which needs no
   * translation.
   */
  notificationTitle: string;
  /** Whether the Category picker should offer subcategories as well as roots. */
  includeSubcategories: boolean;
  accounts: AutoLogCatalogAccount[];
  /**
   * Every expense category — auto-log never posts income, but it does ship both
   * roots and children whatever `includeSubcategories` says. Narrowing here
   * would stop an id already saved in a shortcut from resolving; the picker
   * filters on the Swift side instead, via `AutoLogStore.pickerCategories`.
   */
  categories: AutoLogCatalogCategory[];
}

export interface BuildAutoLogCatalogInput {
  accounts: Account[];
  categories: Category[];
  isSimpleMode: boolean;
  simpleWalletId: string | null;
  isPro: boolean;
  autoLogUsageCount: number;
  defaultAccountId: string | null;
  defaultExpenseCategoryId: string | null;
  backTapAction: AddButtonAction;
  /** Opt-in: list subcategories in the Category picker as well as roots. */
  includeSubcategories: boolean;
  notificationTitle: string;
  reportingCurrency: string;
  generatedAt: string;
}

/**
 * Category icons are either literal emoji or ASCII icon ids, and only emoji
 * render in a Shortcuts picker. Mirrors `categoryEmojiForWidget` in
 * services/widgetSnapshot.shared.ts.
 */
function categoryEmoji(icon: string | undefined): string {
  if (!icon) return '';
  return /[^\u0000-\u007f]/.test(icon) ? icon : '';
}

const bySortOrder = <T extends { sortOrder?: number }>(a: T, b: T) =>
  (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);

/**
 * Snapshot everything the App Intent needs to render its account/category
 * pickers and resolve defaults without touching the database.
 */
export function buildAutoLogCatalog(input: BuildAutoLogCatalogInput): AutoLogCatalog {
  // Simple mode hides accounts entirely, so the intent should offer exactly the
  // one wallet everything lands in rather than a picker the user never chose.
  const simpleWallet = input.isSimpleMode
    ? input.accounts.find((account) => account.id === input.simpleWalletId)
    : undefined;
  const visibleAccounts = input.isSimpleMode
    ? simpleWallet
      ? [simpleWallet]
      : []
    : [...input.accounts].sort(bySortOrder);

  const defaultAccountId = input.isSimpleMode
    ? input.simpleWalletId
    : pickDefaultAccountId(input.accounts, input.defaultAccountId);

  const expenseCategories = input.categories
    .filter((category) => category.type === 'expense')
    .sort(bySortOrder);

  const defaultExpenseCategoryId =
    input.defaultExpenseCategoryId &&
    expenseCategories.some((category) => category.id === input.defaultExpenseCategoryId)
      ? input.defaultExpenseCategoryId
      : null;

  return {
    schemaVersion: AUTOLOG_CATALOG_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    reportingCurrency: input.reportingCurrency,
    isSimpleMode: input.isSimpleMode,
    isPro: input.isPro,
    remaining: input.isPro
      ? null
      : Math.max(0, PRO_LIMITS.FREE_MAX_AUTO_LOGS - input.autoLogUsageCount),
    defaultAccountId,
    defaultExpenseCategoryId,
    backTapAction: input.backTapAction,
    notificationTitle: input.notificationTitle,
    includeSubcategories: input.includeSubcategories,
    accounts: visibleAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    })),
    categories: expenseCategories.map((category) => ({
      id: category.id,
      name: category.name,
      emoji: categoryEmoji(category.icon),
      isRoot: !category.parentId,
    })),
  };
}
