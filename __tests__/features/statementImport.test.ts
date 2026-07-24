import {
  coerceOptionalString,
  normalizeCategory,
  parseImportJson,
} from '~/features/settings/lib/statementImport';

// Simulates what the screen does at render time and import time. Before the
// fix, a non-string category crashes both of these paths (Sentry MONEY2TIME-N
// and MONEY2TIME-P).
function renderChild(tx: { description: string; category?: string; date: string }) {
  const child = tx.description || tx.category || tx.date;
  if (child !== null && typeof child === 'object') {
    throw new Error(
      `Objects are not valid as a React child (found: object with keys {${Object.keys(
        child as object,
      ).join(', ')}})`,
    );
  }
  return child;
}

function resolveCategoryId(tx: { category?: string }, map: Map<string, string>) {
  return tx.category ? (map.get(tx.category.toLowerCase()) ?? null) : null;
}

describe('parseImportJson', () => {
  it('parses a well-formed statement with string categories', () => {
    const raw = JSON.stringify({
      statement: { issuer: 'Chase', period: { start: '2026-07-01', end: '2026-07-31' } },
      transactions: [
        { date: '2026-07-02', description: 'Coffee', amount: -4.5, category: 'Food', account: 'A' },
      ],
    });
    const result = parseImportJson(raw);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].category).toBe('Food');
    expect(result.transactions[0].account).toBe('A');
  });

  it('strips a ```json code fence before parsing', () => {
    const raw =
      '```json\n{"transactions":[{"date":"2026-07-02","amount":-1,"description":"x"}]}\n```';
    expect(parseImportJson(raw).transactions).toHaveLength(1);
  });

  // MONEY2TIME-P + MONEY2TIME-N repro: the LLM returns category as an object.
  it('flattens an object category {parent, subcategory} to a string', () => {
    const raw = JSON.stringify({
      transactions: [
        {
          date: '2026-07-02',
          description: '',
          amount: -12.5,
          category: { parent: 'Food', subcategory: 'Groceries' },
        },
      ],
    });
    const result = parseImportJson(raw);
    const tx = result.transactions[0];

    expect(typeof tx.category).toBe('string');
    expect(tx.category).toBe('Food > Groceries');

    // MONEY2TIME-N: rendering must no longer throw on an object child.
    expect(() => renderChild(tx)).not.toThrow();
    expect(renderChild(tx)).toBe('Food > Groceries');

    // MONEY2TIME-P: category lookup must no longer throw on .toLowerCase().
    const map = new Map([['food > groceries', 'cat-123']]);
    expect(() => resolveCategoryId(tx, map)).not.toThrow();
    expect(resolveCategoryId(tx, map)).toBe('cat-123');
  });

  it('coerces a non-string account object to undefined instead of leaking it', () => {
    const raw = JSON.stringify({
      transactions: [
        {
          date: '2026-07-02',
          description: 'x',
          amount: -1,
          account: { name: 'Visa' } as unknown as string,
        },
      ],
    });
    const tx = parseImportJson(raw).transactions[0];
    expect(tx.account).toBeUndefined();
  });

  it('still validates missing date / non-number amount', () => {
    expect(() => parseImportJson('{"transactions":[{"amount":-1}]}')).toThrow(
      'invalid_transaction',
    );
    expect(() => parseImportJson('{"transactions":[{"date":"2026-07-02","amount":"-1"}]}')).toThrow(
      'invalid_transaction',
    );
  });

  it('rejects non-JSON, missing and empty transaction arrays', () => {
    expect(() => parseImportJson('not json')).toThrow('invalid_json');
    expect(() => parseImportJson('{"foo":1}')).toThrow('missing_transactions');
    expect(() => parseImportJson('{"transactions":[]}')).toThrow('empty_transactions');
  });
});

describe('normalizeCategory', () => {
  it('trims strings and drops empties', () => {
    expect(normalizeCategory('  Food  ')).toBe('Food');
    expect(normalizeCategory('   ')).toBeUndefined();
    expect(normalizeCategory('')).toBeUndefined();
  });

  it('handles partial and alternate object shapes', () => {
    expect(normalizeCategory({ parent: 'Food' })).toBe('Food');
    expect(normalizeCategory({ subcategory: 'Groceries' })).toBe('Groceries');
    expect(normalizeCategory({ parent: 'Food', child: 'Snacks' })).toBe('Food > Snacks');
    expect(normalizeCategory({ name: 'Travel' })).toBe('Travel');
    expect(normalizeCategory({})).toBeUndefined();
  });

  it('returns undefined for other primitives', () => {
    expect(normalizeCategory(null)).toBeUndefined();
    expect(normalizeCategory(undefined)).toBeUndefined();
    expect(normalizeCategory(42)).toBeUndefined();
  });
});

describe('coerceOptionalString', () => {
  it('trims, passes through, or drops', () => {
    expect(coerceOptionalString('  Visa ')).toBe('Visa');
    expect(coerceOptionalString('  ')).toBeUndefined();
    expect(coerceOptionalString({ name: 'x' })).toBeUndefined();
    expect(coerceOptionalString(7)).toBe('7');
  });
});
