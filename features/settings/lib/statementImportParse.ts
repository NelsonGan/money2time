export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category?: string;
  account?: string;
}

export interface ParsedStatement {
  statement?: {
    issuer?: string;
    period?: { start?: string; end?: string };
  };
  transactions: ParsedTransaction[];
}

export function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text;
}

// The pasted JSON comes from an LLM, which does not reliably honor the
// requested string shape. Models sometimes return `category`/`account` as a
// nested object (e.g. `{ parent, subcategory }`) instead of a plain string.
// Coerce those shapes here so downstream code (which calls `.toLowerCase()`
// and renders the value as a React child) never receives a non-string.
export function coerceCategoryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (value && typeof value === 'object') {
    const obj = value as { parent?: unknown; subcategory?: unknown; name?: unknown };
    const parent = typeof obj.parent === 'string' ? obj.parent.trim() : '';
    const subcategory = typeof obj.subcategory === 'string' ? obj.subcategory.trim() : '';
    if (parent && subcategory) return `${parent} > ${subcategory}`;
    if (subcategory) return subcategory;
    if (parent) return parent;
    if (typeof obj.name === 'string' && obj.name.trim().length > 0) return obj.name.trim();
  }
  return undefined;
}

export function coercePlainString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse and validate the AI-pasted statement JSON. Throws an `Error` whose
 * `message` is a stable code (`invalid_json`, `missing_transactions`,
 * `empty_transactions`, `invalid_transaction`) that the screen maps to a
 * localized message. Loosely-typed optional fields are normalized to plain
 * strings so the rest of the import flow can trust the shape.
 */
export function parseImportJson(raw: string): ParsedStatement {
  const cleaned = stripCodeFences(raw.trim());

  if (!cleaned.startsWith('{')) {
    throw new Error('invalid_json');
  }

  let parsed: ParsedStatement;
  try {
    parsed = JSON.parse(cleaned) as ParsedStatement;
  } catch {
    throw new Error('invalid_json');
  }

  if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
    throw new Error('missing_transactions');
  }
  if (parsed.transactions.length === 0) {
    throw new Error('empty_transactions');
  }
  for (const tx of parsed.transactions) {
    if (!tx.date || typeof tx.date !== 'string' || typeof tx.amount !== 'number') {
      throw new Error('invalid_transaction');
    }
    // Normalize optional/loosely-typed fields the LLM may return in an
    // unexpected shape, so the rest of the flow can trust `string` types.
    tx.description = coercePlainString(tx.description) ?? '';
    tx.category = coerceCategoryValue(tx.category);
    tx.account = coercePlainString(tx.account);
  }
  return parsed;
}
