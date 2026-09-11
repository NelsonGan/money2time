import { resolveQuickEntryAccountId } from '~/features/transactions/lib/entryDefaults';

describe('resolveQuickEntryAccountId', () => {
  it('uses the imported account when simple mode has lost its hidden wallet', () => {
    expect(
      resolveQuickEntryAccountId({
        isSimpleMode: true,
        simpleWalletId: null,
        fallbackAccountId: 'imported-cash',
      }),
    ).toBe('imported-cash');
  });

  it('keeps the simple wallet ahead of a saved or previously used account', () => {
    expect(
      resolveQuickEntryAccountId({
        isSimpleMode: true,
        simpleWalletId: 'wallet',
        fallbackAccountId: 'cash',
      }),
    ).toBe('wallet');
  });

  it('uses the selected account in power mode even when a simple wallet exists', () => {
    expect(
      resolveQuickEntryAccountId({
        isSimpleMode: false,
        simpleWalletId: 'wallet',
        fallbackAccountId: 'cash',
      }),
    ).toBe('cash');
  });

  it.each([true, false])(
    'leaves entry unavailable when no account exists (simple=%s)',
    (simple) => {
      expect(
        resolveQuickEntryAccountId({
          isSimpleMode: simple,
          simpleWalletId: null,
          fallbackAccountId: null,
        }),
      ).toBeNull();
    },
  );

  it('keeps power-mode entry unavailable without an eligible fallback account', () => {
    expect(
      resolveQuickEntryAccountId({
        isSimpleMode: false,
        simpleWalletId: 'wallet',
        fallbackAccountId: null,
      }),
    ).toBeNull();
  });
});
