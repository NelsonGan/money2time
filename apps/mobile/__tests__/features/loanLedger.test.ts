import {
  accrueReducingBalance,
  computeLoanProgress,
  computeLoanQuote,
  contractMonthlyRate,
  loanAccrualRatePercent,
  loanAccruesInterest,
  loanLedgerAnchor,
  type LoanLedgerMovement,
  loanRateChangesOf,
  rateForTotalRepayable,
  totalRepayableForFlatRate,
} from '~/features/loans/lib/loanMath';
import { normalizeMoneyAmount } from '~/utils/formatters';

/** `count` monthly day keys starting one month after `start`. */
function monthlyDayKeys(start: string, count: number): string[] {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const keys: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const date = new Date(y, m - 1 + i, d);
    keys.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`,
    );
  }
  return keys;
}

/**
 * A flat rate loan walked forward the way the balance query now walks it.
 *
 * A flat contract's instalment carries interest too: 115,000 over 60 months on
 * 100,000 borrowed is 1,916.67 a month, of which only part retires principal.
 * The app used to knock the whole instalment off the balance, so after twelve
 * on-schedule payments the card said fifteen of sixty were paid, and the loan
 * read as settled with seven instalments still to go. Walking it at the
 * effective rate the total implies lands on the contract's own schedule.
 */
describe('a flat rate loan, end to end', () => {
  const PRINCIPAL = 100000;
  const TERM = 60;
  const FLAT_RATE = 3;
  const START = '2026-01-15';
  const TOTAL = totalRepayableForFlatRate(PRINCIPAL, FLAT_RATE, TERM)!;
  const quote = computeLoanQuote({
    principal: PRINCIPAL,
    annualRatePercent: null,
    termMonths: TERM,
    paidPeriods: 0,
    startDate: START,
    totalRepayable: TOTAL,
  })!;
  const INSTALMENT = quote.instalment;
  const DATES = monthlyDayKeys(START, TERM);
  // The row the editor stores: the two-decimal effective rate and the total.
  const stored = {
    loanOriginalPrincipal: PRINCIPAL,
    loanTotalRepayable: quote.totalRepayable,
    loanTermMonths: TERM,
    loanInterestRate: rateForTotalRepayable(PRINCIPAL, TOTAL, TERM),
  };

  function after(months: number) {
    const movements: LoanLedgerMovement[] = DATES.slice(0, months).map((date) => ({
      date,
      delta: -INSTALMENT,
    }));
    const todayIso = months === 0 ? START : DATES[months - 1]!;
    const ledger = accrueReducingBalance({
      openingBalance: PRINCIPAL,
      anchorDate: START,
      annualRatePercent: loanAccrualRatePercent(stored),
      movements,
      todayIso,
    });
    const progress = computeLoanProgress({
      balance: ledger.balance,
      originalPrincipal: PRINCIPAL,
      monthlyPayment: INSTALMENT,
      paymentDay: 15,
      annualRatePercent: stored.loanInterestRate,
      termMonths: TERM,
      totalRepayable: quote.totalRepayable,
      interestModel: 'flat',
      startDate: START,
      todayIso,
    });
    return { ledger, progress };
  }

  it('quotes the contract the borrower signed', () => {
    expect(TOTAL).toBe(115000);
    expect(INSTALMENT).toBe(1916.67);
    // 3% flat is 5.64% on the reducing balance, which is the rate stored and
    // the rate the debt is walked at.
    expect(stored.loanInterestRate).toBe(5.64);
    expect(loanAccrualRatePercent(stored)!).toBeCloseTo(5.6418, 3);
  });

  it.each([1, 6, 12, 24, 36, 48, 59])(
    'reads %i instalments paid after %i on-schedule payments',
    (paid) => {
      const { progress } = after(paid);
      expect(progress.instalmentsPaid).toBe(paid);
      expect(progress.paymentsRemaining).toBe(TERM - paid);
      expect(progress.paidSoFar).toBeCloseTo(paid * INSTALMENT, 2);
      // The borrower's own arithmetic, off the agreement's total.
      expect(progress.leftToPay).toBeCloseTo(TOTAL - paid * INSTALMENT, 1);
      expect(progress.isPaidOff).toBe(false);
    },
  );

  it('keeps the balance owed on the amortized schedule', () => {
    // After a year the principal has come down by far less than 12 x 1,916.67:
    // much of the early instalments is interest, on a flat loan as on any
    // other, and the balance sits where the annuity says it should.
    const { ledger } = after(12);
    const r = contractMonthlyRate(PRINCIPAL, TOTAL, TERM)!;
    const growth = (1 + r) ** TERM;
    const scheduled = (PRINCIPAL * (growth - (1 + r) ** 12)) / (growth - 1);
    expect(PRINCIPAL - ledger.balance).toBeLessThan(12 * INSTALMENT);
    expect(ledger.balance).toBeCloseTo(scheduled, 0);
  });

  it('is still owed with seven instalments to go, where the plain sum read settled', () => {
    const { progress } = after(53);
    expect(progress.isPaidOff).toBe(false);
    expect(progress.paymentsRemaining).toBe(7);
    // The bug this pins: 53 whole instalments exceed the principal.
    expect(PRINCIPAL - 53 * INSTALMENT).toBeLessThan(0);
  });

  it('settles on the final instalment', () => {
    const { ledger, progress } = after(TERM);
    expect(Math.abs(ledger.balance)).toBeLessThan(1);
    expect(progress.isPaidOff).toBe(true);
    expect(progress.leftToPay).toBe(0);
  });

  it('reports no interest saved, since a flat contract fixes its cost at signing', () => {
    expect(after(12).progress.interestSaved).toBeNull();
  });
});

describe('accrueReducingBalance: rate changes', () => {
  const base = {
    openingBalance: 100000,
    anchorDate: '2026-01-01',
    movements: [] as LoanLedgerMovement[],
    // Five rests: Feb, Mar, Apr, May, Jun.
    todayIso: '2026-06-01',
  };

  it('charges each rest at the rate in force on that day', () => {
    const ledger = accrueReducingBalance({
      ...base,
      annualRatePercent: 24,
      rateChanges: [
        { from: '2026-01-01', annualRatePercent: 12 },
        { from: '2026-04-01', annualRatePercent: 24 },
      ],
    });
    // Two rests at 1% a month, then three at 2%.
    expect(ledger.balance).toBeCloseTo(100000 * 1.01 ** 2 * 1.02 ** 3, 0);
    expect(ledger.interestCharged).toBeCloseTo(ledger.balance - 100000, 0);
  });

  it('applies a change dated on a rest day to that rest', () => {
    const changed = accrueReducingBalance({
      ...base,
      annualRatePercent: 12,
      rateChanges: [
        { from: '2026-01-01', annualRatePercent: 12 },
        { from: '2026-03-01', annualRatePercent: 24 },
      ],
    });
    expect(changed.balance).toBeCloseTo(100000 * 1.01 * 1.02 ** 4, 0);
  });

  it('charges the earliest recorded rate before its own start date', () => {
    // A history whose first entry is dated after the anchor: the rate before
    // it is unknown, and the earliest one on record is the best answer.
    const ledger = accrueReducingBalance({
      ...base,
      annualRatePercent: 12,
      rateChanges: [{ from: '2026-04-01', annualRatePercent: 24 }],
    });
    expect(ledger.balance).toBeCloseTo(100000 * 1.02 ** 5, 0);
  });

  it('ignores the base rate once a history exists', () => {
    const withHistory = accrueReducingBalance({
      ...base,
      annualRatePercent: 99,
      rateChanges: [{ from: '2026-01-01', annualRatePercent: 12 }],
    });
    const plain = accrueReducingBalance({ ...base, annualRatePercent: 12 });
    expect(withHistory.balance).toBe(plain.balance);
  });

  it('accrues from a change even when the base rate is zero', () => {
    const ledger = accrueReducingBalance({
      ...base,
      annualRatePercent: 0,
      rateChanges: [{ from: '2026-04-01', annualRatePercent: 12 }],
    });
    expect(ledger.interestCharged).toBeGreaterThan(0);
  });

  it('falls back to the plain sum when neither the base nor a change carries a rate', () => {
    const ledger = accrueReducingBalance({
      ...base,
      annualRatePercent: 0,
      rateChanges: [{ from: '2026-03-01', annualRatePercent: 0 }],
      movements: [{ date: '2026-02-10', delta: -500 }],
    });
    expect(ledger).toEqual({ balance: 99500, interestCharged: 0 });
  });

  it('leaves the interest already charged alone when a new rate starts today', () => {
    // The point of the history: a rate change recorded today must not touch a
    // single rest before it.
    const before = accrueReducingBalance({ ...base, annualRatePercent: 12 });
    const after = accrueReducingBalance({
      ...base,
      annualRatePercent: 15,
      rateChanges: [
        { from: '2026-01-01', annualRatePercent: 12 },
        { from: '2026-06-02', annualRatePercent: 15 },
      ],
    });
    expect(after.balance).toBe(before.balance);
  });
});

describe('loanRateChangesOf', () => {
  it('sorts the changes oldest first', () => {
    const changes = loanRateChangesOf({
      loanRateChanges: [
        { from: '2027-01-01', annualRatePercent: 5 },
        { from: '2026-01-01', annualRatePercent: 4 },
      ],
    });
    expect(changes.map((c) => c.from)).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('drops anything a hand-edited backup could have left malformed', () => {
    const changes = loanRateChangesOf({
      loanRateChanges: [
        { from: 'yesterday', annualRatePercent: 5 },
        { from: '2026-01-01', annualRatePercent: Number.NaN },
        { from: '2026-01-01', annualRatePercent: -1 },
        null as unknown as { from: string; annualRatePercent: number },
        { from: '2026-02-01', annualRatePercent: 4.5 },
      ],
    });
    expect(changes).toEqual([{ from: '2026-02-01', annualRatePercent: 4.5 }]);
  });

  it('is empty for a loan with no history', () => {
    expect(loanRateChangesOf({ loanRateChanges: null })).toEqual([]);
    expect(loanRateChangesOf(null)).toEqual([]);
  });
});

describe('loanLedgerAnchor', () => {
  const TODAY = '2026-09-02';

  it('prefers the recorded anchor', () => {
    expect(
      loanLedgerAnchor(
        { loanLedgerAnchorDate: '2026-08-15', createdAt: '2026-09-01T10:00:00.000Z' },
        TODAY,
      ),
    ).toBe('2026-08-15');
  });

  it('falls back to the day the loan was created, as older loans always did', () => {
    expect(
      loanLedgerAnchor(
        { loanLedgerAnchorDate: null, createdAt: '2026-09-01T10:00:00.000Z' },
        TODAY,
      ),
    ).toBe('2026-09-01');
  });

  it('then to the start date, then to today', () => {
    expect(loanLedgerAnchor({ loanStartDate: '2026-03-01' }, TODAY)).toBe('2026-03-01');
    expect(loanLedgerAnchor({}, TODAY)).toBe(TODAY);
  });

  it('ignores an anchor that is not a date', () => {
    expect(loanLedgerAnchor({ loanLedgerAnchorDate: 'soon', createdAt: '2026-09-01' }, TODAY)).toBe(
      '2026-09-01',
    );
  });
});

describe('the rate a loan is walked at', () => {
  it('is solved from the agreement, not read from the two-decimal column', () => {
    // 120,000 over 60 months repaying 133,920 is 4.4053%, stored as 4.41.
    const account = {
      loanOriginalPrincipal: 120000,
      loanTotalRepayable: 133920,
      loanTermMonths: 60,
      loanInterestRate: 4.41,
    };
    expect(loanAccrualRatePercent(account)!).toBeCloseTo(4.4053, 3);
    expect(contractMonthlyRate(120000, 133920, 60)! * 1200).toBeCloseTo(4.4053, 3);
  });

  it('falls back to the stored rate on a loan saved without a total', () => {
    expect(loanAccrualRatePercent({ loanOriginalPrincipal: 1000, loanInterestRate: 6.5 })).toBe(
      6.5,
    );
  });

  it('is null on an interest-free or unmodelled loan', () => {
    expect(loanAccrualRatePercent({ loanInterestRate: null })).toBeNull();
    expect(loanAccrualRatePercent({ loanInterestRate: 0 })).toBeNull();
    expect(
      loanAccrualRatePercent({
        loanOriginalPrincipal: 1000,
        loanTotalRepayable: 1000,
        loanTermMonths: 10,
        loanInterestRate: 0,
      }),
    ).toBeNull();
  });

  it('is the same rate for a flat contract as its effective one', () => {
    const total = totalRepayableForFlatRate(100000, 3, 60)!;
    const account = {
      loanOriginalPrincipal: 100000,
      loanTotalRepayable: total,
      loanTermMonths: 60,
      loanInterestRate: rateForTotalRepayable(100000, total, 60),
    };
    expect(loanAccrualRatePercent(account)!).toBeCloseTo(5.6418, 3);
  });

  it('counts a loan whose only rate is in its history as accruing', () => {
    expect(loanAccruesInterest({ loanInterestRate: null })).toBe(false);
    expect(
      loanAccruesInterest({
        loanInterestRate: null,
        loanRateChanges: [{ from: '2026-01-01', annualRatePercent: 3 }],
      }),
    ).toBe(true);
  });
});

describe('computeLoanQuote: the day the opening balance describes', () => {
  const contract = {
    principal: 49000,
    annualRatePercent: null,
    termMonths: 108,
    startDate: '2024-01-31',
    instalment: 601,
  };

  it('is the start date when nothing has been paid', () => {
    expect(computeLoanQuote({ ...contract, paidPeriods: 0 })!.openingBalanceDate).toBe(
      '2024-01-31',
    );
  });

  it('is the date of the last instalment already paid', () => {
    const quote = computeLoanQuote({ ...contract, paidPeriods: 31 })!;
    expect(quote.openingBalanceDate).toBe('2026-08-31');
    // The next instalment follows it by a month, so the walk's first rest
    // lands exactly where the lender's does.
    expect(quote.firstInstalmentDate).toBe('2026-09-30');
  });

  it('clamps into a short month like the rest of the schedule', () => {
    expect(computeLoanQuote({ ...contract, paidPeriods: 1 })!.openingBalanceDate).toBe(
      '2024-02-29',
    );
  });

  it('places a mid-term opening balance on its own schedule', () => {
    // Walking from that date at the contract rate reproduces the quote's own
    // balance one instalment later, which is what anchoring there buys.
    const quote = computeLoanQuote({ ...contract, paidPeriods: 31 })!;
    const next = computeLoanQuote({ ...contract, paidPeriods: 32 })!;
    const ledger = accrueReducingBalance({
      openingBalance: quote.openingBalance,
      anchorDate: quote.openingBalanceDate,
      annualRatePercent: contractMonthlyRate(49000, quote.totalRepayable, 108)! * 1200,
      movements: [{ date: quote.firstInstalmentDate, delta: -601 }],
      todayIso: quote.firstInstalmentDate,
    });
    expect(ledger.balance).toBeCloseTo(normalizeMoneyAmount(next.openingBalance), 0);
  });
});
