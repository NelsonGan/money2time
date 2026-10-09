import { resolveLoanContractFields } from '~/features/loans/lib/loanContractFields';

/**
 * The rate and the total repayable are one fact stated twice. These cover the
 * resolver the loan editor renders them through, and in particular the shape
 * of the bug that made it: a saved contract must survive being reopened, which
 * it did not while the follower was mirrored into state by an effect.
 */
const contract = {
  model: 'flat' as const,
  principal: 120000,
  termMonths: 60,
};

describe('resolveLoanContractFields: reopening a saved loan', () => {
  it('shows the stored total and reads the rate back off it', () => {
    // How the editor seeds an existing loan: the total leads, the rate is not
    // seeded at all.
    const fields = resolveLoanContractFields({
      ...contract,
      driver: 'total',
      rateInput: '',
      totalInput: '133920',
    });
    expect(fields.total).toBe('133920');
    expect(fields.rate).toBe('2.32');
  });

  it('cannot be blanked by a rate left over from another loan', () => {
    // The rate field is not the driver here, so whatever it holds is ignored
    // rather than allowed to redefine the contract.
    const fields = resolveLoanContractFields({
      ...contract,
      driver: 'total',
      rateInput: '9.99',
      totalInput: '133920',
    });
    expect(fields.total).toBe('133920');
    expect(fields.rate).toBe('2.32');
  });

  it('reads the same contract as a reducing balance one at its own rate', () => {
    const fields = resolveLoanContractFields({
      ...contract,
      model: 'reducing',
      driver: 'total',
      rateInput: '',
      totalInput: '133920',
    });
    expect(fields.total).toBe('133920');
    expect(fields.rate).toBe('4.41');
  });
});

describe('resolveLoanContractFields: typing', () => {
  it('derives the total from a flat rate', () => {
    const fields = resolveLoanContractFields({
      ...contract,
      driver: 'rate',
      rateInput: '2.32',
      totalInput: '',
    });
    expect(fields.rate).toBe('2.32');
    expect(fields.total).toBe('133920');
  });

  it('derives a different total from the same rate on a reducing contract', () => {
    const flat = resolveLoanContractFields({
      ...contract,
      driver: 'rate',
      rateInput: '2.32',
      totalInput: '',
    });
    const reducing = resolveLoanContractFields({
      ...contract,
      model: 'reducing',
      driver: 'rate',
      rateInput: '2.32',
      totalInput: '',
    });
    expect(Number(reducing.total)).toBeLessThan(Number(flat.total));
    expect(Number(reducing.total)).toBeGreaterThan(contract.principal);
  });

  it('leaves the typed field exactly as typed while it drives', () => {
    // Half-typed decimals must not be rewritten under the cursor.
    expect(
      resolveLoanContractFields({ ...contract, driver: 'rate', rateInput: '2.', totalInput: '' })
        .rate,
    ).toBe('2.');
    expect(
      resolveLoanContractFields({
        ...contract,
        driver: 'total',
        rateInput: '',
        totalInput: '133920.',
      }).total,
    ).toBe('133920.');
  });

  it('round trips: a derived total handed back as the driver gives the rate again', () => {
    const typed = resolveLoanContractFields({
      ...contract,
      driver: 'rate',
      rateInput: '2.32',
      totalInput: '',
    });
    const reopened = resolveLoanContractFields({
      ...contract,
      driver: 'total',
      rateInput: '',
      totalInput: typed.total,
    });
    expect(reopened.rate).toBe('2.32');
  });

  it('follows a 0% contract to the principal rather than reading it as unset', () => {
    const fields = resolveLoanContractFields({
      ...contract,
      driver: 'rate',
      rateInput: '0',
      totalInput: '',
    });
    expect(fields.total).toBe('120000');
  });
});

describe('resolveLoanContractFields: incomplete forms', () => {
  it('empties the follower rather than offering an interest-free loan', () => {
    expect(
      resolveLoanContractFields({ ...contract, driver: 'rate', rateInput: '', totalInput: '' })
        .total,
    ).toBe('');
    expect(
      resolveLoanContractFields({ ...contract, driver: 'total', rateInput: '', totalInput: '' })
        .rate,
    ).toBe('');
  });

  it('says nothing about the rate while the amount or the term is missing', () => {
    expect(
      resolveLoanContractFields({
        model: 'flat',
        principal: NaN,
        termMonths: 60,
        driver: 'total',
        rateInput: '',
        totalInput: '133920',
      }).rate,
    ).toBe('');
    expect(
      resolveLoanContractFields({
        model: 'flat',
        principal: 120000,
        termMonths: NaN,
        driver: 'rate',
        rateInput: '2.32',
        totalInput: '',
      }).total,
    ).toBe('');
  });

  it('refuses a total that cannot even repay the amount borrowed', () => {
    expect(
      resolveLoanContractFields({
        ...contract,
        driver: 'total',
        rateInput: '',
        totalInput: '90000',
      }).rate,
    ).toBe('');
  });
});
