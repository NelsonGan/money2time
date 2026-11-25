import { ACCOUNT_LOGO_COUNTRIES, getAccountLogoMeta } from '~/constants/accountLogos';
import { PRO_LIMITS } from '~/constants/proLimits';
import {
  GLOBAL_COUNTRY,
  MAX_STARTER_ACCOUNTS,
  resolveStarterCountry,
  STARTER_ACCOUNT_LISTS,
  starterAccountSeeds,
  starterKindForLogo,
  starterSectionsForCountry,
  starterSelectionKey,
} from '~/features/onboarding/lib/starterAccounts';

const names = { cash: 'Cash', card: (brand: string) => `${brand} Card` };

describe('starter account lists', () => {
  it('name only logos the app ships', () => {
    const missing = Object.entries(STARTER_ACCOUNT_LISTS).flatMap(([country, lists]) =>
      [...lists.wallets, ...lists.banks, ...lists.cards]
        .map((entry) => (entry.includes('/') ? entry : `${country}/${entry}`))
        .filter((id) => getAccountLogoMeta(id) === null),
    );
    expect(missing).toEqual([]);
  });

  it('cover every country the logo picker offers', () => {
    const uncovered = ACCOUNT_LOGO_COUNTRIES.map((country) => country.slug).filter(
      (slug) => !STARTER_ACCOUNT_LISTS[slug],
    );
    expect(uncovered).toEqual([]);
  });

  it('stay under the free plan, so the step never meets the paywall', () => {
    expect(MAX_STARTER_ACCOUNTS).toBeLessThan(PRO_LIMITS.FREE_MAX_ACCOUNTS);
  });
});

describe('resolveStarterCountry', () => {
  it('keeps a country the user picked before', () => {
    expect(
      resolveStarterCountry({ savedCountry: 'japan', currencyCode: 'MYR', regionCode: 'US' }),
    ).toBe('japan');
  });

  it('reads the country from a currency only one country uses', () => {
    expect(resolveStarterCountry({ currencyCode: 'MYR', regionCode: 'US' })).toBe('malaysia');
    expect(resolveStarterCountry({ currencyCode: 'php' })).toBe('philippines');
  });

  it('leaves shared currencies to the device region', () => {
    expect(resolveStarterCountry({ currencyCode: 'EUR', regionCode: 'DE' })).toBe('germany');
    expect(resolveStarterCountry({ currencyCode: 'USD', regionCode: 'SG' })).toBe('singapore');
  });

  it('falls back to the international brands', () => {
    expect(resolveStarterCountry({ currencyCode: 'GBP', regionCode: 'GB' })).toBe(GLOBAL_COUNTRY);
    expect(resolveStarterCountry({ savedCountry: 'atlantis' })).toBe(GLOBAL_COUNTRY);
  });
});

describe('starterSectionsForCountry', () => {
  it('offers wallets, banks and cards in that order, most popular first', () => {
    const sections = starterSectionsForCountry('malaysia');
    expect(sections.map((section) => section.kind)).toEqual(['wallet', 'bank', 'card']);
    expect(sections[0].logos[0].id).toBe('malaysia/touch-n-go-ewallet');
    expect(sections[1].logos[0].id).toBe('malaysia/maybank');
    expect(sections[2].logos.map((logo) => logo.id)).toContain('global/american-express');
  });

  it('leaves out a section with nothing in it', () => {
    expect(starterSectionsForCountry('indonesia').map((section) => section.kind)).toEqual([
      'bank',
      'card',
    ]);
  });

  it('offers nothing for a country the logo set does not have', () => {
    expect(starterSectionsForCountry('nowhere')).toEqual([]);
  });
});

describe('starterKindForLogo', () => {
  it('knows a wallet from a bank', () => {
    expect(starterKindForLogo('malaysia/grabpay')).toBe('wallet');
    expect(starterKindForLogo('global/paypal')).toBe('wallet');
    expect(starterKindForLogo('malaysia/maybank')).toBe('bank');
  });
});

describe('starterSelectionKey', () => {
  it('keeps one cash pick whatever language it was named in', () => {
    expect(starterSelectionKey({ kind: 'cash', logoId: null, name: 'Tunai' })).toBe(
      starterSelectionKey({ kind: 'cash', logoId: null, name: 'Cash' }),
    );
  });

  it('tells a bank from its card', () => {
    expect(starterSelectionKey({ kind: 'bank', logoId: 'malaysia/cimb', name: 'CIMB' })).not.toBe(
      starterSelectionKey({ kind: 'card', logoId: 'malaysia/cimb', name: 'CIMB' }),
    );
  });
});

describe('starterAccountSeeds', () => {
  it('makes debit accounts for cash, wallets and banks, and credit cards for cards', () => {
    expect(
      starterAccountSeeds(
        [
          { kind: 'cash', logoId: null, name: 'Tunai' },
          { kind: 'wallet', logoId: 'malaysia/touch-n-go-ewallet', name: "Touch 'n Go eWallet" },
          { kind: 'bank', logoId: 'malaysia/maybank', name: 'Maybank' },
          { kind: 'card', logoId: 'malaysia/maybank', name: 'Maybank' },
        ],
        names,
      ),
    ).toEqual([
      { name: 'Cash', type: 'debit', accountGroup: 'Cash', logoId: null },
      {
        name: "Touch 'n Go eWallet",
        type: 'debit',
        accountGroup: 'Cash',
        logoId: 'malaysia/touch-n-go-ewallet',
      },
      { name: 'Maybank', type: 'debit', accountGroup: 'Bank Accounts', logoId: 'malaysia/maybank' },
      {
        name: 'Maybank Card',
        type: 'credit',
        accountGroup: 'Credit Cards',
        logoId: 'malaysia/maybank',
      },
    ]);
  });

  it('drops repeats and blanks, and stops at the limit', () => {
    const seeds = starterAccountSeeds(
      [
        { kind: 'bank', logoId: 'malaysia/cimb', name: 'CIMB' },
        { kind: 'bank', logoId: 'malaysia/cimb', name: 'CIMB' },
        { kind: 'bank', logoId: null, name: '  ' },
        { kind: 'bank', logoId: null, name: 'Credit Union' },
        { kind: 'bank', logoId: null, name: 'credit union ' },
        ...['a', 'b', 'c', 'd', 'e'].map((name) => ({ kind: 'bank' as const, logoId: null, name })),
      ],
      names,
    );
    expect(seeds.map((seed) => seed.name)).toEqual(['CIMB', 'Credit Union', 'a', 'b', 'c']);
  });
});
