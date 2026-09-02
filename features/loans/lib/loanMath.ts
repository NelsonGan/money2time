import type { LoanInterestModel, LoanProgress, LoanRateChange, TransactionType } from '~/types';
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
  /**
   * Instalments in the whole contract, or null on a loan with no term. It is
   * what turns the projection into the pair of figures a borrower can check
   * against a statement: instalments paid, and the cash that represents.
   */
  termMonths?: number | null;
  /**
   * What the agreement says the loan costs in total. Given it, the pair of
   * figures a borrower checks against a statement become exact rather than
   * projected: what is left is the total minus what has been paid.
   */
  totalRepayable?: number | null;
  /**
   * How this loan charges interest. Defaults to `flat`, which is what every
   * loan tracked before the models were split behaves as.
   */
  interestModel?: LoanInterestModel | null;
  /**
   * Contract start date (YYYY-MM-DD), which fixes where in its own schedule
   * the loan should be today. Only a reducing balance loan uses it, and only
   * to say what repaying ahead of that schedule has saved; without it that one
   * figure is not reported and nothing else changes.
   */
  startDate?: string | null;
  /** The evaluation date (YYYY-MM-DD or ISO); injected so the math stays pure. */
  todayIso: string;
}

/** The `YYYY-MM-DD` day key of a day key or full ISO stamp. */
function toDayKey(dateIso: string): string {
  return dateIso.length > 10 ? dateIso.slice(0, 10) : dateIso;
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

/**
 * How a loan charges interest, with the null a pre-column loan carries read as
 * `flat`.
 *
 * Every loan the app modelled before the column existed was quoted the way a
 * flat contract is (a total fixed at signing), so `flat` is what keeps an
 * upgraded loan reading exactly as it did. Read through here rather than
 * comparing the field, so that default lives in one place.
 *
 * The two models differ in what the *agreement* fixes, not in how the debt is
 * walked. A flat contract fixes the total cost, so what is left to pay is that
 * total less what has been handed over, and paying ahead saves nothing off it.
 * A reducing balance contract fixes only the rate, so what is left is whatever
 * interest the outstanding balance goes on to accrue, and paying ahead saves
 * real money. Either way the balance owed is the principal outstanding, and on
 * both it is walked forward at the effective rate ({@link accrueReducingBalance}):
 * a flat loan's instalment carries interest too, and knocking the whole of it
 * off the principal is what used to read a flat loan as settled seven
 * instalments early.
 */
export function loanInterestModelOf(
  account: { loanInterestModel?: LoanInterestModel | null } | null | undefined,
): LoanInterestModel {
  return account?.loanInterestModel === 'reducing' ? 'reducing' : 'flat';
}

/**
 * What a **flat rate** contract costs in total: the amount borrowed plus
 * simple interest on the whole of it for the whole term.
 *
 *   total = P + P x rate x years
 *
 * This is the Malaysian hire-purchase and personal-loan quote, and the reason
 * the two models need separating: the same "3.5%" that means 3.5% here means
 * roughly twice as much money as it does on a reducing balance loan, because
 * here it is charged on the full principal every year even once most of it has
 * been repaid.
 */
export function totalRepayableForFlatRate(
  principal: number,
  flatRatePercent: number | null,
  termMonths: number,
): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  if (flatRatePercent == null || !Number.isFinite(flatRatePercent) || flatRatePercent < 0) {
    return null;
  }
  return normalizeMoneyAmount(principal + (principal * (flatRatePercent / 100) * termMonths) / 12);
}

/** The flat rate a total repayable implies; the inverse of the above. */
export function flatRateForTotalRepayable(
  principal: number,
  totalRepayable: number,
  termMonths: number,
): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  if (!Number.isFinite(totalRepayable) || totalRepayable < principal) return null;
  // Two decimals, matching what the rate field displays, so the total and the
  // rate stop nudging each other as the borrower types.
  return (
    Math.round(((totalRepayable - principal) / principal) * (12 / termMonths) * 100 * 100) / 100
  );
}

/**
 * What the loan costs in total, from the rate the borrower was quoted under
 * their own model. This is the direction the form runs in: a borrower knows
 * their rate and their term, and almost never knows the total on a 30 year
 * mortgage.
 */
export function totalRepayableForModel(
  model: LoanInterestModel,
  principal: number,
  ratePercent: number | null,
  termMonths: number,
): number | null {
  // No rate means no contract yet, not an interest-free one. The reducing
  // branch would otherwise read a missing rate as zero and quietly fill the
  // total in with the principal, so a half-typed form would offer a 0% loan
  // the borrower never described. A typed `0` is finite and still gets one.
  if (ratePercent == null || !Number.isFinite(ratePercent) || ratePercent < 0) return null;
  return model === 'reducing'
    ? totalRepayableFor(principal, ratePercent, termMonths)
    : totalRepayableForFlatRate(principal, ratePercent, termMonths);
}

/**
 * The rate a total repayable implies, quoted the way this model quotes rates.
 * Runs the form's other direction, for a borrower who has the total in front
 * of them rather than the rate.
 */
export function rateForModel(
  model: LoanInterestModel,
  principal: number,
  totalRepayable: number,
  termMonths: number,
): number | null {
  // A total that cannot even repay the principal is not a contract, so it
  // implies no rate. Without this an emptied total field reads as 0 and the
  // reducing branch answers "0%", which looks like an interest-free loan rather
  // than an unfinished form. The slack is the same one the quote allows for a
  // lender who rounds the instalment down.
  if (
    !Number.isFinite(totalRepayable) ||
    totalRepayable < principal - termMonths * INSTALMENT_ROUNDING_SLACK
  ) {
    return null;
  }
  return model === 'reducing'
    ? rateForTotalRepayable(principal, totalRepayable, termMonths)
    : flatRateForTotalRepayable(principal, totalRepayable, termMonths);
}

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
   * Everything the borrower hands back over the term, when the agreement
   * states it. This is what the loan *costs*, so it defines the contract's
   * shape: the rate, the interest and the amortization are all solved from it,
   * in preference to `annualRatePercent`, which carries only the two decimals
   * its field displays.
   */
  totalRepayable?: number | null;
  /**
   * The instalment the lender actually charges, when it differs from the level
   * payment the total implies.
   *
   * Deliberately **not** forced to agree with `totalRepayable`. A lender
   * rounds the instalment up and lets a smaller final payment absorb the
   * difference, so a contract repaying 64,831.90 over 108 months charges 601
   * where the level payment is 600.29. Both figures are true, and each drives
   * a different thing: the total drives what the loan costs, the instalment
   * drives what leaves the borrower's account each month. Deriving either from
   * the other loses whichever they did not type.
   *
   * With no total given this falls back to defining one, so a borrower who
   * knows only their payment still gets a complete contract.
   */
  instalment?: number | null;
}

export interface LoanQuote {
  /** What actually leaves the account each month. */
  instalment: number;
  /**
   * What the loan costs over the term. Not `instalment * termMonths` whenever
   * the lender's instalment is a rounded-up version of the level payment.
   */
  totalRepayable: number;
  /** Amount still owed after `paidPeriods` instalments. */
  openingBalance: number;
  /**
   * The day (YYYY-MM-DD) `openingBalance` describes: the date of the last
   * instalment already paid, or the start date when none is. It is where the
   * loan's interest walk begins, so that every rest after it falls on the
   * payment day.
   */
  openingBalanceDate: string;
  /** Interest paid across the whole term, at the level instalment. */
  totalInterest: number;
  /**
   * What is still to hand over: the total less the instalments already paid.
   *
   * Deliberately not `instalment * remainingPeriods`. The lender's instalment
   * is a rounded-up version of the level payment and the smaller final payment
   * absorbs the difference, so multiplying it out overstates the debt by the
   * whole of that rounding (77 x 601 reads 46,277 where the agreement says
   * 46,200.90). Subtracting from the total is the borrower's own arithmetic.
   */
  leftToPay: number;
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

/**
 * Where the contract says the balance stands after `elapsed` instalments:
 *   B(k) = P x ((1+r)^n - (1+r)^k) / ((1+r)^n - 1)
 * degenerating to straight division on an interest-free loan.
 */
function scheduledBalanceAfter(
  principal: number,
  monthlyRate: number,
  termMonths: number,
  elapsed: number,
): number {
  if (elapsed >= termMonths) return 0;
  if (elapsed <= 0) return principal;
  if (monthlyRate <= 0) return (principal * (termMonths - elapsed)) / termMonths;
  const growth = Math.pow(1 + monthlyRate, termMonths);
  return (principal * (growth - Math.pow(1 + monthlyRate, elapsed))) / (growth - 1);
}

/**
 * Instalments the calendar says have fallen due since `startDayKey`, capped at
 * the term. The first falls one month after the loan is taken out.
 *
 * Counted by walking the same clamped month arithmetic the rest of the file
 * uses rather than by differencing the dates, so a loan taken out on the 31st
 * counts its February instalment on the 28th exactly as its schedule does.
 */
function elapsedInstalments(startDayKey: string, todayKey: string, termMonths: number): number {
  let elapsed = 0;
  while (elapsed < termMonths && addMonthsToDayKey(startDayKey, elapsed + 1) <= todayKey) {
    elapsed += 1;
  }
  return elapsed;
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
 * Whether a recurring rule pays into this loan at all.
 *
 * Looser than {@link isContractTrackingRule} on purpose. That one guards
 * *money* — the amount transferred — so it refuses to touch a rule the user has
 * taken over. This one guards *reporting*: whether a repayment counts as
 * spending and under which category. A rule the user re-pointed or re-priced is
 * still a repayment into this loan, and reporting two repayments into the same
 * loan two different ways is never what anyone wants.
 */
export function isRepaymentRule(rule: ContractRule, loanAccountId: string): boolean {
  return rule.isActive && rule.type === 'transfer' && rule.toAccountId === loanAccountId;
}

interface LoanReportingAccount {
  type: string;
  loanCountAsExpense?: boolean | null;
  loanPaymentCategoryId?: string | null;
}

/**
 * How a transfer paying into `destination` should be reported: whether it
 * counts as spending, and under which category.
 *
 * Read off the loan account rather than carried over from whatever the rule or
 * row last held, because the loan is where the borrower set it and where
 * `resyncRepaymentReporting` re-points every rule paying in. That is what makes
 * a repayment the borrower rebuilt by hand — after deleting the rule the loan
 * created — count exactly like the original, instead of silently dropping out
 * of their spending while the loan still says it counts.
 *
 * Anything that is not a counted loan reports as the plain transfer it is, so
 * the default path stamps nothing.
 */
export function loanRepaymentReporting(destination: LoanReportingAccount | null | undefined): {
  countsAsExpense: boolean;
  categoryId: string | null;
} {
  if (!destination || destination.type !== 'loan' || !destination.loanCountAsExpense) {
    return { countsAsExpense: false, categoryId: null };
  }
  return { countsAsExpense: true, categoryId: destination.loanPaymentCategoryId ?? null };
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

  // Rounded to cents before anything is solved from them, so the rate, the
  // interest and the reported figures all describe the same money.
  const typedInstalment =
    input.instalment != null && Number.isFinite(input.instalment) && input.instalment > 0
      ? normalizeMoneyAmount(input.instalment)
      : null;
  // The cost of the loan is what gives it its shape. An instalment on its own
  // implies one, which is how a borrower who knows only their payment still
  // gets a contract.
  const total =
    input.totalRepayable != null &&
    Number.isFinite(input.totalRepayable) &&
    input.totalRepayable > 0
      ? normalizeMoneyAmount(input.totalRepayable)
      : typedInstalment != null
        ? normalizeMoneyAmount(typedInstalment * termMonths)
        : null;
  // A contract that cannot clear the principal inside the term is not a
  // contract. The slack is for lenders who round each instalment down and let
  // the final one absorb the difference, which is a cent a period at most.
  if (total != null && total < principal - termMonths * INSTALMENT_ROUNDING_SLACK) return null;

  // The level payment the total implies. This, not the instalment the lender
  // charges, is what the amortization runs on: the two differ by the rounding
  // the smaller final payment absorbs, and the schedule has no final-payment
  // field to absorb it with.
  const levelPayment = total == null ? null : total / termMonths;
  const r =
    levelPayment != null
      ? monthlyRateForInstalment(principal, levelPayment, termMonths)
      : monthlyRateFrom(input.annualRatePercent);
  if (r == null) return null;
  // What actually leaves the account each month: the lender's figure when
  // given, otherwise the level payment.
  const instalment =
    typedInstalment ??
    normalizeMoneyAmount(levelPayment ?? instalmentFor(principal, r, termMonths));
  const openingBalance = scheduledBalanceAfter(principal, r, termMonths, paidPeriods);

  const start = toLocalDate(input.startDate);
  return {
    instalment,
    totalRepayable: normalizeMoneyAmount(total ?? instalment * termMonths),
    openingBalance: normalizeMoneyAmount(openingBalance),
    openingBalanceDate: addMonthsToDayKey(input.startDate, paidPeriods),
    // From the total, so the interest is exactly the gap between what was
    // borrowed and what the agreement says is handed back. A lender's rounding
    // down can make it fractionally negative, which is not interest.
    totalInterest: Math.max(
      0,
      normalizeMoneyAmount((total ?? instalment * termMonths) - principal),
    ),
    leftToPay: Math.max(
      0,
      normalizeMoneyAmount((total ?? instalment * termMonths) - instalment * paidPeriods),
    ),
    remainingPeriods: termMonths - paidPeriods,
    paymentDay: start.getDate(),
    payoffDate: addMonthsToDayKey(input.startDate, termMonths),
    // Instalments run monthly from one month after disbursement, so the next
    // one due is that plus however many have already been paid.
    firstInstalmentDate: addMonthsToDayKey(input.startDate, paidPeriods + 1),
  };
}

/**
 * The monthly rate the agreement's own total implies, unrounded.
 *
 * This, not the two decimals `loan_interest_rate` holds, is what every
 * projection and the interest walk run on: the projection is far more
 * sensitive to that rounding than it looks (see {@link computeLoanProgress}),
 * and the walk compounds it for the whole term. Null when the contract has no
 * total, no term, or a total that implies no rate a loan carries.
 */
export function contractMonthlyRate(
  principal: number,
  totalRepayable: number | null | undefined,
  termMonths: number | null | undefined,
): number | null {
  if (
    totalRepayable == null ||
    !Number.isFinite(totalRepayable) ||
    totalRepayable <= 0 ||
    termMonths == null ||
    !Number.isInteger(termMonths) ||
    termMonths <= 0 ||
    !(principal > 0)
  ) {
    return null;
  }
  return monthlyRateForInstalment(principal, totalRepayable / termMonths, termMonths);
}

interface LoanAccrualAccount {
  loanOriginalPrincipal?: number | null;
  loanTotalRepayable?: number | null;
  loanTermMonths?: number | null;
  loanInterestRate?: number | null;
  loanRateChanges?: readonly LoanRateChange[] | null;
}

/**
 * The annual rate a loan's interest is walked forward at, as an unrounded
 * percentage, or null when the loan carries none.
 *
 * Solved from the agreement's total where there is one, for the precision
 * {@link contractMonthlyRate} explains; the stored rate is the fallback for a
 * loan saved without a total. On a flat contract the stored rate is already the
 * effective one (the rate field's flat figure is never stored), so both paths
 * hand back a rate on the reducing balance, which is the only kind a walk can
 * use.
 */
export function loanAccrualRatePercent(account: LoanAccrualAccount): number | null {
  const monthly = contractMonthlyRate(
    account.loanOriginalPrincipal ?? 0,
    account.loanTotalRepayable,
    account.loanTermMonths,
  );
  const annual = monthly != null ? monthly * 1200 : (account.loanInterestRate ?? null);
  if (annual == null || !Number.isFinite(annual) || annual <= 0) return null;
  return annual;
}

/** Whether walking this loan's ledger would charge any interest at all. */
export function loanAccruesInterest(account: LoanAccrualAccount): boolean {
  if (loanAccrualRatePercent(account) != null) return true;
  return loanRateChangesOf(account).some((change) => change.annualRatePercent > 0);
}

/**
 * The rate changes a loan has been through, oldest first, with anything a
 * hand-edited backup could have left malformed dropped. Empty when the contract
 * rate applied throughout.
 */
export function loanRateChangesOf(
  account: { loanRateChanges?: readonly LoanRateChange[] | null } | null | undefined,
): LoanRateChange[] {
  const changes = account?.loanRateChanges;
  if (!Array.isArray(changes)) return [];
  return changes
    .filter(
      (change): change is LoanRateChange =>
        change != null &&
        typeof change.from === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(change.from) &&
        typeof change.annualRatePercent === 'number' &&
        Number.isFinite(change.annualRatePercent) &&
        change.annualRatePercent >= 0,
    )
    .map((change) => ({ from: change.from, annualRatePercent: change.annualRatePercent }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/**
 * The day a loan's interest walk starts from: the day its starting balance
 * describes.
 *
 * A loan set up from its contract records that day outright, as the date of
 * the last instalment already paid, so every rest after it falls on the
 * payment day the way the lender's do. A loan saved before that was recorded
 * anchors on the day it was created, which is what `starting_balance` meant
 * then; the start date and today are the fallbacks for hand-imported rows.
 */
export function loanLedgerAnchor(
  account: {
    loanLedgerAnchorDate?: string | null;
    createdAt?: string | null;
    loanStartDate?: string | null;
  },
  todayIso: string,
): string {
  const explicit = account.loanLedgerAnchorDate;
  if (explicit && /^\d{4}-\d{2}-\d{2}/.test(explicit)) return toDayKey(explicit);
  if (account.createdAt) return toDayKey(account.createdAt);
  if (account.loanStartDate) return toDayKey(account.loanStartDate);
  return toDayKey(todayIso);
}

export function computeLoanProgress(input: LoanMathInput): LoanProgress {
  const interestModel: LoanInterestModel = input.interestModel === 'reducing' ? 'reducing' : 'flat';
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
  const instalmentsTotal =
    input.termMonths != null && Number.isInteger(input.termMonths) && input.termMonths > 0
      ? input.termMonths
      : null;
  const contractTotal =
    input.totalRepayable != null &&
    Number.isFinite(input.totalRepayable) &&
    input.totalRepayable > 0
      ? normalizeMoneyAmount(input.totalRepayable)
      : null;

  /**
   * The rate the projection runs on, solved from the agreement's own total
   * whenever it states one, exactly as {@link computeLoanQuote} does.
   *
   * `annualRatePercent` reaches here off `loan_interest_rate`, which carries
   * only the two decimals its field displays, and the projection is far more
   * sensitive to that rounding than it looks: a contract of 120,000 over 60
   * months repaying 133,920 runs at 4.4053%, stores as 4.41, and amortizes to
   * 48.005 payments left instead of 48. Ceiling that costs a whole instalment,
   * so a loan opened with twelve payments behind it reported eleven, and every
   * figure read off the count (paid so far, left to pay, payments left, the
   * payoff date) was one instalment out from the contract the borrower had
   * just been shown.
   */
  const agreementMonthlyRate = contractMonthlyRate(principal, contractTotal, instalmentsTotal);
  // A negative rate is meaningless; treat it as unmodelled rather than letting
  // it produce a nonsense projection.
  const hasRate =
    agreementMonthlyRate != null
      ? agreementMonthlyRate > 0
      : input.annualRatePercent != null && input.annualRatePercent > 0;
  const monthlyRate = agreementMonthlyRate ?? (hasRate ? input.annualRatePercent! / 100 / 12 : 0);
  const payment = input.monthlyPayment > 0 ? input.monthlyPayment : 0;
  const todayKey = toDayKey(input.todayIso);

  /**
   * What repaying ahead of the contract's own schedule has saved, or null when
   * the question does not arise.
   *
   * Both sides are measured from **today**, which is the whole point: the
   * interest the contract would still charge from here if the borrower had
   * only ever paid the instalment, less the interest they are actually still
   * going to be charged. Comparing against the contract's *lifetime* interest
   * instead would count every instalment paid before the app ever saw the loan
   * as a saving, and greet a borrower who has done nothing at all with a five
   * figure one.
   *
   * Flat contracts are excluded rather than reported as zero: their interest
   * was fixed at signing and paying ahead genuinely saves none of it, so there
   * is no figure to show.
   */
  const interestSavedGiven = (actualInterestRemaining: number | null): number | null => {
    if (interestModel !== 'reducing') return null;
    if (actualInterestRemaining == null) return null;
    if (!hasRate || payment <= 0) return null;
    if (instalmentsTotal == null || input.startDate == null) return null;
    if (!(principal > 0)) return null;
    const elapsed = elapsedInstalments(toDayKey(input.startDate), todayKey, instalmentsTotal);
    const scheduledRemaining = scheduledBalanceAfter(
      principal,
      monthlyRate,
      instalmentsTotal,
      elapsed,
    );
    // Run through the same amortization as the actual side, deliberately, and
    // not as `payment x (term - elapsed) - scheduledRemaining`. The instalment
    // is rounded to cents and so is a hair larger than the exact annuity
    // payment, which clears the loan a fraction of a period early; counting the
    // scheduled side in whole periods and the actual side in fractional ones
    // would charge that difference to the borrower as a saving, and put a
    // stray unit or two on the card of someone who has paid to the letter.
    // Deriving both the same way makes an on-schedule loan report exactly zero.
    let scheduledInterestRemaining = 0;
    // A schedule with nothing left to run has no interest left to charge, and
    // amortizing a zero balance is undefined rather than instant.
    if (scheduledRemaining > 0) {
      const scheduledPayments = paymentsToClear(scheduledRemaining, payment, monthlyRate);
      if (scheduledPayments == null) return null;
      scheduledInterestRemaining = payment * scheduledPayments - scheduledRemaining;
    }
    // Behind schedule reads as nothing saved rather than as a negative saving,
    // which is not a figure anyone wants on a card.
    return Math.max(0, normalizeMoneyAmount(scheduledInterestRemaining - actualInterestRemaining));
  };

  if (isPaidOff) {
    return {
      remaining,
      principal,
      paid,
      paidRatio,
      progressRatio: 1,
      instalmentsTotal,
      instalmentsPaid: instalmentsTotal,
      paidSoFar:
        instalmentsTotal != null && input.monthlyPayment > 0
          ? normalizeMoneyAmount(instalmentsTotal * input.monthlyPayment)
          : null,
      leftToPay: 0,
      isPaidOff: true,
      nextDueDate: null,
      paymentsRemaining: 0,
      projectedPayoffDate: null,
      estimatedInterestRemaining: null,
      remainingWithInterest: null,
      paymentCoversInterest: true,
      // A settled loan is charged nothing more, so everything the schedule had
      // still to charge from today is money kept. Zero on one that ran its full
      // term, which is the honest answer.
      interestSaved: interestSavedGiven(0),
    };
  }

  const exactPayments = paymentsToClear(remaining, payment, monthlyRate);
  // Only a payment that exists but loses to interest is a warning; no payment
  // at all is just an incomplete loan setup.
  const paymentCoversInterest = payment <= 0 || monthlyRate <= 0 || exactPayments != null;
  /**
   * How far past a whole payment the tail has to reach before it counts as
   * another one.
   *
   * Rounding up is right — a part payment is still a payment — but only once
   * the part is real. The balance and the instalment are both stored to the
   * cent, so a schedule sitting exactly on a whole number of payments arrives
   * here a hair either side of it, and ceiling that directly charges the
   * borrower an instalment they do not owe. The tolerance is the cent of
   * rounding each instalment can carry, spread across the term and read as a
   * fraction of one payment, so it is worth well under a cent of money and can
   * never swallow a payment anyone actually has to make.
   */
  const scheduleRoundingSlack =
    payment > 0 && instalmentsTotal != null
      ? Math.min(0.01, (instalmentsTotal * INSTALMENT_ROUNDING_SLACK) / payment)
      : 0;
  // Never below one: a settled loan returned above, so anything still here owes
  // money and owes at least one more payment to clear it. Without the floor a
  // balance smaller than the tolerance would read as nothing left to pay while
  // the card beside it still showed a debt.
  const paymentsRemaining =
    exactPayments == null ? null : Math.max(1, Math.ceil(exactPayments - scheduleRoundingSlack));

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

  // What the borrower still has to hand over, which is the balance owed plus
  // the interest that will accrue on it at this repayment. Built by adding the
  // two figures rather than re-deriving `payment * exactPayments`, so the
  // interest a card shows is exactly the gap between the two numbers beside it.
  // Null when interest is not modelled: there the balance owed already is the
  // whole of it, and callers fall back to `remaining`.
  const remainingWithInterest =
    estimatedInterestRemaining == null
      ? null
      : normalizeMoneyAmount(remaining + estimatedInterestRemaining);

  // Counted off the projection rather than off the calendar, so a borrower who
  // overpaid is told how much of the debt is actually behind them. Clamped at
  // both ends: a balance too high for the term (typing a statement figure that
  // still carries future interest into "balance owed" does it) would otherwise
  // read as a negative number of instalments paid.
  const instalmentsPaid =
    instalmentsTotal != null && paymentsRemaining != null
      ? Math.min(instalmentsTotal, Math.max(0, instalmentsTotal - paymentsRemaining))
      : null;
  const paidSoFar =
    instalmentsPaid != null && payment > 0 ? normalizeMoneyAmount(instalmentsPaid * payment) : null;

  // The borrower's own arithmetic: what the loan costs, less what they have
  // handed over. With the agreement's total this is exact and pairs with
  // `paidSoFar` to the cent, which `remainingWithInterest` cannot do because it
  // re-derives the interest from a two-decimal rate. Without a total it falls
  // back to that projection, which is all an incomplete contract can support.
  //
  // A reducing balance loan has no such fixed total to subtract from: its cost
  // is whatever interest the outstanding balance actually goes on to accrue,
  // so an extra repayment makes the agreement's total simply wrong. There the
  // live projection *is* the answer, which is why the models branch here.
  const leftToPay =
    interestModel === 'reducing'
      ? (remainingWithInterest ?? remaining)
      : contractTotal != null && paidSoFar != null
        ? Math.max(0, normalizeMoneyAmount(contractTotal - paidSoFar))
        : (remainingWithInterest ?? remaining);

  return {
    remaining,
    principal,
    paid,
    paidRatio,
    progressRatio:
      instalmentsTotal != null && instalmentsPaid != null
        ? instalmentsPaid / instalmentsTotal
        : paidRatio,
    instalmentsTotal,
    instalmentsPaid,
    paidSoFar,
    leftToPay,
    isPaidOff: false,
    nextDueDate: nextDue ? dayKeyFromDateLocal(nextDue) : null,
    paymentsRemaining,
    projectedPayoffDate,
    estimatedInterestRemaining,
    remainingWithInterest,
    paymentCoversInterest,
    interestSaved: interestSavedGiven(estimatedInterestRemaining),
  };
}

/**
 * A dated change to what a loan owes, in the loan's own currency: positive
 * draws it down further, negative pays it off.
 */
export interface LoanLedgerMovement {
  /** `YYYY-MM-DD` day key or full ISO stamp. */
  date: string;
  delta: number;
}

/** What a reducing balance loan's ledger works out to today. */
export interface ReducingBalanceLedger {
  /** Owed today: the principal outstanding, with interest charged to date. */
  balance: number;
  /** Interest charged since the opening balance was taken. */
  interestCharged: number;
}

/**
 * Highest number of rests the walk will run, so a corrupt anchor date cannot
 * spin. 100 years is well past the longest term the form accepts.
 */
const MAX_INTEREST_RESTS = 1200;

/**
 * What a loan actually owes, walked forward from the balance it was set up
 * with.
 *
 * The debt cannot be got at by summing transactions, because the instalment
 * carries interest and only the rest of it retires principal. The lender adds
 * interest to what is still owed at every monthly rest, and the instalment
 * then knocks that back down:
 *
 *   B <- B x (1 + r)      at each rest, with r the monthly rate
 *   B <- B - payment      as each repayment lands
 *
 * Run in that order (interest first, then the day's payment) this is exactly
 * the annuity the instalment was solved from, so a loan paid to schedule
 * finishes on its final instalment to the cent. It is also what makes an extra
 * repayment worth something: the money comes off the balance every later rest
 * is charged on, so the interest for the rest of the term simply never accrues.
 *
 * A flat contract is walked the same way, at the effective rate its total
 * implies. That is what the effective rate *is*: the rate on the reducing
 * balance whose annuity costs exactly what the flat quote does, so the walk
 * lands on the contract's own schedule instalment for instalment. Knocking the
 * whole instalment off the principal instead, as the app once did, read a
 * five year flat loan as fifteen instalments in after twelve and as settled
 * with seven still to pay.
 *
 * A variable rate loan hands over its `rateChanges`: each rest is charged at
 * the rate in force on that day, so a new rate applies from the day it was
 * recorded and the interest already charged stands.
 *
 * Rests fall on monthly anniversaries of `anchorDate` (the day the opening
 * balance describes), clamped into short months. Anchoring them there rather
 * than on the payment day is what keeps every period exactly one month long,
 * so no period is over- or under-charged and no partial first period has to be
 * pro-rated.
 *
 * Movements dated before the anchor are applied at it: they cannot have earned
 * interest the opening balance does not already carry. Movements dated on a
 * rest day land after that day's interest, which is the order a lender uses.
 * The walk is pure and re-runs from scratch, so correcting or deleting a
 * repayment years later simply re-derives the right answer.
 */
export function accrueReducingBalance(input: {
  /** What was owed on `anchorDate`. */
  openingBalance: number;
  /** Day key the opening balance describes; interest runs from here. */
  anchorDate: string;
  /** Annual rate on the reducing balance, as a percentage. */
  annualRatePercent: number | null;
  /**
   * Rate changes over the loan's life, in any order. Each rest is charged at
   * the latest change dated on or before it; a rest before the first change
   * is charged at the earliest one, since that is the rate the loan was on
   * before anything was recorded. Without any, `annualRatePercent` applies
   * throughout.
   */
  rateChanges?: readonly LoanRateChange[] | null;
  /** Every dated change to the debt, in any order. */
  movements: readonly LoanLedgerMovement[];
  /** Evaluation date (YYYY-MM-DD or ISO); injected so the walk stays pure. */
  todayIso: string;
}): ReducingBalanceLedger {
  const netMovement = input.movements.reduce(
    (sum, movement) => sum + (Number.isFinite(movement.delta) ? movement.delta : 0),
    0,
  );
  const changes = loanRateChangesOf({ loanRateChanges: input.rateChanges });
  const baseMonthlyRate = monthlyRateFrom(input.annualRatePercent);
  const monthlyRateAt = (restDay: string): number => {
    if (changes.length === 0) return baseMonthlyRate;
    let inForce = changes[0]!;
    for (const change of changes) {
      if (change.from <= restDay) inForce = change;
      else break;
    }
    return monthlyRateFrom(inForce.annualRatePercent);
  };
  const accruesAnything =
    changes.length === 0
      ? baseMonthlyRate > 0
      : changes.some((change) => monthlyRateFrom(change.annualRatePercent) > 0);
  // With no rate there is nothing to accrue, and the plain sum already is the
  // answer. Taking this path also keeps an interest-free loan penny-identical
  // to what the balance query alone would have produced.
  if (!accruesAnything) {
    return {
      balance: normalizeMoneyAmount(input.openingBalance + netMovement),
      interestCharged: 0,
    };
  }

  const anchor = toDayKey(input.anchorDate);
  const today = toDayKey(input.todayIso);
  const sorted = [...input.movements]
    .map((movement) => ({ date: toDayKey(movement.date), delta: movement.delta }))
    .filter((movement) => Number.isFinite(movement.delta))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = input.openingBalance;
  let interestCharged = 0;
  let next = 0;
  // Anything dated at or before the anchor is already in the opening balance's
  // period, so it lands before the first rest without accruing anything.
  while (next < sorted.length && sorted[next]!.date <= anchor) {
    balance += sorted[next]!.delta;
    next += 1;
  }

  for (let period = 1; period <= MAX_INTEREST_RESTS; period += 1) {
    const rest = addMonthsToDayKey(anchor, period);
    if (rest > today) break;
    while (next < sorted.length && sorted[next]!.date < rest) {
      balance += sorted[next]!.delta;
      next += 1;
    }
    // A settled or overpaid loan accrues nothing; interest is charged on debt,
    // and a credit balance is not one.
    const monthlyRate = monthlyRateAt(rest);
    if (balance > 0 && monthlyRate > 0) {
      const interest = normalizeMoneyAmount(balance * monthlyRate);
      balance += interest;
      interestCharged += interest;
    }
  }

  for (; next < sorted.length; next += 1) {
    balance += sorted[next]!.delta;
  }

  return {
    balance: normalizeMoneyAmount(balance),
    interestCharged: normalizeMoneyAmount(interestCharged),
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
  // Up to and including the day the loan was added. A cycle closing that very
  // day was not one the app was in a position to watch either: a borrower who
  // enters their loan on its own payment day has already paid the lender, and
  // greeting them with a red overdue chip on a loan they set up minutes ago is
  // the false alarm this guard exists to prevent.
  if (account.createdAt && lastDue.getTime() <= toLocalDate(account.createdAt).getTime()) {
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
