// The numbers behind the Household insights page of a shared ledger (README.md
// > Shared ledgers > Household insights): what the household spent in a month,
// each person's part of it (by whose each entry is, `member_id`), which
// categories each person covers, the last months' trend and the biggest
// entries. Pure, so it is tested without the app.

import {
  monthsBetween,
  shiftYearMonth,
  yearMonthFromKey,
  yearMonthToKey,
} from '~/components/datePicker/monthJump';
import { UNCATEGORIZED_ID } from '~/features/review/lib/reviewMath';
import type { Category, MonthCycleInput, TransactionWithRelations } from '~/types';
import { financialMonthKeyForIso } from '~/utils/financialMonth';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

import type { LedgerPeople, LedgerPerson } from './ledgerPeople';
import { distinctShortNames } from './personNames';

/** The owner's key: their entries hold null in `member_id`. */
export const OWNER_KEY = 'owner';

/** The key a person's amounts are kept under: their account id, or `OWNER_KEY`. */
export function personKey(person: Pick<LedgerPerson, 'memberId'>): string {
  return person.memberId ?? OWNER_KEY;
}

/** Everything a card needs to draw a person: who they are (their colour too) and a short name. */
export interface PersonStyle {
  person: LedgerPerson;
  /** Their first name, or more where someone else on the page shares it. */
  label: string;
}

/** Categories listed in "Who covers what"; the rest are left out. */
export const HOUSEHOLD_TOP_CATEGORIES = 5;
/** Entries listed under "Biggest entries". */
export const HOUSEHOLD_BIGGEST = 3;
/** Months in the trend, the shown month last. */
export const HOUSEHOLD_TREND_MONTHS = 6;

/** A sum below this (half a cent) is nothing: float dust, not money. */
const EPSILON = 0.005;

type HouseholdRow = Pick<
  TransactionWithRelations,
  'id' | 'type' | 'amount' | 'reportingAmount' | 'date' | 'categoryId' | 'memberId' | 'deletedAt'
>;

/** One person's amount, in the order the page lists people. */
export interface PersonAmount {
  personKey: string;
  amount: number;
}

/** An expense with whose it is and its value, worked out once. */
interface IndexedRow {
  row: HouseholdRow;
  personKey: string;
  value: number;
}

interface MonthBucket {
  total: number;
  byPerson: Map<string, number>;
  rows: IndexedRow[];
}

/** Every month's expenses, bucketed once per data change. */
export interface HouseholdIndex {
  months: Map<string, MonthBucket>;
  /** The earliest month with an expense, or null with none. */
  firstMonthKey: string | null;
}

function valueOf(row: Pick<HouseholdRow, 'amount' | 'reportingAmount'>): number {
  return row.reportingAmount ?? row.amount;
}

function addTo(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

/**
 * Buckets live expenses by financial month and person. `rows` should already
 * be the spending rows (reimbursement setting applied, counted repayments
 * reshaped as expenses); anything not a live expense is skipped here.
 * `personKeyOf` names the person an entry belongs to.
 */
export function buildHouseholdIndex(
  rows: readonly HouseholdRow[],
  personKeyOf: (memberId: string | null) => string,
  monthCycle: MonthCycleInput,
): HouseholdIndex {
  const months = new Map<string, MonthBucket>();
  let firstMonthKey: string | null = null;
  for (const row of rows) {
    if (row.deletedAt || row.type !== 'expense') continue;
    const monthKey = financialMonthKeyForIso(row.date, monthCycle);
    let bucket = months.get(monthKey);
    if (!bucket) {
      bucket = { total: 0, byPerson: new Map(), rows: [] };
      months.set(monthKey, bucket);
    }
    const value = valueOf(row);
    const key = personKeyOf(row.memberId);
    bucket.total += value;
    addTo(bucket.byPerson, key, value);
    bucket.rows.push({ row, personKey: key, value });
    if (firstMonthKey === null || monthKey < firstMonthKey) firstMonthKey = monthKey;
  }
  return { months, firstMonthKey };
}

/**
 * The month `offset` months from `monthKey` (negative goes back). A financial
 * month's key names the calendar month it starts in, one key per calendar
 * month whatever the cycle, so this is plain month arithmetic.
 */
export function shiftMonthKey(monthKey: string, offset: number): string {
  return yearMonthToKey(shiftYearMonth(yearMonthFromKey(monthKey), offset));
}

/** The most months the pager holds, so a stray entry dated long ago cannot make it endless. */
const MAX_PAGER_MONTHS = 1200;
/**
 * The fewest months the pager holds, this one included: a ledger with no
 * spending yet (or only this month's) still pages back through the year.
 */
export const HOUSEHOLD_PAGER_MIN_MONTHS = 12;

/**
 * The pager's months, oldest first, up to `currentMonthKey`: from the first
 * month with an expense, or a year back when that is later (or there is none,
 * or it is a future-dated entry's). Past `MAX_PAGER_MONTHS` the oldest are
 * left off, so the months never skip.
 */
export function householdPagerMonths(
  firstMonthKey: string | null,
  currentMonthKey: string,
): string[] {
  const current = yearMonthFromKey(currentMonthKey);
  // A current key that is not `YYYY-MM` gives no months to step through.
  if (!Number.isFinite(current.year) || !Number.isFinite(current.monthIndex)) {
    return [currentMonthKey];
  }
  const spending =
    firstMonthKey && firstMonthKey < currentMonthKey
      ? monthsBetween(yearMonthFromKey(firstMonthKey), current)
      : 0;
  const span = Math.min(
    Math.max(Number.isFinite(spending) ? spending : 0, HOUSEHOLD_PAGER_MIN_MONTHS - 1),
    MAX_PAGER_MONTHS - 1,
  );
  return Array.from({ length: span + 1 }, (_, step) =>
    yearMonthToKey(shiftYearMonth(current, step - span)),
  );
}

export interface HouseholdCategory {
  /** The root category's id, or Review's `UNCATEGORIZED_ID`. */
  id: string;
  amount: number;
  /** Each person's part, in the page's order of people, people with none left out. */
  byPerson: PersonAmount[];
  transactionIds: string[];
}

/** A month's total, for the trend (the shown month's people are in `people`). */
export interface HouseholdTrendMonth {
  monthKey: string;
  total: number;
}

export interface HouseholdBiggest {
  transactionId: string;
  amount: number;
  dayKey: string;
  categoryId: string | null;
  personKey: string;
}

export interface HouseholdMonth {
  monthKey: string;
  total: number;
  /** The change from the month before, or null when that month had nothing. */
  changeRatio: number | null;
  /** Everyone on the page, in order, with what they spent (zero included). */
  people: PersonAmount[];
  categories: HouseholdCategory[];
  trend: HouseholdTrendMonth[];
  biggest: HouseholdBiggest[];
  /** The month's entries by person, for opening one person's spending. */
  transactionIdsByPerson: Map<string, string[]>;
  isEmpty: boolean;
}

function ordered(byPerson: Map<string, number>, order: readonly string[]): PersonAmount[] {
  return order
    .filter((key) => (byPerson.get(key) ?? 0) > EPSILON)
    .map((key) => ({ personKey: key, amount: byPerson.get(key) ?? 0 }));
}

/**
 * The page for one month. `peopleOrder` is everyone in the ledger, in the
 * order the page shows them; anyone else with an entry that month (someone
 * who left, say) is added after them, so they still count.
 */
export function buildHouseholdMonth({
  index,
  monthKey,
  isRunning = false,
  peopleOrder,
  categoriesById,
}: {
  index: HouseholdIndex;
  monthKey: string;
  /** The month under way: no change from the month before, as it is not over. */
  isRunning?: boolean;
  peopleOrder: readonly string[];
  categoriesById: ReadonlyMap<string, Pick<Category, 'parentId'>>;
}): HouseholdMonth {
  const bucket = index.months.get(monthKey);
  const rows = bucket?.rows ?? [];
  const total = bucket?.total ?? 0;
  const byPerson = bucket?.byPerson ?? new Map<string, number>();

  const order = [...peopleOrder];
  for (const key of byPerson.keys()) if (!order.includes(key)) order.push(key);
  const people = order.map((key) => ({ personKey: key, amount: byPerson.get(key) ?? 0 }));

  // A few days of the running month against all of the last would read as a
  // big drop, so only a finished month is compared (as Review does).
  const previousTotal = isRunning ? 0 : (index.months.get(shiftMonthKey(monthKey, -1))?.total ?? 0);
  const changeRatio = previousTotal > EPSILON ? (total - previousTotal) / previousTotal : null;

  const rootOf = (categoryId: string | null): string => {
    if (!categoryId) return UNCATEGORIZED_ID;
    // A category deleted since keeps its own id rather than vanishing.
    return categoriesById.get(categoryId)?.parentId ?? categoryId;
  };
  const categoryBuckets = new Map<
    string,
    { amount: number; byPerson: Map<string, number>; ids: string[] }
  >();
  const transactionIdsByPerson = new Map<string, string[]>();
  for (const { row, personKey: key, value } of rows) {
    const rootId = rootOf(row.categoryId);
    let categoryBucket = categoryBuckets.get(rootId);
    if (!categoryBucket) {
      categoryBucket = { amount: 0, byPerson: new Map(), ids: [] };
      categoryBuckets.set(rootId, categoryBucket);
    }
    categoryBucket.amount += value;
    addTo(categoryBucket.byPerson, key, value);
    categoryBucket.ids.push(row.id);
    const personIds = transactionIdsByPerson.get(key);
    if (personIds) personIds.push(row.id);
    else transactionIdsByPerson.set(key, [row.id]);
  }
  const householdCategories = [...categoryBuckets.entries()]
    .map(([id, value]) => ({
      id,
      amount: value.amount,
      byPerson: ordered(value.byPerson, order),
      transactionIds: value.ids,
    }))
    .filter((category) => category.amount > EPSILON)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, HOUSEHOLD_TOP_CATEGORIES);

  const trendKeys = Array.from({ length: HOUSEHOLD_TREND_MONTHS }, (_, step) =>
    shiftMonthKey(monthKey, step - (HOUSEHOLD_TREND_MONTHS - 1)),
  );
  const trend = trendKeys.map((key) => ({
    monthKey: key,
    total: index.months.get(key)?.total ?? 0,
  }));

  const biggest = [...rows]
    .sort((a, b) => b.value - a.value || b.row.date.localeCompare(a.row.date))
    .slice(0, HOUSEHOLD_BIGGEST)
    .map(({ row, personKey: key, value }) => ({
      transactionId: row.id,
      amount: value,
      dayKey: dayKeyFromIsoLocal(row.date),
      categoryId: row.categoryId,
      personKey: key,
    }));

  return {
    monthKey,
    total,
    changeRatio,
    people,
    categories: householdCategories,
    trend,
    biggest,
    transactionIdsByPerson,
    isEmpty: rows.length === 0,
  };
}

/**
 * The page's people in order (the ledger's own list, then anyone else found
 * on an entry), each with a short name no one else on the page has.
 */
export function buildPeopleStyles(
  people: LedgerPeople | null,
  monthBuckets: Iterable<{ byPerson: Map<string, number> }>,
): { peopleOrder: string[]; styleByKey: Map<string, PersonStyle> } {
  if (!people) return { peopleOrder: [], styleByKey: new Map() };
  const all: LedgerPerson[] = [...people.people];
  const seen = new Set(all.map(personKey));
  for (const bucket of monthBuckets) {
    for (const key of bucket.byPerson.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(people.personFor(key === OWNER_KEY ? null : key));
    }
  }
  const labels = distinctShortNames(all.map((person) => person.name));
  const styleByKey = new Map<string, PersonStyle>();
  all.forEach((person, position) => {
    styleByKey.set(personKey(person), { person, label: labels[position]! });
  });
  return { peopleOrder: people.people.map(personKey), styleByKey };
}
