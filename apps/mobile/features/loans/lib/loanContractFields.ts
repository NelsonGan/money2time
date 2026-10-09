import { rateForModel, totalRepayableForModel } from '~/features/loans/lib/loanMath';
import type { LoanInterestModel } from '~/types';
import { toBalanceInputValue } from '~/utils/formatters';

/** Which of the two the borrower is typing; the other one follows it. */
export type LoanContractDriver = 'rate' | 'total';

export interface LoanContractFieldsInput {
  /** How the contract charges interest; the two directions differ per model. */
  model: LoanInterestModel;
  /** Amount borrowed, as typed. */
  principal: number;
  /** Contract length in months, as typed. */
  termMonths: number;
  /** Which field the borrower touched last. */
  driver: LoanContractDriver;
  /** The rate field's raw text; only read while it is the driver. */
  rateInput: string;
  /** The total field's raw text; only read while it is the driver. */
  totalInput: string;
}

export interface LoanContractFields {
  /** What the rate field shows. */
  rate: string;
  /** What the total repayable field shows. */
  total: string;
}

/**
 * What the loan editor's rate and total repayable fields show.
 *
 * The two are the same fact stated twice: given the amount and the term, each
 * fixes the other exactly. Both have to be typeable, because a borrower may
 * have either one in front of them, so whichever was touched last is the input
 * and the other is **derived**.
 *
 * Derived *during render*, deliberately, rather than mirrored into state by an
 * effect. Mirroring them is what cost a saved loan its contract: the effect
 * that loads the account and the effect that kept the two fields in step both
 * run in the same commit, so the sync read the state from *before* the load
 * and queued its answer after it, blanking the total it had just been handed.
 * A 2.32% flat loan reopened with an empty rate and an empty total, and saving
 * from there wrote back a contract with no interest in it at all. Deriving
 * leaves nothing to race: the field is a function of the state, not a copy of
 * it that has to catch up.
 */
export function resolveLoanContractFields({
  model,
  principal,
  termMonths,
  driver,
  rateInput,
  totalInput,
}: LoanContractFieldsInput): LoanContractFields {
  if (driver === 'rate') {
    const typedRate = rateInput.trim();
    const parsedRate = typedRate.length > 0 ? Number(typedRate) : NaN;
    const total = totalRepayableForModel(
      model,
      principal,
      Number.isFinite(parsedRate) ? parsedRate : null,
      termMonths,
    );
    return { rate: rateInput, total: total == null ? '' : toBalanceInputValue(total) };
  }

  const typedTotal = totalInput.trim();
  const parsedTotal = typedTotal.length > 0 ? Number(typedTotal) : NaN;
  const rate = Number.isFinite(parsedTotal)
    ? rateForModel(model, principal, parsedTotal, termMonths)
    : null;
  return { rate: rate == null ? '' : String(rate), total: totalInput };
}
