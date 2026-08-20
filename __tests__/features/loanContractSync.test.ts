import {
  computeLoanQuote,
  instalmentForContract,
  rateForInstalment,
  rateForTotalRepayable,
} from '~/features/loans/lib/loanMath';
import { normalizeMoneyAmount, toBalanceInputValue } from '~/utils/formatters';

// The loan editor keeps the interest rate, the total repayable and the monthly
// instalment in step by composing loanMath across three of its exports at once,
// and the payment-losing round-trip lived in that composition rather than in
// any one function. These exercise the composition over the sequences the
// editor produces.
//
// This mirrors AccountEditorSheet's `syncContractFields` rather than calling
// it: the screen cannot be rendered here (node env, native deps mocked), so
// this is coverage of loanMath under the editor's usage, NOT of the editor. A
// change to the screen's own wiring will not fail these.
function sync(state: Record<string, string>, drivenBy: 'rate' | 'total' | 'instalment') {
  const principal = Number(state.principal);
  const term = Number(state.term);
  const next = { ...state };
  if (drivenBy === 'total') {
    const total = Number(state.total);
    const rate = rateForTotalRepayable(principal, total, term);
    if (rate != null) next.rate = String(rate);
    next.instalment = toBalanceInputValue(normalizeMoneyAmount(total / term));
  } else if (drivenBy === 'instalment') {
    const instalment = Number(state.instalment);
    const rate = rateForInstalment(principal, instalment, term);
    if (rate != null) next.rate = String(rate);
    next.total = toBalanceInputValue(normalizeMoneyAmount(instalment * term));
  } else {
    const instalment = instalmentForContract(
      principal,
      state.rate ? Number(state.rate) : null,
      term,
    );
    if (instalment != null) {
      next.instalment = toBalanceInputValue(instalment);
      next.total = toBalanceInputValue(normalizeMoneyAmount(instalment * term));
    }
  }
  return next;
}

const quoteFor = (s: Record<string, string>, paidPeriods = 0) =>
  computeLoanQuote({
    principal: Number(s.principal),
    annualRatePercent: s.rate ? Number(s.rate) : null,
    termMonths: Number(s.term),
    paidPeriods,
    startDate: '2026-09-01',
    instalment: s.instalment ? Number(s.instalment) : null,
  });

it('the reported flow: entering the total gives the payment the bank charges', () => {
  const entered = sync({ principal: '120000', term: '60', total: '133920' }, 'total');
  expect(entered.rate).toBe('4.41');
  expect(entered.instalment).toBe('2232');
  expect(quoteFor(entered)!.instalment).toBe(2232);
});

it('reopening the saved loan and saving again does not move the payment', () => {
  const stored = { principal: 120000, rate: 4.41, term: 60, instalment: 2232 };
  // The load effect: rate from the column, instalment and total from the
  // stored payment, drivenBy 'rate'.
  const reopened = {
    principal: toBalanceInputValue(stored.principal),
    rate: String(stored.rate),
    term: String(stored.term),
    instalment: toBalanceInputValue(stored.instalment),
    total: toBalanceInputValue(normalizeMoneyAmount(stored.instalment * stored.term)),
  };
  expect(reopened.total).toBe('133920');
  expect(quoteFor(reopened)!.instalment).toBe(2232);
});

it('typing the payment directly rewrites the rate and the total under it', () => {
  const typed = sync(
    { principal: '120000', term: '60', rate: '4.5', instalment: '2232' },
    'instalment',
  );
  expect(typed.total).toBe('133920');
  expect(typed.rate).toBe('4.41');
  expect(quoteFor(typed)!.instalment).toBe(2232);
});

it('driving by the rate leaves total exactly the instalment times the term', () => {
  for (const rate of ['0', '3.25', '4.5', '11']) {
    const s = sync({ principal: '100000', term: '72', rate }, 'rate');
    expect(Number(s.total)).toBeCloseTo(Number(s.instalment) * 72, 2);
    expect(quoteFor(s)!.instalment).toBe(Number(s.instalment));
  }
});
