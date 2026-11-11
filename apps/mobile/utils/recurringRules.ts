import type { RecurrencePattern, RecurringTransactionRule } from '~/types';
import {
  dateFromDayKeyLocal,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  timeFromDateLocal,
} from '~/utils/formatters';
import { countsAsExpenseRow } from '~/utils/spending';

const AVERAGE_DAYS_PER_YEAR = 365.2425;
const AVERAGE_DAYS_PER_MONTH = AVERAGE_DAYS_PER_YEAR / 12;

function recurringMonthlyFactor(
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
): number {
  const safeInterval = Math.max(1, interval);

  switch (pattern) {
    case 'daily':
      return AVERAGE_DAYS_PER_MONTH / safeInterval;
    case 'weekly':
      return AVERAGE_DAYS_PER_MONTH / (7 * safeInterval);
    case 'yearly':
      return 1 / (12 * safeInterval);
    case 'monthly':
    default:
      return 1 / safeInterval;
  }
}

export function recurringAmountPerMonth(
  amount: number,
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
): number {
  return amount * recurringMonthlyFactor(pattern, interval);
}

/**
 * Total monthly cost of the active rules that count as spending, in the
 * reporting currency.
 *
 * Every rule carries its own `currency` (a rule can be entered in MYR on an MYR
 * account while the app reports in SGD), so each amount must be converted
 * before it is summed. `convertToReporting` is the caller's live FX conversion
 * (identity when the rule is already in the reporting currency, and a
 * pass-through when no rate is cached).
 *
 * A loan's auto-repayment rule is a transfer, and it belongs in this figure
 * only when the borrower asked for the instalment to count as spending
 * (`countsAsExpense`) — the same test every other spending readout applies to
 * the rows such a rule generates. Without it the one screen that names the
 * commitment would be the only place it is missing from the monthly total.
 * A transfer rule's fee is an expense on every run, so it counts too.
 */
export function recurringMonthlyExpenseTotal(
  rules: readonly RecurringTransactionRule[],
  convertToReporting: (amount: number, currency: string) => number,
): number {
  return rules.reduce((total, rule) => {
    if (!rule.isActive) return total;
    const spend = recurringRunSpend(rule, convertToReporting);
    if (spend === 0) return total;
    return total + recurringAmountPerMonth(spend, rule.recurrencePattern, rule.recurrenceInterval);
  }, 0);
}

/**
 * What one run of a rule adds to spending, in the reporting currency: its
 * amount when it counts as spending (an expense, or a loan repayment counted
 * as one), plus a transfer rule's fee, which each run writes as an expense.
 */
export function recurringRunSpend(
  rule: Pick<
    RecurringTransactionRule,
    'type' | 'amount' | 'currency' | 'countsAsExpense' | 'feeAmount' | 'feeCurrency'
  >,
  convertToReporting: (amount: number, currency: string) => number,
): number {
  const amount = countsAsExpenseRow(rule) ? convertToReporting(rule.amount, rule.currency) : 0;
  return amount + recurringRunFeeSpend(rule, convertToReporting);
}

/** A transfer rule's fee on one run, in the reporting currency (0 for none). */
export function recurringRunFeeSpend(
  rule: Pick<RecurringTransactionRule, 'type' | 'feeAmount' | 'feeCurrency'>,
  convertToReporting: (amount: number, currency: string) => number,
): number {
  if (rule.type !== 'transfer' || !rule.feeCurrency || !rule.feeAmount || rule.feeAmount <= 0) {
    return 0;
  }
  return convertToReporting(rule.feeAmount, rule.feeCurrency);
}

/* ------------------------------------------------------------------ *
 * Frequencies the editor offers
 *
 * Quarterly and semi-annually are not patterns of their own: they are saved as
 * a monthly rule every 3 or 6 months. Rules stay readable by every app version,
 * backup, shared-ledger device and the web dashboard, which only know the
 * stored patterns, and the runner and cost math need nothing new.
 * ------------------------------------------------------------------ */

export type RecurrenceFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannually'
  | 'yearly';

export type RepeatingPattern = Exclude<RecurrencePattern, 'none'>;

/** In the order the editor lists them. */
export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semiannually',
  'yearly',
];

const MONTHS_PER_FREQUENCY = { quarterly: 3, semiannually: 6 } as const;

/** The pattern and interval saved for a frequency picked in the editor. */
export function storedRecurrenceOf(
  frequency: RecurrenceFrequency,
  interval: number,
): { pattern: RepeatingPattern; interval: number } {
  const safeInterval = Math.max(1, Math.trunc(interval) || 1);
  if (frequency === 'quarterly' || frequency === 'semiannually') {
    return { pattern: 'monthly', interval: safeInterval * MONTHS_PER_FREQUENCY[frequency] };
  }
  return { pattern: frequency, interval: safeInterval };
}

/**
 * The frequency a saved rule reads as. Only exactly every 3 or 6 months reads
 * as quarterly or semi-annually; anything else keeps its own pattern, so
 * "every 9 months" is not turned into "every 3 quarters".
 */
export function recurrenceFrequencyOf(
  pattern: RepeatingPattern,
  interval: number,
): { frequency: RecurrenceFrequency; interval: number } {
  if (pattern === 'monthly') {
    if (interval === MONTHS_PER_FREQUENCY.quarterly) return { frequency: 'quarterly', interval: 1 };
    if (interval === MONTHS_PER_FREQUENCY.semiannually) {
      return { frequency: 'semiannually', interval: 1 };
    }
  }
  return { frequency: pattern, interval };
}

/* ------------------------------------------------------------------ *
 * Occurrence projection
 *
 * A rule stores only its *next* run date; the runner walks it forward one
 * period at a time as each occurrence is generated. To show a forecast (a week
 * strip, an upcoming timeline) the screen has to walk that same series ahead of
 * the runner, so the date arithmetic below is the arithmetic the runner uses —
 * `recurringRulesRepository` imports `nextRunAfter` rather than keeping its own
 * copy, or the forecast would drift from what actually gets written.
 *
 * Run dates are local calendar days. A step works on the phone's calendar and
 * writes local midnight, the same instant the editor stores for a picked day,
 * so a rule set for the 1st stays on the 1st in every time zone. A monthly or
 * yearly rule also keeps the day of the month it was set for (`anchorDay`):
 * the 31st runs on the 30th in a 30-day month and on the 28th or 29th in
 * February, then returns to the 31st, instead of staying on the shorter day.
 * ------------------------------------------------------------------ */

/** A local calendar day. `month` is 0-based, as `Date` takes it. */
export interface RunDay {
  year: number;
  month: number;
  day: number;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The local calendar day a stored run date stands for, or null when it is not
 * a date. Usually just the local date, with two exceptions, both forms only
 * older versions wrote (they stepped run dates in UTC):
 * - Exactly UTC midnight that is not local midnight was a bare day key (a
 *   loan, a goal auto-save, an edited rule) stepped in UTC, so its UTC date is
 *   the day meant. Read locally it is the evening before west of UTC.
 * - Exactly 23:00 local is a local midnight moved an hour by a daylight saving
 *   change (or read one time zone west of where it was set), so it stands for
 *   the next day.
 */
export function runDayOf(dateText: string): RunDay | null {
  const key = DAY_KEY.exec(dateText);
  if (key) return { year: Number(key[1]), month: Number(key[2]) - 1, day: Number(key[3]) };
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  const utcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  const localMidnight =
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;
  if (utcMidnight && !localMidnight) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
  }
  const shiftedMidnight =
    date.getHours() === 23 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;
  const local = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + (shiftedMidnight ? 1 : 0),
  );
  return { year: local.getFullYear(), month: local.getMonth(), day: local.getDate() };
}

/** The `YYYY-MM-DD` key of the calendar day a stored run date stands for. */
export function runDayKeyOf(dateText: string): string | null {
  const day = runDayOf(dateText);
  if (!day) return null;
  return `${day.year}-${String(day.month + 1).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

/** Whether two stored run dates stand for the same calendar day. */
export function isSameRunDay(a: string, b: string): boolean {
  const left = runDayOf(a);
  const right = runDayOf(b);
  return (
    !!left &&
    !!right &&
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day
  );
}

/** A day of the month a rule can be anchored to: a whole number from 1 to 31. */
export function isAnchorDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * The day of the month a monthly or yearly step from `from` keeps:
 * `anchorDay` while `from` is on it, or on the last day of a month too short
 * for it, else `from`'s own day. A run date that no longer matches its anchor
 * was moved (by an older app version, or one that does not know the anchor),
 * and the move wins.
 */
export function effectiveAnchorDay(from: RunDay, anchorDay: number | null | undefined): number {
  if (
    isAnchorDay(anchorDay) &&
    Math.min(anchorDay, daysInMonth(from.year, from.month)) === from.day
  ) {
    return anchorDay;
  }
  return from.day;
}

/** Local midnight of a calendar day (overflowing days and months roll over). */
function localMidnightIso(year: number, month: number, day: number): string {
  return new Date(year, month, day).toISOString();
}

/**
 * The run date one period after `dateText`, as local midnight, or null when
 * the pattern does not repeat (or the date is unparseable). `anchorDay` is the
 * day of the month a monthly or yearly rule was set for (see
 * `effectiveAnchorDay`); without one the step keeps `dateText`'s own day.
 */
export function nextRunAfter(
  dateText: string,
  pattern: RecurrencePattern,
  interval: number,
  anchorDay?: number | null,
): string | null {
  const from = runDayOf(dateText);
  if (!from) return null;
  const safeInterval = Math.max(1, Math.trunc(interval) || 1);
  switch (pattern) {
    case 'daily':
      return localMidnightIso(from.year, from.month, from.day + safeInterval);
    case 'weekly':
      return localMidnightIso(from.year, from.month, from.day + safeInterval * 7);
    case 'monthly':
    case 'yearly': {
      const months = pattern === 'monthly' ? safeInterval : safeInterval * 12;
      const target = new Date(from.year, from.month + months, 1);
      const year = target.getFullYear();
      const month = target.getMonth();
      const day = Math.min(effectiveAnchorDay(from, anchorDay), daysInMonth(year, month));
      return localMidnightIso(year, month, day);
    }
    default:
      return null;
  }
}

/**
 * Loan rules store a calendar day as their inclusive end date, while the
 * recurring editor stores an explicit cutoff instant. Use the same boundary
 * for both the runner and forecast, even after the cursor advances to ISO.
 */
export function isAfterRecurringEndDate(dateIso: string, endDate: string | null): boolean {
  if (!endDate) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return dayKeyFromIsoLocal(dateIso) > endDate;
  }
  return timeFromDateLocal(dateIso) > timeFromDateLocal(endDate);
}

export interface RecurringOccurrence {
  rule: RecurringTransactionRule;
  /** ISO instant this occurrence is scheduled for. */
  dateIso: string;
  /** Local day key (YYYY-MM-DD) the occurrence is bucketed under. */
  dayKey: string;
  /**
   * The rule's run date has already passed. The runner catches these up on the
   * next app load, so they are bucketed under today rather than shown in the
   * past, where nothing would ever scroll to them.
   */
  overdue: boolean;
}

/**
 * Runaway guard on the walk, not on what it emits. It has to cover the missed
 * run as well as the window: a daily rule the app has not opened for years is
 * stepped one period at a time before the window is even reached.
 */
const MAX_STEPS_PER_RULE = 5_000;

const MS_PER_DAY = 86_400_000;

interface ProjectOptions {
  /** Local day key the window opens on, normally today. */
  fromDayKey: string;
  /** Length of the window in days, inclusive of `fromDayKey`. */
  days: number;
}

/**
 * Every occurrence the active rules produce inside a `days`-long window,
 * ordered by date. Paused rules produce nothing — they are not scheduled.
 *
 * A rule whose `nextRunDate` is in the past is overdue rather than missed. The
 * whole missed run collapses into **one** occurrence bucketed under
 * `fromDayKey`, and the series then continues on the rule's own cadence. It is
 * one rather than one-per-missed-period because the runner writes those
 * catch-up rows dated in the past: a daily rule the app has not seen for a
 * month owes thirty charges, but none of them is "still to come" inside this
 * window, and counting them all there multiplies the total by thirty.
 */
export function projectRecurringOccurrences(
  rules: readonly RecurringTransactionRule[],
  { fromDayKey, days }: ProjectOptions,
): RecurringOccurrence[] {
  const untilDayKey = addDaysToDayKey(fromDayKey, Math.max(0, days - 1));
  const occurrences: RecurringOccurrence[] = [];

  rules.forEach((rule) => {
    if (!rule.isActive) return;
    let cursor: string | null = rule.nextRunDate;
    let overdueEmitted = false;
    for (let step = 0; cursor && step < MAX_STEPS_PER_RULE; step += 1) {
      if (isAfterRecurringEndDate(cursor, rule.endDate)) break;
      const dayKey = dayKeyFromIsoLocal(cursor);
      if (dayKey > untilDayKey) break;
      if (dayKey < fromDayKey) {
        if (!overdueEmitted) {
          occurrences.push({ rule, dateIso: cursor, dayKey: fromDayKey, overdue: true });
          overdueEmitted = true;
        }
      } else {
        occurrences.push({ rule, dateIso: cursor, dayKey, overdue: false });
      }
      cursor = nextRunAfter(
        cursor,
        rule.recurrencePattern,
        rule.recurrenceInterval,
        rule.anchorDay,
      );
    }
  });

  return occurrences.sort(
    (a, b) => a.dayKey.localeCompare(b.dayKey) || a.dateIso.localeCompare(b.dateIso),
  );
}

/**
 * What the active spending rules will actually charge from `fromDayKey` through
 * `untilDayKey` (both inclusive), in the reporting currency: every projected
 * occurrence summed, not a per-month average. A rule that starts after the
 * window, or ended before it, contributes nothing, so a commitment due in two
 * years never inflates this month's or this year's figure. An overdue rule
 * counts once, on `fromDayKey` (see `projectRecurringOccurrences`).
 */
export function recurringExpenseDueBetween(
  rules: readonly RecurringTransactionRule[],
  fromDayKey: string,
  untilDayKey: string,
  convertToReporting: (amount: number, currency: string) => number,
): number {
  if (untilDayKey < fromDayKey) return 0;
  // Rounded: a window spanning a DST change is not a whole number of 24h days.
  const days =
    Math.round(
      (dateFromDayKeyLocal(untilDayKey).getTime() - dateFromDayKeyLocal(fromDayKey).getTime()) /
        MS_PER_DAY,
    ) + 1;
  return projectRecurringOccurrences(rules, { fromDayKey, days }).reduce(
    (total, { rule }) => total + recurringRunSpend(rule, convertToReporting),
    0,
  );
}

/** Shifts a YYYY-MM-DD key by whole days, staying in the local calendar. */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const date = dateFromDayKeyLocal(dayKey);
  if (Number.isNaN(date.getTime())) return dayKey;
  date.setDate(date.getDate() + days);
  return dayKeyFromDateLocal(date);
}

/** Every run a rule makes is named `rr:<ruleId>:…` (`recurringRunTransactionId`). */
const RECURRING_RUN_ID_PREFIX = 'rr:';

/** The rule a run's id names (`rr:<ruleId>:…`), or null for any other id. */
export function recurringRunRuleId(id: string): string | null {
  if (!id.startsWith(RECURRING_RUN_ID_PREFIX)) return null;
  const end = id.indexOf(':', RECURRING_RUN_ID_PREFIX.length);
  return end > RECURRING_RUN_ID_PREFIX.length
    ? id.slice(RECURRING_RUN_ID_PREFIX.length, end)
    : null;
}

/**
 * Whether a transaction was made by an ordinary recurring rule, read from its
 * id, so it needs no column and is the same on every phone and app version
 * that syncs it. An instalment plan's payments are runs too, but they belong
 * to the plan (they carry its count pill), not to the Recurring page: a
 * payment names its plan in `instalmentRuleId`, and `planRuleIds` catches one
 * an older app made without it. Runs made before run ids existed (app
 * versions before Cloud Sync) had random ids and read as typed in.
 */
export function isRecurringRunTransaction(
  transaction: { id: string; instalmentRuleId?: string | null },
  planRuleIds?: ReadonlySet<string>,
): boolean {
  if (transaction.instalmentRuleId) return false;
  const ruleId = recurringRunRuleId(transaction.id);
  return ruleId !== null && !planRuleIds?.has(ruleId);
}
