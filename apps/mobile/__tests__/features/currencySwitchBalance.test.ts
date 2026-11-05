import { balanceChangeWithCurrencySwitch } from '~/features/settings/lib/currencySwitchBalance';
import type { RateTable } from '~/types';

// 1 USD = 4.5 MYR = 36 THB, so 1 MYR = 8 THB.
const rateTable: RateTable = {
  base: 'USD',
  rates: { USD: 1, MYR: 4.5, THB: 36 },
  asOfDate: '2026-11-05',
};

const base = {
  currentBalance: 100,
  fromCurrency: 'MYR',
  toCurrency: 'THB',
  rateTable,
};

describe('balanceChangeWithCurrencySwitch', () => {
  it('records the typed balance on top of the conversion (the reported bug)', () => {
    // RM 100 converts to ฿800; the user then typed ฿100, so the balance has to
    // drop by ฿700 after the history is re-denominated.
    expect(
      balanceChangeWithCurrencySwitch({ ...base, balanceEdited: true, typedBalance: 100 }),
    ).toBeCloseTo(-700);
  });

  it('records a typed increase as a positive change', () => {
    expect(
      balanceChangeWithCurrencySwitch({ ...base, balanceEdited: true, typedBalance: 1000 }),
    ).toBeCloseTo(200);
  });

  it('leaves a plain currency switch alone when the balance was never typed in', () => {
    expect(
      balanceChangeWithCurrencySwitch({ ...base, balanceEdited: false, typedBalance: 800 }),
    ).toBeNull();
    // Even when a chained switch (MYR -> USD -> THB) rounded the preview away
    // from a direct conversion: the user did not ask for a different balance.
    expect(
      balanceChangeWithCurrencySwitch({ ...base, balanceEdited: false, typedBalance: 812.5 }),
    ).toBeNull();
  });

  it('treats the rounded preview as no change when the field was touched but left at it', () => {
    // RM 33.33 is ฿266.64 exactly; ฿266.64 typed back is not an adjustment,
    // nor is the cent-rounded value of an odd conversion.
    expect(
      balanceChangeWithCurrencySwitch({
        ...base,
        currentBalance: 33.33,
        balanceEdited: true,
        typedBalance: 266.64,
      }),
    ).toBeNull();
    const oddRates: RateTable = { ...rateTable, rates: { USD: 1, MYR: 3, THB: 7 } };
    // RM 10 is ฿23.3333…, shown as ฿23.33.
    expect(
      balanceChangeWithCurrencySwitch({
        ...base,
        rateTable: oddRates,
        currentBalance: 10,
        balanceEdited: true,
        typedBalance: 23.33,
      }),
    ).toBeNull();
  });

  it('ignores a balance that is not a number', () => {
    expect(
      balanceChangeWithCurrencySwitch({ ...base, balanceEdited: true, typedBalance: Number.NaN }),
    ).toBeNull();
  });
});
