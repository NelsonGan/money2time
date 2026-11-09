/**
 * The contract maths the app's loan editor runs while the form is typed
 * (features/loans/lib/loanMath.ts and loanContractFields.ts in the app):
 * the rate and the total repayable as two views of one number, the monthly
 * instalment they imply, and the quote shown under the form. Ported line for
 * line so the web previews what the phone will save; the phone works the
 * contract out again from the same form on Save.
 */
import { addMonthsToDayKey } from "@/lib/backup/dates";
import { loanAccrualRatePercent, loanLedgerAnchor, money } from "@/lib/backup/loans";
import type { AccountRow } from "@/lib/backup/types";

export type LoanModel = "reducing" | "flat";

export const MAX_LOAN_TERM_MONTHS = 480;
const MAX_MONTHLY_RATE = 1;
const INSTALMENT_ROUNDING_SLACK = 0.01;

function isUsableContract(principal: number, termMonths: number): boolean {
  return Number.isFinite(principal) && principal > 0 && Number.isInteger(termMonths) && termMonths > 0 && termMonths <= MAX_LOAN_TERM_MONTHS;
}

function instalmentFor(principal: number, monthlyRate: number, termMonths: number): number {
  if (monthlyRate <= 0) return principal / termMonths;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
}

function monthlyRateFrom(annual: number | null): number {
  if (annual == null || !Number.isFinite(annual) || annual <= 0) return 0;
  return annual / 100 / 12;
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

function scheduledBalanceAfter(principal: number, monthlyRate: number, termMonths: number, elapsed: number): number {
  if (elapsed >= termMonths) return 0;
  if (elapsed <= 0) return principal;
  if (monthlyRate <= 0) return (principal * (termMonths - elapsed)) / termMonths;
  const growth = Math.pow(1 + monthlyRate, termMonths);
  return (principal * (growth - Math.pow(1 + monthlyRate, elapsed))) / (growth - 1);
}

/** The app's `toBalanceInputValue`: cents, never "-0". */
export function inputValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function totalRepayableForFlatRate(principal: number, rate: number | null, termMonths: number): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  return money(principal + (principal * (rate / 100) * termMonths) / 12);
}

function flatRateForTotalRepayable(principal: number, total: number, termMonths: number): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  if (!Number.isFinite(total) || total < principal) return null;
  return Math.round(((total - principal) / principal) * (12 / termMonths) * 100 * 100) / 100;
}

function instalmentForContract(principal: number, rate: number | null, termMonths: number): number | null {
  if (!isUsableContract(principal, termMonths)) return null;
  return money(instalmentFor(principal, monthlyRateFrom(rate), termMonths));
}

export function totalRepayableFor(principal: number, rate: number | null, termMonths: number): number | null {
  const instalment = instalmentForContract(principal, rate, termMonths);
  return instalment == null ? null : money(instalment * termMonths);
}

/** The effective annual rate a total repayable implies, two decimals. */
export function rateForTotalRepayable(principal: number, total: number, termMonths: number): number | null {
  const monthly = monthlyRateForInstalment(principal, total / termMonths, termMonths);
  return monthly == null ? null : Math.round(monthly * 1200 * 100) / 100;
}

function totalRepayableForModel(model: LoanModel, principal: number, rate: number | null, termMonths: number): number | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  return model === "reducing" ? totalRepayableFor(principal, rate, termMonths) : totalRepayableForFlatRate(principal, rate, termMonths);
}

function rateForModel(model: LoanModel, principal: number, total: number, termMonths: number): number | null {
  if (!Number.isFinite(total) || total < principal - termMonths * INSTALMENT_ROUNDING_SLACK) return null;
  return model === "reducing" ? rateForTotalRepayable(principal, total, termMonths) : flatRateForTotalRepayable(principal, total, termMonths);
}

/** What the rate and total fields show: the one typed last drives, the other follows. */
export function contractFields(input: { model: LoanModel; principal: number; termMonths: number; driver: "rate" | "total"; rate: number | null; total: number | null }): {
  rate: number | null;
  total: number | null;
} {
  if (input.driver === "rate") {
    return { rate: input.rate, total: totalRepayableForModel(input.model, input.principal, input.rate, input.termMonths) };
  }
  return { rate: input.total == null ? null : rateForModel(input.model, input.principal, input.total, input.termMonths), total: input.total };
}

type LoanQuote = {
  instalment: number;
  totalRepayable: number;
  openingBalance: number;
  totalInterest: number;
  leftToPay: number;
  remainingPeriods: number;
  paymentDay: number;
  payoffDate: string;
  firstInstalmentDate: string;
};

/** The app's `computeLoanQuote`. Null when the contract cannot produce one. */
export function computeLoanQuote(input: {
  principal: number;
  termMonths: number;
  paidPeriods: number;
  startDate: string;
  totalRepayable: number | null;
  instalment: number | null;
}): LoanQuote | null {
  const { principal, termMonths, paidPeriods } = input;
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > MAX_LOAN_TERM_MONTHS) return null;
  if (!Number.isInteger(paidPeriods) || paidPeriods < 0 || paidPeriods >= termMonths) return null;
  const typed = input.instalment != null && Number.isFinite(input.instalment) && input.instalment > 0 ? money(input.instalment) : null;
  const total =
    input.totalRepayable != null && Number.isFinite(input.totalRepayable) && input.totalRepayable > 0 ? money(input.totalRepayable) : typed != null ? money(typed * termMonths) : null;
  if (total != null && total < principal - termMonths * INSTALMENT_ROUNDING_SLACK) return null;
  const level = total == null ? null : total / termMonths;
  const r = level != null ? monthlyRateForInstalment(principal, level, termMonths) : 0;
  if (r == null) return null;
  const instalment = typed ?? money(level ?? instalmentFor(principal, r, termMonths));
  const whole = total ?? instalment * termMonths;
  const day = Number(input.startDate.slice(8, 10));
  return {
    instalment,
    totalRepayable: money(whole),
    openingBalance: money(scheduledBalanceAfter(principal, r, termMonths, paidPeriods)),
    totalInterest: Math.max(0, money(whole - principal)),
    leftToPay: Math.max(0, money(whole - instalment * paidPeriods)),
    remainingPeriods: termMonths - paidPeriods,
    paymentDay: day,
    payoffDate: addMonthsToDayKey(input.startDate, termMonths),
    firstInstalmentDate: addMonthsToDayKey(input.startDate, paidPeriods + 1),
  };
}

/**
 * Whether the app's editor would ask "When does the new rate apply?" for this
 * save: a reducing balance loan, staying one, whose rate moves after its
 * interest walk has started. The rates are the ones the phone compares.
 */
export function pendingRateChange(
  row: AccountRow,
  next: { model: LoanModel; principal: number | null; totalRepayable: number | null; termMonths: number | null; rate: number | null },
  today: string,
): { from: number; to: number } | null {
  if (row.type !== "loan" || row.loan_interest_model !== "reducing" || next.model !== "reducing") return null;
  const from = loanAccrualRatePercent(row) ?? 0;
  const to =
    loanAccrualRatePercent({
      ...row,
      loan_original_principal: next.principal,
      loan_total_repayable: next.totalRepayable,
      loan_term_months: next.termMonths,
      loan_interest_rate: next.rate,
    }) ?? 0;
  if (Math.abs(from - to) < 0.000001) return null;
  if (loanLedgerAnchor(row, today) >= today) return null;
  return { from, to };
}

