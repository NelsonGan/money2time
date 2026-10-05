// Who the money went to (or came from). Pure.

import { CURRENCY_CODES } from '~/utils/moneyText';

import {
  COUNTERPARTY_STOP_WORDS,
  FUNDING_SOURCE_PREFIXES,
  MERCHANT_LEAD_INS,
  PAYER_LEAD_INS,
} from './lexicons';
import { escapeRegex, isWordChar, WORD_CHAR_CLASS } from './text';

export interface Counterparty {
  name: string;
  /** The word that introduced it (`at`, `to`, `from`, `在`, …). */
  leadIn: string;
}

const MAX_NAME_LENGTH = 48;

const STOP_WORD_RE = new RegExp(
  `\\s(?:${[...COUNTERPARTY_STOP_WORDS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|')})(?=$|[^${WORD_CHAR_CLASS}])`,
  'i',
);

/**
 * Punctuation, a date, or an amount ends a name. A full stop only counts when
 * a space or the end follows it, so a domain ("AMAZON.COM") stays whole.
 */
const HARD_STOP_RE =
  /\.(?=\s|$)|[,;!?|()[\]{}"\n]|\s-\s|\s\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\s(?:RM|Rp|Rs\.?|[A-Z]{3})\s?\d|\s[$€£¥₹₩₱฿₫]\s?\d/;

/** A "name" that is really an amount ("up to RM50", "for $12"). */
const AMOUNT_LIKE_RE = /^(?:(?:RM|Rp|Rs\.?|[$€£¥₹₩₱฿₫])\s?\d|[\d.,\s%]+$)/i;

function isAmountLike(name: string): boolean {
  if (AMOUNT_LIKE_RE.test(name)) return true;
  const iso = /^([A-Z]{3})\s?\d/.exec(name);
  return !!iso && CURRENCY_CODES.has(iso[1] ?? '');
}

/** A name needs at least one letter in a script banks write merchant names in. */
const NAME_LETTER_RE =
  /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

const NOT_A_NAME = new Set(['you', 'your', 'the', 'a', 'an', 'us', 'me', 'my', 'it', 'this']);

function cleanName(raw: string): string | null {
  let name = raw;
  const hard = HARD_STOP_RE.exec(name);
  if (hard) name = name.slice(0, hard.index);
  const soft = STOP_WORD_RE.exec(name);
  if (soft) name = name.slice(0, soft.index);
  name = name
    .replace(/^[\s:@#*>-]+/, '')
    .replace(/^(?:vpa|upi id|upi)\s+/i, '')
    .replace(/[\s:*-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (isAmountLike(name)) return null;
  if (name.length > MAX_NAME_LENGTH) {
    const cut = name.slice(0, MAX_NAME_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    name = lastSpace > 12 ? cut.slice(0, lastSpace) : cut;
  }
  if (name.length < 2) return null;
  if (!NAME_LETTER_RE.test(name)) {
    return null;
  }
  const lower = name.toLowerCase();
  if (NOT_A_NAME.has(lower)) return null;
  if (
    FUNDING_SOURCE_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `))
  ) {
    return null;
  }
  return name;
}

interface LeadInMatch {
  leadIn: string;
  /** Where the name starts in the text. */
  nameStart: number;
  /** Position of the lead-in itself, for ordering. */
  index: number;
}

function findLeadIns(text: string, lower: string, leadIns: readonly string[]): LeadInMatch[] {
  const matches: LeadInMatch[] = [];
  for (const leadIn of leadIns) {
    let from = 0;
    while (from < lower.length) {
      const index = lower.indexOf(leadIn, from);
      if (index < 0) break;
      from = index + leadIn.length;
      const before = lower[index - 1];
      const after = lower[index + leadIn.length];
      const isWordLeadIn = isWordChar(leadIn[0]);
      if (isWordLeadIn && isWordChar(before)) continue;
      if (isWordLeadIn && isWordChar(after)) continue;
      // An `@` inside a handle (abc@okbank) is not "at".
      if (!isWordLeadIn && before !== undefined && !/\s/.test(before)) continue;
      // `merchant: X`, `merchant name: X`
      let nameStart = index + leadIn.length;
      const labelTail = /^(?:\s*name)?\s*[:：]\s*/.exec(text.slice(nameStart));
      if (leadIn === 'merchant') {
        if (!labelTail) continue;
        nameStart += labelTail[0].length;
      } else {
        const gap = /^\s*/.exec(text.slice(nameStart));
        nameStart += gap ? gap[0].length : 0;
      }
      // `pada 03/10` is a date, not a payee.
      if (/^\d/.test(text.slice(nameStart)) && leadIn === 'pada') continue;
      matches.push({ leadIn, nameStart, index });
    }
  }
  return matches;
}

/**
 * Chinese and Japanese alerts put the merchant between fixed markers rather
 * than after a preposition: 您在星巴克消费…, 商户：星巴克, ご利用先：スターバックス.
 */
const CJK_PATTERNS: readonly { re: RegExp; leadIn: string }[] = [
  { re: /在([^\s，,。.：:]{2,24}?)(?:消费|支付|付款|刷卡)/, leadIn: '在' },
  { re: /向([^\s，,。.：:]{2,24}?)(?:付款|支付|转账)/, leadIn: '向' },
  { re: /商户(?:名称)?[:：]\s*([^\n，,。]{2,32})/, leadIn: '商户' },
  { re: /ご利用先[:：]\s*([^\n、。]{2,32})/, leadIn: 'ご利用先' },
  { re: /가맹점[:：]?\s*([^\n,]{2,32})/, leadIn: '가맹점' },
];

/**
 * The counterparty closest after the amount, from the lead-ins that fit the
 * kind of alert; any match before the amount is a fallback ("Payment to GRAB
 * of RM12" names the merchant first).
 */
export function extractCounterparty(
  text: string,
  lower: string,
  options: { direction: 'out' | 'in'; amountEnd: number | null },
): Counterparty | null {
  for (const { re, leadIn } of CJK_PATTERNS) {
    const match = re.exec(text);
    const name = match?.[1] ? cleanName(match[1]) : null;
    if (name) return { name, leadIn };
  }

  const leadIns =
    options.direction === 'in' ? [...PAYER_LEAD_INS, ...MERCHANT_LEAD_INS] : MERCHANT_LEAD_INS;
  const priority = (leadIn: string) => leadIns.indexOf(leadIn);
  const candidates = findLeadIns(text, lower, leadIns)
    .map((match) => {
      const name = cleanName(text.slice(match.nameStart, match.nameStart + 120));
      return name ? { ...match, name } : null;
    })
    .filter((match): match is LeadInMatch & { name: string } => match !== null);
  if (candidates.length === 0) return null;

  const amountEnd = options.amountEnd ?? 0;
  const after = candidates.filter((candidate) => candidate.index >= amountEnd);
  const pool = after.length > 0 ? after : candidates;
  pool.sort((a, b) => {
    const byPriority = priority(a.leadIn) - priority(b.leadIn);
    // Prefer the strongest lead-in, then the one nearest the amount.
    if (byPriority !== 0) return byPriority;
    return Math.abs(a.index - amountEnd) - Math.abs(b.index - amountEnd);
  });
  const best = pool[0];
  return best ? { name: best.name, leadIn: best.leadIn } : null;
}
