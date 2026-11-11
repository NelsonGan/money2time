// Instalment plans: a purchase paid off in equal parts on a schedule.
//
// A plan is stored as a recurring rule with three extra columns
// (`instalment_count`, `instalment_total`, `instalment_start_date`, migration
// 078). The rule's own engine posts each payment on its due date, so this
// module only holds the arithmetic both the runner and the screens share: how
// the total splits into payments, which dates they fall on, and how far along
// a plan is given the payments that exist. It is pure so it is tested without
// a database.

import type { RecurringTransactionRule, Transaction } from '~/types';
import { dayKeyFromIsoLocal, normalizeMoneyAmount } from '~/utils/formatters';
import type { RepeatingPattern } from '~/utils/recurringRules';

/** How often a plan's payments fall, as offered in the instalments sheet. */
export type InstalmentFrequency = 'monthly' | 'biweekly' | 'weekly';

export const INSTALMENT_FREQUENCIES: readonly InstalmentFrequency[] = [
  'monthly',
  'biweekly',
  'weekly',
];

const FREQUENCY_SCHEDULE: Record<
  InstalmentFrequency,
  { pattern: Extract<RepeatingPattern, 'monthly' | 'weekly'>; interval: number }
> = {
  monthly: { pattern: 'monthly', interval: 1 },
  biweekly: { pattern: 'weekly', interval: 2 },
  weekly: { pattern: 'weekly', interval: 1 },
};

/** The counts offered as one-tap chips; the stepper reaches any other. */
export const INSTALMENT_COUNT_PRESETS = [3, 6, 12, 24, 36] as const;
export const MIN_INSTALMENT_COUNT = 2;
export const MAX_INSTALMENT_COUNT = 120;

/** `instalment_number` on the one transaction that paid off everything left. */
export const INSTALMENT_PAYOFF_NUMBER = 0;

export function scheduleOfFrequency(frequency: InstalmentFrequency) {
  return FREQUENCY_SCHEDULE[frequency];
}

/** The frequency a saved plan reads as (monthly for anything unexpected). */
export function frequencyOfSchedule(pattern: string, interval: number): InstalmentFrequency {
  if (pattern === 'weekly') return interval === 2 ? 'biweekly' : 'weekly';
  return 'monthly';
}

export function clampInstalmentCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_INSTALMENT_COUNT;
  return Math.min(MAX_INSTALMENT_COUNT, Math.max(MIN_INSTALMENT_COUNT, Math.trunc(value)));
}

/** Whether a rule is an instalment plan rather than an ordinary repeat. */
export function isInstalmentPlan(
  rule: Pick<RecurringTransactionRule, 'instalmentCount'>,
): rule is RecurringTransactionRule & { instalmentCount: number } {
  return typeof rule.instalmentCount === 'number' && rule.instalmentCount > 0;
}

/**
 * Whether a transaction already saved can be turned into an instalment plan,
 * becoming its first payment. Only a plain expense of the user's own: not a
 * payment of a plan already, not split with friends, not a transfer's fee,
 * and not one whose reimbursement came back (its refund is for the whole
 * amount, which the first payment no longer is).
 */
export function canConvertToInstalmentPlan(
  transaction: Pick<
    Transaction,
    'type' | 'instalmentRuleId' | 'feeOfId' | 'reimbursedAt' | 'reimbursementTransactionId'
  > & { splits?: readonly unknown[] | null },
): boolean {
  return (
    transaction.type === 'expense' &&
    !transaction.instalmentRuleId &&
    !transaction.feeOfId &&
    !transaction.reimbursedAt &&
    !transaction.reimbursementTransactionId &&
    (transaction.splits?.length ?? 0) === 0
  );
}

/** Whether a total splits into `count` payments of at least one cent each. */
export function canSplitInstalments(total: number, count: number): boolean {
  return Number.isFinite(total) && total > 0 && Math.round(total * 100) >= Math.trunc(count);
}

/**
 * Splits a total into `count` payments in whole cents. Every payment is the
 * total divided evenly and rounded down; the last one takes the cents left
 * over, so RM1,000 over 3 is 333.33, 333.33 and 333.34 and the parts always
 * add back up to the total exactly.
 */
export function splitInstalmentAmounts(total: number, count: number): number[] {
  const safeCount = Math.max(1, Math.trunc(count) || 1);
  const totalCents = Math.round((Number.isFinite(total) ? total : 0) * 100);
  const sign = totalCents < 0 ? -1 : 1;
  const absCents = Math.abs(totalCents);
  const perCents = Math.floor(absCents / safeCount);
  const lastCents = absCents - perCents * (safeCount - 1);
  return Array.from({ length: safeCount }, (_, index) => {
    const cents = index === safeCount - 1 ? lastCents : perCents;
    return (sign * cents) / 100;
  });
}

/**
 * Splits a total into `count` payments of `regular` each, the last one
 * taking whatever is left so the parts add back up to the total exactly:
 * a bank's RM83.34 a month on RM1,000 is 11 × 83.34 and a last 83.26. With
 * no regular amount, or one that leaves nothing for the last payment, the
 * total splits evenly (`splitInstalmentAmounts`).
 */
export function instalmentAmounts(total: number, count: number, regular?: number | null): number[] {
  if (!isRegularAmountValid(total, count, regular)) return splitInstalmentAmounts(total, count);
  const safeCount = Math.max(1, Math.trunc(count) || 1);
  const regularCents = Math.round((regular ?? 0) * 100);
  const lastCents = Math.round(total * 100) - regularCents * (safeCount - 1);
  return Array.from({ length: safeCount }, (_, index) =>
    index === safeCount - 1 ? lastCents / 100 : regularCents / 100,
  );
}

/**
 * Whether `count` payments of `regular` can balance to `total`: at least a
 * cent each, with the last one (what the others leave) above zero.
 */
export function isRegularAmountValid(
  total: number,
  count: number,
  regular?: number | null,
): boolean {
  if (regular == null || !Number.isFinite(regular) || !Number.isFinite(total)) return false;
  const regularCents = Math.round(regular * 100);
  const totalCents = Math.round(total * 100);
  return regularCents >= 1 && regularCents * (Math.max(1, Math.trunc(count)) - 1) < totalCents;
}

/**
 * Whether `regular` × `count` is off the total by more than rounding: a
 * plan with interest or a fee, whose real total is the payments' sum.
 */
export function regularAmountImpliesOtherTotal(
  total: number,
  count: number,
  regular: number,
): boolean {
  const gapCents = Math.abs(Math.round(regular * 100) * count - Math.round(total * 100));
  return gapCents >= Math.max(1, Math.trunc(count));
}

/**
 * `startIso` moved on by whole periods in the phone's own calendar: the same
 * time of day, `months` later with the day clamped to a short month, or
 * `days` later. Local arithmetic keeps every payment on the day the user
 * picked wherever they are; the UTC arithmetic ordinary rules use puts an
 * evening or early-morning payment on the neighbouring day at a month end.
 */
function shiftLocal(startIso: string, unit: 'months' | 'days', amount: number): string | null {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  if (unit === 'days') {
    const next = new Date(start);
    next.setDate(next.getDate() + amount);
    return next.toISOString();
  }
  const day = start.getDate();
  const next = new Date(
    start.getFullYear(),
    start.getMonth() + amount,
    1,
    start.getHours(),
    start.getMinutes(),
    start.getSeconds(),
    start.getMilliseconds(),
  );
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next.toISOString();
}

/**
 * The date of every payment, starting on `startIso`. Each one is counted from
 * the first rather than from the one before, so a plan that starts on the 31st
 * is charged on the last day of a short month and on the 31st again after it,
 * the way a card instalment is billed. (An ordinary recurring rule walks from
 * its previous run and stays on the 28th.) The runner posts plans on exactly
 * these instants.
 */
export function instalmentScheduleDates(
  startIso: string,
  pattern: RepeatingPattern,
  interval: number,
  count: number,
): string[] {
  const dates: string[] = [];
  const safeCount = Math.max(1, Math.trunc(count) || 1);
  const safeInterval = Math.max(1, Math.trunc(interval) || 1);
  if (Number.isNaN(new Date(startIso).getTime())) return dates;
  dates.push(startIso);
  for (let index = 1; index < safeCount; index += 1) {
    const steps = safeInterval * index;
    const next =
      pattern === 'monthly'
        ? shiftLocal(startIso, 'months', steps)
        : pattern === 'yearly'
          ? shiftLocal(startIso, 'months', steps * 12)
          : pattern === 'weekly'
            ? shiftLocal(startIso, 'days', steps * 7)
            : pattern === 'daily'
              ? shiftLocal(startIso, 'days', steps)
              : null;
    if (!next) break;
    dates.push(next);
  }
  return dates;
}

/**
 * How many payments after the first fall on or before `now`'s day, which the
 * plan makes as soon as it is saved (a purchase from a while back).
 */
export function paymentsAlreadyDue(dates: readonly string[], now: Date = new Date()): number {
  const today = dayKeyFromIsoLocal(now.toISOString());
  return dates.slice(1).filter((date) => dayKeyFromIsoLocal(date) <= today).length;
}

/** The schedule of a saved plan. */
export function scheduleOfPlan(
  rule: Pick<
    RecurringTransactionRule,
    | 'instalmentCount'
    | 'instalmentStartDate'
    | 'nextRunDate'
    | 'recurrencePattern'
    | 'recurrenceInterval'
  >,
): string[] {
  if (!rule.instalmentCount) return [];
  return instalmentScheduleDates(
    rule.instalmentStartDate ?? rule.nextRunDate,
    rule.recurrencePattern,
    rule.recurrenceInterval,
    rule.instalmentCount,
  );
}

/**
 * Which payment the plan is on: the scheduled one nearest its next run date.
 * Every phone works the schedule out in its own time zone, so the date one
 * stored can sit hours (and across midnight, a day) off the same payment on
 * another; nearest, not equal, finds it anyway. Earlier ones are behind.
 */
export function nextPaymentIndex(nextRunDate: string, dates: readonly string[]): number {
  const target = Date.parse(nextRunDate);
  let best = 0;
  let bestGap = Infinity;
  dates.forEach((date, index) => {
    const gap = Math.abs(Date.parse(date) - target);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}

export type InstalmentEntryStatus = 'paid' | 'paid_off' | 'skipped' | 'upcoming';

export interface InstalmentEntry {
  /** 1-based position in the plan. */
  number: number;
  /** When the payment is (or was) scheduled. */
  dateIso: string;
  amount: number;
  status: InstalmentEntryStatus;
  /** The payment row, when it exists. */
  transactionId: string | null;
  /** The date on that row (differs from `dateIso` for a payment made early). */
  paidDateIso: string | null;
}

export interface InstalmentProgress {
  rule: RecurringTransactionRule & { instalmentCount: number };
  entries: InstalmentEntry[];
  /** Payments made, the payoff counting as the rest of them. */
  paidCount: number;
  paidAmount: number;
  /** What the remaining scheduled payments will still charge. */
  leftAmount: number;
  total: number;
  next: InstalmentEntry | null;
  /** The plan ended with one payment for everything left. */
  paidOff: boolean;
  /** Nothing is left to pay. */
  complete: boolean;
  /** The payoff row, when there is one. */
  payoffTransactionId: string | null;
}

export type InstalmentPaymentRow = Pick<
  Transaction,
  'id' | 'amount' | 'date' | 'instalmentNumber' | 'deletedAt'
>;

/**
 * Where a plan stands, from its rule and the live payment rows that point at
 * it. A scheduled payment with no row is skipped once the runner has moved
 * past its date (the user deleted the row it wrote, and the runner never
 * writes a run twice), and upcoming otherwise.
 */
export function buildInstalmentProgress(
  rule: RecurringTransactionRule & { instalmentCount: number },
  payments: readonly InstalmentPaymentRow[],
): InstalmentProgress {
  const total = rule.instalmentTotal ?? rule.amount * rule.instalmentCount;
  const dates = scheduleOfPlan(rule);
  // The plan as agreed: `amount` is the regular payment (the bank's figure,
  // or the even split), and the last one balances the total.
  const amounts = instalmentAmounts(total, rule.instalmentCount, rule.amount);

  const live = payments.filter((payment) => !payment.deletedAt);
  const byNumber = new Map<number, InstalmentPaymentRow>();
  let payoff: InstalmentPaymentRow | null = null;
  live.forEach((payment) => {
    if (payment.instalmentNumber === INSTALMENT_PAYOFF_NUMBER) {
      payoff = payment;
    } else if (
      payment.instalmentNumber != null &&
      payment.instalmentNumber >= 1 &&
      payment.instalmentNumber <= dates.length &&
      !byNumber.has(payment.instalmentNumber)
    ) {
      byNumber.set(payment.instalmentNumber, payment);
    }
  });
  const payoffRow = payoff as InstalmentPaymentRow | null;

  const nextIndex = nextPaymentIndex(rule.nextRunDate, dates);
  const entries: InstalmentEntry[] = dates.map((dateIso, index) => {
    const number = index + 1;
    const payment = byNumber.get(number);
    let status: InstalmentEntryStatus;
    // Behind the payment the plan is on (see `nextPaymentIndex`).
    const due = index < nextIndex;
    if (payment) status = 'paid';
    // A payoff covers the payments still to come, not ones already skipped.
    else if (payoffRow && !due) status = 'paid_off';
    else if (!rule.isActive || due) status = 'skipped';
    else status = 'upcoming';
    return {
      number,
      dateIso,
      // A payment made shows what it actually came to.
      amount: payment ? payment.amount : (amounts[index] ?? 0),
      status,
      transactionId: payment?.id ?? (status === 'paid_off' ? (payoffRow?.id ?? null) : null),
      paidDateIso: payment?.date ?? (status === 'paid_off' ? (payoffRow?.date ?? null) : null),
    };
  });

  const paidAmount = normalizeMoneyAmount(
    [...byNumber.values()].reduce((sum, payment) => sum + payment.amount, 0) +
      (payoffRow?.amount ?? 0),
  );
  // What is still to pay keeps the plan balanced: the total less what was
  // paid (as paid, edits included) and what was skipped, at the regular
  // amount with the last payment taking the rest. A plan whose amount was
  // changed part way, or a payment edited to another amount, still adds
  // up to its total.
  const skippedAmount = entries
    .filter((entry) => entry.status === 'skipped')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const upcomingIndexes = entries.flatMap((entry, index) =>
    entry.status === 'upcoming' ? [index] : [],
  );
  const remaining = normalizeMoneyAmount(total - paidAmount - skippedAmount);
  if (upcomingIndexes.length > 0 && canSplitInstalments(remaining, upcomingIndexes.length)) {
    const balanced = instalmentAmounts(remaining, upcomingIndexes.length, rule.amount);
    upcomingIndexes.forEach((entryIndex, position) => {
      const entry = entries[entryIndex];
      if (entry) entry.amount = balanced[position] ?? entry.amount;
    });
  }
  const upcoming = entries.filter((entry) => entry.status === 'upcoming');
  const leftAmount = normalizeMoneyAmount(upcoming.reduce((sum, entry) => sum + entry.amount, 0));
  const paidCount = entries.filter(
    (entry) => entry.status === 'paid' || entry.status === 'paid_off',
  ).length;

  return {
    rule,
    entries,
    paidCount,
    paidAmount,
    leftAmount,
    total,
    next: upcoming[0] ?? null,
    paidOff: !!payoffRow,
    complete: upcoming.length === 0,
    payoffTransactionId: payoffRow?.id ?? null,
  };
}

/** A transaction as far as finding a plan's payments goes. */
export type InstalmentCandidateRow = InstalmentPaymentRow & Pick<Transaction, 'instalmentRuleId'>;

/** Days between two `YYYY-MM-DD` keys, ignoring sign. */
function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Half a plan's period in days: how far an older app's run can sit from its payment. */
function halfPeriodDays(pattern: RepeatingPattern, interval: number): number {
  const days =
    pattern === 'monthly'
      ? 30
      : pattern === 'weekly'
        ? 7
        : pattern === 'daily'
          ? 1
          : pattern === 'yearly'
            ? 365
            : 30;
  return (days * Math.max(1, interval)) / 2;
}

/**
 * The rows that are payments of `rule`. A row names its plan and number, but
 * one written by an app version from before plans (a phone on Cloud Sync that
 * has not updated yet runs the plan as an ordinary rule) does not: it is
 * recognised by the run id the runner gives it, `rr:<plan>:<YYYY-MM-DD>`, and
 * numbered by the nearest scheduled payment not already made. That app walks
 * dates its own way (in UTC, from the previous run), so its day can sit a few
 * days off the plan's, but never half a period.
 */
export function paymentRowsForPlan(
  rule: Pick<
    RecurringTransactionRule,
    | 'id'
    | 'instalmentCount'
    | 'instalmentStartDate'
    | 'nextRunDate'
    | 'recurrencePattern'
    | 'recurrenceInterval'
  >,
  rows: readonly InstalmentCandidateRow[],
): InstalmentPaymentRow[] {
  const prefix = `rr:${rule.id}:`;
  const result: InstalmentPaymentRow[] = [];
  const legacy: InstalmentCandidateRow[] = [];
  rows.forEach((row) => {
    if (row.instalmentRuleId === rule.id) result.push(row);
    else if (!row.instalmentRuleId && row.id.startsWith(prefix)) legacy.push(row);
  });
  if (legacy.length === 0) return result;

  const dayKeys = scheduleOfPlan(rule).map((date) => date.slice(0, 10));
  const taken = new Set(result.map((row) => row.instalmentNumber));
  const reach = halfPeriodDays(rule.recurrencePattern, rule.recurrenceInterval);
  [...legacy]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((row) => {
      const suffix = row.id.slice(prefix.length, prefix.length + 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(suffix)) return;
      let best = -1;
      let bestGap = Infinity;
      dayKeys.forEach((dayKey, index) => {
        if (taken.has(index + 1)) return;
        const gap = daysApart(dayKey, suffix);
        if (gap < bestGap) {
          best = index;
          bestGap = gap;
        }
      });
      if (best < 0 || bestGap >= reach) return;
      taken.add(best + 1);
      result.push({ ...row, instalmentNumber: best + 1 });
    });
  return result;
}

/** The sum of the upcoming payments due from `fromDayKey` to `untilDayKey`, inclusive. */
export function instalmentDueBetween(
  progress: readonly InstalmentProgress[],
  fromDayKey: string,
  untilDayKey: string,
  convertToReporting: (amount: number, currency: string) => number,
): number {
  return normalizeMoneyAmount(
    progress.reduce((sum, plan) => {
      return (
        sum +
        plan.entries.reduce((planSum, entry) => {
          if (entry.status !== 'upcoming') return planSum;
          const dayKey = dayKeyFromIsoLocal(entry.dateIso);
          if (dayKey < fromDayKey || dayKey > untilDayKey) return planSum;
          return planSum + convertToReporting(entry.amount, plan.rule.currency);
        }, 0)
      );
    }, 0),
  );
}

/**
 * The loaded transactions that can be payments of `rules`' plans: rows that
 * name a plan, and runs written before plans existed (`rr:` ids). Empty when
 * there is no plan, so the common case costs one pass over the rules.
 */
export function instalmentPaymentCandidates<T extends InstalmentCandidateRow>(
  rules: readonly RecurringTransactionRule[],
  transactions: readonly T[],
): T[] {
  if (!rules.some(isInstalmentPlan)) return [];
  return transactions.filter((row) => row.instalmentRuleId || row.id.startsWith('rr:'));
}

/** A string that changes whenever any candidate payment row does. */
export function instalmentPaymentsKey(rows: readonly InstalmentCandidateRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.id}|${row.amount}|${row.date}|${row.instalmentRuleId ?? ''}|${row.instalmentNumber ?? ''}|${row.deletedAt ?? ''}`,
    )
    .join(',');
}

/**
 * Every plan's progress from the loaded transactions, active plans first (by
 * next payment), then finished ones (most recently finished first). One pass
 * over the transactions, so it stays cheap on a long history.
 */
export function buildInstalmentPlans(
  rules: readonly RecurringTransactionRule[],
  transactions: readonly InstalmentCandidateRow[],
): InstalmentProgress[] {
  const plans = rules.filter(isInstalmentPlan);
  if (plans.length === 0) return [];
  const ids = new Set(plans.map((rule) => rule.id));
  const candidates = new Map<string, InstalmentCandidateRow[]>();
  const add = (ruleId: string, row: InstalmentCandidateRow) => {
    const list = candidates.get(ruleId);
    if (list) list.push(row);
    else candidates.set(ruleId, [row]);
  };
  transactions.forEach((row) => {
    if (row.instalmentRuleId) {
      if (ids.has(row.instalmentRuleId)) add(row.instalmentRuleId, row);
      return;
    }
    if (!row.id.startsWith('rr:')) return;
    const ruleId = row.id.slice(3, row.id.indexOf(':', 3));
    if (ids.has(ruleId)) add(ruleId, row);
  });
  const progress = plans.map((rule) =>
    buildInstalmentProgress(rule, paymentRowsForPlan(rule, candidates.get(rule.id) ?? [])),
  );
  const lastPaid = (plan: InstalmentProgress) =>
    plan.entries.reduce((latest, entry) => {
      const date = entry.paidDateIso ?? '';
      return date > latest ? date : latest;
    }, '');
  return progress.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    if (!a.complete) return (a.next?.dateIso ?? '').localeCompare(b.next?.dateIso ?? '');
    return lastPaid(b).localeCompare(lastPaid(a));
  });
}
