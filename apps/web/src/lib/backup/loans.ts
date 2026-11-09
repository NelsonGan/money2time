/**
 * The parts of the app's features/loans/lib/loanMath.ts the dashboard needs:
 * the interest walk that turns a loan's movements into today's debt, and the
 * progress figures shown on a loan card. Ported line for line so the web reads
 * the same debt as the phone; see that file for the reasoning behind each rule.
 */
import { addMonthsToDayKey, clampDate, dayKeyOf, nextOccurrenceOfMonthDay } from "./dates";
import type { AccountRow } from "./types";

type LoanRateChange = { from: string; annualRatePercent: number };
export type LoanMovement = { date: string; delta: number };

const MAX_LOAN_TERM_MONTHS = 480;
const MAX_MONTHLY_RATE = 1;
const MAX_INTEREST_RESTS = 1200;
const INSTALMENT_ROUNDING_SLACK = 0.01;

export function money(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const rounded = Math.round(amount * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** The day a stored date names, as the app's loan maths reads it: its first ten characters. */
export const toDayKey = (value: string | null | undefined) => (value ? (value.length > 10 ? value.slice(0, 10) : value) : "");

function isUsableContract(principal: number, termMonths: number): boolean {
  return (
    Number.isFinite(principal) &&
    principal > 0 &&
    Number.isInteger(termMonths) &&
    termMonths > 0 &&
    termMonths <= MAX_LOAN_TERM_MONTHS
  );
}

function instalmentFor(principal: number, monthlyRate: number, termMonths: number): number {
  if (monthlyRate <= 0) return principal / termMonths;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
}

function monthlyRateForInstalment(principal: number, target: number, termMonths: number): number | null {
  if (!isUsableContract(principal, termMonths) || !Number.isFinite(target)) return null;
  if (target <= principal / termMonths) return 0;
  if (instalmentFor(principal, MAX_MONTHLY_RATE, termMonths) < target) return null;
  let low = 0;
  let high = MAX_MONTHLY_RATE;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (instalmentFor(principal, mid, termMonths) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function contractMonthlyRate(
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

function monthlyRateFrom(annual: number | null): number {
  if (annual == null || !Number.isFinite(annual) || annual <= 0) return 0;
  return annual / 100 / 12;
}

export function loanRateChanges(account: AccountRow): LoanRateChange[] {
  const raw = account.loan_rate_changes_json;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (change): change is LoanRateChange =>
          change != null &&
          typeof change.from === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(change.from) &&
          typeof change.annualRatePercent === "number" &&
          Number.isFinite(change.annualRatePercent) &&
          change.annualRatePercent >= 0,
      )
      .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  } catch {
    return [];
  }
}

export function loanAccrualRatePercent(account: AccountRow): number | null {
  const monthly = contractMonthlyRate(
    account.loan_original_principal ?? 0,
    account.loan_total_repayable,
    account.loan_term_months,
  );
  const annual = monthly != null ? monthly * 1200 : (account.loan_interest_rate ?? null);
  if (annual == null || !Number.isFinite(annual) || annual <= 0) return null;
  return annual;
}

export function loanAccruesInterest(account: AccountRow): boolean {
  if (loanAccrualRatePercent(account) != null) return true;
  return loanRateChanges(account).some((change) => change.annualRatePercent > 0);
}

export function loanLedgerAnchor(account: AccountRow, todayKey: string): string {
  const explicit = account.loan_ledger_anchor_date;
  if (explicit && /^\d{4}-\d{2}-\d{2}/.test(explicit)) return toDayKey(explicit);
  // The app takes the UTC day of the creation stamp here.
  if (account.created_at) {
    const created = new Date(account.created_at);
    if (!Number.isNaN(created.getTime())) return created.toISOString().slice(0, 10);
  }
  if (account.loan_start_date) return toDayKey(account.loan_start_date);
  return todayKey;
}

/** Today's debt on a loan whose lender charges interest monthly. */
export function accrueReducingBalance(input: {
  openingBalance: number;
  anchorDate: string;
  annualRatePercent: number | null;
  rateChanges: LoanRateChange[];
  movements: LoanMovement[];
  todayKey: string;
}): { balance: number; interestCharged: number } {
  const net = input.movements.reduce((sum, m) => sum + (Number.isFinite(m.delta) ? m.delta : 0), 0);
  const changes = input.rateChanges;
  const baseRate = monthlyRateFrom(input.annualRatePercent);
  const rateAt = (rest: string) => {
    if (changes.length === 0) return baseRate;
    let inForce = changes[0];
    for (const change of changes) {
      if (change.from <= rest) inForce = change;
      else break;
    }
    return monthlyRateFrom(inForce.annualRatePercent);
  };
  const accrues =
    changes.length === 0 ? baseRate > 0 : changes.some((c) => monthlyRateFrom(c.annualRatePercent) > 0);
  if (!accrues) return { balance: money(input.openingBalance + net), interestCharged: 0 };

  const anchor = toDayKey(input.anchorDate);
  const sorted = input.movements
    .map((m) => ({ date: toDayKey(m.date), delta: m.delta }))
    // A movement with no date cannot be placed in the interest walk.
    .filter((m) => m.date !== "")
    .filter((m) => Number.isFinite(m.delta))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = input.openingBalance;
  let interest = 0;
  let next = 0;
  while (next < sorted.length && sorted[next].date <= anchor) {
    balance += sorted[next].delta;
    next += 1;
  }
  for (let period = 1; period <= MAX_INTEREST_RESTS; period += 1) {
    const rest = addMonthsToDayKey(anchor, period);
    if (rest > input.todayKey) break;
    while (next < sorted.length && sorted[next].date < rest) {
      balance += sorted[next].delta;
      next += 1;
    }
    const rate = rateAt(rest);
    if (balance > 0 && rate > 0) {
      const charge = money(balance * rate);
      balance += charge;
      interest += charge;
    }
  }
  for (; next < sorted.length; next += 1) balance += sorted[next].delta;
  return { balance: money(balance), interestCharged: money(interest) };
}

function paymentsToClear(balance: number, payment: number, rate: number): number | null {
  if (payment <= 0 || balance <= 0) return null;
  if (rate <= 0) return balance / payment;
  if (payment <= balance * rate) return null;
  return -Math.log(1 - (rate * balance) / payment) / Math.log(1 + rate);
}

export type LoanProgress = {
  remaining: number;
  principal: number;
  paid: number;
  progressRatio: number;
  instalmentsTotal: number | null;
  instalmentsPaid: number | null;
  paidSoFar: number | null;
  leftToPay: number;
  isPaidOff: boolean;
  paymentsRemaining: number | null;
  projectedPayoffDate: string | null;
  nextDueDate: string | null;
  estimatedInterestRemaining: number | null;
  interestModel: "flat" | "reducing";
};

/** `computeLoanProgress`, minus the interest-saved figure the dashboard skips. */
export function loanProgress(account: AccountRow, balance: number, today: Date): LoanProgress {
  const interestModel = account.loan_interest_model === "reducing" ? "reducing" : "flat";
  const remaining = Math.max(0, money(balance));
  // As the app's account card: a loan saved without these falls back to its
  // starting balance, and to instalment × term for the total.
  const principal = account.loan_original_principal ?? account.starting_balance ?? 0;
  const isPaidOff = money(balance) <= 0;
  const paid = Math.max(0, principal - remaining);
  const paidRatio = principal > 0 ? Math.min(1, Math.max(0, paid / principal)) : 1;
  const term = account.loan_term_months;
  const instalmentsTotal = term != null && Number.isInteger(term) && term > 0 ? term : null;
  const total =
    account.loan_total_repayable ??
    (account.loan_monthly_payment != null && account.loan_term_months != null
      ? account.loan_monthly_payment * account.loan_term_months
      : null);
  const contractTotal = total != null && Number.isFinite(total) && total > 0 ? money(total) : null;
  const agreementRate = contractMonthlyRate(principal, contractTotal, instalmentsTotal);
  const annual = account.loan_interest_rate ?? null;
  const hasRate = agreementRate != null ? agreementRate > 0 : annual != null && annual > 0;
  const monthlyRate = agreementRate ?? (hasRate ? (annual as number) / 100 / 12 : 0);
  const payment = (account.loan_monthly_payment ?? 0) > 0 ? (account.loan_monthly_payment as number) : 0;

  if (isPaidOff) {
    return {
      remaining,
      principal,
      paid,
      progressRatio: 1,
      instalmentsTotal,
      instalmentsPaid: instalmentsTotal,
      paidSoFar: instalmentsTotal != null && payment > 0 ? money(instalmentsTotal * payment) : null,
      leftToPay: 0,
      isPaidOff: true,
      paymentsRemaining: 0,
      projectedPayoffDate: null,
      nextDueDate: null,
      estimatedInterestRemaining: null,
      interestModel,
    };
  }

  const exact = paymentsToClear(remaining, payment, monthlyRate);
  const slack =
    payment > 0 && instalmentsTotal != null
      ? Math.min(0.01, (instalmentsTotal * INSTALMENT_ROUNDING_SLACK) / payment)
      : 0;
  const paymentsRemaining = exact == null ? null : Math.max(1, Math.ceil(exact - slack));
  const paymentDay = account.loan_payment_day;
  const nextDue = paymentDay == null ? null : nextOccurrenceOfMonthDay(paymentDay, today);
  const projectedPayoffDate =
    nextDue && paymentDay != null && paymentsRemaining != null && paymentsRemaining > 0
      ? dayKeyOf(clampDate(nextDue.getFullYear(), nextDue.getMonth() + paymentsRemaining - 1, paymentDay))
      : null;
  const estimatedInterestRemaining =
    hasRate && exact != null ? money(payment * exact - remaining) : null;
  const remainingWithInterest =
    estimatedInterestRemaining == null ? null : money(remaining + estimatedInterestRemaining);
  const instalmentsPaid =
    instalmentsTotal != null && paymentsRemaining != null
      ? Math.min(instalmentsTotal, Math.max(0, instalmentsTotal - paymentsRemaining))
      : null;
  const paidSoFar = instalmentsPaid != null && payment > 0 ? money(instalmentsPaid * payment) : null;
  const leftToPay =
    interestModel === "reducing"
      ? (remainingWithInterest ?? remaining)
      : contractTotal != null && paidSoFar != null
        ? Math.max(0, money(contractTotal - paidSoFar))
        : (remainingWithInterest ?? remaining);

  return {
    remaining,
    principal,
    paid,
    progressRatio:
      instalmentsTotal != null && instalmentsPaid != null ? instalmentsPaid / instalmentsTotal : paidRatio,
    instalmentsTotal,
    instalmentsPaid,
    paidSoFar,
    leftToPay,
    isPaidOff: false,
    paymentsRemaining,
    projectedPayoffDate,
    nextDueDate: nextDue ? dayKeyOf(nextDue) : null,
    estimatedInterestRemaining,
    interestModel,
  };
}
