import type { Account, Category } from '~/types';

export function buildSystemPrompt(
  accounts: Account[],
  categories: Category[],
  currencyCode: string,
  currencySymbol: string,
  today: string,
  allowTransfers: boolean,
  defaultAccountName?: string | null,
  defaultIncomeCategoryName?: string | null,
): string {
  const yesterday = getYesterday(today);

  const accountLines = accounts.map((a) => `- "${a.name}" (${a.type}, ${a.currency})`).join('\n');

  const expenseCategories = formatCategoryTree(categories, 'expense');
  const incomeCategories = formatCategoryTree(categories, 'income');

  return `You are a financial transaction parser. Today is ${today}. Yesterday was ${yesterday}.
The user's currency is ${currencyCode} (${currencySymbol}).

Available accounts:
${accountLines || '- (none)'}

Available expense categories:
${expenseCategories || '- (none)'}

Available income categories:
${incomeCategories || '- (none)'}

Parse the user's message into transactions. Return a JSON array where each item has:
- "type": ${allowTransfers ? '"expense" | "income" | "transfer"' : '"expense" | "income"'}
- "amount": positive number
- "date": use "${today}" by default. Only use a different date when the user explicitly specifies a date or a relative day like yesterday/today/tomorrow (ISO 8601 YYYY-MM-DD)
- "categoryName": must match one of the categories listed above (parent or subcategory). When the user's input matches a subcategory, use the subcategory name — not its parent. For transfers, set to null.
- "accountName": account name from the list above, or null if unspecified
- "fromAccountName": for transfers only, source account name
- "toAccountName": for transfers only, destination account name
- "note": only include a note when the user explicitly provides descriptive text worth saving. Otherwise return null. Do not invent notes from the category or transaction type.

Rules:
- "20 for chicken rice" → expense, amount 20, note "chicken rice", pick the most specific matching category (e.g. subcategory "Restaurants" under "Food" rather than just "Food")
- "50 for lunch, 20 for dinner" → two expense transactions with notes "lunch" and "dinner"
- "20 for lunch 50 for dinner" → two expense transactions; first amount is 20, second amount is 50
- "50 for lunch from Maybank" → expense, amount 50, accountName "Maybank", note "lunch"
- "earned 5000 salary" → income, amount 5000, pick closest salary/income category
${allowTransfers ? '- "transfer 50 from X to Y" → transfer, amount 50, fromAccountName X, toAccountName Y' : ''}
- Default every transaction date to "${today}" unless the user clearly asked for another date
- When multiple amounts appear, each amount belongs only to its own nearby phrase. Never copy the last amount to every transaction.
- When the user includes a descriptor after the amount, preserve it as the note for that transaction
- Mentions starting with "@" are explicit user selections. When the input ends with a "USE THESE VALUES" section, you MUST copy those exact field values into your output — they override any interpretation
${defaultAccountName ? `- When the user does not specify an account, use accountName "${defaultAccountName}". This is the user's default account` : '- If no account is mentioned, set accountName to null'}
${defaultIncomeCategoryName ? `- When the transaction is income and the user does not specify a category, use categoryName "${defaultIncomeCategoryName}". This is the user's default income category` : ''}
- Categories are organized as parent > subcategory (e.g. "Transport > Fuel" means "Fuel" is a subcategory of "Transport"). When a subcategory fits, use the subcategory name. Only use the parent name when no subcategory is a better match.
- If no real category from the list is a close match, set "categoryName" to null. Never invent a new category name
- Copy notes from the user's own wording when they clearly provided one; otherwise set "note" to null
- ${allowTransfers ? 'Transfers are allowed when the user clearly asks for one' : 'Transfers are unavailable in the current mode. If the user asks for a transfer, return an empty array []'}
- If the message is not about transactions, return an empty array []
- Always return a JSON array, even for a single transaction
- Do NOT include any text outside the JSON array`;
}

function formatCategoryTree(categories: Category[], type: 'expense' | 'income'): string {
  return (
    categories
      .filter((c) => c.type === type && !c.parentId)
      .map((parent) => {
        const subs = categories.filter((s) => s.parentId === parent.id);
        if (subs.length === 0) return `- "${parent.name}"`;
        const subLines = subs.map((s) => `  - "${s.name}"`).join('\n');
        return `- "${parent.name}"\n${subLines}`;
      })
      .join('\n') || '- (none)'
  );
}

function getYesterday(todayIso: string): string {
  const d = new Date(todayIso + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export const TRANSACTION_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
          amount: { type: 'number' },
          date: { type: 'string' },
          categoryName: { type: ['string', 'null'] },
          accountName: { type: ['string', 'null'] },
          fromAccountName: { type: ['string', 'null'] },
          toAccountName: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
        required: ['type', 'amount', 'date'],
      },
    },
  },
  required: ['transactions'],
});

export interface LLMTransactionOutput {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  date: string;
  categoryName?: string | null;
  accountName?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  note?: string | null;
}

export function prepareUserMessageForParsing(userMessage: string): string {
  const normalized = normalizeImplicitClauseBreaks(userMessage)
    .replace(/[;,]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return normalized || userMessage.trim();
}

export function alignParsedTransactionAmounts(
  transactions: LLMTransactionOutput[],
  userMessage: string,
): LLMTransactionOutput[] {
  if (transactions.length < 2) return transactions;

  const clauseAmounts = extractClauseAmounts(userMessage);
  if (clauseAmounts.length !== transactions.length) return transactions;

  return transactions.map((transaction, index) => ({
    ...transaction,
    amount: clauseAmounts[index] ?? transaction.amount,
  }));
}

export function looksLikeTransactionMessage(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized) return false;

  const hasAmount = findAmountCandidates(userMessage).length > 0;
  if (!hasAmount) return false;

  if (
    /\b(?:percent|percentage|times|multiplied|divide|divided|minus|plus|sum|equation)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }

  const hasStrongTransactionKeyword =
    /\b(?:spend|spent|pay|paid|buy|bought|purchase|purchased|cost|earned|earn|salary|income|bonus|refund|reimburse|reimbursed|received|receive|got|sold|sell|transfer|transferred|move|moved|send|sent|deposit|deposited|withdraw|withdrew|top[\s-]?up|lent|borrowed)\b/i.test(
      normalized,
    );

  if (
    (normalized.endsWith('?') ||
      /^\s*(?:what|when|where|why|who|how|is|are|can|could|would|should|do|does|did|which|tell|explain)\b/i.test(
        normalized,
      )) &&
    !hasStrongTransactionKeyword
  ) {
    return false;
  }

  return true;
}

export function normalizeTransactionDate(date: string | null | undefined, today: string): string {
  const candidate = date?.trim();
  if (!candidate) return today;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);
  if (!match) return today;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, monthIndex, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== day
  ) {
    return today;
  }

  return candidate;
}

export function hasExplicitDateReference(userMessage: string): boolean {
  if (!userMessage.trim()) return false;

  return (
    /\b(?:today|yesterday|tomorrow)\b/i.test(userMessage) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(userMessage) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(userMessage) ||
    /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+\d{1,2}(?:,\s*\d{4})?\b/i.test(
      userMessage,
    ) ||
    /\b\d{1,2}\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i.test(
      userMessage,
    )
  );
}

export function normalizeTransactionNote(
  note: string | null | undefined,
  userMessage: string,
  amount: number,
  type: 'expense' | 'income' | 'transfer',
): string | null {
  const candidate = sanitizeNoteCandidate(note);
  const normalizedUserMessage = normalizeTextForMatch(userMessage);

  if (candidate) {
    const normalizedCandidate = normalizeTextForMatch(candidate);

    if (normalizedCandidate && normalizedUserMessage.includes(normalizedCandidate)) {
      return candidate;
    }
  }

  return extractExplicitNoteFromMessage(userMessage, amount, type);
}

export function resolveNameToId(
  name: string | null | undefined,
  items: { id: string; name: string }[],
): string | null {
  if (!name) return null;
  const normalized = normalizeResolvableName(name);
  if (!normalized) return null;

  const exact = items.find((i) => normalizeResolvableName(i.name) === normalized);
  if (exact) return exact.id;

  const startsWith = items.find((i) => normalizeResolvableName(i.name).startsWith(normalized));
  if (startsWith) return startsWith.id;

  const includes = items.find((i) => normalizeResolvableName(i.name).includes(normalized));
  if (includes) return includes.id;

  const reverseIncludes = items.find((i) => normalized.includes(normalizeResolvableName(i.name)));
  if (reverseIncludes) return reverseIncludes.id;

  return null;
}

export function resolveCategoryByName(
  name: string | null | undefined,
  categories: Category[],
  type: 'expense' | 'income',
): string | null {
  if (!name) return null;
  const filtered = categories.filter((c) => c.type === type);
  return resolveNameToId(name, filtered);
}

function normalizeTextForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeResolvableName(value: string): string {
  return value.trim().replace(/^@+/, '').replace(/\s+/g, ' ').toLowerCase();
}

function normalizeImplicitClauseBreaks(userMessage: string): string {
  const withAndBreaks = userMessage.replace(
    /\s+\band\b\s+(?=(?:RM|MYR|USD|EUR|GBP|SGD|JPY|CNY|AUD|CAD|HK\$|S\$|Rp|\$|€|£|₹|฿|₱|₫)?\s*\d)/gi,
    '\n',
  );

  return withAndBreaks.split('\n').map(insertBreaksBeforeAdditionalAmounts).join('\n');
}

function sanitizeNoteCandidate(note: string | null | undefined): string | null {
  const candidate = note
    ?.trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
  return candidate ? candidate : null;
}

function extractExplicitNoteFromMessage(
  userMessage: string,
  amount: number,
  type: 'expense' | 'income' | 'transfer',
): string | null {
  if (type === 'transfer') return null;

  const clauses = splitTransactionClauses(userMessage);
  for (const clause of clauses) {
    const candidate = extractNoteFromClause(clause, amount);
    if (candidate) return candidate;
  }

  return null;
}

function splitTransactionClauses(userMessage: string): string[] {
  return prepareUserMessageForParsing(userMessage)
    .split(/[,;\n]+|\s+\band\b(?=\s*[^,\n;]*\d)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractNoteFromClause(clause: string, amount: number): string | null {
  const amountMatcher = buildAmountMatcher(amount);
  const match = amountMatcher.exec(clause);
  if (!match) return null;

  const suffix = clause.slice(match.index + match[0].length).trim();
  if (!suffix) return null;
  if (/^(?:from|to|into|using|via|with)\b/i.test(suffix)) return null;

  let candidate = suffix.replace(/^(?:for|on|about)\b\s*/i, '').trim();
  candidate = candidate
    .replace(/\s+\b(?:from|to|into|using|via|with)\b[\s\S]*$/i, '')
    .replace(/\s+\b(?:today|yesterday|tomorrow)\b[\s\S]*$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim();

  return candidate || null;
}

function buildAmountMatcher(amount: number): RegExp {
  const variants = Array.from(
    new Set(
      [amount.toString(), amount.toFixed(1), amount.toFixed(2)].filter(
        (value) => value && Number.isFinite(Number(value)),
      ),
    ),
  ).map(escapeRegExp);

  return new RegExp(`(?:^|[^\\d])(?:${variants.join('|')})(?=$|[^\\d])`, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertBreaksBeforeAdditionalAmounts(segment: string): string {
  const amountCandidates = findAmountCandidates(segment);
  if (amountCandidates.length <= 1) return segment.trim();

  let cursor = 0;
  let result = '';

  amountCandidates.forEach((candidate, index) => {
    if (index === 0) return;
    result += segment.slice(cursor, candidate.start).replace(/\s+$/, '');
    result += '\n';
    cursor = candidate.start;
  });

  result += segment.slice(cursor);
  return result.trim();
}

function extractClauseAmounts(userMessage: string): number[] {
  return prepareUserMessageForParsing(userMessage)
    .split(/\n+/)
    .map((clause) => findAmountCandidates(clause)[0]?.amount ?? null)
    .filter((amount): amount is number => amount !== null);
}

function findAmountCandidates(segment: string): { start: number; amount: number }[] {
  const matches: { start: number; amount: number }[] = [];
  const amountPattern =
    /(?:RM|MYR|USD|EUR|GBP|SGD|JPY|CNY|AUD|CAD|HK\$|S\$|Rp|\$|€|£|₹|฿|₱|₫)?\s*(\d+(?:\.\d{1,2})?)/gi;

  for (const match of segment.matchAll(amountPattern)) {
    const numericPart = match[1];
    const rawMatch = match[0];
    const start = match.index ?? -1;
    if (!numericPart || start < 0) continue;

    const numericStart = start + rawMatch.lastIndexOf(numericPart);
    const numericEnd = numericStart + numericPart.length;
    const charBefore = segment[numericStart - 1] ?? '';
    const charAfter = segment[numericEnd] ?? '';

    if (charBefore === '-' || charBefore === '/' || charBefore === ':') continue;
    if (charAfter === '-' || charAfter === '/' || charAfter === ':') continue;

    matches.push({ start, amount: Number(numericPart) });
  }

  return matches;
}
