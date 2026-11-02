import {
  copiedCount,
  copyPartRow,
  type LedgerCopySource,
  partsToCopy,
  toggleCopyPart,
} from '~/features/ledgers/lib/ledgerCopyChoice';
import type { LedgerCopyPart } from '~/lib/db/ledgerCopy';

function source(counts: Partial<LedgerCopySource['counts']> = {}): LedgerCopySource {
  return {
    counts: {
      accounts: 3,
      categories: 9,
      goals: 1,
      loans: 0,
      recurring: 2,
      budgets: 1,
      items: 0,
      albums: 0,
      ...counts,
    },
    // One rule posts from an account, one saves into the goal.
    recurringNeeds: [
      ['accounts', 'categories'],
      ['accounts', 'categories', 'goals'],
    ],
    monthCycle: { defaultDay: 25, overrides: {} },
    currency: { code: 'MYR', symbol: 'RM' },
  };
}

const set = (...parts: LedgerCopyPart[]) => new Set(parts);

describe('toggleCopyPart', () => {
  it('turns on what a part needs, and off what needs it', () => {
    expect([...toggleCopyPart(set(), 'recurring', true)].sort()).toEqual([
      'accounts',
      'categories',
      'recurring',
    ]);
    expect([...toggleCopyPart(set('categories', 'budgets', 'items'), 'categories', false)]).toEqual(
      ['items'],
    );
  });
});

describe('copyPartRow', () => {
  it('counts only the rules whose accounts come along', () => {
    expect(copiedCount('recurring', source(), set('accounts', 'categories', 'recurring'))).toBe(1);
    expect(
      copiedCount('recurring', source(), set('accounts', 'categories', 'goals', 'recurring')),
    ).toBe(2);
    expect(
      copyPartRow(
        'recurring',
        source({ goals: 1 }),
        set('categories', 'recurring', 'goals'),
        false,
      ),
    ).toMatchObject({ on: true, count: 0, caption: 'noneCopied' });
  });

  it('greys out a part the source has none of, starters included', () => {
    expect(copyPartRow('loans', source(), set('loans'), false)).toEqual({
      on: false,
      disabled: true,
      count: 0,
      caption: 'noneInSource',
    });
    expect(copyPartRow('accounts', source({ accounts: 0 }), set('accounts'), false)).toMatchObject({
      on: false,
      disabled: true,
      caption: 'starters',
    });
    expect(copyPartRow('goals', source(), set(), false)).toMatchObject({
      on: false,
      disabled: false,
      caption: 'empty',
    });
  });

  it('shows every part on and fixed under Everything', () => {
    expect(copyPartRow('goals', source(), set(), true)).toEqual({
      on: true,
      disabled: true,
      count: 1,
      caption: 'copy',
    });
    expect(copyPartRow('items', source(), set(), true).caption).toBe('noneInSource');
  });
});

describe('partsToCopy', () => {
  it('leaves out chosen parts that would copy nothing', () => {
    const chosen = set('accounts', 'categories', 'loans', 'items', 'recurring', 'budgets');
    expect(partsToCopy(chosen, source()).sort()).toEqual([
      'accounts',
      'budgets',
      'categories',
      'recurring',
    ]);
    // A source without accounts: the new ledger gets the starters instead.
    expect(partsToCopy(set('accounts', 'categories'), source({ accounts: 0 }))).toEqual([
      'categories',
    ]);
    expect(partsToCopy(chosen, null)).toEqual([]);
  });
});
