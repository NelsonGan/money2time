import { PRO_LIMITS } from '~/constants/proLimits';
import {
  AUTOLOG_CATALOG_SCHEMA_VERSION,
  buildAutoLogCatalog,
  type BuildAutoLogCatalogInput,
} from '~/features/transactions/lib/autoLogCatalog';
import type { Account, Category } from '~/types';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Main',
    sortOrder: 0,
    type: 'debit',
    accountGroup: null,
    logoId: null,
    creditStatementDay: null,
    creditDueDay: null,
    currency: 'USD',
    startingBalance: 0,
    includeInTotals: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Food',
    sortOrder: 0,
    type: 'expense',
    parentId: null,
    icon: '🍔',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<BuildAutoLogCatalogInput> = {}): BuildAutoLogCatalogInput {
  return {
    accounts: [account()],
    categories: [category()],
    isSimpleMode: false,
    simpleWalletId: null,
    isPro: false,
    autoLogUsageCount: 0,
    defaultAccountId: null,
    defaultExpenseCategoryId: null,
    backTapAction: 'quick',
    includeSubcategories: false,
    autoCategorizeByMerchant: true,
    notificationTitle: 'Transaction logged',
    failureNotificationTitle: "Couldn't auto-log a payment",
    failureNotificationBody: 'Open Money2Time to add it manually.',
    reportingCurrency: 'USD',
    generatedAt: '2026-07-15T10:30:00.000Z',
    ...overrides,
  };
}

describe('buildAutoLogCatalog', () => {
  it('stamps the schema version so Swift can reject a shape it does not know', () => {
    expect(buildAutoLogCatalog(input()).schemaVersion).toBe(AUTOLOG_CATALOG_SCHEMA_VERSION);
  });

  describe('remaining', () => {
    it('counts down from the free cap', () => {
      expect(buildAutoLogCatalog(input({ autoLogUsageCount: 10 })).remaining).toBe(
        PRO_LIMITS.FREE_MAX_AUTO_LOGS - 10,
      );
    });

    it('clamps at zero rather than going negative', () => {
      const catalog = buildAutoLogCatalog(
        input({ autoLogUsageCount: PRO_LIMITS.FREE_MAX_AUTO_LOGS + 5 }),
      );
      expect(catalog.remaining).toBe(0);
    });

    it('is null (unlimited) for Pro', () => {
      expect(
        buildAutoLogCatalog(input({ isPro: true, autoLogUsageCount: 999 })).remaining,
      ).toBeNull();
    });
  });

  it('carries the configured Back Tap action through to the intent', () => {
    expect(buildAutoLogCatalog(input({ backTapAction: 'voice' })).backTapAction).toBe('voice');
  });

  it('carries the auto-categorize preference through for the intent to skip the prompt', () => {
    expect(
      buildAutoLogCatalog(input({ autoCategorizeByMerchant: true })).autoCategorizeByMerchant,
    ).toBe(true);
    expect(
      buildAutoLogCatalog(input({ autoCategorizeByMerchant: false })).autoCategorizeByMerchant,
    ).toBe(false);
  });

  it('carries the notification strings the intent posts on success and failure', () => {
    // The intent fires backgrounded with no i18n, so it can only show what the
    // catalog hands it. Both the "logged" and the "couldn't log" copy ride along.
    const catalog = buildAutoLogCatalog(
      input({
        notificationTitle: 'Logged it',
        failureNotificationTitle: 'No amount',
        failureNotificationBody: 'Add it yourself',
      }),
    );
    expect(catalog.notificationTitle).toBe('Logged it');
    expect(catalog.failureNotificationTitle).toBe('No amount');
    expect(catalog.failureNotificationBody).toBe('Add it yourself');
  });

  describe('accounts', () => {
    const accounts = [
      account({ id: 'a2', name: 'Second', sortOrder: 1 }),
      account({ id: 'a1', name: 'First', sortOrder: 0 }),
    ];

    it('lists accounts in sort order', () => {
      expect(buildAutoLogCatalog(input({ accounts })).accounts.map((a) => a.id)).toEqual([
        'a1',
        'a2',
      ]);
    });

    it('resolves the default account through the shared entry fallback', () => {
      expect(
        buildAutoLogCatalog(input({ accounts, defaultAccountId: 'a2' })).defaultAccountId,
      ).toBe('a2');
      expect(buildAutoLogCatalog(input({ accounts })).defaultAccountId).toBe('a1');
    });

    it('drops a stale default account id', () => {
      expect(
        buildAutoLogCatalog(input({ accounts, defaultAccountId: 'gone' })).defaultAccountId,
      ).toBe('a1');
    });

    it('offers only the simple wallet in simple mode', () => {
      const catalog = buildAutoLogCatalog(
        input({
          accounts: [...accounts, account({ id: 'w', name: 'Simple Wallet' })],
          isSimpleMode: true,
          simpleWalletId: 'w',
        }),
      );
      expect(catalog.accounts.map((a) => a.id)).toEqual(['w']);
      expect(catalog.defaultAccountId).toBe('w');
    });
  });

  describe('categories', () => {
    const categories = [
      category({ id: 'c2', name: 'Transport', sortOrder: 1, icon: '🚕' }),
      category({ id: 'c1', name: 'Food', sortOrder: 0, icon: '🍔' }),
      category({ id: 'i1', name: 'Salary', type: 'income' }),
    ];

    it('lists expense categories only, in sort order', () => {
      expect(buildAutoLogCatalog(input({ categories })).categories.map((c) => c.id)).toEqual([
        'c1',
        'c2',
      ]);
    });

    it('renders every icon form as a glyph the Shortcuts picker can show', () => {
      // A Shortcuts picker draws a plain string, so a bundled PNG or an
      // uploaded image has to resolve to a stand-in glyph or to nothing.
      const catalog = buildAutoLogCatalog(
        input({
          categories: [
            // Legacy bare glyph, still passed straight through.
            category({ id: 'c1', icon: '🍔' }),
            // Bundled id: now yields its stand-in rather than a blank.
            category({ id: 'c2', sortOrder: 1, icon: 'grocery-basket' }),
            // User-picked emoji.
            category({ id: 'c3', sortOrder: 2, icon: 'emoji:🎌' }),
            // Uploaded image: blank, so the native side draws its bullet.
            category({ id: 'c4', sortOrder: 3, icon: 'custom:category-icons/a.png' }),
            // Unknown token, e.g. an id from a pack this build does not ship.
            category({ id: 'c5', sortOrder: 4, icon: 'shopping-cart' }),
          ],
        }),
      );
      expect(catalog.categories).toEqual([
        { id: 'c1', name: 'Food', emoji: '🍔', isRoot: true },
        { id: 'c2', name: 'Food', emoji: '🛒', isRoot: true },
        { id: 'c3', name: 'Food', emoji: '🎌', isRoot: true },
        { id: 'c4', name: 'Food', emoji: '', isRoot: true },
        { id: 'c5', name: 'Food', emoji: '', isRoot: true },
      ]);
    });

    const withChild = [
      category({ id: 'c1', name: 'Food', sortOrder: 0 }),
      category({ id: 'c1a', name: 'Coffee', sortOrder: 1, parentId: 'c1' }),
    ];

    // The catalog ships every category whatever the preference says, flagging
    // roots so Swift can narrow the picker. Filtering here instead would stop a
    // subcategory already saved in a shortcut from resolving, silently turning a
    // preset category into a prompt on every tap.
    it('ships subcategories even while the picker is roots only, flagged as non-root', () => {
      const catalog = buildAutoLogCatalog(input({ categories: withChild }));
      expect(catalog.includeSubcategories).toBe(false);
      expect(catalog.categories).toEqual([
        expect.objectContaining({ id: 'c1', isRoot: true }),
        expect.objectContaining({ id: 'c1a', isRoot: false }),
      ]);
    });

    it('carries the subcategory preference through for the picker to apply', () => {
      expect(
        buildAutoLogCatalog(input({ categories: withChild, includeSubcategories: true }))
          .includeSubcategories,
      ).toBe(true);
    });

    it('keeps a subcategory default', () => {
      // The default is a drain-time fallback read from prefs, not something
      // picked from this list — hiding subcategories must not silently drop it.
      expect(
        buildAutoLogCatalog(input({ categories: withChild, defaultExpenseCategoryId: 'c1a' }))
          .defaultExpenseCategoryId,
      ).toBe('c1a');
    });

    it('keeps a valid default expense category', () => {
      expect(
        buildAutoLogCatalog(input({ categories, defaultExpenseCategoryId: 'c2' }))
          .defaultExpenseCategoryId,
      ).toBe('c2');
    });

    it('drops a default that is stale or the wrong type', () => {
      expect(
        buildAutoLogCatalog(input({ categories, defaultExpenseCategoryId: 'gone' }))
          .defaultExpenseCategoryId,
      ).toBeNull();
      expect(
        buildAutoLogCatalog(input({ categories, defaultExpenseCategoryId: 'i1' }))
          .defaultExpenseCategoryId,
      ).toBeNull();
    });
  });
});
