import type { RecurrencePattern, RecurringTransactionRule } from '~/types';
import { dayKeyFromDateLocal, dayKeyFromIsoLocal } from '~/utils/formatters';
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
 */
export function recurringMonthlyExpenseTotal(
  rules: readonly RecurringTransactionRule[],
  convertToReporting: (amount: number, currency: string) => number,
): number {
  return rules.reduce((total, rule) => {
    if (!rule.isActive || !countsAsExpenseRow(rule)) return total;
    return (
      total +
      recurringAmountPerMonth(
        convertToReporting(rule.amount, rule.currency),
        rule.recurrencePattern,
        rule.recurrenceInterval,
      )
    );
  }, 0);
}

function ruleBelongsToWallet(rule: RecurringTransactionRule, walletId: string): boolean {
  return (
    rule.accountId === walletId || rule.fromAccountId === walletId || rule.toAccountId === walletId
  );
}

export function filterRecurringRulesByWallet(
  rules: RecurringTransactionRule[],
  walletId: string | null | undefined,
): RecurringTransactionRule[] {
  if (!walletId) return rules;
  const filteredRules: RecurringTransactionRule[] = [];
  rules.forEach((rule) => {
    if (ruleBelongsToWallet(rule, walletId)) {
      filteredRules.push(rule);
    }
  });
  return filteredRules;
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
 * ------------------------------------------------------------------ */

/** UTC day arithmetic, matching what the runner has always done. */
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  // Park on the 1st first so a 31st never rolls into the following month on the
  // way past a short one; the clamp below puts it back on the last valid day.
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}

/**
 * The run date one period after `dateIso`, or null when the pattern does not
 * repeat (or the date is unparseable).
 */
export function nextRunAfter(
  dateIso: string,
  pattern: RecurrencePattern,
  interval: number,
): string | null {
  const base = new Date(dateIso);
  if (Number.isNaN(base.getTime())) return null;
  const safeInterval = Math.max(1, Math.trunc(interval) || 1);
  switch (pattern) {
    case 'daily':
      return addDays(base, safeInterval).toISOString();
    case 'weekly':
      return addDays(base, safeInterval * 7).toISOString();
    case 'monthly':
      return addMonths(base, safeInterval).toISOString();
    case 'yearly':
      return addMonths(base, safeInterval * 12).toISOString();
    default:
      return null;
  }
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
 *
 * Dates are read back in local time from a series the runner advances in UTC,
 * which is how the runner has always worked. A rule whose `nextRunDate` is
 * stored as a bare day key (loan repayments are) therefore lands a day early
 * west of UTC from its second occurrence onward. That is what the runner will
 * actually write, so the forecast matches the app rather than the intent.
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
      if (rule.endDate && cursor > rule.endDate) break;
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
      cursor = nextRunAfter(cursor, rule.recurrencePattern, rule.recurrenceInterval);
    }
  });

  return occurrences.sort(
    (a, b) => a.dayKey.localeCompare(b.dayKey) || a.dateIso.localeCompare(b.dateIso),
  );
}

/** Shifts a YYYY-MM-DD key by whole days, staying in the local calendar. */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  if (Number.isNaN(date.getTime())) return dayKey;
  date.setDate(date.getDate() + days);
  return dayKeyFromDateLocal(date);
}
