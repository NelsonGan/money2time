// Pure parsing/normalization for the AI statement-import flow.
//
// The JSON is produced by an external LLM (Claude / GPT / Gemini) from the
// user's pasted bank statement. The prompt asks for string fields, but models
// frequently deviate, e.g. emitting `category` as an object
// `{ parent, subcategory }` instead of the requested `"Parent > Subcategory"`
// string. Downstream screen code assumes strings (`category.toLowerCase()`,
// rendering `description || category || date`), so any non-string value crashes
// the app. This module coerces every string-ish field at parse time so the
// rest of the feature can trust the `ParsedTransaction` type.

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

/**
 * Coerce an arbitrary JSON value into a trimmed string, or `undefined` when
 * there is nothing usable. Objects are handled specially so a category emitted
 * as `{ parent, subcategory }` collapses to `"Parent > Subcategory"` (which
 * matches the keys built in `categoryNameToId`), and a `{ name }`-style object
 * collapses to its name.
 */
export function normalizeCategory(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parent = typeof obj.parent === 'string' ? obj.parent.trim() : '';
    const subcategory =
      typeof obj.subcategory === 'string'
        ? obj.subcategory.trim()
        : typeof obj.child === 'string'
          ? obj.child.trim()
          : '';
    if (parent && subcategory) return `${parent} > ${subcategory}`;
    if (subcategory) return subcategory;
    if (parent) return parent;
    if (typeof obj.name === 'string' && obj.name.trim().length > 0) return obj.name.trim();
    return undefined;
  }
  return undefined;
}

/** Coerce an arbitrary JSON value into a plain string, defaulting to `''`. */
export function coerceString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Coerce an optional string field (e.g. `account`) to a trimmed string or `undefined`. */
export function coerceOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function normalizeTransaction(raw: ParsedTransaction): ParsedTransaction {
  return {
    date: coerceString(raw.date),
    description: coerceString(raw.description),
    amount: raw.amount,
    category: normalizeCategory(raw.category),
    account: coerceOptionalString(raw.account),
  };
}

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
    if (!tx.date || typeof tx.amount !== 'number') {
      throw new Error('invalid_transaction');
    }
  }

  return {
    ...parsed,
    transactions: parsed.transactions.map(normalizeTransaction),
  };
}
