/**
 * Turns a raw backup into the shapes every dashboard page reads from. The rules
 * mirror the Money₂Time app, so a figure here matches the one on the phone:
 *
 * - Rows with `deleted_at` are dropped from every table; the backup keeps them
 *   as tombstones and the app filters them on read.
 * - Totals use the frozen main-currency snapshot, `reporting_amount ?? amount`.
 *   Only balances, items and recurring rules are converted with live rates.
 * - Spending is expenses plus transfers marked `counts_as_expense`. When
 *   reimbursements do not count as spending, both the reimbursable expense and
 *   the income that paid it back drop out of analytics (never out of balances).
 * - A date's month is its financial month (the user's custom month start), and
 *   its hours use the wage of the latest month at or before it.
 */
import {
  DAYS_PER_MONTH,
  dayKeyOf,
  financialMonthKey,
  parseLocalDate,
  parseMonthCycle,
  setPhoneTimeZone,
  type MonthCycle,
} from "./dates";
import { storedBudgetCurrency, storedBudgetRate } from "./budget-currency";
import { monthlyBudgetRows } from "./budget-period";
import { paidWithoutTransfer, paybackNote } from "./paybacks";
import { awaitingAccount, isPayBackPart, owedToPayers, partyKey } from "./split-payer";
import { highlightsRecurringRuns, isRecurringRun, planRuleIdsOf, recurringRuleFee } from "./recurring-run";
import {
  accrueReducingBalance,
  loanAccrualRatePercent,
  loanAccruesInterest,
  loanLedgerAnchor,
  loanProgress,
  loanRateChanges,
  money,
  type LoanMovement,
  type LoanProgress,
} from "./loans";
import type {
  AccountRow,
  AlbumRow,
  BackupFile,
  ItemRow,
  MonthlyBudgetCategoryRow,
  MonthlyBudgetRow,
  RecurringRuleRow,
  SettingsRow,
  TransactionSplitRow,
  WageSettingRow,
} from "./types";

export type Sentiment = "happy" | "neutral" | "sad";

export type Tx = {
  id: string;
  type: "expense" | "income" | "transfer" | "balance_adjustment";
  date: Date;
  dayKey: string;
  month: string;
  /** Main-currency amount, always positive for expenses and income. */
  amount: number;
  hours: number;
  /** Original amount and currency as entered. */
  originalAmount: number;
  currency: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  /** The top-level category the row rolls up into. */
  parentId: string | null;
  note: string;
  sentiment: Sentiment;
  /** Counts toward spending analytics. */
  spending: boolean;
  /** Counts toward income analytics. */
  earning: boolean;
  hour: number | null;
  hasTime: boolean;
  /** The row's `updated_at`: an edit names it, so the phone can tell the row has not changed since. */
  updatedAt: string | null;
  /** The row as stored, for the editor: the longer note, flags and a transfer's received amount. */
  details: string;
  reimbursable: boolean;
  reimbursed: boolean;
  countsAsExpense: boolean;
  toAmount: number | null;
  /**
   * The app keeps this amount in step with something else: a refund follows
   * its expense, and a split bill's amount changes only with its shares (in
   * the Split Bill sheet). The plain amount field does not change it.
   */
  amountLocked: boolean;
  /**
   * A friend's payback on a split bill, tinted in the lists. `"transfer"`:
   * the transfer Mark paid wrote into another account. `"row"`: a payback into
   * the bill's own account (or on a bill with no account), which the app
   * stores only as a paid share, shown as a row of its own as the app does
   * (`model.paybackRows`); not a stored transaction, so it cannot be ticked
   * or edited.
   */
  payback?: "transfer" | "row";
  /**
   * A split bill a friend paid: the friend's name ("" when never named). The
   * expense is then the user's own share, owed to that friend.
   */
  paidBy?: string;
  /**
   * The user's side of a shared album's bill: the group's id, which is its
   * album's (the app's `albumGroupId`). The bill is everyone's in the album,
   * so it is changed, settled, deleted and taken out of the album in the app.
   */
  albumGroupId?: string;
  /**
   * A shared album's bill someone else said the user paid, on none of their
   * accounts until they pick one in the app (the app's `needsAccountConfirm`).
   */
  confirmAccount?: boolean;
  /** Made by an ordinary recurring rule (`isRecurringRun`), tinted in the lists while `Model.highlightRecurring`. */
  recurring?: boolean;
};

export type Category = {
  id: string;
  name: string;
  type: "expense" | "income";
  parentId: string | null;
  icon: string | null;
  sortOrder: number;
  /** Fixed chart colour, assigned by lifetime size so it never changes between pages. */
  color: string;
  children: string[];
  /** Deleted in the app. Kept only so rows still on it show its name, as the app's Insights does. */
  deleted?: boolean;
  /** The row's `updated_at`, which an edit names. */
  updatedAt: string | null;
};

export type Account = {
  id: string;
  name: string;
  type: string;
  group: string;
  groupOrder: number;
  sortOrder: number;
  currency: string;
  logoId: string | null;
  includeInTotals: boolean;
  liability: boolean;
  /** In the account's own currency; positive means money owed for liabilities. */
  balance: number;
  /** Converted to the main currency; null when no rate is known. */
  balanceBase: number | null;
  /**
   * Contribution to net worth in the main currency (liabilities negative). An
   * account with no rate to the main currency counts its own balance, as the
   * app does.
   */
  netBase: number;
  /**
   * What the Accounts page shows and totals, in the account's currency: the
   * balance, except a flat-rate loan, which shows everything still to hand
   * over (interest included), as the app's Accounts screen does. Net worth
   * elsewhere keeps the principal, like the app's Insights.
   */
  pageBalance: number;
  /** `pageBalance` in the main currency, signed like `netBase`. */
  pageBase: number;
  goal: { target: number; targetDate: string | null; achieved: boolean; archived: boolean; coverUri: string | null; emoji: string | null } | null;
  loan: (LoanProgress & { interestCharged: number; monthlyPayment: number | null; rate: number | null; startDate: string | null; archived: boolean }) | null;
  /** `dueDaysAfter` set: due that many days after each statement, not on `dueDay`. */
  creditLimitDays: { statementDay: number | null; dueDay: number | null; dueDaysAfter: number | null } | null;
  txCount: number;
  lastActivity: string | null;
  raw: AccountRow;
};

export type WagePeriod = {
  month: string;
  hoursPerWeek: number;
  /** Work hours plus commute, the hours the app's true hourly rate is spread over. */
  trueHoursPerWeek: number;
  rate: number;
};

export type RecurringRule = {
  id: string;
  name: string;
  type: string;
  amount: number;
  currency: string;
  /** Main-currency amount per occurrence. */
  amountBase: number;
  /** Main-currency cost per month. */
  monthlyBase: number;
  /** A transfer rule's fee on each run (an expense the run writes beside it), or null. */
  fee: { amount: number; currency: string; base: number } | null;
  /** The fee's main-currency cost per month, 0 without one. */
  feeMonthlyBase: number;
  pattern: string;
  interval: number;
  nextRun: Date | null;
  endDate: string | null;
  active: boolean;
  counts: boolean;
  logoId: string | null;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  /** As stored, for the editor. */
  fromAccountId: string | null;
  note: string;
  nextRunDay: string | null;
  endDay: string | null;
  updatedAt: string | null;
};

/** An account group, in the app's order. */
export type AccountGroup = { id: string; name: string; updatedAt: string | null };

export type BudgetMonth = {
  id: string;
  month: string;
  name: string;
  /** In the budget's currency, as are its lines. */
  total: number;
  countUnbudgeted: boolean;
  emoji: string | null;
  lines: { categoryId: string; amount: number }[];
  /** The budget's currency; null for the main currency (lib/backup/budget-currency.ts). */
  currency: string | null;
  /** One unit of `currency` in the main currency when the budget was made; null without one. */
  fxRate: number | null;
};

export type Trip = {
  id: string;
  name: string;
  coverUri: string | null;
  place: string | null;
  countryCode: string | null;
  start: Date | null;
  end: Date | null;
  active: boolean;
  txIds: string[];
};

export type Item = {
  id: string;
  name: string;
  iconId: string | null;
  price: number;
  priceBase: number;
  purchaseDate: Date | null;
  endDate: Date | null;
  salePrice: number | null;
  salePriceBase: number | null;
  daysOwned: number;
  dailyCostBase: number;
  dailyHours: number;
  active: boolean;
  note: string | null;
};

export type SplitDebt = {
  person: string;
  /** What the person's shares are grouped under: a real user's account, else the folded name. */
  key: string;
  /** The share in the main currency, rounded to the cent as the app's Settle Up does. */
  amountBase: number;
  txId: string;
  date: Date;
  note: string;
};

/**
 * One change to one account's balance, in that account's currency. `asset` is
 * the change to an asset's balance and `liability` the change to what a credit
 * card or loan owes; adjustments carry their own sign in both.
 */
export type Movement = {
  accountId: string;
  /** The row's date as stored, which the loan interest walk reads (as the app's does). */
  date: string;
  dayKey: string;
  month: string;
  asset: number;
  liability: number;
};

export type Model = {
  today: Date;
  currency: string;
  symbol: string;
  cycle: MonthCycle;
  weekStartsOn: number;
  workdayHours: number | null;
  txs: Tx[];
  txById: Map<string, Tx>;
  categories: Map<string, Category>;
  accounts: Account[];
  accountById: Map<string, Account>;
  wages: WagePeriod[];
  rateForMonth: (month: string) => number;
  recurring: RecurringRule[];
  budgets: BudgetMonth[];
  trips: Trip[];
  items: Item[];
  splitDebts: SplitDebt[];
  /** What the user still owes friends for the bills they paid, one entry per bill. */
  splitOwed: SplitDebt[];
  splits: TransactionSplitRow[];
  /**
   * The paybacks that wrote no transfer, as transfer-shaped rows that stay in
   * the bill's account (`Tx.payback` "row"), newest first. Only the transaction
   * lists show them: no total, balance or chart counts them, since the bill
   * already went down by what was paid back. As the app's `buildPaybackRows`.
   */
  paybackRows: Tx[];
  /** Whether the lists tint entries a recurring rule made: the phone's setting, off by default. */
  highlightRecurring: boolean;
  firstMonth: string;
  currentMonth: string;
  toBase: (amount: number, currency: string | null | undefined) => number | null;
  movements: Movement[];
  groups: AccountGroup[];
  /** Currencies an entry may be in, as the app offers them: main, added, then account ones. */
  currencies: string[];
  /** The backup's tables as the phone sent them, for editors that need a row as stored. */
  raw: BackupFile["tables"];
};

/** The added currencies the app's settings list, or none. */
function fxCurrencies(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string" && /^[A-Z]{3}$/.test(code)) : [];
  } catch {
    return [];
  }
}

/** The local day a stored date falls on, `YYYY-MM-DD`, or null. */
function dayOfStored(value: string | null | undefined): string | null {
  const date = parseLocalDate(value);
  return date ? dayKeyOf(date) : null;
}

const live = <T extends { deleted_at?: string | null }>(rows: T[] | undefined): T[] =>
  (rows ?? []).filter((row) => !row.deleted_at);

const LIABILITIES = new Set(["credit", "loan"]);

/**
 * The dashboard's categorical chart colours, in this fixed order; the charts
 * (charts/scale.ts) and the category colours here share them. Built from the
 * app's rosewood theme, twelve like the app's own chart palette, and checked
 * with the dataviz palette validator against a white card: every adjacent pair
 * clears the normal-vision floor, and the one CVD pair in the warning band
 * (slots 7 and 8) is always shown with a legend and icon, never by colour
 * alone. Grey is reserved for "Other".
 */
export const SERIES_COLORS = [
  "#B1525F",
  "#E39A1E",
  "#1E9468",
  "#3B6FD4",
  "#F37D57",
  "#7B5CC4",
  "#2BA6C9",
  "#D9679E",
  "#6E9F2E",
  "#3A4FA0",
  "#A0702A",
  "#B0508E",
] as const;
export const OTHER_COLOR = "#B8B2A4";

export function buildModel(backup: BackupFile, opts: { timeZone?: string | null } = {}): Model {
  // Every stamp below reads as the phone's local time, wherever this browser is.
  setPhoneTimeZone(opts.timeZone ?? null);
  const t = backup.tables;
  const settings: SettingsRow = live(t.settings)[0] ?? t.settings?.[0] ?? ({ id: "primary" } as SettingsRow);
  const currency = settings.currency_code || "USD";
  const symbol = settings.currency_symbol || currency;
  const cycle = parseMonthCycle(settings.first_day_of_month, settings.first_day_overrides_json);
  const exportedAt = parseLocalDate(backup.exportedAt ?? null) ?? new Date();
  // Periods are read relative to when the backup was taken, not to the day it
  // is opened: a month-old backup still opens on its own "this month".
  const today = exportedAt;
  const reimbursementsCount = settings.reimbursements_count_as_expense !== 0;
  const workdayHours =
    settings.workday_display_enabled
      ? (settings.working_hours_per_day ?? 0) >= 1 && (settings.working_hours_per_day ?? 0) <= 24
        ? (settings.working_hours_per_day as number)
        : // Switched on with no length set: the app's default day.
          8
      : null;

  // ---------------------------------------------------------------- rates --
  // `1 base = rate quote`. Rows stored the other way round are inverted.
  const rates = new Map<string, number>();
  const rateDates = new Map<string, string>();
  for (const row of t.exchange_rates ?? []) {
    if (!(row.rate > 0)) continue;
    let quote: string | null = null;
    let rate = 0;
    if (row.base_currency === currency) {
      quote = row.quote_currency;
      rate = row.rate;
    } else if (row.quote_currency === currency) {
      quote = row.base_currency;
      rate = 1 / row.rate;
    }
    if (!quote) continue;
    const asOf = row.as_of_date ?? "";
    // The app keeps the last row it reads for a pair; ties on date go the same way.
    if (!rates.has(quote) || asOf >= (rateDates.get(quote) ?? "")) {
      rates.set(quote, rate);
      rateDates.set(quote, asOf);
    }
  }
  // A backup from before multi-currency has no rates table, and old rows can
  // carry a symbol ("RM") where a code goes: the app reads both as the main
  // currency, so this does too.
  const multiCurrency = Array.isArray(t.exchange_rates);
  const toBase = (amount: number, from: string | null | undefined): number | null => {
    if (!from || from === currency || !multiCurrency || !/^[A-Z]{3}$/.test(from)) return amount;
    const rate = rates.get(from);
    return rate ? amount / rate : null;
  };

  // ---------------------------------------------------------------- wages --
  const wageByMonth = new Map<string, WageSettingRow>();
  for (const row of live(t.monthly_wage_settings)) {
    // Older backups wrote `2024-3`; the app pads it before sorting.
    const parts = /^(\d{4})-(\d{1,2})/.exec(row.month ?? "");
    if (!parts) continue;
    const month = `${parts[1]}-${parts[2].padStart(2, "0")}`;
    const existing = wageByMonth.get(month);
    if (!existing || (row.updated_at ?? "") > (existing.updated_at ?? "")) wageByMonth.set(month, row);
  }
  const wages: WagePeriod[] = [...wageByMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, row]) => ({
      month,
      hoursPerWeek: row.hours_worked_per_week ?? 40,
      trueHoursPerWeek:
        (row.hours_worked_per_week ?? 40) + ((row.commute_minutes_per_workday ?? 0) * (row.workdays_per_week ?? 5)) / 60,
      rate: row.true_hourly_rate ?? row.base_hourly_rate ?? 0,
    }));
  const rateCache = new Map<string, number>();
  const rateForMonth = (month: string): number => {
    const cached = rateCache.get(month);
    if (cached !== undefined) return cached;
    let rate = 0;
    if (wages.length) {
      rate = wages[0].rate;
      for (const wage of wages) {
        if (wage.month <= month) rate = wage.rate;
        else break;
      }
    }
    rateCache.set(month, rate);
    return rate;
  };
  const hoursFor = (amount: number, month: string) => {
    const rate = rateForMonth(month);
    return rate > 0 ? amount / rate : 0;
  };

  // ----------------------------------------------------------- categories --
  // Deleted ones too: the app lets a category go without moving its
  // transactions, and still counts them, under the old name.
  const categoryRows = t.categories ?? [];
  const categories = new Map<string, Category>();
  for (const row of categoryRows) {
    categories.set(row.id, {
      id: row.id,
      name: row.name,
      type: row.type === "income" ? "income" : "expense",
      parentId: row.parent_id ?? null,
      icon: row.icon || null,
      sortOrder: row.sort_order ?? 0,
      color: OTHER_COLOR,
      children: [],
      updatedAt: row.updated_at ?? null,
      ...(row.deleted_at ? { deleted: true } : {}),
    });
  }
  // A child whose parent was deleted stands on its own, as in the app.
  for (const category of categories.values()) {
    if (category.parentId && (!categories.has(category.parentId) || categories.get(category.parentId)?.deleted)) {
      category.parentId = null;
    }
    if (category.parentId) categories.get(category.parentId)?.children.push(category.id);
    if (!category.icon && category.parentId) category.icon = categories.get(category.parentId)?.icon ?? null;
  }
  const rollup = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const category = categories.get(id);
    if (!category) return null;
    return category.parentId ?? category.id;
  };

  // --------------------------------------------------------- transactions --
  const txRows = live(t.transactions);
  // Instalment plans, whose payments are runs but not tinted (`isRecurringRun`).
  const planRuleIds = planRuleIdsOf(t.recurring_rules);
  const txs: Tx[] = [];
  for (const row of txRows) {
    const date = parseLocalDate(row.date);
    if (!date) continue;
    let type = row.type as Tx["type"];
    // A legacy transfer on one account with no ends is really an adjustment.
    if (type === "transfer" && row.account_id && !row.from_account_id && !row.to_account_id) {
      type = "balance_adjustment";
    }
    // A type this dashboard does not know counts as an expense, as in the app.
    if (!["expense", "income", "transfer", "balance_adjustment"].includes(type)) type = "expense";
    const month = financialMonthKey(date, cycle);
    // Signed, as the app sums it: a negative expense (a refund logged as one)
    // takes spending down, and an adjustment keeps its direction. A transfer's
    // direction is in its ends, so its size is enough.
    // `reporting_amount` is in the main currency; without it, convert the
    // amount if it is in another one, so a figure never wears the wrong symbol.
    const original = Number(row.amount ?? 0) || 0;
    const raw = Number(row.reporting_amount ?? toBase(original, row.currency || currency) ?? original) || 0;
    const amount = type === "transfer" ? Math.abs(raw) : raw;
    const countsTransfer = type === "transfer" && row.counts_as_expense === 1;
    // Only an expense can be reimbursable; the flag on anything else means nothing.
    const reimbursementSide = (type === "expense" && !!row.reimbursable) || !!row.reimbursement_of_id;
    const excluded = !reimbursementsCount && reimbursementSide;
    const spending = (type === "expense" || countsTransfer) && !excluded;
    const earning = type === "income" && !excluded;
    // Recurring and imported rows are stamped at exactly local midnight; that
    // is a date, not a moment anyone logged.
    const hasTime =
      row.date.length > 10 &&
      !(date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0);
    txs.push({
      id: row.id,
      type,
      date,
      dayKey: dayKeyOf(date),
      month,
      amount,
      hours: hoursFor(amount, month),
      originalAmount: row.amount,
      currency: row.currency || currency,
      accountId: countsTransfer ? (row.from_account_id ?? null) : (row.account_id ?? null),
      fromAccountId: row.from_account_id ?? null,
      toAccountId: row.to_account_id ?? null,
      categoryId: row.category_id && categories.has(row.category_id) ? row.category_id : null,
      parentId: rollup(row.category_id),
      note: String(row.note ?? "").trim(),
      sentiment: row.sentiment === "happy" || row.sentiment === "sad" ? row.sentiment : "neutral",
      spending,
      earning,
      hour: hasTime ? date.getHours() : null,
      hasTime,
      updatedAt: row.updated_at ?? null,
      amountLocked: !!row.reimbursement_of_id,
      details: String(row.details ?? "").trim(),
      reimbursable: row.reimbursable === 1,
      reimbursed: !!row.reimbursed_at,
      countsAsExpense: row.counts_as_expense === 1,
      toAmount: row.to_amount ?? null,
      recurring: isRecurringRun(row, planRuleIds),
      ...(row.album_group_id ? { albumGroupId: row.album_group_id } : null),
    });
  }
  txs.sort((a, b) => b.date.getTime() - a.date.getTime());
  const txById = new Map(txs.map((tx) => [tx.id, tx]));

  // Colour top-level categories by lifetime size, per type, so the biggest
  // ones get the strongest slots and the colour stays put across pages.
  for (const type of ["expense", "income"] as const) {
    const totals = new Map<string, number>();
    for (const tx of txs) {
      if (!tx.parentId) continue;
      if ((type === "expense" && tx.spending) || (type === "income" && tx.earning)) {
        totals.set(tx.parentId, (totals.get(tx.parentId) ?? 0) + tx.amount);
      }
    }
    const ordered = [...categories.values()]
      .filter((c) => c.type === type && !c.parentId)
      .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
    ordered.forEach((category, index) => {
      category.color = SERIES_COLORS[index] ?? OTHER_COLOR;
      for (const childId of category.children) {
        const child = categories.get(childId);
        if (child) child.color = category.color;
      }
    });
  }

  // ------------------------------------------------------------- accounts --
  const groups = live(t.account_groups);
  const groupOrder = new Map(groups.map((g, i) => [g.name, g.sort_order ?? i]));
  const accountRows = live(t.accounts);
  const sums = new Map<string, { income: number; expense: number; tIn: number; tOut: number; adj: number; count: number; last: string | null }>();
  const bump = (id: string | null | undefined) => {
    if (!id) return null;
    let entry = sums.get(id);
    if (!entry) {
      entry = { income: 0, expense: 0, tIn: 0, tOut: 0, adj: 0, count: 0, last: null };
      sums.set(id, entry);
    }
    return entry;
  };
  const loanMovements = new Map<string, LoanMovement[]>();
  const movements: Movement[] = [];
  // `delta` is in the liability sense (what a loan owes), as the loan walk wants.
  const pushMove = (id: string | null | undefined, date: string, delta: number, adjustment = false) => {
    if (!id || !delta) return;
    const when = parseLocalDate(date);
    if (when) {
      movements.push({
        accountId: id,
        date,
        dayKey: dayKeyOf(when),
        month: financialMonthKey(when, cycle),
        asset: adjustment ? delta : -delta,
        liability: delta,
      });
    }
    const list = loanMovements.get(id);
    if (list) list.push({ date, delta });
    else loanMovements.set(id, [{ date, delta }]);
  };
  for (const row of txRows) {
    const accountAmount = row.account_amount ?? row.amount ?? 0;
    // Only a real adjustment moves a balance on its own: a legacy transfer
    // with one account and no ends moves nothing, as the app sums balances.
    const isAdjustment = row.type === "balance_adjustment";
    const touch = (entry: ReturnType<typeof bump>) => {
      if (!entry) return;
      entry.count += 1;
      if (!entry.last || row.date > entry.last) entry.last = row.date;
    };
    if (isAdjustment) {
      const e = bump(row.account_id);
      if (e) {
        e.adj += accountAmount;
        touch(e);
      }
      pushMove(row.account_id, row.date, accountAmount, true);
    } else if (row.type === "income") {
      const e = bump(row.account_id);
      if (e) {
        e.income += accountAmount;
        touch(e);
      }
      pushMove(row.account_id, row.date, -accountAmount);
    } else if (row.type === "expense") {
      const e = bump(row.account_id);
      if (e) {
        e.expense += accountAmount;
        touch(e);
      }
      pushMove(row.account_id, row.date, accountAmount);
    } else if (row.type === "transfer") {
      const from = bump(row.from_account_id);
      if (from) {
        from.tOut += row.amount ?? 0;
        touch(from);
      }
      const to = bump(row.to_account_id);
      if (to) {
        to.tIn += row.to_amount ?? row.amount ?? 0;
        touch(to);
      }
      pushMove(row.from_account_id, row.date, row.amount ?? 0);
      pushMove(row.to_account_id, row.date, -(row.to_amount ?? row.amount ?? 0));
    }
  }

  const todayKey = dayKeyOf(today);
  const accounts: Account[] = accountRows.map((row) => {
    const s = sums.get(row.id) ?? { income: 0, expense: 0, tIn: 0, tOut: 0, adj: 0, count: 0, last: null };
    const start = row.starting_balance ?? 0;
    const liability = LIABILITIES.has(row.type);
    let balance = liability
      ? start + s.expense + s.tOut - s.income - s.tIn + s.adj
      : start + s.income + s.tIn - s.expense - s.tOut + s.adj;
    let interestCharged = 0;
    if (row.type === "loan" && loanAccruesInterest(row)) {
      const ledger = accrueReducingBalance({
        openingBalance: start,
        anchorDate: loanLedgerAnchor(row, todayKey),
        annualRatePercent: loanAccrualRatePercent(row),
        rateChanges: loanRateChanges(row),
        movements: loanMovements.get(row.id) ?? [],
        todayKey,
      });
      balance = ledger.balance;
      interestCharged = ledger.interestCharged;
    }
    balance = money(balance);
    const accountCurrency = row.currency || currency;
    const balanceBase = toBase(balance, accountCurrency);
    // With no rate the app counts the account's own balance in its totals
    // (`convertedBalance ?? balance`), so this does too.
    const valueBase = balanceBase ?? balance;
    const loan = row.type === "loan" ? loanProgress(row, balance, today) : null;
    // A flat loan's statement carries the interest for the whole term, so the
    // Accounts page shows what is left to pay, converted at the balance's rate.
    const pageBalance = loan && loan.interestModel === "flat" ? loan.leftToPay : balance;
    // A settled loan has nothing to convert.
    const rate = balance !== 0 ? valueBase / balance : 1;
    const pageValue = pageBalance * rate;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      group: row.account_group || "",
      groupOrder: groupOrder.get(row.account_group || "") ?? 999,
      sortOrder: row.sort_order ?? 0,
      currency: accountCurrency,
      logoId: row.logo_id ?? null,
      includeInTotals: row.include_in_totals !== 0,
      liability,
      balance,
      balanceBase,
      netBase: liability ? -valueBase : valueBase,
      pageBalance,
      pageBase: liability ? -pageValue : pageValue,
      goal:
        row.type === "goal" || row.goal_target_amount != null
          ? {
              target: row.goal_target_amount ?? 0,
              targetDate: row.goal_target_date ?? null,
              // A goal of 0 is not met just by existing, as in the app.
              achieved: !!row.goal_achieved_at || (row.goal_target_amount != null && row.goal_target_amount > 0 && balance >= row.goal_target_amount),
              archived: !!row.goal_archived_at,
              coverUri: row.goal_cover_uri ?? null,
              emoji: row.goal_emoji ?? null,
            }
          : null,
      loan: loan
        ? {
            ...loan,
            interestCharged,
            monthlyPayment: row.loan_monthly_payment ?? null,
            rate: row.loan_interest_rate ?? null,
            startDate: row.loan_start_date ?? null,
            archived: !!row.loan_archived_at,
          }
        : null,
      creditLimitDays:
        row.type === "credit"
          ? {
              statementDay: row.credit_statement_day ?? null,
              dueDay: row.credit_due_day ?? null,
              dueDaysAfter: row.credit_due_days_after_statement ?? null,
            }
          : null,
      txCount: s.count,
      lastActivity: s.last,
      raw: row,
    };
  });
  accounts.sort((a, b) => a.groupOrder - b.groupOrder || a.sortOrder - b.sortOrder);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // ------------------------------------------------------------ recurring --
  const recurring: RecurringRule[] = live(t.recurring_rules).map((row: RecurringRuleRow) => {
    const interval = Math.max(1, row.recurrence_interval ?? 1);
    const pattern = row.recurrence_pattern ?? "monthly";
    const perMonth =
      pattern === "daily"
        ? DAYS_PER_MONTH / interval
        : pattern === "weekly"
          ? DAYS_PER_MONTH / (7 * interval)
          : pattern === "yearly"
            ? 1 / (12 * interval)
            : 1 / interval;
    const amountBase = toBase(row.amount, row.currency || currency) ?? row.amount;
    const fee = recurringRuleFee(row, (id) => accountById.get(id)?.type);
    const feeBase = fee ? (toBase(fee.amount, fee.currency) ?? fee.amount) : 0;
    return {
      id: row.id,
      name: row.name || row.note || "",
      type: row.type,
      amount: row.amount,
      currency: row.currency || currency,
      amountBase,
      monthlyBase: amountBase * perMonth,
      fee: fee ? { ...fee, base: feeBase } : null,
      feeMonthlyBase: feeBase * perMonth,
      pattern,
      interval,
      nextRun: parseLocalDate(row.next_run_date ?? null),
      endDate: row.end_date ?? null,
      active: row.is_active !== 0,
      counts: row.type === "expense" || (row.type === "transfer" && row.counts_as_expense === 1),
      logoId: row.logo_id ?? null,
      categoryId: row.category_id ?? null,
      accountId: row.account_id ?? row.from_account_id ?? null,
      toAccountId: row.to_account_id ?? null,
      fromAccountId: row.from_account_id ?? null,
      note: String(row.note ?? ""),
      nextRunDay: dayOfStored(row.next_run_date),
      endDay: dayOfStored(row.end_date),
      updatedAt: row.updated_at ?? null,
    };
  });

  // -------------------------------------------------------------- budgets --
  const budgetLines = new Map<string, MonthlyBudgetCategoryRow[]>();
  for (const line of live(t.monthly_budget_categories)) {
    const list = budgetLines.get(line.budget_id);
    if (list) list.push(line);
    else budgetLines.set(line.budget_id, [line]);
  }
  const budgetByMonth = new Map<string, MonthlyBudgetRow>();
  for (const row of monthlyBudgetRows(live(t.monthly_budgets))) {
    const existing = budgetByMonth.get(row.month);
    if (!existing || (row.updated_at ?? "") > (existing.updated_at ?? "")) budgetByMonth.set(row.month, row);
  }
  const budgets: BudgetMonth[] = [...budgetByMonth.values()]
    .map((row) => ({
      id: row.id,
      month: row.month,
      name: row.template_name ?? "",
      total: row.total_amount ?? 0,
      countUnbudgeted: row.count_unbudgeted !== 0,
      emoji: row.template_emoji ?? null,
      currency: storedBudgetCurrency(row.currency, currency),
      fxRate: storedBudgetRate(row.fx_rate),
      // Lines on a deleted category are dropped, as the app's budget maths
      // drops lines whose category no longer resolves.
      lines: (budgetLines.get(row.id) ?? [])
        .filter((line) => categories.has(line.category_id) && !categories.get(line.category_id)!.deleted)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((line) => ({ categoryId: line.category_id, amount: line.amount })),
    }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  // ---------------------------------------------------------------- trips --
  const albumTx = new Map<string, string[]>();
  for (const link of live(t.album_transactions)) {
    if (!txById.has(link.transaction_id)) continue;
    const list = albumTx.get(link.album_id);
    if (list) list.push(link.transaction_id);
    else albumTx.set(link.album_id, [link.transaction_id]);
  }
  const trips: Trip[] = live(t.albums)
    .map((row: AlbumRow) => {
      const ids = albumTx.get(row.id) ?? [];
      const dates = ids.map((id) => txById.get(id)!.date.getTime());
      return {
        id: row.id,
        name: row.name,
        coverUri: row.cover_photo_uri ?? null,
        place: [row.place_name, row.place_admin].filter(Boolean).join(", ") || null,
        countryCode: row.country_code ?? null,
        start: parseLocalDate(row.start_date ?? null) ?? (dates.length ? new Date(Math.min(...dates)) : null),
        end: parseLocalDate(row.end_date ?? null) ?? (dates.length ? new Date(Math.max(...dates)) : null),
        active: row.is_active === 1,
        txIds: ids,
      };
    })
    .sort((a, b) => (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0));

  // ---------------------------------------------------------------- items --
  const items: Item[] = live(t.items).map((row: ItemRow) => {
    const purchase = parseLocalDate(row.purchase_date ?? null);
    const end = parseLocalDate(row.end_date ?? null);
    const until = end ?? today;
    const days = purchase
      ? Math.max(1, Math.floor((Date.UTC(until.getFullYear(), until.getMonth(), until.getDate()) - Date.UTC(purchase.getFullYear(), purchase.getMonth(), purchase.getDate())) / 86_400_000))
      : 1;
    const price = row.purchase_price ?? 0;
    const net = price - (row.sale_price ?? 0);
    const priceBase = toBase(price, row.currency || currency) ?? price;
    const salePriceBase = row.sale_price == null ? null : (toBase(row.sale_price, row.currency || currency) ?? row.sale_price);
    const dailyBase = (toBase(net, row.currency || currency) ?? net) / days;
    const rate = rateForMonth(financialMonthKey(until, cycle));
    return {
      id: row.id,
      name: row.name,
      iconId: row.icon_id ?? null,
      price,
      priceBase,
      purchaseDate: purchase,
      endDate: end,
      salePrice: row.sale_price ?? null,
      salePriceBase,
      daysOwned: days,
      dailyCostBase: dailyBase,
      dailyHours: rate > 0 ? dailyBase / rate : 0,
      active: !end,
      note: row.note ?? null,
    };
  });

  // --------------------------------------------------------------- splits --
  const splits = live(t.transaction_splits).filter((split) => txById.has(split.transaction_id));
  for (const split of splits) txById.get(split.transaction_id)!.amountLocked = true;
  const txRowById = splits.length ? new Map(txRows.map((row) => [row.id, row])) : null;
  // A share of `bill` in the main currency, as the app's Settle Up: in another
  // currency it converts at the rate saved with the bill, so it never drifts as
  // live rates move; a live rate only when the bill has none, and the share as
  // it is when there is no rate at all. Rounded to the cent.
  const shareInBase = (share: number, bill: Tx): number => {
    if (bill.currency === currency) return money(share);
    const row = txRowById?.get(bill.id);
    const base =
      row?.reporting_currency === currency && row.fx_rate != null
        ? share * row.fx_rate
        : (toBase(share, bill.currency) ?? share);
    return money(base);
  };
  const splitDebts: SplitDebt[] = [];
  for (const split of splits) {
    if (split.is_self || split.paid_at || !(split.amount > 0)) continue;
    const tx = txById.get(split.transaction_id)!;
    splitDebts.push({
      // Unnamed shares group together; the page names the group.
      person: (split.person_name ?? "").trim(),
      key: partyKey(split.person_name, split.member_id),
      amountBase: shareInBase(split.amount, tx),
      txId: tx.id,
      date: tx.date,
      note: tx.note,
    });
  }

  // The other direction: a bill a friend paid, where the user owes that friend
  // their own share (the app's `owedToPayer`).
  const splitOwed: SplitDebt[] = [];
  for (const owed of owedToPayers(splits, (txId) => txById.get(txId)?.originalAmount ?? 0)) {
    const tx = txById.get(owed.txId)!;
    tx.paidBy = owed.person;
    if (owed.paidAt || !(owed.amount > 0)) continue;
    splitOwed.push({
      person: owed.person,
      key: owed.key,
      amountBase: shareInBase(owed.amount, tx),
      txId: tx.id,
      date: tx.date,
      note: tx.note,
    });
  }

  // A shared album's bill the user is said to have paid, with no account yet:
  // someone else saved it, and the user says in the app which account it left
  // (the app's `needsAccountConfirm`).
  for (const id of awaitingAccount(txById.values(), splits)) txById.get(id)!.confirmAccount = true;

  // A friend's paybacks. One into another account wrote a transfer, which is
  // tinted as a payback; one into the bill's own account wrote nothing but the
  // paid share, so it gets a row of its own, as in the app.
  const paybackRows: Tx[] = [];
  for (const split of splits) {
    const bill = txById.get(split.transaction_id)!;
    // A part the user paid a friend back is an expense of its own, not a payback to them.
    if (isPayBackPart(split)) continue;
    if (!split.is_self && split.paid_at && split.paid_transaction_id) {
      const transfer = txById.get(split.paid_transaction_id);
      if (transfer) transfer.payback = "transfer";
      continue;
    }
    if (!paidWithoutTransfer(split)) continue;
    const date = parseLocalDate(split.paid_at);
    if (!date) continue;
    // In the main currency at the rate saved with the bill, as a share owed is.
    const amount = shareInBase(split.amount, bill);
    const month = financialMonthKey(date, cycle);
    const billAccount = txRowById!.get(bill.id)?.account_id ?? null;
    paybackRows.push({
      id: `payback-row:${split.id}`,
      type: "transfer",
      date,
      dayKey: dayKeyOf(date),
      month,
      amount,
      hours: hoursFor(amount, month),
      originalAmount: split.amount,
      currency: bill.currency,
      accountId: null,
      fromAccountId: billAccount,
      toAccountId: billAccount,
      categoryId: null,
      parentId: null,
      note: paybackNote(split.person_name, bill.note),
      sentiment: "neutral",
      spending: false,
      earning: false,
      hour: date.getHours(),
      hasTime: true,
      updatedAt: null,
      amountLocked: true,
      details: "",
      reimbursable: false,
      reimbursed: false,
      countsAsExpense: false,
      toAmount: null,
      payback: "row",
    });
  }
  paybackRows.sort((a, b) => b.date.getTime() - a.date.getTime());

  const currentMonth = financialMonthKey(today, cycle);
  const months = txs.filter((tx) => tx.date.getTime() <= today.getTime()).map((tx) => tx.month);
  const firstMonth = months.length ? months.reduce((a, b) => (a < b ? a : b)) : currentMonth;

  return {
    today,
    currency,
    symbol,
    cycle,
    weekStartsOn: settings.week_starts_on ?? 1,
    workdayHours,
    txs,
    txById,
    categories,
    accounts,
    accountById,
    wages,
    rateForMonth,
    recurring,
    budgets,
    trips,
    items,
    splitDebts,
    splitOwed,
    splits,
    paybackRows,
    highlightRecurring: highlightsRecurringRuns(settings),
    firstMonth,
    currentMonth,
    toBase,
    movements,
    raw: t,
    groups: groups
      .map((g, i) => ({ id: g.id, name: g.name, order: g.sort_order ?? i, updatedAt: g.updated_at ?? null }))
      .sort((a, b) => a.order - b.order)
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt })),
    currencies: [...new Set([currency, ...fxCurrencies(settings.fx_currencies_json), ...accounts.map((a) => a.currency)])],
  };
}
