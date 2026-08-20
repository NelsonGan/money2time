import type { LoanProgress, TransactionType } from '~/types';
import { dayKeyFromDateLocal, normalizeMoneyAmount } from '~/utils/formatters';
import { clampStatementDate, DAY_IN_MS, nextOccurrenceOfMonthDay } from '~/utils/statementPeriods';

export interface LoanMathInput {
  /** Current account balance in the loan's currency: what is still owed. */
  balance: number;
  /** Amount originally borrowed; anchors the progress bar. */
  originalPrincipal: number;
  /** Contractual monthly repayment. */
  monthlyPayment: number;
  /** Day of month the repayment is due, or null. */
  paymentDay: number | null;
  /** Annual interest rate as a percentage, or null when not modelled. */
  annualRatePercent: number | null;
  /** The evaluation date (YYYY-MM-DD or ISO); injected so the math stays pure. */
  todayIso: string;
}

/** Local Date at midnight for a `YYYY-MM-DD` key or full ISO stamp. */
function toLocalDate(dateIso: string): Date {
  const dayKey = dateIso.length > 10 ? dateIso.slice(0, 10) : dateIso;
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/**
 * Whole repayments left, as a fraction. Null when the debt never amortizes at
 * this repayment: either there is nothing to pay with, or the repayment is
 * smaller than the interest that accrues in the same month.
 *
 * With `r` the monthly rate, `B` the balance and `P` the payment:
 *   n = -ln(1 - rB/P) / ln(1 + r)      (r > 0)
 *   n = B / P                          (r = 0)
 */
function paymentsToClear(balance: number, payment: number, monthlyRate: number): number | null {
  if (payment <= 0 || balance <= 0) return null;
  if (monthlyRate <= 0) return balance / payment;
  // A payment at or below one month's interest never reduces the principal;
  // it is also exactly where the logarithm's argument stops being positive.
  if (payment <= balance * monthlyRate) return null;
  return -Math.log(1 - (monthlyRate * balance) / payment) / Math.log(1 + monthlyRate);
}

/**
 * Longest term the loan form accepts, in months (40 years). Beyond this the
 * amortization is still defined but the input is almost certainly a typo.
 */
export const MAX_LOAN_TERM_MONTHS = 480;

export interface LoanQuoteInput {
  /** Amount borrowed. */
  principal: number;
  /** Effective annual interest rate as a percentage, or null for interest-free. */
  annualRatePercent: number | null;
  /** Contract length in months. */
  termMonths: number;
  /** Instalments already paid before tracking starts. */
  paidPeriods: number;
  /** Contract start date (YYYY-MM-DD); the loan is disbursed on this day. */
  startDate: string;
}

export interface LoanQuote {
  /** Level monthly instalment implied by the contract. */
  instalment: number;
  /** Amount still owed after `paidPeriods` instalments. */
  openingBalance: number;
  /** Interest paid across the whole term, at the level instalment. */
  totalInterest: number;
  /** Instalments still to run. */
  remainingPeriods: number;
  /** Day of month the instalment falls due, taken from the start date. */
  paymentDay: number;
  /** Final instalment (YYYY-MM-DD): one full term after the start date. */
  payoffDate: string;
  /** The next instalment due (YYYY-MM-DD), after the periods already paid. */
  firstInstalmentDate: string;
}

/** Effective monthly rate; a missing or non-positive rate means interest-free. */
function monthlyRateFrom(annualRatePercent: number | null): number {
  if (annualRatePercent == null || !Number.isFinite(annualRatePercent) || annualRatePercent <= 0) {
    return 0;
  }
  return annualRatePercent / 100 / 12;
}

/** Whole months added to a day key, clamped into short months. */
function addMonthsToDayKey(dayKey: string, months: number): string {
  const base = toLocalDate(dayKey);
  return dayKeyFromDateLocal(
    clampStatementDate(base.getFullYear(), base.getMonth() + months, base.getDate()),
  );
}

/**
 * Turns a loan contract into the numbers a borrower actually reads: what they
 * pay each month, what they still owe, and when it ends.
 *
 * The level instalment is the standard annuity payment
 *   A = P·r / (1 - (1+r)^-n)
 * and the balance after k instalments is
 *   B(k) = P·((1+r)^n - (1+r)^k) / ((1+r)^n - 1),
 * both degenerating to straight division when the loan is interest-free.
 *
 * Returns null when the contract cannot produce one: no principal, no term, a
 * term past {@link MAX_LOAN_TERM_MONTHS}, or nothing left to run.
 */
/** Cent-level tolerance for comparing a stored instalment to a rule's amount. */
const INSTALMENT_EPSILON = 0.005;

interface ContractRule {
  isActive: boolean;
  type: string;
  toAccountId?: string | null;
  toAmount?: number | null;
  amount: number;
}

/**
 * Whether a recurring rule is the one this loan's contract set up, and so
 * should follow the instalment when the contract is corrected.
 *
 * Deliberately narrow. A rule whose amount no longer matches the instalment is
 * one the user has taken over (overpaying, say) and must not be rewritten, and
 * a cross-currency rule carries the loan-side figure in `toAmount`, so
 * changing `amount` would silently change what actually lands.
 */
export function isContractTrackingRule(
  rule: ContractRule,
  loanAccountId: string,
  instalment: number,
): boolean {
  return (
    rule.isActive &&
    rule.type === 'transfer' &&
    rule.toAccountId === loanAccountId &&
    rule.toAmount == null &&
    Math.abs(rule.amount - instalment) <= INSTALMENT_EPSILON
  );
}

export function computeLoanQuote(input: LoanQuoteInput): LoanQuote | null {
  const { principal, termMonths, paidPeriods } = input;
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > MAX_LOAN_TERM_MONTHS) {
    return null;
  }
  if (!Number.isInteger(paidPeriods) || paidPeriods < 0 || paidPeriods >= termMonths) return null;

  const r = monthlyRateFrom(input.annualRatePercent);
  const growth = r > 0 ? Math.pow(1 + r, termMonths) : 1;
  const instalment = r > 0 ? (principal * r) / (1 - 1 / growth) : principal / termMonths;
  const openingBalance =
    r > 0
      ? (principal * (growth - Math.pow(1 + r, paidPeriods))) / (growth - 1)
      : (principal * (termMonths - paidPeriods)) / termMonths;

  const start = toLocalDate(input.startDate);
  return {
    instalment: normalizeMoneyAmount(instalment),
    openingBalance: normalizeMoneyAmount(openingBalance),
    totalInterest: normalizeMoneyAmount(instalment * termMonths - principal),
    remainingPeriods: termMonths - paidPeriods,
    paymentDay: start.getDate(),
    payoffDate: addMonthsToDayKey(input.startDate, termMonths),
    // Instalments run monthly from one month after disbursement, so the next
    // one due is that plus however many have already been paid.
    firstInstalmentDate: addMonthsToDayKey(input.startDate, paidPeriods + 1),
  };
}

export function computeLoanProgress(input: LoanMathInput): LoanProgress {
  const balance = normalizeMoneyAmount(input.balance);
  const principal = input.originalPrincipal;
  const remaining = Math.max(0, balance);
  // Purely balance-derived: `loan_paid_off_at` exists to fire the celebration
  // once, not to describe the loan. A settled loan that is drawn down again
  // owes money and must read that way, pay button and all.
  const isPaidOff = balance <= 0;

  const paid = Math.max(0, principal - remaining);
  // A non-positive principal is unreachable through the editor but possible in
  // hand-imported data; report it as complete rather than dividing by zero.
  const paidRatio = principal > 0 ? Math.min(1, Math.max(0, paid / principal)) : 1;

  if (isPaidOff) {
    return {
      remaining,
      principal,
      paid,
      paidRatio,
      isPaidOff: true,
      nextDueDate: null,
      paymentsRemaining: 0,
      projectedPayoffDate: null,
      estimatedInterestRemaining: null,
      paymentCoversInterest: true,
    };
  }

  // A negative rate is meaningless; treat it as unmodelled rather than letting
  // it produce a nonsense projection.
  const hasRate = input.annualRatePercent != null && input.annualRatePercent > 0;
  const monthlyRate = hasRate ? input.annualRatePercent! / 100 / 12 : 0;
  const payment = input.monthlyPayment > 0 ? input.monthlyPayment : 0;

  const exactPayments = paymentsToClear(remaining, payment, monthlyRate);
  // Only a payment that exists but loses to interest is a warning; no payment
  // at all is just an incomplete loan setup.
  const paymentCoversInterest = payment <= 0 || monthlyRate <= 0 || exactPayments != null;
  const paymentsRemaining = exactPayments == null ? null : Math.ceil(exactPayments);

  const today = toLocalDate(input.todayIso);
  const nextDue =
    input.paymentDay == null ? null : nextOccurrenceOfMonthDay(input.paymentDay, today);

  let projectedPayoffDate: string | null = null;
  if (nextDue && input.paymentDay != null && paymentsRemaining != null && paymentsRemaining > 0) {
    // The final payment is the (n-1)th month after the next one due.
    const payoff = clampStatementDate(
      nextDue.getFullYear(),
      nextDue.getMonth() + paymentsRemaining - 1,
      input.paymentDay,
    );
    projectedPayoffDate = dayKeyFromDateLocal(payoff);
  }

  const estimatedInterestRemaining =
    hasRate && exactPayments != null
      ? normalizeMoneyAmount(payment * exactPayments - remaining)
      : null;

  return {
    remaining,
    principal,
    paid,
    paidRatio,
    isPaidOff: false,
    nextDueDate: nextDue ? dayKeyFromDateLocal(nextDue) : null,
    paymentsRemaining,
    projectedPayoffDate,
    estimatedInterestRemaining,
    paymentCoversInterest,
  };
}

interface RepaymentTransaction {
  type: TransactionType;
  date: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
}

/**
 * How many days before the due date a repayment still counts toward that
 * cycle. Without it, anyone who pays a few days early would be told they are
 * overdue the moment the due date passed, which is the common case, not an
 * edge case. A false "overdue" alarm costs more trust than a late nudge.
 */
export const REPAYMENT_GRACE_DAYS = 7;

/**
 * True when the payment day has come round and no repayment has been recorded
 * for that cycle. A repayment is a transfer **into** the loan account:
 * spending on the loan (an interest charge) and transfers out of it (a
 * drawdown) are not.
 */
export function isRepaymentOverdue(
  account: { id: string; loanPaymentDay?: number | null },
  transactions: RepaymentTransaction[],
  now: Date,
): boolean {
  if (account.loanPaymentDay == null) return false;

  const thisMonth = clampStatementDate(now.getFullYear(), now.getMonth(), account.loanPaymentDay);
  // The most recent due date at or before `now`; nothing is overdue until one
  // has passed in the current month.
  if (thisMonth.getTime() > now.getTime()) return false;

  // Local midnight -> UTC on both sides, matching how transaction dates are
  // written (see toUtcIsoFromLocalDateInput in the transaction editor).
  const windowStart = new Date(thisMonth.getTime() - REPAYMENT_GRACE_DAYS * DAY_IN_MS);
  const windowStartIso = windowStart.toISOString();
  return !transactions.some(
    (tx) => tx.type === 'transfer' && tx.toAccountId === account.id && tx.date >= windowStartIso,
  );
}
