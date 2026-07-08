import {
  coerceCategoryValue,
  coercePlainString,
  parseImportJson,
} from '~/features/settings/lib/statementImportParse';

function wrap(transactions: unknown[]): string {
  return JSON.stringify({ transactions });
}

describe('coerceCategoryValue', () => {
  it('returns trimmed strings', () => {
    expect(coerceCategoryValue('  Food  ')).toBe('Food');
    expect(coerceCategoryValue('Food > Groceries')).toBe('Food > Groceries');
  });

  it('treats empty / whitespace strings as undefined', () => {
    expect(coerceCategoryValue('')).toBeUndefined();
    expect(coerceCategoryValue('   ')).toBeUndefined();
  });

  it('joins a { parent, subcategory } object into "Parent > Subcategory"', () => {
    expect(coerceCategoryValue({ parent: 'Food', subcategory: 'Groceries' })).toBe(
      'Food > Groceries',
    );
  });

  it('falls back to whichever object part is present', () => {
    expect(coerceCategoryValue({ parent: 'Food' })).toBe('Food');
    expect(coerceCategoryValue({ subcategory: 'Groceries' })).toBe('Groceries');
    expect(coerceCategoryValue({ name: 'Other' })).toBe('Other');
  });

  it('returns undefined for empty objects, null, numbers, and arrays', () => {
    expect(coerceCategoryValue({})).toBeUndefined();
    expect(coerceCategoryValue(null)).toBeUndefined();
    expect(coerceCategoryValue(42)).toBeUndefined();
    expect(coerceCategoryValue(['Food'])).toBeUndefined();
  });
});

describe('coercePlainString', () => {
  it('returns trimmed strings and undefined for non-strings', () => {
    expect(coercePlainString('  Chase  ')).toBe('Chase');
    expect(coercePlainString('')).toBeUndefined();
    expect(coercePlainString({ name: 'Chase' })).toBeUndefined();
    expect(coercePlainString(null)).toBeUndefined();
  });
});

describe('parseImportJson', () => {
  it('parses a well-formed statement', () => {
    const result = parseImportJson(
      wrap([{ date: '2026-07-01', description: 'Coffee', amount: -3.5, category: 'Food' }]),
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].category).toBe('Food');
  });

  it('strips a ```json code fence before parsing', () => {
    const raw = '```json\n' + wrap([{ date: '2026-07-01', description: 'x', amount: 1 }]) + '\n```';
    expect(parseImportJson(raw).transactions).toHaveLength(1);
  });

  // Regression: MONEY2TIME-P (handleImport `.toLowerCase()` crash) and
  // MONEY2TIME-N (rendering the object as a React child) both stemmed from an
  // LLM returning `category` as a { parent, subcategory } object.
  it('coerces an object-shaped category into a string', () => {
    const result = parseImportJson(
      wrap([
        {
          date: '2026-07-01',
          description: 'Groceries',
          amount: -20,
          category: { parent: 'Food', subcategory: 'Groceries' },
        },
      ]),
    );
    const tx = result.transactions[0];
    expect(typeof tx.category).toBe('string');
    expect(tx.category).toBe('Food > Groceries');
    // The exact operations that crashed in production must now be safe.
    expect(() => tx.category?.toLowerCase()).not.toThrow();
  });

  it('coerces an object-shaped account and normalizes a missing description', () => {
    const result = parseImportJson(
      wrap([{ date: '2026-07-01', amount: -20, account: { name: 'Chase' } }]),
    );
    const tx = result.transactions[0];
    expect(tx.account).toBeUndefined(); // object account without a plain string → dropped
    expect(tx.description).toBe('');
  });

  it('drops non-string categories rather than passing them through', () => {
    const result = parseImportJson(
      wrap([{ date: '2026-07-01', description: 'x', amount: 1, category: 123 }]),
    );
    expect(result.transactions[0].category).toBeUndefined();
  });

  it('throws stable error codes for malformed input', () => {
    expect(() => parseImportJson('not json')).toThrow('invalid_json');
    expect(() => parseImportJson('{ bad json')).toThrow('invalid_json');
    expect(() => parseImportJson(JSON.stringify({ foo: 1 }))).toThrow('missing_transactions');
    expect(() => parseImportJson(wrap([]))).toThrow('empty_transactions');
    expect(() => parseImportJson(wrap([{ description: 'x', amount: 1 }]))).toThrow(
      'invalid_transaction',
    );
    expect(() => parseImportJson(wrap([{ date: '2026-07-01', amount: 'nope' }]))).toThrow(
      'invalid_transaction',
    );
  });
});
