import type { Model, Tx } from "@/lib/backup/model";

/**
 * The account and category filters, as the app's filter sheets have them
 * (`utils/selectionFilter.ts` in apps/mobile): one list of picked ids per
 * filter, each read as an exclusion (the default) or an inclusion. An empty
 * list is off in either mode, so a newly added account still shows.
 */
export type FilterMode = "exclude" | "include";

export type Filters = {
  accounts: string[];
  expenseCategories: string[];
  incomeCategories: string[];
  accountMode: FilterMode;
  expenseMode: FilterMode;
  incomeMode: FilterMode;
};

export const NO_FILTERS: Filters = {
  accounts: [],
  expenseCategories: [],
  incomeCategories: [],
  accountMode: "exclude",
  expenseMode: "exclude",
  incomeMode: "exclude",
};

/** How many picks are in force: ids gone from this data no longer count. */
export function filterCount(filters: Filters, model: Model): number {
  const live = liveIds(filters, model);
  return live.accounts.length + live.expenseCategories.length + live.incomeCategories.length;
}

function liveIds(filters: Filters, model: Model) {
  return {
    accounts: filters.accounts.filter((id) => model.accountById.has(id)),
    expenseCategories: filters.expenseCategories.filter((id) => model.categories.has(id)),
    incomeCategories: filters.incomeCategories.filter((id) => model.categories.has(id)),
  };
}

/** Reads a saved value back, keeping only what is well formed. */
export function readFilters(value: unknown): Filters {
  if (!value || typeof value !== "object") return NO_FILTERS;
  const v = value as Record<string, unknown>;
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((id): id is string => typeof id === "string") : []);
  const mode = (x: unknown): FilterMode => (x === "include" ? "include" : "exclude");
  return {
    accounts: ids(v.accounts),
    expenseCategories: ids(v.expenseCategories),
    incomeCategories: ids(v.incomeCategories),
    accountMode: mode(v.accountMode),
    expenseMode: mode(v.expenseMode),
    incomeMode: mode(v.incomeMode),
  };
}

function passes(mode: FilterMode, picked: ReadonlySet<string>, ids: (string | null | undefined)[]): boolean {
  if (picked.size === 0) return true;
  const matched = ids.some((id) => id != null && picked.has(id));
  return mode === "include" ? matched : !matched;
}

/**
 * The model with the filtered-out transactions taken away, so every view's
 * totals, charts and lists follow at once, trips and split bills included.
 * Balances, which are what each account holds, stay as they are. The app's
 * rules (`applyTransactionSelectionFilters`): a category pick covers its
 * children, each list applies to its own type, an account inclusion keeps
 * transfers touching that account, and an exclusion matches the row's own
 * account only. A loan repayment counted as spending is filtered as the
 * expense it is reported as: on its funding account (`accountId`), by the
 * expense category list.
 */
export function applyFilters(model: Model, filters: Filters): Model {
  const live = liveIds(filters, model);
  if (live.accounts.length + live.expenseCategories.length + live.incomeCategories.length === 0) return model;
  const accounts = new Set(live.accounts);
  const expense = new Set(live.expenseCategories);
  const income = new Set(live.incomeCategories);
  const includeAccounts = filters.accountMode === "include";

  const keep = (tx: Tx) => {
    const accountIds = includeAccounts ? [tx.accountId, tx.fromAccountId, tx.toAccountId] : [tx.accountId];
    if (!passes(filters.accountMode, accounts, accountIds)) return false;
    const kind = tx.type === "transfer" && tx.countsAsExpense ? "expense" : tx.type;
    if (kind !== "expense" && kind !== "income") return true;
    const category = tx.categoryId ? model.categories.get(tx.categoryId) : undefined;
    const categoryIds = tx.categoryId ? [tx.categoryId, category?.parentId] : [];
    return kind === "expense"
      ? passes(filters.expenseMode, expense, categoryIds)
      : passes(filters.incomeMode, income, categoryIds);
  };
  const txs = model.txs.filter(keep);
  const kept = new Set(txs.map((tx) => tx.id));
  return {
    ...model,
    txs,
    txById: new Map(txs.map((tx) => [tx.id, tx])),
    trips: model.trips.map((trip) => ({ ...trip, txIds: trip.txIds.filter((id) => kept.has(id)) })),
    // Split bills and who owes what stay whole, as the app's Settle up
    // ignores selection filters: the Splits page's totals and its settle
    // list then always agree.
  };
}
