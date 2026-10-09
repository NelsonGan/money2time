import {
  computeLoanProgress,
  computeLoanQuote,
  rateForTotalRepayable,
  totalRepayableForModel,
} from '~/features/loans/lib/loanMath';
import type { LoanInterestModel } from '~/types';

/**
 * A loan set up with instalments already behind it has to read the same way
 * the moment it is saved as it did on the form that created it.
 *
 * The create form is told how many instalments are paid and turns that into an
 * opening balance; every later screen turns that balance back into a count.
 * The two used to disagree by a whole instalment, because the round trip ran
 * out through `computeLoanQuote`, which solves the rate from the agreement's
 * own total, and back in through `computeLoanProgress`, which read the two
 * decimals `loan_interest_rate` can hold. A borrower who entered twelve
 * payments was shown eleven, and paid so far, left to pay, payments left and
 * the payoff date were all one instalment out.
 */
interface Contract {
  principal: number;
  ratePercent: number;
  termMonths: number;
  paidPeriods: number;
  model: LoanInterestModel;
}

const CONTRACTS: Contract[] = [
  // The reported case: a Malaysian flat rate personal loan.
  { principal: 120000, ratePercent: 2.32, termMonths: 60, paidPeriods: 12, model: 'flat' },
  { principal: 49000, ratePercent: 3.15, termMonths: 108, paidPeriods: 30, model: 'flat' },
  { principal: 5000, ratePercent: 12, termMonths: 12, paidPeriods: 1, model: 'flat' },
  // Interest free, where the level payment does not divide into whole cents.
  { principal: 20000, ratePercent: 0, termMonths: 24, paidPeriods: 5, model: 'flat' },
  { principal: 300000, ratePercent: 4.37, termMonths: 360, paidPeriods: 24, model: 'reducing' },
  { principal: 250000, ratePercent: 3.85, termMonths: 300, paidPeriods: 36, model: 'reducing' },
  { principal: 45000, ratePercent: 5.5, termMonths: 84, paidPeriods: 6, model: 'reducing' },
  { principal: 900000, ratePercent: 4.05, termMonths: 420, paidPeriods: 60, model: 'reducing' },
  { principal: 1000000, ratePercent: 6.75, termMonths: 480, paidPeriods: 1, model: 'reducing' },
  // Nothing paid yet: the count must not drift the other way either.
  { principal: 60000, ratePercent: 3.5, termMonths: 72, paidPeriods: 0, model: 'flat' },
];

/** The account row the create form writes, and the form's own quote. */
function save({ principal, ratePercent, termMonths, paidPeriods, model }: Contract) {
  const totalRepayable = totalRepayableForModel(model, principal, ratePercent, termMonths)!;
  const quote = computeLoanQuote({
    principal,
    annualRatePercent: null,
    termMonths,
    paidPeriods,
    startDate: '2020-01-01',
    totalRepayable,
    instalment: totalRepayable / termMonths,
  })!;
  return {
    quote,
    stored: {
      startingBalance: quote.openingBalance,
      loanMonthlyPayment: quote.instalment,
      loanTotalRepayable: quote.totalRepayable,
      // What the editor stores: the effective rate, to the two decimals its
      // field shows.
      loanInterestRate: rateForTotalRepayable(principal, totalRepayable, termMonths),
    },
  };
}

function reopen(contract: Contract) {
  const { quote, stored } = save(contract);
  const progress = computeLoanProgress({
    balance: stored.startingBalance,
    originalPrincipal: contract.principal,
    monthlyPayment: stored.loanMonthlyPayment,
    paymentDay: 1,
    annualRatePercent: stored.loanInterestRate,
    interestModel: contract.model,
    termMonths: contract.termMonths,
    totalRepayable: stored.loanTotalRepayable,
    startDate: '2020-01-01',
    todayIso: '2026-01-01',
  });
  return { quote, stored, progress };
}

describe('a saved loan reads the same as the form that created it', () => {
  it.each(CONTRACTS)(
    '$model $principal at $ratePercent% over $termMonths months, $paidPeriods paid',
    (contract) => {
      const { quote, progress } = reopen(contract);

      expect(progress.instalmentsPaid).toBe(contract.paidPeriods);
      expect(progress.paymentsRemaining).toBe(contract.termMonths - contract.paidPeriods);
      expect(progress.instalmentsTotal).toBe(contract.termMonths);
      expect(progress.paidSoFar).toBeCloseTo(contract.paidPeriods * quote.instalment, 2);
      if (contract.model === 'flat') {
        // The borrower's own arithmetic: what the agreement costs, less what
        // they have handed over.
        expect(progress.leftToPay).toBeCloseTo(quote.leftToPay, 2);
      }
    },
  );
});

describe('the count still moves with the balance', () => {
  const contract = CONTRACTS[0]!;

  it('reports fewer instalments left once a lump sum goes in', () => {
    const { stored } = save(contract);
    const ahead = computeLoanProgress({
      balance: stored.startingBalance - 4 * stored.loanMonthlyPayment,
      originalPrincipal: contract.principal,
      monthlyPayment: stored.loanMonthlyPayment,
      paymentDay: 1,
      annualRatePercent: stored.loanInterestRate,
      interestModel: contract.model,
      termMonths: contract.termMonths,
      totalRepayable: stored.loanTotalRepayable,
      startDate: '2020-01-01',
      todayIso: '2026-01-01',
    });
    expect(ahead.instalmentsPaid).toBeGreaterThan(contract.paidPeriods);
    expect(ahead.paymentsRemaining).toBeLessThan(contract.termMonths - contract.paidPeriods);
  });

  it('counts a genuine part payment as a whole one still to make', () => {
    // Half an instalment short of a clean 48 is 49 payments, not 48: the
    // tolerance only absorbs the schedule's own rounding.
    const { stored } = save(contract);
    const short = computeLoanProgress({
      balance: stored.startingBalance + stored.loanMonthlyPayment / 2,
      originalPrincipal: contract.principal,
      monthlyPayment: stored.loanMonthlyPayment,
      paymentDay: 1,
      annualRatePercent: stored.loanInterestRate,
      interestModel: contract.model,
      termMonths: contract.termMonths,
      totalRepayable: stored.loanTotalRepayable,
      startDate: '2020-01-01',
      todayIso: '2026-01-01',
    });
    expect(short.paymentsRemaining).toBe(contract.termMonths - contract.paidPeriods + 1);
  });

  it('still owes one payment on a balance smaller than the rounding tolerance', () => {
    const { stored } = save(contract);
    const crumbs = computeLoanProgress({
      balance: 0.2,
      originalPrincipal: contract.principal,
      monthlyPayment: stored.loanMonthlyPayment,
      paymentDay: 1,
      annualRatePercent: stored.loanInterestRate,
      interestModel: contract.model,
      termMonths: contract.termMonths,
      totalRepayable: stored.loanTotalRepayable,
      startDate: '2020-01-01',
      todayIso: '2026-01-01',
    });
    expect(crumbs.isPaidOff).toBe(false);
    expect(crumbs.paymentsRemaining).toBe(1);
  });

  it('reports a settled loan as fully paid', () => {
    const { stored } = save(contract);
    const done = computeLoanProgress({
      balance: 0,
      originalPrincipal: contract.principal,
      monthlyPayment: stored.loanMonthlyPayment,
      paymentDay: 1,
      annualRatePercent: stored.loanInterestRate,
      interestModel: contract.model,
      termMonths: contract.termMonths,
      totalRepayable: stored.loanTotalRepayable,
      startDate: '2020-01-01',
      todayIso: '2026-01-01',
    });
    expect(done.isPaidOff).toBe(true);
    expect(done.paymentsRemaining).toBe(0);
    expect(done.leftToPay).toBe(0);
  });
});
