import { getNetAssetContribution } from '~/utils/accountBalances';

describe('getNetAssetContribution', () => {
  it('returns the positive balance for debit accounts', () => {
    expect(getNetAssetContribution('debit', 250)).toBe(250);
    expect(getNetAssetContribution('debit', -50)).toBe(-50);
  });

  it('negates the balance for credit accounts (they reduce net worth)', () => {
    expect(getNetAssetContribution('credit', 250)).toBe(-250);
    expect(getNetAssetContribution('credit', -50)).toBe(50);
  });
});
