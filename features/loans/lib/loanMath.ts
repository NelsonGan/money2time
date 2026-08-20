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
  /**
   * The instalment the lender actually charges, when the borrower has told us
   * it rather than leaving it to be derived. It overrides `annualRatePercent`,
   * which only carries the two decimals its field displays: re-deriving the
   * payment from that rounded rate is what puts it a few cents off the figure
   * on the borrower's statement.
   */
  instalment?: number | null;
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
 * Highest monthly rate the inverse solver will consider (100% a month). Any
 * total repayable that needs more than this is a typo, not a loan.
 */
const MAX_MONTHLY_RATE = 1;

/**
 * How far a typed instalment may fall short of `principal / termMonths` before
 * the contract is rejected: one cent per instalment, which is the most a
 * lender's own rounding can leave for the final payment to absorb.
 */
const INSTALMENT_ROUNDING_SLACK = 0.01;

/** The level instalment for a contract, or null when it has no shape. */
function instalmentFor(principal: number, monthlyRate: number, termMonths: number): number {
  if (monthlyRate <= 0) return principal / termMonths;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
}

function isUsableContract(principal: number, termMonths: number): boolean {
  return (
    Number.isFinite(principal) &&
    principal > 0 &&
    Number.isInteger(termMonths) &&
    termMonths > 0 &&
    termMonths <= MAX_LOAN_TERM_MONTHS
  );
}

/**
 * The level instalment a contract works out to, rounded to cents.
 *
 * Cents are where the instalment lives: it is a payment, and every figure
 * derived from it (the total repayable, the interest, the recurring transfer)
 * has to agree with the one the borrower sees. Rounding once, here, is what
 * keeps them all in step.
 */
export function instalmentForContract(
  principal: number,
  annualRatePercent: number | null,
  termMonths: number,
): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  return normalizeMoneyAmount(
    instalmentFor(principal, monthlyRateFrom(annualRatePercent), termMonths),
  );
}

/**
 * Everything the borrower hands back over the full term: principal plus all
 * interest. The figure many lenders quote instead of a rate.
 */
export function totalRepayableFor(
  principal: number,
  annualRatePercent: number | null,
  termMonths: number,
): number | null {
  const instalment = instalmentForContract(principal, annualRatePercent, termMonths);
  if (instalment == null) return null;
  return normalizeMoneyAmount(instalment * termMonths);
}

/**
 * The monthly rate a level instalment implies, unrounded.
 *
 * The instalment formula cannot be rearranged for `r`, so this bisects, which
 * is safe because the instalment rises monotonically with the rate. An
 * instalment at or below `principal / termMonths` is interest-free rather than
 * a negative rate, and one beyond {@link MAX_MONTHLY_RATE} is rejected.
 */
function monthlyRateForInstalment(
  principal: number,
  targetInstalment: number,
  termMonths: number,
): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  if (!Number.isFinite(targetInstalment)) return null;
  if (targetInstalment <= principal / termMonths) return 0;
  if (instalmentFor(principal, MAX_MONTHLY_RATE, termMonths) < targetInstalment) return null;

  let low = 0;
  let high = MAX_MONTHLY_RATE;
  // 60 halvings take the interval well below the precision the rate is
  // rounded to for display, so the result is stable.
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (instalmentFor(principal, mid, termMonths) < targetInstalment) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * The annual rate a monthly one shows as. Two decimals is what the rate field
 * displays; solving finer would only make the contract's fields jitter as the
 * user types.
 */
function annualRatePercentFrom(monthlyRate: number): number {
  return Math.round(monthlyRate * 1200 * 100) / 100;
}

/** The effective annual rate implied by a total repayable. */
export function rateForTotalRepayable(
  principal: number,
  totalRepayable: number,
  termMonths: number,
): number | null {
  // An unusable term makes the division meaningless, but the solver rejects
  // the contract before the resulting Infinity or NaN can matter.
  const monthly = monthlyRateForInstalment(principal, totalRepayable / termMonths, termMonths);
  return monthly == null ? null : annualRatePercentFrom(monthly);
}

/** The effective annual rate implied by a monthly instalment. */
export function rateForInstalment(
  principal: number,
  instalment: number,
  termMonths: number,
): number | null {
  const monthly = monthlyRateForInstalment(principal, instalment, termMonths);
  return monthly == null ? null : annualRatePercentFrom(monthly);
}

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

/**
 * Turns a loan contract into the numbers a borrower actually reads: what they
 * pay each month, what they still owe, and when it ends.
 *
 * The level instalment is the standard annuity payment
 *   A = P·r / (1 - (1+r)^-n)
 * and the balance after k instalments is
 *   B(k) = P·((1+r)^n - (1+r)^k) / ((1+r)^n - 1),
 * both degenerating to straight division when the loan is interest-free. Given
 * `instalment`, the same relations run backwards: the rate is solved from the
 * payment instead of the payment from the rate.
 *
 * Returns null when the contract cannot produce one: no principal, no term, a
 * term past {@link MAX_LOAN_TERM_MONTHS}, nothing left to run, or an
 * instalment too small to clear the principal inside the term.
 */
export function computeLoanQuote(input: LoanQuoteInput): LoanQuote | null {
  const { principal, termMonths, paidPeriods } = input;
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > MAX_LOAN_TERM_MONTHS) {
    return null;
  }
  if (!Number.isInteger(paidPeriods) || paidPeriods < 0 || paidPeriods >= termMonths) return null;

  // A typed instalment is the contract as the lender wrote it, so it wins over
  // the rate and the schedule is solved back from it. Straight `instalment /
  // rate` round-tripping is what used to lose the cents: the rate carries two
  // decimals, and 120,000 over 60 months repaying 133,920 is a true 4.4053%,
  // which shows as 4.41 and re-derives as 2,232.25 rather than 2,232.
  const typed = input.instalment;
  const hasTyped = typed != null && Number.isFinite(typed) && typed > 0;
  // An instalment that cannot clear the principal inside the term is not a
  // contract. The slack is for lenders who round each instalment down and let
  // the final one absorb the difference, which is a cent a period at most.
  if (hasTyped && typed * termMonths < principal - termMonths * INSTALMENT_ROUNDING_SLACK) {
    return null;
  }

  const r = hasTyped
    ? monthlyRateForInstalment(principal, typed, termMonths)
    : monthlyRateFrom(input.annualRatePercent);
  if (r == null) return null;
  const growth = r > 0 ? Math.pow(1 + r, termMonths) : 1;
  const instalment = hasTyped
    ? normalizeMoneyAmount(typed)
    : instalmentFor(principal, r, termMonths);
  const openingBalance =
    r > 0
      ? (principal * (growth - Math.pow(1 + r, paidPeriods))) / (growth - 1)
      : (principal * (termMonths - paidPeriods)) / termMonths;

  const start = toLocalDate(input.startDate);
  const roundedInstalment = normalizeMoneyAmount(instalment);
  return {
    instalment: roundedInstalment,
    openingBalance: normalizeMoneyAmount(openingBalance),
    // From the rounded instalment, so this agrees with the total repayable the
    // form shows rather than sitting a few cents off it.
    totalInterest: Math.max(0, normalizeMoneyAmount(roundedInstalment * termMonths - principal)),
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
 * The due date a loan has missed, or null when it is up to date.
 *
 * Returns the date rather than a boolean because the card says "Overdue since
 * X": the figure has to be the due date that was missed, which is the most
 * recent occurrence at or before today, not the next one coming up.
 *
 * A repayment is a transfer **into** the loan account; spending on the loan
 * (an interest charge) and transfers out of it (a drawdown) are not.
 *
 * Only cycles the app was actually watching can be judged. A cycle is skipped
 * if it closed before the first instalment fell due (a month after
 * disbursement) or before the loan was added, so neither a loan taken out this
 * month nor one entered half-way through its life is greeted with a red
 * flashing chip for payments it was never in a position to see.
 */
export function overdueSince(
  account: {
    id: string;
    loanPaymentDay?: number | null;
    loanStartDate?: string | null;
    createdAt?: string | null;
  },
  transactions: RepaymentTransaction[],
  now: Date,
): string | null {
  if (account.loanPaymentDay == null) return null;

  const thisMonth = clampStatementDate(now.getFullYear(), now.getMonth(), account.loanPaymentDay);
  // The most recent due date at or before `now`; nothing is overdue until one
  // has passed in the current month.
  const lastDue =
    thisMonth.getTime() <= now.getTime()
      ? thisMonth
      : clampStatementDate(now.getFullYear(), now.getMonth() - 1, account.loanPaymentDay);
  if (lastDue.getTime() > now.getTime()) return null;

  if (account.loanStartDate) {
    // Instalments run from one month after the loan was taken out.
    const start = toLocalDate(account.loanStartDate);
    const firstDue = clampStatementDate(start.getFullYear(), start.getMonth() + 1, start.getDate());
    if (lastDue.getTime() < firstDue.getTime()) return null;
  }
  if (account.createdAt && lastDue.getTime() < toLocalDate(account.createdAt).getTime()) {
    return null;
  }

  // Local midnight -> UTC on both sides, matching how transaction dates are
  // written (see toUtcIsoFromLocalDateInput in the transaction editor).
  const windowStart = new Date(lastDue.getTime() - REPAYMENT_GRACE_DAYS * DAY_IN_MS);
  const windowStartIso = windowStart.toISOString();
  const paid = transactions.some(
    (tx) => tx.type === 'transfer' && tx.toAccountId === account.id && tx.date >= windowStartIso,
  );
  return paid ? null : dayKeyFromDateLocal(lastDue);
}
