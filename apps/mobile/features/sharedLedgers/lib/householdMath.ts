// The numbers behind the Household insights page of a shared ledger (README.md
// > Shared ledgers > Household insights): what the household spent in a month,
// each person's part of it (by whose each entry is, `member_id`), which
// categories each person covers, the last months' trend and the biggest
// entries. Pure, so it is tested without the app.

import type { Category, MonthCycleInput, TransactionWithRelations } from '~/types';
import {
  addFinancialMonths,
  financialMonthKeyForDate,
  financialMonthKeyForIso,
  financialMonthStartDate,
} from '~/utils/financialMonth';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

import type { LedgerPeople, LedgerPerson } from './ledgerPeople';
import { PERSON_COLORS } from './personColors';
import { distinctShortNames } from './personNames';

/** The owner's key: their entries hold null in `member_id`. */
export const OWNER_KEY = 'owner';

/** The key a person's amounts are kept under: their account id, or `OWNER_KEY`. */
export function personKey(person: Pick<LedgerPerson, 'memberId'>): string {
  return person.memberId ?? OWNER_KEY;
}

/** Everything a card needs to draw a person: who they are, their colour and short name. */
export interface PersonStyle {
  person: LedgerPerson;
  color: string;
  /** Their first name, or more where someone else on the page shares it. */
  label: string;
}

/** The category bucket of entries that have none. */
export const HOUSEHOLD_UNCATEGORIZED = '__uncategorized__';
/** Categories listed in "Who covers what"; the rest are left out. */
export const HOUSEHOLD_TOP_CATEGORIES = 5;
/** Entries listed under "Biggest this month". */
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

interface MonthBucket {
  total: number;
  byPerson: Map<string, number>;
  rows: HouseholdRow[];
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
    bucket.total += value;
    addTo(bucket.byPerson, personKeyOf(row.memberId), value);
    bucket.rows.push(row);
    if (firstMonthKey === null || monthKey < firstMonthKey) firstMonthKey = monthKey;
  }
  return { months, firstMonthKey };
}

/** The month `offset` financial months from `monthKey` (negative goes back). */
export function shiftMonthKey(
  monthKey: string,
  offset: number,
  monthCycle: MonthCycleInput,
): string {
  return financialMonthKeyForDate(
    addFinancialMonths(financialMonthStartDate(monthKey, monthCycle), offset, monthCycle),
    monthCycle,
  );
}

/**
 * The pager's months, oldest first: from the first month with an expense to
 * `currentMonthKey`, which is always there (an empty ledger has just it). A
 * first month after the current one (a future-dated entry) is ignored.
 */
export function householdPagerMonths(
  firstMonthKey: string | null,
  currentMonthKey: string,
  monthCycle: MonthCycleInput,
): string[] {
  if (!firstMonthKey || firstMonthKey >= currentMonthKey) return [currentMonthKey];
  const months: string[] = [];
  for (
    let key = firstMonthKey;
    key < currentMonthKey && months.length < 1200;
    key = shiftMonthKey(key, 1, monthCycle)
  ) {
    months.push(key);
  }
  months.push(currentMonthKey);
  return months;
}

export interface HouseholdCategory {
  /** The root category's id, or `HOUSEHOLD_UNCATEGORIZED`. */
  id: string;
  amount: number;
  /** Each person's part, in the page's order of people, people with none left out. */
  byPerson: PersonAmount[];
  transactionIds: string[];
}

export interface HouseholdTrendMonth {
  monthKey: string;
  total: number;
  byPerson: PersonAmount[];
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
  monthCycle,
  peopleOrder,
  categories,
  personKeyOf,
}: {
  index: HouseholdIndex;
  monthKey: string;
  monthCycle: MonthCycleInput;
  peopleOrder: readonly string[];
  categories: readonly Pick<Category, 'id' | 'parentId'>[];
  personKeyOf: (memberId: string | null) => string;
}): HouseholdMonth {
  const bucket = index.months.get(monthKey);
  const rows = bucket?.rows ?? [];
  const total = bucket?.total ?? 0;
  const byPerson = bucket?.byPerson ?? new Map<string, number>();

  const order = [...peopleOrder];
  for (const key of byPerson.keys()) if (!order.includes(key)) order.push(key);
  const people = order.map((key) => ({ personKey: key, amount: byPerson.get(key) ?? 0 }));

  const previousTotal = index.months.get(shiftMonthKey(monthKey, -1, monthCycle))?.total ?? 0;
  const changeRatio = previousTotal > EPSILON ? (total - previousTotal) / previousTotal : null;

  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  const rootOf = (categoryId: string | null): string => {
    if (!categoryId) return HOUSEHOLD_UNCATEGORIZED;
    // A category deleted since keeps its own id rather than vanishing.
    return parentById.get(categoryId) ?? categoryId;
  };
  const categoryBuckets = new Map<
    string,
    { amount: number; byPerson: Map<string, number>; ids: string[] }
  >();
  const transactionIdsByPerson = new Map<string, string[]>();
  for (const row of rows) {
    const value = valueOf(row);
    const key = personKeyOf(row.memberId);
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
    shiftMonthKey(monthKey, step - (HOUSEHOLD_TREND_MONTHS - 1), monthCycle),
  );
  const trend = trendKeys.map((key) => {
    const month = index.months.get(key);
    if (!month) return { monthKey: key, total: 0, byPerson: [] };
    // Someone with entries that month but not this one (someone who left)
    // still has their part of its bar, or the stack would not reach its total.
    const monthOrder = [...order];
    for (const person of month.byPerson.keys()) {
      if (!monthOrder.includes(person)) monthOrder.push(person);
    }
    return { monthKey: key, total: month.total, byPerson: ordered(month.byPerson, monthOrder) };
  });

  const biggest = [...rows]
    .sort((a, b) => valueOf(b) - valueOf(a) || b.date.localeCompare(a.date))
    .slice(0, HOUSEHOLD_BIGGEST)
    .map((row) => ({
      transactionId: row.id,
      amount: valueOf(row),
      dayKey: dayKeyFromIsoLocal(row.date),
      categoryId: row.categoryId,
      personKey: personKeyOf(row.memberId),
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
 * on an entry) and each one's colour.
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
  // The ledger's people keep their own colour, as on every row; anyone else
  // takes one nobody on the page has yet, while there is one.
  const used = new Set(people.people.map((person) => person.color));
  const labels = distinctShortNames(all.map((person) => person.name));
  const styleByKey = new Map<string, PersonStyle>();
  all.forEach((person, position) => {
    let color = person.color;
    if (position >= people.people.length) {
      color = PERSON_COLORS.find((candidate) => !used.has(candidate)) ?? person.color;
      used.add(color);
    }
    styleByKey.set(personKey(person), { person, color, label: labels[position]! });
  });
  return { peopleOrder: people.people.map(personKey), styleByKey };
}
