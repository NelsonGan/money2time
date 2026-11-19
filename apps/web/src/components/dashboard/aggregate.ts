import { dayRange } from "@/lib/backup/dates";
import { albumCategory, albumCategoryForOwn, albumCategoryIconOf, DEFAULT_ALBUM_CATEGORY_LIST, type AlbumCategoryKey } from "@/lib/album/categories";
import { albumGroupOf } from "@/lib/backup/album-group";
import { albumIdOfLine, lineOf } from "@/lib/backup/album-lines";
import { OTHER_COLOR, SERIES_COLORS, type Category, type Model, type RecurringRule, type Trip, type Tx } from "@/lib/backup/model";

import { addAmt, ZERO, type Amt } from "./state";

type MonthFlow = { month: string; spend: Amt; income: Amt; net: Amt };

export function monthlyFlows(txs: Tx[], months: string[]): MonthFlow[] {
  const map = new Map<string, { spend: Amt; income: Amt }>(months.map((m) => [m, { spend: ZERO, income: ZERO }]));
  for (const tx of txs) {
    const entry = map.get(tx.month);
    if (!entry) continue;
    if (tx.spending) entry.spend = addAmt(entry.spend, { money: tx.amount, hours: tx.hours });
    if (tx.earning) entry.income = addAmt(entry.income, { money: tx.amount, hours: tx.hours });
  }
  return months.map((month) => {
    const { spend, income } = map.get(month)!;
    return { month, spend, income, net: { money: income.money - spend.money, hours: income.hours - spend.hours } };
  });
}

export function totals(txs: Tx[]) {
  let spend = ZERO;
  let income = ZERO;
  let spendCount = 0;
  let incomeCount = 0;
  for (const tx of txs) {
    if (tx.spending) {
      spend = addAmt(spend, { money: tx.amount, hours: tx.hours });
      spendCount += 1;
    }
    if (tx.earning) {
      income = addAmt(income, { money: tx.amount, hours: tx.hours });
      incomeCount += 1;
    }
  }
  const net = { money: income.money - spend.money, hours: income.hours - spend.hours };
  const savingsRate = income.money > 0 ? net.money / income.money : null;
  return { spend, income, net, savingsRate, spendCount, incomeCount };
}

export type Slice = {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  amt: Amt;
  count: number;
  category: Category | null;
  /** An album's own line (README: Key patterns > Albums): its spending, whatever the category. */
  trip?: Trip;
  /** A shared album's category, in an album's own breakdown (one of the album's). */
  albumCategory?: AlbumCategoryKey;
  /** The name the album gave that category; absent or null for a default's own, read in the page's language. */
  albumCategoryName?: string | null;
};

const UNCATEGORIZED = "__none";

/**
 * Totals per line of a category list: each album (its spending, whatever the
 * category, counted there alone) and each top-level category. With
 * `parentId`, that category's children; with an album's line, the album's
 * own breakdown (`albumBreakdown`).
 */
export function breakdown(
  txs: Tx[],
  model: Model,
  kind: "spending" | "earning",
  parentId?: string | null,
): Slice[] {
  const albumId = albumIdOfLine(parentId);
  if (albumId) return albumBreakdown(txs.filter((tx) => tx[kind] && tx.albumId === albumId), model, albumId);
  const trips = new Map(model.trips.map((trip) => [trip.id, trip]));
  const map = new Map<string, Slice>();
  for (const tx of txs) {
    if (!tx[kind]) continue;
    const line = lineOf(tx);
    let key: string;
    if (parentId) {
      // An album's spending is on the album's line, not its category's.
      if (line !== parentId) continue;
      key = tx.categoryId ?? UNCATEGORIZED;
    } else {
      key = line;
    }
    let slice = map.get(key);
    if (!slice) {
      const trip = parentId ? undefined : trips.get(albumIdOfLine(key) ?? "");
      const category = trip || key === UNCATEGORIZED ? null : (model.categories.get(key) ?? null);
      slice = {
        id: key,
        name: trip?.name ?? category?.name ?? "",
        icon: category?.icon ?? null,
        color: trip?.color ?? category?.color ?? OTHER_COLOR,
        amt: ZERO,
        count: 0,
        category,
        ...(trip ? { trip } : null),
      };
      map.set(key, slice);
    }
    slice.amt = addAmt(slice.amt, { money: tx.amount, hours: tx.hours });
    slice.count += 1;
  }
  return [...map.values()].sort((a, b) => b.amt.money - a.amt.money);
}

/**
 * An album's spending by category, as the app's album Breakdown has it
 * (features/albums/lib/albumBreakdown.ts): a shared album, or one the user is
 * no longer in, by its own categories, the same for everyone (each entry's
 * `albumCategory`, else a bill's, else what the entry's own category reads
 * as); an album of the user's own by top-level category.
 */
export function albumBreakdown(txs: Tx[], model: Model, albumId: string): Slice[] {
  const group = albumGroupOf(model.raw, albumId);
  const ended = model.trips.find((trip) => trip.id === albumId)?.ended ?? false;
  const byAlbumCategory = ended || txs.some((tx) => tx.albumCategory) || (!!group && [...group.bills.values()].some((bill) => bill.category));
  // A bill's category, for an entry the phone has not stamped yet, and for
  // the entries its paid parts made.
  const categories = group?.categories ?? DEFAULT_ALBUM_CATEGORY_LIST;
  const categoryOf = new Map<string, AlbumCategoryKey>();
  if (byAlbumCategory && group) {
    for (const bill of group.bills.values()) if (bill.category) categoryOf.set(bill.id, bill.category);
    for (const split of model.splits) {
      const category = categoryOf.get(split.transaction_id);
      if (category && split.paid_transaction_id) categoryOf.set(split.paid_transaction_id, category);
    }
  }
  const map = new Map<string, Slice>();
  for (const tx of txs) {
    let key: string;
    let slice: Slice | undefined;
    if (byAlbumCategory) {
      // Else (an entry of the user's own there): what its own category reads as.
      const root = tx.parentId ? model.categories.get(tx.parentId) : null;
      const picked = tx.albumCategory ?? categoryOf.get(tx.id) ?? albumCategoryForOwn(root, categories);
      const known = categories.find((entry) => entry.key === picked);
      // A category the page has no list for (an album no longer shared): the
      // name and icon the entry keeps, else Other.
      const kept = !known && picked === tx.albumCategory && (tx.albumCategoryName || tx.albumCategoryIcon);
      const category = known ?? (kept ? null : (categories.find((entry) => entry.key === "other") ?? DEFAULT_ALBUM_CATEGORY_LIST[DEFAULT_ALBUM_CATEGORY_LIST.length - 1]));
      key = category?.key ?? picked;
      const index = categories.findIndex((entry) => entry.key === key);
      slice = map.get(key) ?? {
        id: key,
        name: category ? (category.name ?? albumCategory(key).name) : (tx.albumCategoryName ?? albumCategory(key).name),
        icon: category ? albumCategoryIconOf(category) : (tx.albumCategoryIcon ?? albumCategory(key).icon),
        color: (index >= 0 ? SERIES_COLORS[index] : undefined) ?? OTHER_COLOR,
        amt: ZERO,
        count: 0,
        category: null,
        albumCategory: key,
        albumCategoryName: category ? category.name : (tx.albumCategoryName ?? null),
      };
    } else {
      key = tx.parentId ?? UNCATEGORIZED;
      const category = key === UNCATEGORIZED ? null : (model.categories.get(key) ?? null);
      slice = map.get(key) ?? { id: key, name: category?.name ?? "", icon: category?.icon ?? null, color: category?.color ?? OTHER_COLOR, amt: ZERO, count: 0, category };
    }
    slice.amt = addAmt(slice.amt, { money: tx.amount, hours: tx.hours });
    slice.count += 1;
    map.set(key, slice);
  }
  return [...map.values()].sort((a, b) => b.amt.money - a.amt.money);
}

/** Group spending by its note, the closest thing the app has to a merchant. */
export function merchants(txs: Tx[]) {
  const map = new Map<string, { name: string; amt: Amt; count: number; names: Map<string, number>; parentId: string | null }>();
  for (const tx of txs) {
    if (!tx.spending || !tx.note) continue;
    const key = tx.note.toLocaleLowerCase().replace(/\s+/g, " ");
    let entry = map.get(key);
    if (!entry) {
      entry = { name: tx.note, amt: ZERO, count: 0, names: new Map(), parentId: tx.parentId };
      map.set(key, entry);
    }
    entry.amt = addAmt(entry.amt, { money: tx.amount, hours: tx.hours });
    entry.count += 1;
    entry.names.set(tx.note, (entry.names.get(tx.note) ?? 0) + 1);
  }
  return [...map.values()]
    .map((entry) => ({
      name: [...entry.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      amt: entry.amt,
      count: entry.count,
      parentId: entry.parentId,
    }))
    .sort((a, b) => b.amt.money - a.amt.money);
}

/** Every day of the period with its spending and income. */
export function dailyFlows(txs: Tx[], start: Date, end: Date) {
  const map = new Map<string, { spend: Amt; income: Amt; count: number }>(dayRange(start, end).map((day) => [day, { spend: ZERO, income: ZERO, count: 0 }]));
  for (const tx of txs) {
    const entry = map.get(tx.dayKey);
    if (!entry) continue;
    if (tx.spending) {
      entry.spend = addAmt(entry.spend, { money: tx.amount, hours: tx.hours });
      entry.count += 1;
    }
    if (tx.earning) entry.income = addAmt(entry.income, { money: tx.amount, hours: tx.hours });
  }
  return [...map.entries()].map(([day, value]) => ({ day, ...value }));
}

/**
 * Hours a month's pay costs, from that month's wage setting: work plus
 * commute, the same hours the app's true hourly rate divides the pay by, so a
 * share of "time worked" never runs past 100%.
 */
export function workedHours(model: Model, month: string): number {
  let wage = model.wages[0];
  if (!wage) return 0;
  for (const w of model.wages) {
    if (w.month <= month) wage = w;
    else break;
  }
  return wage.trueHoursPerWeek * 4.33;
}

/**
 * The length of a working day, in hours: the one the user set for showing
 * hours as workdays, else the latest wage's week over five days, else eight.
 */
export function workdayLength(model: Model): number {
  const wage = model.wages[model.wages.length - 1];
  return model.workdayHours ?? (wage ? wage.hoursPerWeek / 5 : 8);
}

/** Active recurring rules by their next run, soonest first. */
export function upcomingRules(model: Model, limit: number): RecurringRule[] {
  return model.recurring
    .filter((rule) => rule.active && rule.nextRun)
    .sort((a, b) => a.nextRun!.getTime() - b.nextRun!.getTime())
    .slice(0, limit);
}

/** Weekday index (0 = first day of the user's week) for a date. */
export function weekdayIndex(date: Date, weekStartsOn: number) {
  return (date.getDay() - weekStartsOn + 7) % 7;
}

export function weekdayLabels(locale: string, weekStartsOn: number, style: "short" | "narrow" = "short") {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: style });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((i + weekStartsOn) % 7))));
}
